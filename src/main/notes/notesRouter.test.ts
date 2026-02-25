// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import type { HttpErrorCode, HttpResult } from '../net/httpClient';

import { routeNotesRequest } from './notesRouter';

function okResult<T>(args: {
  value: T;
  status?: number;
  requestId: string;
  responseRequestIdHeader?: string | null;
}): HttpResult<T> {
  return {
    ok: true,
    value: args.value,
    status: args.status ?? 200,
    requestId: args.requestId,
    responseRequestIdHeader: args.responseRequestIdHeader ?? null,
  };
}

function errResult<T>(args: {
  code: HttpErrorCode;
  message?: string;
  status?: number;
  requestId: string;
  responseRequestIdHeader?: string | null;
}): HttpResult<T> {
  return {
    ok: false,
    error: {
      code: args.code,
      message: args.message ?? 'err',
      status: args.status,
      requestId: args.requestId,
      responseRequestIdHeader: args.responseRequestIdHeader ?? null,
    },
  };
}

describe('src/main/notes/notesRouter', () => {
  it('规则 1：memosBaseUrl 缺失/非法/非 http(s) 时，应直接走 FlowNotes（不尝试 Memos）', async () => {
    const memosRequest = vi.fn(async () => okResult({ value: { ok: true }, requestId: 'm-1' }));
    const flowNotesRequest = vi.fn(async () =>
      okResult({ value: { ok: true }, requestId: 'f-1', responseRequestIdHeader: 'srv-flow-1' })
    );

    const res = await routeNotesRequest({
      memosBaseUrl: 'ftp://example.com',
      memosRequest,
      flowNotesRequest,
    });

    expect(memosRequest).toHaveBeenCalledTimes(0);
    expect(flowNotesRequest).toHaveBeenCalledTimes(1);

    expect(res.kind).toBe('single');
    if (res.kind === 'single') {
      expect(res.provider).toBe('flow_notes');
      expect(res.providerReason).toBe('memos_base_url_invalid');
      expect(res.request_id).toBe('srv-flow-1');
      expect(res.providerLabel).toBe('[FlowNotes]');
    }
  });

  it('规则 2：配置校验通过时，默认先直连 Memos（成功则不触发 FlowNotes）', async () => {
    const memosRequest = vi.fn(async () =>
      okResult({ value: { ok: true }, requestId: 'm-2', responseRequestIdHeader: 'srv-memos-2' })
    );
    const flowNotesRequest = vi.fn(async () => okResult({ value: { ok: true }, requestId: 'f-2' }));

    const res = await routeNotesRequest({
      memosBaseUrl: 'https://memos.example.com',
      memosRequest,
      flowNotesRequest,
    });

    expect(memosRequest).toHaveBeenCalledTimes(1);
    expect(flowNotesRequest).toHaveBeenCalledTimes(0);

    expect(res.kind).toBe('single');
    if (res.kind === 'single') {
      expect(res.provider).toBe('memos');
      expect(res.request_id).toBe('srv-memos-2');
      expect(res.providerLabel).toBe('[Memos]');
      expect(res.result.ok).toBe(true);
    }
  });

  it('规则 3：Memos 返回 401/403 时，当次请求应降级到 FlowNotes 重试一次（并分离 request_id）', async () => {
    const memosRequest = vi.fn(async () =>
      errResult({
        code: 'HTTP_ERROR',
        status: 401,
        requestId: 'm-3',
        responseRequestIdHeader: 'srv-memos-3',
      })
    );
    const flowNotesRequest = vi.fn(async () =>
      okResult({ value: { ok: true }, requestId: 'f-3', responseRequestIdHeader: 'srv-flow-3' })
    );

    const res = await routeNotesRequest({
      memosBaseUrl: 'https://memos.example.com',
      memosRequest,
      flowNotesRequest,
    });

    expect(memosRequest).toHaveBeenCalledTimes(1);
    expect(flowNotesRequest).toHaveBeenCalledTimes(1);

    expect(res.kind).toBe('degraded');
    if (res.kind === 'degraded') {
      expect(res.degradeReason).toBe('memos_unauthorized');
      expect(res.memos_request_id).toBe('srv-memos-3');
      expect(res.flow_request_id).toBe('srv-flow-3');
      expect(res.provider).toBe('flow_notes');
      expect(res.memos.providerLabel).toBe('[Memos]');
      expect(res.flow.providerLabel).toBe('[FlowNotes]');
      expect(res.result.ok).toBe(true);
    }
  });

  it('规则 4：Memos NETWORK_ERROR/TIMEOUT（获得有效 HTTP 前失败）时，当次请求应降级到 FlowNotes 重试一次', async () => {
    const memosRequest = vi.fn(async () =>
      errResult({ code: 'NETWORK_ERROR', requestId: 'm-4', responseRequestIdHeader: null })
    );
    const flowNotesRequest = vi.fn(async () =>
      okResult({ value: { ok: true }, requestId: 'f-4', responseRequestIdHeader: 'srv-flow-4' })
    );

    const res = await routeNotesRequest({
      memosBaseUrl: 'memos.example.com',
      memosRequest,
      flowNotesRequest,
    });

    expect(memosRequest).toHaveBeenCalledTimes(1);
    expect(flowNotesRequest).toHaveBeenCalledTimes(1);

    expect(res.kind).toBe('degraded');
    if (res.kind === 'degraded') {
      expect(res.degradeReason).toBe('memos_network_or_timeout');
      expect(res.memos_request_id).toBe('m-4');
      expect(res.flow_request_id).toBe('srv-flow-4');
    }
  });

  it('规则 5：Memos 返回有效 HTTP 且非 401/403（如 5xx）时，不得降级，应直接暴露 [Memos] 错误', async () => {
    const memosRequest = vi.fn(async () =>
      errResult({
        code: 'HTTP_ERROR',
        status: 500,
        requestId: 'm-5',
        responseRequestIdHeader: 'srv-memos-5',
      })
    );
    const flowNotesRequest = vi.fn(async () => okResult({ value: { ok: true }, requestId: 'f-5' }));

    const res = await routeNotesRequest({
      memosBaseUrl: 'https://memos.example.com',
      memosRequest,
      flowNotesRequest,
    });

    expect(memosRequest).toHaveBeenCalledTimes(1);
    expect(flowNotesRequest).toHaveBeenCalledTimes(0);

    expect(res.kind).toBe('single');
    if (res.kind === 'single') {
      expect(res.provider).toBe('memos');
      expect(res.providerLabel).toBe('[Memos]');
      expect(res.request_id).toBe('srv-memos-5');
      expect(res.result.ok).toBe(false);
      if (!res.result.ok) {
        expect(res.result.error.status).toBe(500);
      }
    }
  });

  it('额外：仅降级一次（即使 FlowNotes 也失败，也不得再回头重试 Memos）', async () => {
    const memosRequest = vi.fn(async () =>
      errResult({
        code: 'HTTP_ERROR',
        status: 403,
        requestId: 'm-6',
        responseRequestIdHeader: null,
      })
    );
    const flowNotesRequest = vi.fn(async () =>
      errResult({ code: 'TIMEOUT', requestId: 'f-6', responseRequestIdHeader: 'srv-flow-6' })
    );

    const res = await routeNotesRequest({
      memosBaseUrl: 'https://memos.example.com',
      memosRequest,
      flowNotesRequest,
    });

    expect(memosRequest).toHaveBeenCalledTimes(1);
    expect(flowNotesRequest).toHaveBeenCalledTimes(1);

    expect(res.kind).toBe('degraded');
    if (res.kind === 'degraded') {
      expect(res.memos_request_id).toBe('m-6');
      expect(res.flow_request_id).toBe('srv-flow-6');
      expect(res.result.ok).toBe(false);
      expect(res.provider).toBe('flow_notes');
    }
  });
});
