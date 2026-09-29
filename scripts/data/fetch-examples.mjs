import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit maintenance command only. No application build imports this module.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sourceDirectory = path.resolve(repositoryRoot, process.env.KOTOBA_SOURCE_DIR || 'data-sources')
const cacheDirectory = path.join(sourceDirectory, 'tatoeba-requests')
const outputFile = path.join(sourceDirectory, 'tatoeba.json')
const refresh = process.argv.includes('--refresh')
const supportedLicenses = new Set(['CC BY 2.0 FR', 'CC0 1.0'])
const requiredWords = ['推薦', '推奨', '改善', '影響', '省略', '把握', '検討', '対応', '促進', '進捗', '上昇', '読解']
const levels = ['n5', 'n4', 'n3', 'n2', 'n1']
const queryWords = new Set(requiredWords)

for (const level of levels) {
  const records = JSON.parse(await readFile(path.join(sourceDirectory, 'openjlpt', 'vocab', `${level}.json`), 'utf8'))
  if (!Array.isArray(records)) throw new Error(`OpenJLPT ${level} vocabulary must be an array.`)
  const words = [...new Set(records
    .map((record) => record.word)
    .filter((word) => typeof word === 'string' && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{2,8}$/u.test(word) && /\p{Script=Han}/u.test(word)))]
  const sampleCount = Math.min(24, words.length)
  for (let index = 0; index < sampleCount; index += 1) {
    queryWords.add(words[Math.floor(index * (words.length - 1) / Math.max(1, sampleCount - 1))])
  }
}

await mkdir(cacheDirectory, { recursive: true })
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function requestExamples(word) {
  const url = new URL('https://api.tatoeba.org/v1/sentences')
  for (const [key, value] of Object.entries({
    lang: 'jpn', q: word, sort: 'relevance', limit: '8',
    is_unapproved: 'no', is_orphan: 'no', license: 'CC BY 2.0 FR,CC0 1.0',
    'trans:lang': 'eng', 'trans:is_direct': 'yes', 'trans:is_orphan': 'no', 'trans:is_unapproved': 'no',
  })) url.searchParams.set(key, value)

  const cacheKey = createHash('sha256').update(url.href).digest('hex')
  const cacheFile = path.join(cacheDirectory, `${cacheKey}.json`)
  if (!refresh) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
      if (cached.url === url.href && Array.isArray(cached.data)) return cached
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Kotoba-reference-data-maintenance/1.0' },
      signal: AbortSignal.timeout(30_000),
    })
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await wait(Math.max(1_000 * 2 ** attempt, Number(response.headers.get('retry-after') || 0) * 1_000))
      continue
    }
    if (!response.ok) throw new Error(`Tatoeba returned ${response.status} for ${word}`)
    const result = await response.json()
    if (!Array.isArray(result.data)) throw new Error(`Invalid Tatoeba response for ${word}`)
    const cached = { url: url.href, fetchedAt: new Date().toISOString(), data: result.data }
    await writeFile(cacheFile, `${JSON.stringify(cached)}\n`, 'utf8')
    return cached
  }
  throw new Error(`Could not acquire Tatoeba examples for ${word}`)
}

function acceptedSentence(sentence, language) {
  return sentence && sentence.lang === language && Number.isSafeInteger(sentence.id) && sentence.id > 0
    && typeof sentence.text === 'string' && sentence.text.trim().length > 0
    && sentence.text.length <= (language === 'jpn' ? 100 : 240)
    && typeof sentence.owner === 'string' && sentence.owner.length > 0
    && supportedLicenses.has(sentence.license) && sentence.is_unapproved === false
}

function attribution(sentence) {
  return {
    id: sentence.id,
    text: sentence.text,
    owner: sentence.owner,
    license: sentence.license,
    url: `https://tatoeba.org/en/sentences/show/${sentence.id}`,
  }
}

const entries = []
const requests = []
const words = [...queryWords]
let nextIndex = 0
let completed = 0
async function worker() {
  while (nextIndex < words.length) {
    const word = words[nextIndex++]
    const result = await requestExamples(word)
    requests.push({ word, url: result.url, fetchedAt: result.fetchedAt })
    let selected = 0
    for (const sentence of result.data) {
      if (!acceptedSentence(sentence, 'jpn') || !sentence.text.includes(word)) continue
      const english = sentence.translations?.find((translation) => acceptedSentence(translation, 'eng') && translation.is_direct === true)
      if (!english) continue
      entries.push({ word, japanese: attribution(sentence), english: attribution(english) })
      selected += 1
      if (selected === 2) break
    }
    completed += 1
    if (completed % 20 === 0 || completed === words.length) console.log(`Tatoeba: ${completed}/${words.length} queries, ${entries.length} linked examples`)
    await wait(250)
  }
}

// Three requests at most; reusable per-query cache allows recovery after interruption.
await Promise.all([worker(), worker(), worker()])
entries.sort((a, b) => a.word < b.word ? -1 : a.word > b.word ? 1 : a.japanese.id - b.japanese.id || a.english.id - b.english.id)
requests.sort((a, b) => a.word < b.word ? -1 : a.word > b.word ? 1 : 0)
if (entries.length === 0) throw new Error('No attributed Tatoeba examples acquired; existing snapshot is retained.')
const snapshot = {
  schemaVersion: 1,
  sourceDatasetId: 'tatoeba',
  fetchedAt: requests.map((request) => request.fetchedAt).sort().at(-1),
  sourceUrl: 'https://api.tatoeba.org/v1/sentences',
  attribution: 'Tatoeba contributors; individual sentence owners and licenses are retained per Japanese and English text.',
  selection: 'Up to 2 direct Japanese–English pairs per required vocabulary word and a deterministic sample of up to 24 words per OpenJLPT level. Exact written-word containment is checked; semantic sense alignment is not guaranteed.',
  requests,
  entries,
}
await writeFile(`${outputFile}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
await rename(`${outputFile}.tmp`, outputFile)
console.log(`Saved ${entries.length} attributed Tatoeba pairs to ${path.relative(repositoryRoot, outputFile)}`)
