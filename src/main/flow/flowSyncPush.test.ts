// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { applyMigrations } from '../db/migrations';
import { openSqliteDatabase } from '../db/sqlite';
import { type FlowClient } from './flowClient';
import { runFlowSyncPush } from './flowSyncPush';
import { FLOW_OP, FLOW_RESOURCE, OUTBOX_STATUS, enqueueFlowOutboxMutation } from '../sync/outbox';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-flow-sync-push-'));
}

function getOutboxRow(db: Database.Database, id: string): {
  id: string;
  status: string;
  attempt: number;
  next_retry_at_ms: number;
  last_error_code: string | null;
  last_error_message: string | null;
  request_id: string | null;
} {
  const row = db
    .prepare(
      `
        SELECT id, status, attempt, next_retry_at_ms, last_error_code, last_error_message, request_id
        FROM outbox_mutations
        WHERE id = ?
      `
    )
    .get(id) as
    | {
        id: string;
        status: string;
        attempt: number;
        next_retry_at_ms: number;
        last_error_code: string | null;
        last_error_message: string | null;
        request_id: string | null;
      }
    | undefined;

  if (!row) throw new Error('outbox row 不存在');
  return row;
}

describe('src/main/flow/flowSyncPush', () => {
  it('applied/rejected 混合：applied 标记 APPLIED；conflict 标记 REJECTED_CONFLICT 并保存 server；语义失败标记 FAILED_FATAL', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      const a = enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoItem,
        op: FLOW_OP.upsert,
        entityId: 'item_a',
        clientUpdatedAtMs: nowMs,
        data: { list_id: 'l', title: 'a' },
        nowMs,
      }).id;
      const b = enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoItem,
        op: FLOW_OP.upsert,
        entityId: 'item_b',
        clientUpdatedAtMs: nowMs + 1,
        data: { list_id: 'l', title: 'b' },
        nowMs,
      }).id;
      const c = enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.todoItem,
        op: FLOW_OP.upsert,
        entityId: 'item_c',
        clientUpdatedAtMs: nowMs + 2,
        data: { list_id: 'l', title: 'c' },
        nowMs,
      }).id;

      const syncPush = vi.fn(async (req: { mutations: Array<{ entity_id: string }> }) => {
        const inflightCount = Number(
          (db
            .prepare('SELECT COUNT(*) AS c FROM outbox_mutations WHERE status = ?')
            .get(OUTBOX_STATUS.inflight) as { c: number }).c
        );
        expect(inflightCount).toBe(3);
        expect(req.mutations.length).toBe(3);

        return {
          ok: true,
          status: 200,
          requestId: 'cli-1',
          responseRequestIdHeader: 'srv-1',
          value: {
            cursor: 1,
            applied: [{ resource: 'todo_item', entity_id: 'item_a' }],
            rejected: [
              {
                resource: 'todo_item',
                entity_id: 'item_b',
                reason: 'conflict',
                server: { id: 'item_b', client_updated_at_ms: nowMs + 10 },
              },
              {
                resource: 'todo_item',
                entity_id: 'item_c',
                reason: 'validation_error',
                server: null,
              },
            ],
          },
        };
      });

      const flowClient = {
        syncPush,
        syncPull: vi.fn(),
      } as unknown as FlowClient;

      const out = await runFlowSyncPush({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => nowMs,
        batchSize: 100,
        flowClient,
      });

      expect(out.kind).toBe('completed');

      expect(getOutboxRow(db, a).status).toBe(OUTBOX_STATUS.applied);
      expect(getOutboxRow(db, a).request_id).toBe('srv-1');

      const bRow = getOutboxRow(db, b);
      expect(bRow.status).toBe(OUTBOX_STATUS.rejectedConflict);
      expect(bRow.last_error_code).toBe('conflict');
      expect(bRow.request_id).toBe('srv-1');
      expect(JSON.parse(bRow.last_error_message ?? '{}').server).toEqual({
        id: 'item_b',
        client_updated_at_ms: nowMs + 10,
      });

      const cRow = getOutboxRow(db, c);
      expect(cRow.status).toBe(OUTBOX_STATUS.failedFatal);
      expect(cRow.last_error_code).toBe('validation_error');
      expect(cRow.request_id).toBe('srv-1');
    } finally {
      db.close();
    }
  });

  it('429：遵守 Retry-After，设置 next_retry_at_ms，并暂停本轮剩余 push（不继续下一批）', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      const ids: string[] = [];
      for (let i = 0; i < 120; i += 1) {
        ids.push(
          enqueueFlowOutboxMutation(db, {
            resource: FLOW_RESOURCE.todoList,
            op: FLOW_OP.upsert,
            entityId: `list_${i}`,
            clientUpdatedAtMs: nowMs + i,
            data: { name: `n${i}` },
            nowMs,
          }).id
        );
      }

      const syncPush = vi.fn(async () => ({
        ok: false,
        error: {
          code: 'HTTP_ERROR',
          message: 'too many requests',
          status: 429,
          requestId: 'cli-429',
          responseRequestIdHeader: 'srv-429',
          errorResponse: { error: 'rate_limited', message: 'too many requests' },
          retryAfterSeconds: 3,
        },
      }));

      const flowClient = {
        syncPush,
        syncPull: vi.fn(),
      } as unknown as FlowClient;

      const out = await runFlowSyncPush({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => nowMs,
        batchSize: 100,
        flowClient,
      });

      expect(syncPush).toHaveBeenCalledTimes(1);
      expect(out.kind).toBe('rate_limited');
      if (out.kind === 'rate_limited') {
        expect(out.retryAfterMs).toBe(3000);
      }

      for (let i = 0; i < 100; i += 1) {
        const row = getOutboxRow(db, ids[i]);
        expect(row.status).toBe(OUTBOX_STATUS.failedRetryable);
        expect(row.attempt).toBe(1);
        expect(row.next_retry_at_ms).toBe(nowMs + 3000);
        expect(row.request_id).toBe('srv-429');
      }
      for (let i = 100; i < 120; i += 1) {
        const row = getOutboxRow(db, ids[i]);
        expect(row.status).toBe(OUTBOX_STATUS.pending);
        expect(row.attempt).toBe(0);
        expect(row.next_retry_at_ms).toBe(nowMs);
        expect(row.request_id).toBeNull();
      }
    } finally {
      db.close();
    }
  });

  it('401：停止自动重试并返回可判定状态（不继续下一批）', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      const ids: string[] = [];
      for (let i = 0; i < 120; i += 1) {
        ids.push(
          enqueueFlowOutboxMutation(db, {
            resource: FLOW_RESOURCE.todoList,
            op: FLOW_OP.upsert,
            entityId: `list_${i}`,
            clientUpdatedAtMs: nowMs + i,
            data: { name: `n${i}` },
            nowMs,
          }).id
        );
      }

      const syncPush = vi.fn(async () => ({
        ok: false,
        error: {
          code: 'HTTP_ERROR',
          message: 'missing token',
          status: 401,
          requestId: 'cli-401',
          responseRequestIdHeader: 'srv-401',
          errorResponse: { error: 'unauthorized', message: 'missing token' },
        },
      }));

      const flowClient = {
        syncPush,
        syncPull: vi.fn(),
      } as unknown as FlowClient;

      const out = await runFlowSyncPush({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => nowMs,
        batchSize: 100,
        flowClient,
      });

      expect(syncPush).toHaveBeenCalledTimes(1);
      expect(out.kind).toBe('need_relogin');

      for (let i = 0; i < 100; i += 1) {
        const row = getOutboxRow(db, ids[i]);
        expect(row.status).toBe(OUTBOX_STATUS.pending);
        expect(row.attempt).toBe(1);
        expect(row.last_error_code).toBe('unauthorized');
        expect(row.request_id).toBe('srv-401');
      }
      for (let i = 100; i < 120; i += 1) {
        const row = getOutboxRow(db, ids[i]);
        expect(row.status).toBe(OUTBOX_STATUS.pending);
        expect(row.attempt).toBe(0);
        expect(row.request_id).toBeNull();
      }
    } finally {
      db.close();
    }
  });

  it('413：自动降低 batch size 拆分推送，最终成功后仍能把所有条目正确标记', async () => {
    const dir = makeTempDir();
    const dbFileAbsPath = path.join(dir, 'xinliu.sqlite3');
    const { db } = openSqliteDatabase({ dbFileAbsPath });

    try {
      applyMigrations(db);

      const nowMs = 1700000000000;
      const ids = ['x1', 'x2', 'x3'].map((eid, i) =>
        enqueueFlowOutboxMutation(db, {
          resource: FLOW_RESOURCE.todoItem,
          op: FLOW_OP.upsert,
          entityId: eid,
          clientUpdatedAtMs: nowMs + i,
          data: { list_id: 'l', title: eid },
          nowMs,
        }).id
      );

      const syncPush = vi.fn(async (req: { mutations: Array<{ entity_id: string }> }) => {
        if (req.mutations.length >= 3) {
          return {
            ok: false,
            error: {
              code: 'HTTP_ERROR',
              message: 'payload too large',
              status: 413,
              requestId: 'cli-413',
              responseRequestIdHeader: 'srv-413',
              errorResponse: { error: 'payload_too_large', message: 'payload too large' },
            },
          };
        }
        return {
          ok: true,
          status: 200,
          requestId: 'cli-ok',
          responseRequestIdHeader: 'srv-ok',
          value: {
            cursor: 1,
            applied: req.mutations.map((m) => ({ resource: 'todo_item', entity_id: m.entity_id })),
            rejected: [],
          },
        };
      });

      const flowClient = {
        syncPush,
        syncPull: vi.fn(),
      } as unknown as FlowClient;

      const out = await runFlowSyncPush({
        db,
        baseUrl: 'https://xl.pscly.cc',
        token: 't',
        deviceId: 'dev',
        deviceName: 'win',
        fetch: vi.fn() as never,
        sleepMs: async () => {},
        nowMs: () => nowMs,
        batchSize: 3,
        flowClient,
      });

      expect(syncPush).toHaveBeenCalledTimes(3);
      expect(out.kind).toBe('completed');
      for (const id of ids) {
        const row = getOutboxRow(db, id);
        expect(row.status).toBe(OUTBOX_STATUS.applied);
        expect(row.request_id).toBe('srv-ok');
      }
    } finally {
      db.close();
    }
  });
});
