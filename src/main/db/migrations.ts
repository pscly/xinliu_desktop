import type Database from 'better-sqlite3';

export interface SqliteMigration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

export interface ApplyMigrationsResult {
  fromVersion: number;
  toVersion: number;
  appliedVersions: number[];
}

function getUserVersion(db: Database.Database): number {
  const v = db.pragma('user_version', { simple: true });
  return Number(v);
}

function setUserVersion(db: Database.Database, version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('user_version 必须是非负整数');
  }
  db.pragma(`user_version = ${version}`);
}

function validateMigrations(migrations: readonly SqliteMigration[]): void {
  for (let i = 0; i < migrations.length; i += 1) {
    const expected = i + 1;
    const actual = migrations[i]?.version;
    if (actual !== expected) {
      throw new Error(`迁移版本号必须从 1 连续递增（期望 ${expected}，实际 ${actual}）`);
    }
  }
}

export const MIGRATIONS: readonly SqliteMigration[] = [
  {
    version: 1,
    name: 'init_schema_meta',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: 'flow_domain_tables_todo_collections',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS todo_lists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NULL,
          sort_order INTEGER NOT NULL,
          archived INTEGER NOT NULL,
          client_updated_at_ms INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_todo_lists_archived ON todo_lists(archived);
        CREATE INDEX IF NOT EXISTS idx_todo_lists_deleted_at ON todo_lists(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_todo_lists_client_updated_at_ms ON todo_lists(client_updated_at_ms);

        CREATE TABLE IF NOT EXISTS todo_items (
          id TEXT PRIMARY KEY,
          list_id TEXT NOT NULL,
          parent_id TEXT NULL,
          title TEXT NOT NULL,
          note TEXT NOT NULL,
          status TEXT NOT NULL,
          priority INTEGER NOT NULL,
          due_at_local TEXT NULL,
          completed_at_local TEXT NULL,
          sort_order INTEGER NOT NULL,
          tags_json TEXT NOT NULL,
          is_recurring INTEGER NOT NULL,
          rrule TEXT NULL,
          dtstart_local TEXT NULL,
          tzid TEXT NOT NULL,
          reminders_json TEXT NOT NULL,
          client_updated_at_ms INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT NULL,
          FOREIGN KEY (list_id) REFERENCES todo_lists(id) DEFERRABLE INITIALLY DEFERRED,
          FOREIGN KEY (parent_id) REFERENCES todo_items(id) DEFERRABLE INITIALLY DEFERRED
        );

        CREATE INDEX IF NOT EXISTS idx_todo_items_list_id ON todo_items(list_id);
        CREATE INDEX IF NOT EXISTS idx_todo_items_parent_id ON todo_items(parent_id);
        CREATE INDEX IF NOT EXISTS idx_todo_items_deleted_at ON todo_items(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_todo_items_client_updated_at_ms ON todo_items(client_updated_at_ms);

        CREATE TABLE IF NOT EXISTS todo_occurrences (
          id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL,
          tzid TEXT NOT NULL,
          recurrence_id_local TEXT NOT NULL,
          status_override TEXT NULL,
          title_override TEXT NULL,
          note_override TEXT NULL,
          due_at_override_local TEXT NULL,
          completed_at_local TEXT NULL,
          client_updated_at_ms INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT NULL,
          FOREIGN KEY (item_id) REFERENCES todo_items(id) DEFERRABLE INITIALLY DEFERRED
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_todo_occurrences_item_tzid_recurrence
          ON todo_occurrences(item_id, tzid, recurrence_id_local);
        CREATE INDEX IF NOT EXISTS idx_todo_occurrences_item_id ON todo_occurrences(item_id);
        CREATE INDEX IF NOT EXISTS idx_todo_occurrences_deleted_at ON todo_occurrences(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_todo_occurrences_client_updated_at_ms
          ON todo_occurrences(client_updated_at_ms);

        CREATE TABLE IF NOT EXISTS collection_items (
          id TEXT PRIMARY KEY,
          item_type TEXT NOT NULL,
          parent_id TEXT NULL,
          name TEXT NOT NULL,
          color TEXT NULL,
          ref_type TEXT NULL,
          ref_id TEXT NULL,
          sort_order INTEGER NOT NULL,
          client_updated_at_ms INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT NULL,
          FOREIGN KEY (parent_id) REFERENCES collection_items(id) DEFERRABLE INITIALLY DEFERRED
        );

        CREATE INDEX IF NOT EXISTS idx_collection_items_parent_id ON collection_items(parent_id);
        CREATE INDEX IF NOT EXISTS idx_collection_items_deleted_at ON collection_items(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_collection_items_client_updated_at_ms
          ON collection_items(client_updated_at_ms);
        CREATE INDEX IF NOT EXISTS idx_collection_items_ref ON collection_items(ref_type, ref_id);
      `);
    },
  },
  {
    version: 3,
    name: 'flow_outbox_sync_state_jobs_user_settings',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS outbox_mutations (
          id TEXT PRIMARY KEY,
          resource TEXT NOT NULL,
          op TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          client_updated_at_ms INTEGER NOT NULL,
          data_json TEXT NOT NULL,
          status TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          next_retry_at_ms INTEGER NOT NULL,
          last_error_code TEXT NULL,
          last_error_message TEXT NULL,
          request_id TEXT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_outbox_mutations_status_next_retry
          ON outbox_mutations(status, next_retry_at_ms);
        CREATE INDEX IF NOT EXISTS idx_outbox_mutations_resource_entity
          ON outbox_mutations(resource, entity_id);
        CREATE INDEX IF NOT EXISTS idx_outbox_mutations_client_updated_at_ms
          ON outbox_mutations(client_updated_at_ms);

        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          dedupe_key TEXT NULL,
          payload_json TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          next_run_at_ms INTEGER NOT NULL,
          last_error_code TEXT NULL,
          last_error_message TEXT NULL,
          updated_at_ms INTEGER NOT NULL,
          created_at_ms INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_dedupe_key ON jobs(dedupe_key);
        CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run_at ON jobs(status, next_run_at_ms);

        CREATE TABLE IF NOT EXISTS user_settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          client_updated_at_ms INTEGER NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_user_settings_deleted_at ON user_settings(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_user_settings_client_updated_at_ms
          ON user_settings(client_updated_at_ms);
      `);
    },
  },
  {
    version: 4,
    name: 'notes_memos_and_attachments',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS memos (
          local_uuid TEXT PRIMARY KEY,
          server_memo_id TEXT NULL,
          server_memo_name TEXT NULL,
          content TEXT NOT NULL,
          visibility TEXT NOT NULL,
          sync_status TEXT NOT NULL
            CHECK(sync_status IN ('LOCAL_ONLY', 'DIRTY', 'SYNCING', 'SYNCED', 'FAILED')),
          last_error TEXT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_memos_server_memo_id
          ON memos(server_memo_id)
          WHERE server_memo_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_memos_server_memo_name
          ON memos(server_memo_name)
          WHERE server_memo_name IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_memos_sync_status ON memos(sync_status);
        CREATE INDEX IF NOT EXISTS idx_memos_updated_at_ms ON memos(updated_at_ms);

        CREATE TABLE IF NOT EXISTS memo_attachments (
          id TEXT PRIMARY KEY,
          memo_local_uuid TEXT NOT NULL,
          server_attachment_name TEXT NULL,
          local_relpath TEXT NULL,
          cache_relpath TEXT NULL,
          cache_key TEXT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          FOREIGN KEY (memo_local_uuid) REFERENCES memos(local_uuid)
            ON DELETE CASCADE
            DEFERRABLE INITIALLY DEFERRED
        );

        CREATE INDEX IF NOT EXISTS idx_memo_attachments_memo_local_uuid
          ON memo_attachments(memo_local_uuid);
        CREATE INDEX IF NOT EXISTS idx_memo_attachments_cache_key
          ON memo_attachments(cache_key);
      `);
    },
  },
  {
    version: 5,
    name: 'notes_flow_notes_degraded_local_cache',
    up: (db) => {
      db.exec(`
        -- Flow Notes 降级 provider 专用本地表。
        -- 使用边界：仅当本次请求路由结果为 Flow Notes(degraded) 时才允许读写（由代码层守卫强制）。
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          body_md TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          client_updated_at_ms INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT NULL,

          -- 诊断/回放字段（至少包含 request_id/lastError/providerReason）。
          provider_reason TEXT NOT NULL,
          last_request_id TEXT NULL,
          last_error TEXT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_notes_client_updated_at_ms
          ON notes(client_updated_at_ms);
      `);
    },
  },
  {
    version: 6,
    name: 'memo_attachments_cache_lru_meta',
    up: (db) => {
      db.exec(`
        -- 附件缓存(LRU/配额)元数据：main 侧维护。
        -- local_relpath(原件) 不参与 GC；cache_relpath(缓存) 受 LRU 驱逐。

        ALTER TABLE memo_attachments ADD COLUMN cache_size_bytes INTEGER NULL;
        ALTER TABLE memo_attachments ADD COLUMN last_access_at_ms INTEGER NULL;

        -- cacheKey 必须是不透明标识（禁止把 relpath 塞进 memo-res URL）。
        -- 用 SQLite 随机数回填缺失 key（无需依赖 Node/Electron runtime）。
        UPDATE memo_attachments
        SET cache_key = 'att_' || lower(hex(randomblob(16)))
        WHERE cache_key IS NULL OR TRIM(cache_key) = '';

        -- cache_key 用于 memo-res://<cacheKey> 映射，必须唯一（NULL 允许）。
        CREATE UNIQUE INDEX IF NOT EXISTS uq_memo_attachments_cache_key
          ON memo_attachments(cache_key)
          WHERE cache_key IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_memo_attachments_last_access_at_ms
          ON memo_attachments(last_access_at_ms);
      `);
    },
  },
];

export function applyMigrations(
  db: Database.Database,
  migrations: readonly SqliteMigration[] = MIGRATIONS
): ApplyMigrationsResult {
  validateMigrations(migrations);

  const fromVersion = getUserVersion(db);
  const latest = migrations.length;

  if (!Number.isInteger(fromVersion) || fromVersion < 0) {
    throw new Error('当前 user_version 非法');
  }

  if (fromVersion > latest) {
    throw new Error(
      `数据库版本(${fromVersion})高于当前可识别版本(${latest})，可能需要升级客户端`
    );
  }

  const appliedVersions: number[] = [];

  const run = db.transaction(() => {
    let v = getUserVersion(db);

    for (let i = v; i < latest; i += 1) {
      const migration = migrations[i];
      if (!migration) {
        throw new Error(`缺失迁移定义：version=${i + 1}`);
      }

      migration.up(db);
      const next = i + 1;
      setUserVersion(db, next);
      appliedVersions.push(next);
      v = next;
    }
  });

  run.immediate();

  const toVersion = getUserVersion(db);
  return {
    fromVersion,
    toVersion,
    appliedVersions,
  };
}
