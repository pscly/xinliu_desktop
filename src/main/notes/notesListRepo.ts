import type Database from 'better-sqlite3';

import type {
  NotesIdPayload,
  NotesListItem,
  NotesListItemsPayload,
  NotesListItemsResult,
  NotesProvider,
  NotesScope,
  NotesSyncStatus,
} from '../../shared/ipc';

type NotesListQueryRow = {
  id: string;
  provider: NotesProvider;
  title_raw: string | null;
  preview_raw: string;
  updated_at_ms: number;
  sync_status: NotesSyncStatus;
};

const PREVIEW_MAX_LENGTH = 160;

function sanitizeSingleLine(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function pickTitle(titleRaw: string | null, previewRaw: string, fallbackId: string): string {
  const normalizedTitle = sanitizeSingleLine(titleRaw ?? '');
  if (normalizedTitle.length > 0) {
    return normalizedTitle;
  }

  const lines = previewRaw
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const firstLine = lines[0] ?? '';
  const fromPreview = sanitizeSingleLine(
    firstLine.replace(/^#{1,6}\s+/, '').replace(/^[\-*+]\s+/, '')
  );
  if (fromPreview.length > 0) {
    return fromPreview.slice(0, 64);
  }

  return `笔记 ${fallbackId.slice(0, 8)}`;
}

function pickPreview(previewRaw: string): string {
  const normalized = sanitizeSingleLine(previewRaw);
  if (normalized.length <= PREVIEW_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

function toNotesListItem(row: NotesListQueryRow): NotesListItem {
  return {
    id: row.id,
    provider: row.provider,
    title: pickTitle(row.title_raw, row.preview_raw, row.id),
    preview: pickPreview(row.preview_raw),
    updatedAtMs: Number(row.updated_at_ms),
    syncStatus: row.sync_status,
  };
}

function listRowsByScope(
  db: Database.Database,
  scope: NotesScope,
  page: number,
  pageSize: number
): NotesListQueryRow[] {
  const offset = page * pageSize;
  const limit = pageSize + 1;

  if (scope === 'trash') {
    return db
      .prepare(
        `SELECT
          id,
          provider,
          title_raw,
          preview_raw,
          updated_at_ms,
          sync_status
        FROM (
          SELECT
            local_uuid AS id,
            'memos' AS provider,
            NULL AS title_raw,
            content AS preview_raw,
            updated_at_ms,
            sync_status
          FROM memos
          WHERE deleted_at_ms IS NOT NULL

          UNION ALL

          SELECT
            id,
            'flow_notes' AS provider,
            title AS title_raw,
            body_md AS preview_raw,
            CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER) AS updated_at_ms,
            'UNKNOWN' AS sync_status
          FROM notes
          WHERE deleted_at IS NOT NULL
        )
        ORDER BY updated_at_ms DESC, id DESC
        LIMIT @limit OFFSET @offset`
      )
      .all({ limit, offset }) as NotesListQueryRow[];
  }

  if (scope === 'inbox') {
    return db
      .prepare(
        `SELECT
          id,
          provider,
          title_raw,
          preview_raw,
          updated_at_ms,
          sync_status
        FROM (
          SELECT
            local_uuid AS id,
            'memos' AS provider,
            NULL AS title_raw,
            content AS preview_raw,
            updated_at_ms,
            sync_status
          FROM memos
          WHERE sync_status IN ('LOCAL_ONLY', 'DIRTY', 'SYNCING', 'FAILED')
            AND deleted_at_ms IS NULL

          UNION ALL

          SELECT
            id,
            'flow_notes' AS provider,
            title AS title_raw,
            body_md AS preview_raw,
            CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER) AS updated_at_ms,
            'UNKNOWN' AS sync_status
          FROM notes
          WHERE deleted_at IS NULL
        )
        ORDER BY updated_at_ms DESC, id DESC
        LIMIT @limit OFFSET @offset`
      )
      .all({ limit, offset }) as NotesListQueryRow[];
  }

  return db
    .prepare(
      `SELECT
        id,
        provider,
        title_raw,
        preview_raw,
        updated_at_ms,
        sync_status
      FROM (
        SELECT
          local_uuid AS id,
          'memos' AS provider,
          NULL AS title_raw,
          content AS preview_raw,
          updated_at_ms,
          sync_status
        FROM memos
        WHERE deleted_at_ms IS NULL

        UNION ALL

        SELECT
          id,
          'flow_notes' AS provider,
          title AS title_raw,
          body_md AS preview_raw,
          CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER) AS updated_at_ms,
          'UNKNOWN' AS sync_status
        FROM notes
        WHERE deleted_at IS NULL
      )
      ORDER BY updated_at_ms DESC, id DESC
      LIMIT @limit OFFSET @offset`
    )
    .all({ limit, offset }) as NotesListQueryRow[];
}

export function createNotesListRepo(db: Database.Database) {
  function listItems(payload: NotesListItemsPayload): NotesListItemsResult {
    if (payload.pageSize === 0) {
      return { items: [], hasMore: false };
    }

    const rows = listRowsByScope(db, payload.scope, payload.page, payload.pageSize);
    const hasMore = rows.length > payload.pageSize;
    const visibleRows = hasMore ? rows.slice(0, payload.pageSize) : rows;
    return {
      items: visibleRows.map((row) => toNotesListItem(row)),
      hasMore,
    };
  }

  function deleteItem(payload: NotesIdPayload): void {
    const nowMs = Date.now();

    if (payload.provider === 'memos') {
      db.prepare(
        `UPDATE memos
        SET deleted_at_ms = @deleted_at_ms,
            updated_at_ms = @updated_at_ms
        WHERE local_uuid = @id`
      ).run({
        id: payload.id,
        deleted_at_ms: nowMs,
        updated_at_ms: nowMs,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE notes
      SET deleted_at = @deleted_at,
          updated_at = @updated_at,
          client_updated_at_ms = @client_updated_at_ms
      WHERE id = @id`
    ).run({
      id: payload.id,
      deleted_at: nowIso,
      updated_at: nowIso,
      client_updated_at_ms: nowMs,
    });
  }

  function restoreItem(payload: NotesIdPayload): void {
    const nowMs = Date.now();

    if (payload.provider === 'memos') {
      db.prepare(
        `UPDATE memos
        SET deleted_at_ms = NULL,
            updated_at_ms = @updated_at_ms
        WHERE local_uuid = @id`
      ).run({
        id: payload.id,
        updated_at_ms: nowMs,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE notes
      SET deleted_at = NULL,
          updated_at = @updated_at,
          client_updated_at_ms = @client_updated_at_ms
      WHERE id = @id`
    ).run({
      id: payload.id,
      updated_at: nowIso,
      client_updated_at_ms: nowMs,
    });
  }

  function hardDeleteItem(payload: NotesIdPayload): void {
    if (payload.provider === 'memos') {
      db.prepare('DELETE FROM memos WHERE local_uuid = @id').run({ id: payload.id });
      return;
    }
    db.prepare('DELETE FROM notes WHERE id = @id').run({ id: payload.id });
  }

  return {
    listItems,
    deleteItem,
    restoreItem,
    hardDeleteItem,
  };
}
