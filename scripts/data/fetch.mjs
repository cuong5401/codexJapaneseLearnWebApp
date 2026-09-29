// Explicit acquisition only. npm run build never invokes this file.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { digest, LEVELS } from './format.mjs'

const root = resolve('data-sources')
const revision = process.env.OPENJLPT_REVISION || 'c42fd9fa3777bfc1775446f7c418d549dfd6e4cf'
const fetchedAt = new Date().toISOString()
const sources = []
async function acquire(url, path) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) })
  if (!response.ok) throw new Error(`${response.status} acquiring ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes)
  sources.push({ path: path.slice(root.length + 1).replaceAll('\\', '/'), url, sha256: digest(bytes), bytes: bytes.length, fetchedAt, lastModified: response.headers.get('last-modified') })
  console.log(`Acquired ${url}: ${bytes.length.toLocaleString()} bytes`)
}
// Source licenses must have been reviewed before changing this acquisition list.
for (const file of ['LICENSE', 'NOTICE.md']) await acquire(`https://raw.githubusercontent.com/evanclan/OpenJLPT/${revision}/${file}`, resolve(root, 'openjlpt', file))
for (const category of ['vocab', 'kanji', 'grammar']) for (const level of LEVELS) {
  await acquire(`https://raw.githubusercontent.com/evanclan/OpenJLPT/${revision}/data/json/${category}/${level.toLowerCase()}.json`, resolve(root, 'openjlpt', category, `${level.toLowerCase()}.json`))
}
await acquire('https://www.edrdg.org/pub/Nihongo/JMdict_e.gz', resolve(root, 'JMdict_e.gz'))
await writeFile(resolve(root, 'source-lock.json'), JSON.stringify({ schemaVersion: 1, openjlptRevision: revision, fetchedAt, files: sources }, null, 2) + '\n')
// Keep a small reproducibility ledger in the repository; raw files stay local.
await mkdir('scripts/data', { recursive: true })
await writeFile('scripts/data/source-lock.json', await readFile(resolve(root, 'source-lock.json')))
