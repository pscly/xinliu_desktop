// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import {
  FLOW_OP,
  FLOW_RESOURCE,
  OUTBOX_STATUS,
  bumpClientUpdatedAtMs,
  enqueueFlowOutboxMutation,
  withImmediateTransaction,
} from './outbox';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-outbox-'));
}

function getOutboxRow(db: Database.Database, id: string): {
  id: string;
  resource: string;
  op: string;
  entity_id: string;
  client_updated_at_ms: number;
  data_json: string;
  status: string;
} {
  const row = db
    .prepare(
      `
        SELECT id, resource, op, entity_id, client_updated_at_ms, data_json, status
        FROM outbox_mutations
        WHERE id = ?
      `
    )
    .get(id) as
    | {
        id: string;
        resource: string;
        op: string;
        entity_id: string;
        client_updated_at_ms: number;
        data_json: string;
        status: string;
      }
    | undefined;

  if (!row) {
    throw new Error('outbox row 不存在');
  }
  return row;
}

describe('src/main/sync/outbox', () => {
  it('bumpClientUpdatedAtMs：max(now_ms, last_ms + 1)', () => {
    expect(bumpClientUpdatedAtMs({ lastMs: undefined, nowMs: 1000 })).toBe(1000);
    expect(bumpClientUpdatedAtMs({ lastMs: null, nowMs: 1000 })).toBe(1000);
    expect(bumpClientUpdatedAtMs({ lastMs: 1000, nowMs: 900 })).toBe(1001);
    expect(bumpClientUpdatedAtMs({ lastMs: 1000, nowMs: 1000 })).toBe(1001);
    expect(bumpClientUpdatedAtMs({ lastMs: 1000, nowMs: 1001 })).toBe(1001);
    expect(bumpClientUpdatedAtMs({ lastMs: 1000, nowMs: 2000 })).toBe(2000);
  });

  it('delete：即使本地已 tombstone 仍必须入队 op=delete', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      const listId = 'list_1';
      const deletedAt = new Date(nowMs).toISOString();

      db.prepare(
        `
          INSERT INTO todo_lists (
            id, name, color, sort_order, archived, client_updated_at_ms, updated_at, deleted_at
          ) VALUES (
            @id, @name, @color, @sort_order, @archived, @client_updated_at_ms, @updated_at, @deleted_at
          )
        `
      ).run({
        id: listId,
        name: 'x',
        color: null,
        sort_order: 0,
        archived: 0,
        client_updated_at_ms: 1000,
        updated_at: deletedAt,
        deleted_at: deletedAt,
      });

      const bumped = bumpClientUpdatedAtMs({ lastMs: 1000, nowMs });
      const { id } = enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoList,
        op: FLOW_OP.delete,
        entityId: listId,
        clientUpdatedAtMs: bumped,
        nowMs,
      });

      const row = getOutboxRow(db, id);
      expect(row.resource).toBe('todo_list');
      expect(row.op).toBe('delete');
      expect(row.entity_id).toBe(listId);
      expect(row.client_updated_at_ms).toBe(bumped);
      expect(row.data_json).toBe('{}');
      expect(row.status).toBe(OUTBOX_STATUS.pending);
    } finally {
      db.close();
    }
  });

  it('同一事务：业务表写入 + outbox 入队应一起回滚', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      const updatedAt = new Date(nowMs).toISOString();

      try {
        withImmediateTransaction(db, () => {
          db.prepare(
            `
              INSERT INTO todo_lists (
                id, name, color, sort_order, archived, client_updated_at_ms, updated_at, deleted_at
              ) VALUES (
                @id, @name, @color, @sort_order, @archived, @client_updated_at_ms, @updated_at, @deleted_at
              )
            `
          ).run({
            id: 'list_tx',
            name: 'tx',
            color: null,
            sort_order: 0,
            archived: 0,
            client_updated_at_ms: 1,
            updated_at: updatedAt,
            deleted_at: null,
          });

          enqueueFlowOutboxMutation(db, {
            resource: FLOW_RESOURCE.todoList,
            op: FLOW_OP.upsert,
            entityId: 'list_tx',
            clientUpdatedAtMs: 1,
            data: { name: 'tx' },
            nowMs,
          });

          throw new Error('boom');
        });
      } catch {
      }

      const todoListCount = Number(
        (db.prepare('SELECT COUNT(*) AS c FROM todo_lists').get() as { c: number }).c
      );
      const outboxCount = Number(
        (db.prepare('SELECT COUNT(*) AS c FROM outbox_mutations').get() as { c: number }).c
      );

      expect(todoListCount).toBe(0);
      expect(outboxCount).toBe(0);
    } finally {
      db.close();
    }
  });
});
