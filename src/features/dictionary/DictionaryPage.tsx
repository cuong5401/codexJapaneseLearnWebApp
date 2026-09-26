import { BookOpen, Clock3, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { SearchHistoryRepository } from '../../db/repositories/user-data'
import type { SearchHistory } from '../../types/domain'
import { normalizeSearchInput } from '../../lib/search-normalization'
import { dictionarySearchService, SEARCH_PAGE_SIZE, type DictionarySearchPage } from './search/search-service'

const historyRepository = new SearchHistoryRepository()

function useDictionaryQuery(initialQuery: string) {
  const [savedResults, setSavedResults] = useState<{ query: string; page: DictionarySearchPage } | null>(null)
  const results = savedResults?.query === initialQuery ? savedResults.page : null
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  const search = useCallback(async (query: string, offset = 0, append = false) => {
    const request = ++generation.current
    const controller = new AbortController()
    setLoading(true); setError(false)
    try {
      const page = await dictionarySearchService.search(query, { offset, limit: SEARCH_PAGE_SIZE, signal: controller.signal })
      if (request !== generation.current) return
      setSavedResults((current) => ({ query, page: append && current?.query === query ? { ...page, items: [...current.page.items, ...page.items] } : page }))
    } catch (cause) {
      if (request === generation.current && !(cause instanceof DOMException && cause.name === 'AbortError')) setError(true)
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!initialQuery.trim()) { setSavedResults(null); setLoading(false); return }
    const timer = window.setTimeout(() => void search(initialQuery), 180)
    return () => { window.clearTimeout(timer); generation.current += 1 }
  }, [initialQuery, search])
  const loadMore = () => results?.hasMore && results.items.length < 120 ? search(initialQuery, results.items.length, true) : undefined
  return { results, loading, error, loadMore }
}

function meaningLine(entry: DictionarySearchPage['items'][number]) { return entry.meanings.vi[0] ?? entry.meanings.en[0] ?? '' }

export function DictionaryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [input, setInput] = useState(query)
  const [history, setHistory] = useState<SearchHistory[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { results, loading, error, loadMore } = useDictionaryQuery(query)
  const suggestions = results?.items.slice(0, 8) ?? []

  useEffect(() => { setInput(query) }, [query])
  useEffect(() => { void historyRepository.list(8).then(setHistory).catch(() => setHistory([])) }, [query, results])
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const editing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if ((event.key === '/' && !editing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault(); inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const commit = async (value: string, resultCount = results?.total) => {
    const trimmed = value.trim()
    if (!trimmed) return
    await historyRepository.record(trimmed, normalizeSearchInput(trimmed), resultCount).catch(() => undefined)
    setHistory(await historyRepository.list(8).catch(() => []))
  }
  const chooseResult = (id: string) => {
    void historyRepository.record(query, normalizeSearchInput(query), results?.total)
    navigate(`/dictionary/${encodeURIComponent(id)}`)
  }

  return <div className="dictionary-page">
    <PageHeader eyebrow="OFFLINE REFERENCE" title="Dictionary" description="Search Japanese words, readings, romaji, and Vietnamese or English meanings." />
    <div className="dictionary-search-wrap">
      <div className="dictionary-searchbar">
        <Search size={19} aria-hidden="true" />
        <Input ref={inputRef} className="dictionary-search-input" type="text" role="combobox" aria-label="Search the Japanese dictionary" aria-autocomplete="list" aria-expanded={suggestions.length > 0 && !!query} aria-controls="dictionary-results" aria-activedescendant={activeIndex >= 0 ? `dictionary-option-${activeIndex}` : undefined} placeholder="Japanese, romaji, Vietnamese, English…" value={input}
          onChange={(event) => { setInput(event.target.value); setActiveIndex(-1); const value = event.target.value.trim(); setSearchParams(value ? { q: value } : {}, { replace: true }) }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % suggestions.length) }
            else if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setActiveIndex((index) => index <= 0 ? suggestions.length - 1 : index - 1) }
            else if (event.key === 'Escape') { setInput(''); setSearchParams({}, { replace: true }); setActiveIndex(-1) }
            else if (event.key === 'Enter') { event.preventDefault(); if (activeIndex >= 0 && suggestions[activeIndex]) chooseResult(suggestions[activeIndex]!.id); else void commit(input) }
          }} />
        {input ? <button className="dictionary-clear" type="button" aria-label="Clear search" onClick={() => { setInput(''); setSearchParams({}, { replace: true }); inputRef.current?.focus() }}><X size={17} /></button> : <kbd className="search-shortcut">/</kbd>}
      </div>
      {query && <p className="dictionary-search-hint">Search updates as you type <span>·</span> Press Enter to save this search</p>}
    </div>

    {!query ? <section className="dictionary-empty" aria-label="Recent searches">
      {history.length ? <><div className="dictionary-section-heading"><span className="dictionary-section-icon"><Clock3 size={16} /></span><div><h2>Recent searches</h2><p>Stored on this device</p></div><button type="button" className="text-button" onClick={() => { void historyRepository.clear().then(() => setHistory([])) }}>Clear</button></div>
        <div className="recent-query-list">{history.map((item) => <button type="button" className="recent-query" key={item.id} onClick={() => { setInput(item.query); setSearchParams({ q: item.query }) }}><Clock3 size={14} /><span>{item.query}</span><span className="recent-query-arrow">↗</span></button>)}</div></>
        : <div className="dictionary-welcome"><span className="dictionary-welcome-icon"><BookOpen size={20} /></span><h2>Your offline dictionary</h2><p>Look up a word in Japanese, type a reading in romaji, or search its Vietnamese or English meaning.</p><div className="dictionary-examples"><span>Try a word</span><button type="button" onClick={() => { setInput('suisen'); setSearchParams({ q: 'suisen' }) }}>suisen</button><button type="button" onClick={() => { setInput('cai thien'); setSearchParams({ q: 'cai thien' }) }}>cải thiện</button><button type="button" onClick={() => { setInput('improvement'); setSearchParams({ q: 'improvement' }) }}>improvement</button></div></div>}
    </section> : <section className="dictionary-results" aria-label="Search results">
      <div className="dictionary-results-heading"><div><h2>{loading && !results ? 'Searching…' : error ? 'Search unavailable' : results?.total ? `${results.total}${results.truncated ? '+' : ''} ${results.total === 1 ? 'result' : 'results'}` : 'Search results'}</h2><p>{results?.total ? <>for <strong>{query}</strong></> : error ? 'The local database could not be reached. Try searching again.' : loading ? 'Searching your offline dictionary' : `No matches for “${query}”`}</p></div><span className="dictionary-results-count">{results?.items.length ?? 0} shown</span></div>
      {error ? <div className="dictionary-message">Your dictionary is not ready yet. Check your connection to the local database and try again.</div>
        : results?.items.length ? <><div className="dictionary-result-list" id="dictionary-results" role="listbox" aria-label="Dictionary suggestions">{results.items.map((entry, index) => <Link id={`dictionary-option-${index}`} role="option" aria-selected={activeIndex === index} to={`/dictionary/${encodeURIComponent(entry.id)}`} onClick={() => void commit(query, results.total)} className={`dictionary-result${activeIndex === index ? ' is-active' : ''}`} key={entry.id}>
          <span className="dictionary-result-main"><strong lang="ja">{entry.word}</strong><span lang="ja">{entry.reading}</span></span><span className="dictionary-result-meanings"><span className="dictionary-result-vi">{meaningLine(entry)}</span>{entry.meanings.en[0] && <span className="dictionary-result-en">{entry.meanings.en[0]}</span>}</span><span className="dictionary-result-meta">{entry.partsOfSpeech[0] && <span>{entry.partsOfSpeech[0]}</span>}{entry.jlptLevel && <Badge>{entry.jlptLevel}</Badge>}{entry.isCommon && <Badge tone="primary">Common</Badge>}</span>
        </Link>)}</div>{results.hasMore && results.items.length < 120 && <div className="dictionary-load-more"><Button variant="secondary" onClick={() => void loadMore()} disabled={loading}>{loading ? 'Loading…' : 'Show more results'}</Button><span>Showing {results.items.length} of up to {results.total}</span></div>}</>
        : !loading && <div className="dictionary-no-results"><Search size={18} /><strong>No entries found</strong><p>Try another spelling, a shorter phrase, or search without accents.</p></div>}
    </section>}
  </div>
}
