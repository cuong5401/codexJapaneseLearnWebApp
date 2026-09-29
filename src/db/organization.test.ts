import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './database'
import { importDataset } from './import/importer'
import { CustomWordRepository } from './repositories/custom-words'
import { myVocabularyService } from './repositories/my-vocabulary'
import { FavoritesRepository, NotebookRepository, SavedReferenceVocabularyRepository, StudyRepository, SrsRepository } from './repositories/user-data'
import type { ExternalDictionaryEntry } from '../types/domain'
import { indexedDbReferenceSource, configureReferenceDataSource } from './sources/reference-source'
import manifest from '../../public/data/manifest.json'
import dictionary from '../../public/data/dictionary/dictionary-0001.json'
import kanji from '../../public/data/kanji/kanji-0001.json'
import grammar from '../../public/data/grammar/grammar-0001.json'
import examples from '../../public/data/examples/examples-0001.json'

const words = new CustomWordRepository()
const notebooks = new NotebookRepository()
const favorites = new FavoritesRepository()
const study = new StudyRepository()
const savedReferences = new SavedReferenceVocabularyRepository()
const srs = new SrsRepository()
const onlineWord: ExternalDictionaryEntry = {
  word: '見落とす', reading: 'みおとす', meaningsVi: ['bỏ sót'], meaningsEn: ['overlook'],
  partsOfSpeech: ['verb'], examples: [], sourceProvider: 'test-dictionary', sourceUrl: 'https://example.test/word',
}
const assets: Record<string, unknown> = {
  '/data/dictionary/dictionary-0001.json': dictionary,
  '/data/kanji/kanji-0001.json': kanji,
  '/data/grammar/grammar-0001.json': grammar,
  '/data/examples/examples-0001.json': examples,
}
async function importSeed() { await importDataset(manifest, async (path) => assets[path] ?? []) }

describe('personal vocabulary organization', () => {
  beforeEach(async () => { configureReferenceDataSource(indexedDbReferenceSource); await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close(); configureReferenceDataSource(indexedDbReferenceSource) })

  it('creates, edits, reloads, and deletes custom words with dependent data cleanup', async () => {
    const created = await words.create({ word: '見落とす', reading: 'みおとす', meaningsVi: ['bỏ sót'], meaningsEn: ['overlook'], partsOfSpeech: ['verb'], notes: 'meeting notes', tags: ['仕事'], sourceType: 'manual' })
    await words.update(created.id, { notes: 'updated note', tags: ['ニュース'] })
    expect(await words.getById(created.id)).toMatchObject({ notes: 'updated note', tags: ['ニュース'], sourceType: 'manual' })
    await db.close(); await db.open()
    expect(await words.getById(created.id)).toMatchObject({ word: '見落とす', reading: 'みおとす', notes: 'updated note' })
    const notebook = await notebooks.create('Work')
    await notebooks.addItem(notebook.id, 'custom-word', created.id)
    await favorites.set('custom-word', created.id, true)
    await study.setStatus('custom-word', created.id, 'learning')
    const card = { id: 'custom-card', itemType: 'custom-word' as const, itemId: created.id, cardType: 'recognition', createdAt: 1, lastReviewedAt: 2, nextReviewAt: 3, interval: 1, easeFactor: 2.5, repetitions: 1, lapses: 0, state: 'review' as const }
    await srs.save(card)
    await srs.addReviewLog({ id: 'custom-review', cardId: card.id, reviewedAt: 2, rating: 4, previousInterval: 1, newInterval: 2 })
    await words.delete(created.id)
    expect(await words.getById(created.id)).toBeUndefined()
    expect(await notebooks.getNotebookIds('custom-word', created.id)).toEqual([])
    expect(await favorites.isFavorite('custom-word', created.id)).toBe(false)
    expect(await study.get('custom-word', created.id)).toBeUndefined()
    expect(await srs.get(card.id)).toBeUndefined()
    expect(await db.reviewLogs.get('custom-review')).toBeUndefined()
    expect(await notebooks.get(notebook.id)).toBeDefined()
  })

  it('creates unique notebooks, supports mixed identities, prevents duplicates, and removes only memberships', async () => {
    const first = await notebooks.create('  仕事  ')
    await expect(notebooks.create('仕事')).rejects.toThrow('already exists')
    const second = await notebooks.create('旅行')
    await notebooks.rename(first.id, '仕事・会話')
    const custom = await words.create({ word: '猫', reading: 'ねこ', meaningsVi: ['mèo'], meaningsEn: [], partsOfSpeech: [], sourceType: 'manual' })
    await notebooks.addItems([first.id, second.id, first.id], 'reference-word', 'seed-日本語')
    await notebooks.addItem(first.id, 'custom-word', custom.id)
    await notebooks.addItem(first.id, 'kanji', '日')
    await notebooks.addItem(first.id, 'grammar', 'grammar-example')
    await notebooks.addItems([first.id], 'reference-word', 'seed-日本語')
    expect((await notebooks.listItems(first.id, 20)).items).toHaveLength(4)
    expect(await notebooks.getNotebookIds('reference-word', 'seed-日本語')).toHaveLength(2)
    await notebooks.removeItem(first.id, 'custom-word', custom.id)
    await notebooks.remove(first.id)
    expect(await words.getById(custom.id)).toBeDefined()
    expect(await notebooks.getNotebookIds('reference-word', 'seed-日本語')).toEqual([second.id])
    expect(await notebooks.countItems(second.id)).toBe(1)
  })

  it('favorites every supported item type and persists favorite state after reopen', async () => {
    const identities = [['reference-word', 'dict-1'], ['custom-word', 'custom-1'], ['kanji', '日'], ['grammar', 'grammar-1']] as const
    for (const [itemType, itemId] of identities) await favorites.set(itemType, itemId, true)
    await favorites.set('kanji', '日', false)
    await db.close(); await db.open()
    for (const [itemType, itemId] of identities) expect(await favorites.isFavorite(itemType, itemId)).toBe(itemType !== 'kanji')
    expect(await favorites.list()).toHaveLength(3)
  })

  it('persists Unseen → Learning → Known for reference and custom words', async () => {
    expect(await study.getStatus('reference-word', 'dict-1')).toBe('unseen')
    expect(await study.getStatus('custom-word', 'custom-1')).toBe('unseen')
    await study.setStatus('reference-word', 'dict-1', 'learning')
    await study.setStatus('custom-word', 'custom-1', 'learning')
    await study.setStatus('reference-word', 'dict-1', 'known')
    await study.setStatus('custom-word', 'custom-1', 'known')
    await db.close(); await db.open()
    expect(await study.getStatus('reference-word', 'dict-1')).toBe('known')
    expect(await study.getStatus('custom-word', 'custom-1')).toBe('known')
  })

  it('resolves and filters personal vocabulary, searches notes/tags, sorts, and handles missing reference entries', async () => {
    await importSeed()
    const entry = await indexedDbReferenceSource.dictionary.getById('seed-日本語')
    expect(entry).toBeDefined()
    await savedReferences.save(entry!)
    const custom = await words.create({ word: '見落とす', reading: 'みおとす', meaningsVi: ['bỏ sót'], meaningsEn: ['overlook'], partsOfSpeech: ['verb'], notes: 'meeting phrase', tags: ['仕事'], sourceType: 'manual' })
    await words.saveExternal(onlineWord)
    const notebook = await notebooks.create('N2 review')
    await notebooks.addItem(notebook.id, 'reference-word', entry!.id)
    await favorites.set('reference-word', entry!.id, true)
    await study.setStatus('reference-word', entry!.id, 'learning')
    await study.setStatus('custom-word', custom.id, 'known')
    await savedReferences.save({ id: 'missing-ref', word: '旧語', reading: 'きゅうご', meanings: { vi: ['từ cũ'], en: [] } })

    const all = await myVocabularyService.list()
    expect(all.map((item) => item.itemType)).toContain('reference-word')
    expect(all.find((item) => item.itemId === custom.id)).toMatchObject({ source: 'custom', status: 'known' })
    expect(all.find((item) => item.itemId === 'missing-ref')).toMatchObject({ word: '旧語', unavailable: true })
    expect((await myVocabularyService.list({ source: 'reference' })).every((item) => item.itemType === 'reference-word')).toBe(true)
    expect((await myVocabularyService.list({ source: 'custom' })).every((item) => item.itemType === 'custom-word')).toBe(true)
    expect((await myVocabularyService.list({ status: 'learning' })).map((item) => item.itemId)).toEqual([entry!.id])
    expect((await myVocabularyService.list({ favoritesOnly: true })).map((item) => item.itemId)).toEqual([entry!.id])
    expect((await myVocabularyService.list({ notebookId: notebook.id })).map((item) => item.itemId)).toEqual([entry!.id])
    expect((await myVocabularyService.list({ query: 'meeting phrase' })).map((item) => item.itemId)).toContain(custom.id)
    expect((await myVocabularyService.list({ sort: 'lexical' })).map((item) => item.word)).toEqual([...all].sort((a, b) => a.word.localeCompare(b.word, 'ja')).map((item) => item.word))
  })

  it('saves mocked external results as durable online-saved CustomWords in My Vocabulary', async () => {
    const saved = await words.saveExternal(onlineWord)
    expect(saved).toMatchObject({ sourceType: 'online', sourceProvider: 'test-dictionary', sourceUrl: 'https://example.test/word' })
    const [item] = await myVocabularyService.list({ source: 'custom', query: 'overlook' })
    expect(item).toMatchObject({ itemType: 'custom-word', itemId: saved.id, source: 'online-saved', word: '見落とす' })
  })
})
