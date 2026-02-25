# decisions

- （持续追加）

- [2026-02-25] 选择不在 `package.json` 设置 `type=module`：避免 Electron main/preload 进入 ESM 复杂度；通过将 Vite 配置改为 `vite.config.mts` 解决 Vite 配置侧的 ESM 解析需求。
- [2026-02-25] Electron 编译产物统一输出到 `dist/`（main: `dist/main/*`，preload: `dist/preload/*`），renderer 输出到 `dist/renderer/*`；main 用 `__dirname + ../renderer/index.html` 加载静态页面，preload 用 `__dirname + ../preload/index.js` 绑定。
- [2026-02-25] 元信息落点：`package.json` 中 `name=xinliu-desktop`、`productName=心流`，以及 `build.appId=cc.pscly.xinliu.desktop` 作为可检索配置来源。

- [2026-02-25] 修正：Vite 配置最终仍使用 `vite.config.ts`；通过根 `tsconfig.json` 设置 `moduleResolution=Bundler` 来保证 `import { defineConfig } from 'vite'` 的类型解析正常。
