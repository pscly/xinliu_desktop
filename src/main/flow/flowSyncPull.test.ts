// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import type { FlowClient } from './flowClient';
import { runFlowSyncPull } from './flowSyncPull';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-flow-sync-pull-'));
}

function readCursor(db: Database.Database, key = 'flow_sync_pull_cursor'): number {
  const row = db
    .prepare('SELECT value_json AS v FROM sync_state WHERE key = ?')
    .get(key) as { v: string } | undefined;
  if (!row) return 0;
  const parsed = JSON.parse(row.v) as { cursor?: unknown };
  return typeof parsed.cursor === 'number' ? parsed.cursor : 0;
}

function writeCursor(db: Database.Database, cursor: number, key = 'flow_sync_pull_cursor'): void {
  db.prepare('INSERT INTO sync_state (key, value_json, updated_at_ms) VALUES (?, ?, ?)')
    .run(key, JSON.stringify({ cursor }), 1);
}

describe('src/main/flow/flowSyncPull', () => {
  it('has_more 两页循环：cursor 严格使用上一轮 next_cursor；apply 成功后推进 sync_state', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const syncPull = vi.fn(async ({ cursor }: { cursor?: number; limit?: number }) => {
        if (cursor === 0) {
          return {
            ok: true,
            status: 200,
            requestId: 'cli-1',
            responseRequestIdHeader: 'srv-1',
            value: {
              cursor: 0,
              next_cursor: 10,
              has_more: true,
              changes: {
                notes: [],
                user_settings: [
                  {
                    key: 'k1',
                    value_json: { a: 1 },
                    client_updated_at_ms: 1,
                    updated_at: '2026-02-01T00:00:00Z',
                    deleted_at: null,
                  },
                ],
                todo_lists: [
                  {
                    id: 'l1',
                    name: 'L',
                    color: null,
                    sort_order: 0,
                    archived: false,
                    client_updated_at_ms: 1,
                    updated_at: '2026-02-01T00:00:00Z',
                    deleted_at: null,
                  },
                ],
                todo_items: [
                  {
                    id: 'i1',
                    list_id: 'l1',
                    parent_id: null,
                    title: 'T',
                    note: '',
                    status: 'todo',
                    priority: 0,
                    due_at_local: null,
                    completed_at_local: null,
                    sort_order: 0,
                    tags: ['a', 'b'],
                    is_recurring: true,
                    rrule: null,
                    dtstart_local: null,
                    tzid: 'Asia/Shanghai',
                    reminders: [{ kind: 'at', at: '2026-02-01T10:00:00' }],
                    client_updated_at_ms: 2,
                    updated_at: '2026-02-01T00:00:00Z',
                    deleted_at: null,
                  },
                ],
                todo_occurrences: [],
                collection_items: [
                  {
                    id: 'c1',
                    item_type: 'folder',
                    parent_id: null,
                    name: 'F',
                    color: null,
                    ref_type: null,
                    ref_id: null,
                    sort_order: 0,
                    client_updated_at_ms: 10,
                    created_at: '2026-02-01T00:00:00Z',
                    updated_at: '2026-02-01T00:00:00Z',
                    deleted_at: null,
                  },
                ],
              },
            },
          };
        }

        if (cursor === 10) {
          return {
            ok: true,
            status: 200,
            requestId: 'cli-2',
            responseRequestIdHeader: 'srv-2',
            value: {
              cursor: 10,
              next_cursor: 20,
              has_more: false,
              changes: {
                notes: [],
                user_settings: [],
                todo_lists: [],
                todo_items: [],
                todo_occurrences: [],
                collection_items: [
                  {
                    id: 'c1',
                    item_type: 'folder',
                    parent_id: null,
                    name: 'F',
                    color: null,
                    ref_type: null,
                    ref_id: null,
                    sort_order: 0,
                    client_updated_at_ms: 11,
                    created_at: '2026-02-01T00:00:00Z',
                    updated_at: '2026-02-02T00:00:00Z',
                    deleted_at: '2026-02-02T00:00:00Z',
                  },
                ],
              },
            },
          };
        }

        throw new Error(`unexpected cursor: ${cursor}`);
      });

      const flowClient = {
        syncPull,
        syncPush: vi.fn(),
      } as unknown as FlowClient;

      const out = await runFlowSyncPull({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => 1700000000000,
        flowClient,
      });

      expect(out.kind).toBe('completed');
      expect(syncPull).toHaveBeenCalledTimes(2);
      expect(syncPull).toHaveBeenNthCalledWith(1, { cursor: 0, limit: 200 });
      expect(syncPull).toHaveBeenNthCalledWith(2, { cursor: 10, limit: 200 });
      expect(readCursor(db)).toBe(20);

      const tagsJson = (db.prepare('SELECT tags_json AS v FROM todo_items WHERE id = ?').get('i1') as {
        v: string;
      }).v;
      expect(tagsJson).toBe('["a","b"]');
      const remindersJson = (
        db.prepare('SELECT reminders_json AS v FROM todo_items WHERE id = ?').get('i1') as { v: string }
      ).v;
      expect(JSON.parse(remindersJson)).toEqual([{ kind: 'at', at: '2026-02-01T10:00:00' }]);

      const deletedAt = (
        db.prepare('SELECT deleted_at AS d FROM collection_items WHERE id = ?').get('c1') as { d: string | null }
      ).d;
      expect(deletedAt).toBe('2026-02-02T00:00:00Z');
    } finally {
      db.close();
    }
  });

  it('apply 失败：必须停止并保持旧 cursor（不推进 sync_state）', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);
      writeCursor(db, 5);

      const syncPull = vi.fn(async () => ({
        ok: true,
        status: 200,
        requestId: 'cli-1',
        responseRequestIdHeader: 'srv-1',
        value: {
          cursor: 5,
          next_cursor: 6,
          has_more: false,
          changes: {
            notes: [],
            user_settings: [],
            todo_lists: [],
            todo_items: [
              {
                id: 'i_bad',
                list_id: 'list_missing',
                parent_id: null,
                title: 'bad',
                note: '',
                status: 'todo',
                priority: 0,
                due_at_local: null,
                completed_at_local: null,
                sort_order: 0,
                tags: [],
                is_recurring: false,
                rrule: null,
                dtstart_local: null,
                tzid: 'Asia/Shanghai',
                reminders: [],
                client_updated_at_ms: 1,
                updated_at: '2026-02-01T00:00:00Z',
                deleted_at: null,
              },
            ],
            todo_occurrences: [],
            collection_items: [],
          },
        },
      }));

      const flowClient = {
        syncPull,
        syncPush: vi.fn(),
      } as unknown as FlowClient;

      const out = await runFlowSyncPull({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => 1700000000000,
        flowClient,
      });

      expect(out.kind).toBe('apply_failed');
      expect(readCursor(db)).toBe(5);
      const c = (db.prepare('SELECT COUNT(*) AS c FROM todo_items').get() as { c: number }).c;
      expect(c).toBe(0);
    } finally {
      db.close();
    }
  });

  it('未知 changes key：应容错忽略且记录日志（console.warn）', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      applyMigrations(db);

      const syncPull = vi.fn(async () => ({
        ok: true,
        status: 200,
        requestId: 'cli-1',
        responseRequestIdHeader: 'srv-1',
        value: {
          cursor: 0,
          next_cursor: 1,
          has_more: false,
          changes: {
            notes: [],
            user_settings: [],
            todo_lists: [],
            todo_items: [],
            todo_occurrences: [],
            collection_items: [],
            weird_stuff: [],
          } as unknown,
        },
      }));

      const flowClient = {
        syncPull,
        syncPush: vi.fn(),
      } as unknown as FlowClient;

      const out = await runFlowSyncPull({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => 1700000000000,
        flowClient,
      });

      expect(out.kind).toBe('completed');
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('weird_stuff');
    } finally {
      warn.mockRestore();
      db.close();
    }
  });

  it('collection_items：支持 upsert 与 tombstone；older client_updated_at_ms 不覆盖 newer', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const makeFlowClient = (page: {
        cursor: number;
        next_cursor: number;
        item: Record<string, unknown>;
      }) =>
        ({
          syncPull: vi.fn(async () => ({
            ok: true,
            status: 200,
            requestId: 'cli',
            responseRequestIdHeader: 'srv',
            value: {
              cursor: page.cursor,
              next_cursor: page.next_cursor,
              has_more: false,
              changes: {
                notes: [],
                user_settings: [],
                todo_lists: [],
                todo_items: [],
                todo_occurrences: [],
                collection_items: [page.item],
              },
            },
          })),
          syncPush: vi.fn(),
        }) as unknown as FlowClient;

      const baseItem = {
        id: 'c1',
        item_type: 'folder',
        parent_id: null,
        name: 'F',
        color: null,
        ref_type: null,
        ref_id: null,
        sort_order: 0,
        created_at: '2026-02-01T00:00:00Z',
      };

      await runFlowSyncPull({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => 1,
        flowClient: makeFlowClient({
          cursor: 0,
          next_cursor: 1,
          item: {
            ...baseItem,
            client_updated_at_ms: 1000,
            updated_at: '2026-02-01T00:00:00Z',
            deleted_at: null,
          },
        }),
      });

      await runFlowSyncPull({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => 2,
        flowClient: makeFlowClient({
          cursor: 1,
          next_cursor: 2,
          item: {
            ...baseItem,
            client_updated_at_ms: 2000,
            updated_at: '2026-02-02T00:00:00Z',
            deleted_at: '2026-02-02T00:00:00Z',
          },
        }),
      });

      await runFlowSyncPull({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => 3,
        flowClient: makeFlowClient({
          cursor: 2,
          next_cursor: 3,
          item: {
            ...baseItem,
            client_updated_at_ms: 1500,
            updated_at: '2026-02-03T00:00:00Z',
            deleted_at: null,
          },
        }),
      });

      const row = db
        .prepare('SELECT deleted_at AS d, client_updated_at_ms AS ms FROM collection_items WHERE id = ?')
        .get('c1') as { d: string | null; ms: number };
      expect(row.ms).toBe(2000);
      expect(row.d).toBe('2026-02-02T00:00:00Z');
    } finally {
      db.close();
    }
  });
});
