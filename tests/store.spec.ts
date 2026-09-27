import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, ProfileStore, mergePromptTags, sanitizeProfile, styleHintForMode } from '../src/store.ts'

describe('mergePromptTags', () => {
  it('keeps order and drops case-insensitive duplicates', () => {
    expect(mergePromptTags('1girl, solo', 'Solo, 1girl, smile')).toBe('1girl, solo, smile')
  })

  it('trims fragments and skips empties', () => {
    expect(mergePromptTags('  a ,, b ', '')).toBe('a, b')
  })
})

describe('styleHintForMode', () => {
  it('gives each mode its own hint', () => {
    expect(styleHintForMode('photo')).not.toBe(styleHintForMode('drawing'))
  })
})

describe('sanitizeProfile', () => {
  it('falls back to defaults for non-objects', () => {
    expect(sanitizeProfile(null)).toEqual(DEFAULT_PROFILE)
    expect(sanitizeProfile('nope')).toEqual(DEFAULT_PROFILE)
  })

  it('applies valid overrides and keeps the rest', () => {
    const profile = sanitizeProfile({ model: 'nai-v4.5-full', scale: 8, quality: false })

    expect(profile.model).toBe('nai-v4.5-full')
    expect(profile.scale).toBe(8)
    expect(profile.quality).toBe(false)
    expect(profile.sampler).toBe(DEFAULT_PROFILE.sampler)
  })

  it('rejects wrong-typed values', () => {
    const profile = sanitizeProfile({ model: 42, scale: 'abc', quality: 'yes' })

    expect(profile.model).toBe(DEFAULT_PROFILE.model)
    expect(profile.scale).toBe(DEFAULT_PROFILE.scale)
    expect(profile.quality).toBe(DEFAULT_PROFILE.quality)
  })

  it('merges the nested photo and drawing groups independently', () => {
    const profile = sanitizeProfile({ photo: { width: 1024 }, drawing: { steps: 12 } })

    expect(profile.photo.width).toBe(1024)
    expect(profile.photo.steps).toBe(DEFAULT_PROFILE.photo.steps)
    expect(profile.drawing.steps).toBe(12)
    expect(profile.drawing.width).toBe(DEFAULT_PROFILE.drawing.width)
  })

  it('never mutates the shipped defaults', () => {
    sanitizeProfile({ model: 'mutated', photo: { width: 1 } })

    expect(DEFAULT_PROFILE.model).toBe('nai-v5-full-limit')
    expect(DEFAULT_PROFILE.photo.width).toBe(832)
  })
})

describe('ProfileStore', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nai-store-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('returns defaults when the config file is missing', async () => {
    expect(await new ProfileStore(join(root, 'missing')).load()).toEqual(DEFAULT_PROFILE)
  })

  it('round-trips a saved profile', async () => {
    const store = new ProfileStore(root)
    await store.save({ ...sanitizeProfile({ seed: 12345 }), model: 'nai-v5-curated' })

    const loaded = await store.load()
    expect(loaded.model).toBe('nai-v5-curated')
    expect(loaded.seed).toBe(12345)
  })
})
