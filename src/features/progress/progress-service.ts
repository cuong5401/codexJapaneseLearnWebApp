import { LearningAnalyticsRepository } from '../../db/repositories/learning-analytics'
import { StudyRepository } from '../../db/repositories/user-data'
import type { ReferenceDataSource } from '../../db/sources/reference-source'
import type { ItemType, QuizAttempt, SrsCard } from '../../types/domain'
import { getAllLevelsProgress } from '../jlpt/progress-model'
import {
  addQuizAttempt, addReviewLog, buildRecentActivity, createQuizAggregate, createReviewHistoryAggregate, summarizeQuizzes, summarizeSrsCards,
  summarizeStudyActivity, summarizeVocabulary, type ActivityEntry, type QuizSummary, type RatingCounts, type SrsSummary, type StudyActivity, type VocabularyDistribution,
} from './progress-model'

export interface ResolvedItem { itemType: ItemType; itemId: string; title: string; href?: string; unavailable: boolean }
type WithItem<K extends ActivityEntry['kind']> = Extract<ActivityEntry, { kind: K }> & { resolved: ResolvedItem }
export type ResolvedActivity =
  | (Extract<ActivityEntry, { kind: 'review' }> & { resolved: ResolvedItem[] })
  | Extract<ActivityEntry, { kind: 'quiz' }>
  | WithItem<'custom-word'>
  | WithItem<'status'>
  | WithItem<'saved-word'>
  | WithItem<'favorite'>

export interface LocalProgress {
  generatedAt: number
  /** True when the device has no learning records of any kind yet. */
  isEmpty: boolean
  vocabulary: VocabularyDistribution
  studied: { kanji: number; grammar: number }
  activity: StudyActivity
  reviews: { total: number; ratings: RatingCounts }
  srs: SrsSummary
  quizzes: QuizSummary
  recentQuizzes: QuizAttempt[]
  recentActivity: ResolvedActivity[]
}

export interface ProgressServiceOptions {
  repository?: LearningAnalyticsRepository
  /** Used only to title a handful of recent-activity items that have no stored snapshot. */
  referenceSource: ReferenceDataSource
  now?: number
  activityLimit?: number
}

/** Derives every local metric from user-owned IndexedDB records. */
export async function loadLocalProgress({ repository = new LearningAnalyticsRepository(), referenceSource, now = Date.now(), activityLimit = 8 }: ProgressServiceOptions): Promise<LocalProgress> {
  const reviewHistory = createReviewHistoryAggregate()
  const quizAggregate = createQuizAggregate()
  const [studyStates, cards, savedReferenceIds, customWordIds, recentLogs, recentQuizzes, recentCustomWords, recentSavedWords, recentFavorites] = await Promise.all([
    repository.listStudyStates(),
    repository.listSrsCards(),
    repository.savedReferenceWordIds(),
    repository.customWordIds(),
    repository.recentReviewLogs(200),
    repository.recentQuizAttempts(5),
    repository.recentlyCreatedCustomWords(5),
    repository.recentSavedReferenceWords(activityLimit),
    repository.recentFavorites(activityLimit),
    repository.eachReviewLog((log) => addReviewLog(reviewHistory, log)),
    repository.eachQuizAttempt((attempt) => addQuizAttempt(quizAggregate, attempt)),
  ])
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const recentStates = [...studyStates].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, activityLimit)
  const entries = buildRecentActivity({ recentLogs, reviewDays: reviewHistory.days, cards: cardsById, quizzes: recentQuizzes, customWords: recentCustomWords, studyStates: recentStates, savedWords: recentSavedWords, favorites: recentFavorites, limit: activityLimit })
  const resolver = new ItemResolver(repository, referenceSource, cardsById)
  const recentActivity = await Promise.all(entries.map((entry) => resolveActivity(entry, resolver)))
  return {
    generatedAt: now,
    isEmpty: !studyStates.length && !cards.length && !reviewHistory.total && !quizAggregate.completed && !savedReferenceIds.length && !customWordIds.length && !recentFavorites.length,
    vocabulary: summarizeVocabulary({ studyStates, cards, savedReferenceIds, customWordIds }),
    studied: {
      kanji: studyStates.filter((state) => state.itemType === 'kanji' && (state.status === 'learning' || state.status === 'known')).length,
      grammar: studyStates.filter((state) => state.itemType === 'grammar' && (state.status === 'learning' || state.status === 'known')).length,
    },
    activity: summarizeStudyActivity(reviewHistory.days, now),
    reviews: { total: reviewHistory.total, ratings: reviewHistory.ratings },
    srs: summarizeSrsCards(cards, now),
    quizzes: summarizeQuizzes(quizAggregate),
    recentQuizzes,
    recentActivity,
  }
}

/**
 * JLPT dataset progress, reusing the JLPT feature's calculation. With the static source it reads the
 * 15 per-level ID lists (cached) and no dictionary records. It is loaded separately so local
 * statistics render even when reference data is unavailable.
 */
export function loadJlptDatasetProgress(referenceSource: ReferenceDataSource, study = new StudyRepository()) {
  return getAllLevelsProgress(referenceSource, study)
}

async function resolveActivity(entry: ActivityEntry, resolver: ItemResolver): Promise<ResolvedActivity> {
  switch (entry.kind) {
    case 'review': return { ...entry, resolved: await Promise.all(entry.items.map((item) => resolver.resolve(item.itemType, item.itemId, item.cardId))) }
    case 'quiz': return entry
    case 'custom-word': return { ...entry, resolved: { itemType: 'custom-word', itemId: entry.itemId, title: entry.word, href: `/my-vocabulary/custom/${encodeURIComponent(entry.itemId)}`, unavailable: false } }
    case 'saved-word': return { ...entry, resolved: entry.wordSnapshot ? { itemType: 'reference-word', itemId: entry.itemId, title: entry.wordSnapshot, href: `/dictionary/${encodeURIComponent(entry.itemId)}`, unavailable: false } : await resolver.resolve('reference-word', entry.itemId) }
    case 'favorite': return { ...entry, resolved: await resolver.resolve(entry.itemType, entry.itemId) }
    case 'status': return { ...entry, resolved: await resolver.resolve(entry.itemType, entry.itemId) }
  }
}

/**
 * Titles an item from local snapshots first. Only an item with no stored snapshot causes one
 * bounded reference lookup; any failure falls back to a safe label instead of throwing.
 */
class ItemResolver {
  private readonly cache = new Map<string, Promise<ResolvedItem>>()
  constructor(private readonly repository: LearningAnalyticsRepository, private readonly source: ReferenceDataSource, private readonly cards: Map<string, SrsCard>) {}

  resolve(itemType: ItemType, itemId: string, cardId?: string): Promise<ResolvedItem> {
    const key = `${itemType}\u0000${itemId}`
    let pending = this.cache.get(key)
    if (!pending) { pending = this.lookup(itemType, itemId, cardId ? this.cards.get(cardId) : undefined).catch(() => fallback(itemType, itemId)); this.cache.set(key, pending) }
    return pending
  }

  private async lookup(itemType: ItemType, itemId: string, knownCard?: SrsCard): Promise<ResolvedItem> {
    if (itemType === 'custom-word') {
      const word = await this.repository.getCustomWord(itemId)
      if (word) return { itemType, itemId, title: word.word, href: `/my-vocabulary/custom/${encodeURIComponent(itemId)}`, unavailable: false }
      const card = knownCard ?? await this.repository.getCardForItem(itemType, itemId)
      return card?.snapshotWord ? { itemType, itemId, title: card.snapshotWord, unavailable: true } : fallback(itemType, itemId)
    }
    if (itemType === 'reference-word') {
      const href = `/dictionary/${encodeURIComponent(itemId)}`
      const card = knownCard ?? await this.repository.getCardForItem(itemType, itemId)
      if (card?.snapshotWord) return { itemType, itemId, title: card.snapshotWord, href, unavailable: false }
      const saved = await this.repository.getSavedReference(itemId)
      if (saved?.wordSnapshot) return { itemType, itemId, title: saved.wordSnapshot, href, unavailable: false }
      const entry = await this.source.dictionary.getById(itemId)
      return entry ? { itemType, itemId, title: entry.word, href, unavailable: false } : fallback(itemType, itemId)
    }
    if (itemType === 'kanji') {
      // JLPT lists store kanji by stable ID; the kanji detail page stores favorites/notebooks by character.
      const entry = await this.source.kanji.getById(itemId) ?? (Array.from(itemId).length === 1 ? await this.source.kanji.getByCharacter(itemId) : undefined)
      return entry ? { itemType, itemId, title: entry.character, href: `/kanji/${encodeURIComponent(entry.character)}`, unavailable: false } : fallback(itemType, itemId)
    }
    const entry = await this.source.grammar.getById(itemId)
    return entry ? { itemType, itemId, title: entry.pattern, href: `/grammar/${encodeURIComponent(itemId)}`, unavailable: false } : fallback(itemType, itemId)
  }
}

export const FALLBACK_TITLES: Record<ItemType, string> = {
  'reference-word': '辞書にない単語',
  'custom-word': '削除された単語',
  kanji: 'データにない漢字',
  grammar: 'データにない文法',
}
function fallback(itemType: ItemType, itemId: string): ResolvedItem { return { itemType, itemId, title: FALLBACK_TITLES[itemType], unavailable: true } }
