import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Reads a 1-based `page` search parameter; anything invalid is page 1. */
export function readPageParam(params: URLSearchParams): number {
  const value = Number(params.get('page'))
  return Number.isInteger(value) && value >= 1 ? value : 1
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize))
}

/**
 * Keeps list state (page and filters) in the hash URL so refresh and back/forward restore it.
 * Changing any filter resets the page. Page changes push a history entry; filter typing replaces it.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams()
  const page = readPageParam(params)
  const update = useCallback((changes: Record<string, string | number | null>, options: { replace?: boolean } = {}) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || (key === 'page' && Number(value) <= 1)) next.delete(key)
        else next.set(key, String(value))
      }
      return next
    }, { replace: options.replace })
  }, [setParams])
  const setPage = useCallback((next: number, options: { replace?: boolean } = {}) => {
    update({ page: next }, options)
    document.querySelector('.main-content')?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [update])
  const setFilter = useCallback((key: string, value: string, options: { replace?: boolean } = {}) => update({ [key]: value, page: null }, options), [update])
  return { params, page, setPage, setFilter }
}
