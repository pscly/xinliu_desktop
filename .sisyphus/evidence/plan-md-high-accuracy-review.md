# 高精度审阅报告：PLAN.md（Windows 桌面端主规格）

目标：对 `PLAN.md` 做“可直接指导实现”的高精度审阅，重点检查：

- 与 `apidocs/api.zh-CN.md`、`apidocs/collections.zh-CN.md` 的合同一致性
- 文档内部自洽（避免出现互相矛盾的 MUST）
- 关键架构决策是否需要你拍板（否则实现会出现两套体系）

审阅基于仓库当前内容（2026-02-24~02-25）。

---

## A. 关键结论（按严重程度）

### A1. 重大歧义：Notes 到底走 Flow 还是直连 Memos？（需你决策）

`PLAN.md` 明确写死：

- `PLAN.md#L36-L40`："混合后端边界(硬写死)：Flow 负责 Auth/Todo/Collections/Sync；Notes 直连 Memos"

但 `apidocs/to_app_plan.md` 与 `apidocs/api.zh-CN.md` 的推荐对接路线是：客户端逐步切换到 Flow 的 `/api/v1/notes*`（即 Notes 也走 Flow），并将 Sync 描述为“适用于 Notes + Settings + TODO”。

- `apidocs/to_app_plan.md#L56-L65`
- `apidocs/api.zh-CN.md#L1456-L1464`
- `apidocs/api.zh-CN.md#L1032-L1128`（Notes endpoints）

这不是“措辞差异”，而是两套架构：

- 直连 Memos：需要实现 Memos API、memoName 编码、`memo-res://` 本地资源协议、安全与缓存策略；token 是否可用于 Memos 取决于后端配置（`to_app_plan.md#L18-L21` 明确说“取决于配置”）。
- 全走 Flow：可完全依赖 Flow 的 Notes/Attachments/Sync/Errors 合同，减少直连 Memos 的不确定性。

建议：如果你的目标是“延续 Android 端既有边界与体验”（`DESIGN.md` 描述的现状），则保留混合模式更一致；但需要在 `PLAN.md` 里把与 Flow Notes 相关内容彻底剥离/降级为 Non-Goal，避免执行时误实现。

### A2. 文档内部不自洽：Flow 边界写死不负责 Notes，但本地数据模型又要求 Flow 侧落库 notes

`PLAN.md` 的表格与边界（Notes 直连 Memos）与后续“Flow 侧落库实体”段落存在冲突：

- `PLAN.md#L38-L40`：Flow 不负责 Notes
- `PLAN.md#L308-L309`："Flow 侧至少落库... `notes`"

若不澄清，实现阶段会出现：

- 一部分人按混合模式实现（Flow 只管结构/待办），另一部分人会把 Flow 的 `note` 资源也做进 sync/outbox/本地库。

建议：二选一（见“待你拍板的问题”）。

### A3. 合同漂移已被识别，但“口径优先级”需要更精确，避免自相矛盾

`PLAN.md` 在开头写了口径优先级：

- `PLAN.md#L10-L14`：优先级 1 是 `apidocs/api.zh-CN.md` 与 `apidocs/collections.zh-CN.md`

但同一份 `apidocs/api.zh-CN.md` 在 Sync 的“资源类型（固定）”枚举里没有 `collection_item`：

- `apidocs/api.zh-CN.md#L940-L947`：只列 `note/user_setting/todo_list/todo_item/todo_occurrence`

而 `apidocs/collections.zh-CN.md` 明确把 `collection_item` 作为 sync 资源，并要求 pull `changes.collection_items` key “总是存在”：

- `apidocs/collections.zh-CN.md#L318-L327`

`PLAN.md` 也已经写了“漂移容错原则”（很好）：

- `PLAN.md#L388-L395`

问题在于：开头“优先级”描述容易让执行者误解为“api.zh-CN.md 的枚举更权威”，从而把 collections sync 做错。

建议：把口径优先级改成“更具体/更新日期更晚/专题文档优先”，并把 Collections sync 作为特例明确写清。

---

## B. 次要问题（不阻塞，但建议修订）

### B1. Memos token 可用性表述建议更保守

`PLAN.md#L273-L275` 写了 Flow 与 Memos 都用同一个 `Authorization: Bearer <token>`。

但 `apidocs/to_app_plan.md#L18-L21` 的表述更保守：该 token 存储字段名叫 `memos_token`，并且“往往也同时可用于 Memos（取决于配置）”。

建议：在 `PLAN.md` 加一个 MUST/SHOULD 的降级策略：如果直连 Memos 返回 401/403，应切换为 Flow Notes 模式（或要求后端补充可用的 memos token 获取方式）。

### B2. `memo-res://` 安全边界写得对，但建议补一段“可执行的校验算法”

目前 `PLAN.md` 已有：白名单目录、防穿越、拒绝 symlink/reparse point、MIME 白名单等。

为了可落地，建议补充“验证步骤清单”（例如：先 decode cacheKey -> 查 DB 映射 -> 得到 relpath -> path.normalize -> 验证前缀在白名单 root 下 -> lstat 检查 symlink/reparse -> MIME 推断/白名单）。

### B3. 验收脚本是加分项，但“平台假设”需要一句话说明

`PLAN.md` 的验收章节提供了 bash + `rg` 命令，这是用于仓库自检很有效。
建议在验收章节开头加一句：这些命令用于 CI/开发机（Linux）验证文档一致性，不代表 Windows 端运行环境。

---

## C. 待你拍板的问题（决定后才能把文档修到完全无歧义）

1) Windows 桌面端 Notes 的对接模式：
   - 选项 A：继续按 Android 现状（混合模式）：Notes 直连 Memos；Flow 只负责 Todo/Collections/Sync（结构层）。
   - 选项 B：桌面端改为全走 Flow：Notes/Attachments/Sync 全按 `apidocs/api.zh-CN.md`。

2) 若选 A（直连 Memos）：
   - 直连 Memos 的 token 可靠性策略是什么？
     - A1：强约束：Flow 登录返回 token 必须可用于 Memos，否则视为后端配置错误（客户端提示）。
     - A2：弱约束：token 不可用时自动降级为 Flow Notes（等同把 B 作为 fallback）。

3) Flow 本地数据模型是否需要 `notes` 表：
   - 选项：如果 Notes 走 Memos，则 Flow 本地库不应包含 `notes`（避免误实现 sync note）；
   - 如果 Notes 走 Flow，则保留并明确 sync 的 `resource=note`。

---

## D. 建议的修订动作（我可以据此生成“修订 PLAN.md 的执行计划”）

- D1：在 `PLAN.md` 开头增加“架构模式选择”小节（A/B 二选一），并把另一条路线写入 Non-Goals。
- D2：修正/拆分 `PLAN.md` 里关于 Flow 本地库实体的段落，消除 `notes` 归属矛盾。
- D3：调整“口径优先级”描述：专题文档（Collections）优先于总文档的枚举；并明确以 `collections.zh-CN.md` 为 Collections 同步合同源。
- D4：补充直连 Memos 的失败降级策略（401/403/404/429/502）与用户可见提示。
