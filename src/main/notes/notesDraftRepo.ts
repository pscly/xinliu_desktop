import crypto from 'node:crypto';

import type Database from 'better-sqlite3';

import { bumpClientUpdatedAtMs, withImmediateTransaction } from '../sync/outbox';
import { MEMOS_SYNC_STATUS, type MemosSyncStatus } from '../memos/memosSyncJob';

export interface NotesDraftRepoDeps {
  nowMs?: () => number;
  randomUUID?: () => string;
}

export type NotesDraftRow = {
  localUuid: string;
  content: string;
  syncStatus: MemosSyncStatus;
  updatedAtMs: number;
  createdAtMs: number;
};

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value;
}

function safeNowMs(deps: NotesDraftRepoDeps): number {
  const nowMs = (deps.nowMs ?? Date.now)();
  if (!Number.isInteger(nowMs) || nowMs < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return nowMs;
}

function createId(deps: NotesDraftRepoDeps): string {
  return (deps.randomUUID ?? crypto.randomUUID)();
}

function getUpdatedAtMs(db: Database.Database, localUuid: string): number | null {
  const row = db
    .prepare('SELECT updated_at_ms AS ms FROM memos WHERE local_uuid = ?')
    .get(localUuid) as { ms: number } | undefined;
  return row ? Number(row.ms) : null;
}

export function createNotesDraftRepo(db: Database.Database, deps: NotesDraftRepoDeps = {}) {
  function createDraft(content: string): { localUuid: string } {
    const localUuid = createId(deps);
    const nowMs = safeNowMs(deps);

    withImmediateTransaction(db, () => {
      db.prepare(
        `INSERT INTO memos(
          local_uuid,
          server_memo_id,
          server_memo_name,
          content,
          visibility,
          sync_status,
          last_error,
          created_at_ms,
          updated_at_ms
        ) VALUES(
          @local_uuid,
          NULL,
          NULL,
          @content,
          @visibility,
          @sync_status,
          NULL,
          @created_at_ms,
          @updated_at_ms
        )`
      ).run({
        local_uuid: localUuid,
        content,
        visibility: 'PRIVATE',
        sync_status: MEMOS_SYNC_STATUS.dirty,
        created_at_ms: nowMs,
        updated_at_ms: nowMs,
      });
    });

    return { localUuid };
  }

  function upsertDraft(localUuid: string, content: string): void {
    const uuid = requireNonEmptyString(localUuid, 'localUuid');
    const nowMs = safeNowMs(deps);

    withImmediateTransaction(db, () => {
      const nextUpdatedAtMs = bumpClientUpdatedAtMs({
        lastMs: getUpdatedAtMs(db, uuid),
        nowMs,
      });

      db.prepare(
        `INSERT INTO memos(
          local_uuid,
          server_memo_id,
          server_memo_name,
          content,
          visibility,
          sync_status,
          last_error,
          created_at_ms,
          updated_at_ms
        ) VALUES(
          @local_uuid,
          NULL,
          NULL,
          @content,
          @visibility,
          @sync_status,
          NULL,
          @created_at_ms,
          @updated_at_ms
        )
        ON CONFLICT(local_uuid) DO UPDATE SET
          content = excluded.content,
          sync_status = excluded.sync_status,
          updated_at_ms = excluded.updated_at_ms`
      ).run({
        local_uuid: uuid,
        content,
        visibility: 'PRIVATE',
        sync_status: MEMOS_SYNC_STATUS.dirty,
        created_at_ms: nowMs,
        updated_at_ms: nextUpdatedAtMs,
      });
    });
  }

  function getDraft(localUuid: string): NotesDraftRow | null {
    const uuid = requireNonEmptyString(localUuid, 'localUuid');
    const row = db
      .prepare(
        `SELECT
          local_uuid,
          content,
          sync_status,
          updated_at_ms,
          created_at_ms
        FROM memos
        WHERE local_uuid = ?`
      )
      .get(uuid) as
      | {
          local_uuid: string;
          content: string;
          sync_status: MemosSyncStatus;
          updated_at_ms: number;
          created_at_ms: number;
        }
      | undefined;

    if (!row) return null;
    return {
      localUuid: row.local_uuid,
      content: row.content,
      syncStatus: row.sync_status,
      updatedAtMs: Number(row.updated_at_ms),
      createdAtMs: Number(row.created_at_ms),
    };
  }

  return {
    createDraft,
    upsertDraft,
    getDraft,
  };
}
