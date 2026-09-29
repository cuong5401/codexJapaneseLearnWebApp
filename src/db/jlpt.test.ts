import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, ACTIVE_DATASET_KEY } from './database'
import { QuizAttemptRepository, SrsRepository, StudyRepository } from './repositories/user-data'
import { indexedDbReferenceSource } from './sources/reference-source'
import { getCategoryProgress } from '../features/jlpt/progress-model'
import type { DictionaryEntry, QuizAttempt } from '../types/domain'
import { normalizeJapanese } from '../lib/japanese-normalization'
import { normalizeVietnamese, normalizeSearchInput } from '../lib/search-normalization'

const study = new StudyRepository()
const history = new QuizAttemptRepository()
const srs = new SrsRepository()
function dictionaryItem(id: string, level: 'N5' | 'N4' = 'N5'): DictionaryEntry {
  return { id, datasetVersion: 'jlpt-test', word: `語${id}`, reading: 'ご', normalizedWord: normalizeJapanese(`語${id}`), normalizedReading: normalizeJapanese('ご'), meanings: { vi: [`nghĩa ${id}`], en: [`meaning ${id}`] }, normalizedMeaningVi: [normalizeVietnamese(`nghĩa ${id}`)], normalizedMeaningEn: [normalizeSearchInput(`meaning ${id}`)], partsOfSpeech: ['noun'], jlptLevel: level, isCommon: null, frequencyRank: null, kanjiIds: [], exampleSentenceIds: [], tags: ['test'] }
}
function makeAttempt(id: string, completedAt: number): QuizAttempt {
  return { id, jlptLevel: 'N5', category: 'vocabulary', questionTypes: ['reading'], startedAt: completedAt - 2_000, completedAt, questionCount: 1, correctCount: 1, durationMs: 2_000, answers: [{ questionId: `${id}-q1`, itemId: 'word-1', questionType: 'reading', prompt: '猫', selectedAnswer: 'ねこ', correctAnswer: 'ねこ', isCorrect: true }] }
}

describe('JLPT progress and quiz history', () => {
  beforeEach(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close() })

  it('derives level progress from available records and the shared StudyState', async () => {
    await db.metadata.put({ key: ACTIVE_DATASET_KEY, value: 'jlpt-test', updatedAt: 1 })
    const rows = [dictionaryItem('word-1'), dictionaryItem('word-2'), dictionaryItem('word-3'), dictionaryItem('word-4'), dictionaryItem('word-n4', 'N4')]
    await db.dictionaryEntries.bulkPut(rows)
    await study.setStatus('reference-word', 'word-1', 'learning')
    await study.setStatus('reference-word', 'word-2', 'known')
    await study.setStatus('reference-word', 'missing-reference', 'known')
    expect(await study.getStatus('reference-word', 'word-1')).toBe('learning')
    expect(await getCategoryProgress(indexedDbReferenceSource, study, 'vocabulary', 'N5')).toEqual({ available: 4, unseen: 2, learning: 1, known: 1, studied: 2 })
    expect(await getCategoryProgress(indexedDbReferenceSource, study, 'vocabulary', 'N4')).toEqual({ available: 1, unseen: 1, learning: 0, known: 0, studied: 0 })
  })

  it('persists compact attempts, orders recent history, and survives database reopen', async () => {
    const { card } = await srs.addToReview('reference-word', 'word-1', { word: '猫', reading: 'ねこ' })
    const before = await srs.get(card.id)
    const attempt = makeAttempt('attempt-old', 100)
    const newer = makeAttempt('attempt-new', 200)
    await history.save(attempt)
    await history.save(newer)
    expect(await history.listRecent('N5', 5)).toEqual([newer, attempt])
    expect(await history.get('attempt-new')).toEqual(newer)
    await db.close(); await db.open()
    expect(await history.get('attempt-old')).toEqual(attempt)
    expect(await srs.get(card.id)).toEqual(before)
    expect(await db.reviewLogs.count()).toBe(0)
  })

  it('keeps attempt durations and answer counts as caller-supplied completed-session facts', async () => {
    const attempt = { ...makeAttempt('attempt-result', 500), questionCount: 10, correctCount: 7, durationMs: 42_000 }
    await history.save(attempt)
    expect(await history.get('attempt-result')).toMatchObject({ questionCount: 10, correctCount: 7, durationMs: 42_000 })
  })
})
