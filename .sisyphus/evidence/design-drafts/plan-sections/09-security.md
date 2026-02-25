# 09. Electron 安全模型（IPC 白名单 + 参数校验 + 权限边界）

本节定义 Windows 桌面端的 Electron 安全基线与可落地的实现约束，目标是：即使 renderer 被攻破（XSS/注入/恶意 Markdown/恶意附件触发渲染漏洞），攻击面也被限制在“最小可用权限”，不会直接触达系统能力、文件系统与凭据。

约束：本节只写规格，不写实现代码；仅承诺 Windows。

---

## 1) 安全目标与威胁模型

### 1.1 安全目标

- MUST: renderer 进程永远不直接访问 Node.js 能力、文件系统、进程信息、环境变量、凭据与系统 API。
- MUST: 所有系统能力只能通过“用例级 IPC API 白名单”访问，且每个 IPC 必须做参数校验与权限门。
- MUST: 任何涉及文件路径/导出/导入/协议读取的能力必须由 main 进程完成最终裁决（包括 `memo-res://` 协议）。
- MUST: `token` 等敏感信息不得写入 `日志`、不得进入崩溃上报/错误栈明文、不得出现在渲染错误对话框中。

### 1.2 主要威胁

- renderer 受攻击：XSS、第三方依赖污染、DOM 注入、恶意链接触发 `window.open`、WebView/iframe 滥用。
- 恶意 Markdown：`<img>`/`<a>`/HTML 片段、`data:`/`javascript:` URL、远程资源加载导致信息泄露或执行链。
- 恶意附件：伪装扩展名、可执行文件、利用预览器漏洞（PDF/图片解码）、超大文件导致 DoS。
- 恶意外链：钓鱼域名、带 token 的 URL 被复制/打开、`file://`/UNC 路径诱导越权读取。

---

## 2) Electron 安全基线

### 2.1 BrowserWindow / WebPreferences 基线

- MUST: `contextIsolation: true`。
- MUST: `nodeIntegration: false`。
- MUST: 使用 `preload` 且仅用于暴露受控 API（见第 3 节）。
- SHOULD: `sandbox: true`（若现有架构需要放宽，必须在本节列出例外与风险）。
- MUST: `webSecurity: true`。
- MUST: `allowRunningInsecureContent: false`。
- MUST NOT: 允许 renderer 通过任何方式获得 `require` / `process` / `ipcRenderer` 原始对象。
- MUST NOT: 使用 Electron `remote`（如项目历史存在，必须明确“禁用/移除”目标）。

### 2.2 导航与新窗口

- MUST: 禁止任意导航：对 `will-navigate` 一律 `preventDefault()`，除非是应用自有路由（例如 `app://` 或同源 `index.html`）。
- MUST: 通过 `setWindowOpenHandler` 拦截 `window.open`：默认 deny；仅允许受控外链打开策略（见第 8 节）。
- MUST NOT: 在 renderer 内加载/渲染 `file://` URL（包括 Markdown 中的 `file://` 链接与图片）。

### 2.3 Web 内容策略（CSP）

- SHOULD: 设置严格 CSP（至少禁用 `unsafe-eval`；限制脚本/图片/连接来源），并确保开发态与生产态策略差异可控。
- MUST: 禁止任意远程脚本注入；若必须加载远程资源（例如头像/图片），必须走明确 allowlist + 代理策略，并不得携带授权头。

---

## 3) Preload 暴露策略（只暴露用例级 API）

### 3.1 暴露原则

- MUST: preload 使用 `contextBridge.exposeInMainWorld` 暴露单一命名空间（例如 `window.xinliu`），其下仅包含“用例级方法”。
- MUST NOT: 在 preload 暴露通用 `ipcRenderer` 或“任意 channel 的 send/invoke”。
- MUST: 所有 IPC 调用统一走 `ipcRenderer.invoke`（request/response），避免无结构的 `send` 造成回调地狱与难以审计。

### 3.2 返回值与错误模型

- MUST: 所有 preload API 返回统一结构：
  - `ok: true` 时返回 `data`
  - `ok: false` 时返回 `code` + `message` +（可选）`details`
- MUST: `details` 禁止包含绝对路径、Authorization 头、`token`、或可识别用户目录结构的信息。

---

## 4) IPC API 白名单表（按用例分组）

说明：以下白名单是“唯一允许 renderer 调用 main 的入口”。任何新增 IPC 必须先补齐：用例说明、参数 zod 校验、权限门、审计点（最小日志）。

表记法：参数/返回使用伪类型（接近 zod），仅用于约束形态。

| IPC 名称 | 方向 | 参数（必须校验） | 返回 | 权限门/备注 |
|---|---|---|---|---|
| `sync.trigger` | renderer -> main (invoke) | `{ target: 'memos' | 'flow', reason?: 'user' | 'tray' | 'retry' }` | `{ queued: boolean }` | MUST: 只触发“调度意图”，不得携带任意 URL/headers；MUST: 401/429 策略见第 11 节 |
| `note.list` | invoke | `{ scope: 'recent' | 'collection', collectionId?: string, limit: number }` | `{ notes: NoteSummary[] }` | MUST: limit 上限（例如 <= 200）防 DoS |
| `note.save` | invoke | `{ id?: string, memoName?: string, title?: string, content: string, clientUpdatedAtMs: number }` | `{ id: string }` | MUST: `memoName` 允许形如 `memos/123`（视为不透明标识，不得当作路径片段） |
| `todo.list` | invoke | `{ state?: 'open' | 'done', collectionId?: string, limit: number }` | `{ todos: Todo[] }` | MUST: limit 上限 |
| `todo.upsert` | invoke | `{ id?: string, title: string, dueAtMs?: number, rrule?: string, done?: boolean }` | `{ id: string }` | MUST: rrule 长度/语法校验（非法直接 `VALIDATION_ERROR`） |
| `todo.delete` | invoke | `{ id: string }` | `{ deleted: true }` | MUST: 软删除语义与合同一致（tombstone） |
| `collections.list` | invoke | `{}` | `{ collections: CollectionNode[] }` | MUST: 只返回用户可见树；禁止返回本地绝对路径 |
| `collections.save` | invoke | `{ id?: string, name: string, parentId?: string }` | `{ id: string }` | MUST: name 长度/字符集校验（避免注入到文件名/菜单） |
| `collections.delete` | invoke | `{ id: string }` | `{ deleted: true }` | MUST: 若存在子节点，必须走确认流程（renderer 只提交确认结果，不提交删除范围） |
| `export.openSaveDialog` | invoke | `{ kind: 'markdown' | 'json', suggestedName: string }` | `{ filePath: string | null }` | MUST: 使用 `dialog.showSaveDialog`；MUST NOT: renderer 指定绝对路径 |
| `export.writeFile` | invoke | `{ token: string, payload: { kind: 'markdown' | 'json', content: string } }` | `{ written: true }` | MUST: `token` 仅表示“本次对话框授权句柄”，与认证 token 无关；MUST: 只能写入上一步返回的 filePath |
| `settings.get` | invoke | `{}` | `{ settings: Settings }` | MUST: 不包含敏感凭据（凭据单独通道） |
| `settings.set` | invoke | `{ patch: Partial<Settings> }` | `{ applied: true }` | MUST: patch 白名单字段；MUST NOT: 允许注入任意键 |
| `attachments.openFileDialog` | invoke | `{ accept: Array<'image' | 'pdf' | 'text'>, multi: boolean }` | `{ files: Array<{ name: string, bytes: string /* base64 */ }>} ` | MUST: 使用 `dialog.showOpenDialog`；SHOULD: 大文件走分片/流式方案（本节不写实现） |
| `attachments.prefetch` | invoke | `{ ids: string[] }` | `{ queued: number }` | MUST: ids 数量上限；MUST: 只入队不直接下载（下载在后台任务层） |
| `window.showMain` | invoke | `{}` | `{ shown: true }` | MUST: 仅允许操作本应用窗口 |
| `window.hideToTray` | invoke | `{}` | `{ hidden: true }` | MUST: 对齐 `.sisyphus/drafts/plan-sections/03-windows-integration.md` 的关闭语义 |
| `window.setAlwaysOnTop` | invoke | `{ enabled: boolean }` | `{ applied: true }` | SHOULD: 仅 Quick Capture 等窗口允许；主窗口默认禁用 |

补充规则：

- MUST: IPC 命名空间必须静态可枚举（便于审计与 grep）；禁止动态拼 channel 名。
- MUST: main 侧 `ipcMain.handle` 必须对“每个 IPC”显式注册，禁止通配 `ipcMain.handle('*', ...)`。
- MUST: IPC handler 内禁止直接透传异常对象到 renderer；统一映射错误码。

---

## 5) 参数校验（建议 zod）

### 5.1 校验原则

- MUST: 每个 IPC handler 在进入业务逻辑前做参数校验（建议 zod schema）。
- MUST: 对字符串字段设置：长度上限、允许字符集、是否允许换行、是否允许 `/`。
- MUST: 禁止“任意路径字符串”作为 IPC 输入（例如 `C:\...`、`\\server\share`、`..`、`%2f` 等）；涉及文件的用例必须通过权限门（第 6 节）。

### 5.2 校验失败的返回

- MUST: 校验失败返回 `{ ok: false, code: 'VALIDATION_ERROR', message: '...', details: { fieldErrors } }`。
- MUST: `details` 仅包含 schema 错误信息，不包含任何系统路径或内部堆栈。
- SHOULD: main 进程记录一次低敏感度审计日志（见第 7/11 节），并对可疑输入（路径/协议/编码绕过）提高告警级别。

---

## 6) 权限门（系统对话框授权 + 路径约束）

### 6.1 基本原则

- MUST: 任何“写入磁盘到用户选择位置”的行为，必须来自 `dialog.showSaveDialog` 的返回值。
- MUST: 任何“读取用户本机文件”的行为，必须来自 `dialog.showOpenDialog` 的返回值（或等价的 OS 授权句柄）。
- MUST NOT: renderer 直接指定绝对路径、UNC 路径、或通过 IPC 传入任意路径让 main 读写。

### 6.2 导出（export）

- MUST: 导出分两步：
  1) `export.openSaveDialog`：main 弹出保存对话框，返回 `filePath | null`。
  2) `export.writeFile`：main 只允许写入“刚刚授权”的 `filePath`。
- MUST: `export.writeFile` 必须绑定一次性授权上下文（例如短期 token 或内存态句柄），防止 renderer 复用/替换路径。
- MUST: 若用户取消对话框，后续写入必须返回 `PERMISSION_DENIED`。

### 6.3 导入与拖拽

- MUST: 优先使用 `attachments.openFileDialog` 实现导入。
- MUST NOT: 允许 renderer 将拖拽获得的文件 `path` 直接作为 IPC 输入给 main。
- SHOULD: 若必须支持拖拽导入，必须满足至少之一：
  - 方案 A：renderer 仅提交文件内容（bytes）+ 元信息（name/mime/size），main 负责落盘与类型校验。
  - 方案 B：拖拽触发后 main 立刻弹出 `showOpenDialog` 让用户“二次确认选择文件”，以对话框返回值作为唯一可信路径来源。

---

## 7) 凭据与敏感信息（Windows-only）

### 7.1 存储

- MUST: 认证凭据（含 refresh/access `token`）在 Windows 上必须使用 Windows Credential Vault 或 DPAPI 保护。
- MUST NOT: 将 `token` 写入 localStorage、明文配置文件、SQLite 普通表字段、或导出的诊断包。

### 7.2 日志/崩溃/错误上报

- MUST: 日志中禁止出现：Authorization 头、cookie、完整请求 URL（若含 token/query），以及任何可复现用户目录结构的绝对路径。
- MUST: 错误上报/崩溃报告必须做脱敏：
  - 删除/替换 `token`、Authorization、文件绝对路径、用户输入全文（除非用户显式同意并且有局部裁剪）。
- SHOULD: 记录请求的 `X-Request-Id`（见第 11 节），用于关联后端日志而不泄露敏感信息。

---

## 8) 外链打开、剪贴板、拖拽导入边界

### 8.1 外链打开（shell.openExternal）

- MUST: 只能打开 `https:`（可选允许 `mailto:` 但必须提示）；默认拒绝 `file:`/`javascript:`/`data:`/`ws:` 等。
- MUST: 外链打开必须经过 allowlist（域名白名单）或用户确认对话框（明确显示域名与风险提示）。
- MUST: 打开外链时必须剥离应用内部敏感参数（禁止把 `token` 拼入 URL）。

### 8.2 剪贴板

- MUST: 剪贴板写入仅允许明确的用户动作触发（按钮/快捷键），禁止后台自动复制。
- SHOULD: 默认复制纯文本；若复制富文本/HTML，必须做严格清洗（移除外链资源、脚本、内联事件）。
- MUST: 复制内容中若检测到疑似凭据（例如长 token 字符串），必须提示用户并默认不复制。

### 8.3 拖拽

- MUST: 禁止从外部拖入可执行类型（`.exe/.bat/.cmd/.ps1/.msi/.lnk` 等）；默认仅允许图片/PDF/文本类。
- MUST: 只允许特定 MIME/扩展名白名单；未知类型按“不可预览，仅保存为附件”处理。
- MUST: 拖拽导入流程必须走第 6.3 的权限门，不允许路径直通。

---

## 9) 自定义协议安全边界与引用（`memo-res://`）

本节不重复协议条款全文，协议层的“安全合同”以 `.sisyphus/drafts/plan-sections/08-attachments.md` 第 6 章为准，09 仅做引用与与 IPC 边界的对齐。

- MUST: `memo-res://<cacheKey>` 只能在 main 进程解析与读取文件；renderer 只拿到 URL，不得拿到真实路径。
- MUST: 白名单目录：仅允许 `<root>/attachments-cache/` 与 `<root>/attachments/`（引用：08 第 6.1 节）。
- MUST: 防路径穿越：`cacheKey` 只允许安全字符集；拒绝任何 `/` `\\` `..` 或编码绕过（引用：08 第 6.2 节）。
- MUST: 禁止 symlink / Windows reparse point 逃逸（引用：08 第 6.3 节）。
- MUST: MIME 白名单 + 高风险类型强制下载（`Content-Disposition: attachment`），禁止内联预览（引用：08 第 6.4 节）。
- MUST: 协议层日志不得包含绝对路径，仅记录 `cacheKey`/relpath（引用：08 第 6.5 节）。

---

## 10) 安全测试 / 自检清单（不写测试代码）

以下检查点必须可在代码评审与本地自检中执行：

- MUST: `contextIsolation: true` 与 `nodeIntegration: false` 可在 BrowserWindow 创建处被 grep/rg 命中并被确认。
- MUST: preload 文件不导出 `ipcRenderer`，renderer 代码中不出现 `ipcRenderer` 直接引用（只用 `window.xinliu.*`）。
- MUST: 每个 `IPC` handler 具备 zod（或等价）参数校验；校验失败返回 `VALIDATION_ERROR`。
- MUST: 所有导出/选择路径相关操作仅出现 `dialog.showSaveDialog`/`dialog.showOpenDialog` 授权路径；不存在“renderer 传入任意 filePath 写入”的通道。
- MUST: `memo-res://` 协议实现满足 08 的 6.1-6.5 条款，且拒绝 symlink/reparse point。
- MUST: 日志不包含 Authorization、cookie、`token`、绝对路径；错误上报脱敏策略可验证。

---

## 11) 与后端合同相关的安全点（Flow + Notes/Memos）

- MUST: 所有请求附带 `X-Request-Id`（每次请求唯一），用于排障关联；日志仅记录该 id，不记录 Authorization。
- MUST: 收到 429 时执行 backoff（指数退避 + 抖动），并设置重试上限；不得无限重试消耗资源。
- MUST: 收到 401 时立即停止自动重试，触发“需要重新登录/刷新凭据”的显式流程；不得在日志中打印请求头 Authorization。
- MUST: 禁止打印任何请求头中的 Authorization、cookie；对调试日志必须默认脱敏。
- SHOULD: 网络错误/超时/5xx：与同步/下载任务层统一重试策略；敏感字段在错误对象中清洗后再上报。
