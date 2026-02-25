// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations';
import { openSqliteDatabase } from './sqlite';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-flow-schema-'));
}

function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function listColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return rows.map((r) => r.name);
}

describe('src/main/db/flow schema', () => {
  it('迁移后必须存在 Flow 领域 4 张表（todo + collections）', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);
      const tables = listTables(db);

      expect(tables).toContain('todo_lists');
      expect(tables).toContain('todo_items');
      expect(tables).toContain('todo_occurrences');
      expect(tables).toContain('collection_items');
    } finally {
      db.close();
    }
  });

  it('tombstone：4 张表都必须包含 deleted_at 列', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      for (const tableName of [
        'todo_lists',
        'todo_items',
        'todo_occurrences',
        'collection_items',
      ]) {
        const cols = listColumns(db, tableName);
        expect(cols).toContain('deleted_at');
      }
    } finally {
      db.close();
    }
  });
});
