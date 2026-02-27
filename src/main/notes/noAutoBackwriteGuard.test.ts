// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import type { MemosClient } from '../memos/memosClient';
import { MEMOS_SYNC_STATUS, runMemosSyncOneMemoJob } from '../memos/memosSyncJob';
import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { routeNotesRequest } from './notesRouter';
import { persistNoAutoBackwriteGuard } from './noAutoBackwriteGuard';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-no-auto-backwrite-'));
}

function insertMemo(
  db: Database.Database,
  args: {
    localUuid: string;
    content: string;
    visibility: string;
    syncStatus: string;
    createdAtMs: number;
    updatedAtMs: number;
  }
): void {
  db.prepare(
    `
      INSERT INTO memos(
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
    `
  ).run({
    local_uuid: args.localUuid,
    content: args.content,
    visibility: args.visibility,
    sync_status: args.syncStatus,
    created_at_ms: args.createdAtMs,
    updated_at_ms: args.updatedAtMs,
  });
}

function readSyncStatus(db: Database.Database, localUuid: string): string {
  const row = db
    .prepare('SELECT sync_status AS sync_status FROM memos WHERE local_uuid = ?')
    .get(localUuid) as { sync_status: string } | undefined;
  if (!row) throw new Error('memo 不存在');
  return row.sync_status;
}

describe('src/main/notes/noAutoBackwriteGuard', () => {
  it('当 Notes Router 最终 provider=flow_notes（memos TIMEOUT 降级）时，必须落护栏并阻止后续 memos sync 自动回写', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      insertMemo(db, {
        localUuid: 'memo_for_guard',
        content: 'hello',
        visibility: 'PRIVATE',
        syncStatus: MEMOS_SYNC_STATUS.dirty,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });

      const decision = await routeNotesRequest({
        memosBaseUrl: 'https://memos.example.com',
        memosRequest: async () => ({
          ok: false,
          error: {
            code: 'TIMEOUT',
            message: 'timeout',
            requestId: 'memos_req',
            responseRequestIdHeader: null,
          },
        }),
        flowNotesRequest: async () => ({
          ok: true,
          status: 200,
          requestId: 'flow_cli',
          responseRequestIdHeader: 'flow_srv',
          value: { ok: true },
        }),
      });

      expect(decision.provider).toBe('flow_notes');
      expect(decision.kind).toBe('degraded');

      const requestId =
        decision.kind === 'degraded' ? decision.flow_request_id : decision.request_id;
      const guardOut = persistNoAutoBackwriteGuard(db, {
        memoLocalUuid: 'memo_for_guard',
        decision,
        requestId,
        nowMs: () => nowMs + 1,
      });
      expect(guardOut.kind).toBe('applied');
      expect(readSyncStatus(db, 'memo_for_guard')).toBe(MEMOS_SYNC_STATUS.localOnly);

      const createMemo = vi.fn(async () => ({
        ok: true,
        status: 200,
        requestId: 'cli',
        responseRequestIdHeader: 'srv',
        value: { name: 'memos/1', content: 'server', visibility: 'PRIVATE' },
      }));
      const memosClient = {
        createMemo,
        updateMemo: vi.fn(async () => {
          throw new Error('unexpected');
        }),
        setMemoAttachments: vi.fn(async () => {
          throw new Error('unexpected');
        }),
        createAttachment: vi.fn(async () => {
          throw new Error('unexpected');
        }),
        getMemo: vi.fn(),
        listMemos: vi.fn(),
        deleteMemo: vi.fn(),
        getAttachment: vi.fn(),
        updateAttachment: vi.fn(),
        deleteAttachment: vi.fn(),
        listMemoAttachments: vi.fn(),
      } as unknown as MemosClient;

      const syncOut = await runMemosSyncOneMemoJob({
        db,
        memosClient,
        storageRootAbsPath: dir,
        memoLocalUuid: 'memo_for_guard',
        nowMs: () => nowMs + 2,
      });

      expect(syncOut).toEqual({ kind: 'skipped', reason: 'local_only' });
      expect(createMemo).toHaveBeenCalledTimes(0);
    } finally {
      db.close();
    }
  });
});
