// @vitest-environment node

import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceIdentity } from '../device/deviceIdentity';
import type {
  SyncLoopOutcome,
  SyncLoopStatus,
  SyncScheduler,
  SyncSchedulerTriggerResult,
} from './syncScheduler';
import { createSyncController } from './syncController';

import { runFlowSyncPull } from '../flow/flowSyncPull';
import { runFlowSyncPush } from '../flow/flowSyncPush';
import { createMemosClient } from '../memos/memosClient';
import { runMemosSyncOneMemoJob } from '../memos/memosSyncJob';

vi.mock('../flow/flowSyncPush', () => ({
  runFlowSyncPush: vi.fn(),
}));

vi.mock('../flow/flowSyncPull', () => ({
  runFlowSyncPull: vi.fn(),
}));

vi.mock('../memos/memosClient', () => ({
  createMemosClient: vi.fn(),
}));

vi.mock('../memos/memosSyncJob', () => ({
  runMemosSyncOneMemoJob: vi.fn(),
}));

function createInlineScheduler(options: {
  flow: { intervalMs: number; runOnce: () => Promise<SyncLoopOutcome> };
  memos: { intervalMs: number; runOnce: () => Promise<SyncLoopOutcome> };
}): SyncScheduler {
  let started = false;
  let now = 0;

  const flowStatus: SyncLoopStatus = {
    running: false,
    lastRunAtMs: null,
    nextRunAtMs: null,
    consecutiveFailures: 0,
    lastErrorMessage: null,
  };
  const memosStatus: SyncLoopStatus = {
    running: false,
    lastRunAtMs: null,
    nextRunAtMs: null,
    consecutiveFailures: 0,
    lastErrorMessage: null,
  };

  const runLane = async (
    lane: 'flow' | 'memos',
    runOnce: () => Promise<SyncLoopOutcome>,
    status: SyncLoopStatus
  ): Promise<SyncSchedulerTriggerResult> => {
    if (!started) {
      return {
        lane,
        accepted: false,
        runOk: false,
        message: '同步调度器尚未启动',
        status: { ...status },
      };
    }

    status.running = true;
    status.lastRunAtMs = ++now;
    const outcome = await runOnce();
    status.running = false;

    if (outcome.kind === 'ok') {
      status.consecutiveFailures = 0;
      status.lastErrorMessage = null;
      return { lane, accepted: true, runOk: true, message: null, status: { ...status } };
    }

    if (outcome.kind === 'skipped') {
      status.consecutiveFailures = 0;
      status.lastErrorMessage = null;
      return {
        lane,
        accepted: true,
        runOk: false,
        message: outcome.reason,
        status: { ...status },
      };
    }

    status.consecutiveFailures += 1;
    status.lastErrorMessage = outcome.message;
    return {
      lane,
      accepted: true,
      runOk: false,
      message: outcome.message,
      status: { ...status },
    };
  };

  return {
    start: () => {
      started = true;
    },
    stop: () => {
      started = false;
    },
    requestNowFlow: async () => runLane('flow', options.flow.runOnce, flowStatus),
    requestNowMemos: async () => runLane('memos', options.memos.runOnce, memosStatus),
    getStatus: () => ({
      updatedAtMs: now,
      flow: { ...flowStatus },
      memos: { ...memosStatus },
    }),
  };
}

function createFakeDbWithMemos(localUuids: string[]): Database.Database {
  const dbLike = {
    prepare: (_sql: string) => ({
      all: (_params?: { limit?: number }) => localUuids.map((local_uuid) => ({ local_uuid })),
    }),
  };
  return dbLike as unknown as Database.Database;
}

describe('src/main/sync/syncController', () => {
  const deviceIdentity: DeviceIdentity = {
    deviceId: 'device-id-1',
    deviceName: 'device-name-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('手动触发 Flow 仅调用 Flow 引擎（push+pull），不触发 Memos job', async () => {
    vi.mocked(runFlowSyncPush).mockResolvedValue({ kind: 'idle' });
    vi.mocked(runFlowSyncPull).mockResolvedValue({
      kind: 'completed',
      pages: 1,
      fromCursor: 0,
      toCursor: 1,
    });
    vi.mocked(createMemosClient).mockReturnValue({} as never);
    vi.mocked(runMemosSyncOneMemoJob).mockResolvedValue({
      kind: 'synced',
      localUuid: 'memo-1',
      serverMemoName: 'memos/1',
    });

    const db = createFakeDbWithMemos(['memo-1']);
    const controller = createSyncController({
      getFlowBaseUrl: () => 'https://xl.pscly.cc',
      getMemosBaseUrl: () => 'https://memos.pscly.cc',
      getToken: async () => 'token-1',
      getDeviceIdentity: () => deviceIdentity,
      getStorageRootAbsPath: () => '/tmp/xinliu',
      withMainDbAsync: async (run) => run(db),
      sleepMs: async () => undefined,
      createScheduler: (schedulerOptions) => createInlineScheduler(schedulerOptions),
    });

    controller.start();
    const result = await controller.syncNowFlow();

    expect(result.lane).toBe('flow');
    expect(result.accepted).toBe(true);
    expect(result.runOk).toBe(true);
    expect(vi.mocked(runFlowSyncPush)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runFlowSyncPull)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runMemosSyncOneMemoJob)).toHaveBeenCalledTimes(0);
  });

  it('手动触发 Memos 仅触发 Memos job，不调用 Flow 引擎', async () => {
    vi.mocked(runFlowSyncPush).mockResolvedValue({ kind: 'idle' });
    vi.mocked(runFlowSyncPull).mockResolvedValue({
      kind: 'completed',
      pages: 1,
      fromCursor: 0,
      toCursor: 1,
    });
    vi.mocked(createMemosClient).mockReturnValue({} as never);
    vi.mocked(runMemosSyncOneMemoJob).mockResolvedValue({
      kind: 'synced',
      localUuid: 'memo-1',
      serverMemoName: 'memos/1',
    });

    const db = createFakeDbWithMemos(['memo-1', 'memo-2']);
    const controller = createSyncController({
      getFlowBaseUrl: () => 'https://xl.pscly.cc',
      getMemosBaseUrl: () => 'https://memos.pscly.cc',
      getToken: async () => 'token-1',
      getDeviceIdentity: () => deviceIdentity,
      getStorageRootAbsPath: () => '/tmp/xinliu',
      withMainDbAsync: async (run) => run(db),
      sleepMs: async () => undefined,
      createScheduler: (schedulerOptions) => createInlineScheduler(schedulerOptions),
    });

    controller.start();
    const result = await controller.syncNowMemos();

    expect(result.lane).toBe('memos');
    expect(result.accepted).toBe(true);
    expect(result.runOk).toBe(true);
    expect(vi.mocked(createMemosClient)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runMemosSyncOneMemoJob)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runFlowSyncPush)).toHaveBeenCalledTimes(0);
    expect(vi.mocked(runFlowSyncPull)).toHaveBeenCalledTimes(0);
  });

  it('Flow 缺少 baseUrl 时返回 flow_base_url_missing，且不触发任何引擎调用', async () => {
    vi.mocked(runFlowSyncPush).mockResolvedValue({ kind: 'idle' });
    vi.mocked(runFlowSyncPull).mockResolvedValue({
      kind: 'completed',
      pages: 1,
      fromCursor: 0,
      toCursor: 1,
    });
    vi.mocked(createMemosClient).mockReturnValue({} as never);
    vi.mocked(runMemosSyncOneMemoJob).mockResolvedValue({
      kind: 'synced',
      localUuid: 'memo-1',
      serverMemoName: 'memos/1',
    });

    const db = createFakeDbWithMemos([]);
    const controller = createSyncController({
      getFlowBaseUrl: () => null,
      getMemosBaseUrl: () => 'https://memos.pscly.cc',
      getToken: async () => 'token-1',
      getDeviceIdentity: () => deviceIdentity,
      getStorageRootAbsPath: () => '/tmp/xinliu',
      withMainDbAsync: async (run) => run(db),
      sleepMs: async () => undefined,
      createScheduler: (schedulerOptions) => createInlineScheduler(schedulerOptions),
    });

    controller.start();
    const result = await controller.syncNowFlow();

    expect(result.lane).toBe('flow');
    expect(result.runOk).toBe(false);
    expect(result.message).toBe('flow_base_url_missing');
    expect(vi.mocked(runFlowSyncPush)).toHaveBeenCalledTimes(0);
    expect(vi.mocked(runFlowSyncPull)).toHaveBeenCalledTimes(0);
    expect(vi.mocked(runMemosSyncOneMemoJob)).toHaveBeenCalledTimes(0);
  });
});
