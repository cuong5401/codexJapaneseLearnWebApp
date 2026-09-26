import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, ACTIVE_DATASET_KEY } from './database'
import { importDataset } from './import/importer'
import { calculateProgress } from './import/progress'
import { DictionaryRepository } from './repositories/reference'
import { generateSyntheticDictionary, SYNTHETIC_DATA_TAG } from '../data/seed/generator'
import { normalizeJapanese } from '../lib/japanese-normalization'
import { compareDatasetVersions } from './import/dataset-version'
import { initializeDevelopmentData } from './initialization'
import manifestAsset from '../../public/data/manifest.json'
import dictionaryAsset from '../../public/data/dictionary/dictionary-0001.json'
import kanjiAsset from '../../public/data/kanji/kanji-0001.json'
import grammarAsset from '../../public/data/grammar/grammar-0001.json'
import examplesAsset from '../../public/data/examples/examples-0001.json'
import { vi } from 'vitest'
import { NotebookRepository, SearchHistoryRepository, SettingsRepository, StudyRepository } from './repositories/user-data'
import { clearReferenceDataset, clearUserData, getDatabaseDiagnostics, resetDevelopmentDatabase } from './diagnostics/dev-tools'

const dictionary = new DictionaryRepository()
const requiredJapaneseWords = [
  ['推薦', 'すいせん'], ['推奨', 'すいしょう'], ['改善', 'かいぜん'], ['影響', 'えいきょう'],
  ['省略', 'しょうりゃく'], ['把握', 'はあく'], ['検討', 'けんとう'], ['対応', 'たいおう'],
  ['促進', 'そくしん'], ['進捗', 'しんちょく'], ['上昇', 'じょうしょう'], ['読解', 'どっかい'],
] as const

async function expectRequiredSeedWords() {
  for (const [word, reading] of requiredJapaneseWords) {
    const entry = await dictionary.getByExactWord(word)
    expect(entry).toMatchObject({ word, reading, jlptLevel: null, tags: ['dev-seed'] })
    expect(entry?.meanings.vi.length).toBeGreaterThan(0)
    expect(entry?.meanings.en.length).toBeGreaterThan(0)
    expect(entry?.partsOfSpeech.length).toBeGreaterThan(0)
    expect(entry?.exampleSentenceIds).toHaveLength(1)
    const example = await db.exampleSentences.get(['0.1.0-dev.2', entry!.exampleSentenceIds[0]])
    expect(example?.id).toBe(`ex-${word}`)
  }
}

const manifestFor = (datasetVersion: string, counts: number[]) => {
  const empty = { count: 0, chunks: [{ id: 'empty', path: 'empty.json', itemCount: 0 }] }
  return {
    datasetVersion, schemaVersion: 1, generatedAt: '2026-09-26T00:00:00.000Z',
    collections: {
      dictionary: { count: counts.reduce((sum, value) => sum + value, 0), chunks: counts.map((itemCount, index) => ({ id: `chunk-${index + 1}`, path: `chunk-${index + 1}.json`, itemCount })) },
      kanji: empty, grammar: empty, examples: empty,
    },
  }
}

describe('offline data layer', () => {
  beforeEach(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close() })

  it('normalizes Unicode and katakana for exact reading lookup', () => {
    expect(normalizeJapanese('  ガッコウ ')).toBe('がっこう')
    expect(normalizeJapanese('ＡＢＣ')).toBe('abc')
  })

  it('reports bounded chunk progress including completion and empty datasets', () => {
    expect(calculateProgress(25, 100, 2, 8, 'importing', 'dictionary').percentage).toBe(25)
    expect(calculateProgress(0, 0, 0, 0, 'completed').percentage).toBe(100)
  })

  it('compares semantic dataset versions and rejects unstructured versions', () => {
    expect(compareDatasetVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareDatasetVersions('2.0.0-beta.1', '2.0.0')).toBe(-1)
    expect(compareDatasetVersions('1.0.0', '1.0.0')).toBe(0)
    expect(() => compareDatasetVersions('latest', '1.0.0')).toThrow(TypeError)
  })

  it('keeps notebook membership idempotent and bounds saved history', async () => {
    const notebooks = new NotebookRepository()
    const notebook = await notebooks.create('Reading list')
    await notebooks.addItem(notebook.id, 'word', 'seed-日本語')
    await notebooks.addItem(notebook.id, 'word', 'seed-日本語')
    expect((await notebooks.listItems(notebook.id, 5)).items).toHaveLength(1)
    await expect(notebooks.listItems(notebook.id, 501)).rejects.toThrow(RangeError)

    const history = new SearchHistoryRepository()
    await history.record('日本語', '日本語', 1)
    await history.record('日本語', '日本語', 2)
    expect(await history.list(10)).toHaveLength(1)
    expect((await history.list(10))[0].resultCount).toBe(2)
  })

  it('persists study state and settings outside reference data', async () => {
    const study = new StudyRepository()
    await study.save({ id: 'word:seed-日本語', itemType: 'word', itemId: 'seed-日本語', status: 'learning', firstSeenAt: 1, lastSeenAt: 2, updatedAt: 2 })
    const settings = new SettingsRepository()
    await settings.set('uiLanguage', 'vi')
    expect((await study.get('word', 'seed-日本語'))?.status).toBe('learning')
    expect((await settings.get('uiLanguage'))?.value).toBe('vi')
  })

  it('imports bundled development seed once and keeps it through a database reopen', async () => {
    const assets: Record<string, unknown> = {
      '/data/manifest.json': manifestAsset,
      '/data/dictionary/dictionary-0001.json': dictionaryAsset,
      '/data/kanji/kanji-0001.json': kanjiAsset,
      '/data/grammar/grammar-0001.json': grammarAsset,
      '/data/examples/examples-0001.json': examplesAsset,
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const json = assets[String(input)]
      return { ok: json !== undefined, status: json === undefined ? 404 : 200, json: async () => json } as Response
    }))
    const firstInitialization = await initializeDevelopmentData()
    expect(firstInitialization).toMatchObject({ status: 'ready', error: null })
    expect(await dictionary.count()).toBe(24)
    await expectRequiredSeedWords()
    expect(await dictionary.getByExactWord('影響')).toMatchObject({ reading: 'えいきょう' })
    db.close()
    await db.open()
    expect(await initializeDevelopmentData()).toMatchObject({ status: 'ready', error: null })
    expect(await dictionary.count()).toBe(24)
    await expectRequiredSeedWords()
    expect((await db.datasetImports.get('0.1.0-dev.2:dictionary'))?.completedChunks).toEqual(['dictionary-0001'])
    const diagnostics = await getDatabaseDiagnostics()
    expect(diagnostics).toMatchObject({ schemaVersion: 4, activeDatasetVersion: '0.1.0-dev.2', counts: { dictionary: 24, kanji: 33, grammar: 16, examples: 34 } })

    await db.notebooks.add({ id: 'preserved-user-data', name: 'Saved', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    await clearUserData()
    expect(await db.notebooks.count()).toBe(0)
    expect(await dictionary.count()).toBe(24)
    await db.notebooks.add({ id: 'preserved-reference-data', name: 'Saved', createdAt: 1, updatedAt: 1, sortOrder: 1, isSystem: false })
    await clearReferenceDataset()
    expect(await dictionary.count()).toBe(0)
    expect(await db.notebooks.count()).toBe(1)
    await resetDevelopmentDatabase()
    expect(await dictionary.count()).toBe(24)
  })

  it('resumes after a failed chunk without duplicating the committed chunk', async () => {
    const manifest = manifestFor('1.0.0-resume', [3, 2])
    const firstChunk = generateSyntheticDictionary(3, '1.0.0-resume')
    const secondChunk = generateSyntheticDictionary(2, '1.0.0-resume').map((entry) => ({ ...entry, id: `tail-${entry.id}` }))
    let fail = true
    const loader = async (path: string) => {
      if (path === 'empty.json') return []
      if (path === 'chunk-1.json') return firstChunk
      if (fail) throw new Error('simulated offline interruption')
      return secondChunk
    }
    await expect(importDataset(manifest, loader)).rejects.toMatchObject({ code: 'chunk-read-failed' })
    expect(await db.metadata.get(ACTIVE_DATASET_KEY)).toBeUndefined()
    expect((await db.datasetImports.get('1.0.0-resume:dictionary'))?.completedChunks).toEqual(['chunk-1'])
    expect(await db.dictionarySearchTerms.where('datasetVersion').equals('1.0.0-resume').count()).toBe(3)

    fail = false
    await importDataset(manifest, loader)
    expect(await dictionary.count()).toBe(5)
    expect(await db.dictionarySearchTerms.where('datasetVersion').equals('1.0.0-resume').count()).toBe(5)
    expect((await dictionary.getById('synthetic-000001'))?.tags).toContain(SYNTHETIC_DATA_TAG)
    expect((await db.datasetImports.get('1.0.0-resume:dictionary'))?.status).toBe('completed')
  })

  it('keeps the active dataset unchanged if a newer import fails', async () => {
    const current = generateSyntheticDictionary(1, '1.0.0-old')
    await importDataset(manifestFor('1.0.0-old', [1]), async (path) => path === 'empty.json' ? [] : current)
    await expect(importDataset(manifestFor('2.0.0-new', [1]), async (path) => { if (path === 'empty.json') return []; throw new Error('offline') })).rejects.toThrow()
    expect((await db.metadata.get(ACTIVE_DATASET_KEY))?.value).toBe('1.0.0-old')
    expect((await dictionary.getById(current[0].id))?.datasetVersion).toBe('1.0.0-old')
  })

  it('imports generated 5,000 records in ten committed chunks and serves bounded indexed reads', async () => {
    const chunkSize = 500
    const manifest = manifestFor('1.0.0-benchmark', Array.from({ length: 10 }, () => chunkSize))
    const started = performance.now()
    await importDataset(manifest, async (path) => {
      if (path === 'empty.json') return []
      const chunk = Number(path.match(/chunk-(\d+)/)?.[1] ?? 1)
      return generateSyntheticDictionary(chunkSize, '1.0.0-benchmark').map((entry, index) => ({ ...entry, id: `synthetic-${String((chunk - 1) * chunkSize + index + 1).padStart(6, '0')}` }))
    })
    const importMs = performance.now() - started
    const queryStart = performance.now()
    const exact = await dictionary.getByExactWord('試験語000001')
    const prefix = await dictionary.getPrefix('試験語', { limit: 20 })
    const page = await dictionary.getByJlptLevel('N5', { limit: 25 })
    const queryMs = performance.now() - queryStart
    expect(exact?.id).toBe('synthetic-000001')
    expect(prefix).toHaveLength(20)
    expect(page.items).toHaveLength(0)
    expect(await dictionary.count()).toBe(5_000)
    expect(prefix.length).toBeLessThanOrEqual(20)
    console.info(`IndexedDB polyfill check: imported 5,000 records in ${Math.round(importMs)}ms; exact, prefix(20), and JLPT page queries in ${Math.round(queryMs)}ms.`)
  }, 20_000)
})
