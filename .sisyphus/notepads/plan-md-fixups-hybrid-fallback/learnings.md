# Learnings（追加式）

- （在每个任务完成后追加：新发现的约束、惯例、坑、验证命令）

- 更新 `PLAN.md` 开头口径优先级, 增加硬性裁决规则(更具体、更新、专题文档优先), 明确冲突时执行者不得自行选择。
- 在 `PLAN.md` 增加冲突对照表, 明确 `collection_item` 的同步合同以 `apidocs/collections.zh-CN.md` 为权威口径, 对 `apidocs/api.zh-CN.md` 的枚举缺口采用容错策略。
- 强化 `PLAN.md` 的漂移容错段落, 直接点名 `apidocs/api.zh-CN.md` 未列出 `collection_item` 的已知差异, 以避免实现时误用枚举硬校验。

- Notes 路由默认直连 Memos; 仅在 `memos_base_url_invalid`、HTTP 401/403、网络不可达/超时 这三类触发条件下, 单次请求才允许降级到 Flow Notes, 且同一用户操作内不得隐式双写。
- 设置页必须展示当前 Notes Provider(直连/降级)与最近一次降级原因; Notes 错误详情必须标注来源 `[Memos]`/`[FlowNotes]` 并提供可复制 `request_id`。
- 对于已获得有效 HTTP 响应但非 401/403 的 Memos 错误(如 4xx/5xx/429), 不得自动降级到 Flow Notes, 避免掩盖真实故障与数据一致性问题。

- 在 `PLAN.md` 增加 Source-of-Truth(SoT) 与 Ownership Matrix, 明确 Notes(正文/附件)、Todo、Collections、UserSettings 的权威源以及允许的读/写路径, 用规则而非口号阻止实现时产生“影子权威源”。
- 强化硬规则: 单次用户操作 Notes 只允许写入一个 provider（Memos 或 Flow Notes）, 明确“禁止隐式双写(silent dual-write/dual-write)”; 跨 provider 二次写入只允许出现在显式迁移/修复动作中且必须可见可审计。
- 冲突策略采用保守副本: 冲突时保留本地副本 + 服务端快照证据, 不静默覆盖用户文本; 曾降级写入 Flow Notes 的内容在 Memos 恢复后不得自动迁移/补写到 Memos。

- Flow 的 `notes` 表(若存在)只允许表达“Flow Notes provider 的降级承载/离线镜像/派生缓存”, 不得被实现为 Notes 的权威源或默认写入路径。
- MUST NOT: 任何实现者不得把 Flow `resource=note` 的 sync 当成默认路径或后台常驻同步; 仅当降级触发且本次请求 Router 已裁决为 `Flow Notes(降级)` 时才允许启用。
- 只要 `PLAN.md` 在 Flow 落库清单中提到 `notes`, 必须同处写清其“降级语义与启用条件”, 以保证与“Notes 直连 Memos / 混合+降级”口径不冲突。
