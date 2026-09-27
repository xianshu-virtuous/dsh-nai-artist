# PROJECT_INDEX — dsh-nai-artist

> 最后核验日期:**2026-09-24**（本次核验为只读：读文件 + 目录清点，未构建、未测试、未改动任何源码）

## 项目定位

DSH 绘画插件：`paint` 工具把自然语言描述翻译成 NovelAI tags 后调生图模型，图片以对话内卡片形式返回（sticker 同款机制）；同一份源码还带一个 WebUI 工作台，支持翻译预览、手改 NAI tags、参数调整（模型/分辨率/steps/seed/scale/采样器/base tags/负向 prompt）、生图与历史画廊，入口是输入框右侧 🎨 按钮或 `/nai-artist` 路由。

## 权威版本

- `package.json#name` = `@dsh-external/dsh-nai-artist`，`version` = **0.1.1**，`type: module`，license MIT
- 入口:`lib/index.js`、`lib/invariant.js`、`lib/client.js`、`lib/webui/index.html`
- Node `^22.19.0 || >=24.0.0`；包管理器 pnpm；运行时依赖 `@deepseek-ai/dsh-home-paths`（0.1.5-rc.2）
- 默认生图模型 `nai-v5-full-limit`；WebUI 可选 `nai-v5-full(-limit)`、`nai-v5-curated(-limit)`、`nai-v4.5-full(-limit)`、`nai-v4.5-curated-limit`、`gpt-image-2-lyc`
- 源码结构:`src/{index,nai,gallery,store,invariant}.ts` + `src/client/`（React 卡片与入口按钮）+ `src/webui/index.html`

## 活动里程碑

**非 git 仓库，无提交历史**（仓库根无 `.git`，本次核验未取得任何提交记录）。

## 主要阻塞或风险（观察到的）

- **无版本控制**:不是 git 仓库、也没有 `.gitignore`，任何改动无法 diff、无回退点，源码与 `lib/` 构建产物混在同一目录且无边界记录。改动前建议先复制备份。
- **`package.json#files` 声明了 `LICENSE`，但仓库根目录没有该文件**（声明 MIT）：一旦打包发布，产物会缺文件。
- **没有测试**:`package.json#scripts` 只有 `build` / `typecheck` / `prepare`，devDependencies 也无 vitest，验收只能靠 typecheck + build + 真机 WebUI 手测，回归风险靠手测兜。
- **运行时依赖宿主配置**:密钥来自 `~/.dsh/.credentials.yaml`（`IKUN_PAINT_API_KEY`、`IKUN_DEEPSEEK_API_KEY`），服务参数来自 `settings.yaml` 的 `llm-pi-ai` 配置，装到 web profile 后需重启 DSH web 进程才生效——这些都在仓库之外，仓库内看不到当前是否配好。
- **`src/` 与 `lib/` 可能不同步**：DSH 加载 `lib/`，改 `src/` 后不 `build` 就不生效；本仓库无 VCS 可比对两者差异。

## 专题文档链接

- `AGENTS.md` — 稳定规则、构建验收命令、密钥与发布边界
- `README.md` — 功能、安装（web profile + `cordis.patch.yml`）、配置、模型清单、开发命令
- 代码内契约注释:`src/index.ts`（路由、credentials key、默认模型）、`src/gallery.ts`（画廊落盘与淘汰）、`src/store.ts`（`config.json` 非机密参数）
- 动态上下文（尚未创建，按需建立）:`docs/context/NOW.md` / `MAP.md` / `RUNBOOK.md` / `DECISIONS.md` / `RISKS.md`，旧内容进 `history/`
