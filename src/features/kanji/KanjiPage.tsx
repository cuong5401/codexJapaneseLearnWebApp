import { ArrowRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { Pagination, PaginationSummary } from '../../components/ui/pagination'
import { referenceDataSource } from '../../db/sources/reference-source'
import { ensureLocalDatasetReady } from '../../db/initialization'
import { pageCountFor, useListParams } from '../../lib/pagination'
import type { JlptLevel, KanjiEntry } from '../../types/domain'
import { KanjiAttribution } from './KanjiAttribution'

const levels: (JlptLevel | '')[] = ['', 'N5', 'N4', 'N3', 'N2', 'N1']
const pageSize = 100

function readLevel(value: string | null): JlptLevel | '' { return levels.includes(value as JlptLevel) ? value as JlptLevel : '' }

export function KanjiPage() {
  const { params, page, setPage, setFilter } = useListParams()
  const jlpt = readLevel(params.get('level'))
  const debounced = (params.get('q') ?? '').trim()
  const [query, setQuery] = useState(debounced)
  const [syncedQuery, setSyncedQuery] = useState(debounced)
  // Back/forward can change `q` in the URL; mirror it into the input.
  if (syncedQuery !== debounced) { setSyncedQuery(debounced); setQuery(debounced) }
  const [entries, setEntries] = useState<KanjiEntry[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const next = query.trim()
    if (next === debounced) return
    const timer = window.setTimeout(() => setFilter('q', next, { replace: true }), 180)
    return () => window.clearTimeout(timer)
  }, [query, debounced, setFilter])

  useEffect(() => {
    let live = true
    setLoading(true); setError(false)
    void ensureLocalDatasetReady().then(() => referenceDataSource.kanji.search(debounced, { jlptLevel: jlpt || null, limit: pageSize, offset: (page - 1) * pageSize })).then((result) => {
      if (!live) return
      if (!result.items.length && result.total > 0 && page > 1) { setPage(pageCountFor(result.total, pageSize), { replace: true }); return }
      setEntries(result.items); setTotal(result.total); setHasMore(result.hasMore); setTruncated(result.truncated)
    }).catch(() => { if (live) setError(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [debounced, jlpt, page, setPage])

  // A development source can report an inexact total with hasMore; always allow the next page then.
  const pageCount = Math.max(pageCountFor(total, pageSize), hasMore ? page + 1 : page)
  return <div className="content-browser kanji-page">
    <PageHeader eyebrow="REFERENCE" title="Kanji" description="Find characters by meaning, reading, or JLPT level." />
    <div className="content-controls">
      <label className="content-search"><Search size={17} aria-hidden="true"/><span className="sr-only">Search kanji</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Character, meaning, onyomi, or kunyomi" aria-label="Search kanji by character, meaning, or reading" /></label>
      <label className="content-filter"><span>JLPT level</span><select value={jlpt} onChange={(event) => setFilter('level', event.target.value)}>{levels.map((level) => <option key={level || 'all'} value={level}>{level || 'All levels'}</option>)}</select></label>
    </div>
    {loading && !entries.length && <p className="content-state" role="status">Loading kanji…</p>}
    {error && <EmptyState title="Kanji could not be loaded" description="The local kanji data could not be reached. Please try again." />}
    {!loading && !error && entries.length === 0 && <EmptyState title={debounced || jlpt ? 'No kanji found' : 'No kanji data available'} description={debounced || jlpt ? 'Try another character, meaning, reading, or JLPT level.' : 'Kanji data will appear here after the offline dataset is installed.'} />}
    {!error && entries.length > 0 && <>
      <p className="content-result-count" role="status"><PaginationSummary page={page} pageSize={pageSize} total={total} shown={entries.length} noun="characters" />{truncated ? ' (search results are capped)' : ''}{loading ? ' · Loading…' : ''}</p>
      <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Kanji pages (top)" compact />
      <ul className="kanji-result-list" aria-busy={loading}>{entries.map((entry) => <li key={entry.id}><Link to={`/kanji/${encodeURIComponent(entry.character)}`} className="kanji-result-row">
        <span className="kanji-result-character" lang="ja">{entry.character}</span>
        <span className="kanji-result-copy"><strong>{entry.meanings.vi[0] ?? entry.meanings.en[0] ?? 'Meaning unavailable'}</strong><span><b>On</b> {entry.onyomi.slice(0, 3).join('、') || '—'} <b>Kun</b> {entry.kunyomi.slice(0, 3).join('、') || '—'}</span></span>
        <span className="kanji-result-meta">{entry.strokeCount != null && <span>{entry.strokeCount} strokes</span>}{entry.jlptLevel && <span>{entry.jlptLevel}</span>}</span>
        <ArrowRight className="kanji-result-arrow" size={16} aria-hidden="true" />
      </Link></li>)}</ul>
      <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Kanji pages (bottom)" />
    </>}
    <KanjiAttribution />
  </div>
}
