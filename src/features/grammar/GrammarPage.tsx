import { ArrowRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { GrammarRepository } from '../../db/repositories/reference'
import { ensureLocalDatasetReady } from '../../db/initialization'
import type { GrammarEntry, JlptLevel } from '../../types/domain'

const repository = new GrammarRepository()
const levels: (JlptLevel | '')[] = ['', 'N5', 'N4', 'N3', 'N2', 'N1']
const pageSize = 50
const maxVisible = 500

export function GrammarPage() {
  const [query, setQuery] = useState('')
  const [jlpt, setJlpt] = useState<JlptLevel | ''>('')
  const [debounced, setDebounced] = useState('')
  const [entries, setEntries] = useState<GrammarEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 160); return () => window.clearTimeout(timer) }, [query])
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
  return <div className="content-browser grammar-page">
    <PageHeader eyebrow="REFERENCE" title="Grammar" description="Browse Japanese patterns, meanings, and examples." />
    <div className="content-controls"><label className="content-search"><Search size={17} aria-hidden="true"/><span className="sr-only">Search grammar</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pattern or meaning" aria-label="Search grammar patterns and meanings" /></label><label className="content-filter"><span>JLPT level</span><select value={jlpt} onChange={(event) => setJlpt(event.target.value as JlptLevel | '')}>{levels.map((level) => <option key={level || 'all'} value={level}>{level || 'All levels'}</option>)}</select></label></div>
    {loading && <p className="content-state" role="status">Loading grammar…</p>}{error && <EmptyState title="Grammar could not be loaded" description="The local grammar data could not be reached. Please try again." />}
    {!loading && !error && entries.length === 0 && <EmptyState title={query || jlpt ? 'No grammar found' : 'No grammar data available'} description={query || jlpt ? 'Try another pattern, meaning, or JLPT level.' : 'Grammar data will appear here after the offline dataset is installed.'} />}
    {!loading && !error && entries.length > 0 && <><p className="content-result-count">Showing {entries.length}{hasMore ? '+' : ''} patterns{truncated ? ' (search results are capped)' : ''}</p><ul className="grammar-result-list">{entries.map((entry) => <li key={entry.id}><Link to={`/grammar/${encodeURIComponent(entry.id)}`} className="grammar-result-row"><span className="grammar-result-copy"><strong lang="ja">{entry.pattern}</strong><span>{entry.meaningVi[0] ?? entry.meaningEn[0] ?? 'Meaning unavailable'}</span>{entry.formation[0] && <small>{entry.formation[0]}</small>}</span>{entry.jlptLevel && <span className="content-level-badge">{entry.jlptLevel}</span>}<ArrowRight size={16} aria-hidden="true" /></Link></li>)}</ul>{hasMore && entries.length < maxVisible && <div className="content-load-more"><Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more grammar'}</Button></div>}</>}
  </div>
}
