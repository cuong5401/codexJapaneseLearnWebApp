import { db, ACTIVE_DATASET_KEY, DATABASE_SCHEMA_VERSION, openKotobaDatabase } from '../database'
import { initializeDevelopmentData } from '../initialization'
import { getInitializationState } from '../initialization'

function assertDevelopment() { if (!import.meta.env.DEV) throw new Error('Kotoba database developer tools are disabled in production builds.') }
export async function getDatabaseDiagnostics() {
  assertDevelopment(); await openKotobaDatabase()
  const activeVersion = (await db.metadata.get(ACTIVE_DATASET_KEY))?.value ?? null
  const cleanupWarning = (await db.metadata.get('inactiveDatasetCleanupWarning'))?.value ?? null
  const [dictionary, dictionarySearchTerms, kanji, grammar, examples, notebooks, notebookItems, studyStates, cards, reviewLogs, history, settings, customWords, cachedLookups, favorites, savedReferenceWords, importRows] = await Promise.all([
    db.dictionaryEntries.where('[datasetVersion+id]').between([String(activeVersion ?? ''), ''], [String(activeVersion ?? ''), '\uffff']).count(),
    db.dictionarySearchTerms.where('datasetVersion').equals(String(activeVersion ?? '')).count(),
    db.kanjiEntries.where('[datasetVersion+id]').between([String(activeVersion ?? ''), ''], [String(activeVersion ?? ''), '\uffff']).count(),
    db.grammarEntries.where('[datasetVersion+id]').between([String(activeVersion ?? ''), ''], [String(activeVersion ?? ''), '\uffff']).count(),
    db.exampleSentences.where('[datasetVersion+id]').between([String(activeVersion ?? ''), ''], [String(activeVersion ?? ''), '\uffff']).count(),
    db.notebooks.count(), db.notebookItems.count(), db.studyStates.count(), db.srsCards.count(), db.reviewLogs.count(), db.searchHistory.count(), db.userSettings.count(), db.customWords.count(), db.onlineLookupCache.count(), db.favorites.count(), db.savedReferenceWords.count(),
    db.datasetImports.orderBy('updatedAt').reverse().limit(20).toArray(),
  ])
  const imports = importRows.map((state) => {
    const stale = state.status === 'importing' && Date.now() - state.updatedAt > 60_000
    return stale ? { ...state, status: 'interrupted' as const, lastError: state.lastError ?? 'interrupted-import: no progress update for at least 60 seconds; rerunning seed/import resumes from committed chunks.' } : state
  })
  return { database: db.name, schemaVersion: DATABASE_SCHEMA_VERSION, activeDatasetVersion: activeVersion, cleanupWarning, counts: { dictionary, dictionarySearchTerms, kanji, grammar, examples, notebooks, notebookItems, studyStates, srsCards: cards, reviewLogs, searchHistory: history, userSettings: settings, customWords, onlineLookupCache: cachedLookups, favorites, savedReferenceWords }, imports, initialization: getInitializationState() }
}

export async function clearReferenceDataset(): Promise<void> {
  assertDevelopment()
  await db.transaction('rw', [db.dictionaryEntries, db.dictionarySearchTerms, db.kanjiEntries, db.grammarEntries, db.exampleSentences, db.datasetImports, db.metadata], async () => {
    await Promise.all([db.dictionaryEntries.clear(), db.dictionarySearchTerms.clear(), db.kanjiEntries.clear(), db.grammarEntries.clear(), db.exampleSentences.clear(), db.datasetImports.clear()])
    await db.metadata.delete(ACTIVE_DATASET_KEY); await db.metadata.delete('datasetGeneratedAt')
  })
}

export async function clearUserData(): Promise<void> {
  assertDevelopment()
  await db.transaction('rw', [db.notebooks, db.notebookItems, db.studyStates, db.srsCards, db.reviewLogs, db.searchHistory, db.userSettings, db.customWords, db.onlineLookupCache, db.favorites, db.savedReferenceWords], async () => {
    await Promise.all([db.notebooks.clear(), db.notebookItems.clear(), db.studyStates.clear(), db.srsCards.clear(), db.reviewLogs.clear(), db.searchHistory.clear(), db.userSettings.clear(), db.customWords.clear(), db.onlineLookupCache.clear(), db.favorites.clear(), db.savedReferenceWords.clear()])
  })
}

export async function seedDevelopmentData() {
  assertDevelopment(); return initializeDevelopmentData()
}

export async function resetDevelopmentDatabase() {
  assertDevelopment(); await clearReferenceDataset(); await clearUserData(); return initializeDevelopmentData()
}

declare global { interface Window { kotobaDb?: { diagnostics: typeof getDatabaseDiagnostics; seed: typeof seedDevelopmentData; clearReferenceData: typeof clearReferenceDataset; clearUserData: typeof clearUserData; reset: typeof resetDevelopmentDatabase } } }
export function registerDevelopmentTools() {
  assertDevelopment()
  if (typeof window !== 'undefined') window.kotobaDb = { diagnostics: getDatabaseDiagnostics, seed: seedDevelopmentData, clearReferenceData: clearReferenceDataset, clearUserData, reset: resetDevelopmentDatabase }
}
