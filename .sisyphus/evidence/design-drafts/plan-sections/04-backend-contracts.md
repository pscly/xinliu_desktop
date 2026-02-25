# 04. 后端对接与“资源-端点-字段”对照表（Flow + 直连 Memos）

本文档给桌面端（Windows）做“接口层实现”的合同口径：

- 后端策略：混合模式——Flow Backend 负责登录/Auth、Todo、Collections、以及增量同步（Sync）；Notes 直连 Memos。
- 两套 Base URL、鉴权、请求头：分别定义，避免把两条链路混在一起。
- “资源-端点-字段”对照表：以 `apidocs/*` 为 Flow 侧权威；Memos 侧以官方 API Reference 为准（见文末“参考”）。

---

## 1. 实现边界说明（必须先统一口径）

### 1.1 哪些请求走 Flow，哪些走 Memos

- Flow（账号与结构层/同步层）
  - Auth：注册/登录/登出、`/me`
  - Todo：lists/items/occurrences 的管理接口（在线 API）
  - Collections：collection items 的管理接口（在线 API）
  - Sync：Todo + Collections（以及 Flow 自己的 notes/settings，如果客户端用得上）统一走 `/sync/pull` & `/sync/push`

- Memos（笔记主数据）
  - Memo：memos 列表/读取/创建/更新/删除
  - User：获取当前登录用户（用于 `currentUserCreator` / 过滤策略）
  - Attachment：上传/读取附件（为离线缓存章节提供“对照点”，不在本文展开缓存策略）

### 1.2 同步与 UI 状态如何区分两条链路（仅接口层口径）

- Flow Sync 状态：以 `cursor/next_cursor/has_more` 为增量拉取边界；push 结果以 `applied[]/rejected[]` 判定成功/冲突。
- Memos 状态：Memo/Attachment 的网络请求直接对接 Memos；其同步/列表分页以 `pageSize/pageToken` 等为边界（不与 Flow cursor 混用）。

---

## 2. Base URL、鉴权与请求头

### 2.1 Flow Backend（/api/v1）

- Base URL：`{FLOW_BACKEND_BASE_URL}/api/v1/*`
  - 例：默认联调监听是 `http://localhost:31031`，则 base 为 `http://localhost:31031/api/v1`（见 `apidocs/api.zh-CN.md`）。

- 鉴权（Bearer Token）：

```
Authorization: Bearer <token>
```

说明：该 token 在 Flow 文档里也称为 `memos_token`（见 `apidocs/api.zh-CN.md` 的 Bearer Token 说明），并且会被复用于 Memos 直连链路。

- 通用请求头（建议每个请求都带）：
  - `X-Request-Id: <uuid-or-any-non-empty-string>`（服务端会回传该 header；错误 JSON 也会 best-effort 带 `request_id`）
  - 设备头（可选但建议总是带，便于后台追踪）：
    - `X-Flow-Device-Id: <stable-device-id>`
    - `X-Flow-Device-Name: <human-readable-device-name>`

### 2.2 Memos（/api/v1）

- Base URL：`{MEMOS_BASE_URL}/api/v1/*`
  - 本项目默认来源：Flow 登录返回体中的 `server_url`（`AuthTokenResponse.server_url`，见 `apidocs/api.zh-CN.md`）。
  - 建议落库前归一化：去掉末尾 `/`，并确保有 scheme（`https://...`）。

- 鉴权（Bearer Token）：

```
Authorization: Bearer <token>
```

说明：多数情况下该 token 与 Flow 登录返回的 `token` 相同（即“拿 Flow 登录换到 Memos token + server_url”）。

---

## 3. Flow：资源-端点-字段对照表（按 apidocs）

> 下面所有 Flow 端点都带 `/api/v1` 前缀。

### 3.1 Flow/Auth

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| Register | POST | `/auth/register` | `username`, `password` | `token`, `server_url`, `csrf_token` | 注册/登录返回体同构（`AuthTokenResponse`） |
| Login | POST | `/auth/login` | `username`, `password` | `token`, `server_url`, `csrf_token` | 失败统一 `ErrorResponse`（401/403/409/429/502 等） |
| Logout | POST | `/auth/logout` | （无） | `{ ok: true }` | Cookie Session 模式下若有会话 cookie，写请求需要 CSRF header |
| Me | GET | `/me` | （无） | `username`, `is_admin`, `csrf_token` | Bearer 下 `csrf_token` 可能为 null；Cookie Session 下用于刷新 CSRF |

### 3.2 Flow/Todo（Lists / Items / Occurrences）

#### 3.2.1 本地时间字符串与 tzid 约束（强制口径）

- v1 TODO 的时间字段使用“本地时间字符串”（无 offset）：`YYYY-MM-DDTHH:mm:ss`（长度 19）。
- `tzid`：可省略或传空字符串；服务端会回退到 `DEFAULT_TZID`（默认 `Asia/Shanghai`）。

#### 3.2.2 Lists

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| List lists | GET | `/todo/lists` | Query：`include_archived?` | `items[]`（`id/name/color/sort_order/archived/client_updated_at_ms/updated_at`） | 默认不含 archived |
| Upsert list | POST | `/todo/lists` | `id?`, `name`, `color?`, `sort_order`, `archived`, `client_updated_at_ms` | `{ id }` | `id` 为空则创建；LWW 冲突返回 409（`ErrorResponse`） |
| Patch list | PATCH | `/todo/lists/{list_id}` | `client_updated_at_ms` + 若干可选字段 | `{ ok: true }` | 部分字段更新 |
| Delete list | DELETE | `/todo/lists/{list_id}` | Query：`client_updated_at_ms` | `{ ok: true }` | 幂等：不存在也 ok |
| Reorder lists | POST | `/todo/lists/reorder` | `[{ id, sort_order, client_updated_at_ms }]` | `{ ok: true }` | 调整排序 |

#### 3.2.3 Items

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| List items | GET | `/todo/items` | Query：`list_id?`, `status?`, `tag?`, `include_archived_lists?`, `include_deleted?`, `limit?`, `offset?` | `items[]`（含 `due_at_local/completed_at_local/dtstart_local/tzid` 等） | `deleted_at` 非空表示 tombstone |
| Upsert item | POST | `/todo/items` | `id?`, `list_id`, `title`, `tags`, `client_updated_at_ms`, `tzid?` + 其它可选字段 | `{ id }` | `tzid` 省略或空 -> 默认时区 |
| Bulk upsert | POST | `/todo/items/bulk` | `TodoItemUpsertRequest[]` | `{ ids: [] }` | 批量 upsert |
| Patch item | PATCH | `/todo/items/{item_id}` | `client_updated_at_ms` + 若干可选字段（含 `tzid?`） | `{ ok: true }` | 仅当 payload 含 `tzid` 才覆盖；空字符串回退到默认 |
| Delete item | DELETE | `/todo/items/{item_id}` | Query：`client_updated_at_ms` | `{ ok: true }` | 幂等：不存在也 ok（软删除） |
| Restore item | POST | `/todo/items/{item_id}/restore` | `client_updated_at_ms` | `{ ok: true }` | 取消软删除 |

#### 3.2.4 Occurrences（RRULE）

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| List occurrences | GET | `/todo/occurrences` | Query：`item_id`（必填）, `from?`, `to?`（本地时间字符串） | `items[]` | occurrences 不存在会 404（delete） |
| Upsert occurrence | POST | `/todo/occurrences` | `id?`, `item_id`, `tzid`, `recurrence_id_local` + override 字段 | `{ id }` | 未带 `id` 时服务端会按唯一键尝试去重 |
| Bulk upsert | POST | `/todo/occurrences/bulk` | `TodoItemOccurrenceUpsertRequest[]` | `{ ids: [] }` | 批量 upsert |
| Delete occurrence | DELETE | `/todo/occurrences/{occurrence_id}` | Query：`client_updated_at_ms` | `{ ok: true }` | occurrence 不存在会返回 404 |

### 3.3 Flow/Collections（结构层）

#### 3.3.1 在线管理接口

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| List items | GET | `/collections/items` | Query：`parent_id?`, `include_deleted?`, `limit?`, `offset?` | `{ items: CollectionItem[], total, limit, offset }` | 不传 `parent_id` 表示“不按 parent 过滤”（返回全部），不是 root-only |
| Create item | POST | `/collections/items` | `item_type`（`folder|note_ref`）, `parent_id?`, `name?`, `ref_type/ref_id?`, `sort_order?`, `client_updated_at_ms?` | `CollectionItem` | `note_ref` 必填 `ref_type/ref_id`；`folder` 必须 `name` 非空 |
| Patch item | PATCH | `/collections/items/{item_id}` | 必填：`client_updated_at_ms`；其它字段可选 | `CollectionItem` | 409 冲突会返回 `ErrorResponse.details.server_snapshot` |
| Move/reorder | PATCH | `/collections/items/move` | `{ items: [{ id, parent_id, sort_order, client_updated_at_ms }] }` | `{ ok: true }` | 推荐用于移动/排序；服务端会做防环/parent 校验 |
| Delete item | DELETE | `/collections/items/{item_id}` | Query：`client_updated_at_ms`（必填） | （204，无 body） | 删除 folder 会递归 tombstone 子树 |
| Batch delete | POST | `/collections/items/batch-delete` | `{ items: [{ id, client_updated_at_ms }] }` | `{ ok: true }` | 批量删除 |

#### 3.3.2 作为 Sync 资源：`collection_item`

- Sync resource：`collection_item`
- Pull 的 changes key：`changes.collection_items`（文档明确“总是存在该 key，允许为空数组”）。

> 关键字提示：这里的资源名是 `collection_item`，而 changes 里的数组 key 是 `collection_items`。

### 3.4 Flow/Sync（增量 pull/push）

#### 3.4.1 Pull

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| Sync pull | GET | `/sync/pull` | Query：`cursor`（默认 0）, `limit` | `cursor`, `next_cursor`, `has_more`, `changes` | changes 中会包含 tombstone（通过 `deleted_at` 判断） |

changes 的 key（来自 `apidocs/api.zh-CN.md` 示例）：

- `changes.notes[]`
- `changes.user_settings[]`
- `changes.todo_lists[]`
- `changes.todo_items[]`
- `changes.todo_occurrences[]`

Collections 文档额外约定：

- `changes.collection_items[]`（见 `apidocs/collections.zh-CN.md` 的 Sync 章节）

#### 3.4.2 Push

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| Sync push | POST | `/sync/push` | Body：`{ mutations: Mutation[] }` | `cursor`, `applied[]`, `rejected[]` | HTTP 200 也可能部分失败：必须检查 `applied/rejected` |

Mutation 结构要点（v1）：

- `resource`: 资源名（例如 `todo_item`、`collection_item`）
- `op`: `upsert` 或 `delete`
- `entity_id`: 客户端侧实体 id
- `client_updated_at_ms`: LWW 时间戳
- `data`: 仅 `upsert` 时生效；`delete` 时服务端不读取

---

## 4. 关键不变量与客户端处理建议（必须写死）

本节以“约束条款 + 原因 + 客户端建议”的格式写清楚关键不变量，避免实现漂移。

### 4.1 `client_updated_at_ms`（LWW 并发控制）

- 约束条款：对同一 `id`，客户端必须保证 `client_updated_at_ms` 单调递增（至少不回退）。
- 原因：服务端以数值大小做 Last-Write-Wins；回退会导致更新被判 stale，触发冲突（409）或被 sync `rejected`。
- 客户端建议：
  - 本地为每个实体维护“最后一次提交的 client_updated_at_ms”，新写入取 `max(now_ms, last_ms + 1)`。
  - 不要直接用系统时间戳覆盖历史更大的值（例如跨时区/睡眠唤醒/手动改时间）。

### 4.2 软删除 tombstone：`deleted_at`

- 约束条款：删除为软删除，服务端通过 `deleted_at` 标记 tombstone；sync pull 会下发 tombstone。
- 原因：离线优先/多端一致删除需要 tombstone；否则会出现“幽灵复活”。
- 客户端建议：
  - 本地存储层保留 tombstone（至少保留 id + deleted_at + client_updated_at_ms），UI 默认隐藏。
  - sync 应用时：同 id 的记录按服务端返回覆盖，本地不得忽略 `deleted_at`。

### 4.3 冲突快照：`server_snapshot`（409）与 `rejected[].server`（sync push）

- 约束条款：
  - 在线管理接口冲突使用 HTTP 409，并通过 `ErrorResponse.details.server_snapshot` 返回服务端当前版本。
  - sync push 冲突一般仍返回 HTTP 200，但在 `rejected[]` 里带 `reason="conflict"` 且附 `server` 快照。
- 原因：支持客户端做“提示用户/自动合并/重试覆盖”等策略。
- 客户端建议：
  - 统一抽象“冲突错误”：把 `server_snapshot` 与 `rejected[].server` 归一成同一类 conflict payload。
  - 需要“客户端胜出”时：基于 server 快照合并后，重新提交并确保更大的 `client_updated_at_ms`。

### 4.4 Collections 的合同漂移点：`collection_item`（资源枚举 vs collections 文档）

- 现象：`apidocs/api.zh-CN.md` 在 `/sync/push` 的“资源类型（固定）”枚举里未列出 `collection_item`，但 `apidocs/collections.zh-CN.md` 明确说明 Collections 已作为 sync 新资源 `collection_item`，并要求 pull 的 `changes` 中存在 `collection_items` key。
- 处理口径：以 `apidocs/collections.zh-CN.md` 为准。
- 客户端建议：
  - pull 解析 `changes` 时做“未知 key 容错”，并显式处理 `changes.collection_items`（即使 api.zh-CN 未列）。
  - push 允许发送 `resource="collection_item"` 的 mutations，并按 `applied/rejected` 处理结果。

---

## 5. Memos：资源-端点-字段对照表（以官方 API 为准）

> 下面所有端点都带 `/api/v1` 前缀。

### 5.1 Memo（核心：`memoName`/`name` 规则）

官方合同要点：Memo 的资源名字段是 `name`，格式为 `memos/{memo}`，例如 `memos/123`（包含 `/`）。

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| List memos | GET | `/memos` | Query：`pageSize?`, `pageToken?`, `state?`, `orderBy?`, `filter?`, `showDeleted?` | `{ memos: Memo[], nextPageToken }` | 列表分页用 `nextPageToken` |
| Create memo | POST | `/memos` | Body：`content`(必填), `visibility`(必填), `state`(必填) + 其它可选字段 | `Memo` | 可通过 query `memoId?` 指定 memo id |
| Get memo | GET | `/memos/{memo}` | Path：`memo`（memo id） | `Memo` | 返回体里仍会有 `name = memos/{memo}` |
| Update memo | PATCH | `/memos/{memo}` | Query：`updateMask`(必填)；Body：同 Memo | `Memo` | 必须显式声明更新哪些字段 |
| Delete memo | DELETE | `/memos/{memo}` | Query：`force?` | （200，空 body） | 删除行为由服务端实现决定（可能是软删/硬删） |

### 5.2 User（用于 currentUserCreator/过滤策略）

#### 5.2.1 推荐：官方当前用户端点

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| Current user | GET | `/auth/me` | （无） | `{ user: User }` | 用于拿到 `user.name`（形如 `users/{user}`）作为 `currentUserCreator` |

#### 5.2.2 历史/兼容：Android 侧曾使用的探测端点（可能存在于旧版 Memos）

> 说明：Android 历史实现中存在 `auth/status` 与 `users/me`（证据见 `DESIGN.md` 的 Memos 接口清单）。不同 Memos 版本可能存在差异，桌面端实现建议优先用官方 `/auth/me`，并对以下路径按 404/405 做降级处理。

| 资源 | 方法 | 端点 | 用途 | 备注 |
|---|---|---|---|---|
| Auth status（legacy） | GET | `/auth/status` | 解析当前用户/登录态（legacy） | 若不存在则降级到 `/auth/me` |
| Users me（legacy） | GET | `/users/me` | 获取当前用户（legacy） | 若不存在则降级到 `/auth/me` |

### 5.3 Attachment（上传/读取“对照点”，不展开缓存策略）

| 资源 | 方法 | 端点 | 关键请求字段 | 关键响应字段 | 备注 |
|---|---|---|---|---|---|
| Create attachment | POST | `/attachments` | Body：`filename`(必填), `type`(必填), `content?`(bytes), `memo?` | `Attachment` | `content` 是 bytes（通常以 base64 放在 JSON 中）；也可能用 `externalLink` |
| Get attachment | GET | `/attachments/{attachment}` | Path：`attachment`（id） | `Attachment` | 返回体包含 `content?` / `externalLink?` 等 |

---

## 6. `memoName`（`memos/...`）的 encode/decode 规则（必须明确）

### 6.1 问题陈述

- `memoName`（即 Memo 的 `name` 字段）可能是 `memos/123`，天然包含 `/`。
- 一旦把它当作：
  - 路由参数（例如 `/memo/:memoName`）
  - URL path segment 的拼接片段（例如直接拼到 `/api/v1/` 后面）
  - 本地文件路径/本地 KV key
  都会遇到“分隔符歧义/路径穿透/无法稳定 round-trip”的问题。

### 6.2 约束条款

- 任何出现 `memoName` 的地方都必须做到：encode 后可安全传输/存储；decode 后严格还原原始值（round-trip）。

### 6.3 推荐实现（桌面端统一口径）

#### A) 作为 URL path 的一部分（HTTP 调用）

- 如果请求形态是官方的 `/memos/{memo}`：使用 memo id（不含 `/`），不需要额外 encode。
- 如果客户端某处使用“资源名直拼”（形如 `GET {MEMOS_BASE_URL}/api/v1/{memoName}`）：
  - 必须对整个 `memoName` 做 URL 编码，确保 `/` 被编码为 `%2F`。
  - 典型实现等价于：`encodeURIComponent(memoName)`（其会把 `/` 编为 `%2F`）。

#### B) 作为路由参数（应用内导航）

- 路由层禁止直接放原始 `memoName`（会被路由解析为多段）。
- 必须 encode（例如 URL encode 或 base64url），并在进入页面时 decode。
  - Android 侧证据：`memoName` 可能包含 `/`，因此必须 `Uri.encode`（见 `DESIGN.md`）。

#### C) 作为本地存储 key（SQLite 主键/索引/文件名）

- 本地存储层推荐使用“稳定且无歧义”的 key：
  - `memoName` 原文（UTF-8）做 base64url（无 `+`/`/`/`=`）作为 key；或
  - 使用 URL encode 后的字符串作为 key。
- 文件系统：不要把未经过滤的 `memoName` 当作文件名/路径片段。

---

## 7. 参考（权威来源）

### 7.1 Flow（本仓库 apidocs）

- `apidocs/api.zh-CN.md`
- `apidocs/collections.zh-CN.md`

### 7.2 Memos（官方 API Reference）

- API 总览（Base URL / 鉴权 / 分页等）：https://usememos.com/docs/api
- Memo：
  - Create Memo：https://usememos.com/docs/api/memoservice/CreateMemo
  - List Memos：https://usememos.com/docs/api/memoservice/ListMemos
  - Get Memo：https://usememos.com/docs/api/memoservice/GetMemo
  - Update Memo：https://usememos.com/docs/api/memoservice/UpdateMemo
  - Delete Memo：https://usememos.com/docs/api/memoservice/DeleteMemo
- Auth：
  - Get Current User (`/auth/me`)：https://usememos.com/docs/api/authservice/GetCurrentUser
- Attachment：
  - Create Attachment：https://usememos.com/docs/api/attachmentservice/CreateAttachment
  - Get Attachment：https://usememos.com/docs/api/attachmentservice/GetAttachment
