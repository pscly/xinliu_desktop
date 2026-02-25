import type Database from 'better-sqlite3';

import type { NotesRoutedResult } from './notesRouter';

export type FlowNoteRow = {
  id: string;
  title: string;
  body_md: string;
  tags_json: string;
  client_updated_at_ms: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  provider_reason: string;
  last_request_id: string | null;
  last_error: string | null;
};

export type FlowNoteUpsertInput = {
  id: string;
  title: string;
  body_md: string;
  tags: string[];
  client_updated_at_ms: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type FlowNotesDegradedWriteMeta = {
  requestId: string;
  lastError?: string | null;
};

function describeNotesDecision(decision: NotesRoutedResult<unknown>): string {
  const kind = decision.kind;
  const provider = (decision as { provider?: unknown }).provider;
  if (typeof provider === 'string') return `kind=${kind}, provider=${provider}`;
  return `kind=${kind}`;
}

function requireFlowNotesFinalDecision(decision: NotesRoutedResult<unknown>): {
  providerReason: string;
} {
  if (decision.provider !== 'flow_notes') {
    throw new Error(
      `禁止访问 FlowNotes notes 表：仅允许在本次请求最终 provider 为 FlowNotes 时读写（当前 ${describeNotesDecision(
        decision
      )}）`
    );
  }

  if (decision.kind === 'degraded') {
    const reason = decision.degradeReason;
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('FlowNotes 降级写入必须包含 degradeReason（非空字符串）');
    }
    return { providerReason: reason };
  }

  const reason = decision.providerReason;
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('FlowNotes 写入必须包含 providerReason（非空字符串）');
  }

  return { providerReason: reason };
}

export class FlowNotesDegradedNotesRepo {
  public constructor(private readonly db: Database.Database) {}

  public upsertNote(decision: NotesRoutedResult<unknown>, note: FlowNoteUpsertInput, meta: FlowNotesDegradedWriteMeta): void {
    const guard = requireFlowNotesFinalDecision(decision);
    const providerReason = guard.providerReason;
    const tags_json = JSON.stringify(note.tags);
    const deleted_at = note.deleted_at ?? null;
    const last_error = meta.lastError ?? null;

    const stmt = this.db.prepare(
      `INSERT INTO notes(
        id,
        title,
        body_md,
        tags_json,
        client_updated_at_ms,
        created_at,
        updated_at,
        deleted_at,
        provider_reason,
        last_request_id,
        last_error
      ) VALUES(
        @id,
        @title,
        @body_md,
        @tags_json,
        @client_updated_at_ms,
        @created_at,
        @updated_at,
        @deleted_at,
        @provider_reason,
        @last_request_id,
        @last_error
      )
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        body_md=excluded.body_md,
        tags_json=excluded.tags_json,
        client_updated_at_ms=excluded.client_updated_at_ms,
        created_at=excluded.created_at,
        updated_at=excluded.updated_at,
        deleted_at=excluded.deleted_at,
        provider_reason=excluded.provider_reason,
        last_request_id=excluded.last_request_id,
        last_error=excluded.last_error`
    );

    stmt.run({
      id: note.id,
      title: note.title,
      body_md: note.body_md,
      tags_json,
      client_updated_at_ms: note.client_updated_at_ms,
      created_at: note.created_at,
      updated_at: note.updated_at,
      deleted_at,
      provider_reason: providerReason,
      last_request_id: meta.requestId,
      last_error,
    });
  }

  public getNoteById(decision: NotesRoutedResult<unknown>, id: string): FlowNoteRow | null {
    requireFlowNotesFinalDecision(decision);

    const row = this.db
      .prepare(
        `SELECT
          id,
          title,
          body_md,
          tags_json,
          client_updated_at_ms,
          created_at,
          updated_at,
          deleted_at,
          provider_reason,
          last_request_id,
          last_error
        FROM notes
        WHERE id=@id`
      )
      .get({ id }) as FlowNoteRow | undefined;

    return row ?? null;
  }
}
