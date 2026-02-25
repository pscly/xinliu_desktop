import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

export interface OpenSqliteDatabaseOptions {
  dbFileAbsPath: string;
  busyTimeoutMs?: number;
}

export interface SqliteRuntimeConfig {
  journalMode: string;
  foreignKeys: number;
  synchronous: number;
  busyTimeoutMs: number;
}

function requireAbsolutePath(absPath: string, fieldName: string): string {
  const normalized = path.resolve(absPath);
  if (!path.isAbsolute(normalized)) {
    throw new Error(`${fieldName} 必须是绝对路径`);
  }
  return normalized;
}

function pragmaSimple(db: Database.Database, name: string): unknown {
  return db.pragma(name, { simple: true });
}

export function configureSqliteConnection(
  db: Database.Database,
  options: Required<Pick<OpenSqliteDatabaseOptions, 'busyTimeoutMs'>>
): SqliteRuntimeConfig {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma(`busy_timeout = ${options.busyTimeoutMs}`);

  const journalMode = String(pragmaSimple(db, 'journal_mode'));
  const foreignKeys = Number(pragmaSimple(db, 'foreign_keys'));
  const synchronous = Number(pragmaSimple(db, 'synchronous'));
  const busyTimeoutMs = Number(pragmaSimple(db, 'busy_timeout'));

  return {
    journalMode,
    foreignKeys,
    synchronous,
    busyTimeoutMs,
  };
}

export function openSqliteDatabase(options: OpenSqliteDatabaseOptions): {
  db: Database.Database;
  config: SqliteRuntimeConfig;
} {
  const absDbFile = requireAbsolutePath(options.dbFileAbsPath, 'dbFileAbsPath');
  const busyTimeoutMs = options.busyTimeoutMs ?? 5000;

  fs.mkdirSync(path.dirname(absDbFile), { recursive: true });

  const db = new Database(absDbFile, {
    timeout: busyTimeoutMs,
  });

  const config = configureSqliteConnection(db, { busyTimeoutMs });

  return { db, config };
}

export function closeSqliteDatabase(db: Database.Database): void {
  db.close();
}
