// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyMigrations, MIGRATIONS } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { queryGlobalSearch } from './globalSearch';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-global-search-'));
}

describe('src/main/search/globalSearch', () => {
  it('FTS：单次查询返回一页结果，并可翻页', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db);

      const keyword = 'alpha';
      for (let i = 0; i < 33; i += 1) {
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
              'PRIVATE',
              'LOCAL_ONLY',
              NULL,
              @created_at_ms,
              @updated_at_ms
            )
          `
        ).run({
          local_uuid: `memo_${i}`,
          content: `这是第 ${i} 条 memo，包含关键词 ${keyword}，用于测试分页。`,
          created_at_ms: 1000 + i,
          updated_at_ms: 2000 + i,
        });
      }

      const p0 = queryGlobalSearch(db, { query: keyword, page: 0, pageSize: 20 });
      expect(p0.mode).toBe('fts');
      expect(p0.ftsAvailable).toBe(true);
      expect(p0.items).toHaveLength(20);
      expect(p0.hasMore).toBe(true);
      expect(p0.items.some((x) => (x.matchSnippet ?? '').includes('<mark>'))).toBe(true);

      const p1 = queryGlobalSearch(db, { query: keyword, page: 1, pageSize: 20 });
      expect(p1.mode).toBe('fts');
      expect(p1.ftsAvailable).toBe(true);
      expect(p1.items.length).toBeGreaterThan(0);

      const ids0 = new Set(p0.items.map((x) => `${x.kind}:${x.id}`));
      const ids1 = new Set(p1.items.map((x) => `${x.kind}:${x.id}`));
      const overlap = Array.from(ids0).some((id) => ids1.has(id));
      expect(overlap).toBe(false);
    } finally {
      db.close();
    }
  });

  it('降级：当 FTS 表缺失时仍可返回分页结果，并标记 ftsAvailable=false', () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });
    try {
      applyMigrations(db, MIGRATIONS.slice(0, 6));

      db.prepare(
        `
          INSERT INTO todo_lists(
            id,
            name,
            color,
            sort_order,
            archived,
            client_updated_at_ms,
            updated_at,
            deleted_at
          ) VALUES(
            'list_1',
            '收敛任务',
            NULL,
            0,
            0,
            1,
            '2026-02-26T00:00:00.000Z',
            NULL
          )
        `
      ).run();

      db.prepare(
        `
          INSERT INTO todo_items(
            id,
            list_id,
            parent_id,
            title,
            note,
            status,
            priority,
            due_at_local,
            completed_at_local,
            sort_order,
            tags_json,
            is_recurring,
            rrule,
            dtstart_local,
            tzid,
            reminders_json,
            client_updated_at_ms,
            updated_at,
            deleted_at
          ) VALUES(
            'item_1',
            'list_1',
            NULL,
            '实现全局搜索',
            '需要覆盖 Notes/Todo/Collections',
            'todo',
            0,
            NULL,
            NULL,
            0,
            '[]',
            0,
            NULL,
            NULL,
            'Asia/Shanghai',
            '[]',
            2,
            '2026-02-26T00:00:01.000Z',
            NULL
          )
        `
      ).run();

      const res = queryGlobalSearch(db, { query: '全局搜索', page: 0, pageSize: 20 });
      expect(res.mode).toBe('fallback');
      expect(res.ftsAvailable).toBe(false);
      expect(res.degradedReason).toBe('fts_table_missing');
      expect(res.items.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
