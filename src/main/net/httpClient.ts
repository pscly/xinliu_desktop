import crypto from 'node:crypto';

import { redactForLogs } from '../../shared/redaction';
import { joinUrl, normalizeBaseUrl } from '../../shared/url';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ErrorResponse {
  error?: string;
  message?: string;
  request_id?: string;
  details?: unknown;
}

export type HttpErrorCode =
  | 'BAD_BASE_URL'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR';

export interface HttpError {
  code: HttpErrorCode;
  message: string;
  status?: number;
  requestId: string;
  responseRequestIdHeader?: string | null;
  errorResponse?: ErrorResponse;
  retryAfterSeconds?: number | null;
}

export type HttpResult<T> =
  | {
      ok: true;
      value: T;
      status: number;
      requestId: string;
      responseRequestIdHeader: string | null;
    }
  | {
      ok: false;
      error: HttpError;
    };

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
  }
) => Promise<{
  status: number;
  ok: boolean;
  headers: {
    get: (name: string) => string | null;
  };
  text: () => Promise<string>;
}>;

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface HttpClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  sleepMs: (ms: number) => Promise<void>;
  retry?: Partial<RetryPolicy>;
  timeoutMs?: number;
  defaultHeaders?: Record<string, string>;
  getDynamicHeaders?: () => Promise<Record<string, string>>;
}

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5000,
};

function jitteredDelayMs(baseMs: number): number {
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseMs * 0.3)));
  return baseMs + jitter;
}

function computeBackoffDelayMs(policy: RetryPolicy, attemptIndex: number): number {
  const pow = 2 ** Math.max(0, attemptIndex);
  const raw = policy.baseDelayMs * pow;
  return Math.min(policy.maxDelayMs, jitteredDelayMs(raw));
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function isRetryableHttpStatus(status: number): boolean {
  if (status === 401) return false;
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

function safeErrorMessage(input: unknown): string {
  return redactForLogs(String(input));
}

async function readJsonOrNull(text: string): Promise<unknown | null> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function coerceErrorResponse(value: unknown): ErrorResponse | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  return {
    error: typeof obj.error === 'string' ? obj.error : undefined,
    message: typeof obj.message === 'string' ? obj.message : undefined,
    request_id: typeof obj.request_id === 'string' ? obj.request_id : undefined,
    details: obj.details,
  };
}

export function createHttpClient(options: HttpClientOptions): {
  requestJson: <T>(args: {
    method: HttpMethod;
    pathname: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  }) => Promise<HttpResult<T>>;
  request: <T>(args: {
    method: HttpMethod;
    pathname: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  }) => Promise<HttpResult<T>>;
} {
  const retry: RetryPolicy = {
    maxAttempts: options.retry?.maxAttempts ?? DEFAULT_RETRY.maxAttempts,
    baseDelayMs: options.retry?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs,
    maxDelayMs: options.retry?.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs,
  };

  let baseUrlNormalized: string;
  try {
    baseUrlNormalized = normalizeBaseUrl(options.baseUrl);
  } catch (e) {
    const requestId = createRequestId();
    const message = safeErrorMessage(e);
    return {
      requestJson: async () => ({
        ok: false,
        error: {
          code: 'BAD_BASE_URL',
          message,
          requestId,
          responseRequestIdHeader: null,
        },
      }),
      request: async () => ({
        ok: false,
        error: {
          code: 'BAD_BASE_URL',
          message,
          requestId,
          responseRequestIdHeader: null,
        },
      }),
    };
  }

  async function request<T>(args: {
    method: HttpMethod;
    pathname: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  }): Promise<HttpResult<T>> {
    const url = new URL(joinUrl(baseUrlNormalized, args.pathname));
    if (args.query) {
      for (const [k, v] of Object.entries(args.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }

    for (let attempt = 0; attempt < retry.maxAttempts; attempt += 1) {
      const requestId = createRequestId();
      const controller = new AbortController();

      const timeoutMs = options.timeoutMs ?? 15000;
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      const dynamicHeaders = options.getDynamicHeaders
        ? await options.getDynamicHeaders()
        : {};

      const headers: Record<string, string> = {
        ...(options.defaultHeaders ?? {}),
        ...dynamicHeaders,
        ...(args.headers ?? {}),
        'X-Request-Id': requestId,
      };

      let body: unknown;
      if (args.jsonBody !== undefined) {
        body = JSON.stringify(args.jsonBody);
        if (!('Content-Type' in headers)) {
          headers['Content-Type'] = 'application/json';
        }
      } else if (args.body !== undefined) {
        body = args.body;
      }

      try {
        const res = await options.fetch(url.toString(), {
          method: args.method,
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeoutHandle);

        const responseRequestIdHeader = res.headers.get('X-Request-Id');
        const text = await res.text();

        if (res.ok) {
          const json = (await readJsonOrNull(text)) as T | null;
          return {
            ok: true,
            value: (json ?? (null as T)) as T,
            status: res.status,
            requestId,
            responseRequestIdHeader,
          };
        }

        const parsed = await readJsonOrNull(text);
        const errorResponse = coerceErrorResponse(parsed);

        const retryAfterSeconds =
          res.status === 429 ? parseRetryAfterSeconds(res.headers.get('Retry-After')) : null;

        const error: HttpError = {
          code: 'HTTP_ERROR',
          message: errorResponse?.message
            ? safeErrorMessage(errorResponse.message)
            : `HTTP ${res.status}`,
          status: res.status,
          requestId,
          responseRequestIdHeader,
          errorResponse: errorResponse ?? undefined,
          retryAfterSeconds,
        };

        if (attempt + 1 >= retry.maxAttempts || !isRetryableHttpStatus(res.status)) {
          return { ok: false, error };
        }

        if (res.status === 429) {
          const delayMs =
            retryAfterSeconds !== null
              ? retryAfterSeconds * 1000
              : computeBackoffDelayMs(retry, attempt);
          await options.sleepMs(delayMs);
          continue;
        }

        await options.sleepMs(computeBackoffDelayMs(retry, attempt));
        continue;
      } catch (e) {
        clearTimeout(timeoutHandle);
        const message = safeErrorMessage(e);
        const code: HttpErrorCode =
          String(e).toLowerCase().includes('abort') ? 'TIMEOUT' : 'NETWORK_ERROR';

        const error: HttpError = {
          code,
          message,
          requestId,
          responseRequestIdHeader: null,
        };

        if (attempt + 1 >= retry.maxAttempts) {
          return { ok: false, error };
        }

        await options.sleepMs(computeBackoffDelayMs(retry, attempt));
        continue;
      }
    }

    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '请求失败',
        requestId: createRequestId(),
        responseRequestIdHeader: null,
      },
    };
  }

  async function requestJson<T>(args: {
    method: HttpMethod;
    pathname: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  }): Promise<HttpResult<T>> {
    return request<T>({
      method: args.method,
      pathname: args.pathname,
      query: args.query,
      jsonBody: args.jsonBody,
      headers: args.headers,
    });
  }

  return { requestJson, request };
}
