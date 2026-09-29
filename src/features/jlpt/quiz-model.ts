import type { DictionaryEntry, JlptLevel, QuizQuestionType } from '../../types/domain'
import { normalizeVietnamese } from '../../lib/search-normalization'
import { normalizeJapanese } from '../../lib/japanese-normalization'

export interface QuizChoice { id: string; label: string }
export interface QuizQuestion {
  id: string
  level: JlptLevel
  questionType: QuizQuestionType
  prompt: string
  itemId: string
  choices: QuizChoice[]
  correctChoiceId: string
  entry: DictionaryEntry
}
export interface QuizGenerationOptions { level: JlptLevel; count: number; questionTypes: QuizQuestionType[]; random?: () => number }

type MeaningLanguage = 'vi' | 'en'
function keyFor(type: QuizQuestionType, value: string): string {
  return type === 'japanese-meaning' ? normalizeVietnamese(value) : normalizeJapanese(value)
}
function meaningLanguage(entry: DictionaryEntry): MeaningLanguage {
  return entry.meanings.vi.some((meaning) => meaning.trim()) ? 'vi' : 'en'
}
/** Compare individual gloss alternatives as well as full glosses, conservatively. */
function meaningKeys(entry: DictionaryEntry, language: MeaningLanguage): Set<string> {
  const meanings = language === 'en' ? [...entry.meanings.en, ...(entry.senses ?? []).flatMap((sense) => sense.meaningsEn)] : entry.meanings.vi
  return new Set(meanings.flatMap((meaning) => [meaning, ...meaning.split(/[;,/]/u)])
    .map((meaning) => normalizeVietnamese(meaning.replace(/\([^)]*\)/gu, '')).replace(/^to /u, '').trim()).filter(Boolean))
}
function overlaps(left: Set<string>, right: Set<string>): boolean {
  return [...left].some((value) => right.has(value))
}
function categoryCompatibility(left: Set<string>, right: Set<string>): number {
  if (overlaps(left, right)) return 3
  const related: Record<string, string[]> = { noun: ['pronoun', 'numeric'], adjective: ['adjectival-noun'], adverb: ['phrase'], phrase: ['adverb'] }
  if ([...left].some((category) => related[category]?.some((other) => right.has(other)))) return 2
  if ([...right].some((category) => related[category]?.some((other) => left.has(other)))) return 2
  return 1
}
function grammarCategories(entry: DictionaryEntry): Set<string> {
  return new Set(entry.partsOfSpeech.map((part) => {
    const value = part.toLocaleLowerCase()
    if (value.includes('adverb') || /^adv(?:-|$)/u.test(value)) return 'adverb'
    if (value.includes('adjective') || /^adj(?:-|$)/u.test(value)) return 'adjective'
    if (value.includes('verb') || /^(?:v[1-9]|vs|vk|vz|vi$|vt$)/u.test(value)) return 'verb'
    if (value.includes('noun') || /^n(?:-|$)/u.test(value)) return 'noun'
    return value
  }))
}
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.min(0.999999999, Math.max(0, random())) * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}
function valuesFor(entry: DictionaryEntry, type: QuizQuestionType, language = meaningLanguage(entry)): { prompt: string; answer: string } | undefined {
  const meaning = entry.meanings[language].find((value) => value.trim())
  if (type === 'japanese-meaning') return entry.word.trim() && meaning ? { prompt: entry.word, answer: meaning } : undefined
  if (type === 'meaning-japanese') return meaning && entry.word.trim() ? { prompt: meaning, answer: entry.word } : undefined
  return entry.word.trim() && entry.reading.trim() ? { prompt: entry.word, answer: entry.reading } : undefined
}
function hasAmbiguousAnswer(target: DictionaryEntry, type: QuizQuestionType, entries: DictionaryEntry[]): boolean {
  const language = meaningLanguage(target)
  const meanings = meaningKeys(target, language)
  if (type === 'meaning-japanese') {
    return !meanings.size || entries.some((entry) => entry.id !== target.id && overlaps(meanings, meaningKeys(entry, language)))
  }
  if (type === 'reading') {
    const targetWordKey = normalizeJapanese(target.word)
    const validReadings = target.forms?.readings.filter((reading) => !reading.restrictions.length || reading.restrictions.includes(target.word)).map((reading) => normalizeJapanese(reading.text)) ?? [normalizeJapanese(target.reading)]
    return targetWordKey === normalizeJapanese(target.reading) || new Set(validReadings).size > 1 || entries.some((entry) => normalizeJapanese(entry.word) === targetWordKey && normalizeJapanese(entry.reading) !== normalizeJapanese(target.reading))
  }
  return entries.some((entry) => entry.id !== target.id && normalizeJapanese(entry.word) === normalizeJapanese(target.word))
}

/** Pure and injectable-RNG question builder. Invalid or ambiguous items are skipped. */
export function generateQuizQuestions(entries: DictionaryEntry[], options: QuizGenerationOptions): QuizQuestion[] {
  const { level, questionTypes, random = Math.random } = options
  const count = Math.max(0, Math.min(30, Math.floor(options.count)))
  const sourcePool = entries.filter((entry) => (entry.jlptLevel === level || entry.jlptAssignments?.some((assignment) => assignment.level === level)) && (entry.meanings.vi.some((meaning) => meaning.trim()) || entry.meanings.en.some((meaning) => meaning.trim())))
  const uniquePool = new Map<string, DictionaryEntry>()
  for (const entry of sourcePool) {
    const key = normalizeJapanese(entry.word)
    if (key && !uniquePool.has(key)) uniquePool.set(key, entry)
  }
  const pool = [...uniquePool.values()]
  if (!count || !pool.length || !questionTypes.length) return []
  const candidates: QuizQuestion[] = []
  const seen = new Set<string>()
  for (const [entryIndex, entry] of shuffle(pool, random).entries()) {
    const type = questionTypes[entryIndex % questionTypes.length]
    const values = valuesFor(entry, type)
    if (!values || hasAmbiguousAnswer(entry, type, sourcePool)) continue
    const targetKey = keyFor(type, values.answer)
    const language = meaningLanguage(entry)
    const targetMeanings = meaningKeys(entry, language)
    const targetGrammar = grammarCategories(entry)
    const distinct = new Map<string, { label: string; categoryScore: number }>()
    for (const candidate of shuffle(pool, random)) {
      if (candidate.id === entry.id) continue
      if (type !== 'reading' && overlaps(targetMeanings, meaningKeys(candidate, language))) continue
      const value = valuesFor(candidate, type, language)?.answer
      if (!value?.trim()) continue
      const key = keyFor(type, value)
      if (key && key !== targetKey && !distinct.has(key)) distinct.set(key, { label: value, categoryScore: categoryCompatibility(targetGrammar, grammarCategories(candidate)) })
    }
    if (distinct.size < 3) continue
    const questionKey = `${entry.id}:${type}`
    if (seen.has(questionKey)) continue
    seen.add(questionKey)
    const correctChoiceId = 'choice-correct'
    const choicesByCategory = [...distinct.values()]
    const orderedCategories = [3, 2, 1].flatMap((score) => shuffle(choicesByCategory.filter((choice) => choice.categoryScore === score), random))
    const distractors = orderedCategories.slice(0, 3)
    const choices: QuizChoice[] = [
      { id: correctChoiceId, label: values.answer },
      ...shuffle(distractors, random).slice(0, 3).map(({ label }, index) => ({ id: `choice-${index + 1}`, label })),
    ]
    candidates.push({
      id: `quiz-${level}-${type}-${entry.id}`,
      level,
      questionType: type,
      prompt: values.prompt,
      itemId: entry.id,
      choices: shuffle(choices, random),
      correctChoiceId,
      entry,
    })
  }
  return candidates.slice(0, count)
}

export function isCorrectChoice(question: QuizQuestion, choiceId: string): boolean {
  return question.choices.filter((choice) => choice.id === question.correctChoiceId).length === 1 && choiceId === question.correctChoiceId
}
