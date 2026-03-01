import type Database from 'better-sqlite3';

export const DESKTOP_BACKEND_SETTING_KEYS = {
  flowBaseUrl: 'desktop.flow_base_url',
  memosBaseUrl: 'desktop.memos_base_url',
} as const;

export interface BackendSettingsStatus {
  flowBaseUrlRaw: string | null;
  memosBaseUrlRaw: string | null;
}

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

function extractBaseUrlRaw(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!isPlainObject(value)) {
    return null;
  }

  const raw = value['baseUrlRaw'];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (raw === null) {
    return null;
  }

  const legacyBaseUrl = value['baseUrl'];
  if (typeof legacyBaseUrl === 'string') {
    const trimmed = legacyBaseUrl.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (legacyBaseUrl === null) {
    return null;
  }

  return null;
}

export function readBackendSettingsStatus(db: Database.Database): BackendSettingsStatus {
  const flowRaw = readValueJson(db, DESKTOP_BACKEND_SETTING_KEYS.flowBaseUrl);
  const memosRaw = readValueJson(db, DESKTOP_BACKEND_SETTING_KEYS.memosBaseUrl);

  return {
    flowBaseUrlRaw: extractBaseUrlRaw(flowRaw),
    memosBaseUrlRaw: extractBaseUrlRaw(memosRaw),
  };
}

export function writeFlowBaseUrlRaw(db: Database.Database, baseUrlRaw: string | null): void {
  writeValueJson(db, DESKTOP_BACKEND_SETTING_KEYS.flowBaseUrl, { baseUrlRaw });
}

export function writeMemosBaseUrlRaw(db: Database.Database, baseUrlRaw: string | null): void {
  writeValueJson(db, DESKTOP_BACKEND_SETTING_KEYS.memosBaseUrl, { baseUrlRaw });
}
