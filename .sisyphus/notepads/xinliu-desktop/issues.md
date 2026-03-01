# issues

- （持续追加）

- [2026-02-25] 413 自动拆分导致的“触发拆分的那次 413 request_id”目前不会在 outbox 行上保留（最终成功后 request_id 会被成功请求覆盖）。需要在后续诊断/日志体系中单独记录一次事件以便排障。

- [2026-02-26] Task 27 诊断状态当前是“可用但占位”：Notes Provider 与最近 request_id 需要后续在真实 Notes Router/网络调用处接线调用 `diagnostics.recordNotesRoutedResult(...)` 才会变为真实数据；在此之前设置页会显示 `-`，但 IPC/UI/测试契约已固定。

- [2026-02-27] Task 54 增加 `window.xinliu.fileAccess` 后，renderer 单测中手工 stub 的 `window.xinliu = {...}` 需要同步补齐 `fileAccess` 字段，否则 `npm run typecheck` 会因类型缺失失败（见 `src/renderer/App.test.tsx`）。

- [2026-02-28] Task 39 当前仅覆盖 Memos 直连 `UpdateMemo` 的 HTTP 409 冲突；尚未覆盖：
  - CreateMemo 的 409（若出现）
  - “rejected conflict/并发检测”之类的非 409 形态（需要协议证据后再实现，避免虚构行为）
  - 冲突中心/对比 UI（Task 41 承接；本任务仅提供 `data-testid="conflict-compare"` 入口契约）

- [2026-02-28] Task 40 前置审计：当前 git 工作区非干净状态，存在会干扰 Backfill Worker 开发与验收的改动混杂。
  - 未暂存改动覆盖 CI/E2E（`.github/workflows/ci.yml`、`playwright.config.ts`、`e2e/updater.spec.ts`）、IPC 合同（`src/shared/ipc.ts`、`src/preload/index.ts`、`src/renderer/vite-env.d.ts`、`src/main/ipc.ts`）与 main 启动接线（`src/main/main.ts`）。
  - 另有未跟踪实现与测试（`src/main/notes/notesDraftRepo.ts`、`src/main/notes/notesDraftRepo.test.ts`、`e2e/task-33-*.spec.ts`）及临时目录 `.tmp/`，若直接继续 Task 40，测试失败归因与回归范围会被放大。
  - 建议先做隔离：将当前改动整理到独立分支或临时提交；Task 40 在干净分支上实施，避免 `src/main/main.ts` 与 `src/main/ipc.ts` 的并行改动产生冲突。

- [2026-03-01] Task 44 inbox 语义仍有业务歧义：当前实现为“memos 中 `sync_status IN (LOCAL_ONLY, DIRTY, SYNCING, FAILED)` + flow_notes 非删除项”，属于最小可解释实现。后续若产品定义 inbox 需按“未归档/未读/待处理”语义收敛，需要补充明确规则并调整 SQL 过滤条件。

- [2026-03-01] Task 44 修正后，inbox 语义仍属于“计划未定义，先按最小可解释实现”：
  - 目前合同未明确 inbox 的业务语义，暂按 `sync_status` 过滤（`LOCAL_ONLY/DIRTY/SYNCING/FAILED`）并排除软删 `memos.deleted_at_ms IS NOT NULL`。
  - 若后续产品将 inbox 定义为“待处理箱/收件箱”而非“待同步集合”，需要单独调整 SQL 与 UI 文案，避免语义误导。
