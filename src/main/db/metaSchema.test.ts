// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations';
import { openSqliteDatabase } from './sqlite';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-meta-schema-'));
}

function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe('src/main/db/meta schema', () => {
  it('迁移后必须存在 outbox/sync_state/jobs/user_settings 表', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);
      const tables = listTables(db);

      expect(tables).toContain('outbox_mutations');
      expect(tables).toContain('sync_state');
      expect(tables).toContain('jobs');
      expect(tables).toContain('user_settings');
    } finally {
      db.close();
    }
  });
});
