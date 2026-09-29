import { db } from '../database'
import type { ReadingDocument } from '../../types/domain'

const createId = () => crypto.randomUUID()

export class ReadingDocumentRepository {
  async list(limit = 100): Promise<ReadingDocument[]> {
    return db.readingDocuments.orderBy('updatedAt').reverse().limit(limit).toArray()
  }
  async get(id: string): Promise<ReadingDocument | undefined> { return db.readingDocuments.get(id) }
  async save(input: Pick<ReadingDocument, 'text'> & Partial<Pick<ReadingDocument, 'id' | 'title' | 'sourceName' | 'sourceUrl' | 'notes'>>): Promise<ReadingDocument> {
    const now = Date.now()
    const current = input.id ? await db.readingDocuments.get(input.id) : undefined
    const text = input.text
    const derivedTitle = text.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 64)
    const document: ReadingDocument = {
      id: current?.id ?? input.id ?? createId(), title: input.title?.trim() || derivedTitle || 'Untitled reading', text,
      createdAt: current?.createdAt ?? now, updatedAt: now,
      ...(input.sourceName !== undefined ? { sourceName: input.sourceName } : current?.sourceName ? { sourceName: current.sourceName } : {}),
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : current?.sourceUrl ? { sourceUrl: current.sourceUrl } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : current?.notes ? { notes: current.notes } : {}),
    }
    await db.readingDocuments.put(document)
    return document
  }
  async delete(id: string): Promise<void> { await db.readingDocuments.delete(id) }
}

export const readingDocumentRepository = new ReadingDocumentRepository()
