/**
 * Editable workbench profile for dsh-nai-artist, persisted as
 * `<plugin home>/config.json`. Defaults mirror NeoMofox's nai_artist
 * `config.py` (character / photo / drawing / nai_params sections) so the
 * plugin starts with the exact same parameters. The gateway keys themselves
 * never live here — they come from the credentials service at call time.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ModeDefaults {
  /** Tags prefixed to the translated prompt (composition guidance). */
  styleTags: string
  /** Resolution. */
  width: number
  height: number
  steps: number
}

export interface WorkbenchProfile {
  /** Default image model id. */
  model: string
  /** Character base tags (photo mode only, mirrors nai_artist character.base_tags). */
  baseTags: string
  /** Negative prompt (mirrors nai_artist character.negative_tags). */
  negative: string
  photo: ModeDefaults
  drawing: ModeDefaults
  /** Prompt guidance (mirrors nai_artist nai_params.scale). */
  scale: number
  /** CFG rescale (mirrors nai_artist nai_params.cfg_rescale). */
  cfgRescale: number
  sampler: string
  /** Noise schedule (mirrors nai_artist nai_params.noise_schedule). */
  noiseSchedule: string
  /** Negative prompt strength scaling (mirrors nai_artist nai_params.uncond_scale). */
  uncondScale: number
  /** Fixed seed; 0 = random per generation. */
  seed: number
  /** Legacy v3 extend toggle (NAI frontend parameter). */
  legacyV3Extend: boolean
  /** V4.5 quality toggle (mirrors nai_artist nai_params.quality). */
  quality: boolean
  /** Negative preset id as string (mirrors nai_artist nai_params.uc_preset). */
  ucPreset: string
  /** sm / sm_dyn presets (mirrors nai_artist nai_params). */
  sm: boolean
  smDyn: boolean
}

export const DEFAULT_PROFILE: WorkbenchProfile = {
  model: 'nai-v5-full-limit',
  baseTags: '1girl',
  negative: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
  photo: {
    styleTags: 'masterpiece, best quality, amazing quality, anime coloring, anime illustration, soft shading, clean lineart, detailed face, detailed eyes, natural blush, candid shot, photo composition, 3::artist:ningen mame (38297201)::, artist:modare, artist:minaba_hideo, artist:chen bin, 0.4::artist:yoneyama mai::',
    width: 832,
    height: 1216,
    steps: 28,
  },
  drawing: {
    styleTags: 'masterpiece, best quality, cinematic lighting, high resolution, detailed eyes, detailed skin, elegant, delicate, translucent skin, cinematic lighting, {chen bin}, [[akakura]], {{missile228}}, hoangryu, luma li',
    width: 832,
    height: 1216,
    steps: 28,
  },
  scale: 6.5,
  cfgRescale: 0.0,
  sampler: 'k_euler_ancestral',
  noiseSchedule: 'karras',
  uncondScale: 0,
  seed: 0,
  legacyV3Extend: false,
  quality: true,
  ucPreset: '0',
  sm: false,
  smDyn: false,
}

/** Style hint appended to the translation prompt per mode (mirrors nai_artist action._STYLE_HINTS). */
export function styleHintForMode(mode: 'photo' | 'drawing'): string {
  return mode === 'photo'
    ? 'photo composition, candid shot, natural pose, varied framing'
    : 'hand-drawn composition, sketchbook layout, illustration framing'
}

/**
 * Merge tag groups in order, keeping order and de-duplicating case-insensitively
 * (mirrors nai_artist service._merge_prompt_tags).
 */
export function mergePromptTags(...groups: string[]): string {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const raw of group.split(',')) {
      const tag = raw.trim()
      if (!tag) continue
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(tag)
    }
  }
  return merged.join(', ')
}

/** Merge user-supplied profile over defaults (shallow per top-level field). */
export function sanitizeProfile(input: unknown): WorkbenchProfile {
  const base = structuredClone(DEFAULT_PROFILE)
  if (typeof input !== 'object' || input === null) return base
  const raw = input as Record<string, unknown>
  const str = (value: unknown, fallback: string): string => typeof value === 'string' ? value : fallback
  const num = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const bool = (value: unknown, fallback: boolean): boolean => typeof value === 'boolean' ? value : fallback
  base.model = str(raw.model, base.model)
  base.baseTags = str(raw.baseTags, base.baseTags)
  base.negative = str(raw.negative, base.negative)
  base.scale = num(raw.scale, base.scale)
  base.cfgRescale = num(raw.cfgRescale, base.cfgRescale)
  base.sampler = str(raw.sampler, base.sampler)
  base.noiseSchedule = str(raw.noiseSchedule, base.noiseSchedule)
  base.uncondScale = num(raw.uncondScale, base.uncondScale)
  base.seed = num(raw.seed, base.seed)
  base.legacyV3Extend = bool(raw.legacyV3Extend, base.legacyV3Extend)
  base.quality = bool(raw.quality, base.quality)
  base.ucPreset = str(raw.ucPreset, base.ucPreset)
  base.sm = bool(raw.sm, base.sm)
  base.smDyn = bool(raw.smDyn, base.smDyn)
  const photo = typeof raw.photo === 'object' && raw.photo !== null ? raw.photo as Record<string, unknown> : {}
  const drawing = typeof raw.drawing === 'object' && raw.drawing !== null ? raw.drawing as Record<string, unknown> : {}
  for (const [key, target] of [['photo', base.photo], ['drawing', base.drawing]] as const) {
    const source = key === 'photo' ? photo : drawing
    target.styleTags = str(source.styleTags, target.styleTags)
    target.width = num(source.width, target.width)
    target.height = num(source.height, target.height)
    target.steps = num(source.steps, target.steps)
  }
  return base
}

export class ProfileStore {
  constructor(private readonly root: string) {}

  private get file(): string {
    return join(this.root, 'config.json')
  }

  async load(): Promise<WorkbenchProfile> {
    try {
      const raw = await readFile(this.file, 'utf8')
      return sanitizeProfile(JSON.parse(raw) as unknown)
    } catch {
      return structuredClone(DEFAULT_PROFILE)
    }
  }

  async save(profile: WorkbenchProfile): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await writeFile(this.file, JSON.stringify(profile, null, 2), 'utf8')
  }
}
