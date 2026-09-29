import type { ItemType, JlptLevel, QuizAttempt, QuizQuestionType, ReviewLog, SrsCard, StudyState, StudyStatus } from '../../types/domain'
import type { ReviewRating } from '../../db/srs/scheduler'

/**
 * Pure, deterministic progress calculations. All day arithmetic uses the local calendar
 * (`new Date(year, month, day + n)`), never fixed 24-hour offsets, so DST transitions and
 * non-UTC time zones cannot move an event into the wrong day.
 */

/** Local calendar day in `YYYY-MM-DD` form. */
export type DayKey = string

export function localDayKey(timestamp: number): DayKey {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayKeyToDate(key: DayKey): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addLocalDays(key: DayKey, days: number): DayKey {
  const date = dayKeyToDate(key)
  return localDayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime())
}

/** Local midnight at the start of `timestamp`'s day and at the start of the next day. */
export function localDayRange(timestamp: number): { start: number; nextStart: number } {
  const date = new Date(timestamp)
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
    nextStart: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime(),
  }
}

/** Weeks start on Monday (ISO 8601). */
export function startOfLocalWeek(key: DayKey): DayKey {
  const mondayOffset = (dayKeyToDate(key).getDay() + 6) % 7
  return addLocalDays(key, -mondayOffset)
}

export interface StreakSummary { current: number; longest: number; lastActiveDay: DayKey | null }

/**
 * A study day is a local calendar day with at least one ReviewLog.
 * The current streak counts consecutive study days ending today; when today has no reviews yet,
 * a streak that ended yesterday is still current (it breaks only after a full missed day).
 */
export function calculateStreaks(activeDays: Iterable<DayKey>, today: DayKey): StreakSummary {
  const days = [...new Set(activeDays)].filter((day) => day <= today).sort()
  if (!days.length) return { current: 0, longest: 0, lastActiveDay: null }
  let longest = 1
  let run = 1
  for (let index = 1; index < days.length; index++) {
    run = addLocalDays(days[index - 1], 1) === days[index] ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  const active = new Set(days)
  let cursor = active.has(today) ? today : addLocalDays(today, -1)
  let current = 0
  while (active.has(cursor)) { current++; cursor = addLocalDays(cursor, -1) }
  return { current, longest, lastActiveDay: days[days.length - 1] }
}

export type RatingCounts = Record<ReviewRating, number>

export interface ReviewHistoryAggregate {
  total: number
  ratings: RatingCounts
  /** Reviews per local day. */
  days: Map<DayKey, number>
}

export function createReviewHistoryAggregate(): ReviewHistoryAggregate {
  return { total: 0, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, days: new Map() }
}

/** Adds one log; ratings outside 1–4 still count as a review but not in the rating distribution. */
export function addReviewLog(aggregate: ReviewHistoryAggregate, log: Pick<ReviewLog, 'reviewedAt' | 'rating'>): void {
  if (!Number.isFinite(log.reviewedAt)) return
  aggregate.total++
  if (log.rating === 1 || log.rating === 2 || log.rating === 3 || log.rating === 4) aggregate.ratings[log.rating]++
  const key = localDayKey(log.reviewedAt)
  aggregate.days.set(key, (aggregate.days.get(key) ?? 0) + 1)
}

export interface ActivityDay { day: DayKey; reviews: number; isToday: boolean }
export type ActivityTrend = 'up' | 'down' | 'flat' | 'none'

export interface StudyActivity {
  /** The last 14 local days, oldest first, ending today. */
  recentDays: ActivityDay[]
  today: number
  thisWeek: { reviews: number; activeDays: number; elapsedDays: number }
  last7Days: number
  previous7Days: number
  trend: ActivityTrend
  streak: StreakSummary
}

export function summarizeStudyActivity(days: Map<DayKey, number>, now: number): StudyActivity {
  const today = localDayKey(now)
  const recentDays: ActivityDay[] = []
  for (let offset = -13; offset <= 0; offset++) {
    const day = addLocalDays(today, offset)
    recentDays.push({ day, reviews: days.get(day) ?? 0, isToday: offset === 0 })
  }
  const last7Days = recentDays.slice(7).reduce((sum, item) => sum + item.reviews, 0)
  const previous7Days = recentDays.slice(0, 7).reduce((sum, item) => sum + item.reviews, 0)
  const weekStart = startOfLocalWeek(today)
  const weekDays = recentDays.filter((item) => item.day >= weekStart)
  const trend: ActivityTrend = !last7Days && !previous7Days ? 'none' : last7Days > previous7Days ? 'up' : last7Days < previous7Days ? 'down' : 'flat'
  return {
    recentDays,
    today: days.get(today) ?? 0,
    thisWeek: { reviews: weekDays.reduce((sum, item) => sum + item.reviews, 0), activeDays: weekDays.filter((item) => item.reviews > 0).length, elapsedDays: weekDays.length },
    last7Days,
    previous7Days,
    trend,
    streak: calculateStreaks([...days.entries()].filter(([, count]) => count > 0).map(([day]) => day), today),
  }
}

export interface SrsSummary {
  total: number
  states: { new: number; learning: number; relearning: number; review: number; suspended: number }
  /** Scheduled (non-new, non-suspended) cards whose due time has passed. */
  dueNow: number
  /** Scheduled cards due at any time before the end of the local day, including `dueNow`. */
  dueToday: number
  /** Scheduled cards that were due before the local day began. */
  overdue: number
}

const scheduledStates = new Set<SrsCard['state']>(['learning', 'relearning', 'review'])

export function summarizeSrsCards(cards: SrsCard[], now: number): SrsSummary {
  const { start, nextStart } = localDayRange(now)
  const summary: SrsSummary = { total: cards.length, states: { new: 0, learning: 0, relearning: 0, review: 0, suspended: 0 }, dueNow: 0, dueToday: 0, overdue: 0 }
  for (const card of cards) {
    if (card.state in summary.states) summary.states[card.state]++
    if (!scheduledStates.has(card.state) || card.nextReviewAt === null || !Number.isFinite(card.nextReviewAt)) continue
    if (card.nextReviewAt <= now) summary.dueNow++
    if (card.nextReviewAt < nextStart) summary.dueToday++
    if (card.nextReviewAt < start) summary.overdue++
  }
  return summary
}

export interface QuizTypeStats { answered: number; correct: number }
export interface QuizSummary {
  completed: number
  questions: number
  correct: number
  /** correct / questions across all completed attempts, or null with no questions. */
  accuracy: number | null
  /** Mean of each attempt's own score (correct / questionCount), or null with no scored attempts. */
  averageScore: number | null
  byType: Record<QuizQuestionType, QuizTypeStats>
  byLevel: Partial<Record<JlptLevel, { completed: number; questions: number; correct: number }>>
}

export interface QuizAggregate { completed: number; questions: number; correct: number; scoreSum: number; scoredAttempts: number; byType: Record<QuizQuestionType, QuizTypeStats>; byLevel: QuizSummary['byLevel'] }

export function createQuizAggregate(): QuizAggregate {
  return { completed: 0, questions: 0, correct: 0, scoreSum: 0, scoredAttempts: 0, byType: { 'japanese-meaning': { answered: 0, correct: 0 }, 'meaning-japanese': { answered: 0, correct: 0 }, reading: { answered: 0, correct: 0 } }, byLevel: {} }
}

export function addQuizAttempt(aggregate: QuizAggregate, attempt: Pick<QuizAttempt, 'jlptLevel' | 'questionCount' | 'correctCount' | 'answers'>): void {
  const questions = Math.max(0, Math.floor(attempt.questionCount) || 0)
  const correct = Math.min(questions, Math.max(0, Math.floor(attempt.correctCount) || 0))
  aggregate.completed++
  aggregate.questions += questions
  aggregate.correct += correct
  if (questions > 0) { aggregate.scoreSum += correct / questions; aggregate.scoredAttempts++ }
  const level = aggregate.byLevel[attempt.jlptLevel] ?? { completed: 0, questions: 0, correct: 0 }
  aggregate.byLevel[attempt.jlptLevel] = { completed: level.completed + 1, questions: level.questions + questions, correct: level.correct + correct }
  for (const answer of attempt.answers ?? []) {
    const stats = aggregate.byType[answer.questionType]
    if (!stats) continue
    stats.answered++
    if (answer.isCorrect) stats.correct++
  }
}

export function summarizeQuizzes(aggregate: QuizAggregate): QuizSummary {
  return {
    completed: aggregate.completed,
    questions: aggregate.questions,
    correct: aggregate.correct,
    accuracy: aggregate.questions ? aggregate.correct / aggregate.questions : null,
    averageScore: aggregate.scoredAttempts ? aggregate.scoreSum / aggregate.scoredAttempts : null,
    byType: aggregate.byType,
    byLevel: aggregate.byLevel,
  }
}

export interface VocabularyDistribution {
  /** Distinct reference/custom word identities the user has saved, created, given a status, or added to review. */
  tracked: number
  unseen: number
  learning: number
  known: number
  suspended: number
}

const wordTypes = new Set<ItemType>(['reference-word', 'custom-word'])

export function summarizeVocabulary(input: { studyStates: StudyState[]; cards: SrsCard[]; savedReferenceIds: string[]; customWordIds: string[] }): VocabularyDistribution {
  const statuses = new Map<string, StudyStatus>()
  const track = (itemType: ItemType, itemId: string) => { const key = `${itemType}\u0000${itemId}`; if (!statuses.has(key)) statuses.set(key, 'unseen') }
  for (const id of input.savedReferenceIds) track('reference-word', id)
  for (const id of input.customWordIds) track('custom-word', id)
  for (const card of input.cards) if (wordTypes.has(card.itemType)) track(card.itemType, card.itemId)
  for (const state of input.studyStates) if (wordTypes.has(state.itemType)) statuses.set(`${state.itemType}\u0000${state.itemId}`, state.status)
  const distribution: VocabularyDistribution = { tracked: statuses.size, unseen: 0, learning: 0, known: 0, suspended: 0 }
  for (const status of statuses.values()) if (status === 'unseen' || status === 'learning' || status === 'known' || status === 'suspended') distribution[status]++
  return distribution
}

export type ActivityEntry =
  | { kind: 'review'; at: number; day: DayKey; reviews: number; items: Array<{ itemType: ItemType; itemId: string; cardId: string }> }
  | { kind: 'quiz'; at: number; attempt: Pick<QuizAttempt, 'id' | 'jlptLevel' | 'questionCount' | 'correctCount'> }
  | { kind: 'custom-word'; at: number; itemId: string; word: string }
  | { kind: 'status'; at: number; itemType: ItemType; itemId: string; status: Exclude<StudyStatus, 'unseen'> }
  | { kind: 'saved-word'; at: number; itemId: string; wordSnapshot?: string }
  | { kind: 'favorite'; at: number; itemType: ItemType; itemId: string }

/**
 * Builds a merged, newest-first activity feed from existing records only: review days, completed quizzes,
 * created custom words, saved dictionary words, favorites and study-status changes.
 * Reviews are grouped per local day (with the day's full count) so a single session does not flood the list.
 */
export function buildRecentActivity(input: {
  recentLogs: ReviewLog[]
  reviewDays: Map<DayKey, number>
  cards: Map<string, Pick<SrsCard, 'id' | 'itemType' | 'itemId'>>
  quizzes: Array<Pick<QuizAttempt, 'id' | 'jlptLevel' | 'questionCount' | 'correctCount' | 'completedAt'>>
  customWords: Array<{ id: string; word: string; createdAt: number }>
  studyStates: StudyState[]
  savedWords?: Array<{ entryId: string; savedAt: number; wordSnapshot?: string }>
  favorites?: Array<{ itemType: ItemType; itemId: string; createdAt: number }>
  limit?: number
  wordsPerReviewDay?: number
}): ActivityEntry[] {
  const limit = input.limit ?? 8
  const perDay = input.wordsPerReviewDay ?? 3
  const reviewEntries = new Map<DayKey, Extract<ActivityEntry, { kind: 'review' }>>()
  for (const log of [...input.recentLogs].sort((a, b) => b.reviewedAt - a.reviewedAt || a.id.localeCompare(b.id))) {
    const day = localDayKey(log.reviewedAt)
    let entry = reviewEntries.get(day)
    if (!entry) { entry = { kind: 'review', at: log.reviewedAt, day, reviews: input.reviewDays.get(day) ?? 0, items: [] }; reviewEntries.set(day, entry) }
    entry.reviews = Math.max(entry.reviews, 1)
    const card = input.cards.get(log.cardId)
    if (card && entry.items.length < perDay && !entry.items.some((item) => item.cardId === card.id)) entry.items.push({ itemType: card.itemType, itemId: card.itemId, cardId: card.id })
  }
  const entries: ActivityEntry[] = [
    ...reviewEntries.values(),
    ...input.quizzes.map((attempt) => ({ kind: 'quiz' as const, at: attempt.completedAt, attempt: { id: attempt.id, jlptLevel: attempt.jlptLevel, questionCount: attempt.questionCount, correctCount: attempt.correctCount } })),
    ...input.customWords.map((word) => ({ kind: 'custom-word' as const, at: word.createdAt, itemId: word.id, word: word.word })),
    ...(input.savedWords ?? []).map((saved) => ({ kind: 'saved-word' as const, at: saved.savedAt, itemId: saved.entryId, wordSnapshot: saved.wordSnapshot })),
    ...(input.favorites ?? []).map((favorite) => ({ kind: 'favorite' as const, at: favorite.createdAt, itemType: favorite.itemType, itemId: favorite.itemId })),
    ...input.studyStates.filter((state): state is StudyState & { status: Exclude<StudyStatus, 'unseen'> } => state.status !== 'unseen').map((state) => ({ kind: 'status' as const, at: state.updatedAt, itemType: state.itemType, itemId: state.itemId, status: state.status })),
  ]
  return entries.filter((entry) => Number.isFinite(entry.at)).sort((a, b) => b.at - a.at || activityKey(a).localeCompare(activityKey(b))).slice(0, limit)
}

function activityKey(entry: ActivityEntry): string {
  switch (entry.kind) {
    case 'review': return `review:${entry.day}`
    case 'quiz': return `quiz:${entry.attempt.id}`
    case 'custom-word': return `custom:${entry.itemId}`
    case 'status': return `status:${entry.itemType}:${entry.itemId}`
    case 'saved-word': return `saved:${entry.itemId}`
    case 'favorite': return `favorite:${entry.itemType}:${entry.itemId}`
  }
}

export function ratio(part: number, whole: number): number { return whole > 0 ? part / whole : 0 }
export function percent(value: number | null): string { return value === null ? '—' : `${Math.round(value * 100)}%` }
