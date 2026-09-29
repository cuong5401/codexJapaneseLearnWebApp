import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DATABASE_SCHEMA_VERSION, KotobaDatabase, KOTOBA_SCHEMA_V1, KOTOBA_SCHEMA_V3, KOTOBA_SCHEMA_V4, KOTOBA_SCHEMA_V5, KOTOBA_SCHEMA_V6, KOTOBA_SCHEMA_V7, KOTOBA_SCHEMA_V8, KOTOBA_SCHEMA_V9 } from './database'

const name = `kotoba-jlpt-v9-${crypto.randomUUID()}`
let migrated: KotobaDatabase | undefined

afterEach(async () => { migrated?.close(); await Dexie.delete(name) })

describe('JLPT quiz attempt schema migration', () => {
  it('upgrades v9 to v10, creates history storage, and preserves existing local content and state', async () => {
    const previous = new Dexie(name)
    const stores = { ...KOTOBA_SCHEMA_V1, ...KOTOBA_SCHEMA_V3, ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6, ...KOTOBA_SCHEMA_V7, ...KOTOBA_SCHEMA_V8, ...KOTOBA_SCHEMA_V9 }
    previous.version(9).stores(stores)
    await previous.open()
    await previous.table('readingDocuments').put({ id: 'reading-1', title: 'Reading', text: '日本語', createdAt: 1, updatedAt: 2 })
    await previous.table('customWords').put({ id: 'custom-1', word: '猫', reading: 'ねこ', normalizedWord: '猫', normalizedReading: 'ねこ', meaningsVi: ['mèo'], meaningsEn: ['cat'], partsOfSpeech: ['noun'], sourceType: 'manual', createdAt: 1, updatedAt: 2 })
    await previous.table('notebooks').put({ id: 'notebook-1', name: 'Study', normalizedName: 'study', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    await previous.table('notebookItems').put({ id: 'item-1', notebookId: 'notebook-1', itemType: 'reference-word', itemId: 'word-1', createdAt: 1 })
    await previous.table('favorites').put({ itemType: 'reference-word', itemId: 'word-1', createdAt: 1 })
    await previous.table('savedReferenceWords').put({ entryId: 'word-1', savedAt: 1, wordSnapshot: '猫' })
    await previous.table('studyStates').put({ id: 'reference-word:word-1', itemType: 'reference-word', itemId: 'word-1', status: 'known', firstSeenAt: 1, lastSeenAt: 2, updatedAt: 2 })
    await previous.table('srsCards').put({ id: 'card-1', itemType: 'reference-word', itemId: 'word-1', cardType: 'recognition', createdAt: 1, lastReviewedAt: null, nextReviewAt: 100, interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, state: 'new' })
    await previous.table('reviewLogs').put({ id: 'log-1', cardId: 'card-1', reviewedAt: 1, rating: 3, previousInterval: null, newInterval: 0 })
    await previous.table('userSettings').put({ key: 'theme', value: 'dark', updatedAt: 2 })
    await previous.table('searchHistory').put({ id: 'search-1', query: '猫', normalizedQuery: '猫', searchedAt: 1 })
    await previous.table('onlineLookupCache').put({ id: 'online-1', query: '猫', normalizedQuery: '猫', provider: 'test', results: [], fetchedAt: 1, expiresAt: 9, lastAccessedAt: 2 })
    previous.close()

    migrated = new KotobaDatabase(name)
    await migrated.open()
    expect(DATABASE_SCHEMA_VERSION).toBe(10)
    expect(await migrated.readingDocuments.get('reading-1')).toMatchObject({ text: '日本語' })
    expect(await migrated.customWords.get('custom-1')).toMatchObject({ word: '猫' })
    expect(await migrated.notebooks.get('notebook-1')).toMatchObject({ name: 'Study' })
    expect(await migrated.notebookItems.get('item-1')).toBeDefined()
    expect(await migrated.favorites.get(['reference-word', 'word-1'])).toBeDefined()
    expect(await migrated.savedReferenceWords.get('word-1')).toBeDefined()
    expect(await migrated.studyStates.get('reference-word:word-1')).toMatchObject({ status: 'known' })
    expect(await migrated.srsCards.get('card-1')).toMatchObject({ interval: 0, state: 'new' })
    expect(await migrated.reviewLogs.get('log-1')).toBeDefined()
    expect(await migrated.userSettings.get('theme')).toMatchObject({ value: 'dark' })
    expect(await migrated.searchHistory.get('search-1')).toBeDefined()
    expect(await migrated.onlineLookupCache.get('online-1')).toBeDefined()
    expect(await migrated.quizAttempts.count()).toBe(0)
  })
})
