// @vitest-environment node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { applyMigrations } from '../db/migrations';
import {
  enforceAttachmentCacheQuota,
  generateOpaqueAttachmentCacheKey,
  upsertMemoAttachmentCacheFile,
} from './attachmentCache';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xinliu-attachment-cache-'));
}

async function writeFileEnsuringDir(absPath: string, sizeBytes: number): Promise<void> {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  await fsp.writeFile(absPath, Buffer.alloc(sizeBytes, 1));
}

describe('src/main/attachments/attachmentCache', () => {
  it('cacheKey：必须是不透明标识（不包含 relpath、无 /、% 等），且符合 memo-res 解析约束', () => {
    const key = generateOpaqueAttachmentCacheKey({
      uuid: () => '00000000-0000-0000-0000-000000000000',
    });
    expect(key).toBe('att_00000000-0000-0000-0000-000000000000');
    expect(key.includes('/')).toBe(false);
    expect(key.includes('\\')).toBe(false);
    expect(key.includes('%')).toBe(false);
    expect(key.includes('attachments-cache')).toBe(false);
    expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
  });

  it('LRU：超限时按 last_access_at_ms 从旧到新驱逐 cache_relpath（不影响 local_relpath）', async () => {
    const root = makeTempDir();
    const dbFile = path.join(root, 'db', 'xinliu.sqlite3');
    await fsp.mkdir(path.dirname(dbFile), { recursive: true });

    const db = new Database(dbFile);
    applyMigrations(db);

    db.prepare(
      `
        INSERT INTO memos(
          local_uuid, server_memo_id, server_memo_name, content, visibility, sync_status,
          last_error, created_at_ms, updated_at_ms
        ) VALUES(
          @local_uuid, NULL, NULL, 'c', 'PRIVATE', 'LOCAL_ONLY', NULL, @created_at_ms, @updated_at_ms
        )
      `
    ).run({ local_uuid: 'm1', created_at_ms: 1, updated_at_ms: 1 });

    const nowBase = 10_000;
    const insertAtt = db.prepare(
      `
        INSERT INTO memo_attachments(
          id, memo_local_uuid, server_attachment_name,
          local_relpath, cache_relpath, cache_key,
          cache_size_bytes, last_access_at_ms,
          created_at_ms, updated_at_ms
        ) VALUES(
          @id, @memo_local_uuid, NULL,
          @local_relpath, @cache_relpath, @cache_key,
          @cache_size_bytes, @last_access_at_ms,
          @created_at_ms, @updated_at_ms
        )
      `
    );

    const a1Key = 'att_a1';
    const a2Key = 'att_a2';
    const a3Key = 'att_a3';

    insertAtt.run({
      id: 'a1',
      memo_local_uuid: 'm1',
      local_relpath: 'attachments/a1.bin',
      cache_relpath: 'attachments-cache/a1.bin',
      cache_key: a1Key,
      cache_size_bytes: 120,
      last_access_at_ms: nowBase + 1,
      created_at_ms: 1,
      updated_at_ms: 1,
    });
    insertAtt.run({
      id: 'a2',
      memo_local_uuid: 'm1',
      local_relpath: 'attachments/a2.bin',
      cache_relpath: 'attachments-cache/a2.bin',
      cache_key: a2Key,
      cache_size_bytes: 140,
      last_access_at_ms: nowBase + 2,
      created_at_ms: 2,
      updated_at_ms: 2,
    });
    insertAtt.run({
      id: 'a3',
      memo_local_uuid: 'm1',
      local_relpath: 'attachments/a3.bin',
      cache_relpath: 'attachments-cache/a3.bin',
      cache_key: a3Key,
      cache_size_bytes: 160,
      last_access_at_ms: nowBase + 3,
      created_at_ms: 3,
      updated_at_ms: 3,
    });

    await writeFileEnsuringDir(path.join(root, 'attachments-cache', 'a1.bin'), 120);
    await writeFileEnsuringDir(path.join(root, 'attachments-cache', 'a2.bin'), 140);
    await writeFileEnsuringDir(path.join(root, 'attachments-cache', 'a3.bin'), 160);

    const res = await enforceAttachmentCacheQuota({
      db,
      storageRootAbsPath: root,
      maxBytes: 260,
      fs: {
        statSizeBytes: async (abs) => {
          const st = await fsp.stat(abs);
          return st.size;
        },
        rm: async (abs) => {
          await fsp.rm(abs, { force: true });
        },
      },
    });

    expect(res.bytesBefore).toBe(420);
    expect(res.bytesAfter).toBe(160);
    expect(res.evictedAttachmentIds).toEqual(['a1', 'a2']);
    expect(res.overQuota).toBe(false);

    await expect(fsp.stat(path.join(root, 'attachments-cache', 'a1.bin'))).rejects.toThrow();
    await expect(fsp.stat(path.join(root, 'attachments-cache', 'a2.bin'))).rejects.toThrow();
    await expect(fsp.stat(path.join(root, 'attachments-cache', 'a3.bin'))).resolves.toBeTruthy();

    const rowA1 = db
      .prepare(
        'SELECT local_relpath, cache_relpath, cache_size_bytes FROM memo_attachments WHERE id = ?'
      )
      .get('a1') as {
      local_relpath: string | null;
      cache_relpath: string | null;
      cache_size_bytes: number | null;
    };
    expect(rowA1.local_relpath).toBe('attachments/a1.bin');
    expect(rowA1.cache_relpath).toBeNull();
    expect(rowA1.cache_size_bytes).toBeNull();

    const rowA3 = db
      .prepare(
        'SELECT local_relpath, cache_relpath, cache_size_bytes FROM memo_attachments WHERE id = ?'
      )
      .get('a3') as {
      local_relpath: string | null;
      cache_relpath: string | null;
      cache_size_bytes: number | null;
    };
    expect(rowA3.cache_relpath).toBe('attachments-cache/a3.bin');
    expect(rowA3.cache_size_bytes).toBe(160);

    db.close();
  });

  it('不阻断编辑：rm 失败时不得 throw，且继续尝试驱逐其他条目', async () => {
    const root = makeTempDir();
    const dbFile = path.join(root, 'db', 'xinliu.sqlite3');
    await fsp.mkdir(path.dirname(dbFile), { recursive: true });

    const db = new Database(dbFile);
    applyMigrations(db);
    db.prepare(
      `
        INSERT INTO memos(
          local_uuid, server_memo_id, server_memo_name, content, visibility, sync_status,
          last_error, created_at_ms, updated_at_ms
        ) VALUES(
          'm1', NULL, NULL, 'c', 'PRIVATE', 'LOCAL_ONLY', NULL, 1, 1
        )
      `
    ).run();

    db.prepare(
      `
        INSERT INTO memo_attachments(
          id, memo_local_uuid, server_attachment_name,
          local_relpath, cache_relpath, cache_key,
          created_at_ms, updated_at_ms
        ) VALUES(
          @id, 'm1', NULL,
          @local_relpath, NULL, NULL,
          @t, @t
        )
      `
    ).run({ id: 'a1', local_relpath: 'attachments/a1.bin', t: 1 });
    db.prepare(
      `
        INSERT INTO memo_attachments(
          id, memo_local_uuid, server_attachment_name,
          local_relpath, cache_relpath, cache_key,
          created_at_ms, updated_at_ms
        ) VALUES(
          @id, 'm1', NULL,
          @local_relpath, NULL, NULL,
          @t, @t
        )
      `
    ).run({ id: 'a2', local_relpath: 'attachments/a2.bin', t: 2 });

    upsertMemoAttachmentCacheFile({
      db,
      attachmentId: 'a1',
      cacheRelpath: 'attachments-cache/a1.bin',
      cacheSizeBytes: 200,
      nowMs: () => 10,
      uuid: () => '11111111-1111-1111-1111-111111111111',
    });
    upsertMemoAttachmentCacheFile({
      db,
      attachmentId: 'a2',
      cacheRelpath: 'attachments-cache/a2.bin',
      cacheSizeBytes: 200,
      nowMs: () => 20,
      uuid: () => '22222222-2222-2222-2222-222222222222',
    });

    await writeFileEnsuringDir(path.join(root, 'attachments-cache', 'a1.bin'), 200);
    await writeFileEnsuringDir(path.join(root, 'attachments-cache', 'a2.bin'), 200);

    const res = await enforceAttachmentCacheQuota({
      db,
      storageRootAbsPath: root,
      maxBytes: 200,
      fs: {
        statSizeBytes: async (abs) => {
          const st = await fsp.stat(abs);
          return st.size;
        },
        rm: async (abs) => {
          if (abs.endsWith('a1.bin')) {
            throw new Error('EACCES: mock');
          }
          await fsp.rm(abs, { force: true });
        },
      },
    });

    expect(res.evictedAttachmentIds).toEqual(['a2']);
    expect(res.errors.some((e) => e.includes('rm 失败: id=a1'))).toBe(true);
    expect(res.overQuota).toBe(false);

    await expect(fsp.stat(path.join(root, 'attachments-cache', 'a1.bin'))).resolves.toBeTruthy();
    await expect(fsp.stat(path.join(root, 'attachments-cache', 'a2.bin'))).rejects.toThrow();

    db.close();
  }, 15_000);
});
