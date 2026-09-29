import { db, ACTIVE_DATASET_KEY } from '../database'
import type { DictionaryEntry } from '../../types/domain'
import { normalizeJapanese } from '../../lib/japanese-normalization'
import { meaningTokens, normalizeMeaning } from '../../lib/meaning-index'
import { romajiToHiragana } from '../../lib/romaji'
import { normalizeSearchInput } from '../../lib/search-normalization'

export const SEARCH_PAGE_SIZE = 30
export const MAX_SEARCH_PAGE = 120
const POSTING_LIMIT = 256
const MAX_CANDIDATE_ENTRIES = 800
type MeaningRank = 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
type SearchKeyField = 'viPhraseKeys' | 'viTokenKeys' | 'enPhraseKeys' | 'enTokenKeys'

export interface DictionarySearchPage { items: DictionaryEntry[]; total: number; offset: number; limit: number; hasMore: boolean; truncated: boolean }
export interface DictionarySearchOptions { limit?: number; offset?: number; signal?: AbortSignal }
interface SearchIndexResults { ranks: Map<string, MeaningRank>; truncated: boolean }

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError')
}

function versionedTerm(version: string, term: string) { return `${version}\u001f${term}` }

async function indexedPrefix(field: SearchKeyField, version: string, term: string) {
  const key = versionedTerm(version, term)
  const rows = await db.dictionarySearchTerms.where(field)
    .between(key, `${key}\uffff`, true, true).limit(POSTING_LIMIT + 1).toArray()
  return { rows: rows.slice(0, POSTING_LIMIT), truncated: rows.length > POSTING_LIMIT }
}

async function indexedExact(field: SearchKeyField, version: string, term: string) {
  const rows = await db.dictionarySearchTerms.where(field)
    .equals(versionedTerm(version, term)).limit(POSTING_LIMIT + 1).toArray()
  return { rows: rows.slice(0, POSTING_LIMIT), truncated: rows.length > POSTING_LIMIT }
}

async function findMeaningCandidates(version: string, query: string): Promise<SearchIndexResults> {
  const ranks = new Map<string, MeaningRank>()
  let truncated = false
  const add = (rows: Array<{ entryId: string }>, rank: MeaningRank) => {
    for (const row of rows) if (!ranks.has(row.entryId) || rank < ranks.get(row.entryId)!) ranks.set(row.entryId, rank)
  }

  for (const language of ['vi', 'en'] as const) {
    const phrase = normalizeMeaning(query, language)
    const phraseField: SearchKeyField = language === 'vi' ? 'viPhraseKeys' : 'enPhraseKeys'
    const tokenField: SearchKeyField = language === 'vi' ? 'viTokenKeys' : 'enTokenKeys'
    if (phrase.length >= 2) {
      const exact = await indexedExact(phraseField, version, phrase)
      add(exact.rows, language === 'vi' ? 5 : 9)
      truncated ||= exact.truncated
      const prefixes = await indexedPrefix(phraseField, version, phrase)
      add(prefixes.rows, language === 'vi' ? 6 : 10)
      truncated ||= prefixes.truncated
    }

    const tokens = meaningTokens(query, language)
    if (!tokens.length) continue
    const tokenPostings: Map<string, boolean>[] = []
    for (const token of tokens) {
      const result = await indexedPrefix(tokenField, version, token)
      const key = versionedTerm(version, token)
      const postings = new Map<string, boolean>()
      for (const row of result.rows) {
        const values = language === 'vi' ? row.viTokenKeys : row.enTokenKeys
        postings.set(row.entryId, values.includes(key))
      }
      tokenPostings.push(postings)
      truncated ||= result.truncated
    }
    let intersections = [...tokenPostings[0]!.entries()]
    for (const postings of tokenPostings.slice(1)) intersections = intersections.filter(([entryId]) => postings.has(entryId))
    const allExact = intersections.length > 0 && intersections.every(([entryId]) => tokenPostings.every((postings) => postings.get(entryId) === true))
    add(intersections.map(([entryId]) => ({ entryId })), language === 'vi' ? (allExact ? 7 : 8) : (allExact ? 11 : 12))
  }
  return { ranks, truncated }
}

function matchRank(entry: DictionaryEntry, query: string, romaji: string | null, meaningRank?: MeaningRank) {
  const normalizedWord = normalizeJapanese(entry.word)
  const normalizedReading = normalizeJapanese(entry.reading)
  const normalizedQuery = normalizeJapanese(query)
  if (normalizedWord === normalizedQuery) return 0
  if (normalizedReading === normalizedQuery) return 1
  if (romaji && normalizedReading === normalizeJapanese(romaji)) return 2
  if (normalizedWord.startsWith(normalizedQuery)) return 3
  if (normalizedReading.startsWith(normalizedQuery)) return 4
  if (romaji && normalizedReading.startsWith(normalizeJapanese(romaji))) return 4
  return meaningRank ?? 99
}

export class DictionarySearchService {
  async search(rawQuery: string, options: DictionarySearchOptions = {}): Promise<DictionarySearchPage> {
    const query = normalizeSearchInput(rawQuery)
    const limit = Math.min(MAX_SEARCH_PAGE, Math.max(1, Math.floor(options.limit ?? SEARCH_PAGE_SIZE)))
    const offset = Math.min(MAX_SEARCH_PAGE, Math.max(0, Math.floor(options.offset ?? 0)))
    if (!query) return { items: [], total: 0, offset, limit, hasMore: false, truncated: false }
    checkAbort(options.signal)
    const version = (await db.metadata.get(ACTIVE_DATASET_KEY))?.value
    if (typeof version !== 'string') return { items: [], total: 0, offset, limit, hasMore: false, truncated: false }

    const normalizedQuery = normalizeJapanese(query)
    const romaji = /^[a-z\s'-]+$/i.test(query) ? romajiToHiragana(query) : null
    const candidates = new Map<string, number>()
    let truncated = false
    const addIds = (ids: string[], rank: number, overflow = false) => {
      truncated ||= overflow
      for (const id of ids) if (!candidates.has(id) || rank < candidates.get(id)!) candidates.set(id, rank)
    }
    const addEntries = (entries: DictionaryEntry[], rank: number, overflow = false) => addIds(entries.map((entry) => entry.id), rank, overflow)

    const exactWords = await db.dictionaryEntries.where('[datasetVersion+normalizedWord]').equals([version, normalizedQuery]).limit(9).toArray()
    addEntries(exactWords.slice(0, 8), 0, exactWords.length > 8)
    const exactReadings = await db.dictionaryEntries.where('[datasetVersion+normalizedReading]').equals([version, normalizedQuery]).limit(9).toArray()
    addEntries(exactReadings.slice(0, 8), 1, exactReadings.length > 8)
    if (romaji) {
      const romanExact = await db.dictionaryEntries.where('[datasetVersion+normalizedReading]').equals([version, normalizeJapanese(romaji)]).limit(9).toArray()
      addEntries(romanExact.slice(0, 8), 2, romanExact.length > 8)
    }

    const wordPrefixes = await db.dictionaryEntries.where('[datasetVersion+normalizedWord]').between([version, normalizedQuery], [version, `${normalizedQuery}\uffff`], true, true).limit(161).toArray()
    addEntries(wordPrefixes.slice(0, 160), 3, wordPrefixes.length > 160)
    const readingPrefixes = await db.dictionaryEntries.where('[datasetVersion+normalizedReading]').between([version, normalizedQuery], [version, `${normalizedQuery}\uffff`], true, true).limit(161).toArray()
    addEntries(readingPrefixes.slice(0, 160), 4, readingPrefixes.length > 160)
    if (romaji) {
      const romanPrefix = normalizeJapanese(romaji)
      const romanPrefixes = await db.dictionaryEntries.where('[datasetVersion+normalizedReading]').between([version, romanPrefix], [version, `${romanPrefix}\uffff`], true, true).limit(161).toArray()
      addEntries(romanPrefixes.slice(0, 160), 4, romanPrefixes.length > 160)
    }

    const meanings = await findMeaningCandidates(version, query)
    truncated ||= meanings.truncated
    for (const [entryId, rank] of meanings.ranks) if (!candidates.has(entryId) || rank < candidates.get(entryId)!) candidates.set(entryId, rank)
    checkAbort(options.signal)

    const candidateIds = [...candidates.entries()]
      .sort(([idA, rankA], [idB, rankB]) => rankA - rankB || idA.localeCompare(idB))
      .slice(0, MAX_CANDIDATE_ENTRIES)
    truncated ||= candidates.size > MAX_CANDIDATE_ENTRIES
    const rows = await db.dictionaryEntries.bulkGet(candidateIds.map(([id]) => [version, id]))
    checkAbort(options.signal)
    const entries = rows.filter((entry): entry is DictionaryEntry => !!entry)
      .map((entry) => ({ entry, rank: matchRank(entry, query, romaji, meanings.ranks.get(entry.id)) }))
      .filter(({ rank }) => rank < 99)
      .sort((a, b) => a.rank - b.rank || Number(b.entry.isCommon === true) - Number(a.entry.isCommon === true) ||
        (a.entry.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.entry.frequencyRank ?? Number.MAX_SAFE_INTEGER) ||
        a.entry.word.localeCompare(b.entry.word) || a.entry.id.localeCompare(b.entry.id))
    const items = entries.slice(offset, offset + limit).map(({ entry }) => entry)
    return { items, total: entries.length, offset, limit, hasMore: offset + items.length < entries.length, truncated }
  }
}

export const dictionarySearchService = new DictionarySearchService()
