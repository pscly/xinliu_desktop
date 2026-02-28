// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { createNotesDraftRepo } from './notesDraftRepo';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-notes-draft-repo-'));
}

describe('src/main/notes/notesDraftRepo', () => {
  it('createDraft: 应写入 memos 且 sync_status=DIRTY', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const repo = createNotesDraftRepo(db, {
        nowMs: () => 1000,
        randomUUID: () => '00000000-0000-0000-0000-000000000001',
      });

      const r = repo.createDraft('# hello');

      const row = db
        .prepare(
          'SELECT local_uuid, content, sync_status, created_at_ms, updated_at_ms FROM memos WHERE local_uuid = ?'
        )
        .get(r.localUuid) as
        | {
            local_uuid: string;
            content: string;
            sync_status: string;
            created_at_ms: number;
            updated_at_ms: number;
          }
        | undefined;

      expect(row).toBeTruthy();
      expect(row?.sync_status).toBe('DIRTY');
      expect(row?.content).toBe('# hello');
      expect(row?.created_at_ms).toBe(1000);
      expect(row?.updated_at_ms).toBe(1000);
    } finally {
      db.close();
    }
  });

  it('upsertDraft: 应更新 content，且 updated_at_ms 单调递增，并保持 sync_status=DIRTY', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const nowMs = vi.fn(() => 1000);
      const repo = createNotesDraftRepo(db, {
        nowMs,
        randomUUID: () => '00000000-0000-0000-0000-000000000002',
      });

      const { localUuid } = repo.createDraft('v1');
      const before = repo.getDraft(localUuid);
      expect(before).not.toBeNull();
      expect(before?.updatedAtMs).toBe(1000);

      repo.upsertDraft(localUuid, 'v2');

      const after = repo.getDraft(localUuid);
      expect(after).not.toBeNull();
      expect(after?.content).toBe('v2');
      expect(after?.syncStatus).toBe('DIRTY');
      expect(after?.updatedAtMs).toBeGreaterThan(before!.updatedAtMs);
      expect(after?.updatedAtMs).toBe(before!.updatedAtMs + 1);
    } finally {
      db.close();
    }
  });
});
