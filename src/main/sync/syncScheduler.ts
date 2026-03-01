export type SyncLoopOutcome =
  | { kind: 'ok' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; message: string; retryAfterMs?: number };

export interface SyncLoopStatus {
  running: boolean;
  lastRunAtMs: number | null;
  nextRunAtMs: number | null;
  consecutiveFailures: number;
  lastErrorMessage: string | null;
}

export interface CreateSyncLoopOptions {
  name: string;
  runOnce: () => Promise<SyncLoopOutcome>;
  intervalMs: number;

  nowMs?: () => number;
  random?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  backoffJitterRatio?: number;
}

export interface SyncLoop {
  start: () => void;
  stop: () => void;
  triggerNow: () => Promise<SyncLoopTriggerResult>;
  getStatus: () => SyncLoopStatus;
}

export interface SyncLoopTriggerResult {
  accepted: boolean;
  outcome: SyncLoopOutcome;
  status: SyncLoopStatus;
}

export type SyncSchedulerLane = 'flow' | 'memos';

export interface SyncSchedulerStatus {
  updatedAtMs: number;
  flow: SyncLoopStatus;
  memos: SyncLoopStatus;
}

export interface SyncSchedulerTriggerResult {
  lane: SyncSchedulerLane;
  accepted: boolean;
  runOk: boolean;
  message: string | null;
  status: SyncLoopStatus;
}

export interface SyncScheduler {
  start: () => void;
  stop: () => void;
  requestNowFlow: () => Promise<SyncSchedulerTriggerResult>;
  requestNowMemos: () => Promise<SyncSchedulerTriggerResult>;
  getStatus: () => SyncSchedulerStatus;
}

export interface CreateSyncSchedulerOptions {
  flow: Omit<CreateSyncLoopOptions, 'name'> & { name?: string };
  memos: Omit<CreateSyncLoopOptions, 'name'> & { name?: string };
  nowMs?: () => number;
  createLoop?: (options: CreateSyncLoopOptions) => SyncLoop;
}

function clampInt(value: number, min: number, max: number): number {
  const v = Math.floor(value);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function computeBackoffMs(args: {
  failures: number;
  baseMs: number;
  maxMs: number;
  jitterRatio: number;
  random: () => number;
}): number {
  const failures = clampInt(args.failures, 0, 30);
  const raw = args.baseMs * Math.pow(2, Math.max(0, failures - 1));
  const capped = Math.min(args.maxMs, Math.max(args.baseMs, raw));

  const jitter = Math.max(0, Math.min(1, args.jitterRatio));
  const r = Math.max(0, Math.min(1, args.random()));
  const delta = Math.floor(capped * jitter);
  return clampInt(capped - delta + Math.floor(r * (2 * delta + 1)), args.baseMs, args.maxMs);
}

export function createSyncLoop(options: CreateSyncLoopOptions): SyncLoop {
  const nowMs = options.nowMs ?? (() => Date.now());
  const random = options.random ?? (() => Math.random());
  const setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((id) => clearTimeout(id as never));

  const intervalMs = clampInt(options.intervalMs, 1000, 24 * 60 * 60 * 1000);
  const backoffBaseMs = clampInt(options.backoffBaseMs ?? 5000, 1000, 60 * 60 * 1000);
  const backoffMaxMs = clampInt(
    options.backoffMaxMs ?? 5 * 60 * 1000,
    backoffBaseMs,
    24 * 60 * 60 * 1000
  );
  const backoffJitterRatio = options.backoffJitterRatio ?? 0.2;

  let timerId: unknown | null = null;
  let stopped = true;

  const status: SyncLoopStatus = {
    running: false,
    lastRunAtMs: null,
    nextRunAtMs: null,
    consecutiveFailures: 0,
    lastErrorMessage: null,
  };

  function clearTimer() {
    if (timerId === null) return;
    clearTimeoutFn(timerId);
    timerId = null;
  }

  function scheduleAt(targetMs: number) {
    const now = nowMs();
    const delay = Math.max(0, targetMs - now);
    status.nextRunAtMs = targetMs;
    clearTimer();
    timerId = setTimeoutFn(() => {
      void runOnce('timer');
    }, delay);
  }

  function scheduleAfter(delayMs: number) {
    scheduleAt(nowMs() + Math.max(0, delayMs));
  }

  async function runOnce(source: 'timer' | 'manual'): Promise<SyncLoopTriggerResult> {
    if (stopped) {
      return {
        accepted: false,
        outcome: { kind: 'skipped', reason: 'stopped' },
        status: { ...status },
      };
    }

    const now = nowMs();
    if (status.running) {
      return {
        accepted: false,
        outcome: { kind: 'failed', message: `${options.name} 同步正在运行` },
        status: { ...status },
      };
    }

    if (source === 'timer' && typeof status.nextRunAtMs === 'number' && now < status.nextRunAtMs) {
      scheduleAt(status.nextRunAtMs);
      return {
        accepted: false,
        outcome: { kind: 'skipped', reason: 'not_due' },
        status: { ...status },
      };
    }

    status.running = true;
    status.lastRunAtMs = now;
    status.nextRunAtMs = null;

    try {
      let out: SyncLoopOutcome;
      try {
        out = await options.runOnce();
      } catch (error) {
        out = { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
      }

      if (out.kind === 'ok' || out.kind === 'skipped') {
        status.consecutiveFailures = 0;
        status.lastErrorMessage = null;
        scheduleAfter(intervalMs);
        return {
          accepted: true,
          outcome: out,
          status: { ...status, running: false },
        };
      }

      status.consecutiveFailures += 1;
      status.lastErrorMessage = out.message;

      const retryAfterMs =
        typeof out.retryAfterMs === 'number' &&
        Number.isFinite(out.retryAfterMs) &&
        out.retryAfterMs > 0
          ? clampInt(out.retryAfterMs, 1000, 24 * 60 * 60 * 1000)
          : null;

      const delayMs =
        retryAfterMs ??
        computeBackoffMs({
          failures: status.consecutiveFailures,
          baseMs: backoffBaseMs,
          maxMs: backoffMaxMs,
          jitterRatio: backoffJitterRatio,
          random,
        });
      scheduleAfter(delayMs);
      return {
        accepted: true,
        outcome: out,
        status: { ...status, running: false },
      };
    } finally {
      status.running = false;
    }
  }

  return {
    start: () => {
      if (!stopped) return;
      stopped = false;
      scheduleAfter(0);
    },
    stop: () => {
      stopped = true;
      clearTimer();
      status.running = false;
      status.nextRunAtMs = null;
    },
    triggerNow: async () => {
      return runOnce('manual');
    },
    getStatus: () => ({ ...status }),
  };
}

function toSyncSchedulerTriggerResult(
  lane: SyncSchedulerLane,
  input: SyncLoopTriggerResult
): SyncSchedulerTriggerResult {
  if (input.outcome.kind === 'ok') {
    return {
      lane,
      accepted: input.accepted,
      runOk: true,
      message: null,
      status: input.status,
    };
  }

  if (input.outcome.kind === 'skipped') {
    const message =
      input.outcome.reason === 'stopped' ? '同步调度器尚未启动' : input.outcome.reason;
    return {
      lane,
      accepted: input.accepted,
      runOk: false,
      message,
      status: input.status,
    };
  }

  return {
    lane,
    accepted: input.accepted,
    runOk: false,
    message: input.outcome.message,
    status: input.status,
  };
}

export function createSyncScheduler(options: CreateSyncSchedulerOptions): SyncScheduler {
  const createLoop = options.createLoop ?? createSyncLoop;
  const nowMs = options.nowMs ?? (() => Date.now());

  const flowLoop = createLoop({
    name: options.flow.name ?? 'Flow',
    ...options.flow,
  });
  const memosLoop = createLoop({
    name: options.memos.name ?? 'Memos',
    ...options.memos,
  });

  return {
    start: () => {
      flowLoop.start();
      memosLoop.start();
    },
    stop: () => {
      flowLoop.stop();
      memosLoop.stop();
    },
    requestNowFlow: async () => {
      const out = await flowLoop.triggerNow();
      return toSyncSchedulerTriggerResult('flow', out);
    },
    requestNowMemos: async () => {
      const out = await memosLoop.triggerNow();
      return toSyncSchedulerTriggerResult('memos', out);
    },
    getStatus: () => ({
      updatedAtMs: nowMs(),
      flow: flowLoop.getStatus(),
      memos: memosLoop.getStatus(),
    }),
  };
}
