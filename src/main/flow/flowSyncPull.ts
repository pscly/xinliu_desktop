import type Database from 'better-sqlite3';

import { createFlowClient, type FlowClient, type SyncPullResponse } from './flowClient';
import { withImmediateTransaction } from '../sync/outbox';
import type { FetchLike, HttpResult } from '../net/httpClient';

export interface FlowSyncPullEngineOptions {
  db: Database.Database;

  baseUrl: string;
  token: string;
  deviceId: string;
  deviceName: string;

  fetch: FetchLike;
  sleepMs: (ms: number) => Promise<void>;

  limit?: number;
  nowMs?: () => number;
  syncStateKey?: string;
  flowClient?: FlowClient;
}

export type FlowSyncPullOutcome =
  | {
      kind: 'completed';
      pages: number;
      fromCursor: number;
      toCursor: number;
    }
  | {
      kind: 'need_relogin';
      pages: number;
      atCursor: number;
    }
  | {
      kind: 'http_error';
      pages: number;
      atCursor: number;
      status: number | null;
      errorCode: string | null;
    }
  | {
      kind: 'apply_failed';
      pages: number;
      atCursor: number;
      message: string;
    };

const DEFAULT_LIMIT = 200;
const DEFAULT_SYNC_STATE_KEY = 'flow_sync_pull_cursor';

function safeNowMs(nowMs?: () => number): number {
  const v = (nowMs ?? Date.now)();
  if (!Number.isInteger(v) || v < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return v;
}

function parsePersistedCursor(valueJson: string): number {
  const trimmed = valueJson.trim();
  if (trimmed.length === 0) return 0;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      const c = (parsed as { cursor?: unknown }).cursor;
      if (typeof c === 'number' && Number.isFinite(c) && c >= 0) {
        return Math.floor(c);
      }
    }
  } catch {
  }
  return 0;
}

function readCursorFromSyncState(db: Database.Database, key: string): number {
  const row = db
    .prepare('SELECT value_json AS v FROM sync_state WHERE key = ?')
    .get(key) as { v: string } | undefined;
  if (!row) return 0;
  return parsePersistedCursor(String(row.v ?? ''));
}

function writeCursorToSyncState(db: Database.Database, args: { key: string; cursor: number; nowMs: number }): void {
  const cursor = args.cursor;
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error('cursor 必须是非负整数');
  }

  db.prepare(
    `
      INSERT INTO sync_state (key, value_json, updated_at_ms)
      VALUES (@key, @value_json, @updated_at_ms)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at_ms = excluded.updated_at_ms
    `
  ).run({
    key: args.key,
    value_json: JSON.stringify({ cursor }),
    updated_at_ms: args.nowMs,
  });
}

function toBoolInt(v: unknown): 0 | 1 {
  return v === true ? 1 : 0;
}

function toNonEmptyStringOrDefault(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.trim().length > 0) return v;
  return fallback;
}

function toNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function toIntOrDefault(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function stringifyJsonArray(v: unknown): string {
  return JSON.stringify(Array.isArray(v) ? v : []);
}

type RowObject = Record<string, unknown>;

function requireRowObject(v: unknown, label: string): RowObject {
  if (!v || typeof v !== 'object') {
    throw new Error(`${label} 必须是对象`);
  }
  return v as RowObject;
}

function requireNonEmptyString(v: unknown, fieldName: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return v;
}

function requireClientUpdatedAtMs(v: unknown, fieldName: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`${fieldName} 必须是非负整数（毫秒）`);
  }
  return Math.trunc(v);
}

function applyTodoLists(db: Database.Database, rows: unknown[]): void {
  const stmt = db.prepare(
    `
      INSERT INTO todo_lists (
        id,
        name,
        color,
        sort_order,
        archived,
        client_updated_at_ms,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @name,
        @color,
        @sort_order,
        @archived,
        @client_updated_at_ms,
        @updated_at,
        @deleted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color = excluded.color,
        sort_order = excluded.sort_order,
        archived = excluded.archived,
        client_updated_at_ms = excluded.client_updated_at_ms,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      WHERE excluded.client_updated_at_ms >= todo_lists.client_updated_at_ms
    `
  );

  for (const raw of rows) {
    const row = requireRowObject(raw, 'todo_list');
    const id = requireNonEmptyString(row.id, 'todo_list.id');
    const name = toNonEmptyStringOrDefault(row.name, '');
    const clientUpdatedAtMs = requireClientUpdatedAtMs(
      row.client_updated_at_ms,
      'todo_list.client_updated_at_ms'
    );
    const updatedAt = requireNonEmptyString(row.updated_at, 'todo_list.updated_at');

    stmt.run({
      id,
      name,
      color: toNullableString(row.color),
      sort_order: toIntOrDefault(row.sort_order, 0),
      archived: toBoolInt(row.archived),
      client_updated_at_ms: clientUpdatedAtMs,
      updated_at: updatedAt,
      deleted_at: toNullableString(row.deleted_at),
    });
  }
}

function applyTodoItems(db: Database.Database, rows: unknown[]): void {
  const stmt = db.prepare(
    `
      INSERT INTO todo_items (
        id,
        list_id,
        parent_id,
        title,
        note,
        status,
        priority,
        due_at_local,
        completed_at_local,
        sort_order,
        tags_json,
        is_recurring,
        rrule,
        dtstart_local,
        tzid,
        reminders_json,
        client_updated_at_ms,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @list_id,
        @parent_id,
        @title,
        @note,
        @status,
        @priority,
        @due_at_local,
        @completed_at_local,
        @sort_order,
        @tags_json,
        @is_recurring,
        @rrule,
        @dtstart_local,
        @tzid,
        @reminders_json,
        @client_updated_at_ms,
        @updated_at,
        @deleted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        list_id = excluded.list_id,
        parent_id = excluded.parent_id,
        title = excluded.title,
        note = excluded.note,
        status = excluded.status,
        priority = excluded.priority,
        due_at_local = excluded.due_at_local,
        completed_at_local = excluded.completed_at_local,
        sort_order = excluded.sort_order,
        tags_json = excluded.tags_json,
        is_recurring = excluded.is_recurring,
        rrule = excluded.rrule,
        dtstart_local = excluded.dtstart_local,
        tzid = excluded.tzid,
        reminders_json = excluded.reminders_json,
        client_updated_at_ms = excluded.client_updated_at_ms,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      WHERE excluded.client_updated_at_ms >= todo_items.client_updated_at_ms
    `
  );

  for (const raw of rows) {
    const row = requireRowObject(raw, 'todo_item');
    const id = requireNonEmptyString(row.id, 'todo_item.id');
    const listId = requireNonEmptyString(row.list_id, 'todo_item.list_id');
    const clientUpdatedAtMs = requireClientUpdatedAtMs(
      row.client_updated_at_ms,
      'todo_item.client_updated_at_ms'
    );
    const updatedAt = requireNonEmptyString(row.updated_at, 'todo_item.updated_at');

    stmt.run({
      id,
      list_id: listId,
      parent_id: toNullableString(row.parent_id),
      title: toNonEmptyStringOrDefault(row.title, ''),
      note: typeof row.note === 'string' ? row.note : '',
      status: toNonEmptyStringOrDefault(row.status, 'todo'),
      priority: toIntOrDefault(row.priority, 0),
      due_at_local: toNullableString(row.due_at_local),
      completed_at_local: toNullableString(row.completed_at_local),
      sort_order: toIntOrDefault(row.sort_order, 0),
      tags_json: stringifyJsonArray(row.tags),
      is_recurring: toBoolInt(row.is_recurring),
      rrule: toNullableString(row.rrule),
      dtstart_local: toNullableString(row.dtstart_local),
      tzid: toNonEmptyStringOrDefault(row.tzid, 'Asia/Shanghai'),
      reminders_json: stringifyJsonArray(row.reminders),
      client_updated_at_ms: clientUpdatedAtMs,
      updated_at: updatedAt,
      deleted_at: toNullableString(row.deleted_at),
    });
  }
}

function applyTodoOccurrences(db: Database.Database, rows: unknown[]): void {
  const stmt = db.prepare(
    `
      INSERT INTO todo_occurrences (
        id,
        item_id,
        tzid,
        recurrence_id_local,
        status_override,
        title_override,
        note_override,
        due_at_override_local,
        completed_at_local,
        client_updated_at_ms,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @item_id,
        @tzid,
        @recurrence_id_local,
        @status_override,
        @title_override,
        @note_override,
        @due_at_override_local,
        @completed_at_local,
        @client_updated_at_ms,
        @updated_at,
        @deleted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        item_id = excluded.item_id,
        tzid = excluded.tzid,
        recurrence_id_local = excluded.recurrence_id_local,
        status_override = excluded.status_override,
        title_override = excluded.title_override,
        note_override = excluded.note_override,
        due_at_override_local = excluded.due_at_override_local,
        completed_at_local = excluded.completed_at_local,
        client_updated_at_ms = excluded.client_updated_at_ms,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      WHERE excluded.client_updated_at_ms >= todo_occurrences.client_updated_at_ms
    `
  );

  for (const raw of rows) {
    const row = requireRowObject(raw, 'todo_occurrence');
    const id = requireNonEmptyString(row.id, 'todo_occurrence.id');
    const itemId = requireNonEmptyString(row.item_id, 'todo_occurrence.item_id');
    const recurrenceIdLocal = requireNonEmptyString(
      row.recurrence_id_local,
      'todo_occurrence.recurrence_id_local'
    );
    const clientUpdatedAtMs = requireClientUpdatedAtMs(
      row.client_updated_at_ms,
      'todo_occurrence.client_updated_at_ms'
    );
    const updatedAt = requireNonEmptyString(row.updated_at, 'todo_occurrence.updated_at');

    stmt.run({
      id,
      item_id: itemId,
      tzid: toNonEmptyStringOrDefault(row.tzid, 'Asia/Shanghai'),
      recurrence_id_local: recurrenceIdLocal,
      status_override: toNullableString(row.status_override),
      title_override: toNullableString(row.title_override),
      note_override: toNullableString(row.note_override),
      due_at_override_local: toNullableString(row.due_at_override_local),
      completed_at_local: toNullableString(row.completed_at_local),
      client_updated_at_ms: clientUpdatedAtMs,
      updated_at: updatedAt,
      deleted_at: toNullableString(row.deleted_at),
    });
  }
}

function applyCollectionItems(db: Database.Database, rows: unknown[]): void {
  const stmt = db.prepare(
    `
      INSERT INTO collection_items (
        id,
        item_type,
        parent_id,
        name,
        color,
        ref_type,
        ref_id,
        sort_order,
        client_updated_at_ms,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @item_type,
        @parent_id,
        @name,
        @color,
        @ref_type,
        @ref_id,
        @sort_order,
        @client_updated_at_ms,
        @created_at,
        @updated_at,
        @deleted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        item_type = excluded.item_type,
        parent_id = excluded.parent_id,
        name = excluded.name,
        color = excluded.color,
        ref_type = excluded.ref_type,
        ref_id = excluded.ref_id,
        sort_order = excluded.sort_order,
        client_updated_at_ms = excluded.client_updated_at_ms,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      WHERE excluded.client_updated_at_ms >= collection_items.client_updated_at_ms
    `
  );

  for (const raw of rows) {
    const row = requireRowObject(raw, 'collection_item');
    const id = requireNonEmptyString(row.id, 'collection_item.id');
    const clientUpdatedAtMs = requireClientUpdatedAtMs(
      row.client_updated_at_ms,
      'collection_item.client_updated_at_ms'
    );
    const createdAt = requireNonEmptyString(row.created_at, 'collection_item.created_at');
    const updatedAt = requireNonEmptyString(row.updated_at, 'collection_item.updated_at');

    stmt.run({
      id,
      item_type: requireNonEmptyString(row.item_type, 'collection_item.item_type'),
      parent_id: toNullableString(row.parent_id),
      name: typeof row.name === 'string' ? row.name : '',
      color: toNullableString(row.color),
      ref_type: toNullableString(row.ref_type),
      ref_id: toNullableString(row.ref_id),
      sort_order: toIntOrDefault(row.sort_order, 0),
      client_updated_at_ms: clientUpdatedAtMs,
      created_at: createdAt,
      updated_at: updatedAt,
      deleted_at: toNullableString(row.deleted_at),
    });
  }
}

function applyUserSettings(db: Database.Database, rows: unknown[]): void {
  const stmt = db.prepare(
    `
      INSERT INTO user_settings (
        key,
        value_json,
        client_updated_at_ms,
        updated_at,
        deleted_at
      ) VALUES (
        @key,
        @value_json,
        @client_updated_at_ms,
        @updated_at,
        @deleted_at
      )
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        client_updated_at_ms = excluded.client_updated_at_ms,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
      WHERE excluded.client_updated_at_ms >= user_settings.client_updated_at_ms
    `
  );

  for (const raw of rows) {
    const row = requireRowObject(raw, 'user_setting');
    const key = requireNonEmptyString(row.key, 'user_setting.key');
    const clientUpdatedAtMs = requireClientUpdatedAtMs(
      row.client_updated_at_ms,
      'user_setting.client_updated_at_ms'
    );
    const updatedAt = requireNonEmptyString(row.updated_at, 'user_setting.updated_at');

    const valueJson = (() => {
      const v = (row as { value_json?: unknown }).value_json;
      if (typeof v === 'string') return v;
      return JSON.stringify(v ?? {});
    })();

    stmt.run({
      key,
      value_json: valueJson,
      client_updated_at_ms: clientUpdatedAtMs,
      updated_at: updatedAt,
      deleted_at: toNullableString(row.deleted_at),
    });
  }
}

function applyChanges(db: Database.Database, changes: unknown): void {
  const obj = requireRowObject(changes, 'changes');
  const entries = Object.entries(obj);

  const keysNoWarn = new Set<string>(['notes']);
  const handlers: Record<string, (rows: unknown[]) => void> = {
    user_settings: (rows) => applyUserSettings(db, rows),
    todo_lists: (rows) => applyTodoLists(db, rows),
    todo_items: (rows) => applyTodoItems(db, rows),
    todo_occurrences: (rows) => applyTodoOccurrences(db, rows),
    collection_items: (rows) => applyCollectionItems(db, rows),
  };

  for (const [key, value] of entries) {
    const handler = handlers[key];
    if (handler) {
      if (!Array.isArray(value)) {
        throw new Error(`changes.${key} 必须是数组`);
      }
      handler(value);
      continue;
    }

    if (!keysNoWarn.has(key)) {
      console.warn(`[FlowSyncPull] 未知 changes key：${key}（已忽略）`);
    }
  }
}

function getHttpErrorCode(res: HttpResult<unknown>): { status: number | null; errorCode: string | null } {
  if (res.ok) return { status: null, errorCode: null };
  const status = typeof res.error.status === 'number' ? res.error.status : null;
  const errorCode =
    typeof res.error.errorResponse?.error === 'string' ? res.error.errorResponse.error : null;
  return { status, errorCode };
}

function isUnauthorized(res: HttpResult<unknown>): boolean {
  if (res.ok) return false;
  const status = res.error.status;
  const errorCode = res.error.errorResponse?.error;
  return status === 401 || errorCode === 'unauthorized';
}

export async function runFlowSyncPull(options: FlowSyncPullEngineOptions): Promise<FlowSyncPullOutcome> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const syncStateKey = options.syncStateKey ?? DEFAULT_SYNC_STATE_KEY;

  const flowClient =
    options.flowClient ??
    createFlowClient({
      baseUrl: options.baseUrl,
      token: options.token,
      deviceId: options.deviceId,
      deviceName: options.deviceName,
      fetch: options.fetch,
      sleepMs: options.sleepMs,
    });

  let cursor = readCursorFromSyncState(options.db, syncStateKey);
  const fromCursor = cursor;
  let pages = 0;

  while (true) {
    const res = await flowClient.syncPull({ cursor, limit });
    if (!res.ok) {
      if (isUnauthorized(res)) {
        return { kind: 'need_relogin', pages, atCursor: cursor };
      }
      const { status, errorCode } = getHttpErrorCode(res);
      return { kind: 'http_error', pages, atCursor: cursor, status, errorCode };
    }

    const value: SyncPullResponse = res.value;
    const nextCursor = value.next_cursor;
    pages += 1;

    try {
      const nowMs = safeNowMs(options.nowMs);
      withImmediateTransaction(options.db, () => {
        applyChanges(options.db, value.changes);
        writeCursorToSyncState(options.db, { key: syncStateKey, cursor: nextCursor, nowMs });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { kind: 'apply_failed', pages, atCursor: cursor, message: msg };
    }

    cursor = nextCursor;
    if (!value.has_more) {
      return { kind: 'completed', pages, fromCursor, toCursor: cursor };
    }
  }
}
