// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { createNotesListRepo } from './notesListRepo';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-notes-list-repo-'));
}

function seedMemos(db: ReturnType<typeof openSqliteDatabase>['db']) {
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
      'PRIVATE',
      @sync_status,
      NULL,
      @created_at_ms,
      @updated_at_ms
    )`
  ).run({
    local_uuid: 'memo_synced_1',
    content: '# 已同步 Memo\n正文',
    sync_status: 'SYNCED',
    created_at_ms: 1000,
    updated_at_ms: 3000,
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
      'PRIVATE',
      @sync_status,
      NULL,
      @created_at_ms,
      @updated_at_ms
    )`
  ).run({
    local_uuid: 'memo_dirty_1',
    content: '# 待同步 Memo\n正文',
    sync_status: 'DIRTY',
    created_at_ms: 1100,
    updated_at_ms: 4000,
  });
}

function seedFlowNotes(db: ReturnType<typeof openSqliteDatabase>['db']) {
  db.prepare(
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
      '[]',
      @client_updated_at_ms,
      @created_at,
      @updated_at,
      @deleted_at,
      @provider_reason,
      NULL,
      NULL
    )`
  ).run({
    id: 'flow_alive_1',
    title: 'Flow 活跃笔记',
    body_md: 'flow 正文',
    client_updated_at_ms: 1200,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:05.000Z',
    deleted_at: null,
    provider_reason: 'memos_network_or_timeout',
  });

  db.prepare(
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
      '[]',
      @client_updated_at_ms,
      @created_at,
      @updated_at,
      @deleted_at,
      @provider_reason,
      NULL,
      NULL
    )`
  ).run({
    id: 'flow_trash_1',
    title: 'Flow 回收站笔记',
    body_md: 'flow deleted',
    client_updated_at_ms: 900,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:10.000Z',
    deleted_at: '2026-01-03T00:00:00.000Z',
    provider_reason: 'memos_unauthorized',
  });
}

describe('src/main/notes/notesListRepo', () => {
  it('listItems: timeline/inbox/trash 应按 scope 返回完整 NotesListItem 字段', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      seedMemos(db);
      seedFlowNotes(db);
      const repo = createNotesListRepo(db);

      const timeline = repo.listItems({ scope: 'timeline', page: 0, pageSize: 20 });
      expect(timeline.items.length).toBeGreaterThanOrEqual(3);
      expect(
        timeline.items.every((item) => {
          return (
            typeof item.id === 'string' &&
            typeof item.title === 'string' &&
            typeof item.preview === 'string' &&
            typeof item.updatedAtMs === 'number'
          );
        })
      ).toBe(true);

      const inbox = repo.listItems({ scope: 'inbox', page: 0, pageSize: 20 });
      expect(inbox.items.find((item) => item.id === 'memo_dirty_1')?.provider).toBe('memos');
      expect(inbox.items.find((item) => item.id === 'memo_synced_1')).toBeUndefined();

      const trash = repo.listItems({ scope: 'trash', page: 0, pageSize: 20 });
      expect(trash.items.map((item) => item.id)).toContain('flow_trash_1');
      expect(trash.items.find((item) => item.id === 'flow_alive_1')).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('delete/restore/hardDelete: flow_notes 与 memos 都应满足回收站与恢复语义', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      seedMemos(db);
      seedFlowNotes(db);
      const repo = createNotesListRepo(db);

      repo.deleteItem({ id: 'flow_alive_1', provider: 'flow_notes' });
      const afterDelete = repo.listItems({ scope: 'trash', page: 0, pageSize: 20 });
      expect(afterDelete.items.map((item) => item.id)).toContain('flow_alive_1');

      repo.restoreItem({ id: 'flow_alive_1', provider: 'flow_notes' });
      const afterRestore = repo.listItems({ scope: 'timeline', page: 0, pageSize: 20 });
      expect(afterRestore.items.map((item) => item.id)).toContain('flow_alive_1');

      repo.hardDeleteItem({ id: 'flow_alive_1', provider: 'flow_notes' });
      const afterHardDelete = repo.listItems({ scope: 'timeline', page: 0, pageSize: 20 });
      expect(afterHardDelete.items.find((item) => item.id === 'flow_alive_1')).toBeUndefined();

      repo.deleteItem({ id: 'memo_dirty_1', provider: 'memos' });
      const afterMemoDeleteTimeline = repo.listItems({ scope: 'timeline', page: 0, pageSize: 20 });
      expect(
        afterMemoDeleteTimeline.items.find((item) => item.id === 'memo_dirty_1')
      ).toBeUndefined();
      const afterMemoDeleteTrash = repo.listItems({ scope: 'trash', page: 0, pageSize: 20 });
      expect(afterMemoDeleteTrash.items.find((item) => item.id === 'memo_dirty_1')).toBeTruthy();

      repo.restoreItem({ id: 'memo_dirty_1', provider: 'memos' });
      const afterMemoRestoreTimeline = repo.listItems({ scope: 'timeline', page: 0, pageSize: 20 });
      expect(
        afterMemoRestoreTimeline.items.find((item) => item.id === 'memo_dirty_1')
      ).toBeTruthy();

      repo.deleteItem({ id: 'memo_dirty_1', provider: 'memos' });
      repo.hardDeleteItem({ id: 'memo_dirty_1', provider: 'memos' });
      const afterMemoHardDeleteTimeline = repo.listItems({
        scope: 'timeline',
        page: 0,
        pageSize: 20,
      });
      const afterMemoHardDeleteTrash = repo.listItems({ scope: 'trash', page: 0, pageSize: 20 });
      expect(
        afterMemoHardDeleteTimeline.items.find((item) => item.id === 'memo_dirty_1')
      ).toBeUndefined();
      expect(
        afterMemoHardDeleteTrash.items.find((item) => item.id === 'memo_dirty_1')
      ).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
