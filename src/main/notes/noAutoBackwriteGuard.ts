import type Database from 'better-sqlite3';

import type { NotesRoutedResult } from './notesRouter';

import { requireFlowNotesFinalDecision } from './flowNotesDecisionGuard';

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value;
}

function safeNowMs(nowMs?: () => number): number {
  const v = (nowMs ?? Date.now)();
  if (!Number.isInteger(v) || v < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return v;
}

export type NoAutoBackwriteGuardOutcome =
  | { kind: 'skipped'; reason: 'provider_is_memos' | 'memo_not_found' }
  | { kind: 'applied'; memoLocalUuid: string };

export function persistNoAutoBackwriteGuard(
  db: Database.Database,
  args: {
    memoLocalUuid: string;
    decision: NotesRoutedResult<unknown>;
    requestId?: string;
    nowMs?: () => number;
  }
): NoAutoBackwriteGuardOutcome {
  const memoLocalUuid = requireNonEmptyString(args.memoLocalUuid, 'memoLocalUuid');

  if (args.decision.provider !== 'flow_notes') {
    return { kind: 'skipped', reason: 'provider_is_memos' };
  }

  const row = db
    .prepare(
      `
        SELECT local_uuid AS local_uuid
        FROM memos
        WHERE local_uuid = ?
      `
    )
    .get(memoLocalUuid) as { local_uuid: string } | undefined;
  if (!row) {
    return { kind: 'skipped', reason: 'memo_not_found' };
  }

  const nowMs = safeNowMs(args.nowMs);
  const { providerReason } = requireFlowNotesFinalDecision(args.decision);
  const req =
    typeof args.requestId === 'string' && args.requestId.trim().length > 0 ? args.requestId : null;

  const hint = req
    ? `禁止自动回写到 Memos（final provider=FlowNotes；reason=${providerReason}；request_id=${req}）`
    : `禁止自动回写到 Memos（final provider=FlowNotes；reason=${providerReason}）`;

  db.prepare(
    `
      UPDATE memos
      SET
        sync_status = 'LOCAL_ONLY',
        last_error = CASE
          WHEN last_error IS NULL OR TRIM(last_error) = '' THEN @last_error
          ELSE last_error
        END,
        updated_at_ms = @updated_at_ms
      WHERE local_uuid = @local_uuid
    `
  ).run({
    local_uuid: memoLocalUuid,
    last_error: hint,
    updated_at_ms: nowMs,
  });

  return { kind: 'applied', memoLocalUuid };
}
