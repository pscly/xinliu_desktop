import type { FetchLike, HttpResult, RetryPolicy } from '../net/httpClient';

import { createHttpClient } from '../net/httpClient';
import { normalizeBaseUrl } from '../../shared/url';

export type MemosUpdateMask = string | string[];

export interface Memo {
  name?: string;
  state?: string;
  creator?: string;
  createTime?: string;
  updateTime?: string;
  displayTime?: string;
  content?: string;
  visibility?: string;
  pinned?: boolean;
  [k: string]: unknown;
}

export interface Attachment {
  name?: string;
  createTime?: string;
  filename?: string;
  content?: string;
  externalLink?: string;
  type?: string;
  size?: string;
  memo?: string;
  [k: string]: unknown;
}

export interface ListMemosResponse {
  memos?: Memo[];
  nextPageToken?: string;
}

export interface ListMemoAttachmentsResponse {
  attachments?: Attachment[];
  nextPageToken?: string;
}

export interface CreateMemosClientOptions {
  baseUrl: string;
  token: string;
  fetch: FetchLike;
  sleepMs: (ms: number) => Promise<void>;
  retry?: Partial<RetryPolicy>;
  timeoutMs?: number;
}

export interface MemosClient {
  listMemos: (args?: {
    pageSize?: number;
    pageToken?: string;
    filter?: string;
    orderBy?: string;
    state?: 'STATE_UNSPECIFIED' | 'NORMAL' | 'ARCHIVED' | string;
    showDeleted?: boolean;
  }) => Promise<HttpResult<ListMemosResponse>>;
  getMemo: (memoName: string) => Promise<HttpResult<Memo>>;
  createMemo: (memo: Memo) => Promise<HttpResult<Memo>>;
  updateMemo: (args: {
    memoName: string;
    memo: Memo;
    updateMask: MemosUpdateMask;
  }) => Promise<HttpResult<Memo>>;
  deleteMemo: (memoName: string) => Promise<HttpResult<null>>;

  createAttachment: (args: {
    attachment: Attachment;
    attachmentId?: string;
  }) => Promise<HttpResult<Attachment>>;
  getAttachment: (attachmentName: string) => Promise<HttpResult<Attachment>>;
  updateAttachment: (args: {
    attachmentName: string;
    attachment: Attachment;
    updateMask: MemosUpdateMask;
  }) => Promise<HttpResult<Attachment>>;
  deleteAttachment: (attachmentName: string) => Promise<HttpResult<null>>;

  listMemoAttachments: (args: {
    memoName: string;
    pageSize?: number;
    pageToken?: string;
  }) => Promise<HttpResult<ListMemoAttachmentsResponse>>;
  setMemoAttachments: (args: {
    memoName: string;
    attachments: Attachment[];
  }) => Promise<HttpResult<null>>;
}

const API_PREFIX = '/api/v1';

function apiPath(pathname: string): string {
  if (!pathname.startsWith('/')) {
    throw new Error('pathname 必须以 / 开头');
  }
  return `${API_PREFIX}${pathname}`;
}

function resourcePath(resourceName: string): string {
  const trimmed = resourceName.trim();
  if (trimmed.length === 0) {
    throw new Error('资源名不能为空');
  }
  const normalized = trimmed.replace(/^\/+/, '');
  return `/${normalized}`;
}

function requireUpdateMask(updateMask: MemosUpdateMask | undefined): string {
  if (updateMask === undefined) {
    throw new Error('updateMask 不能为空：Memos 的更新接口要求显式声明要更新的字段（例如：content,visibility）');
  }

  const value = Array.isArray(updateMask) ? updateMask.join(',') : updateMask;
  const trimmed = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(',');

  if (trimmed.length === 0) {
    throw new Error('updateMask 不能为空：请至少指定一个字段（例如：content 或 content,visibility）');
  }

  return trimmed;
}

export function createMemosClient(options: CreateMemosClientOptions): MemosClient {
  const baseUrlNormalized = normalizeBaseUrl(options.baseUrl);
  const http = createHttpClient({
    baseUrl: baseUrlNormalized,
    fetch: options.fetch,
    sleepMs: options.sleepMs,
    retry: options.retry,
    timeoutMs: options.timeoutMs,
    defaultHeaders: {
      Authorization: `Bearer ${options.token}`,
    },
  });

  return {
    listMemos: async ({ pageSize, pageToken, filter, orderBy, state, showDeleted } = {}) =>
      http.requestJson<ListMemosResponse>({
        method: 'GET',
        pathname: apiPath('/memos'),
        query: {
          pageSize,
          pageToken,
          filter,
          orderBy,
          state,
          showDeleted,
        },
      }),

    getMemo: async (memoName) =>
      http.requestJson<Memo>({
        method: 'GET',
        pathname: apiPath(resourcePath(memoName)),
      }),

    createMemo: async (memo) =>
      http.requestJson<Memo>({
        method: 'POST',
        pathname: apiPath('/memos'),
        jsonBody: memo,
      }),

    updateMemo: async ({ memoName, memo, updateMask }) =>
      http.requestJson<Memo>({
        method: 'PATCH',
        pathname: apiPath(resourcePath(memoName)),
        query: {
          updateMask: requireUpdateMask(updateMask),
        },
        jsonBody: memo,
      }),

    deleteMemo: async (memoName) =>
      http.requestJson<null>({
        method: 'DELETE',
        pathname: apiPath(resourcePath(memoName)),
      }),

    createAttachment: async ({ attachment, attachmentId }) =>
      http.requestJson<Attachment>({
        method: 'POST',
        pathname: apiPath('/attachments'),
        query: {
          attachmentId,
        },
        jsonBody: attachment,
      }),

    getAttachment: async (attachmentName) =>
      http.requestJson<Attachment>({
        method: 'GET',
        pathname: apiPath(resourcePath(attachmentName)),
      }),

    updateAttachment: async ({ attachmentName, attachment, updateMask }) =>
      http.requestJson<Attachment>({
        method: 'PATCH',
        pathname: apiPath(resourcePath(attachmentName)),
        query: {
          updateMask: requireUpdateMask(updateMask),
        },
        jsonBody: attachment,
      }),

    deleteAttachment: async (attachmentName) =>
      http.requestJson<null>({
        method: 'DELETE',
        pathname: apiPath(resourcePath(attachmentName)),
      }),

    listMemoAttachments: async ({ memoName, pageSize, pageToken }) =>
      http.requestJson<ListMemoAttachmentsResponse>({
        method: 'GET',
        pathname: `${apiPath(resourcePath(memoName))}/attachments`,
        query: {
          pageSize,
          pageToken,
        },
      }),

    setMemoAttachments: async ({ memoName, attachments }) =>
      http.requestJson<null>({
        method: 'PATCH',
        pathname: `${apiPath(resourcePath(memoName))}/attachments`,
        jsonBody: {
          name: memoName,
          attachments,
        },
      }),
  };
}

export const __private__ = {
  requireUpdateMask,
  apiPath,
  resourcePath,
};
