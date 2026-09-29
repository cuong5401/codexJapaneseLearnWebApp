import { ReferenceAttribution } from './ReferenceAttribution'
import { preferredMeaning, secondaryMeaning } from '../../lib/display-meaning'
import { BookOpen, Clock3, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { SearchHistoryRepository } from '../../db/repositories/user-data'
import { CustomWordRepository } from '../../db/repositories/custom-words'
import type { CustomWord, ExternalDictionaryEntry, SearchHistory } from '../../types/domain'
import { normalizeSearchInput } from '../../lib/search-normalization'
import { SEARCH_PAGE_SIZE, type DictionarySearchPage } from './search/search-service'
import { referenceDataSource } from '../../db/sources/reference-source'
import { OnlineLookupError } from './online-provider'
import { onlineLookupService } from './online-lookup-service'

const historyRepository = new SearchHistoryRepository()
const customWordsRepository = new CustomWordRepository()

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
      const page = await referenceDataSource.dictionary.search(query, { offset, limit: SEARCH_PAGE_SIZE, signal: controller.signal })
      if (request !== generation.current) return
      setSavedResults((current) => ({ query, page: append && current?.query === query ? { ...page, items: [...current.page.items, ...page.items] } : page }))
    } catch (cause) {
      if (request === generation.current && !(cause instanceof DOMException && cause.name === 'AbortError')) setError(true)
    } finally { if (request === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    if (!initialQuery.trim()) { setSavedResults(null); setLoading(false); return }
    const timer = window.setTimeout(() => void search(initialQuery), 180)
    return () => { window.clearTimeout(timer); generation.current += 1 }
  }, [initialQuery, search])
  const loadMore = () => results?.hasMore && results.items.length < 120 ? search(initialQuery, results.items.length, true) : undefined
  return { results, loading, error, loadMore }
}

function failureMessage(error: unknown): string {
  if (!(error instanceof OnlineLookupError)) return 'The online dictionary could not be reached. Try again or add the word manually.'
  switch (error.kind) {
    case 'offline': return 'There is no internet connection. Add this word manually or try again when online.'
    case 'timeout': return 'The online dictionary did not respond. Try again or add the word manually.'
    case 'no-result': case 'not-found': return 'No online result was found. You can add this word manually.'
    case 'rate-limited': return 'Wiktionary is receiving too many requests. Try again later or add the word manually.'
    case 'provider-unavailable': return 'Wiktionary is temporarily unavailable. Try again later or add the word manually.'
    default: return 'The online dictionary could not be reached. Try again or add the word manually.'
  }
}

export function DictionaryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [input, setInput] = useState(query)
  const [history, setHistory] = useState<SearchHistory[]>([])
  const [customResults, setCustomResults] = useState<CustomWord[]>([])
  const [customLoading, setCustomLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [onlineResults, setOnlineResults] = useState<ExternalDictionaryEntry[]>([])
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'error' | 'empty' | 'ready'>('idle')
  const [onlineError, setOnlineError] = useState('')
  const [savedOnline, setSavedOnline] = useState<Record<string, { id: string; created: boolean }>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const onlineController = useRef<AbortController | null>(null)
  const onlineGeneration = useRef(0)
  const navigate = useNavigate()
  const { results, loading, error, loadMore } = useDictionaryQuery(query)
  const suggestions = results?.items.slice(0, 8) ?? []
  const hasLocalResults = Boolean(results?.items.length || customResults.length)

  useEffect(() => { setInput(query) }, [query])
  useEffect(() => {
    onlineController.current?.abort(); onlineController.current = null; onlineGeneration.current += 1
    setOnlineState('idle'); setOnlineResults([]); setOnlineError(''); setSavedOnline({})
    if (!query.trim()) { setCustomResults([]); setCustomLoading(false); return }
    setCustomLoading(true)
    let live = true
    void customWordsRepository.searchLocal(query).then((words) => { if (live) setCustomResults(words) }).catch(() => { if (live) setCustomResults([]) }).finally(() => { if (live) setCustomLoading(false) })
    return () => { live = false }
  }, [query])
  useEffect(() => () => { onlineController.current?.abort(); onlineGeneration.current += 1 }, [])
  useEffect(() => { void historyRepository.list(8).then(setHistory).catch(() => setHistory([])) }, [query, results])
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const editing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if ((event.key === '/' && !editing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) { event.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const commit = async (value: string, resultCount = (results?.total ?? 0) + customResults.length) => {
    const trimmed = value.trim()
    if (!trimmed) return
    await historyRepository.record(trimmed, normalizeSearchInput(trimmed), resultCount).catch(() => undefined)
    setHistory(await historyRepository.list(8).catch(() => []))
  }
  const chooseResult = (id: string) => { void commit(query); navigate(`/dictionary/${encodeURIComponent(id)}`) }
  const lookupOnline = async () => {
    if (!query.trim()) return
    onlineController.current?.abort()
    const controller = new AbortController()
    onlineController.current = controller
    const generation = ++onlineGeneration.current
    setOnlineState('loading'); setOnlineError(''); setOnlineResults([])
    try {
      const entries = await onlineLookupService.search(query, { signal: controller.signal })
      if (generation !== onlineGeneration.current) return
      setOnlineResults(entries); setOnlineState('ready')
      void commit(query, (results?.total ?? 0) + customResults.length + entries.length)
    } catch (cause) {
      if (generation !== onlineGeneration.current || (cause instanceof DOMException && cause.name === 'AbortError')) return
      setOnlineError(failureMessage(cause)); setOnlineState(cause instanceof OnlineLookupError && (cause.kind === 'no-result' || cause.kind === 'not-found') ? 'empty' : 'error')
    }
  }
  const saveOnline = async (entry: ExternalDictionaryEntry) => {
    const identity = `${entry.word}\u001f${entry.reading}`
    try {
      const saved = await customWordsRepository.saveExternalWithResult(entry)
      setSavedOnline((current) => ({ ...current, [identity]: { id: saved.word.id, created: saved.created } }))
      setCustomResults((current) => current.some((item) => item.id === saved.word.id) ? current : [saved.word, ...current])
    } catch { setOnlineError('This word could not be saved. Please try again.') }
  }

  return <div className="dictionary-page">
    <PageHeader eyebrow="OFFLINE REFERENCE" title="Dictionary" description="Search Japanese words, readings, romaji, and Vietnamese or English meanings." />
    <div className="dictionary-search-wrap"><div className="dictionary-searchbar"><Search size={19} aria-hidden="true" />
      <Input ref={inputRef} className="dictionary-search-input" type="text" role="combobox" aria-label="Search the Japanese dictionary" aria-autocomplete="list" aria-expanded={suggestions.length > 0 && !!query} aria-controls="dictionary-results" aria-activedescendant={activeIndex >= 0 ? `dictionary-option-${activeIndex}` : undefined} placeholder="Japanese, romaji, Vietnamese, English…" value={input}
        onChange={(event) => { setInput(event.target.value); setActiveIndex(-1); const value = event.target.value.trim(); setSearchParams(value ? { q: value } : {}, { replace: true }) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % suggestions.length) }
          else if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setActiveIndex((index) => index <= 0 ? suggestions.length - 1 : index - 1) }
          else if (event.key === 'Escape') { setInput(''); setSearchParams({}, { replace: true }); setActiveIndex(-1) }
          else if (event.key === 'Enter') { event.preventDefault(); if (activeIndex >= 0 && suggestions[activeIndex]) chooseResult(suggestions[activeIndex]!.id); else void commit(input) }
        }} />
      {input ? <button className="dictionary-clear" type="button" aria-label="Clear search" onClick={() => { setInput(''); setSearchParams({}, { replace: true }); inputRef.current?.focus() }}><X size={17} /></button> : <kbd className="search-shortcut">/</kbd>}
    </div>{query && <p className="dictionary-search-hint">Search updates as you type · Press Enter to save this search</p>}</div>

    {!query ? <section className="dictionary-empty" aria-label="Recent searches">
      {history.length ? <><div className="dictionary-section-heading"><span className="dictionary-section-icon"><Clock3 size={16} /></span><div><h2>Recent searches</h2><p>Stored on this device</p></div><button type="button" className="text-button" onClick={() => { void historyRepository.clear().then(() => setHistory([])) }}>Clear</button></div>
        <div className="recent-query-list">{history.map((item) => <button type="button" className="recent-query" key={item.id} onClick={() => { setInput(item.query); setSearchParams({ q: item.query }) }}><Clock3 size={14} /><span>{item.query}</span><span className="recent-query-arrow">→</span></button>)}</div></>
        : <div className="dictionary-welcome"><span className="dictionary-welcome-icon"><BookOpen size={20} /></span><h2>Your offline dictionary</h2><p>Look up a word in Japanese, type a reading in romaji, or search its Vietnamese or English meaning.</p><div className="dictionary-examples"><span>Try a word</span><button type="button" onClick={() => { setInput('suisen'); setSearchParams({ q: 'suisen' }) }}>suisen</button><button type="button" onClick={() => { setInput('改善'); setSearchParams({ q: '改善' }) }}>改善</button><button type="button" onClick={() => { setInput('improvement'); setSearchParams({ q: 'improvement' }) }}>improvement</button></div></div>}
    </section> : <section className="dictionary-results" aria-label="Search results">
      <div className="dictionary-results-heading"><div><h2>{loading && !results ? 'Searching…' : error ? 'Search unavailable' : (results?.total ?? 0) + customResults.length ? `${(results?.total ?? 0) + customResults.length} results` : 'Search results'}</h2><p>{(results?.total ?? 0) + customResults.length ? <>for <strong>{query}</strong></> : error ? 'The local database could not be reached. Try again.' : loading ? 'Searching your offline dictionary' : `No matches for “${query}”`}</p></div><span className="dictionary-results-count">{(results?.items.length ?? 0) + customResults.length} shown</span></div>
      {error ? <div className="dictionary-message">Your dictionary is not ready yet. Check the local database and try again.</div> : <>
        {customResults.length > 0 && <div className="dictionary-custom-results"><div className="dictionary-online-heading"><span>MY VOCABULARY</span><span>Saved on this device</span></div><div className="dictionary-result-list">{customResults.map((entry) => <Link to={`/my-vocabulary/custom/${encodeURIComponent(entry.id)}`} onClick={() => void commit(query)} className="dictionary-result" key={entry.id}>
          <span className="dictionary-result-main"><strong lang="ja">{entry.word}</strong><span lang="ja">{entry.reading}</span></span><span className="dictionary-result-meanings"><span className="dictionary-result-vi">{entry.meaningsVi[0] ?? entry.meaningsEn[0] ?? 'No meaning added yet'}</span>{entry.meaningsVi[0] && entry.meaningsEn[0] && <span className="dictionary-result-en">{entry.meaningsEn[0]}</span>}</span><span className="dictionary-result-meta">{entry.sourceType === 'online' ? 'Online saved' : 'Custom word'}</span>
        </Link>)}</div></div>}
        {results?.items.length ? <><div className="dictionary-result-list" id="dictionary-results" role="listbox" aria-label="Dictionary suggestions">{results.items.map((entry, index) => <Link id={`dictionary-option-${index}`} role="option" aria-selected={activeIndex === index} to={`/dictionary/${encodeURIComponent(entry.id)}`} onClick={() => void commit(query)} className={`dictionary-result${activeIndex === index ? ' is-active' : ''}`} key={entry.id}>
          <span className="dictionary-result-main"><strong lang="ja">{entry.word}</strong><span lang="ja">{entry.reading}</span></span><span className="dictionary-result-meanings"><span className="dictionary-result-vi">{preferredMeaning(entry.meanings) ?? ''}</span>{secondaryMeaning(entry.meanings) && <span className="dictionary-result-en">{secondaryMeaning(entry.meanings)}</span>}</span><span className="dictionary-result-meta">{entry.partsOfSpeech[0] && <span>{entry.partsOfSpeech[0]}</span>}{entry.jlptLevel && <Badge>{entry.jlptLevel}</Badge>}{entry.isCommon && <Badge tone="primary">Common</Badge>}</span>
        </Link>)}</div>{results.hasMore && results.items.length < 120 && <div className="dictionary-load-more"><Button variant="secondary" onClick={() => void loadMore()} disabled={loading}>{loading ? 'Loading…' : 'Show more results'}</Button><span>Showing {results.items.length} of up to {results.total}</span></div>}</> : null}
        {!loading && !customLoading && !hasLocalResults && <div className="dictionary-no-results"><Search size={18} /><strong>No result in the dictionary.</strong><p>Search Wiktionary for this term, or add it to My Vocabulary yourself.</p>{(onlineState === 'idle' || onlineState === 'loading') && <div className="dictionary-online-actions"><Button type="button" onClick={() => void lookupOnline()} disabled={onlineState === 'loading'}>{onlineState === 'loading' ? 'Searching Wiktionary…' : 'Search online'}</Button><Button type="button" variant="secondary" asChild><Link to={`/my-vocabulary/new?word=${encodeURIComponent(query)}`}>Add manually</Link></Button></div>}</div>}
        {onlineState === 'loading' && <p className="dictionary-online-status" role="status">Searching Wiktionary…</p>}
        {(onlineState === 'error' || onlineState === 'empty') && <div className="dictionary-online-error" role="status"><p>{onlineError || 'No online result was found. You can add this word manually.'}</p><Button type="button" variant="secondary" onClick={() => void lookupOnline()}>Retry</Button><Button type="button" variant="ghost" asChild><Link to={`/my-vocabulary/new?word=${encodeURIComponent(query)}`}>Add manually</Link></Button></div>}
        {onlineResults.length > 0 && <section className="dictionary-online-results" aria-label="Online dictionary results"><div className="dictionary-online-heading"><span>ONLINE RESULT</span><span>Wiktionary · English definitions</span></div>{onlineResults.map((entry) => {
          const identity = `${entry.word}\u001f${entry.reading}`
          const saved = savedOnline[identity]
          return <article className="dictionary-online-entry" key={`${entry.sourceProvider}:${identity}`}><div className="dictionary-online-word"><strong lang="ja">{entry.word}</strong>{entry.reading && <span lang="ja">{entry.reading}</span>}</div>{entry.partsOfSpeech.length > 0 && <p className="dictionary-online-pos">{entry.partsOfSpeech.join(' · ')}</p>}{entry.meaningsEn.length > 0 && <ul className="dictionary-online-meanings">{entry.meaningsEn.slice(0, 8).map((meaning) => <li key={meaning}>{meaning}</li>)}</ul>}{entry.meaningsVi.length > 0 && <p>{entry.meaningsVi.slice(0, 4).join('; ')}</p>}{entry.examples.slice(0, 3).map((example, index) => <p className="dictionary-online-example" lang="ja" key={`${index}-${example.japanese}`}>{example.japanese}</p>)}<div className="dictionary-online-footer"><span>Source: Wiktionary · CC BY-SA</span>{entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>}</div><div className="dictionary-online-save">{saved ? <><span role="status">{saved.created ? 'Saved to My Vocabulary' : 'Already in My Vocabulary'}</span><Link to={`/my-vocabulary/custom/${encodeURIComponent(saved.id)}`}>View or edit</Link></> : <Button type="button" variant="secondary" onClick={() => void saveOnline(entry)}>Save to My Vocabulary</Button>}</div></article>
        })}</section>}
      </>}
    </section>}
    <ReferenceAttribution />
  </div>
}
