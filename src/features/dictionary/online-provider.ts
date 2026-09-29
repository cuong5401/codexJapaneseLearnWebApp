import type { ExternalDictionaryEntry } from '../../types/domain'

export interface OnlineDictionaryProvider {
  readonly id: string
  search(query: string, options?: { signal?: AbortSignal }): Promise<ExternalDictionaryEntry[]>
  lookup(word: string, options?: { signal?: AbortSignal }): Promise<ExternalDictionaryEntry | undefined>
}

export type OnlineLookupFailureKind = 'offline' | 'timeout' | 'cors-or-network' | 'provider-unavailable' | 'rate-limited' | 'not-found' | 'invalid-response' | 'unknown' | 'no-result'
export class OnlineLookupError extends Error {
  constructor(readonly kind: OnlineLookupFailureKind, message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'OnlineLookupError'
  }
}

/** Provider adapter boundary. Provider payloads must be normalized before reaching feature UI. */
export function normalizeExternalEntry(entry: ExternalDictionaryEntry): ExternalDictionaryEntry {
  return {
    ...(entry.externalId ? { externalId: entry.externalId } : {}),
    word: entry.word, reading: entry.reading, meaningsVi: [...entry.meaningsVi], meaningsEn: [...entry.meaningsEn],
    partsOfSpeech: [...entry.partsOfSpeech], examples: entry.examples.map((example) => ({ ...example })),
    sourceProvider: entry.sourceProvider, ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : {}),
  }
}
