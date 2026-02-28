import fs from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';

import type { HttpResult } from '../net/httpClient';
import type { Attachment, Memo, MemosClient } from './memosClient';

import { createConflictCopyAndRollbackOriginalMemo } from '../notes/memoConflictCopy';

import { fromRelpath } from '../storageLayout';
import {
  FLOW_OP,
  FLOW_RESOURCE,
  bumpClientUpdatedAtMs,
  enqueueFlowOutboxMutation,
  withImmediateTransaction,
} from '../sync/outbox';

export const MEMOS_SYNC_STATUS = {
  localOnly: 'LOCAL_ONLY',
  dirty: 'DIRTY',
  syncing: 'SYNCING',
  synced: 'SYNCED',
  failed: 'FAILED',
} as const;

export type MemosSyncStatus = (typeof MEMOS_SYNC_STATUS)[keyof typeof MEMOS_SYNC_STATUS];

interface LocalMemoRow {
  local_uuid: string;
  server_memo_id: string | null;
  server_memo_name: string | null;
  content: string;
  visibility: string;
  sync_status: MemosSyncStatus;
  last_error: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

interface LocalMemoAttachmentRow {
  id: string;
  memo_local_uuid: string;
  server_attachment_name: string | null;
  local_relpath: string | null;
  cache_relpath: string | null;
  cache_key: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

interface LocalCollectionMemoRefRow {
  id: string;
  parent_id: string | null;
  name: string;
  color: string | null;
  sort_order: number;
  ref_type: string;
  client_updated_at_ms: number;
}

function safeNowMs(nowMs?: () => number): number {
  const v = (nowMs ?? Date.now)();
  if (!Number.isInteger(v) || v < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return v;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value;
}

function parseMemoIdFromName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  const idx = trimmed.lastIndexOf('/');
  if (idx < 0) return trimmed;
  const id = trimmed.slice(idx + 1);
  return id.trim().length > 0 ? id.trim() : null;
}

function memoNameFromLocalRow(row: LocalMemoRow): string {
  if (row.server_memo_name && row.server_memo_name.trim().length > 0) {
    return row.server_memo_name;
  }
  const id = row.server_memo_id;
  if (!id || id.trim().length === 0) {
    throw new Error('server_memo_name/server_memo_id 缺失，无法构造 memoName');
  }
  const trimmed = id.trim();
  if (trimmed.includes('/')) return trimmed;
  return `memos/${trimmed}`;
}

function describeHttpResultError(res: HttpResult<unknown>): string {
  if (res.ok) return 'ok';
  const status = typeof res.error.status === 'number' ? res.error.status : null;
  const code = res.error.code;
  const errCode =
    typeof res.error.errorResponse?.error === 'string' ? res.error.errorResponse.error : null;
  const parts = [
    `code=${code}`,
    status !== null ? `status=${status}` : null,
    errCode ? `error=${errCode}` : null,
    res.error.message ? `message=${res.error.message}` : null,
  ].filter((x): x is string => Boolean(x));
  return parts.join(' ');
}

function readLocalMemo(db: Database.Database, localUuid: string): LocalMemoRow | null {
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
          created_at_ms,
          updated_at_ms
        FROM memos
        WHERE local_uuid = ?
      `
    )
    .get(localUuid) as LocalMemoRow | undefined;
  return row ?? null;
}

function listLocalMemoAttachments(
  db: Database.Database,
  memoLocalUuid: string
): LocalMemoAttachmentRow[] {
  return db
    .prepare(
      `
        SELECT
          id,
          memo_local_uuid,
          server_attachment_name,
          local_relpath,
          cache_relpath,
          cache_key,
          created_at_ms,
          updated_at_ms
        FROM memo_attachments
        WHERE memo_local_uuid = ?
        ORDER BY created_at_ms ASC, id ASC
      `
    )
    .all(memoLocalUuid) as LocalMemoAttachmentRow[];
}

function markMemoSyncStatus(
  db: Database.Database,
  args: {
    localUuid: string;
    nowMs: number;
    status: MemosSyncStatus;
    lastError: string | null;
  }
): void {
  db.prepare(
    `
      UPDATE memos
      SET
        sync_status = @sync_status,
        last_error = @last_error,
        updated_at_ms = @updated_at_ms
      WHERE local_uuid = @local_uuid
    `
  ).run({
    local_uuid: args.localUuid,
    sync_status: args.status,
    last_error: args.lastError,
    updated_at_ms: args.nowMs,
  });
}

function writeMemoServerIds(
  db: Database.Database,
  args: {
    localUuid: string;
    serverMemoName: string | null;
    serverMemoId: string | null;
    nowMs: number;
  }
): void {
  db.prepare(
    `
      UPDATE memos
      SET
        server_memo_name = COALESCE(@server_memo_name, server_memo_name),
        server_memo_id = COALESCE(@server_memo_id, server_memo_id),
        updated_at_ms = @updated_at_ms
      WHERE local_uuid = @local_uuid
    `
  ).run({
    local_uuid: args.localUuid,
    server_memo_name: args.serverMemoName,
    server_memo_id: args.serverMemoId,
    updated_at_ms: args.nowMs,
  });
}

function backfillCollectionMemoRefsAfterMemoServerIdWritten(
  db: Database.Database,
  args: {
    memoLocalUuid: string;
    serverMemoName: string | null;
    nowMs: number;
  }
): void {
  const serverMemoName = typeof args.serverMemoName === 'string' ? args.serverMemoName.trim() : '';
  if (serverMemoName.length === 0) {
    return;
  }

  let targets: LocalCollectionMemoRefRow[] = [];
  try {
    targets = db
      .prepare(
        `
          SELECT
            id,
            parent_id,
            name,
            color,
            sort_order,
            ref_type,
            client_updated_at_ms
          FROM collection_items
          WHERE
            item_type = 'note_ref'
            AND ref_type = 'memos_memo'
            AND ref_id = @memo_local_uuid
        `
      )
      .all({ memo_local_uuid: args.memoLocalUuid }) as LocalCollectionMemoRefRow[];
  } catch (error) {
    console.warn('回填 collection_items 目标查询失败', String(error));
    return;
  }

  if (targets.length === 0) {
    return;
  }

  const nowIso = new Date(args.nowMs).toISOString();
  for (const target of targets) {
    try {
      const nextClientUpdatedAtMs = bumpClientUpdatedAtMs({
        lastMs: target.client_updated_at_ms,
        nowMs: args.nowMs,
      });

      const updateResult = db
        .prepare(
          `
            UPDATE collection_items
            SET
              ref_id = @ref_id,
              client_updated_at_ms = @client_updated_at_ms,
              updated_at = @updated_at
            WHERE
              id = @id
              AND item_type = 'note_ref'
              AND ref_type = 'memos_memo'
              AND ref_id = @from_ref_id
          `
        )
        .run({
          id: target.id,
          ref_id: serverMemoName,
          client_updated_at_ms: nextClientUpdatedAtMs,
          updated_at: nowIso,
          from_ref_id: args.memoLocalUuid,
        });

      if (updateResult.changes === 0) {
        continue;
      }

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.collectionItem,
        op: FLOW_OP.upsert,
        entityId: target.id,
        clientUpdatedAtMs: nextClientUpdatedAtMs,
        data: {
          item_type: 'note_ref',
          parent_id: target.parent_id,
          name: target.name,
          color: target.color,
          sort_order: target.sort_order,
          ref_type: target.ref_type,
          ref_id: serverMemoName,
        },
        nowMs: args.nowMs,
      });
    } catch (error) {
      console.warn(`回填 collection_items 引用失败: item_id=${target.id}`, String(error));
    }
  }
}

function writeAttachmentServerName(
  db: Database.Database,
  args: { id: string; serverAttachmentName: string; nowMs: number }
): void {
  db.prepare(
    `
      UPDATE memo_attachments
      SET
        server_attachment_name = @server_attachment_name,
        updated_at_ms = @updated_at_ms
      WHERE id = @id
    `
  ).run({
    id: args.id,
    server_attachment_name: args.serverAttachmentName,
    updated_at_ms: args.nowMs,
  });
}

export interface MergePulledServerMemoIntoLocalArgs {
  db: Database.Database;
  localUuid: string;
  serverMemo: Memo;
  nowMs?: () => number;
}

export function mergePulledServerMemoIntoLocalMemo(args: MergePulledServerMemoIntoLocalArgs): void {
  const localUuid = requireNonEmptyString(args.localUuid, 'localUuid');
  const nowMs = safeNowMs(args.nowMs);

  withImmediateTransaction(args.db, () => {
    const local = readLocalMemo(args.db, localUuid);
    if (!local) {
      throw new Error('memo 不存在');
    }

    const serverName = typeof args.serverMemo.name === 'string' ? args.serverMemo.name : null;
    const serverId = serverName ? parseMemoIdFromName(serverName) : null;
    const protect =
      local.sync_status === MEMOS_SYNC_STATUS.dirty ||
      local.sync_status === MEMOS_SYNC_STATUS.syncing;

    if (protect) {
      writeMemoServerIds(args.db, {
        localUuid,
        serverMemoName: serverName,
        serverMemoId: serverId,
        nowMs,
      });
      backfillCollectionMemoRefsAfterMemoServerIdWritten(args.db, {
        memoLocalUuid: localUuid,
        serverMemoName: serverName,
        nowMs,
      });
      return;
    }

    const nextContent =
      typeof args.serverMemo.content === 'string' ? args.serverMemo.content : local.content;
    const nextVisibility =
      typeof args.serverMemo.visibility === 'string'
        ? args.serverMemo.visibility
        : local.visibility;

    args.db
      .prepare(
        `
        UPDATE memos
        SET
          server_memo_name = COALESCE(@server_memo_name, server_memo_name),
          server_memo_id = COALESCE(@server_memo_id, server_memo_id),
          content = @content,
          visibility = @visibility,
          updated_at_ms = @updated_at_ms
        WHERE local_uuid = @local_uuid
      `
      )
      .run({
        local_uuid: localUuid,
        server_memo_name: serverName,
        server_memo_id: serverId,
        content: nextContent,
        visibility: nextVisibility,
        updated_at_ms: nowMs,
      });

    backfillCollectionMemoRefsAfterMemoServerIdWritten(args.db, {
      memoLocalUuid: localUuid,
      serverMemoName: serverName,
      nowMs,
    });
  });
}

export interface RunMemosRefreshOneMemoOptions {
  db: Database.Database;
  memosClient: MemosClient;
  memoLocalUuid: string;
  nowMs?: () => number;
}

export type RunMemosRefreshOneMemoOutcome =
  | { kind: 'refreshed'; localUuid: string; serverMemoName: string }
  | { kind: 'skipped'; reason: 'not_found' | 'no_server_id' }
  | { kind: 'failed'; localUuid: string; message: string };

export async function runMemosRefreshOneMemo(
  options: RunMemosRefreshOneMemoOptions
): Promise<RunMemosRefreshOneMemoOutcome> {
  const localUuid = requireNonEmptyString(options.memoLocalUuid, 'memoLocalUuid');
  const local = readLocalMemo(options.db, localUuid);
  if (!local) {
    return { kind: 'skipped', reason: 'not_found' };
  }

  const hasServerId =
    (typeof local.server_memo_name === 'string' && local.server_memo_name.trim().length > 0) ||
    (typeof local.server_memo_id === 'string' && local.server_memo_id.trim().length > 0);
  if (!hasServerId) {
    return { kind: 'skipped', reason: 'no_server_id' };
  }

  const memoName = memoNameFromLocalRow(local);
  const res = await options.memosClient.getMemo(memoName);
  if (!res.ok) {
    return {
      kind: 'failed',
      localUuid,
      message: `GetMemo 失败：${describeHttpResultError(res)}`,
    };
  }

  const nowMs = safeNowMs(options.nowMs);
  mergePulledServerMemoIntoLocalMemo({
    db: options.db,
    localUuid,
    serverMemo: res.value,
    nowMs: () => nowMs,
  });

  const serverName = typeof res.value.name === 'string' ? res.value.name : null;
  const serverMemoName = serverName ?? memoName;
  return { kind: 'refreshed', localUuid, serverMemoName };
}

export interface RunMemosSyncOneMemoJobOptions {
  db: Database.Database;
  memosClient: MemosClient;
  storageRootAbsPath: string;
  memoLocalUuid: string;
  nowMs?: () => number;
  loadAttachmentContentBase64?: (args: { absPath: string }) => Promise<string>;
}

export type RunMemosSyncOneMemoJobOutcome =
  | { kind: 'synced'; localUuid: string; serverMemoName: string | null }
  | {
      kind: 'conflict';
      localUuid: string;
      conflictLocalUuid: string;
      serverMemoName: string | null;
      requestId: string | null;
    }
  | { kind: 'skipped'; reason: 'not_found' | 'already_synced' | 'local_only' }
  | { kind: 'failed'; localUuid: string; message: string };

function pickHttpRequestId(res: HttpResult<unknown>): string | null {
  if (res.ok) return null;
  const hdr = res.error.responseRequestIdHeader;
  if (typeof hdr === 'string' && hdr.trim().length > 0) return hdr.trim();
  const embedded = res.error.errorResponse?.request_id;
  if (typeof embedded === 'string' && embedded.trim().length > 0) return embedded.trim();
  const req = res.error.requestId;
  return typeof req === 'string' && req.trim().length > 0 ? req.trim() : null;
}

function readServerSnapshotFromDetails(details: unknown): {
  name: string | null;
  content: string | null;
  visibility: string | null;
} | null {
  if (!details || typeof details !== 'object') return null;
  const obj = details as Record<string, unknown>;
  const snap = obj.server_snapshot;
  if (!snap || typeof snap !== 'object') return null;
  const s = snap as Record<string, unknown>;
  const name = typeof s.name === 'string' && s.name.trim().length > 0 ? s.name : null;
  const content = typeof s.content === 'string' ? s.content : null;
  const visibility = typeof s.visibility === 'string' ? s.visibility : null;
  return { name, content, visibility };
}

async function handleUpdateConflict409(args: {
  db: Database.Database;
  memosClient: MemosClient;
  localUuid: string;
  local: LocalMemoRow;
  memoName: string;
  updateRes: HttpResult<Memo>;
  nowMs: number;
}): Promise<{
  kind: 'conflict';
  localUuid: string;
  conflictLocalUuid: string;
  serverMemoName: string | null;
  requestId: string | null;
} | null> {
  if (args.updateRes.ok) return null;
  if (args.updateRes.error.status !== 409) return null;

  const requestId = pickHttpRequestId(args.updateRes);
  const fromDetails = readServerSnapshotFromDetails(args.updateRes.error.errorResponse?.details);

  let serverName: string | null = fromDetails?.name ?? null;
  let serverContent: string | null = fromDetails?.content ?? null;
  let serverVisibility: string | null = fromDetails?.visibility ?? null;

  if (serverContent === null || serverVisibility === null) {
    const getRes = await args.memosClient.getMemo(args.memoName);
    if (getRes.ok) {
      serverName =
        typeof getRes.value.name === 'string' && getRes.value.name.trim().length > 0
          ? getRes.value.name
          : serverName;
      serverContent =
        typeof getRes.value.content === 'string' ? getRes.value.content : serverContent;
      serverVisibility =
        typeof getRes.value.visibility === 'string' ? getRes.value.visibility : serverVisibility;
    }
  }

  if (serverContent === null || serverVisibility === null) {
    return null;
  }

  const serverMemoName = serverName;
  const serverMemoId = serverMemoName ? parseMemoIdFromName(serverMemoName) : null;

  const { conflictLocalUuid } = createConflictCopyAndRollbackOriginalMemo(args.db, {
    originalLocalUuid: args.localUuid,
    originalContent: args.local.content,
    originalVisibility: args.local.visibility,
    serverMemoName,
    serverMemoId,
    serverContent,
    serverVisibility,
    requestId,
    nowMs: () => args.nowMs,
  });

  return {
    kind: 'conflict',
    localUuid: args.localUuid,
    conflictLocalUuid,
    serverMemoName,
    requestId,
  };
}

async function defaultLoadAttachmentContentBase64(args: { absPath: string }): Promise<string> {
  const buf = fs.readFileSync(args.absPath);
  return buf.toString('base64');
}

async function uploadMissingAttachments(args: {
  db: Database.Database;
  memosClient: MemosClient;
  storageRootAbsPath: string;
  memoLocalUuid: string;
  nowMs: number;
  loadAttachmentContentBase64: (args: { absPath: string }) => Promise<string>;
}): Promise<LocalMemoAttachmentRow[]> {
  const rows = listLocalMemoAttachments(args.db, args.memoLocalUuid);

  for (const row of rows) {
    if (row.server_attachment_name && row.server_attachment_name.trim().length > 0) {
      continue;
    }
    if (!row.local_relpath || row.local_relpath.trim().length === 0) {
      throw new Error('附件缺少 local_relpath，无法上传');
    }

    const absPath = fromRelpath(args.storageRootAbsPath, row.local_relpath);
    const filename = path.basename(absPath);
    const contentBase64 = await args.loadAttachmentContentBase64({ absPath });

    const res = await args.memosClient.createAttachment({
      attachmentId: row.id,
      attachment: {
        filename,
        type: 'application/octet-stream',
        content: contentBase64,
      },
    });

    if (!res.ok) {
      throw new Error(`CreateAttachment 失败：${describeHttpResultError(res)}`);
    }

    const attachmentName = typeof res.value.name === 'string' ? res.value.name : null;
    if (!attachmentName || attachmentName.trim().length === 0) {
      throw new Error('CreateAttachment 返回缺少 attachment.name');
    }

    withImmediateTransaction(args.db, () => {
      writeAttachmentServerName(args.db, {
        id: row.id,
        serverAttachmentName: attachmentName,
        nowMs: args.nowMs,
      });
    });
  }

  return listLocalMemoAttachments(args.db, args.memoLocalUuid);
}

function buildMemoPayloadFromLocal(row: LocalMemoRow): Memo {
  return {
    content: row.content,
    visibility: row.visibility,
  };
}

function shouldSync(row: LocalMemoRow): boolean {
  return (
    row.sync_status === MEMOS_SYNC_STATUS.dirty ||
    row.sync_status === MEMOS_SYNC_STATUS.syncing ||
    row.sync_status === MEMOS_SYNC_STATUS.failed
  );
}

export async function runMemosSyncOneMemoJob(
  options: RunMemosSyncOneMemoJobOptions
): Promise<RunMemosSyncOneMemoJobOutcome> {
  const localUuid = requireNonEmptyString(options.memoLocalUuid, 'memoLocalUuid');
  const nowMs = safeNowMs(options.nowMs);

  const local = readLocalMemo(options.db, localUuid);
  if (!local) {
    return { kind: 'skipped', reason: 'not_found' };
  }
  if (local.sync_status === MEMOS_SYNC_STATUS.localOnly) {
    return { kind: 'skipped', reason: 'local_only' };
  }
  if (!shouldSync(local)) {
    return { kind: 'skipped', reason: 'already_synced' };
  }

  withImmediateTransaction(options.db, () => {
    markMemoSyncStatus(options.db, {
      localUuid,
      nowMs,
      status: MEMOS_SYNC_STATUS.syncing,
      lastError: null,
    });
  });

  try {
    const isCreate = !local.server_memo_id || local.server_memo_id.trim().length === 0;
    const payload = buildMemoPayloadFromLocal(local);

    let serverMemo: Memo;
    if (isCreate) {
      const res = await options.memosClient.createMemo(payload);
      if (!res.ok) {
        throw new Error(`CreateMemo 失败：${describeHttpResultError(res)}`);
      }
      serverMemo = res.value;
    } else {
      const memoName = memoNameFromLocalRow(local);
      const res = await options.memosClient.updateMemo({
        memoName,
        memo: payload,
        updateMask: ['content', 'visibility'],
      });

      if (!res.ok) {
        const conflict = await handleUpdateConflict409({
          db: options.db,
          memosClient: options.memosClient,
          localUuid,
          local,
          memoName,
          updateRes: res,
          nowMs,
        });
        if (conflict) {
          return conflict;
        }
        throw new Error(`UpdateMemo 失败：${describeHttpResultError(res)}`);
      }
      serverMemo = res.value;
    }

    const serverMemoName = typeof serverMemo.name === 'string' ? serverMemo.name : null;
    const serverMemoId = serverMemoName ? parseMemoIdFromName(serverMemoName) : null;
    withImmediateTransaction(options.db, () => {
      writeMemoServerIds(options.db, {
        localUuid,
        serverMemoName,
        serverMemoId,
        nowMs,
      });
      backfillCollectionMemoRefsAfterMemoServerIdWritten(options.db, {
        memoLocalUuid: localUuid,
        serverMemoName,
        nowMs,
      });
    });

    const memoName =
      serverMemoName ?? memoNameFromLocalRow(readLocalMemo(options.db, localUuid) ?? local);

    const loadAttachmentContentBase64 =
      options.loadAttachmentContentBase64 ?? defaultLoadAttachmentContentBase64;
    const attachmentsAfterUpload = await uploadMissingAttachments({
      db: options.db,
      memosClient: options.memosClient,
      storageRootAbsPath: options.storageRootAbsPath,
      memoLocalUuid: localUuid,
      nowMs,
      loadAttachmentContentBase64,
    });

    const toBind: Attachment[] = attachmentsAfterUpload
      .map((r) => r.server_attachment_name)
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((name) => ({ name }));

    const bindRes = await options.memosClient.setMemoAttachments({
      memoName,
      attachments: toBind,
    });
    if (!bindRes.ok) {
      throw new Error(`SetMemoAttachments 失败：${describeHttpResultError(bindRes)}`);
    }

    withImmediateTransaction(options.db, () => {
      markMemoSyncStatus(options.db, {
        localUuid,
        nowMs,
        status: MEMOS_SYNC_STATUS.synced,
        lastError: null,
      });
    });

    return { kind: 'synced', localUuid, serverMemoName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    withImmediateTransaction(options.db, () => {
      markMemoSyncStatus(options.db, {
        localUuid,
        nowMs,
        status: MEMOS_SYNC_STATUS.failed,
        lastError: msg,
      });
    });
    return { kind: 'failed', localUuid, message: msg };
  }
}
