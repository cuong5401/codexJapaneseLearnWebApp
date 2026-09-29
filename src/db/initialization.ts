import { db, ACTIVE_DATASET_KEY, openKotobaDatabase } from './database'
import { importDataset, loadBundledChunk, loadBundledManifest } from './import/importer'
import type { ImportProgress } from './import/progress'
import { compareDatasetVersions } from './import/dataset-version'
import { usesStaticReferenceData } from './sources/reference-source'

export interface InitializationState { status: 'idle' | 'initializing' | 'ready' | 'failed'; progress: ImportProgress | null; error: string | null }
let initializationState: InitializationState = { status: 'idle', progress: null, error: null }
let initializationPromise: Promise<InitializationState> | undefined
const listeners = new Set<(state: InitializationState) => void>()
function update(state: InitializationState) { initializationState = state; listeners.forEach((listener) => listener(state)) }
export function getInitializationState(): InitializationState { return initializationState }
export function subscribeInitialization(listener: (state: InitializationState) => void) { listeners.add(listener); return () => listeners.delete(listener) }

export function initializeDevelopmentData(): Promise<InitializationState> {
  if (!import.meta.env.DEV) return Promise.reject(new Error('Development data initialization is unavailable in production.'))
  if (initializationPromise) return initializationPromise
  initializationPromise = (async () => {
    try {
      update({ status: 'initializing', progress: null, error: null })
      await openKotobaDatabase()
      const manifest = await loadBundledManifest()
      const bundledVersion = (manifest as { datasetVersion?: string }).datasetVersion
      const installed = (await db.metadata.get(ACTIVE_DATASET_KEY))?.value
      if (typeof bundledVersion !== 'string') throw new Error('Bundled dataset manifest has no version string.')
      if (typeof installed !== 'string' || compareDatasetVersions(installed, bundledVersion) < 0) {
        await importDataset(manifest, loadBundledChunk, (progress) => update({ status: 'initializing', progress, error: null }))
      }
      update({ status: 'ready', progress: getInitializationState().progress, error: null })
      return initializationState
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown local data initialization error.'
      update({ status: 'failed', progress: getInitializationState().progress, error: message })
      return initializationState
    } finally { initializationPromise = undefined }
  })()
  return initializationPromise
}

/** Opens user storage. Only seed-mode development imports reference data into IndexedDB. */
export async function ensureLocalDatasetReady(): Promise<void> {
  await openKotobaDatabase()
  if (usesStaticReferenceData) return
  const state = await initializeDevelopmentData()
  if (state.status !== 'ready') throw new Error(state.error ?? 'The offline development dataset could not be initialized.')
}
