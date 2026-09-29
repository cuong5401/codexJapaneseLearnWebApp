import type { DictionaryEntry, ExampleSentence, GrammarEntry, JlptLevel, KanjiEntry, ReferenceOrigin } from '../../types/domain'
import type { DictionarySearchPage } from '../repositories/dictionary-search'
import { DictionaryRepository, ExampleSentenceRepository, GrammarRepository, KanjiRepository } from '../repositories/reference'
import { dictionarySearchService } from '../repositories/dictionary-search'
import { StaticReferenceDataSource } from './static-reference-source'
export { StaticDictionarySource, StaticReferenceDataSource } from './static-reference-source'

export interface DictionaryReferenceSource {
  getById(id: string): Promise<DictionaryEntry | undefined>
  getByExactWord(word: string): Promise<DictionaryEntry | undefined>
  getByExactReading(reading: string): Promise<DictionaryEntry | undefined>
  getByJlptLevel(level: JlptLevel, options?: { limit?: number; offset?: number }): ReturnType<DictionaryRepository['getByJlptLevel']>
  countByJlptLevel?(level: JlptLevel): Promise<number>
  /** Stable IDs tagged with a level, for bounded membership checks without record lookups. */
  idsByJlptLevel?(level: JlptLevel): Promise<string[]>
  getPrefix(prefix: string, options?: { limit?: number }): Promise<DictionaryEntry[]>
  getByKanji(character: string, options?: { limit?: number }): Promise<DictionaryEntry[]>
  count(): Promise<number>
  search(query: string, options?: { limit?: number; offset?: number; signal?: AbortSignal }): Promise<DictionarySearchPage & { origin: ReferenceOrigin }>
}

export interface KanjiReferenceSource {
  getById(id: string): Promise<KanjiEntry | undefined>
  getByCharacter(character: string): Promise<KanjiEntry | undefined>
  getByJlptLevel(level: JlptLevel, options?: { limit?: number; offset?: number }): ReturnType<KanjiRepository['getByJlptLevel']>
  countByJlptLevel?(level: JlptLevel): Promise<number>
  /** Stable IDs tagged with a level, for bounded membership checks without record lookups. */
  idsByJlptLevel?(level: JlptLevel): Promise<string[]>
  search(query?: string, options?: { jlptLevel?: JlptLevel | null; limit?: number; offset?: number }): ReturnType<KanjiRepository['search']>
  count(): Promise<number>
}

export interface GrammarReferenceSource {
  getById(id: string): Promise<GrammarEntry | undefined>
  getByPattern(pattern: string): Promise<GrammarEntry | undefined>
  getByJlptLevel(level: JlptLevel, options?: { limit?: number; offset?: number }): ReturnType<GrammarRepository['getByJlptLevel']>
  countByJlptLevel?(level: JlptLevel): Promise<number>
  /** Stable IDs tagged with a level, for bounded membership checks without record lookups. */
  idsByJlptLevel?(level: JlptLevel): Promise<string[]>
  search(query?: string, options?: { jlptLevel?: JlptLevel | null; limit?: number; offset?: number }): ReturnType<GrammarRepository['search']>
  count(): Promise<number>
}

export interface ExampleSentenceReferenceSource {
  getByIds(ids: string[], options?: { limit?: number }): Promise<ExampleSentence[]>
}

export interface ReferenceDataSource {
  readonly origin: 'bundled' | 'downloaded-pack'
  readonly dictionary: DictionaryReferenceSource
  readonly kanji: KanjiReferenceSource
  readonly grammar: GrammarReferenceSource
  readonly examples: ExampleSentenceReferenceSource
}

/** Production data can replace this object without changing feature screens. */
export class IndexedDbReferenceSource implements ReferenceDataSource {
  readonly dictionary: DictionaryReferenceSource
  readonly kanji = new KanjiRepository()
  readonly grammar = new GrammarRepository()
  readonly examples = new ExampleSentenceRepository()
  constructor(readonly origin: 'bundled' | 'downloaded-pack' = 'bundled') {
    const repository = new DictionaryRepository()
    this.dictionary = Object.assign(repository, {
      search: async (query: string, options?: { limit?: number; offset?: number; signal?: AbortSignal }) => ({
        ...await dictionarySearchService.search(query, options), origin: this.origin,
      }),
    })
  }
}

export const indexedDbReferenceSource: ReferenceDataSource = new IndexedDbReferenceSource()
export const staticReferenceDataSource = new StaticReferenceDataSource()
/** Production always reads generated assets. Development can opt in to production QA. */
export const usesStaticReferenceData = !import.meta.env.DEV || import.meta.env.VITE_REFERENCE_SOURCE === 'static'

let activeReferenceDataSource: ReferenceDataSource = usesStaticReferenceData ? staticReferenceDataSource : indexedDbReferenceSource
export function configureReferenceDataSource(source: ReferenceDataSource): void { activeReferenceDataSource = source }
/** Stable facade: pages resolve the configured backing source at call time. */
export const referenceDataSource: ReferenceDataSource = {
  get origin() { return activeReferenceDataSource.origin },
  get dictionary() { return activeReferenceDataSource.dictionary },
  get kanji() { return activeReferenceDataSource.kanji },
  get grammar() { return activeReferenceDataSource.grammar },
  get examples() { return activeReferenceDataSource.examples },
}
