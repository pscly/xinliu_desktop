import type { FetchLike, HttpResult, RetryPolicy } from '../net/httpClient';

import { createHttpClient } from '../net/httpClient';
import { normalizeBaseUrl } from '../../shared/url';

import type { NotesRoutedResult } from './notesRouter';
import { requireFlowNotesFinalDecision } from './flowNotesDecisionGuard';

export interface FlowNote {
  id: string;
  title: string;
  body_md: string;
  tags: string[];
  client_updated_at_ms: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface FlowNoteList {
  items?: FlowNote[];
  total: number;
  limit: number;
  offset: number;
}

export interface FlowNoteCreateRequest {
  id?: string | null;
  title?: string | null;
  body_md: string;
  tags?: string[];
  client_updated_at_ms?: number | null;
}

export interface FlowNotePatchRequest {
  title?: string | null;
  body_md?: string | null;
  tags?: string[] | null;
  client_updated_at_ms: number;
}

export interface FlowNoteRestoreRequest {
  client_updated_at_ms: number;
}

export interface FlowNoteSnapshot {
  title?: string;
  body_md?: string;
  tags?: string[];
  client_updated_at_ms: number;
}

export interface FlowNoteRevision {
  id: string;
  note_id: string;
  kind: string;
  snapshot: FlowNoteSnapshot;
  created_at: string;
  reason?: string | null;
}

export interface FlowNoteRevisionList {
  items?: FlowNoteRevision[];
}

export interface FlowNoteRevisionRestoreRequest {
  client_updated_at_ms: number;
}

export interface FlowShareCreateRequest {
  expires_in_seconds?: number | null;
}

export interface FlowShareCreated {
  share_id: string;
  share_url: string;
  share_token: string;
}

export interface FlowAttachment {
  id: string;
  note_id: string;
  size_bytes: number;
  storage_key: string;
  created_at: string;
  filename?: string | null;
  content_type?: string | null;
}

export interface FlowNotesClientOptions {
  baseUrl: string;
  token: string;
  deviceId: string;
  deviceName: string;
  fetch: FetchLike;
  sleepMs: (ms: number) => Promise<void>;
  retry?: Partial<RetryPolicy>;
  timeoutMs?: number;
}

export type FlowNotesFileUpload = {
  filename: string;
  contentType?: string | null;
  bytes: Uint8Array;
};

export interface FlowNotesClient {
  listNotes: (args?: {
    limit?: number;
    offset?: number;
    tag?: string | null;
    q?: string | null;
    include_deleted?: boolean;
  }) => Promise<HttpResult<FlowNoteList>>;
  getNote: (args: { noteId: string; include_deleted?: boolean }) => Promise<HttpResult<FlowNote>>;

  createNote: (args: {
    decision: NotesRoutedResult<unknown>;
    note: FlowNoteCreateRequest;
  }) => Promise<HttpResult<FlowNote>>;
  patchNote: (args: {
    decision: NotesRoutedResult<unknown>;
    noteId: string;
    patch: FlowNotePatchRequest;
  }) => Promise<HttpResult<FlowNote>>;
  deleteNote: (args: {
    decision: NotesRoutedResult<unknown>;
    noteId: string;
    client_updated_at_ms: number;
  }) => Promise<HttpResult<null>>;
  restoreNote: (args: {
    decision: NotesRoutedResult<unknown>;
    noteId: string;
    body: FlowNoteRestoreRequest;
  }) => Promise<HttpResult<FlowNote>>;

  listRevisions: (args: { noteId: string; limit?: number }) => Promise<HttpResult<FlowNoteRevisionList>>;
  restoreRevision: (args: {
    decision: NotesRoutedResult<unknown>;
    noteId: string;
    revisionId: string;
    body: FlowNoteRevisionRestoreRequest;
  }) => Promise<HttpResult<FlowNote>>;

  createShare: (args: {
    decision: NotesRoutedResult<unknown>;
    noteId: string;
    body: FlowShareCreateRequest;
  }) => Promise<HttpResult<FlowShareCreated>>;

  uploadAttachment: (args: {
    decision: NotesRoutedResult<unknown>;
    noteId: string;
    file: FlowNotesFileUpload;
  }) => Promise<HttpResult<FlowAttachment>>;
}

function labelFlowNotesResult<T>(res: HttpResult<T>): HttpResult<T> {
  if (res.ok) return res;
  return {
    ok: false,
    error: {
      ...res.error,
      message: `[FlowNotes] ${res.error.message}`,
    },
  };
}

function ensureFlowNotesWriteAllowed(decision: NotesRoutedResult<unknown>): void {
  requireFlowNotesFinalDecision(decision);
}

function encodePathSegment(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new Error('id 不能为空');
  return encodeURIComponent(trimmed);
}

export function createFlowNotesClient(options: FlowNotesClientOptions): FlowNotesClient {
  const baseUrlNormalized = normalizeBaseUrl(options.baseUrl);
  const http = createHttpClient({
    baseUrl: baseUrlNormalized,
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
    listNotes: async ({ limit, offset, tag, q, include_deleted } = {}) =>
      labelFlowNotesResult(
        await http.requestJson<FlowNoteList>({
          method: 'GET',
          pathname: '/api/v1/notes',
          query: {
            limit,
            offset,
            tag,
            q,
            include_deleted,
          },
        })
      ),

    getNote: async ({ noteId, include_deleted }) =>
      labelFlowNotesResult(
        await http.requestJson<FlowNote>({
          method: 'GET',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}`,
          query: {
            include_deleted,
          },
        })
      ),

    createNote: async ({ decision, note }) => {
      ensureFlowNotesWriteAllowed(decision);
      return labelFlowNotesResult(
        await http.requestJson<FlowNote>({
          method: 'POST',
          pathname: '/api/v1/notes',
          jsonBody: note,
        })
      );
    },

    patchNote: async ({ decision, noteId, patch }) => {
      ensureFlowNotesWriteAllowed(decision);
      return labelFlowNotesResult(
        await http.requestJson<FlowNote>({
          method: 'PATCH',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}`,
          jsonBody: patch,
        })
      );
    },

    deleteNote: async ({ decision, noteId, client_updated_at_ms }) => {
      ensureFlowNotesWriteAllowed(decision);
      return labelFlowNotesResult(
        await http.requestJson<null>({
          method: 'DELETE',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}`,
          query: {
            client_updated_at_ms,
          },
        })
      );
    },

    restoreNote: async ({ decision, noteId, body }) => {
      ensureFlowNotesWriteAllowed(decision);
      return labelFlowNotesResult(
        await http.requestJson<FlowNote>({
          method: 'POST',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}/restore`,
          jsonBody: body,
        })
      );
    },

    listRevisions: async ({ noteId, limit }) =>
      labelFlowNotesResult(
        await http.requestJson<FlowNoteRevisionList>({
          method: 'GET',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}/revisions`,
          query: {
            limit,
          },
        })
      ),

    restoreRevision: async ({ decision, noteId, revisionId, body }) => {
      ensureFlowNotesWriteAllowed(decision);
      return labelFlowNotesResult(
        await http.requestJson<FlowNote>({
          method: 'POST',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}/revisions/${encodePathSegment(
            revisionId
          )}/restore`,
          jsonBody: body,
        })
      );
    },

    createShare: async ({ decision, noteId, body }) => {
      ensureFlowNotesWriteAllowed(decision);
      return labelFlowNotesResult(
        await http.requestJson<FlowShareCreated>({
          method: 'POST',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}/shares`,
          jsonBody: body,
        })
      );
    },

    uploadAttachment: async ({ decision, noteId, file }) => {
      ensureFlowNotesWriteAllowed(decision);

      const form = new FormData();
      const blob = new Blob([file.bytes], {
        type: file.contentType ?? undefined,
      });
      form.append('file', blob, file.filename);

      return labelFlowNotesResult(
        await http.request<FlowAttachment>({
          method: 'POST',
          pathname: `/api/v1/notes/${encodePathSegment(noteId)}/attachments`,
          body: form,
        })
      );
    },
  };
}
