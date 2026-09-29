import { db } from '../database'
import type { SrsCard } from '../../types/domain'
import type { CustomWord, ExternalDictionaryEntry } from '../../types/domain'
import { normalizeJapanese } from '../../lib/japanese-normalization'

const createId = () => crypto.randomUUID()

export type CustomWordInput = Omit<CustomWord, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<CustomWord, 'id' | 'createdAt' | 'updatedAt'>>
export interface SaveExternalResult { word: CustomWord; created: boolean }

export function validateCustomWordInput(input: Pick<CustomWord, 'word' | 'reading' | 'meaningsVi' | 'meaningsEn'>): void {
  if (!input.word.trim()) throw new Error('Enter a word.')
  if (Array.from(input.word.trim()).length > 120) throw new Error('Words must be 120 characters or fewer.')
  if (Array.from(input.reading.trim()).length > 120) throw new Error('Readings must be 120 characters or fewer.')
  if (!input.reading.trim() && ![...input.meaningsVi, ...input.meaningsEn].some((meaning) => meaning.trim())) throw new Error('Add a reading or at least one meaning.')
}

export function externalEntryToCustomWord(entry: ExternalDictionaryEntry, now = Date.now()): CustomWord {
  return {
    id: createId(), word: entry.word, reading: entry.reading,
    meaningsVi: [...entry.meaningsVi], meaningsEn: [...entry.meaningsEn],
    partsOfSpeech: [...entry.partsOfSpeech], examples: entry.examples.map((example) => ({ ...example })),
    sourceType: 'online', sourceProvider: entry.sourceProvider,
    ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}), createdAt: now, updatedAt: now,
  }
}

export class CustomWordRepository {
  async create(input: CustomWordInput): Promise<CustomWord> {
    validateCustomWordInput(input)
    const now = Date.now()
    const word: CustomWord = { ...input, normalizedWord: normalizeJapanese(input.word), normalizedReading: normalizeJapanese(input.reading), id: input.id ?? createId(), createdAt: input.createdAt ?? now, updatedAt: now }
    await db.customWords.add(word)
    return word
  }
  async getById(id: string): Promise<CustomWord | undefined> { return db.customWords.get(id) }
  async findByWord(word: string): Promise<CustomWord[]> {
    const normalized = normalizeJapanese(word)
    return db.customWords.where('normalizedWord').equals(normalized).limit(50).toArray()
  }
  async searchLocal(query: string, limit = 12): Promise<CustomWord[]> {
    const normalized = normalizeJapanese(query)
    if (!normalized) return []
    const rows = await db.customWords.where('normalizedWord').between(normalized, `${normalized}\uffff`, true, true).limit(limit * 2).toArray()
    const readingRows = await db.customWords.where('normalizedReading').between(normalized, `${normalized}\uffff`, true, true).limit(limit * 2).toArray()
    const matches = new Map<string, CustomWord>()
    for (const entry of [...rows, ...readingRows]) matches.set(entry.id, entry)
    return [...matches.values()].slice(0, limit)
  }
  async update(id: string, changes: Partial<Omit<CustomWord, 'id' | 'createdAt'>>): Promise<void> {
    const current = await db.customWords.get(id)
    if (!current) throw new Error(`Custom word not found: ${id}`)
    const updated = { ...current, ...changes, id, createdAt: current.createdAt, updatedAt: Date.now() }
    updated.normalizedWord = normalizeJapanese(updated.word)
    updated.normalizedReading = normalizeJapanese(updated.reading)
    validateCustomWordInput(updated)
    await db.customWords.put(updated)
  }
  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.customWords, db.notebookItems, db.favorites, db.studyStates, db.srsCards, db.reviewLogs], async () => {
      const cardIds = await db.srsCards.where('[itemType+itemId]').equals(['custom-word', id]).primaryKeys()
      const reviewIds = (await Promise.all(cardIds.map((cardId) => db.reviewLogs.where('cardId').equals(cardId as SrsCard['id']).primaryKeys()))).flat()
      await Promise.all([
        db.customWords.delete(id),
        db.notebookItems.where('[itemType+itemId]').equals(['custom-word', id]).delete(),
        db.favorites.delete(['custom-word', id]),
        db.studyStates.where('[itemType+itemId]').equals(['custom-word', id]).delete(),
        db.srsCards.bulkDelete(cardIds as string[]),
        db.reviewLogs.bulkDelete(reviewIds),
      ])
    })
  }
  async list(limit = 100): Promise<CustomWord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError('limit must be an integer between 1 and 500')
    return db.customWords.orderBy('updatedAt').reverse().limit(limit).toArray()
  }
  async saveExternalWithResult(entry: ExternalDictionaryEntry): Promise<SaveExternalResult> {
    const normalizedWord = normalizeJapanese(entry.word)
    const normalizedReading = normalizeJapanese(entry.reading)
    return db.transaction('rw', db.customWords, async () => {
      const candidates = await db.customWords.where('normalizedWord').equals(normalizedWord).toArray()
      const existing = candidates.find((word) => !normalizedReading || (word.normalizedReading ?? normalizeJapanese(word.reading)) === normalizedReading)
      if (existing) return { word: existing, created: false }
      const word = externalEntryToCustomWord(entry)
      word.normalizedWord = normalizedWord
      word.normalizedReading = normalizedReading
      validateCustomWordInput(word)
      await db.customWords.add(word)
      return { word, created: true }
    })
  }
  async saveExternal(entry: ExternalDictionaryEntry): Promise<CustomWord> { return (await this.saveExternalWithResult(entry)).word }
}

export const customWordRepository = new CustomWordRepository()
