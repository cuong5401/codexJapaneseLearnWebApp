import { db } from '../database'
import Dexie from 'dexie'
import type { Notebook, NotebookItem, ReviewLog, SearchHistory, SrsCard, StudyState, UserSettings } from '../../types/domain'
import { boundedLimit, type Page } from './shared'

const id = () => crypto.randomUUID()

export class NotebookRepository {
  async create(name: string): Promise<Notebook> {
    const now = Date.now(); const notebook: Notebook = { id: id(), name: name.trim(), createdAt: now, updatedAt: now, sortOrder: now, isSystem: false }
    await db.notebooks.add(notebook); return notebook
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
}

export class StudyRepository {
  async get(itemType: StudyState['itemType'], itemId: string): Promise<StudyState | undefined> {
    return db.studyStates.where('[itemType+itemId]').equals([itemType, itemId]).first()
  }
  async save(state: StudyState): Promise<void> { await db.studyStates.put(state) }
  async listByStatus(status: StudyState['status'], limit = 50, offset = 0): Promise<Page<StudyState>> {
    boundedLimit(limit); if (!Number.isInteger(offset) || offset < 0) throw new RangeError('offset must be non-negative')
    const items = await db.studyStates.where('status').equals(status).offset(offset).limit(limit).toArray(); return { items, limit, offset }
  }
}

export class SrsRepository {
  async get(id: string): Promise<SrsCard | undefined> { return db.srsCards.get(id) }
  async save(card: SrsCard): Promise<void> { await db.srsCards.put(card) }
  async listDue(now = Date.now(), limit = 100): Promise<SrsCard[]> {
    boundedLimit(limit); return db.srsCards.where('nextReviewAt').belowOrEqual(now).filter((card) => card.nextReviewAt !== null && card.state !== 'suspended').limit(limit).toArray()
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
