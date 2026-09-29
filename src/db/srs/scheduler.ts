import type { ReviewLog, SrsCard } from '../../types/domain'

export type ReviewRating = 1 | 2 | 3 | 4
export const REVIEW_RATINGS: ReviewRating[] = [1, 2, 3, 4]
export const LEARNING_STEPS_MINUTES = [10, 1440] as const
export const RELEARNING_STEP_MINUTES = 10
export const MAX_INTERVAL_DAYS = 36_500
export const MIN_EASE_FACTOR = 1.3
export const MAX_EASE_FACTOR = 3

export function scheduleAnswer(card: SrsCard, rating: ReviewRating, now: number): { card: SrsCard; log: ReviewLog } {
  if (card.state === 'suspended') throw new Error('A suspended card cannot be reviewed.')
  const wasNew = card.state === 'new'
  const previousInterval = card.interval > 0 ? card.interval : null
  let interval = card.interval
  let easeFactor = card.easeFactor || 2.5
  let repetitions = card.repetitions
  let lapses = card.lapses
  let state: SrsCard['state']
  let learningStep = card.learningStep ?? 0
  let delayMinutes: number

  if (rating === 4) easeFactor = Math.min(MAX_EASE_FACTOR, easeFactor + 0.15)
  if (rating === 2) easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.15)
  if (rating === 1) easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.2)

  if (card.state === 'review' && rating === 1) {
    state = 'relearning'; lapses += 1; learningStep = 0; delayMinutes = RELEARNING_STEP_MINUTES
  } else if (card.state === 'new' || card.state === 'learning' || card.state === 'relearning') {
    if (rating === 1) {
      state = wasNew ? 'learning' : card.state; learningStep = 0; delayMinutes = LEARNING_STEPS_MINUTES[0]
    } else if (rating === 2) {
      state = wasNew ? 'learning' : card.state; delayMinutes = card.state === 'new' ? 20 : LEARNING_STEPS_MINUTES[Math.min(learningStep, 1)]
    } else if (rating === 3 && learningStep < 1 && card.state !== 'relearning') {
      state = 'learning'; learningStep = 1; delayMinutes = LEARNING_STEPS_MINUTES[1]
    } else {
      state = 'review'; repetitions = Math.max(1, repetitions + 1); interval = rating === 4 ? 4 : 1; learningStep = 0
      if (card.state === 'relearning' && card.interval > 0) interval = Math.max(1, Math.round(card.interval * 0.7))
      delayMinutes = interval * 1440
    }
  } else if (rating === 2) {
    state = 'review'; interval = Math.max(1, Math.round((card.interval || 1) * 1.2)); repetitions += 1; delayMinutes = interval * 1440
  } else {
    state = 'review'
    interval = card.repetitions === 0 ? 1 : card.repetitions === 1 ? 6 : Math.round((card.interval || 1) * easeFactor * (rating === 4 ? 1.3 : 1))
    interval = Math.max(1, Math.min(MAX_INTERVAL_DAYS, interval)); repetitions += 1; delayMinutes = interval * 1440
  }

  const updated: SrsCard = { ...card, state, interval, easeFactor, repetitions, lapses, learningStep, lastReviewedAt: now, nextReviewAt: now + delayMinutes * 60_000 }
  return { card: updated, log: { id: crypto.randomUUID(), cardId: card.id, reviewedAt: now, rating, previousInterval, newInterval: interval, wasNew } }
}

export function localDayBounds(timestamp = Date.now()): { start: number; end: number } {
  const date = new Date(timestamp)
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1
  return { start, end }
}
