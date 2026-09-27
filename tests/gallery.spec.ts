import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GalleryStore, galleryIdFromFile, pngSize, type GalleryEntry } from '../src/gallery.ts'

let root: string

function entry(id: string, ts: string): GalleryEntry {
  return { id, ts, model: 'nai-v5-full-limit', mode: 'drawing', prompt: 'x', width: 832, height: 1216 }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nai-gallery-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('galleryIdFromFile', () => {
  it('accepts a plain png name', () => {
    expect(galleryIdFromFile('abc-1.png')).toBe('abc-1')
  })

  it('rejects non-png names', () => {
    expect(galleryIdFromFile('abc.json')).toBeNull()
    expect(galleryIdFromFile('abc.jpg')).toBeNull()
  })

  it('rejects empty and path-like ids', () => {
    expect(galleryIdFromFile('.png')).toBeNull()
    expect(galleryIdFromFile('../etc/passwd.png')).toBeNull()
    expect(galleryIdFromFile('a/b.png')).toBeNull()
  })
})

describe('GalleryStore', () => {
  it('saves the png with its sidecar and lists newest first', async () => {
    const store = new GalleryStore({ root, maxEntries: 10 })
    await store.save(entry('old', '2026-01-01T00:00:00.000Z'), Buffer.from('a'))
    await store.save(entry('new', '2026-02-01T00:00:00.000Z'), Buffer.from('b'))

    const list = await store.list()
    expect(list.map(item => item.id)).toEqual(['new', 'old'])
    expect(await store.readPng('old')).toEqual(Buffer.from('a'))
    expect((await store.readEntry('new'))?.mode).toBe('drawing')
  })

  it('evicts the oldest entries beyond the cap', async () => {
    const store = new GalleryStore({ root, maxEntries: 2 })
    const seeded = [
      ['a', '2026-01-01T00:00:00.000Z'],
      ['b', '2026-02-01T00:00:00.000Z'],
      ['c', '2026-03-01T00:00:00.000Z'],
    ] as const
    for (const [id, ts] of seeded) await store.save(entry(id, ts), Buffer.from(id))

    expect((await store.list()).map(item => item.id)).toEqual(['c', 'b'])
    expect(await store.readPng('a')).toBeNull()
    expect(await pngSize(root, 'a')).toBe(0)
  })

  it('ignores a sidecar whose png is missing', async () => {
    const store = new GalleryStore({ root, maxEntries: 10 })
    await writeFile(join(root, 'orphan.json'), JSON.stringify(entry('orphan', '2026-01-01T00:00:00.000Z')), 'utf8')

    expect(await store.list()).toEqual([])
  })

  it('returns an empty list for a missing gallery root', async () => {
    const store = new GalleryStore({ root: join(root, 'nope'), maxEntries: 10 })
    expect(await store.list()).toEqual([])
  })

  it('ignores a corrupt sidecar', async () => {
    const store = new GalleryStore({ root, maxEntries: 10 })
    await writeFile(join(root, 'bad.png'), Buffer.from('x'))
    await writeFile(join(root, 'bad.json'), '{ not json', 'utf8')

    expect(await store.readEntry('bad')).toBeNull()
    expect(await store.list()).toEqual([])
  })

  it('removes both files and reports whether anything was removed', async () => {
    const store = new GalleryStore({ root, maxEntries: 10 })
    await store.save(entry('keep', '2026-01-01T00:00:00.000Z'), Buffer.from('k'))

    expect(await store.remove('keep')).toBe(true)
    expect(await store.remove('keep')).toBe(false)
    expect(await store.readPng('keep')).toBeNull()
  })
})
