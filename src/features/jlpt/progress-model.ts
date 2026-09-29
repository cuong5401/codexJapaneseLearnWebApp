import type { JlptLevel, StudyState } from '../../types/domain'
import type { ReferenceDataSource } from '../../db/sources/reference-source'
import { StudyRepository } from '../../db/repositories/user-data'

export type JlptCategory = 'vocabulary' | 'kanji' | 'grammar'
export interface CategoryProgress { available: number; unseen: number; learning: number; known: number; studied: number }
export type LevelProgress = Record<JlptCategory, CategoryProgress>

export function calculateCategoryProgress(available: number, learningCount: number, knownCount: number): CategoryProgress {
  const total = Math.max(0, Math.floor(available))
  const learning = Math.min(total, Math.max(0, Math.floor(learningCount)))
  const known = Math.min(total - learning, Math.max(0, Math.floor(knownCount)))
  return { available: total, learning, known, unseen: total - learning - known, studied: learning + known }
}

const PAGE_SIZE = 100
const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']
const itemType: Record<JlptCategory, StudyState['itemType']> = { vocabulary: 'reference-word', kanji: 'kanji', grammar: 'grammar' }

async function availableCount(source: ReferenceDataSource, category: JlptCategory, level: JlptLevel): Promise<number> {
  const reference = source[category === 'vocabulary' ? 'dictionary' : category]
  if (reference.countByJlptLevel) return reference.countByJlptLevel(level)
  let count = 0
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await reference.getByJlptLevel(level, { limit: PAGE_SIZE, offset })
    count += page.items.length
    if (page.items.length < PAGE_SIZE) return count
  }
}

/**
 * Level membership from the static per-level ID lists (one small cached file per level and category).
 * Returns null for sources without ID lists, which fall back to one record lookup per StudyState.
 */
async function levelMembership(source: ReferenceDataSource, category: JlptCategory, levels: JlptLevel[]): Promise<Map<JlptLevel, Set<string>> | null> {
  const ref = source[category === 'vocabulary' ? 'dictionary' : category]
  if (!ref.idsByJlptLevel) return null
  return new Map(await Promise.all(levels.map(async (level) => [level, new Set(await ref.idsByJlptLevel!(level))] as const)))
}

async function statusCounts(source: ReferenceDataSource, study: StudyRepository, category: JlptCategory, level: JlptLevel) {
  const ref = source[category === 'vocabulary' ? 'dictionary' : category]
  const membership = (await levelMembership(source, category, [level]))?.get(level)
  let learning = 0
  let known = 0
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await study.listByItemType(itemType[category], PAGE_SIZE, offset)
    if (!page.items.length) break
    const matched = await Promise.all(page.items.map(async (state) => ({
      state,
      inLevel: membership ? membership.has(state.itemId) : (await ref.getById(state.itemId))?.jlptLevel === level,
    })))
    for (const { state, inLevel } of matched) {
      if (!inLevel) continue
      if (state.status === 'learning') learning++
      else if (state.status === 'known') known++
    }
    if (page.items.length < PAGE_SIZE) break
  }
  return { learning, known }
}

export async function getCategoryProgress(source: ReferenceDataSource, study: StudyRepository, category: JlptCategory, level: JlptLevel): Promise<CategoryProgress> {
  const [available, status] = await Promise.all([
    availableCount(source, category, level),
    statusCounts(source, study, category, level),
  ])
  return calculateCategoryProgress(available, status.learning, status.known)
}

export async function getLevelProgress(source: ReferenceDataSource, study: StudyRepository, level: JlptLevel): Promise<LevelProgress> {
  const [vocabulary, kanji, grammar] = await Promise.all((['vocabulary', 'kanji', 'grammar'] as const).map((category) => getCategoryProgress(source, study, category, level)))
  return { vocabulary, kanji, grammar }
}

async function getCategoryProgressForLevels(source: ReferenceDataSource, study: StudyRepository, category: JlptCategory): Promise<Map<JlptLevel, CategoryProgress>> {
  const available = new Map(await Promise.all(LEVELS.map(async (level) => [level, await availableCount(source, category, level)] as const)))
  const counts = new Map<JlptLevel, { learning: number; known: number }>(LEVELS.map((level) => [level, { learning: 0, known: 0 }]))
  const ref = source[category === 'vocabulary' ? 'dictionary' : category]
  const membership = await levelMembership(source, category, LEVELS)
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await study.listByItemType(itemType[category], PAGE_SIZE, offset)
    if (!page.items.length) break
    const rows = await Promise.all(page.items.map(async (state) => ({
      state,
      // With ID lists, a record assigned to several levels counts in each, matching the per-level totals.
      levels: membership ? LEVELS.filter((level) => membership.get(level)!.has(state.itemId)) : [(await ref.getById(state.itemId))?.jlptLevel].filter((level): level is JlptLevel => LEVELS.includes(level as JlptLevel)),
    })))
    for (const { state, levels } of rows) {
      for (const level of levels) {
        const levelCounts = counts.get(level)!
        if (state.status === 'learning') levelCounts.learning++
        else if (state.status === 'known') levelCounts.known++
      }
    }
    if (page.items.length < PAGE_SIZE) break
  }
  return new Map(LEVELS.map((level) => [level, calculateCategoryProgress(available.get(level) ?? 0, counts.get(level)?.learning ?? 0, counts.get(level)?.known ?? 0)]))
}

/** Reads each category's StudyStates once for the five-level overview; static sources need only the 15 per-level ID lists. */
export async function getAllLevelsProgress(source: ReferenceDataSource, study: StudyRepository): Promise<Map<JlptLevel, LevelProgress>> {
  const [vocabulary, kanji, grammar] = await Promise.all((['vocabulary', 'kanji', 'grammar'] as const).map((category) => getCategoryProgressForLevels(source, study, category)))
  return new Map(LEVELS.map((level) => [level, { vocabulary: vocabulary.get(level)!, kanji: kanji.get(level)!, grammar: grammar.get(level)! }]))
}
