import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/database'
import { StudyRepository } from '../../db/repositories/user-data'
import type { ReferenceDataSource } from '../../db/sources/reference-source'
import type { DictionaryEntry, JlptLevel, KanjiEntry, QuizAttempt, ReviewLog, SrsCard, StudyState } from '../../types/domain'
import {
  addLocalDays, addQuizAttempt, addReviewLog, buildRecentActivity, calculateStreaks, createQuizAggregate, createReviewHistoryAggregate, localDayKey, localDayRange,
  startOfLocalWeek, summarizeQuizzes, summarizeSrsCards, summarizeStudyActivity, summarizeVocabulary,
} from './progress-model'
import { loadJlptDatasetProgress, loadLocalProgress } from './progress-service'

// A zone with DST, so local-day and DST boundaries are exercised rather than assumed.
// Set before any fixture timestamp below is computed; restored after this file.
const originalTz = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })

const at = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime()
const NOW = at(2026, 9, 29, 15)

function card(id: string, patch: Partial<SrsCard> = {}): SrsCard {
  return { id, itemType: 'reference-word', itemId: id, cardType: 'recognition', createdAt: 1, lastReviewedAt: null, nextReviewAt: NOW, interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, state: 'new', ...patch }
}
function log(id: string, reviewedAt: number, rating = 3, cardId = 'card-1'): ReviewLog {
  return { id, cardId, reviewedAt, rating, previousInterval: null, newInterval: 1 }
}
function state(itemType: StudyState['itemType'], itemId: string, status: StudyState['status'], updatedAt = NOW - 1_000): StudyState {
  return { id: `${itemType}:${itemId}`, itemType, itemId, status, firstSeenAt: updatedAt, lastSeenAt: updatedAt, updatedAt }
}
function attempt(id: string, completedAt: number, answers: Array<[QuizAttempt['questionTypes'][number], boolean]>, level: QuizAttempt['jlptLevel'] = 'N5'): QuizAttempt {
  return {
    id, jlptLevel: level, category: 'vocabulary', questionTypes: [...new Set(answers.map(([type]) => type))], startedAt: completedAt - 5_000, completedAt,
    questionCount: answers.length, correctCount: answers.filter(([, correct]) => correct).length, durationMs: 5_000,
    answers: answers.map(([questionType, isCorrect], index) => ({ questionId: `${id}-${index}`, itemId: `w${index}`, questionType, prompt: '猫', selectedAnswer: 'x', correctAnswer: 'x', isCorrect })),
  }
}
function entry(id: string, level: DictionaryEntry['jlptLevel'] = 'N5'): DictionaryEntry {
  return { id, datasetVersion: 'test', word: `語${id}`, reading: 'ご', normalizedWord: `語${id}`, normalizedReading: 'ご', meanings: { vi: [], en: ['word'] }, normalizedMeaningVi: [], normalizedMeaningEn: ['word'], partsOfSpeech: [], jlptLevel: level, isCommon: null, frequencyRank: null, kanjiIds: [], exampleSentenceIds: [], tags: [] }
}

/** A reference source that records every call and fails loudly on any corpus-wide operation. */
function spySource(records: Record<string, DictionaryEntry> = {}, options: { throwOnGet?: boolean; levelIds?: Partial<Record<JlptLevel, string[]>>; kanjiByCharacter?: Record<string, KanjiEntry> } = {}) {
  const forbidden = (name: string) => vi.fn(() => { throw new Error(`corpus operation not allowed: ${name}`) })
  const getById = vi.fn(async (id: string) => { if (options.throwOnGet) throw new Error('offline'); return records[id] })
  const countByJlptLevel = vi.fn(async () => 3)
  const idsByJlptLevel = options.levelIds ? vi.fn(async (level: JlptLevel) => options.levelIds?.[level] ?? []) : undefined
  const source = {
    origin: 'bundled',
    dictionary: { getById, countByJlptLevel, ...(idsByJlptLevel ? { idsByJlptLevel } : {}), getByExactWord: forbidden('getByExactWord'), getByExactReading: forbidden('getByExactReading'), getByJlptLevel: forbidden('dictionary.getByJlptLevel'), getPrefix: forbidden('getPrefix'), getByKanji: forbidden('getByKanji'), count: forbidden('dictionary.count'), search: forbidden('dictionary.search') },
    kanji: { getById: vi.fn(async () => undefined), countByJlptLevel: vi.fn(async () => 0), getByCharacter: vi.fn(async (character: string) => options.kanjiByCharacter?.[character]), getByJlptLevel: forbidden('kanji.getByJlptLevel'), search: forbidden('kanji.search'), count: forbidden('kanji.count') },
    grammar: { getById: vi.fn(async () => undefined), countByJlptLevel: vi.fn(async () => 0), getByPattern: forbidden('getByPattern'), getByJlptLevel: forbidden('grammar.getByJlptLevel'), search: forbidden('grammar.search'), count: forbidden('grammar.count') },
    examples: { getByIds: forbidden('examples.getByIds') },
  }
  return { source: source as unknown as ReferenceDataSource, getById, countByJlptLevel, idsByJlptLevel }
}

describe('local calendar days', () => {
  it('runs in a DST zone so these checks are meaningful', () => {
    expect(new Date(at(2026, 3, 7)).getTimezoneOffset()).toBe(300)
    expect(new Date(at(2026, 3, 9)).getTimezoneOffset()).toBe(240)
  })

  it('keys events by local date rather than UTC date', () => {
    const lateEvening = at(2026, 9, 29, 23, 30)
    expect(new Date(lateEvening).toISOString().slice(0, 10)).toBe('2026-09-30')
    expect(localDayKey(lateEvening)).toBe('2026-09-29')
    expect(localDayKey(at(2026, 9, 30, 0, 1))).toBe('2026-09-30')
  })

  it('steps across DST transitions by calendar day, not by 24 hours', () => {
    expect(addLocalDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addLocalDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addLocalDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(addLocalDays('2026-11-02', -2)).toBe('2026-10-31')
    const spring = localDayRange(at(2026, 3, 8))
    const autumn = localDayRange(at(2026, 11, 1))
    expect((spring.nextStart - spring.start) / 3_600_000).toBe(23)
    expect((autumn.nextStart - autumn.start) / 3_600_000).toBe(25)
    expect(localDayKey(at(2026, 11, 1, 0, 30))).toBe(localDayKey(at(2026, 11, 1, 23, 30)))
  })

  it('starts weeks on Monday', () => {
    expect(startOfLocalWeek('2026-09-29')).toBe('2026-09-28')
    expect(startOfLocalWeek('2026-09-28')).toBe('2026-09-28')
    expect(startOfLocalWeek('2026-10-04')).toBe('2026-09-28')
  })
})

describe('streaks', () => {
  it('is zero with no activity', () => {
    expect(calculateStreaks([], '2026-09-29')).toEqual({ current: 0, longest: 0, lastActiveDay: null })
  })

  it('counts a single study day', () => {
    expect(calculateStreaks(['2026-09-29'], '2026-09-29')).toEqual({ current: 1, longest: 1, lastActiveDay: '2026-09-29' })
  })

  it('counts consecutive days and keeps yesterday’s streak alive until today ends', () => {
    expect(calculateStreaks(['2026-09-27', '2026-09-28', '2026-09-29'], '2026-09-29').current).toBe(3)
    expect(calculateStreaks(['2026-09-27', '2026-09-28'], '2026-09-29').current).toBe(2)
  })

  it('breaks after a full missed day while preserving the longest run', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-10', '2026-09-26', '2026-09-27']
    expect(calculateStreaks(days, '2026-09-29')).toEqual({ current: 0, longest: 4, lastActiveDay: '2026-09-27' })
    expect(calculateStreaks([...days, '2026-09-29'], '2026-09-29')).toMatchObject({ current: 1, longest: 4 })
  })

  it('treats days across a DST change as consecutive', () => {
    expect(calculateStreaks(['2026-03-07', '2026-03-08', '2026-03-09'], '2026-03-09').current).toBe(3)
    expect(calculateStreaks(['2026-10-31', '2026-11-01', '2026-11-02'], '2026-11-02').current).toBe(3)
  })

  it('ignores duplicate and future days', () => {
    expect(calculateStreaks(['2026-09-29', '2026-09-29', '2026-09-30'], '2026-09-29')).toEqual({ current: 1, longest: 1, lastActiveDay: '2026-09-29' })
  })
})

describe('review activity', () => {
  it('aggregates ratings and per-day counts from review logs', () => {
    const history = createReviewHistoryAggregate()
    for (const [index, rating] of [1, 3, 3, 4, 2, 3].entries()) addReviewLog(history, log(`l${index}`, at(2026, 9, 29, 9, index), rating))
    addReviewLog(history, log('late', at(2026, 9, 28, 23, 59), 7))
    expect(history.total).toBe(7)
    expect(history.ratings).toEqual({ 1: 1, 2: 1, 3: 3, 4: 1 })
    expect(history.days.get('2026-09-29')).toBe(6)
    expect(history.days.get('2026-09-28')).toBe(1)
  })

  it('summarizes 14 local days, this week, and the week-over-week trend', () => {
    const days = new Map([['2026-09-29', 5], ['2026-09-28', 3], ['2026-09-22', 2], ['2026-09-16', 20]])
    const activity = summarizeStudyActivity(days, NOW)
    expect(activity.recentDays).toHaveLength(14)
    expect(activity.recentDays[0].day).toBe('2026-09-16')
    expect(activity.recentDays.at(-1)).toEqual({ day: '2026-09-29', reviews: 5, isToday: true })
    expect(activity.today).toBe(5)
    expect(activity.thisWeek).toEqual({ reviews: 8, activeDays: 2, elapsedDays: 2 })
    expect(activity.last7Days).toBe(8)
    expect(activity.previous7Days).toBe(22)
    expect(activity.trend).toBe('down')
    expect(activity.streak).toMatchObject({ current: 2, longest: 2 })
    expect(summarizeStudyActivity(new Map(), NOW).trend).toBe('none')
  })
})

describe('SRS summary', () => {
  it('counts states and due, due-today and overdue scheduled cards', () => {
    const { start } = localDayRange(NOW)
    const cards = [
      card('new', { state: 'new', nextReviewAt: NOW - 10 }),
      card('due-review', { state: 'review', nextReviewAt: NOW - 60_000 }),
      card('overdue', { state: 'review', nextReviewAt: start - 1 }),
      card('learning-now', { state: 'learning', nextReviewAt: NOW }),
      card('relearning-later', { state: 'relearning', nextReviewAt: at(2026, 9, 29, 22) }),
      card('tomorrow', { state: 'review', nextReviewAt: at(2026, 9, 30, 0, 30) }),
      card('suspended', { state: 'suspended', nextReviewAt: null }),
    ]
    expect(summarizeSrsCards(cards, NOW)).toEqual({
      total: 7,
      states: { new: 1, learning: 1, relearning: 1, review: 3, suspended: 1 },
      dueNow: 3,
      dueToday: 4,
      overdue: 1,
    })
  })
})

describe('quiz summary', () => {
  it('reports accuracy, average score and per-mode results from stored attempts', () => {
    const aggregate = createQuizAggregate()
    addQuizAttempt(aggregate, attempt('a', 1, [['japanese-meaning', true], ['japanese-meaning', true], ['reading', false], ['meaning-japanese', true]]))
    addQuizAttempt(aggregate, attempt('b', 2, [['reading', true], ['reading', false]], 'N4'))
    const summary = summarizeQuizzes(aggregate)
    expect(summary).toMatchObject({ completed: 2, questions: 6, correct: 4 })
    expect(summary.accuracy).toBeCloseTo(4 / 6)
    expect(summary.averageScore).toBeCloseTo((3 / 4 + 1 / 2) / 2)
    expect(summary.byType).toEqual({ 'japanese-meaning': { answered: 2, correct: 2 }, 'meaning-japanese': { answered: 1, correct: 1 }, reading: { answered: 3, correct: 1 } })
    expect(summary.byLevel).toEqual({ N5: { completed: 1, questions: 4, correct: 3 }, N4: { completed: 1, questions: 2, correct: 1 } })
  })

  it('returns null rates instead of inventing values with no quizzes', () => {
    expect(summarizeQuizzes(createQuizAggregate())).toMatchObject({ completed: 0, accuracy: null, averageScore: null })
  })
})

describe('vocabulary distribution', () => {
  it('tracks reference and custom identities separately and ignores kanji/grammar', () => {
    const distribution = summarizeVocabulary({
      savedReferenceIds: ['shared-id', 'saved-only'],
      customWordIds: ['shared-id', 'custom-only'],
      cards: [card('c1', { itemType: 'reference-word', itemId: 'review-only' }), card('c2', { itemType: 'custom-word', itemId: 'custom-only' })],
      studyStates: [state('reference-word', 'shared-id', 'known'), state('custom-word', 'shared-id', 'learning'), state('reference-word', 'status-only', 'learning'), state('kanji', '猫', 'known'), state('grammar', 'g1', 'learning')],
    })
    expect(distribution).toEqual({ tracked: 6, unseen: 3, learning: 2, known: 1, suspended: 0 })
  })
})

describe('recent activity', () => {
  it('groups reviews per local day and merges quizzes, custom words and status changes newest first', () => {
    const cards = new Map([['c1', card('c1', { itemId: 'w1' })], ['c2', card('c2', { itemType: 'custom-word', itemId: 'cw' })]])
    const logs = [log('l1', at(2026, 9, 29, 9), 3, 'c1'), log('l2', at(2026, 9, 29, 10), 3, 'c2'), log('l3', at(2026, 9, 29, 11), 3, 'c1'), log('l4', at(2026, 9, 27, 9), 3, 'c1')]
    const entries = buildRecentActivity({
      recentLogs: logs,
      reviewDays: new Map([['2026-09-29', 30], ['2026-09-27', 1]]),
      cards,
      quizzes: [{ id: 'q', jlptLevel: 'N5', questionCount: 10, correctCount: 8, completedAt: at(2026, 9, 29, 12) }],
      customWords: [{ id: 'cw', word: '推薦', createdAt: at(2026, 9, 28, 8) }],
      studyStates: [state('reference-word', 'w1', 'known', at(2026, 9, 29, 13)), state('reference-word', 'w2', 'unseen', at(2026, 9, 29, 14))],
    })
    expect(entries.map((item) => item.kind)).toEqual(['status', 'quiz', 'review', 'custom-word', 'review'])
    const today = entries[2]
    expect(today).toMatchObject({ kind: 'review', day: '2026-09-29', reviews: 30, at: at(2026, 9, 29, 11) })
    expect(today.kind === 'review' && today.items.map((item) => item.cardId)).toEqual(['c1', 'c2'])
  })
})

describe('progress service over IndexedDB', () => {
  const study = new StudyRepository()
  beforeEach(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close() })

  it('reports an empty database without touching reference data', async () => {
    const { source, getById } = spySource()
    const progress = await loadLocalProgress({ referenceSource: source, now: NOW })
    expect(progress.isEmpty).toBe(true)
    expect(progress.vocabulary).toEqual({ tracked: 0, unseen: 0, learning: 0, known: 0, suspended: 0 })
    expect(progress.activity.streak).toEqual({ current: 0, longest: 0, lastActiveDay: null })
    expect(progress.quizzes.accuracy).toBeNull()
    expect(progress.recentActivity).toEqual([])
    expect(getById).not.toHaveBeenCalled()
  })

  it('derives metrics from user data only and is deterministic', async () => {
    await db.srsCards.bulkPut([
      card('c1', { itemId: 'ref-1', state: 'review', nextReviewAt: NOW - 1, snapshotWord: '推薦' }),
      card('c2', { itemType: 'custom-word', itemId: 'custom-1', state: 'learning', nextReviewAt: at(2026, 9, 29, 20) }),
    ])
    await db.customWords.put({ id: 'custom-1', word: '自作', reading: 'じさく', meaningsVi: [], meaningsEn: ['own work'], partsOfSpeech: [], sourceType: 'manual', createdAt: at(2026, 9, 27), updatedAt: at(2026, 9, 27) })
    await db.reviewLogs.bulkPut([log('l1', at(2026, 9, 27, 9), 3, 'c1'), log('l2', at(2026, 9, 28, 9), 1, 'c2'), log('l3', at(2026, 9, 29, 9), 4, 'c1')])
    await db.quizAttempts.put(attempt('q1', at(2026, 9, 28, 10), [['reading', true], ['japanese-meaning', false]]))
    await db.studyStates.bulkPut([state('reference-word', 'ref-1', 'known'), state('custom-word', 'custom-1', 'learning')])
    const { source, getById } = spySource()
    const first = await loadLocalProgress({ referenceSource: source, now: NOW })
    const second = await loadLocalProgress({ referenceSource: source, now: NOW })
    expect(second).toEqual(first)
    expect(first.isEmpty).toBe(false)
    expect(first.activity.streak).toMatchObject({ current: 3, longest: 3 })
    expect(first.reviews).toEqual({ total: 3, ratings: { 1: 1, 2: 0, 3: 1, 4: 1 } })
    expect(first.srs).toMatchObject({ dueNow: 1, dueToday: 2, overdue: 0 })
    expect(first.quizzes).toMatchObject({ completed: 1, questions: 2, correct: 1, accuracy: 0.5 })
    expect(first.vocabulary).toMatchObject({ tracked: 2, learning: 1, known: 1, unseen: 0 })
    const review = first.recentActivity.find((item) => item.kind === 'review' && item.day === '2026-09-29')
    expect(review?.kind === 'review' && review.resolved.map((item) => item.title)).toEqual(['推薦'])
    // Snapshots and local CustomWords titled everything, so no reference lookup was needed.
    expect(getById).not.toHaveBeenCalled()
  })

  it('falls back safely for missing or unreachable reference entries', async () => {
    await db.srsCards.put(card('c-missing', { itemId: 'gone', state: 'review', nextReviewAt: NOW + 1 }))
    await db.reviewLogs.put(log('l1', at(2026, 9, 29, 9), 3, 'c-missing'))
    await db.savedReferenceWords.put({ entryId: 'saved-gone', savedAt: 1, wordSnapshot: '旧語' })
    await db.studyStates.bulkPut([state('reference-word', 'saved-gone', 'learning', at(2026, 9, 29, 10)), state('kanji', 'openjlpt-kanji:gone', 'known', at(2026, 9, 29, 11))])
    for (const options of [{}, { throwOnGet: true }]) {
      const { source, getById } = spySource({}, options)
      const progress = await loadLocalProgress({ referenceSource: source, now: NOW })
      const titles = progress.recentActivity.flatMap((item) => item.kind === 'review' ? item.resolved.map((resolved) => resolved.title) : item.kind === 'quiz' ? [] : [item.resolved.title])
      expect(titles).toEqual(['データにない漢字', '旧語', '辞書にない単語', '旧語'])
      expect(getById).toHaveBeenCalledTimes(1)
      expect(getById).toHaveBeenCalledWith('gone')
    }
  })

  it('lists saved words and favorites, titling kanji stored by character or by ID', async () => {
    await db.savedReferenceWords.put({ entryId: 'jmdict:1', savedAt: at(2026, 9, 29, 8), wordSnapshot: '保存語' })
    await db.favorites.bulkPut([{ itemType: 'kanji', itemId: '猫', createdAt: at(2026, 9, 29, 9) }, { itemType: 'grammar', itemId: 'gone-grammar', createdAt: at(2026, 9, 29, 7) }])
    const cat: KanjiEntry = { id: 'openjlpt-kanji:732b', datasetVersion: 'test', character: '猫', meanings: { vi: [], en: ['cat'] }, onyomi: [], kunyomi: [], strokeCount: 11, radical: null, radicalName: null, jlptLevel: 'N2', grade: null, frequencyRank: null, commonCompounds: [], tags: [] }
    const { source, getById } = spySource({}, { kanjiByCharacter: { 猫: cat } })
    const progress = await loadLocalProgress({ referenceSource: source, now: NOW })
    expect(progress.isEmpty).toBe(false)
    expect(progress.recentActivity.map((item) => [item.kind, item.kind === 'quiz' || item.kind === 'review' ? null : item.resolved.title, item.kind === 'quiz' || item.kind === 'review' ? null : item.resolved.href ?? null])).toEqual([
      ['favorite', '猫', '/kanji/%E7%8C%AB'],
      ['saved-word', '保存語', '/dictionary/jmdict%3A1'],
      ['favorite', 'データにない文法', null],
    ])
    expect(getById).not.toHaveBeenCalled()
  })

  it('uses per-level ID lists when the source provides them, counting multi-level records in each level', async () => {
    await study.setStatus('reference-word', 'both-levels', 'known')
    await study.setStatus('reference-word', 'n4-only', 'learning')
    await study.setStatus('reference-word', 'untagged', 'known')
    const { source, getById, idsByJlptLevel } = spySource({}, { levelIds: { N5: ['both-levels', 'a', 'b'], N4: ['both-levels', 'n4-only', 'c'] } })
    const levels = await loadJlptDatasetProgress(source, study)
    expect(levels.get('N5')?.vocabulary).toEqual({ available: 3, unseen: 2, learning: 0, known: 1, studied: 1 })
    expect(levels.get('N4')?.vocabulary).toEqual({ available: 3, unseen: 1, learning: 1, known: 1, studied: 2 })
    expect(getById).not.toHaveBeenCalled()
    expect(idsByJlptLevel).toHaveBeenCalledTimes(5)
  })

  it('computes JLPT dataset progress from level counts and bounded StudyState lookups, never scanning the corpus', async () => {
    await study.setStatus('reference-word', 'n5-a', 'known')
    await study.setStatus('reference-word', 'n5-b', 'learning')
    await study.setStatus('reference-word', 'missing', 'known')
    const { source, getById, countByJlptLevel } = spySource({ 'n5-a': entry('n5-a'), 'n5-b': entry('n5-b'), 'n4-a': entry('n4-a', 'N4') })
    const levels = await loadJlptDatasetProgress(source, study)
    expect(levels.get('N5')?.vocabulary).toEqual({ available: 3, unseen: 1, learning: 1, known: 1, studied: 2 })
    expect(levels.get('N4')?.vocabulary).toMatchObject({ available: 3, studied: 0 })
    expect(levels.get('N1')?.kanji).toMatchObject({ available: 0, studied: 0 })
    expect(countByJlptLevel).toHaveBeenCalledTimes(5)
    expect(getById).toHaveBeenCalledTimes(3)
  })
})
