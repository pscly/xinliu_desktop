// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import {
  listFlowConflicts,
  resolveFlowConflictApplyServer,
  resolveFlowConflictForceOverride,
  resolveFlowConflictKeepLocalCopy,
} from './flowConflicts';
import { FLOW_OP, FLOW_RESOURCE, OUTBOX_STATUS, enqueueFlowOutboxMutation } from '../sync/outbox';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-flow-conflicts-'));
}

function prepareTodoConflict(db: Database.Database, args: { nowMs: number; itemId: string }) {
  db.prepare(
    `INSERT INTO todo_lists(
      id,
      name,
      color,
      sort_order,
      archived,
      client_updated_at_ms,
      updated_at,
      deleted_at
    ) VALUES(
      @id,
      'Inbox',
      NULL,
      0,
      0,
      @client_updated_at_ms,
      @updated_at,
      NULL
    )`
  ).run({
    id: 'list_1',
    client_updated_at_ms: args.nowMs,
    updated_at: new Date(args.nowMs).toISOString(),
  });

  db.prepare(
    `INSERT INTO todo_items(
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
    ) VALUES(
      @id,
      'list_1',
      NULL,
      'local-title',
      'local-note',
      'todo',
      0,
      NULL,
      NULL,
      0,
      '[]',
      0,
      NULL,
      NULL,
      'Asia/Shanghai',
      '[]',
      @client_updated_at_ms,
      @updated_at,
      NULL
    )`
  ).run({
    id: args.itemId,
    client_updated_at_ms: args.nowMs,
    updated_at: new Date(args.nowMs).toISOString(),
  });

  const outboxId = enqueueFlowOutboxMutation(db, {
    resource: FLOW_RESOURCE.todoItem,
    op: FLOW_OP.upsert,
    entityId: args.itemId,
    clientUpdatedAtMs: args.nowMs,
    data: {
      id: args.itemId,
      list_id: 'list_1',
      title: 'local-title',
      note: 'local-note',
      status: 'todo',
      priority: 0,
      sort_order: 0,
      tags: [],
      is_recurring: false,
      tzid: 'Asia/Shanghai',
      reminders: [],
      client_updated_at_ms: args.nowMs,
      updated_at: new Date(args.nowMs).toISOString(),
      deleted_at: null,
    },
    nowMs: args.nowMs,
  }).id;

  db.prepare(
    `UPDATE outbox_mutations
      SET
        status = @status,
        last_error_code = 'conflict',
        last_error_message = @last_error_message,
        updated_at_ms = @updated_at_ms
      WHERE id = @id`
  ).run({
    id: outboxId,
    status: OUTBOX_STATUS.rejectedConflict,
    last_error_message: JSON.stringify({
      server: {
        id: args.itemId,
        list_id: 'list_1',
        title: 'server-title',
        note: 'server-note',
        status: 'done',
        priority: 1,
        sort_order: 3,
        tags: ['srv'],
        is_recurring: false,
        tzid: 'Asia/Shanghai',
        reminders: [],
        client_updated_at_ms: args.nowMs + 200,
        updated_at: new Date(args.nowMs + 200).toISOString(),
        deleted_at: null,
      },
    }),
    updated_at_ms: args.nowMs,
  });

  return { outboxId };
}

describe('src/main/flow/flowConflicts', () => {
  it('listFlowConflicts: 返回 REJECTED_CONFLICT 列表并解析 server snapshot', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      const nowMs = 1700000000000;
      const { outboxId } = prepareTodoConflict(db, { nowMs, itemId: 'todo_1' });

      const items = listFlowConflicts(db);
      expect(items).toHaveLength(1);
      expect(items[0]?.outboxId).toBe(outboxId);
      expect(items[0]?.resource).toBe('todo_item');
      expect(items[0]?.serverSnapshot).toMatchObject({ title: 'server-title' });
    } finally {
      db.close();
    }
  });

  it('resolveFlowConflictApplyServer: 应用 server snapshot 并把 outbox 标记为 APPLIED', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      const nowMs = 1700000000000;
      const { outboxId } = prepareTodoConflict(db, { nowMs, itemId: 'todo_2' });

      resolveFlowConflictApplyServer(db, {
        outboxId,
        nowMs: () => nowMs + 10,
      });

      const outbox = db
        .prepare('SELECT status, last_error_message FROM outbox_mutations WHERE id = ?')
        .get(outboxId) as { status: string; last_error_message: string | null };
      expect(outbox.status).toBe(OUTBOX_STATUS.applied);
      expect(outbox.last_error_message).toBeNull();

      const todo = db
        .prepare('SELECT title, status FROM todo_items WHERE id = ?')
        .get('todo_2') as { title: string; status: string };
      expect(todo.title).toBe('server-title');
      expect(todo.status).toBe('done');
    } finally {
      db.close();
    }
  });

  it('resolveFlowConflictKeepLocalCopy: 复制本地数据为新实体并入队，同时原冲突应用 server', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      const nowMs = 1700000000000;
      const { outboxId } = prepareTodoConflict(db, { nowMs, itemId: 'todo_3' });

      const resolved = resolveFlowConflictKeepLocalCopy(db, {
        outboxId,
        nowMs: () => nowMs + 20,
        randomUUID: () => 'copy-id-1',
      });

      expect(resolved.newEntityId).toBe('copy-id-1');

      const originalOutbox = db
        .prepare('SELECT status FROM outbox_mutations WHERE id = ?')
        .get(outboxId) as { status: string };
      expect(originalOutbox.status).toBe(OUTBOX_STATUS.applied);

      const copiedOutbox = db
        .prepare(
          `SELECT status, resource, op FROM outbox_mutations
            WHERE entity_id = @entity_id AND resource = @resource
            ORDER BY created_at_ms DESC
            LIMIT 1`
        )
        .get({
          entity_id: 'copy-id-1',
          resource: FLOW_RESOURCE.todoItem,
        }) as { status: string; resource: string; op: string };
      expect(copiedOutbox.status).toBe(OUTBOX_STATUS.pending);
      expect(copiedOutbox.op).toBe('upsert');

      const copiedTodo = db
        .prepare('SELECT id, title FROM todo_items WHERE id = ?')
        .get('copy-id-1') as { id: string; title: string };
      expect(copiedTodo.id).toBe('copy-id-1');
      expect(copiedTodo.title).toBe('local-title');

      const originalTodo = db
        .prepare('SELECT id, title FROM todo_items WHERE id = ?')
        .get('todo_3') as { id: string; title: string };
      expect(originalTodo.title).toBe('server-title');
    } finally {
      db.close();
    }
  });

  it('resolveFlowConflictForceOverride: 重置 outbox 为 PENDING 且 client_updated_at_ms 大于 server', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      const nowMs = 1700000000000;
      const { outboxId } = prepareTodoConflict(db, { nowMs, itemId: 'todo_4' });

      const result = resolveFlowConflictForceOverride(db, {
        outboxId,
        nowMs: () => nowMs + 30,
      });

      expect(result.nextClientUpdatedAtMs).toBe(nowMs + 201);

      const row = db
        .prepare(
          `SELECT
            status,
            attempt,
            client_updated_at_ms,
            last_error_code,
            last_error_message,
            data_json
          FROM outbox_mutations
          WHERE id = ?`
        )
        .get(outboxId) as {
        status: string;
        attempt: number;
        client_updated_at_ms: number;
        last_error_code: string | null;
        last_error_message: string | null;
        data_json: string;
      };

      expect(row.status).toBe(OUTBOX_STATUS.pending);
      expect(row.attempt).toBe(0);
      expect(row.client_updated_at_ms).toBe(nowMs + 201);
      expect(row.last_error_code).toBeNull();
      expect(row.last_error_message).toBeNull();
      expect(JSON.parse(row.data_json).client_updated_at_ms).toBe(nowMs + 201);
    } finally {
      db.close();
    }
  });
});
