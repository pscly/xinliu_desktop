// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { createTodoRepo } from './todoRepo';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-todo-repo-'));
}

function countOutbox(db: Database.Database): number {
  return Number(
    (db.prepare('SELECT COUNT(*) AS c FROM outbox_mutations').get() as { c: number }).c
  );
}

function lastOutbox(db: Database.Database): {
  resource: string;
  op: string;
  entity_id: string;
  data_json: string;
} {
  const row = db
    .prepare(
      `
        SELECT resource, op, entity_id, data_json
        FROM outbox_mutations
        ORDER BY created_at_ms DESC, rowid DESC
        LIMIT 1
      `
    )
    .get() as
    | {
        resource: string;
        op: string;
        entity_id: string;
        data_json: string;
      }
    | undefined;
  if (!row) {
    throw new Error('outbox 为空');
  }
  return row;
}

function listCount(db: Database.Database): number {
  return Number(
    (db.prepare('SELECT COUNT(*) AS c FROM todo_lists').get() as { c: number }).c
  );
}

function itemCount(db: Database.Database): number {
  return Number(
    (db.prepare('SELECT COUNT(*) AS c FROM todo_items').get() as { c: number }).c
  );
}

describe('src/main/todo/todoRepo', () => {
  it('写入 Todo 会插入 outbox（同一事务）：upsert list + upsert item', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const repo = createTodoRepo(db, {
        nowMs: () => 1700000000000,
        tzid: () => 'Asia/Shanghai',
        randomUUID: cryptoSeq(),
      });

      expect(listCount(db)).toBe(0);
      expect(itemCount(db)).toBe(0);
      expect(countOutbox(db)).toBe(0);

      const { id: listId } = repo.upsertTodoList({
        name: 'Inbox',
        color: null,
        sortOrder: 1,
        archived: false,
      });
      expect(listId).toBe('uuid_1');
      expect(listCount(db)).toBe(1);
      expect(countOutbox(db)).toBe(1);

      const ob1 = lastOutbox(db);
      expect(ob1.resource).toBe('todo_list');
      expect(ob1.op).toBe('upsert');
      expect(ob1.entity_id).toBe(listId);
      const d1 = JSON.parse(ob1.data_json) as Record<string, unknown>;
      expect(d1.name).toBe('Inbox');

      const { id: itemId } = repo.upsertTodoItem({
        listId,
        title: 'buy milk',
        tags: ['home'],
      });
      expect(itemId).toBe('uuid_2');
      expect(itemCount(db)).toBe(1);
      expect(countOutbox(db)).toBe(2);

      const ob2 = lastOutbox(db);
      expect(ob2.resource).toBe('todo_item');
      expect(ob2.op).toBe('upsert');
      expect(ob2.entity_id).toBe(itemId);
      const d2 = JSON.parse(ob2.data_json) as Record<string, unknown>;
      expect(d2.list_id).toBe(listId);
    } finally {
      db.close();
    }
  });

  it('deleted_at 软删/恢复语义：delete item 会 tombstone，restore 会清空 deleted_at，并各自生成 outbox', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      let now = 1700000000000;
      const repo = createTodoRepo(db, {
        nowMs: () => now,
        tzid: () => 'Asia/Shanghai',
        randomUUID: () => 'uuid_2',
      });

      const { id: listId } = repo.upsertTodoList({ name: 'Inbox' });
      const { id: itemId } = repo.upsertTodoItem({ listId, title: 'x' });
      expect(countOutbox(db)).toBe(2);

      now += 1;
      repo.deleteTodoItem(itemId);
      expect(countOutbox(db)).toBe(3);
      const deletedAt = (db
        .prepare('SELECT deleted_at AS d FROM todo_items WHERE id = ?')
        .get(itemId) as { d: string | null }).d;
      expect(typeof deletedAt).toBe('string');

      now += 1;
      repo.restoreTodoItem(itemId);
      expect(countOutbox(db)).toBe(4);
      const restoredAt = (db
        .prepare('SELECT deleted_at AS d FROM todo_items WHERE id = ?')
        .get(itemId) as { d: string | null }).d;
      expect(restoredAt).toBeNull();

      const items = repo.listTodoItems({ includeDeleted: false, limit: 10, offset: 0 });
      expect(items.length).toBe(1);
      expect(items[0]?.id).toBe(itemId);
    } finally {
      db.close();
    }
  });

  it('读列表为分页查询：limit/offset 生效，且默认不包含 deleted', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);
      let now = 1700000000000;
      const repo = createTodoRepo(db, {
        nowMs: () => now,
        tzid: () => 'Asia/Shanghai',
        randomUUID: cryptoSeq(),
      });

      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        now += 1;
        const { id } = repo.upsertTodoList({ name: `L${i}`, sortOrder: i });
        ids.push(id);
      }

      now += 1;
      repo.deleteTodoList(ids[1] ?? '');

      const page1 = repo.listTodoLists({ limit: 1, offset: 0 });
      expect(page1.length).toBe(1);

      const page2 = repo.listTodoLists({ limit: 2, offset: 1 });
      expect(page2.length).toBe(1);
      expect(page2[0]?.id).toBe(ids[2]);

      const withDeleted = repo.listTodoLists({ includeDeleted: true, limit: 10, offset: 0 });
      expect(withDeleted.length).toBe(3);
    } finally {
      db.close();
    }
  });
});

function cryptoSeq(): () => string {
  let i = 0;
  return () => {
    i += 1;
    return `uuid_${i}`;
  };
}
