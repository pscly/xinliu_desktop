// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyMigrations } from './migrations';
import { openSqliteDatabase } from './sqlite';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-sqlite-'));
}

describe('src/main/db/sqlite', () => {
  it('openSqliteDatabase: 应启用 WAL 与 foreign_keys，并设置 busy_timeout', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db, config } = openSqliteDatabase({
      dbFileAbsPath,
      busyTimeoutMs: 1234,
    });

    try {
      expect(config.journalMode.toLowerCase()).toBe('wal');
      expect(config.foreignKeys).toBe(1);
      expect(config.busyTimeoutMs).toBe(1234);
    } finally {
      db.close();
    }
  });

  it('applyMigrations: 首次执行会推进 user_version，且可重复调用（幂等）', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      const r1 = applyMigrations(db);
      expect(r1.fromVersion).toBe(0);
      expect(r1.toVersion).toBeGreaterThan(0);
      expect(r1.appliedVersions.length).toBeGreaterThan(0);

      const r2 = applyMigrations(db);
      expect(r2.fromVersion).toBe(r1.toVersion);
      expect(r2.toVersion).toBe(r1.toVersion);
      expect(r2.appliedVersions).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('applyMigrations: 当数据库版本高于客户端可识别版本时必须失败', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      db.pragma('user_version = 999');
      expect(() => applyMigrations(db)).toThrow();
    } finally {
      db.close();
    }
  });
});
