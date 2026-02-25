import { createHttpClient, type FetchLike, type HttpResult, type RetryPolicy } from '../net/httpClient';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface AuthTokenResponse {
  token: string;
  server_url: string;
  csrf_token?: string | null;
}

export interface FlowAuthClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  sleepMs: (ms: number) => Promise<void>;
  retry?: Partial<RetryPolicy>;
  timeoutMs?: number;
  deviceId?: string;
  deviceName?: string;
}

export interface FlowAuthClient {
  login: (req: LoginRequest) => Promise<HttpResult<AuthTokenResponse>>;
  register: (req: RegisterRequest) => Promise<HttpResult<AuthTokenResponse>>;
}

export function createFlowAuthClient(options: FlowAuthClientOptions): FlowAuthClient {
  const defaultHeaders: Record<string, string> = {};
  if (typeof options.deviceId === 'string' && options.deviceId.trim().length > 0) {
    defaultHeaders['X-Flow-Device-Id'] = options.deviceId;
  }
  if (typeof options.deviceName === 'string' && options.deviceName.trim().length > 0) {
    defaultHeaders['X-Flow-Device-Name'] = options.deviceName;
  }

  const http = createHttpClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    sleepMs: options.sleepMs,
    retry: options.retry,
    timeoutMs: options.timeoutMs,
    defaultHeaders,
  });

  return {
    register: async (req) =>
      http.requestJson<AuthTokenResponse>({
        method: 'POST',
        pathname: '/api/v1/auth/register',
        jsonBody: req,
      }),

    login: async (req) =>
      http.requestJson<AuthTokenResponse>({
        method: 'POST',
        pathname: '/api/v1/auth/login',
        jsonBody: req,
      }),
  };
}
