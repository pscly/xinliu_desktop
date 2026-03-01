// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createSyncLoop,
  createSyncScheduler,
  type SyncLoopOutcome,
  type SyncLoopStatus,
} from './syncScheduler';

function createManualTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { atMs: number; fn: () => void }>();

  return {
    nowMs: () => now,
    setTimeoutFn: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { atMs: now + Math.max(0, Math.floor(ms)), fn });
      return id;
    },
    clearTimeoutFn: (id: unknown) => {
      if (typeof id === 'number') {
        timers.delete(id);
      }
    },
    advance: async (ms: number) => {
      now += Math.max(0, Math.floor(ms));
      while (true) {
        let due: Array<{ id: number; atMs: number; fn: () => void }> = [];
        for (const [id, t] of timers.entries()) {
          if (t.atMs <= now) {
            due.push({ id, atMs: t.atMs, fn: t.fn });
          }
        }
        if (due.length === 0) {
          break;
        }
        due = due.sort((a, b) => a.atMs - b.atMs || a.id - b.id);
        for (const t of due) {
          timers.delete(t.id);
          t.fn();
          await Promise.resolve();
        }
      }
      await Promise.resolve();
    },
  };
}

describe('src/main/sync/syncScheduler', () => {
  it('start 后应立即触发一次 runOnce，并在成功后按 intervalMs 继续调度', async () => {
    const t = createManualTimers();
    const calls: string[] = [];

    let next: SyncLoopOutcome = { kind: 'ok' };
    const loop = createSyncLoop({
      name: 'flow',
      intervalMs: 10_000,
      nowMs: t.nowMs,
      setTimeoutFn: t.setTimeoutFn,
      clearTimeoutFn: t.clearTimeoutFn,
      random: () => 0,
      runOnce: async () => {
        calls.push('run');
        return next;
      },
    });

    loop.start();
    await t.advance(0);
    expect(calls).toEqual(['run']);

    await t.advance(9_999);
    expect(calls).toEqual(['run']);

    await t.advance(1);
    expect(calls).toEqual(['run', 'run']);
  });

  it('失败后应指数退避（不影响另一条 loop）且手动 triggerNow 会立刻调度', async () => {
    const t = createManualTimers();
    const callsFlow: string[] = [];
    const callsMemos: string[] = [];

    let flowOut: SyncLoopOutcome = { kind: 'failed', message: 'x' };
    const flow = createSyncLoop({
      name: 'flow',
      intervalMs: 60_000,
      backoffBaseMs: 5_000,
      backoffMaxMs: 60_000,
      nowMs: t.nowMs,
      setTimeoutFn: t.setTimeoutFn,
      clearTimeoutFn: t.clearTimeoutFn,
      random: () => 0,
      runOnce: async () => {
        callsFlow.push('run');
        return flowOut;
      },
    });

    const memos = createSyncLoop({
      name: 'memos',
      intervalMs: 60_000,
      nowMs: t.nowMs,
      setTimeoutFn: t.setTimeoutFn,
      clearTimeoutFn: t.clearTimeoutFn,
      random: () => 0,
      runOnce: async () => {
        callsMemos.push('run');
        return { kind: 'skipped', reason: 'no_token' };
      },
    });

    flow.start();
    memos.start();

    await t.advance(0);
    expect(callsFlow).toEqual(['run']);
    expect(callsMemos).toEqual(['run']);

    await t.advance(4_999);
    expect(callsFlow).toEqual(['run']);
    await t.advance(1);
    expect(callsFlow).toEqual(['run', 'run']);
    expect(flow.getStatus().consecutiveFailures).toBe(2);

    const manual = await flow.triggerNow();
    expect(manual.accepted).toBe(true);
    expect(manual.outcome.kind).toBe('failed');
    expect(callsFlow).toEqual(['run', 'run', 'run']);

    expect(callsMemos).toEqual(['run']);
  });

  it('SyncScheduler：手动触发必须按 lane 分离，不得串扰', async () => {
    const flowCalls: string[] = [];
    const memosCalls: string[] = [];
    const statuses: Record<'flow' | 'memos', SyncLoopStatus> = {
      flow: {
        running: false,
        lastRunAtMs: null,
        nextRunAtMs: null,
        consecutiveFailures: 0,
        lastErrorMessage: null,
      },
      memos: {
        running: false,
        lastRunAtMs: null,
        nextRunAtMs: null,
        consecutiveFailures: 0,
        lastErrorMessage: null,
      },
    };

    const scheduler = createSyncScheduler({
      nowMs: () => 123,
      createLoop: (options) => {
        const lane = options.name?.toLowerCase().includes('memo') ? 'memos' : 'flow';
        let started = false;
        return {
          start: () => {
            started = true;
          },
          stop: () => {
            started = false;
          },
          triggerNow: async () => {
            if (!started) {
              return {
                accepted: false,
                outcome: { kind: 'skipped', reason: 'stopped' } as const,
                status: { ...statuses[lane] },
              };
            }
            statuses[lane].running = true;
            statuses[lane].lastRunAtMs = 123;
            const outcome = await options.runOnce();
            statuses[lane].running = false;
            if (outcome.kind === 'failed') {
              statuses[lane].consecutiveFailures += 1;
              statuses[lane].lastErrorMessage = outcome.message;
            } else {
              statuses[lane].consecutiveFailures = 0;
              statuses[lane].lastErrorMessage = null;
            }
            return { accepted: true, outcome, status: { ...statuses[lane] } };
          },
          getStatus: () => ({ ...statuses[lane] }),
        };
      },
      flow: {
        intervalMs: 60_000,
        runOnce: async () => {
          flowCalls.push('flow');
          return { kind: 'ok' };
        },
      },
      memos: {
        intervalMs: 60_000,
        runOnce: async () => {
          memosCalls.push('memos');
          return { kind: 'ok' };
        },
      },
    });

    scheduler.start();

    const flowOut = await scheduler.requestNowFlow();
    expect(flowOut.lane).toBe('flow');
    expect(flowOut.accepted).toBe(true);
    expect(flowOut.runOk).toBe(true);
    expect(flowCalls.length).toBeGreaterThan(0);
    expect(memosCalls.length).toBe(0);

    const memosOut = await scheduler.requestNowMemos();
    expect(memosOut.lane).toBe('memos');
    expect(memosOut.accepted).toBe(true);
    expect(memosOut.runOk).toBe(true);
    expect(memosCalls.length).toBeGreaterThan(0);

    const status = scheduler.getStatus();
    expect(status.updatedAtMs).toBe(123);
    expect(status.flow.running).toBe(false);
    expect(status.memos.running).toBe(false);
  });

  it('SyncScheduler：未启动时手动触发返回可解释错误', async () => {
    const scheduler = createSyncScheduler({
      createLoop: () => ({
        start: () => {},
        stop: () => {},
        triggerNow: async () => ({
          accepted: false,
          outcome: { kind: 'skipped', reason: 'stopped' } as const,
          status: {
            running: false,
            lastRunAtMs: null,
            nextRunAtMs: null,
            consecutiveFailures: 0,
            lastErrorMessage: null,
          },
        }),
        getStatus: () => ({
          running: false,
          lastRunAtMs: null,
          nextRunAtMs: null,
          consecutiveFailures: 0,
          lastErrorMessage: null,
        }),
      }),
      flow: {
        intervalMs: 60_000,
        runOnce: async () => ({ kind: 'ok' }),
      },
      memos: {
        intervalMs: 60_000,
        runOnce: async () => ({ kind: 'ok' }),
      },
    });

    const out = await scheduler.requestNowFlow();
    expect(out.accepted).toBe(false);
    expect(out.runOk).toBe(false);
    expect(out.message).toContain('尚未启动');
  });
});
