import { lazy, Suspense } from 'react'

const ReadingPage = lazy(() => import('../features/reading/ReadingPage').then((module) => ({ default: module.ReadingPage })))

export function ReadingRoute() {
  return <Suspense fallback={<div className="dictionary-message" role="status">Loading Reading…</div>}><ReadingPage /></Suspense>
}
