import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from './shell/AppShell'
import { HomePage } from '../features/home/HomePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SectionPage } from '../features/sections/SectionPage'
import { NotFoundPage } from '../features/sections/NotFoundPage'
import { DictionarySearchRoute, DictionaryDetailRoute } from './dictionary-routes'
import { GrammarDetailRoute, GrammarListRoute, KanjiDetailRoute, KanjiListRoute } from './content-routes'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/dictionary', element: <DictionarySearchRoute /> },
      { path: '/dictionary/:id', element: <DictionaryDetailRoute /> },
      { path: '/kanji', element: <KanjiListRoute /> },
      { path: '/kanji/:character', element: <KanjiDetailRoute /> },
      { path: '/grammar', element: <GrammarListRoute /> },
      { path: '/grammar/:id', element: <GrammarDetailRoute /> },
      { path: '/reading', element: <SectionPage section="reading" /> },
      { path: '/review', element: <SectionPage section="review" /> },
      { path: '/jlpt', element: <SectionPage section="jlpt" /> },
      { path: '/notebook', element: <SectionPage section="notebook" /> },
      { path: '/progress', element: <SectionPage section="progress" /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
