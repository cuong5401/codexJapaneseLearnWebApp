import { lazy, Suspense } from 'react'

const MyVocabularyPage = lazy(() => import('../features/organization/MyVocabularyPage').then((module) => ({ default: module.MyVocabularyPage })))
const CustomWordFormPage = lazy(() => import('../features/organization/CustomWordFormPage').then((module) => ({ default: module.CustomWordFormPage })))
const CustomWordEditPage = lazy(() => import('../features/organization/CustomWordFormPage').then((module) => ({ default: module.CustomWordFormPage })))
const CustomWordDetailPage = lazy(() => import('../features/organization/CustomWordDetailPage').then((module) => ({ default: module.CustomWordDetailPage })))
const NotebookListPage = lazy(() => import('../features/organization/NotebookListPage').then((module) => ({ default: module.NotebookListPage })))
const NotebookDetailPage = lazy(() => import('../features/organization/NotebookDetailPage').then((module) => ({ default: module.NotebookDetailPage })))

const loading = <div className="content-state" role="status">Loading your vocabulary…</div>
export function MyVocabularyRoute() { return <Suspense fallback={loading}><MyVocabularyPage /></Suspense> }
export function CustomWordFormRoute() { return <Suspense fallback={loading}><CustomWordFormPage /></Suspense> }
export function CustomWordEditRoute() { return <Suspense fallback={loading}><CustomWordEditPage /></Suspense> }
export function CustomWordDetailRoute() { return <Suspense fallback={loading}><CustomWordDetailPage /></Suspense> }
export function NotebookListRoute() { return <Suspense fallback={loading}><NotebookListPage /></Suspense> }
export function NotebookDetailRoute() { return <Suspense fallback={loading}><NotebookDetailPage /></Suspense> }
