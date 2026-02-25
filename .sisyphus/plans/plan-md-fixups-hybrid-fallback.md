# Work Plan: 修订 `PLAN.md`（Notes 混合模式 + 可降级）

## TL;DR

> 目标：把 `PLAN.md` 修到“零歧义、零自相矛盾、可直接指导实现”。
>
> 核心决策（已确认）：Windows 桌面端 Notes 采用**混合模式 + 可降级**——默认直连 Memos；当直连不可用/鉴权失败等条件触发时，降级走 Flow 的 Notes/Attachments 合同（以 `apidocs/api.zh-CN.md` 为准）。
>
> 主要交付物：更新后的 `PLAN.md`（清晰的决策树/SoT/冲突与删除语义/合同优先级）+ 一组可执行的文档验收命令与证据文件。

**Estimated Effort**: Medium
**Parallel Execution**: YES（2 waves + final verification）
**Critical Path**: 决策树/SoT 定稿 → 消除矛盾段落 → 验收脚本补齐

---

## Context

### 原始问题（来自高精度审阅）

审阅发现 `PLAN.md` 存在架构级歧义与内部不自洽，若不修订会导致实现阶段分叉（两套体系同时出现）。详见：

- `.sisyphus/evidence/plan-md-high-accuracy-review.md`

### 关键证据来源（契约/参考）

- `PLAN.md`：当前 Windows 桌面端主规格
- `DESIGN.md`：Android 端现状与迁移对照（强调 memoName encode/decode 等经验）
- `apidocs/api.zh-CN.md`：Flow Backend v1 合同（含 Notes/Attachments/Sync）
- `apidocs/collections.zh-CN.md`：Collections（含 `collection_item` sync）专题合同
- `apidocs/to_app_plan.md`：客户端对接路线（强调 token 与 Memos 的关系“取决于配置”）

### 已确认决策

- Notes：混合模式 + 可降级（主用 Memos，必要时降级 Flow Notes/Attachments）。

### Metis Review（已纳入）

Metis 提醒的重点（将在任务中落地）：

- 必须写清 **决策树（fallback decision tree）**、**Source-of-Truth（事实来源）**、**禁止隐式双写** 的护栏
- 必须把“契约优先级/漂移处理”写成硬规则，避免执行者自行选择
- 必须把验收变成可执行命令（`rg`/`python` 等），避免只靠人眼

---

## Work Objectives

### Core Objective

修订 `PLAN.md`，把 Notes 混合模式+降级策略、数据所有权（SoT）、冲突/删除语义、契约优先级与漂移处理写成**可执行**的规范，消除所有 MUST 级别矛盾。

### Concrete Deliverables

- 更新后的 `PLAN.md`
- `.sisyphus/evidence/` 下的验收证据（执行者产出）

### Must Have

- `PLAN.md` 中存在且仅存在一份“Notes 路由决策树”（包含触发条件 → 选择结果 → 用户可见反馈）。
- `PLAN.md` 明确 Source-of-Truth：哪些数据以 Memos 为准、哪些以 Flow 为准；明确禁止哪些双写。
- `PLAN.md` 明确“契约优先级/漂移处理”规则，尤其是 `collection_item` 的 drift 解释。
- `PLAN.md` 内部不再出现“Flow 不拥有 Notes”与“Flow 侧必须落库 notes”同时成立的矛盾表述。

### Must NOT Have (Guardrails)

- 不在本次工作中修改 `apidocs/*`（除非用户另行授权扩大范围）。
- 不引入新的后端接口/协议（仅修订客户端规格文档）。
- 不允许“需要用户手动判断是否通过”的验收项；所有验收必须可由 agent 跑命令判定 PASS/FAIL。

---

## Verification Strategy (Agent-Executable)

### Automated Tests

- **No code tests**（本计划仅文档修订）。

### QA Policy（每个任务都要产出证据）

- 每个任务完成后，执行者必须运行该任务的 `rg`/脚本校验，并把输出保存到：
  - `.sisyphus/evidence/task-{N}-{slug}.txt`

工具假设：

- 默认使用 `rg`（ripgrep）。若执行环境缺少 `rg`，允许用 `grep -n` 替代，但验收输出必须等价可判定。

---

## Execution Strategy

### Parallel Execution Waves

Wave 1（可立即并行：定义规则与护栏）

- T1 契约优先级与漂移规则（含 Collections 特例）
- T2 Notes 路由决策树（混合+降级）
- T3 Source-of-Truth 与禁止隐式双写护栏
- T4 Flow vs Notes 本地数据模型段落消歧（移除/改写矛盾）

Wave 2（依赖 Wave1：补齐细节与验收）

- T5 Token 可用性与降级触发条件（401/403/timeout 等）
- T6 Mermaid 图更新（加入 fallback 关键时序/数据流）
- T7 验收清单扩展（新增“矛盾/决策树唯一性/漂移声明”检查）
- T8 文档一致性回归审阅（最终 `rg` 总判定 + 占位词清零）

---

## TODOs

> 说明：每个任务只改 1-2 个文件（主要是 `PLAN.md`），并附带可执行 QA。

- [x] 1. 明确“契约优先级”与 `collection_item` 漂移处理（改 `PLAN.md` 开头口径）

  **What to do**:
  - 在 `PLAN.md` 的“口径优先级”位置补一条硬规则：专题文档/更新日期更晚/更具体的合同优先。
  - 将 Collections 同步合同明确指向 `apidocs/collections.zh-CN.md`，并说明 `apidocs/api.zh-CN.md` 的 sync resource 枚举存在缺口（不允许执行者自行选择）。
  - 增加一个小表格：冲突项 → 以谁为准 → 理由 → 兼容策略（至少覆盖 `collection_item`）。

  **Recommended Agent Profile**:
  - Category: `writing`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 1）
  - Blocks: T8

  **References**:
  - `PLAN.md#L10`（当前优先级描述位置）
  - `PLAN.md#L388`（漂移容错原则段落）
  - `apidocs/api.zh-CN.md#L940`（sync 资源枚举缺 `collection_item`）
  - `apidocs/collections.zh-CN.md#L318`（`collection_item` sync 合同）

  **Acceptance Criteria**:
  - [ ] `PLAN.md` 中出现“专题文档优先/更具体优先/更新日期更晚优先”之类的硬规则表述
  - [ ] `rg -n --fixed-strings "collection_item" PLAN.md` 有命中，且附近明确引用 `apidocs/collections.zh-CN.md`

  **QA Scenarios**:
  ```
  Scenario: Collections drift 已被硬写死
    Tool: Bash
    Steps:
      1. rg -n --fixed-strings "collection_item" PLAN.md
      2. rg -n --fixed-strings "apidocs/collections.zh-CN.md" PLAN.md
    Expected Result: 两者均命中，且文本说明“以 collections.zh-CN.md 为准”
    Evidence: .sisyphus/evidence/task-1-contract-precedence.txt
  ```

- [x] 2. 增加 Notes “混合 + 可降级”路由决策树（写清触发条件与用户可见反馈）

  **What to do**:
  - 在 `PLAN.md` 的后端边界章节新增一个小节：Notes Routing Decision Tree。
  - 明确：默认直连 Memos；触发条件（至少：Memos 401/403、网络不可达/超时、Base URL 缺失或不合法）时切换到 Flow Notes。
  - 明确：切换后 UI 的提示策略（例如：设置页显示当前 Notes Provider，错误可复制 request_id）。

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 1）
  - Blocks: T5, T6, T7, T8

  **References**:
  - `PLAN.md#L36`（当前“混合边界硬写死”段落）
  - `apidocs/api.zh-CN.md#L1032`（Flow Notes 合同）
  - `apidocs/to_app_plan.md#L18`（token 与 Memos “取决于配置”）

  **Acceptance Criteria**:
  - [ ] `PLAN.md` 中存在标题/小节明确包含 “Decision Tree / 决策树 / fallback / 降级”
  - [ ] `PLAN.md` 明确列出至少 3 条降级触发条件 + 对应结果

  **QA Scenarios**:
  ```
  Scenario: 决策树唯一且可检索
    Tool: Bash
    Steps:
      1. rg -n "(决策树|Decision Tree|fallback|降级)" PLAN.md
    Expected Result: 至少 1 处命中，且能定位到 Notes 相关段落
    Evidence: .sisyphus/evidence/task-2-notes-decision-tree.txt
  ```

- [x] 3. 写清 Source-of-Truth（SoT）与“禁止隐式双写”的护栏

  **What to do**:
  - 在 `PLAN.md` 增加一张 Ownership Matrix（领域 → 权威源 → 允许的读写路径）。
  - 明确：默认情况下 Notes 只写入一个 provider（Memos 或 Flow），禁止 silent dual-write；如需双写必须在文档列出“何时双写/如何幂等/失败补偿”。
  - 明确：冲突策略（建议先写成保守：保留副本 + 不覆盖用户文本）。

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 1）
  - Blocks: T8

  **References**:
  - `PLAN.md#L351`（同步与冲突章节入口）
  - `DESIGN.md#L101`（Android 端已强调 encode/decode 与冲突策略背景）

  **Acceptance Criteria**:
  - [ ] `PLAN.md` 中出现明确术语："Source-of-Truth" 或 "权威源/事实来源"
  - [ ] `PLAN.md` 中出现明确护栏："禁止隐式双写"（或等价硬规则）

  **QA Scenarios**:
  ```
  Scenario: SoT 与禁止双写可检索
    Tool: Bash
    Steps:
      1. rg -n "(Source-of-Truth|事实来源|权威源)" PLAN.md
      2. rg -n "(禁止.*双写|dual-write)" PLAN.md
    Expected Result: 两者均命中，且在 Notes 相关上下文可读
    Evidence: .sisyphus/evidence/task-3-sot-guardrails.txt
  ```

- [x] 4. 消除 `PLAN.md` 内部矛盾：Flow 不负责 Notes vs Flow 本地库包含 `notes`

  **What to do**:
  - 找到 `PLAN.md` 中提到 Flow 侧落库 `notes` 的段落，改写为与“混合+降级”一致：
    - 如果要保留 `notes` 表：必须明确其语义是“降级承载/派生缓存”，而不是“Flow 作为 Notes 权威源”。
    - 如果不需要：删除该要求并改成 provider 分表或引用表。
  - 在同一段落增加一句硬规则：任何实现者不得把 Flow `resource=note` 的 sync 当成默认路径（除非降级触发）。

  **Recommended Agent Profile**:
  - Category: `writing`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 1）
  - Blocks: T8

  **References**:
  - `PLAN.md#L36`（Flow/Memos 边界）
  - `PLAN.md#L308`（Flow 侧落库 notes 的矛盾点）

  **Acceptance Criteria**:
  - [ ] `PLAN.md` 不再同时出现“Flow 不负责 Notes”与“Flow 必须落库 notes”这类互斥表述

  **QA Scenarios**:
  ```
  Scenario: 矛盾语句被消除
    Tool: Bash
    Steps:
      1. rg -n --fixed-strings "Flow" PLAN.md | rg -n "Notes" || true
      2. rg -n --fixed-strings "Flow 侧至少落库" PLAN.md || true
    Expected Result: 能定位到修订后的统一表述；不再出现互斥句同时成立
    Evidence: .sisyphus/evidence/task-4-flow-notes-consistency.txt
  ```

- [x] 5. 明确 token 与直连 Memos 的可靠性 + 降级触发（401/403/timeout 等）

  **What to do**:
  - 在 `PLAN.md` 鉴权章节把“token 可用于 Memos”改成更保守表述，并写出：
    - 直连 Memos 失败（401/403/网络错误）→ 触发降级走 Flow Notes
    - UI/日志必须区分 Flow 与 Memos 的 request_id（或至少区分来源）

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 2）
  - Blocked By: T2

  **References**:
  - `PLAN.md#L271`（当前鉴权段落）
  - `apidocs/to_app_plan.md#L18`（token 与 Memos 取决于配置）

  **Acceptance Criteria**:
  - [ ] `PLAN.md` 明确写出：Memos 401/403 会触发降级到 Flow Notes

  **QA Scenarios**:
  ```
  Scenario: token/降级规则可检索
    Tool: Bash
    Steps:
      1. rg -n "(401|403).*降级" PLAN.md
      2. rg -n "Flow Notes" PLAN.md
    Expected Result: 至少 1 处命中，且语义完整
    Evidence: .sisyphus/evidence/task-5-token-fallback.txt
  ```

- [x] 6. Mermaid 图更新：加入 Notes 降级路径的关键时序

  **What to do**:
  - 在 `PLAN.md` 的 Mermaid 段落中新增或修改一段图，展示：
    - Notes 请求先走 Memos → 失败 → 切换 Flow Notes → 成功；以及状态/提示。

  **Recommended Agent Profile**:
  - Category: `writing`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 2）
  - Blocked By: T2

  **References**:
  - `PLAN.md#L412`（当前 Mermaid 区）

  **Acceptance Criteria**:
  - [ ] `PLAN.md` 中 ` ```mermaid ` 代码块数量仍 >= 3（新增不破坏现有）

  **QA Scenarios**:
  ```
  Scenario: Mermaid 数量检查
    Tool: Bash
    Steps:
      1. rg -n "^```mermaid$" PLAN.md
    Expected Result: 输出行数 >= 3
    Evidence: .sisyphus/evidence/task-6-mermaid-count.txt
  ```

- [x] 7. 扩展验收清单：新增“决策树唯一性/矛盾清零/漂移声明”的检查

  **What to do**:
  - 在 `PLAN.md` 验收章节添加新的检查块（沿用现有 `rg` 风格），覆盖：
    - Notes 决策树关键词必须命中
    - 漂移声明（`collection_item`）必须命中
    - 禁止隐式双写/SoT 必须命中

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: YES（Wave 2）
  - Blocked By: T1, T2, T3

  **References**:
  - `PLAN.md#L594`（验收清单起始）

  **Acceptance Criteria**:
  - [ ] 新增的检查命令可直接运行（无占位符）
  - [ ] 仍满足占位词清零（不引入 TBD/待定/未决）

  **QA Scenarios**:
  ```
  Scenario: 验收清单覆盖新增规则
    Tool: Bash
    Steps:
      1. rg -n "(决策树|fallback|降级)" PLAN.md
      2. rg -n "(禁止.*双写|Source-of-Truth|事实来源|权威源)" PLAN.md
      3. rg -n --fixed-strings "collection_item" PLAN.md
    Expected Result: 三条都能命中且语义明确
    Evidence: .sisyphus/evidence/task-7-acceptance-extensions.txt
  ```

- [x] 8. 最终一致性回归：全量 `rg` 检查 + 占位词清零 + 输出总判定

  **What to do**:
  - 运行 `PLAN.md` 已有的一键总判定（或等价命令集合），并把输出保存为证据。

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: （无）

  **Parallelization**:
  - Can Run In Parallel: NO（Wave 2 末尾收敛）
  - Blocked By: T1-T7

  **References**:
  - `PLAN.md#L745`（一键总判定）

  **Acceptance Criteria**:
  - [ ] 总判定输出包含 `VERDICT: PASS`

  **QA Scenarios**:
  ```
  Scenario: 文档总判定 PASS
    Tool: Bash
    Steps:
      1. 按 `PLAN.md` 的“一键总判定”命令执行
      2. 保存输出
    Expected Result: 输出包含 "VERDICT: PASS"
    Evidence: .sisyphus/evidence/task-8-final-verify.txt
  ```

---

## Final Verification Wave

- F1: 运行任务 8 的总判定，并检查新增章节没有引入与 `apidocs/*` 明显冲突的硬写死条款。
- F2: 复读 `.sisyphus/evidence/plan-md-high-accuracy-review.md` 中列的 3 个严重问题，确认全部在 `PLAN.md` 修订中被消解或被明确写成“例外/降级规则”。

---

## Decisions Needed（本计划允许先落占位，待你确认后再收敛）

- [DECISION NEEDED] 降级触发条件的最小集合：除了 401/403/timeout/BaseURL 缺失外，是否还包含 429/502？
- [DECISION NEEDED] provider 切换的持久化策略：是否允许用户在设置中手动锁定 provider？默认是否自动回切？
- [DECISION NEEDED] 双写策略：是否完全禁止，还是允许“只在某些迁移场景双写”？

---

## Commit Strategy

（由执行者在落地修订后提交）

- 建议 commit message：`docs: 明确 Notes 混合+降级策略并消除 PLAN.md 歧义`

## Success Criteria

- `PLAN.md` 对 Notes 混合+降级、SoT、合同优先级、Collections drift 有明确硬规则。
- `PLAN.md` 内部无 MUST 级矛盾。
- 验收命令可运行并输出 PASS，证据文件齐全。
