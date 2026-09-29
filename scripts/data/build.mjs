import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createGunzip } from 'node:zlib'
import { TextDecoder } from 'node:util'
import { bucket, searchBucket, digest, japanese, meaning, tokens, prefixes, stableId, assert, LEVELS, RECORD_BUCKETS, INDEX_BUCKETS, POSTING_LIMIT } from './format.mjs'
import { parseJmdict, parseOpenJlpt, mergeVocabulary, normalizeGrammar, normalizeKanji } from './parsers.mjs'
import { encodeDictionaryRecord, encodeSearchShard } from './transport.mjs'
import { validateProduction } from './validate.mjs'

const root = resolve('public/data/production')
const sourceRoot = resolve('data-sources')
const sourceLock = JSON.parse(await readFile(resolve(sourceRoot, 'source-lock.json'), 'utf8'))
const transportVersion = 2
const pipelineVersion = 2
const tatoebaPath = resolve(sourceRoot, 'tatoeba.json')
const tatoebaBytes = await readFile(tatoebaPath)
const tatoeba = JSON.parse(tatoebaBytes.toString('utf8'))
const sourceDigests = []
for (const source of sourceLock.files) {
  const sha256 = digest(await readFile(resolve(sourceRoot, source.path)))
  assert(sha256 === source.sha256, `Source checksum differs: ${source.path}; reacquire and review before building`)
  sourceDigests.push({ path: source.path, sha256 })
}
const sourceFingerprint = digest(Buffer.from(JSON.stringify({
  pipelineVersion, transportVersion, recordBuckets: RECORD_BUCKETS, indexBuckets: INDEX_BUCKETS, postingLimit: POSTING_LIMIT,
  openjlptRevision: sourceLock.openjlptRevision, files: sourceDigests,
  tatoebaSha256: digest(tatoebaBytes), tatoebaFetchedAt: tatoeba.fetchedAt,
})))
if (!process.env.DATASET_VERSION) {
  try {
    const current = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
    const currentDirectory = resolve(root, current.basePath ?? '')
    if (current.pipelineVersion === pipelineVersion && current.transportVersion === transportVersion && current.sourceFingerprint === sourceFingerprint && existsSync(currentDirectory)) {
      console.log(`Source files and transport schema unchanged; reusing dataset ${current.datasetVersion}.`)
      process.exit(0)
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
}
const timestamp = new Date().toISOString()
const version = process.env.DATASET_VERSION || `${timestamp.slice(0, 10)}.${timestamp.slice(11, 19).replaceAll(':', '')}`
assert(/^[\dA-Za-z][\dA-Za-z.-]*$/.test(version), 'Unsafe dataset version')
const generatedAt = process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : new Date().toISOString()
const basePath = `versions/${version}/`
const output = resolve(root, basePath)
const versionsRoot = resolve(root, 'versions')
assert(output.startsWith(`${versionsRoot}${process.platform === 'win32' ? '\\' : '/'}`), 'Unsafe generated version path')
assert(!existsSync(output), `Dataset version already exists: ${version}; choose a new version`)
const files = []
async function emit(path, value) {
  const bytes = Buffer.from(JSON.stringify(value) + '\n', 'utf8')
  const destination = resolve(output, path)
  await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes)
  files.push({ path, bytes: bytes.length, sha256: digest(bytes), count: Array.isArray(value) ? value.length : Object.keys(value).length })
}
console.log('Parsing JMdict XML…')
const decoder = new TextDecoder('utf-8', { fatal: true })
async function* xmlChunks() {
  for await (const bytes of createReadStream(resolve(sourceRoot, 'JMdict_e.gz')).pipe(createGunzip())) yield decoder.decode(bytes, { stream: true })
  yield decoder.decode()
}
const parsed = await parseJmdict(xmlChunks(), version)
const sourceCounts = {}, sourceRows = { vocabulary: [], kanji: [], grammar: [] }
for (const level of LEVELS) {
  sourceCounts[level] = {}
  for (const category of Object.keys(sourceRows)) {
    const rows = parseOpenJlpt(JSON.parse(await readFile(resolve(sourceRoot, 'openjlpt', category === 'vocabulary' ? 'vocab' : category, `${level.toLowerCase()}.json`), 'utf8')), category, level)
    sourceRows[category].push(...rows); sourceCounts[level][category] = rows.length
  }
}
let previousIdentity = {}
try { previousIdentity = JSON.parse(await readFile('scripts/data/identity-lock.json', 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const merged = mergeVocabulary(parsed.entries, sourceRows.vocabulary, version, previousIdentity)
const dictionary = merged.dictionary
const kanjiById = new Map()
for (const row of sourceRows.kanji) {
  const normalized = normalizeKanji(row, version)
  const previous = kanjiById.get(normalized.id)
  if (!previous) kanjiById.set(normalized.id, normalized)
  else { previous.jlptAssignments.push(...normalized.jlptAssignments); if (LEVELS.indexOf(row.level) < LEVELS.indexOf(previous.jlptLevel)) previous.jlptLevel = row.level }
}
const kanji = [...kanjiById.values()]
const grammarById = new Map()
for (const row of sourceRows.grammar) {
  const normalized = normalizeGrammar(row, version)
  const previous = grammarById.get(normalized.id)
  if (!previous) grammarById.set(normalized.id, normalized)
  else {
    previous.jlptAssignments.push(...normalized.jlptAssignments)
    previous.meaningEn = [...new Set([...previous.meaningEn, ...normalized.meaningEn])]
    previous.formation = [...new Set([...previous.formation, ...normalized.formation])]
    previous.tags = [...new Set([...previous.tags, ...normalized.tags])]
    if (LEVELS.indexOf(row.level) < LEVELS.indexOf(previous.jlptLevel)) previous.jlptLevel = row.level
  }
}
const grammar = [...grammarById.values()]
const examplesMap = new Map()
for (let index = 0; index < grammar.length; index++) {
  for (const example of (sourceRows.grammar[index].examples ?? []).slice(0, 3)) {
    if (!example.ja?.trim() || !example.en?.trim()) continue
    const id = stableId('openjlpt-example', `${example.ja}\u001f${example.en}`)
    examplesMap.set(id, { id, datasetVersion: version, japanese: example.ja, reading: null, translationVi: null, translationEn: example.en, source: 'OpenJLPT grammar seed · CC BY-SA 4.0', tags: [], provenance: [{ datasetId: 'openjlpt', recordId: grammar[index].id }] })
    grammar[index].exampleSentenceIds.push(id)
  }
}
const byWord = new Map()
for (const entry of dictionary) for (const word of new Set([entry.word, ...(entry.forms?.written.map((form) => form.text) ?? [])])) {
  if (!byWord.has(word)) byWord.set(word, [])
  byWord.get(word).push(entry)
}
for (const pair of tatoeba.entries) {
  const { japanese: ja, english: en } = pair
  if (!ja.text.includes(pair.word) || ja.text.length > 100 || en.text.length > 240 || !en.text.trim()) continue
  assert(ja.owner && en.owner && ja.license && en.license && ja.id && en.id, 'Tatoeba attribution incomplete')
  const candidates = byWord.get(pair.word) ?? []
  // Do not attach a homograph to several unrelated dictionary entries.
  if (candidates.length !== 1 || candidates[0].exampleSentenceIds.length >= 3) continue
  const id = `tatoeba:${ja.id}:${en.id}`
  examplesMap.set(id, { id, datasetVersion: version, japanese: ja.text, reading: null, translationVi: null, translationEn: en.text, source: 'Tatoeba contributors', tags: ['textual-match'], provenance: [{ datasetId: 'tatoeba', recordId: String(ja.id) }, { datasetId: 'tatoeba', recordId: String(en.id) }], attribution: [ja, en].map((sentence, index) => ({ sentenceId: String(sentence.id), language: index ? 'en' : 'ja', author: sentence.owner, license: sentence.license, url: sentence.url })) })
  if (!candidates[0].exampleSentenceIds.includes(id)) candidates[0].exampleSentenceIds.push(id)
}
const examples = [...examplesMap.values()]
const groups = { dictionary, kanji, grammar, examples }
const counts = Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length]))
const hasLevel = (row, level) => row.jlptLevel === level || row.jlptAssignments?.some((assignment) => assignment.level === level)
const jlptCounts = Object.fromEntries(LEVELS.map((level) => [level, Object.fromEntries(['vocabulary', 'kanji', 'grammar'].map((key) => [key, groups[key === 'vocabulary' ? 'dictionary' : key].filter((row) => hasLevel(row, level)).length]))]))
console.log('Writing record chunks…', counts)
for (const [category, rows] of Object.entries(groups)) {
  const buckets = Array.from({ length: RECORD_BUCKETS[category] }, () => [])
  for (const row of rows) buckets[parseInt(bucket(row.id, buckets.length), 16)].push(row)
  for (let index = 0; index < buckets.length; index++) {
    const ordered = buckets[index].sort((a, b) => a.id.localeCompare(b.id, 'en'))
    await emit(`${category}/${index.toString(16).padStart(4, '0')}.json`, category === 'dictionary' ? ordered.map(encodeDictionaryRecord) : ordered)
  }
}
const jlptPageSize = 100
for (const level of LEVELS) for (const category of ['vocabulary', 'kanji', 'grammar']) {
  const rows = groups[category === 'vocabulary' ? 'dictionary' : category].filter((row) => hasLevel(row, level)).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  await emit(`jlpt/${category}/${level}.json`, rows.map((row) => row.id))
  for (let offset = 0; offset < rows.length; offset += jlptPageSize) {
    const page = rows.slice(offset, offset + jlptPageSize)
    await emit(`jlpt-pages/${category}/${level}/${String(Math.floor(offset / jlptPageSize)).padStart(4, '0')}.json`, category === 'vocabulary' ? page.map(encodeDictionaryRecord) : page)
  }
}
for (const category of ['kanji', 'grammar']) await emit(`browse/${category}.json`, groups[category].map((row) => row.id).sort())
console.log('Generating bounded search postings…')
const index = new Map()
function add(key, id) {
  let post = index.get(key)
  if (!post) { post = { ids: [], total: 0 }; index.set(key, post) }
  post.total++
  if (post.ids.length < POSTING_LIMIT) post.ids.push(id)
}
const pref = (keys, kind, value) => { for (const prefix of prefixes(value)) keys.add(`${kind}:${prefix}`) }
// Common and JLPT entries come first in frequent truncated postings. No invented numeric rank.
dictionary.sort((a, b) => Number(b.isCommon === true) - Number(a.isCommon === true) || Number(!!b.jlptLevel) - Number(!!a.jlptLevel) || a.id.localeCompare(b.id, 'en'))
for (const row of dictionary) {
  const keys = new Set()
  for (const word of [row.word, ...(row.forms?.written.map((form) => form.text) ?? []), ...(row.forms?.readings.map((form) => form.text) ?? [])]) {
    const normalized = japanese(word); if (!normalized) continue
    keys.add(`w:${normalized}`); pref(keys, 'p', normalized)
  }
  for (const reading of [row.reading, ...(row.forms?.readings.map((form) => form.text) ?? [])]) {
    const normalized = japanese(reading); if (!normalized) continue
    keys.add(`r:${normalized}`); pref(keys, 'q', normalized)
  }
  for (const gloss of [...row.meanings.en, ...(row.senses?.flatMap((sense) => sense.meaningsEn) ?? [])]) {
    keys.add(`e:${meaning(gloss)}`)
    for (const token of tokens(gloss)) pref(keys, 't', token)
  }
  for (const character of row.kanjiIds) keys.add(`k:${japanese(character)}`)
  for (const key of keys) add(key, row.id)
}
for (const row of kanji) {
  const keys = new Set([`c:${japanese(row.character)}`])
  pref(keys, 'u', japanese(row.character))
  for (const value of [...row.onyomi, ...row.kunyomi]) { pref(keys, 'u', japanese(value)); pref(keys, 'u', japanese(value.replace(/[.\-]/g, ''))) }
  for (const value of row.meanings.en) for (const token of tokens(value)) pref(keys, 'u', token)
  for (const key of keys) add(key, row.id)
}
for (const row of grammar) {
  const keys = new Set([`g:${japanese(row.pattern)}`]); pref(keys, 'h', japanese(row.pattern))
  // Search also accepts the expression without display-only leading 〜/～.
  pref(keys, 'h', japanese(row.pattern.replace(/^[〜～]/, '')))
  for (const value of [...row.meaningEn, ...row.tags]) for (const token of tokens(value)) pref(keys, 'h', token)
  for (const key of keys) add(key, row.id)
}
const shards = Array.from({ length: INDEX_BUCKETS }, () => ({}))
for (const [key, posting] of index) shards[parseInt(searchBucket(key, INDEX_BUCKETS), 16)][key] = posting
for (let shard = 0; shard < shards.length; shard++) await emit(`search/${shard.toString(16).padStart(4, '0')}.json`, encodeSearchShard(shards[shard]))
const aliases = { dictionary: {}, kanji: {}, grammar: {} }
for (const category of ['dictionary', 'kanji', 'grammar']) {
  const seed = JSON.parse(await readFile(`public/data/${category}/${category}-0001.json`, 'utf8'))
  for (const row of seed) {
    const matches = groups[category].filter((item) => category === 'dictionary' ? item.forms?.readings.some((read) => read.text === row.reading && (item.forms.written.some((form) => form.text === row.word && (!read.restrictions.length || read.restrictions.includes(form.text))) || read.text === row.word)) : category === 'kanji' ? item.character === row.character : japanese(item.pattern) === japanese(row.pattern))
    if (matches.length === 1) aliases[category][row.id] = matches[0].id
  }
}
await emit('aliases.json', aliases)
await emit('merge-report.json', { sourceCounts, generatedJlptCounts: jlptCounts, unmatchedOrAmbiguous: merged.conflicts, standaloneOpenJlptVocabulary: merged.conflicts.length, multipleLevelAssignments: dictionary.filter((row) => new Set(row.jlptAssignments?.map((item) => item.level)).size > 1).map((row) => ({ id: row.id, primary: row.jlptLevel, assignments: row.jlptAssignments })), vocabularySourceRows: sourceRows.vocabulary.length, jmdictEntries: parsed.entries.length, examples: { sourceTatoebaPairs: tatoeba.entries.length, linkedTatoeba: examples.filter((row) => row.id.startsWith('tatoeba:')).length, grammar: examples.filter((row) => row.id.startsWith('openjlpt-example:')).length, wordsWithExamples: dictionary.filter((row) => row.exampleSentenceIds.length).length }, aliases })
const sources = [
  { id: 'openjlpt', name: 'OpenJLPT', url: 'https://github.com/evanclan/OpenJLPT', version: sourceLock.openjlptRevision, license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'OpenJLPT contributors; upstream EDRDG, Jonathan Waller and Tatoeba contributors. Modified into Kotoba records and indexes.', noticePath: 'data/licenses/OpenJLPT-NOTICE.md' },
  { id: 'jmdict', name: 'JMdict / EDICT', url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project', version: parsed.created ?? sourceLock.files.find((file) => file.path === 'JMdict_e.gz').lastModified, license: 'CC BY-SA 4.0', licenseUrl: 'https://www.edrdg.org/edrdg/licence.html', attribution: 'JMdict is the property of the Electronic Dictionary Research and Development Group (EDRDG), used in conformance with its licence. Modified into Kotoba records and indexes.', noticePath: 'data/licenses/EDRDG-licence.html' },
  { id: 'kanjidic2', name: 'KANJIDIC2 (via OpenJLPT)', url: 'https://www.edrdg.org/wiki/KANJIDIC_Project.html', version: sourceLock.openjlptRevision, license: 'CC BY-SA 4.0', licenseUrl: 'https://www.edrdg.org/edrdg/licence.html', attribution: 'EDRDG kanji readings, meanings, stroke counts, grade and frequency, through OpenJLPT. SKIP and other separately licensed codes are not used.' },
  { id: 'waller', name: 'Jonathan Waller’s JLPT Resources', url: 'https://www.tanos.co.uk/jlpt/', version: sourceLock.openjlptRevision, license: 'CC BY (as stated by OpenJLPT NOTICE)', licenseUrl: 'https://www.tanos.co.uk/jlpt/sharing/', attribution: 'Jonathan Waller, community JLPT level assignments through OpenJLPT. Unofficial study/reference dataset.' },
  { id: 'tatoeba', name: 'Tatoeba text contributors', url: 'https://tatoeba.org/', version: tatoeba.fetchedAt, license: 'CC BY 2.0 FR / CC0 as recorded per sentence', licenseUrl: 'https://tatoeba.org/en/terms_of_use', attribution: 'Japanese and English authors, sentence IDs, links and licenses are retained on each selected sentence. No audio imported.', noticePath: 'data/licenses/Tatoeba-terms.html' },
]
await emit('sources.json', sources)
await emit('source-lock.json', { ...sourceLock, tatoeba: { fetchedAt: tatoeba.fetchedAt, sha256: digest(await readFile(resolve(sourceRoot, 'tatoeba.json'))) } })
const assets = [...files]
await emit('assets.json', assets)
const searchFiles = assets.filter((file) => file.path.startsWith('search/'))
const assignmentCounts = Object.fromEntries(LEVELS.map((level) => [level, Object.fromEntries(['vocabulary', 'kanji', 'grammar'].map((category) => [category, groups[category === 'vocabulary' ? 'dictionary' : category].reduce((total, row) => total + (row.jlptAssignments?.filter((assignment) => assignment.level === level).length ?? (row.jlptLevel === level ? 1 : 0)), 0)]))]))
const deduplication = Object.fromEntries(LEVELS.map((level) => [level, Object.fromEntries(['vocabulary', 'kanji', 'grammar'].map((category) => {
  const rows = sourceRows[category].filter((row) => row.level === level)
  const keys = rows.map((row) => category === 'vocabulary' ? stableId('openjlpt-vocab', `${row.word}\u001f${row.reading}`) : category === 'kanji' ? row.character : stableId('openjlpt-grammar', row.pattern))
  const uniqueIds = new Set(keys).size
  return [category, { sourceRows: rows.length, uniqueSourceIds: uniqueIds, duplicateSourceRows: rows.length - uniqueIds, generatedLevelRecords: jlptCounts[level][category], sourceIdsCoalescedIntoExistingRecord: uniqueIds - jlptCounts[level][category] }]
}))]))
const sortedSearchSizes = searchFiles.map((file) => file.bytes).sort((a, b) => a - b)
const reportsRoot = resolve('scripts/data/reports', version)
await mkdir(reportsRoot, { recursive: true })
const manifest = { schemaVersion: 2, pipelineVersion, transportVersion, sourceFingerprint, datasetVersion: version, generatedAt, basePath, counts, jlptCounts, sourceCounts, assignmentCounts, recordBuckets: RECORD_BUCKETS, indexBuckets: INDEX_BUCKETS, jlptPageSize, sources: sources.map((source) => source.id), search: { format: 'object-arrays-v1', sharding: 'fnv1a-normalized-suffix-v1', postingLimit: POSTING_LIMIT, shardCount: searchFiles.length, averageBytes: Math.round(searchFiles.reduce((sum, file) => sum + file.bytes, 0) / searchFiles.length), medianBytes: sortedSearchSizes[Math.floor(sortedSearchSizes.length / 2)], largestBytes: Math.max(...sortedSearchSizes) } }
const mergeReportFile = resolve(output, 'merge-report.json')
const mergeReport = JSON.parse(await readFile(mergeReportFile, 'utf8'))
mergeReport.assignmentCounts = assignmentCounts
mergeReport.deduplication = deduplication
await writeFile(mergeReportFile, JSON.stringify(mergeReport) + '\n')
const mergeReportAsset = files.find((file) => file.path === 'merge-report.json')
if (mergeReportAsset) { const bytes = await readFile(mergeReportFile); mergeReportAsset.bytes = bytes.length; mergeReportAsset.sha256 = digest(bytes); mergeReportAsset.count = Object.keys(mergeReport).length }
const integrityEntries = files.filter((file) => !['assets.json', 'merge-report.json', 'source-lock.json'].includes(file.path))
await writeFile(resolve(reportsRoot, 'merge-report.json'), JSON.stringify(mergeReport, null, 2) + '\n')
await writeFile(resolve(reportsRoot, 'source-lock.json'), JSON.stringify({ ...sourceLock, tatoeba: { fetchedAt: tatoeba.fetchedAt, sha256: digest(tatoebaBytes) } }, null, 2) + '\n')
await writeFile(resolve(reportsRoot, 'integrity.json'), JSON.stringify({ schemaVersion: 1, datasetVersion: version, files: integrityEntries }, null, 2) + '\n')
for (const name of ['assets.json', 'merge-report.json', 'source-lock.json']) await rm(resolve(output, name), { force: true })
await mkdir(root, { recursive: true })
await mkdir(resolve(root, '../licenses'), { recursive: true })
await copyFile(resolve(sourceRoot, 'openjlpt/LICENSE'), resolve(root, '../licenses/OpenJLPT-LICENSE.txt'))
await copyFile(resolve(sourceRoot, 'openjlpt/NOTICE.md'), resolve(root, '../licenses/OpenJLPT-NOTICE.md'))
// Validate before publishing the manifest used by browsers.
const validationManifest = { ...manifest, basePath: `versions/${version}/` }
await validateProduction(root, validationManifest)
await writeFile(resolve(root, 'sources.json'), JSON.stringify(sources, null, 2) + '\n')
await writeFile(resolve(root, 'manifest.next.json'), JSON.stringify(manifest, null, 2) + '\n')
await rename(resolve(root, 'manifest.next.json'), resolve(root, 'manifest.json'))
await writeFile('scripts/data/identity-lock.json', JSON.stringify(merged.identity, null, 2) + '\n')
// The manifest now points to the validated complete version. Retain just that deployable version to control static-host storage.
for (const oldVersion of await readdir(versionsRoot, { withFileTypes: true })) {
  const oldPath = resolve(versionsRoot, oldVersion.name)
  assert(oldPath.startsWith(`${versionsRoot}${process.platform === 'win32' ? '\\' : '/'}`), 'Unsafe version cleanup target')
  if (oldVersion.isDirectory() && oldVersion.name !== version) await rm(oldPath, { recursive: true })
}
console.log(JSON.stringify({ datasetVersion: version, counts, jlptCounts, search: manifest.search, publishedFiles: integrityEntries.length, integrityFile: resolve(reportsRoot, 'integrity.json'), sourceFingerprint }, null, 2))
