import crypto from 'node:crypto';

import type Database from 'better-sqlite3';

export const FLOW_RESOURCE = {
  note: 'note',
  userSetting: 'user_setting',
  todoList: 'todo_list',
  todoItem: 'todo_item',
  todoOccurrence: 'todo_occurrence',
  collectionItem: 'collection_item',
} as const;

export type FlowResource = (typeof FLOW_RESOURCE)[keyof typeof FLOW_RESOURCE];

export const FLOW_OP = {
  upsert: 'upsert',
  delete: 'delete',
} as const;

export type FlowOp = (typeof FLOW_OP)[keyof typeof FLOW_OP];

export const OUTBOX_STATUS = {
  pending: 'PENDING',
  inflight: 'INFLIGHT',
  applied: 'APPLIED',
  rejectedConflict: 'REJECTED_CONFLICT',
  failedRetryable: 'FAILED_RETRYABLE',
  failedFatal: 'FAILED_FATAL',
} as const;

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];

export interface BumpClientUpdatedAtMsArgs {
  lastMs: number | null | undefined;
  nowMs: number;
}

export function bumpClientUpdatedAtMs(args: BumpClientUpdatedAtMsArgs): number {
  const nowMs = args.nowMs;
  if (!Number.isInteger(nowMs) || nowMs < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }

  const lastMs = args.lastMs;
  if (lastMs === null || lastMs === undefined) {
    return nowMs;
  }

  if (!Number.isInteger(lastMs) || lastMs < 0) {
    throw new Error('lastMs 必须是非负整数（毫秒）');
  }

  return Math.max(nowMs, lastMs + 1);
}

function createOutboxId(): string {
  return crypto.randomUUID();
}

export interface EnqueueFlowOutboxMutationArgs {
  resource: FlowResource;
  op: FlowOp;
  entityId: string;
  clientUpdatedAtMs: number;
  data?: unknown;
  nowMs?: number;
}

export interface EnqueueFlowOutboxMutationResult {
  id: string;
  nowMs: number;
}

export function enqueueFlowOutboxMutation(
  db: Database.Database,
  args: EnqueueFlowOutboxMutationArgs
): EnqueueFlowOutboxMutationResult {
  const nowMs = args.nowMs ?? Date.now();
  if (!Number.isInteger(nowMs) || nowMs < 0) {
    throw new Error('nowMs 必须是非负整数（毫秒）');
  }

  if (!args.entityId || args.entityId.trim().length === 0) {
    throw new Error('entityId 不能为空');
  }

  if (!Number.isInteger(args.clientUpdatedAtMs) || args.clientUpdatedAtMs < 0) {
    throw new Error('clientUpdatedAtMs 必须是非负整数（毫秒）');
  }

  const id = createOutboxId();
  const dataJson = JSON.stringify(args.data ?? {});

  db.prepare(
    `
      INSERT INTO outbox_mutations (
        id,
        resource,
        op,
        entity_id,
        client_updated_at_ms,
        data_json,
        status,
        attempt,
        next_retry_at_ms,
        last_error_code,
        last_error_message,
        request_id,
        created_at_ms,
        updated_at_ms
      ) VALUES (
        @id,
        @resource,
        @op,
        @entity_id,
        @client_updated_at_ms,
        @data_json,
        @status,
        @attempt,
        @next_retry_at_ms,
        @last_error_code,
        @last_error_message,
        @request_id,
        @created_at_ms,
        @updated_at_ms
      )
    `
  ).run({
    id,
    resource: args.resource,
    op: args.op,
    entity_id: args.entityId,
    client_updated_at_ms: args.clientUpdatedAtMs,
    data_json: dataJson,
    status: OUTBOX_STATUS.pending,
    attempt: 0,
    next_retry_at_ms: nowMs,
    last_error_code: null,
    last_error_message: null,
    request_id: null,
    created_at_ms: nowMs,
    updated_at_ms: nowMs,
  });

  return { id, nowMs };
}

export function withImmediateTransaction<T>(
  db: Database.Database,
  fn: () => T
): T {
  const run = db.transaction(fn);
  return run.immediate();
}
