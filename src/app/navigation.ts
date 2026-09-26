import {
  BookOpen, BookText, ChartNoAxesColumnIncreasing, FileText, GraduationCap,
  House, Languages, NotebookPen, RotateCcw, Settings2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { uiCopy } from './copy'

export type SectionId = 'home' | 'dictionary' | 'kanji' | 'grammar' | 'reading' | 'review' | 'jlpt' | 'notebook' | 'progress' | 'settings'
export type NavigationItem = { id: SectionId; label: string; path: string; icon: LucideIcon }

export const mainNavigation: NavigationItem[] = [
  { id: 'home', label: uiCopy.navigation.home, path: '/', icon: House },
  { id: 'dictionary', label: uiCopy.navigation.dictionary, path: '/dictionary', icon: Languages },
  { id: 'kanji', label: uiCopy.navigation.kanji, path: '/kanji', icon: BookOpen },
  { id: 'grammar', label: uiCopy.navigation.grammar, path: '/grammar', icon: BookText },
  { id: 'reading', label: uiCopy.navigation.reading, path: '/reading', icon: FileText },
  { id: 'review', label: uiCopy.navigation.review, path: '/review', icon: RotateCcw },
  { id: 'jlpt', label: uiCopy.navigation.jlpt, path: '/jlpt', icon: GraduationCap },
  { id: 'notebook', label: uiCopy.navigation.notebook, path: '/notebook', icon: NotebookPen },
  { id: 'progress', label: uiCopy.navigation.progress, path: '/progress', icon: ChartNoAxesColumnIncreasing },
]

export const settingsNavigation: NavigationItem = { id: 'settings', label: uiCopy.navigation.settings, path: '/settings', icon: Settings2 }

export const sectionDetails: Record<Exclude<SectionId, 'home' | 'settings'>, { title: string; description: string }> = {
  dictionary: { title: 'Dictionary', description: 'Look up vocabulary, readings, and meanings.' },
  kanji: { title: 'Kanji', description: 'Study characters, readings, and meanings.' },
  grammar: { title: 'Grammar', description: 'Explore Japanese grammar patterns.' },
  reading: { title: 'Reading', description: 'Practice with Japanese texts.' },
  review: { title: 'Review', description: 'Revisit saved study items.' },
  jlpt: { title: 'JLPT', description: 'Prepare by level and track your study.' },
  notebook: { title: 'Notebook', description: 'Keep words and notes together.' },
  progress: { title: 'Progress', description: 'Review your learning history.' },
}
