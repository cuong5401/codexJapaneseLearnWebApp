import { normalizeSearchInput } from '../../lib/search-normalization'
import type { ItemType, NotebookResolvedItem, PersonalVocabularyItem, StudyStatus } from '../../types/domain'
import { referenceDataSource } from '../sources/reference-source'
import { CustomWordRepository } from './custom-words'
import { FavoritesRepository, NotebookRepository, SavedReferenceVocabularyRepository, StudyRepository } from './user-data'

export type VocabularySourceFilter = 'all' | 'reference' | 'custom'
export type VocabularySort = 'recent-added' | 'recent-updated' | 'lexical' | 'status'
export interface MyVocabularyOptions {
  query?: string
  source?: VocabularySourceFilter
  status?: StudyStatus | 'all'
  notebookId?: string | 'all'
  favoritesOnly?: boolean
  sort?: VocabularySort
  limit?: number
}

export class MyVocabularyService {
  constructor(
    private readonly customWords = new CustomWordRepository(),
    private readonly savedReferences = new SavedReferenceVocabularyRepository(),
    private readonly notebooks = new NotebookRepository(),
    private readonly study = new StudyRepository(),
    private readonly favorites = new FavoritesRepository(),
  ) {}

  async list(options: MyVocabularyOptions = {}): Promise<PersonalVocabularyItem[]> {
    const limit = Math.min(500, Math.max(1, Math.floor(options.limit ?? 200)))
    const [savedReferences, customWords] = await Promise.all([
      options.source === 'custom' ? [] : this.savedReferences.list(500),
      options.source === 'reference' ? [] : this.customWords.list(500),
    ])
    const referenceItems = await Promise.all(savedReferences.map(async (saved) => {
      const entry = await referenceDataSource.dictionary.getById(saved.entryId)
      return {
        itemType: 'reference-word' as const, itemId: saved.entryId, source: 'reference' as const,
        word: entry?.word ?? saved.wordSnapshot ?? 'Unavailable dictionary entry',
        reading: entry?.reading ?? saved.readingSnapshot ?? '',
        meaningsVi: entry?.meanings.vi ?? (saved.meaningSnapshot ? [saved.meaningSnapshot] : []), meaningsEn: entry?.meanings.en ?? [],
        partsOfSpeech: entry?.partsOfSpeech ?? [], tags: entry?.tags ?? [], status: await this.study.getStatus('reference-word', saved.entryId),
        favorite: await this.favorites.isFavorite('reference-word', saved.entryId), notebookIds: await this.notebooks.getNotebookIds('reference-word', saved.entryId),
        savedAt: saved.savedAt, updatedAt: saved.savedAt, unavailable: !entry,
      }
    }))
    const customItems = await Promise.all(customWords.map(async (word) => ({
      itemType: 'custom-word' as const, itemId: word.id, source: word.sourceType === 'online' ? 'online-saved' as const : 'custom' as const,
      word: word.word, reading: word.reading, meaningsVi: word.meaningsVi, meaningsEn: word.meaningsEn, partsOfSpeech: word.partsOfSpeech,
      ...(word.notes ? { notes: word.notes } : {}), tags: word.tags ?? [], status: await this.study.getStatus('custom-word', word.id),
      favorite: await this.favorites.isFavorite('custom-word', word.id), notebookIds: await this.notebooks.getNotebookIds('custom-word', word.id),
      savedAt: word.createdAt, updatedAt: word.updatedAt, unavailable: false,
    })))

    let items = [...referenceItems, ...customItems]
    const query = normalizeSearchInput(options.query ?? '')
    if (query) items = items.filter((item) => normalizeSearchInput([
      item.word, item.reading, ...item.meaningsVi, ...item.meaningsEn, ...item.partsOfSpeech, ...item.tags, ('notes' in item ? item.notes : '') ?? '',
    ].join(' ')).includes(query))
    if (options.status && options.status !== 'all') items = items.filter((item) => item.status === options.status)
    if (options.favoritesOnly) items = items.filter((item) => item.favorite)
    if (options.notebookId && options.notebookId !== 'all') items = items.filter((item) => item.notebookIds.includes(options.notebookId!))
    if (options.sort === 'lexical') items.sort((a, b) => a.word.localeCompare(b.word, 'ja'))
    else if (options.sort === 'status') {
      const rank: Record<StudyStatus, number> = { learning: 0, unseen: 1, known: 2, suspended: 3 }
      items.sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt - a.updatedAt)
    } else if (options.sort === 'recent-updated') items.sort((a, b) => b.updatedAt - a.updatedAt)
    else items.sort((a, b) => b.savedAt - a.savedAt)
    return items.slice(0, limit)
  }

  async resolveNotebookItems(items: Array<{ itemType: ItemType; itemId: string }>): Promise<NotebookResolvedItem[]> {
    return Promise.all(items.map(async ({ itemType, itemId }) => {
      const [status, favorite] = await Promise.all([this.study.getStatus(itemType, itemId), this.favorites.isFavorite(itemType, itemId)])
      if (itemType === 'reference-word') {
        const entry = await referenceDataSource.dictionary.getById(itemId)
        return { itemType, itemId, title: entry?.word ?? 'Unavailable dictionary entry', reading: entry?.reading, meaning: entry?.meanings.vi[0] ?? entry?.meanings.en[0], status, favorite, unavailable: !entry, href: entry ? `/dictionary/${encodeURIComponent(itemId)}` : undefined }
      }
      if (itemType === 'custom-word') {
        const entry = await this.customWords.getById(itemId)
        return { itemType, itemId, title: entry?.word ?? 'Unavailable custom word', reading: entry?.reading, meaning: entry?.meaningsVi[0] ?? entry?.meaningsEn[0], status, favorite, unavailable: !entry, href: entry ? `/my-vocabulary/custom/${encodeURIComponent(itemId)}` : undefined }
      }
      if (itemType === 'kanji') {
        const entry = await referenceDataSource.kanji.getByCharacter(itemId)
        return { itemType, itemId, title: entry?.character ?? 'Unavailable kanji', meaning: entry?.meanings.vi[0] ?? entry?.meanings.en[0], status, favorite, unavailable: !entry, href: entry ? `/kanji/${encodeURIComponent(itemId)}` : undefined }
      }
      const entry = await referenceDataSource.grammar.getById(itemId)
      return { itemType, itemId, title: entry?.pattern ?? 'Unavailable grammar entry', meaning: entry?.meaningVi[0] ?? entry?.meaningEn[0], status, favorite, unavailable: !entry, href: entry ? `/grammar/${encodeURIComponent(itemId)}` : undefined }
    }))
  }
}

export const myVocabularyService = new MyVocabularyService()
