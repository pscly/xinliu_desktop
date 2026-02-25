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
