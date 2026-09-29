import { describe, expect, it } from 'vitest'
import type { DictionaryEntry, JlptLevel } from '../../types/domain'
import { normalizeVietnamese } from '../../lib/search-normalization'
import { normalizeJapanese } from '../../lib/japanese-normalization'
import { generateQuizQuestions } from './quiz-model'

const records: Array<[string, string, string, string]> = [
  ['食べる', 'たべる', 'ăn', 'to eat'], ['飲む', 'のむ', 'uống', 'to drink'], ['見る', 'みる', 'xem', 'to see'], ['聞く', 'きく', 'nghe', 'to hear'],
  ['話す', 'はなす', 'nói', 'to speak'], ['読む', 'よむ', 'đọc', 'to read'], ['書く', 'かく', 'viết', 'to write'], ['行く', 'いく', 'đi', 'to go'],
  ['来る', 'くる', 'đến', 'to come'], ['大きい', 'おおきい', 'lớn', 'large'], ['小さい', 'ちいさい', 'nhỏ', 'small'], ['新しい', 'あたらしい', 'mới', 'new'],
]
function entry([word, reading, vi, en]: typeof records[number], index: number, level: JlptLevel = 'N5'): DictionaryEntry {
  return { id: `fixture-${index}`, datasetVersion: 'test', word, reading, normalizedWord: normalizeJapanese(word), normalizedReading: normalizeJapanese(reading), meanings: { vi: [vi], en: [en] }, normalizedMeaningVi: [normalizeVietnamese(vi)], normalizedMeaningEn: [en], partsOfSpeech: ['fixture'], jlptLevel: level, isCommon: null, frequencyRank: null, kanjiIds: [], exampleSentenceIds: [], tags: ['test-only'] }
}
const pool = records.map((row, index) => entry(row, index))
const fixedRandom = () => 0.41

describe('JLPT quiz question generation', () => {
  it.each(['japanese-meaning', 'meaning-japanese', 'reading'] as const)('builds valid %s questions from the selected level', (questionType) => {
    const questions = generateQuizQuestions(pool, { level: 'N5', count: 10, questionTypes: [questionType], random: fixedRandom })
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.length).toBeLessThanOrEqual(10)
    for (const question of questions) {
      expect(question.questionType).toBe(questionType)
      expect(question.level).toBe('N5')
      expect(question.choices).toHaveLength(4)
      expect(question.choices.filter((choice) => choice.id === question.correctChoiceId)).toHaveLength(1)
      const normalize = questionType === 'reading' ? normalizeJapanese : normalizeVietnamese
      expect(new Set(question.choices.map((choice) => normalize(choice.label))).size).toBe(4)
    }
  })

  it('keeps generation deterministic for an injected random stream and respects level/count bounds', () => {
    const mixed = [...pool, entry(records[0]!, 30, 'N4')]
    const options = { level: 'N5' as const, count: 30, questionTypes: ['japanese-meaning', 'meaning-japanese', 'reading'] as ('japanese-meaning' | 'meaning-japanese' | 'reading')[], random: fixedRandom }
    const first = generateQuizQuestions(mixed, options)
    const second = generateQuizQuestions(mixed, options)
    expect(first.map((question) => question.id)).toEqual(second.map((question) => question.id))
    expect(first.length).toBeLessThanOrEqual(30)
    expect(first.every((question) => question.level === 'N5')).toBe(true)
    expect(generateQuizQuestions(pool, { level: 'N5', count: 500, questionTypes: ['reading'], random: fixedRandom }).length).toBeLessThanOrEqual(30)
  })

  it('skips entries when there are too few valid distractors', () => {
    expect(generateQuizQuestions(pool.slice(0, 3), { level: 'N5', count: 10, questionTypes: ['reading'], random: fixedRandom })).toEqual([])
  })

  it('skips ambiguous meaning-to-Japanese prompts when another entry shares the meaning', () => {
    const ambiguous = pool.map((item) => ({ ...item, meanings: { ...item.meanings } }))
    ambiguous[1] = { ...ambiguous[1]!, meanings: { ...ambiguous[1]!.meanings, vi: [ambiguous[0]!.meanings.vi[0]!] } }
    const questions = generateQuizQuestions(ambiguous, { level: 'N5', count: 30, questionTypes: ['meaning-japanese'], random: fixedRandom })
    expect(questions.some((question) => question.itemId === ambiguous[0]!.id || question.itemId === ambiguous[1]!.id)).toBe(false)
  })

  it('does not use another reading as an answer for the same written vocabulary', () => {
    const duplicateWord = [...pool, { ...pool[0]!, id: 'fixture-duplicate', reading: 'たべもの' }]
    const questions = generateQuizQuestions(duplicateWord, { level: 'N5', count: 30, questionTypes: ['reading'], random: fixedRandom })
    expect(questions.some((question) => question.itemId === pool[0]!.id || question.itemId === 'fixture-duplicate')).toBe(false)
  })

  it.each(['japanese-meaning', 'meaning-japanese', 'reading'] as const)('supports English-only production data in %s mode', (questionType) => {
    const english = pool.map((item) => ({ ...item, meanings: { vi: [], en: item.meanings.en } }))
    const questions = generateQuizQuestions(english, { level: 'N5', count: 10, questionTypes: [questionType], random: fixedRandom })
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every((question) => question.choices.length === 4)).toBe(true)
    if (questionType === 'japanese-meaning') expect(questions.every((question) => question.choices.some((choice) => choice.label === question.entry.meanings.en[0]))).toBe(true)
    if (questionType === 'meaning-japanese') expect(questions.every((question) => question.prompt === question.entry.meanings.en[0])).toBe(true)
  })

  it('excludes synonymous gloss alternatives from distractors and ambiguous reverse prompts', () => {
    const english = pool.map((item) => ({ ...item, meanings: { vi: [], en: item.meanings.en } }))
    english[1] = { ...english[1]!, meanings: { vi: [], en: ['to consume; to eat (food)'] } }
    const forward = generateQuizQuestions(english, { level: 'N5', count: 30, questionTypes: ['japanese-meaning'], random: fixedRandom })
    const eating = forward.find((question) => question.itemId === english[0]!.id)
    expect(eating).toBeDefined()
    expect(eating!.choices.some((choice) => choice.label === english[1]!.meanings.en[0])).toBe(false)
    const reverse = generateQuizQuestions(english, { level: 'N5', count: 30, questionTypes: ['meaning-japanese'], random: fixedRandom })
    expect(reverse.some((question) => question.itemId === english[0]!.id || question.itemId === english[1]!.id)).toBe(false)
  })

  it('chooses distractors from the same grammatical category when three are available', () => {
    const categorized = pool.map((item, index) => ({ ...item, partsOfSpeech: [index < 8 ? 'Godan verb' : 'adjective'] }))
    const questions = generateQuizQuestions(categorized, { level: 'N5', count: 30, questionTypes: ['japanese-meaning'], random: fixedRandom })
    for (const question of questions) {
      const validMeanings = categorized.filter((item) => item.partsOfSpeech[0] === question.entry.partsOfSpeech[0]).map((item) => item.meanings.vi[0])
      expect(question.choices.every((choice) => validMeanings.includes(choice.label))).toBe(true)
    }
  })

  it('skips reading questions with alternate valid JMdict readings', () => {
    const alternate = pool.map((item) => ({ ...item }))
    alternate[0] = { ...alternate[0]!, forms: { written: [], readings: ['たべる', 'くらう'].map((text) => ({ text, restrictions: [], noKanji: false, information: [], priority: [] })) } }
    const questions = generateQuizQuestions(alternate, { level: 'N5', count: 30, questionTypes: ['reading'], random: fixedRandom })
    expect(questions.some((question) => question.itemId === alternate[0]!.id)).toBe(false)
  })
})
