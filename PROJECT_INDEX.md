# PROJECT_INDEX — dsh-nai-artist

> 最后核验日期：**2026-09-27**（`pnpm run typecheck` / `pnpm test` 19 用例 / `pnpm run build` 全绿；已公开推送）

## 项目定位

DSH 绘画插件：`paint` 工具把自然语言描述翻译成 NovelAI tags 后调生图模型，图片以对话内卡片形式返回（sticker 同款机制）；同一份源码还带一个 WebUI 工作台，支持翻译预览、手改 NAI tags、参数调整（模型/分辨率/steps/seed/scale/采样器/base tags/负向 prompt）、生图与历史画廊，入口是输入框右侧 🎨 按钮或 `/nai-artist` 路由。

## 权威版本

- `package.json#name` = `@dsh-external/dsh-nai-artist`，`version` = **0.1.1**，`type: module`，license MIT
- **远端**：<https://github.com/xianshu-virtuous/dsh-nai-artist>（public；topics：`dsh-plugin` `deepseek-harness`）
- 入口：`lib/index.js`、`lib/invariant.js`、`lib/client.js`、`lib/webui/index.html`
- Node `^22.19.0 || >=24.0.0`；包管理器 pnpm；运行时依赖 `@deepseek-ai/dsh-home-paths`
- 源码结构：`src/{index,nai,gallery,store,invariant}.ts` + `src/client/`（React 卡片与入口按钮）+ `src/webui/index.html`
- 测试：`tests/gallery.spec.ts`、`tests/store.spec.ts`（19 用例，vitest）

## 活动里程碑

- `2026-09-27` — 首次纳入版本控制并按模块分组提交（13 个提交：scaffold → host 五个模块 → client → webui → lib → docs → lock），同日公开推送。
- `2026-09-27` — 达标修复：补齐根目录 `LICENSE`（此前 `files` 声明了它但文件不存在）、新增 `.gitignore`、**移除安装期 `prepare`**、补 `@deepseek-ai/dsh-client-ui-chat` 类型依赖（修掉 `PaintToolCard` 的隐式 `any`）、补 vitest 测试。
- 收录推进：收录 PR 待提（awesome 列表要求仓库创建满 1 天），素材见工作区 `docs/context/awesome-submission/`。

## 主要阻塞或风险

- **密钥边界**：密钥只走 credentials 服务（`IKUN_PAINT_API_KEY` 生图、`IKUN_DEEPSEEK_API_KEY` 翻译），密钥值、token、账号**不得**出现在仓库任何文件、日志或提交信息里；`store.ts` 管理的 `config.json` 只存非机密参数。
- **用户数据**：生成图片进 `<plugin home>/gallery/`（PNG + 同名 sidecar JSON，按 `maxEntries` 由旧到新淘汰），非机密参数进 `<plugin home>/config.json`——都在仓库之外，不得提交。
- **`lib/` 是已跟踪的构建产物**：改 `src/` 后必须 `pnpm run build` 再提交，DSH 加载的是 `lib/`。
- **不得声明安装期生命周期脚本**（`prepare` / `postinstall`）：pnpm 10+ 会拦截依赖的构建脚本（需 `allowBuilds`）而使 `dsh plugin add` 失败，插件市场也据此判为不可安装。
- **测试覆盖有限**：单元测试只覆盖 gallery 淘汰与 profile 归一化；生图观感、翻译质量属体验判断，交给主人确认（真机 WebUI 手测）。
- 运行时依赖宿主配置（`~/.dsh/.credentials.yaml`、`settings.yaml` 的 `llm-pi-ai`），装到 web profile 后需重启 DSH web 进程才生效——不要为验证插件去扰动正在运行的进程。

## 专题文档链接

- `AGENTS.md` — 稳定规则、构建验收命令、密钥与发布边界
- `README.md` — 功能、安装（web profile + `cordis.patch.yml`）、配置、模型清单、开发命令
- 代码内契约注释：`src/index.ts`（路由、credentials key、默认模型）、`src/gallery.ts`（画廊落盘与淘汰）、`src/store.ts`（`config.json` 非机密参数）
- 动态上下文：`docs/context/`（尚未创建，按需建立 NOW / MAP / RUNBOOK / DECISIONS / RISKS）
