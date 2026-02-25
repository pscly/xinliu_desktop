# 11. 性能预算与交互细则（可量化，Windows 桌面端）

本章给出 Windows 桌面端的**可量化**性能预算（ms / fps / MB / CPU% 等），以及达标策略与大库退化策略。

设计前提（与其他章节一致）：

- 主布局为 Triptych 三栏：左栏 Folder 树/导航；中栏 列表/收件箱/搜索结果；右栏 详情/编辑。
- 离线优先：UI 读取以本地 SQLite 为权威来源。
- renderer 进程不得直连 SQLite/文件系统写入；读写通过 main 进程窄接口完成（避免 IPC 查询风暴）。

术语约定：

- **p50/p95**：同一指标在真实交互下的 50/95 分位耗时（ms）。预算以 p95 为主。
- **首屏**：主窗首次展示 Triptych 三栏骨架 + 至少一栏内容可交互（不要求所有数据齐全）。
- **首批结果**：搜索结果列表中第一屏（或至少 N=20 条）渲染完成。
- **主线程**：renderer 的 UI 线程（必须避免长任务）；与 main 进程线程分离。

---

## 1) 目标与度量方式（如何测）

本项目的性能目标不是“跑分”，而是把用户感知最强的路径（搜索/滚动/拖拽/编辑/同步/附件预览）用**统一口径**量化，并能在日志里定位瓶颈。

### 1.1 冷启动 / 首屏（Triptych）

度量建议（至少记录以下 3 段耗时，单位 ms）：

- `process_start → main_ready_ms`：main 进程完成配置加载、日志初始化、数据库打开/校验（含 WAL 相关准备）。
- `main_ready_ms → window_first_paint_ms`：主窗创建到第一次可见绘制。
- `window_first_paint_ms → triptych_interactive_ms`：Triptych 三栏布局可交互（可点击左栏、可在中栏滚动、右栏可显示空态/骨架）。

为什么这样拆：冷启动问题通常发生在“DB 打开/迁移/索引检查”和“UI 首次渲染”两类，拆开才能明确是 IO 还是渲染。

### 1.2 搜索（输入到首批结果）

度量建议（从输入事件开始，单位 ms）：

- `search_input_ms`：用户输入（键盘事件）时间戳。
- `search_request_sent_ms`：renderer 触发搜索请求并发出 IPC 的时间戳。
- `search_db_done_ms`：main 完成 SQLite 查询（含 FTS5）并序列化返回。
- `search_first_results_painted_ms`：renderer 首批结果列表实际渲染完成。

为什么必须记录 IPC：在“每按一次键就查一次 DB”的情况下，很容易出现 IPC 查询风暴；必须能量化每次搜索触发了多少 IPC 轮次。

### 1.3 列表（滚动 / 选择 / 右栏详情更新）

度量建议：

- 滚动：统计滚动期间掉帧（fps）、长任务（>50ms）数量。
- 选择条目：`item_select_ms → details_first_paint_ms`。
- 右栏详情更新：`details_fetch_start_ms → details_ready_ms`（含是否命中缓存）。

### 1.4 拖拽（hover 展开 / 边缘滚动）

度量建议：

- `drag_start_ms → drag_overlay_painted_ms`（拖拽浮层出现）。
- `hover_expand_trigger_ms → hover_expand_done_ms`（hover 800ms 后的展开动画/渲染）。
- `edge_scroll_active_ms`：边缘滚动活跃区间的平均 fps 与掉帧。

### 1.5 同步（后台 CPU/网络/磁盘占用边界）

度量建议（按 Flow / Memos 两条链路分别记录）：

- `sync_run_id` 维度：本次同步总耗时、网络字节数、写盘字节数、DB 写入时长。
- 资源占用：后台同步时的 CPU%（进程级）与磁盘写入速率（MB/s）区间。

### 1.6 附件（预览首帧 / 缓存命中）

度量建议：

- `attachment_open_ms → preview_first_frame_ms`。
- `cache_hit`：是否命中本地附件缓存（以及缓存路径类型：内存/磁盘）。
- `decode_ms`：图片解码/预处理耗时（避免把解码挤到 UI 线程）。

---

## 2) 性能预算（明确数值 + 为什么 + 怎么达成）

说明：预算默认以**中端 Windows 笔记本**为目标（4C/8T，16GB RAM，NVMe/SSD）。大库与低端机有单独退化策略（见第 4 节）。

### 2.1 冷启动：主窗首屏（Triptych）

预算：

- `triptych_interactive_ms` p95 ≤ 1200ms；p50 ≤ 700ms。
- 启动期间 renderer 主线程长任务：0 次 > 100ms；总计 ≤ 2 次 > 50ms。
- 启动完成后的常驻内存（Working Set）：p95 ≤ 450MB（含缓存，但不含超大附件解码峰值）。

为什么这样：桌面端用户对“窗口是否立刻可用”非常敏感；Triptych 首屏若超过 ~1.2s，用户会倾向于认为应用卡顿或没响应。

怎么达成：

- 首屏只做“骨架 + 最近一次视图状态恢复”（不做全库扫描）。
- DB 打开/迁移检查必须在 main 进程可控阶段完成，并把非关键派生数据推迟到后台 job（见 `jobs`）。
- 首屏不触发附件预取、不触发全量索引重建；仅做必要的 schema_version 校验与轻量完整性检查。

### 2.2 搜索：输入到首批结果

预算（本地索引正常）：

- 从 `search_request_sent_ms` 到 `search_first_results_painted_ms`：p95 ≤ 180ms；p50 ≤ 90ms。
- 每次搜索请求的 IPC 轮次：固定 1 次（输入→结果），禁止“逐条详情补齐”的二次风暴。
- 搜索结果首屏渲染 fps：滚动/键盘上下选择期间维持 ≥ 55fps（目标 60fps）。

为什么这样：搜索是高频交互（见 UX flows），用户会连续输入；如果每次字符都引发多次 IPC 或 >200ms 的等待，会出现“输入跟不上”的强烈负反馈。

怎么达成：

- 搜索默认走 SQLite FTS5（见本地数据模型），把“全文检索 + 排序 + 分页”压在 DB 内完成，避免 renderer 端拼接与多次请求。
- 搜索 IPC 返回**一页**结果 + 渲染所需必要字段（标题、片段预览、所属 folder 简要定位信息），避免随后再查 N 次详情。
- 搜索结果列表使用虚拟列表（Virtual List / 虚拟列表），确保渲染成本与可视项数量近似成正比。

预算（索引不可用/重建中降级）：

- 降级扫描模式下：p95 ≤ 800ms 返回首批结果，并在 UI 明示“降级搜索（较慢）”。

### 2.3 列表：滚动 / 选择条目 / 右栏详情更新

预算：

- 中栏列表滚动：稳定 ≥ 55fps（目标 60fps），滚动期间长任务 0 次 > 50ms。
- 选择条目（中栏点击/键盘 Enter）：`item_select_ms → details_first_paint_ms` p95 ≤ 80ms。
- 右栏详情内容填充：`details_fetch_start_ms → details_ready_ms` p95 ≤ 150ms（未命中缓存时）；命中缓存 p95 ≤ 30ms。

为什么这样：Triptych 联动要求“中栏选中→右栏立刻响应”，否则用户会反复点击、造成更多 IPC 与状态抖动。

怎么达成：

- 列表项渲染只用“必要字段 + 轻量派生字段”（例如 preview/plain_excerpt、tags 文本），严禁列表项内触发异步二次查询。
- 详情读取采用“读模型缓存 + 订阅式推送”：同一 entity 在短时间重复访问不重复查 DB（尤其是键盘上下切换）。
- 列表与详情都要分页/增量加载（分页），避免一次性加载全库造成首帧阻塞。

### 2.4 拖拽：hover 展开 / 边缘滚动

预算：

- 拖拽浮层出现：`drag_start_ms → drag_overlay_painted_ms` p95 ≤ 16ms（约 1 帧）。
- hover 展开（UX 定义为悬停 800ms 触发）：触发后展开渲染 `hover_expand_trigger_ms → hover_expand_done_ms` p95 ≤ 120ms。
- 边缘滚动期间：平均 ≥ 55fps（目标 60fps），不出现连续掉帧（连续 5 帧 < 45fps 视为失败）。

为什么这样：拖拽是“肌肉记忆”交互，任何延迟都会让用户怀疑是否拖住了/是否可放置；边缘滚动掉帧会直接导致误放。

怎么达成：

- 拖拽过程中禁止触发 DB 查询；拖拽 hover 展开仅做 UI 展开（或读取已缓存的树节点子级），不要现查现渲。
- 树节点展开的数据必须支持增量加载（分页/按需加载子节点），并对“最近悬停过的节点”做短期缓存。
- 拖拽完成后才提交移动事务；UI 用乐观更新，后台对齐同步/outbox（确保交互流畅）。

### 2.5 同步：后台 CPU/网络/磁盘占用边界

预算（应用在前台可交互时）：

- CPU：同步任务的进程级平均 CPU% ≤ 15%，峰值 ≤ 35%（持续不超过 2s）。
- 磁盘：写入速率 ≤ 20MB/s（避免影响 UI 与系统响应）；单次 checkpoint 不阻塞 UI。
- 网络：默认速率上限 ≤ 2MB/s；允许用户在设置里调整，但默认保守。
- 同步对 UI 的影响：同步期间首屏/搜索/滚动预算不被明显挤压（掉帧率不升高到不可接受）。

为什么这样：离线优先意味着同步是“后台常驻”，如果资源占用过高，会让用户把“卡顿”归因到应用本身。

怎么达成：

- Flow/Memos 两条链路分开调度；使用 `jobs` 去重（dedupe_key）避免重复跑。
- 同步拉取/应用变更必须批量化：一次处理一批 mutations，单事务写入（避免大量小事务触发 fsync）。
- 把派生数据重建（FTS5 重建、tag 辅助表回填等）放到低优先级 job，且可暂停/续跑。

### 2.6 附件：预览首帧 / 缓存命中

预算：

- 预览首帧：
  - 缓存命中（本地已有）：p95 ≤ 200ms 出首帧。
  - 缓存未命中但本地可快速获取（例如下载完成）：p95 ≤ 800ms 出首帧。
- 缓存命中率（同一会话内重复打开同一附件）：≥ 95%。
- 附件缓存规模：默认上限 5GB（可配置）；超过上限启用 LRU 清理，不阻塞 UI。

为什么这样：附件预览若“每次都重新下载/重新解码”，会造成明显等待；但缓存无限增长会吞磁盘，必须有边界。

怎么达成：

- 缓存路径使用本地 UUID（避免把含 `/` 的 ref_id 当路径片段，见本地数据模型约束）。
- 预览优先走缓存；下载与解码异步化，先显示占位/骨架，首帧 ready 后再替换。
- 对大图/视频的解码与缩略图生成放在后台线程或独立任务队列，避免占用 renderer 主线程。

---

## 3) 架构策略（偏桌面，避免 IPC 查询风暴）

本节只描述策略与边界，不写实现代码。

### 3.1 虚拟列表（中栏/搜索结果）

- 中栏列表与搜索结果必须使用虚拟列表（Virtual List / 虚拟列表），渲染窗口只覆盖可见项 + 少量 overscan。
- 列表项高度尽量稳定（避免频繁 reflow）；对可变高度内容（例如多行预览）使用“截断 + 展开详情在右栏完成”。

### 3.2 分页/增量加载（避免一次性加载全库）

- 所有列表类读取（memos、todo_items、collection_items 子节点、回收站）都必须支持分页（分页）与稳定排序 tie-break。
- renderer 不允许通过“拉全量后本地过滤”的方式做筛选；筛选/排序尽量下推到 SQLite。

### 3.3 读模型缓存与订阅式推送（避免 IPC 查询风暴）

- main 进程维护短期读模型缓存（例如：最近访问的详情、最近一页列表窗口、最近展开的树节点子集）。
- renderer 通过订阅获得变更推送（例如某 memo 更新、某列表窗口失效），避免轮询或重复查询。
- 缓存必须可失效：当 outbox/sync 应用变更后，按实体 id/tag 失效对应缓存，保证一致性。

### 3.4 批量 IPC（一次请求拿到列表 + 必要字段）

- 列表与搜索请求必须批量返回：一次 IPC 返回“页窗口 + 必要字段 + 最小派生字段”。
- 禁止模式：renderer 先拿 id 列表，再对每条 id 发 IPC 拉详情（这是典型 IPC 查询风暴）。

### 3.5 SQLite 索引策略与慢查询兜底

- 索引优先覆盖：列表分页（`state + updated_at`/`client_updated_at_ms`）、引用回填（ref_id/ref_local_uuid）、tag 辅助表（tag 列索引）、FTS5（全文）。
- 慢查询兜底：
  - 超过阈值（例如单次查询 > 50ms）必须记录日志事件（见第 5 节）。
  - 搜索索引损坏/不可用时，允许降级为基础扫描（慢但可用），并提供后台重建索引。

---

## 4) 大库/极端场景退化策略（50k memos / 附件缓存 5GB）

目标：在极端数据量下保持“可用且可解释”，即使体验退化，也要可控且不出现卡死。

### 4.1 限制默认加载条数

- 冷启动首屏：默认只加载中栏首屏（例如 30 条）+ 右栏空态/最近打开项；禁止启动即拉取 50k。
- Folder 树：默认只加载根节点与第一层；深层在 hover/点击展开时再按需加载。

### 4.2 后台重建索引/派生数据

- FTS5 重建、tag 辅助表回填、预览字段（plain_excerpt）生成必须是后台 job，并支持：暂停/续跑/失败重试。
- 重建期间搜索降级：提示“索引重建中”，先返回部分结果或仅标题匹配结果。

### 4.3 低优先级预取

- 仅对“最近 N 条/当前可视窗口”的附件/缩略图做预取；并且预取在 UI 空闲时以低优先级执行。
- 预取队列必须可取消：用户快速滚动/切换 folder 时，取消旧窗口预取，避免无意义 IO。

### 4.4 低端机/大库额外保守模式（自动触发）

触发条件示例（满足任一即可进入保守模式）：

- 冷启动 `triptych_interactive_ms` p95 > 2000ms；或启动后常驻内存 > 700MB。
- 搜索 p95 > 300ms 且 IPC 轮次异常（>1）。

保守模式策略：

- 搜索：提高 debounce（见“允许的 UX 让步”），并限制高亮与片段生成（先返回 id/标题/一行预览）。
- 列表：降低 overscan，缩短列表项预览文本长度。
- 附件：关闭自动预取，仅在用户显式打开时加载；缓存清理更积极（LRU 水位更低）。

---

## 5) 诊断钩子（不写代码）：需要记录哪些 perf 事件（脱敏）

要求：所有事件写入本地日志（见 logs 目录），不得记录 token/正文全文；只记录必要字段，默认脱敏。

事件建议（event name + 字段）：

1) 冷启动

- `perf.cold_start`
  - `run_id`：启动唯一 id
  - `main_ready_ms`
  - `window_first_paint_ms`
  - `triptych_interactive_ms`
  - `working_set_mb`
  - `db_open_ms`
  - `schema_check_ms`
  - `ipc_roundtrips_until_interactive`（整数）

2) 搜索

- `perf.search`
  - `q_len`（仅长度，不记原文）
  - `debounce_ms`
  - `ipc_rtt_ms`
  - `db_query_ms`
  - `result_count`
  - `page_size`
  - `cache_hit`（bool，指读模型/查询结果缓存）
  - `fts_enabled`（bool）

3) 列表与详情

- `perf.list.page`
  - `list_kind`（memos/todos/collection_children/search_results）
  - `page_cursor` / `offset` / `limit`（二选一，取决于分页口径）
  - `db_query_ms`
  - `result_count`
  - `cache_hit`（bool）

- `perf.details.open`
  - `entity_kind`（memo/todo_item/note_ref）
  - `cache_hit`
  - `db_query_ms`
  - `render_first_paint_ms`

4) 拖拽

- `perf.drag`
  - `drag_overlay_ms`
  - `hover_expand_ms`
  - `edge_scroll_avg_fps`
  - `drop_commit_ms`
  - `moved_count`（多选时）

5) 同步

- `perf.sync.run`
  - `channel`（flow/memos）
  - `run_id`
  - `duration_ms`
  - `net_rx_bytes` / `net_tx_bytes`
  - `db_write_ms`
  - `disk_write_bytes`
  - `cpu_avg_pct` / `cpu_peak_pct`
  - `result`（ok/retryable_fail/fatal_fail/conflict）

6) 附件

- `perf.attachment.preview`
  - `mime_type`
  - `size_bytes`
  - `cache_hit`
  - `download_ms`（若发生）
  - `decode_ms`
  - `first_frame_ms`

慢查询兜底：

- `perf.db.slow_query`
  - `query_kind`（search/list/details/backfill/fts_rebuild 等）
  - `duration_ms`
  - `rows`（若可得）
  - `db_page_count`（若可得）
  - `wal_checkpoint_state`（若可得）

---

## 允许的 UX 让步（≤ 3 条，仅在性能压力下启用）

1) 搜索输入默认 debounce 120ms（低端机/大库可提升到 200ms），并保留“按 Enter 立即搜索”的确定性入口。

2) 右栏详情在未命中缓存时先展示骨架（skeleton），150ms 内未完成则显示“仍在加载”而不是卡住 UI。

3) 附件预览默认“点开才加载首帧”，禁止在列表滚动时自动解码大图/视频；必要时仅加载缩略图。
