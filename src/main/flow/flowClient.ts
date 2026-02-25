import { createHttpClient, type FetchLike, type HttpResult, type RetryPolicy } from '../net/httpClient';

export type SyncResource =
  | 'note'
  | 'user_setting'
  | 'todo_list'
  | 'todo_item'
  | 'todo_occurrence'
  | 'collection_item';
export type SyncOp = 'upsert' | 'delete';

export interface SyncMutation {
  resource: SyncResource;
  op: SyncOp;
  entity_id: string;
  client_updated_at_ms?: number;
  data?: Record<string, unknown>;
}

export interface SyncPushRequest {
  mutations: SyncMutation[];
}

export interface SyncApplied {
  resource: SyncResource;
  entity_id: string;
}

export interface SyncRejected {
  resource: SyncResource;
  entity_id: string;
  reason: string;
  server?: unknown | null;
}

export interface SyncPushResponse {
  cursor: number;
  applied?: SyncApplied[];
  rejected?: SyncRejected[];
}

export interface SyncPullChanges {
  notes: unknown[];
  user_settings: unknown[];
  todo_lists: unknown[];
  todo_items: unknown[];
  todo_occurrences: unknown[];
  collection_items?: unknown[];
}

export interface SyncPullResponse {
  cursor: number;
  next_cursor: number;
  has_more: boolean;
  changes: SyncPullChanges;
}

export interface FlowClientOptions {
  baseUrl: string;
  token: string;
  deviceId: string;
  deviceName: string;
  fetch: FetchLike;
  sleepMs: (ms: number) => Promise<void>;
  retry?: Partial<RetryPolicy>;
  timeoutMs?: number;
}

export interface FlowClient {
  syncPush: (req: SyncPushRequest) => Promise<HttpResult<SyncPushResponse>>;
  syncPull: (args: { cursor?: number; limit?: number }) => Promise<HttpResult<SyncPullResponse>>;
}

export function createFlowClient(options: FlowClientOptions): FlowClient {
  const http = createHttpClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    sleepMs: options.sleepMs,
    retry: options.retry,
    timeoutMs: options.timeoutMs,
    defaultHeaders: {
      Authorization: `Bearer ${options.token}`,
      'X-Flow-Device-Id': options.deviceId,
      'X-Flow-Device-Name': options.deviceName,
    },
  });

  return {
    syncPush: async (req) =>
      http.requestJson<SyncPushResponse>({
        method: 'POST',
        pathname: '/api/v1/sync/push',
        jsonBody: req,
      }),

    syncPull: async ({ cursor = 0, limit = 200 }) =>
      http.requestJson<SyncPullResponse>({
        method: 'GET',
        pathname: '/api/v1/sync/pull',
        query: {
          cursor,
          limit,
        },
      }),
  };
}
