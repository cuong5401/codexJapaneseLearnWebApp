import { lazy, Suspense } from 'react'

const KanjiPage = lazy(() => import('../features/kanji/KanjiPage').then((module) => ({ default: module.KanjiPage })))
const KanjiDetailPage = lazy(() => import('../features/kanji/KanjiDetailPage').then((module) => ({ default: module.KanjiDetailPage })))
const GrammarPage = lazy(() => import('../features/grammar/GrammarPage').then((module) => ({ default: module.GrammarPage })))
const GrammarDetailPage = lazy(() => import('../features/grammar/GrammarDetailPage').then((module) => ({ default: module.GrammarDetailPage })))

function RouteLoading({ label }: { label: string }) { return <p className="content-state" role="status">Loading {label}…</p> }
export function KanjiListRoute() { return <Suspense fallback={<RouteLoading label="kanji" />}><KanjiPage /></Suspense> }
export function KanjiDetailRoute() { return <Suspense fallback={<RouteLoading label="kanji" />}><KanjiDetailPage /></Suspense> }
export function GrammarListRoute() { return <Suspense fallback={<RouteLoading label="grammar" />}><GrammarPage /></Suspense> }
export function GrammarDetailRoute() { return <Suspense fallback={<RouteLoading label="grammar" />}><GrammarDetailPage /></Suspense> }
