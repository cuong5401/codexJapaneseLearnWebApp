import Dexie from 'dexie'
import { db } from '../database'
import type { DictionaryEntry, ExampleSentence, GrammarEntry, JlptLevel, KanjiEntry } from '../../types/domain'
import { normalizeJapanese } from '../../lib/japanese-normalization'
import { buildGrammarSearchText, kanjiSearchPrefixes } from '../../lib/content-index'
import { normalizeSearchInput, normalizeVietnamese } from '../../lib/search-normalization'
import { activeDatasetVersion, boundedLimit, boundedOffset, type Page } from './shared'

export class DictionaryRepository {
  async getById(id: string): Promise<DictionaryEntry | undefined> {
    const version = await activeDatasetVersion(); return version ? db.dictionaryEntries.get([version, id]) : undefined
  }
  async getByExactWord(word: string): Promise<DictionaryEntry | undefined> {
    const version = await activeDatasetVersion(); return version ? db.dictionaryEntries.where('[datasetVersion+normalizedWord]').equals([version, normalizeJapanese(word)]).first() : undefined
  }
  async getByExactReading(reading: string): Promise<DictionaryEntry | undefined> {
    const version = await activeDatasetVersion(); return version ? db.dictionaryEntries.where('[datasetVersion+normalizedReading]').equals([version, normalizeJapanese(reading)]).first() : undefined
  }
  async getByJlptLevel(level: JlptLevel, options: { limit?: number; offset?: number } = {}): Promise<Page<DictionaryEntry>> {
    const limit = boundedLimit(options.limit ?? 50); const offset = boundedOffset(options.offset ?? 0); const version = await activeDatasetVersion()
    const items = version ? await db.dictionaryEntries.where('[datasetVersion+jlptLevel]').equals([version, level]).offset(offset).limit(limit).toArray() : []
    return { items, limit, offset }
  }
  async countByJlptLevel(level: JlptLevel): Promise<number> {
    const version = await activeDatasetVersion(); return version ? db.dictionaryEntries.where('[datasetVersion+jlptLevel]').equals([version, level]).count() : 0
  }
  async getPrefix(prefix: string, options: { limit?: number } = {}): Promise<DictionaryEntry[]> {
    const limit = boundedLimit(options.limit ?? 50); const version = await activeDatasetVersion(); if (!version) return []
    const normalized = normalizeJapanese(prefix)
    return db.dictionaryEntries.where('[datasetVersion+normalizedWord]').between([version, normalized], [version, `${normalized}\uffff`], true, true).limit(limit).toArray()
  }
  async getByKanji(character: string, options: { limit?: number } = {}): Promise<DictionaryEntry[]> {
    const limit = boundedLimit(options.limit ?? 30); const version = await activeDatasetVersion(); if (!version) return []
    return db.dictionaryEntries.where('kanjiLookupKeys').equals(`${version}\u001f${character}`).limit(limit).toArray()
  }
  async count(): Promise<number> {
    const version = await activeDatasetVersion(); return version ? db.dictionaryEntries.where('[datasetVersion+id]').between([version, Dexie.minKey], [version, Dexie.maxKey]).count() : 0
  }
}

export class KanjiRepository {
  async getById(id: string): Promise<KanjiEntry | undefined> {
    const version = await activeDatasetVersion(); return version ? db.kanjiEntries.get([version, id]) : undefined
  }
  async getByCharacter(character: string): Promise<KanjiEntry | undefined> {
    const version = await activeDatasetVersion(); return version ? db.kanjiEntries.where('[datasetVersion+character]').equals([version, character]).first() : undefined
  }
  async getByJlptLevel(level: JlptLevel, options: { limit?: number; offset?: number } = {}): Promise<Page<KanjiEntry>> {
    const limit = boundedLimit(options.limit ?? 50); const offset = boundedOffset(options.offset ?? 0); const version = await activeDatasetVersion()
    const items = version ? await db.kanjiEntries.where('[datasetVersion+jlptLevel]').equals([version, level]).offset(offset).limit(limit).toArray() : []
    return { items, limit, offset }
  }
  async countByJlptLevel(level: JlptLevel): Promise<number> {
    const version = await activeDatasetVersion(); return version ? db.kanjiEntries.where('[datasetVersion+jlptLevel]').equals([version, level]).count() : 0
  }
  async search(query = '', options: { jlptLevel?: JlptLevel | null; limit?: number; offset?: number } = {}) {
    const limit = boundedLimit(options.limit ?? 50); const offset = boundedOffset(options.offset ?? 0); const version = await activeDatasetVersion()
    if (!version) return { items: [] as KanjiEntry[], limit, offset, total: 0, hasMore: false, truncated: false }
    const term = normalizeSearchInput(query)
    if (!term) {
      const index = options.jlptLevel ? '[datasetVersion+jlptLevel]' : '[datasetVersion+id]'
      const key = options.jlptLevel ? [version, options.jlptLevel] : [version, Dexie.minKey]
      const collection = options.jlptLevel
        ? db.kanjiEntries.where(index).equals(key as [string, JlptLevel])
        : db.kanjiEntries.where(index).between(key as [string, string], [version, Dexie.maxKey] as [string, string], true, true)
      const rows = await collection.offset(offset).limit(limit + 1).toArray()
      return { items: rows.slice(0, limit), limit, offset, total: offset + rows.length, hasMore: rows.length > limit, truncated: false }
    }
    const prefixes = kanjiSearchPrefixes(version, query, options.jlptLevel ?? null)
    const perIndexLimit = 160
    const batches = await Promise.all(prefixes.map((prefix) => db.kanjiEntries.where('searchKeys').startsWith(prefix).limit(perIndexLimit + 1).toArray()))
    const truncated = batches.some((batch) => batch.length > perIndexLimit)
    const candidates = new Map<string, KanjiEntry>()
    for (const batch of batches) for (const entry of batch.slice(0, perIndexLimit)) candidates.set(entry.id, entry)
    const rows = [...candidates.values()].filter((entry) => !options.jlptLevel || entry.jlptLevel === options.jlptLevel)
    rows.sort((a, b) => {
      const exactA = a.character === query.trim() ? 0 : a.onyomi.some((r) => normalizeJapanese(r).replaceAll('.', '') === normalizeJapanese(query).replaceAll('.', '')) || a.kunyomi.some((r) => normalizeJapanese(r).replaceAll('.', '') === normalizeJapanese(query).replaceAll('.', '')) ? 1 : 2
      const exactB = b.character === query.trim() ? 0 : b.onyomi.some((r) => normalizeJapanese(r).replaceAll('.', '') === normalizeJapanese(query).replaceAll('.', '')) || b.kunyomi.some((r) => normalizeJapanese(r).replaceAll('.', '') === normalizeJapanese(query).replaceAll('.', '')) ? 1 : 2
      return exactA - exactB || (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER) || a.character.localeCompare(b.character)
    })
    return { items: rows.slice(offset, offset + limit), limit, offset, total: rows.length, hasMore: offset + limit < rows.length || truncated, truncated }
  }
  async count(): Promise<number> {
    const version = await activeDatasetVersion(); return version ? db.kanjiEntries.where('[datasetVersion+id]').between([version, Dexie.minKey], [version, Dexie.maxKey]).count() : 0
  }
}

export class GrammarRepository {
  async getById(id: string): Promise<GrammarEntry | undefined> {
    const version = await activeDatasetVersion(); return version ? db.grammarEntries.get([version, id]) : undefined
  }
  async getByPattern(pattern: string): Promise<GrammarEntry | undefined> {
    const version = await activeDatasetVersion(); return version ? db.grammarEntries.where('[datasetVersion+normalizedPattern]').equals([version, normalizeJapanese(pattern)]).first() : undefined
  }
  async getByJlptLevel(level: JlptLevel, options: { limit?: number; offset?: number } = {}): Promise<Page<GrammarEntry>> {
    const limit = boundedLimit(options.limit ?? 50); const offset = boundedOffset(options.offset ?? 0); const version = await activeDatasetVersion()
    const items = version ? await db.grammarEntries.where('[datasetVersion+jlptLevel]').equals([version, level]).offset(offset).limit(limit).toArray() : []
    return { items, limit, offset }
  }
  async countByJlptLevel(level: JlptLevel): Promise<number> {
    const version = await activeDatasetVersion(); return version ? db.grammarEntries.where('[datasetVersion+jlptLevel]').equals([version, level]).count() : 0
  }
  async search(query = '', options: { jlptLevel?: JlptLevel | null; limit?: number; offset?: number } = {}) {
    const limit = boundedLimit(options.limit ?? 50); const offset = boundedOffset(options.offset ?? 0); const version = await activeDatasetVersion()
    if (!version) return { items: [] as GrammarEntry[], limit, offset, total: 0, hasMore: false, truncated: false }
    const index = options.jlptLevel ? '[datasetVersion+jlptLevel]' : '[datasetVersion+id]'
    const key = options.jlptLevel ? [version, options.jlptLevel] : [version, Dexie.minKey]
    const collection = options.jlptLevel
      ? db.grammarEntries.where(index).equals(key as [string, JlptLevel])
      : db.grammarEntries.where(index).between(key as [string, string], [version, Dexie.maxKey] as [string, string], true, true)
    const scanLimit = 1_000
    const source = await collection.limit(scanLimit + 1).toArray()
    const truncated = source.length > scanLimit
    const records = source.slice(0, scanLimit)
    const term = normalizeSearchInput(query)
    const viTerm = normalizeVietnamese(query)
    const matches = term ? records.filter((entry) => buildGrammarSearchText(entry).some((value) => value.includes(term) || value.includes(viTerm))) : records
    matches.sort((a, b) => {
      const aPattern = normalizeJapanese(a.pattern) === normalizeJapanese(query) ? 0 : 1
      const bPattern = normalizeJapanese(b.pattern) === normalizeJapanese(query) ? 0 : 1
      return aPattern - bPattern || (a.jlptLevel ?? 'N0').localeCompare(b.jlptLevel ?? 'N0') || a.pattern.localeCompare(b.pattern)
    })
    return { items: matches.slice(offset, offset + limit), limit, offset, total: matches.length, hasMore: offset + limit < matches.length || truncated, truncated }
  }
  async count(): Promise<number> {
    const version = await activeDatasetVersion(); return version ? db.grammarEntries.where('[datasetVersion+id]').between([version, Dexie.minKey], [version, Dexie.maxKey]).count() : 0
  }
}

export class ExampleSentenceRepository {
  async getByIds(ids: string[], options: { limit?: number } = {}): Promise<ExampleSentence[]> {
    const limit = boundedLimit(options.limit ?? 50)
    const version = await activeDatasetVersion()
    if (!version || !ids.length) return []
    const uniqueIds = [...new Set(ids)].slice(0, limit)
    const rows = await db.exampleSentences.bulkGet(uniqueIds.map((id) => [version, id]))
    return rows.filter((row): row is ExampleSentence => !!row)
  }
}
