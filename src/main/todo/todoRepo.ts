import crypto from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  FLOW_OP,
  FLOW_RESOURCE,
  bumpClientUpdatedAtMs,
  enqueueFlowOutboxMutation,
  withImmediateTransaction,
} from '../sync/outbox';

export type TodoItemStatus = string;

export interface TodoListRow {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  archived: boolean;
  clientUpdatedAtMs: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TodoItemRow {
  id: string;
  listId: string;
  parentId: string | null;
  title: string;
  note: string;
  status: TodoItemStatus;
  priority: number;
  dueAtLocal: string | null;
  completedAtLocal: string | null;
  sortOrder: number;
  tags: string[];
  isRecurring: boolean;
  rrule: string | null;
  dtstartLocal: string | null;
  tzid: string;
  reminders: unknown[];
  clientUpdatedAtMs: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListTodoItemsArgs {
  listId?: string;
  status?: string;
  tag?: string;
  includeArchivedLists?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListTodoListsArgs {
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface UpsertTodoListArgs {
  id?: string;
  name: string;
  color?: string | null;
  sortOrder?: number;
  archived?: boolean;
}

export interface PatchTodoListArgs {
  id: string;
  name?: string;
  color?: string | null;
  sortOrder?: number;
  archived?: boolean;
}

export interface UpsertTodoItemArgs {
  id?: string;
  listId: string;
  parentId?: string | null;
  title: string;
  note?: string;
  status?: TodoItemStatus;
  priority?: number;
  dueAtLocal?: string | null;
  completedAtLocal?: string | null;
  sortOrder?: number;
  tags?: string[];
  isRecurring?: boolean;
  rrule?: string | null;
  dtstartLocal?: string | null;
  tzid?: string;
  reminders?: unknown[];
}

export interface PatchTodoItemArgs {
  id: string;
  listId?: string;
  parentId?: string | null;
  title?: string;
  note?: string;
  status?: TodoItemStatus;
  priority?: number;
  dueAtLocal?: string | null;
  completedAtLocal?: string | null;
  sortOrder?: number;
  tags?: string[];
  isRecurring?: boolean;
  rrule?: string | null;
  dtstartLocal?: string | null;
  tzid?: string;
  reminders?: unknown[];
}

export interface TodoRepoDeps {
  nowMs?: () => number;
  tzid?: () => string;
  randomUUID?: () => string;
}

function createId(deps: TodoRepoDeps): string {
  return (deps.randomUUID ?? crypto.randomUUID)();
}

function safeNowMs(deps: TodoRepoDeps): number {
  const nowMs = (deps.nowMs ?? Date.now)();
  if (!Number.isInteger(nowMs) || nowMs < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return nowMs;
}

function defaultTzid(deps: TodoRepoDeps): string {
  const tzid = deps.tzid ? deps.tzid() : Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (typeof tzid !== 'string' || tzid.trim().length === 0) {
    return 'Asia/Shanghai';
  }
  return tzid;
}

function toBoolInt(v: boolean): 0 | 1 {
  return v ? 1 : 0;
}

function parseJsonArray(value: string): unknown[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function mapTodoListRow(row: {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  archived: number;
  client_updated_at_ms: number;
  updated_at: string;
  deleted_at: string | null;
}): TodoListRow {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    archived: Boolean(row.archived),
    clientUpdatedAtMs: row.client_updated_at_ms,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapTodoItemRow(row: {
  id: string;
  list_id: string;
  parent_id: string | null;
  title: string;
  note: string;
  status: string;
  priority: number;
  due_at_local: string | null;
  completed_at_local: string | null;
  sort_order: number;
  tags_json: string;
  is_recurring: number;
  rrule: string | null;
  dtstart_local: string | null;
  tzid: string;
  reminders_json: string;
  client_updated_at_ms: number;
  updated_at: string;
  deleted_at: string | null;
}): TodoItemRow {
  const tags = parseJsonArray(row.tags_json).filter((x) => typeof x === 'string') as string[];
  const reminders = parseJsonArray(row.reminders_json);
  return {
    id: row.id,
    listId: row.list_id,
    parentId: row.parent_id,
    title: row.title,
    note: row.note,
    status: row.status,
    priority: row.priority,
    dueAtLocal: row.due_at_local,
    completedAtLocal: row.completed_at_local,
    sortOrder: row.sort_order,
    tags,
    isRecurring: Boolean(row.is_recurring),
    rrule: row.rrule,
    dtstartLocal: row.dtstart_local,
    tzid: row.tzid,
    reminders,
    clientUpdatedAtMs: row.client_updated_at_ms,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function createTodoRepo(db: Database.Database, deps: TodoRepoDeps = {}) {
  function getTodoListClientUpdatedAtMs(id: string): number | null {
    const row = db
      .prepare('SELECT client_updated_at_ms AS ms FROM todo_lists WHERE id = ?')
      .get(id) as { ms: number } | undefined;
    return row ? Number(row.ms) : null;
  }

  function getTodoItemClientUpdatedAtMs(id: string): number | null {
    const row = db
      .prepare('SELECT client_updated_at_ms AS ms FROM todo_items WHERE id = ?')
      .get(id) as { ms: number } | undefined;
    return row ? Number(row.ms) : null;
  }

  function bumpForTodoList(id: string, nowMs: number): number {
    return bumpClientUpdatedAtMs({ lastMs: getTodoListClientUpdatedAtMs(id), nowMs });
  }

  function bumpForTodoItem(id: string, nowMs: number): number {
    return bumpClientUpdatedAtMs({ lastMs: getTodoItemClientUpdatedAtMs(id), nowMs });
  }

  function readTodoList(id: string): TodoListRow | null {
    const row = db
      .prepare(
        `
          SELECT id, name, color, sort_order, archived, client_updated_at_ms, updated_at, deleted_at
          FROM todo_lists
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: string;
          name: string;
          color: string | null;
          sort_order: number;
          archived: number;
          client_updated_at_ms: number;
          updated_at: string;
          deleted_at: string | null;
        }
      | undefined;
    return row ? mapTodoListRow(row) : null;
  }

  function readTodoItem(id: string): TodoItemRow | null {
    const row = db
      .prepare(
        `
          SELECT
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
          FROM todo_items
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: string;
          list_id: string;
          parent_id: string | null;
          title: string;
          note: string;
          status: string;
          priority: number;
          due_at_local: string | null;
          completed_at_local: string | null;
          sort_order: number;
          tags_json: string;
          is_recurring: number;
          rrule: string | null;
          dtstart_local: string | null;
          tzid: string;
          reminders_json: string;
          client_updated_at_ms: number;
          updated_at: string;
          deleted_at: string | null;
        }
      | undefined;
    return row ? mapTodoItemRow(row) : null;
  }

  function listTodoLists(args: ListTodoListsArgs = {}): TodoListRow[] {
    const includeArchived = args.includeArchived ?? false;
    const includeDeleted = args.includeDeleted ?? false;
    const limit = args.limit ?? 200;
    const offset = args.offset ?? 0;

    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
      throw new Error('limit 不合法');
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('offset 不合法');
    }

    const rows = db
      .prepare(
        `
          SELECT id, name, color, sort_order, archived, client_updated_at_ms, updated_at, deleted_at
          FROM todo_lists
          WHERE
            (@include_archived = 1 OR archived = 0)
            AND (@include_deleted = 1 OR deleted_at IS NULL)
          ORDER BY sort_order ASC, client_updated_at_ms DESC
          LIMIT @limit OFFSET @offset
        `
      )
      .all({
        include_archived: includeArchived ? 1 : 0,
        include_deleted: includeDeleted ? 1 : 0,
        limit,
        offset,
      }) as Array<{
      id: string;
      name: string;
      color: string | null;
      sort_order: number;
      archived: number;
      client_updated_at_ms: number;
      updated_at: string;
      deleted_at: string | null;
    }>;

    return rows.map(mapTodoListRow);
  }

  function listTodoItems(args: ListTodoItemsArgs = {}): TodoItemRow[] {
    const includeArchivedLists = args.includeArchivedLists ?? false;
    const includeDeleted = args.includeDeleted ?? false;
    const limit = args.limit ?? 200;
    const offset = args.offset ?? 0;

    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
      throw new Error('limit 不合法');
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('offset 不合法');
    }

    const rows = db
      .prepare(
        `
          SELECT
            i.id,
            i.list_id,
            i.parent_id,
            i.title,
            i.note,
            i.status,
            i.priority,
            i.due_at_local,
            i.completed_at_local,
            i.sort_order,
            i.tags_json,
            i.is_recurring,
            i.rrule,
            i.dtstart_local,
            i.tzid,
            i.reminders_json,
            i.client_updated_at_ms,
            i.updated_at,
            i.deleted_at
          FROM todo_items i
          JOIN todo_lists l ON l.id = i.list_id
          WHERE
            (@list_id IS NULL OR i.list_id = @list_id)
            AND (@status IS NULL OR i.status = @status)
            AND (@include_archived_lists = 1 OR l.archived = 0)
            AND (@include_deleted = 1 OR i.deleted_at IS NULL)
            AND (
              @tag IS NULL
              OR EXISTS (
                SELECT 1
                FROM json_each(i.tags_json)
                WHERE value = @tag
              )
            )
          ORDER BY i.sort_order ASC, i.client_updated_at_ms DESC
          LIMIT @limit OFFSET @offset
        `
      )
      .all({
        list_id: args.listId ?? null,
        status: args.status ?? null,
        tag: args.tag ?? null,
        include_archived_lists: includeArchivedLists ? 1 : 0,
        include_deleted: includeDeleted ? 1 : 0,
        limit,
        offset,
      }) as Array<{
      id: string;
      list_id: string;
      parent_id: string | null;
      title: string;
      note: string;
      status: string;
      priority: number;
      due_at_local: string | null;
      completed_at_local: string | null;
      sort_order: number;
      tags_json: string;
      is_recurring: number;
      rrule: string | null;
      dtstart_local: string | null;
      tzid: string;
      reminders_json: string;
      client_updated_at_ms: number;
      updated_at: string;
      deleted_at: string | null;
    }>;

    return rows.map(mapTodoItemRow);
  }

  function upsertTodoList(args: UpsertTodoListArgs): { id: string } {
    if (!args.name || args.name.trim().length === 0) {
      throw new Error('name 不能为空');
    }

    const nowMs = safeNowMs(deps);
    const updatedAt = new Date(nowMs).toISOString();
    const id = args.id ?? createId(deps);
    const sortOrder = args.sortOrder ?? 0;
    const archived = args.archived ?? false;
    const color = args.color ?? null;

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoList(id, nowMs);

      db.prepare(
        `
          INSERT INTO todo_lists (
            id, name, color, sort_order, archived, client_updated_at_ms, updated_at, deleted_at
          ) VALUES (
            @id, @name, @color, @sort_order, @archived, @client_updated_at_ms, @updated_at, NULL
          )
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            color = excluded.color,
            sort_order = excluded.sort_order,
            archived = excluded.archived,
            client_updated_at_ms = excluded.client_updated_at_ms,
            updated_at = excluded.updated_at,
            deleted_at = NULL
        `
      ).run({
        id,
        name: args.name,
        color,
        sort_order: sortOrder,
        archived: toBoolInt(archived),
        client_updated_at_ms: clientUpdatedAtMs,
        updated_at: updatedAt,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoList,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          name: args.name,
          color,
          sort_order: sortOrder,
          archived,
        },
        nowMs,
      });
    });

    return { id };
  }

  function patchTodoList(args: PatchTodoListArgs): void {
    if (!args.id || args.id.trim().length === 0) {
      throw new Error('id 不能为空');
    }

    const existing = readTodoList(args.id);
    if (!existing) {
      throw new Error('todo list 不存在');
    }

    const nowMs = safeNowMs(deps);
    const updatedAt = new Date(nowMs).toISOString();
    const name = args.name ?? existing.name;
    const color = args.color !== undefined ? args.color : existing.color;
    const sortOrder = args.sortOrder ?? existing.sortOrder;
    const archived = args.archived ?? existing.archived;

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoList(args.id, nowMs);

      db.prepare(
        `
          UPDATE todo_lists
          SET
            name = @name,
            color = @color,
            sort_order = @sort_order,
            archived = @archived,
            client_updated_at_ms = @client_updated_at_ms,
            updated_at = @updated_at
          WHERE id = @id
        `
      ).run({
        id: args.id,
        name,
        color,
        sort_order: sortOrder,
        archived: toBoolInt(archived),
        client_updated_at_ms: clientUpdatedAtMs,
        updated_at: updatedAt,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoList,
        op: FLOW_OP.upsert,
        entityId: args.id,
        clientUpdatedAtMs,
        data: {
          name,
          color,
          sort_order: sortOrder,
          archived,
        },
        nowMs,
      });
    });
  }

  function deleteTodoList(id: string): void {
    if (!id || id.trim().length === 0) {
      throw new Error('id 不能为空');
    }

    const nowMs = safeNowMs(deps);
    const deletedAt = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoList(id, nowMs);
      db.prepare(
        `
          UPDATE todo_lists
          SET deleted_at = @deleted_at,
              updated_at = @updated_at,
              client_updated_at_ms = @client_updated_at_ms
          WHERE id = @id
        `
      ).run({
        id,
        deleted_at: deletedAt,
        updated_at: deletedAt,
        client_updated_at_ms: clientUpdatedAtMs,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoList,
        op: FLOW_OP.delete,
        entityId: id,
        clientUpdatedAtMs,
        nowMs,
      });
    });
  }

  function restoreTodoList(id: string): void {
    if (!id || id.trim().length === 0) {
      throw new Error('id 不能为空');
    }

    const existing = readTodoList(id);
    if (!existing) {
      throw new Error('todo list 不存在');
    }

    const nowMs = safeNowMs(deps);
    const updatedAt = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoList(id, nowMs);
      db.prepare(
        `
          UPDATE todo_lists
          SET deleted_at = NULL,
              updated_at = @updated_at,
              client_updated_at_ms = @client_updated_at_ms
          WHERE id = @id
        `
      ).run({
        id,
        updated_at: updatedAt,
        client_updated_at_ms: clientUpdatedAtMs,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoList,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          name: existing.name,
          color: existing.color,
          sort_order: existing.sortOrder,
          archived: existing.archived,
        },
        nowMs,
      });
    });
  }

  function upsertTodoItem(args: UpsertTodoItemArgs): { id: string } {
    if (!args.listId || args.listId.trim().length === 0) {
      throw new Error('listId 不能为空');
    }
    if (!args.title || args.title.trim().length === 0) {
      throw new Error('title 不能为空');
    }

    const nowMs = safeNowMs(deps);
    const updatedAt = new Date(nowMs).toISOString();
    const id = args.id ?? createId(deps);

    const note = args.note ?? '';
    const status = args.status ?? 'todo';
    const priority = args.priority ?? 0;
    const sortOrder = args.sortOrder ?? 0;
    const tags = args.tags ?? [];
    const isRecurring = args.isRecurring ?? false;
    const tzid = args.tzid ?? defaultTzid(deps);
    const reminders = args.reminders ?? [];

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoItem(id, nowMs);

      db.prepare(
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
            NULL
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
            deleted_at = NULL
        `
      ).run({
        id,
        list_id: args.listId,
        parent_id: args.parentId ?? null,
        title: args.title,
        note,
        status,
        priority,
        due_at_local: args.dueAtLocal ?? null,
        completed_at_local: args.completedAtLocal ?? null,
        sort_order: sortOrder,
        tags_json: stringifyJson(tags),
        is_recurring: toBoolInt(isRecurring),
        rrule: args.rrule ?? null,
        dtstart_local: args.dtstartLocal ?? null,
        tzid,
        reminders_json: stringifyJson(reminders),
        client_updated_at_ms: clientUpdatedAtMs,
        updated_at: updatedAt,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoItem,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          list_id: args.listId,
          parent_id: args.parentId ?? null,
          title: args.title,
          note,
          status,
          priority,
          due_at_local: args.dueAtLocal ?? null,
          completed_at_local: args.completedAtLocal ?? null,
          sort_order: sortOrder,
          tags,
          is_recurring: isRecurring,
          rrule: args.rrule ?? null,
          dtstart_local: args.dtstartLocal ?? null,
          tzid,
          reminders,
        },
        nowMs,
      });
    });

    return { id };
  }

  function patchTodoItem(args: PatchTodoItemArgs): void {
    if (!args.id || args.id.trim().length === 0) {
      throw new Error('id 不能为空');
    }

    const existing = readTodoItem(args.id);
    if (!existing) {
      throw new Error('todo item 不存在');
    }

    const nowMs = safeNowMs(deps);
    const updatedAt = new Date(nowMs).toISOString();

    const listId = args.listId ?? existing.listId;
    const parentId = args.parentId !== undefined ? args.parentId : existing.parentId;
    const title = args.title ?? existing.title;
    const note = args.note ?? existing.note;
    const status = args.status ?? existing.status;
    const priority = args.priority ?? existing.priority;
    const dueAtLocal = args.dueAtLocal !== undefined ? args.dueAtLocal : existing.dueAtLocal;
    const completedAtLocal =
      args.completedAtLocal !== undefined ? args.completedAtLocal : existing.completedAtLocal;
    const sortOrder = args.sortOrder ?? existing.sortOrder;
    const tags = args.tags ?? existing.tags;
    const isRecurring = args.isRecurring ?? existing.isRecurring;
    const rrule = args.rrule !== undefined ? args.rrule : existing.rrule;
    const dtstartLocal =
      args.dtstartLocal !== undefined ? args.dtstartLocal : existing.dtstartLocal;
    const tzid = args.tzid ?? existing.tzid;
    const reminders = args.reminders ?? existing.reminders;

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoItem(args.id, nowMs);

      db.prepare(
        `
          UPDATE todo_items
          SET
            list_id = @list_id,
            parent_id = @parent_id,
            title = @title,
            note = @note,
            status = @status,
            priority = @priority,
            due_at_local = @due_at_local,
            completed_at_local = @completed_at_local,
            sort_order = @sort_order,
            tags_json = @tags_json,
            is_recurring = @is_recurring,
            rrule = @rrule,
            dtstart_local = @dtstart_local,
            tzid = @tzid,
            reminders_json = @reminders_json,
            client_updated_at_ms = @client_updated_at_ms,
            updated_at = @updated_at
          WHERE id = @id
        `
      ).run({
        id: args.id,
        list_id: listId,
        parent_id: parentId,
        title,
        note,
        status,
        priority,
        due_at_local: dueAtLocal,
        completed_at_local: completedAtLocal,
        sort_order: sortOrder,
        tags_json: stringifyJson(tags),
        is_recurring: toBoolInt(isRecurring),
        rrule,
        dtstart_local: dtstartLocal,
        tzid,
        reminders_json: stringifyJson(reminders),
        client_updated_at_ms: clientUpdatedAtMs,
        updated_at: updatedAt,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoItem,
        op: FLOW_OP.upsert,
        entityId: args.id,
        clientUpdatedAtMs,
        data: {
          list_id: listId,
          parent_id: parentId,
          title,
          note,
          status,
          priority,
          due_at_local: dueAtLocal,
          completed_at_local: completedAtLocal,
          sort_order: sortOrder,
          tags,
          is_recurring: isRecurring,
          rrule,
          dtstart_local: dtstartLocal,
          tzid,
          reminders,
        },
        nowMs,
      });
    });
  }

  function deleteTodoItem(id: string): void {
    if (!id || id.trim().length === 0) {
      throw new Error('id 不能为空');
    }

    const nowMs = safeNowMs(deps);
    const deletedAt = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoItem(id, nowMs);
      db.prepare(
        `
          UPDATE todo_items
          SET deleted_at = @deleted_at,
              updated_at = @updated_at,
              client_updated_at_ms = @client_updated_at_ms
          WHERE id = @id
        `
      ).run({
        id,
        deleted_at: deletedAt,
        updated_at: deletedAt,
        client_updated_at_ms: clientUpdatedAtMs,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoItem,
        op: FLOW_OP.delete,
        entityId: id,
        clientUpdatedAtMs,
        nowMs,
      });
    });
  }

  function restoreTodoItem(id: string): void {
    if (!id || id.trim().length === 0) {
      throw new Error('id 不能为空');
    }
    const existing = readTodoItem(id);
    if (!existing) {
      throw new Error('todo item 不存在');
    }

    const nowMs = safeNowMs(deps);
    const updatedAt = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForTodoItem(id, nowMs);
      db.prepare(
        `
          UPDATE todo_items
          SET deleted_at = NULL,
              updated_at = @updated_at,
              client_updated_at_ms = @client_updated_at_ms
          WHERE id = @id
        `
      ).run({
        id,
        updated_at: updatedAt,
        client_updated_at_ms: clientUpdatedAtMs,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoItem,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          list_id: existing.listId,
          parent_id: existing.parentId,
          title: existing.title,
          note: existing.note,
          status: existing.status,
          priority: existing.priority,
          due_at_local: existing.dueAtLocal,
          completed_at_local: existing.completedAtLocal,
          sort_order: existing.sortOrder,
          tags: existing.tags,
          is_recurring: existing.isRecurring,
          rrule: existing.rrule,
          dtstart_local: existing.dtstartLocal,
          tzid: existing.tzid,
          reminders: existing.reminders,
        },
        nowMs,
      });
    });
  }

  function getTodoItem(id: string): TodoItemRow | null {
    if (!id || id.trim().length === 0) {
      throw new Error('id 不能为空');
    }
    return readTodoItem(id);
  }

  function hardDeleteTodoItem(id: string): void {
    if (!id || id.trim().length === 0) {
      throw new Error('id 不能为空');
    }
    const existing = readTodoItem(id);
    if (!existing) {
      throw new Error('todo item 不存在');
    }
    if (existing.deletedAt === null) {
      throw new Error('只能彻底删除回收站中的 todo item');
    }

    withImmediateTransaction(db, () => {
      db.prepare('DELETE FROM todo_occurrences WHERE item_id = ?').run(id);
      db.prepare('DELETE FROM todo_items WHERE id = ?').run(id);
    });
  }

  return {
    listTodoLists,
    listTodoItems,
    upsertTodoList,
    patchTodoList,
    deleteTodoList,
    restoreTodoList,
    upsertTodoItem,
    patchTodoItem,
    deleteTodoItem,
    restoreTodoItem,
    getTodoItem,
    hardDeleteTodoItem,
  };
}
