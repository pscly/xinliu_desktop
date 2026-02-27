import type Database from 'better-sqlite3';

import type { CloseBehavior, CloseBehaviorStatus } from '../../shared/ipc';
export const DESKTOP_USER_SETTING_KEYS = {
  closeBehavior: 'desktop.close_behavior',
  closeToTrayHintShown: 'desktop.close_to_tray_hint_shown',
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function parseJsonSafe(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function validateCloseBehavior(value: unknown): value is CloseBehavior {
  return value === 'hide' || value === 'quit';
}

function readValueJson(db: Database.Database, key: string): unknown | null {
  const row = db
    .prepare('SELECT value_json AS v, deleted_at AS d FROM user_settings WHERE key = ?')
    .get(key) as { v: string; d: string | null } | undefined;

  if (!row) {
    return null;
  }
  if (row.d !== null) {
    return null;
  }

  return parseJsonSafe(row.v);
}

function writeValueJson(db: Database.Database, key: string, value: unknown): void {
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO user_settings (
        key,
        value_json,
        client_updated_at_ms,
        updated_at,
        deleted_at
      ) VALUES (
        @key,
        @value_json,
        @client_updated_at_ms,
        @updated_at,
        NULL
      )
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        client_updated_at_ms = excluded.client_updated_at_ms,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `
  ).run({
    key,
    value_json: JSON.stringify(value ?? {}),
    client_updated_at_ms: nowMs,
    updated_at: nowIso,
  });
}

function extractBehavior(value: unknown): CloseBehavior | null {
  if (validateCloseBehavior(value)) {
    return value;
  }
  if (isPlainObject(value) && validateCloseBehavior(value['behavior'])) {
    return value['behavior'];
  }
  return null;
}

function extractHintShown(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (isPlainObject(value) && typeof value['shown'] === 'boolean') {
    return value['shown'];
  }
  if (isPlainObject(value) && typeof value['closeToTrayHintShown'] === 'boolean') {
    return value['closeToTrayHintShown'];
  }
  return null;
}

export function readCloseBehaviorStatus(db: Database.Database): CloseBehaviorStatus {
  const behaviorRaw = readValueJson(db, DESKTOP_USER_SETTING_KEYS.closeBehavior);
  const hintRaw = readValueJson(db, DESKTOP_USER_SETTING_KEYS.closeToTrayHintShown);

  return {
    behavior: extractBehavior(behaviorRaw) ?? 'hide',
    closeToTrayHintShown: extractHintShown(hintRaw) ?? false,
  };
}

export function writeCloseBehavior(db: Database.Database, behavior: CloseBehavior): void {
  writeValueJson(db, DESKTOP_USER_SETTING_KEYS.closeBehavior, { behavior });
}

export function writeCloseToTrayHintShown(db: Database.Database, shown: boolean): void {
  writeValueJson(db, DESKTOP_USER_SETTING_KEYS.closeToTrayHintShown, { shown });
}
