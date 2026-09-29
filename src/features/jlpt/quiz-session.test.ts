import { describe, expect, it } from 'vitest'
import type { QuizQuestion, QuizChoice } from './quiz-model'
import { createQuizSession, recordQuizAnswer, summarizeQuizSession } from './quiz-session'

function question(index: number): QuizQuestion {
  const choices: QuizChoice[] = [{ id: 'right', label: 'meaning' }, { id: 'wrong-1', label: 'other one' }, { id: 'wrong-2', label: 'other two' }, { id: 'wrong-3', label: 'other three' }]
  return { id: `q-${index}`, level: 'N5', questionType: index % 2 ? 'reading' : 'japanese-meaning', prompt: `猫${index}`, itemId: `word-${index}`, choices, correctChoiceId: 'right', entry: { id: `word-${index}`, datasetVersion: 'test', word: `猫${index}`, reading: 'ねこ', normalizedWord: `猫${index}`, normalizedReading: 'ねこ', meanings: { vi: ['mèo'], en: ['cat'] }, normalizedMeaningVi: ['meo'], normalizedMeaningEn: ['cat'], partsOfSpeech: ['noun'], jlptLevel: 'N5', isCommon: null, frequencyRank: null, kanjiIds: [], exampleSentenceIds: [], tags: [] } }
}

describe('JLPT quiz sessions', () => {
  it('records answers exactly once, advances in order, and summarizes a ten-question session', () => {
    const questions = Array.from({ length: 10 }, (_, index) => question(index))
    let session = createQuizSession(questions, 1_000)
    expect(session.currentIndex).toBe(0)
    for (let index = 0; index < questions.length; index++) {
      session = recordQuizAnswer(session, index < 7 ? 'right' : 'wrong-1')
      expect(session.currentIndex).toBe(index + 1)
    }
    expect(session.answers).toHaveLength(10)
    expect(summarizeQuizSession(session)).toEqual({ questionCount: 10, correctCount: 7, incorrectCount: 3, questionTypeCounts: { 'japanese-meaning': { correct: 4, total: 5 }, reading: { correct: 3, total: 5 } } })
    expect(() => recordQuizAnswer(session, 'right')).toThrow(/already been answered|complete/)
  })

  it('rejects an answer ID that is not one of the current question choices', () => {
    const session = createQuizSession([question(0)], 0)
    expect(() => recordQuizAnswer(session, 'unknown-choice')).toThrow(/available answer choices/)
  })
})
