import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { CustomWordRepository } from '../../db/repositories/custom-words'
import { onlineLookupCacheRepository } from '../../db/repositories/online-lookup-cache'
import { FavoritesRepository, NotebookRepository, SrsRepository } from '../../db/repositories/user-data'
import { myVocabularyService } from '../../db/repositories/my-vocabulary'
import type { ExternalDictionaryEntry } from '../../types/domain'
import { OnlineLookupError, type OnlineDictionaryProvider } from './online-provider'
import { ONLINE_EMPTY_TTL_MS, ONLINE_SUCCESS_TTL_MS, OnlineLookupService } from './online-lookup-service'
import { parseWiktionaryDefinitions, WiktionaryOnlineDictionaryProvider, wiktionaryPlainText } from './wiktionary-provider'

const external: ExternalDictionaryEntry = {
  word: '雨宿り', reading: 'あまやどり', meaningsVi: [], meaningsEn: ['taking shelter from rain'],
  partsOfSpeech: ['noun'], examples: [{ japanese: '雨宿りをする。' }], sourceProvider: 'Wiktionary', sourceUrl: 'https://en.wiktionary.org/wiki/%E9%9B%A8%E5%AE%BF%E3%82%8A',
}
const fixture = {
  word: '雨宿り',
  definitions: [
    { languageCode: 'zh', language: 'Chinese', definitions: [{ definition: 'unrelated Chinese definition' }] },
    { languageCode: 'ja', language: 'Japanese', definitions: [{ partOfSpeech: 'noun', reading: 'あまやどり', definition: 'taking shelter from rain [[雨|rain]]', examples: [{ text: '雨宿りをする。' }] }] },
  ],
}

function provider(search: OnlineDictionaryProvider['search'], id = 'test-provider'): OnlineDictionaryProvider {
  return { id, search, lookup: async (word, options) => (await search(word, options))[0] }
}

describe('online dictionary fallback', () => {
  beforeEach(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close(); vi.restoreAllMocks() })

  it('extracts Japanese definitions, reading, POS, examples, and safe source metadata', () => {
    const [entry] = parseWiktionaryDefinitions(fixture, '雨宿り')
    expect(entry).toMatchObject({ word: '雨宿り', reading: 'あまやどり', meaningsVi: [], meaningsEn: ['taking shelter from rain rain'], partsOfSpeech: ['noun'], sourceProvider: 'Wiktionary' })
    expect(entry?.sourceUrl).toBe('https://en.wiktionary.org/wiki/%E9%9B%A8%E5%AE%BF%E3%82%8A')
    expect(entry?.examples).toEqual([{ japanese: '雨宿りをする。' }])
    expect(JSON.stringify(entry)).not.toContain('unrelated Chinese')
    expect(wiktionaryPlainText('<script>alert(1)</script> <b>plain</b>')).toBe('alert(1) plain')
  })

  it('accepts the live Wiktionary definition API language-code shape', () => {
    const [entry] = parseWiktionaryDefinitions({ ja: [
      { partOfSpeech: 'Noun', language: 'Japanese', definitions: [{ definition: 'taking <a href="/wiki/shelter">shelter</a> from the <a href="/wiki/rain">rain</a>' }] },
      { partOfSpeech: 'Verb', language: 'Japanese', definitions: [{ definition: 'take shelter from the rain' }] },
    ] }, '雨宿り')
    expect(entry).toMatchObject({ word: '雨宿り', meaningsEn: ['taking shelter from the rain', 'take shelter from the rain'], partsOfSpeech: ['Noun', 'Verb'], sourceProvider: 'Wiktionary' })
  })

  it('returns no unrelated-language results and rejects malformed provider payloads', () => {
    expect(parseWiktionaryDefinitions({ word: '雨宿り', definitions: [{ language: 'Chinese', definitions: [{ definition: 'rain shelter' }] }] }, '雨宿り')).toEqual([])
    expect(() => parseWiktionaryDefinitions(null, '雨宿り')).toThrow(OnlineLookupError)
    expect(() => parseWiktionaryDefinitions({ nonsense: true }, '雨宿り')).toThrow(OnlineLookupError)
  })

  it('calls the documented definition API without a server proxy and returns normalized Japanese entries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const implementation = new WiktionaryOnlineDictionaryProvider()
    await expect(implementation.search('雨宿り')).resolves.toHaveLength(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://en.wiktionary.org/api/rest_v1/page/definition/%E9%9B%A8%E5%AE%BF%E3%82%8A')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', headers: { Accept: 'application/json' } })
  })

  it('classifies 404 and rate-limit responses as provider-aware typed failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 }))
    await expect(new WiktionaryOnlineDictionaryProvider().search('存在しない語')).rejects.toMatchObject({ kind: 'not-found' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 }))
    await expect(new WiktionaryOnlineDictionaryProvider().search('雨宿り')).rejects.toMatchObject({ kind: 'rate-limited' })
  })

  it('writes cache on a miss and avoids a second provider request on a hit', async () => {
    const search = vi.fn(async () => [external])
    const service = new OnlineLookupService(onlineLookupCacheRepository, () => provider(search), 100)
    expect(await service.search('雨宿り')).toEqual([external])
    expect(await service.search(' 雨宿り ')).toEqual([external])
    expect(search).toHaveBeenCalledTimes(1)
    const cache = await db.onlineLookupCache.toCollection().first()
    expect(cache?.expiresAt).toBeGreaterThan(cache?.fetchedAt ?? 0)
    expect(ONLINE_SUCCESS_TTL_MS).toBeGreaterThanOrEqual(24 * 60 * 60 * 1_000)
    expect(ONLINE_EMPTY_TTL_MS).toBeLessThan(24 * 60 * 60 * 1_000)
  })

  it('caches empty results briefly and reports not found', async () => {
    const search = vi.fn(async () => [])
    const service = new OnlineLookupService(onlineLookupCacheRepository, () => provider(search), 100)
    await expect(service.search('不存在語')).rejects.toMatchObject({ kind: 'no-result' })
    await expect(service.search('不存在語')).rejects.toMatchObject({ kind: 'no-result' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('caches a typed HTTP-style not-found response as a short empty result', async () => {
    const search = vi.fn(async () => { throw new OnlineLookupError('not-found', 'not found') })
    const service = new OnlineLookupService(onlineLookupCacheRepository, () => provider(search), 100)
    await expect(service.search('未掲載語')).rejects.toMatchObject({ kind: 'not-found' })
    await expect(service.search('未掲載語')).rejects.toMatchObject({ kind: 'no-result' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('reports timeout, provider errors, and caller cancellation with distinct behavior', async () => {
    const hangs: OnlineDictionaryProvider['search'] = (_query, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }))
    await expect(new OnlineLookupService(onlineLookupCacheRepository, () => provider(hangs), 5).search('雨宿り')).rejects.toMatchObject({ kind: 'timeout' })
    const failure = new OnlineLookupService(onlineLookupCacheRepository, () => provider(async () => { throw new OnlineLookupError('rate-limited', 'limited') }), 100)
    await expect(failure.search('雨宿り')).rejects.toMatchObject({ kind: 'rate-limited' })
    const controller = new AbortController()
    const pending = new OnlineLookupService(onlineLookupCacheRepository, () => provider(hangs), 500).search('雨宿り', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('uses offline state only to classify a failed request and keeps unknown errors distinct', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      const offline = new OnlineLookupService(onlineLookupCacheRepository, () => provider(async () => { throw new TypeError('fetch failed') }), 100)
      await expect(offline.search('雨宿り')).rejects.toMatchObject({ kind: 'offline' })
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'onLine', descriptor)
      else Reflect.deleteProperty(navigator, 'onLine')
    }
    const restoredDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    try {
      const unknown = new OnlineLookupService(onlineLookupCacheRepository, () => provider(async () => { throw new Error('unexpected') }), 100)
      await expect(unknown.search('雨宿り')).rejects.toMatchObject({ kind: 'unknown' })
    } finally {
      if (restoredDescriptor) Object.defineProperty(navigator, 'onLine', restoredDescriptor)
      else Reflect.deleteProperty(navigator, 'onLine')
    }
  })

  it('expires entries, bounds the cache to 200 rows, and clearing it never removes saved words', async () => {
    const cache = onlineLookupCacheRepository
    await cache.put('expired', 'provider', [external], 1, 100)
    expect(await cache.get('expired', 'provider', 102)).toBeUndefined()
    for (let index = 0; index < 205; index++) await cache.put(`term-${index}`, 'provider', [], 100_000, 1_000 + index)
    await cache.cleanup(2_000)
    expect(await db.onlineLookupCache.count()).toBe(200)
    const saved = await new CustomWordRepository().saveExternal(external)
    await db.onlineLookupCache.clear()
    await db.close(); await db.open()
    expect(await db.customWords.get(saved.id)).toMatchObject({ word: '雨宿り', sourceProvider: 'Wiktionary', sourceUrl: external.sourceUrl })
    expect(await db.onlineLookupCache.count()).toBe(0)
  })

  it('deduplicates normalized word and reading, preserves source through user edits, and indexes for local search', async () => {
    const repository = new CustomWordRepository()
    const first = await repository.saveExternal(external)
    const duplicate = await repository.saveExternal({ ...external, word: '雨宿り', reading: 'アマヤドリ' })
    expect(duplicate.id).toBe(first.id)
    await repository.update(first.id, { meaningsVi: ['trú mưa'], notes: 'edited by learner' })
    await db.close(); await db.open()
    expect(await repository.searchLocal('あまやどり')).toMatchObject([{ id: first.id, word: '雨宿り' }])
    expect(await repository.getById(first.id)).toMatchObject({ meaningsVi: ['trú mưa'], notes: 'edited by learner', sourceProvider: 'Wiktionary', sourceUrl: external.sourceUrl })
  })

  it('uses the existing My Vocabulary, Favorites, Notebook, and Review identities for an online save', async () => {
    const saved = await new CustomWordRepository().saveExternal(external)
    const notebook = await new NotebookRepository().create('Online words')
    await new NotebookRepository().addItem(notebook.id, 'custom-word', saved.id)
    await new FavoritesRepository().set('custom-word', saved.id, true)
    const { card } = await new SrsRepository().addToReview('custom-word', saved.id, { word: saved.word, reading: saved.reading, meaningEn: saved.meaningsEn[0] })
    expect(card.itemType).toBe('custom-word')
    expect(await myVocabularyService.list({ source: 'custom', query: '雨宿り' })).toMatchObject([{ itemType: 'custom-word', itemId: saved.id, source: 'online-saved', word: '雨宿り', favorite: true, notebookIds: [notebook.id] }])
  })
})
