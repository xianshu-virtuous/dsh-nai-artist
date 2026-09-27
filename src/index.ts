/**
 * dsh-nai-artist — 绘画插件（NAI Artist for DSH）。
 *
 * 提供 `paint` 工具与配套 WebUI：
 * - 自然语言描述 →（IKUN key2 翻译）→ NAI tags →（IKUN key3 生图）→ 画廊
 * - 图片以 `/api/dsh-nai-artist/gallery/<id>.png` 提供，client 端 toolview 卡片
 *   把结果图渲染进对话（同 send_sticker 的机制）。
 * - WebUI 工作台挂在同源 `/nai-artist`，支持翻译预览 / 参数编辑 / 生图 / 历史。
 *
 * Keys 来自 credentials 服务（.credentials.yaml）：
 * - IKUN_PAINT_API_KEY（key3，生图）
 * - IKUN_DEEPSEEK_API_KEY（key2，翻译）
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { GalleryStore, type GalleryEntry } from './gallery.ts'
import { ProfileStore, sanitizeProfile, styleHintForMode, mergePromptTags } from './store.ts'
import { generateImage, translateToTags } from './nai.ts'

export const name = '@dsh-external/dsh-nai-artist'
export const inject = ['tools', 'credentials']

export interface Config {
  /** Master switch; default true. */
  enabled?: boolean
  /** IKUN gateway base URL. */
  baseURL?: string
  /** Credentials env name carrying the paint (image) key. */
  paintKeyEnv?: string
  /** Credentials env name carrying the translation key. */
  translateKeyEnv?: string
  /** Chat model used for NAI-tag translation. */
  translateModel?: string
  /** Paint models offered by the WebUI. */
  paintModels?: string[]
  /** Default paint model (must be in paintModels). */
  defaultModel?: string
  /** Per-request timeout for gateway calls. */
  requestTimeoutMs?: number
  /** Gallery entry cap. */
  maxGalleryEntries?: number
}

const GALLERY_URL = '/api/dsh-nai-artist/gallery'

const DEFAULT_CONFIG = {
  baseURL: 'http://47.108.250.118:3000/v1',
  paintKeyEnv: 'IKUN_PAINT_API_KEY',
  translateKeyEnv: 'IKUN_DEEPSEEK_API_KEY',
  translateModel: 'deepseek-v4-flash-tokenrhythm',
  paintModels: [
    'nai-v5-full-limit', 'nai-v5-full', 'nai-v5-curated-limit', 'nai-v5-curated',
    'nai-v4.5-full-limit', 'nai-v4.5-full', 'nai-v4.5-curated-limit',
    'gpt-image-2-lyc',
  ],
  defaultModel: 'nai-v5-full-limit',
  requestTimeoutMs: 120_000,
  maxGalleryEntries: 100,
} as const

/** Paint result shape shared by the tool and the WebUI generate endpoint. */
export interface PaintResult {
  ok: boolean
  imageUrl?: string
  galleryId?: string
  prompt?: string
  model?: string
  mode?: 'photo' | 'drawing'
  width?: number
  height?: number
  translatedTags?: string
  error?: string
}

export interface PaintInput {
  description: string
  mode?: 'photo' | 'drawing'
  translate?: boolean
  /** Pre-translated NAI tags (from the WebUI editor); skips translation. */
  tags?: string
  model?: string
  width?: number
  height?: number
  steps?: number
  seed?: number
  negative?: string
}

export interface TranslateInput {
  description: string
  mode?: 'photo' | 'drawing'
}

export interface TranslateResult {
  ok: boolean
  tags?: string
  finalPrompt?: string
  mode?: 'photo' | 'drawing'
  error?: string
}

export function apply(ctx: Context, config: Config = {}): void {
  const cfg = {
    baseURL: config.baseURL ?? DEFAULT_CONFIG.baseURL,
    paintKeyEnv: config.paintKeyEnv ?? DEFAULT_CONFIG.paintKeyEnv,
    translateKeyEnv: config.translateKeyEnv ?? DEFAULT_CONFIG.translateKeyEnv,
    translateModel: config.translateModel ?? DEFAULT_CONFIG.translateModel,
    paintModels: config.paintModels ?? [...DEFAULT_CONFIG.paintModels],
    defaultModel: config.defaultModel ?? DEFAULT_CONFIG.defaultModel,
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs,
    maxGalleryEntries: config.maxGalleryEntries ?? DEFAULT_CONFIG.maxGalleryEntries,
  }

  const homeDir = dshHomePath('plugins', 'dsh-nai-artist')
  const gallery = new GalleryStore({ root: join(homeDir, 'gallery'), maxEntries: cfg.maxGalleryEntries })
  const profileStore = new ProfileStore(homeDir)

  async function resolveKey(envName: string, label: string): Promise<string> {
    const resolved = await ctx.credentials.resolve(credentialRef(envName))
    if (resolved === undefined || resolved.value === '') {
      throw new Error(`未配置 ${label}（${envName}）——请在 .credentials.yaml 中设置后再用`)
    }
    return resolved.value
  }

  /** 翻译 → 拼最终 prompt（WebUI 预览与生图共用）。 */
  async function runTranslate(input: TranslateInput, signal?: AbortSignal): Promise<TranslateResult> {
    const mode = input.mode === 'drawing' ? 'drawing' as const : 'photo' as const
    try {
      const profile = await profileStore.load()
      const translateKey = await resolveKey(cfg.translateKeyEnv, '翻译 key')
      const tags = await translateToTags({
        baseURL: cfg.baseURL,
        apiKey: translateKey,
        model: cfg.translateModel,
        description: input.description,
        styleHint: styleHintForMode(mode),
        timeoutMs: cfg.requestTimeoutMs,
        signal,
      })
      const defaults = mode === 'photo' ? profile.photo : profile.drawing
      // photo: style → base → tags；drawing: style → tags（不绑定 base tags，照抄 nai_artist build_final_prompt）
      const finalPrompt = mode === 'photo'
        ? mergePromptTags(defaults.styleTags, profile.baseTags, tags)
        : mergePromptTags(defaults.styleTags, tags)
      return { ok: true, tags, finalPrompt, mode }
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : String(error), mode }
    }
  }

  /** 完整生图流程（paint 工具与 WebUI generate 端点共用）。 */
  async function runPaint(input: PaintInput, signal?: AbortSignal): Promise<PaintResult> {
    const mode = input.mode === 'drawing' ? 'drawing' as const : 'photo' as const
    try {
      const profile = await profileStore.load()
      const defaults = mode === 'photo' ? profile.photo : profile.drawing
      const model = input.model !== undefined && input.model !== '' ? input.model : cfg.defaultModel

      let finalPrompt: string
      let translatedTags: string | undefined
      const compose = (tags: string): string => mode === 'photo'
        ? mergePromptTags(defaults.styleTags, profile.baseTags, tags)
        : mergePromptTags(defaults.styleTags, tags)
      if (input.translate === false) {
        finalPrompt = input.description.trim()
      } else if (input.tags !== undefined && input.tags.trim() !== '') {
        translatedTags = input.tags.trim()
        finalPrompt = compose(translatedTags)
      } else {
        const translateKey = await resolveKey(cfg.translateKeyEnv, '翻译 key')
        translatedTags = await translateToTags({
          baseURL: cfg.baseURL,
          apiKey: translateKey,
          model: cfg.translateModel,
          description: input.description,
          styleHint: styleHintForMode(mode),
          timeoutMs: cfg.requestTimeoutMs,
          signal,
        })
        finalPrompt = compose(translatedTags)
      }

      const paintKey = await resolveKey(cfg.paintKeyEnv, '生图 key')
      const seed = input.seed !== undefined && input.seed !== 0 ? input.seed : (profile.seed !== 0 ? profile.seed : undefined)
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
        signal,
      })

      const id = `${Date.now()}-${randomBytes(3).toString('hex')}`
      const entry: GalleryEntry = {
        id,
        ts: new Date().toISOString(),
        model,
        mode,
        prompt: finalPrompt,
        width: generated.width,
        height: generated.height,
        description: input.translate === false ? undefined : input.description,
        tags: translatedTags,
      }
      await gallery.save(entry, Buffer.from(generated.b64, 'base64'))

      // 工具系统对返回值做无损 JSON 校验：undefined 字段会被序列化丢弃导致失败，
      // 因此只在有值时设置可选字段。
      const result: PaintResult = {
        ok: true,
        imageUrl: `${GALLERY_URL}/${id}.png`,
        galleryId: id,
        prompt: finalPrompt,
        model,
        mode,
        width: generated.width,
        height: generated.height,
      }
      if (translatedTags !== undefined) result.translatedTags = translatedTags
      return result
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // ---------- paint tool ----------
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'paint',
    description: '生成一张 AI 图片并在对话里展示（NovelAI 系模型）。传入自然语言画面描述，插件会先翻译成 NAI 标签再生图；也可以传已经写好的英文 tags 并设 translate=false 跳过翻译。',
    parameters: {
      description: {
        type: 'string',
        description: '画面描述：自然语言（中/英文均可）或已是完整英文 Danbooru/NAI tags。',
      },
      mode: {
        type: 'string',
        description: 'photo=真实照片感，drawing=插画感。默认 photo。',
      },
      translate: {
        type: 'boolean',
        description: '是否把 description 翻译成 NAI tags。默认 true；description 已是完整 tags 时传 false。',
      },
      model: {
        type: 'string',
        description: '生图模型覆盖（可选），如 nai-v5-full-limit / gpt-image-2-lyc。',
      },
      width: { type: 'number', description: '图片宽度（可选，默认 832）。' },
      height: { type: 'number', description: '图片高度（可选，默认 1216）。' },
      steps: { type: 'number', description: '采样步数（可选，默认 28）。' },
      seed: { type: 'number', description: '固定随机种子（可选，0=随机）。' },
      negative: { type: 'string', description: '反向提示词覆盖（可选）。' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          imageUrl: { type: 'string' },
          galleryId: { type: 'string' },
          prompt: { type: 'string' },
          model: { type: 'string' },
          mode: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
          translatedTags: { type: 'string' },
          error: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => {
        if (value.ok !== true) {
          return [{ type: 'text', text: `绘画失败：${value.error ?? '未知错误'}` }]
        }
        const lines = [
          '[paint-result]',
          `url: ${value.imageUrl ?? ''}`,
          `model: ${value.model ?? ''}`,
          value.translatedTags !== undefined && value.translatedTags !== '' ? `tags: ${value.translatedTags}` : null,
          `prompt: ${value.prompt ?? ''}`,
        ]
        return [{ type: 'text', text: lines.filter((line): line is string => line !== null).join('\n') }]
      },
    },
    presentCall: (args) => ({ card: 'generic', title: `绘画·${args?.mode === 'drawing' ? '插画' : '照片'}「${truncate(String(args?.description ?? ''), 24)}」` }),
    execute: async (args, exec) => runPaint({
      description: String(args?.description ?? ''),
      mode: args?.mode === 'drawing' ? 'drawing' : 'photo',
      translate: args?.translate !== false,
      model: typeof args?.model === 'string' ? args.model : undefined,
      width: typeof args?.width === 'number' ? args.width : undefined,
      height: typeof args?.height === 'number' ? args.height : undefined,
      steps: typeof args?.steps === 'number' ? args.steps : undefined,
      seed: typeof args?.seed === 'number' ? args.seed : undefined,
      negative: typeof args?.negative === 'string' ? args.negative : undefined,
    }, exec.signal),
  })), 'dsh-nai-artist: paint tool')

  // ---------- HTTP routes ----------
  let cachedWebUi: string | null = null
  let cachedWebUiError: string | null = null
  async function webUiHtml(): Promise<string> {
    if (cachedWebUi !== null) return cachedWebUi
    if (cachedWebUiError !== null) return cachedWebUiError
    try {
      const url = new URL('./webui/index.html', import.meta.url)
      cachedWebUi = await readFile(url, 'utf8')
      return cachedWebUi
    } catch (error: unknown) {
      cachedWebUiError = `<html><body><h1>WebUI 未构建</h1><p>${error instanceof Error ? error.message : String(error)}</p><p>请运行 pnpm build 生成 lib/webui/index.html 后重启 DSH。</p></body></html>`
      return cachedWebUiError
    }
  }

  function sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.writeHead(status)
    response.end(JSON.stringify(body))
  }

  ctx.inject(['webServer'], (scope: Context) => {
    // WebUI workbench page
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/nai-artist',
      handler: async (_request, response) => {
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.setHeader('cache-control', 'no-store')
        response.writeHead(200)
        response.end(await webUiHtml())
      },
    }), 'dsh-nai-artist: workbench page')

    // Generated gallery images
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: GALLERY_URL,
      handler: async (request, response) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const relative = decodeURIComponent(pathname.slice(GALLERY_URL.length + 1))
        if (relative === '' || !relative.endsWith('.png')) {
          response.writeHead(404); response.end('not found'); return
        }
        const id = relative.slice(0, -'.png'.length)
        if (id === '' || !/^[A-Za-z0-9._-]+$/.test(id)) {
          response.writeHead(404); response.end('not found'); return
        }
        const png = await gallery.readPng(id)
        if (png === null) {
          response.writeHead(404); response.end('not found'); return
        }
        response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
        response.end(png)
      },
    }), 'dsh-nai-artist: gallery image route')

    // History listing
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: `${GALLERY_URL}/history`,
      handler: async (_request, response) => {
        sendJson(response, 200, { entries: await gallery.list() })
      },
    }), 'dsh-nai-artist: history route')

    // Delete one gallery entry
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: `${GALLERY_URL}/delete`,
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' }); response.end(); return
        }
        try {
          const body = await readJsonBody(request, 4096) as { id?: unknown }
          const id = typeof body?.id === 'string' ? body.id : ''
          const removed = id !== '' && /^[A-Za-z0-9._-]+$/.test(id) ? await gallery.remove(id) : false
          sendJson(response, 200, { ok: removed })
        } catch (error: unknown) {
          sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'dsh-nai-artist: delete route')

    // Workbench config: GET current profile + service view, PUT persist profile
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/api/dsh-nai-artist/config',
      handler: async (request, response) => {
        if (request.method === 'GET') {
          const profile = await profileStore.load()
          const paintKey = await ctx.credentials.resolve(credentialRef(cfg.paintKeyEnv))
          const translateKey = await ctx.credentials.resolve(credentialRef(cfg.translateKeyEnv))
          sendJson(response, 200, {
            profile,
            service: {
              models: cfg.paintModels,
              defaultModel: cfg.defaultModel,
              translateModel: cfg.translateModel,
              baseURL: cfg.baseURL,
              paintKeyConfigured: paintKey !== undefined && paintKey.value !== '',
              translateKeyConfigured: translateKey !== undefined && translateKey.value !== '',
            },
          })
          return
        }
        if (request.method !== 'PUT') {
          response.writeHead(405, { allow: 'GET, PUT' }); response.end(); return
        }
        if (request.headers['x-dsh-nai-artist'] !== '1'
          || !String(request.headers['content-type'] ?? '').startsWith('application/json')) {
          response.writeHead(403); response.end('same-origin configuration request required'); return
        }
        try {
          const body = await readJsonBody(request, 64 * 1024) as unknown
          const profile = sanitizeProfile(body)
          await profileStore.save(profile)
          sendJson(response, 200, { saved: true })
        } catch (error: unknown) {
          sendJson(response, 400, { saved: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'dsh-nai-artist: config route')

    // Translate preview
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/api/dsh-nai-artist/translate',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' }); response.end(); return
        }
        try {
          const body = await readJsonBody(request, 64 * 1024) as { description?: unknown; mode?: unknown }
          if (typeof body?.description !== 'string' || body.description.trim() === '') {
            sendJson(response, 400, { ok: false, error: '缺少 description' }); return
          }
          const result = await runTranslate({ description: body.description, mode: body.mode === 'drawing' ? 'drawing' : 'photo' })
          sendJson(response, result.ok ? 200 : 502, result)
        } catch (error: unknown) {
          sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'dsh-nai-artist: translate route')

    // Generate via the WebUI
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/api/dsh-nai-artist/generate',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' }); response.end(); return
        }
        try {
          const body = await readJsonBody(request, 64 * 1024) as {
            description?: unknown; mode?: unknown; translate?: unknown; tags?: unknown; model?: unknown
            width?: unknown; height?: unknown; steps?: unknown; seed?: unknown; negative?: unknown
          }
          if (typeof body?.description !== 'string' || body.description.trim() === '') {
            sendJson(response, 400, { ok: false, error: '缺少 description' }); return
          }
          const result = await runPaint({
            description: body.description,
            mode: body.mode === 'drawing' ? 'drawing' : 'photo',
            translate: body.translate !== false,
            tags: typeof body.tags === 'string' ? body.tags : undefined,
            model: typeof body.model === 'string' ? body.model : undefined,
            width: typeof body.width === 'number' ? body.width : undefined,
            height: typeof body.height === 'number' ? body.height : undefined,
            steps: typeof body.steps === 'number' ? body.steps : undefined,
            seed: typeof body.seed === 'number' ? body.seed : undefined,
            negative: typeof body.negative === 'string' ? body.negative : undefined,
          })
          sendJson(response, result.ok ? 200 : 502, result)
        } catch (error: unknown) {
          sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'dsh-nai-artist: generate route')
  })
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

async function readJsonBody(request: AsyncIterable<Uint8Array>, maxBytes: number): Promise<unknown> {
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.byteLength
    if (bytes > maxBytes) throw new Error(`request body exceeds ${maxBytes} bytes`)
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
