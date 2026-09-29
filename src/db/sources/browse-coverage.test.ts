import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StaticReferenceDataSource } from './static-reference-source'
import { db } from '../database'
import { StudyRepository } from '../repositories/user-data'
import { getAllLevelsProgress } from '../../features/jlpt/progress-model'
import type { JlptLevel } from '../../types/domain'

const productionRoot = resolve('public/data/production')
const manifestText = await readFile(join(productionRoot, 'manifest.json'), 'utf8').catch(() => null)
const manifest = manifestText ? JSON.parse(manifestText) as { counts: Record<string, number>; jlptCounts: Record<JlptLevel, Record<'vocabulary' | 'kanji' | 'grammar', number>> } : null
const levels: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']

function productionSource(requests: string[] = []) {
  return new StaticReferenceDataSource({ assetBase: '/data/production/', fetcher: async (input) => {
    const relative = String(input).slice('/data/production/'.length)
    requests.push(relative)
    return new Response(await readFile(join(productionRoot, relative)), { headers: { 'Content-Type': 'application/json' } })
  } })
}

describe.skipIf(!manifest)('paged browsing reaches every production record', () => {
  it('pages through every kanji and grammar record with 100-record pages', async () => {
    const source = productionSource()
    for (const [collection, expected] of [['kanji', manifest!.counts.kanji], ['grammar', manifest!.counts.grammar]] as const) {
      const seen = new Set<string>()
      let total: number | undefined
      for (let page = 0; ; page++) {
        const result = await source[collection].search('', { limit: 100, offset: page * 100 })
        total = result.total
        result.items.forEach((item) => seen.add(item.id))
        if (!result.hasMore) break
      }
      expect(total).toBe(expected)
      expect(seen.size, collection).toBe(expected)
    }
  })

  it('pages through the largest JLPT lists without the former 500-record cap', async () => {
    const source = productionSource()
    for (const [category, repository] of [['vocabulary', source.dictionary], ['kanji', source.kanji]] as const) {
      const expected = manifest!.jlptCounts.N1[category]
      const seen = new Set<string>()
      for (let offset = 0; offset < expected; offset += 100) (await repository.getByJlptLevel('N1', { limit: 100, offset })).items.forEach((item) => seen.add(item.id))
      expect(seen.size, category).toBe(expected)
      expect(expected).toBeGreaterThan(500)
    }
  })

  describe('JLPT dataset progress from per-level ID lists', () => {
    const study = new StudyRepository()
    beforeAll(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
    afterAll(async () => { await Promise.all(db.tables.map((table) => table.clear())); await db.close() })

    it('matches the per-level lists and reads no dictionary record files', async () => {
      const requests: string[] = []
      const source = productionSource(requests)
      for (const level of levels) expect((await source.dictionary.idsByJlptLevel(level)).length).toBe(manifest!.jlptCounts[level].vocabulary)
      const [n5] = await source.dictionary.idsByJlptLevel('N5')
      const [n1Kanji] = await source.kanji.idsByJlptLevel('N1')
      await study.setStatus('reference-word', n5, 'known')
      await study.setStatus('kanji', n1Kanji, 'learning')
      await study.setStatus('reference-word', 'jmdict:0000001', 'known')
      requests.length = 0
      const progress = await getAllLevelsProgress(source, study)
      expect(progress.get('N5')?.vocabulary).toMatchObject({ available: manifest!.jlptCounts.N5.vocabulary, known: 1, studied: 1 })
      expect(progress.get('N1')?.kanji).toMatchObject({ available: manifest!.jlptCounts.N1.kanji, learning: 1 })
      // Only jlpt/<category>/<level>.json ID lists may be read; record buckets live under versions/<v>/<collection>/.
      expect(requests.filter((path) => /^versions\/[^/]+\/(dictionary|kanji|grammar)\//.test(path))).toEqual([])
      expect(await db.dictionaryEntries.count()).toBe(0)
    })
  })
})
