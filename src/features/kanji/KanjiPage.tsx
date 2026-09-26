import { ArrowRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { KanjiRepository } from '../../db/repositories/reference'
import { ensureLocalDatasetReady } from '../../db/initialization'
import type { JlptLevel, KanjiEntry } from '../../types/domain'

const repository = new KanjiRepository()
const levels: (JlptLevel | '')[] = ['', 'N5', 'N4', 'N3', 'N2', 'N1']
const pageSize = 50
const maxVisible = 500

export function KanjiPage() {
  const [query, setQuery] = useState('')
  const [jlpt, setJlpt] = useState<JlptLevel | ''>('')
  const [debounced, setDebounced] = useState('')
  const [entries, setEntries] = useState<KanjiEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let live = true
    setLoading(true); setError(false); setEntries([])
    void ensureLocalDatasetReady().then(() => repository.search(debounced, { jlptLevel: jlpt || null, limit: pageSize })).then((result) => {
      if (!live) return
      setEntries(result.items); setHasMore(result.hasMore); setTruncated(result.truncated)
    }).catch(() => { if (live) setError(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [debounced, jlpt])

  async function loadMore() {
    if (loadingMore || entries.length >= maxVisible) return
    setLoadingMore(true)
    try {
      const result = await repository.search(debounced, { jlptLevel: jlpt || null, limit: pageSize, offset: entries.length })
      setEntries((current) => [...current, ...result.items]); setHasMore(result.hasMore); setTruncated(result.truncated)
    } catch { setError(true) }
    finally { setLoadingMore(false) }
  }

  return <div className="content-browser kanji-page">
    <PageHeader eyebrow="REFERENCE" title="Kanji" description="Find characters by meaning, reading, or JLPT level." />
    <div className="content-controls">
      <label className="content-search"><Search size={17} aria-hidden="true"/><span className="sr-only">Search kanji</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Character, meaning, onyomi, or kunyomi" aria-label="Search kanji by character, meaning, or reading" /></label>
      <label className="content-filter"><span>JLPT level</span><select value={jlpt} onChange={(event) => setJlpt(event.target.value as JlptLevel | '')}>{levels.map((level) => <option key={level || 'all'} value={level}>{level || 'All levels'}</option>)}</select></label>
    </div>
    {loading && <p className="content-state" role="status">Loading kanji…</p>}
    {error && <EmptyState title="Kanji could not be loaded" description="The local kanji data could not be reached. Please try again." />}
    {!loading && !error && entries.length === 0 && <EmptyState title={query || jlpt ? 'No kanji found' : 'No kanji data available'} description={query || jlpt ? 'Try another character, meaning, reading, or JLPT level.' : 'Kanji data will appear here after the offline dataset is installed.'} />}
    {!loading && !error && entries.length > 0 && <>
      <p className="content-result-count">Showing {entries.length}{hasMore ? '+' : ''} characters{truncated ? ' (search results are capped)' : ''}</p>
      <ul className="kanji-result-list">{entries.map((entry) => <li key={entry.id}><Link to={`/kanji/${encodeURIComponent(entry.character)}`} className="kanji-result-row">
        <span className="kanji-result-character" lang="ja">{entry.character}</span>
        <span className="kanji-result-copy"><strong>{entry.meanings.vi[0] ?? entry.meanings.en[0] ?? 'Meaning unavailable'}</strong><span><b>On</b> {entry.onyomi.slice(0, 3).join('、') || '—'} <b>Kun</b> {entry.kunyomi.slice(0, 3).join('、') || '—'}</span></span>
        <span className="kanji-result-meta">{entry.strokeCount != null && <span>{entry.strokeCount} strokes</span>}{entry.jlptLevel && <span>{entry.jlptLevel}</span>}</span>
        <ArrowRight className="kanji-result-arrow" size={16} aria-hidden="true" />
      </Link></li>)}</ul>
      {hasMore && entries.length < maxVisible && <div className="content-load-more"><Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more kanji'}</Button></div>}
    </>}
  </div>
}
