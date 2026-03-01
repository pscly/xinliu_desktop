// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { COLLECTION_REF_TYPE, createCollectionsRepo } from './collectionsRepo';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-collections-repo-'));
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

describe('src/main/collections/collectionsRepo', () => {
  it('写入会生成 outbox（resource=collection_item）', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);
      const repo = createCollectionsRepo(db, {
        nowMs: () => 1700000000000,
        randomUUID: cryptoSeq(),
      });

      const { id } = repo.createFolder({ name: 'root', parentId: null, sortOrder: 10 });
      expect(id).toBe('uuid_1');
      expect(countOutbox(db)).toBe(1);
      const ob = lastOutbox(db);
      expect(ob.resource).toBe('collection_item');
      expect(ob.op).toBe('upsert');
      const data = JSON.parse(ob.data_json) as Record<string, unknown>;
      expect(data.item_type).toBe('folder');
      expect(data.name).toBe('root');
    } finally {
      db.close();
    }
  });

  it('防环：禁止把父节点移动到其子孙节点下', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);
      const repo = createCollectionsRepo(db, {
        nowMs: () => 1700000000000,
        randomUUID: cryptoSeq(),
      });

      const { id: rootId } = repo.createFolder({ name: 'A', parentId: null });
      const { id: childId } = repo.createFolder({ name: 'B', parentId: rootId });
      repo.createNoteRef({
        parentId: childId,
        refType: COLLECTION_REF_TYPE.flowNote,
        refId: 'note_1',
      });

      expect(() => repo.patchCollectionItem({ id: rootId, parentId: childId })).toThrow();
    } finally {
      db.close();
    }
  });

  it('listCollectionItems: parentId=null 应返回 root 项；undefined 表示不过滤 parent', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);
      const repo = createCollectionsRepo(db, {
        nowMs: () => 1700000000100,
        randomUUID: cryptoSeq(),
      });

      const { id: rootA } = repo.createFolder({ name: 'Root A', parentId: null, sortOrder: 1 });
      const { id: rootB } = repo.createFolder({ name: 'Root B', parentId: null, sortOrder: 2 });
      const { id: childA } = repo.createFolder({ name: 'Child A', parentId: rootA, sortOrder: 1 });

      const roots = repo.listCollectionItems({
        parentId: null,
        includeDeleted: false,
        limit: 20,
        offset: 0,
      });
      expect(roots.map((item) => item.id)).toEqual([rootA, rootB]);

      const children = repo.listCollectionItems({
        parentId: rootA,
        includeDeleted: false,
        limit: 20,
        offset: 0,
      });
      expect(children.map((item) => item.id)).toEqual([childA]);

      const allWithoutParentFilter = repo.listCollectionItems({
        includeDeleted: false,
        limit: 20,
        offset: 0,
      });
      expect(allWithoutParentFilter.map((item) => item.id)).toEqual([rootA, childA, rootB]);
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
