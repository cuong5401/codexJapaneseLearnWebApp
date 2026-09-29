import { db } from '../database'
import Dexie from 'dexie'
import type { Favorite, ItemType, Notebook, NotebookItem, QuizAttempt, ReviewLog, SavedReferenceWord, SearchHistory, SrsCard, StudyState, StudyStatus, UserSettings } from '../../types/domain'
import { boundedLimit, type Page } from './shared'
import { normalizeNotebookName } from '../database'
import { localDayBounds, scheduleAnswer, type ReviewRating } from '../srs/scheduler'

const id = () => crypto.randomUUID()

export class NotebookRepository {
  async get(id: string): Promise<Notebook | undefined> { return db.notebooks.get(id) }
  async create(name: string): Promise<Notebook> {
    const clean = validateNotebookName(name); const normalizedName = normalizeNotebookName(clean)
    const now = Date.now(); const notebook: Notebook = { id: id(), name: clean, normalizedName, createdAt: now, updatedAt: now, sortOrder: now, isSystem: false }
    await db.transaction('rw', db.notebooks, async () => {
      if (await db.notebooks.where('normalizedName').equals(normalizedName).first()) throw new Error('A notebook with this name already exists.')
      await db.notebooks.add(notebook)
    })
    return notebook
  }
  async rename(notebookId: string, name: string): Promise<Notebook> {
    const clean = validateNotebookName(name); const normalizedName = normalizeNotebookName(clean); const now = Date.now()
    return db.transaction('rw', db.notebooks, async () => {
      const current = await db.notebooks.get(notebookId)
      if (!current) throw new Error('Notebook not found.')
      const collision = await db.notebooks.where('normalizedName').equals(normalizedName).first()
      if (collision && collision.id !== notebookId) throw new Error('A notebook with this name already exists.')
      const updated = { ...current, name: clean, normalizedName, updatedAt: now }
      await db.notebooks.put(updated)
      return updated
    })
  }
  async list(limit = 50, offset = 0): Promise<Page<Notebook>> {
    boundedLimit(limit); if (!Number.isInteger(offset) || offset < 0) throw new RangeError('offset must be non-negative')
    const items = await db.notebooks.orderBy('sortOrder').offset(offset).limit(limit).toArray(); return { items, limit, offset }
  }
  async addItem(notebookId: string, itemType: NotebookItem['itemType'], itemId: string, note?: string): Promise<NotebookItem> {
    const now = Date.now(); const item: NotebookItem = { id: id(), notebookId, itemType, itemId, createdAt: now, ...(note === undefined ? {} : { note }) }
    const saved = await db.transaction('rw', db.notebooks, db.notebookItems, async () => {
      if (!await db.notebooks.get(notebookId)) throw new Error(`Notebook not found: ${notebookId}`)
      const existing = await db.notebookItems.where('[notebookId+itemType+itemId]').equals([notebookId, itemType, itemId]).first()
      const result = existing ?? item
      if (!existing) await db.notebookItems.add(item)
      await db.notebooks.update(notebookId, { updatedAt: now })
      return result
    })
    return saved
  }
  async addItems(notebookIds: string[], itemType: NotebookItem['itemType'], itemId: string): Promise<void> {
    const uniqueNotebookIds = [...new Set(notebookIds)]
    if (!uniqueNotebookIds.length) return
    const now = Date.now()
    await db.transaction('rw', db.notebooks, db.notebookItems, async () => {
      for (const notebookId of uniqueNotebookIds) {
        const notebook = await db.notebooks.get(notebookId)
        if (!notebook) throw new Error('A selected notebook no longer exists.')
        const existing = await db.notebookItems.where('[notebookId+itemType+itemId]').equals([notebookId, itemType, itemId]).first()
        if (!existing) await db.notebookItems.add({ id: id(), notebookId, itemType, itemId, createdAt: now })
        await db.notebooks.update(notebookId, { updatedAt: now })
      }
    })
  }
  async listItems(notebookId: string, limit = 50, offset = 0): Promise<Page<NotebookItem>> {
    boundedLimit(limit); if (!Number.isInteger(offset) || offset < 0) throw new RangeError('offset must be non-negative')
    const items = await db.notebookItems.where('[notebookId+createdAt]').between([notebookId, Dexie.minKey], [notebookId, Dexie.maxKey]).reverse().offset(offset).limit(limit).toArray()
    return { items, limit, offset }
  }
  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.notebooks, db.notebookItems, async () => {
      const notebook = await db.notebooks.get(id); if (notebook?.isSystem) throw new Error('System notebooks cannot be deleted')
      await db.notebookItems.where('notebookId').equals(id).delete(); await db.notebooks.delete(id)
    })
  }
  async removeItem(notebookId: string, itemType: ItemType, itemId: string): Promise<void> {
    const now = Date.now()
    await db.transaction('rw', db.notebooks, db.notebookItems, async () => {
      await db.notebookItems.where('[notebookId+itemType+itemId]').equals([notebookId, itemType, itemId]).delete()
      await db.notebooks.update(notebookId, { updatedAt: now })
    })
  }
  async countItems(notebookId: string): Promise<number> { return db.notebookItems.where('notebookId').equals(notebookId).count() }
  async getNotebookIds(itemType: ItemType, itemId: string): Promise<string[]> {
    return db.notebookItems.where('[itemType+itemId]').equals([itemType, itemId]).limit(100).toArray().then((rows) => rows.map((row) => row.notebookId))
  }
}

function validateNotebookName(name: string): string {
  const clean = name.trim()
  if (!clean) throw new Error('Enter a notebook name.')
  if (Array.from(clean).length > 60) throw new Error('Notebook names must be 60 characters or fewer.')
  return clean
}

export class FavoritesRepository {
  async isFavorite(itemType: ItemType, itemId: string): Promise<boolean> { return !!(await db.favorites.get([itemType, itemId])) }
  async list(limit = 500): Promise<Favorite[]> { boundedLimit(limit); return db.favorites.orderBy('createdAt').reverse().limit(limit).toArray() }
  async set(itemType: ItemType, itemId: string, favorite: boolean): Promise<void> {
    if (!itemId.trim()) throw new Error('A learning item ID is required.')
    if (favorite) await db.favorites.put({ itemType, itemId, createdAt: Date.now() })
    else await db.favorites.delete([itemType, itemId])
  }
  async toggle(itemType: ItemType, itemId: string): Promise<boolean> {
    const favorite = !(await this.isFavorite(itemType, itemId))
    await this.set(itemType, itemId, favorite)
    return favorite
  }
  async remove(itemType: ItemType, itemId: string): Promise<void> { await db.favorites.delete([itemType, itemId]) }
}

export class SavedReferenceVocabularyRepository {
  async isSaved(entryId: string): Promise<boolean> { return !!(await db.savedReferenceWords.get(entryId)) }
  async save(entry: { id: string; word: string; reading: string; meanings: { vi: string[]; en: string[] } }): Promise<SavedReferenceWord> {
    const current = await db.savedReferenceWords.get(entry.id)
    const saved: SavedReferenceWord = { entryId: entry.id, savedAt: current?.savedAt ?? Date.now(), wordSnapshot: entry.word, readingSnapshot: entry.reading, meaningSnapshot: entry.meanings.vi[0] ?? entry.meanings.en[0] }
    await db.savedReferenceWords.put(saved)
    return saved
  }
  async remove(entryId: string): Promise<void> { await db.savedReferenceWords.delete(entryId) }
  async list(limit = 500): Promise<SavedReferenceWord[]> { boundedLimit(limit); return db.savedReferenceWords.orderBy('savedAt').reverse().limit(limit).toArray() }
}

export class StudyRepository {
  async get(itemType: StudyState['itemType'], itemId: string): Promise<StudyState | undefined> {
    return db.studyStates.where('[itemType+itemId]').equals([itemType, itemId]).first()
  }
  async save(state: StudyState): Promise<void> { await db.studyStates.put(state) }
  async getStatus(itemType: ItemType, itemId: string): Promise<StudyStatus> { return (await this.get(itemType, itemId))?.status ?? 'unseen' }
  async setStatus(itemType: ItemType, itemId: string, status: StudyStatus): Promise<void> {
    const current = await this.get(itemType, itemId)
    if (status === 'unseen') { if (current) await db.studyStates.delete(current.id); return }
    const now = Date.now()
    await db.studyStates.put({ id: current?.id ?? `${itemType}:${itemId}`, itemType, itemId, status, firstSeenAt: current?.firstSeenAt ?? now, lastSeenAt: now, updatedAt: now })
  }
  async listByStatus(status: StudyState['status'], limit = 50, offset = 0): Promise<Page<StudyState>> {
    boundedLimit(limit); if (!Number.isInteger(offset) || offset < 0) throw new RangeError('offset must be non-negative')
    const items = await db.studyStates.where('status').equals(status).offset(offset).limit(limit).toArray(); return { items, limit, offset }
  }
  async listByItemType(itemType: ItemType, limit = 500, offset = 0): Promise<Page<StudyState>> {
    boundedLimit(limit); if (!Number.isInteger(offset) || offset < 0) throw new RangeError('offset must be non-negative')
    const items = await db.studyStates.where('[itemType+itemId]').between([itemType, Dexie.minKey], [itemType, Dexie.maxKey], true, true).offset(offset).limit(limit).toArray()
    return { items, limit, offset }
  }
}

export class QuizAttemptRepository {
  async save(attempt: QuizAttempt): Promise<void> { await db.quizAttempts.put(attempt) }
  async get(id: string): Promise<QuizAttempt | undefined> { return db.quizAttempts.get(id) }
  async listRecent(level?: QuizAttempt['jlptLevel'], limit = 10): Promise<QuizAttempt[]> {
    boundedLimit(limit)
    return level
      ? db.quizAttempts.where('[jlptLevel+completedAt]').between([level, Dexie.minKey], [level, Dexie.maxKey], true, true).reverse().limit(limit).toArray()
      : db.quizAttempts.orderBy('completedAt').reverse().limit(limit).toArray()
  }
}

export class SrsRepository {
  async get(id: string): Promise<SrsCard | undefined> { return db.srsCards.get(id) }
  async getForItem(itemType: ItemType, itemId: string, cardType = 'recognition'): Promise<SrsCard | undefined> { return db.srsCards.where('[itemType+itemId+cardType]').equals([itemType, itemId, cardType]).first() }
  async save(card: SrsCard): Promise<void> { await db.srsCards.put(card) }
  async addToReview(itemType: ItemType, itemId: string, snapshot?: { word?: string; reading?: string; meaningVi?: string; meaningEn?: string }): Promise<{ card: SrsCard; created: boolean }> {
    return db.transaction('rw', db.srsCards, async () => {
      const existing = await db.srsCards.where('[itemType+itemId+cardType]').equals([itemType, itemId, 'recognition']).first()
      if (existing) return { card: existing, created: false }
      const now = Date.now()
      const card: SrsCard = { id: id(), itemType, itemId, cardType: 'recognition', createdAt: now, lastReviewedAt: null, nextReviewAt: now, interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, learningStep: 0, state: 'new', snapshotWord: snapshot?.word, snapshotReading: snapshot?.reading, snapshotMeaningVi: snapshot?.meaningVi, snapshotMeaningEn: snapshot?.meaningEn }
      await db.srsCards.add(card)
      return { card, created: true }
    })
  }
  async answer(id: string, rating: ReviewRating, reviewedAt: number, durationMs: number): Promise<{ card: SrsCard; log: ReviewLog }> {
    return db.transaction('rw', db.srsCards, db.reviewLogs, async () => {
      const previous = await db.srsCards.get(id)
      if (!previous || previous.state === 'suspended') throw new Error('This review card is no longer available.')
      const result = scheduleAnswer(previous, rating, reviewedAt)
      result.log.durationMs = Math.max(0, Math.round(durationMs))
      await db.srsCards.put(result.card)
      await db.reviewLogs.add(result.log)
      return result
    })
  }
  async setSuspended(id: string, suspended: boolean): Promise<void> {
    await db.transaction('rw', db.srsCards, async () => {
      const card = await db.srsCards.get(id)
      if (!card) return
      await db.srsCards.put(suspended
        ? { ...card, suspendedPreviousState: card.state, suspendedPreviousDueAt: card.nextReviewAt, state: 'suspended', suspendedAt: Date.now(), nextReviewAt: null }
        : { ...card, state: card.suspendedPreviousState ?? (card.lastReviewedAt === null ? 'new' : 'review'), suspendedAt: null, nextReviewAt: card.suspendedPreviousDueAt ?? Date.now(), suspendedPreviousState: undefined, suspendedPreviousDueAt: undefined })
    })
  }
  async reset(id: string): Promise<void> {
    await db.transaction('rw', db.srsCards, db.reviewLogs, async () => {
      await db.reviewLogs.where('cardId').equals(id).delete()
      const card = await db.srsCards.get(id)
      if (card) await db.srsCards.put({ ...card, createdAt: Date.now(), lastReviewedAt: null, nextReviewAt: Date.now(), interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, learningStep: 0, suspendedAt: null, state: 'new' })
    })
  }
  async listDue(now = Date.now(), limit = 100): Promise<SrsCard[]> {
    boundedLimit(limit); return db.srsCards.where('nextReviewAt').belowOrEqual(now).filter((card) => card.nextReviewAt !== null && card.state !== 'suspended').limit(limit).toArray()
  }
  async listSuspended(limit = 50): Promise<SrsCard[]> { boundedLimit(limit); return db.srsCards.where('state').equals('suspended').limit(limit).toArray() }
  async listSessionQueue(now = Date.now(), newLimit = 20, max = 200): Promise<SrsCard[]> {
    boundedLimit(max)
    const [reviewDue, learningDue, relearningDue] = await Promise.all((['review', 'learning', 'relearning'] as const).map((state) => db.srsCards.where('state').equals(state).filter((card) => card.nextReviewAt !== null && card.nextReviewAt <= now).limit(max).toArray()))
    const due = [...reviewDue, ...learningDue, ...relearningDue]
    const dueReview = due.filter((card) => card.state === 'review').sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0))
    const learning = due.filter((card) => card.state === 'learning' || card.state === 'relearning').sort((a, b) => (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0))
    const queue = [...dueReview, ...learning].slice(0, max)
    const room = Math.max(0, max - queue.length)
    if (room && newLimit > 0) {
      const fresh = await db.srsCards.where('state').equals('new').limit(Math.min(room, newLimit)).toArray()
      queue.push(...fresh)
    }
    return queue
  }
  async counts(now = Date.now(), dailyNewLimit = 20): Promise<{ due: number; learning: number; new: number; introducedToday: number; dailyNewLimit: number; nextDueAt: number | null }> {
    const dueRows = db.srsCards.where('nextReviewAt').belowOrEqual(now)
    const [due, learning, nextCard] = await Promise.all([
      dueRows.filter((card) => card.nextReviewAt !== null && card.state === 'review').count(),
      dueRows.filter((card) => card.nextReviewAt !== null && (card.state === 'learning' || card.state === 'relearning')).count(),
      db.srsCards.where('nextReviewAt').above(now).first(),
    ])
    const bounds = localDayBounds(now)
    const introducedToday = await db.reviewLogs.where('reviewedAt').between(bounds.start, bounds.end, true, true).filter((log) => log.wasNew === true).count()
    const newCards = await db.srsCards.where('state').equals('new').count()
    return { due, learning, new: newCards, introducedToday, dailyNewLimit, nextDueAt: nextCard?.nextReviewAt ?? null }
  }
  async addReviewLog(log: ReviewLog): Promise<void> { await db.reviewLogs.add(log) }
}

export class SearchHistoryRepository {
  private readonly retention = 100
  async record(query: string, normalizedQuery: string, resultCount?: number): Promise<SearchHistory> {
    const now = Date.now()
    const item: SearchHistory = { id: id(), query, normalizedQuery, searchedAt: now, ...(resultCount === undefined ? {} : { resultCount }) }
    return db.transaction('rw', db.searchHistory, async () => {
      const recent = await db.searchHistory.where('[normalizedQuery+searchedAt]').between([normalizedQuery, 0], [normalizedQuery, Number.MAX_SAFE_INTEGER]).last()
      if (recent && now - recent.searchedAt < 5_000) {
        const updated = { ...recent, query, searchedAt: now, ...(resultCount === undefined ? {} : { resultCount }) }
        await db.searchHistory.put(updated); return updated
      }
      await db.searchHistory.add(item)
      const excess = await db.searchHistory.orderBy('searchedAt').reverse().offset(this.retention).primaryKeys()
      if (excess.length) await db.searchHistory.bulkDelete(excess)
      return item
    })
  }
  async list(limit = 30): Promise<SearchHistory[]> { boundedLimit(limit); return db.searchHistory.orderBy('searchedAt').reverse().limit(limit).toArray() }
  async clear(): Promise<void> { await db.searchHistory.clear() }
}

export class SettingsRepository {
  async get(key: string): Promise<UserSettings | undefined> { return db.userSettings.get(key) }
  async set(key: string, value: unknown): Promise<void> { await db.userSettings.put({ key, value, updatedAt: Date.now() }) }
}
