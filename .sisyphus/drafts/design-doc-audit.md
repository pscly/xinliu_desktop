# Draft: xinliu_desktop 设计文档补全

## 需求（已确认）
- 用户目标：先不开发，先完整检查并补全现有设计文档的缺口。
- 输出形式：把“需要补全的设计内容/缺口清单/决策点/补全方案”整理成一份 plan 文档（用户称为 plan.md）。

## 现有材料（仓库内证据）
- 设计导出文档：`DESIGN.md`（Android 端现状导出 + Electron 承接建议，最后更新 2026-02-24）
- 现有规划草案：`PLAN.md`（托盘/快捷键/三栏布局/拖拽/技术栈建议等，偏前端与交互）
- 后端接口与对接资料：`apidocs/*`（含 OpenAPI 与对接总指南）
  - `apidocs/to_app_plan.md`
  - `apidocs/api.zh-CN.md`
  - `apidocs/collections.zh-CN.md`
  - `apidocs/openapi-v1.json`

## 初步观察（待在 plan 中展开）
- `DESIGN.md` 更像“从 Android 迁移的可追溯导出 + 分层/同步/不变量清单”，对桌面端 UX/信息架构/Windows 特性细节不够具体。
- `PLAN.md` 更像“桌面端 UI/交互与前端技术选型草案”，但缺少：
  - 明确的产品范围边界与 Definition of Done
  - 关键用户旅程（桌面端多窗口/托盘/快捷键）与异常流
  - 与 `apidocs` 的接口/同步协议逐项对齐（尤其是 Notes/Sync/Collections/Todo 的权威源选择）
  - Windows-only 的系统能力细节（通知、更新、Credential Vault、无边框窗口行为等）

## 研究发现（接口与协议，plan 中要显式对齐）
- Flow Backend v1 已提供 Notes/Attachments/Shares/Todo/Sync：
  - Notes：`POST/GET/PATCH/DELETE /api/v1/notes*`，并发控制关键字段 `client_updated_at_ms`；服务端支持 soft delete + restore；支持 revisions。
  - Search：`GET /api/v1/notes?q=...` 在 SQLite 后端下使用 FTS5；带 `q` 时即使 `include_deleted=true` 也会排除 deleted notes（索引层面限制）。
  - Sync：`GET /api/v1/sync/pull` + `POST /api/v1/sync/push`，返回 applied/rejected（HTTP 200）；冲突在 rejected.reason=conflict 或 409（部分接口）。
  - Todo：list/item/occurrence API + sync 资源；`tzid` 为空回退 `DEFAULT_TZID`。
  - Collections：既有在线管理接口，也支持作为 sync 资源 `collection_item`（pull changes.key 固定为 `collection_items`）。

## 开放问题（需要用户确认/或在 plan 中标注“待定”）
- 后端对接策略：桌面端是否“只调用 Flow Backend（/api/v1）”作为唯一后端？还是保留“直连 Memos + Flow 仅做登录/同步”的旧模式？
- 数据权威源：Notes/Collections/Todo 的权威源分别是谁（Flow vs Memos vs 本地）？离线写入后的同步与冲突 UI 预期是什么？
- Windows-only 约束：是否明确不考虑 macOS/Linux（含 keytar/safeStorage 的兜底策略是否可忽略）？
- 更新策略：是否要求 GitHub Releases + 自动更新（NSIS/squirrel）+ 版本通道（stable/beta）？是否需要代码签名？

## 范围边界
- INCLUDE：补全“产品/交互/架构/数据/同步/安全/运维发布”层面的设计说明与验收标准。
- EXCLUDE：任何实际代码落地、脚手架生成、构建发布执行。
