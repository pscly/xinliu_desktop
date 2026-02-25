# Learnings

（追加式记录：每次任务完成后只追加，不覆盖。）

## [2026-02-25 02:54] 目录骨架与术语表写作约定

- 根目录 `PLAN.md` 的规格正文采用“一级/二级目录”，每个二级章节都明确：约束条款（MUST/SHOULD/MUST NOT）、输入输出、以及与合同字段的对齐点。
- 混合后端口径固定：Flow Backend 负责 Auth、Todo、Collections、Sync 合同，Notes 直连 Memos，且必须兼容 `memoName` 形如 `memos/123` 的标识符。
- 同步口径固定：写入必须带 `client_updated_at_ms`，冲突优先使用 `server_snapshot` 或 `rejected[].server` 做恢复与提示，软删除统一用 tombstone 的 `deleted_at`。
- 文档缺口表达禁止使用 `TBD/待定/未决`，统一写成“已知缺口 + 需要补齐的证据来源类型”（例如 apidocs 合同、本仓库实现文件、官方文档）。

## [2026-02-25 06:20] Windows 系统集成硬约束与权威链接（托盘/快捷键/无边框/通知/更新）

- 托盘（Tray）
  - MUST: `Tray` 必须在 main 进程持有强引用，避免被 GC 回收（官方教程示例明确说明）。
  - Windows 图标建议 `.ico`（Electron `Tray` API 的 Windows 平台说明）。
  - 参考：https://www.electronjs.org/docs/latest/tutorial/tray
  - 参考：https://www.electronjs.org/docs/latest/api/tray
- 全局快捷键（globalShortcut）
  - MUST: `globalShortcut.register(...)` 可能“静默失败”，这是 OS 设计（Electron 文档明确说明）；必须以返回值 `false` 判定失败并给 UX 退路。
  - MUST: `will-quit` 时注销快捷键（`unregisterAll`）。
  - 参考：https://www.electronjs.org/docs/latest/api/global-shortcut
- 无边框窗口与拖拽区域（app-region）
  - MUST: `app-region: drag` 区域会忽略指针事件；交互控件必须 `no-drag`。
  - SHOULD: 拖拽区域禁用文本选择；避免在拖拽区域挂自定义右键菜单（可能触发系统菜单）。
  - 参考：https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
  - 参考：https://www.electronjs.org/docs/latest/tutorial/custom-window-styles
- Windows 通知（Toast/Notification）与 AUMID
  - MUST: Windows 通知需要 Start Menu shortcut + AppUserModelID（AUMID）等前置；开发态可能需显式 `app.setAppUserModelId()`（Electron Notifications 教程）。
  - MUST: electron-builder 必须显式设置 `appId`，其在 Windows（NSIS）会作为 AUMID 使用；Squirrel.Windows 不支持（electron-builder 配置文档）。
  - 参考：https://www.electronjs.org/docs/latest/tutorial/notifications
  - 参考：https://www.electronjs.org/docs/latest/api/notification
  - 参考：https://www.electron.build/configuration
- 自动更新（electron-updater）
  - MUST: Windows 自动更新依赖 NSIS 目标；Squirrel.Windows 不支持 electron-builder 的简化自动更新方案。
  - 参考：https://www.electron.build/auto-update
- 产品约束
  - MUST: Win11 托盘存在“溢出区/隐藏图标”，不能承诺托盘永远可见；关键操作必须有应用内兜底入口。
