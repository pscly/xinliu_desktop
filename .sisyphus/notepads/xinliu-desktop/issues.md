# issues

- （持续追加）

- [2026-02-25] 413 自动拆分导致的“触发拆分的那次 413 request_id”目前不会在 outbox 行上保留（最终成功后 request_id 会被成功请求覆盖）。需要在后续诊断/日志体系中单独记录一次事件以便排障。

- [2026-02-26] Task 27 诊断状态当前是“可用但占位”：Notes Provider 与最近 request_id 需要后续在真实 Notes Router/网络调用处接线调用 `diagnostics.recordNotesRoutedResult(...)` 才会变为真实数据；在此之前设置页会显示 `-`，但 IPC/UI/测试契约已固定。

- [2026-02-27] Task 54 增加 `window.xinliu.fileAccess` 后，renderer 单测中手工 stub 的 `window.xinliu = {...}` 需要同步补齐 `fileAccess` 字段，否则 `npm run typecheck` 会因类型缺失失败（见 `src/renderer/App.test.tsx`）。

- [2026-02-28] Task 39 当前仅覆盖 Memos 直连 `UpdateMemo` 的 HTTP 409 冲突；尚未覆盖：
  - CreateMemo 的 409（若出现）
  - “rejected conflict/并发检测”之类的非 409 形态（需要协议证据后再实现，避免虚构行为）
  - 冲突中心/对比 UI（Task 41 承接；本任务仅提供 `data-testid="conflict-compare"` 入口契约）
