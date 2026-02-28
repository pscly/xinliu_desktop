import crypto from 'node:crypto';

import type Database from 'better-sqlite3';

import { withImmediateTransaction } from '../sync/outbox';

export type MemoVisibility = string;

export interface MemoConflictCopyResult {
  conflictLocalUuid: string;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value;
}

function safeNowMs(nowMs: () => number): number {
  const v = nowMs();
  if (!Number.isInteger(v) || v < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return v;
}

export function createConflictCopyAndRollbackOriginalMemo(
  db: Database.Database,
  args: {
    originalLocalUuid: string;
    originalContent: string;
    originalVisibility: MemoVisibility;
    serverMemoName: string | null;
    serverMemoId: string | null;
    serverContent: string;
    serverVisibility: MemoVisibility;
    requestId: string | null;
    nowMs: () => number;
  }
): MemoConflictCopyResult {
  const originalLocalUuid = requireNonEmptyString(args.originalLocalUuid, 'originalLocalUuid');
  const nowMs = safeNowMs(args.nowMs);

  const conflictLocalUuid = crypto.randomUUID();
  const requestId =
    typeof args.requestId === 'string' && args.requestId.trim().length > 0
      ? args.requestId.trim()
      : null;

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
        updated_at_ms,
        conflict_of_local_uuid,
        conflict_request_id
      ) VALUES(
        @local_uuid,
        NULL,
        NULL,
        @content,
        @visibility,
        'LOCAL_ONLY',
        @last_error,
        @created_at_ms,
        @updated_at_ms,
        @conflict_of_local_uuid,
        @conflict_request_id
      )`
    ).run({
      local_uuid: conflictLocalUuid,
      content: args.originalContent,
      visibility: args.originalVisibility,
      last_error: requestId ? `冲突副本（request_id=${requestId}）` : '冲突副本（缺少 request_id）',
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      conflict_of_local_uuid: originalLocalUuid,
      conflict_request_id: requestId,
    });

    db.prepare(
      `UPDATE memo_attachments
        SET memo_local_uuid = @memo_local_uuid,
            updated_at_ms = @updated_at_ms
        WHERE memo_local_uuid = @original_local_uuid`
    ).run({
      memo_local_uuid: conflictLocalUuid,
      updated_at_ms: nowMs,
      original_local_uuid: originalLocalUuid,
    });

    db.prepare(
      `UPDATE memos
        SET
          server_memo_name = COALESCE(@server_memo_name, server_memo_name),
          server_memo_id = COALESCE(@server_memo_id, server_memo_id),
          content = @content,
          visibility = @visibility,
          sync_status = 'SYNCED',
          last_error = NULL,
          updated_at_ms = @updated_at_ms
        WHERE local_uuid = @local_uuid`
    ).run({
      local_uuid: originalLocalUuid,
      server_memo_name: args.serverMemoName,
      server_memo_id: args.serverMemoId,
      content: args.serverContent,
      visibility: args.serverVisibility,
      updated_at_ms: nowMs,
    });
  });

  return { conflictLocalUuid };
}
