import { ArrowRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { Pagination, PaginationSummary } from '../../components/ui/pagination'
import { referenceDataSource } from '../../db/sources/reference-source'
import { ensureLocalDatasetReady } from '../../db/initialization'
import { pageCountFor, useListParams } from '../../lib/pagination'
import type { GrammarEntry, JlptLevel } from '../../types/domain'

const levels: (JlptLevel | '')[] = ['', 'N5', 'N4', 'N3', 'N2', 'N1']
const pageSize = 100

function readLevel(value: string | null): JlptLevel | '' { return levels.includes(value as JlptLevel) ? value as JlptLevel : '' }

export function GrammarPage() {
  const { params, page, setPage, setFilter } = useListParams()
  const jlpt = readLevel(params.get('level'))
  const debounced = (params.get('q') ?? '').trim()
  const [query, setQuery] = useState(debounced)
  const [syncedQuery, setSyncedQuery] = useState(debounced)
  // Back/forward can change `q` in the URL; mirror it into the input.
  if (syncedQuery !== debounced) { setSyncedQuery(debounced); setQuery(debounced) }
  const [entries, setEntries] = useState<GrammarEntry[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    const next = query.trim()
    if (next === debounced) return
    const timer = window.setTimeout(() => setFilter('q', next, { replace: true }), 160)
    return () => window.clearTimeout(timer)
  }, [query, debounced, setFilter])
  useEffect(() => {
    let live = true
    setLoading(true); setError(false)
    void ensureLocalDatasetReady().then(() => referenceDataSource.grammar.search(debounced, { jlptLevel: jlpt || null, limit: pageSize, offset: (page - 1) * pageSize })).then((result) => {
      if (!live) return
      if (!result.items.length && result.total > 0 && page > 1) { setPage(pageCountFor(result.total, pageSize), { replace: true }); return }
      setEntries(result.items); setTotal(result.total); setHasMore(result.hasMore); setTruncated(result.truncated)
    }).catch(() => { if (live) setError(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [debounced, jlpt, page, setPage])
  const pageCount = Math.max(pageCountFor(total, pageSize), hasMore ? page + 1 : page)
  return <div className="content-browser grammar-page">
    <PageHeader eyebrow="REFERENCE" title="Grammar" description="Browse Japanese patterns, meanings, and examples." />
    <div className="content-controls"><label className="content-search"><Search size={17} aria-hidden="true"/><span className="sr-only">Search grammar</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pattern or meaning" aria-label="Search grammar patterns and meanings" /></label><label className="content-filter"><span>JLPT level</span><select value={jlpt} onChange={(event) => setFilter('level', event.target.value)}>{levels.map((level) => <option key={level || 'all'} value={level}>{level || 'All levels'}</option>)}</select></label></div>
    {loading && !entries.length && <p className="content-state" role="status">Loading grammar…</p>}{error && <EmptyState title="Grammar could not be loaded" description="The local grammar data could not be reached. Please try again." />}
    {!loading && !error && entries.length === 0 && <EmptyState title={debounced || jlpt ? 'No grammar found' : 'No grammar data available'} description={debounced || jlpt ? 'Try another pattern, meaning, or JLPT level.' : 'Grammar data will appear here after the offline dataset is installed.'} />}
    {!error && entries.length > 0 && <><p className="content-result-count" role="status"><PaginationSummary page={page} pageSize={pageSize} total={total} shown={entries.length} noun="patterns" />{truncated ? ' (search results are capped)' : ''}{loading ? ' · Loading…' : ''}</p><ul className="grammar-result-list" aria-busy={loading}>{entries.map((entry) => <li key={entry.id}><Link to={`/grammar/${encodeURIComponent(entry.id)}`} className="grammar-result-row"><span className="grammar-result-copy"><strong lang="ja">{entry.pattern}</strong><span>{entry.meaningVi[0] ?? entry.meaningEn[0] ?? 'Meaning unavailable'}</span>{entry.formation[0] && <small>{entry.formation[0]}</small>}</span>{entry.jlptLevel && <span className="content-level-badge">{entry.jlptLevel}</span>}<ArrowRight size={16} aria-hidden="true" /></Link></li>)}</ul><Pagination page={page} pageCount={pageCount} onChange={setPage} label="Grammar pages" /></>}
    <p className="content-subtle grammar-dataset-note">Production grammar comes from OpenJLPT's curated subset (about 20 patterns per level). It is reference material, not a complete official grammar list.</p>
  </div>
}
