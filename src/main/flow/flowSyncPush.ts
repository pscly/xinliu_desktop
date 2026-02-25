import type Database from 'better-sqlite3';

import { createFlowClient, type FlowClient, type SyncMutation, type SyncPushResponse } from './flowClient';
import { OUTBOX_STATUS, withImmediateTransaction } from '../sync/outbox';
import type { FetchLike, HttpError, HttpResult } from '../net/httpClient';

export interface FlowSyncPushEngineOptions {
  db: Database.Database;

  baseUrl: string;
  token: string;
  deviceId: string;
  deviceName: string;

  fetch: FetchLike;
  sleepMs: (ms: number) => Promise<void>;

  nowMs?: () => number;
  batchSize?: number;
  flowClient?: FlowClient;
}

export type FlowSyncPushOutcome =
  | { kind: 'idle' }
  | {
      kind: 'completed';
      batches: number;
      claimed: number;
      applied: number;
      rejectedConflict: number;
      failedFatal: number;
      failedRetryable: number;
    }
  | {
      kind: 'rate_limited';
      retryAfterMs: number;
      batches: number;
      claimed: number;
    }
  | {
      kind: 'need_relogin';
      batches: number;
      claimed: number;
    };

interface OutboxRow {
  id: string;
  resource: string;
  op: string;
  entity_id: string;
  client_updated_at_ms: number;
  data_json: string;
  attempt: number;
  next_retry_at_ms: number;
}

function makeMutation(row: OutboxRow): SyncMutation {
  const base: SyncMutation = {
    resource: row.resource as SyncMutation['resource'],
    op: row.op as SyncMutation['op'],
    entity_id: row.entity_id,
    client_updated_at_ms: row.client_updated_at_ms,
  };

  if (row.op === 'delete') {
    return base;
  }

  let data: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(row.data_json) as unknown;
    if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }

  return { ...base, data };
}

function keyOf(resource: string, entityId: string): string {
  return `${resource}::${entityId}`;
}

function isFatalRejectedReason(reason: string): boolean {
  return [
    'validation_error',
    'bad_request',
    'forbidden',
    'not_found',
    'gone',
    'payload_too_large',
  ].includes(reason);
}

function computeRetryDelayMs(attempt: number): number {
  const base = 1000;
  const max = 5 * 60 * 1000;
  const pow = 2 ** Math.min(10, Math.max(0, attempt));
  return Math.min(max, base * pow);
}

function getRetryAfterSecondsFromError(error: HttpError): number | null {
  const anyErr = error as HttpError & { retryAfterSeconds?: number | null };
  if (typeof anyErr.retryAfterSeconds === 'number' && Number.isFinite(anyErr.retryAfterSeconds)) {
    return anyErr.retryAfterSeconds;
  }
  return null;
}

function getPersistedRequestId(res: HttpResult<unknown>): string | null {
  if (res.ok) {
    return res.responseRequestIdHeader ?? res.requestId;
  }

  if (res.error.responseRequestIdHeader) return res.error.responseRequestIdHeader;
  const rid = res.error.errorResponse?.request_id;
  if (typeof rid === 'string' && rid.trim().length > 0) return rid;
  return null;
}

function getHttpErrorKind(res: HttpResult<unknown>): {
  kind: 'ok' | 'rate_limited' | 'unauthorized' | 'payload_too_large' | 'other';
  retryAfterMs?: number;
} {
  if (res.ok) return { kind: 'ok' };
  const status = res.error.status;
  const errorCode = res.error.errorResponse?.error;
  if (status === 429 || errorCode === 'rate_limited') {
    const retryAfterS = getRetryAfterSecondsFromError(res.error);
    const retryAfterMs = retryAfterS !== null ? retryAfterS * 1000 : 1000;
    return { kind: 'rate_limited', retryAfterMs };
  }
  if (status === 401 || errorCode === 'unauthorized') {
    return { kind: 'unauthorized' };
  }
  if (status === 413 || errorCode === 'payload_too_large') {
    return { kind: 'payload_too_large' };
  }
  return { kind: 'other' };
}

function claimOutboxRows(db: Database.Database, nowMs: number, limit: number): OutboxRow[] {
  return withImmediateTransaction(db, () => {
    const rows = db
      .prepare(
        `
          SELECT
            id,
            resource,
            op,
            entity_id,
            client_updated_at_ms,
            data_json,
            attempt,
            next_retry_at_ms
          FROM outbox_mutations
          WHERE status IN (@pending, @retryable)
            AND next_retry_at_ms <= @now_ms
          ORDER BY created_at_ms ASC
          LIMIT @limit
        `
      )
      .all({
        pending: OUTBOX_STATUS.pending,
        retryable: OUTBOX_STATUS.failedRetryable,
        now_ms: nowMs,
        limit,
      }) as OutboxRow[];

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `
        UPDATE outbox_mutations
        SET status = ?, updated_at_ms = ?
        WHERE id IN (${placeholders})
      `
    ).run(OUTBOX_STATUS.inflight, nowMs, ...ids);

    return rows;
  });
}

function updateOutboxRows(
  db: Database.Database,
  args: {
    nowMs: number;
    requestId: string | null;
    updates: Array<{
      id: string;
      status: string;
      attempt: number;
      next_retry_at_ms: number;
      last_error_code: string | null;
      last_error_message: string | null;
    }>;
  }
): void {
  withImmediateTransaction(db, () => {
    const stmt = db.prepare(
      `
        UPDATE outbox_mutations
        SET
          status = @status,
          attempt = @attempt,
          next_retry_at_ms = @next_retry_at_ms,
          last_error_code = @last_error_code,
          last_error_message = @last_error_message,
          request_id = @request_id,
          updated_at_ms = @updated_at_ms
        WHERE id = @id
      `
    );

    for (const u of args.updates) {
      stmt.run({
        id: u.id,
        status: u.status,
        attempt: u.attempt,
        next_retry_at_ms: u.next_retry_at_ms,
        last_error_code: u.last_error_code,
        last_error_message: u.last_error_message,
        request_id: args.requestId,
        updated_at_ms: args.nowMs,
      });
    }
  });
}

function buildUpdatesFromSyncPushResponse(args: {
  rows: OutboxRow[];
  res: HttpResult<SyncPushResponse>;
  nowMs: number;
}): {
  applied: number;
  rejectedConflict: number;
  failedFatal: number;
  failedRetryable: number;
  updates: Array<{
    id: string;
    status: string;
    attempt: number;
    next_retry_at_ms: number;
    last_error_code: string | null;
    last_error_message: string | null;
  }>;
} {
  if (!args.res.ok) {
    throw new Error('buildUpdatesFromSyncPushResponse 仅用于成功响应');
  }

  const applied = args.res.value.applied ?? [];
  const rejected = args.res.value.rejected ?? [];

  const rejectedByKey = new Map<string, { reason: string; server?: unknown | null }>();
  for (const r of rejected) {
    rejectedByKey.set(keyOf(r.resource, r.entity_id), { reason: r.reason, server: r.server });
  }

  const appliedKeys = new Set<string>();
  for (const a of applied) {
    appliedKeys.add(keyOf(a.resource, a.entity_id));
  }

  let appliedCount = 0;
  let rejectedConflictCount = 0;
  let failedFatalCount = 0;
  let failedRetryableCount = 0;

  const updates: Array<{
    id: string;
    status: string;
    attempt: number;
    next_retry_at_ms: number;
    last_error_code: string | null;
    last_error_message: string | null;
  }> = [];

  for (const row of args.rows) {
    const k = keyOf(row.resource, row.entity_id);
    const rej = rejectedByKey.get(k);
    if (rej) {
      if (rej.reason === 'conflict') {
        rejectedConflictCount += 1;
        updates.push({
          id: row.id,
          status: OUTBOX_STATUS.rejectedConflict,
          attempt: row.attempt,
          next_retry_at_ms: args.nowMs,
          last_error_code: 'conflict',
          last_error_message: JSON.stringify({ server: rej.server ?? null }),
        });
        continue;
      }

      if (isFatalRejectedReason(rej.reason)) {
        failedFatalCount += 1;
        updates.push({
          id: row.id,
          status: OUTBOX_STATUS.failedFatal,
          attempt: row.attempt,
          next_retry_at_ms: args.nowMs,
          last_error_code: rej.reason,
          last_error_message: null,
        });
        continue;
      }

      failedRetryableCount += 1;
      const nextAttempt = row.attempt + 1;
      updates.push({
        id: row.id,
        status: OUTBOX_STATUS.failedRetryable,
        attempt: nextAttempt,
        next_retry_at_ms: args.nowMs + computeRetryDelayMs(nextAttempt),
        last_error_code: rej.reason,
        last_error_message: null,
      });
      continue;
    }

    if (appliedKeys.has(k)) {
      appliedCount += 1;
      updates.push({
        id: row.id,
        status: OUTBOX_STATUS.applied,
        attempt: row.attempt,
        next_retry_at_ms: args.nowMs,
        last_error_code: null,
        last_error_message: null,
      });
      continue;
    }

    failedRetryableCount += 1;
    const nextAttempt = row.attempt + 1;
    updates.push({
      id: row.id,
      status: OUTBOX_STATUS.failedRetryable,
      attempt: nextAttempt,
      next_retry_at_ms: args.nowMs + computeRetryDelayMs(nextAttempt),
      last_error_code: 'missing_applied_rejected',
      last_error_message: null,
    });
  }

  return {
    applied: appliedCount,
    rejectedConflict: rejectedConflictCount,
    failedFatal: failedFatalCount,
    failedRetryable: failedRetryableCount,
    updates,
  };
}

async function pushRowsWithAutoSplit(args: {
  db: Database.Database;
  client: FlowClient;
  rows: OutboxRow[];
  nowMs: number;
}): Promise<
  | {
      kind: 'ok';
      applied: number;
      rejectedConflict: number;
      failedFatal: number;
      failedRetryable: number;
    }
  | { kind: 'rate_limited'; retryAfterMs: number }
  | { kind: 'need_relogin' }
> {
  const { db, client } = args;

  const finalized = new Set<string>();
  let stopRateLimitedRetryAfterMs: number | null = null;
  let applied = 0;
  let rejectedConflict = 0;
  let failedFatal = 0;
  let failedRetryable = 0;

  async function handleChunk(rows: OutboxRow[]): Promise<'continue' | 'stop_rate_limited' | 'stop_need_relogin'> {
    const mutations = rows.map(makeMutation);
    const res = await client.syncPush({ mutations });

    const kind = getHttpErrorKind(res);
    const requestId = getPersistedRequestId(res);

    if (kind.kind === 'payload_too_large') {
      if (rows.length <= 1) {
        updateOutboxRows(db, {
          nowMs: args.nowMs,
          requestId,
          updates: rows.map((r) => ({
            id: r.id,
            status: OUTBOX_STATUS.failedFatal,
            attempt: r.attempt,
            next_retry_at_ms: args.nowMs,
            last_error_code: 'payload_too_large',
            last_error_message: null,
          })),
        });
        for (const r of rows) finalized.add(r.id);
        failedFatal += rows.length;
        return 'continue';
      }

      const mid = Math.floor(rows.length / 2);
      const left = rows.slice(0, mid);
      const right = rows.slice(mid);
      const a = await handleChunk(left);
      if (a !== 'continue') return a;
      const b = await handleChunk(right);
      return b;
    }

    if (!res.ok) {
      if (kind.kind === 'rate_limited') {
        const retryAfterMs = kind.retryAfterMs ?? 1000;
        stopRateLimitedRetryAfterMs = retryAfterMs;
        updateOutboxRows(db, {
          nowMs: args.nowMs,
          requestId,
          updates: rows.map((r) => {
            const nextAttempt = r.attempt + 1;
            return {
              id: r.id,
              status: OUTBOX_STATUS.failedRetryable,
              attempt: nextAttempt,
              next_retry_at_ms: args.nowMs + retryAfterMs,
              last_error_code: 'rate_limited',
              last_error_message: null,
            };
          }),
        });
        for (const r of rows) finalized.add(r.id);
        return 'stop_rate_limited';
      }

      if (kind.kind === 'unauthorized') {
        updateOutboxRows(db, {
          nowMs: args.nowMs,
          requestId,
          updates: rows.map((r) => ({
            id: r.id,
            status: OUTBOX_STATUS.pending,
            attempt: r.attempt + 1,
            next_retry_at_ms: args.nowMs,
            last_error_code: 'unauthorized',
            last_error_message: null,
          })),
        });
        for (const r of rows) finalized.add(r.id);
        return 'stop_need_relogin';
      }

      updateOutboxRows(db, {
        nowMs: args.nowMs,
        requestId,
        updates: rows.map((r) => {
          const nextAttempt = r.attempt + 1;
          return {
            id: r.id,
            status: OUTBOX_STATUS.failedRetryable,
            attempt: nextAttempt,
            next_retry_at_ms: args.nowMs + computeRetryDelayMs(nextAttempt),
            last_error_code: res.error.code,
            last_error_message: res.error.message,
          };
        }),
      });
      for (const r of rows) finalized.add(r.id);
      return 'continue';
    }

    const built = buildUpdatesFromSyncPushResponse({ rows, res, nowMs: args.nowMs });
    updateOutboxRows(db, {
      nowMs: args.nowMs,
      requestId,
      updates: built.updates,
    });
    for (const r of rows) finalized.add(r.id);
    applied += built.applied;
    rejectedConflict += built.rejectedConflict;
    failedFatal += built.failedFatal;
    failedRetryable += built.failedRetryable;
    return 'continue';
  }

  const stop = await handleChunk(args.rows);

  if (stop !== 'continue') {
    const remaining = args.rows.filter((r) => !finalized.has(r.id));
    if (remaining.length > 0) {
      if (stop === 'stop_rate_limited') {
        const retryAfterMs = stopRateLimitedRetryAfterMs ?? 1000;
        updateOutboxRows(db, {
          nowMs: args.nowMs,
          requestId: null,
          updates: remaining.map((r) => ({
            id: r.id,
            status: OUTBOX_STATUS.failedRetryable,
            attempt: r.attempt,
            next_retry_at_ms: args.nowMs + retryAfterMs,
            last_error_code: 'rate_limited',
            last_error_message: null,
          })),
        });
      } else {
        updateOutboxRows(db, {
          nowMs: args.nowMs,
          requestId: null,
          updates: remaining.map((r) => ({
            id: r.id,
            status: OUTBOX_STATUS.pending,
            attempt: r.attempt,
            next_retry_at_ms: args.nowMs,
            last_error_code: 'unauthorized',
            last_error_message: null,
          })),
        });
      }
    }
  }

  if (stop === 'stop_rate_limited') {
    return { kind: 'rate_limited', retryAfterMs: stopRateLimitedRetryAfterMs ?? 1000 };
  }
  if (stop === 'stop_need_relogin') {
    return { kind: 'need_relogin' };
  }

  return {
    kind: 'ok',
    applied,
    rejectedConflict,
    failedFatal,
    failedRetryable,
  };
}

export async function runFlowSyncPush(options: FlowSyncPushEngineOptions): Promise<FlowSyncPushOutcome> {
  const now = options.nowMs ?? (() => Date.now());
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize 必须是正整数');
  }

  const client: FlowClient =
    options.flowClient ??
    createFlowClient({
      baseUrl: options.baseUrl,
      token: options.token,
      deviceId: options.deviceId,
      deviceName: options.deviceName,
      fetch: options.fetch,
      sleepMs: options.sleepMs,
      retry: { maxAttempts: 1 },
    });

  let batches = 0;
  let claimedTotal = 0;
  let appliedTotal = 0;
  let rejectedConflictTotal = 0;
  let failedFatalTotal = 0;
  let failedRetryableTotal = 0;

  while (true) {
    const nowMs = now();
    const rows = claimOutboxRows(options.db, nowMs, batchSize);
    if (rows.length === 0) {
      if (batches === 0) return { kind: 'idle' };
      return {
        kind: 'completed',
        batches,
        claimed: claimedTotal,
        applied: appliedTotal,
        rejectedConflict: rejectedConflictTotal,
        failedFatal: failedFatalTotal,
        failedRetryable: failedRetryableTotal,
      };
    }

    batches += 1;
    claimedTotal += rows.length;

    const result = await pushRowsWithAutoSplit({
      db: options.db,
      client,
      rows,
      nowMs,
    });

    if (result.kind === 'rate_limited') {
      return {
        kind: 'rate_limited',
        retryAfterMs: result.retryAfterMs,
        batches,
        claimed: claimedTotal,
      };
    }

    if (result.kind === 'need_relogin') {
      return {
        kind: 'need_relogin',
        batches,
        claimed: claimedTotal,
      };
    }

    appliedTotal += result.applied;
    rejectedConflictTotal += result.rejectedConflict;
    failedFatalTotal += result.failedFatal;
    failedRetryableTotal += result.failedRetryable;
  }
}
