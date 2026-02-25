// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations';
import { openSqliteDatabase } from './sqlite';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-memos-schema-'));
}

function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe('src/main/db/memos schema', () => {
  it('迁移后必须存在 memos 与 memo_attachments 表', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);
      const tables = listTables(db);

      expect(tables).toContain('memos');
      expect(tables).toContain('memo_attachments');
    } finally {
      db.close();
    }
  });

  it('sync_status 必须受控（插入非法值必须失败）', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const insert = db.prepare(
        `INSERT INTO memos(
          local_uuid,
          content,
          visibility,
          sync_status,
          created_at_ms,
          updated_at_ms
        ) VALUES(
          @local_uuid,
          @content,
          @visibility,
          @sync_status,
          @created_at_ms,
          @updated_at_ms
        )`
      );

      expect(() =>
        insert.run({
          local_uuid: '00000000-0000-0000-0000-000000000000',
          content: 'hello',
          visibility: 'PRIVATE',
          sync_status: 'NOT_A_REAL_STATUS',
          created_at_ms: 1,
          updated_at_ms: 1,
        })
      ).toThrow(/check constraint failed/i);
    } finally {
      db.close();
    }
  });
});
