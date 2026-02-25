# “设计完成”验收清单（rg/脚本可自动核对）

> 验收对象：最终根目录 `PLAN.md`（Task 14 合并后）。
>
> 目标：把“设计补全”转成可自动核对的 PASS/FAIL，不依赖主观评价。

## 使用方式

- 在仓库根目录执行下方命令（默认验收文件为 `PLAN.md`）。
- 每条检查都给出 PASS 判定；全部通过即总判定 PASS。

## 1) 章节覆盖检查（结构完整性）

### 1.1 关键章节关键词覆盖（最小必含）

PASS 判定：以下每个关键词在 `PLAN.md` 中至少命中 1 行（`rg -n` 有输出）。

```bash
set -euo pipefail

PLAN_FILE="PLAN.md"

# 关键章节关键词（来自 Verification Strategy / 目录骨架要求）
required_sections=(
  "目标" "非目标"
  "信息架构" "IA" "导航"
  "窗口" "系统集成"
  "数据模型" "SQLite"
  "同步" "冲突"
  "Electron" "安全"
  "错误处理"
  "性能预算"
  "安装" "更新"
  "验收" "清单"
)

missing=0
for kw in "${required_sections[@]}"; do
  if ! rg -n --fixed-strings "$kw" "$PLAN_FILE" >/dev/null; then
    echo "[FAIL] 缺少章节/关键词: $kw"
    missing=$((missing + 1))
  else
    echo "[PASS] $kw"
  fi
done

test "$missing" -eq 0
echo "[PASS] 章节覆盖检查：missing=$missing"
```

## 2) Flow 合同关键字检查（与 apidocs 同步协议对齐）

PASS 判定：以下每个关键字在 `PLAN.md` 中至少命中 1 行。

必查关键字（必须全部出现并在文档中被解释）：

- `client_updated_at_ms`
- `deleted_at`
- `sync/pull`
- `sync/push`
- `applied`
- `rejected`
- `server_snapshot`
- `collection_item`

```bash
set -euo pipefail

PLAN_FILE="PLAN.md"

flow_contract_keywords=(
  "client_updated_at_ms"
  "deleted_at"
  "sync/pull"
  "sync/push"
  "applied"
  "rejected"
  "server_snapshot"
  "collection_item"
)

missing=0
for kw in "${flow_contract_keywords[@]}"; do
  hits=$(rg -n --fixed-strings "$kw" "$PLAN_FILE" | wc -l | tr -d ' ')
  if [ "$hits" -lt 1 ]; then
    echo "[FAIL] Flow 合同关键字缺失: $kw"
    missing=$((missing + 1))
  else
    echo "[PASS] $kw (hits=$hits)"
  fi
done

test "$missing" -eq 0
echo "[PASS] Flow 合同关键字检查：missing=$missing"
```

## 3) Memos 关键字检查（Notes 直连 Memos + ID 编码约束）

PASS 判定：以下要点在 `PLAN.md` 中均能被检索到（命中行数 >= 1）。

- 资源名/路径形态：`memos/`
- 标识符字段：`memoName`
- 编码/解码约束：`encode` 与 `decode`（两者都必须出现）

```bash
set -euo pipefail

PLAN_FILE="PLAN.md"

memos_keywords=("memos/" "memoName")
missing=0
for kw in "${memos_keywords[@]}"; do
  hits=$(rg -n --fixed-strings "$kw" "$PLAN_FILE" | wc -l | tr -d ' ')
  if [ "$hits" -lt 1 ]; then
    echo "[FAIL] Memos 关键字缺失: $kw"
    missing=$((missing + 1))
  else
    echo "[PASS] $kw (hits=$hits)"
  fi
done

# encode/decode 要求两者都出现（避免只写一半导致实现期踩坑）
enc_hits=$(rg -n "\\bencode\\b" "$PLAN_FILE" | wc -l | tr -d ' ')
dec_hits=$(rg -n "\\bdecode\\b" "$PLAN_FILE" | wc -l | tr -d ' ')
if [ "$enc_hits" -lt 1 ] || [ "$dec_hits" -lt 1 ]; then
  echo "[FAIL] encode/decode 约束不完整: encode=$enc_hits decode=$dec_hits"
  missing=$((missing + 1))
else
  echo "[PASS] encode/decode (encode=$enc_hits decode=$dec_hits)"
fi

test "$missing" -eq 0
echo "[PASS] Memos 关键字检查：missing=$missing"
```

## 4) Mermaid 段落数量检查（流程图数量）

PASS 判定：`PLAN.md` 中 `mermaid` 代码块数量 >= 3。

```bash
set -euo pipefail

PLAN_FILE="PLAN.md"

mermaid_blocks=$(rg -n "^```mermaid\$" "$PLAN_FILE" | wc -l | tr -d ' ')
echo "mermaid_blocks=$mermaid_blocks"
test "$mermaid_blocks" -ge 3
echo "[PASS] Mermaid 段落数量检查（>=3）"
```

## 5) TBD/待定/未决 清零检查（悬空决策禁止）

PASS 判定：`PLAN.md` 中不出现 `TBD|待定|未决`（命中行数 = 0）。

```bash
set -euo pipefail

PLAN_FILE="PLAN.md"

tbd_hits=$(rg -n "TBD|待定|未决" "$PLAN_FILE" | wc -l | tr -d ' ')
echo "tbd_hits=$tbd_hits"
test "$tbd_hits" -eq 0
echo "[PASS] TBD 清零检查（0 行命中）"
```

## 总判定规则（N/N）

> 总判定 PASS：以上 5 类检查全部 PASS（5/5）。

可选：一键总判定（执行后只输出最终 VERDICT；任何子项失败即返回非 0）。

```bash
set -euo pipefail

PLAN_FILE="PLAN.md"

fail=0

## 1) 章节覆盖
required_sections=(
  "目标" "非目标" "信息架构" "导航" "窗口" "系统集成" "数据模型" "SQLite"
  "同步" "冲突" "Electron" "安全" "错误处理" "性能预算" "安装" "更新" "验收" "清单"
)
for kw in "${required_sections[@]}"; do
  rg -n --fixed-strings "$kw" "$PLAN_FILE" >/dev/null || fail=$((fail + 1))
done

## 2) Flow 合同关键字
flow_contract_keywords=(
  "client_updated_at_ms" "deleted_at" "sync/pull" "sync/push"
  "applied" "rejected" "server_snapshot" "collection_item"
)
for kw in "${flow_contract_keywords[@]}"; do
  rg -n --fixed-strings "$kw" "$PLAN_FILE" >/dev/null || fail=$((fail + 1))
done

## 3) Memos 关键字
rg -n --fixed-strings "memos/" "$PLAN_FILE" >/dev/null || fail=$((fail + 1))
rg -n --fixed-strings "memoName" "$PLAN_FILE" >/dev/null || fail=$((fail + 1))
rg -n "\\bencode\\b" "$PLAN_FILE" >/dev/null || fail=$((fail + 1))
rg -n "\\bdecode\\b" "$PLAN_FILE" >/dev/null || fail=$((fail + 1))

## 4) Mermaid 段落数（>=3）
mermaid_blocks=$(rg -n "^```mermaid\$" "$PLAN_FILE" | wc -l | tr -d ' ')
test "$mermaid_blocks" -ge 3 || fail=$((fail + 1))

## 5) TBD 清零
tbd_hits=$(rg -n "TBD|待定|未决" "$PLAN_FILE" | wc -l | tr -d ' ')
test "$tbd_hits" -eq 0 || fail=$((fail + 1))

if [ "$fail" -eq 0 ]; then
  echo "VERDICT: PASS (5/5)"
else
  echo "VERDICT: FAIL (fail_checks=$fail)"
  exit 1
fi
```
