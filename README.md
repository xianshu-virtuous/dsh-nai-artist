# dsh-nai-artist

DSH 绘画插件：`paint` 工具 + 同源 WebUI 工作台。自然语言描述 →（翻译成 NAI tags）→ NovelAI 系模型生图 → 图片直接渲染进对话（sticker 同款机制）。

## 功能

- **`paint` 工具**：对深深说"画一张……"，传自然语言描述即可，图片生成后以卡片形式出现在对话里。
- **WebUI 工作台**（GUI 输入框右侧 🎨 按钮，或直接访问 `/nai-artist`）：翻译预览、手动编辑 NAI tags、参数调整（模型/分辨率/steps/seed/scale/采样器/base tags/负向 prompt）、生图、历史画廊。
- **画廊**：生成图片落盘 `<plugin home>/gallery/`，WebUI 可查看/删除，自动按上限淘汰最旧作品。

## 安装

在 web profile（`~/.dsh/profiles/web/package.json`）的 dependencies 里加入：

```json
"@dsh-external/dsh-nai-artist": "link:F:/dsh/dsh-nai-artist"
```

并在 `~/.dsh/settings.yaml` 的 bundle 部分插入 `cordis.patch.yml`（或按 DSH 外部插件挂载流程操作），然后 `pnpm install` 并重启 DSH web 进程。

## 配置

在 `~/.dsh/.credentials.yaml` 中配置三个 key：

```yaml
IKUN_PAINT_API_KEY: sk-xxx          # 生图 key（gpt-image-2 / nai-* 模型）
IKUN_DEEPSEEK_API_KEY: sk-xxx       # 翻译 key（deepseek-v4-flash-tokenrhythm）
```

服务级配置走 `settings.yaml` 的 `llm-pi-ai` 插件配置（enabled / baseURL / translateModel / paintModels / defaultModel 等）；绘画默认参数（base tags、负向 prompt、分辨率、采样参数）在 WebUI 里编辑，保存于 `<plugin home>/config.json`。

## 模型

默认生图模型 `nai-v5-full-limit`，WebUI 可选：`nai-v5-full(-limit)`、`nai-v5-curated(-limit)`、`nai-v4.5-full(-limit)`、`nai-v4.5-curated-limit`、`gpt-image-2-lyc`。

## 开发

```sh
pnpm install
pnpm build      # tsdown 双构建（node lib/index.js + browser lib/client.js）+ 复制 WebUI
pnpm typecheck
```
