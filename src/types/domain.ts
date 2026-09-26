export type ItemType = 'word' | 'kanji' | 'grammar'
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'
export type StudyStatus = 'unseen' | 'learning' | 'known' | 'suspended'
export type SrsState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended'

export interface DictionaryEntry {
  id: string
  datasetVersion: string
  word: string
  reading: string
  normalizedWord: string
  normalizedReading: string
  meanings: { vi: string[]; en: string[] }
  normalizedMeaningVi: string[]
  normalizedMeaningEn: string[]
  partsOfSpeech: string[]
  jlptLevel: JlptLevel | null
  isCommon: boolean | null
  frequencyRank: number | null
  kanjiIds: string[]
  /** Version-scoped keys for indexed reverse lookup from a kanji character. */
  kanjiLookupKeys?: string[]
  exampleSentenceIds: string[]
  tags: string[]
}

export type DictionarySearchLanguage = 'vi' | 'en'
export interface DictionarySearchTerm {
  datasetVersion: string
  entryId: string
  viPhraseKeys: string[]
  viTokenKeys: string[]
  enPhraseKeys: string[]
  enTokenKeys: string[]
}

export interface KanjiEntry {
  id: string
  datasetVersion: string
  character: string
  meanings: { vi: string[]; en: string[] }
  onyomi: string[]
  kunyomi: string[]
  strokeCount: number | null
  radical: string | null
  radicalName: string | null
  jlptLevel: JlptLevel | null
  grade: number | null
  frequencyRank: number | null
  commonCompounds: string[]
  tags: string[]
  /** Version-scoped normalized character, meaning, and reading keys. */
  searchKeys?: string[]
}

export interface GrammarEntry {
  id: string
  datasetVersion: string
  pattern: string
  normalizedPattern: string
  meaningVi: string[]
  meaningEn: string[]
  jlptLevel: JlptLevel | null
  formation: string[]
  explanationVi: string | null
  explanationEn: string | null
  exampleSentenceIds: string[]
  notes: string[]
  tags: string[]
}

export interface ExampleSentence {
  id: string
  datasetVersion: string
  japanese: string
  reading: string | null
  translationVi: string | null
  translationEn: string | null
  source: string | null
  tags: string[]
}

export interface Notebook {
  id: string; name: string; createdAt: number; updatedAt: number; sortOrder: number; isSystem: boolean
}
export interface NotebookItem {
  id: string; notebookId: string; itemType: ItemType; itemId: string; createdAt: number; note?: string
}
export interface StudyState {
  id: string; itemType: ItemType; itemId: string; status: StudyStatus; firstSeenAt: number | null; lastSeenAt: number | null; updatedAt: number
}
export interface SrsCard {
  id: string; itemType: ItemType; itemId: string; cardType: string; createdAt: number; lastReviewedAt: number | null; nextReviewAt: number | null; interval: number; easeFactor: number; repetitions: number; lapses: number; state: SrsState
}
export interface ReviewLog {
  id: string; cardId: string; reviewedAt: number; rating: number; previousInterval: number | null; newInterval: number; durationMs?: number
}
export interface SearchHistory {
  id: string; query: string; normalizedQuery: string; searchedAt: number; resultCount?: number
}
export interface UserSettings {
  key: string; value: unknown; updatedAt: number
}
