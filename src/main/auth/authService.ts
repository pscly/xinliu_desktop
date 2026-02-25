import type { TokenStore } from './tokenStore';
import type { HttpResult } from '../net/httpClient';
import type { FlowAuthClient } from '../flow/flowAuthClient';

export type AuthStatus = 'signed_out' | 'signed_in' | 'reauth_required';

export interface AuthState {
  status: AuthStatus;
  reauthRequired: boolean;
  serverUrl: string | null;
}

export type AuthLoginSuccess = {
  ok: true;
  tokenSaved: true;
  serverUrl: string;
};

export type AuthLoginFailure = {
  ok: false;
  error: unknown;
};

export type AuthLoginResult = AuthLoginSuccess | AuthLoginFailure;

export interface AuthService {
  getState: () => AuthState;
  login: (args: { username: string; password: string }) => Promise<AuthLoginResult>;
  register: (args: { username: string; password: string }) => Promise<AuthLoginResult>;
  logout: () => Promise<void>;
  handleHttpResult: (res: HttpResult<unknown>) => Promise<void>;
}

export interface CreateAuthServiceOptions {
  tokenStore: TokenStore;
  flowAuthClient: FlowAuthClient;
}

function isUnauthorized(res: HttpResult<unknown>): boolean {
  if (res.ok) return false;
  const status = res.error.status;
  const errorCode = res.error.errorResponse?.error;
  return status === 401 || errorCode === 'unauthorized';
}

export function createAuthService(options: CreateAuthServiceOptions): AuthService {
  const state: AuthState = {
    status: 'signed_out',
    reauthRequired: false,
    serverUrl: null,
  };

  function snapshot(): AuthState {
    return { ...state };
  }

  async function handleUnauthorized(): Promise<void> {
    await options.tokenStore.clearToken();
    state.status = 'reauth_required';
    state.reauthRequired = true;
  }

  async function loginLike(kind: 'login' | 'register', args: { username: string; password: string }) {
    const res =
      kind === 'login'
        ? await options.flowAuthClient.login(args)
        : await options.flowAuthClient.register(args);

    if (!res.ok) {
      if (isUnauthorized(res)) {
        await handleUnauthorized();
      }
      return { ok: false, error: res.error } satisfies AuthLoginFailure;
    }

    const { token, server_url: serverUrl } = res.value;
    await options.tokenStore.setToken(token);

    state.serverUrl = serverUrl;
    state.status = 'signed_in';
    state.reauthRequired = false;

    return {
      ok: true,
      tokenSaved: true,
      serverUrl,
    } satisfies AuthLoginSuccess;
  }

  return {
    getState: () => snapshot(),
    login: async (args) => loginLike('login', args),
    register: async (args) => loginLike('register', args),
    logout: async () => {
      await options.tokenStore.clearToken();
      state.status = 'signed_out';
      state.reauthRequired = false;
      state.serverUrl = null;
    },
    handleHttpResult: async (res) => {
      if (isUnauthorized(res)) {
        await handleUnauthorized();
      }
    },
  };
}
