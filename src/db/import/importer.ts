import { db, ACTIVE_DATASET_KEY, type DatasetImportState } from '../database'
import { DataLayerError } from '../errors'
import { datasetManifestSchema, dictionaryEntrySchema, exampleSentenceSchema, grammarEntrySchema, kanjiEntrySchema, type DatasetCollection, type DatasetManifest } from '../../data/schemas/dataset'
import type { DictionaryEntry, ExampleSentence, GrammarEntry, KanjiEntry } from '../../types/domain'
import { calculateProgress, type ImportProgress } from './progress'
import Dexie from 'dexie'
import { normalizedMeanings } from '../../lib/search-normalization'
import { buildDictionarySearchIndexRecord } from '../../lib/meaning-index'
import { buildDictionaryKanjiLookupKeys, buildKanjiSearchKeys } from '../../lib/content-index'

export const DATASET_SCHEMA_VERSION = 1
export type ChunkLoader = (path: string) => Promise<unknown>

function manifestOrThrow(input: unknown): DatasetManifest {
  const parsed = datasetManifestSchema.safeParse(input)
  if (!parsed.success) throw new DataLayerError('manifest-invalid', 'Dataset manifest failed validation.', parsed.error)
  if (parsed.data.schemaVersion !== DATASET_SCHEMA_VERSION) throw new DataLayerError('unsupported-dataset', `Dataset schema ${parsed.data.schemaVersion} is not supported.`)
  for (const [collection, value] of Object.entries(parsed.data.collections)) {
    const chunkCount = value.chunks.reduce((total, chunk) => total + chunk.itemCount, 0)
    if (chunkCount !== value.count) throw new DataLayerError('manifest-invalid', `${collection} manifest count does not equal its chunk counts.`)
    if (new Set(value.chunks.map((chunk) => chunk.id)).size !== value.chunks.length) throw new DataLayerError('manifest-invalid', `${collection} manifest contains duplicate chunk IDs.`)
    if (new Set(value.chunks.map((chunk) => chunk.path)).size !== value.chunks.length) throw new DataLayerError('manifest-invalid', `${collection} manifest contains duplicate chunk paths.`)
  }
  return parsed.data
}

function collectionStateId(version: string, collection: string) { return `${version}:${collection}` }

async function cleanupInactiveVersion(version: string) {
  const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  while (true) {
    const keys = await db.dictionarySearchTerms.where('datasetVersion').equals(version).limit(500).primaryKeys()
    if (!keys.length) break
    await db.dictionarySearchTerms.bulkDelete(keys); await yieldToBrowser()
  }
  while (true) {
    const keys = await db.dictionaryEntries.where('[datasetVersion+id]').between([version, Dexie.minKey], [version, Dexie.maxKey]).limit(500).primaryKeys()
    if (!keys.length) break
    await db.dictionaryEntries.bulkDelete(keys); await yieldToBrowser()
  }
  while (true) {
    const keys = await db.kanjiEntries.where('[datasetVersion+id]').between([version, Dexie.minKey], [version, Dexie.maxKey]).limit(500).primaryKeys()
    if (!keys.length) break
    await db.kanjiEntries.bulkDelete(keys); await yieldToBrowser()
  }
  while (true) {
    const keys = await db.grammarEntries.where('[datasetVersion+id]').between([version, Dexie.minKey], [version, Dexie.maxKey]).limit(500).primaryKeys()
    if (!keys.length) break
    await db.grammarEntries.bulkDelete(keys); await yieldToBrowser()
  }
  while (true) {
    const keys = await db.exampleSentences.where('[datasetVersion+id]').between([version, Dexie.minKey], [version, Dexie.maxKey]).limit(500).primaryKeys()
    if (!keys.length) break
    await db.exampleSentences.bulkDelete(keys); await yieldToBrowser()
  }
}

async function writeChunk(collection: DatasetCollection, datasetVersion: string, records: unknown[], state: DatasetImportState, chunkId: string) {
  const table = collection === 'dictionary' ? db.dictionaryEntries : collection === 'kanji' ? db.kanjiEntries : collection === 'grammar' ? db.grammarEntries : db.exampleSentences
  const schema = collection === 'dictionary' ? dictionaryEntrySchema : collection === 'kanji' ? kanjiEntrySchema : collection === 'grammar' ? grammarEntrySchema : exampleSentenceSchema
  const parsed = schema.array().safeParse(records)
  if (!parsed.success) throw new DataLayerError('chunk-invalid', `Chunk ${chunkId} failed ${collection} record validation.`, parsed.error)
  if (parsed.data.some((record) => record.datasetVersion !== datasetVersion)) throw new DataLayerError('chunk-invalid', `Chunk ${chunkId} contains records for a different dataset version.`)
  try {
    await db.transaction('rw', table, db.dictionarySearchTerms, db.datasetImports, async () => {
      if (collection === 'dictionary') {
        const entries = (parsed.data as DictionaryEntry[]).map((entry) => ({ ...entry, kanjiLookupKeys: buildDictionaryKanjiLookupKeys(entry), ...normalizedMeanings(entry.meanings) }))
        await db.dictionaryEntries.bulkPut(entries)
        const searchIndexRecords = entries.map(buildDictionarySearchIndexRecord)
        if (searchIndexRecords.length) await db.dictionarySearchTerms.bulkPut(searchIndexRecords)
      }
      else if (collection === 'kanji') await db.kanjiEntries.bulkPut((parsed.data as KanjiEntry[]).map((entry) => ({ ...entry, searchKeys: buildKanjiSearchKeys(entry) })))
      else if (collection === 'grammar') await db.grammarEntries.bulkPut(parsed.data as GrammarEntry[])
      else await db.exampleSentences.bulkPut(parsed.data as ExampleSentence[])
      const current = await db.datasetImports.get(state.id) ?? state
      const isNewChunk = !current.completedChunks.includes(chunkId)
      await db.datasetImports.put({ ...current, completedChunks: isNewChunk ? [...current.completedChunks, chunkId] : current.completedChunks, processedItems: isNewChunk ? current.processedItems + parsed.data.length : current.processedItems, status: 'importing', updatedAt: Date.now(), lastError: null })
    })
  } catch (error) {
    if (error instanceof DataLayerError) throw error
    throw new DataLayerError('db-write-failed', `IndexedDB could not commit ${collection} chunk ${chunkId}.`, error)
  }
}

export async function importDataset(input: unknown, loadChunk: ChunkLoader, onProgress: (progress: ImportProgress) => void = () => undefined): Promise<void> {
  const manifest = manifestOrThrow(input)
  const previousVersion = (await db.metadata.get(ACTIVE_DATASET_KEY))?.value
  const collections = Object.entries(manifest.collections) as [DatasetCollection, DatasetManifest['collections'][DatasetCollection]][]
  const totalItems = collections.reduce((sum, [, config]) => sum + config.count, 0)
  const totalChunks = collections.reduce((sum, [, config]) => sum + config.chunks.length, 0)
  let processedItems = 0; let completedChunks = 0
  onProgress(calculateProgress(0, totalItems, 0, totalChunks, 'preparing'))

  try {
    for (const [collection, config] of collections) {
      const id = collectionStateId(manifest.datasetVersion, collection)
      const previous = await db.datasetImports.get(id)
      let state: DatasetImportState = previous ?? { id, datasetVersion: manifest.datasetVersion, collection, completedChunks: [], totalChunks: config.chunks.length, processedItems: 0, status: 'preparing', startedAt: Date.now(), updatedAt: Date.now(), lastError: null }
      state = { ...state, status: 'importing', totalChunks: config.chunks.length, updatedAt: Date.now(), lastError: null }
      await db.datasetImports.put(state)
      processedItems += state.processedItems; completedChunks += state.completedChunks.length
      onProgress(calculateProgress(processedItems, totalItems, completedChunks, totalChunks, 'importing', collection))

      for (const chunk of config.chunks) {
        if (state.completedChunks.includes(chunk.id)) continue
        let records: unknown
        try { records = await loadChunk(chunk.path) } catch (error) {
          throw new DataLayerError('chunk-read-failed', `Could not read ${chunk.path}.`, error)
        }
        if (!Array.isArray(records) || records.length !== chunk.itemCount) throw new DataLayerError('chunk-invalid', `Chunk ${chunk.id} has ${Array.isArray(records) ? records.length : 'a non-array'} records; manifest expects ${chunk.itemCount}.`)
        await writeChunk(collection, manifest.datasetVersion, records, state, chunk.id)
        state = (await db.datasetImports.get(id))!
        processedItems += records.length; completedChunks += 1
        onProgress(calculateProgress(processedItems, totalItems, completedChunks, totalChunks, 'importing', collection))
        // Let rendering and input work between committed batches.
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      state = (await db.datasetImports.get(id))!
      await db.datasetImports.put({ ...state, status: 'completed', updatedAt: Date.now(), lastError: null })
    }

    await db.transaction('rw', db.metadata, async () => {
      await db.metadata.put({ key: ACTIVE_DATASET_KEY, value: manifest.datasetVersion, updatedAt: Date.now() })
      await db.metadata.put({ key: 'datasetGeneratedAt', value: manifest.generatedAt, updatedAt: Date.now() })
    })
    if (typeof previousVersion === 'string' && previousVersion !== manifest.datasetVersion) {
      try {
        await cleanupInactiveVersion(previousVersion)
        await db.metadata.delete('inactiveDatasetCleanupWarning')
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown cleanup error'
        await db.metadata.put({ key: 'inactiveDatasetCleanupWarning', value: `${previousVersion}: ${detail}`, updatedAt: Date.now() })
      }
    }
    onProgress(calculateProgress(totalItems, totalItems, totalChunks, totalChunks, 'completed'))
  } catch (error) {
    const failure = error instanceof DataLayerError ? error : new DataLayerError('db-write-failed', 'Dataset import failed unexpectedly.', error)
    const states = await db.datasetImports.where('datasetVersion').equals(manifest.datasetVersion).toArray()
    const inProgress = states.find((state) => state.status === 'importing')
    if (inProgress) await db.datasetImports.put({ ...inProgress, status: 'failed', updatedAt: Date.now(), lastError: `${failure.code}: ${failure.message}` })
    onProgress(calculateProgress(processedItems, totalItems, completedChunks, totalChunks, 'failed', inProgress?.collection ?? null))
    throw failure
  }
}

export async function loadBundledManifest(): Promise<unknown> {
  try { const response = await fetch('/data/manifest.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json() }
  catch (error) { throw new DataLayerError('chunk-read-failed', 'Could not read the bundled dataset manifest.', error) }
}
export async function loadBundledChunk(path: string): Promise<unknown> {
  const response = await fetch(path.startsWith('/') ? path : `/${path}`)
  if (!response.ok) throw new Error(`HTTP ${response.status} while reading ${path}`)
  return response.json()
}
