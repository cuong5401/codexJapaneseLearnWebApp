import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './database'
import { importDataset } from './import/importer'
import { DictionaryRepository, GrammarRepository, KanjiRepository } from './repositories/reference'
import manifestAsset from '../../public/data/manifest.json'
import dictionaryAsset from '../../public/data/dictionary/dictionary-0001.json'
import kanjiAsset from '../../public/data/kanji/kanji-0001.json'
import grammarAsset from '../../public/data/grammar/grammar-0001.json'
import examplesAsset from '../../public/data/examples/examples-0001.json'
import { indexedDbReferenceSource } from './sources/reference-source'

const kanji = new KanjiRepository()
const grammar = new GrammarRepository()
const dictionary = new DictionaryRepository()
const assets: Record<string, unknown> = {
  '/data/dictionary/dictionary-0001.json': dictionaryAsset,
  '/data/kanji/kanji-0001.json': kanjiAsset,
  '/data/grammar/grammar-0001.json': grammarAsset,
  '/data/examples/examples-0001.json': examplesAsset,
}

async function importContent() { await importDataset(manifestAsset, async (path) => assets[path] ?? []) }

describe('offline content browsing', () => {
  beforeEach(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close() })

  it('searches kanji by exact character, Vietnamese meaning, onyomi, kunyomi, and JLPT', async () => {
    await importContent()
    expect((await kanji.search('推')).items[0]?.character).toBe('推')
    expect((await kanji.search('đề cử')).items.some((entry) => entry.character === '推')).toBe(true)
    expect((await kanji.search('recommend')).items.some((entry) => entry.character === '推')).toBe(true)
    expect((await kanji.search('すい')).items.some((entry) => entry.character === '推')).toBe(true)
    expect((await kanji.search('すすむ')).items.some((entry) => entry.character === '進')).toBe(true)
    expect((await kanji.search('', { jlptLevel: 'N1' })).items.every((entry) => entry.jlptLevel === 'N1')).toBe(true)
    expect((await kanji.search('', { jlptLevel: 'N4' })).items.some((entry) => entry.character === '読')).toBe(true)
    const bounded = await kanji.search('', { limit: 5 })
    expect(bounded.items).toHaveLength(5)
    expect(bounded.hasMore).toBe(true)
    expect(await kanji.getByCharacter('不存在')).toBeUndefined()
  })

  it('reverse-looks up only active-version words containing a kanji with a bounded result', async () => {
    await importContent()
    const words = await dictionary.getByKanji('推', { limit: 10 })
    expect(words.length).toBeGreaterThan(0)
    expect(words.length).toBeLessThanOrEqual(10)
    expect(words.some((entry) => entry.word === '推薦')).toBe(true)
    expect(words.every((entry) => entry.datasetVersion === '0.1.0-dev.2')).toBe(true)
    const stagedVersion = '0.1.0-dev.3'
    const staged = { ...words[0]!, id: 'staged-related-word', datasetVersion: stagedVersion, kanjiLookupKeys: [`${stagedVersion}\u001f推`] }
    const empty = { count: 0, chunks: [{ id: 'empty', path: 'empty.json', itemCount: 0 }] }
    const manifest = {
      datasetVersion: stagedVersion, schemaVersion: 1, generatedAt: '2026-09-26T00:00:00.000Z',
      collections: {
        dictionary: { count: 2, chunks: [{ id: 'stage-1', path: 'stage-1.json', itemCount: 1 }, { id: 'stage-2', path: 'stage-2.json', itemCount: 1 }] },
        kanji: empty, grammar: empty, examples: empty,
      },
    }
    await expect(importDataset(manifest, async (path) => {
      if (path === 'empty.json') return []
      if (path === 'stage-1.json') return [staged]
      throw new Error('simulated interruption while staging a second dictionary chunk')
    })).rejects.toThrow()
    const activeWords = await dictionary.getByKanji('推', { limit: 10 })
    expect(activeWords.some((entry) => entry.id === 'staged-related-word')).toBe(false)
  })

  it('searches grammar pattern and Vietnamese/English meanings, filters by JLPT, and loads details', async () => {
    await importContent()
    expect((await grammar.search('ないでください')).items[0]?.id).toBe('grammar-naide-kudasai')
    expect((await grammar.search('xin đừng làm')).items[0]?.id).toBe('grammar-naide-kudasai')
    expect((await grammar.search('despite')).items[0]?.id).toBe('grammar-ni-mo-kakawarazu')
    const filtered = await grammar.search('', { jlptLevel: 'N1' })
    expect(filtered.items.every((entry) => entry.jlptLevel === 'N1')).toBe(true)
    const bounded = await grammar.search('', { limit: 2 })
    expect(bounded.items).toHaveLength(2)
    expect(bounded.hasMore).toBe(true)
    const detail = await grammar.getById('grammar-ni-mo-kakawarazu')
    expect(detail?.exampleSentenceIds).toContain('ex-grammar-nimokakawarazu')
    expect(await grammar.getById('invalid-grammar-id')).toBeUndefined()
    const word = await dictionary.getByExactWord('推薦')
    expect(word?.exampleSentenceIds).toContain('ex-推薦')
    expect(await dictionary.getById('invalid-word-id')).toBeUndefined()
  })

  it('loads example sentences through the reference-source boundary with a bounded result', async () => {
    await importContent()
    const rows = await indexedDbReferenceSource.examples.getByIds(['ex-改善', 'ex-推薦', 'missing'], { limit: 2 })
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.id)).toEqual(['ex-改善', 'ex-推薦'])
  })
})
