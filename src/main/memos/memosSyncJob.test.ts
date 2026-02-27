// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import type { MemosClient } from './memosClient';
import {
  MEMOS_SYNC_STATUS,
  mergePulledServerMemoIntoLocalMemo,
  runMemosRefreshOneMemo,
  runMemosSyncOneMemoJob,
} from './memosSyncJob';
import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-memos-sync-job-'));
}

function insertMemo(
  db: Database.Database,
  args: {
    localUuid: string;
    serverMemoId?: string | null;
    serverMemoName?: string | null;
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
        @server_memo_id,
        @server_memo_name,
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
    server_memo_id: args.serverMemoId ?? null,
    server_memo_name: args.serverMemoName ?? null,
    content: args.content,
    visibility: args.visibility,
    sync_status: args.syncStatus,
    created_at_ms: args.createdAtMs,
    updated_at_ms: args.updatedAtMs,
  });
}

function insertAttachment(
  db: Database.Database,
  args: {
    id: string;
    memoLocalUuid: string;
    localRelpath: string;
    cacheKey?: string;
    serverAttachmentName?: string | null;
    createdAtMs: number;
    updatedAtMs: number;
  }
): void {
  db.prepare(
    `
      INSERT INTO memo_attachments(
        id,
        memo_local_uuid,
        server_attachment_name,
        local_relpath,
        cache_relpath,
        cache_key,
        created_at_ms,
        updated_at_ms
      ) VALUES(
        @id,
        @memo_local_uuid,
        @server_attachment_name,
        @local_relpath,
        NULL,
        @cache_key,
        @created_at_ms,
        @updated_at_ms
      )
    `
  ).run({
    id: args.id,
    memo_local_uuid: args.memoLocalUuid,
    server_attachment_name: args.serverAttachmentName ?? null,
    local_relpath: args.localRelpath,
    cache_key: args.cacheKey ?? `att_${args.id}`,
    created_at_ms: args.createdAtMs,
    updated_at_ms: args.updatedAtMs,
  });
}

function readMemo(
  db: Database.Database,
  localUuid: string
): {
  local_uuid: string;
  server_memo_id: string | null;
  server_memo_name: string | null;
  content: string;
  visibility: string;
  sync_status: string;
  last_error: string | null;
  updated_at_ms: number;
} {
  const row = db
    .prepare(
      `
        SELECT
          local_uuid,
          server_memo_id,
          server_memo_name,
          content,
          visibility,
          sync_status,
          last_error,
          updated_at_ms
        FROM memos
        WHERE local_uuid = ?
      `
    )
    .get(localUuid) as
    | {
        local_uuid: string;
        server_memo_id: string | null;
        server_memo_name: string | null;
        content: string;
        visibility: string;
        sync_status: string;
        last_error: string | null;
        updated_at_ms: number;
      }
    | undefined;
  if (!row) throw new Error('memo 不存在');
  return row;
}

describe('src/main/memos/memosSyncJob', () => {
  it('根据 server_memo_id 选择 CreateMemo vs UpdateMemo', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      insertMemo(db, {
        localUuid: 'memo_local_create',
        serverMemoId: null,
        content: 'c1',
        visibility: 'PRIVATE',
        syncStatus: MEMOS_SYNC_STATUS.dirty,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });
      insertMemo(db, {
        localUuid: 'memo_local_update',
        serverMemoId: '123',
        serverMemoName: null,
        content: 'c2',
        visibility: 'PUBLIC',
        syncStatus: MEMOS_SYNC_STATUS.dirty,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });

      const createMemo = vi.fn(async () => ({
        ok: true,
        status: 200,
        requestId: 'cli',
        responseRequestIdHeader: 'srv',
        value: { name: 'memos/999', content: 'c1', visibility: 'PRIVATE' },
      }));
      const updateMemo = vi.fn(async (args: { memoName: string; updateMask: string[] }) => {
        expect(args.memoName).toBe('memos/123');
        expect(args.updateMask).toEqual(['content', 'visibility']);
        return {
          ok: true,
          status: 200,
          requestId: 'cli',
          responseRequestIdHeader: 'srv',
          value: { name: 'memos/123', content: 'c2', visibility: 'PUBLIC' },
        };
      });
      const setMemoAttachments = vi.fn(async () => ({
        ok: true,
        status: 200,
        requestId: 'cli',
        responseRequestIdHeader: 'srv',
        value: null,
      }));

      const memosClient = {
        createMemo,
        updateMemo,
        setMemoAttachments,
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

      const createOut = await runMemosSyncOneMemoJob({
        db,
        memosClient,
        storageRootAbsPath: dir,
        memoLocalUuid: 'memo_local_create',
        nowMs: () => nowMs,
      });
      expect(createOut.kind).toBe('synced');

      const updateOut = await runMemosSyncOneMemoJob({
        db,
        memosClient,
        storageRootAbsPath: dir,
        memoLocalUuid: 'memo_local_update',
        nowMs: () => nowMs,
      });
      expect(updateOut.kind).toBe('synced');

      expect(createMemo).toHaveBeenCalledTimes(1);
      expect(updateMemo).toHaveBeenCalledTimes(1);
      expect(setMemoAttachments).toHaveBeenCalledTimes(2);

      const r1 = readMemo(db, 'memo_local_create');
      expect(r1.sync_status).toBe(MEMOS_SYNC_STATUS.synced);
      expect(r1.server_memo_name).toBe('memos/999');
      expect(r1.server_memo_id).toBe('999');
      expect(r1.last_error).toBeNull();

      const r2 = readMemo(db, 'memo_local_update');
      expect(r2.sync_status).toBe(MEMOS_SYNC_STATUS.synced);
      expect(r2.server_memo_id).toBe('123');
      expect(r2.server_memo_name).toBe('memos/123');
      expect(r2.last_error).toBeNull();
    } finally {
      db.close();
    }
  });

  it('sync_status=LOCAL_ONLY 时不得自动回写到 Memos（跳过 create/update）', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      const nowMs = 1700000000000;

      insertMemo(db, {
        localUuid: 'memo_local_only_1',
        serverMemoId: null,
        serverMemoName: null,
        content: 'local_only_content',
        visibility: 'PRIVATE',
        syncStatus: MEMOS_SYNC_STATUS.localOnly,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });

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

      const out = await runMemosSyncOneMemoJob({
        db,
        memosClient,
        storageRootAbsPath: dir,
        memoLocalUuid: 'memo_local_only_1',
        nowMs: () => nowMs + 1,
      });

      expect(out).toEqual({ kind: 'skipped', reason: 'local_only' });
      expect(createMemo).toHaveBeenCalledTimes(0);
    } finally {
      db.close();
    }
  });

  it('附件上传顺序必须是 CreateAttachment* -> SetMemoAttachments', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      const nowMs = 1700000000000;

      insertMemo(db, {
        localUuid: 'memo_local_1',
        serverMemoId: null,
        content: 'hello',
        visibility: 'PRIVATE',
        syncStatus: MEMOS_SYNC_STATUS.dirty,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });
      insertAttachment(db, {
        id: 'att_a',
        memoLocalUuid: 'memo_local_1',
        localRelpath: 'attachments/a.bin',
        createdAtMs: nowMs + 1,
        updatedAtMs: nowMs + 1,
      });
      insertAttachment(db, {
        id: 'att_b',
        memoLocalUuid: 'memo_local_1',
        localRelpath: 'attachments/b.bin',
        createdAtMs: nowMs + 2,
        updatedAtMs: nowMs + 2,
      });

      const seq: string[] = [];
      const memosClient = {
        createMemo: vi.fn(async () => {
          seq.push('CreateMemo');
          return {
            ok: true,
            status: 200,
            requestId: 'cli',
            responseRequestIdHeader: 'srv',
            value: { name: 'memos/1', content: 'hello' },
          };
        }),
        updateMemo: vi.fn(async () => {
          throw new Error('unexpected');
        }),
        createAttachment: vi.fn(async (args: { attachmentId?: string }) => {
          seq.push(`CreateAttachment:${String(args.attachmentId)}`);
          return {
            ok: true,
            status: 200,
            requestId: 'cli',
            responseRequestIdHeader: 'srv',
            value: { name: `attachments/${String(args.attachmentId)}` },
          };
        }),
        setMemoAttachments: vi.fn(
          async (args: { memoName: string; attachments: Array<{ name?: string }> }) => {
            seq.push('SetMemoAttachments');
            expect(args.memoName).toBe('memos/1');
            expect(args.attachments.map((a) => a.name)).toEqual([
              'attachments/att_a',
              'attachments/att_b',
            ]);
            return {
              ok: true,
              status: 200,
              requestId: 'cli',
              responseRequestIdHeader: 'srv',
              value: null,
            };
          }
        ),
        getMemo: vi.fn(),
        listMemos: vi.fn(),
        deleteMemo: vi.fn(),
        getAttachment: vi.fn(),
        updateAttachment: vi.fn(),
        deleteAttachment: vi.fn(),
        listMemoAttachments: vi.fn(),
      } as unknown as MemosClient;

      const out = await runMemosSyncOneMemoJob({
        db,
        memosClient,
        storageRootAbsPath: dir,
        memoLocalUuid: 'memo_local_1',
        nowMs: () => nowMs,
        loadAttachmentContentBase64: async () => 'YQ==',
      });

      expect(out.kind).toBe('synced');
      expect(seq).toEqual([
        'CreateMemo',
        'CreateAttachment:att_a',
        'CreateAttachment:att_b',
        'SetMemoAttachments',
      ]);
    } finally {
      db.close();
    }
  });

  it.each([MEMOS_SYNC_STATUS.dirty, MEMOS_SYNC_STATUS.syncing])(
    '回拉刷新：本地为 %s 时不得覆盖 content/visibility',
    async (status) => {
      const dir = makeTempDir();
      const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
      const { db } = openSqliteDatabase({ dbFileAbsPath });
      try {
        applyMigrations(db);
        const nowMs = 1700000000000;

        insertMemo(db, {
          localUuid: 'memo_local_2',
          serverMemoId: '123',
          serverMemoName: 'memos/123',
          content: 'local_content',
          visibility: 'PRIVATE',
          syncStatus: status,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
        });

        const memosClient = {
          getMemo: vi.fn(async () => ({
            ok: true,
            status: 200,
            requestId: 'cli',
            responseRequestIdHeader: 'srv',
            value: { name: 'memos/123', content: 'server_content', visibility: 'PUBLIC' },
          })),
          createMemo: vi.fn(),
          updateMemo: vi.fn(),
          setMemoAttachments: vi.fn(),
          createAttachment: vi.fn(),
          listMemos: vi.fn(),
          deleteMemo: vi.fn(),
          getAttachment: vi.fn(),
          updateAttachment: vi.fn(),
          deleteAttachment: vi.fn(),
          listMemoAttachments: vi.fn(),
        } as unknown as MemosClient;

        const out = await runMemosRefreshOneMemo({
          db,
          memosClient,
          memoLocalUuid: 'memo_local_2',
          nowMs: () => nowMs + 10,
        });
        expect(out.kind).toBe('refreshed');

        const row = readMemo(db, 'memo_local_2');
        expect(row.content).toBe('local_content');
        expect(row.visibility).toBe('PRIVATE');
      } finally {
        db.close();
      }
    }
  );

  it('mergePulledServerMemoIntoLocalMemo：非 DIRTY/SYNCING 时允许覆盖 content/visibility', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      const nowMs = 1700000000000;
      insertMemo(db, {
        localUuid: 'memo_local_3',
        serverMemoId: '2',
        serverMemoName: 'memos/2',
        content: 'local',
        visibility: 'PRIVATE',
        syncStatus: MEMOS_SYNC_STATUS.synced,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });

      mergePulledServerMemoIntoLocalMemo({
        db,
        localUuid: 'memo_local_3',
        serverMemo: { name: 'memos/2', content: 'server', visibility: 'PUBLIC' },
        nowMs: () => nowMs + 1,
      });

      const row = readMemo(db, 'memo_local_3');
      expect(row.content).toBe('server');
      expect(row.visibility).toBe('PUBLIC');
    } finally {
      db.close();
    }
  });
});
