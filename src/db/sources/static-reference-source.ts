import type { DictionaryEntry, ExampleSentence, GrammarEntry, JlptLevel, KanjiEntry } from '../../types/domain'
import { normalizeJapanese } from '../../lib/japanese-normalization'
import { normalizeSearchInput, normalizeVietnamese } from '../../lib/search-normalization'
import { romajiToHiragana } from '../../lib/romaji'
import { staticAssetUrl } from '../../lib/static-asset-url'
import { boundedLimit, boundedOffset, type Page } from '../repositories/shared'
import type { DictionarySearchPage } from '../repositories/dictionary-search'
import type { DictionaryReferenceSource, GrammarReferenceSource, KanjiReferenceSource, ReferenceDataSource } from './reference-source'

type Collection = 'dictionary' | 'kanji' | 'grammar' | 'examples'
type StudyCategory = 'vocabulary' | 'kanji' | 'grammar'
type RecordTypes = { dictionary: DictionaryEntry; kanji: KanjiEntry; grammar: GrammarEntry; examples: ExampleSentence }
interface Posting { ids: string[]; total: number }
type CompactSense = [string[], string[], Partial<Record<'w' | 'r' | 'i' | 'm' | 'f' | 'd' | 'x' | 'a', string[]>>?]
type CompactDictionaryExtra = {
  v?: string[]; nw?: string; nr?: string; nv?: string[]; ne?: string[]; l?: JlptLevel; c?: boolean; fr?: number
  k?: string[]; lk?: string[]; e?: string[]; t?: string[]
  f?: [Array<[string, string[], string[]]>, Array<[string, string[], boolean, string[], string[]]>]
  s?: CompactSense[]; p?: Array<[string, string]>; ja?: Array<[JlptLevel, string, string, string]>
}
type CompactDictionaryRecord = [string, string, string, string[], string[], CompactDictionaryExtra]
type CompactPosting = [string[], number]
interface SearchOptions { limit?: number; offset?: number; signal?: AbortSignal }
interface ContentOptions { jlptLevel?: JlptLevel | null; limit?: number; offset?: number }
export interface ProductionManifest {
  schemaVersion: 2
  pipelineVersion: number
  transportVersion: 2
  sourceFingerprint: string
  datasetVersion: string
  generatedAt: string
  basePath: string
  counts: Record<Collection, number>
  jlptCounts: Record<JlptLevel, Record<StudyCategory, number>>
  recordBuckets: Record<Collection, number>
  indexBuckets: number
  jlptPageSize: number
  sources: string[]
  search: { format: 'object-arrays-v1'; sharding: 'fnv1a-normalized-suffix-v1'; postingLimit: number; shardCount: number; averageBytes: number; medianBytes: number; largestBytes: number }
}
export interface StaticReferenceOptions {
  /** Deployment-relative production directory, including its trailing slash. */
  assetBase?: string
  fetcher?: typeof fetch
  cacheEntries?: number
  cacheBytes?: number
}
const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']
const COLLECTIONS: Collection[] = ['dictionary', 'kanji', 'grammar', 'examples']
const MAX_CANDIDATES = 1_024
const EMPTY_POSTING: Posting = { ids: [], total: 0 }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError') }
function normalizeTransportMeaning(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim()
}
function decodeDictionaryRecord(value: CompactDictionaryRecord, datasetVersion: string): DictionaryEntry {
  if (!Array.isArray(value) || value.length !== 6 || typeof value[0] !== 'string' || typeof value[1] !== 'string' || typeof value[2] !== 'string' || !Array.isArray(value[3]) || !Array.isArray(value[4]) || !value[5] || typeof value[5] !== 'object') throw new Error('Invalid compact dictionary record.')
  const [id, word, reading, english, partsOfSpeech, extra] = value
  const provenance = extra.p?.map(([datasetId, recordId]) => ({ datasetId, recordId })) ?? (id.startsWith('jmdict:')
    ? [{ datasetId: 'jmdict', recordId: id.slice('jmdict:'.length) }]
    : id.startsWith('openjlpt-vocab:') ? [{ datasetId: 'openjlpt', recordId: id }] : undefined)
  const forms = extra.f ? {
    written: extra.f[0].map(([text, information, priority]) => ({ text, information, priority })),
    readings: extra.f[1].map(([text, restrictions, noKanji, information, priority]) => ({ text, restrictions, noKanji, information, priority })),
  } : undefined
  const senses = extra.s?.map(([meaningsEn, sensesPos, detail = {}]) => ({
    meaningsEn, partsOfSpeech: sensesPos,
    writtenRestrictions: detail.w ?? [], readingRestrictions: detail.r ?? [], information: detail.i ?? [],
    misc: detail.m ?? [], fields: detail.f ?? [], dialects: detail.d ?? [], crossReferences: detail.x ?? [], antonyms: detail.a ?? [],
  }))
  return {
    id, datasetVersion, word, reading,
    normalizedWord: extra.nw ?? normalizeJapanese(word), normalizedReading: extra.nr ?? normalizeJapanese(reading),
    meanings: { vi: extra.v ?? [], en: english }, normalizedMeaningVi: extra.nv ?? [],
    normalizedMeaningEn: extra.ne ?? english.map(normalizeTransportMeaning), partsOfSpeech,
    jlptLevel: extra.l ?? null, isCommon: extra.c ?? null, frequencyRank: extra.fr ?? null,
    kanjiIds: extra.k ?? [], ...(extra.lk ? { kanjiLookupKeys: extra.lk } : {}),
    exampleSentenceIds: extra.e ?? [], tags: extra.t ?? [],
    ...(forms ? { forms } : {}), ...(senses ? { senses } : {}), ...(provenance ? { provenance } : {}),
    ...(extra.ja ? { jlptAssignments: extra.ja.map(([level, assignmentWord, assignmentReading, sourceRecordId]) => ({ level, word: assignmentWord, reading: assignmentReading, sourceRecordId })) } : {}),
  }
}
function decodePosting(value: CompactPosting): Posting {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[0]) || !Number.isInteger(value[1])) throw new Error('Invalid compact static search posting.')
  return { ids: value[0], total: value[1] }
}
/** Shared with scripts/data: FNV-1a over UTF-16 code units, unsigned 32-bit. */
export function staticBucket(key: string, count: number): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193)
  return ((hash >>> 0) % count).toString(16).padStart(4, '0')
}
export function staticSearchBucket(key: string, count: number): string {
  const separator = key.indexOf(':')
  if (separator <= 0) throw new Error(`Invalid search key: ${key}`)
  return staticBucket(key.slice(separator + 1), count)
}
function validateManifest(value: unknown): ProductionManifest {
  const manifest = value as ProductionManifest | null
  if (!manifest || manifest.schemaVersion !== 2 || manifest.transportVersion !== 2 || !manifest.sourceFingerprint || !manifest.datasetVersion || !/^versions\/[a-zA-Z0-9._-]+\/$/.test(manifest.basePath)) throw new Error('Unsupported production reference manifest.')
  if (!Number.isInteger(manifest.pipelineVersion) || !Number.isInteger(manifest.jlptPageSize) || manifest.jlptPageSize < 1 || !Array.isArray(manifest.sources) || manifest.sources.length < 3 || manifest.search?.format !== 'object-arrays-v1' || manifest.search.sharding !== 'fnv1a-normalized-suffix-v1') throw new Error('Invalid production transport descriptor.')
  if (!Number.isInteger(manifest.indexBuckets) || manifest.indexBuckets < 1 || manifest.indexBuckets > 65_536) throw new Error('Invalid search bucket count.')
  for (const collection of COLLECTIONS) {
    if (!Number.isSafeInteger(manifest.counts?.[collection]) || manifest.counts[collection] < 0 || !Number.isInteger(manifest.recordBuckets?.[collection]) || manifest.recordBuckets[collection] < 1 || manifest.recordBuckets[collection] > 65_536) throw new Error(`Invalid ${collection} manifest counts.`)
  }
  for (const level of LEVELS) for (const category of ['vocabulary', 'kanji', 'grammar'] as const) {
    if (!Number.isSafeInteger(manifest.jlptCounts?.[level]?.[category]) || manifest.jlptCounts[level][category] < 0) throw new Error('Invalid JLPT manifest counts.')
  }
  return manifest
}
function pageOptions(options: { limit?: number; offset?: number }, defaultLimit = 50) { return { limit: boundedLimit(options.limit ?? defaultLimit), offset: boundedOffset(options.offset ?? 0) } }
function tokens(query: string): string[] { return [...new Set(normalizeVietnamese(query).match(/[\p{L}\p{N}]+/gu) ?? [])].filter((token) => token.length > 1).slice(0, 6) }

/** Reads immutable static assets. It never opens or writes any IndexedDB table. */
export class StaticReferenceStore {
  private readonly assetBase: string
  private readonly fetcher: typeof fetch
  private readonly cache = new Map<string, { value: unknown; bytes: number }>()
  private readonly pending = new Map<string, Promise<unknown>>()
  private cacheSize = 0
  private pinnedManifest: ProductionManifest | undefined
  private readonly maxEntries: number
  private readonly maxBytes: number
  constructor(options: StaticReferenceOptions = {}) {
    this.assetBase = (options.assetBase ?? staticAssetUrl('data/production/')).replace(/\/?$/, '/')
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init))
    this.maxEntries = options.cacheEntries ?? 64
    this.maxBytes = options.cacheBytes ?? 8 * 1_024 * 1_024
  }
  private async json<T>(relative: string, signal?: AbortSignal): Promise<T> {
    checkAbort(signal)
    const cached = this.cache.get(relative)
    if (cached) { this.cache.delete(relative); this.cache.set(relative, cached); return cached.value as T }
    // Uncancelled consumers share in-flight reads; cancelled searches keep independent requests.
    if (!signal) {
      const existing = this.pending.get(relative)
      if (existing) return existing as Promise<T>
      const request = this.readJson<T>(relative).finally(() => this.pending.delete(relative))
      this.pending.set(relative, request)
      return request
    }
    return this.readJson<T>(relative, signal)
  }
  private async readJson<T>(relative: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetcher(`${this.assetBase}${relative}`, { signal, cache: relative === 'manifest.json' ? 'no-cache' : 'default' })
    if (!response.ok) throw new Error(`Reference asset unavailable (${response.status}): ${relative}`)
    const text = await response.text()
    checkAbort(signal)
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new Error(`Invalid reference JSON: ${relative}`) }
    // UTF-16 text length is a conservative payload budget, independent of browser HTTP caching.
    const bytes = text.length * 2
    if (bytes <= this.maxBytes && this.maxEntries > 0) {
      while (this.cache.size >= this.maxEntries || this.cacheSize + bytes > this.maxBytes) {
        const key = this.cache.keys().next().value
        if (key === undefined) break
        this.cacheSize -= this.cache.get(key)!.bytes; this.cache.delete(key)
      }
      const previous = this.cache.get(relative)
      if (previous) this.cacheSize -= previous.bytes
      this.cache.set(relative, { value, bytes }); this.cacheSize += bytes
    }
    return value as T
  }
  async manifest(signal?: AbortSignal): Promise<ProductionManifest> {
    checkAbort(signal)
    if (!this.pinnedManifest) this.pinnedManifest = validateManifest(await this.json('manifest.json', signal))
    return this.pinnedManifest
  }
  async postings(keys: string[], signal?: AbortSignal): Promise<Map<string, Posting>> {
    const manifest = await this.manifest(signal)
    const grouped = new Map<string, string[]>()
    for (const key of new Set(keys)) {
      const bucket = staticSearchBucket(key, manifest.indexBuckets)
      grouped.set(bucket, [...(grouped.get(bucket) ?? []), key])
    }
    const results = new Map<string, Posting>()
    const groups = [...grouped]
    for (let offset = 0; offset < groups.length; offset += 8) await Promise.all(groups.slice(offset, offset + 8).map(async ([bucket, bucketKeys]) => {
      const shard = await this.json<Record<string, CompactPosting>>(`${manifest.basePath}search/${bucket}.json`, signal)
      for (const key of bucketKeys) {
        const posting = shard[key] ? decodePosting(shard[key]!) : EMPTY_POSTING
        if (posting.ids.length > manifest.search.postingLimit || posting.total < posting.ids.length || new Set(posting.ids).size !== posting.ids.length) throw new Error('Invalid static search posting.')
        results.set(key, posting)
      }
    }))
    checkAbort(signal)
    return results
  }
  async records<C extends Collection>(collection: C, ids: string[], signal?: AbortSignal): Promise<RecordTypes[C][]> {
    const manifest = await this.manifest(signal)
    const unique = [...new Set(ids)].slice(0, MAX_CANDIDATES)
    const groups = [...new Set(unique.map((id) => staticBucket(id, manifest.recordBuckets[collection])))]
    const found = new Map<string, RecordTypes[C]>()
    const wanted = new Set(unique)
    for (let offset = 0; offset < groups.length; offset += 8) await Promise.all(groups.slice(offset, offset + 8).map(async (bucket) => {
      const rawRows = await this.json<Array<RecordTypes[C] | CompactDictionaryRecord>>(`${manifest.basePath}${collection}/${bucket}.json`, signal)
      const rows = collection === 'dictionary'
        ? (rawRows as CompactDictionaryRecord[]).map((row) => decodeDictionaryRecord(row, manifest.datasetVersion)) as RecordTypes[C][]
        : rawRows as RecordTypes[C][]
      if (!Array.isArray(rows)) throw new Error(`Invalid ${collection} record shard.`)
      for (const row of rows) if (wanted.has(row.id)) {
        if (collection !== 'dictionary' && row.datasetVersion !== manifest.datasetVersion) throw new Error('Reference record version mismatch.')
        found.set(row.id, row)
      }
    }))
    checkAbort(signal)
    return unique.flatMap((id) => { const record = found.get(id); return record ? [record] : [] })
  }
  async record<C extends Collection>(collection: C, id: string): Promise<RecordTypes[C] | undefined> {
    const record = (await this.records(collection, [id]))[0]
    if (record || collection === 'examples') return record
    const manifest = await this.manifest()
    const aliases = await this.json<Partial<Record<Collection, Record<string, string>>>>(`${manifest.basePath}aliases.json`)
    const target = aliases[collection]?.[id]
    return target && target !== id ? (await this.records(collection, [target]))[0] : undefined
  }
  async exact<C extends Collection>(collection: C, key: string) { const result = await this.postings([key]); return (await this.records(collection, (result.get(key)?.ids ?? []).slice(0, 1)))[0] }
  async ids(category: StudyCategory, level?: JlptLevel): Promise<string[]> {
    const manifest = await this.manifest()
    if (level && !LEVELS.includes(level)) throw new Error('Unknown JLPT study level.')
    const ids = await this.json<string[]>(`${manifest.basePath}${level ? `jlpt/${category}/${level}` : `browse/${category}`}.json`)
    const expected = level ? manifest.jlptCounts[level][category] : manifest.counts[category === 'vocabulary' ? 'dictionary' : category]
    if (!Array.isArray(ids) || ids.length !== expected) throw new Error('Reference list count does not match its manifest.')
    return ids
  }
  async levelPage<C extends Exclude<Collection, 'examples'>>(collection: C, level: JlptLevel, options: { limit?: number; offset?: number }): Promise<Page<RecordTypes[C]>> {
    const { limit, offset } = pageOptions(options)
    const manifest = await this.manifest()
    if (!LEVELS.includes(level)) throw new Error('Unknown JLPT study level.')
    const category: StudyCategory = collection === 'dictionary' ? 'vocabulary' : collection
    const count = manifest.jlptCounts[level][category]
    const firstPage = Math.floor(offset / manifest.jlptPageSize)
    const lastPage = Math.floor(Math.max(offset, offset + Math.min(limit, Math.max(0, count - offset)) - 1) / manifest.jlptPageSize)
    if (offset >= count || limit <= 0) return { items: [], limit, offset }
    const pages = await Promise.all(Array.from({ length: lastPage - firstPage + 1 }, async (_, index) => {
      const pageIndex = firstPage + index
      const path = `${manifest.basePath}jlpt-pages/${category}/${level}/${String(pageIndex).padStart(4, '0')}.json`
      const rows = await this.json<Array<RecordTypes[C] | CompactDictionaryRecord>>(path)
      if (!Array.isArray(rows)) throw new Error(`Invalid JLPT record page: ${path}`)
      const expectedRows = Math.min(manifest.jlptPageSize, count - pageIndex * manifest.jlptPageSize)
      if (rows.length !== expectedRows) throw new Error(`JLPT page count mismatch: ${path}`)
      return collection === 'dictionary'
        ? (rows as CompactDictionaryRecord[]).map((row) => decodeDictionaryRecord(row, manifest.datasetVersion)) as RecordTypes[C][]
        : rows as RecordTypes[C][]
    }))
    const rows = pages.flat()
    const start = offset - firstPage * manifest.jlptPageSize
    const items = rows.slice(start, start + Math.min(limit, Math.max(0, count - offset)))
    if (collection !== 'dictionary' && items.some((row) => row.datasetVersion !== manifest.datasetVersion)) throw new Error('Reference record version mismatch.')
    return { items, limit, offset }
  }
  async count(collection: Collection) { return (await this.manifest()).counts[collection] }
  async levelCount(category: StudyCategory, level: JlptLevel) { return (await this.manifest()).jlptCounts[level][category] }
}

export class StaticDictionarySource implements DictionaryReferenceSource {
  readonly origin = 'bundled' as const
  constructor(private readonly store: StaticReferenceStore = new StaticReferenceStore()) {}
  getById(id: string) { return this.store.record('dictionary', id) }
  getByExactWord(word: string) { return this.store.exact('dictionary', `w:${normalizeJapanese(word)}`) }
  getByExactReading(reading: string) { return this.store.exact('dictionary', `r:${normalizeJapanese(reading)}`) }
  getByJlptLevel(level: JlptLevel, options: { limit?: number; offset?: number } = {}) { return this.store.levelPage('dictionary', level, options) }
  countByJlptLevel(level: JlptLevel) { return this.store.levelCount('vocabulary', level) }
  idsByJlptLevel(level: JlptLevel) { return this.store.ids('vocabulary', level) }
  count() { return this.store.count('dictionary') }
  async getPrefix(prefix: string, options: { limit?: number } = {}) {
    const key = `p:${normalizeJapanese(prefix)}`
    return this.store.records('dictionary', ((await this.store.postings([key])).get(key)?.ids ?? []).slice(0, boundedLimit(options.limit ?? 50)))
  }
  async getByKanji(character: string, options: { limit?: number } = {}) {
    const key = `k:${character.normalize('NFKC').trim()}`
    return this.store.records('dictionary', ((await this.store.postings([key])).get(key)?.ids ?? []).slice(0, boundedLimit(options.limit ?? 30)))
  }
  async search(rawQuery: string, options: SearchOptions = {}): Promise<DictionarySearchPage & { origin: 'bundled' }> {
    checkAbort(options.signal)
    const query = normalizeSearchInput(rawQuery).slice(0, 120)
    const { offset } = pageOptions(options, 30)
    const limit = Math.min(120, boundedLimit(options.limit ?? 30))
    if (!query) return { items: [], total: 0, offset, limit, hasMore: false, truncated: false, origin: this.origin }
    const japanese = normalizeJapanese(query)
    const roman = romajiToHiragana(query)
    const rankedKeys: Array<[string, number]> = [[`w:${japanese}`, 0], [`r:${japanese}`, 1], [`p:${japanese}`, 3], [`q:${japanese}`, 4], [`e:${normalizeVietnamese(query)}`, 5]]
    if (roman) rankedKeys.push([`r:${roman}`, 2], [`q:${roman}`, 4])
    const tokenKeys = tokens(query).map((token) => `t:${token}`)
    const postings = await this.store.postings([...rankedKeys.map(([key]) => key), ...tokenKeys], options.signal)
    const ranks = new Map<string, number>()
    let truncated = false
    const add = (posting: Posting, rank: number) => {
      truncated ||= posting.total > posting.ids.length
      for (const id of posting.ids) if (!ranks.has(id) || rank < ranks.get(id)!) ranks.set(id, rank)
    }
    for (const [key, rank] of rankedKeys) add(postings.get(key) ?? EMPTY_POSTING, rank)
    if (tokenKeys.length) {
      const groups = tokenKeys.map((key) => postings.get(key) ?? EMPTY_POSTING)
      truncated ||= groups.some((posting) => posting.total > posting.ids.length)
      const matches = groups[0].ids.filter((id) => groups.every((posting) => posting.ids.includes(id)))
      add({ ids: matches, total: matches.length }, 6)
    }
    truncated ||= ranks.size > MAX_CANDIDATES
    const ids = [...ranks].sort(([a, rankA], [b, rankB]) => rankA - rankB || a.localeCompare(b)).slice(0, MAX_CANDIDATES).map(([id]) => id)
    const items = await this.store.records('dictionary', ids.slice(offset, offset + limit), options.signal)
    return { items, total: ids.length, offset, limit, hasMore: offset + limit < ids.length, truncated, origin: this.origin }
  }
}

async function contentSearch<C extends 'kanji' | 'grammar'>(store: StaticReferenceStore, collection: C, query: string, options: ContentOptions) {
  const { limit, offset } = pageOptions(options)
  const term = normalizeSearchInput(query).slice(0, 120)
  let ids: string[]
  let truncated = false
  if (!term) ids = await store.ids(collection, options.jlptLevel ?? undefined)
  else {
    const exact = collection === 'kanji' ? `c:${term}` : `g:${normalizeJapanese(term)}`
    const kind = collection === 'kanji' ? 'u' : 'h'
    const tokenKeys = tokens(term).map((token) => `${kind}:${token}`)
    const keys = [...new Set([exact, `${kind}:${normalizeJapanese(term).replaceAll('.', '')}`, `${kind}:${normalizeVietnamese(term)}`, ...tokenKeys])]
    const postings = await store.postings(keys)
    const exactIds = keys.filter((key) => !tokenKeys.includes(key)).flatMap((key) => { const result = postings.get(key) ?? EMPTY_POSTING; truncated ||= result.total > result.ids.length; return result.ids })
    const tokenPostings = tokenKeys.map((key) => { const result = postings.get(key) ?? EMPTY_POSTING; truncated ||= result.total > result.ids.length; return result })
    const matchingTokens = tokenPostings.length > 1 ? tokenPostings[0]!.ids.filter((id) => tokenPostings.every((posting) => posting.ids.includes(id))) : tokenPostings.flatMap((posting) => posting.ids)
    ids = [...new Set([...exactIds, ...matchingTokens])]
    if (options.jlptLevel) { const levelIds = new Set(await store.ids(collection, options.jlptLevel)); ids = ids.filter((id) => levelIds.has(id)) }
  }
  return { items: await store.records(collection, ids.slice(offset, offset + limit)), total: ids.length, limit, offset, hasMore: offset + limit < ids.length, truncated }
}
export class StaticKanjiSource implements KanjiReferenceSource {
  constructor(private readonly store: StaticReferenceStore) {}
  getById(id: string) { return this.store.record('kanji', id) }
  getByCharacter(character: string) { return this.store.exact('kanji', `c:${character.normalize('NFKC').trim()}`) }
  getByJlptLevel(level: JlptLevel, options: { limit?: number; offset?: number } = {}) { return this.store.levelPage('kanji', level, options) }
  countByJlptLevel(level: JlptLevel) { return this.store.levelCount('kanji', level) }
  idsByJlptLevel(level: JlptLevel) { return this.store.ids('kanji', level) }
  count() { return this.store.count('kanji') }
  search(query = '', options: ContentOptions = {}) { return contentSearch(this.store, 'kanji', query, options) }
}
export class StaticGrammarSource implements GrammarReferenceSource {
  constructor(private readonly store: StaticReferenceStore) {}
  getById(id: string) { return this.store.record('grammar', id) }
  getByPattern(pattern: string) { return this.store.exact('grammar', `g:${normalizeJapanese(pattern)}`) }
  getByJlptLevel(level: JlptLevel, options: { limit?: number; offset?: number } = {}) { return this.store.levelPage('grammar', level, options) }
  countByJlptLevel(level: JlptLevel) { return this.store.levelCount('grammar', level) }
  idsByJlptLevel(level: JlptLevel) { return this.store.ids('grammar', level) }
  count() { return this.store.count('grammar') }
  search(query = '', options: ContentOptions = {}) { return contentSearch(this.store, 'grammar', query, options) }
}
export class StaticReferenceDataSource implements ReferenceDataSource {
  readonly origin = 'bundled' as const
  readonly store: StaticReferenceStore
  readonly dictionary: StaticDictionarySource
  readonly kanji: StaticKanjiSource
  readonly grammar: StaticGrammarSource
  readonly examples: ReferenceDataSource['examples']
  constructor(options: StaticReferenceOptions = {}) {
    this.store = new StaticReferenceStore(options)
    this.dictionary = new StaticDictionarySource(this.store)
    this.kanji = new StaticKanjiSource(this.store)
    this.grammar = new StaticGrammarSource(this.store)
    this.examples = { getByIds: (ids, options = {}) => this.store.records('examples', [...new Set(ids)].slice(0, boundedLimit(options.limit ?? 50))) }
  }
}
