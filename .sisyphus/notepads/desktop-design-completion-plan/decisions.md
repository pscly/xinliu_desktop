# Decisions

（追加式记录：把关键决策、默认值与理由记在这里，避免后续反复摇摆。）

## 2026-02-25 任务1：决策收敛（默认前提 + 护栏）

- 主规格归口：唯一主规格为根目录 `PLAN.md`，章节草稿最终合并回 `PLAN.md`。
- 平台护栏：仅承诺 Windows 桌面端，不承诺 macOS/Linux。
- 窗口护栏：默认无边框（frameless）+ 可拖拽区域；关闭默认最小化到托盘。
- 托盘与快捷键：托盘常驻，退出只能托盘菜单；全局快捷键呼出 Quick Capture，快捷键可配置。
- IA 护栏：Collections 文件夹树为主入口，支持无限层级与 folder/note_ref 混排。
- 后端模式：混合后端，Flow 负责 Auth + Todo/Collections/Sync，Notes 直连 Memos。
- Flow 冲突：按 `client_updated_at_ms` LWW，冲突用 `server_snapshot`/`server` 快照可恢复，默认保守模式，可选强制覆盖。
- Memos 冲突：生成“冲突副本”保留本地文本，并将原记录回滚为服务端版本。
- 引用 backfill：Collections note_ref 双轨引用，做结构引用回填 `ref_local_uuid -> ref_id`。
- Todo 复发：完整 RRULE 支持，客户端展开，服务端只提供 occurrences。
