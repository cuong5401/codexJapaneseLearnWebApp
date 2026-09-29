import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { StaticReferenceDataSource } from './static-reference-source'
import { db } from '../database'
import { generateQuizQuestions } from '../../features/jlpt/quiz-model'
import type { JlptLevel, QuizQuestionType } from '../../types/domain'

const productionRoot = resolve('public/data/production')
const exists = await readFile(join(productionRoot, 'manifest.json'), 'utf8').then(() => true, () => false)
const searchBaselinePath = resolve('scripts/data/regression/phase86-search-baseline.json')
const levels: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']

describe.skipIf(!exists)('generated production reference dataset', () => {
  it('serves dictionary, readings, English, kanji, grammar, examples and all real JLPT level counts without IndexedDB import', async () => {
    const requests: Array<{ url: string; bytes: number }> = []
    const source = new StaticReferenceDataSource({ assetBase: '/data/production/', fetcher: async (input) => {
      const url = String(input)
      const relative = url.slice('/data/production/'.length)
      const bytes = await readFile(join(productionRoot, relative))
      requests.push({ url, bytes: bytes.length })
      return new Response(bytes, { headers: { 'Content-Type': 'application/json' } })
    } })
    expect(await db.dictionaryEntries.count()).toBe(0)
    const queryResults = []
    for (const query of ['推薦', '推奨', '改善', '省略', '読解', '食べる', '雨宿り', 'recommend']) {
      const before = requests.length
      const started = performance.now()
      const result = await source.dictionary.search(query, { limit: 8 })
      queryResults.push({ query, queryMs: Math.round((performance.now() - started) * 100) / 100, requests: requests.length - before, bytes: requests.slice(before).reduce((sum, request) => sum + request.bytes, 0), ids: result.items.map((entry) => entry.id) })
      expect(result.items.length, `No results for ${query}`).toBeGreaterThan(0)
    }
    console.info('Production search measurements:', JSON.stringify(queryResults))
    if (process.env.CAPTURE_PHASE86_SEARCH_BASELINE === '1') {
      await mkdir(resolve('scripts/data/regression'), { recursive: true })
      await writeFile(searchBaselinePath, JSON.stringify({ sourceDatasetVersion: JSON.parse(await readFile(join(productionRoot, 'manifest.json'), 'utf8')).datasetVersion, queries: queryResults.map(({ query, ids }) => ({ query, ids })) }, null, 2) + '\n')
    } else {
      const baseline = JSON.parse(await readFile(searchBaselinePath, 'utf8')) as { queries: Array<{ query: string; ids: string[] }> }
      expect(queryResults.map(({ query, ids }) => ({ query, ids }))).toEqual(baseline.queries)
    }
    expect(await source.dictionary.getByExactWord('推薦')).toMatchObject({ word: '推薦', meanings: { vi: [] } })
    expect(await source.dictionary.getByExactReading('たべる')).toBeDefined()
    expect((await source.kanji.getByCharacter('推'))?.character).toBe('推')
    expect((await source.grammar.getByJlptLevel('N5', { limit: 1 })).items).toHaveLength(1)
    expect(await source.examples.getByIds(['tatoeba:missing'])).toEqual([])
    for (const level of levels) for (const category of ['vocabulary', 'kanji', 'grammar'] as const) {
      const count = category === 'vocabulary' ? await source.dictionary.countByJlptLevel(level) : await source[category].countByJlptLevel(level)
      expect(count).toBeGreaterThan(0)
      const page = category === 'vocabulary' ? await source.dictionary.getByJlptLevel(level, { limit: 1 }) : await source[category].getByJlptLevel(level, { limit: 1 })
      expect(page.items).toHaveLength(1)
    }
    expect(await db.dictionaryEntries.count()).toBe(0)
  }, 120_000)

  it('generates and prints at least 20 English fallback quiz questions across N5, N3 and N1 for manual distractor audit', async () => {
    const source = new StaticReferenceDataSource({ assetBase: '/data/production/', fetcher: async (input) => new Response(await readFile(join(productionRoot, String(input).slice('/data/production/'.length))), { headers: { 'Content-Type': 'application/json' } }) })
    const audit: Array<{ level: string; type: QuizQuestionType; prompt: string; choices: string[]; answer: string; pos: string[] }> = []
    for (const level of ['N5', 'N3', 'N1'] as const) {
      const rows = await source.dictionary.getByJlptLevel(level, { limit: 200 })
      for (const questionType of ['japanese-meaning', 'meaning-japanese', 'reading'] as const) {
        const questions = generateQuizQuestions(rows.items, { level, count: 30, questionTypes: [questionType], random: () => 0.37 })
        audit.push(...questions.map((question) => ({ level, type: question.questionType, prompt: question.prompt, choices: question.choices.map((choice) => choice.label), answer: question.choices.find((choice) => choice.id === question.correctChoiceId)!.label, pos: question.entry.partsOfSpeech })))
      }
    }
    const sample: typeof audit = []
    for (let index = 0; index < 10; index += 1) for (const level of ['N5', 'N3', 'N1'] as const) for (const type of ['japanese-meaning', 'meaning-japanese', 'reading'] as const) {
      const question = audit.find((item, itemIndex) => itemIndex >= index && item.level === level && item.type === type && !sample.some((existing) => existing.prompt === item.prompt))
      if (question) sample.push(question)
    }
    console.info('Production quiz distractor audit sample:', JSON.stringify(sample, null, 2))
    expect(audit.length).toBeGreaterThanOrEqual(20)
    expect(new Set(sample.map((item) => item.level))).toEqual(new Set(['N5', 'N3', 'N1']))
    expect(new Set(sample.map((item) => item.type))).toEqual(new Set(['japanese-meaning', 'meaning-japanese', 'reading']))
    expect(audit.every((item) => item.choices.length === 4 && new Set(item.choices).size === 4 && item.choices.includes(item.answer))).toBe(true)
  }, 120_000)
})
