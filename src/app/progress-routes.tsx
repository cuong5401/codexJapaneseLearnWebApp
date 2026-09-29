import { lazy, Suspense } from 'react'

const ProgressPage = lazy(() => import('../features/progress/ProgressPage').then((module) => ({ default: module.ProgressPage })))
export function ProgressRoute() { return <Suspense fallback={<p className="content-state" role="status">学習データを読み込んでいます…</p>}><ProgressPage /></Suspense> }
