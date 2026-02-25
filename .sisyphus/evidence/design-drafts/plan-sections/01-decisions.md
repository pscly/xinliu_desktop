# 决策日志（Decision Log）- 默认值草稿

目标：把桌面端后续章节会依赖的关键决策一次性收敛成“默认前提”，并写清可配置项与护栏，避免范围膨胀。

| 决策点 | 默认值（含触发条件） | 可配置项（设置可改） | 非目标/不做项（护栏） | 依据/理由（文档事实） | 影响范围（后续章节） |
|---|---|---|---|---|---|
| 规格归口（主规格落点） | 以仓库根目录 `PLAN.md` 为唯一主规格，`.sisyphus/drafts/plan-sections/*` 只作为章节草稿来源，最终合并回 `PLAN.md`（触发：章节稳定后由编排者合并） | 无 | 不在多个文件同时维护“最终口径”；不接受不同章节互相打架 | 约束来自用户已确认的交付方式（本任务上下文）；避免规格分裂导致实现漂移 | 计划结构、文档组织、验收口径 |
| 平台范围（Windows-only） | 只承诺 Windows 桌面端（触发扩展：用户明确要求 macOS/Linux 并追加计划与验收） | 无 | 不承诺 macOS/Linux 打包、系统集成与兼容性问题；不做跨平台 UI 适配承诺 | 项目约束明确写入仓库 `AGENTS.md`（Windows 桌面端优先） | 打包发布、系统集成、快捷键/托盘/通知、文件路径策略 |
| 窗口形态（去标题栏） | 主窗口默认无边框（frameless），并提供可拖拽区域（`-webkit-app-region: drag`）与可点击区域（`no-drag`）；快速记录窗口为 `transparent: true, frame: false, alwaysOnTop: true`（触发：启用全局快捷键快速记录） | 是否启用无边框（仅开发调试可开关）；拖拽区域高度 | 不使用系统原生丑标题栏作为默认；不把拖拽能力交给第三方库黑盒 | `PLAN.md`（无边框、QuickCapture 窗口参数、拖拽区域 CSS 指南） | 主进程窗口管理、UI 框架布局、可用性与交互规范 |
| 关闭行为与系统托盘 | 点击窗口关闭按钮默认“最小化到托盘”而非退出；退出只能在托盘右键菜单执行（触发：用户显式点击托盘菜单“退出”） | 关闭行为：最小化到托盘/真正退出；是否首次提示 | 不做“关闭即退出”的默认；不隐藏托盘入口 | `PLAN.md`（Windows 托盘常驻，关闭退出到托盘，托盘右键才退出） | 主进程生命周期、托盘菜单、后台任务持续性、用户预期 |
| 全局快捷键（Quick Capture 呼出） | 默认提供全局快捷键呼出极简输入框，默认键位 `Alt+Space`（触发：用户在设置开启或首次引导启用） | 快捷键自定义；是否启用；冲突时提示与回退 | 不强行占用系统保留快捷键；不在快捷键冲突时静默失败 | `PLAN.md`（全局快捷键、globalShortcut、Alt+Space 示例、Quick Capture 说明） | 主进程 globalShortcut、设置页、快速输入 UX、稳定性 |
| 布局基线（Triptych） | 桌面端采用三栏式布局（Triptych），利用宽屏完成“左侧导航 + 中间收件箱/时间线 + 右侧工作区”分工（触发：窗口宽度小于阈值时降级为双栏或抽屉） | 栏宽、是否显示中栏、紧凑模式 | 不把桌面端做成“手机放大版”；不采用单栏页面堆叠为主 | `PLAN.md`（三栏式布局与大屏多宝阁网格展示建议） | IA、路由、组件拆分、性能策略（虚拟列表/网格） |
| 信息架构（IA=Folder 树为主） | 结构层以“文件夹树（Collections）”为主入口，支持无限层级与 folder/note_ref 混排（触发：Collections 数据准备完成后渲染树） | 树排序策略（按 sort_order/名称）；是否显示 color | 不以标签或搜索作为主导航；不做协作 ACL/共享文件夹 | `apidocs/collections.zh-CN.md`（定位：只存结构与引用；支持 parent_id、混排、排序、LWW、tombstone） | Collections 数据模型、树构建、拖拽移动、防环校验、同步 |
| 后端模式（混合：Flow + 直连 Memos） | 登录态与结构类能力使用 Flow Backend：Auth + Todo + Collections + Sync；Notes（笔记正文）默认直连 Memos（触发：登录成功拿到 token 与 server_url 后建立两套 client） | 是否启用 Flow Notes（可作为未来开关，默认关闭）；Flow Base URL；Memos Base URL（来自 server_url 可覆盖） | 不承诺一期把 Notes 全量迁移到 Flow Backend；不做多云多源聚合 | `DESIGN.md`（Flow Backend 换 token + server_url，拿到后直连 Memos；Todo/Collections 走 Flow Sync）；`apidocs/to_app_plan.md`（阶段 A 先打通登录态，server_url 可作为默认 Memos 地址） | 网络层分层、鉴权/凭据存储、同步编排、错误处理 |
| Base URL 与标准化 | Flow Backend 默认 base 为 `https://xl.pscly.cc`，统一标准化规则：去尾 `/`，固定拼 `/api/v1/...`（触发：用户修改 base 时立即校验并提示） | Flow Base URL；是否强制 HTTPS（生产强制） | 不允许生产环境使用 http；不允许拼接双斜杠导致路径漂移 | `apidocs/to_app_plan.md`（推荐单一公网 origin 示例 `https://xl.pscly.cc`，建议标准化去尾 `/`） | 配置管理、网络请求封装、错误诊断 |
| 请求头约定（排障与设备识别） | 所有请求默认带 `X-Request-Id`；可选带设备头（稳定 device id + 可读 device name）（触发：启用诊断/设备追踪时强制开启设备头） | 是否上报设备头；device name 自定义 | 不把 token/密码写入日志；不依赖 request_id 作为业务逻辑输入 | `apidocs/to_app_plan.md`、`apidocs/api.zh-CN.md`（Request ID 与设备信息约定，排障必备） | 网络中间件、日志与诊断、管理后台设备活跃度 |
| 本地存储目录与迁移 | 用户可在设置选择数据存储目录，变更目录时自动迁移数据，迁移完成后提示重启（触发：用户确认变更目录） | 数据目录路径；是否迁移附件缓存 | 不允许静默更改目录导致数据丢失；不支持多目录并存作为正式形态 | `PLAN.md`（可选数据存储目录，变更后自动迁移并提醒重启） | 文件系统布局、SQLite 路径、附件缓存、备份策略 |
| 本地数据库与进程边界 | SQLite 作为离线权威源，运行在主进程；renderer 不直接访问数据库，统一走 IPC 用例级 API（触发：任何持久化读写） | WAL 开关、数据库文件位置、导出/备份入口 | 不用 IndexedDB 做权威存储；不把“DB 级 API”暴露给 renderer | `PLAN.md`（本地数据库 better-sqlite3 建议）；`DESIGN.md`（SQLite 推荐为权威源，IPC 仅暴露用例级 API，contextIsolation/contextBridge） | 架构（Main/Renderer/Preload）、存储层、性能与安全 |
| Electron 安全基线 | 强制 `contextIsolation: true`，通过 `contextBridge` 暴露窄接口；文件导出路径必须来自系统对话框授权（触发：涉及文件系统写入/导出） | 开发模式下调试开关（仅本地） | 不在 renderer 开启 Node 能力；不暴露任意 shell/文件系统原语 | `DESIGN.md`（Electron 安全基线与 IPC 设计建议） | 安全、IPC 设计、审计与后续扩展 |
| 凭据存储（token/账号密码） | Windows 下默认使用 OS 凭据库保存长期凭据；不把 token/密码明文落盘（触发：用户勾选“记住登录态”） | 是否保存账号密码；是否仅保存 token | 不写入日志；不把 token 放进可同步配置文件 | `DESIGN.md`（推荐 OS 密钥库优先，避免明文凭据） | 安全、登录流程、故障恢复与迁移 |
| Flow 同步机制（Outbox + Cursor） | Todo/Collections/（可选 settings）采用离线优先：本地写入生成 outbox，周期 push；周期 pull 用 cursor 增量拉取并应用 tombstone（触发：网络恢复、定时器、用户手动同步） | 同步间隔、是否仅 Wi-Fi、手动“立即同步/全量重同步”入口 | 不做“全量覆盖式同步”；不做无 outbox 的在线直写作为主通道 | `apidocs/api.zh-CN.md`（/sync/pull + /sync/push 协议、cursor、tombstone）；`apidocs/collections.zh-CN.md`（collection_item 纳入 sync） | 同步编排、数据模型（outbox/sync_state）、系统集成（网络监听） |
| Flow 冲突策略（两档） | 默认“保守模式”：遇到 409 或 sync rejected(conflict) 时，以 `server_snapshot`/`server` 作为权威更新本地，并把本地 mutation 标记为冲突待处理；可选“客户端胜出”：对允许覆盖的资源（如 Collections）以更大的 `client_updated_at_ms` 重新 upsert（触发：用户在冲突弹窗选择“强制覆盖”） | 冲突处理模式：保守/强制覆盖；是否自动重试 | 不静默丢弃本地更改；不在无法合并时自动覆盖服务端 | `apidocs/to_app_plan.md`、`apidocs/api.zh-CN.md`（409 + `details.server_snapshot`，合并后用更大时间戳重试）；`apidocs/collections.zh-CN.md`（冲突快照与客户端胜出建议） | 同步、数据一致性、冲突 UI、审计与可追溯性 |
| Memos 冲突策略（冲突副本保留） | 当检测到同一条 memo 多端并发导致冲突时，创建“冲突副本”保留本地改动，并将原记录回滚为服务端版本；副本内容前置可读冲突头信息（触发：服务端更新时间晚于本地更新时间或更新被拒绝） | 是否自动上传冲突副本；冲突头模板 | 不覆盖丢失用户文本；不要求用户手工复制粘贴找回 | `DESIGN.md`（冲突判定与“冲突副本 + 回滚原记录”的策略）；`PLAN.md`（LWW 并建议被覆盖内容做开头备份的思路） | Notes 同步/编辑、历史与修订、用户信任 |
| Collections 引用双轨 + backfill | `note_ref` 支持双轨引用，优先保存 `ref_local_uuid`，同步后拿到服务端 id 后执行 backfill：`ref_local_uuid -> ref_id`，并保持引用稳定（触发：memo 同步拿到 serverId，或 pull 回来发现缺 ref_id） | backfill 频率（实时/批处理）；引用类型 `ref_type`（flow_note/memos_memo） | 不把笔记正文写入 Collections；不做跨用户引用 | `DESIGN.md`（refLocalUuid/refId 双轨与 backfillMemoRefId 回填）；`apidocs/collections.zh-CN.md`（note_ref 的 ref_type/ref_id 结构） | 数据模型、同步一致性、拖拽归档与引用解析 |
| Todo 复发任务（完整 RRULE） | Todo 默认支持完整 RRULE 能力，字段包含 `rrule/dtstart_local/tzid`；客户端负责展开 RRULE，服务端只存 occurrences 用于例外/完成/取消（触发：is_recurring=true） | 默认 tzid；是否展示高级 RRULE 编辑 | 不做“只支持每日/每周”的半残版本；不让服务端隐式展开导致多端不一致 | `DESIGN.md`（rrule/dtstartLocal/tzid 与 occurrence 去重）；`apidocs/plan.md`（服务端不展开 RRULE，客户端展开）；`apidocs/api.zh-CN.md`（RRULE occurrences 接口与字段） | Todo 数据模型、提醒调度、同步与冲突处理 |
| 发布与自动更新 | GitHub Actions 负责构建与发布 Windows exe；客户端内置自动检测更新并引导安装（触发：启动后检查，或设置页手动检查） | 是否自动下载；更新通道（stable） | 不依赖手工发群文件作为唯一更新方式 | `PLAN.md`（GitHub 自动 CI/CD 发布 exe，软件自动检测更新需实现） | 发布流水线、更新模块、版本策略与回滚 |

## 决策摘要（默认前提）

- 规格只认根目录 `PLAN.md`，本文件是“可合并回主规格”的草稿来源。
- 只做 Windows 桌面端，不承诺 macOS/Linux，扩展需要新计划与验收。
- 默认无边框窗口 + 可拖拽区域，关闭按钮默认最小化到托盘。
- 托盘常驻 + 全局快捷键 Quick Capture，快捷键用户可自定义，冲突要提示。
- IA 以 Collections 文件夹树为主入口，三栏式布局做桌面化效率。
- 后端采用混合模式：Flow 负责登录态与 Todo/Collections/Sync，Notes 直连 Memos。
- Flow 侧统一按 `client_updated_at_ms` 做 LWW，同步必须 outbox + cursor，冲突以 `server_snapshot` 可恢复。
- Notes/Memos 冲突默认生成冲突副本保留文本，并回滚原记录为服务端版本。
- Collections note_ref 使用双轨引用并做 backfill（`ref_local_uuid -> ref_id`），避免引用断裂。
- Todo 支持完整 RRULE，客户端展开，服务端只存 occurrences。
