import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

import { fromRelpath, STORAGE_ROOT_DIRS } from '../storageLayout';

export const ATTACHMENT_CACHE_KEY_PREFIX = 'att_' as const;

export const DEFAULT_ATTACHMENT_CACHE_MAX_MB = 512;

export function attachmentCacheMaxMbToBytes(attachmentCacheMaxMb: number): number {
  if (!Number.isInteger(attachmentCacheMaxMb) || attachmentCacheMaxMb < 0) {
    throw new Error('attachmentCacheMaxMb 必须是非负整数');
  }
  return attachmentCacheMaxMb * 1024 * 1024;
}

export type AttachmentCacheQuotaEnforceResult = {
  bytesBefore: number;
  bytesAfter: number;
  maxBytes: number;
  evictedAttachmentIds: string[];
  overQuota: boolean;
  errors: string[];
};

export interface AttachmentCacheFsOps {
  statSizeBytes: (absPath: string) => Promise<number>;
  rm: (absPath: string) => Promise<void>;
}

function assertNonEmptyString(input: string, fieldName: string): string {
  const v = input.trim();
  if (v.length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return v;
}

function safeNowMs(nowMs?: () => number): number {
  const v = (nowMs ?? Date.now)();
  if (!Number.isInteger(v) || v < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return v;
}

function isSafeOpaqueCacheKey(cacheKey: string): boolean {
  if (cacheKey.length < 3 || cacheKey.length > 200) {
    return false;
  }
  if (cacheKey.includes('/') || cacheKey.includes('\\')) {
    return false;
  }
  if (cacheKey.includes('%')) {
    return false;
  }
  if (cacheKey.includes('\u0000')) {
    return false;
  }
  return /^[A-Za-z0-9_-]+$/.test(cacheKey);
}

export function generateOpaqueAttachmentCacheKey(options?: {
  uuid?: () => string;
}): string {
  const uuid = options?.uuid ?? crypto.randomUUID;
  const key = `${ATTACHMENT_CACHE_KEY_PREFIX}${uuid()}`;
  if (!isSafeOpaqueCacheKey(key)) {
    throw new Error('生成的 cacheKey 不满足不透明约束');
  }
  return key;
}

export function ensureMemoAttachmentCacheKey(args: {
  db: Database.Database;
  attachmentId: string;
  nowMs?: () => number;
  uuid?: () => string;
}): string {
  const attachmentId = assertNonEmptyString(args.attachmentId, 'attachmentId');
  const nowMs = safeNowMs(args.nowMs);

  const row = args.db
    .prepare(
      `
        SELECT cache_key
        FROM memo_attachments
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(attachmentId) as { cache_key?: string | null } | undefined;

  const existing = typeof row?.cache_key === 'string' ? row.cache_key.trim() : '';
  if (existing.length > 0) {
    return existing;
  }

  for (let i = 0; i < 5; i += 1) {
    const next = generateOpaqueAttachmentCacheKey({ uuid: args.uuid });
    try {
      const info = args.db
        .prepare(
          `
            UPDATE memo_attachments
            SET
              cache_key = @cache_key,
              last_access_at_ms = COALESCE(last_access_at_ms, @last_access_at_ms)
            WHERE id = @id
              AND (cache_key IS NULL OR TRIM(cache_key) = '')
          `
        )
        .run({
          id: attachmentId,
          cache_key: next,
          last_access_at_ms: nowMs,
        });
      if (info.changes > 0) {
        return next;
      }
    } catch {
    }
  }

  const row2 = args.db
    .prepare(
      `
        SELECT cache_key
        FROM memo_attachments
        WHERE id = ?
        LIMIT 1
      `
    )
    .get(attachmentId) as { cache_key?: string | null } | undefined;
  const existing2 = typeof row2?.cache_key === 'string' ? row2.cache_key.trim() : '';
  if (existing2.length > 0) {
    return existing2;
  }

  throw new Error('生成/写入 cacheKey 失败');
}

export function touchMemoAttachmentLastAccessAtMs(args: {
  db: Database.Database;
  cacheKey: string;
  nowMs?: () => number;
}): void {
  const cacheKey = assertNonEmptyString(args.cacheKey, 'cacheKey');
  const nowMs = safeNowMs(args.nowMs);

  try {
    args.db
      .prepare(
        `
          UPDATE memo_attachments
          SET last_access_at_ms = @last_access_at_ms
          WHERE cache_key = @cache_key
        `
      )
      .run({
        cache_key: cacheKey,
        last_access_at_ms: nowMs,
      });
  } catch {
  }
}

export function upsertMemoAttachmentCacheFile(args: {
  db: Database.Database;
  attachmentId: string;
  cacheRelpath: string;
  cacheSizeBytes: number;
  nowMs?: () => number;
  uuid?: () => string;
}): { cacheKey: string } {
  const attachmentId = assertNonEmptyString(args.attachmentId, 'attachmentId');
  const cacheRelpath = assertNonEmptyString(args.cacheRelpath, 'cacheRelpath');
  const nowMs = safeNowMs(args.nowMs);
  if (!Number.isInteger(args.cacheSizeBytes) || args.cacheSizeBytes < 0) {
    throw new Error('cacheSizeBytes 必须是非负整数');
  }

  if (!cacheRelpath.startsWith(`${STORAGE_ROOT_DIRS.attachmentsCache}/`)) {
    throw new Error('cacheRelpath 必须位于 attachments-cache/ 下');
  }

  const tx = args.db.transaction(() => {
    const cacheKey = ensureMemoAttachmentCacheKey({
      db: args.db,
      attachmentId,
      nowMs: () => nowMs,
      uuid: args.uuid,
    });
    args.db
      .prepare(
        `
          UPDATE memo_attachments
          SET
            cache_relpath = @cache_relpath,
            cache_size_bytes = @cache_size_bytes,
            last_access_at_ms = @last_access_at_ms
          WHERE id = @id
        `
      )
      .run({
        id: attachmentId,
        cache_relpath: cacheRelpath,
        cache_size_bytes: args.cacheSizeBytes,
        last_access_at_ms: nowMs,
      });
    return { cacheKey };
  });

  return tx.immediate();
}

type CacheCandidateRow = {
  id: string;
  cache_relpath: string;
  cache_size_bytes: number | null;
  last_access_at_ms: number | null;
  created_at_ms: number;
};

export async function enforceAttachmentCacheQuota(args: {
  db: Database.Database;
  storageRootAbsPath: string;
  maxBytes: number;
  fs: AttachmentCacheFsOps;
}): Promise<AttachmentCacheQuotaEnforceResult> {
  const errors: string[] = [];
  const maxBytes = args.maxBytes;
  if (!Number.isInteger(maxBytes) || maxBytes < 0) {
    throw new Error('maxBytes 必须是非负整数');
  }

  const rows = args.db
    .prepare(
      `
        SELECT
          id,
          cache_relpath,
          cache_size_bytes,
          last_access_at_ms,
          created_at_ms
        FROM memo_attachments
        WHERE cache_relpath IS NOT NULL
          AND TRIM(cache_relpath) != ''
        ORDER BY
          COALESCE(last_access_at_ms, created_at_ms) ASC,
          created_at_ms ASC,
          id ASC
      `
    )
    .all() as CacheCandidateRow[];

  const sizesById = new Map<string, number>();
  for (const r of rows) {
    const fromDb = r.cache_size_bytes;
    if (Number.isInteger(fromDb) && (fromDb as number) >= 0) {
      sizesById.set(r.id, fromDb as number);
      continue;
    }
    try {
      const abs = fromRelpath(args.storageRootAbsPath, r.cache_relpath);
      const size = await args.fs.statSizeBytes(abs);
      sizesById.set(r.id, size);
      try {
        args.db
          .prepare(
            `
              UPDATE memo_attachments
              SET cache_size_bytes = @cache_size_bytes
              WHERE id = @id
            `
          )
          .run({ id: r.id, cache_size_bytes: size });
      } catch {
      }
    } catch (e) {
      sizesById.set(r.id, 0);
      errors.push(`stat 失败: id=${r.id}: ${String(e)}`);
    }
  }

  const bytesBefore = rows.reduce((sum, r) => sum + (sizesById.get(r.id) ?? 0), 0);
  let total = bytesBefore;
  const evictedAttachmentIds: string[] = [];

  for (const r of rows) {
    if (total <= maxBytes) {
      break;
    }

    const size = sizesById.get(r.id) ?? 0;

    let abs: string;
    try {
      abs = fromRelpath(args.storageRootAbsPath, r.cache_relpath);
    } catch (e) {
      errors.push(`fromRelpath 失败: id=${r.id}: ${String(e)}`);
      continue;
    }

    try {
      await args.fs.rm(abs);
    } catch (e) {
      errors.push(`rm 失败: id=${r.id}: ${String(e)}`);
      continue;
    }

    try {
      args.db
        .prepare(
          `
            UPDATE memo_attachments
            SET
              cache_relpath = NULL,
              cache_size_bytes = NULL
            WHERE id = @id
          `
        )
        .run({ id: r.id });
    } catch (e) {
      errors.push(`DB 更新失败: id=${r.id}: ${String(e)}`);
    }

    total = Math.max(0, total - size);
    evictedAttachmentIds.push(r.id);
  }

  return {
    bytesBefore,
    bytesAfter: total,
    maxBytes,
    evictedAttachmentIds,
    overQuota: total > maxBytes,
    errors,
  };
}
