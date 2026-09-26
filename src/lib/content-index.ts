import type { DictionaryEntry, GrammarEntry, KanjiEntry } from '../types/domain'
import { normalizeJapanese } from './japanese-normalization'
import { normalizeSearchInput, normalizeVietnamese } from './search-normalization'

const separator = '\u001f'

function versionedKeys(version: string, field: string, values: string[], level: string | null): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  return normalized.flatMap((value) => {
    const keys = [`${version}${separator}${field}${separator}*${separator}${value}`]
    if (level) keys.push(`${version}${separator}${field}${separator}${level}${separator}${value}`)
    return keys
  })
}

export function buildKanjiSearchKeys(entry: KanjiEntry): string[] {
  const version = entry.datasetVersion
  const tokens = (values: string[], normalize: (value: string) => string) => values.flatMap((value) => {
    const normalized = normalize(value)
    const words = normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1)
    const phrases = words.flatMap((_, index) => [words.slice(index, index + 2).join(' '), words.slice(index, index + 3).join(' ')].filter((phrase) => phrase.split(' ').length > 1))
    return [normalized, ...words, ...phrases]
  })
  return [...new Set([
    ...versionedKeys(version, 'c', [entry.character], entry.jlptLevel),
    ...versionedKeys(version, 'vi', tokens(entry.meanings.vi, normalizeVietnamese), entry.jlptLevel),
    ...versionedKeys(version, 'en', tokens(entry.meanings.en, normalizeSearchInput), entry.jlptLevel),
    ...versionedKeys(version, 'on', entry.onyomi.map((reading) => normalizeJapanese(reading).replaceAll('.', '')), entry.jlptLevel),
    ...versionedKeys(version, 'kun', entry.kunyomi.map((reading) => normalizeJapanese(reading).replaceAll('.', '')), entry.jlptLevel),
  ])]
}

export function buildDictionaryKanjiLookupKeys(entry: DictionaryEntry): string[] {
  return [...new Set(entry.kanjiIds.map((character) => `${entry.datasetVersion}${separator}${character}`))]
}

export function buildGrammarSearchText(entry: GrammarEntry): string[] {
  return [
    normalizeJapanese(entry.pattern),
    ...entry.meaningVi.flatMap((value) => [normalizeSearchInput(value), normalizeVietnamese(value)]),
    ...entry.meaningEn.map(normalizeSearchInput),
  ]
}

export function kanjiSearchPrefixes(version: string, query: string, level: string | null): string[] {
  const vi = normalizeVietnamese(query)
  const generic = normalizeSearchInput(query)
  const japanese = normalizeJapanese(query).replaceAll('.', '')
  const bucket = level ?? '*'
  const prefix = (field: string, value: string) => value ? `${version}${separator}${field}${separator}${bucket}${separator}${value}` : ''
  return [...new Set([
    prefix('c', generic), prefix('vi', vi), prefix('en', generic), prefix('on', japanese), prefix('kun', japanese),
  ].filter(Boolean))]
}
