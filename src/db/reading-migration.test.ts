import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DATABASE_SCHEMA_VERSION, KotobaDatabase, KOTOBA_SCHEMA_V1, KOTOBA_SCHEMA_V3, KOTOBA_SCHEMA_V4, KOTOBA_SCHEMA_V5, KOTOBA_SCHEMA_V6, KOTOBA_SCHEMA_V7, KOTOBA_SCHEMA_V8 } from './database'

const name = `kotoba-reading-v9-${crypto.randomUUID()}`
let migrated: KotobaDatabase | undefined

afterEach(async () => {
  migrated?.close()
  await Dexie.delete(name)
})

describe('reading schema migration', () => {
  it('adds ReadingDocument storage at v9 and preserves existing reference and user records', async () => {
    const previous = new Dexie(name)
    const stores = { ...KOTOBA_SCHEMA_V1, ...KOTOBA_SCHEMA_V3, ...KOTOBA_SCHEMA_V4, ...KOTOBA_SCHEMA_V5, ...KOTOBA_SCHEMA_V6, ...KOTOBA_SCHEMA_V7, ...KOTOBA_SCHEMA_V8 }
    previous.version(8).stores(stores)
    await previous.open()
    await previous.table('metadata').put({ key: 'activeDatasetVersion', value: 'seed-v2', updatedAt: 1 })
    await previous.table('dictionaryEntries').put({ datasetVersion: 'seed-v2', id: '猫', word: '猫', normalizedWord: '猫', reading: 'ねこ', normalizedReading: 'ねこ' })
    await previous.table('userSettings').put({ key: 'uiLanguage', value: 'vi', updatedAt: 2 })
    await previous.table('notebooks').put({ id: 'n1', name: 'Reading', normalizedName: 'reading', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    await previous.table('customWords').put({ id: 'c1', word: '勉強', reading: 'べんきょう', normalizedWord: '勉強', normalizedReading: 'べんきょう', meaningsVi: ['học tập'], meaningsEn: ['study'], partsOfSpeech: [], sourceType: 'manual', createdAt: 1, updatedAt: 1 })
    previous.close()

    migrated = new KotobaDatabase(name)
    await migrated.open()
    expect(DATABASE_SCHEMA_VERSION).toBe(10)
    expect(await migrated.dictionaryEntries.get(['seed-v2', '猫'])).toMatchObject({ word: '猫', reading: 'ねこ' })
    expect(await migrated.userSettings.get('uiLanguage')).toMatchObject({ value: 'vi' })
    expect(await migrated.notebooks.get('n1')).toMatchObject({ name: 'Reading' })
    expect(await migrated.customWords.get('c1')).toMatchObject({ word: '勉強', meaningsVi: ['học tập'] })
    const document = { id: 'r1', title: '図書館', text: '私は本を読みました。', createdAt: 5, updatedAt: 5 }
    await migrated.readingDocuments.add(document)
    expect(await migrated.readingDocuments.get('r1')).toEqual(document)
  })
})
