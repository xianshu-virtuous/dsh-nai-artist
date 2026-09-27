/**
 * IKUN gateway client for dsh-nai-artist: NAI-tag translation through the
 * chat-completions endpoint and image generation through the OpenAI-format
 * images endpoint. The gateway is a OneAPI/NewAPI deployment; the images
 * endpoint follows the standard OpenAI `images/generations` contract and
 * accepts NovelAI parameter names alongside it (width/height/steps/scale).
 */

/** Translation system prompt, distilled from nai_artist's prompt_builder. */
export const TRANSLATE_SYSTEM_PROMPT = `你是 NovelAI 绘画提示词专家，精通 Danbooru 标签与 NAI 语法。
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

输出：逗号分隔的英文 tags，一行，无解释。`

export interface TranslateOptions {
  baseURL: string
  apiKey: string
  model: string
  description: string
  styleHint: string
  timeoutMs: number
  signal?: AbortSignal
}

/** Translate a natural-language description into NAI tags via chat completions. */
export async function translateToTags(options: TranslateOptions): Promise<string> {
  const body = {
    model: options.model,
    messages: [
      { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
      { role: 'user', content: `Convert the following description into booru-style English tags for NovelAI.\n\nDescription:\n${options.description}\n\nStyle hint:\n${options.styleHint}\n\nRequired workflow:\n1. Identify subject count, identity type, and scene type.\n2. If a known character is named, use the canonical character tag and avoid default appearance traits unless explicitly changed.\n3. Preserve user-provided traits and explicit English tags.\n4. Convert the scene into concise, visual, Danbooru-style tags.\n5. If helpful, enhance non-identity details such as framing, lighting, pose refinement, atmosphere, and simple environment cues.\n6. Do not invent identity-defining traits for another character.\n7. Output only the final comma-separated tags.` },
    ],
    max_tokens: 2048,
    temperature: 0.5,
  }
  const response = await fetch(`${options.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal === undefined ? AbortSignal.timeout(options.timeoutMs) : AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)]),
  })
  const payload = await readJson(response) as ChatCompletionPayload | null
  if (!response.ok) {
    throw new Error(`翻译失败（${response.status}）：${describeError(payload)}`)
  }
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('翻译失败：模型返回空内容')
  }
  return content.trim()
}

export interface GenerateOptions {
  baseURL: string
  apiKey: string
  model: string
  prompt: string
  negative?: string
  width?: number
  height?: number
  steps?: number
  scale?: number
  cfgRescale?: number
  sampler?: string
  noiseSchedule?: string
  uncondScale?: number
  quality?: boolean
  ucPreset?: string
  sm?: boolean
  smDyn?: boolean
  seed?: number
  timeoutMs: number
  signal?: AbortSignal
}

export interface GeneratedImage {
  /** Base64 PNG payload (no data: prefix). */
  b64: string
  width: number
  height: number
}

/**
 * Generate one image through the OpenAI-format images endpoint.
 * NovelAI-specific params go into a nested `params` object (IKUN-style
 * gateway), mirroring nai_artist service._via_openai_image.
 */
export async function generateImage(options: GenerateOptions): Promise<GeneratedImage> {
  const params: Record<string, unknown> = {}
  if (options.steps !== undefined) params.steps = options.steps
  if (options.scale !== undefined) params.scale = options.scale
  if (options.cfgRescale !== undefined) params.cfg_rescale = options.cfgRescale
  if (options.sampler !== undefined && options.sampler !== '') params.sampler = options.sampler
  if (options.noiseSchedule !== undefined && options.noiseSchedule !== '') params.noise_schedule = options.noiseSchedule
  if (options.uncondScale !== undefined) params.uncond_scale = options.uncondScale
  if (options.negative !== undefined && options.negative !== '') params.negative_prompt = options.negative
  if (options.quality !== undefined) params.quality = options.quality
  if (options.ucPreset !== undefined && options.ucPreset !== '') params.uc_preset = String(options.ucPreset)
  if (options.sm !== undefined) params.sm = options.sm
  if (options.smDyn !== undefined) params.sm_dyn = options.smDyn
  if (options.seed !== undefined && options.seed !== 0) params.seed = options.seed
  const size = (options.width !== undefined && options.height !== undefined)
    ? `${options.width}x${options.height}`
    : undefined
  const body: Record<string, unknown> = {
    model: options.model,
    prompt: options.prompt,
    n: 1,
    response_format: 'b64_json',
  }
  if (size !== undefined) body.size = size
  if (Object.keys(params).length > 0) body.params = params
  const response = await fetch(`${options.baseURL}/images/generations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal === undefined ? AbortSignal.timeout(options.timeoutMs) : AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)]),
  })
  const payload = await readJson(response) as ImageGenerationPayload | null
  if (!response.ok) {
    throw new Error(`生图失败（${response.status}）：${describeError(payload)}`)
  }
  const item = payload?.data?.[0]
  const b64 = typeof item?.b64_json === 'string' ? item.b64_json : ''
  if (b64 === '') {
    throw new Error('生图失败：响应中没有图片数据')
  }
  const width = typeof item?.width === 'number' ? item.width : (options.width ?? 0)
  const height = typeof item?.height === 'number' ? item.height : (options.height ?? 0)
  return { b64, width, height }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown
  } catch {
    return null
  }
}

interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: unknown } }>
  error?: { message?: string; code?: string }
}

interface ImageGenerationPayload {
  data?: Array<{ b64_json?: unknown; url?: unknown; width?: unknown; height?: unknown }>
  error?: { message?: string; code?: string }
}

function describeError(payload: unknown): string {
  const error = (payload as { error?: { message?: string; code?: string } } | null)?.error
  if (error?.message) return error.code === undefined ? error.message : `${error.message} [${error.code}]`
  return String(payload ?? responseStatusTextFallback)
}

const responseStatusTextFallback = '未知错误'
