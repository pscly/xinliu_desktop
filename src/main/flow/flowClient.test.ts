// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createFlowClient } from './flowClient';

function makeSleepSpy() {
  const calls: number[] = [];
  return {
    calls,
    sleepMs: async (ms: number) => {
      calls.push(ms);
    },
  };
}

describe('src/main/flow/flowClient', () => {
  it('应注入 Authorization / X-Request-Id / X-Flow-Device-* 请求头', async () => {
    const token = 't-1';
    const deviceId = 'dev-1';
    const deviceName = 'my-win';

    const fetch: Parameters<typeof createFlowClient>[0]['fetch'] = vi.fn(async (url, init) => {
      const u = new URL(url);
      expect(u.origin).toBe('https://xl.pscly.cc');
      expect(u.pathname).toBe('/api/v1/sync/pull');
      expect(u.searchParams.get('cursor')).toBe('1');
      expect(u.searchParams.get('limit')).toBe('2');

      expect(init?.headers?.Authorization).toBe(`Bearer ${token}`);
      expect(init?.headers?.['X-Flow-Device-Id']).toBe(deviceId);
      expect(init?.headers?.['X-Flow-Device-Name']).toBe(deviceName);
      expect(init?.headers?.['X-Request-Id']).toBeTruthy();

      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            cursor: 1,
            next_cursor: 1,
            has_more: false,
            changes: {
              notes: [],
              user_settings: [],
              todo_lists: [],
              todo_items: [],
              todo_occurrences: [],
            },
          }),
      };
    });

    const { sleepMs } = makeSleepSpy();
    const client = createFlowClient({
      baseUrl: 'https://xl.pscly.cc/',
      token,
      deviceId,
      deviceName,
      fetch,
      sleepMs,
      retry: { maxAttempts: 1 },
    });

    const res = await client.syncPull({ cursor: 1, limit: 2 });
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('baseUrl 末尾带 / 时，实际请求 URL 不应出现双斜杠', async () => {
    const fetch: Parameters<typeof createFlowClient>[0]['fetch'] = vi.fn(async (url, init) => {
      expect(url.startsWith('https://xl.pscly.cc/api/v1/sync/pull')).toBe(true);
      expect(url).not.toMatch(/https:\/\/xl\.pscly\.cc\/\/api\/v1\/sync\/pull/);

      const u = new URL(url);
      expect(u.origin).toBe('https://xl.pscly.cc');
      expect(u.pathname).toBe('/api/v1/sync/pull');
      expect(u.searchParams.get('cursor')).toBe('0');
      expect(u.searchParams.get('limit')).toBe('200');

      expect(init?.headers?.Authorization).toBe('Bearer t-2');
      expect(init?.headers?.['X-Flow-Device-Id']).toBe('dev-2');
      expect(init?.headers?.['X-Flow-Device-Name']).toBe('win-2');
      expect(init?.headers?.['X-Request-Id']).toBeTruthy();

      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            cursor: 0,
            next_cursor: 0,
            has_more: false,
            changes: {
              notes: [],
              user_settings: [],
              todo_lists: [],
              todo_items: [],
              todo_occurrences: [],
            },
          }),
      };
    });

    const { sleepMs } = makeSleepSpy();
    const client = createFlowClient({
      baseUrl: 'https://xl.pscly.cc/',
      token: 't-2',
      deviceId: 'dev-2',
      deviceName: 'win-2',
      fetch,
      sleepMs,
      retry: { maxAttempts: 1 },
    });

    const res = await client.syncPull({});
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
