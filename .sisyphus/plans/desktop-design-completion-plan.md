# xinliu_desktop 设计文档补全计划（Windows 桌面端）

## TL;DR

> **目标**：在不进入代码开发的前提下，把现有 `DESIGN.md`（Android 端导出）与 `PLAN.md`（桌面端草案）补齐为一份“可直接指导实现”的桌面端设计规格，并与 `apidocs/*` 的接口/同步协议逐项对齐。
>
> **主要交付物**：
> - 一份补全后的桌面端设计规格（建议以仓库根目录 `PLAN.md` 为主文档）
> - 明确的关键决策表（无“待定/TBD”悬空项；如需暂留必须有默认值）
> - 文档验收清单（可用 `rg`/脚本自动检查结构完整性与关键字段对齐）
>
> **并行执行**：YES（按章节并行补齐）
> **关键路径**：后端对接策略定稿 → IA/Triptych 定稿 → 数据模型/同步规格 → 系统集成（托盘/快捷键/更新） → 验收清单

---

## Context

### 原始诉求
- 用户希望：先不开发，先把桌面端设计补全到“能直接落地实现”的程度（用户表述：补全到 plan.md）。

### 现有文档（仓库内证据）
- `DESIGN.md`：Android 端现状“可追溯导出” + Electron 承接建议（分层、同步、不变量、安全基线）。
- `PLAN.md`：桌面端交互/技术栈草案（托盘常驻、全局快捷键、三栏式、拖拽、毛玻璃/木纹质感、CQRS/乐观更新、离线图片、自定义协议、拖拽边界条件、CSS 规格、冲突策略想法）。
- `apidocs/*`：Flow Backend v1（/api/v1）接口与同步协议（Notes/Todo/Collections/Attachments/Shares/Sync，核心并发字段 `client_updated_at_ms`，soft delete/restore，sync pull/push applied/rejected）。

### 关键差距（需要在本计划中补齐）
- 桌面端 UX 规格不足：Triptych 的信息架构、键盘优先、托盘/快捷键/多窗口、右键菜单、删除/恢复/冲突等异常流缺少可执行说明。
- “权威源/同步模型”未收敛：桌面端是否只用 Flow Backend（推荐）还是保留“直连 Memos”的旧模式；Notes/Todo/Collections 的 source-of-truth 与冲突处理 UI 需要定稿。
- Windows-only 的系统能力细节缺失：无边框窗口行为、通知、更新/安装器、Credential Vault、启动项/托盘策略等需要明确。
- 验收标准缺失：需要把“设计完成”转为可自动核对的清单，避免文档空转。

### Metis 复核（差距分析要点，已纳入 TODO）
- 必须先收敛：桌面端核心主流程、IA 一等公民、Triptych 三栏固定职责、关闭到托盘策略、全局快捷键冲突策略、多窗口模型、离线优先的真相来源、同步触发与附件策略、提醒/通知范围。
- 必须补齐的章节：完整 UX Flow、IA/导航模型、本地 SQLite 数据模型与索引、同步算法规格（按 apidocs）、窗口与系统集成、安全与权限模型、安装/更新策略、迁移与版本化、错误处理规范、性能预算、可访问性。
- 必须可验证：plan 文档结构检查（标题/关键字/mermaid 数量）、无 TBD、必须包含资源-端点-字段对照。

---

## Work Objectives

### Core Objective
把桌面端设计文档从“愿景/片段”提升到“工程可执行规格”，并明确不变量、边界与验收方式，确保后续开发不走偏、不返工。

### 交付物（文档形态）
- `PLAN.md`：作为“桌面端主规格文档”（补全并结构化）。
- （可选）`DESIGN.md`：仅在顶部增加“桌面端主规格入口指针”，主体仍保留为 Android 端导出档案。
- `PLAN.md` 内置“设计完成验收清单”（rg/脚本检查项）。

### Must Have（强制）
- Windows-only 明确写死（托盘/通知/无边框窗口/更新/凭据存储都以 Windows 为基准）。
- Triptych（三栏式）作为桌面端主布局与主交互模型，不做“手机放大版”。
- 离线优先：核心写操作先落本地 SQLite；同步失败只影响“同步状态”，不阻断编辑。
- 与 `apidocs/*` 对齐：明确 Notes/Todo/Collections/Sync 的资源名、端点、关键字段（`client_updated_at_ms`、`deleted_at`、applied/rejected、server_snapshot）。
- Electron 安全基线可执行：`contextIsolation`/IPC 白名单/参数校验/自定义协议安全边界。

### Must NOT Have（护栏）
- 不写“以后再说”的跨平台承诺（macOS/Linux 细节一律不在本阶段设计范围）。
- 不堆砌 UI：每个面板限定“主动作 + 次动作 + 溢出菜单”，避免界面臃肿。
- 不自创后端字段/协议：所有同步与并发语义以 `apidocs` 为准。

---

## Verification Strategy（设计文档验收，不涉及代码实现）

> 目标：把“设计补全”变成可自动核对的验收，不依赖主观评价。

### 文档结构验收（必须可运行）
- `PLAN.md` 必须包含：目标与非目标、IA/导航、窗口与系统集成、数据模型（SQLite）、同步与冲突、Electron 安全、错误处理、性能预算、安装与更新。
- `PLAN.md` 关键字必须出现并解释：`client_updated_at_ms`、`deleted_at`、`sync/pull`、`sync/push`、`applied`、`rejected`、`server_snapshot`、`collection_item`。
- `PLAN.md` 中 `TBD/待定/未决` 不得为“悬空决策”；若存在必须带“推荐默认值 + 允许后续覆盖”的明确说明。
- `PLAN.md` 至少包含 3 段 `mermaid` 流程图（快捕/同步/冲突处理）。

### 对齐验收（必须可核对）
- `PLAN.md` 必须包含“资源-端点-字段对照表”（按 apidocs）。
- 对照表至少覆盖：Notes、Attachments、Todo、Collections、Sync。

---

## Execution Strategy

### 并行波次（写文档也要并行）

Wave 1（关键决策 + 文档骨架 + 基础合同/数据模型；输出分章节草稿）：
├── Task 1：决策收敛（写入 `01-decisions.md`）
├── Task 2：目录骨架与术语统一（写入 `02-outline.md`）
├── Task 3：Windows 系统集成规格（写入 `03-windows-integration.md`）
├── Task 4：后端合同与资源对照表（写入 `04-backend-contracts.md`）
└── Task 5：本地 SQLite 数据模型与迁移策略（写入 `05-local-data-model.md`）

Wave 2（可执行规格补齐；输出分章节草稿）：
├── Task 6：完整 UX Flows（写入 `06-ux-flows.md`）
├── Task 7：同步算法与状态机（写入 `07-sync-spec.md`）
├── Task 8：附件与离线资源策略（写入 `08-attachments.md`）
├── Task 9：安全模型（写入 `09-security.md`）
└── Task 10：错误处理与可观测性（写入 `10-errors-logs.md`）

Wave 3（质量与验收；输出分章节草稿）：
├── Task 11：性能预算与交互细则（写入 `11-performance.md`）
├── Task 12：安装与更新（写入 `12-release-update.md`）
└── Task 13：验收清单（写入 `13-acceptance.md`）

Wave 4（集成与清理；修改最终目标文件）：
├── Task 14：合并产出仓库根目录 `PLAN.md`
├── Task 15：（可选）`DESIGN.md` 顶部加入口指针
└── Task 16：清理 `.sisyphus/drafts/plan-sections/`

---

## TODOs

> 说明：为最大化并行写作并避免多人同时改同一份 `PLAN.md` 产生冲突，本计划采用“分章节草稿文件并行产出 → 最终合并进 `PLAN.md`”的方式。
>
> 章节草稿统一放在：`.sisyphus/drafts/plan-sections/`。

- [ ] 1. 收敛关键决策（Decision Log）并给出默认值

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/01-decisions.md`。
  - 把关键决策做成表格（至少覆盖 10 项）：
    - 桌面端核心主流程优先级
    - IA 一等公民（Collection/Tag/时间线/Todo）
    - Triptych 三栏职责与可切换模式
    - 点击窗口 X 的默认行为与首次提示策略
    - 全局快捷键默认值、冲突检测与自定义策略
    - 多窗口模型（主窗/快捕窗/设置窗）与焦点策略
    - 离线优先的“真相来源”与同步失败的 UX 降级
    - 同步触发源（定时/变更/网络恢复/睡眠唤醒）
    - 附件存储策略（文件落地 vs DB）与预览范围
    - Todo 提醒/通知范围（Windows toast、重复规则范围）
  - 对每一项给出：推荐默认值 + 可配置项 + 不做项（护栏）。

  **Must NOT do**:
  - 不允许留下“待定/TBD/以后再说”的悬空决策；如果确实需要暂留，必须写清楚默认值与覆盖条件。

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: （无）

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1）
  - **Blocks**: Task 14（合并总文档）
  - **Blocked By**: None

  **References**:
  - `PLAN.md`：现有桌面端草案（托盘/快捷键/三栏/拖拽等），需要将其“决策化”。
  - `AGENTS.md`：Windows-only、去掉丑标题栏、Triptych 约束。
  - `apidocs/to_app_plan.md`：Base URL、鉴权、错误处理与同步总原则。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/01-decisions.md` 存在，且包含 10 项决策表。
  - [ ] 文档中不出现未解释的 `TBD/待定/未决`。

  **QA Scenarios**:
  ```
  Scenario: 决策表完整性检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "^\|" .sisyphus/drafts/plan-sections/01-decisions.md
      2. rg -n "TBD|待定|未决" .sisyphus/drafts/plan-sections/01-decisions.md
    Expected Result: 表格存在；若出现 TBD/待定/未决，必须紧邻默认值说明。
    Evidence: .sisyphus/evidence/task-01-decisions-rg.txt
  
  Scenario: Windows-only 约束落字
    Tool: Bash (rg)
    Steps:
      1. rg -n "Windows-only|仅 Windows" .sisyphus/drafts/plan-sections/01-decisions.md
    Expected Result: 明确写出 Windows-only 护栏。
    Evidence: .sisyphus/evidence/task-01-decisions-windows-only.txt
  ```

- [ ] 2. 设计规格文档骨架（目录 + 术语 + 风格）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/02-outline.md`。
  - 给出最终 `PLAN.md` 的一级/二级目录（必须覆盖本计划“Verification Strategy”要求的章节）。
  - 统一术语表：Notes/Attachments/Shares/Todo/Collections、sync pull/push、applied/rejected、soft delete/tombstone、server_snapshot。
  - 明确“哪些内容来自 `DESIGN.md`（Android 导出）作为参考，哪些是桌面端新增规格”。

  **Must NOT do**:
  - 不要在目录里承诺跨平台实现（macOS/Linux）。

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1）
  - **Blocks**: Task 14

  **References**:
  - `DESIGN.md`：现状导出与分层不变量，作为“参考来源”需要在骨架里标注。
  - `PLAN.md`：现有草案内容，需要被“放入合适章节”。
  - `apidocs/api.zh-CN.md`：术语与关键字段来源。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/02-outline.md` 包含完整目录与术语表。
  - [ ] 目录中包含“目标与非目标 / IA / 窗口与系统集成 / 数据模型 / 同步与冲突 / 安全 / 错误处理 / 性能预算 / 安装与更新 / 验收清单”。

  **QA Scenarios**:
  ```
  Scenario: 目录覆盖检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "目标与非目标|信息架构|窗口与系统集成|数据模型|同步|安全|错误处理|性能预算|安装与更新|验收" .sisyphus/drafts/plan-sections/02-outline.md
    Expected Result: 上述关键词均出现且对应章节清晰。
    Evidence: .sisyphus/evidence/task-02-outline-coverage.txt
  ```

- [ ] 3. Windows 系统集成与窗口规格（托盘/快捷键/无边框/通知/迁移）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/03-windows-integration.md`。
  - 详细定义：
    - 托盘常驻与右键菜单信息架构（显示/隐藏、快速捕捉、立即同步、打开设置、退出等）
    - 关闭按钮行为（默认最小化到托盘；托盘右键才退出）
    - 全局快捷键：默认键位、冲突检测、用户自定义、禁用策略
    - 无边框窗口：可拖拽区域、窗口按钮布局（Windows 风格）、双击标题区最大化等
    - Windows 通知（Todo reminder / 同步失败提示 / 分享成功）
    - 数据存储目录选择与迁移：迁移范围（DB/附件/缓存/日志）、失败回滚、迁移完成后提示重启
  - 至少补 1 个 mermaid：`快捷键 → 快捕窗 → 保存 → 回到托盘状态`。

  **Must NOT do**:
  - 不要把“退出/关闭”做成每次弹窗打断（首次提示可选）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: （无）

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1）
  - **Blocks**: Task 14

  **References**:
  - `PLAN.md`：已有托盘/快捷键/无边框窗口提示，需要变成可执行规格。
  - `AGENTS.md`：去掉原生丑标题栏（frameless）为硬约束。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/03-windows-integration.md` 覆盖托盘/快捷键/无边框/通知/迁移 5 类内容。
  - [ ] 含至少 1 个 `mermaid` 图。

  **QA Scenarios**:
  ```
  Scenario: 章节要点齐全
    Tool: Bash (rg)
    Steps:
      1. rg -n "托盘|Tray|快捷键|无边框|通知|迁移" .sisyphus/drafts/plan-sections/03-windows-integration.md
      2. rg -n "```mermaid" .sisyphus/drafts/plan-sections/03-windows-integration.md
    Expected Result: 关键字覆盖齐全；mermaid 至少 1 段。
    Evidence: .sisyphus/evidence/task-03-windows-integration-check.txt
  ```

- [ ] 4. 后端对接与“资源-端点-字段”对照表（按 apidocs）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/04-backend-contracts.md`。
  - 明确桌面端默认策略（建议写成决策）：桌面端以 Flow Backend `/api/v1` 为唯一对接入口（Memos 集成仅作为服务端可选能力）。
  - 写清：Base URL 标准化、鉴权（Bearer Token）、请求头（`X-Request-Id`、device headers）、错误结构 `ErrorResponse`、限流 `429 + Retry-After`。
  - 输出一张对照表（至少覆盖）：
    - Notes：`/api/v1/notes*`（含 `q` 搜索语义、soft delete/restore、revisions）
    - Attachments：上传/下载
    - Shares：创建/撤销 + public shares 只读访问
    - Todo：lists/items/occurrences
    - Collections：管理接口 + sync 资源 `collection_item`
    - Sync：`/api/v1/sync/pull`、`/api/v1/sync/push`（applied/rejected + server_snapshot）
  - 对 `client_updated_at_ms` 写清楚：单调递增、时钟漂移、与冲突的关系。

  **Must NOT do**:
  - 不要自创 sync resource 名称；必须以 apidocs 为准。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1）
  - **Blocks**: Task 7（同步算法细化）、Task 14

  **References**:
  - `apidocs/to_app_plan.md`：对接路线、header 建议、错误处理。
  - `apidocs/api.zh-CN.md`：Notes/Todo/Sync/Attachments/Shares 的具体语义。
  - `apidocs/collections.zh-CN.md`：Collections + `collection_item` sync 资源细节。
  - `apidocs/openapi-v1.json`：机器可读对照，避免文档漂移。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/04-backend-contracts.md` 包含对照表与关键字段解释。
  - [ ] 明确写出：`client_updated_at_ms`、`applied/rejected`、`server_snapshot`。

  **QA Scenarios**:
  ```
  Scenario: 合同关键字检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "client_updated_at_ms|server_snapshot|applied|rejected|collection_item" .sisyphus/drafts/plan-sections/04-backend-contracts.md
    Expected Result: 关键字均出现且在语义段落中解释。
    Evidence: .sisyphus/evidence/task-04-contracts-keywords.txt
  ```

- [ ] 5. 本地 SQLite 数据模型 + 存储目录布局 + 迁移策略

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/05-local-data-model.md`。
  - 定义本地 SQLite 的“最小完整表集”（不做 MVP，覆盖 Notes/Todo/Collections/Settings/Sync）：
    - `notes` / `note_revisions` / `attachments`
    - `todo_lists` / `todo_items` / `todo_occurrences`
    - `collection_items`
    - `user_settings`（与 sync 资源对齐）
    - `sync_state`（cursor、last_pull_at、last_push_at、last_error）
    - `outbox_mutations`（待 push 队列；与 `/sync/push` 对齐）
    - `jobs`（后台任务持久化队列：sync、prefetch、derived rebuild、reminder）
  - 定义关键索引与查询策略：列表分页、按 tag 过滤、全文检索（本地 FTS5 是否需要，若不做必须解释理由）。
  - 定义磁盘目录布局（用户可选根目录）：db、attachments-cache、exports、logs。
  - 写出“更改存储目录”的迁移步骤（原子性、失败回滚、完成后提示重启）。

  **Must NOT do**:
  - 不要把渲染进程当作 DB 权威写入者（必须通过 main 进程/服务层）。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 1）
  - **Blocks**: Task 7、Task 8、Task 14

  **References**:
  - `DESIGN.md`：Android 端离线优先模型、syncStatus、附件 cacheUri 思路（作为设计参考）。
  - `apidocs/api.zh-CN.md`：notes/todo/sync 字段契约（决定本地表字段）。
  - `apidocs/collections.zh-CN.md`：collection_items 字段与排序/删除语义。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/05-local-data-model.md` 明确列出每张表的关键字段（至少 id、client_updated_at_ms、deleted_at、updated_at）。
  - [ ] 写清“存储目录迁移”的失败回滚策略。

  **QA Scenarios**:
  ```
  Scenario: 表清单与关键字段覆盖
    Tool: Bash (rg)
    Steps:
      1. rg -n "notes|todo_items|collection_items|outbox|sync_state|jobs" .sisyphus/drafts/plan-sections/05-local-data-model.md
      2. rg -n "client_updated_at_ms|deleted_at" .sisyphus/drafts/plan-sections/05-local-data-model.md
    Expected Result: 表清单存在；关键字段被解释。
    Evidence: .sisyphus/evidence/task-05-data-model-check.txt
  ```

- [ ] 6. 桌面端完整 UX Flows（可逐条实现）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/06-ux-flows.md`。
  - 覆盖并细化（每条都要有：入口 → 操作 → 状态反馈 → 异常分支）：
    - 快速捕捉（全局快捷键、托盘入口、草稿恢复、保存反馈）
    - 全局搜索（快捷键 → 搜索框 → 结果列表 → 右栏详情）
    - Triptych 联动（左栏筛选/Collections；中栏列表；右栏详情/编辑）
    - 拖拽整理（memo/note_ref 拖入 folder、hover 展开、边缘滚动、禁止拖入子孙）
    - 删除/恢复（soft delete、回收站、彻底删除的边界）
    - 分享（生成 share link、过期、撤销、copy link）
    - 冲突提示（server_snapshot/revisions 的呈现与操作）
  - 输出一张“快捷键总表”（可配置项也要列出）。

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Blocks**: Task 14
  - **Blocked By**: Task 1（决策）建议先完成，但不是硬阻塞（可按默认值先写）。

  **References**:
  - `PLAN.md`：已有 Triptych 与拖拽细节，需补全为可执行 flows。
  - `DESIGN.md`：Android 端功能清单（Home/Editor/ShareCard/QuickCapture/Collections/Todo/Settings）做覆盖对照。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/06-ux-flows.md` 至少覆盖 7 条主流程 + 每条含异常分支。
  - [ ] 含“快捷键总表”。

  **QA Scenarios**:
  ```
  Scenario: 主流程覆盖度检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "快速捕捉|全局搜索|拖拽|删除|恢复|分享|冲突" .sisyphus/drafts/plan-sections/06-ux-flows.md
    Expected Result: 关键流程关键词全部出现且有分节。
    Evidence: .sisyphus/evidence/task-06-ux-flows-coverage.txt
  ```

- [ ] 7. 同步算法与状态机规格（pull/push + applied/rejected）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/07-sync-spec.md`。
  - 以 `apidocs` 为准写清：
    - outbox 生成规则（哪些操作入 outbox；delete 的幂等语义）
    - push：批量大小、重试/backoff、如何处理 rejected（尤其 conflict + server 快照）
    - pull：cursor/next_cursor/has_more；changes 的 upsert/tombstone 应用策略
    - 调度触发：启动、网络恢复、用户手动同步、睡眠唤醒、周期兜底
    - 同步状态暴露给 UI 的字段（全局状态 + 单条资源状态）
  - 至少 1 张 mermaid：`本地写入 → outbox → push → pull → UI 更新`。

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Blocks**: Task 14
  - **Blocked By**: Task 4、Task 5（合同与数据模型）

  **References**:
  - `apidocs/api.zh-CN.md`：sync pull/push、applied/rejected、资源列表。
  - `apidocs/collections.zh-CN.md`：collection_item 的 sync 细节（changes.key 为 collection_items）。
  - `DESIGN.md`：Android 端 WorkManager 同步体系（作为“桌面端等价 job”参考）。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/07-sync-spec.md` 明确写出 push/pull 的顺序、失败处理、冲突处理。
  - [ ] 含至少 1 个 `mermaid` 图。

  **QA Scenarios**:
  ```
  Scenario: applied/rejected 与 server_snapshot 覆盖
    Tool: Bash (rg)
    Steps:
      1. rg -n "applied|rejected|server_snapshot" .sisyphus/drafts/plan-sections/07-sync-spec.md
    Expected Result: 三者都出现且有语义段落。
    Evidence: .sisyphus/evidence/task-07-sync-keywords.txt
  ```

- [ ] 8. 附件与离线资源策略（缓存/自定义协议/配额/GC）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/08-attachments.md`。
  - 定义：附件上传/下载与本地缓存策略（文件落地目录、命名、去重可选、失败重试）。
  - 定义：自定义协议（如 `memo-res://`）的安全边界（防路径穿越、只允许白名单映射）。
  - 定义：缓存配额与 GC（按 `attachmentCacheMaxMb` 类似设置；LRU/按访问时间）。
  - 明确：离线时 UI 占位与“可用性等级”（可看已缓存、不可看未缓存）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Blocks**: Task 14
  - **Blocked By**: Task 5

  **References**:
  - `PLAN.md`：已有 custom protocol 想法（需要规格化）。
  - `DESIGN.md`：Android 端 attachment cache/prefetch 设计（参考阈值与策略）。
  - `apidocs/api.zh-CN.md`：附件上传/下载、413 payload_too_large。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/08-attachments.md` 写清缓存配额、GC、离线占位。
  - [ ] 明确 413（超限）时客户端提示策略。

  **QA Scenarios**:
  ```
  Scenario: 附件策略关键点检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "memo-res|自定义协议|路径穿越|白名单" .sisyphus/drafts/plan-sections/08-attachments.md
      2. rg -n "配额|GC|LRU|缓存" .sisyphus/drafts/plan-sections/08-attachments.md
      3. rg -n "413|payload_too_large" .sisyphus/drafts/plan-sections/08-attachments.md
    Expected Result: 协议安全边界、缓存策略、413 处理均有明确描述。
    Evidence: .sisyphus/evidence/task-08-attachments-check.txt
  ```

- [ ] 9. Electron 安全模型（IPC 白名单 + 参数校验 + 权限边界）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/09-security.md`。
  - 写清：Electron 安全基线（`contextIsolation: true`、禁用 nodeIntegration、preload 只暴露用例级 API）。
  - 定义：IPC API 清单（按用例：sync.trigger、note.list、note.save、todo.*、collections.*、export.*、settings.*）。
  - 定义：参数校验（zod 等）、权限门（文件导出必须来自 `dialog.showSaveDialog` 返回路径）。
  - 定义：凭据存储（Windows Credential Vault / DPAPI）；日志严禁打印 token。
  - 定义：外链打开/剪贴板/拖拽导入的边界。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Blocks**: Task 14

  **References**:
  - `DESIGN.md`：Electron 安全基线与 IPC 设计建议。
  - `apidocs/to_app_plan.md`：客户端安全与隐私要求（不要打印 token/request_id 处理）。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/09-security.md` 包含 IPC 白名单表 + 权限门策略。
  - [ ] 明确写出：token 不落日志、renderer 不直接接触 fs/sqlite/凭据库。

  **QA Scenarios**:
  ```
  Scenario: Electron 安全基线与 IPC 白名单检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "contextIsolation|nodeIntegration|preload|IPC" .sisyphus/drafts/plan-sections/09-security.md
      2. rg -n "dialog\.showSaveDialog|权限门" .sisyphus/drafts/plan-sections/09-security.md
      3. rg -n "token|敏感|日志" .sisyphus/drafts/plan-sections/09-security.md
    Expected Result: 安全基线、权限门、敏感信息策略均明确。
    Evidence: .sisyphus/evidence/task-09-security-check.txt
  ```

- [ ] 10. 错误处理与可观测性（request_id、限流、离线、同步失败）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/10-errors-logs.md`。
  - 建立错误码 → 用户提示 → 可重试动作 的映射表：
    - `unauthorized`（401）
    - `conflict`（409 或 sync rejected）
    - `rate_limited`（429 + Retry-After）
    - `payload_too_large`（413）
    - `upstream_error`（502）
  - 定义：日志策略（本地路径、滚动、敏感字段脱敏）、debug 面板最小内容（同步状态、cursor、last_error）。

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 2）
  - **Blocks**: Task 14

  **References**:
  - `apidocs/api.zh-CN.md`：ErrorResponse 合同、错误码映射、Retry-After。
  - `apidocs/to_app_plan.md`：QA 自测清单（可转化为桌面端验收项）。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/10-errors-logs.md` 含错误映射表与 debug 面板清单。

  **QA Scenarios**:
  ```
  Scenario: 错误映射与 request_id 覆盖检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "ErrorResponse|request_id|X-Request-Id" .sisyphus/drafts/plan-sections/10-errors-logs.md
      2. rg -n "429|Retry-After|rate_limited" .sisyphus/drafts/plan-sections/10-errors-logs.md
      3. rg -n "409|conflict|server_snapshot" .sisyphus/drafts/plan-sections/10-errors-logs.md
    Expected Result: request_id、限流、冲突的 UX 处理均有落地说明。
    Evidence: .sisyphus/evidence/task-10-errors-logs-check.txt
  ```

- [ ] 11. 性能预算与交互细则（可量化）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/11-performance.md`。
  - 写清可量化指标：冷启动首屏、列表滚动、拖拽帧率、搜索响应、后台同步资源占用。
  - 明确策略：虚拟列表、懒加载、缓存、避免 IPC 查询风暴（配合 CQRS/乐观更新）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 3）
  - **Blocks**: Task 14

  **References**:
  - `PLAN.md`：现有虚拟列表/IPC 瓶颈提示（需要转成“预算 + 策略”）。
  - `DESIGN.md`：Android 端性能工程章节（benchmark/baselineprofile 的“可测性”理念可借鉴到桌面端）。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/11-performance.md` 包含可量化指标（至少包含 ms 与 fps 两类单位）。
  - [ ] 明确写出：避免 IPC 查询风暴（读模型缓存/批量加载/订阅式推送等至少一种策略）。

  **QA Scenarios**:
  ```
  Scenario: 指标可量化检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "ms|毫秒|fps|帧" .sisyphus/drafts/plan-sections/11-performance.md
      2. rg -n "虚拟列表|Virtual|react-virtual|分页" .sisyphus/drafts/plan-sections/11-performance.md
      3. rg -n "IPC|查询风暴|批量" .sisyphus/drafts/plan-sections/11-performance.md
    Expected Result: 指标与策略都可被 grep 到且有解释。
    Evidence: .sisyphus/evidence/task-11-performance-check.txt
  ```

- [ ] 12. 安装/发布/自动更新（GitHub Actions + 更新 UX）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/12-release-update.md`。
  - 明确：GitHub Actions 发布 exe、版本通道（stable/beta 可选）、自动更新策略与 UI（后台下载、重启安装、失败回退）。
  - 明确：代码签名要求与密钥管理（密钥不入库；CI 用 secret）。

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 3）
  - **Blocks**: Task 14

  **References**:
  - `PLAN.md`：已有“GitHub 自动 CI/CD 发布 exe + 自动检测更新”的需求点。
  - `AGENTS.md`：敏感信息不得入库（签名证书/密钥只能走 CI secrets）。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/12-release-update.md` 明确包含：构建产物类型、发布渠道、自动更新流程、签名策略（占位即可但要写清密钥不入库）。

  **QA Scenarios**:
  ```
  Scenario: 发布与更新关键字检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "GitHub Actions|CI/CD|Releases" .sisyphus/drafts/plan-sections/12-release-update.md
      2. rg -n "自动更新|Auto Update|更新" .sisyphus/drafts/plan-sections/12-release-update.md
      3. rg -n "签名|证书|secret|密钥不入库" .sisyphus/drafts/plan-sections/12-release-update.md
    Expected Result: 三类内容都出现且有明确策略。
    Evidence: .sisyphus/evidence/task-12-release-update-check.txt
  ```

- [ ] 13. “设计完成”验收清单（rg/脚本可自动核对）

  **What to do**:
  - 新建 `.sisyphus/drafts/plan-sections/13-acceptance.md`。
  - 把 Metis 提出的验收标准落为可执行命令：
    - 必含章节检查（rg）
    - 关键字检查（client_updated_at_ms 等）
    - mermaid 段落数量检查
    - `TBD/待定` 清零策略
  - 产出“验收通过的判定标准”（N/N）。

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 3）
  - **Blocks**: Task 14

  **References**:
  - `.sisyphus/plans/desktop-design-completion-plan.md`：Verification Strategy 与 Metis 验收建议来源。
  - `PLAN.md`：最终验收对象。

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/13-acceptance.md` 至少包含：章节检查、关键字检查、mermaid 数量检查、TBD 清零检查。
  - [ ] 每条检查都给出“PASS 的判定方式”（例如：无输出/输出行数为 0/出现次数 >= N）。

  **QA Scenarios**:
  ```
  Scenario: 验收清单可执行性检查
    Tool: Bash (rg)
    Steps:
      1. rg -n "rg -n" .sisyphus/drafts/plan-sections/13-acceptance.md
      2. rg -n "mermaid" .sisyphus/drafts/plan-sections/13-acceptance.md
      3. rg -n "TBD|待定|未决" .sisyphus/drafts/plan-sections/13-acceptance.md
    Expected Result: 能找到具体命令；包含 mermaid 与 TBD 清零策略。
    Evidence: .sisyphus/evidence/task-13-acceptance-check.txt
  ```

- [ ] 14. 合并产出最终 `PLAN.md`（桌面端主规格）

  **What to do**:
  - 以 `.sisyphus/drafts/plan-sections/` 中草稿为输入，合并并重构仓库根目录 `PLAN.md`：
    - 统一目录与术语
    - 把原 `PLAN.md` 有价值内容迁入对应章节
    - 确保验收清单（Task 13）在 `PLAN.md` 底部可直接运行
    - 确保至少 3 个 mermaid（快捕/同步/冲突）

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**:
  - **Can Run In Parallel**: NO（Wave 4，集成步骤）
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 1-13

  **References**:
  - `.sisyphus/drafts/plan-sections/*.md`：并行产出的章节草稿。
  - `PLAN.md`：最终落点。

  **Acceptance Criteria**:
  - [ ] `PLAN.md` 通过 Task 13 中的全部验收命令。

  **QA Scenarios**:
  ```
  Scenario: 运行设计文档验收清单
    Tool: Bash
    Steps:
      1. 逐条执行 PLAN.md 中“验收清单”的命令
      2. 将输出保存到 .sisyphus/evidence/final-plan-verify.txt
    Expected Result: 所有检查通过（无缺失章节/关键字/mermaid；无悬空 TBD）。
    Evidence: .sisyphus/evidence/final-plan-verify.txt
  ```

- [ ] 15. （可选）在 `DESIGN.md` 顶部增加“桌面端主规格入口”指针

  **What to do**:
  - 在 `DESIGN.md` 文件开头加入 5-10 行说明：
    - `DESIGN.md` 的定位是 Android 端导出档案
    - 桌面端实现以 `PLAN.md` 为主规格

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 4，可与 Task 16 并行）
  - **Blocked By**: Task 14（建议先完成，确保指针目标稳定）

  **References**:
  - `DESIGN.md`：需要加入口指针的位置。
  - `PLAN.md`：指针目标。

  **Acceptance Criteria**:
  - [ ] `DESIGN.md` 顶部包含“桌面端主规格在 `PLAN.md`”的明确指引。

  **QA Scenarios**:
  ```
  Scenario: DESIGN.md 指针可检索
    Tool: Bash (rg)
    Steps:
      1. rg -n "桌面端.*PLAN\.md|PLAN\.md.*桌面端" DESIGN.md
    Expected Result: 能直接检索到入口指针。
    Evidence: .sisyphus/evidence/task-15-design-pointer.txt
  ```

- [ ] 16. 清理并行草稿文件（避免仓库噪音）

  **What to do**:
  - 删除 `.sisyphus/drafts/plan-sections/`（或移动到 `.sisyphus/evidence/design-drafts/` 仅做留存），避免长期堆积。

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES（Wave 4）
  - **Blocked By**: Task 14

  **Acceptance Criteria**:
  - [ ] `.sisyphus/drafts/plan-sections/` 不再存在（或已移动到 `.sisyphus/evidence/design-drafts/`）。

  **QA Scenarios**:
  ```
  Scenario: 临时草稿清理检查
    Tool: Bash
    Steps:
      1. test ! -d .sisyphus/drafts/plan-sections || echo "plan-sections still exists"
    Expected Result: plan-sections 目录不存在（或已按约定迁移）。
    Evidence: .sisyphus/evidence/task-16-cleanup-check.txt
  ```

---

## Final Verification Wave

> 目标：在不写代码的前提下，对“文档是否可执行、是否对齐合同、是否符合 Windows-only 与安全边界”做并行审阅。

- [ ] F1. 设计规格完整性审计 — `oracle`
  - 检查 `PLAN.md` 是否覆盖 Must Have/Must NOT Have。
  - 逐条执行 `PLAN.md` 中的验收命令；确认输出为 PASS。
  - 输出：`结构覆盖 [PASS/FAIL] | 关键字对齐 [PASS/FAIL] | mermaid [N>=3?] | TBD 清零 [PASS/FAIL] | VERDICT`。
  - Evidence：`.sisyphus/evidence/final-f1-oracle.txt`

- [ ] F2. 合同对齐审阅（apidocs 对账） — `unspecified-high`
  - 以 `apidocs/api.zh-CN.md`、`apidocs/collections.zh-CN.md`、`apidocs/to_app_plan.md` 为基准，核对：
    - endpoint 路径与方法
    - sync resource 名称
    - 错误结构与关键字段语义
  - 输出：`对齐项 [N/N] | 漂移项 [N]（给出具体段落/关键词） | VERDICT`。
  - Evidence：`.sisyphus/evidence/final-f2-contract-alignment.txt`

- [ ] F3. UX/信息架构一致性审阅（Triptych + 键盘优先） — `visual-engineering`
  - 检查 Triptych 三栏职责、快捷键总表、关键用户旅程是否闭环（含异常流）。
  - 检查是否存在“界面臃肿/职责混乱/手机放大版”倾向。
  - 输出：`主流程 [PASS/FAIL] | 异常流 [PASS/FAIL] | 键盘优先 [PASS/FAIL] | 臃肿风险点 [list] | VERDICT`。
  - Evidence：`.sisyphus/evidence/final-f3-ux-review.txt`

- [ ] F4. Electron 安全边界审阅（IPC/协议/敏感信息） — `unspecified-high`
  - 核对 `PLAN.md` 是否明确：contextIsolation、IPC 白名单、参数校验、导出路径权限门、协议防穿越、token 不落日志。
  - 输出：`安全基线 [PASS/FAIL] | IPC 边界 [PASS/FAIL] | 风险点 [list] | VERDICT`。
  - Evidence：`.sisyphus/evidence/final-f4-security-review.txt`

---

## Commit Strategy

- 当 Task 14 完成且 Final Verification Wave 全部 PASS 后再提交。
- 建议提交粒度：1 个 commit（避免把临时草稿带入历史）。
- Commit message（建议）：`docs: 完善桌面端设计规格（PLAN.md）`
- 预计涉及文件：`PLAN.md`，可选 `DESIGN.md`（Task 15）。

---

## Success Criteria

- `PLAN.md` 通过 Task 13 的全部验收命令（章节/关键字/mermaid/TBD）。
- `PLAN.md` 明确 Windows-only 的托盘/快捷键/无边框/通知/更新/凭据策略。
- `PLAN.md` 明确对接合同：Notes/Todo/Collections/Sync 的资源-端点-字段对照表与 `client_updated_at_ms` 语义。
- `PLAN.md` 的关键用户旅程闭环（至少：快捕、搜索、拖拽整理、删除/恢复、分享、冲突处理）。
