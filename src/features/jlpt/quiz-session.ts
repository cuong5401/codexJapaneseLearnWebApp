import type { QuizAnswerSummary } from '../../types/domain'
import { isCorrectChoice, type QuizQuestion } from './quiz-model'

export interface QuizSessionState {
  questions: QuizQuestion[]
  answers: QuizAnswerSummary[]
  startedAt: number
  currentIndex: number
}
export function createQuizSession(questions: QuizQuestion[], startedAt: number): QuizSessionState {
  return { questions: [...questions], answers: [], startedAt, currentIndex: 0 }
}
export function recordQuizAnswer(session: QuizSessionState, choiceId: string): QuizSessionState {
  const question = session.questions[session.currentIndex]
  if (!question || session.answers.some((answer) => answer.questionId === question.id)) throw new Error('This question has already been answered or the session is complete.')
  const selected = question.choices.find((choice) => choice.id === choiceId)
  if (!selected) throw new Error('Choose one of the available answer choices.')
  const correctAnswer = question.choices.find((choice) => choice.id === question.correctChoiceId)
  if (!correctAnswer) throw new Error('This quiz question has no correct choice.')
  const answer: QuizAnswerSummary = { questionId: question.id, itemId: question.itemId, questionType: question.questionType, prompt: question.prompt, selectedAnswer: selected.label, correctAnswer: correctAnswer.label, isCorrect: isCorrectChoice(question, choiceId) }
  return { ...session, answers: [...session.answers, answer], currentIndex: session.currentIndex + 1 }
}
export function summarizeQuizSession(session: QuizSessionState) {
  const questionCount = session.questions.length
  const correctCount = session.answers.filter((answer) => answer.isCorrect).length
  const questionTypeCounts = Object.fromEntries([...new Set(session.questions.map((question) => question.questionType))].map((type) => {
    const answers = session.answers.filter((answer) => answer.questionType === type)
    return [type, { correct: answers.filter((answer) => answer.isCorrect).length, total: answers.length }]
  }))
  return { questionCount, correctCount, incorrectCount: questionCount - correctCount, questionTypeCounts }
}
