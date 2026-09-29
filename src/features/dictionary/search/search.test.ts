import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, KOTOBA_SCHEMA_V1, KOTOBA_SCHEMA_V3, KOTOBA_SCHEMA_V4, KOTOBA_SCHEMA_V5, KOTOBA_SCHEMA_V6, KOTOBA_SCHEMA_V7, KOTOBA_SCHEMA_V8, upgradeCustomWordSearchIndexes, upgradeContentSearchIndexes, upgradeMeaningSearchIndex, upgradeSearchFields, migrateLearningItemIdentity, migrateNotebookNames } from '../../../db/database'
import { importDataset } from '../../../db/import/importer'
import { DictionaryRepository } from '../../../db/repositories/reference'
import dictionarySeed from '../../../../public/data/dictionary/dictionary-0001.json'
import { generateSyntheticDictionary } from '../../../data/seed/generator'
import { normalizeJapanese } from '../../../lib/japanese-normalization'
import { normalizeSearchInput, normalizeVietnamese } from '../../../lib/search-normalization'
import { romajiToHiragana } from './romaji'
import { dictionarySearchService } from './search-service'

const dictionary = new DictionaryRepository()
const knownWord = '\u63a8\u85a6'
const knownReading = '\u3059\u3044\u305b\u3093'

function testManifest(datasetVersion: string, chunkCounts: number[]) {
  const empty = { count: 0, chunks: [{ id: 'empty', path: 'empty.json', itemCount: 0 }] }
  return {
    datasetVersion, schemaVersion: 1, generatedAt: '2026-09-26T00:00:00.000Z',
    collections: {
      dictionary: { count: chunkCounts.reduce((sum, count) => sum + count, 0), chunks: chunkCounts.map((itemCount, index) => ({ id: `chunk-${index}`, path: `dictionary-${index}`, itemCount })) },
      kanji: empty, grammar: empty, examples: empty,
    },
  }
}

async function importSeed() {
  const seed = (dictionarySeed as unknown as Record<string, unknown>[]).map((entry) => ({ ...entry, datasetVersion: '3.0.0-search' }))
  const manifest = testManifest('3.0.0-search', [seed.length])
  await importDataset(manifest, async (path) => path === 'empty.json' ? [] : seed)
}

function generatedEntry(datasetVersion: string, id: string, meanings: { vi: string[]; en: string[] }) {
  return { ...generateSyntheticDictionary(1, datasetVersion)[0]!, id, meanings }
}

describe('offline dictionary search', () => {
  beforeEach(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close() })

  it('normalizes Unicode, whitespace, Vietnamese accents, and common Hepburn romaji', () => {
    expect(normalizeSearchInput('  Ｒｅｃｏｍｍｅｎｄ   Me  ')).toBe('recommend me')
    expect(normalizeVietnamese('Đề cử cải thiện')).toBe('de cu cai thien')
    expect(normalizeJapanese('スイセン')).toBe(knownReading)
    expect(romajiToHiragana('suisen')).toBe(knownReading)
    expect(romajiToHiragana('shouryaku')).toBe('\u3057\u3087\u3046\u308a\u3083\u304f')
    expect(romajiToHiragana('taiou')).toBe('\u305f\u3044\u304a\u3046')
  })

  it('searches exact Japanese, kana and romaji plus accented Vietnamese and English meanings', async () => {
    await importSeed()
    const exact = await dictionarySearchService.search(knownWord)
    const kana = await dictionarySearchService.search('スイセン')
    const romaji = await dictionarySearchService.search('suisen')
    const vietnameseAccented = await dictionarySearchService.search('cải thiện')
    const vietnamese = await dictionarySearchService.search('cai thien')
    const english = await dictionarySearchService.search('recommendation')
    expect(exact.items[0]?.word).toBe(knownWord)
    expect(kana.items[0]?.word).toBe(knownWord)
    expect(romaji.items[0]?.word).toBe(knownWord)
    expect(vietnameseAccented.items[0]?.word).toBe('\u6539\u5584')
    expect(vietnamese.items[0]?.word).toBe('\u6539\u5584')
    expect(english.items.some((entry) => entry.word === knownWord)).toBe(true)
    expect(await dictionary.getByExactWord(knownWord)).toMatchObject({ word: knownWord, reading: knownReading })
  })

  it('orders exact word matches before prefix and meaning matches, and caps pages', async () => {
    await importSeed()
    const result = await dictionarySearchService.search(knownWord, { limit: 2 })
    expect(result.items[0]?.word).toBe(knownWord)
    expect(result.items.length).toBeLessThanOrEqual(2)
    expect(result.hasMore).toBe(result.total > result.items.length)
  })

  it('finds unique Vietnamese and English meanings at the beginning, middle, and end of 20,000 entries', async () => {
    const size = 20_000
    const chunkSize = 500
    const chunkCount = size / chunkSize
    await importDataset(testManifest('3.0.0-large-search', Array(chunkCount).fill(chunkSize)), async (path) => {
      if (path === 'empty.json') return []
      const index = Number(path.split('-').at(-1))
      return generateSyntheticDictionary(chunkSize, '3.0.0-large-search').map((entry, offset) => {
        const position = index * chunkSize + offset
        const specialMeanings: Record<number, { vi: string[]; en: string[] }> = {
          9: { vi: ['từ khóa vị trí đầu firstneedle'], en: ['firstplaceunique'] },
          9_999: { vi: ['cải thiện midneedle'], en: ['middleplaceunique'] },
          19_989: { vi: ['ảnh hưởng endneedle'], en: ['finalplaceunique'] },
        }
        return { ...entry, id: `record-${String(position + 1).padStart(6, '0')}`, ...(specialMeanings[position] ? { meanings: specialMeanings[position] } : {}) }
      })
    })
    const started = performance.now()
    const first = await dictionarySearchService.search('firstneedle')
    const middle = await dictionarySearchService.search('middleplaceunique')
    const last = await dictionarySearchService.search('endneedle')
    const finalEnglish = await dictionarySearchService.search('finalplaceunique')
    const broad = await dictionarySearchService.search('synthetic', { limit: 30 })
    const elapsedMs = performance.now() - started
    const termCount = await db.dictionarySearchTerms.where('datasetVersion').equals('3.0.0-large-search').count()
    expect(await dictionary.count()).toBe(size)
    expect(first.items[0]?.id).toBe('record-000010')
    expect(middle.items[0]?.id).toBe('record-010000')
    expect(last.items[0]?.id).toBe('record-019990')
    expect(finalEnglish.items[0]?.id).toBe('record-019990')
    expect(broad.items).toHaveLength(30)
    expect(broad.truncated).toBe(true)
    expect(first.items.length).toBeLessThanOrEqual(30)
    expect(termCount).toBe(size)
    console.info(`Meaning index smoke check: ${size.toLocaleString()} entries, ${termCount.toLocaleString()} search terms; first/middle/final matches resolved in ${Math.round(elapsedMs)}ms.`)
  }, 90_000)

  it('ranks exact meaning phrases before phrase-prefix/token matches deterministically', async () => {
    const datasetVersion = '3.0.0-ranking'
    const entries = [
      generatedEntry(datasetVersion, 'loose', { vi: ['đề cử người khác'], en: ['recommendation for a candidate'] }),
      generatedEntry(datasetVersion, 'exact', { vi: ['đề cử'], en: ['recommend'] }),
    ]
    await importDataset(testManifest(datasetVersion, [entries.length]), async (path) => path === 'empty.json' ? [] : entries)
    const first = await dictionarySearchService.search('de cu')
    const second = await dictionarySearchService.search('de cu')
    expect(first.items.map((entry) => entry.id)).toEqual(['exact', 'loose'])
    expect(second.items.map((entry) => entry.id)).toEqual(first.items.map((entry) => entry.id))
  })

  it('keeps a partially imported dataset out of searches until activation', async () => {
    await importSeed()
    const staged = generatedEntry('4.0.0-staged', 'staged-only', { vi: ['mật mã giai đoạn'], en: ['stagedsecretterm'] })
    await expect(importDataset(testManifest('4.0.0-staged', [1, 1]), async (path) => {
      if (path === 'empty.json') return []
      if (path === 'dictionary-0') return [staged]
      throw new Error('simulated interruption after first staged chunk')
    })).rejects.toThrow()
    expect((await db.metadata.get('activeDatasetVersion'))?.value).toBe('3.0.0-search')
    expect(await db.dictionarySearchTerms.where('datasetVersion').equals('4.0.0-staged').count()).toBeGreaterThan(0)
    expect((await dictionarySearchService.search('stagedsecretterm')).items).toHaveLength(0)
  })

  it('removes obsolete version search terms after the new dataset activates', async () => {
    await importSeed()
    const newer = generatedEntry('4.0.0-new', 'new-entry', { vi: ['khái niệm mới'], en: ['newversiononly'] })
    await importDataset(testManifest('4.0.0-new', [1]), async (path) => path === 'empty.json' ? [] : [newer])
    expect((await db.metadata.get('activeDatasetVersion'))?.value).toBe('4.0.0-new')
    expect(await db.dictionarySearchTerms.where('datasetVersion').equals('3.0.0-search').count()).toBe(0)
    expect((await dictionarySearchService.search('recommendation')).items).toHaveLength(0)
    expect((await dictionarySearchService.search('newversiononly')).items[0]?.id).toBe('new-entry')
  })

  it('migrates a v2 database through schema v3 and v4 indexes while preserving user-owned tables', async () => {
    const name = `kotoba-migration-${Date.now()}`
    const old = new Dexie(name)
    old.version(1).stores(KOTOBA_SCHEMA_V1)
    old.version(2).stores({}).upgrade(upgradeSearchFields)
    await old.open()
    await old.table('dictionaryEntries').put({
      id: 'legacy-entry', datasetVersion: 'legacy.1', word: knownWord, reading: knownReading,
      normalizedWord: normalizeJapanese(knownWord), normalizedReading: normalizeJapanese(knownReading),
      normalizedMeaningVi: ['de cu'], normalizedMeaningEn: ['recommendation'],
      meanings: { vi: ['Đề cử'], en: ['Recommendation'] }, partsOfSpeech: ['noun'], jlptLevel: null,
      isCommon: true, frequencyRank: 10, kanjiIds: ['推'], exampleSentenceIds: [], tags: [],
    })
    await old.table('kanjiEntries').put({ id: '推', datasetVersion: 'legacy.1', character: '推', meanings: { vi: ['đẩy; đề cử'], en: ['push; recommend'] }, onyomi: ['スイ'], kunyomi: ['おす'], strokeCount: 11, radical: '手', radicalName: null, jlptLevel: 'N2', grade: null, frequencyRank: null, commonCompounds: ['推薦'], tags: [] })
    await old.table('studyStates').put({ id: 'word:legacy-entry', itemType: 'word', itemId: 'legacy-entry', status: 'learning', firstSeenAt: 1, lastSeenAt: 2, updatedAt: 2 })
    await old.table('srsCards').put({ id: 'legacy-card', itemType: 'word', itemId: 'legacy-entry', cardType: 'recognition', createdAt: 1, lastReviewedAt: 2, nextReviewAt: 3, interval: 1, easeFactor: 2.5, repetitions: 1, lapses: 0, state: 'review' })
    await old.table('notebooks').put({ id: 'notebook-for-word', name: 'Words', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    await old.table('notebookItems').put({ id: 'legacy-item', notebookId: 'notebook-for-word', itemType: 'word', itemId: 'legacy-entry', createdAt: 1 })
    await old.table('reviewLogs').put({ id: 'legacy-review', cardId: 'legacy-card', reviewedAt: 2, rating: 4, previousInterval: 0, newInterval: 1 })
    await old.table('searchHistory').put({ id: 'legacy-history', query: knownWord, normalizedQuery: knownWord, searchedAt: 1 })
    await old.table('userSettings').put({ key: 'uiLanguage', value: 'vi', updatedAt: 1 })
    await old.table('notebooks').put({ id: 'keep-me', name: 'Saved', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    old.close()
    const upgraded = new Dexie(name)
    upgraded.version(1).stores(KOTOBA_SCHEMA_V1)
    upgraded.version(2).stores({}).upgrade(upgradeSearchFields)
    upgraded.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    upgraded.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    upgraded.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    await upgraded.open()
    expect(await upgraded.table('dictionaryEntries').get(['legacy.1', 'legacy-entry'])).toMatchObject({ normalizedMeaningVi: ['de cu'], normalizedMeaningEn: ['recommendation'] })
    expect(await upgraded.table('dictionarySearchTerms').where('viPhraseKeys').equals('legacy.1\u001fde cu').count()).toBe(1)
    expect(await upgraded.table('dictionaryEntries').where('kanjiLookupKeys').equals('legacy.1\u001f推').count()).toBe(1)
    expect(await upgraded.table('kanjiEntries').get(['legacy.1', '推'])).toMatchObject({ searchKeys: expect.arrayContaining(['legacy.1\u001fc\u001fN2\u001f推']) })
    expect(await upgraded.table('notebooks').get('keep-me')).toMatchObject({ name: 'Saved' })
    expect(await upgraded.table('studyStates').get('word:legacy-entry')).toMatchObject({ itemType: 'reference-word', status: 'learning' })
    expect(await upgraded.table('notebookItems').get('legacy-item')).toMatchObject({ itemType: 'reference-word', itemId: 'legacy-entry' })
    expect(await upgraded.table('srsCards').get('legacy-card')).toMatchObject({ itemType: 'reference-word', state: 'review' })
    expect(await upgraded.table('reviewLogs').get('legacy-review')).toMatchObject({ rating: 4 })
    expect(await upgraded.table('searchHistory').get('legacy-history')).toMatchObject({ query: knownWord })
    expect(await upgraded.table('userSettings').get('uiLanguage')).toMatchObject({ value: 'vi' })
    upgraded.close()
    await Dexie.delete(name)
  })

  it('migrates v4 learning identities to v5 without losing user records', async () => {
    const name = `kotoba-v4-v5-${Date.now()}`
    const old = new Dexie(name)
    old.version(1).stores(KOTOBA_SCHEMA_V1)
    old.version(3).stores(KOTOBA_SCHEMA_V3)
    old.version(4).stores(KOTOBA_SCHEMA_V4)
    await old.open()
    await old.table('notebooks').put({ id: 'v4-notebook', name: 'Saved', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    await old.table('notebookItems').put({ id: 'v4-item', notebookId: 'v4-notebook', itemType: 'word', itemId: 'legacy-word', createdAt: 2 })
    await old.table('studyStates').put({ id: 'v4-state', itemType: 'word', itemId: 'legacy-word', status: 'learning', firstSeenAt: 1, lastSeenAt: 2, updatedAt: 2 })
    await old.table('srsCards').put({ id: 'v4-card', itemType: 'word', itemId: 'legacy-word', cardType: 'recognition', createdAt: 1, lastReviewedAt: 2, nextReviewAt: 3, interval: 1, easeFactor: 2.5, repetitions: 1, lapses: 0, state: 'review' })
    await old.table('reviewLogs').put({ id: 'v4-review', cardId: 'v4-card', reviewedAt: 2, rating: 4, previousInterval: 0, newInterval: 1 })
    await old.table('searchHistory').put({ id: 'v4-history', query: '猫', normalizedQuery: '猫', searchedAt: 3 })
    await old.table('userSettings').put({ key: 'theme', value: 'dark', updatedAt: 4 })
    old.close()

    const upgraded = new Dexie(name)
    upgraded.version(1).stores(KOTOBA_SCHEMA_V1)
    upgraded.version(2).stores({}).upgrade(upgradeSearchFields)
    upgraded.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    upgraded.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    upgraded.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    await upgraded.open()
    expect(await upgraded.table('notebookItems').get('v4-item')).toMatchObject({ itemType: 'reference-word', itemId: 'legacy-word' })
    expect(await upgraded.table('studyStates').get('v4-state')).toMatchObject({ itemType: 'reference-word', status: 'learning' })
    expect(await upgraded.table('srsCards').get('v4-card')).toMatchObject({ itemType: 'reference-word', state: 'review' })
    expect(await upgraded.table('reviewLogs').get('v4-review')).toMatchObject({ rating: 4 })
    expect(await upgraded.table('searchHistory').get('v4-history')).toMatchObject({ query: '猫' })
    expect(await upgraded.table('userSettings').get('theme')).toMatchObject({ value: 'dark' })
    upgraded.close()
    await Dexie.delete(name)
  })

  it('migrates v5 notebooks to unique normalized names and preserves vocabulary', async () => {
    const name = `kotoba-v5-v6-${Date.now()}`
    const old = new Dexie(name)
    old.version(1).stores(KOTOBA_SCHEMA_V1)
    old.version(2).stores({}).upgrade(upgradeSearchFields)
    old.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    old.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    old.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    await old.open()
    await old.table('notebooks').put({ id: 'one', name: 'N2', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    await old.table('notebooks').put({ id: 'two', name: ' n2 ', createdAt: 2, updatedAt: 2, sortOrder: 2, isSystem: false })
    await old.table('customWords').put({ id: 'custom-keep', word: '猫', reading: 'ねこ', meaningsVi: ['mèo'], meaningsEn: [], partsOfSpeech: [], sourceType: 'manual', createdAt: 1, updatedAt: 1 })
    await old.table('notebookItems').put({ id: 'membership-keep', notebookId: 'one', itemType: 'custom-word', itemId: 'custom-keep', createdAt: 2 })
    old.close()
    const upgraded = new Dexie(name)
    upgraded.version(1).stores(KOTOBA_SCHEMA_V1)
    upgraded.version(2).stores({}).upgrade(upgradeSearchFields)
    upgraded.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    upgraded.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    upgraded.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    upgraded.version(6).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6 }).upgrade(migrateNotebookNames)
    await upgraded.open()
    const migrated = await upgraded.table('notebooks').orderBy('sortOrder').toArray()
    expect(migrated.map((notebook) => notebook.normalizedName)).toEqual(['n2', 'n2#two'])
    expect(await upgraded.table('customWords').get('custom-keep')).toMatchObject({ word: '猫' })
    expect(await upgraded.table('notebookItems').get('membership-keep')).toMatchObject({ itemId: 'custom-keep' })
    upgraded.close()
    await Dexie.delete(name)
  })

  it('upgrades v6 review data to v7 without losing cards, logs, or settings', async () => {
    const name = `kotoba-v6-v7-${Date.now()}`
    const old = new Dexie(name)
    old.version(1).stores(KOTOBA_SCHEMA_V1)
    old.version(2).stores({}).upgrade(upgradeSearchFields)
    old.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    old.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    old.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    old.version(6).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6 }).upgrade(migrateNotebookNames)
    await old.open()
    await old.table('srsCards').put({ id: 'keep-card', itemType: 'custom-word', itemId: 'word-id', cardType: 'recognition', createdAt: 1, lastReviewedAt: 2, nextReviewAt: 3, interval: 1, easeFactor: 2.5, repetitions: 1, lapses: 0, state: 'review' })
    await old.table('reviewLogs').put({ id: 'keep-log', cardId: 'keep-card', reviewedAt: 2, rating: 4, previousInterval: 0, newInterval: 1 })
    await old.table('userSettings').put({ key: 'review.dailyNewLimit', value: 20, updatedAt: 3 })
    old.close()

    const upgraded = new Dexie(name)
    upgraded.version(1).stores(KOTOBA_SCHEMA_V1)
    upgraded.version(2).stores({}).upgrade(upgradeSearchFields)
    upgraded.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    upgraded.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    upgraded.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    upgraded.version(6).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6 }).upgrade(migrateNotebookNames)
    upgraded.version(7).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6, srsCards: `${KOTOBA_SCHEMA_V1.srsCards}, [itemType+itemId+cardType]` })
    await upgraded.open()
    expect(await upgraded.table('srsCards').get('keep-card')).toMatchObject({ itemId: 'word-id', state: 'review' })
    expect(await upgraded.table('reviewLogs').get('keep-log')).toMatchObject({ rating: 4 })
    expect(await upgraded.table('userSettings').get('review.dailyNewLimit')).toMatchObject({ value: 20 })
    expect(await upgraded.table('srsCards').where('[itemType+itemId+cardType]').equals(['custom-word', 'word-id', 'recognition']).count()).toBe(1)
    upgraded.close()
    await Dexie.delete(name)
  })

  it('upgrades v7 CustomWords with normalized word and reading search indexes', async () => {
    const name = `kotoba-v7-v8-${Date.now()}`
    const old = new Dexie(name)
    old.version(1).stores(KOTOBA_SCHEMA_V1)
    old.version(2).stores({}).upgrade(upgradeSearchFields)
    old.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    old.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    old.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    old.version(6).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6 }).upgrade(migrateNotebookNames)
    old.version(7).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6, ...KOTOBA_SCHEMA_V7 })
    await old.open()
    await old.table('customWords').put({ id: 'word-keep', word: '雨宿り', reading: 'アマヤドリ', meaningsVi: [], meaningsEn: ['shelter from rain'], partsOfSpeech: [], sourceType: 'online', sourceProvider: 'Wiktionary', createdAt: 1, updatedAt: 1 })
    old.close()
    const upgraded = new Dexie(name)
    upgraded.version(1).stores(KOTOBA_SCHEMA_V1)
    upgraded.version(2).stores({}).upgrade(upgradeSearchFields)
    upgraded.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    upgraded.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
    upgraded.version(5).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5 }).upgrade(migrateLearningItemIdentity)
    upgraded.version(6).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6 }).upgrade(migrateNotebookNames)
    upgraded.version(7).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6, ...KOTOBA_SCHEMA_V7 })
    upgraded.version(8).stores({ ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6, ...KOTOBA_SCHEMA_V7, ...KOTOBA_SCHEMA_V8 }).upgrade(upgradeCustomWordSearchIndexes)
    await upgraded.open()
    expect(await upgraded.table('customWords').get('word-keep')).toMatchObject({ normalizedWord: '雨宿り', normalizedReading: 'あまやどり' })
    expect(await upgraded.table('customWords').where('normalizedWord').equals('雨宿り').count()).toBe(1)
    upgraded.close()
    await Dexie.delete(name)
  })
})
