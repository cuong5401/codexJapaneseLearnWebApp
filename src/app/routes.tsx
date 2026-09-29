import { createHashRouter } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { HomePage } from '../features/home/HomePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { ProgressRoute } from './progress-routes'
import { NotFoundPage } from '../features/sections/NotFoundPage'
import { DictionarySearchRoute, DictionaryDetailRoute } from './dictionary-routes'
import { GrammarDetailRoute, GrammarListRoute, KanjiDetailRoute, KanjiListRoute } from './content-routes'
import { CustomWordDetailRoute, CustomWordEditRoute, CustomWordFormRoute, MyVocabularyRoute, NotebookDetailRoute, NotebookListRoute } from './organization-routes'
import { ReviewDashboardRoute, ReviewSessionRoute, ReviewSummaryRoute } from './review-routes'
import { ReadingRoute } from './reading-routes'
import { JlptCategoryRoute, JlptLevelRoute, JlptOverviewRoute, JlptQuizSessionRoute, JlptQuizSetupRoute, JlptQuizSummaryRoute } from './jlpt-routes'

export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/dictionary', element: <DictionarySearchRoute /> },
      { path: '/dictionary/:id', element: <DictionaryDetailRoute /> },
      { path: '/my-vocabulary', element: <MyVocabularyRoute /> },
      { path: '/my-vocabulary/new', element: <CustomWordFormRoute /> },
      { path: '/my-vocabulary/custom/:id/edit', element: <CustomWordEditRoute /> },
      { path: '/my-vocabulary/custom/:id', element: <CustomWordDetailRoute /> },
      { path: '/kanji', element: <KanjiListRoute /> },
      { path: '/kanji/:character', element: <KanjiDetailRoute /> },
      { path: '/grammar', element: <GrammarListRoute /> },
      { path: '/grammar/:id', element: <GrammarDetailRoute /> },
      { path: '/reading', element: <ReadingRoute /> },
      { path: '/reading/new', element: <ReadingRoute /> },
      { path: '/reading/:id/edit', element: <ReadingRoute /> },
      { path: '/reading/:id', element: <ReadingRoute /> },
      { path: '/review', element: <ReviewDashboardRoute /> },
      { path: '/review/session', element: <ReviewSessionRoute /> },
      { path: '/review/summary', element: <ReviewSummaryRoute /> },
      { path: '/jlpt', element: <JlptOverviewRoute /> },
      { path: '/jlpt/:level', element: <JlptLevelRoute /> },
      { path: '/jlpt/:level/:category', element: <JlptCategoryRoute /> },
      { path: '/jlpt/:level/quiz', element: <JlptQuizSetupRoute /> },
      { path: '/jlpt/:level/quiz/session', element: <JlptQuizSessionRoute /> },
      { path: '/jlpt/:level/quiz/summary', element: <JlptQuizSummaryRoute /> },
      { path: '/notebook', element: <NotebookListRoute /> },
      { path: '/notebook/:id', element: <NotebookDetailRoute /> },
      { path: '/progress', element: <ProgressRoute /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
