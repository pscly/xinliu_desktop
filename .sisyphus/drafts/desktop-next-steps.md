# Draft: Desktop Next Steps

## 已知背景（来自上一轮会话记录，待你确认）
- 已将 Windows 桌面端的完整设计规格汇总为仓库根目录 `PLAN.md`，并在 `DESIGN.md` 顶部增加了指针说明。
- 已产出若干审阅/对账的证据文件在 `.sisyphus/evidence/` 下。

## 你可能想推进的下一步（待确认）
1. 进入“实现阶段”（按照 `PLAN.md` 开始落地开发、接入后端、完成托盘/快捷键/自动更新/本地存储迁移等）。
2. 在进入实现前，对 `PLAN.md` 做一次高精度审阅（Momus）以降低返工风险。
3. 决定证据/过程文件的归档策略（例如：是否将 `.sisyphus/evidence/`、`.ai_session.md` 纳入版本控制）。

## 开放问题
- 高精度审阅结论：`PLAN.md` 存在 3 个需要你拍板的“架构级歧义”，否则实现会分叉（详见 `.sisyphus/evidence/plan-md-high-accuracy-review.md`）。
- 你希望我现在做的是：基于你的决策生成“修订 PLAN.md 的执行计划”，还是直接进入“实现阶段”工作计划？
- 对于证据文件：你倾向于“提交进仓库（可审计）”还是“保持 untracked（本地留存）”？

## 审阅发现（需要你决策）
- Notes 对接：桌面端 Notes 到底“直连 Memos（延续 Android）”还是“全走 Flow（按 apidocs 推荐）”？
- 若直连 Memos：Flow 登录返回 token 是否保证可用于 Memos（强约束）？还是 token 不可用时自动降级到 Flow Notes（弱约束）？
- Flow 本地数据模型是否需要包含 `notes`（与上面选项强相关）。

## 已确认决策（更新）
- Notes：混合模式 + 可降级（默认直连 Memos；失败/不可用时降级走 Flow Notes/Attachments）。

## 已生成的后续执行计划
- `.sisyphus/plans/plan-md-fixups-hybrid-fallback.md`（用于把上述决策写回 `PLAN.md` 并补齐验收）

## 范围边界（暂定）
- INCLUDE: Windows 桌面端实现与发布链路（托盘/快捷键/关闭语义/存储迁移/CI 发布 exe/应用内更新检测）。
- EXCLUDE: 移动端、macOS/Linux 桌面端适配（除非你明确要求）。
