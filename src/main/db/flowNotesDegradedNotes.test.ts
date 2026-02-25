// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { FlowNotesDegradedNotesRepo } from '../notes/flowNotesDegradedNotesRepo';
import type { NotesRoutedResult } from '../notes/notesRouter';

import { applyMigrations } from './migrations';
import { openSqliteDatabase } from './sqlite';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-flow-notes-degraded-'));
}

function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function listColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe('Task 51: Flow Notes（降级 provider）本地表与边界', () => {
  it('迁移后必须存在 notes 表，且包含 tombstone 与诊断字段', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const tables = listTables(db);
      expect(tables).toContain('notes');

      const columns = listColumns(db, 'notes');
      expect(columns).toContain('deleted_at');
      expect(columns).toContain('last_request_id');
      expect(columns).toContain('last_error');
      expect(columns).toContain('provider_reason');
    } finally {
      db.close();
    }
  });

  it('边界：provider=memos 时写入必须被拒绝；provider=flow_notes（single/degraded）可写入', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const repo = new FlowNotesDegradedNotesRepo(db);

      const memosDecision = {
        kind: 'single',
        provider: 'memos',
      } as unknown as NotesRoutedResult<unknown>;

      expect(() =>
        repo.upsertNote(
          memosDecision,
          {
            id: 'n1',
            title: 't',
            body_md: 'b',
            tags: ['a'],
            client_updated_at_ms: 1,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          { requestId: 'req-memos' }
        )
      ).toThrow(/最终 provider 为 FlowNotes/);

      const degradedDecision = {
        kind: 'degraded',
        provider: 'flow_notes',
        degradeReason: 'memos_network_or_timeout',
      } as unknown as NotesRoutedResult<unknown>;

      expect(() =>
        repo.upsertNote(
          degradedDecision,
          {
            id: 'n1',
            title: '标题',
            body_md: '正文',
            tags: ['tag1', 'tag2'],
            client_updated_at_ms: 2,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
          },
          { requestId: 'req-flow', lastError: null }
        )
      ).not.toThrow();

      const row = repo.getNoteById(degradedDecision, 'n1');
      expect(row).not.toBeNull();
      expect(row?.provider_reason).toBe('memos_network_or_timeout');
      expect(row?.last_request_id).toBe('req-flow');
      expect(row?.last_error).toBeNull();

      const tags = JSON.parse(row?.tags_json ?? '[]');
      expect(tags).toEqual(['tag1', 'tag2']);
    } finally {
      db.close();
    }
  });

  it("允许写入：kind='single' 且 provider='flow_notes'（memosBaseUrl invalid）", () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');

    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const repo = new FlowNotesDegradedNotesRepo(db);

      const singleFlowDecision = {
        kind: 'single',
        provider: 'flow_notes',
        providerReason: 'memos_base_url_invalid',
      } as unknown as NotesRoutedResult<unknown>;

      expect(() =>
        repo.upsertNote(
          singleFlowDecision,
          {
            id: 'n2',
            title: '直连 FlowNotes',
            body_md: 'body',
            tags: [],
            client_updated_at_ms: 1,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          { requestId: 'req-flow-single', lastError: 'oops' }
        )
      ).not.toThrow();

      const row = repo.getNoteById(singleFlowDecision, 'n2');
      expect(row).not.toBeNull();
      expect(row?.provider_reason).toBe('memos_base_url_invalid');
    } finally {
      db.close();
    }
  });
});
