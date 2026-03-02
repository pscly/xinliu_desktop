import crypto from 'node:crypto';

import type Database from 'better-sqlite3';

import type { FlowConflictItem, FlowConflictOp } from '../../shared/ipc';
import { applyFlowSnapshotForResource, type FlowApplyResource } from './flowSyncPull';
import {
  FLOW_OP,
  FLOW_RESOURCE,
  OUTBOX_STATUS,
  bumpClientUpdatedAtMs,
  enqueueFlowOutboxMutation,
  withImmediateTransaction,
} from '../sync/outbox';

type JsonObject = Record<string, unknown>;

interface FlowConflictOutboxRow {
  id: string;
  resource: string;
  op: string;
  entity_id: string;
  client_updated_at_ms: number;
  data_json: string;
  last_error_message: string | null;
  request_id: string | null;
  updated_at_ms: number;
}

export interface ResolveFlowConflictApplyServerArgs {
  outboxId: string;
  nowMs?: () => number;
}

export interface ResolveFlowConflictKeepLocalCopyArgs {
  outboxId: string;
  nowMs?: () => number;
  randomUUID?: () => string;
}

export interface ResolveFlowConflictForceOverrideArgs {
  outboxId: string;
  nowMs?: () => number;
}

function safeNowMs(nowMs?: () => number): number {
  const value = (nowMs ?? Date.now)();
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }
  return value;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return value;
}

function parseJsonObject(value: string): JsonObject | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as JsonObject;
  } catch {
    return null;
  }
}

function parseServerSnapshot(lastErrorMessage: string | null): JsonObject | null {
  if (typeof lastErrorMessage !== 'string') {
    return null;
  }
  const parsed = parseJsonObject(lastErrorMessage);
  if (!parsed) {
    return null;
  }
  const server = parsed['server'];
  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    return null;
  }
  return server as JsonObject;
}

function toFlowApplyResource(resource: string): FlowApplyResource {
  if (resource === FLOW_RESOURCE.todoList) return 'todo_list';
  if (resource === FLOW_RESOURCE.todoItem) return 'todo_item';
  if (resource === FLOW_RESOURCE.todoOccurrence) return 'todo_occurrence';
  if (resource === FLOW_RESOURCE.collectionItem) return 'collection_item';
  if (resource === FLOW_RESOURCE.userSetting) return 'user_setting';
  throw new Error(`暂不支持的冲突资源：${resource}`);
}

function toFlowResource(
  resource: string
): (typeof FLOW_RESOURCE)[keyof typeof FLOW_RESOURCE] | never {
  if (
    resource !== FLOW_RESOURCE.todoList &&
    resource !== FLOW_RESOURCE.todoItem &&
    resource !== FLOW_RESOURCE.todoOccurrence &&
    resource !== FLOW_RESOURCE.collectionItem &&
    resource !== FLOW_RESOURCE.userSetting &&
    resource !== FLOW_RESOURCE.note
  ) {
    throw new Error(`不支持的 outbox 资源：${resource}`);
  }
  return resource;
}

function toFlowOp(op: string): FlowConflictOp | never {
  if (op !== FLOW_OP.upsert && op !== FLOW_OP.delete) {
    throw new Error(`不支持的 outbox 操作：${op}`);
  }
  return op;
}

function readConflictRow(db: Database.Database, outboxId: string): FlowConflictOutboxRow {
  const row = db
    .prepare(
      `
        SELECT
          id,
          resource,
          op,
          entity_id,
          client_updated_at_ms,
          data_json,
          last_error_message,
          updated_at_ms,
          created_at_ms
        FROM outbox_mutations
        WHERE id = @id AND status = @status
      `
    )
    .get({ id: outboxId, status: OUTBOX_STATUS.rejectedConflict }) as
    | FlowConflictOutboxRow
    | undefined;
  if (!row) {
    throw new Error('冲突记录不存在或已处理');
  }
  return row;
}

function markOutboxApplied(db: Database.Database, args: { outboxId: string; nowMs: number }): void {
  db.prepare(
    `
      UPDATE outbox_mutations
      SET
        status = @status,
        next_retry_at_ms = @next_retry_at_ms,
        last_error_code = NULL,
        last_error_message = NULL,
        updated_at_ms = @updated_at_ms
      WHERE id = @id
    `
  ).run({
    id: args.outboxId,
    status: OUTBOX_STATUS.applied,
    next_retry_at_ms: args.nowMs,
    updated_at_ms: args.nowMs,
  });
}

function intOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function strOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function boolOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function arrOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeServerSnapshotForApply(args: {
  resource: string;
  entityId: string;
  serverSnapshot: JsonObject;
  fallbackClientUpdatedAtMs: number;
}): JsonObject {
  const applyResource = toFlowApplyResource(args.resource);
  const input = args.serverSnapshot;
  const clientUpdatedAtMs =
    typeof input['client_updated_at_ms'] === 'number' &&
    Number.isFinite(input['client_updated_at_ms']) &&
    input['client_updated_at_ms'] >= 0
      ? Math.trunc(input['client_updated_at_ms'])
      : args.fallbackClientUpdatedAtMs;

  if (applyResource === 'todo_list') {
    return {
      ...input,
      id: strOrDefault(input['id'], args.entityId),
      client_updated_at_ms: clientUpdatedAtMs,
    };
  }
  if (applyResource === 'todo_item') {
    return {
      ...input,
      id: strOrDefault(input['id'], args.entityId),
      client_updated_at_ms: clientUpdatedAtMs,
    };
  }
  if (applyResource === 'todo_occurrence') {
    return {
      ...input,
      id: strOrDefault(input['id'], args.entityId),
      client_updated_at_ms: clientUpdatedAtMs,
    };
  }
  if (applyResource === 'collection_item') {
    return {
      ...input,
      id: strOrDefault(input['id'], args.entityId),
      client_updated_at_ms: clientUpdatedAtMs,
    };
  }
  return {
    ...input,
    key: strOrDefault(input['key'], args.entityId),
    client_updated_at_ms: clientUpdatedAtMs,
  };
}

function buildLocalCopySnapshotForApply(args: {
  resource: string;
  localData: JsonObject;
  newEntityId: string;
  clientUpdatedAtMs: number;
  nowMs: number;
}): JsonObject {
  const nowIso = new Date(args.nowMs).toISOString();
  const applyResource = toFlowApplyResource(args.resource);
  const data = args.localData;

  if (applyResource === 'todo_list') {
    return {
      id: args.newEntityId,
      name: strOrDefault(data['name'], ''),
      color: strOrNull(data['color']),
      sort_order: intOrDefault(data['sort_order'], 0),
      archived: boolOrDefault(data['archived'], false),
      client_updated_at_ms: args.clientUpdatedAtMs,
      updated_at: strOrDefault(data['updated_at'], nowIso),
      deleted_at: strOrNull(data['deleted_at']),
    };
  }

  if (applyResource === 'todo_item') {
    const listId = requireNonEmptyString(data['list_id'], 'todo_item.list_id');
    return {
      id: args.newEntityId,
      list_id: listId,
      parent_id: strOrNull(data['parent_id']),
      title: strOrDefault(data['title'], ''),
      note: strOrDefault(data['note'], ''),
      status: strOrDefault(data['status'], 'todo'),
      priority: intOrDefault(data['priority'], 0),
      due_at_local: strOrNull(data['due_at_local']),
      completed_at_local: strOrNull(data['completed_at_local']),
      sort_order: intOrDefault(data['sort_order'], 0),
      tags: arrOrEmpty(data['tags']),
      is_recurring: boolOrDefault(data['is_recurring'], false),
      rrule: strOrNull(data['rrule']),
      dtstart_local: strOrNull(data['dtstart_local']),
      tzid: strOrDefault(data['tzid'], 'Asia/Shanghai'),
      reminders: arrOrEmpty(data['reminders']),
      client_updated_at_ms: args.clientUpdatedAtMs,
      updated_at: strOrDefault(data['updated_at'], nowIso),
      deleted_at: strOrNull(data['deleted_at']),
    };
  }

  if (applyResource === 'todo_occurrence') {
    const itemId = requireNonEmptyString(data['item_id'], 'todo_occurrence.item_id');
    const recurrenceIdLocal = requireNonEmptyString(
      data['recurrence_id_local'],
      'todo_occurrence.recurrence_id_local'
    );
    return {
      id: args.newEntityId,
      item_id: itemId,
      tzid: strOrDefault(data['tzid'], 'Asia/Shanghai'),
      recurrence_id_local: recurrenceIdLocal,
      status_override: strOrNull(data['status_override']),
      title_override: strOrNull(data['title_override']),
      note_override: strOrNull(data['note_override']),
      due_at_override_local: strOrNull(data['due_at_override_local']),
      completed_at_local: strOrNull(data['completed_at_local']),
      client_updated_at_ms: args.clientUpdatedAtMs,
      updated_at: strOrDefault(data['updated_at'], nowIso),
      deleted_at: strOrNull(data['deleted_at']),
    };
  }

  if (applyResource === 'collection_item') {
    const itemType = requireNonEmptyString(data['item_type'], 'collection_item.item_type');
    return {
      id: args.newEntityId,
      item_type: itemType,
      parent_id: strOrNull(data['parent_id']),
      name: strOrDefault(data['name'], ''),
      color: strOrNull(data['color']),
      ref_type: strOrNull(data['ref_type']),
      ref_id: strOrNull(data['ref_id']),
      sort_order: intOrDefault(data['sort_order'], 0),
      client_updated_at_ms: args.clientUpdatedAtMs,
      created_at: strOrDefault(data['created_at'], nowIso),
      updated_at: strOrDefault(data['updated_at'], nowIso),
      deleted_at: strOrNull(data['deleted_at']),
    };
  }

  return {
    key: args.newEntityId,
    value_json:
      typeof data['value_json'] === 'string'
        ? data['value_json']
        : JSON.stringify(data['value'] ?? {}),
    client_updated_at_ms: args.clientUpdatedAtMs,
    updated_at: strOrDefault(data['updated_at'], nowIso),
    deleted_at: strOrNull(data['deleted_at']),
  };
}

function readServerClientUpdatedAtMs(serverSnapshot: JsonObject | null): number | null {
  if (!serverSnapshot) {
    return null;
  }
  const value = serverSnapshot['client_updated_at_ms'];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

export function listFlowConflicts(db: Database.Database): FlowConflictItem[] {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          resource,
          op,
          entity_id,
          client_updated_at_ms,
          data_json,
          last_error_message,
          request_id,
          updated_at_ms
        FROM outbox_mutations
        WHERE status = @status
        ORDER BY updated_at_ms DESC, created_at_ms DESC
      `
    )
    .all({ status: OUTBOX_STATUS.rejectedConflict }) as FlowConflictOutboxRow[];

  return rows.map((row) => ({
    outboxId: row.id,
    resource: toFlowResource(row.resource),
    op: toFlowOp(row.op),
    entityId: row.entity_id,
    clientUpdatedAtMs: Number(row.client_updated_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    requestId: row.request_id,
    localData: parseJsonObject(row.data_json) ?? {},
    serverSnapshot: parseServerSnapshot(row.last_error_message),
  }));
}

export function resolveFlowConflictApplyServer(
  db: Database.Database,
  args: ResolveFlowConflictApplyServerArgs
): { outboxId: string } {
  const outboxId = requireNonEmptyString(args.outboxId, 'outboxId');
  const row = readConflictRow(db, outboxId);
  const serverSnapshot = parseServerSnapshot(row.last_error_message);
  if (!serverSnapshot) {
    throw new Error('缺少服务端快照，无法应用服务端版本');
  }

  const nowMs = safeNowMs(args.nowMs);
  withImmediateTransaction(db, () => {
    const normalized = normalizeServerSnapshotForApply({
      resource: row.resource,
      entityId: row.entity_id,
      serverSnapshot,
      fallbackClientUpdatedAtMs: row.client_updated_at_ms,
    });
    applyFlowSnapshotForResource(db, {
      resource: toFlowApplyResource(row.resource),
      snapshot: normalized,
    });
    markOutboxApplied(db, { outboxId, nowMs });
  });

  return { outboxId };
}

export function resolveFlowConflictKeepLocalCopy(
  db: Database.Database,
  args: ResolveFlowConflictKeepLocalCopyArgs
): { outboxId: string; newEntityId: string } {
  const outboxId = requireNonEmptyString(args.outboxId, 'outboxId');
  const row = readConflictRow(db, outboxId);
  if (row.op !== FLOW_OP.upsert) {
    throw new Error('仅支持对 upsert 冲突保留本地副本');
  }

  const localData = parseJsonObject(row.data_json);
  if (!localData) {
    throw new Error('缺少本地版本数据，无法保留本地副本');
  }

  const serverSnapshot = parseServerSnapshot(row.last_error_message);
  if (!serverSnapshot) {
    throw new Error('缺少服务端快照，无法执行冲突裁决');
  }

  const randomUUID = args.randomUUID ?? crypto.randomUUID;
  const newEntityId = requireNonEmptyString(randomUUID(), 'newEntityId');
  const nowMs = safeNowMs(args.nowMs);
  const localCopyClientUpdatedAtMs = bumpClientUpdatedAtMs({
    lastMs: row.client_updated_at_ms,
    nowMs,
  });

  withImmediateTransaction(db, () => {
    const localCopySnapshot = buildLocalCopySnapshotForApply({
      resource: row.resource,
      localData,
      newEntityId,
      clientUpdatedAtMs: localCopyClientUpdatedAtMs,
      nowMs,
    });
    applyFlowSnapshotForResource(db, {
      resource: toFlowApplyResource(row.resource),
      snapshot: localCopySnapshot,
    });

    const copiedOutboxData: JsonObject = { ...localData };
    if (typeof copiedOutboxData['id'] === 'string') {
      copiedOutboxData['id'] = newEntityId;
    }
    if (typeof copiedOutboxData['key'] === 'string') {
      copiedOutboxData['key'] = newEntityId;
    }
    if (typeof copiedOutboxData['client_updated_at_ms'] === 'number') {
      copiedOutboxData['client_updated_at_ms'] = localCopyClientUpdatedAtMs;
    }

    enqueueFlowOutboxMutation(db, {
      resource: toFlowResource(row.resource),
      op: FLOW_OP.upsert,
      entityId: newEntityId,
      clientUpdatedAtMs: localCopyClientUpdatedAtMs,
      data: copiedOutboxData,
      nowMs,
    });

    const normalizedServerSnapshot = normalizeServerSnapshotForApply({
      resource: row.resource,
      entityId: row.entity_id,
      serverSnapshot,
      fallbackClientUpdatedAtMs: row.client_updated_at_ms,
    });
    applyFlowSnapshotForResource(db, {
      resource: toFlowApplyResource(row.resource),
      snapshot: normalizedServerSnapshot,
    });

    markOutboxApplied(db, { outboxId, nowMs });
  });

  return { outboxId, newEntityId };
}

export function resolveFlowConflictForceOverride(
  db: Database.Database,
  args: ResolveFlowConflictForceOverrideArgs
): { outboxId: string; nextClientUpdatedAtMs: number } {
  const outboxId = requireNonEmptyString(args.outboxId, 'outboxId');
  const row = readConflictRow(db, outboxId);
  const nowMs = safeNowMs(args.nowMs);

  const serverSnapshot = parseServerSnapshot(row.last_error_message);
  const serverClientUpdatedAtMs = readServerClientUpdatedAtMs(serverSnapshot);
  const nextClientUpdatedAtMs = Math.max(
    nowMs,
    serverClientUpdatedAtMs !== null
      ? serverClientUpdatedAtMs + 1
      : bumpClientUpdatedAtMs({ lastMs: row.client_updated_at_ms, nowMs })
  );

  const localData = parseJsonObject(row.data_json);
  const nextDataJson = (() => {
    if (!localData) {
      return row.data_json;
    }
    if (typeof localData['client_updated_at_ms'] === 'number') {
      localData['client_updated_at_ms'] = nextClientUpdatedAtMs;
    }
    return JSON.stringify(localData);
  })();

  withImmediateTransaction(db, () => {
    db.prepare(
      `
        UPDATE outbox_mutations
        SET
          status = @status,
          client_updated_at_ms = @client_updated_at_ms,
          data_json = @data_json,
          attempt = 0,
          next_retry_at_ms = @next_retry_at_ms,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at_ms = @updated_at_ms
        WHERE id = @id
      `
    ).run({
      id: outboxId,
      status: OUTBOX_STATUS.pending,
      client_updated_at_ms: nextClientUpdatedAtMs,
      data_json: nextDataJson,
      next_retry_at_ms: nowMs,
      updated_at_ms: nowMs,
    });
  });

  return { outboxId, nextClientUpdatedAtMs };
}
