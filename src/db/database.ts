import Dexie, { type Table, type Transaction } from 'dexie'
import type { DictionaryEntry, DictionarySearchTerm, ExampleSentence, GrammarEntry, KanjiEntry, Notebook, NotebookItem, ReviewLog, SearchHistory, SrsCard, StudyState, UserSettings } from '../types/domain'
import { DataLayerError } from './errors'
import { normalizedMeanings } from '../lib/search-normalization'
import { buildDictionarySearchIndexRecord } from '../lib/meaning-index'
import { buildKanjiSearchKeys, buildDictionaryKanjiLookupKeys } from '../lib/content-index'

export interface DatasetImportState {
  id: string; datasetVersion: string; collection: string; completedChunks: string[]; totalChunks: number; processedItems: number
  status: 'preparing' | 'importing' | 'completed' | 'failed'; startedAt: number; updatedAt: number; lastError: string | null
}
export interface DatabaseMetadata { key: string; value: string | number | null; updatedAt: number }

export const KOTOBA_SCHEMA_V1 = {
  dictionaryEntries: '[datasetVersion+id], [datasetVersion+word], [datasetVersion+normalizedWord], [datasetVersion+reading], [datasetVersion+normalizedReading], [datasetVersion+jlptLevel], [datasetVersion+frequencyRank]',
  kanjiEntries: '[datasetVersion+id], [datasetVersion+character], [datasetVersion+jlptLevel]',
  grammarEntries: '[datasetVersion+id], [datasetVersion+normalizedPattern], [datasetVersion+jlptLevel]',
  exampleSentences: '[datasetVersion+id]',
  notebooks: '&id, updatedAt, sortOrder',
  notebookItems: '&id, notebookId, [notebookId+createdAt], [itemType+itemId], &[notebookId+itemType+itemId]',
  studyStates: '&id, &[itemType+itemId], status',
  srsCards: '&id, nextReviewAt, state, [itemType+itemId]',
  reviewLogs: '&id, cardId, reviewedAt, [cardId+reviewedAt]',
  searchHistory: '&id, searchedAt, normalizedQuery, [normalizedQuery+searchedAt]',
  userSettings: '&key',
  datasetImports: '&id, datasetVersion, collection, status, updatedAt',
  metadata: '&key',
}
export const KOTOBA_SCHEMA_V3 = {
  dictionarySearchTerms: '&[datasetVersion+entryId], datasetVersion, *viPhraseKeys, *viTokenKeys, *enPhraseKeys, *enTokenKeys',
}
export const KOTOBA_SCHEMA_V4 = {
  dictionaryEntries: `${KOTOBA_SCHEMA_V1.dictionaryEntries}, *kanjiLookupKeys`,
  kanjiEntries: `${KOTOBA_SCHEMA_V1.kanjiEntries}, *searchKeys`,
}

export async function upgradeSearchFields(transaction: Transaction): Promise<void> {
  await transaction.table('dictionaryEntries').toCollection().modify((entry: DictionaryEntry) => {
    Object.assign(entry, normalizedMeanings(entry.meanings))
  })
}

export async function upgradeMeaningSearchIndex(transaction: Transaction): Promise<void> {
  const termTable = transaction.table('dictionarySearchTerms')
  let batch: DictionarySearchTerm[] = []
  await transaction.table('dictionaryEntries').toCollection().each(async (entry: DictionaryEntry) => {
    batch.push(buildDictionarySearchIndexRecord(entry))
    if (batch.length >= 4_000) {
      const pending = batch
      batch = []
      await termTable.bulkPut(pending)
    }
  })
  if (batch.length) await termTable.bulkPut(batch)
}

export async function upgradeContentSearchIndexes(transaction: Transaction): Promise<void> {
  await transaction.table('dictionaryEntries').toCollection().modify((entry: DictionaryEntry) => {
    entry.kanjiLookupKeys = buildDictionaryKanjiLookupKeys(entry)
  })
  await transaction.table('kanjiEntries').toCollection().modify((entry: KanjiEntry) => {
    entry.searchKeys = buildKanjiSearchKeys(entry)
  })
}

export class KotobaDatabase extends Dexie {
  dictionaryEntries!: Table<DictionaryEntry, [string, string], DictionaryEntry>
  dictionarySearchTerms!: Table<DictionarySearchTerm, [string, string], DictionarySearchTerm>
  kanjiEntries!: Table<KanjiEntry, [string, string], KanjiEntry>
  grammarEntries!: Table<GrammarEntry, [string, string], GrammarEntry>
  exampleSentences!: Table<ExampleSentence, [string, string], ExampleSentence>
  notebooks!: Table<Notebook, string, Notebook>
  notebookItems!: Table<NotebookItem, string, NotebookItem>
  studyStates!: Table<StudyState, string, StudyState>
  srsCards!: Table<SrsCard, string, SrsCard>
  reviewLogs!: Table<ReviewLog, string, ReviewLog>
  searchHistory!: Table<SearchHistory, string, SearchHistory>
  userSettings!: Table<UserSettings, string, UserSettings>
  datasetImports!: Table<DatasetImportState, string, DatasetImportState>
  metadata!: Table<DatabaseMetadata, string, DatabaseMetadata>

  constructor() {
    super('kotoba-db')
    this.version(1).stores(KOTOBA_SCHEMA_V1)
    this.version(2).stores({}).upgrade(upgradeSearchFields)
    this.version(3).stores(KOTOBA_SCHEMA_V3).upgrade(upgradeMeaningSearchIndex)
    this.version(4).stores(KOTOBA_SCHEMA_V4).upgrade(upgradeContentSearchIndexes)
  }
}

export const db = new KotobaDatabase()
export const DATABASE_SCHEMA_VERSION = 4
export const ACTIVE_DATASET_KEY = 'activeDatasetVersion'

export async function openKotobaDatabase(): Promise<void> {
  try { await db.open() }
  catch (error) { throw new DataLayerError('migration-failed', 'Could not open the local database or complete its schema upgrade.', error) }
}
