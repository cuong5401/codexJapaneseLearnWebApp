import { db } from '../database'
import type { ExternalDictionaryEntry, OnlineLookupCache } from '../../types/domain'
import { normalizeSearchInput } from '../../lib/search-normalization'

export const ONLINE_CACHE_MAX_ENTRIES = 200
export const ONLINE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000

export class OnlineLookupCacheRepository {
  async get(query: string, provider: string, now = Date.now()): Promise<ExternalDictionaryEntry[] | undefined> {
    const normalizedQuery = normalizeSearchInput(query)
    const id = `${provider}:${normalizedQuery}`
    const cached = await db.onlineLookupCache.get(id)
    if (!cached) return undefined
    if (cached.expiresAt <= now || cached.fetchedAt + ONLINE_CACHE_MAX_AGE_MS <= now) {
      await db.onlineLookupCache.delete(id)
      return undefined
    }
    await db.onlineLookupCache.update(id, { lastAccessedAt: now })
    return cached.results
  }

  async put(query: string, provider: string, results: ExternalDictionaryEntry[], ttlMs: number, now = Date.now()): Promise<void> {
    const normalizedQuery = normalizeSearchInput(query)
    if (!normalizedQuery) return
    const cache: OnlineLookupCache = {
      id: `${provider}:${normalizedQuery}`, query, normalizedQuery, provider, results,
      fetchedAt: now, expiresAt: Math.min(now + Math.max(0, ttlMs), now + ONLINE_CACHE_MAX_AGE_MS), lastAccessedAt: now,
    }
    await db.onlineLookupCache.put(cache)
    await this.cleanup(now)
  }

  async cleanup(now = Date.now()): Promise<void> {
    const stale = await db.onlineLookupCache.where('expiresAt').belowOrEqual(now).primaryKeys()
    if (stale.length) await db.onlineLookupCache.bulkDelete(stale)
    const old = await db.onlineLookupCache.where('fetchedAt').belowOrEqual(now - ONLINE_CACHE_MAX_AGE_MS).primaryKeys()
    if (old.length) await db.onlineLookupCache.bulkDelete(old)
    const excess = await db.onlineLookupCache.orderBy('lastAccessedAt').reverse().offset(ONLINE_CACHE_MAX_ENTRIES).primaryKeys()
    if (excess.length) await db.onlineLookupCache.bulkDelete(excess)
  }
}

export const onlineLookupCacheRepository = new OnlineLookupCacheRepository()
