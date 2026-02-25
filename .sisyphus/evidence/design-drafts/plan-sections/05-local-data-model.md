# 05. 本地 SQLite 数据模型 + 存储目录布局 + 迁移策略（Windows 桌面端）

本文定义 Windows 桌面端的本地持久化“最小完整表集”、关键字段与索引策略、磁盘目录布局，以及用户更改存储根目录时的原子迁移与失败回滚口径。

本节只写规格，不写实现代码。

## 1. 总体原则（离线优先 + 原子写入）

1) 离线优先

- UI 以本地 SQLite 为权威读取源：断网可浏览/新增/编辑/删除，联网后由后台同步任务最终一致。

2) 本地写入原子化

- 任何会影响“可见状态”的写操作，必须在**单个事务**内完成：业务表写入 + outbox（若需要）+ 同步/作业调度记录（若需要）。
- 事务边界外只允许做副作用（例如网络请求、文件复制），且必须可重试。

3) Renderer 禁直连（只定义边界）

- renderer 进程不得直接访问 SQLite/文件系统写入。
- 所有读写通过 main 进程的窄接口完成；main 负责事务、并发与回滚。

4) 单写者模型

- SQLite 连接由 main 进程统一持有；多窗口并发写入在 main 侧串行化，避免并发写导致的锁争用与状态撕裂。

## 2. 关键字段与不变量（与后端合同对齐）

本项目是混合后端：Flow 负责 Auth/Todo/Collections/Sync；Notes 直连 Memos（见 `.sisyphus/drafts/plan-sections/04-backend-contracts.md`）。

### 2.1 `client_updated_at_ms`（并发/排序的客户端时间戳）

- Flow 侧（todo_lists/todo_items/todo_occurrences/collection_items/user_settings/notes）使用 `client_updated_at_ms` 做 LWW（Last-Write-Wins）。
- 客户端必须保证对同一实体 id 的 `client_updated_at_ms` **单调递增**：推荐写入时取 `max(now_ms, last_client_updated_at_ms + 1)`。
- 本地也为 Memos 的 memos 写入维护 `client_updated_at_ms`（用于本地多窗口并发与“先落库后同步”的写序），但注意它不等同于 Memos 服务端的 `update_time/updated_at`。

### 2.2 `deleted_at`（软删除 tombstone）

- Flow 侧同步 pull 会下发 tombstone：`deleted_at != null` 表示已删除（应从 UI 隐藏，但建议本地保留以便一致性与 debug）。
- 对应本地表应保留 `deleted_at` 字段；删除操作不应物理删除行（除非是明确的 GC/清理策略）。

### 2.3 ID 形态与“不可当路径片段”约束

- Flow 侧实体 id（例如 `todo_item.id="item_123"`、`note.id="note_123"`）可直接作为 SQLite 主键字符串。
- Memos 侧 Memo 的资源名可能是 `memos/123`（包含 `/`）。因此：
  - 本地 schema 的 `ref_id`/索引不应假设该值可当文件名或路径片段。
  - 文件系统层禁止把 `memoName`（或任何含 `/` 的资源名）直接拼进目录/文件名。

## 3. 数据库配置与迁移策略（版本化）

### 3.1 数据库文件与 WAL

- 采用 WAL 模式（提升并发读、降低 UI 卡顿）。
- 定期 checkpoint（避免 WAL 无限增长），策略由 main 进程统一控制。

### 3.2 Schema 版本与迁移

- 维护 `schema_version`（应用侧）与 `PRAGMA user_version`（SQLite 侧）的一致性。
- 迁移必须可重复执行（幂等），失败必须整体回滚（SQLite 事务包裹 DDL/DML）。

## 4. 表清单（最小完整表集）

说明：

- 下文表名使用复数风格，与文档约定一致（例如 `memos`、`todo_items`、`collection_items`）。
- Flow 侧资源字段口径以 `apidocs/api.zh-CN.md` 与 `apidocs/collections.zh-CN.md` 为准。

### 4.1 `memos`（直连 Memos：笔记主数据）

用途：存储 Memos 的 memo 作为桌面端“笔记正文”的本地权威副本，支持离线编辑与后续同步。

主键与 ID：

- `local_uuid` TEXT PRIMARY KEY：本地稳定 UUID（内部引用/外键只用它）。
- `server_memo_id` TEXT NULL：Memos 的 memo id（不含 `/`）；用于官方 `/memos/{memo}` 形式。
- `server_memo_name` TEXT NULL：Memos 的 `name`（例如 `memos/123`，包含 `/`），仅作为显示/对照字段；不得用作文件名。

关键字段：

- `content_md` TEXT NOT NULL：正文（Markdown）。
- `visibility` TEXT NOT NULL：与服务端对齐。
- `state` TEXT NOT NULL：NORMAL/ARCHIVED 等（与服务端对齐）。
- `tags_json` TEXT NOT NULL：JSON 数组字符串（用于同步/展示）。
- `client_updated_at_ms` INTEGER NOT NULL：本地写序与冲突辅助。
- `server_updated_at` TEXT NULL：服务端 `updated_at/update_time`（ISO8601 或服务端原样字符串，按实际接口返回存）。
- `deleted_at` TEXT NULL：本地软删 tombstone（用于“先删后同步”与崩溃恢复）。

建议索引：

- `idx_memos_state_server_updated_at`（`state`, `server_updated_at`）用于列表分页。
- `idx_memos_client_updated_at_ms`（`client_updated_at_ms`）用于本地变更扫描。
- `uq_memos_server_memo_id` UNIQUE（`server_memo_id`）用于回拉 upsert 对齐。

### 4.2 `memo_attachments`（memos 的附件元数据）

用途：把附件与 memo 绑定，支撑离线缓存与上传状态。

- `id` TEXT PRIMARY KEY：本地附件 UUID。
- `memo_local_uuid` TEXT NOT NULL：外键引用 `memos.local_uuid`。
- `kind` TEXT NOT NULL：image/file 等（客户端自定义枚举）。
- `filename` TEXT NOT NULL
- `mime_type` TEXT NULL
- `size_bytes` INTEGER NULL
- `local_relpath` TEXT NULL：相对存储根目录的附件文件路径（不存绝对路径）。
- `cache_relpath` TEXT NULL：预取/缓存路径（同样是相对路径）。
- `remote_name` TEXT NULL：服务端附件引用（若存在）。
- `client_updated_at_ms` INTEGER NOT NULL
- `deleted_at` TEXT NULL

建议索引：

- `idx_memo_attachments_memo_local_uuid`（`memo_local_uuid`）
- `idx_memo_attachments_dirty`（可用 `deleted_at`/`remote_name`/状态组合做查询）

### 4.3 `memo_revisions`（可选：memos 的本地修订/冲突快照）

用途：保留本地编辑历史与冲突副本，避免同步冲突时丢内容。

- `id` TEXT PRIMARY KEY
- `memo_local_uuid` TEXT NOT NULL
- `reason` TEXT NOT NULL：例如 `autosave`/`conflict_snapshot`/`manual_checkpoint`
- `snapshot_content_md` TEXT NOT NULL
- `created_at_ms` INTEGER NOT NULL

### 4.4 `notes`（Flow：可同步的 Note 资源）

用途：为 Flow `/api/v1/notes` 与 `/api/v1/sync/*` 的 `resource="note"` 提供离线落库能力。

说明：桌面端“主笔记”走 Memos（`memos` 表），但 Flow Sync 协议明确存在 `changes.notes[]` 与 `resource="note"` 的 mutations；因此本地需要 `notes` 表以做到协议完备、可回放、可 debug。

- `id` TEXT PRIMARY KEY：例如 `note_123`。
- `title` TEXT NULL
- `body_md` TEXT NOT NULL
- `tags_json` TEXT NOT NULL
- `client_updated_at_ms` INTEGER NOT NULL
- `created_at` TEXT NULL
- `updated_at` TEXT NULL
- `deleted_at` TEXT NULL

建议索引：

- `idx_notes_client_updated_at_ms`（`client_updated_at_ms`）
- `idx_notes_deleted_at`（`deleted_at`）

### 4.5 `todo_lists`（Flow：TODO 列表）

- `id` TEXT PRIMARY KEY：例如 `list_123`。
- `name` TEXT NOT NULL
- `color` TEXT NULL
- `sort_order` INTEGER NOT NULL
- `archived` INTEGER NOT NULL：0/1
- `client_updated_at_ms` INTEGER NOT NULL
- `updated_at` TEXT NULL
- `deleted_at` TEXT NULL：服务端目前对 list 的 delete 为幂等 ok；本地仍保留 tombstone 以便一致性

索引：

- `idx_todo_lists_archived_sort`（`archived`, `sort_order`, `updated_at`）

### 4.6 `todo_items`（Flow：TODO 条目）

- `id` TEXT PRIMARY KEY：例如 `item_123`。
- `list_id` TEXT NOT NULL：外键到 `todo_lists.id`。
- `parent_id` TEXT NULL：子任务。
- `title` TEXT NOT NULL
- `note` TEXT NULL
- `status` TEXT NOT NULL：与服务端枚举对齐。
- `priority` INTEGER NULL
- `due_at_local` TEXT NULL：本地时间字符串 `YYYY-MM-DDTHH:mm:ss`。
- `completed_at_local` TEXT NULL：同上。
- `sort_order` INTEGER NOT NULL
- `tags_json` TEXT NOT NULL
- `is_recurring` INTEGER NOT NULL
- `rrule` TEXT NULL
- `dtstart_local` TEXT NULL
- `tzid` TEXT NOT NULL
- `reminders_json` TEXT NOT NULL：JSON 数组字符串（结构由客户端定义；服务端透传）。
- `client_updated_at_ms` INTEGER NOT NULL
- `updated_at` TEXT NULL
- `deleted_at` TEXT NULL

索引与查询建议：

- `idx_todo_items_list_status_sort`（`list_id`, `status`, `sort_order`）用于列表分页。
- `idx_todo_items_due_at_local`（`due_at_local`）用于日历/提醒扫描。
- tag 过滤建议使用辅助表 `todo_item_tags`（见 4.13），避免每次 `json_each` 带来的全表扫描。

### 4.7 `todo_occurrences`（Flow：循环任务 occurrence）

- `id` TEXT PRIMARY KEY：例如 `occ_123`。
- `item_id` TEXT NOT NULL：外键到 `todo_items.id`。
- `tzid` TEXT NOT NULL
- `recurrence_id_local` TEXT NOT NULL：去重键（与后端一致）。
- `status_override` TEXT NULL
- `title_override` TEXT NULL
- `note_override` TEXT NULL
- `due_at_override_local` TEXT NULL
- `completed_at_local` TEXT NULL
- `client_updated_at_ms` INTEGER NOT NULL
- `updated_at` TEXT NULL
- `deleted_at` TEXT NULL

索引：

- `uq_todo_occurrences_item_recurrence` UNIQUE（`item_id`, `tzid`, `recurrence_id_local`）
- `idx_todo_occurrences_item_id`（`item_id`）

### 4.8 `collection_items`（Flow：Collections 结构层）

字段（与 `apidocs/collections.zh-CN.md` 对齐，并扩展本地双轨引用字段）：

- `id` TEXT PRIMARY KEY：建议 UUIDv4。
- `item_type` TEXT NOT NULL：`folder` / `note_ref`。
- `parent_id` TEXT NULL
- `name` TEXT NOT NULL：folder 必须非空；note_ref 允许空字符串（本地仍存，避免 NULL/空语义漂移）。
- `color` TEXT NULL
- `ref_type` TEXT NULL：`flow_note` / `memos_memo`（note_ref 必填）。
- `ref_id` TEXT NULL：服务端引用 id（note_ref 必填）。
- `ref_local_uuid` TEXT NULL：本地引用 uuid（用于双轨引用，见第 5 章）。
- `sort_order` INTEGER NOT NULL
- `client_updated_at_ms` INTEGER NOT NULL
- `created_at` TEXT NULL
- `updated_at` TEXT NULL
- `deleted_at` TEXT NULL

索引：

- `idx_collection_items_parent_sort`（`parent_id`, `sort_order`, `created_at`）
- `idx_collection_items_ref_local_uuid`（`ref_local_uuid`）用于 backfill。
- `idx_collection_items_ref_id`（`ref_id`）用于从服务端引用反查。

### 4.9 `user_settings`（Flow：user_setting）

- `key` TEXT PRIMARY KEY：例如 `ui.theme`。
- `value_json` TEXT NOT NULL：JSON 对象字符串。
- `client_updated_at_ms` INTEGER NOT NULL
- `updated_at` TEXT NULL
- `deleted_at` TEXT NULL

索引：

- `idx_user_settings_client_updated_at_ms`（`client_updated_at_ms`）

### 4.10 `sync_state`（同步游标与分区状态）

用途：持久化 Flow Sync pull/push 进度、分区与幂等标记；避免崩溃后重复应用/漏应用。

建议按 owner 分区（ownerKey 的概念来自 Android 端经验）：

- `owner_key` TEXT NOT NULL：例如当前登录用户/工作区的稳定 key。
- `channel` TEXT NOT NULL：`flow` / `memos`（两条链路状态分离，避免 cursor 混用）。
- `cursor` INTEGER NOT NULL：Flow 对应 `/sync/pull` cursor。
- `next_cursor` INTEGER NOT NULL
- `has_more` INTEGER NOT NULL
- `last_pull_at_ms` INTEGER NOT NULL
- `last_push_at_ms` INTEGER NOT NULL
- `last_error` TEXT NULL
- `updated_at_ms` INTEGER NOT NULL
- PRIMARY KEY (`owner_key`, `channel`)

### 4.11 `outbox_mutations`（离线写入队列：可回放）

用途：把本地写操作持久化为“可重试的变更单元”，由后台同步任务消费。该表是离线优先的核心：只要事务提交成功，就保证最终可同步（除非用户显式清理数据）。

字段：

- `id` TEXT PRIMARY KEY：mutation UUID。
- `owner_key` TEXT NOT NULL
- `channel` TEXT NOT NULL：`flow` / `memos`。
- `resource` TEXT NOT NULL：Flow 侧例如 `todo_item`/`todo_list`/`todo_occurrence`/`collection_item`/`user_setting`/`note`；Memos 侧可用 `memo`/`memo_attachment`。
- `op` TEXT NOT NULL：`upsert` / `delete`（与 Flow Sync 合同一致；Memos 侧也沿用该枚举）。
- `entity_id` TEXT NOT NULL：对应资源 id（Flow 直接用服务端 id；Memos 建议用 `memos.local_uuid`）。
- `client_updated_at_ms` INTEGER NOT NULL：必须与对应实体写入保持一致（同一事务内写入）。
- `data_json` TEXT NULL：upsert payload；delete 时可为 NULL。
- `dedupe_key` TEXT NULL：用于幂等合并（例如同一实体的连续编辑可合并为最后一次 upsert）。
- `status` TEXT NOT NULL：`PENDING`/`INFLIGHT`/`APPLIED`/`REJECTED_CONFLICT`/`FAILED_RETRYABLE`/`FAILED_FATAL`。
- `attempt` INTEGER NOT NULL
- `next_retry_at_ms` INTEGER NOT NULL
- `last_error` TEXT NULL
- `created_at_ms` INTEGER NOT NULL
- `updated_at_ms` INTEGER NOT NULL

索引：

- `idx_outbox_owner_status_retry`（`owner_key`, `status`, `next_retry_at_ms`）
- `idx_outbox_dedupe_key`（`dedupe_key`）

### 4.12 `jobs`（持久化后台作业队列）

用途：把后台任务（同步、预取、派生字段重建、提醒重排等）做持久化编排，保证应用重启/崩溃后可恢复。

- `id` TEXT PRIMARY KEY
- `kind` TEXT NOT NULL：例如 `flow_sync`/`memos_sync`/`attachment_prefetch`/`derived_rebuild`/`todo_reminder_reschedule`。
- `dedupe_key` TEXT NULL：用于“同类任务只保留一个”（KEEP/REPLACE 语义）。
- `status` TEXT NOT NULL：`READY`/`RUNNING`/`SUCCEEDED`/`FAILED`/`CANCELLED`。
- `run_after_ms` INTEGER NOT NULL
- `attempt` INTEGER NOT NULL
- `max_attempt` INTEGER NOT NULL
- `backoff_ms` INTEGER NOT NULL
- `payload_json` TEXT NOT NULL
- `last_error` TEXT NULL
- `created_at_ms` INTEGER NOT NULL
- `updated_at_ms` INTEGER NOT NULL

索引：

- `idx_jobs_status_run_after`（`status`, `run_after_ms`）
- `uq_jobs_dedupe_key` UNIQUE（`dedupe_key`）WHERE `dedupe_key` IS NOT NULL

### 4.13 辅助表（为查询性能而设）

为避免频繁 `json_each` 与 IPC 查询风暴，本地可引入少量“读模型辅助表”，由 main 进程在事务内维护。

1) `memo_tags`

- `memo_local_uuid` TEXT NOT NULL
- `tag` TEXT NOT NULL
- PRIMARY KEY (`memo_local_uuid`, `tag`)
- 索引：`idx_memo_tags_tag`（`tag`）

2) `todo_item_tags`

- `item_id` TEXT NOT NULL
- `tag` TEXT NOT NULL
- PRIMARY KEY (`item_id`, `tag`)
- 索引：`idx_todo_item_tags_tag`（`tag`）

3) 全文检索（FTS5）

- `memos_fts`：索引 `memos.content_md`、可选索引 `tags`/`plain_preview`。
- `notes_fts`：索引 `notes.body_md`。

采用 FTS5 的理由：

- Windows 桌面端搜索是核心能力；FTS5 能把“全文检索 + 排序 + 分页”放在 SQLite 内完成，避免 renderer 发起大量 IPC 小查询。
- 中文分词不做额外依赖：使用 FTS5 默认的 `unicode61` tokenizer（按字符/词边界切分）可满足第一阶段需求，且不引入第三方库。

FTS 的 tombstone 策略：

- `deleted_at != null` 的行不进入 FTS；恢复（deleted_at 变回 null）时重新写入索引。

## 5. Collections note_ref 的“双轨引用 + backfill”支持

目标：Collections 只存结构与引用元数据，不存正文；但 note_ref 引用的目标在离线优先下可能先只有本地 uuid，后才获得服务端 id，因此需要双轨引用。

### 5.1 本地 schema 支持点（`collection_items`）

- `ref_id`：服务端引用 id（例如 Flow note 的 `note_123`，或 Memos memo 的 `memos/123` / `server_memo_id`）。
- `ref_local_uuid`：本地引用 uuid（例如 `memos.local_uuid`）。
- 两者可同时存在；但 UI 读取优先级应是：
  1) 若 `ref_local_uuid` 可解析到本地实体 -> 直接本地打开（离线可用）。
  2) 否则若 `ref_id` 存在 -> 走网络打开/回拉，并在成功后写回 `ref_local_uuid`（回填）。

### 5.2 何时触发 backfill（只写语义）

1) 本地创建 memo 后被同步到服务端并获得 `server_memo_id/server_memo_name`：

- 扫描 `collection_items.ref_local_uuid == memo.local_uuid AND ref_id IS NULL` 的记录。
- 将这些记录更新为 `ref_type="memos_memo"` 且填充 `ref_id`（注意：ref_id 作为字符串存储，不得当路径片段）。

2) 从服务端 pull 回来的 `collection_items` 只有 `ref_id`：

- 若 `ref_type="memos_memo"` 且能在本地 `memos.server_memo_id` 或 `memos.server_memo_name` 命中，则写回 `ref_local_uuid`。

### 5.3 backfill 如何写入 outbox（只写数据层/队列层语义）

- backfill 属于“结构层元数据更新”，必须写入 `outbox_mutations`（`resource="collection_item"`, `op="upsert"`）。
- backfill 更新必须 bump `client_updated_at_ms`：在原值基础上至少 +1，确保 LWW 不回退。
- backfill 与对应实体（memo）的同步结果必须解耦：memo 同步失败不影响 collections 本地可用；collections backfill 失败可重试。

## 6. 索引与查询策略（桌面端读模型原则）

### 6.1 分页列表

- memos 列表：按 `state + server_updated_at`（或本地 `client_updated_at_ms`）倒序分页；用稳定 tie-break（例如 `local_uuid`）避免翻页重复/漏项。
- todo_items 列表：按 `list_id + status + sort_order` 分页；同时支持按 `due_at_local` 取“未来 N 天”。

### 6.2 tag 过滤

- memos 与 todo_items 的 tags 建议落到辅助表（`memo_tags`、`todo_item_tags`），并对 `tag` 建索引。
- 仅在数据量极小的情况下才考虑 `json_each(tags_json)` 动态过滤；桌面端默认按“可扩展”设计。

### 6.3 全文检索

- 默认启用 FTS5（见 4.13），并明确 tombstone 不入索引。
- 搜索接口必须支持：`q` + `include_deleted`（即使 include_deleted=true，FTS 仍只返回未删除，这是刻意选择：保证结果可靠且避免 tombstone 污染）。

### 6.4 避免 IPC 查询风暴（原则）

- renderer 不应以“逐条 memo/todo item 查询”的方式拉取列表。
- main 侧应提供批量/分页读取：一次 IPC 返回一个分页窗口（含必要的派生字段，如预览、tag 文本）。
- 对“单条详情页”读取采用缓存与订阅：同一 entity 在短时间内重复访问不重复打 DB。

## 7. 磁盘目录布局（用户可选根目录）

用户可在设置中选择一个“存储根目录”（Storage Root）。本地所有持久化文件必须使用相对路径，以便迁移。

目录结构（建议）：

- `<root>/db/`
  - `app.db`：SQLite 主库
  - `app.db-wal`、`app.db-shm`：WAL 文件（由 SQLite 生成）
- `<root>/attachments-cache/`
  - 用于 memo/note 附件的离线缓存（文件名使用本地 UUID，不使用 `ref_id`/`memoName`）
- `<root>/exports/`
  - 导出文件（Markdown/PDF/图片等）
- `<root>/logs/`
  - 运行日志、同步错误日志（注意脱敏，禁止写 token）
- `<root>/tmp/`
  - 原子写入的临时目录（写入完成后 rename/replace）
- `<root>/backup/`
  - 迁移与灾备的短期保留目录（仅保存最近一次迁移的回滚点）

## 8. 更改存储目录（Storage Root）迁移：原子步骤与失败回滚

目标：从用户视角“要么完全使用新目录，要么完全保持旧目录”，并且迁移失败不丢数据。

### 8.1 迁移前置约束

- 迁移必须在 main 进程执行，且进入迁移模式后暂停一切写入：
  - 暂停 renderer 的写请求（直接拒绝或排队）。
  - 暂停后台 jobs（`jobs` 中 RUNNING 的任务必须协作取消/等待结束）。
- 迁移期间不得触发同步（避免旧目录产生新写）。

### 8.2 原子迁移步骤（建议流程）

1) 进入只读/暂停写入模式

- 写入一条本地状态（例如 `user_settings` 或专用本地配置）标记 `migration_in_progress=true`，并记录 `from_root`/`to_root`。

2) 准备新目录（to_root）

- 创建上述目录结构（`db/attachments-cache/exports/logs/tmp/backup`）。

3) 冷拷贝数据

- 复制旧根目录中的以下内容到新根目录：
  - `db/`（包含 `app.db` 与 WAL/SHM）
  - `attachments-cache/`
  - 其它持久化需要保留的目录（如有）

4) 校验

- 对新目录的 DB 执行完整性校验（例如 `PRAGMA integrity_check;`），并校验 `PRAGMA user_version` 与应用期望一致。
- 校验关键文件数量/字节数（至少对 `app.db` 与附件缓存目录做快速一致性检查）。

5) 切换指针（提交点）

- 仅在校验全部通过后，才把“当前存储根目录”配置切换到 `to_root`。
- 将旧根目录移动到 `backup/` 形成回滚点（或保留原位置但打上 `backup_timestamp` 标记）。

6) 结束迁移并提示重启

- 写入 `migration_in_progress=false`，并提示用户重启应用（重启确保所有路径缓存与 SQLite 连接重建）。

### 8.3 失败回滚策略

任何一步失败都必须：

- 保持“当前存储根目录”仍指向旧目录（from_root）。
- 新目录（to_root）视为未提交：可以保留以便用户手动排障，但不得让应用在其上继续写入。
- 若失败发生在“切换指针（提交点）”之后：
  - 立即把指针切回 from_root；
  - 若旧目录已被移动到 backup，则必须原位恢复（rename 回来）；
  - 再次启动时检测到 `migration_in_progress` 标记应自动进入恢复流程，确保不会半迁移状态运行。

### 8.4 迁移完成后的清理策略

- 仅在应用成功以新目录运行至少一次并完成一次 DB 打开校验后，才允许用户清理旧数据（backup）。
- 清理动作必须显式二次确认，并展示将删除的路径（但不在本文展开 UI 设计）。
