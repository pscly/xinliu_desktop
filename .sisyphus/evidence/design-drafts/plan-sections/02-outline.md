# 设计规格文档骨架（目录 + 术语 + 风格）

本文件用于生成根目录 `PLAN.md` 的规格正文骨架，后续任务会将本文件内容合并进最终规格文档。

## 1. 根目录 PLAN.md 目录骨架（一级/二级目录）

### 1.1 概述

- 1.1.1 背景与定位
- 1.1.2 目标（Goals）
- 1.1.3 非目标（Non-Goals）
- 1.1.4 平台与范围约束
  - MUST: 仅考虑 Windows 桌面端。
  - MUST: 桌面端不是手机端的放大版，交互以键鼠与多窗口为默认输入形态。
  - MUST: 布局以 Triptych 三栏为基线，同时以 Folder 树信息架构为主要组织方式。
- 1.1.5 文档写作规范（见第 4 章，可在根目录 PLAN.md 顶部摘要引用）

### 1.2 信息架构与导航（IA/导航）

- 1.2.1 Triptych 三栏布局基线
  - 第一栏：全局导航与上下文切换（视图入口、快捷入口）。
  - 第二栏：待整理队列与时间线（Memos 侧主数据的主要浏览入口）。
  - 第三栏：工作区（Folder 树，多宝阁网格，详情渲染，拖拽归档的主要落点）。
- 1.2.2 Folder 树 IA（主前提）
  - MUST: Folder 树是“结构层的权威视图”，用于承载归档、分类与引用。
  - MUST: Folder 树节点为“文件夹 + 笔记引用”的混排模型，且支持无限层级。
  - SHOULD: 提供 root 级别的默认入口（例如 Inbox 或未归档）。
- 1.2.3 导航模型
  - MUST: 定义全局主视图集合与其在三栏中的呈现方式（时间线、Folder 树、多宝阁、Todo、设置等）。
  - SHOULD: 为“快速记录”提供独立的极简入口，避免干扰三栏工作流。
- 1.2.4 拖拽与多选的 IA 约束
  - MUST: 禁止把父文件夹移动到其子孙节点下，避免形成环。
  - SHOULD: 拖拽悬停展开（Hover to Open）作为桌面端效率能力。

### 1.3 窗口与系统集成（Windows）

- 1.3.1 无边框窗口
  - MUST: 去掉 Windows 原生标题栏。
  - MUST: 提供可拖动区域与 no-drag 区域划分。
- 1.3.2 托盘常驻与关闭语义
  - MUST: 点击关闭按钮默认最小化到托盘，不退出进程。
  - MUST: 退出仅通过托盘菜单明确触发。
- 1.3.3 全局快捷键
  - MUST: 支持用户自定义全局快捷键呼出“极简输入框”。
  - SHOULD: 快捷键冲突检测与提示。
- 1.3.4 数据目录选择与迁移
  - MUST: 设置中可选择数据存储目录。
  - MUST: 更改目录后自动迁移数据，并在完成后提示用户重启。
- 1.3.5 右键菜单与桌面交互
  - MUST: 提供自定义右键菜单（至少覆盖笔记与 Folder 节点的常用操作）。

### 1.4 后端与网络边界（混合后端）

- 1.4.1 后端组成与职责划分
  - MUST: Flow Backend 负责 Auth、Todo、Collections、Sync 协议与合同约束。
  - MUST: Notes 直连 Memos（以 Memos 的 memo 为内容权威源），Flow Backend 不作为 Notes 的唯一读取入口。
- 1.4.2 Base URL 与配置
  - SHOULD: 默认 Flow Backend Base URL 为 `https://xl.pscly.cc`，并做去尾部 `/` 的标准化。
  - SHOULD: Memos Base URL 可来自登录响应 `server_url` 作为默认值，但允许用户覆盖。
- 1.4.3 鉴权模型
  - MUST: 客户端调用 Flow Backend 使用 `Authorization: Bearer <token>`。
  - MUST: token 属于敏感信息，不写入日志，不在 UI 以明文展示。
- 1.4.4 通用请求头约定
  - SHOULD: 每个请求携带 `X-Request-Id`，用于端到端排障与服务端日志定位。

### 1.5 数据模型（本地 + 远端）

- 1.5.1 本地持久化总览
  - MUST: 本地保存离线权威数据与 outbox，同步不依赖 UI 常驻。
  - SHOULD: 本地使用 SQLite 作为权威存储（便于事务、索引、批处理与恢复）。
- 1.5.2 Notes（Memos）
  - MUST: 支持 `memoName` 形如 `memos/123` 的资源名，不把其误当作纯数字或 UUID。
  - MUST: 任何路由/路径/键值层对包含 `/` 的标识符都做 encode/decode 约束。
- 1.5.3 Collections（结构层）
  - MUST: 结构层实体为 `collection_item`，pull 变更集合为 `collection_items`。
  - MUST: `collection_item.item_type` 仅允许 `folder` 与 `note_ref`。
  - MUST: `note_ref` 支持 `ref_type` 区分 `flow_note` 与 `memos_memo`。
- 1.5.4 Todo
  - MUST: 完整支持 RRULE，且遵循 v1 TODO 的本地时间字符串约定（`YYYY-MM-DDTHH:mm:ss`）。
- 1.5.5 软删除与恢复
  - MUST: 使用 tombstone 语义，`deleted_at != null` 表示已删除。
  - MUST: 需要恢复时走 restore 语义，而非依赖客户端“重新 upsert 覆盖”。

### 1.6 同步与冲突（Sync + LWW）

- 1.6.1 同步模型总览
  - MUST: 采用 pull + push 循环，pull 使用 cursor，push 使用 outbox 变更队列。
- 1.6.2 Flow Sync 协议
  - MUST: `sync/pull` 与 `sync/push` 的请求与返回字段以 `apidocs/api.zh-CN.md` 为合同。
  - MUST: `sync/push` 的结果以 `applied` 与 `rejected` 为准，不能仅依赖 HTTP 状态码。
- 1.6.3 并发控制（LWW）
  - MUST: 写入携带 `client_updated_at_ms`，且同一条记录的更新必须单调递增。
- 1.6.4 冲突处理
  - MUST: 处理 409 `conflict` 时读取 `server_snapshot` 或 sync 的 `rejected[].server`，给出可恢复策略。
  - SHOULD: 冲突不丢数据，允许生成本地冲突副本以便用户回溯。

### 1.7 安全模型

- 1.7.1 资产与威胁模型
  - MUST: 明确保护 token、本地数据库、附件缓存、同步队列与日志。
- 1.7.2 凭据存储
  - MUST: Windows 上使用系统凭据库或等价安全存储保存 token，避免明文落盘。
- 1.7.3 Electron 安全基线
  - MUST: renderer 不直接接触文件系统写入、SQLite、系统凭据库与网络密钥。
  - MUST: 启用 `contextIsolation`，通过窄化 API 的 preload 桥接。
- 1.7.4 日志与隐私
  - MUST NOT: 在日志中打印 token、cookie、CSRF 等敏感字段。

### 1.8 错误处理

- 1.8.1 统一错误结构
  - MUST: Flow Backend 的错误以 `ErrorResponse { error, message, request_id, details }` 为合同。
  - SHOULD: 客户端对未知 `error` 值做容错处理，避免因字段变更崩溃。
- 1.8.2 Request ID 追踪
  - MUST: 错误上报包含响应头 `X-Request-Id` 与响应体 `request_id`（若存在）。
- 1.8.3 同步错误与冲突
  - MUST: 区分网络错误、409 冲突、sync push 的 rejected，给出不同的用户提示与重试策略。
- 1.8.4 限流与退避
  - SHOULD: 遇到 429 `rate_limited` 读取 `Retry-After` 并退避重试。

### 1.9 性能预算

- 1.9.1 启动与首屏
  - SHOULD: 冷启动尽快展示本地缓存首屏，避免白屏等待网络。
  - SHOULD: 以 500ms 可见 UI 作为首屏预算目标（具体测量方式在验收清单中定义）。
- 1.9.2 列表与图片
  - MUST: 大列表使用虚拟列表，避免掉帧。
  - SHOULD: 图片懒加载与离线缓存，避免断网图片裂开。
- 1.9.3 IPC 与查询策略
  - MUST: 避免渲染层对主进程做高频逐条查询，采用批量首屏下发与内存态驱动。

### 1.10 安装与更新

- 1.10.1 安装与发布形态
  - MUST: 交付 Windows 安装包或可执行文件（exe）。
  - MUST: 使用 GitHub CI/CD 自动发布 exe。
- 1.10.2 自动更新
  - MUST: 客户端支持自动检测更新。
  - SHOULD: 更新通道与回滚策略在此章明确。
- 1.10.3 数据迁移
  - MUST: 版本升级时迁移本地 schema 与缓存数据不丢失。

### 1.11 验收清单

- 1.11.1 系统集成验收
  - 托盘常驻、关闭语义、退出语义、全局快捷键、无边框拖动区域。
- 1.11.2 IA 与交互验收
  - 三栏布局、Folder 树、拖拽归档、多选、悬停展开、右键菜单。
- 1.11.3 同步与离线验收
  - 断网可用、联网后自动同步、冲突可恢复、tombstone 与 restore 正常。
- 1.11.4 安全验收
  - token 不泄漏、renderer 权限边界、日志不含敏感信息。
- 1.11.5 性能验收
  - 启动、滚动、拖拽、同步时 UI 响应。
- 1.11.6 更新验收
  - 自动检测更新、下载与安装、更新后数据一致。

## 2. 术语表（必须覆盖）

- Flow Backend
  - 定义：负责用户体系、鉴权、Todo、Collections、Sync 协议的后端服务。
  - 约束：本项目把它视为“结构层与任务层的合同源”，所有相关字段与错误语义以 `apidocs/*` 为准。
- Memos
  - 定义：外部或自建的 Memos 服务实例，承载 memo 作为 Notes 的内容权威源。
  - 约束：桌面端对 Notes 采用直连 Memos 的方式，且必须兼容 `memoName` 形如 `memos/123`。
- Bearer Token
  - 定义：放在 `Authorization: Bearer <token>` 的访问令牌，用于调用 Flow Backend 的受保护接口。
  - 约束：MUST 安全存储，MUST NOT 写日志。
- `X-Request-Id`
  - 定义：客户端生成的请求追踪 ID，服务端会回显同名响应头。
  - 约束：SHOULD 全量请求携带，用于排障关联。
- `client_updated_at_ms`
  - 定义：客户端更新时间戳（毫秒），用于 LWW 并发控制。
  - 约束：MUST 对同一条记录单调递增，避免旧写入覆盖新写入。
- tombstone / `deleted_at`
  - 定义：软删除语义，`deleted_at != null` 表示记录已删除但仍存在于存储中。
  - 约束：MUST 在 UI 与同步逻辑中按 tombstone 处理，不能把“未拉到”当成“被删”。
- `sync/pull`
  - 定义：增量拉取服务端变更的同步端点（cursor 驱动）。
  - 约束：pull 的 `changes` 可能包含 tombstone 对象。
- `sync/push`
  - 定义：上送客户端本地变更队列的同步端点（mutations 驱动）。
  - 约束：push 的结果必须按 `applied` 与 `rejected` 分流处理。
- `applied`
  - 定义：`sync/push` 中被服务端成功应用的 mutation 列表。
  - 约束：客户端应据此出队 outbox，并更新本地状态。
- `rejected`
  - 定义：`sync/push` 中被服务端拒绝应用的 mutation 列表。
  - 约束：客户端必须按 reason 处理，reason=conflict 时使用 server 快照做恢复。
- `server_snapshot`
  - 定义：发生冲突时，服务端返回的当前版本快照（常见于 409 `conflict` 的 `ErrorResponse.details.server_snapshot`）。
  - 约束：客户端用于提示用户、自动合并或生成冲突副本，不允许忽略。
- `collection_item`
  - 定义：Sync 协议中的资源名，表示单个 Collections 结构节点。
  - 约束：其 data 形状与语义约束以 `apidocs/collections.zh-CN.md` 为合同。
- `collection_items`
  - 定义：`sync/pull` 的 `changes` 中该资源的集合键名，表示增量变更列表。
  - 约束：MUST 始终按 id upsert 本地表，再由 parent_id 组装树。
- memoName（`memos/123`）
  - 定义：Memos 侧 memo 的资源名形态，可能包含 `/`，例如 `memos/123`。
  - 约束：MUST 做 encode/decode 约束，且在本地键值存储与路由层避免把 `/` 当作路径分隔。

## 3. 文档来源映射（避免口径漂移）

本章用于声明每个章节的主要证据来源，确保后续写作与实现不偏离合同。

- 1.1 概述
  - 主要来源：根目录 `PLAN.md`（桌面端草案与功能约束）。
  - 补充来源：`DESIGN.md`（产品定位与迁移原则）。
- 1.2 信息架构与导航
  - 主要来源：`PLAN.md`（三栏式 Triptych 设想与桌面端交互），`DESIGN.md`（Folder 树与 Collections 设计语义）。
  - 需要补齐的证据来源类型：本仓库 UI 设计稿或可执行原型的截图与交互录屏。
- 1.3 窗口与系统集成
  - 主要来源：`PLAN.md`（托盘常驻、全局快捷键、数据目录迁移、无边框窗口）。
  - 补充来源：`DESIGN.md`（Electron 安全基线与主进程职责划分建议）。
  - 需要补齐的证据来源类型：Electron 官方文档与 Windows 系统能力文档（用于快捷键、托盘、更新机制的约束定义）。
- 1.4 后端与网络边界
  - 主要来源：`apidocs/to_app_plan.md`（对接路线与通用约定）。
  - 合同来源：`apidocs/api.zh-CN.md`（字段、错误、同步协议）。
- 1.5 数据模型
  - 主要来源：`DESIGN.md`（Android 端离线优先模型与迁移约束）。
  - 合同来源：`apidocs/api.zh-CN.md`、`apidocs/collections.zh-CN.md`（字段与语义约束）。
- 1.6 同步与冲突
  - 合同来源：`apidocs/api.zh-CN.md`（`client_updated_at_ms`、`ErrorResponse`、sync push/pull、applied/rejected），`apidocs/collections.zh-CN.md`（collection_item）。
  - 补充来源：`DESIGN.md`（冲突副本与 LWW 策略示例）。
- 1.7 安全模型
  - 主要来源：`DESIGN.md`（Electron 安全基线与凭据建议）。
  - 合同来源：`apidocs/to_app_plan.md`（日志与隐私约束）。
  - 需要补齐的证据来源类型：Windows 凭据库可用性与部署环境差异说明（例如无可用 secret store 的兜底策略）。
- 1.8 错误处理
  - 合同来源：`apidocs/api.zh-CN.md`（ErrorResponse、error 映射、Retry-After、request_id）。
- 1.9 性能预算
  - 主要来源：`PLAN.md`（冷启动目标、虚拟列表、IPC 性能风险与 CQRS 思路）。
  - 补充来源：`DESIGN.md`（离线优先与后台任务分层原则）。
- 1.10 安装与更新
  - 主要来源：`PLAN.md`（GitHub CI/CD 发布 exe，客户端自动检测更新）。
  - 需要补齐的证据来源类型：本仓库构建脚本与发布流水线定义（以最终 CI 配置为证据）。
- 1.11 验收清单
  - 主要来源：`PLAN.md`（验收要点）、`apidocs/*`（合同校验点）。

## 4. 文档写作规范（强制）

- 语言
  - MUST: 全中文撰写。
  - SHOULD: 使用约束化条款表述，优先使用 MUST/SHOULD/MUST NOT。
- 平台
  - MUST: 仅讨论 Windows 桌面端，不引入 macOS/Linux 分支。
- 架构前提
  - MUST: 混合后端模型固定为 Flow + 直连 Memos。
  - MUST: Folder 树 IA 为主前提，Triptych 三栏为布局基线。
- 合同优先级
  - MUST: 接口字段、错误结构与同步协议，以 `apidocs/api.zh-CN.md` 与 `apidocs/collections.zh-CN.md` 为最高优先级合同。
  - SHOULD: `DESIGN.md` 作为 Android 端导出设计的事实参考，用于解释不变量与迁移理由。
  - SHOULD: 根目录 `PLAN.md` 作为桌面端需求草案来源，用于约束系统集成与交互目标。
- 缺口表达方式
  - MUST NOT: 出现 `TBD/待定/未决`。
  - MUST: 若存在缺口，写成“已知缺口 + 需要补齐的证据来源类型”，例如 Electron 官方文档、本仓库实现文件、接口合同等。
