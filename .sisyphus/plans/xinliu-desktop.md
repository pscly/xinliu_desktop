# 心流（Xinliu）Windows 桌面端完整开发计划（Electron）

## TL;DR

> **目标**：以 `PLAN.md` 为开发合同，从“只有文档/合同”的仓库出发，在仓库根目录直接落地完整的 Windows 10/11 桌面端应用（不做 MVP）。
>
> **交付物**（完整功能版）：
> - Electron + React + TypeScript 工程骨架（main/preload/renderer 分层、安全基线）
> - Triptych 三栏主架构（Folder/Collections 树权威入口）+ Notes/Todo/设置/冲突中心
> - 本地 SQLite 离线权威源（WAL、迁移、Storage Root 可迁移、事务化 outbox）
> - 混合后端：Flow（Auth/Todo/Collections/Sync）+ 直连 Memos（Notes）+ 降级路由决策树
> - Sync pull/push + 冲突副本策略（可见、可恢复、不可丢文本）
> - `memo-res://` 自定义协议（白名单目录、防穿越、防 symlink/reparse point、MIME 白名单）
> - Windows 系统集成：托盘常驻、关闭到托盘、唯一退出路径、全局快捷键快捕、右键菜单
> - NSIS 安装包 + GitHub Releases stable 自动更新链路（无签名可内测，计划中明确风险与补签名路径）
> - 测试与 CI：TDD；Vitest（单元/组件/逻辑）+ Playwright（关键 UI/E2E）；GitHub Actions Windows runner 构建发布
>
> **约束摘要**：Windows-only；frameless（去原生标题栏）；renderer 禁止 Node/SQLite/任意路径 IO；token 不落明文不写日志。
>
> **规模评估**：XL（从 0 到 1 + 离线/同步/更新/系统集成）。
> **并行执行**：YES（按波次并行，最后统一集成验证）。

---

## Context

### 原始需求
- “这个项目目前设计的差不多了，现在开始开发；不考虑 MVP，要完整完善。”

### 关键确认（来自访谈）
- 产品名（显示名）：心流
- 英文标识（exe/资产/目录）：`xinliu-desktop`
- appId（稳定不变）：`cc.pscly.xinliu.desktop`
- 平台：Windows 10/11 only
- 规格优先级：以 `PLAN.md` 为 Windows 行为与验收合同；接口字段与同步合同遵循 `PLAN.md` 约束（`apidocs/*` 更具体/更新/专题者优先）
- 后端默认：`https://xl.pscly.cc/`
- 后端边界：混合模式（Flow=Auth/Todo/Collections/Sync；Notes 直连 Memos + 降级路由）
- 测试策略：TDD
- 交付：NSIS 安装包 + GitHub Releases stable 自动更新
- 代码签名：暂无证书；允许未签名用于内测/自用（计划需写清风险与后续补齐路径）
- GitHub 仓库：`pscly/xinliu_desktop`（main 分支；当前无 releases）

### 代码库现状（扫描结论）
- 当前仓库基本为“文档/合同仓库”：`PLAN.md`、`DESIGN.md`、`apidocs/*`、`.sisyphus/*`；尚无 `package.json`/`src/` 等工程代码骨架。
- 当前无测试基础设施、无 GitHub Actions workflow；但 `PLAN.md` 明确要求未来在 Windows runner 构建发布。

### 默认技术选型（无额外指示时按此执行；变更需先更新本计划）
- 包管理与运行时：Node.js 20 LTS + npm
- 桌面框架：Electron
- 构建：Vite（renderer）+ main/preload TypeScript 编译（随脚手架落地）
- 打包：electron-builder（NSIS）
- 自动更新：electron-updater（provider=GitHub Releases，stable only）
- 状态管理：Zustand（`PLAN.md` 为 SHOULD，但作为完整实现纳入）
- 拖拽：dnd-kit（强制约束在 `PLAN.md:136`）
- 本地库：SQLite + better-sqlite3（main 进程，`PLAN.md:103`）
- 凭据：keytar（Windows Credential Vault；无则提供清晰降级路径但不得明文落盘）
- 测试：Vitest（单元/组件/逻辑）+ Playwright（Windows runner E2E）

### 外部资料（Memos 直连 API）

> 说明：本仓库只包含 Flow 的 OpenAPI 快照；Memos 的 API 合同以官方文档为准。

- Memos API Reference（Base URL 为实例 `/api/v1`，Bearer token）：`https://usememos.com/docs/api`
- Token（PAT，Bearer）：`https://usememos.com/docs/admin/tokens`
- Memo CRUD：
  - List：`https://usememos.com/docs/api/memoservice/ListMemos`
  - Create：`https://usememos.com/docs/api/memoservice/CreateMemo`
  - Get：`https://usememos.com/docs/api/memoservice/GetMemo`
  - Update（强制 updateMask）：`https://usememos.com/docs/api/memoservice/UpdateMemo`
  - Delete：`https://usememos.com/docs/api/memoservice/DeleteMemo`
- Attachment：
  - Create：`https://usememos.com/docs/api/attachmentservice/CreateAttachment`
  - Get：`https://usememos.com/docs/api/attachmentservice/GetAttachment`
  - List by memo：`https://usememos.com/docs/api/memoservice/ListMemoAttachments`
  - Set memo attachments：`https://usememos.com/docs/api/memoservice/SetMemoAttachments`
  - Update（强制 updateMask）：`https://usememos.com/docs/api/attachmentservice/UpdateAttachment`
  - Delete：`https://usememos.com/docs/api/attachmentservice/DeleteAttachment`
- 已知坑：未登录访问 `/api/v1/memos` 可能要求 filter（桌面端必须带 token）：`https://github.com/usememos/memos/issues/3661`

### Metis Review（已纳入计划的护栏）
- 必须把“技术栈定版、CI/更新验收可自动化、离线/同步/协议/托盘语义边界用例”写入验收标准，避免计划不可执行。
- 严格避免把验收落到“用户手动点点看”，所有验收必须可由代理在 CI/本地命令中执行。

---

## Work Objectives

### 核心目标
在 Windows 10/11 上交付一套符合 `PLAN.md` 的完整桌面端应用：离线可用、同步可靠、冲突可恢复、系统集成完整、更新链路可用、且安全基线不被破坏。

### 明确交付物
- 一个可安装（NSIS）的心流 Windows 应用，支持自动更新（GitHub Releases stable）
- 全功能模块：Notes、Folder/Collections、Todo、设置、冲突中心、诊断/日志
- 本地数据目录可迁移（自动迁移 + 回滚 + 重启提示）
- 完整的测试与 CI（TDD + Windows runner 构建发布）

### Definition of Done（全局）
- [ ] GitHub Actions（Windows runner）能构建并发布 NSIS 安装包到 GitHub Releases
- [ ] 应用可在 Windows 10/11 正常安装、启动、离线编辑、联网后自动同步
- [ ] 关闭按钮默认隐藏到托盘；真正退出仅托盘菜单“退出”
- [ ] 自动更新检查可用：后台下载、用户触发安装、失败不破坏当前版本
- [ ] 安全基线满足：`contextIsolation: true`、`nodeIntegration: false`、renderer 无任意路径 IO

### Must Have（摘自合同，执行中不得弱化）
- Windows-only（不承诺 macOS/Linux）
- Triptych 三栏基线；Folder/Collections 树为结构层权威入口
- 混合后端边界与同步合同：Flow + 直连 Memos + Notes 降级路由
- 本地 SQLite 为离线权威源（事务化 outbox、cursor、tombstone）
- 冲突策略：冲突副本 + 可对比 + 不丢文本
- `memo-res://` 协议安全边界：白名单、防穿越、防 symlink/reparse point、MIME 白名单
- NSIS 安装包 + GitHub Releases 自动更新链路 + SHA-256 校验

### Must NOT Have（护栏，避免范围蔓延）
- 不做 macOS/Linux 打包与兼容
- renderer 不得获得 Node/SQLite/任意文件绝对路径读写能力
- 不得隐式双写（同一用户操作只能裁决一个 Notes Provider 写入）
- 不得以“验收需要用户手动确认”为通过标准

---

## Verification Strategy（强制）

> **零人工介入**：所有验收必须是代理可执行的命令/脚本/CI 结果。任何“请用户手动试试”都视为不合格。

### 测试决策
- **测试基础设施**：当前不存在（需从 0 搭建）
- **自动化测试**：TDD（RED → GREEN → REFACTOR）
- **建议测试栈**：
  - Vitest：shared/lib 逻辑与 renderer 组件测试
  - Playwright：关键用户旅程 E2E（在 Windows runner 上跑）

### 证据产物
- 每个任务执行后必须把关键输出保存到：`.sisyphus/evidence/task-{N}-{slug}.*`
- Windows runner 的安装包与校验文件作为 artefact 与 Release 附件

---

## Execution Strategy

### 并行波次（概览）

Wave 1（脚手架与基础契约，立刻开工）
- 工程骨架、代码规范、测试/CI 框架、Electron 安全基线、Triptych UI 骨架

Wave 2（数据层与网络层，最大并行）
- SQLite schema/迁移、outbox、Flow/Memos API client、鉴权与凭据存储、错误与 request_id

Wave 3（核心业务：同步/冲突/路由/离线）
- Flow sync pull/push、冲突副本、Notes Provider Router + 降级、附件缓存与 `memo-res://`

Wave 4（系统集成 + 产品化）
- 托盘/关闭语义、全局快捷键快捕、右键菜单、Storage Root 迁移、诊断面板、自动更新

Wave 5（E2E + 发布）
- Windows runner E2E、NSIS 打包发布、Release 校验、回归与性能门禁

---

## TODOs

> 约定：所有 UI 可交互元素优先加 `data-testid`，用于 E2E 与回归测试的稳定选择器。

### 任务索引（按执行顺序；在文件内用任务号检索定位）

> 说明：由于本计划在编写时采用增量追加，下面的任务块在文件中的出现顺序可能不是 1→N。
> 执行者应按本索引顺序推进，并用 `rg -n "^- \[ \] {N}\." .sisyphus/plans/xinliu-desktop.md` 快速定位对应任务块。
> 另外：计划内出现的 `src/main`、`src/preload`、`src/renderer` 等路径以“任务 1 创建的目录结构”为准；若脚手架工具生成的默认目录不同，执行者必须在任务 1 内先统一目录结构，再继续后续任务。

| Wave | Task | 标题（缩略） |
|---|---:|---|
| 1 | 1 | 初始化工程骨架 |
| 1 | 2 | 代码规范 + TDD 测试基建 |
| 1 | 3 | GitHub Actions CI（Windows runner） |
| 1 | 4 | Electron 安全基线 |
| 1 | 5 | IPC 桥与 Preload 合同 |
| 1 | 6 | Frameless UI 壳（标题栏 + Triptych + 路由骨架） |
| 2 | 7 | Storage Root layout + relpath |
| 2 | 8 | SQLite 连接 + 迁移引擎（WAL + 事务） |
| 2 | 9 | Flow 领域表（Todo/Collections + tombstone） |
| 2 | 10 | outbox/sync_state/jobs/user_settings 表 |
| 2 | 11 | keytar 凭据 + 设备标识 + 脱敏护栏 |
| 2 | 12 | HTTP client（Base URL/request_id/ErrorResponse/重试） |
| 3 | 13 | Outbox 写入工具 + client_updated_at_ms bump |
| 3 | 14 | Todo 本地读写服务 |
| 3 | 15 | Collections 本地读写服务（防环） |
| 3 | 16 | Flow API Client（OpenAPI 快照） |
| 3 | 17 | Flow Sync Push 引擎 |
| 3 | 18 | Flow Sync Pull 引擎 |
| 3 | 23 | memoName 编码规则落地 |
| 3 | 34 | Memos API Client（直连） |
| 3 | 35 | Notes Router（provider 决策树 + 降级） |
| 3 | 36 | Memos 本地表（状态机） |
| 3 | 42 | 登录/登出（Flow Auth） |
| 3 | 51 | FlowNotes 降级表 + 边界 |
| 3 | 52 | FlowNotes API Client（/notes*） |
| 4 | 19 | 托盘常驻 + 关闭语义 |
| 4 | 20 | 全局快捷键 + 设置页改键 |
| 4 | 21 | 快速捕捉窗口 |
| 4 | 22 | Storage Root 更改与迁移 |
| 4 | 24 | memo-res 协议（安全边界） |
| 4 | 25 | 附件缓存合同（LRU/配额/cacheKey） |
| 4 | 26 | 右键菜单 |
| 4 | 27 | 诊断面板 + 脱敏日志 |
| 4 | 37 | Notes Editor（autosave 本地） |
| 4 | 38 | Memos Sync Job |
| 4 | 39 | Notes 冲突副本策略 |
| 4 | 40 | Backfill Worker（回填 Collections ref_id） |
| 4 | 41 | 冲突中心（聚合） |
| 4 | 43 | 设置页：后端与网络配置 |
| 4 | 44 | Notes 列表页（时间线/收件箱/回收站） |
| 4 | 45 | Folder/Collections 树 UI |
| 4 | 46 | 拖拽整理 + 撤销 |
| 4 | 47 | Todo UI |
| 4 | 53 | 禁止自动迁移回写护栏 |
| 4 | 54 | 路径权限门（open/save 对话框授权） |
| 4 | 55 | 关闭行为设置（默认托盘，可切换） |
| 5 | 28 | 全局搜索（FTS5 + 分页 IPC） |
| 5 | 29 | 分享与导出（保存对话框授权） |
| 5 | 30 | 自动更新（GitHub Releases stable） |
| 5 | 31 | NSIS 打包（electron-builder）+ SHA-256 |
| 5 | 32 | Release workflow（tag -> Release） |
| 5 | 33 | Windows runner E2E（Playwright） |
| 5 | 48 | 同步调度器（Flow/Memos 分离） |
| 5 | 49 | Sync 状态摘要 UI |
| 5 | 50 | 版本号/tag/Release 约定 |

- [x] 1. 初始化工程骨架（Electron + Vite + React + TypeScript）

  **What to do**:
  - 在仓库根目录创建可运行的 Electron 工程骨架（main/preload/renderer/shared 分层）。
  - 设定 `productName=心流`、`appId=cc.pscly.xinliu.desktop`、英文标识 `xinliu-desktop`（用于 exe/资产/目录命名）。
  - 默认窗口形态按合同：frameless（后续任务补齐自定义标题栏与 drag/no-drag）。
  - 仅搭“能编译/能打包/能跑测试”的最小工程闭环（不是 MVP 功能，而是工程闭环）。

  **Must NOT do**:
  - 不引入 macOS/Linux 打包与兼容逻辑（Windows-only）。
  - renderer 禁止 Node 集成（安全基线在后续任务写死，但此处不得先走捷径）。

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: （无）

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1（基础脚手架）
  - **Blocks**: 2-6
  - **Blocked By**: None

  **References**:
  - `PLAN.md:98` - 技术栈建议（Electron + React + TS）
  - `PLAN.md:28` - Windows-only
  - `PLAN.md:189` - 主窗口 frameless（`frame: false`）
  - `PLAN.md:578` - Electron 安全模型章节（后续强制基线）

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` → PASS
  - [ ] `npm run build` → PASS（产生可用于打包的构建产物）
  - [ ] 生成的应用元信息可在配置中查到：`appId=cc.pscly.xinliu.desktop`、`productName=心流`、英文标识 `xinliu-desktop`

  **QA Scenarios**:
  ```
  Scenario: 工程可编译（Linux 环境不启动 GUI）
    Tool: Bash
    Steps:
      1. npm ci
      2. npm run typecheck
      3. npm run build
    Expected Result: 三个命令均退出码 0
    Evidence: .sisyphus/evidence/task-01-build.txt

  Scenario: Windows-only 护栏可见
    Tool: Bash
    Steps:
      1. rg -n "Windows-only" PLAN.md
      2. rg -n "MUST NOT: 承诺 macOS/Linux" PLAN.md
    Expected Result: 关键护栏在合同中可检索；计划实现不包含非 Windows 打包配置
    Evidence: .sisyphus/evidence/task-01-guardrails.txt
  ```

- [x] 54. 路径权限门（open/save 对话框授权 + renderer 禁止任意绝对路径 IO）

  **What to do**:
  - 在 main 进程实现“路径权限门”与系统对话框封装：
    - 导出：必须通过系统保存对话框（showSaveDialog）获得授权路径
    - 导入/选择文件：必须通过系统打开对话框（showOpenDialog）获得授权路径
  - 设计 IPC 合同：renderer 只能请求“打开对话框/保存对话框”，不能直接传入任意绝对路径让 main 读写。
  - 对所有涉及文件路径的 IPC 入口做校验：路径只能来自本次对话框返回的授权结果（或等价二次确认）。

  **Must NOT do**:
  - 不得允许 renderer 传任意绝对路径让 main 读写（违反安全模型）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 24/29/附件导入导出并行）
  - **Blocks**: 29（导出）、附件导入（未来扩展）、任何文件写入能力
  - **Blocked By**: 5（IPC 桥）

  **References**:
  - `PLAN.md:599` - 导出路径只能来自系统保存对话框
  - `PLAN.md:600` - 导入路径只能来自系统打开对话框
  - `PLAN.md:601` - MUST NOT: renderer 通过 IPC 传入任意绝对路径

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：未通过对话框授权的绝对路径请求会被拒绝

  **QA Scenarios**:
  ```
  Scenario: 路径权限门可测
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试模拟 renderer 传入 "/etc/passwd" 或 "C:\\Windows\\..." 被拒绝
    Evidence: .sisyphus/evidence/task-54-path-gate.txt
  ```

- [x] 55. 关闭行为设置（默认关闭到托盘；可切换为真正退出）

  **What to do**:
  - 设置页提供关闭行为配置：
    - 默认：关闭到托盘（符合合同）
    - 可选：关闭即退出（仅当用户显式选择）
  - 首次关闭提示只弹一次；设置页可重置提示。
  - 即便用户选择“关闭即退出”，也必须保证托盘菜单的“退出”仍存在且可用（作为一致的退出路径）。

  **Must NOT do**:
  - 不得把默认行为从“关闭到托盘”改成“关闭退出”。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/43 并行）
  - **Blocks**: 用户对“关掉窗口但进程仍在”的理解与可控
  - **Blocked By**: 19（Tray Manager） + 10（user_settings 表） + 6（Settings UI）

  **References**:
  - `PLAN.md:30` - 默认关闭隐藏到托盘
  - `PLAN.md:200` - 首次关闭提示 + 设置可改

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：默认 close->hide；切换后 close->quit
  - [ ] UI 有关闭行为设置项（带 `data-testid`）

  **QA Scenarios**:
  ```
  Scenario: 默认 close->hide
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言默认设置下 close 事件不会 quit
    Evidence: .sisyphus/evidence/task-55-default-hide.txt

  Scenario: 用户显式切换后 close->quit
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言设置切换后 close 事件会触发 quit
    Evidence: .sisyphus/evidence/task-55-close-quit.txt
  ```

- [x] 51. Flow Notes（降级 provider）本地表 Schema + 使用边界（仅降级时可读写）

  **What to do**:
  - 在 SQLite 迁移中创建 `notes` 表（Flow Notes 降级承载）：支持 tombstone `deleted_at`。
  - 明确并实现使用边界：仅当 Notes Router 单次请求裁决为 `Flow Notes(降级)` 时，才允许读写与同步该表。
  - 为诊断/回放保留必要字段：`request_id`、lastError、providerReason。

  **Must NOT do**:
  - 不得把 Flow `resource=note` 的 sync 当成默认路径或后台常驻同步（除非降级触发且本次 provider 已裁决为 Flow Notes）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 36/34/35 并行）
  - **Blocks**: 52（FlowNotes client）+ 35（降级写路径）
  - **Blocked By**: 8（SQLite 迁移引擎）

  **References**:
  - `PLAN.md:422` - notes 表仅降级承载 + tombstone
  - `PLAN.md:423` - MUST NOT: 不得把 Flow note sync 当默认

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：非降级时对 `notes` 表写入会被拒绝（可解释错误）

  **QA Scenarios**:
  ```
  Scenario: 降级边界强制
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试在 provider=Memos 时尝试写 FlowNotes -> 必须失败；provider=FlowNotes 时允许
    Evidence: .sisyphus/evidence/task-51-boundary.txt
  ```

- [x] 52. Flow Notes API Client（/api/v1/notes*：CRUD + attachments + shares + revisions）

  **What to do**:
  - 基于 `apidocs/openapi-v1.json` 的 `/api/v1/notes*` 端点生成类型与调用封装。
  - 支持：
    - Notes CRUD（create/list/get/update/delete/restore）
    - Revisions（list + restore）
    - Shares（create）
    - Attachments（multipart/form-data upload）
  - 与 Notes Router 集成：只有当 provider 裁决为 FlowNotes 时，才允许使用此 client 写入。

  **Must NOT do**:
  - 不得把 FlowNotes 的错误伪装成 Memos 的错误；必须标注来源 `[FlowNotes]`。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 34/35/42 并行）
  - **Blocks**: 35（降级重试）、41（冲突中心）
  - **Blocked By**: 16（Flow client 基础） + 12（HTTP client）

  **References**:
  - `apidocs/openapi-v1.json` - `/api/v1/notes*` 定义
  - `apidocs/api.zh-CN.md` - Notes 与附件/分享的字段级合同
  - `PLAN.md:314` - FlowNotes 错误标注与 request_id 可复制

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：attachments upload 走 multipart/form-data（form field `file`）
  - [ ] `npm run test` 覆盖：409 冲突被解析并带 server_snapshot（用于冲突中心）

  **QA Scenarios**:
  ```
  Scenario: FlowNotes 附件上传形态
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言请求为 multipart/form-data 且字段名为 file
    Evidence: .sisyphus/evidence/task-52-multipart.txt
  ```

- [x] 53. “不得自动迁移回写”护栏（FlowNotes 降级写入后，Memos 恢复也不自动补写）

  **What to do**:
  - 在 Notes Router + Memos Sync 中实现硬护栏：
    - 若某条 Notes 曾以 FlowNotes 降级写入，本地必须记录该事实
    - Memos 恢复可用后，不得自动把同一正文迁移/补写到 Memos
    - 若用户需要统一落点，只能走“显式迁移/修复动作”（后续可单独设计 UI）

  **Must NOT do**:
  - 不得隐式双写或后台偷偷补写。

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 35/38/39 并行）
  - **Blocks**: 数据一致性与用户信任
  - **Blocked By**: 35（Notes Router） + 52（FlowNotes client） + 34（Memos client）

  **References**:
  - `PLAN.md:301` - MUST: 不得自动把降级写入的 Notes 迁移/补写到 Memos
  - `PLAN.md:281` - 禁止隐式双写

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：曾走 FlowNotes 的条目在 Memos 可用时仍不会触发自动补写

  **QA Scenarios**:
  ```
  Scenario: 自动补写被禁止
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试模拟：FlowNotes 写入成功 -> Memos 恢复；断言不触发 Memos 写入
    Evidence: .sisyphus/evidence/task-53-no-backwrite.txt
  ```

- [ ] 48. 同步调度器（Flow/Memos 分离的后台同步 + 手动触发入口）

  **What to do**:
  - 实现后台同步调度：
    - Flow：周期性 pull + push（或 push 后 pull），失败退避；与 outbox 状态机联动
    - Memos：周期性处理 DIRTY/FAILED 的 memo，同样退避
  - 手动触发入口：
    - 托盘菜单：立即同步（Memos）、立即同步（Flow）
    - 应用内入口：设置页/同步状态摘要
  - 两条同步状态与错误提示严格分离（不得混用“同步中/失败”的语义）。

  **Must NOT do**:
  - 不得把 Flow 的 sync 状态拿来表示 Memos 的同步。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5（与 33/30/31 并行）
  - **Blocks**: “联网后自动同步”的核心体验
  - **Blocked By**: 17/18（Flow sync） + 38（Memos sync） + 19（托盘入口）

  **References**:
  - `PLAN.md:48` - Flow 与 Memos 同步状态/错误提示分离
  - `PLAN.md:206` - 托盘菜单：立即同步（Memos）
  - `PLAN.md:207` - 托盘菜单：立即同步（Flow）
  - `PLAN.md:487` - 退避重试（网络/5xx）

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：Flow/Memos 两套调度互不影响；手动触发会触发对应队列

  **QA Scenarios**:
  ```
  Scenario: 两套同步分离
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试分别触发 Flow 与 Memos 的 sync tick，断言不会互相改变状态
    Evidence: .sisyphus/evidence/task-48-scheduler.txt
  ```

- [ ] 49. Sync 状态摘要 UI（左栏/设置页显示 Flow/Memos 状态、错误可展开）

  **What to do**:
  - 左栏与设置页展示同步摘要：Flow（cursor/outbox pending/rejected）与 Memos（DIRTY/FAILED 计数）分开。
  - 错误提示必须标注来源 `[Flow]` / `[Memos]` / `[FlowNotes]`，并提供 request_id 复制。

  **Must NOT do**:
  - 不得把错误信息揉成一条“同步失败”。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5（与 48/27/41 并行）
  - **Blocks**: 用户对同步可理解、可行动
  - **Blocked By**: 48（调度器） + 27（诊断/日志） + 6（UI 壳）

  **References**:
  - `PLAN.md:48` - 状态与错误分离
  - `PLAN.md:314` - FlowNotes 错误标注
  - `PLAN.md:340` - Memos 错误标注

  **Acceptance Criteria**:
  - [ ] UI 中能同时看到 Flow 与 Memos 两条状态（`data-testid` 可定位）

  **QA Scenarios**:
  ```
  Scenario: 状态摘要 testid 存在
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"sync-flow\"" src/renderer -S
      2. rg -n "data-testid=\"sync-memos\"" src/renderer -S
    Expected Result: 两条状态都有稳定选择器
    Evidence: .sisyphus/evidence/task-49-testid.txt
  ```

- [ ] 50. 版本号/打 tag/Release 约定（v0.x.y，Changelog，stable only）

  **What to do**:
  - 明确版本号策略：`0.y.z`（当前阶段主版本号保持 0）。
  - 约定 tag 格式：`v0.y.z`（Release workflow 仅对 tag 生效）。
  - Release notes 模板：包含新增功能、修复、已知问题、SHA-256 校验说明。

  **Must NOT do**:
  - 不得发布无版本号的 release。

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5（与 31/32 并行）
  - **Blocks**: 发布流程可持续
  - **Blocked By**: None

  **References**:
  - `PLAN.md:695` - Windows runner 构建并发布
  - `PLAN.md:698` - SHA-256 校验文件

  **Acceptance Criteria**:
  - [ ] 仓库存在 `RELEASING.md` 或等价文档，写清 tag/版本/Release 附件清单

  **QA Scenarios**:
  ```
  Scenario: 发布约定文档存在
    Tool: Bash
    Steps:
      1. ls
      2. rg -n "v0\." RELEASING.md || true
    Expected Result: 约定文档存在且包含 tag/版本策略
    Evidence: .sisyphus/evidence/task-50-releasing.txt
  ```

- [ ] 45. Folder/Collections 树 UI（无限层级、hover 800ms 展开、edge scrolling）

  **What to do**:
  - Triptych 左栏实现 Folder/Collections 树：无限层级、folder 与 note_ref 混排。
  - hover 800ms 自动展开节点；拖拽时支持 edge scrolling。
  - 节点交互：单击选中（更新中栏列表），右键菜单（任务 26）。
  - 树的数据源只读 SQLite（Collections 服务提供），UI 不直接计算复杂树（避免性能问题）。

  **Must NOT do**:
  - 不得在 hover 展开时卡顿明显（需要节流与虚拟化策略）。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 44/46/47 并行）
  - **Blocks**: 46（拖拽整理）与主导航体验
  - **Blocked By**: 15（Collections 服务） + 6（Triptych 壳）

  **References**:
  - `PLAN.md:120` - Folder 树 IA
  - `PLAN.md:123` - folder 与 note_ref 混排
  - `PLAN.md:139` - hover 800ms
  - `PLAN.md:140` - edge scrolling

  **Acceptance Criteria**:
  - [ ] Playwright（Windows runner）：hover 节点 800ms 后展开（有截图证据）

  **QA Scenarios**:
  ```
  Scenario: hover 规则可定位
    Tool: Bash
    Steps:
      1. rg -n "800" src/renderer -S
    Expected Result: hover 展开延迟在代码中可检索（并在 E2E 验收）
    Evidence: .sisyphus/evidence/task-45-hover.txt
  ```

- [ ] 46. 拖拽整理（中栏条目 -> 左栏树；禁止拖入子孙；乐观更新 + 撤销）

  **What to do**:
  - 实现拖拽：从中栏列表项拖到左栏 Folder 节点。
  - 强制约束：禁止拖入子孙（服务层已有防环；UI 也要提前提示）。
  - 乐观更新：拖拽落点后立即更新 UI；提供短时“撤销”。

  **Must NOT do**:
  - 不得在拖拽后悄悄双写或绕过 outbox。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 45/44/47 并行）
  - **Blocks**: 关键用户旅程 3（拖拽整理）
  - **Blocked By**: 45（树 UI） + 15（防环）

  **References**:
  - `PLAN.md:159` - 拖拽整理旅程
  - `PLAN.md:163` - 禁止拖入子孙 + hover + edge scrolling
  - `PLAN.md:164` - 乐观更新 + 撤销

  **Acceptance Criteria**:
  - [ ] Playwright（Windows runner）：拖拽一个条目到 Folder 后，中栏列表即时变化；出现撤销入口；点击撤销恢复

  **QA Scenarios**:
  ```
  Scenario: 拖拽相关 testid 存在
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"folder-tree\"" src/renderer -S
      2. rg -n "data-testid=\"middle-list\"" src/renderer -S
    Expected Result: 树与列表有稳定选择器
    Evidence: .sisyphus/evidence/task-46-testid.txt
  ```

- [ ] 47. Todo UI（列表/完成/回收站/批量操作）+ 与本地服务对接

  **What to do**:
  - 实现 Todo 主视图：列表、完成状态切换、软删进入回收站、恢复、彻底删除（必须二次确认）。
  - 支持批量操作（多选完成/删除）。
  - UI 只读写 SQLite（Todo 服务），同步由后台任务负责。

  **Must NOT do**:
  - 不得把“彻底删除”做成无确认的危险操作。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 44/45/46 并行）
  - **Blocks**: Todo 完整体验
  - **Blocked By**: 14（Todo 服务） + 6（UI 壳）

  **References**:
  - `PLAN.md:132` - Todo 视图必须存在
  - `PLAN.md:166` - 删除与恢复旅程
  - `PLAN.md:170` - 彻底删除二次确认

  **Acceptance Criteria**:
  - [ ] Playwright（Windows runner）：完成/删除/恢复流程可走通；彻底删除弹确认

  **QA Scenarios**:
  ```
  Scenario: Todo UI 入口存在
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"nav-todo\"" src/renderer -S
    Expected Result: 存在 Todo 导航入口
    Evidence: .sisyphus/evidence/task-47-nav.txt
  ```

- [x] 42. 登录/登出与账号状态（Flow Auth：token 获取、存储、失效处理）

  **What to do**:
  - 实现登录流程（Flow）：调用 `/api/v1/auth/login` 或 `/api/v1/auth/register` 获取 token。
  - token 写入 keytar；内存中只保留短生命周期副本；登出时清除 keytar + 清理敏感缓存。
  - 401 `unauthorized`：停止自动重试，进入“需要重新登录”的可见状态。
  - 登录后设置默认值：
    - Flow Base URL 默认 `https://xl.pscly.cc`
    - Memos Base URL 默认来自登录返回的 `server_url`（并允许用户覆盖；非法则触发 Notes Router 配置校验降级）

  **Must NOT do**:
  - 不得把 token 明文写入 SQLite/文件/日志。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 16/34/35 并行推进 UI 与能力）
  - **Blocks**: 35（Notes Router）与所有 API 调用
  - **Blocked By**: 11（keytar） + 16（Flow client）

  **References**:
  - `apidocs/openapi-v1.json` - Flow auth endpoints（login/register）
  - `PLAN.md:267` - 登录返回 token + server_url（默认 memos base）
  - `PLAN.md:488` - 401 不可自动恢复

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：登录成功 token 入 keytar；登出清理；401 进入 reauth 状态

  **QA Scenarios**:
  ```
  Scenario: 登录/登出可测
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试 mock Flow 登录返回 token/server_url，断言 keytar 写入与状态更新
    Evidence: .sisyphus/evidence/task-42-auth.txt
  ```

- [ ] 43. 设置页：后端与网络配置（Flow/Memos Base URL、provider 状态、复制 request_id）

  **What to do**:
  - 设置页提供“后端/网络”区域：
    - Flow Base URL（默认 `https://xl.pscly.cc`，可覆盖，标准化）
    - Memos Base URL（默认来自 server_url，可覆盖，标准化）
    - 当前 Notes Provider（Memos 直连 / Flow Notes 降级）+ 最近一次降级原因
    - 最近一次 Flow/Memos request_id（可复制，来源分离）
  - 显式提示“token 不展示明文”。

  **Must NOT do**:
  - 不得把 token 明文展示在 UI。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 27/35/42 并行）
  - **Blocks**: 可观测性与配置可控
  - **Blocked By**: 6（Settings 路由） + 27（诊断/日志） + 35（Notes Router）

  **References**:
  - `PLAN.md:347` - 设置页展示 provider 与最近 request_id
  - `PLAN.md:379` - Flow 默认 base
  - `PLAN.md:381` - Memos base 默认来自 server_url

  **Acceptance Criteria**:
  - [ ] UI 存在 `data-testid="settings-backend"`，且具备复制 request_id 按钮

  **QA Scenarios**:
  ```
  Scenario: 设置页后端区域可定位
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"settings-backend\"" src/renderer -S
    Expected Result: 存在后端设置区域
    Evidence: .sisyphus/evidence/task-43-settings-ui.txt
  ```

- [ ] 44. Notes 列表页（时间线/收件箱/回收站）+ 虚拟列表 + provider 标注

  **What to do**:
  - 实现 Notes 的三类列表：时间线、收件箱、回收站（删除/恢复/彻底删除需二次确认）。
  - 列表必须用虚拟列表（大列表禁止一次性渲染全量）。
  - 每条 Notes 显示来源 provider（Memos/FlowNotes 降级）与 syncStatus。

  **Must NOT do**:
  - 不得实现“先拉 id 列表再逐条 IPC 拉详情”的模式。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 37/28/41 并行）
  - **Blocks**: Notes 主体验
  - **Blocked By**: 36（memos 表） + 5（IPC） + 6（Triptych 壳）

  **References**:
  - `PLAN.md:112` - 左栏入口（收件箱/回收站）
  - `PLAN.md:130` - Notes 主视图必须存在
  - `PLAN.md:672` - 大列表虚拟列表
  - `PLAN.md:677` - 禁止查询风暴

  **Acceptance Criteria**:
  - [ ] Playwright（Windows runner）：打开 Notes 列表可滚动；DOM 节点数量随滚动窗口保持稳定（虚拟化证据）

  **QA Scenarios**:
  ```
  Scenario: 虚拟列表护栏
    Tool: Bash
    Steps:
      1. rg -n "virtual" src/renderer -S
    Expected Result: Notes 列表使用虚拟化组件/实现（后续 E2E 再做 DOM 数量断言）
    Evidence: .sisyphus/evidence/task-44-virtual.txt
  ```

- [ ] 40. Backfill Worker（memo 获得 server 标识后回填 Collections 引用并入 outbox）

  **What to do**:
  - 当 memo 写回 `server_memo_id` 或 `server_memo_name`（如 `memos/123`）后：
    - 找到对应 `collection_item`（例如按 `ref_local_uuid` 映射）
    - 更新其 `ref_id` 并 bump `client_updated_at_ms`
    - 同一事务写入 `outbox_mutations(resource=collection_item, op=upsert)`

  **Must NOT do**:
  - 不得直接在线调用 Flow 写远端；必须走 outbox + sync。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 17/18/38 并行）
  - **Blocks**: Collections 与 Notes 的一致性
  - **Blocked By**: 38（Memos sync） + 15（Collections 服务） + 13（bump/outbox）

  **References**:
  - `PLAN.md:521` - Backfill 触发与动作
  - `PLAN.md:525` - MUST: 回填写入必须进入 Flow outbox

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：memo 写回 server_memo_name 后触发回填；outbox 写入 resource=collection_item

  **QA Scenarios**:
  ```
  Scenario: Backfill 进入 outbox
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试构造 memo -> collection 映射，回填后 outbox 有 1 条 upsert
    Evidence: .sisyphus/evidence/task-40-backfill.txt
  ```

- [ ] 41. 冲突中心（聚合入口：Flow rejected/server_snapshot + Notes 冲突副本）

  **What to do**:
  - 实现“冲突中心”入口（不要求全屏页，但必须可达）：
    - Flow：展示 sync/push 的 rejected（含 `server` 快照）与在线 409 的 `server_snapshot`
    - Notes：展示冲突副本列表，提供对比与复制
  - Flow 冲突操作：
    - 保守恢复（应用服务端版本）
    - 保留本地副本
    - 高级强制覆盖（必须二次确认）

  **Must NOT do**:
  - 不得隐藏冲突；必须可见、可恢复。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 39/27/18 并行）
  - **Blocks**: “冲突可见、可恢复”合同
  - **Blocked By**: 17/18（Flow sync） + 39（Notes 冲突） + 6（UI 壳）

  **References**:
  - `PLAN.md:178` - 冲突处理旅程
  - `PLAN.md:623` - 冲突证据必须可见
  - `PLAN.md:625` - 409 server_snapshot
  - `PLAN.md:626` - rejected[].server

  **Acceptance Criteria**:
  - [ ] UI 有冲突入口（`data-testid="nav-conflicts"`）并可列出冲突项
  - [ ] `npm run test` 覆盖：冲突数据模型到 UI 的最小渲染

  **QA Scenarios**:
  ```
  Scenario: 冲突入口可定位
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"nav-conflicts\"" src/renderer -S
    Expected Result: 存在冲突中心入口
    Evidence: .sisyphus/evidence/task-41-nav.txt
  ```

- [x] 38. Memos Sync Job（create/update + 附件上传顺序 + 回拉合并保护本地）

  **What to do**:
  - 实现后台同步任务（Memos）：
    - 若无 `server_memo_id`：CreateMemo
    - 否则：UpdateMemo（必须带 updateMask）
    - 附件顺序：先上传附件拿到远端引用，再绑定到 memo（避免引用错乱）
  - 回拉刷新：成功后可做轻量拉取；但必须保护本地 DIRTY/SYNCING 不被覆盖。
  - 失败策略：网络/5xx 退避重试；401/403 交给 Notes Router 降级提示；错误可在诊断面板看到 request_id。

  **Must NOT do**:
  - 不得在本地为 DIRTY 时直接覆盖正文（必须走冲突副本策略）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 17/18/24/25 并行）
  - **Blocks**: Notes 真同步、Backfill、冲突中心
  - **Blocked By**: 34（Memos client） + 36（memos 表） + 35（Notes Router）

  **References**:
  - `PLAN.md:511` - Memos Sync 状态机与冲突副本
  - `PLAN.md:517` - 附件同步顺序
  - `PLAN.md:513` - 本地编辑优先
  - `https://usememos.com/docs/api/memoservice/CreateMemo`
  - `https://usememos.com/docs/api/memoservice/UpdateMemo`

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：Create vs Update 路径；附件先上传后绑定；失败退避

  **QA Scenarios**:
  ```
  Scenario: 附件先上传再绑定
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言调用顺序：CreateAttachment -> SetMemoAttachments
    Evidence: .sisyphus/evidence/task-38-attach-order.txt

  Scenario: DIRTY 不被覆盖
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 模拟 pull 返回服务端版本，本地 DIRTY 时仅更新对照字段，不覆盖正文
    Evidence: .sisyphus/evidence/task-38-no-overwrite.txt
  ```

- [ ] 39. Notes 冲突副本策略（保留本地文本 + 原记录回滚为服务端 + 可对比可复制）

  **What to do**:
  - 在以下情形触发冲突：在线 409、同步 rejected conflict、并发写入检测。
  - 实现“冲突副本”生成：保留本地正文为冲突副本（含时间戳 + request_id），原记录回滚为服务端版本。
  - UI 必须支持：对比、复制、选择保留哪一份（保守默认）。

  **Must NOT do**:
  - 不得静默覆盖或丢弃用户文本。

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 38/40/41 并行）
  - **Blocks**: 冲突中心、Notes 可靠性
  - **Blocked By**: 37（编辑器） + 38（Memos sync）

  **References**:
  - `PLAN.md:299` - 冲突必须保留证据
  - `PLAN.md:300` - 冲突副本策略
  - `PLAN.md:625` - 在线 409 保存 server_snapshot

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：冲突时生成冲突副本；原记录回滚；两份都可检索

  **QA Scenarios**:
  ```
  Scenario: 冲突副本生成
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 模拟 409/冲突，断言冲突副本保留本地正文，原记录改为服务端版本
    Evidence: .sisyphus/evidence/task-39-conflict-copy.txt

  Scenario: UI 对比入口存在
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"conflict-compare\"" src/renderer -S
    Expected Result: 存在对比入口（后续 E2E 覆盖）
    Evidence: .sisyphus/evidence/task-39-ui.txt
  ```

- [x] 36. Notes（Memos）本地表 Schema + 同步状态机字段（LOCAL_ONLY/DIRTY/SYNCING/SYNCED/FAILED）

  **What to do**:
  - 在 SQLite 迁移中创建 Memos 侧必备表：
    - `memos`：至少包含 `local_uuid`、`server_memo_id`、`server_memo_name`（例如 `memos/123`）、正文、可见性、syncStatus、lastError、timestamps
    - `memo_attachments`：包含 `memo_local_uuid`、远端 attachment name、`local_relpath`、`cache_relpath`、`cacheKey` 等
  - 明确 state machine：`LOCAL_ONLY`、`DIRTY`、`SYNCING`、`SYNCED`、`FAILED`。
  - 约束：本地编辑优先；回拉永远不覆盖本地未同步编辑（后续任务实现冲突副本）。

  **Must NOT do**:
  - 不得把 `memoName`（`memos/123`）直接当文件名或路径段。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 34/35/37 并行）
  - **Blocks**: 37-41（Memos sync/冲突/附件）
  - **Blocked By**: 8（SQLite 迁移引擎）

  **References**:
  - `PLAN.md:424` - Memos 侧至少落库表与字段方向
  - `PLAN.md:513` - 本地编辑优先
  - `PLAN.md:515` - sync 状态机最小集合

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：迁移后 memos/memo_attachments 表存在；syncStatus 值域受控

  **QA Scenarios**:
  ```
  Scenario: memos 表与状态机可用
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试验证表存在 + syncStatus enum 受控
    Evidence: .sisyphus/evidence/task-36-memos-schema.txt

  Scenario: server_memo_name 不被当路径
    Tool: Bash
    Steps:
      1. rg -n "server_memo_name" src -S
      2. rg -n "attachments/.*memos/" src -S || true
    Expected Result: 不出现把 memos/123 拼进文件路径的实现
    Evidence: .sisyphus/evidence/task-36-no-path.txt
  ```

- [ ] 37. Notes Editor（右栏 Markdown 编辑 + autosave 本地落盘 + sync 状态展示）

  **What to do**:
  - 右栏实现 Notes 编辑器：Markdown 正文编辑、保存策略（自动保存到 SQLite）、同步状态展示（本地已保存/同步中/失败）。
  - 离线优先：保存不等待网络；网络同步由后台任务触发。
  - 编辑器必须能在大文本下保持可用性（避免每击键 IPC/DB 写风暴；采用节流/批处理）。

  **Must NOT do**:
  - 不得把“保存成功”绑定为远端写入成功（必须先落本地）。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3/4（与 38/39/40 并行）
  - **Blocks**: 快捕、时间线、冲突副本 UI
  - **Blocked By**: 6（UI 壳） + 36（memos 表） + 5（IPC）

  **References**:
  - `PLAN.md:82` - 冷启动优先展示本地
  - `PLAN.md:83` - 断网可用
  - `PLAN.md:291` - Notes 写入先落本地 + 仅向选定 provider 写一次
  - `PLAN.md:672` - 首屏性能预算

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：编辑器 autosave 写入 SQLite；syncStatus 切换可见
  - [ ] Playwright E2E（Windows runner）：输入文本后提示“已保存到本地”，断网模拟下仍可保存

  **QA Scenarios**:
  ```
  Scenario: autosave 先落本地
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 save 操作写入 memos 表并设置 syncStatus=DIRTY
    Evidence: .sisyphus/evidence/task-37-autosave.txt

  Scenario: Windows runner E2E（离线保存）
    Tool: Playwright
    Steps:
      1. 启动 app
      2. 打开 Notes -> 新建/编辑
      3. 输入 "offline note"
      4. 切换为离线模拟（mock 网络失败）
      5. 断言 UI 显示“已保存到本地”；sync 显示失败/待同步而非丢失
    Expected Result: 通过（截图）
    Evidence: .sisyphus/evidence/task-37-offline.png
  ```

- [x] 34. Memos API Client（Notes 直连：分页/过滤/updateMask/附件端点）

  **What to do**:
  - 实现 Memos REST v1 client：Base URL = `memosBaseUrl` 标准化后 + `/api/v1`。
  - 鉴权：统一注入 `Authorization: Bearer <token>`（token 来自 Flow 登录返回，是否可用于 Memos 取决于部署配置；失败要走 Notes Router 降级）。
  - 关键能力：
    - ListMemos：分页 `pageSize/pageToken`，必要时支持 `filter`/`orderBy`
    - GetMemo / CreateMemo / UpdateMemo（强制 `updateMask`）/ DeleteMemo
    - Attachment：Create/Get/ListMemoAttachments/SetMemoAttachments
  - 将 `updateMask` 与资源名（`memos/{memo}`）封装成稳定 helper，避免散落在 UI。

  **Must NOT do**:
  - 不得假设 Memos 实例一定暴露 OpenAPI JSON/YAML 下载地址；按 REST 文档实现。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 17/18/23 并行）
  - **Blocks**: 35-39（Notes Router、Memos Sync、附件）
  - **Blocked By**: 12（HTTP client） + 11（token/设备标识）

  **References**:
  - `PLAN.md:271` - Notes 直连 Memos
  - `PLAN.md:386` - SHOULD: 直连 Memos 可尝试 Bearer
  - `https://usememos.com/docs/api` - Memos API base
  - `https://usememos.com/docs/api/memoservice/UpdateMemo` - updateMask 强制
  - `https://usememos.com/docs/api/attachmentservice/CreateAttachment` - 附件上传 bytes

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：UpdateMemo/UpdateAttachment 必须携带 updateMask（缺失时抛可解释错误）
  - [ ] `npm run test` 覆盖：ListMemos pageToken 翻页逻辑

  **QA Scenarios**:
  ```
  Scenario: updateMask 强制
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言未传 updateMask 会失败；传入时会拼接到请求 query
    Evidence: .sisyphus/evidence/task-34-updatemask.txt

  Scenario: 分页参数注入
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 pageSize/pageToken 进入 query 且能读取 nextPageToken
    Evidence: .sisyphus/evidence/task-34-pagination.txt
  ```

- [x] 35. Notes Router（provider 决策树 + 单次请求降级一次 + request_id 分离展示）

  **What to do**:
  - 落地 `PLAN.md` 的 Notes 路由决策树：
    - 配置校验失败（memosBaseUrl 非法）→ 直接 Flow Notes（降级），不得尝试 Memos
    - 默认先直连 Memos
    - Memos 401/403 → 当次请求降级到 Flow Notes 重试一次
    - Memos 网络失败/超时 → 当次请求降级到 Flow Notes 重试一次
    - Memos 返回有效 HTTP 且非 401/403 → 不得降级（避免掩盖真实错误）
  - 单次用户操作内“只能选一个最终写入落点”，禁止隐式双写。
  - request_id 规则：当次若发生降级重试，必须区分 `memos_request_id` 与 `flow_request_id` 并可复制。

  **Must NOT do**:
  - 不得在有效 HTTP 4xx/5xx（非 401/403）时降级。
  - 不得在同一用户操作内双写两边正文。

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 17/18/34 并行）
  - **Blocks**: Notes UI 与同步策略、诊断面板 provider 状态
  - **Blocked By**: 34（Memos client） + 16（Flow client） + 12（HTTP client）

  **References**:
  - `PLAN.md:303` - Notes 决策树
  - `PLAN.md:279` - 单次操作仅一个 SoT
  - `PLAN.md:281` - 禁止隐式双写
  - `PLAN.md:344` - request_id 规则

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：5 条决策规则全部命中（含“不得降级”分支）
  - [ ] `npm run test` 覆盖：降级一次且仅一次；最终只写入一个 provider

  **QA Scenarios**:
  ```
  Scenario: 401/403 降级一次
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 模拟 Memos 401 -> 触发 Flow Notes 重试一次；记录两条 request_id
    Evidence: .sisyphus/evidence/task-35-degrade-auth.txt

  Scenario: 有效 HTTP 非 401/403 不降级
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 模拟 Memos 400/409/429/5xx -> 不降级，错误标注来源 [Memos]
    Evidence: .sisyphus/evidence/task-35-no-degrade.txt
  ```

- [x] 30. 自动更新（GitHub Releases stable：检查/下载/延后安装/失败回退）

  **What to do**:
  - 接入自动更新：启动后做一次轻量检查；设置页提供“手动检查更新”。
  - 下载在后台进行，不抢焦点、不阻断编辑；下载完成后由用户触发安装，支持延后。
  - 校验失败或安装失败：保持当前版本可用；提供重试与“打开 Releases”退路。
  - stable only：不把 prerelease 当更新来源。

  **Must NOT do**:
  - 不得在更新过程中强制阻断编辑。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`（Windows runner E2E）

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5（与 31/32/33 并行）
  - **Blocks**: 正式发布体验
  - **Blocked By**: 31（打包） + 32（Release workflow）

  **References**:
  - `PLAN.md:702` - 应用内自动检测更新
  - `PLAN.md:704` - 启动检查 + 手动检查
  - `PLAN.md:705` - 后台下载不抢焦点
  - `PLAN.md:706` - 用户触发安装 + 延后
  - `PLAN.md:707` - 失败回退与退路

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：更新状态机（mock autoUpdater）
  - [ ] Windows runner E2E：可触发“检查更新”并进入预期状态（即便无新版本，也要有可解释 UI）

  **QA Scenarios**:
  ```
  Scenario: 更新状态机可测
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试 mock 更新事件（update-available/download-progress/update-downloaded/error）并断言 UI 状态
    Evidence: .sisyphus/evidence/task-30-updater-unit.txt

  Scenario: Windows runner E2E（手动检查更新入口）
    Tool: Playwright
    Steps:
      1. 启动 app
      2. 打开设置 -> 更新
      3. 点击 data-testid="check-updates"
      4. 断言出现状态文本（例如 "检查中"/"已是最新"/"下载中"）
    Expected Result: 通过（截图 + 日志）
    Evidence: .sisyphus/evidence/task-30-updater-e2e.png
  ```

- [x] 31. NSIS 安装包打包（electron-builder）+ Release 校验文件（SHA-256）

  **What to do**:
  - 接入 electron-builder，目标 NSIS（只做 Windows）。
  - 配置必须稳定：`appId=cc.pscly.xinliu.desktop`；产品名“心流”；英文标识 `xinliu-desktop`。
  - 生成 Release 校验文件：SHA-256（与安装包一起上传到 Release）。
  - 预留代码签名注入点：签名材料不入库，仅 CI secrets 注入（当前无证书时仍能产出未签名包用于内测）。

  **Must NOT do**:
  - 不得引入不受支持的更新目标（合同要求 NSIS 更新链路）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5（与 30/32/33 并行）
  - **Blocks**: 30（更新）与 32（发布）
  - **Blocked By**: 1（脚手架）

  **References**:
  - `PLAN.md:695` - Windows runner 构建发布
  - `PLAN.md:696` - 产物以 NSIS 为主
  - `PLAN.md:697` - NSIS 更新链路
  - `PLAN.md:698` - Release 附带 SHA-256
  - `PLAN.md:699` - 密钥/签名不入库
  - `PLAN.md:700` - appId 必须稳定

  **Acceptance Criteria**:
  - [ ] Windows runner 打包产出 NSIS 安装包 artefact
  - [ ] 同时生成 SHA-256 校验文件 artefact

  **QA Scenarios**:
  ```
  Scenario: Windows runner 产出安装包与校验文件
    Tool: Bash
    Steps:
      1. rg -n "electron-builder" package.json
      2. rg -n "nsis" -S .
    Expected Result: 存在 electron-builder 配置且目标为 NSIS；CI 会产出 installer + sha256
    Evidence: .sisyphus/evidence/task-31-builder-config.txt

  Scenario: appId 稳定性
    Tool: Bash
    Steps:
      1. rg -n "cc\.pscly\.xinliu\.desktop" -S .
    Expected Result: appId 在配置中是硬写死值
    Evidence: .sisyphus/evidence/task-31-appid.txt
  ```

- [x] 32. GitHub Actions Release 工作流（tag -> build/test/package -> GitHub Release）

  **What to do**:
  - 增加 release workflow：仅当 tag（例如 `v0.1.0`）触发；先跑 lint/test/typecheck/build，再在 Windows runner 打包 NSIS。
  - 自动创建 GitHub Release（stable，不用 prerelease），上传：安装包 + `latest.yml`（或等价更新元数据）+ SHA-256 校验文件。
  - Secrets 注入：签名证书（未来）与发布 token（当前可用 GITHUB_TOKEN）。

  **Must NOT do**:
  - 不得把签名材料提交到仓库。

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5（与 30/31/33 并行）
  - **Blocks**: 正式发布/自动更新链路
  - **Blocked By**: 31

  **References**:
  - `PLAN.md:695` - Windows runner 构建并发布
  - `PLAN.md:698` - Release 附带 SHA-256

  **Acceptance Criteria**:
  - [ ] `.github/workflows/release.yml` 存在且仅 tag 触发
  - [ ] Release workflow 产出 Release 附件（installer + sha256 + 更新元数据）

  **QA Scenarios**:
  ```
  Scenario: release workflow 触发条件正确
    Tool: Bash
    Steps:
      1. rg -n "on:.*push" .github/workflows/release.yml -n
      2. rg -n "tags:" .github/workflows/release.yml -n
    Expected Result: 仅 tags 触发
    Evidence: .sisyphus/evidence/task-32-release-trigger.txt

  Scenario: Release 附件清单可追溯
    Tool: Bash
    Steps:
      1. rg -n "sha256|SHA-256" .github/workflows/release.yml -n
    Expected Result: workflow 中明确生成并上传 sha256
    Evidence: .sisyphus/evidence/task-32-sha.txt
  ```

- [ ] 33. Windows runner E2E（Playwright + Electron：关键旅程回归）

  **What to do**:
  - 搭建 Playwright 的 Electron E2E：在 Windows runner 启动 app，按 `data-testid` 驱动关键旅程。
  - 至少覆盖：
    - Triptych 首屏渲染（左/中/右三栏存在）
    - 快速捕捉（打开 -> 输入 -> Enter 保存 -> 窗口隐藏）
    - 关闭到托盘语义（close 不退出；退出需走 tray 菜单路径的逻辑可测 + 尽可能 E2E）
    - 设置页：检查更新入口可用、Storage Root 页面可打开
  - 截图/日志写入 `.sisyphus/evidence/`。

  **Must NOT do**:
  - 不得依赖“人工在本机 Windows 点点看”作为通过标准。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5（与 30/31/32 并行）
  - **Blocks**: 发布前回归保障
  - **Blocked By**: 6（UI 壳） + 19/20/21/22（系统集成）

  **References**:
  - `PLAN.md:142` - 关键用户旅程
  - `PLAN.md:146` - 快捕
  - `PLAN.md:193` - 托盘/关闭语义

  **Acceptance Criteria**:
  - [ ] Windows runner E2E 全部通过，且生成截图/日志证据

  **QA Scenarios**:
  ```
  Scenario: Triptych 首屏
    Tool: Playwright
    Steps:
      1. 启动 Electron
      2. 断言 data-testid="triptych-left"/"triptych-middle"/"triptych-right" 存在
      3. 截图
    Expected Result: 通过
    Evidence: .sisyphus/evidence/task-33-triptych.png

  Scenario: 快捕 Enter 保存隐藏
    Tool: Playwright
    Steps:
      1. 打开快捕窗
      2. 输入 "hello"
      3. 按 Enter
      4. 断言快捕窗不可见
    Expected Result: 通过
    Evidence: .sisyphus/evidence/task-33-quick-capture.png
  ```

- [x] 27. 诊断面板 + 脱敏日志（request_id 可复制、provider 状态可见）

  **What to do**:
  - 落地日志目录 `<root>/logs/`，并实现脱敏：禁止包含 token、Authorization、绝对路径。
  - 实现诊断面板（设置页内或独立面板）：
    - 展示 Flow/Memos Base URL（标准化后）
    - 展示当前 Notes Provider（直连/降级）与最近一次降级原因
    - 展示最近一次请求的 request_id（至少区分 memos_request_id / flow_request_id），支持一键复制

  **Must NOT do**:
  - 不得在日志/诊断面板泄漏 token/Authorization/绝对路径。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/20/22/24 并行）
  - **Blocks**: 排障可观测性与“可复制 request_id”合同
  - **Blocked By**: 12（HTTP client） + 6（Settings UI 壳）

  **References**:
  - `PLAN.md:633` - request_id 与日志
  - `PLAN.md:637` - 日志脱敏与路径约束
  - `PLAN.md:344` - Notes request_id 规则（区分来源）
  - `PLAN.md:347` - 设置页展示 provider + 最近 request_id

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：redaction 对 token/Authorization/绝对路径生效
  - [ ] UI 存在可复制 request_id 的控件（带 `data-testid`）

  **QA Scenarios**:
  ```
  Scenario: 日志脱敏可测
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试构造包含 token/绝对路径的日志输入，输出被替换/移除
    Evidence: .sisyphus/evidence/task-27-redaction.txt

  Scenario: 诊断面板可定位
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"diagnostics-" src/renderer -S
    Expected Result: 存在 diagnostics 面板相关 testid
    Evidence: .sisyphus/evidence/task-27-ui.txt
  ```

- [x] 28. 全局搜索（FTS5 + 单次 IPC 分页返回 + 快捷键入口）

  **What to do**:
  - SQLite 启用 FTS5（作为 SHOULD，但为完整实现纳入），建立搜索索引（Notes/Todo/Collections 的必要字段）。
  - renderer 提供主窗口搜索框；支持快捷键打开并聚焦搜索框。
  - IPC 查询必须一次返回一页窗口 + 必要字段，禁止“先拿 id 再逐条拉详情”的查询风暴。
  - 索引不可用时提示重建并降级，不阻断使用。

  **Must NOT do**:
  - 不得实现 N+1 IPC 查询模式。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3/4（可并行推进 UI 与索引）
  - **Blocks**: 关键用户旅程 2（搜索）
  - **Blocked By**: 8（SQLite） + 5（IPC） + 20（快捷键）

  **References**:
  - `PLAN.md:153` - 全局搜索流程
  - `PLAN.md:420` - SHOULD: FTS5
  - `PLAN.md:677` - IPC 查询风暴防线
  - `PLAN.md:678` - 列表/搜索一次返回一页必要字段

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：FTS 查询返回分页结果；降级路径可触发
  - [ ] UI 搜索框存在且可被快捷键聚焦（E2E 在 Windows runner 验收）

  **QA Scenarios**:
  ```
  Scenario: FTS 查询可用
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试写入样本数据后，FTS 返回匹配结果（含分页）
    Evidence: .sisyphus/evidence/task-28-fts.txt

  Scenario: 禁止查询风暴
    Tool: Bash
    Steps:
      1. rg -n "for .*await.*ipc" src/renderer -S || true
    Expected Result: 不存在逐条 await IPC 拉详情的实现模式（如出现需重构）
    Evidence: .sisyphus/evidence/task-28-no-storm.txt
  ```

- [x] 29. 分享与导出（系统保存对话框授权 + 失败可复制兜底）

  **What to do**:
  - 右栏提供“分享/导出”面板：至少支持导出为纯文本/Markdown。
  - 导出路径必须来自系统保存对话框（main 侧裁决）；renderer 不得传入任意绝对路径。
  - 导出失败必须提供“复制文本”兜底。

  **Must NOT do**:
  - 不得让 renderer 通过 IPC 传入任意绝对路径让 main 写文件。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 UI 其它功能并行）
  - **Blocks**: 关键用户旅程 5（分享与导出）
  - **Blocked By**: 5（IPC） + 6（右栏面板骨架）

  **References**:
  - `PLAN.md:172` - 分享与导出
  - `PLAN.md:175` - 保存对话框授权
  - `PLAN.md:599` - 导出路径只能来自系统保存对话框
  - `PLAN.md:601` - 禁止 renderer 传任意绝对路径

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：导出必须先 showSaveDialog；无授权路径时拒绝写入
  - [ ] UI 有“复制文本兜底”入口（`data-testid`）

  **QA Scenarios**:
  ```
  Scenario: 导出必须走对话框授权
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试 mock showSaveDialog，断言未授权路径不会写文件
    Evidence: .sisyphus/evidence/task-29-export-dialog.txt

  Scenario: 复制兜底存在
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"export-copy\"" src/renderer -S
    Expected Result: UI 存在复制兜底按钮
    Evidence: .sisyphus/evidence/task-29-copy.txt
  ```

- [x] 23. `memoName` 编码规则落地（route encode/decode + key base64url）

  **What to do**:
  - 实现 `memoName` 的两套编码：
    - 路由/URL 参数：`encodeURIComponent` / `decodeURIComponent`
    - 本地 key：base64url(utf8) / 反解
  - 写单元测试覆盖 round-trip（输入包含 `/` 的 `memos/123`）。

  **Must NOT do**:
  - 不得把 `memoName` 直接当作路径片段/文件名/KV key（会破坏迁移与安全边界）。

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 Notes/Memos 模块并行）
  - **Blocks**: Notes 路由、附件 cacheKey、深链路导航
  - **Blocked By**: 2

  **References**:
  - `PLAN.md:428` - memoName 可能为 `memos/123`
  - `PLAN.md:435` - 路由 encode/decode
  - `PLAN.md:443` - 本地 key 建议 base64url

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：`memos/123` 的 route/key 两套编码均可 round-trip

  **QA Scenarios**:
  ```
  Scenario: memoName 编码 round-trip
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 decode(encode("memos/123")) == 原值
    Evidence: .sisyphus/evidence/task-23-memoname.txt

  Scenario: 禁止把 memoName 当路径
    Tool: Bash
    Steps:
      1. rg -n "memos/\$\{?memoName\}?" -S src || true
    Expected Result: 不出现把 memoName 直接拼进文件路径/路由 segment 的实现
    Evidence: .sisyphus/evidence/task-23-no-path.txt
  ```

- [x] 24. `memo-res://` 协议处理器（白名单目录 + 防穿越 + MIME 白名单）

  **What to do**:
  - 在 main 注册自定义协议 `memo-res://<cacheKey>`，作为 renderer 预览附件的唯一入口。
  - 协议处理器只做“读取路由”：根据 `cacheKey` 查到本地 relpath，再拼到 Storage Root 下读取。
  - 安全边界：
    - 只允许 `<root>/attachments/` 与 `<root>/attachments-cache/`
    - 防穿越（包括编码绕过）
    - 拒绝 symlink 与 Windows reparse point
    - MIME 白名单；高风险类型强制下载（`Content-Disposition: attachment`）

  **Must NOT do**:
  - 协议层不得偷偷触发网络下载。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/20/22/25 并行）
  - **Blocks**: 附件预览、离线资源
  - **Blocked By**: 7（layout） + 5（IPC）

  **References**:
  - `PLAN.md:67` - memo-res 白名单目录
  - `PLAN.md:68` - 防穿越/拒绝 symlink/reparse
  - `PLAN.md:69` - MIME 白名单
  - `PLAN.md:461` - memo-res 是唯一预览入口
  - `PLAN.md:463` - 协议层不得触发下载
  - `PLAN.md:605` - 白名单目录仅 attachments 与 attachments-cache

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：路径校验拒绝 `..`、编码绕过、symlink
  - [ ] `npm run test` 覆盖：非白名单 MIME 强制 attachment

  **QA Scenarios**:
  ```
  Scenario: 协议路径安全
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试构造恶意 cacheKey/relpath，断言被拒绝且不泄漏绝对路径
    Evidence: .sisyphus/evidence/task-24-protocol-security.txt

  Scenario: 禁止协议层下载
    Tool: Bash
    Steps:
      1. rg -n "fetch\(|axios\(|ky\(" src/main -S
      2. rg -n "memo-res" src/main -S
    Expected Result: 协议处理器实现中不出现网络请求；仅做本地读取
    Evidence: .sisyphus/evidence/task-24-no-download.txt
  ```

- [x] 25. 附件原件/缓存合同落地（LRU/配额 + cacheKey 映射）

  **What to do**:
  - 落地三类引用：`local_relpath`（原件）、`cache_relpath`（缓存）、远端引用（仅用于再下载）。
  - 实现缓存配额 `attachmentCacheMaxMb`（设置项），超限按 LRU 驱逐；不阻断编辑。
  - 生成并维护 `cacheKey -> (local_relpath|cache_relpath)` 的映射（cacheKey 必须是不透明标识）。
  - renderer 预览只使用 `memo-res://<cacheKey>`。

  **Must NOT do**:
  - 不得把任意 relpath 直接塞进 memo-res URL（cacheKey 不能可逆成路径）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/20/22/24 并行）
  - **Blocks**: Notes 附件体验、离线预览
  - **Blocked By**: 7（layout） + 8（DB） + 24（协议）

  **References**:
  - `PLAN.md:457` - 附件引用三类
  - `PLAN.md:462` - cacheKey 不透明
  - `PLAN.md:464` - 缓存配额字段与 LRU

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：LRU 驱逐（命中/未命中）、cacheKey 不可逆路径

  **QA Scenarios**:
  ```
  Scenario: LRU 驱逐
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试创建 N 个假缓存文件，超过配额后按访问时间驱逐
    Evidence: .sisyphus/evidence/task-25-lru.txt

  Scenario: cacheKey 不透明
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 memo-res URL 里只出现 cacheKey（不含 relpath）
    Evidence: .sisyphus/evidence/task-25-cachekey.txt
  ```

- [x] 26. 右键菜单（中栏条目 + 左栏 Folder 树）

  **What to do**:
  - 中栏条目右键：打开、移动到、删除、导出。
  - 左栏 Folder 右键：新建子项、重命名、移动、删除。
  - 菜单触发动作必须走 IPC（renderer 不得直接操作系统/路径）。

  **Must NOT do**:
  - 不得在 renderer 使用 Node API 创建系统菜单。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/20/22/24 并行）
  - **Blocks**: 桌面化体验（右键菜单覆盖关键路径）
  - **Blocked By**: 5（IPC） + 6（UI 壳） + 15（Collections 服务）

  **References**:
  - `PLAN.md:236` - 右键菜单最小覆盖

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：菜单模板包含必须项（至少校验 label/command 枚举）
  - [ ] UI 上对应区域存在 `data-testid` 便于 E2E（例如 `folder-tree`, `middle-list`）

  **QA Scenarios**:
  ```
  Scenario: 菜单模板包含必须项
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 menu template 含“打开/移动到/删除/导出”等
    Evidence: .sisyphus/evidence/task-26-context-menu.txt

  Scenario: IPC 驱动菜单动作
    Tool: Bash
    Steps:
      1. rg -n "contextmenu" src/renderer -S
      2. rg -n "xinliu:" src/renderer -S
    Expected Result: renderer 通过 IPC 发起动作，不直接调用系统能力
    Evidence: .sisyphus/evidence/task-26-ipc-actions.txt
  ```

- [x] 19. 托盘常驻 + 关闭语义 + 唯一退出路径（Tray Manager）

  **What to do**:
  - main 创建并持有 Tray 强引用；托盘图标使用 `.ico`。
  - 关闭按钮默认行为：隐藏到托盘，不退出；首次关闭弹一次说明（设置可改）。
  - 托盘菜单必须覆盖最小集合：显示/隐藏、快速捕捉、立即同步（Memos/Flow 分离）、打开设置、退出。
  - “退出”是唯一真正退出路径；退出清理：注销全局快捷键、停止后台同步/定时器、关闭 SQLite/file handles。

  **Must NOT do**:
  - 不得让窗口右上角关闭直接退出进程（默认必须 hide-to-tray）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 20/22/26/28 并行）
  - **Blocks**: 产品化体验（托盘常驻、退出语义）
  - **Blocked By**: 5（IPC 桥） + 6（UI 壳）

  **References**:
  - `PLAN.md:193` - 托盘常驻与关闭语义
  - `PLAN.md:195` - Tray 强引用防 GC
  - `PLAN.md:196` - `.ico` 图标
  - `PLAN.md:198` - 关闭隐藏到托盘
  - `PLAN.md:199` - 唯一退出路径
  - `PLAN.md:213` - 退出清理清单

  **Acceptance Criteria**:
  - [ ] 单元测试覆盖：window close 事件触发 → 默认 preventDefault + hide（非 quit）
  - [ ] 单元测试覆盖：tray "退出" 触发 → cleanup 全部执行

  **QA Scenarios**:
  ```
  Scenario: 关闭隐藏到托盘（逻辑可测）
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试模拟 close 事件，断言调用 hide 且不触发 app.quit
    Evidence: .sisyphus/evidence/task-19-close-to-tray.txt

  Scenario: 退出清理完整
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 will-quit 路径注销快捷键/停止同步/关闭 DB
    Evidence: .sisyphus/evidence/task-19-exit-cleanup.txt
  ```

- [x] 20. 全局快捷键管理 + 设置页配置（注册失败可见退路）

  **What to do**:
  - main 实现 globalShortcut 管理：仅 app ready 后注册；退出时注销。
  - 设置页提供快捷键配置：修改/禁用/恢复默认；注册失败（返回 false）必须显式提示并引导改键。
  - 快捷键集合至少覆盖：打开快捕窗、打开主窗并聚焦搜索框（合同要求的入口兜底）。

  **Must NOT do**:
  - 不得在 renderer 直接注册快捷键。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/22/26/28 并行）
  - **Blocks**: 快捕/搜索入口
  - **Blocked By**: 5（IPC） + 6（Settings 路由骨架）

  **References**:
  - `PLAN.md:217` - GlobalShortcut 规格
  - `PLAN.md:221` - 注册失败必须可见退路
  - `PLAN.md:222` - 设置页支持改键/禁用/恢复默认

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：注册失败时 settings 状态可见（例如 UI 状态/错误码）
  - [ ] 退出时会注销所有快捷键（可测）

  **QA Scenarios**:
  ```
  Scenario: 快捷键注册失败可见
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试 mock globalShortcut.register 返回 false，断言设置页状态出现“失败提示”
    Evidence: .sisyphus/evidence/task-20-shortcut-fail.txt

  Scenario: 退出注销快捷键
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 will-quit 路径执行 unregisterAll
    Evidence: .sisyphus/evidence/task-20-shortcut-cleanup.txt
  ```

- [x] 21. 快速捕捉窗口（Quick Capture：Enter 保存隐藏、Esc 取消隐藏）

  **What to do**:
  - main 新建快捕窗（独立 BrowserWindow）：显示/聚焦/隐藏控制。
  - 入口：全局快捷键 + 托盘菜单 + 应用内按钮兜底。
  - 交互：Enter 保存并隐藏回托盘；Esc 取消隐藏；保存反馈“已保存到本地”并展示同步状态（后续由 Notes/Sync 模块提供）。

  **Must NOT do**:
  - 不得把保存逻辑直接绑到网络成功（必须先落本地，符合离线优先）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`（用于 Windows runner E2E 验收）

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/20/22/26 并行）
  - **Blocks**: 关键用户旅程 1（快捕）
  - **Blocked By**: 20（快捷键） + 19（托盘入口） + Notes 本地写入能力（后续任务）

  **References**:
  - `PLAN.md:146` - 快速捕捉流程
  - `PLAN.md:148` - 入口要求
  - `PLAN.md:149` - Enter/Esc 行为
  - `PLAN.md:82` - 冷启动/离线优先（保存先落本地）

  **Acceptance Criteria**:
  - [ ] 单元测试覆盖：Enter/Esc 触发的 IPC 与窗口 show/hide 状态机
  - [ ] Windows runner E2E：快捷键触发快捕窗（或 tray 入口兜底），输入并保存后窗口隐藏

  **QA Scenarios**:
  ```
  Scenario: Enter 保存隐藏（逻辑可测）
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试模拟 Enter，断言调用 saveQuickCapture + hide
    Evidence: .sisyphus/evidence/task-21-enter-hide.txt

  Scenario: Windows runner E2E（快捕窗可用）
    Tool: Playwright
    Steps:
      1. 在 Windows CI 启动 Electron app
      2. 通过托盘菜单或快捷键打开快捕窗
      3. 填写文本 "hello quick capture"
      4. 按 Enter
      5. 断言快捕窗隐藏；主进程未退出
    Expected Result: 通过（截图 + 日志）
    Evidence: .sisyphus/evidence/task-21-e2e.png
  ```

- [x] 22. Storage Root 更改与自动迁移（含回滚 + 重启提示）

  **What to do**:
  - 设置页提供“数据存储目录”展示与“更改目录”按钮。
  - main 实现迁移：移动/复制以下目录与文件：SQLite DB + WAL/SHM、attachments-cache、logs。
  - 迁移失败可回滚；迁移完成必须提示重启，并提供“立即重启”入口。

  **Must NOT do**:
  - 不得在迁移过程中丢失旧目录（失败必须可回滚）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4（与 19/20/21/26 并行）
  - **Blocks**: 正式用户可用性（可迁移、可恢复）
  - **Blocked By**: 7（layout） + 8（DB） + 5（IPC）

  **References**:
  - `PLAN.md:225` - Storage Root 规格
  - `PLAN.md:228` - 迁移清单
  - `PLAN.md:233` - 失败可回滚
  - `PLAN.md:234` - 完成提示重启

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：模拟迁移成功与中途失败回滚
  - [ ] 迁移完成后 UI 显示重启提示与“立即重启”按钮

  **QA Scenarios**:
  ```
  Scenario: 迁移成功
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试构造旧 root 含 db/attachments-cache/logs，迁移后新 root 含同样内容
    Evidence: .sisyphus/evidence/task-22-migrate-ok.txt

  Scenario: 迁移失败可回滚
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试注入失败点（例如权限/磁盘满 mock），断言旧 root 仍可用且数据未丢
    Evidence: .sisyphus/evidence/task-22-migrate-rollback.txt
  ```

- [x] 16. Flow API Client（基于 OpenAPI 快照 + 鉴权头 + 设备头）

  **What to do**:
  - 以 `apidocs/openapi-v1.json`（必要时对照 `openapi-v1.dev.json`）为类型来源，建立 Flow API 的类型与调用封装。
  - Flow 请求必须带：`Authorization: Bearer <token>` + `X-Request-Id` + 设备头（deviceId/deviceName）。
  - Flow Base URL 默认 `https://xl.pscly.cc`，并支持标准化与用户覆盖。

  **Must NOT do**:
  - 不得把 token 写入日志或 UI 明文。
  - 不得假设 token 永远可用于直连 Memos（此任务只做 Flow）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 13-15 并行）
  - **Blocks**: 17/18/Flow 在线校验与错误提示
  - **Blocked By**: 11（token/设备标识） + 12（HTTP client）

  **References**:
  - `PLAN.md:379` - Flow Base URL 默认
  - `PLAN.md:385` - Flow Bearer
  - `PLAN.md:390` - 设备头
  - `apidocs/openapi-v1.json` - Flow OpenAPI 快照
  - `apidocs/api.zh-CN.md` - ErrorResponse 合同

  **Acceptance Criteria**:
  - [ ] 单元/集成测试覆盖：请求头注入（Bearer + X-Request-Id + 设备头）
  - [ ] `npm run test` PASS

  **QA Scenarios**:
  ```
  Scenario: Flow 请求头注入正确
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 headers 包含 Authorization/X-Request-Id/X-Flow-Device-Id/X-Flow-Device-Name
    Evidence: .sisyphus/evidence/task-16-flow-headers.txt

  Scenario: Base URL 标准化
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 "https://xl.pscly.cc/" 被标准化为 "https://xl.pscly.cc"
    Evidence: .sisyphus/evidence/task-16-baseurl.txt
  ```

- [x] 17. Flow Sync Push 引擎（applied/rejected 判定 + 429/401/413 策略）

  **What to do**:
  - 从 `outbox_mutations` 读取 PENDING，按 batch size（默认 100）组装 `sync/push` 请求。
  - 成功标准必须逐条处理 `applied[]` 与 `rejected[]`，不能以 HTTP 200 判定。
  - `rejected` 处理：
    - `reason=conflict`：保存 `rejected[].server` 作为冲突证据，标记待处理
    - 语义校验类：标记不可自动重试并暴露到 UI
    - 未知 reason：保守重试 + 记录日志
  - 限流与失败：
    - 429：遵守 `Retry-After`，暂停本轮剩余 push
    - 401：停止自动重试，引导重新登录
    - 413/payload_too_large：允许自动降低 batch size 拆分推送，但不得丢失变更

  **Must NOT do**:
  - 不得把 HTTP 200 当作成功。
  - 不得在 429 时继续“硬推”剩余批次（防雪崩）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 18/19 并行）
  - **Blocks**: 同步可用性、冲突中心
  - **Blocked By**: 16（Flow client） + 13（outbox 工具）

  **References**:
  - `PLAN.md:484` - sync/push 成功标准
  - `PLAN.md:489` - rejected 分类
  - `PLAN.md:486` - 429 Retry-After
  - `PLAN.md:488` - 401 停止重试
  - `PLAN.md:659` - 413/payload_too_large 策略

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：applied/rejected 判定、429、401、413 拆分
  - [ ] outbox 状态机可追溯（attempt/next_retry_at_ms 更新）

  **QA Scenarios**:
  ```
  Scenario: applied/rejected 逐条判定
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试提供模拟响应（applied+rejected 混合）并断言本地状态更新正确
    Evidence: .sisyphus/evidence/task-17-applied-rejected.txt

  Scenario: 429/401/413 分支
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 429 遵守 Retry-After 且暂停；401 停止重试；413 拆分 batch size
    Evidence: .sisyphus/evidence/task-17-errors.txt
  ```

- [x] 18. Flow Sync Pull 引擎（cursor + has_more 循环 + apply 后推进）

  **What to do**:
  - 从 `sync_state` 读取 cursor，调用 `sync/pull` 增量拉取。
  - 必须处理：
    - `has_more=true` 循环拉取直到 false
    - 只有 apply changes 成功落库后才能推进 cursor 到 `next_cursor`
    - 任一轮 apply 失败必须停止并保持旧 cursor
    - `deleted_at != null` 按 tombstone 应用
    - 对未知 `changes` key 容错忽略但记录日志
  - Collections 漂移容错：显式处理 `changes.collection_items`。

  **Must NOT do**:
  - 不得只拉一页就结束。
  - 不得先推进 cursor 再 apply。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 17/19 并行）
  - **Blocks**: 同步状态摘要、冲突中心、离线一致性
  - **Blocked By**: 16（Flow client） + 10（sync_state 表）

  **References**:
  - `PLAN.md:496` - cursor 增量拉取
  - `PLAN.md:498` - has_more 循环
  - `PLAN.md:497` - apply 成功后推进 cursor
  - `PLAN.md:500` - tombstone 应用
  - `PLAN.md:507` - 处理 collection_items
  - `apidocs/collections.zh-CN.md` - Collections 专题合同（pull changes key 与资源命名权威）

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：has_more 循环、apply 失败不推进 cursor、未知 changes key 容错

  **QA Scenarios**:
  ```
  Scenario: has_more 循环与 cursor 推进
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试模拟 2 页 pull（has_more=true/false），断言 cursor 严格使用 next_cursor
    Evidence: .sisyphus/evidence/task-18-pull-loop.txt

  Scenario: apply 失败不推进 cursor
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试注入 apply 抛错，断言 sync_state 仍为旧 cursor
    Evidence: .sisyphus/evidence/task-18-cursor-rollback.txt
  ```

- [x] 13. Outbox 写入工具与 `client_updated_at_ms` 单调递增（基础能力）

  **What to do**:
  - 实现 `client_updated_at_ms` 的 monotonic bump 规则：对同一实体 id，新值为 `max(now_ms, last_ms + 1)`。
  - 封装 outbox 写入：任何改变本地可见状态的写操作必须同一事务写入业务表与 `outbox_mutations`。
  - 封装 delete 规则：即使本地已 tombstone，也必须生成 `op="delete"` 的 outbox 条目。

  **Must NOT do**:
  - 不得出现“只写业务表不写 outbox”的路径。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 14/15/16 并行）
  - **Blocks**: 14/15/17（所有写路径与 sync/push）
  - **Blocked By**: 10（outbox 表） + 8（事务封装）

  **References**:
  - `PLAN.md:474` - 写操作必须同一事务写业务表 + outbox
  - `PLAN.md:475` - delete 必须生成 outbox
  - `PLAN.md:479` - 单调递增规则
  - `PLAN.md:416` - outbox 字段最小集

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：monotonic bump（含 now_ms 回退场景）
  - [ ] `npm run test` 覆盖：delete 仍生成 outbox（至少 1 个实体）

  **QA Scenarios**:
  ```
  Scenario: client_updated_at_ms 单调递增
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 last=1000, now=900 -> new=1001；last=1000, now=2000 -> new=2000
    Evidence: .sisyphus/evidence/task-13-bump.txt

  Scenario: delete 一定生成 outbox
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试覆盖“已 tombstone 再 delete”仍插入 op=delete outbox
    Evidence: .sisyphus/evidence/task-13-delete-outbox.txt
  ```

- [x] 14. Todo 本地读写服务（SQLite SoT + tombstone + outbox）

  **What to do**:
  - 实现 Todo 的本地写路径：新建/编辑/完成/删除/恢复（软删）全部写入 SQLite，并同一事务写 outbox。
  - 实现 Todo 的本地读路径：列表页一次返回一页窗口 + 必要字段（避免 IPC 查询风暴）。
  - 保证 tombstone 字段 `deleted_at` 的语义一致：回收站可见、可恢复、可彻底删除（二次确认在 UI 任务实现）。

  **Must NOT do**:
  - 不得在 UI 写入时直接调用 Flow 在线接口去“立刻写远端表”（必须走 outbox + sync/push）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 13/15/16 并行）
  - **Blocks**: Todo UI、Flow sync
  - **Blocked By**: 9（todo 表） + 13（outbox 工具）

  **References**:
  - `PLAN.md:293` - Todo 的 SoT 与读写路径
  - `PLAN.md:421` - todo 表必须落库
  - `PLAN.md:677` - 禁止 ID 列表后逐条查详情

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：写入 Todo 会插入 outbox；读列表为分页查询
  - [ ] `npm run test` 覆盖：deleted_at 软删/恢复语义

  **QA Scenarios**:
  ```
  Scenario: Todo 写入生成 outbox
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言每次写入都会写业务表 + outbox（同一事务）
    Evidence: .sisyphus/evidence/task-14-todo-outbox.txt

  Scenario: Todo 列表无查询风暴
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 list API 一次返回一页必要字段，无逐条 N+1 查询
    Evidence: .sisyphus/evidence/task-14-todo-query.txt
  ```

- [x] 15. Collections 本地读写服务（树结构 + note_ref 混排 + 禁环）

  **What to do**:
  - 实现 `collection_item` 的本地写路径：新建 folder/note_ref、重命名、移动、删除/恢复（软删），并同一事务写入 outbox。
  - 强制约束：禁止把父 folder 移动到其子孙节点下（防环）。
  - 实现树读取：按需返回树节点与必要字段（为 Triptych 左栏与拖拽服务）。

  **Must NOT do**:
  - 不得把资源名写错（必须 `collection_item` / `collection_items`）。
  - 不得允许形成环（这是 MUST 约束）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3（与 13/14/16 并行）
  - **Blocks**: Folder 树 UI、拖拽整理、Flow sync
  - **Blocked By**: 9（collection_items 表） + 13（outbox 工具）

  **References**:
  - `PLAN.md:449` - 结构层实体名
  - `PLAN.md:451` - item_type 仅允许 folder/note_ref
  - `PLAN.md:138` - 禁止拖入子孙（防环）
  - `PLAN.md:294` - Collections 的 SoT 与写路径
  - `apidocs/collections.zh-CN.md` - Collections 专题合同（resource/key 漂移时以此为准）

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：移动父节点到子孙会被拒绝（返回可解释错误）
  - [ ] `npm run test` 覆盖：写入生成 outbox（resource=collection_item）

  **QA Scenarios**:
  ```
  Scenario: 防环约束生效
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试构造 3 层树，尝试把根移动到孙子下 -> 必须失败
    Evidence: .sisyphus/evidence/task-15-no-cycle.txt

  Scenario: Collections 写入生成 outbox
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试断言 outbox_mutations.resource == "collection_item" 且 op 正确
    Evidence: .sisyphus/evidence/task-15-outbox.txt
  ```

- [x] 10. Sync/设置相关表 Schema（outbox/sync_state/jobs/user_settings）

  **What to do**:
  - 在迁移中创建离线同步必备表：
    - `outbox_mutations`（字段至少含：`resource`, `op`, `entity_id`, `client_updated_at_ms`, `status`, `attempt`, `next_retry_at_ms`）
    - `sync_state`（持久化 Flow cursor）
    - `jobs`（后台任务去重与恢复，`PLAN.md` 为 SHOULD，但作为完整实现纳入）
    - `user_settings`（本地设置持久化，和 token/远端解耦）

  **Must NOT do**:
  - token 不能落 SQLite（只允许进入 Windows Credential Vault/DPAPI）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 7/9/11/12 并行）
  - **Blocks**: 13-16（outbox + sync 引擎）、设置页（存储目录/快捷键/更新等）
  - **Blocked By**: 8

  **References**:
  - `PLAN.md:416` - outbox 字段最小集
  - `PLAN.md:418` - sync_state 持久化 cursor
  - `PLAN.md:419` - jobs（SHOULD）
  - `PLAN.md:295` - user_settings 的 SoT 约束

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：迁移后表存在且包含关键字段
  - [ ] `user_settings` 的写路径只在 main（renderer 走 IPC）

  **QA Scenarios**:
  ```
  Scenario: outbox/sync_state/user_settings 表可用
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试验证表存在 + 关键字段存在
    Evidence: .sisyphus/evidence/task-10-schema.txt

  Scenario: token 不落 SQLite
    Tool: Bash
    Steps:
      1. rg -n "token" src/main/db src/shared || true
      2. rg -n "INSERT.*token|UPDATE.*token" src -S || true
    Expected Result: 不存在把 token 写入 SQLite 的 SQL/语句（如出现需立即修正）
    Evidence: .sisyphus/evidence/task-10-no-token-sqlite.txt
  ```

- [x] 11. 鉴权凭据与设备标识（keytar + 设备头 + 脱敏）

  **What to do**:
  - 实现 token 的安全持久化：优先 keytar（Windows Credential Vault）。
  - 提供稳定 `deviceId` 与可读 `deviceName`，并在 Flow 请求头中带上：
    - `X-Flow-Device-Id`
    - `X-Flow-Device-Name`
  - 统一脱敏策略：日志与诊断面板禁止出现 token、Authorization、绝对路径。

  **Must NOT do**:
  - 不得把 token 明文写入文件/SQLite。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 7/8/9/10/12 并行）
  - **Blocks**: 14-18（Flow/Memos client + Sync）
  - **Blocked By**: 5（IPC 基础）

  **References**:
  - `PLAN.md:393` - MUST: token 使用 Credential Vault/DPAPI
  - `PLAN.md:390` - Flow 请求设备头
  - `DESIGN.md:841` - 推荐 keytar（跨平台说明，但当前只做 Windows）

  **Acceptance Criteria**:
  - [ ] 单元测试覆盖：token 存取走 keytar mock；fallback 不会明文落盘
  - [ ] `npm run test` PASS

  **QA Scenarios**:
  ```
  Scenario: keytar 路径可测试
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试中可替换 keytar，实现通过 mock 验证调用
    Evidence: .sisyphus/evidence/task-11-keytar.txt

  Scenario: 脱敏护栏
    Tool: Bash
    Steps:
      1. rg -n "Authorization" src -S || true
      2. rg -n "console\.log\(" src -S || true
    Expected Result: 不存在把 Authorization/token 打到日志的实现；生产代码避免 console.log
    Evidence: .sisyphus/evidence/task-11-redaction.txt
  ```

- [x] 12. HTTP 客户端基础设施（Base URL 标准化 + request_id + ErrorResponse + 重试）

  **What to do**:
  - 实现统一 HTTP client（Flow 与 Memos 各自实例，但共享底层能力）：
    - Base URL 标准化（去尾 `/`、确保 scheme）
    - 每个请求自动生成并发送 `X-Request-Id`
    - 非 2xx 优先解析 `ErrorResponse`（`error/message/request_id/details`）
    - 429 读取 `Retry-After` 并退避；5xx/网络错误指数退避 + 抖动；401 停止自动重试

  **Must NOT do**:
  - 不得把 HTTP 200 当作 sync/push 成功标准（该规则在 Sync 引擎任务里强制）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 7-11 并行）
  - **Blocks**: 14-18（API client + sync）
  - **Blocked By**: 2

  **References**:
  - `PLAN.md:379` - Flow Base URL 默认
  - `PLAN.md:380` - MUST: Base URL 标准化
  - `PLAN.md:635` - MUST: 所有请求发送 X-Request-Id
  - `PLAN.md:641` - MUST: 非 2xx 优先解析 ErrorResponse
  - `apidocs/api.zh-CN.md` - ErrorResponse 合同
  - `apidocs/to_app_plan.md` - 429/Retry-After 建议

  **Acceptance Criteria**:
  - [ ] 单元测试覆盖：Base URL 标准化、request_id 注入、429 Retry-After、401 不重试
  - [ ] `npm run test` PASS

  **QA Scenarios**:
  ```
  Scenario: HTTP client 行为可测试
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试覆盖 401/429/5xx/网络失败等分支并通过
    Evidence: .sisyphus/evidence/task-12-http.txt

  Scenario: request_id 可追溯
    Tool: Bash
    Steps:
      1. rg -n "X-Request-Id" src -S
    Expected Result: 代码中存在 request_id 注入点（Flow 与 Memos 共享或各自实现）
    Evidence: .sisyphus/evidence/task-12-request-id.txt
  ```

- [x] 7. Storage Root 目录布局与路径约束（relpath/可迁移基础）

  **What to do**:
  - 实现“Storage Root 目录布局”的纯函数与工具：所有持久化路径以 `<root>` 的 relpath 表达。
  - 目录布局必须包含：`db/`、`attachments/`、`attachments-cache/`、`logs/`、`tmp/`、`exports/`。
  - 提供 `resolveStorageLayout(rootAbsPath)` 与 `toRelpath(rootAbsPath, absPath)` / `fromRelpath(...)` 等工具，并写单元测试确保 round-trip。

  **Must NOT do**:
  - 不得在 DB 里写入绝对路径（迁移会失败，且违反合同）。

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 10/11/12 并行）
  - **Blocks**: 8/9/后续所有需要落盘的模块
  - **Blocked By**: 1

  **References**:
  - `PLAN.md:403` - Storage Root 必须可迁移
  - `PLAN.md:405` - 所有路径保存为相对 `<root>` 的 relpath
  - `PLAN.md:407` - 目录布局清单

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：layout 目录名与合同一致；relpath round-trip 成立

  **QA Scenarios**:
  ```
  Scenario: relpath round-trip
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试用例验证 fromRelpath(toRelpath(x)) == x
    Evidence: .sisyphus/evidence/task-07-relpath.txt

  Scenario: 目录布局与合同一致
    Tool: Bash
    Steps:
      1. rg -n "attachments-cache|exports|tmp" PLAN.md
      2. npm run test
    Expected Result: 合同可检索；测试断言 layout 包含全部目录
    Evidence: .sisyphus/evidence/task-07-layout.txt
  ```

- [x] 8. SQLite 连接与迁移引擎（main-only + WAL + 事务封装）

  **What to do**:
  - 在 main 进程实现 SQLite 连接管理（better-sqlite3）：
    - DB 路径位于 `<root>/db/`
    - 启用 WAL
    - 提供统一 `withTransaction(fn)`（业务表 + outbox 同一事务提交）
  - 实现可测试的迁移机制：schema 版本表 + 顺序迁移 + 基础回滚/失败提示策略（完整回滚策略在后续“迁移 Storage Root”任务做）。

  **Must NOT do**:
  - renderer 禁止直连 SQLite。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 10/11/12 并行）
  - **Blocks**: 9/后续所有 DB 表与同步逻辑
  - **Blocked By**: 7

  **References**:
  - `PLAN.md:399` - SQLite 是离线权威源
  - `PLAN.md:400` - SQLite 连接只在 main
  - `PLAN.md:401` - 写入必须事务化（业务表 + outbox）
  - `PLAN.md:407` - DB 位于 `<root>/db/`
  - `PLAN.md:103` - SHOULD: better-sqlite3

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：创建临时 DB → 迁移成功 → `PRAGMA journal_mode` 为 WAL
  - [ ] DB 写入 API 明确要求在 main 侧调用（renderer 只能走 IPC）

  **QA Scenarios**:
  ```
  Scenario: WAL + 迁移可用
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试包含“打开 DB / 迁移 / PRAGMA 检查”并通过
    Evidence: .sisyphus/evidence/task-08-sqlite.txt

  Scenario: renderer 无 SQLite 依赖
    Tool: Bash
    Steps:
      1. rg -n "better-sqlite3" src/renderer || true
    Expected Result: renderer 目录无 better-sqlite3 引用
    Evidence: .sisyphus/evidence/task-08-no-sqlite-renderer.txt
  ```

- [x] 9. Flow 领域表 Schema（Todo + Collections + tombstone）

  **What to do**:
  - 在迁移中创建 Flow 必备表：`todo_lists`、`todo_items`、`todo_occurrences`、`collection_items`。
  - 所有表必须支持 tombstone：`deleted_at`（可为 null）。
  - 为常用查询加必要索引（例如按 `updated_at`/`client_updated_at_ms`、按 parent_id、按 deleted_at 过滤）。

  **Must NOT do**:
  - 不得把 Collections 资源命名写错（必须是 `collection_item` / `collection_items`）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2（与 10/11/12 并行）
  - **Blocks**: Collections UI、Todo UI、Flow Sync
  - **Blocked By**: 8

  **References**:
  - `PLAN.md:421` - Flow 侧至少落库的表清单
  - `PLAN.md:53` - tombstone 使用 `deleted_at`
  - `PLAN.md:449` - 结构层实体为 `collection_item`

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：迁移后能查询到这 4 张表；字段包含 `deleted_at`

  **QA Scenarios**:
  ```
  Scenario: Schema 创建成功
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试中执行迁移后，能通过 sqlite_master 验证 4 张表存在
    Evidence: .sisyphus/evidence/task-09-schema.txt

  Scenario: Collections 资源名护栏
    Tool: Bash
    Steps:
      1. rg -n "collection_item" PLAN.md
      2. rg -n "collection_items" PLAN.md
    Expected Result: 合同关键字存在；实现按合同命名
    Evidence: .sisyphus/evidence/task-09-collections-contract.txt
  ```

- [x] 4. Electron 安全基线（BrowserWindow/WebContents/导航拦截）

  **What to do**:
  - 在 main 进程集中封装 BrowserWindow 的安全默认值（便于测试与审计）：
    - `contextIsolation: true`
    - `nodeIntegration: false`
    - `webSecurity: true`
    - `allowRunningInsecureContent: false`
  - 默认拦截 `will-navigate`（`preventDefault()`）与 `window.open`（默认 deny）；外链仅允许受控地用系统浏览器打开。

  **Must NOT do**:
  - 不允许 renderer 直接获得 Node/文件系统/SQLite 权限。
  - 不允许放开任意导航（避免被恶意链接/重定向劫持）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 2/3/5/6 并行）
  - **Blocks**: 后续所有系统集成与 IPC
  - **Blocked By**: 1

  **References**:
  - `PLAN.md:185` - 系统能力必须由 main 裁决
  - `PLAN.md:582` - Electron 安全基线（必须项）
  - `PLAN.md:588` - 禁止任意导航（will-navigate）
  - `PLAN.md:589` - 拦截 window.open

  **Acceptance Criteria**:
  - [ ] 单元测试可断言 main 的 BrowserWindow 安全配置为“硬写死的 MUST 值”
  - [ ] `npm run test` 覆盖：`nodeIntegration` 不是 true、`contextIsolation` 不是 false

  **QA Scenarios**:
  ```
  Scenario: 安全配置可被测试与审计
    Tool: Bash
    Steps:
      1. npm run test
      2. rg -n "contextIsolation: true" src -S
      3. rg -n "nodeIntegration: false" src -S
    Expected Result: 测试通过；代码中显式存在硬写死的安全配置
    Evidence: .sisyphus/evidence/task-04-security.txt

  Scenario: 禁止任意导航/弹窗
    Tool: Bash
    Steps:
      1. rg -n "will-navigate" src -S
      2. rg -n "setWindowOpenHandler|window\.open" src -S
    Expected Result: 存在默认拦截逻辑；未出现“放开任意导航”的实现
    Evidence: .sisyphus/evidence/task-04-navigation-guard.txt
  ```

- [x] 5. IPC 桥与 Preload 合同（白名单 + 参数校验 + 统一错误形状）

  **What to do**:
  - 定义“静态可枚举”的 IPC 命名空间（例如 `xinliu:*`），main 侧逐一 `handle`，禁止通配。
  - preload 仅暴露“用例级 API”（例如 `window.xinliu.window.minimize()`），禁止把通用 `ipcRenderer` 暴露给 renderer。
  - 每个 IPC 入口做参数校验与限流；错误返回统一结构，禁止把内部堆栈与绝对路径透传给 renderer。

  **Must NOT do**:
  - 不得出现 `ipcMain.handle("xinliu:*", ...)` 这类通配。
  - 不得把任意绝对路径从 renderer 传入让 main 读写（路径权限门后续单独任务实现）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 2/3/4/6 并行）
  - **Blocks**: 之后所有系统能力（托盘/快捷键/存储迁移/更新/协议）
  - **Blocked By**: 1

  **References**:
  - `PLAN.md:587` - preload 只暴露用例级 API，禁止暴露通用 ipcRenderer
  - `PLAN.md:593` - IPC 命名空间静态可枚举，禁止通配
  - `PLAN.md:594` - 参数校验与限流
  - `PLAN.md:595` - 错误结构与禁止泄漏绝对路径

  **Acceptance Criteria**:
  - [ ] `npm run test` 覆盖：IPC 白名单枚举可被静态检查（至少 1 个正例 + 1 个反例）
  - [ ] renderer 侧只能通过 `window.xinliu.*` 调用 main 能力

  **QA Scenarios**:
  ```
  Scenario: IPC 白名单无通配
    Tool: Bash
    Steps:
      1. rg -n "ipcMain\.handle\(\s*\"xinliu:\*\"" src || true
      2. rg -n "ipcRenderer" src/preload -S
    Expected Result: 第 1 步无命中；第 2 步仅存在受控封装（不直接暴露给 window）
    Evidence: .sisyphus/evidence/task-05-ipc-guard.txt

  Scenario: IPC 参数校验存在
    Tool: Bash
    Steps:
      1. rg -n "zod|validate|schema" src/main -S
      2. npm run test
    Expected Result: main IPC 层存在参数校验；测试通过
    Evidence: .sisyphus/evidence/task-05-ipc-validate.txt
  ```

- [x] 6. Frameless 主窗口 UI 壳（自定义标题栏 + Triptych 三栏布局 + 路由骨架）

  **What to do**:
  - renderer 实现 Triptych 三栏布局骨架：左栏（导航 + 树占位）、中栏（列表占位）、右栏（详情/编辑占位）。
  - 实现自定义标题栏组件：
    - drag 区：`-webkit-app-region: drag`
    - 交互控件：`-webkit-app-region: no-drag`
    - 关键按钮加 `data-testid`（例如 `titlebar-minimize`/`titlebar-maximize`/`titlebar-close`）
  - 路由骨架覆盖必须主视图：Notes、Folder/Collections、Todo、设置、冲突中心。

  **Must NOT do**:
  - 不得把“系统按钮”留给原生标题栏（必须 frameless）。
  - 不得用随机 className 当测试选择器；统一 `data-testid`。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 2/3/4/5 并行）
  - **Blocks**: 之后所有 UI 功能（Notes/Collections/Todo/Settings/Conflicts）
  - **Blocked By**: 1

  **References**:
  - `PLAN.md:108` - Triptych 三栏布局定义
  - `PLAN.md:130` - 必须主视图集合
  - `PLAN.md:189` - frameless + drag/no-drag

  **Acceptance Criteria**:
  - [ ] renderer 端存在 Triptych 三栏 DOM 结构（可被测试定位）
  - [ ] 标题栏 drag/no-drag CSS 规则存在
  - [ ] `npm run test` 至少覆盖：Triptych 壳能渲染 + 关键 `data-testid` 存在

  **QA Scenarios**:
  ```
  Scenario: Triptych 与标题栏骨架可被测试定位
    Tool: Bash
    Steps:
      1. rg -n "data-testid=\"titlebar-" src/renderer -S
      2. rg -n "-webkit-app-region" src/renderer -S
      3. npm run test
    Expected Result: 能检索到 testid 与 app-region；测试通过
    Evidence: .sisyphus/evidence/task-06-shell.txt

  Scenario: 主视图路由齐全
    Tool: Bash
    Steps:
      1. rg -n "Notes|Todo|设置|冲突|Collections" src/renderer -S
    Expected Result: 至少存在对应路由/入口占位（后续任务再填充业务）
    Evidence: .sisyphus/evidence/task-06-routes.txt
  ```

- [x] 2. 建立代码规范 + TDD 测试基建（TypeScript/ESLint/Prettier/Vitest）

  **What to do**:
  - 增加 `lint`/`format`/`test`/`typecheck` 的标准脚本与配置。
  - 搭建 Vitest，并提供 1-2 个代表性测试：
    - 一个纯函数单测（shared 层）
    - 一个最小渲染测试（renderer 层，后续扩展组件测试）

  **Must NOT do**:
  - 不把测试“写在脚本里凑数”，必须能在 CI 重复运行且稳定。

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 3-6 并行）
  - **Blocks**: 之后所有任务的 TDD
  - **Blocked By**: 1

  **References**:
  - `PLAN.md:82` - 冷启动优先本地（后续会靠测试保护离线行为）

  **Acceptance Criteria**:
  - [ ] `npm run lint` → PASS
  - [ ] `npm run test` → PASS（至少 2 个测试用例）
  - [ ] `npm run typecheck` → PASS

  **QA Scenarios**:
  ```
  Scenario: TDD 基建可跑
    Tool: Bash
    Steps:
      1. npm run lint
      2. npm run test
      3. npm run typecheck
    Expected Result: 全部 PASS
    Evidence: .sisyphus/evidence/task-02-tests.txt

  Scenario: 测试能在无网络条件下运行
    Tool: Bash
    Steps:
      1. npm run test
    Expected Result: 测试不依赖外网；可离线运行
    Evidence: .sisyphus/evidence/task-02-offline-tests.txt
  ```

- [x] 3. 建立 GitHub Actions CI（Windows runner：lint/test/build）

  **What to do**:
  - 增加 `.github/workflows/ci.yml`：在 Windows runner 上执行 `npm ci` + `lint` + `test` + `typecheck` + `build`。
  - 产出基础 artefact（例如 build 产物/日志），用于后续 Windows-only 功能的自动验收基础。

  **Must NOT do**:
  - 不把发布（Release）混进 CI；发布链路放到后续专门任务。

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `git-master`（仅在需要操作 git/分支时）

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1（与 2/4/5/6 并行）
  - **Blocks**: Windows-only 功能的自动化验收（托盘/快捷键/更新/NSIS）
  - **Blocked By**: 1

  **References**:
  - `PLAN.md:695` - MUST: Windows runner 构建并发布

  **Acceptance Criteria**:
  - [ ] GitHub Actions CI 在 `main`/PR 上可运行并通过
  - [ ] CI 日志可追溯（失败时能定位到具体命令）

  **QA Scenarios**:
  ```
  Scenario: CI 工作流存在且可执行
    Tool: Bash
    Steps:
      1. ls .github/workflows
      2. rg -n "runs-on: windows" .github/workflows/ci.yml
    Expected Result: ci.yml 存在且包含 windows runner
    Evidence: .sisyphus/evidence/task-03-ci-files.txt

  Scenario: CI 命令与本地一致
    Tool: Bash
    Steps:
      1. rg -n "npm ci" .github/workflows/ci.yml
      2. rg -n "npm run (lint|test|typecheck|build)" .github/workflows/ci.yml
    Expected Result: CI 调用的脚本与本地 package scripts 对齐
    Evidence: .sisyphus/evidence/task-03-ci-commands.txt
  ```

---

## Final Verification Wave（全部实现完成后）

- F1：计划一致性审计（oracle）
- F2：代码质量与安全复查（unspecified-high）
- F3：全 QA 场景复跑（unspecified-high + playwright）
- F4：范围与污染检查（deep）

---

## Commit Strategy

- 每个任务完成必须提交（Conventional Commits，中文优先）
- 重要里程碑（脚手架/数据层/同步/发布）建议独立提交，便于回滚

---

## Success Criteria

- Windows runner：构建、测试、打包、发布全部 PASS
- 关键旅程：离线可用 → 联网自动同步 → 冲突可恢复 → 更新不阻断编辑
