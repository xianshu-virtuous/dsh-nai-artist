// Copies the standalone WebUI page into the build output so lib/index.js can
// serve it from a path relative to the bundle.
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'src', 'webui', 'index.html')
const target = join(root, 'lib', 'webui', 'index.html')

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
console.log(`copied ${source} -> ${target}`)
