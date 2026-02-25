// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createAuthService } from './authService';
import type { TokenStore } from './tokenStore';
import type { FlowAuthClient } from '../flow/flowAuthClient';
import type { HttpResult } from '../net/httpClient';

function ok<T>(value: T): HttpResult<T> {
  return {
    ok: true,
    value,
    status: 200,
    requestId: 'cli-200',
    responseRequestIdHeader: 'srv-200',
  };
}

function http401Unauthorized(): HttpResult<unknown> {
  return {
    ok: false,
    error: {
      code: 'HTTP_ERROR',
      message: 'unauthorized',
      status: 401,
      requestId: 'cli-401',
      responseRequestIdHeader: 'srv-401',
      errorResponse: {
        error: 'unauthorized',
        message: 'missing token',
      },
    },
  };
}

describe('Task 42：登录/登出与账号状态（Flow Auth）', () => {
  it('登录成功：应写入 tokenStore，并返回 server_url', async () => {
    const tokenStore: TokenStore = {
      getToken: vi.fn(async () => null),
      setToken: vi.fn(async () => undefined),
      clearToken: vi.fn(async () => undefined),
    };

    const flowAuthClient: FlowAuthClient = {
      login: vi.fn(async () =>
        ok({
          token: 't-1',
          server_url: 'https://memos.example.com',
          csrf_token: 'c',
        })
      ),
      register: vi.fn(async () =>
        ok({
          token: 't-2',
          server_url: 'https://memos.example.com',
          csrf_token: null,
        })
      ),
    };

    const auth = createAuthService({ tokenStore, flowAuthClient });

    const res = await auth.login({ username: 'alice', password: 'secret123' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tokenSaved).toBe(true);
      expect(res.serverUrl).toBe('https://memos.example.com');
    }

    expect(tokenStore.setToken).toHaveBeenCalledWith('t-1');
    expect(auth.getState()).toEqual({
      status: 'signed_in',
      reauthRequired: false,
      serverUrl: 'https://memos.example.com',
    });
  });

  it('登出：应清除 TokenStore，并清理 auth 状态', async () => {
    const tokenStore: TokenStore = {
      getToken: vi.fn(async () => 't'),
      setToken: vi.fn(async () => undefined),
      clearToken: vi.fn(async () => undefined),
    };

    const flowAuthClient: FlowAuthClient = {
      login: vi.fn(async () => ok({ token: 't', server_url: 'https://memos.example.com' })),
      register: vi.fn(async () => ok({ token: 't', server_url: 'https://memos.example.com' })),
    };

    const auth = createAuthService({ tokenStore, flowAuthClient });
    await auth.login({ username: 'alice', password: 'x' });
    await auth.logout();

    expect(tokenStore.clearToken).toHaveBeenCalled();
    expect(auth.getState()).toEqual({
      status: 'signed_out',
      reauthRequired: false,
      serverUrl: null,
    });
  });

  it('401 unauthorized：应进入 reauthRequired 状态（并清除 TokenStore）', async () => {
    const tokenStore: TokenStore = {
      getToken: vi.fn(async () => 't'),
      setToken: vi.fn(async () => undefined),
      clearToken: vi.fn(async () => undefined),
    };

    const flowAuthClient: FlowAuthClient = {
      login: vi.fn(async () => http401Unauthorized() as never),
      register: vi.fn(async () => http401Unauthorized() as never),
    };

    const auth = createAuthService({ tokenStore, flowAuthClient });
    await auth.handleHttpResult(http401Unauthorized());

    expect(tokenStore.clearToken).toHaveBeenCalled();
    expect(auth.getState()).toEqual({
      status: 'reauth_required',
      reauthRequired: true,
      serverUrl: null,
    });
  });
});
