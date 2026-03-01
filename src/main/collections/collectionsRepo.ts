import crypto from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  FLOW_OP,
  FLOW_RESOURCE,
  bumpClientUpdatedAtMs,
  enqueueFlowOutboxMutation,
  withImmediateTransaction,
} from '../sync/outbox';

export const COLLECTION_ITEM_TYPE = {
  folder: 'folder',
  noteRef: 'note_ref',
} as const;

export type CollectionItemType = (typeof COLLECTION_ITEM_TYPE)[keyof typeof COLLECTION_ITEM_TYPE];

export const COLLECTION_REF_TYPE = {
  flowNote: 'flow_note',
  memosMemo: 'memos_memo',
} as const;

export type CollectionRefType = (typeof COLLECTION_REF_TYPE)[keyof typeof COLLECTION_REF_TYPE];

export interface CollectionItemRow {
  id: string;
  itemType: CollectionItemType;
  parentId: string | null;
  name: string;
  color: string | null;
  refType: CollectionRefType | null;
  refId: string | null;
  sortOrder: number;
  clientUpdatedAtMs: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListCollectionItemsArgs {
  parentId?: string | null;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateFolderArgs {
  id?: string;
  parentId?: string | null;
  name: string;
  color?: string | null;
  sortOrder?: number;
}

export interface CreateNoteRefArgs {
  id?: string;
  parentId?: string | null;
  name?: string;
  color?: string | null;
  sortOrder?: number;
  refType: CollectionRefType;
  refId: string;
}

export interface PatchCollectionItemArgs {
  id: string;
  parentId?: string | null;
  name?: string;
  color?: string | null;
  sortOrder?: number;
  refType?: CollectionRefType | null;
  refId?: string | null;
}

export interface CollectionsRepoDeps {
  nowMs?: () => number;
  randomUUID?: () => string;
}

function createId(deps: CollectionsRepoDeps): string {
  return (deps.randomUUID ?? crypto.randomUUID)();
}

function safeNowMs(deps: CollectionsRepoDeps): number {
  const nowMs = (deps.nowMs ?? Date.now)();
  if (!Number.isInteger(nowMs) || nowMs < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return nowMs;
}

function mapRow(row: {
  id: string;
  item_type: string;
  parent_id: string | null;
  name: string;
  color: string | null;
  ref_type: string | null;
  ref_id: string | null;
  sort_order: number;
  client_updated_at_ms: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}): CollectionItemRow {
  return {
    id: row.id,
    itemType: row.item_type as CollectionItemType,
    parentId: row.parent_id,
    name: row.name,
    color: row.color,
    refType: row.ref_type as CollectionRefType | null,
    refId: row.ref_id,
    sortOrder: row.sort_order,
    clientUpdatedAtMs: row.client_updated_at_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value;
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function validateFolderSemantics(args: {
  name: string;
  refType: CollectionRefType | null;
  refId: string | null;
}): void {
  if (args.name.trim().length === 0) {
    throw new Error('folder.name 不能为空');
  }
  if (args.refType !== null || args.refId !== null) {
    throw new Error('folder 不允许设置 ref_type/ref_id');
  }
}

function validateNoteRefSemantics(args: {
  refType: CollectionRefType | null;
  refId: string | null;
}): void {
  if (args.refType === null) {
    throw new Error('note_ref.ref_type 不能为空');
  }
  if (args.refId === null || args.refId.trim().length === 0) {
    throw new Error('note_ref.ref_id 不能为空');
  }
}

export function createCollectionsRepo(db: Database.Database, deps: CollectionsRepoDeps = {}) {
  function getClientUpdatedAtMs(id: string): number | null {
    const row = db
      .prepare('SELECT client_updated_at_ms AS ms FROM collection_items WHERE id = ?')
      .get(id) as { ms: number } | undefined;
    return row ? Number(row.ms) : null;
  }

  function bumpForItem(id: string, nowMs: number): number {
    return bumpClientUpdatedAtMs({ lastMs: getClientUpdatedAtMs(id), nowMs });
  }

  function readItem(id: string): CollectionItemRow | null {
    const row = db
      .prepare(
        `
          SELECT
            id,
            item_type,
            parent_id,
            name,
            color,
            ref_type,
            ref_id,
            sort_order,
            client_updated_at_ms,
            created_at,
            updated_at,
            deleted_at
          FROM collection_items
          WHERE id = ?
        `
      )
      .get(id) as
      | {
          id: string;
          item_type: string;
          parent_id: string | null;
          name: string;
          color: string | null;
          ref_type: string | null;
          ref_id: string | null;
          sort_order: number;
          client_updated_at_ms: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        }
      | undefined;
    return row ? mapRow(row) : null;
  }

  function requireActiveFolderParent(parentId: string): void {
    const row = db
      .prepare(
        `
          SELECT item_type, deleted_at
          FROM collection_items
          WHERE id = ?
        `
      )
      .get(parentId) as { item_type: string; deleted_at: string | null } | undefined;
    if (!row) {
      throw new Error('parent 不存在');
    }
    if (row.deleted_at !== null) {
      throw new Error('parent 必须是未删除的 folder');
    }
    if (row.item_type !== COLLECTION_ITEM_TYPE.folder) {
      throw new Error('parent 必须是 folder');
    }
  }

  function assertNoCycle(itemId: string, parentId: string | null): void {
    if (parentId === null) return;
    if (parentId === itemId) {
      throw new Error('不能把 parent_id 设置为自己');
    }

    const hit = db
      .prepare(
        `
          WITH RECURSIVE anc(id) AS (
            SELECT @parent_id
            UNION ALL
            SELECT c.parent_id
            FROM collection_items c
            JOIN anc a ON c.id = a.id
            WHERE c.parent_id IS NOT NULL
          )
          SELECT 1 AS hit
          FROM anc
          WHERE id = @item_id
          LIMIT 1
        `
      )
      .get({ parent_id: parentId, item_id: itemId }) as { hit: 1 } | undefined;
    if (hit) {
      throw new Error('不能把 folder 移动到其子孙节点下');
    }
  }

  function listCollectionItems(args: ListCollectionItemsArgs = {}): CollectionItemRow[] {
    const includeDeleted = args.includeDeleted ?? false;
    const limit = args.limit ?? 200;
    const offset = args.offset ?? 0;

    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
      throw new Error('limit 不合法');
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error('offset 不合法');
    }

    const rows = db
      .prepare(
        `
          SELECT
            id,
            item_type,
            parent_id,
            name,
            color,
            ref_type,
            ref_id,
            sort_order,
            client_updated_at_ms,
            created_at,
            updated_at,
            deleted_at
          FROM collection_items
          WHERE
            (
              @parent_filter_mode = 0
              OR (@parent_filter_mode = 1 AND parent_id IS NULL)
              OR (@parent_filter_mode = 2 AND parent_id = @parent_id)
            )
            AND (@include_deleted = 1 OR deleted_at IS NULL)
          ORDER BY sort_order ASC, created_at ASC
          LIMIT @limit OFFSET @offset
        `
      )
      .all({
        parent_filter_mode: args.parentId === undefined ? 0 : args.parentId === null ? 1 : 2,
        parent_id: args.parentId ?? null,
        include_deleted: includeDeleted ? 1 : 0,
        limit,
        offset,
      }) as Array<{
      id: string;
      item_type: string;
      parent_id: string | null;
      name: string;
      color: string | null;
      ref_type: string | null;
      ref_id: string | null;
      sort_order: number;
      client_updated_at_ms: number;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }>;
    return rows.map(mapRow);
  }

  function createFolder(args: CreateFolderArgs): { id: string } {
    const name = requireNonEmptyString(args.name, 'name');
    const id = args.id ?? createId(deps);
    const parentId = args.parentId ?? null;
    const color = args.color ?? null;
    const sortOrder = args.sortOrder ?? 0;

    const nowMs = safeNowMs(deps);
    const nowIso = new Date(nowMs).toISOString();

    validateFolderSemantics({ name, refType: null, refId: null });

    if (parentId !== null) {
      requireActiveFolderParent(parentId);
      assertNoCycle(id, parentId);
    }

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForItem(id, nowMs);
      db.prepare(
        `
          INSERT INTO collection_items (
            id,
            item_type,
            parent_id,
            name,
            color,
            ref_type,
            ref_id,
            sort_order,
            client_updated_at_ms,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (
            @id,
            @item_type,
            @parent_id,
            @name,
            @color,
            NULL,
            NULL,
            @sort_order,
            @client_updated_at_ms,
            @created_at,
            @updated_at,
            NULL
          )
          ON CONFLICT(id) DO UPDATE SET
            item_type = excluded.item_type,
            parent_id = excluded.parent_id,
            name = excluded.name,
            color = excluded.color,
            ref_type = NULL,
            ref_id = NULL,
            sort_order = excluded.sort_order,
            client_updated_at_ms = excluded.client_updated_at_ms,
            updated_at = excluded.updated_at,
            deleted_at = NULL
        `
      ).run({
        id,
        item_type: COLLECTION_ITEM_TYPE.folder,
        parent_id: parentId,
        name,
        color,
        sort_order: sortOrder,
        client_updated_at_ms: clientUpdatedAtMs,
        created_at: nowIso,
        updated_at: nowIso,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.collectionItem,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          item_type: COLLECTION_ITEM_TYPE.folder,
          parent_id: parentId,
          name,
          color,
          sort_order: sortOrder,
          ref_type: null,
          ref_id: null,
        },
        nowMs,
      });
    });

    return { id };
  }

  function createNoteRef(args: CreateNoteRefArgs): { id: string } {
    const id = args.id ?? createId(deps);
    const parentId = args.parentId ?? null;
    const name = normalizeName(args.name);
    const color = args.color ?? null;
    const sortOrder = args.sortOrder ?? 0;

    const refType = args.refType;
    const refId = requireNonEmptyString(args.refId, 'refId');

    validateNoteRefSemantics({ refType, refId });

    if (parentId !== null) {
      requireActiveFolderParent(parentId);
      assertNoCycle(id, parentId);
    }

    const nowMs = safeNowMs(deps);
    const nowIso = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForItem(id, nowMs);
      db.prepare(
        `
          INSERT INTO collection_items (
            id,
            item_type,
            parent_id,
            name,
            color,
            ref_type,
            ref_id,
            sort_order,
            client_updated_at_ms,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (
            @id,
            @item_type,
            @parent_id,
            @name,
            @color,
            @ref_type,
            @ref_id,
            @sort_order,
            @client_updated_at_ms,
            @created_at,
            @updated_at,
            NULL
          )
          ON CONFLICT(id) DO UPDATE SET
            item_type = excluded.item_type,
            parent_id = excluded.parent_id,
            name = excluded.name,
            color = excluded.color,
            ref_type = excluded.ref_type,
            ref_id = excluded.ref_id,
            sort_order = excluded.sort_order,
            client_updated_at_ms = excluded.client_updated_at_ms,
            updated_at = excluded.updated_at,
            deleted_at = NULL
        `
      ).run({
        id,
        item_type: COLLECTION_ITEM_TYPE.noteRef,
        parent_id: parentId,
        name,
        color,
        ref_type: refType,
        ref_id: refId,
        sort_order: sortOrder,
        client_updated_at_ms: clientUpdatedAtMs,
        created_at: nowIso,
        updated_at: nowIso,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.collectionItem,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          item_type: COLLECTION_ITEM_TYPE.noteRef,
          parent_id: parentId,
          name,
          color,
          sort_order: sortOrder,
          ref_type: refType,
          ref_id: refId,
        },
        nowMs,
      });
    });

    return { id };
  }

  function patchCollectionItem(args: PatchCollectionItemArgs): void {
    const id = requireNonEmptyString(args.id, 'id');
    const existing = readItem(id);
    if (!existing) {
      throw new Error('collection item 不存在');
    }

    const nextParentId = args.parentId !== undefined ? args.parentId : existing.parentId;
    const nextName = args.name !== undefined ? args.name : existing.name;
    const nextColor = args.color !== undefined ? args.color : existing.color;
    const nextSortOrder = args.sortOrder ?? existing.sortOrder;

    const nextRefType = args.refType !== undefined ? args.refType : existing.refType;
    const nextRefId = args.refId !== undefined ? args.refId : existing.refId;

    if (existing.itemType === COLLECTION_ITEM_TYPE.folder) {
      validateFolderSemantics({
        name: String(nextName),
        refType: nextRefType,
        refId: nextRefId,
      });
    } else {
      validateNoteRefSemantics({ refType: nextRefType, refId: nextRefId });
    }

    if (nextParentId !== null) {
      requireActiveFolderParent(nextParentId);
      assertNoCycle(id, nextParentId);
    }

    const nowMs = safeNowMs(deps);
    const nowIso = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForItem(id, nowMs);
      db.prepare(
        `
          UPDATE collection_items
          SET
            parent_id = @parent_id,
            name = @name,
            color = @color,
            ref_type = @ref_type,
            ref_id = @ref_id,
            sort_order = @sort_order,
            client_updated_at_ms = @client_updated_at_ms,
            updated_at = @updated_at
          WHERE id = @id
        `
      ).run({
        id,
        parent_id: nextParentId,
        name: String(nextName),
        color: nextColor,
        ref_type: nextRefType,
        ref_id: nextRefId,
        sort_order: nextSortOrder,
        client_updated_at_ms: clientUpdatedAtMs,
        updated_at: nowIso,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.collectionItem,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          item_type: existing.itemType,
          parent_id: nextParentId,
          name: String(nextName),
          color: nextColor,
          sort_order: nextSortOrder,
          ref_type: nextRefType,
          ref_id: nextRefId,
        },
        nowMs,
      });
    });
  }

  function deleteCollectionItem(id: string): void {
    requireNonEmptyString(id, 'id');
    const existing = readItem(id);
    if (!existing) {
      throw new Error('collection item 不存在');
    }

    const nowMs = safeNowMs(deps);
    const nowIso = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const rootClientUpdatedAtMs = bumpForItem(id, nowMs);

      if (existing.itemType === COLLECTION_ITEM_TYPE.folder) {
        db.prepare(
          `
            WITH RECURSIVE subtree(id) AS (
              SELECT @root_id
              UNION ALL
              SELECT c.id
              FROM collection_items c
              JOIN subtree s ON c.parent_id = s.id
            )
            UPDATE collection_items
            SET
              deleted_at = @deleted_at,
              updated_at = @updated_at,
              client_updated_at_ms = CASE
                WHEN client_updated_at_ms + 1 > @now_ms THEN client_updated_at_ms + 1
                ELSE @now_ms
              END
            WHERE id IN (SELECT id FROM subtree)
          `
        ).run({
          root_id: id,
          deleted_at: nowIso,
          updated_at: nowIso,
          now_ms: nowMs,
        });
      } else {
        db.prepare(
          `
            UPDATE collection_items
            SET
              deleted_at = @deleted_at,
              updated_at = @updated_at,
              client_updated_at_ms = @client_updated_at_ms
            WHERE id = @id
          `
        ).run({
          id,
          deleted_at: nowIso,
          updated_at: nowIso,
          client_updated_at_ms: rootClientUpdatedAtMs,
        });
      }

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.collectionItem,
        op: FLOW_OP.delete,
        entityId: id,
        clientUpdatedAtMs: rootClientUpdatedAtMs,
        nowMs,
      });
    });
  }

  function restoreCollectionItem(id: string): void {
    requireNonEmptyString(id, 'id');
    const existing = readItem(id);
    if (!existing) {
      throw new Error('collection item 不存在');
    }

    const nowMs = safeNowMs(deps);
    const nowIso = new Date(nowMs).toISOString();

    withImmediateTransaction(db, () => {
      const clientUpdatedAtMs = bumpForItem(id, nowMs);

      db.prepare(
        `
          UPDATE collection_items
          SET
            deleted_at = NULL,
            updated_at = @updated_at,
            client_updated_at_ms = @client_updated_at_ms
          WHERE id = @id
        `
      ).run({
        id,
        updated_at: nowIso,
        client_updated_at_ms: clientUpdatedAtMs,
      });

      enqueueFlowOutboxMutation(db, {
        resource: FLOW_RESOURCE.collectionItem,
        op: FLOW_OP.upsert,
        entityId: id,
        clientUpdatedAtMs,
        data: {
          item_type: existing.itemType,
          parent_id: existing.parentId,
          name: existing.name,
          color: existing.color,
          sort_order: existing.sortOrder,
          ref_type: existing.refType,
          ref_id: existing.refId,
        },
        nowMs,
      });
    });
  }

  return {
    listCollectionItems,
    createFolder,
    createNoteRef,
    patchCollectionItem,
    deleteCollectionItem,
    restoreCollectionItem,
  };
}
