import { lazy, Suspense } from 'react'

const OverviewPage = lazy(() => import('../features/jlpt/JlptPage').then((module) => ({ default: module.JlptOverviewPage })))
const LevelPage = lazy(() => import('../features/jlpt/JlptPage').then((module) => ({ default: module.JlptLevelPage })))
const CategoryPage = lazy(() => import('../features/jlpt/JlptPage').then((module) => ({ default: module.JlptCategoryPage })))
const QuizSetupPage = lazy(() => import('../features/jlpt/JlptPage').then((module) => ({ default: module.JlptQuizSetupPage })))
const QuizSessionPage = lazy(() => import('../features/jlpt/JlptPage').then((module) => ({ default: module.JlptQuizSessionPage })))
const QuizSummaryPage = lazy(() => import('../features/jlpt/JlptPage').then((module) => ({ default: module.JlptQuizSummaryPage })))
function Loading() { return <p className="content-state" role="status">Loading JLPT study…</p> }
export function JlptOverviewRoute() { return <Suspense fallback={<Loading />}><OverviewPage /></Suspense> }
export function JlptLevelRoute() { return <Suspense fallback={<Loading />}><LevelPage /></Suspense> }
export function JlptCategoryRoute() { return <Suspense fallback={<Loading />}><CategoryPage /></Suspense> }
export function JlptQuizSetupRoute() { return <Suspense fallback={<Loading />}><QuizSetupPage /></Suspense> }
export function JlptQuizSessionRoute() { return <Suspense fallback={<Loading />}><QuizSessionPage /></Suspense> }
export function JlptQuizSummaryRoute() { return <Suspense fallback={<Loading />}><QuizSummaryPage /></Suspense> }
