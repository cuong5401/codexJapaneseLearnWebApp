import type { DictionaryEntry, DictionarySearchLanguage, DictionarySearchTerm } from '../types/domain'
import { normalizeSearchInput, normalizeVietnamese } from './search-normalization'

const vietnameseStopWords = new Set(['va', 'cua', 'la', 'cho', 'voi', 'mot', 'nhung', 'cac', 'duoc', 'trong'])
const englishStopWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

export function normalizeMeaning(value: string, language: DictionarySearchLanguage): string {
  return language === 'vi' ? normalizeVietnamese(value) : normalizeSearchInput(value)
}

export function meaningTokens(value: string, language: DictionarySearchLanguage): string[] {
  const normalized = normalizeMeaning(value, language)
  const stopWords = language === 'vi' ? vietnameseStopWords : englishStopWords
  return [...new Set(normalized.match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((token) => token.length > 1 && !stopWords.has(token))
}

export function buildDictionarySearchIndexRecord(entry: Pick<DictionaryEntry, 'id' | 'datasetVersion' | 'meanings'>): DictionarySearchTerm {
  const versioned = (term: string) => `${entry.datasetVersion}\u001f${term}`
  const phrases = (values: string[], language: DictionarySearchLanguage) => [...new Set(values.map((value) => normalizeMeaning(value, language)).filter(Boolean).map(versioned))]
  const tokens = (values: string[], language: DictionarySearchLanguage) => [...new Set(values.flatMap((value) => meaningTokens(value, language)).map(versioned))]
  return {
    datasetVersion: entry.datasetVersion,
    entryId: entry.id,
    viPhraseKeys: phrases(entry.meanings.vi, 'vi'),
    viTokenKeys: tokens(entry.meanings.vi, 'vi'),
    enPhraseKeys: phrases(entry.meanings.en, 'en'),
    enTokenKeys: tokens(entry.meanings.en, 'en'),
  }
}
