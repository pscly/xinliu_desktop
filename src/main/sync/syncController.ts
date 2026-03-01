import type Database from 'better-sqlite3';

import type { SyncStatus } from '../../shared/ipc';
import { normalizeBaseUrl } from '../../shared/url';
import type { DeviceIdentity } from '../device/deviceIdentity';
import { runFlowSyncPull } from '../flow/flowSyncPull';
import { runFlowSyncPush } from '../flow/flowSyncPush';
import { createMemosClient } from '../memos/memosClient';
import { runMemosSyncOneMemoJob } from '../memos/memosSyncJob';
import type { FetchLike } from '../net/httpClient';
import { OUTBOX_STATUS } from './outbox';
import {
  createSyncScheduler,
  type SyncLoopOutcome,
  type SyncScheduler,
  type SyncSchedulerTriggerResult,
} from './syncScheduler';

export interface SyncController {
  start: () => void;
  stop: () => void;
  getStatus: () => Promise<SyncStatus>;
  syncNowFlow: () => Promise<SyncSchedulerTriggerResult>;
  syncNowMemos: () => Promise<SyncSchedulerTriggerResult>;
}

export interface CreateSyncControllerOptions {
  getFlowBaseUrl: () => string | null;
  getMemosBaseUrl: () => string | null;
  getToken: () => Promise<string | null>;
  getDeviceIdentity: () => DeviceIdentity;
  getStorageRootAbsPath: () => string;
  withMainDbAsync: <T>(run: (db: Database.Database) => Promise<T>) => Promise<T>;
  sleepMs: (ms: number) => Promise<void>;
  fetch?: FetchLike;
  schedulerIntervalMs?: number;
  createScheduler?: (options: {
    flow: { intervalMs: number; runOnce: () => Promise<SyncLoopOutcome> };
    memos: { intervalMs: number; runOnce: () => Promise<SyncLoopOutcome> };
  }) => SyncScheduler;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_MEMOS_TICK_LIMIT = 20;
const FLOW_PULL_CURSOR_SYNC_STATE_KEY = 'flow_sync_pull_cursor';

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function parseFlowPullCursor(valueJson: string | null): number {
  if (typeof valueJson !== 'string') {
    return 0;
  }
  const trimmed = valueJson.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'number') {
      return toNonNegativeInt(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      return toNonNegativeInt((parsed as { cursor?: unknown }).cursor);
    }
  } catch {
    return 0;
  }

  return 0;
}

function toNonEmptyStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSyncSummaryFromDb(db: Database.Database): {
  flow: {
    pullCursor: number;
    outboxPendingCount: number;
    outboxRejectedConflictCount: number;
    lastRequestId: string | null;
  };
  memos: {
    dirtyCount: number;
    failedCount: number;
    lastRequestId: string | null;
  };
} {
  const pullCursorRow = db
    .prepare('SELECT value_json FROM sync_state WHERE key = @key LIMIT 1')
    .get({ key: FLOW_PULL_CURSOR_SYNC_STATE_KEY }) as { value_json: string | null } | undefined;

  const outboxPendingCountRow = db
    .prepare('SELECT COUNT(*) AS c FROM outbox_mutations WHERE status = @status')
    .get({ status: OUTBOX_STATUS.pending }) as { c: number } | undefined;

  const outboxRejectedConflictCountRow = db
    .prepare('SELECT COUNT(*) AS c FROM outbox_mutations WHERE status = @status')
    .get({ status: OUTBOX_STATUS.rejectedConflict }) as { c: number } | undefined;

  const flowRequestIdRow = db
    .prepare(
      `
        SELECT request_id
        FROM outbox_mutations
        WHERE request_id IS NOT NULL
          AND TRIM(request_id) <> ''
        ORDER BY updated_at_ms DESC, created_at_ms DESC, id DESC
        LIMIT 1
      `
    )
    .get() as { request_id: string | null } | undefined;

  const memosDirtyCountRow = db
    .prepare(
      `
        SELECT COUNT(*) AS c
        FROM memos
        WHERE sync_status = 'DIRTY'
          AND deleted_at_ms IS NULL
      `
    )
    .get() as { c: number } | undefined;

  const memosFailedCountRow = db
    .prepare(
      `
        SELECT COUNT(*) AS c
        FROM memos
        WHERE sync_status = 'FAILED'
          AND deleted_at_ms IS NULL
      `
    )
    .get() as { c: number } | undefined;

  const memosRequestIdRow = db
    .prepare(
      `
        SELECT conflict_request_id
        FROM memos
        WHERE deleted_at_ms IS NULL
          AND conflict_request_id IS NOT NULL
          AND TRIM(conflict_request_id) <> ''
        ORDER BY updated_at_ms DESC, created_at_ms DESC, local_uuid DESC
        LIMIT 1
      `
    )
    .get() as { conflict_request_id: string | null } | undefined;

  return {
    flow: {
      pullCursor: parseFlowPullCursor(pullCursorRow?.value_json ?? null),
      outboxPendingCount: toNonNegativeInt(outboxPendingCountRow?.c),
      outboxRejectedConflictCount: toNonNegativeInt(outboxRejectedConflictCountRow?.c),
      lastRequestId: toNonEmptyStringOrNull(flowRequestIdRow?.request_id),
    },
    memos: {
      dirtyCount: toNonNegativeInt(memosDirtyCountRow?.c),
      failedCount: toNonNegativeInt(memosFailedCountRow?.c),
      lastRequestId: toNonEmptyStringOrNull(memosRequestIdRow?.conflict_request_id),
    },
  };
}

function resolveFetch(options: CreateSyncControllerOptions): FetchLike {
  if (options.fetch) {
    return options.fetch;
  }
  return globalThis.fetch as unknown as FetchLike;
}

export function createSyncController(options: CreateSyncControllerOptions): SyncController {
  const fetch = resolveFetch(options);
  const schedulerIntervalMs =
    typeof options.schedulerIntervalMs === 'number' &&
    Number.isFinite(options.schedulerIntervalMs) &&
    options.schedulerIntervalMs >= 1000
      ? Math.floor(options.schedulerIntervalMs)
      : DEFAULT_INTERVAL_MS;

  const runFlowOnce = async (): Promise<SyncLoopOutcome> => {
    const flowBaseUrl = options.getFlowBaseUrl();
    if (!flowBaseUrl) {
      return { kind: 'skipped', reason: 'flow_base_url_missing' };
    }

    const token = await options.getToken();
    if (!token) {
      return { kind: 'skipped', reason: 'token_missing' };
    }

    const baseUrl = normalizeBaseUrl(flowBaseUrl);
    const deviceIdentity = options.getDeviceIdentity();

    return options.withMainDbAsync(async (db) => {
      const push = await runFlowSyncPush({
        db,
        baseUrl,
        token,
        deviceId: deviceIdentity.deviceId,
        deviceName: deviceIdentity.deviceName,
        fetch,
        sleepMs: options.sleepMs,
      });

      if (push.kind === 'rate_limited') {
        return { kind: 'failed', message: 'Flow 同步被限流', retryAfterMs: push.retryAfterMs };
      }
      if (push.kind === 'need_relogin') {
        return { kind: 'failed', message: 'Flow 需要重新登录' };
      }

      const pull = await runFlowSyncPull({
        db,
        baseUrl,
        token,
        deviceId: deviceIdentity.deviceId,
        deviceName: deviceIdentity.deviceName,
        fetch,
        sleepMs: options.sleepMs,
      });

      if (pull.kind === 'completed') {
        return { kind: 'ok' };
      }
      if (pull.kind === 'need_relogin') {
        return { kind: 'failed', message: 'Flow 需要重新登录' };
      }
      if (pull.kind === 'http_error') {
        return {
          kind: 'failed',
          message: `Flow 拉取失败：HTTP ${pull.status ?? '-'} ${pull.errorCode ?? ''}`.trim(),
        };
      }
      return { kind: 'failed', message: `Flow 应用变更失败：${pull.message}` };
    });
  };

  const runMemosOnce = async (): Promise<SyncLoopOutcome> => {
    const memosBaseUrl = options.getMemosBaseUrl();
    if (!memosBaseUrl) {
      return { kind: 'skipped', reason: 'memos_base_url_missing' };
    }

    const token = await options.getToken();
    if (!token) {
      return { kind: 'skipped', reason: 'token_missing' };
    }

    const baseUrl = normalizeBaseUrl(memosBaseUrl);
    const memosClient = createMemosClient({
      baseUrl,
      token,
      fetch,
      sleepMs: options.sleepMs,
      retry: { maxAttempts: 1 },
    });

    return options.withMainDbAsync(async (db) => {
      const targets = db
        .prepare(
          `
            SELECT local_uuid
            FROM memos
            WHERE sync_status IN ('DIRTY', 'FAILED', 'SYNCING')
              AND deleted_at_ms IS NULL
            ORDER BY updated_at_ms ASC, local_uuid ASC
            LIMIT @limit
          `
        )
        .all({ limit: DEFAULT_MEMOS_TICK_LIMIT }) as Array<{ local_uuid: string }>;

      if (targets.length === 0) {
        return { kind: 'ok' };
      }

      let failedCount = 0;
      const storageRootAbsPath = options.getStorageRootAbsPath();
      for (const target of targets) {
        const out = await runMemosSyncOneMemoJob({
          db,
          memosClient,
          storageRootAbsPath,
          memoLocalUuid: target.local_uuid,
        });
        if (out.kind === 'failed') {
          failedCount += 1;
        }
      }

      if (failedCount > 0) {
        return { kind: 'failed', message: `Memos 同步失败：${failedCount} 条` };
      }
      return { kind: 'ok' };
    });
  };

  const createScheduler =
    options.createScheduler ??
    ((schedulerOptions: {
      flow: { intervalMs: number; runOnce: () => Promise<SyncLoopOutcome> };
      memos: { intervalMs: number; runOnce: () => Promise<SyncLoopOutcome> };
    }) => createSyncScheduler(schedulerOptions));

  const scheduler = createScheduler({
    flow: {
      intervalMs: schedulerIntervalMs,
      runOnce: runFlowOnce,
    },
    memos: {
      intervalMs: schedulerIntervalMs,
      runOnce: runMemosOnce,
    },
  });

  return {
    start: () => scheduler.start(),
    stop: () => scheduler.stop(),
    getStatus: async () => {
      const schedulerStatus = scheduler.getStatus();
      return options.withMainDbAsync(async (db) => {
        const dbSummary = readSyncSummaryFromDb(db);
        return {
          updatedAtMs: schedulerStatus.updatedAtMs,
          flow: {
            ...schedulerStatus.flow,
            summary: dbSummary.flow,
          },
          memos: {
            ...schedulerStatus.memos,
            summary: dbSummary.memos,
          },
        };
      });
    },
    syncNowFlow: () => scheduler.requestNowFlow(),
    syncNowMemos: () => scheduler.requestNowMemos(),
  };
}
