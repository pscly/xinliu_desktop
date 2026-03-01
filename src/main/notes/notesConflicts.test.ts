// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { createNotesConflictsService } from './notesConflicts';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-notes-conflicts-'));
}

describe('src/main/notes/notesConflicts', () => {
  it('listNotesConflicts: 仅返回冲突副本并按 updated_at_ms 倒序', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

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
          'PRIVATE',
          @sync_status,
          NULL,
          @created_at_ms,
          @updated_at_ms,
          @conflict_of_local_uuid,
          @conflict_request_id
        )`
      ).run({
        local_uuid: 'memo_original_1',
        content: 'server-content',
        sync_status: 'SYNCED',
        created_at_ms: 100,
        updated_at_ms: 200,
        conflict_of_local_uuid: null,
        conflict_request_id: null,
      });

      const insert = db.prepare(
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
          'PRIVATE',
          'LOCAL_ONLY',
          NULL,
          @created_at_ms,
          @updated_at_ms,
          @conflict_of_local_uuid,
          @conflict_request_id
        )`
      );

      insert.run({
        local_uuid: 'memo_copy_old',
        content: 'local-old',
        created_at_ms: 300,
        updated_at_ms: 500,
        conflict_of_local_uuid: 'memo_original_1',
        conflict_request_id: 'req-old',
      });

      insert.run({
        local_uuid: 'memo_copy_new',
        content: 'local-new',
        created_at_ms: 400,
        updated_at_ms: 900,
        conflict_of_local_uuid: 'memo_original_1',
        conflict_request_id: 'req-new',
      });

      insert.run({
        local_uuid: 'memo_local_regular',
        content: 'local-regular',
        created_at_ms: 500,
        updated_at_ms: 1000,
        conflict_of_local_uuid: null,
        conflict_request_id: null,
      });

      const service = createNotesConflictsService(db);
      const result = service.listNotesConflicts();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.localUuid).toBe('memo_copy_new');
      expect(result.items[1]?.localUuid).toBe('memo_copy_old');
      expect(result.items[0]?.originalLocalUuid).toBe('memo_original_1');
      expect(result.items[0]?.originalContent).toBe('server-content');
      expect(result.items[0]?.conflictRequestId).toBe('req-new');
    } finally {
      db.close();
    }
  });
});
