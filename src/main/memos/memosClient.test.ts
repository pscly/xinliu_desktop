// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createMemosClient } from './memosClient';

function makeSleepSpy() {
  const calls: number[] = [];
  return {
    calls,
    sleepMs: async (ms: number) => {
      calls.push(ms);
    },
  };
}

describe('src/main/memos/memosClient', () => {
  it('UpdateMemo/UpdateAttachment 缺 updateMask 时应失败（可解释错误）', async () => {
    const fetch = vi.fn();
    const { sleepMs } = makeSleepSpy();
    const client = createMemosClient({
      baseUrl: 'https://memos.example.com',
      token: 't',
      fetch: fetch as never,
      sleepMs,
      retry: { maxAttempts: 1 },
    });

    await expect(
      client.updateMemo({
        memoName: 'memos/123',
        memo: { content: 'x' },
        updateMask: undefined as never,
      })
    ).rejects.toThrow(/updateMask/);

    await expect(
      client.updateAttachment({
        attachmentName: 'attachments/1',
        attachment: { filename: 'a.txt', type: 'text/plain' },
        updateMask: '' as never,
      })
    ).rejects.toThrow(/updateMask/);

    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('ListMemos: pageSize/pageToken 翻页应注入 query，并能读取 nextPageToken', async () => {
    const token = 't-1';
    const fetch: Parameters<typeof createMemosClient>[0]['fetch'] = vi.fn(async (url, init) => {
      const u = new URL(url);
      expect(u.origin).toBe('https://memos.example.com');
      expect(u.pathname).toBe('/api/v1/memos');
      expect(u.searchParams.get('pageSize')).toBe('10');
      expect(u.searchParams.get('pageToken')).toBe('tok-1');

      expect(init?.headers?.Authorization).toBe(`Bearer ${token}`);
      expect(init?.headers?.['X-Request-Id']).toBeTruthy();

      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            memos: [],
            nextPageToken: 'tok-2',
          }),
      };
    });

    const { sleepMs } = makeSleepSpy();
    const client = createMemosClient({
      baseUrl: 'https://memos.example.com/',
      token,
      fetch,
      sleepMs,
      retry: { maxAttempts: 1 },
    });

    const res = await client.listMemos({ pageSize: 10, pageToken: 'tok-1' });
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    if (res.ok) {
      expect(res.value.nextPageToken).toBe('tok-2');
    }
  });
});
