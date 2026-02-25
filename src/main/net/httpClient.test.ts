// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createHttpClient } from './httpClient';

function makeSleepSpy() {
  const calls: number[] = [];
  return {
    calls,
    sleepMs: async (ms: number) => {
      calls.push(ms);
    },
  };
}

describe('src/main/net/httpClient', () => {
  it('应注入 X-Request-Id 且解析 X-Request-Id 响应头', async () => {
    const fetch: Parameters<typeof createHttpClient>[0]['fetch'] = vi.fn(async (_url, init) => {
      expect(init?.headers?.['X-Request-Id']).toBeTruthy();
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === 'X-Request-Id' ? 'srv-1' : null),
        },
        text: async () => JSON.stringify({ ok: true }),
      };
    });

    const { sleepMs } = makeSleepSpy();
    const client = createHttpClient({
      baseUrl: 'https://xl.pscly.cc/',
      fetch,
      sleepMs,
      retry: { maxAttempts: 1 },
    });

    const res = await client.requestJson<{ ok: boolean }>({
      method: 'GET',
      pathname: '/api/v1/health',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.responseRequestIdHeader).toBe('srv-1');
      expect(res.value.ok).toBe(true);
    }
  });

  it('401 unauthorized 不应重试', async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: 'unauthorized', message: 'missing token' }),
    }));

    const { calls, sleepMs } = makeSleepSpy();
    const client = createHttpClient({
      baseUrl: 'https://xl.pscly.cc',
      fetch,
      sleepMs,
      retry: { maxAttempts: 3 },
    });

    const res = await client.requestJson({ method: 'GET', pathname: '/api/v1/me' });
    expect(res.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it('429 rate_limited 应遵守 Retry-After 并重试', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (n: string) => (n === 'Retry-After' ? '1' : null) },
        text: async () => JSON.stringify({ error: 'rate_limited', message: 'too many requests' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ ok: true }),
      });

    const { calls, sleepMs } = makeSleepSpy();
    const client = createHttpClient({
      baseUrl: 'https://xl.pscly.cc',
      fetch,
      sleepMs,
      retry: { maxAttempts: 2 },
    });

    const res = await client.requestJson<{ ok: boolean }>({
      method: 'GET',
      pathname: '/api/v1/ping',
    });

    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([1000]);
  });

  it('5xx 应退避并重试（最多 maxAttempts）', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: { get: () => null },
        text: async () => JSON.stringify({ error: 'upstream_error', message: 'bad gateway' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ ok: true }),
      });

    const { calls, sleepMs } = makeSleepSpy();
    const client = createHttpClient({
      baseUrl: 'https://xl.pscly.cc',
      fetch,
      sleepMs,
      retry: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 10 },
    });

    const res = await client.requestJson<{ ok: boolean }>({
      method: 'GET',
      pathname: '/api/v1/ping',
    });

    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls.length).toBe(1);
    expect(calls[0]).toBeGreaterThan(0);
  });
});
