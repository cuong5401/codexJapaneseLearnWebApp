import { db } from '../database'
import type { CustomWord, Favorite, ItemType, QuizAttempt, ReviewLog, SavedReferenceWord, SrsCard, StudyState } from '../../types/domain'
import { boundedLimit } from './shared'

/**
 * Read-only access to user-owned learning history for progress analytics.
 * Large histories are streamed with `each()` so callers aggregate without holding every row.
 * Nothing here reads reference tables or the static production corpus.
 */
export class LearningAnalyticsRepository {
  async listStudyStates(): Promise<StudyState[]> { return db.studyStates.toArray() }
  async listSrsCards(): Promise<SrsCard[]> { return db.srsCards.toArray() }
  async eachReviewLog(visit: (log: ReviewLog) => void): Promise<void> { await db.reviewLogs.orderBy('reviewedAt').each(visit) }
  async eachQuizAttempt(visit: (attempt: QuizAttempt) => void): Promise<void> { await db.quizAttempts.orderBy('completedAt').each(visit) }
  async recentReviewLogs(limit = 200): Promise<ReviewLog[]> { boundedLimit(limit); return db.reviewLogs.orderBy('reviewedAt').reverse().limit(limit).toArray() }
  async recentQuizAttempts(limit = 5): Promise<QuizAttempt[]> { boundedLimit(limit); return db.quizAttempts.orderBy('completedAt').reverse().limit(limit).toArray() }
  async recentSavedReferenceWords(limit = 5): Promise<SavedReferenceWord[]> { boundedLimit(limit); return db.savedReferenceWords.orderBy('savedAt').reverse().limit(limit).toArray() }
  async recentFavorites(limit = 5): Promise<Favorite[]> { boundedLimit(limit); return db.favorites.orderBy('createdAt').reverse().limit(limit).toArray() }
  async savedReferenceWordIds(): Promise<string[]> { return db.savedReferenceWords.toCollection().primaryKeys() }
  async customWordIds(): Promise<string[]> { return db.customWords.toCollection().primaryKeys() }
  /** Most recently created custom words; streams the user's own words and keeps only the newest `limit`. */
  async recentlyCreatedCustomWords(limit = 5): Promise<CustomWord[]> {
    boundedLimit(limit)
    const newest: CustomWord[] = []
    await db.customWords.each((word) => {
      newest.push(word)
      newest.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      if (newest.length > limit) newest.pop()
    })
    return newest
  }
  async getCards(ids: string[]): Promise<Map<string, SrsCard>> {
    const rows = await db.srsCards.bulkGet([...new Set(ids)])
    return new Map(rows.filter((row): row is SrsCard => !!row).map((row) => [row.id, row]))
  }
  async getCustomWord(id: string): Promise<CustomWord | undefined> { return db.customWords.get(id) }
  async getSavedReference(entryId: string): Promise<SavedReferenceWord | undefined> { return db.savedReferenceWords.get(entryId) }
  async getCardForItem(itemType: ItemType, itemId: string): Promise<SrsCard | undefined> { return db.srsCards.where('[itemType+itemId]').equals([itemType, itemId]).first() }
}
