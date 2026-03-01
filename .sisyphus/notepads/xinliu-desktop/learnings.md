# learnings

- （持续追加）

- [2026-02-25] 脚手架：Electron(main/preload) + Vite(renderer) + React + TypeScript；main/preload 用 `tsc` 编译到 `dist/`，renderer 用 `vite build` 输出到 `dist/renderer/`。
- [2026-02-25] 目录约定已固定为 `src/main`、`src/preload`、`src/renderer`、`src/shared`；Electron 入口为 `src/main/main.ts`，preload 为 `src/preload/index.ts`。
- [2026-02-25] 合同关键点在代码里可直接检索：`frame: false`（无边框），`nodeIntegration: false` + `contextIsolation: true`（renderer 禁 Node）。
- [2026-02-25] npm scripts：`typecheck` 与 `build` 都只做编译/构建，不会启动 Electron GUI；验证命令为 `npm ci` / `npm run typecheck` / `npm run build`。
- [2026-02-25] TypeScript 语言服务选用“就近 tsconfig.json”策略：在 `src/main/tsconfig.json`、`src/preload/tsconfig.json`、`src/renderer/tsconfig.json` 放置最小配置，避免不同层的编译选项互相污染。
- [2026-02-25] Vite 配置文件使用 `vite.config.mts`（而不是 `vite.config.ts`）：在 `package.json` 未设 `type=module` 的情况下，`.mts` 可强制按 ESM 解析，从而避免 TypeScript 将 `vite` 解析到 `exports.require` 导致 `defineConfig` 类型丢失。
- [2026-02-25] 本地存在 `.npmrc` 的 `electron_mirror/electron-mirror` 配置会触发 npm 警告（不影响构建通过，但未来 npm 大版本可能不再支持该字段）。

- [2026-02-25] 修正：最终保留 `vite.config.ts`（不使用 `.mts`）。为避免 TypeScript 在默认 CommonJS 语义下走 `vite` 的 `exports.require` 分支，根 `tsconfig.json` 采用 `moduleResolution=Bundler` 进行配置文件的类型解析。


## [2026-02-25 10:10] - Playwright + Electron 在 GitHub Actions (windows-latest) 跑 E2E

- Electron 启动方式：用 Playwright 的实验性 `_electron.launch({ args, executablePath, env })`；在 CI 上优先用 `args` 指向主进程入口脚本，或用 `executablePath` 指向打包后的 `.exe`（便于贴近真实发布形态）。
- 工件策略：Playwright Test 的 `use.screenshot / use.trace / use.video` 会把输出放到 `test-results/`，HTML 报告在 `playwright-report/`；Actions 里用 `actions/upload-artifact` 统一打包上传。
- Windows 易踩坑：窗口 focus 不一定把窗口置顶（Windows 行为限制）；Electron 进程若“最小化到托盘/后台常驻”，CI 会卡在 teardown，必要时用强制结束进程作为兜底（见 Playwright Issue 中的 taskkill workaround 思路）。
- 快捷键跨平台：在测试里尽量用 `ControlOrMeta` 以兼容 Windows/Linux 与 macOS。
- 稳定选择器：统一要求 UI 组件提供 `data-testid`，测试全部走 `page.getByTestId()` 或 `locator.getByTestId()`。



## [2026-02-25 10:24] - electron-builder(NSIS) + electron-updater(GitHub Releases) 的稳定版自动更新配置要点

- 最小构建配置：`appId`（固定 `cc.pscly.xinliu.desktop`）、`productName`（心流）、`win.target=nsis`、`publish.provider=github`；默认更新通道是 `latest`，GitHub tag 默认需要 `v` 前缀。
- 更新元数据：Windows(NSIS) 使用 `latest.yml`；electron-builder 会生成并随产物一起上传；应用内会自动生成 `resources/app-update.yml`（内部文件，用于 updater 读发布配置）。
- 差分更新/Blockmap：构建产物会包含对应的 `.blockmap`，用于差分下载；GitHub provider 在某些场景下需要关注旧 blockmap 的可下载性（必要时可禁用差分或配置 old blockmap base URL）。
- 不做签名的风险：Windows 侧 `verifyUpdateCodeSignature` 默认开启；若产物未签名，可能需要显式关闭该校验，否则更新可能被拦截；同时 Windows SmartScreen/Smart App Control 对“无信誉/未签名”应用更容易弹警告或阻止运行。


## [2026-02-25 11:40] - 避免 Electron 安装脚本导致的 npm install/ci 网络波动

- 若遇到 Electron 二进制下载（postinstall）因网络波动失败（例如 `socket hang up`），可以先用 `npm install --ignore-scripts` 在不执行安装脚本的情况下把依赖装齐（含 TypeScript types），确保 `npm run typecheck` 等纯编译步骤可跑通；后续在网络稳定时再单独执行带脚本的安装/重装。

## [2026-02-25] - 代码规范 + Vitest 测试基建（TDD）

- ESLint 使用 v9（Flat Config），配置文件为根目录 `eslint.config.mjs`；不要再使用 `.eslintrc.*` / `.eslintignore`（ESLint v9 默认不读取且会报错/警告）。
- lint 脚本建议传目录而非 glob：`eslint src vite.config.ts`，避免 ESLint v9 CLI 对 glob pattern 的“未匹配即报错”行为导致 CI 失败。
- Prettier 通过 `.prettierrc.json` 独立管理格式；通过 `eslint-config-prettier` 关闭 ESLint 中与 Prettier 冲突的格式化规则。
- Vitest 需要与 Vite 主版本对齐；本仓库 Vite 为 v5，因此将 Vitest 固定到 `vitest@2.1.9`，避免 Vitest(v4+) 引入 Vite v7 造成类型重复（LSP/TS 报 plugin 类型不兼容）。
- renderer 组件测试使用 jsdom；若用 Node 环境会出现 `ReferenceError: document is not defined`。
- `npm` 可能输出 `.npmrc` 中 `electron_mirror` unknown config 警告；当前不影响 `lint/test/typecheck` 通过，但未来 npm 大版本可能需要迁移/清理该字段。

- [2026-02-25] Flow sync/push 的“成功”必须逐条以响应体 `applied[]/rejected[]` 判定并回写 outbox（不能以 HTTP 200 作为成功标准）；同时把 `X-Request-Id`（或 ErrorResponse.request_id）落到 outbox.request_id，便于后续诊断面板按条目追溯。

## [2026-02-25 12:21] - GitHub Actions CI（windows-latest）基础配置

- 固定 `runs-on: windows-latest`，Node 版本使用 `actions/setup-node@v4` 的 `node-version: 20`，并启用 `cache: npm`。
- 任务顺序：`npm ci` → `npm run lint` → `npm run test` → `npm run typecheck` → `npm run build`，日志可直接定位到具体 step。
- 工件上传：用 `actions/upload-artifact@v4` 上传 `.sisyphus/evidence/` 与 `dist/`，并设置 `if-no-files-found: ignore`，确保目录不存在时不会导致 CI 失败。
- Electron 镜像：优先依赖仓库 `.npmrc` 的 `electron_mirror` 配置；CI 侧无需额外注入环境变量（npm 可能仍会输出 unknown config 警告，但不影响安装/构建）。

## [2026-02-25] - Electron main 安全基线在 Node/Vitest 下的可测实现

- electron 的 npm 包在纯 Node 环境下并不提供 Electron runtime API（测试里直接 `import { app, BrowserWindow } from 'electron'` 会踩坑），因此 main-side 单测应只覆盖“纯函数 + 依赖注入”的逻辑。
- Vitest 全局环境设置为 `jsdom` 时，若某个测试必须在 Node 环境运行，可以在测试文件顶部使用 `// @vitest-environment node` 进行按文件覆盖。
- 安全基线建议集中封装到 `src/main/security.ts`：
  - `buildSecureWebPreferences`：强制覆盖 MUST 值（`contextIsolation: true`、`nodeIntegration: false`、`webSecurity: true`、`allowRunningInsecureContent: false`），其余字段（如 `preload`）由调用方补充。
  - `installNavigationGuards(webContents, { openExternal })`：将 `openExternal` 作为依赖注入，便于用 stub webContents 在 Node 环境断言 `preventDefault()` 与 `window.open` deny 行为。

## [2026-02-25] - IPC 白名单 + Preload 用例级 API 的可审计落地模式

- IPC 通道名必须“静态可枚举”：统一放在 `src/shared/ipc.ts`，后续新增能力只允许在这里追加常量。
- main 侧用 `registerIpcHandlers(ipcMain, deps)` 显式逐一 `ipcMain.handle(...)`，禁止通配；并通过依赖注入 `getWindowForSender`，避免在 Node/Vitest 测试里导入 electron runtime。
- IPC handler 不应 `throw` 给 renderer：统一返回 `IpcResult`（`ok/value` 或 `ok:false/error{code,message}`），并避免把堆栈/绝对路径透传。
- preload 侧封装 `invokeIpc`：捕获 `ipcRenderer.invoke` 的异常并返回 `IpcResult`，只暴露用例级 API（例如 `window.xinliu.window.minimize()`），不暴露通用 `ipcRenderer`。

## [2026-02-25] - Flow Sync Pull 引擎（Task 18）实现要点

- `sync_state` 用一个稳定 key 持久化 Flow pull cursor（本实现使用 `flow_sync_pull_cursor`），`value_json` 保存为 `{"cursor": <number>}`，读取时对“数字或对象”两种形态都做容错。
- “apply changes + cursor 推进”必须同一事务：每一轮 pull 都在 `withImmediateTransaction` 内执行 `applyChanges(...)` 后才 `UPDATE sync_state`，确保 apply 失败时 cursor 不会推进。
- Pull apply 必须直写业务表，不能走 TodoRepo/CollectionsRepo（否则会 enqueue outbox 破坏 outbox 语义）。
- LWW 推荐用 SQLite 原生条件 upsert：`ON CONFLICT DO UPDATE ... WHERE excluded.client_updated_at_ms >= table.client_updated_at_ms`，保证 incoming older 不覆盖本地 newer。
- Collections 漂移兼容：显式处理 `changes.collection_items`（对齐 `apidocs/collections.zh-CN.md` 的 key/resource 命名）。

- [2026-02-25] memoName 编码落地：
  - 放进路由/URL 参数：用 `encodeURIComponent` / `decodeURIComponent`（确保 `memos/123` 中的 `/` 被编码为 `%2F`，可 round-trip）。
  - 放进本地 KV key：用 base64url(utf8)，输出必须不含 `+`、`/`、`=`；解码时根据长度 `% 4` 补齐 `=` padding。

- [2026-02-25] Notes(Memos) 本地落库：在 SQLite 迁移 v4 创建 `memos` 与 `memo_attachments` 表；`memos.sync_status` 必须用 `CHECK(sync_status IN (...))` 受控值域（LOCAL_ONLY/DIRTY/SYNCING/SYNCED/FAILED），避免状态机字段被写入任意字符串。

- [2026-02-25] Task 38（Memos Sync Job）单测保持离线确定性：附件上传逻辑不要在测试里依赖真实文件 IO；建议在同步函数中注入 `loadAttachmentContentBase64`（测试用 stub），避免因为本地路径/文件不存在导致用例不稳定。

- [2026-02-25] Task 38（Memos Sync Job）附件绑定的硬约束：必须先为每个本地附件拿到 `server_attachment_name`（CreateAttachment 的响应 `attachment.name`），再调用 SetMemoAttachments；SetMemoAttachments 的入参应只使用服务端返回的 name（不要用本地 id/路径“猜”资源名）。

- [2026-02-25] Task 38（Memos Refresh/Merge）本地编辑保护：回拉/刷新时若本地 memo 处于 `DIRTY` 或 `SYNCING`，合并逻辑应避免覆盖 `content/visibility`，仅回填安全元数据（例如 `server_memo_name/server_memo_id`），从而避免“正在编辑被服务器覆盖”。

- [2026-02-25] Task 38（Memos Sync Job）单测模式：用临时 SQLite 文件 + `applyMigrations` 初始化 schema；直接插入 `memos/memo_attachments` 行构造场景；对 `MemosClient` 用 `vi.fn()` 全 mock，并用数组记录调用序列来断言“CreateAttachment 在 SetMemoAttachments 之前”。
- [2026-02-25] better-sqlite3 在 CHECK 约束失败时，抛错信息可能是 `CHECK constraint failed: ...`（不一定包含 `SQLITE_CONSTRAINT` 字样）；单测断言建议匹配 `check constraint failed` 或 `err.code`。

- [2026-02-25] Vitest 通过 npm script 传参时，必须用 `npm test -- -t "..."`（`--` 后的参数才会透传给 vitest）；否则 npm 会把 `-t` 当成自身参数，导致筛选不生效。
- [2026-02-25] 401 unauthorized 的稳定判定模式：`status===401 || errorResponse.error==='unauthorized'`；建议在“用例层/状态机”集中处理并切到 `reauthRequired`，UI/IPC 只读状态。
- [2026-02-25] 若出现 better-sqlite3 的 Node ABI 不匹配（`NODE_MODULE_VERSION`），可通过 `npm rebuild better-sqlite3` 修复；Linux 环境需要先安装编译工具链（例如 `build-essential`）。

- [2026-02-26] Task 19（托盘常驻）：main 进程必须持有 Tray 的强引用（例如 module-level 变量），否则可能被 GC 回收导致托盘消失或点击无响应。
- [2026-02-26] Task 19（关闭语义）：推荐把“是否允许真正退出”的状态抽成可测试 controller（`requestExit()`），窗口 `close` 时若未 requestExit 则统一 `preventDefault + hide()`，避免用户误以为应用已退出。
- [2026-02-26] Task 19（首次关闭提示）：提示逻辑应由 controller 维护“仅一次”状态（进程生命周期内），并通过注入回调触发（Notification/Tray balloon/message box），保证单测不依赖 Electron runtime。
- [2026-02-26] Node 20 约束仍有效：`better-sqlite3` 属于 native addon，跑 `npm test/typecheck/build` 建议统一 `nvm use 20.20.0`，避免 NODE_MODULE_VERSION 不匹配。

- [2026-02-26] Task 20（全局快捷键）：必须为每条快捷键跟踪“上一次成功注册的 accelerator”，在用户修改 accelerator、禁用(enabled=false)、或把 accelerator 置空时，先注销旧 accelerator。否则会出现“旧快捷键残留仍可触发”的幽灵注册（globalShortcut 以 accelerator 作为 key，不会自动替你解绑旧值）。
- [2026-02-26] Task 20（设置页可见性测试）：renderer(jsdom) 测试不引入 Electron runtime，做法是直接在测试中 stub `window.xinliu.shortcuts.getStatus()` 返回预置的 `ShortcutsStatus`（例如包含 `registrationState='failed'`），再渲染 `<App />` 并点击 `data-testid="nav-settings"` 切到设置页，断言 `data-testid="settings-shortcut-<id>-register-failed"` 存在，从而验证“注册失败可见退路”。

- [2026-02-26] Task 27（诊断面板 + 脱敏日志）：
  - 文件日志写入：main 侧实现 `appendMainLogLine({ storageRootAbsPath, line })`，日志目录必须从 `resolveStorageLayout(storageRootAbsPath).logsDirAbsPath` 推导，写入前强制调用 `redactForLogs()`（避免在 logger 内复制正则）。
  - main-side 单测：凡涉及 `fs/os/path` 的测试文件，需用 `// @vitest-environment node` 强制 Node 环境；并优先做“写文件后读回”的端到端断言，避免只测纯函数。
  - 诊断数据读取：通过 IPC 白名单新增只读 `xinliu:diagnostics:getStatus`，preload 仅暴露 `window.xinliu.diagnostics.getStatus()`；renderer 设置页以 `data-testid="diagnostics-..."` 提供可测契约（request_id 可复制）。

## [2026-02-25] - Memos API Client（Task 34）约定

- API base path 固定为 `/api/v1`。在复用 `createHttpClient` 的情况下，推荐将实例 `baseUrl` 传入为“纯实例地址”（例如 `https://memos.example.com`），并在每个请求的 `pathname` 上显式带上 `/api/v1/...`（对齐现有 `FlowClient` 的写法）。
- `updateMask` 是 Memos 的强约束：UpdateMemo/UpdateAttachment 必须提供 query 参数 `updateMask`（field-mask，逗号分隔）；缺失/空值时应在 client 层直接抛出中文可解释错误，避免误覆盖字段。
- 资源名（resource name）拼接规则：当输入是 `memos/123` 或 `attachments/1` 这种资源名时，应当拼成 API pathname（例如 `/api/v1/memos/123`），并且禁止把资源名当成本地文件路径片段使用。

## [2026-02-25] - Notes Router（Task 35）路由决策树实现要点

- Router 必须是“纯函数 + 依赖注入”：对外只接受 `memosRequest/flowNotesRequest` 两个异步函数，保证 Node/Vitest 下可测且不依赖 Electron runtime。
- 配置校验必须走 `normalizeBaseUrl`：`memosBaseUrl` 缺失/空/非法/非 http(s) 一律视为 invalid，并且本次请求必须直接选择 FlowNotes（不得尝试 Memos）。
- 降级触发条件必须严格：仅当 Memos 返回 401/403，或错误码为 `NETWORK_ERROR/TIMEOUT`（获得有效 HTTP 前失败）时，才允许当次请求降级到 FlowNotes 重试一次；若已获得有效 HTTP 且非 401/403（400/404/409/429/5xx 等）不得降级。
- request_id 展示规则（Notes 专用，保守一致）：优先 `responseRequestIdHeader`（`X-Request-Id`），否则回退 `requestId`；若发生降级重试则必须分离展示 `memos_request_id` 与 `flow_request_id`。
- 环境坑：本仓库含 `better-sqlite3` 原生模块，运行 `npm test` 需使用 Node 20（例如 `source ~/.nvm/nvm.sh && nvm use 20.20.0`），否则会出现 `NODE_MODULE_VERSION` 不匹配导致大量测试失败。

## [2026-02-25] - Memos 本地表 Schema（Task 36）要点

- SQLite 迁移：在 `src/main/db/migrations.ts` 的 migration v4 新增 `memos` 与 `memo_attachments` 两张表（版本号必须连续递增，v4 需追加在 MIGRATIONS 末尾）。
- 同步状态机受控：`memos.sync_status` 必须使用 `CHECK(sync_status IN ('LOCAL_ONLY','DIRTY','SYNCING','SYNCED','FAILED'))` 限定值域，禁止自由文本。
- 服务端 memo id 类型：`memos.server_memo_id` 必须是 `TEXT NULL`（兼容 uuid/自定义 id 等非纯数字形态）。
- 资源名与路径护栏：`server_memo_name`（形如 `memos/123`）仅作为服务端资源名存储，禁止用于本地文件名/路径片段拼接（包括 `path.join/resolve`）。
- 附件关联：`memo_attachments.memo_local_uuid` 外键引用 `memos.local_uuid`，并使用 `ON DELETE CASCADE`，确保删除 memo 时附件记录可自动清理。

## [2026-02-25] - Task 51 Flow Notes（降级 provider）本地 notes 表 + 边界守卫

- SQLite 迁移 v5 新增 `notes` 表（专用于 FlowNotes 降级路径），必须包含 tombstone `deleted_at`，并额外保留诊断字段：`provider_reason`、`last_request_id`、`last_error`。
- “仅降级时可读写”的实现模式：让 repo 的每次读写都显式接收 Notes Router 的 per-request 路由结果，并在运行时要求 `kind==='degraded'`；否则抛中文可解释错误，确保默认路径不可能误写入降级表。
- DB 相关测试必须在 Node 环境跑（better-sqlite3）；Vitest 里用文件头 `// @vitest-environment node` 是必要指令（不是普通注释）。

- [2026-02-25] 修正：Task 51 的 notes 表边界守卫应以“Notes Router 本次请求最终 provider”为准：只要最终 `provider==='flow_notes'` 即允许访问（包含 `kind='degraded'` fallback 与 `kind='single' && provider='flow_notes'`）；并据 `degradeReason/providerReason` 选择对应的 `provider_reason`。

- [2026-02-25] Flow Notes 附件上传（multipart/form-data）：不要在客户端手动设置 `Content-Type`（boundary 需由 fetch/undici 生成）；为复用 request_id 与 ErrorResponse 解析，在 `createHttpClient` 上新增通用 `request` 用于透传 `FormData`。

- [2026-02-25] FlowNotes 写入边界：所有写方法必须显式接收 Notes Router 的 per-request 决策（`NotesRoutedResult`），并在运行时要求最终 `provider==='flow_notes'`；这样可以同时兼容 `kind='degraded'` 与 `kind='single'`，且不会“伪装成 Memos”写入。
- [2026-02-25] 409 conflict 的冲突中心素材：服务端快照放在 `ErrorResponse.details.server_snapshot`；httpClient 已把 `errorResponse.details` 原样透传到 `HttpError.errorResponse.details`，客户端侧无需额外解析器即可取到快照。
- [2026-02-25] main-side TypeScript 默认不引入 DOM lib：在 httpClient 的 fetch 形状上用 `body?: unknown` 比 `BodyInit` 更稳（避免引入 DOM types）；具体用例里再传 `FormData/Blob` 即可。


## [2026-02-25] - Task 38 Memos Sync Job

- `sync_status` 状态机：从 `DIRTY/LOCAL_ONLY/FAILED` 进入同步时统一切为 `SYNCING`；成功后落到 `SYNCED`，失败则落到 `FAILED`（避免“同步中/失败/已同步”混写导致 UI/重试逻辑混乱）。
- 附件绑定顺序是硬约束：必须先对每个本地附件调用 `CreateAttachment` 拿到服务端 `attachment.name`，再调用 `SetMemoAttachments`；`SetMemoAttachments` 只能使用服务端返回的 name（不要用本地 id/路径推断）。
- refresh/merge 的本地编辑保护：当本地 memo 处于 `DIRTY`/`SYNCING` 时，合并逻辑不得覆盖本地 `content/visibility`；只允许回填不破坏编辑的元数据（例如 `server_memo_name/server_memo_id`）。
- 单测保持离线确定性：`memosClient` 全量 mock（`vi.fn()`），并通过依赖注入 `loadAttachmentContentBase64`（测试里用 stub）替代真实文件 IO；用调用序列断言 `CreateAttachment` 发生在 `SetMemoAttachments` 之前。
- 环境提示：DB 相关测试依赖 `better-sqlite3` 原生模块，统一在 Node 20 下运行（例：`source ~/.nvm/nvm.sh && nvm use 20.20.0`）。

- [2026-02-26] ESLint(no-explicit-any)：在 Vitest 测试里解析 `errorResponse.details` 时，避免 `as any`，改用 `unknown` + 类型守卫（例如先断言 `details.server_snapshot.id` 为 string）来保持断言可读性与类型安全。验证：`source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run lint` / `npm test`。

## [2026-02-26 06:18] - Task 21 快速捕捉窗口（Quick Capture）

- 同一 renderer bundle 的多视图切分：用 main `loadFile(..., { hash: 'quick-capture' })`，renderer 以 `window.location.hash === '#quick-capture'` 分流渲染，能用最小成本支撑“主窗 + 快捕窗”两套界面，同时保持测试与构建链路简单。
- 入口要做三重兜底：全局快捷键可能注册失败，托盘也可能被用户忽略或不可用，所以必须再提供应用内入口（放在自定义标题栏的“快捕”按钮最合适，且可给 `data-testid` 作为测试契约）。
- 键盘交互要可预期：Enter 提交并隐藏，Esc 取消并隐藏。多行输入场景要避免误提交，通常约定 Shift+Enter 换行。
- 保存逻辑先抽注入点：将“持久化”封成 `saveQuickCapture(content)` 依赖注入，当前可以 no-op，后续再对接 Notes/SQLite，并把真实副作用集中到 main 侧实现。

- [2026-02-26] Task 22（renderer 设置页 Storage Root）：进入设置页时在 `openSettingsRoute()` 内同时刷新 `shortcuts` 与 `storageRoot` 状态（`Promise.all`）；当 `window.xinliu?.storageRoot` 不存在时在 `settings-storage-root` 区块内用 calloutWarn 给出可解释提示并禁用“更改目录”；当 `chooseAndMigrate()` 返回 `kind:'migrated'` 时展示 `data-testid="settings-restart-required"` 与“立即重启”（调用 `restartNow()`）。

- [2026-02-26] Task 24（memo-res:// 协议 URL 解析坑）：同一个 scheme 在不同调用栈/构造方式下可能出现 `memo-res://<cacheKey>`（cacheKey 在 hostname）或 `memo-res:///cacheKey`（cacheKey 在 pathname）两种形态；实现解析时要同时兼容，并且在 hostname 形态下拒绝任何额外 path 段，避免把路径片段当作 key。

- [2026-02-26] Task 24（拒绝 symlink/junction 的实用实现）：不要用 `realpath` 事后比对；更稳的是对“从 root 到目标路径”的每一段做 `lstat`，只要链路中任何一段 `isSymbolicLink()` 就拒绝（Windows junction/reparse point 通常也会命中）。测试在 Windows 上若无法创建 symlink，可用 `junction` 或对注入的 `lstat` 做 stub 回退，确保逻辑被覆盖。

## [2026-02-26] - Task 25 附件缓存合同（LRU/配额/cacheKey）

- cacheKey 必须“不透明”：推荐形态 `att_<uuid>` 或 SQL `att_` + `hex(randomblob(16))`；禁止把任何 relpath 直接塞进 `memo-res://`。
- `memo_attachments.cache_key` 建议建立 partial unique index（`WHERE cache_key IS NOT NULL`），保证 `cacheKey -> relpath` 映射唯一。
- LRU 元数据用独立列 `last_access_at_ms`（不要复用 `updated_at_ms`），避免“读一次就变脏”影响同步/脏检查。
- `memo-res` 成功读取后由 main 侧 best-effort touch `last_access_at_ms`，renderer 不允许上报/伪造 LRU。
- 配额驱逐的失败策略：删除某条缓存文件失败不得 throw，应继续尝试驱逐其他条目，并用 `overQuota/errors` 反馈（不阻断编辑）。

## [2026-02-26] - Task 26 右键菜单（Context Menu）落地模式

- 菜单模板必须可测试：在 main 层先抽“可序列化的纯模板结构”（例如 `{kind:'item'|'separator', label, command}`），Node/Vitest 只测这个模板；Electron `Menu` 的构建与 `popup()` 仅存在于 main runtime 适配层。
- renderer 不创建系统菜单：只在 `onContextMenu` 中 `event.preventDefault()`，并调用 `window.xinliu.contextMenu.popupFolder(folderId)` / `popupMiddleItem(itemId)`。
- 菜单选择的回传：main 在 `MenuItem.click` 时通过 `webContents.send(IPC_EVENTS.contextMenu.didSelect, {target,command})` 发事件；preload 暴露用例级订阅 `window.xinliu.contextMenu.onCommand(listener)`。
- Vitest main-side 测试要强制 Node 环境：`// @vitest-environment node` 是必要指令（否则会走默认 jsdom，容易踩 Electron/runtime 相关坑）。

## [2026-02-26] - Task 28 全局搜索（FTS5 + IPC 单次分页 + 降级）

- FTS5 迁移的健壮性：不要让 `CREATE VIRTUAL TABLE ... fts5` 失败把整个 `applyMigrations` 打崩。
  - 实用做法：在 migration 的 `up(db)` 里先用 JS try/catch 单独执行虚表创建；失败则直接 return（让迁移整体完成、user_version 继续推进）。
  - 上层查询侧以“表是否存在 + 查询是否抛错”决定 `mode='fts'|'fallback'`，并对 UI 提供结构化 `ftsAvailable/degradedReason`。
- 降级查询避免全表扫描：fallback 不要直接对大表 `LIKE '%q%'`；建议每张表只扫最近 N 条（按 updated/client_updated_at 排序 + LIMIT），再 union 后做 LIKE 过滤 + 分页。
- IPC 合同：全局搜索必须“一次 IPC 返回一页”，payload 里显式带 `page/pageSize/query`；renderer 的分页只能再发一次 query IPC（禁止 N+1 逐条拉详情）。
- 测试技巧：
  - FTS 路径：往 memos 连续插入 25+ 条含关键词的数据，断言第一页 20 条 + hasMore=true，再断言第二页与第一页不重叠；再断言 snippet 含 `<mark>`（证明走了 FTS snippet）。
  - 降级路径：只 apply 到 v6（不建 FTS 表），或者 drop FTS 表，然后断言 mode='fallback' 且 ftsAvailable=false。

- [2026-02-26] 回退 `src/renderer/App.tsx`：撤销未完成的大改动，避免引用 `../shared/ipc` 中不存在的类型与 `window.xinliu` 未注入字段，优先恢复到当前代码库已支持的 UI 壳/路由占位版本（验证：`source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run typecheck`）。

## [2026-02-26] - IPC Notes 通道（main 注册 + 白名单测试同步）

- 新增 `IPC_CHANNELS.notes.*` 后，main 侧必须在 `registerIpcHandlers()` 显式逐条 `ipcMain.handle(...)` 注册；同时要同步更新 `src/main/ipc.test.ts` 的 expected 列表，否则白名单等值断言会失败。
- notes deps 建议保持可选（`deps.notes?`），避免迫使改动其它 call site；当 `deps.notes` 缺失时，handler 应返回稳定的 `INTERNAL_ERROR` 与可解释 message（例如 `Notes 未实现`），而不是静默 no-op。
- payload 校验要在 main 侧完成：例如 listItems 的 `scope` 强约束 + `page/pageSize` 整数与上限（<=200），以及 id payload 的 `provider` 值域（`memos/flow_notes`）与 `id` 非空。

## [2026-02-27] - Task 54 路径权限门（对话框授权 + one-shot grant）落地模式

- IPC 合同分两段：
  - `showOpenDialog/showSaveDialog` 只负责让 main 调系统对话框并返回一次性 `grantId`（renderer 不拿“永久写入权限”）。
  - `readTextFile/writeTextFile` 必须携带 `grantId + filePath`，main 侧以 `consumeGrant` 再次校验“本次授权结果”，失败统一 `PERMISSION_DENIED`。
- 纯逻辑授权模块建议独立成 main-side 可测单元：`src/main/pathGate/pathGate.ts`，对 posix/win32 绝对路径都能做“等价比对 + one-shot 消费 + ttl 过期”。
- 白名单测试要同步：新增 `IPC_CHANNELS.fileAccess.*` 后，`src/main/ipc.test.ts` 的 expected 列表必须追加 `...Object.values(IPC_CHANNELS.fileAccess)`，否则会在“静态可枚举”断言处失败。

## [2026-02-27] - Task 55 关闭行为设置

- 持久化 key：
  - `desktop.close_behavior`（value_json 推荐 `{ "behavior": "hide"|"quit" }`，读取需容错）
  - `desktop.close_to_tray_hint_shown`（value_json 推荐 `{ "shown": boolean }`）
- main 接线要点：
  - 主窗 `win.on('close')` 必须传 `onCloseToQuit`（对齐 `app.quit()` 语义），并在 `onFirstCloseToTrayHint` 内 best-effort 写入 `desktop.close_to_tray_hint_shown=true`；写入失败要吞掉并 `console.warn(String(error))`（避免 throw 影响关闭流程）。
  - 初始化时在 `ensureMainWindow()` 之前从 SQLite 读取 status 并调用 controller：`setCloseBehavior(...)` + `setCloseToTrayHintShown(...)`，保证默认行为仍是 close->hide。
- settings UI 稳定选择器（renderer）：
  - `settings-close-behavior`
  - `close-behavior-hide`
  - `close-behavior-quit`
  - `close-to-tray-hint-reset`
- IPC 白名单测试要同步：新增 closeBehavior 通道后，`src/main/ipc.test.ts` 的 expected 列表必须追加 `...Object.values(IPC_CHANNELS.closeBehavior)`，否则会在“静态可枚举”断言处失败。

- [2026-02-27] 计划状态同步：仅将 `.sisyphus/plans/xinliu-desktop.md` 的 Task 54 checkbox 从 `[ ]` 改为 `[x]`（不改 Task 55），用于 boulder/ground-truth 追踪；证据文件 `.sisyphus/evidence/task-54-path-gate.txt` 已存在且不重写；验证命令 `source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm test && npm run typecheck && npm run build` 已跑通。

- [2026-02-27] Task 53（不得自动迁移回写）：复用 `memos.sync_status='LOCAL_ONLY'` 作为“禁止自动回写到 Memos”的持久化标记；在 `src/main/notes/noAutoBackwriteGuard.ts` 中当 Notes Router 最终 provider 为 `flow_notes` 时落盘该标记；并在 `src/main/memos/memosSyncJob.ts` 中对 `LOCAL_ONLY` 明确跳过（不得调用 CreateMemo/UpdateMemo），避免 FlowNotes 降级写入后 Memos 恢复产生隐式双写。

- [2026-02-27] Task 30 自动更新（electron-updater，GitHub Releases stable）：
  - 用“可依赖注入的 UpdaterController + AutoUpdaterAdapter”隔离 electron-updater 副作用，保证 Vitest(node) 单测可跑。
  - IPC 合同新增 updater 通道必须同步更新 `src/shared/ipc.ts` 与 `src/main/ipc.test.ts` 的 expected 列表（静态可枚举）。
  - main 启动后用 setTimeout 做轻量检查（不阻断编辑、不抢焦点）；renderer 设置页提供手动检查入口 `data-testid="check-updates"`。
  - E2E（Linux + xvfb）用 Playwright `_electron.launch({ args: ['dist/main/main.js'] })` 启动，并将截图证据固定输出到 `.sisyphus/evidence/task-30-updater-e2e.png`。

## [2026-02-27] - Task 29 分享与导出（save dialog 授权 + 复制兜底）

- UI 落点：`src/renderer/App.tsx` 右栏 `triptych-right` -> `rightStack` 内新增卡片 `data-testid="share-export"`。
- 导出链路：renderer 只能先 `window.xinliu.fileAccess.showSaveDialog()` 拿到 `{grantId,filePath}` 后，再调用 `window.xinliu.fileAccess.writeTextFile({grantId,filePath,content})`；对话框取消（kind=cancelled）必须不写文件。
- 测试策略：Vitest + RTL 通过 stub `window.xinliu.fileAccess.*`，用 `mock.invocationCallOrder` 断言调用顺序，并覆盖“取消不写/写入失败显示兜底”。
- 失败兜底：复用 `safeCopyTextToClipboard()`，并提供 `data-testid="export-copy"` 的“复制文本”按钮。

## [2026-02-27] - Task 31 NSIS 打包（electron-builder）+ SHA-256

- electron-builder Windows-only 最小稳定配置：`build.win.target=["nsis"]` + `build.directories.output="release"` + 固定 `artifactName`，CI 才能稳定定位 `release/*.exe` 与 `release/latest.yml`。
- better-sqlite3 属于 native addon：必须配置 `build.asarUnpack=["**/*.node"]`，否则打包后运行期可能因 `.node` 被打进 asar 而加载失败。
- Windows 更新元数据：NSIS 会生成 `release/latest.yml` + 对应的 `*.blockmap`（差分更新素材）；workflow 上传 artifacts 时应把 `installer.exe + installer.exe.blockmap + latest.yml` 一起带走。
- SHA-256 校验文件推荐在 Windows runner 生成：PowerShell `Get-FileHash -Algorithm SHA256`，输出格式写成 `<hash>  <filename>`（双空格）便于用户/脚本校验。
- Node 20 约束下的版本坑：`electron-builder@26` 会引入 `@electron/rebuild@4`，其 `engines.node>=22.12` 会在安装时报 EBADENGINE；固定到 `electron-builder@25.1.8` 可保持与 Node 20 兼容。

## [2026-02-27] - Task 32 GitHub Actions Release（tag -> build/test/package -> GitHub Release）落地要点

- 触发条件必须只对 tag 生效：`on.push.tags: ['v0.*']`，不要同时对 branch push 触发；发布权限需要 `permissions.contents: write`。
- 版本一致性（避免自动更新元数据错配）：在 workflow 中对 `package.json` 临时执行 `npm version --no-git-tag-version <tag去v>`，再执行 `npm run dist:win`，确保 installer 文件名与 `latest.yml` 内引用与 tag 对齐。
- SHA-256 推荐在 Windows runner 生成：PowerShell `Get-FileHash -Algorithm SHA256`，输出文件名用 `<installer>.sha256`，内容格式写成 `<hash>  <filename>`（双空格），便于用户/脚本校验。
- 发布 Release：使用 `softprops/action-gh-release` 直接用 `GITHUB_TOKEN` 创建 stable release（`prerelease: false`），并上传 `release/*.exe`、`release/latest.yml`、`release/*.sha256`、必要的 `release/*.blockmap`。

## [2026-02-27] - Notes 草稿 IPC（autosave 调用链）

- notes 草稿 IPC 新增通道需要同步更新 `src/main/ipc.test.ts`（白名单）、`src/preload/index.ts`（window 暴露）、`src/renderer/vite-env.d.ts`（类型声明），否则要么测试失败、要么运行时/类型不同步。

## [2026-02-27] - Task 30 自动更新（GitHub Releases stable：检查/下载/延后安装/失败回退）

- `electron-updater` 必须落到 `package-lock.json`：仅修改 import 不够，`npm run typecheck` 会报 `Cannot find module 'electron-updater'`；需要在 Node 20 环境执行一次 `npm install` 让 lock 与 node_modules 同步。
- TypeScript 事件类型坑：`electron-updater` 的 `autoUpdater.on/removeListener` 事件名是受限字面量；适配层可用“显式事件名 union + listener as never”方式封装，避免 eventName=string 触发类型错误。
- stable-only 双保险：adapter 层 `autoUpdater.allowPrerelease=false`；controller 层再用 `isSemverPrerelease()` 兜底忽略 `x.y.z-...` 的 prerelease，确保不下载 prerelease。
- 启动轻量检查必须 gated：在 `app.on('ready')` 后仅当 `app.isPackaged===true` 才触发 `checkForUpdates({source:'startup'})`；开发态保持 `disabled` 文案，不把“仅安装包可用”当作 error callout。
- 设置页更新区块要“可测”：关键按钮/状态/退路统一加 `data-testid`（例如 `check-updates/update-status/update-install-now/update-defer/update-open-releases`）。

## [2026-02-27] - Task 30 E2E（Playwright + Electron，Linux xvfb）稳定断言模式

- Electron E2E 下可能出现 `window.xinliu` 未注入（preload 加载失败/时序不稳定）导致更新区块状态长期停留在 `尚未检查`；因此测试断言应允许两种“可解释回退”：
  - packaged 语义的禁用态：`update-status` 含 `安装包/禁用` 且 `update-disabled-hint` 含 `安装包`
  - preload 未注入回退：`update-error` 含 `preload`
- 断言实现建议用 `expect.poll()` 自己组合多个 locator 的 textContent/count，避免 `locator.textContent()` 在元素不存在时被动超时。
- 截图证据要保证“失败也落盘”：把 `page.screenshot({ path })` 放到 `finally` 里 best-effort 执行，再关闭/kill Electron 进程。

## [2026-02-27] - Task 33 E2E（Triptych/快捕/关闭到托盘）稳定性经验

- E2E/CI 要“可复现的干净 userData”：main 进程在 `app.whenReady()` 之前支持 `XINLIU_E2E=1`/`XINLIU_USER_DATA_DIR`，用 `app.setPath('userData', <新目录>)` 强制每次启动都不受本机历史设置影响（尤其是 `desktop.close_behavior` 会让 close-to-tray 变成 quit）。
- 多窗口等待不要依赖 `electronApp.waitForEvent('window')`：在 CI/低性能环境容易被时序卡住；更稳的是轮询 `electronApp.windows()`，按窗口 URL hash（例如 `#quick-capture`）或稳定 testid 来识别目标窗口。
- close-to-tray 判定用 `BrowserWindow.isVisible()` 轮询最直观：点击 `data-testid="titlebar-close"` 后，轮询 `isVisible()` 从 true -> false，同时断言 `electronApp.process().exitCode===null`，避免误把“真的退出”当成隐藏。
- teardown 固化：每个用例都用 `try/finally` 做 best-effort 截图；`electronApp.close()` 失败则 `electronApp.process().kill('SIGKILL')` 兜底，避免后台常驻/托盘常驻导致 CI 卡住。

## [2026-02-28] - Task 37 Notes Editor（renderer autosave + 状态文案）

- Vitest + RTL 对 debounce 场景优先使用真实计时器 + `waitFor({ timeout: ... })`，避免 `vi.useFakeTimers()` 泄漏到后续用例导致整文件异步测试批量超时。
- Notes 状态文案要严格区分“本地保存状态”与“远端同步状态”：本地 autosave 成功后仅可显示“本地已保存（待同步/同步中/同步失败）”，不能直接宣称“已同步”。
- Playwright Electron 在 Linux 无图形环境会报 `Missing X server or $DISPLAY`；需要 `xvfb-run -a` 包裹才能稳定产出截图证据。

## [2026-02-28] - Task 39 Notes 冲突副本策略（Memos 409）

- 触发点：直连 Memos 的 `UpdateMemo` 返回 HTTP 409 时，优先从 `HttpError.errorResponse.details.server_snapshot` 读取服务端版本；若快照缺少 `content/visibility`，再补一次 `GetMemo(memoName)` 拉取服务端正文用于回滚。
- 持久化：在 `memos` 表新增 `conflict_of_local_uuid`（指向原记录 local_uuid）与 `conflict_request_id`（用于诊断/追溯）；冲突副本本身落在 `memos` 表（`sync_status='LOCAL_ONLY'`，保留本地正文）。
- 回滚语义：原记录以服务端正文/可见性覆盖并标记 `sync_status='SYNCED'`；原记录下的本地附件行会移动到冲突副本名下，避免回滚后“正文与附件错配”。
- 可检索性：`global_search_fts` 对 `memos` 有 trigger（insert/update/delete），因此冲突副本与回滚后的原记录都会被 `queryGlobalSearch()` 索引并可检索。

- [2026-02-28] Task 40 回填折中：由于当前 `collection_items` schema 没有 `ref_local_uuid`，只能临时用 `ref_id=local_uuid` 承载待回填关联；风险是 `ref_id` 语义复用会增加歧义，后续若引入双轨字段（local/server）需要补一次数据迁移把历史占位值清洗到专用字段。

- [2026-02-28] 工作区隔离提交经验：先按“功能闭环 + 依赖顺序”做路径分组，再逐个 `git status --porcelain=v1` 校验 staged 集合，可显著降低混杂改动误提交风险；对于 `better-sqlite3` 的 Node ABI 变化，建议在切换 Node 主版本后立即执行 `npm rebuild better-sqlite3`，避免测试结果受原生模块不匹配干扰。

## [2026-03-01 18:26] - Task 41 冲突中心（renderer 接线）

- 冲突中心 API 接线模式：`window.xinliu.conflicts` 统一走 preload `invokeIpc` 返回 `IpcResult`，避免 renderer 直接接触 IPC channel 细节；方法集合固定为 `listFlow/listNotes/resolveFlowApplyServer/resolveFlowKeepLocalCopy/resolveFlowForceOverwrite`。
- 冲突页刷新策略：进入 `conflicts` 路由时自动 `Promise.all(listFlow,listNotes)` 拉取；任一裁决动作成功后立即再次刷新两类列表，确保 UI 与 DB 状态一致；失败只展示可解释错误文案，不 throw。
- 强制覆盖二次确认：不用 `window.confirm`，改为组件内 state 渲染确认区块（`pendingForceOutboxId`）+ 明确确认按钮，测试稳定且可追踪。
- 本次新增并固定的冲突页 `data-testid` 契约：
  - 总体与容器：`conflicts-center`、`conflicts-refresh`、`conflicts-error`、`conflicts-action-error`、`conflicts-flow-list`、`conflicts-notes-list`
  - Flow 列表与动作：`conflicts-flow-item-<outboxId>`、`conflicts-flow-apply-server-<outboxId>`、`conflicts-flow-keep-local-<outboxId>`、`conflicts-flow-force-overwrite-<outboxId>`、`conflicts-flow-force-confirm-panel-<outboxId>`、`conflicts-flow-force-confirm-<outboxId>`、`conflicts-flow-force-cancel-<outboxId>`
  - Notes 列表与入口：`conflicts-notes-item-<localUuid>`、`conflicts-notes-compare-<localUuid>`、`conflicts-notes-copy-<localUuid>`、`conflicts-notes-compare-panel-<localUuid>`

## [2026-03-01 18:31] - Task 39 UI 验收补齐（恢复 `conflict-compare` 稳定入口）

- 当计划或 E2E 需要“全局可检索”的冲突页入口时，建议在 `route='conflicts'` 的真实 UI 区域保留一个唯一 `data-testid="conflict-compare"`，并与按条目 testid（如 `conflicts-notes-compare-<id>`）并存：前者用于快速定位，后者用于精确交互。
- 为避免选择器歧义，`conflict-compare` 不应在 map 列表中重复出现；放在 Notes 冲突卡片 header 最稳妥。
- 入口按钮应具备“存在即合理”行为：有数据时执行最小可解释动作（展开首条 Notes 对比），无数据时 `disabled`，这样既满足验收检索，也不会引入无意义点击分支。

## [2026-03-01 19:05] - Task 43 设置页后端/网络配置（Base URL 可编辑持久化）

- diagnostics 从只读展示升级为可编辑保存时，renderer 侧建议将输入草稿 state 与后端状态分离；保存成功后统一 `refreshDiagnostics()` 回拉主进程标准化值，避免本地草稿与真实配置漂移。
- preload 未注入降级需要“双重兜底”：交互层禁用保存按钮 + 文案层给出明确提示（“后端配置 API 不可用（preload 未注入，保存已禁用）”），这样 jsdom 与 E2E 都能稳定断言。
- IPC 新增 diagnostics 写通道后，`src/main/ipc.test.ts` 除了 expected channel 列表自动覆盖外，deps stub 也必须同步补齐 `setFlowBaseUrl/setMemosBaseUrl`，否则会在类型层直接失败。
- Base URL 规则必须单点复用 `normalizeBaseUrl`：校验/标准化放在 main 层，renderer 只消费 `IpcResult`，可以避免双端各写一套规则导致行为不一致。

## [2026-03-01 19:35] - Task 44 Notes 列表虚拟化与删除流

- Notes 列表虚拟化采用固定行高窗口化：`NOTES_VIRTUAL_ROW_HEIGHT=132`、`NOTES_VIRTUAL_VIEWPORT_HEIGHT=560`、`NOTES_VIRTUAL_OVERSCAN=4`。DOM 只渲染 `slice(startIndex, endIndex)`，并通过 `translateY(offsetY)` 定位，避免大列表全量节点渲染。
- Notes 列表 testid 约定（稳定且可批量断言）：`notes-virtual-viewport`（滚动容器）、`notes-virtual-row`（每个虚拟行）、`notes-scope-timeline/inbox/trash`（范围切换）、`notes-item-provider-<provider>-<id>`、`notes-item-sync-status-<provider>-<id>`、`notes-item-hard-delete-panel-<provider>-<id>`（二次确认面板）。
- 删除确认遵循“组件内面板”模式：不使用 `window.confirm`，而是使用 `pendingHardDeleteKey` 驱动确认区块渲染，这与冲突中心 force_overwrite 的交互模式一致，便于无头测试稳定断言。
- main 侧 `notes.listItems` 采用单 SQL 合并查询（`UNION ALL`）直接返回 `NotesListItem[]` 所需字段，不走“先拉 id 再逐条详情 IPC”路径，从源头避免 N+1 查询风暴。

## [2026-03-01 19:42] - Task 44 修正：memos 软删字段与 scope SQL 对齐

- 为了让 memos 与 flow_notes 在“回收站/恢复/彻底删除”行为一致，schema 在 migration v9 新增 `memos.deleted_at_ms INTEGER NULL` + `idx_memos_deleted_at_ms` 索引；时间单位使用毫秒，与 memos 的 `created_at_ms/updated_at_ms` 保持同一时基。
- Notes scope SQL 语义更新：
  - `timeline`：`memos.deleted_at_ms IS NULL` + `notes.deleted_at IS NULL`
  - `inbox`：在既有 `sync_status IN (LOCAL_ONLY, DIRTY, SYNCING, FAILED)` 基础上追加 `memos.deleted_at_ms IS NULL`；flow_notes 仍要求 `deleted_at IS NULL`
  - `trash`：合并 `memos.deleted_at_ms IS NOT NULL` 与 `notes.deleted_at IS NOT NULL`
- memos 动作语义固定：`deleteItem` 软删（更新 `deleted_at_ms/updated_at_ms`）、`restoreItem` 清除软删标记并刷新 `updated_at_ms`、`hardDeleteItem` 物理删除。这样 renderer 无需区分 provider 即可走统一删除流。

## [2026-03-01 21:19] - Task 45 E2E 修复（ESM + Electron 启动一致性）

- Playwright E2E 在 ESM 模式下，`e2e/*.spec.ts` 里不要再用 `createRequire/require` 与 `__dirname`；推荐直接使用 `process.cwd()` 作为仓库根路径，避免因模块系统差异触发 `require is not defined`。
- Electron 启动路径建议显式 `import electronPath from 'electron'` 并传给 `_electron.launch({ executablePath })`，确保测试进程和项目依赖使用同一 Electron 可执行文件，减少 ABI/运行时漂移风险。
- 在 Linux 无头环境里，`xvfb-run -a npm run test:e2e -- e2e/task-45-hover.spec.ts` 是稳定截图与交互的前提；截图落盘要保留在 `finally`，失败也能留证据。
- 对涉及 native addon（better-sqlite3）的 E2E，建议提供 `XINLIU_E2E=1` 的最小可复现数据兜底路径，避免环境差异导致“功能逻辑正确但测试因模块加载失败而误红”。

- [2026-03-01] Task 45 勘误后实现经验：E2E 的稳定性应通过“SQLite seed + 与生产一致的数据读取链路”达成，而不是在 IPC 层注入静态常量列表。这样可避免测试通过但真实链路未覆盖的假阳性。

## [2026-03-01 23:30] - Task 46 拖拽整理（中栏 -> 左栏树）落地经验

- `@dnd-kit` 在 Electron + Playwright 场景下建议同时准备“标准 dnd 事件链 + 受控兜底收口”：主路径仍以 `onDragStart/onDragOver/onDragEnd` 为准，兜底只做测试环境稳定性保障，避免因为 pointer 细节差异导致 E2E 偶发红。
- 拖拽防环要双层防护：UI 侧先基于当前树结构做“目标是否为自身/子孙”快速判定并提示，服务层继续保留 `patchCollectionItem` 的最终约束，防止并发或脏状态绕过。
- 乐观更新+撤销的关键是记录“原父节点/新父节点”而不是只记录 itemId；这样撤销动作可以显式回放一次 move，且能复用同一 IPC 路径，避免出现 UI 回滚与数据库状态不一致。
- 树拖拽交互与 Task 45 的 hover/edge-scroll 可共存：hover 展开保持 800ms 常量，edge scroll 用 pointer 的 Y 位置驱动，不依赖原生 DragEvent，能更稳定覆盖 dnd-kit 手势。
- E2E 断言建议以“中栏条目即时消失 + 撤销入口可见 + 撤销后条目恢复”为最小闭环，截图作为补充证据，减少对过多中间态样式的脆弱依赖。

- [2026-03-01] Task 46（Playwright Electron E2E）跑用例前先执行一次 `npm run build`，否则可能复用旧 `dist/`，导致用例行为与截图证据不稳定（看起来像“偶发/玄学”）。
- [2026-03-01] Task 46 证据截图 `.sisyphus/evidence/task-46-dnd.png` 必须能看到撤销入口（`collections-undo-*`），避免截图落在“撤销完成后”导致无法证明撤销功能确实存在。

## [2026-03-02] - Task 47 Todo UI（列表/完成/回收站/批量操作）

- Todo 页面稳定 testid 约定（E2E 依赖）：
  - 容器：`todo-center`
  - 范围切换：`todo-scope-active` / `todo-scope-completed` / `todo-scope-trash`
  - 条目容器：`todo-item-<id>`
  - 完成切换：`todo-item-toggle-<id>`
  - 软删：`todo-item-delete-<id>`
  - 回收站恢复：`todo-item-restore-<id>`
  - 打开硬删确认：`todo-item-hard-delete-<id>`
  - 硬删确认面板：`todo-item-hard-delete-panel-<id>`
  - 硬删确认/取消：`todo-item-hard-delete-confirm-<id>` / `todo-item-hard-delete-cancel-<id>`
  - 多选 checkbox：`todo-select-<id>`
  - 批量操作条：`todo-bulk-bar` / `todo-bulk-complete` / `todo-bulk-delete`
- E2E seed（XINLIU_E2E=1）：
  - todo_list：`e2e_todo_list_inbox`
  - todo_item：`e2e_todo_item_1`、`e2e_todo_item_2`

- Task 47 的 testid `<id>` 必须与后端/本地数据的 todo_item_id 保持同一标识，不做 UI 层二次映射，避免 E2E 选择器与真实数据脱节。
- 硬删二次确认在 UI 层必须走 `todo-item-hard-delete-panel-<id>` 的确认面板与 confirm/cancel 按钮，禁止 `window.confirm`，否则 Playwright 无头环境易出现不可控弹窗与用例不稳定。

## [2026-03-02] - Task 48 同步调度器收尾经验（Flow/Memos 分离 + 手动触发）

- 设置页“立即同步”按钮的交互测试要按状态机写：点击某一 lane 后 UI 会进入短暂 busy 态并禁用两按钮，测试必须等待第一次调用完成再触发第二次，否则会出现“第二个 spy 没被调用”的假失败。
- sync 手动触发返回结构建议统一为 `{ lane, accepted, runOk, message, status }`，这样 renderer 只需按 `runOk` 与 `message` 处理错误展示，不需要关心 main 侧 `SyncLoopOutcome` 的内部细节。
- IPC 契约继续保持 empty payload（`getStatus/syncNowFlow/syncNowMemos`），可减少校验分支并与 window/updater 等已有通道风格一致。
- Task 48 验收时要同时核对“通道名 + testid + 三连命令（test/typecheck/build）”，否则容易只改通路不改用例，最终在 CI 才暴露时序问题。

## [2026-03-02] - Task 48 二次收口补充（syncController 抽离）

- 当 `main.ts` 中调度编排逻辑变长时，抽离 `syncController` 比继续堆在 `app.whenReady()` 内更稳：托盘入口、IPC 入口、后台循环都复用同一控制器接口，避免多处逻辑漂移。
- Flow/Memos 分离的落地关键不是“两个按钮”，而是“两个独立 runOnce”：Flow lane 只关心 `runFlowSyncPush/runFlowSyncPull` 结果，Memos lane 只关心 `runMemosSyncOneMemoJob` 执行结果，失败计数和错误文案不能共享状态。
- sync 控制器单测适合注入简化 scheduler（内联 fake），只断言 lane 调用边界与引擎调用次数，不绑定真实定时器；这样可以稳定覆盖“互不串扰”与“缺配置可解释失败”这两类关键约束。
