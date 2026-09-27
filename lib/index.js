import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
//#region src/gallery.ts
/**
* Gallery persistence for dsh-nai-artist.
*
* Generated images live under `<plugin home>/gallery/` as PNG files plus one
* sidecar JSON (metadata) per image; the file name is the stable gallery id.
* The gallery is capped at `maxEntries` items, oldest first evicted.
*/
const PNG_SUFFIX = ".png";
function imagePath(root, id) {
	return join(root, `${id}${PNG_SUFFIX}`);
}
function metaPath(root, id) {
	return join(root, `${id}.json`);
}
var GalleryStore = class {
	options;
	constructor(options) {
		this.options = options;
	}
	async save(entry, png) {
		await mkdir(this.options.root, { recursive: true });
		await writeFile(imagePath(this.options.root, entry.id), png);
		await writeFile(metaPath(this.options.root, entry.id), JSON.stringify(entry, null, 2), "utf8");
		await this.prune();
	}
	async readPng(id) {
		try {
			return await readFile(imagePath(this.options.root, id));
		} catch {
			return null;
		}
	}
	async readEntry(id) {
		try {
			const raw = await readFile(metaPath(this.options.root, id), "utf8");
			const parsed = JSON.parse(raw);
			if (typeof parsed.id !== "string" || parsed.id === "") return null;
			return parsed;
		} catch {
			return null;
		}
	}
	async list() {
		let files;
		try {
			files = await readdir(this.options.root);
		} catch {
			return [];
		}
		const entries = [];
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			const id = file.slice(0, -5);
			if (files.includes(`${id}${PNG_SUFFIX}`)) {
				const entry = await this.readEntry(id);
				if (entry !== null) entries.push(entry);
			}
		}
		return entries.sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
	}
	async remove(id) {
		let removed = false;
		for (const path of [imagePath(this.options.root, id), metaPath(this.options.root, id)]) try {
			await rm(path);
			removed = true;
		} catch {}
		return removed;
	}
	/** Evict oldest entries beyond the cap. */
	async prune() {
		const entries = await this.list();
		if (entries.length <= this.options.maxEntries) return;
		for (const entry of entries.slice(this.options.maxEntries)) await this.remove(entry.id);
	}
};
//#endregion
//#region src/store.ts
/**
* Editable workbench profile for dsh-nai-artist, persisted as
* `<plugin home>/config.json`. Defaults mirror NeoMofox's nai_artist
* `config.py` (character / photo / drawing / nai_params sections) so the
* plugin starts with the exact same parameters. The gateway keys themselves
* never live here — they come from the credentials service at call time.
*/
const DEFAULT_PROFILE = {
	model: "nai-v5-full-limit",
	baseTags: "1girl",
	negative: "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
	photo: {
		styleTags: "masterpiece, best quality, amazing quality, anime coloring, anime illustration, soft shading, clean lineart, detailed face, detailed eyes, natural blush, candid shot, photo composition, 3::artist:ningen mame (38297201)::, artist:modare, artist:minaba_hideo, artist:chen bin, 0.4::artist:yoneyama mai::",
		width: 832,
		height: 1216,
		steps: 28
	},
	drawing: {
		styleTags: "masterpiece, best quality, cinematic lighting, high resolution, detailed eyes, detailed skin, elegant, delicate, translucent skin, cinematic lighting, {chen bin}, [[akakura]], {{missile228}}, hoangryu, luma li",
		width: 832,
		height: 1216,
		steps: 28
	},
	scale: 6.5,
	cfgRescale: 0,
	sampler: "k_euler_ancestral",
	noiseSchedule: "karras",
	uncondScale: 0,
	seed: 0,
	legacyV3Extend: false,
	quality: true,
	ucPreset: "0",
	sm: false,
	smDyn: false
};
/** Style hint appended to the translation prompt per mode (mirrors nai_artist action._STYLE_HINTS). */
function styleHintForMode(mode) {
	return mode === "photo" ? "photo composition, candid shot, natural pose, varied framing" : "hand-drawn composition, sketchbook layout, illustration framing";
}
/**
* Merge tag groups in order, keeping order and de-duplicating case-insensitively
* (mirrors nai_artist service._merge_prompt_tags).
*/
function mergePromptTags(...groups) {
	const merged = [];
	const seen = /* @__PURE__ */ new Set();
	for (const group of groups) for (const raw of group.split(",")) {
		const tag = raw.trim();
		if (!tag) continue;
		const key = tag.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(tag);
	}
	return merged.join(", ");
}
/** Merge user-supplied profile over defaults (shallow per top-level field). */
function sanitizeProfile(input) {
	const base = structuredClone(DEFAULT_PROFILE);
	if (typeof input !== "object" || input === null) return base;
	const raw = input;
	const str = (value, fallback) => typeof value === "string" ? value : fallback;
	const num = (value, fallback) => {
		const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
		return Number.isFinite(n) ? n : fallback;
	};
	const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;
	base.model = str(raw.model, base.model);
	base.baseTags = str(raw.baseTags, base.baseTags);
	base.negative = str(raw.negative, base.negative);
	base.scale = num(raw.scale, base.scale);
	base.cfgRescale = num(raw.cfgRescale, base.cfgRescale);
	base.sampler = str(raw.sampler, base.sampler);
	base.noiseSchedule = str(raw.noiseSchedule, base.noiseSchedule);
	base.uncondScale = num(raw.uncondScale, base.uncondScale);
	base.seed = num(raw.seed, base.seed);
	base.legacyV3Extend = bool(raw.legacyV3Extend, base.legacyV3Extend);
	base.quality = bool(raw.quality, base.quality);
	base.ucPreset = str(raw.ucPreset, base.ucPreset);
	base.sm = bool(raw.sm, base.sm);
	base.smDyn = bool(raw.smDyn, base.smDyn);
	const photo = typeof raw.photo === "object" && raw.photo !== null ? raw.photo : {};
	const drawing = typeof raw.drawing === "object" && raw.drawing !== null ? raw.drawing : {};
	for (const [key, target] of [["photo", base.photo], ["drawing", base.drawing]]) {
		const source = key === "photo" ? photo : drawing;
		target.styleTags = str(source.styleTags, target.styleTags);
		target.width = num(source.width, target.width);
		target.height = num(source.height, target.height);
		target.steps = num(source.steps, target.steps);
	}
	return base;
}
var ProfileStore = class {
	root;
	constructor(root) {
		this.root = root;
	}
	get file() {
		return join(this.root, "config.json");
	}
	async load() {
		try {
			const raw = await readFile(this.file, "utf8");
			return sanitizeProfile(JSON.parse(raw));
		} catch {
			return structuredClone(DEFAULT_PROFILE);
		}
	}
	async save(profile) {
		await mkdir(this.root, { recursive: true });
		await writeFile(this.file, JSON.stringify(profile, null, 2), "utf8");
	}
};
//#endregion
//#region src/nai.ts
/**
* IKUN gateway client for dsh-nai-artist: NAI-tag translation through the
* chat-completions endpoint and image generation through the OpenAI-format
* images endpoint. The gateway is a OneAPI/NewAPI deployment; the images
* endpoint follows the standard OpenAI `images/generations` contract and
* accepts NovelAI parameter names alongside it (width/height/steps/scale).
*/
/** Translation system prompt, distilled from nai_artist's prompt_builder. */
const TRANSLATE_SYSTEM_PROMPT = `你是 NovelAI 绘画提示词专家，精通 Danbooru 标签与 NAI 语法。
输入来自用户的自然语言画面描述。

- 只输出纯英文提示词，不添加质量词、画师词、反向词，不解释。
- 你的任务不是"理解后概括"，而是"逐点转译，不丢信息"。

工作流程：
1. 通读描述，理解画面整体情境。
2. 逐个提取"能在画面中看到的具体信息点"（物体、姿态、光线、角度、表情、场景）。
3. 肢体归属（强制规则）：描述中的手、脚、腿、胳膊、手指等默认属于角色本人；自触场景必须使用带 own 的标签（holding own leg、holding own ankle、arm around own body、hands on own body 等），禁止使用不带 own 的泛化标签（holding leg、hand on ankle 会让人体模型误判为他人肢体或第二只手）；仅当明确描述"另一个人的手"时才不用 own。
4. 视角与人物：全身照、半身照、含面部画面加 solo, 1girl/1boy；纯局部特写（只有脚/手/背影）不加 solo，用对应部位标签；第一人称视角（你看到/你低头看到）加 pov 不加 solo；视线按描述输出 looking at viewer / looking away / looking down / looking up；性别默认 1girl。
5. 补全必要信息：缺失光源时补合理光源标签；背景过于笼统时细化具体元素让画面不单调；必须加入 year 2025。
6. NSFW 判定（严格）：仅当描述明确包含具体性器官词汇（penis/vagina/testicles/anus）、性行为动作（penetration/oral/masturbation/fucking）、明确暴露的乳头乳晕（nipples/areola）或下体（exposed pussy/exposed asshole/cameltoe）时，在最前面添加 nsfw 并正常翻译；仅暧昧、暗示不算。
7. 检查：输出的标签组合起来能否还原原描述？每个信息点是否有对应标签？

输出：逗号分隔的英文 tags，一行，无解释。`;
/** Translate a natural-language description into NAI tags via chat completions. */
async function translateToTags(options) {
	const body = {
		model: options.model,
		messages: [{
			role: "system",
			content: TRANSLATE_SYSTEM_PROMPT
		}, {
			role: "user",
			content: `Convert the following description into booru-style English tags for NovelAI.\n\nDescription:\n${options.description}\n\nStyle hint:\n${options.styleHint}\n\nRequired workflow:\n1. Identify subject count, identity type, and scene type.\n2. If a known character is named, use the canonical character tag and avoid default appearance traits unless explicitly changed.\n3. Preserve user-provided traits and explicit English tags.\n4. Convert the scene into concise, visual, Danbooru-style tags.\n5. If helpful, enhance non-identity details such as framing, lighting, pose refinement, atmosphere, and simple environment cues.\n6. Do not invent identity-defining traits for another character.\n7. Output only the final comma-separated tags.`
		}],
		max_tokens: 2048,
		temperature: .5
	};
	const response = await fetch(`${options.baseURL}/chat/completions`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${options.apiKey}`,
			"content-type": "application/json"
		},
		body: JSON.stringify(body),
		signal: options.signal === void 0 ? AbortSignal.timeout(options.timeoutMs) : AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)])
	});
	const payload = await readJson(response);
	if (!response.ok) throw new Error(`翻译失败（${response.status}）：${describeError(payload)}`);
	const content = payload?.choices?.[0]?.message?.content;
	if (typeof content !== "string" || content.trim() === "") throw new Error("翻译失败：模型返回空内容");
	return content.trim();
}
/**
* Generate one image through the OpenAI-format images endpoint.
* NovelAI-specific params go into a nested `params` object (IKUN-style
* gateway), mirroring nai_artist service._via_openai_image.
*/
async function generateImage(options) {
	const params = {};
	if (options.steps !== void 0) params.steps = options.steps;
	if (options.scale !== void 0) params.scale = options.scale;
	if (options.cfgRescale !== void 0) params.cfg_rescale = options.cfgRescale;
	if (options.sampler !== void 0 && options.sampler !== "") params.sampler = options.sampler;
	if (options.noiseSchedule !== void 0 && options.noiseSchedule !== "") params.noise_schedule = options.noiseSchedule;
	if (options.uncondScale !== void 0) params.uncond_scale = options.uncondScale;
	if (options.negative !== void 0 && options.negative !== "") params.negative_prompt = options.negative;
	if (options.quality !== void 0) params.quality = options.quality;
	if (options.ucPreset !== void 0 && options.ucPreset !== "") params.uc_preset = String(options.ucPreset);
	if (options.sm !== void 0) params.sm = options.sm;
	if (options.smDyn !== void 0) params.sm_dyn = options.smDyn;
	if (options.seed !== void 0 && options.seed !== 0) params.seed = options.seed;
	const size = options.width !== void 0 && options.height !== void 0 ? `${options.width}x${options.height}` : void 0;
	const body = {
		model: options.model,
		prompt: options.prompt,
		n: 1,
		response_format: "b64_json"
	};
	if (size !== void 0) body.size = size;
	if (Object.keys(params).length > 0) body.params = params;
	const response = await fetch(`${options.baseURL}/images/generations`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${options.apiKey}`,
			"content-type": "application/json"
		},
		body: JSON.stringify(body),
		signal: options.signal === void 0 ? AbortSignal.timeout(options.timeoutMs) : AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)])
	});
	const payload = await readJson(response);
	if (!response.ok) throw new Error(`生图失败（${response.status}）：${describeError(payload)}`);
	const item = payload?.data?.[0];
	const b64 = typeof item?.b64_json === "string" ? item.b64_json : "";
	if (b64 === "") throw new Error("生图失败：响应中没有图片数据");
	return {
		b64,
		width: typeof item?.width === "number" ? item.width : options.width ?? 0,
		height: typeof item?.height === "number" ? item.height : options.height ?? 0
	};
}
async function readJson(response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}
function describeError(payload) {
	const error = payload?.error;
	if (error?.message) return error.code === void 0 ? error.message : `${error.message} [${error.code}]`;
	return String(payload ?? responseStatusTextFallback);
}
const responseStatusTextFallback = "未知错误";
//#endregion
//#region src/index.ts
const name = "@dsh-external/dsh-nai-artist";
const inject = ["tools", "credentials"];
const GALLERY_URL = "/api/dsh-nai-artist/gallery";
const DEFAULT_CONFIG = {
	baseURL: "http://47.108.250.118:3000/v1",
	paintKeyEnv: "IKUN_PAINT_API_KEY",
	translateKeyEnv: "IKUN_DEEPSEEK_API_KEY",
	translateModel: "deepseek-v4-flash-tokenrhythm",
	paintModels: [
		"nai-v5-full-limit",
		"nai-v5-full",
		"nai-v5-curated-limit",
		"nai-v5-curated",
		"nai-v4.5-full-limit",
		"nai-v4.5-full",
		"nai-v4.5-curated-limit",
		"gpt-image-2-lyc"
	],
	defaultModel: "nai-v5-full-limit",
	requestTimeoutMs: 12e4,
	maxGalleryEntries: 100
};
function apply(ctx, config = {}) {
	const cfg = {
		baseURL: config.baseURL ?? DEFAULT_CONFIG.baseURL,
		paintKeyEnv: config.paintKeyEnv ?? DEFAULT_CONFIG.paintKeyEnv,
		translateKeyEnv: config.translateKeyEnv ?? DEFAULT_CONFIG.translateKeyEnv,
		translateModel: config.translateModel ?? DEFAULT_CONFIG.translateModel,
		paintModels: config.paintModels ?? [...DEFAULT_CONFIG.paintModels],
		defaultModel: config.defaultModel ?? DEFAULT_CONFIG.defaultModel,
		requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs,
		maxGalleryEntries: config.maxGalleryEntries ?? DEFAULT_CONFIG.maxGalleryEntries
	};
	const homeDir = dshHomePath("plugins", "dsh-nai-artist");
	const gallery = new GalleryStore({
		root: join(homeDir, "gallery"),
		maxEntries: cfg.maxGalleryEntries
	});
	const profileStore = new ProfileStore(homeDir);
	async function resolveKey(envName, label) {
		const resolved = await ctx.credentials.resolve(credentialRef(envName));
		if (resolved === void 0 || resolved.value === "") throw new Error(`未配置 ${label}（${envName}）——请在 .credentials.yaml 中设置后再用`);
		return resolved.value;
	}
	/** 翻译 → 拼最终 prompt（WebUI 预览与生图共用）。 */
	async function runTranslate(input, signal) {
		const mode = input.mode === "drawing" ? "drawing" : "photo";
		try {
			const profile = await profileStore.load();
			const translateKey = await resolveKey(cfg.translateKeyEnv, "翻译 key");
			const tags = await translateToTags({
				baseURL: cfg.baseURL,
				apiKey: translateKey,
				model: cfg.translateModel,
				description: input.description,
				styleHint: styleHintForMode(mode),
				timeoutMs: cfg.requestTimeoutMs,
				signal
			});
			const defaults = mode === "photo" ? profile.photo : profile.drawing;
			return {
				ok: true,
				tags,
				finalPrompt: mode === "photo" ? mergePromptTags(defaults.styleTags, profile.baseTags, tags) : mergePromptTags(defaults.styleTags, tags),
				mode
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
				mode
			};
		}
	}
	/** 完整生图流程（paint 工具与 WebUI generate 端点共用）。 */
	async function runPaint(input, signal) {
		const mode = input.mode === "drawing" ? "drawing" : "photo";
		try {
			const profile = await profileStore.load();
			const defaults = mode === "photo" ? profile.photo : profile.drawing;
			const model = input.model !== void 0 && input.model !== "" ? input.model : cfg.defaultModel;
			let finalPrompt;
			let translatedTags;
			const compose = (tags) => mode === "photo" ? mergePromptTags(defaults.styleTags, profile.baseTags, tags) : mergePromptTags(defaults.styleTags, tags);
			if (input.translate === false) finalPrompt = input.description.trim();
			else if (input.tags !== void 0 && input.tags.trim() !== "") {
				translatedTags = input.tags.trim();
				finalPrompt = compose(translatedTags);
			} else {
				const translateKey = await resolveKey(cfg.translateKeyEnv, "翻译 key");
				translatedTags = await translateToTags({
					baseURL: cfg.baseURL,
					apiKey: translateKey,
					model: cfg.translateModel,
					description: input.description,
					styleHint: styleHintForMode(mode),
					timeoutMs: cfg.requestTimeoutMs,
					signal
				});
				finalPrompt = compose(translatedTags);
			}
			const paintKey = await resolveKey(cfg.paintKeyEnv, "生图 key");
			const seed = input.seed !== void 0 && input.seed !== 0 ? input.seed : profile.seed !== 0 ? profile.seed : void 0;
			const generated = await generateImage({
				baseURL: cfg.baseURL,
				apiKey: paintKey,
				model,
				prompt: finalPrompt,
				negative: input.negative ?? profile.negative,
				width: input.width ?? defaults.width,
				height: input.height ?? defaults.height,
				steps: input.steps ?? defaults.steps,
				scale: profile.scale,
				cfgRescale: profile.cfgRescale,
				sampler: profile.sampler,
				noiseSchedule: profile.noiseSchedule,
				uncondScale: profile.uncondScale,
				quality: profile.quality,
				ucPreset: profile.ucPreset,
				sm: profile.sm,
				smDyn: profile.smDyn,
				seed,
				timeoutMs: cfg.requestTimeoutMs,
				signal
			});
			const id = `${Date.now()}-${randomBytes(3).toString("hex")}`;
			const entry = {
				id,
				ts: (/* @__PURE__ */ new Date()).toISOString(),
				model,
				mode,
				prompt: finalPrompt,
				width: generated.width,
				height: generated.height,
				description: input.translate === false ? void 0 : input.description,
				tags: translatedTags
			};
			await gallery.save(entry, Buffer.from(generated.b64, "base64"));
			const result = {
				ok: true,
				imageUrl: `${GALLERY_URL}/${id}.png`,
				galleryId: id,
				prompt: finalPrompt,
				model,
				mode,
				width: generated.width,
				height: generated.height
			};
			if (translatedTags !== void 0) result.translatedTags = translatedTags;
			return result;
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "paint",
		description: "生成一张 AI 图片并在对话里展示（NovelAI 系模型）。传入自然语言画面描述，插件会先翻译成 NAI 标签再生图；也可以传已经写好的英文 tags 并设 translate=false 跳过翻译。",
		parameters: {
			description: {
				type: "string",
				description: "画面描述：自然语言（中/英文均可）或已是完整英文 Danbooru/NAI tags。"
			},
			mode: {
				type: "string",
				description: "photo=真实照片感，drawing=插画感。默认 photo。"
			},
			translate: {
				type: "boolean",
				description: "是否把 description 翻译成 NAI tags。默认 true；description 已是完整 tags 时传 false。"
			},
			model: {
				type: "string",
				description: "生图模型覆盖（可选），如 nai-v5-full-limit / gpt-image-2-lyc。"
			},
			width: {
				type: "number",
				description: "图片宽度（可选，默认 832）。"
			},
			height: {
				type: "number",
				description: "图片高度（可选，默认 1216）。"
			},
			steps: {
				type: "number",
				description: "采样步数（可选，默认 28）。"
			},
			seed: {
				type: "number",
				description: "固定随机种子（可选，0=随机）。"
			},
			negative: {
				type: "string",
				description: "反向提示词覆盖（可选）。"
			}
		},
		output: {
			schema: {
				type: "object",
				properties: {
					ok: { type: "boolean" },
					imageUrl: { type: "string" },
					galleryId: { type: "string" },
					prompt: { type: "string" },
					model: { type: "string" },
					mode: { type: "string" },
					width: { type: "number" },
					height: { type: "number" },
					translatedTags: { type: "string" },
					error: { type: "string" }
				},
				additionalProperties: false
			},
			render: (_args, value) => {
				if (value.ok !== true) return [{
					type: "text",
					text: `绘画失败：${value.error ?? "未知错误"}`
				}];
				return [{
					type: "text",
					text: [
						"[paint-result]",
						`url: ${value.imageUrl ?? ""}`,
						`model: ${value.model ?? ""}`,
						value.translatedTags !== void 0 && value.translatedTags !== "" ? `tags: ${value.translatedTags}` : null,
						`prompt: ${value.prompt ?? ""}`
					].filter((line) => line !== null).join("\n")
				}];
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `绘画·${args?.mode === "drawing" ? "插画" : "照片"}「${truncate(String(args?.description ?? ""), 24)}」`
		}),
		execute: async (args, exec) => runPaint({
			description: String(args?.description ?? ""),
			mode: args?.mode === "drawing" ? "drawing" : "photo",
			translate: args?.translate !== false,
			model: typeof args?.model === "string" ? args.model : void 0,
			width: typeof args?.width === "number" ? args.width : void 0,
			height: typeof args?.height === "number" ? args.height : void 0,
			steps: typeof args?.steps === "number" ? args.steps : void 0,
			seed: typeof args?.seed === "number" ? args.seed : void 0,
			negative: typeof args?.negative === "string" ? args.negative : void 0
		}, exec.signal)
	})), "dsh-nai-artist: paint tool");
	let cachedWebUi = null;
	let cachedWebUiError = null;
	async function webUiHtml() {
		if (cachedWebUi !== null) return cachedWebUi;
		if (cachedWebUiError !== null) return cachedWebUiError;
		try {
			const url = new URL("./webui/index.html", import.meta.url);
			cachedWebUi = await readFile(url, "utf8");
			return cachedWebUi;
		} catch (error) {
			cachedWebUiError = `<html><body><h1>WebUI 未构建</h1><p>${error instanceof Error ? error.message : String(error)}</p><p>请运行 pnpm build 生成 lib/webui/index.html 后重启 DSH。</p></body></html>`;
			return cachedWebUiError;
		}
	}
	function sendJson(response, status, body) {
		response.setHeader("cache-control", "no-store");
		response.setHeader("content-type", "application/json; charset=utf-8");
		response.writeHead(status);
		response.end(JSON.stringify(body));
	}
	ctx.inject(["webServer"], (scope) => {
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/nai-artist",
			handler: async (_request, response) => {
				response.setHeader("content-type", "text/html; charset=utf-8");
				response.setHeader("cache-control", "no-store");
				response.writeHead(200);
				response.end(await webUiHtml());
			}
		}), "dsh-nai-artist: workbench page");
		scope.effect(() => scope.webServer.register({
			kind: "prefix",
			path: GALLERY_URL,
			handler: async (request, response) => {
				const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
				const relative = decodeURIComponent(pathname.slice(28));
				if (relative === "" || !relative.endsWith(".png")) {
					response.writeHead(404);
					response.end("not found");
					return;
				}
				const id = relative.slice(0, -4);
				if (id === "" || !/^[A-Za-z0-9._-]+$/.test(id)) {
					response.writeHead(404);
					response.end("not found");
					return;
				}
				const png = await gallery.readPng(id);
				if (png === null) {
					response.writeHead(404);
					response.end("not found");
					return;
				}
				response.writeHead(200, {
					"content-type": "image/png",
					"cache-control": "public, max-age=86400"
				});
				response.end(png);
			}
		}), "dsh-nai-artist: gallery image route");
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: `${GALLERY_URL}/history`,
			handler: async (_request, response) => {
				sendJson(response, 200, { entries: await gallery.list() });
			}
		}), "dsh-nai-artist: history route");
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: `${GALLERY_URL}/delete`,
			handler: async (request, response) => {
				if (request.method !== "POST") {
					response.writeHead(405, { allow: "POST" });
					response.end();
					return;
				}
				try {
					const body = await readJsonBody(request, 4096);
					const id = typeof body?.id === "string" ? body.id : "";
					sendJson(response, 200, { ok: id !== "" && /^[A-Za-z0-9._-]+$/.test(id) ? await gallery.remove(id) : false });
				} catch (error) {
					sendJson(response, 400, {
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}), "dsh-nai-artist: delete route");
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/api/dsh-nai-artist/config",
			handler: async (request, response) => {
				if (request.method === "GET") {
					const profile = await profileStore.load();
					const paintKey = await ctx.credentials.resolve(credentialRef(cfg.paintKeyEnv));
					const translateKey = await ctx.credentials.resolve(credentialRef(cfg.translateKeyEnv));
					sendJson(response, 200, {
						profile,
						service: {
							models: cfg.paintModels,
							defaultModel: cfg.defaultModel,
							translateModel: cfg.translateModel,
							baseURL: cfg.baseURL,
							paintKeyConfigured: paintKey !== void 0 && paintKey.value !== "",
							translateKeyConfigured: translateKey !== void 0 && translateKey.value !== ""
						}
					});
					return;
				}
				if (request.method !== "PUT") {
					response.writeHead(405, { allow: "GET, PUT" });
					response.end();
					return;
				}
				if (request.headers["x-dsh-nai-artist"] !== "1" || !String(request.headers["content-type"] ?? "").startsWith("application/json")) {
					response.writeHead(403);
					response.end("same-origin configuration request required");
					return;
				}
				try {
					const profile = sanitizeProfile(await readJsonBody(request, 65536));
					await profileStore.save(profile);
					sendJson(response, 200, { saved: true });
				} catch (error) {
					sendJson(response, 400, {
						saved: false,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}), "dsh-nai-artist: config route");
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/api/dsh-nai-artist/translate",
			handler: async (request, response) => {
				if (request.method !== "POST") {
					response.writeHead(405, { allow: "POST" });
					response.end();
					return;
				}
				try {
					const body = await readJsonBody(request, 65536);
					if (typeof body?.description !== "string" || body.description.trim() === "") {
						sendJson(response, 400, {
							ok: false,
							error: "缺少 description"
						});
						return;
					}
					const result = await runTranslate({
						description: body.description,
						mode: body.mode === "drawing" ? "drawing" : "photo"
					});
					sendJson(response, result.ok ? 200 : 502, result);
				} catch (error) {
					sendJson(response, 400, {
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}), "dsh-nai-artist: translate route");
		scope.effect(() => scope.webServer.register({
			kind: "exact",
			path: "/api/dsh-nai-artist/generate",
			handler: async (request, response) => {
				if (request.method !== "POST") {
					response.writeHead(405, { allow: "POST" });
					response.end();
					return;
				}
				try {
					const body = await readJsonBody(request, 65536);
					if (typeof body?.description !== "string" || body.description.trim() === "") {
						sendJson(response, 400, {
							ok: false,
							error: "缺少 description"
						});
						return;
					}
					const result = await runPaint({
						description: body.description,
						mode: body.mode === "drawing" ? "drawing" : "photo",
						translate: body.translate !== false,
						tags: typeof body.tags === "string" ? body.tags : void 0,
						model: typeof body.model === "string" ? body.model : void 0,
						width: typeof body.width === "number" ? body.width : void 0,
						height: typeof body.height === "number" ? body.height : void 0,
						steps: typeof body.steps === "number" ? body.steps : void 0,
						seed: typeof body.seed === "number" ? body.seed : void 0,
						negative: typeof body.negative === "string" ? body.negative : void 0
					});
					sendJson(response, result.ok ? 200 : 502, result);
				} catch (error) {
					sendJson(response, 400, {
						ok: false,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}
		}), "dsh-nai-artist: generate route");
	});
}
function truncate(text, max) {
	return text.length <= max ? text : `${text.slice(0, max)}…`;
}
async function readJsonBody(request, maxBytes) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of request) {
		bytes += chunk.byteLength;
		if (bytes > maxBytes) throw new Error(`request body exceeds ${maxBytes} bytes`);
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
//#endregion
export { apply, inject, name };
