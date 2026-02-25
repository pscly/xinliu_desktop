// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createFlowNotesClient } from './flowNotesClient';
import type { NotesRoutedResult } from './notesRouter';

function makeSleepSpy() {
  const calls: number[] = [];
  return {
    calls,
    sleepMs: async (ms: number) => {
      calls.push(ms);
    },
  };
}

describe('src/main/notes/flowNotesClient', () => {
  it('附件上传：应使用 multipart/form-data，且字段名为 file', async () => {
    const fetch: Parameters<typeof createFlowNotesClient>[0]['fetch'] = vi.fn(async (url, init) => {
      expect(url).toContain('/api/v1/notes/n-1/attachments');

      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get('file')).toBeTruthy();

      expect(init?.headers?.['Content-Type']).toBeUndefined();

      expect(init?.headers?.['X-Request-Id']).toBeTruthy();

      return {
        ok: true,
        status: 201,
        headers: {
          get: (name: string) => (name === 'X-Request-Id' ? 'srv-flow-1' : null),
        },
        text: async () =>
          JSON.stringify({
            id: 'a-1',
            note_id: 'n-1',
            size_bytes: 3,
            storage_key: 'k',
            created_at: '2026-01-01T00:00:00Z',
            filename: 'a.txt',
            content_type: 'text/plain',
          }),
      };
    });

    const { sleepMs } = makeSleepSpy();
    const client = createFlowNotesClient({
      baseUrl: 'https://xl.pscly.cc',
      token: 't',
      deviceId: 'd1',
      deviceName: 'dev',
      fetch,
      sleepMs,
      retry: { maxAttempts: 1 },
    });

    const decision = {
      kind: 'single',
      provider: 'flow_notes',
      providerReason: 'memos_base_url_invalid',
    } as unknown as NotesRoutedResult<unknown>;

    const res = await client.uploadAttachment({
      decision,
      noteId: 'n-1',
      file: {
        filename: 'a.txt',
        contentType: 'text/plain',
        bytes: new Uint8Array([97, 98, 99]),
      },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.id).toBe('a-1');
      expect(res.value.filename).toBe('a.txt');
    }
  });

  it('409 conflict：应解析 ErrorResponse.details.server_snapshot，且错误信息带 [FlowNotes] 前缀', async () => {
    const fetch: Parameters<typeof createFlowNotesClient>[0]['fetch'] = vi.fn(async () => ({
      ok: false,
      status: 409,
      headers: {
        get: () => null,
      },
      text: async () =>
        JSON.stringify({
          error: 'conflict',
          message: 'conflict',
          request_id: 'srv-409',
          details: {
            server_snapshot: {
              id: 'n-1',
              title: '服务端版本',
              body_md: 'srv',
              tags: ['x'],
              client_updated_at_ms: 2,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          },
        }),
    }));

    const { sleepMs } = makeSleepSpy();
    const client = createFlowNotesClient({
      baseUrl: 'https://xl.pscly.cc',
      token: 't',
      deviceId: 'd1',
      deviceName: 'dev',
      fetch,
      sleepMs,
      retry: { maxAttempts: 1 },
    });

    const decision = {
      kind: 'degraded',
      provider: 'flow_notes',
      degradeReason: 'memos_network_or_timeout',
    } as unknown as NotesRoutedResult<unknown>;

    const res = await client.patchNote({
      decision,
      noteId: 'n-1',
      patch: {
        client_updated_at_ms: 1,
        body_md: 'local',
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(409);
      expect(res.error.message).toMatch(/^\[FlowNotes\]\s/);
      const details = (res.error.errorResponse?.details ?? null) as any;
      expect(details?.server_snapshot?.id).toBe('n-1');
    }
  });
});
