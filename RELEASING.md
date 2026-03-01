# 发布流程与约定（stable only）

本文档约定心流桌面端（`xinliu-desktop`）的版本号、Git tag、Release Notes 模板，以及发布产物与校验方式。

## 1. 版本号策略（当前阶段仅 `0.y.z`）

当前项目仍处于 `0` 主版本阶段，版本号只允许使用：

- `0.y.z`

含义（语义化版本意图）：

- `y`（Minor）：新增功能或较大调整
- `z`（Patch）：Bug 修复、小改动

禁止：

- `1.0.0` 或更高主版本，除非明确要求发布 v1
- 任何预发布版本号，例如 `0.3.0-beta.1`、`0.3.0-rc.1`

## 2. Git tag 格式与触发规则

### 2.1 tag 格式

只允许使用带 `v` 前缀的 tag：

- `v0.y.z`

示例：

- `v0.1.0`
- `v0.1.1`
- `v0.2.0`

### 2.2 触发规则

发布工作流只会在 push tag 时触发，并且只匹配：

- `v0.*`

这意味着：

- push 分支不会触发发布
- tag 名不符合规则则不会触发发布

## 3. Stable-only 政策（不做 prerelease）

本仓库发布策略为 stable only：

- 不发布 prerelease
- GitHub Release 必须是稳定版（`prerelease: false`）

原因：

- 应用内自动更新（electron-updater GitHub provider）默认以稳定版为主，混入 prerelease 很容易导致更新通道与用户预期不一致
- 简化发布与回滚，减少“同一版本不同渠道”造成的排查成本

## 4. 发布前检查清单

以下检查建议在本地 Linux 或 CI 环境先通过，再打 tag。

### 4.1 统一 Node 版本

本仓库约束 Node 20（并建议固定到 20.20.0）。

```bash
source ~/.nvm/nvm.sh
nvm use 20.20.0
```

### 4.2 本地验证命令（必跑）

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm test
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run typecheck
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run build
```

## 5. 发布步骤（打 tag 才会触发）

下面是一套最小可复现的发布流程，目标是让仓库版本号与 tag 一致，并由 Windows runner 完成打包与发布。

### 5.1 更新版本号（建议做成一次独立提交）

选择目标版本，例如 `0.2.0`。

```bash
npm version --no-git-tag-version 0.2.0
```

说明：

- `--no-git-tag-version` 只更新 `package.json` 和 `package-lock.json`，不会自动创建 tag

### 5.2 写 Changelog（Release Notes）

在创建 GitHub Release 时使用下方模板，确保每次发布都可读、可回溯。

### 5.3 创建并 push tag

```bash
git tag v0.2.0
git push origin v0.2.0
```

说明：

- 只有 push tag 会触发 release workflow
- tag 必须符合 `v0.*`

## 6. Release Notes 模板

将以下内容复制到 GitHub Release 的描述中，并按版本补齐。

```markdown
## 新功能

-

## 修复

-

## 已知问题

-

## 升级说明

-

## 安装与更新

- Windows 安装包：下载 `xinliu-desktop-<version>-setup-x64.exe` 并安装
- 自动更新：仅在“安装包运行”时生效，开发模式下会显示禁用或回退提示
```

## 7. 发布产物清单（Windows NSIS）

Windows 打包由 electron-builder 生成，输出目录固定为：

- `release/`

每个稳定版 Release 至少应包含：

- NSIS 安装包：`release/*.exe`
- 自动更新元数据：`release/latest.yml`
- 差分更新 blockmap：
  - `release/*.exe.blockmap`
  - 可能还会有 `release/*.blockmap`（视 electron-builder 版本与配置而定）
- SHA-256 校验文件：`release/*.sha256`

提示：

- `latest.yml` 与 `*.blockmap` 直接影响 electron-updater 的下载与差分更新能力，缺失会导致更新失败或退化为全量下载

## 8. 生成 SHA-256 校验文件

### 8.1 Windows（PowerShell，推荐在 Windows runner 上生成）

对安装包生成 sha256 文件，内容格式建议为：

```
<hash>  <filename>
```

PowerShell 示例：

```powershell
$installer = Get-ChildItem -Path .\release -Filter "*.exe" | Select-Object -First 1
$hash = Get-FileHash -Algorithm SHA256 -Path $installer.FullName
$shaPath = Join-Path (Split-Path $installer.FullName) ($installer.Name + '.sha256')
"$($hash.Hash.ToLower())  $($installer.Name)" | Out-File -FilePath $shaPath -Encoding ascii
```

### 8.2 Linux（可选，本地校验用）

```bash
cd release
sha256sum ./*.exe > installers.sha256
```

## 9. 产物自检建议

### 9.1 检查版本号一致性

- Git tag 是否为 `v0.y.z`
- `package.json` 的 `version` 是否与 tag 去掉 `v` 后一致

### 9.2 检查更新产物是否齐全

- `latest.yml` 是否已上传到 GitHub Release
- `*.blockmap` 是否已上传到 GitHub Release
- `*.sha256` 是否已上传到 GitHub Release
