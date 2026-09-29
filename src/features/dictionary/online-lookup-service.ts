import type { ExternalDictionaryEntry } from '../../types/domain'
import { onlineLookupCacheRepository, type OnlineLookupCacheRepository } from '../../db/repositories/online-lookup-cache'
import { OnlineLookupError, normalizeExternalEntry, type OnlineDictionaryProvider } from './online-provider'
import { WiktionaryOnlineDictionaryProvider } from './wiktionary-provider'

export const ONLINE_LOOKUP_TIMEOUT_MS = 8_000
export const ONLINE_SUCCESS_TTL_MS = 72 * 60 * 60 * 1_000
export const ONLINE_EMPTY_TTL_MS = 4 * 60 * 60 * 1_000

let provider: OnlineDictionaryProvider = new WiktionaryOnlineDictionaryProvider()
export function configureOnlineDictionaryProvider(next: OnlineDictionaryProvider): void { provider = next }
export function getOnlineDictionaryProvider(): OnlineDictionaryProvider { return provider }

export class OnlineLookupService {
  constructor(private readonly cache: OnlineLookupCacheRepository = onlineLookupCacheRepository, private readonly getProvider = getOnlineDictionaryProvider, private readonly timeoutMs = ONLINE_LOOKUP_TIMEOUT_MS) {}

  async search(query: string, options: { signal?: AbortSignal } = {}): Promise<ExternalDictionaryEntry[]> {
    const cleaned = query.trim()
    if (!cleaned) throw new OnlineLookupError('no-result', 'No online result was found.')
    if (options.signal?.aborted) throw new DOMException('Lookup cancelled', 'AbortError')
    const selected = this.getProvider()
    const cached = await this.cache.get(cleaned, selected.id)
    if (options.signal?.aborted) throw new DOMException('Lookup cancelled', 'AbortError')
    if (cached !== undefined) return cached.length ? cached.map(normalizeExternalEntry) : this.noResult()

    const controller = new AbortController()
    let timedOut = false
    const externalAbort = () => controller.abort()
    options.signal?.addEventListener('abort', externalAbort, { once: true })
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, this.timeoutMs)
    try {
      const raw = await selected.search(cleaned, { signal: controller.signal })
      if (options.signal?.aborted) throw new DOMException('Lookup cancelled', 'AbortError')
      const results = raw.map(normalizeExternalEntry).filter((entry) => entry.word.trim())
      await this.cache.put(cleaned, selected.id, results, results.length ? ONLINE_SUCCESS_TTL_MS : ONLINE_EMPTY_TTL_MS)
      if (!results.length) return this.noResult()
      return results
    } catch (cause) {
      if (options.signal?.aborted) throw new DOMException('Lookup cancelled', 'AbortError')
      if (timedOut) throw new OnlineLookupError('timeout', 'The online dictionary did not respond in time.', { cause })
      if (cause instanceof OnlineLookupError && cause.kind === 'not-found') {
        await this.cache.put(cleaned, selected.id, [], ONLINE_EMPTY_TTL_MS)
        throw cause
      }
      if (cause instanceof OnlineLookupError) throw cause
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new OnlineLookupError('offline', 'There is no internet connection.', { cause })
      if (cause instanceof TypeError) throw new OnlineLookupError('cors-or-network', 'The online dictionary could not be reached.', { cause })
      throw new OnlineLookupError('unknown', 'The online dictionary returned an unexpected error.', { cause })
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', externalAbort)
    }
  }

  async lookup(word: string, options: { signal?: AbortSignal } = {}): Promise<ExternalDictionaryEntry | undefined> {
    try { return (await this.search(word, options))[0] }
    catch (cause) { if (cause instanceof OnlineLookupError && cause.kind === 'no-result') return undefined; throw cause }
  }

  private noResult(): never { throw new OnlineLookupError('no-result', 'No online result was found.') }
}

export const onlineLookupService = new OnlineLookupService()
