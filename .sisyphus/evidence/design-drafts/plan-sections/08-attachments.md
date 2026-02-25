# 08. 附件与离线资源策略（缓存/自定义协议/配额/GC）

本节定义 Windows 桌面端对“附件/离线资源”的统一策略：上传/下载、落盘缓存、离线可用等级、自定义协议 `memo-res://` 的安全边界、以及缓存配额与 GC（LRU 驱逐）。

约束：本节只写规格，不写实现代码。

---

## 1. 目标与范围

- 目标：让附件在离线场景下可预览、可恢复；让 renderer 永远不接触真实磁盘路径；让缓存有明确配额与可回收策略；对 413（`payload_too_large`）给出明确可行动作。
- 范围：本地资源与缓存策略统一覆盖两条链路（Flow / Memos），但只在“本地缓存与协议层”统一，具体后端端点差异不在本节展开实现细节。

---

## 2. 术语与不变量

- Storage Root（`<root>`）：用户可配置的数据根目录（见 `.sisyphus/drafts/plan-sections/05-local-data-model.md`）。本地一切可迁移文件路径都必须用“相对 `<root>` 的 relpath”。
- relpath：相对路径字符串，必须满足：
  - 只使用 `/` 作为分隔符（即使在 Windows 上也不保存 `\`）。
  - 不以 `/` 开头；不包含盘符（如 `C:`）；不包含 `..`。
  - 仅指向本应用管理的目录（白名单目录见下文）。
- 远端引用（remote ref）：仅用于“可回拉/可再下载”，不用于拼本地文件名。
  - Flow：`attachment_id`（下载：`GET /api/v1/attachments/{attachment_id}`；上传：`POST /api/v1/notes/{note_id}/attachments`，见 `apidocs/api.zh-CN.md`）。
  - Memos：`attachment name/id`（例如服务端 Attachment 的 id；本地模型字段建议使用 `remote_name` 承载“远端标识”，见 `.sisyphus/drafts/plan-sections/05-local-data-model.md`）。
- cacheKey：自定义协议的“资源键”，是一个不透明标识，必须能稳定映射到本地附件记录，但不能被当作路径片段使用。

---

## 3. 附件的三类路径/引用（必须写清）

本项目对附件的引用分三类，三者可能同时存在于同一条附件记录（以“优先级 + 生命周期”决定展示行为）。

### 3.1 本地文件（相对 `<root>` 的 `local_relpath`）

- 定义：用户从本机导入/粘贴/拖入的附件，落盘为受控文件；用 `local_relpath` 表示其在 `<root>` 下的位置。
- 生命周期：
  - 作为“用户数据”保留，参与 Storage Root 迁移与备份。
  - 不参与缓存配额的 LRU/GC（除非用户显式删除该附件或删除其所属 memo/note）。

### 3.2 缓存文件（`attachments-cache/` 下的 `cache_relpath`，受配额与 LRU/GC）

- 定义：从远端下载/预取得到的离线缓存；必须落在 `<root>/attachments-cache/` 下。
- 生命周期：
  - 受 `attachmentCacheMaxMb` 配额控制，允许 LRU 驱逐与 GC 清理。
  - 缓存文件可以随时被删除并通过远端引用重新获取（若在线）。

### 3.3 远端引用（Flow `attachment_id` / Memos `attachment name/id`）

- 定义：仅保存“如何从服务端拿到内容”的标识。
- 生命周期：
  - 远端引用不保证离线可用；离线可用取决于本地是否已有 `local_relpath` 或 `cache_relpath`。
  - 远端引用不得被当作文件名或路径片段（避免 `/`、编码差异、以及路径穿越风险）。

---

## 4. 落盘目录与文件命名（Windows 友好）

### 4.1 目录布局

在 `.sisyphus/drafts/plan-sections/05-local-data-model.md` 的基础上，本节对“附件相关目录”做严格约束：

- `<root>/attachments-cache/`：离线缓存目录（允许 GC）。
- `<root>/attachments/`：本地附件原件目录（不参与 GC）。

说明：`attachments/` 与 `attachments-cache/` 必须严格分离，避免“缓存 GC 误删用户数据”。

### 4.2 文件命名

- 本地与缓存文件的文件名必须基于“本地附件 UUID”（例如 `.sisyphus/drafts/plan-sections/05-local-data-model.md` 的 `memo_attachments.id`），不得使用任何远端 id/name。
- 文件名必须避免 Windows 不允许的字符与保留名（例如 `:` `*` `?` `<` `>` `|`，以及 `CON/PRN/AUX/NUL/...`）。
- 推荐命名：`att_<uuid>.<ext>`，其中 `<ext>` 来自原始文件扩展名或 `mime_type` 推断（推断失败可用 `.bin`）。

---

## 5. 自定义协议：`memo-res://<cacheKey>`（离线资源的唯一入口）

本项目通过自定义协议把“资源读取”收敛到 main 进程，避免 renderer 拿到真实磁盘路径。

### 5.1 URL 规范

- 规范形式：`memo-res://<cacheKey>`。
- 推荐 cacheKey 形态：`att_<attachment_uuid>`（只允许 `[A-Za-z0-9_\-]`）。
- 禁止把任意 relpath 直接塞进 `memo-res://`（否则会形成路径穿越入口）。

### 5.2 映射规则（cacheKey -> 真实文件路径）

解析 `memo-res://<cacheKey>` 时，main 进程必须执行以下确定性映射：

1) `cacheKey` -> `attachment_uuid`：按前缀规则解析（例如 `att_<uuid>`）。
2) 用 `attachment_uuid` 查询本地 SQLite 的附件记录（例如 `memo_attachments`）。
3) 路径选择优先级（只要文件存在且可读就返回）：
   - 优先 `cache_relpath`（缓存命中，加载最快）。
   - 其次 `local_relpath`（本地原件存在）。
   - 否则：返回“离线占位资源”（见 6.3 离线等级），并把“下载/重试”交给上层流程（不允许协议层偷偷触发网络下载）。

备注：协议层只做“读取路由”，下载逻辑必须显式走“下载任务/预取任务”，以便统一重试/退避/配额与 UI 状态。

### 5.3 renderer 与 main 的边界

- renderer：
  - 只能拿到 `memo-res://...` URL（或远端 URL），不得拿到真实文件路径。
  - Markdown/富文本渲染只能引用 `memo-res://`，不允许渲染 `file://` 本地路径（避免越权读取）。
- main：
  - 独占协议注册与文件读取；负责路径归一化、白名单校验、以及 MIME 判定。

---

## 6. 自定义协议安全边界（最小条款，替代 09-security.md 的缺口）

本节是自定义协议的“安全合同”。任何违反都视为安全缺陷。

### 6.1 白名单目录（只能指向受控资源目录）

- `memo-res` 只能返回以下目录内的文件（白名单）：
  - `<root>/attachments-cache/`
  - `<root>/attachments/`
- 任何落在白名单以外的路径，一律拒绝（返回协议级 not found / access denied）。

### 6.2 防路径穿越（必须显式禁止）

- 输入校验：
  - `cacheKey` 只允许安全字符集；出现 `/` `\` `.`（连续点）或 `%2f/%5c` 等编码后的分隔符，一律拒绝。
  - 禁止绝对路径、禁止盘符（例如 `C:`）、禁止 UNC 路径（例如 `\\server\share`）。
- 路径归一化：
  - main 进程将 `relpath` 与 `<root>` 拼接后，必须做规范化（canonicalize/resolve）。
  - 规范化后仍需再次校验：最终真实路径必须以白名单目录前缀开头（防止 `..` 或混合分隔符绕过）。

### 6.3 禁止符号链接/重解析点逃逸

- 读取文件前必须拒绝以下情况：
  - 目标文件是符号链接（symlink）。
  - 目标路径链路中存在符号链接或 Windows reparse point（避免从白名单目录“跳”到系统敏感目录）。

### 6.4 MIME 白名单与内容嗅探

- 协议层返回的 `Content-Type` 必须由本地记录 `mime_type` + 文件扩展名推断；推断失败按 `application/octet-stream`。
- 若 MIME 属于高风险可执行类型（例如 `.exe/.bat/.cmd/.ps1`），协议层必须按“下载”处理并强制 `Content-Disposition: attachment`，禁止内联预览。

### 6.5 日志与隐私

- 记录失败原因时不得写入真实绝对路径（只记录 relpath 与 cacheKey），避免日志泄露用户目录结构。

---

## 7. 离线可用等级（至少 3 档）

附件预览必须遵循以下三档行为，且 UI 文案要能让用户理解“为什么看不到”。

### 7.1 已缓存：可预览

- 条件：`cache_relpath` 命中且文件存在；或 `local_relpath` 命中且文件存在。
- 行为：直接使用 `memo-res://<cacheKey>` 预览；更新 LRU 的 `last_access_at_ms`。

### 7.2 未缓存但在线：可下载后预览

- 条件：本地无文件，但存在远端引用且当前在线。
- 行为：
  - 展示占位 + 明确按钮 `下载并预览`。
  - 下载成功后写入 `cache_relpath` 并立刻刷新为 `memo-res://...` 预览。

### 7.3 未缓存且离线：占位 + 可行动作

- 条件：本地无文件，且离线（或网络不可用）。
- 行为：展示占位卡，提供动作：
  - `稍后重试`
  - `复制链接/标识`（复制远端引用或附件名，便于用户外部处理）
  - `查看原文`（回到 memo/note 正文位置，避免“附件不可用”导致用户迷失上下文）

---

## 8. 上传/下载与失败重试策略

### 8.1 下载（远端 -> 缓存落地）

- 下载落地必须使用原子写：写入 `<root>/tmp/` 临时文件，完成后 rename/replace 到 `<root>/attachments-cache/` 的目标文件名。
- 下载成功后才允许写入 `cache_relpath`（避免 DB 指向半文件）。
- 失败必须清理临时文件，且不影响 memo/note 的可读性（仍按离线等级展示）。

### 8.2 上传（本地 -> 远端）

- 上传前必须做客户端侧大小预检：若文件大小超过 `attachmentUploadMaxMb`，直接在本地拦截并提示（不发请求）。
- 上传成功后必须写回远端引用（Flow：`attachment_id`；Memos：`attachment name/id`），并将附件与其所属 memo/note 绑定（绑定策略见同步章节）。

### 8.3 失败重试分类

- 网络错误/超时/5xx：指数退避 + 抖动重试；重试上限必须有限（避免后台无限耗电/占带宽）。
- 401/403：视为不可自动恢复（停止自动重试，引导用户重新登录/检查权限）。
- 413：必须立即停止重试（见下一节）。

---

## 9. 413（`payload_too_large`）用户提示与动作策略

当上传附件返回 HTTP 413 时，服务端 `ErrorResponse.error` 固定映射为 `payload_too_large`（见 `apidocs/api.zh-CN.md`）。该错误属于“用户可行动作”类，必须：停止自动重试 + 给出明确可执行选项。

### 9.1 处理原则

- 一旦检测到 413 或 `error == payload_too_large`：
  - 立即将该上传任务标记为 `FAILED_FATAL`（或等价状态）。
  - 禁止后台自动重试（重试没有意义，只会重复失败）。
  - 在 UI 上把失败原因提升到可见层级（不要埋在日志里）。

### 9.2 推荐提示文案（必须包含行动按钮）

- 标题：`附件过大，无法上传（413）`
- 说明：`服务器拒绝了该上传请求（payload_too_large）。你可以选择压缩/降低分辨率，或改用外链，或仅保存文本内容。`
- 动作（至少提供以下 4 个）：
  - `压缩后重试`（引导用户重新选择文件；客户端再次做大小预检）
  - `改用外链`（在正文插入链接，而不是上传）
  - `打开设置：上传大小上限`（调整 `attachmentUploadMaxMb`，同时提示“提高本地阈值不一定能突破服务器上限”）
  - `仅保存文本`（丢弃附件上传，但保留 memo/note 正文，保证不丢内容）

---

## 10. 缓存配额、LRU 与 GC（清理策略必须可解释）

### 10.1 配额

- 配额字段：`attachmentCacheMaxMb`（语义与 Android 端一致，见 `DESIGN.md`）。
- 配额只约束 `<root>/attachments-cache/`，不约束 `<root>/attachments/`（用户数据不应被“缓存 GC”清理）。

### 10.2 LRU 元数据

- 缓存条目必须维护 `last_access_at_ms`（每次通过 `memo-res` 成功读取时更新）。
- LRU 的统计必须由 main 进程维护（避免 renderer 伪造访问记录）。

### 10.3 GC（驱逐规则）

- 触发条件（任一满足即可触发一次 GC）：
  - 应用启动后（延迟执行，避免影响首屏）。
  - 定时（例如每 6 小时一次）。
  - 完成一批预取/下载后。
  - 检测到磁盘可用空间过低时（提示用户并建议降低缓存配额）。
- 驱逐规则：
  - 按 `last_access_at_ms` 从旧到新删除缓存文件，直到缓存目录大小 <= `attachmentCacheMaxMb`。
  - 删除时必须跳过“正在下载/正在打开”的条目（避免删掉活跃文件句柄）。
  - 删除成功后同步清理 SQLite 中对应的 `cache_relpath`（避免悬挂指针）。

### 10.4 用户可见能力

- 设置页必须提供：
  - 当前缓存占用（MB）、文件数、上次 GC 时间。
  - 操作：`清空附件缓存`（只清 `<root>/attachments-cache/`）。

---

## 11. 与渲染/同步的衔接点（统一策略，不写实现）

- 渲染层统一使用 `memo-res://`：
  - 当正文中存在远端附件链接时，主进程在出库/渲染前将其转换为 `memo-res://<cacheKey>`（cacheKey 绑定本地附件 UUID，而不是远端 id）。
- 同步层负责“把远端引用与本地附件记录对齐”：
  - 上传成功写回远端引用。
  - 预取任务依据设置（例如 `offlineImagePrefetchEnabled/offlineImagePrefetchMaxMemos/offlineImagePrefetchMaxImages`，见 `DESIGN.md`）填充 `cache_relpath`，并受 `attachmentCacheMaxMb` 配额约束。
