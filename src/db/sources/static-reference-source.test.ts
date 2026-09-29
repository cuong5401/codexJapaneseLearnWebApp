import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { KotobaDatabase } from '../database'
import { normalizeJapanese } from '../../lib/japanese-normalization'
import { StaticReferenceDataSource, staticBucket, staticSearchBucket, type ProductionManifest } from './static-reference-source'
import dictionarySeed from '../../../public/data/dictionary/dictionary-0001.json'
import kanjiSeed from '../../../public/data/kanji/kanji-0001.json'
import grammarSeed from '../../../public/data/grammar/grammar-0001.json'
import exampleSeed from '../../../public/data/examples/examples-0001.json'
import type { DictionaryEntry, JlptLevel } from '../../types/domain'

const base = '/JapanLearnAppWeb/data/production/'
const compactWord = (row: DictionaryEntry) => {
  const extra: Record<string, unknown> = {}
  if (row.meanings.vi.length) extra.v = row.meanings.vi
  if (row.jlptLevel) extra.l = row.jlptLevel
  if (row.isCommon !== null) extra.c = row.isCommon
  if (row.kanjiIds.length) extra.k = row.kanjiIds
  if (row.exampleSentenceIds.length) extra.e = row.exampleSentenceIds
  if (row.forms) extra.f = [row.forms.written.map((form) => [form.text, form.information, form.priority]), row.forms.readings.map((form) => [form.text, form.restrictions, form.noKanji, form.information, form.priority])]
  if (row.senses?.length) extra.s = row.senses.map((sense) => [sense.meaningsEn, sense.partsOfSpeech, {}])
  return [row.id, row.word, row.reading, row.meanings.en, row.partsOfSpeech, extra]
}
function fixture(version = '1.0.0', cacheEntries = 64, cacheBytes = 8_388_608) {
  const levelCounts = Object.fromEntries(['N5', 'N4', 'N3', 'N2', 'N1'].map((level) => [level, { vocabulary: level === 'N5' ? 2 : level === 'N4' ? 1 : 0, kanji: level === 'N5' ? 1 : 0, grammar: level === 'N5' ? 1 : 0 }])) as ProductionManifest['jlptCounts']
  const manifest: ProductionManifest = { schemaVersion: 2, pipelineVersion: 2, transportVersion: 2, sourceFingerprint: 'fingerprint', datasetVersion: version, generatedAt: '2026-09-29T00:00:00Z', basePath: `versions/${version}/`, counts: { dictionary: 3, kanji: 1, grammar: 1, examples: 1 }, jlptCounts: levelCounts, recordBuckets: { dictionary: 8, kanji: 8, grammar: 8, examples: 8 }, indexBuckets: 8, jlptPageSize: 2, sources: ['jmdict', 'openjlpt', 'tatoeba'], search: { format: 'object-arrays-v1', sharding: 'fnv1a-normalized-suffix-v1', postingLimit: 256, shardCount: 8, averageBytes: 0, medianBytes: 0, largestBytes: 0 } }
  const word = (id: string, written: string, reading: string, english: string[], level: JlptLevel): DictionaryEntry => ({ ...dictionarySeed[0], id, datasetVersion: version, word: written, reading, normalizedWord: normalizeJapanese(written), normalizedReading: normalizeJapanese(reading), meanings: { vi: [], en: english }, normalizedMeaningVi: [], normalizedMeaningEn: english, jlptLevel: level, exampleSentenceIds: ['example:1'], tags: [] })
  const words = [word('jmdict:100', '猫', 'ねこ', ['cat', 'feline'], 'N5'), word('jmdict:200', '学校', 'がっこう', ['school'], 'N5'), word('jmdict:300', '猫舌', 'ねこじた', ['sensitive to hot food'], 'N4')]
  words[0].forms = { written: [{ text: '猫', information: [], priority: [] }, { text: '貓', information: [], priority: [] }], readings: [{ text: 'ねこ', restrictions: [], noKanji: false, information: [], priority: [] }] }
  const kanji = { ...kanjiSeed[0], id: 'kanji:猫', datasetVersion: version, character: '猫', meanings: { vi: [], en: ['cat'] }, onyomi: ['ビョウ'], kunyomi: ['ねこ'], jlptLevel: 'N5' }
  const grammar = { ...grammarSeed[0], id: 'grammar:1', datasetVersion: version, pattern: '〜です', normalizedPattern: '〜です', meaningVi: [], meaningEn: ['polite statement'], jlptLevel: 'N5' }
  const example = { ...exampleSeed[0], id: 'example:1', datasetVersion: version, japanese: '猫がいます。', translationVi: null, translationEn: 'There is a cat.' }
  const assets: Record<string, unknown> = { [`${base}manifest.json`]: manifest }
  const path = `${base}${manifest.basePath}`
  const rows = { dictionary: words, kanji: [kanji], grammar: [grammar], examples: [example] }
  for (const collection of ['dictionary', 'kanji', 'grammar', 'examples'] as const) for (let index = 0; index < 8; index += 1) {
    const bucket = index.toString(16).padStart(4, '0')
    const matching = rows[collection].filter((record) => staticBucket(record.id, 8) === bucket)
    assets[`${path}${collection}/${bucket}.json`] = collection === 'dictionary' ? (matching as DictionaryEntry[]).map(compactWord) : matching
  }
  const postings: Record<string, [string[], number]> = {}
  const add = (key: string, ids: string[], total = ids.length) => { postings[key] = [ids, total] }
  add('w:猫', ['jmdict:100']); add('w:貓', ['jmdict:100']); add('r:ねこ', ['jmdict:100'])
  add('p:猫', ['jmdict:100', 'jmdict:300']); add('q:ねこ', ['jmdict:100', 'jmdict:300'])
  add('e:cat', ['jmdict:100']); add('t:cat', ['jmdict:100']); add('t:fel', ['jmdict:100'])
  add('r:がっこう', ['jmdict:200']); add('q:がっこう', ['jmdict:200'])
  add('t:hot', ['jmdict:300']); add('t:food', ['jmdict:300'])
  add('k:猫', ['jmdict:100', 'jmdict:300']); add('c:猫', ['kanji:猫']); add('u:cat', ['kanji:猫']); add('u:domestic', ['kanji:猫']); add('u:びょう', ['kanji:猫'])
  add('g:〜です', ['grammar:1']); add('h:polite', ['grammar:1'])
  for (let index = 0; index < 8; index += 1) { const bucket = index.toString(16).padStart(4, '0'); assets[`${path}search/${bucket}.json`] = Object.fromEntries(Object.entries(postings).filter(([key]) => staticSearchBucket(key, 8) === bucket)) }
  for (const level of ['N5', 'N4', 'N3', 'N2', 'N1']) for (const category of ['vocabulary', 'kanji', 'grammar'] as const) {
    const records = rows[category === 'vocabulary' ? 'dictionary' : category].filter((record) => record.jlptLevel === level).sort((a, b) => a.id.localeCompare(b.id))
    assets[`${path}jlpt/${category}/${level}.json`] = records.map((record) => record.id)
    if (records.length) assets[`${path}jlpt-pages/${category}/${level}/0000.json`] = category === 'vocabulary' ? (records as DictionaryEntry[]).map(compactWord) : records
  }
  assets[`${path}browse/kanji.json`] = ['kanji:猫']; assets[`${path}browse/grammar.json`] = ['grammar:1']
  assets[`${path}aliases.json`] = { dictionary: { 'seed-猫': 'jmdict:100' }, kanji: {}, grammar: {} }
  const fetcher = vi.fn<typeof fetch>(async (input) => { const value = assets[String(input)]; return new Response(value === undefined ? 'Missing' : JSON.stringify(value), { status: value === undefined ? 404 : 200, headers: { 'Content-Type': 'application/json' } }) })
  const source = new StaticReferenceDataSource({ assetBase: base, fetcher, cacheEntries, cacheBytes })
  return { source, assets, fetcher, manifest, path, words, add }
}

describe('production static reference source', () => {
  it('uses stable UTF-16 hash buckets and normalizes all written and reading forms', async () => {
    expect(staticBucket('hello', 4096)).toBe('0cab')
    expect(staticSearchBucket('w:猫', 8)).toBe(staticSearchBucket('r:猫', 8))
    expect(() => staticSearchBucket('malformed', 8)).toThrow('Invalid search key')
    const { source } = fixture()
    expect(await source.dictionary.getByExactWord('貓')).toMatchObject({ id: 'jmdict:100', word: '猫' })
    expect(await source.dictionary.getByExactReading(' ネコ ')).toMatchObject({ id: 'jmdict:100', reading: 'ねこ' })
    expect(await source.dictionary.getById('jmdict:100')).toMatchObject({ word: '猫', datasetVersion: '1.0.0', meanings: { vi: [], en: ['cat', 'feline'] } })
    expect(await source.dictionary.getById('seed-猫')).toMatchObject({ id: 'jmdict:100', word: '猫' })
    expect(await source.dictionary.getById('missing')).toBeUndefined()
  })

  it('serves exact, prefix, reading, romaji and English searches with bounded record fetches', async () => {
    const { source, fetcher } = fixture()
    const exact = await source.dictionary.search('猫', { limit: 1 })
    expect(exact).toMatchObject({ items: [{ id: 'jmdict:100' }], total: 2, hasMore: true, truncated: false, origin: 'bundled' })
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/dictionary/'))).toHaveLength(1)
    expect((await source.dictionary.search('猫', { offset: 1, limit: 1 })).items[0].id).toBe('jmdict:300')
    expect((await source.dictionary.search('ネコ')).items.map((entry) => entry.id)).toEqual(['jmdict:100', 'jmdict:300'])
    expect((await source.dictionary.search('gakkou')).items[0].word).toBe('学校')
    expect((await source.dictionary.search('cat')).items[0].word).toBe('猫')
    expect((await source.dictionary.search('fel')).items[0].word).toBe('猫')
    expect((await source.dictionary.search('hot food')).items[0].word).toBe('猫舌')
    expect((await source.dictionary.search('hot cat')).items).toEqual([])
    expect((await source.dictionary.getPrefix('猫', { limit: 1 })).map((entry) => entry.word)).toEqual(['猫'])
    expect((await source.dictionary.getByKanji('猫')).map((entry) => entry.word)).toEqual(['猫', '猫舌'])
    expect(fetcher.mock.calls.every(([input]) => String(input).startsWith(base))).toBe(true)
  })

  it('provides manifest counts and paginated real JLPT, kanji, grammar and example contracts', async () => {
    const { source } = fixture()
    expect(await source.dictionary.count()).toBe(3)
    expect(await source.dictionary.countByJlptLevel('N5')).toBe(2)
    expect(await source.dictionary.countByJlptLevel('N1')).toBe(0)
    expect(await source.dictionary.getByJlptLevel('N5', { limit: 1, offset: 1 })).toMatchObject({ items: [{ word: '学校' }], limit: 1, offset: 1 })
    expect(await source.kanji.getByCharacter('猫')).toMatchObject({ id: 'kanji:猫', meanings: { en: ['cat'] } })
    expect(await source.kanji.search('ビョウ', { jlptLevel: 'N5' })).toMatchObject({ total: 1, items: [{ character: '猫' }] })
    expect(await source.kanji.search('cat', { jlptLevel: 'N4' })).toMatchObject({ total: 0, items: [] })
    expect(await source.kanji.search('cat domestic')).toMatchObject({ total: 1, items: [{ character: '猫' }] })
    expect(await source.kanji.search()).toMatchObject({ total: 1, hasMore: false })
    expect(await source.kanji.countByJlptLevel('N5')).toBe(1)
    expect(await source.grammar.getByPattern('〜です')).toMatchObject({ id: 'grammar:1' })
    expect(await source.grammar.search('polite')).toMatchObject({ total: 1 })
    expect(await source.grammar.getByJlptLevel('N5')).toMatchObject({ items: [{ id: 'grammar:1' }] })
    expect(await source.grammar.count()).toBe(1)
    expect(await source.examples.getByIds(['example:1', 'example:1'])).toMatchObject([{ japanese: '猫がいます。', translationEn: 'There is a cat.' }])
    expect(await source.examples.getByIds([])).toEqual([])
  })

  it('bounds a posting to 256 candidates and reports truncation without endless pagination', async () => {
    const { source, assets, path } = fixture()
    const key = 'p:多'
    const shard = assets[`${path}search/${staticSearchBucket(key, 8)}.json`] as Record<string, unknown>
    shard[key] = [['jmdict:100', 'jmdict:200', 'jmdict:300'], 400]
    expect(await source.dictionary.search('多', { limit: 3 })).toMatchObject({ total: 3, truncated: true, hasMore: false })
  })

  it('shares concurrent reads, reuses bounded cache, and evicts by entries and bytes', async () => {
    const cached = fixture()
    await Promise.all([cached.source.dictionary.count(), cached.source.kanji.count(), cached.source.grammar.count()])
    expect(cached.fetcher.mock.calls.filter(([input]) => String(input).endsWith('/manifest.json'))).toHaveLength(1)
    await cached.source.dictionary.getById('jmdict:100')
    const calls = cached.fetcher.mock.calls.length
    await cached.source.dictionary.getById('jmdict:100')
    expect(cached.fetcher).toHaveBeenCalledTimes(calls)
    const bounded = fixture('1.0.0', 1)
    await bounded.source.dictionary.getById('jmdict:100')
    await bounded.source.kanji.getById('kanji:猫')
    await bounded.source.dictionary.getById('jmdict:100')
    expect(bounded.fetcher.mock.calls.filter(([input]) => String(input).includes('/dictionary/'))).toHaveLength(2)
    const noLargePayloads = fixture('1.0.0', 64, 4)
    await noLargePayloads.source.dictionary.getById('jmdict:100')
    await noLargePayloads.source.dictionary.getById('jmdict:100')
    expect(noLargePayloads.fetcher.mock.calls.filter(([input]) => String(input).includes('/dictionary/'))).toHaveLength(2)
  })

  it('honors cancellation and rejects missing, malformed, mixed-version assets', async () => {
    const fixtureData = fixture()
    const controller = new AbortController(); controller.abort()
    await expect(fixtureData.source.dictionary.search('猫', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fixtureData.fetcher).not.toHaveBeenCalled()
    const { source, assets, path } = fixture()
    delete assets[`${path}dictionary/${staticBucket('jmdict:100', 8)}.json`]
    await expect(source.dictionary.getById('jmdict:100')).rejects.toThrow('Reference asset unavailable (404)')
    const malformed = fixture(); malformed.manifest.schemaVersion = 1 as 2
    await expect(malformed.source.dictionary.count()).rejects.toThrow('Unsupported production reference manifest')
    const mismatched = fixture(); mismatched.manifest.basePath = 'versions/other-version/'
    await expect(mismatched.source.dictionary.getById('jmdict:100')).rejects.toThrow('Reference asset unavailable (404)')
    const wrongCount = fixture(); wrongCount.manifest.jlptCounts.N5.vocabulary = 1
    await expect(wrongCount.source.dictionary.getByJlptLevel('N5')).rejects.toThrow('JLPT page count mismatch')
  })

  it('rebuilds reference versions without touching any persisted user tables or legacy links', async () => {
    const database = new KotobaDatabase('static-reference-preservation')
    await database.open()
    try {
      const userTables = ['customWords', 'notebooks', 'notebookItems', 'favorites', 'savedReferenceWords', 'studyStates', 'srsCards', 'reviewLogs', 'searchHistory', 'userSettings', 'readingDocuments', 'quizAttempts']
      for (const name of userTables) {
        const table = database.table(name)
        const keyPath = table.schema.primKey.keyPath as string
        await table.put({ [keyPath]: `preserved:${name}`, itemId: 'seed-猫', itemType: 'reference-word', word: '猫', text: '猫がいます。', updatedAt: 100 })
      }
      const before = await Promise.all(userTables.map((name) => database.table(name).toArray()))
      expect(await fixture('1.0.0').source.dictionary.getById('seed-猫')).toMatchObject({ id: 'jmdict:100', datasetVersion: '1.0.0' })
      expect(await fixture('2.0.0').source.dictionary.getById('seed-猫')).toMatchObject({ id: 'jmdict:100', datasetVersion: '2.0.0' })
      database.close(); await database.open()
      expect(await Promise.all(userTables.map((name) => database.table(name).toArray()))).toEqual(before)
      expect(await database.dictionaryEntries.count()).toBe(0)
      expect(await database.kanjiEntries.count()).toBe(0)
    } finally { database.close(); await database.delete() }
  })
})
