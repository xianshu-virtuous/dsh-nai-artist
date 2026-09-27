/**
 * Gallery persistence for dsh-nai-artist.
 *
 * Generated images live under `<plugin home>/gallery/` as PNG files plus one
 * sidecar JSON (metadata) per image; the file name is the stable gallery id.
 * The gallery is capped at `maxEntries` items, oldest first evicted.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface GalleryEntry {
  id: string
  /** ISO timestamp of generation. */
  ts: string
  model: string
  mode: 'photo' | 'drawing'
  /** The full prompt sent to the image model. */
  prompt: string
  width: number
  height: number
  /** Natural-language description (when translated). */
  description?: string
  /** Translated NAI tags (when translation ran). */
  tags?: string
}

export interface GalleryStoreOptions {
  root: string
  maxEntries: number
}

const PNG_SUFFIX = '.png'

function imagePath(root: string, id: string): string {
  return join(root, `${id}${PNG_SUFFIX}`)
}
function metaPath(root: string, id: string): string {
  return join(root, `${id}.json`)
}

export class GalleryStore {
  constructor(private readonly options: GalleryStoreOptions) {}

  async save(entry: GalleryEntry, png: Buffer): Promise<void> {
    await mkdir(this.options.root, { recursive: true })
    await writeFile(imagePath(this.options.root, entry.id), png)
    await writeFile(metaPath(this.options.root, entry.id), JSON.stringify(entry, null, 2), 'utf8')
    await this.prune()
  }

  async readPng(id: string): Promise<Buffer | null> {
    try {
      return await readFile(imagePath(this.options.root, id))
    } catch {
      return null
    }
  }

  async readEntry(id: string): Promise<GalleryEntry | null> {
    try {
      const raw = await readFile(metaPath(this.options.root, id), 'utf8')
      const parsed = JSON.parse(raw) as Partial<GalleryEntry>
      if (typeof parsed.id !== 'string' || parsed.id === '') return null
      return parsed as GalleryEntry
    } catch {
      return null
    }
  }

  async list(): Promise<GalleryEntry[]> {
    let files: string[]
    try {
      files = await readdir(this.options.root)
    } catch {
      return []
    }
    const entries: GalleryEntry[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const id = file.slice(0, -'.json'.length)
      if (files.includes(`${id}${PNG_SUFFIX}`)) {
        const entry = await this.readEntry(id)
        if (entry !== null) entries.push(entry)
      }
    }
    return entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
  }

  async remove(id: string): Promise<boolean> {
    let removed = false
    for (const path of [imagePath(this.options.root, id), metaPath(this.options.root, id)]) {
      try {
        await rm(path)
        removed = true
      } catch {
        // file absent — fine
      }
    }
    return removed
  }

  /** Evict oldest entries beyond the cap. */
  private async prune(): Promise<void> {
    const entries = await this.list()
    if (entries.length <= this.options.maxEntries) return
    for (const entry of entries.slice(this.options.maxEntries)) {
      await this.remove(entry.id)
    }
  }
}

/** A gallery id from a file name served by the web route. */
export function galleryIdFromFile(file: string): string | null {
  if (!file.endsWith(PNG_SUFFIX)) return null
  const id = file.slice(0, -PNG_SUFFIX.length)
  if (id === '' || !/^[A-Za-z0-9._-]+$/.test(id)) return null
  return id
}

/** Resolve the PNG file's on-disk size (0 when absent). */
export async function pngSize(root: string, id: string): Promise<number> {
  try {
    const info = await stat(imagePath(root, id))
    return info.size
  } catch {
    return 0
  }
}
