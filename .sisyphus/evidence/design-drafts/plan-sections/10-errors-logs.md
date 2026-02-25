# 10. 错误处理与可观测性（request_id、限流、离线、同步失败）

本节目标：把“错误如何呈现给用户，以及如何排障”写成可直接实现的规格。

- 约束：仅写规格，不写实现代码；仅承诺 Windows 桌面端。
- 主要输入：`apidocs/api.zh-CN.md` 的 `ErrorResponse` 合同，及 `.sisyphus/drafts/plan-sections/07-sync-spec.md` 的 `applied/rejected/server_snapshot` 口径。

---

## 1) 错误分类（统一口径）

错误按“是否可自动恢复”与“证据是否可呈现”分组，UI 文案要短，每类错误最多 1-2 行提示，动作按钮不超过 3 个。

### 1.1 网络与离线（Network/Offline）

- 典型：DNS/超时/断网/代理异常。
- UX：提示“离线或网络不可用”，并展示“自动重试中”或“已暂停”等状态。
- 默认策略：对幂等读请求可自动重试，对写请求进入队列并在网络恢复后继续。

### 1.2 鉴权与权限（Auth/Permission）

- 典型：401 `unauthorized`，403 `forbidden`。
- UX：必须阻断自动重试，指向“重新登录/刷新凭据”。

### 1.3 并发冲突（Conflict）

- 典型：HTTP 409 `conflict`，或 Flow Sync push 返回 `rejected[].reason="conflict"`。
- UX：必须暴露“可恢复证据”，即 `server_snapshot` 或 `rejected[].server`。

### 1.4 限流（Rate Limit）

- 典型：429 `rate_limited`，响应头带 `Retry-After`（秒）。
- UX：提示“请求过于频繁，已按服务端建议延后”，不让用户反复点击触发雪崩。

### 1.5 超限（Payload Too Large）

- 典型：413 `payload_too_large`（常见于附件上传）。
- UX：停止自动重试，必须给出可行动作（压缩、改小、移除附件）。

### 1.6 上游错误（Upstream Error）

- 典型：502 `upstream_error`（对接 Memos 等上游失败）。
- UX：可重试，但要退避，并提供“复制 request_id”用于工单。

### 1.7 本地 I/O 与存储（Local I/O）

- 典型：SQLite 损坏、磁盘满、无法写文件、权限不足。
- UX：停止自动重试，提示用户采取本地修复动作（释放空间、重启、导出诊断包）。

---

## 2) 统一错误模型（HTTP ErrorResponse + 本地错误）

### 2.1 后端错误合同（ErrorResponse）

后端对非 2xx 返回统一结构（关键字段）：

```json
{
  "error": "conflict",
  "message": "conflict",
  "request_id": "...",
  "details": {
    "server_snapshot": {"id": "..."}
  }
}
```

- MUST: 客户端对所有非 2xx，优先解析 `ErrorResponse.error/message/details/request_id`，未知字段要容错。
- MUST: 同时记录响应头 `X-Request-Id` 与响应体 `request_id`（如果有），用于排障关联。
- MUST NOT: 在任何日志或 UI 中打印 `Authorization` 头或 token。

### 2.2 同步 push 的“部分失败”是常态（HTTP 200 仍可能失败）

Flow Sync 的 `/api/v1/sync/push` 即使部分拒绝也会返回 HTTP 200，唯一成功标准是：逐条处理 `applied[]` 与 `rejected[]`。

- MUST: 禁止用“HTTP 200”判断 push 成功。
- MUST: `rejected[].server` 视为“服务端快照证据”，用于 UX 与恢复。

---

## 3) 错误映射表（错误码 -> 用户提示 -> 是否自动重试 -> 可行动作）

表中“自动重试”含义：后台任务是否继续调度该请求或该 outbox 条目。

| 触发源 | 检测条件 | 用户提示（最多 1-2 行） | 自动重试 | 动作按钮（<=3） | 备注 |
|---|---|---|---|---|---|
| HTTP | 401 `unauthorized` | 登录已失效，请重新登录后继续同步。 | 否 | 重新登录, 查看诊断, 复制 request_id | 清理本地 token，停止所有需要鉴权的自动重试 |
| HTTP 或 Flow Sync | 409 `conflict` 或 `rejected[].reason="conflict"` | 检测到冲突，本地改动未能直接写入云端。 | 否（对该条） | 查看冲突, 保留本地, 用服务端版本恢复 | 必须展示 `server_snapshot` 或 `rejected[].server` 作为可恢复证据 |
| HTTP | 429 `rate_limited` + `Retry-After` | 请求过于频繁，已按服务端建议延后重试。 | 是（按 Retry-After） | 稍后重试, 查看诊断, 复制 request_id | 必须遵守 `Retry-After`，并暂停本轮剩余同步避免雪崩 |
| HTTP | 413 `payload_too_large` (`payload_too_large`) | 文件过大，无法上传。请缩小后再试。 | 否 | 管理附件, 重试, 查看限制 | 用户动作后再允许重试（例如删除/压缩） |
| HTTP | 502 `upstream_error` | 上游服务暂时不可用，已为你自动重试。 | 是（退避） | 立即重试, 查看诊断, 复制 request_id | 读请求可更积极重试，写请求要避免重复副作用 |
| 网络 | 超时/断网/连接失败 | 网络不可用，已转为离线队列，恢复网络后会继续。 | 是（退避） | 立即重试, 查看诊断, 打开网络设置 | 离线队列对写操作必须可恢复，不丢数据 |
| 本地 I/O | 磁盘满/DB 错误/权限不足 | 本地存储异常，同步已暂停。请先修复本机问题。 | 否 | 导出诊断包, 重试, 查看帮助 | 本地错误要优先保护数据，避免反复写入加剧损坏 |

说明：

- “查看诊断”打开内置诊断面板，显示 request_id、最近错误脱敏摘要、以及同步游标等。
- “复制 request_id”只复制 `request_id` 字符串，不包含任何请求内容。

---

## 4) 同步失败 UX（Flow Sync）

### 4.1 push 部分失败（HTTP 200 但 `rejected[]` 非空）

场景：用户触发同步或后台自动同步，push 返回 HTTP 200，但 `rejected[]` 有元素。

#### 4.1.1 顶部状态提示（简短）

- 文案：同步完成，但有 X 条变更需要处理。
- 次要信息：显示 `rejected` 数量，以及本次同步的 `request_id`（可复制）。

#### 4.1.2 动作（不超过 3 个）

1) 查看冲突
2) 重试（仅对可重试项，例如未知 reason 或临时失败，不对 conflict 盲重试）
3) 用服务端版本恢复

#### 4.1.3 冲突详情呈现口径（必须暴露证据）

- MUST: 对每条 conflict，展示：`resource`、`entity_id`、本地时间（本地变更时间或 client_updated_at_ms）、服务端快照时间（来自 `rejected[].server.client_updated_at_ms`）。
- MUST: 提供“查看服务端快照”入口，数据源为 `rejected[].server`（同步 push 的 server snapshot）。
- SHOULD: 默认策略为 server wins（见 `.sisyphus/drafts/plan-sections/07-sync-spec.md`），避免反复覆盖导致抖动。

### 4.2 pull 或 apply 失败

- 文案：同步失败，已暂停推进游标。
- 动作：重试, 导出诊断包, 复制 request_id。

游标推进约束：

- MUST: 只有在 changes 成功落库后，才允许 `cursor -> next_cursor`（避免漏应用）。

---

## 5) 同步失败 UX（Memos Sync）

### 5.1 `FAILED` 状态如何呈现

单条 memo 的 `syncStatus=FAILED` 时：

- 列表上显示一个轻量失败标记，不打断编辑。
- 点开详情可看到脱敏后的 `lastError`，并提供“重试同步”按钮。

提示文案（最多两行）：

- 同步失败，已保留本地内容。
- 你可以重试，或在诊断面板查看 request_id。

动作按钮（<=3）：重试同步, 查看诊断, 导出诊断包。

### 5.2 重试策略（与 Flow 口径一致）

- 网络/5xx/`upstream_error`：指数退避重试。
- 401 `unauthorized`：停止自动重试，提示重新登录。
- 413 `payload_too_large`：停止自动重试，要求用户处理附件。

冲突处理（核心约束）：

- MUST: 任何时候都不能用回拉覆盖本地 `DIRTY` 的用户编辑内容。
- MUST: 发生冲突生成“冲突副本”，并把原记录回滚为服务端版本（见 `.sisyphus/drafts/plan-sections/07-sync-spec.md`）。

---

## 6) request id（请求关联与用户可复制证据）

### 6.1 发送与接收

- MUST: 每个请求都必须携带 `X-Request-Id`（客户端生成，UUID 或等价随机字符串）。
- MUST: 在响应中读取 `X-Request-Id` 与 `ErrorResponse.request_id` 并保存到本地日志事件中。

### 6.2 UI 展示规则

- MUST: 诊断面板只展示 `request_id` 与时间，不展示请求体，不展示任何 `Authorization` 或 token。
- SHOULD: 所有错误弹窗都提供“复制 request_id”作为最轻量排障动作。

---

## 7) 日志策略（保存、滚动、导出、脱敏）

### 7.1 保存位置与滚动

- MUST: 日志保存在 `<root>/logs/`（应用数据根目录下）。
- MUST: 采用按大小滚动（例如单文件 5MB），并保留有限份数（例如 10 份）。
- MUST: 最大保留总量设上限（例如 50MB），超限从最旧开始删除。

日志级别建议：

- INFO：同步阶段变更，开始/结束，cursor 推进，rejected 计数。
- WARN：可重试错误（网络、429、5xx）。
- ERROR：不可重试错误（401、413、本地 I/O）。

### 7.2 一键导出诊断包（仅描述，不写代码）

提供“导出诊断包”功能，输出一个压缩包，包含：

- 最近 N 份日志（已脱敏）。
- 同步状态快照（Flow cursor/next_cursor/has_more，Memos 统计，附件缓存统计）。
- 最近的错误摘要（含 request_id）。

禁止包含：用户内容全文、未脱敏的请求体、Authorization/token。

### 7.3 脱敏规则（强制）

- MUST: 删除或替换以下字段：`Authorization` 头、cookie、token、CSRF。
- MUST: 绝对路径脱敏：仅保留相对 `<root>/...` 或用 `<abs_path>` 替代。
- MUST: 用户内容截断：正文/标题/备注等只保留前 200 字符并标注 `<truncated>`。
- SHOULD: URL 脱敏：去掉 query 中可能携带凭据的参数。

---

## 8) Debug/诊断面板最小内容（可落地字段）

诊断面板目标：让用户与开发者在不泄露隐私的前提下，快速定位“为什么没同步上去”。

### 8.1 Flow

- sync cursor: `cursor` / `next_cursor`
- 时间：`last_pull_at` / `last_push_at`
- last_error（脱敏）：包含 `error`、HTTP code（如 409、429）、`request_id`
- rejected 计数：本次/累计

### 8.2 Memos

- 上次同步时间
- dirty 数量 / failed 数量
- last_error（脱敏）：包含 `request_id`，不含用户内容

### 8.3 Attachments

- 缓存占用（字节与近似文件数）
- 失败下载计数 / 失败上传计数
- 最近一次 `payload_too_large` 命中统计（仅计数，不记录文件名）

---

## 9) 可执行自检命令清单（供 Task 13/14 复用）

以下命令用于快速确认关键合同字段与口径在文档中可被检索到：

```bash
# 错误合同与关键字段
rg -n "ErrorResponse" apidocs/api.zh-CN.md
rg -n "X-Request-Id" apidocs/api.zh-CN.md
rg -n "request_id" apidocs/api.zh-CN.md

# 限流与退避
rg -n "429" apidocs/api.zh-CN.md .sisyphus/drafts/plan-sections/07-sync-spec.md
rg -n "Retry-After" apidocs/api.zh-CN.md .sisyphus/drafts/plan-sections/07-sync-spec.md

# 冲突证据
rg -n "409" apidocs/api.zh-CN.md
rg -n "server_snapshot" apidocs/api.zh-CN.md .sisyphus/drafts/plan-sections/07-sync-spec.md

# 超限
rg -n "payload_too_large" apidocs/api.zh-CN.md

# 本节自检（确保关键字在本节也可命中）
rg -n "ErrorResponse|X-Request-Id|request_id|429|Retry-After|409|server_snapshot|payload_too_large" .sisyphus/drafts/plan-sections/10-errors-logs.md
```
