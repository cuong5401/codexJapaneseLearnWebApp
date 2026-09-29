import { lazy, Suspense } from 'react'

const ReviewDashboardPage = lazy(() => import('../features/review/ReviewPages').then((module) => ({ default: module.ReviewDashboardPage })))
const ReviewSessionPage = lazy(() => import('../features/review/ReviewPages').then((module) => ({ default: module.ReviewSessionPage })))
const ReviewSummaryPage = lazy(() => import('../features/review/ReviewPages').then((module) => ({ default: module.ReviewSummaryPage })))
const loading = <p className="content-state" role="status">Loading review…</p>
export function ReviewDashboardRoute() { return <Suspense fallback={loading}><ReviewDashboardPage /></Suspense> }
export function ReviewSessionRoute() { return <Suspense fallback={loading}><ReviewSessionPage /></Suspense> }
export function ReviewSummaryRoute() { return <Suspense fallback={loading}><ReviewSummaryPage /></Suspense> }
