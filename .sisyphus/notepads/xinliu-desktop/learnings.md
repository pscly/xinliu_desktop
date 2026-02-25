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
