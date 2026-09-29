export type ItemType = 'reference-word' | 'custom-word' | 'kanji' | 'grammar'
export type ReferenceOrigin = 'bundled' | 'downloaded-pack' | 'custom' | 'online'
export type CustomWordSourceType = 'manual' | 'online'
export interface ReferenceResult<T> { record: T; origin: ReferenceOrigin }
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'
export type StudyStatus = 'unseen' | 'learning' | 'known' | 'suspended'
export type SrsState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended'

export interface SourceProvenance { datasetId: string; recordId: string }
export interface DictionarySense {
  meaningsEn: string[]
  partsOfSpeech: string[]
  writtenRestrictions: string[]
  readingRestrictions: string[]
  information: string[]
  misc: string[]
  fields: string[]
  dialects: string[]
  crossReferences: string[]
  antonyms: string[]
}

export interface DictionaryEntry {
  provenance?: SourceProvenance[]
  forms?: {
    written: Array<{ text: string; information: string[]; priority: string[] }>
    readings: Array<{ text: string; restrictions: string[]; noKanji: boolean; information: string[]; priority: string[] }>
  }
  senses?: DictionarySense[]
  jlptAssignments?: Array<{ level: JlptLevel; word: string; reading: string; sourceRecordId: string }>
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

/** User-owned vocabulary. Never mutated or removed by reference dataset updates. */
export interface CustomWord {
  id: string
  word: string
  reading: string
  /** Indexed NFKC/kana-normalized fields used for bounded offline personal-word search. */
  normalizedWord?: string
  normalizedReading?: string
  meaningsVi: string[]
  meaningsEn: string[]
  partsOfSpeech: string[]
  examples?: Array<{ japanese: string; reading?: string; translationVi?: string; translationEn?: string }>
  notes?: string
  tags?: string[]
  sourceType: CustomWordSourceType
  sourceProvider?: string
  sourceUrl?: string
  createdAt: number
  updatedAt: number
}

export interface ExternalDictionaryEntry {
  externalId?: string
  word: string
  reading: string
  meaningsVi: string[]
  meaningsEn: string[]
  partsOfSpeech: string[]
  examples: Array<{ japanese: string; reading?: string; translationVi?: string; translationEn?: string }>
  sourceProvider: string
  sourceUrl?: string
}

export interface OnlineLookupCache {
  id: string
  query: string
  normalizedQuery: string
  provider: string
  results: ExternalDictionaryEntry[]
  fetchedAt: number
  expiresAt: number
  lastAccessedAt: number
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
  provenance?: SourceProvenance[]
  jlptAssignments?: Array<{ level: JlptLevel; sourceRecordId: string }>
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
  provenance?: SourceProvenance[]
  jlptAssignments?: Array<{ level: JlptLevel; sourceRecordId: string }>
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
  provenance?: SourceProvenance[]
  attribution?: Array<{ sentenceId: string; language: string; author: string; license: string; url: string }>
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
  id: string; name: string; normalizedName?: string; createdAt: number; updatedAt: number; sortOrder: number; isSystem: boolean
}
export interface Favorite { itemType: ItemType; itemId: string; createdAt: number }
export interface SavedReferenceWord {
  entryId: string
  savedAt: number
  wordSnapshot?: string
  readingSnapshot?: string
  meaningSnapshot?: string
}
export interface NotebookItem {
  id: string; notebookId: string; itemType: ItemType; itemId: string; createdAt: number; note?: string
}
export interface StudyState {
  id: string; itemType: ItemType; itemId: string; status: StudyStatus; firstSeenAt: number | null; lastSeenAt: number | null; updatedAt: number
}
export interface SrsCard {
  id: string; itemType: ItemType; itemId: string; cardType: string; createdAt: number; lastReviewedAt: number | null; nextReviewAt: number | null; interval: number; easeFactor: number; repetitions: number; lapses: number; state: SrsState
  learningStep?: number
  suspendedAt?: number | null
  suspendedPreviousState?: SrsState
  suspendedPreviousDueAt?: number | null
  snapshotWord?: string
  snapshotReading?: string
  snapshotMeaningVi?: string
  snapshotMeaningEn?: string
}
export interface ReviewLog {
  id: string; cardId: string; reviewedAt: number; rating: number; previousInterval: number | null; newInterval: number; durationMs?: number; wasNew?: boolean
}
export interface SearchHistory {
  id: string; query: string; normalizedQuery: string; searchedAt: number; resultCount?: number
}
export interface ReadingDocument {
  id: string
  title: string
  text: string
  createdAt: number
  updatedAt: number
  sourceName?: string
  sourceUrl?: string
  notes?: string
}
export type QuizQuestionType = 'japanese-meaning' | 'meaning-japanese' | 'reading'
export interface QuizAnswerSummary {
  questionId: string
  itemId: string
  questionType: QuizQuestionType
  prompt: string
  selectedAnswer: string
  correctAnswer: string
  isCorrect: boolean
}
/** Compact user-owned history; it stores answer labels and IDs, never full reference records. */
export interface QuizAttempt {
  id: string
  jlptLevel: JlptLevel
  category: 'vocabulary'
  questionTypes: QuizQuestionType[]
  startedAt: number
  completedAt: number
  questionCount: number
  correctCount: number
  durationMs: number
  answers: QuizAnswerSummary[]
}
export interface UserSettings {
  key: string; value: unknown; updatedAt: number
}

export type PersonalVocabularySource = 'reference' | 'custom' | 'online-saved'
export interface PersonalVocabularyItem {
  itemType: 'reference-word' | 'custom-word'
  itemId: string
  source: PersonalVocabularySource
  word: string
  reading: string
  meaningsVi: string[]
  meaningsEn: string[]
  partsOfSpeech: string[]
  notes?: string
  tags: string[]
  status: StudyStatus
  favorite: boolean
  notebookIds: string[]
  savedAt: number
  updatedAt: number
  unavailable: boolean
}

export type NotebookResolvedItem =
  | { itemType: 'reference-word' | 'custom-word'; itemId: string; title: string; reading?: string; meaning?: string; status: StudyStatus; favorite: boolean; unavailable: boolean; href?: string }
  | { itemType: 'kanji' | 'grammar'; itemId: string; title: string; reading?: never; meaning?: string; status: StudyStatus; favorite: boolean; unavailable: boolean; href?: string }
