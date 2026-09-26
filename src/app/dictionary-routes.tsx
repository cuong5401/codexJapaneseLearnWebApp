import { lazy, Suspense } from 'react'

const DictionaryPage = lazy(() => import('../features/dictionary/DictionaryPage').then((module) => ({ default: module.DictionaryPage })))
const DictionaryDetailPage = lazy(() => import('../features/dictionary/DictionaryDetailPage').then((module) => ({ default: module.DictionaryDetailPage })))

export function DictionarySearchRoute() {
  return <Suspense fallback={<div className="dictionary-message" role="status">Loading dictionary…</div>}><DictionaryPage /></Suspense>
}

export function DictionaryDetailRoute() {
  return <Suspense fallback={<div className="dictionary-message" role="status">Loading entry…</div>}><DictionaryDetailPage /></Suspense>
}
