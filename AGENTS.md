# dsh-nai-artist — 仓库规则

## 项目定位

`@dsh-external/dsh-nai-artist` 是 DSH 绘画插件：`paint` 工具把自然语言描述翻译成 NovelAI tags 后生图，图片以卡片形式直接渲染进对话；同一插件还提供 WebUI 工作台（翻译预览、手改 tags、参数调整、生图、历史画廊），入口是输入框右侧 🎨 按钮或 `/nai-artist` 路由。

## 硬性边界与约定

- **密钥只走 credentials 服务**（读 `~/.dsh/.credentials.yaml`），由 `ctx.credentials.resolve(credentialRef(env))` 在调用时取用：`IKUN_PAINT_API_KEY`（生图）、`IKUN_DEEPSEEK_API_KEY`（翻译）。**任何密钥值、token、账号不得写入本仓库文件、日志或提交信息**；`store.ts` 明确要求 `config.json` 只存非机密参数。
- **产物落盘位置**:生成图片进 `<plugin home>/gallery/`（PNG + 同名 sidecar JSON，按 `maxEntries` 由旧到新淘汰）；绘画默认参数存 `<plugin home>/config.json`。WebUI 通过 `/api/dsh-nai-artist/gallery/*` 路由读取与删除，删除前做文件名白名单校验。
- **打包完整性**:发布面由 `package.json#files` 决定 — `lib`、`cordis.patch.yml`、`README.md`、`LICENSE`。其中 `LICENSE` 目前**在仓库根目录并不存在**（`package.json` 声明 MIT），发布前需补齐，否则打包会缺文件。
- **构建产物不入库规则未定义**:本仓库不是 git 仓库，没有 `.gitignore`，无法用 VCS 区分源码与 `lib/` 产物；改动 `src/` 后必须重新 `build` 才能生效（DSH 加载的是 `lib/`）。
- **Browser 侧 bundle 纯净门禁**:`tsdown.config.ts` 里的 `dsh-client-bundle-purity` 会把非共享平台的 `@deepseek-ai/*` 值导入判为构建错误，跨插件协作走 cordis service；`scripts/copy-webui.mjs` 负责把 `src/webui/` 复制进 `lib/webui/`。
- 改动 `settings.yaml` / web profile 依赖（README 的安装步骤）属于宿主环境变更，不在本仓库文件范围内；不要为验证插件去扰动正在运行的 DSH web 进程。

## 构建与验收

包管理器 **pnpm**（依据 `pnpm-lock.yaml`）；Node 要求 `^22.19.0 || >=24.0.0`。命令来自 `package.json#scripts`：

- `pnpm run build` — `tsdown && node scripts/copy-webui.mjs`（node 侧 `lib/index.js` + `lib/invariant.js`，browser 侧 `lib/client.js`，并复制 WebUI）
- `pnpm run typecheck` — `tsc -p tsconfig.json --noEmit`
- `prepare` — `npm run build`（安装时自动触发）

**本仓库没有 `test` script，也没有测试框架依赖**：验收只能靠 typecheck + build + 真机 WebUI 手测。生图观感、翻译质量属体验判断，交给主人确认。

## 文档路由

- 项目状态、权威版本、里程碑与风险看 `PROJECT_INDEX.md`。
- 动态上下文放 `docs/context/`（`NOW.md` 当前状态 / `MAP.md` 资产地图 / `RUNBOOK.md` 运行验收 / `DECISIONS.md` 设计决策 / `RISKS.md` 风险陷阱），旧内容进 `history/`。
- **本仓库既有的文档入口只有 `README.md`**（功能、安装、配置、模型清单、开发命令）与 `src/` 内各文件顶部的注释块（`src/index.ts` 记录路由、credentials key 与默认模型；`src/gallery.ts`、`src/store.ts` 记录落盘契约）；本仓库目前没有 `docs/` 目录。
