import type Database from 'better-sqlite3';

import type { NotesConflictItem, NotesConflictListResult } from '../../shared/ipc';

interface NotesConflictRow {
  local_uuid: string;
  conflict_of_local_uuid: string;
  conflict_request_id: string | null;
  updated_at_ms: number;
  created_at_ms: number;
  content: string;
  original_content: string | null;
}

export interface NotesConflictsService {
  listNotesConflicts: () => NotesConflictListResult;
}

export function createNotesConflictsService(db: Database.Database): NotesConflictsService {
  const listNotesConflicts = (): NotesConflictListResult => {
    const rows = db
      .prepare(
        `SELECT
          copy.local_uuid,
          copy.conflict_of_local_uuid,
          copy.conflict_request_id,
          copy.updated_at_ms,
          copy.created_at_ms,
          copy.content,
          original.content AS original_content
        FROM memos AS copy
        LEFT JOIN memos AS original
          ON original.local_uuid = copy.conflict_of_local_uuid
        WHERE copy.conflict_of_local_uuid IS NOT NULL
        ORDER BY copy.updated_at_ms DESC, copy.created_at_ms DESC`
      )
      .all() as NotesConflictRow[];

    const items: NotesConflictItem[] = rows.map((row) => ({
      localUuid: row.local_uuid,
      originalLocalUuid: row.conflict_of_local_uuid,
      conflictRequestId: row.conflict_request_id,
      updatedAtMs: Number(row.updated_at_ms),
      copyContent: row.content,
      originalContent: row.original_content,
    }));

    return { items };
  };

  return {
    listNotesConflicts,
  };
}
