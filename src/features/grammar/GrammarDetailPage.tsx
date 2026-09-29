import { ExampleAttribution } from '../../components/ui/example-attribution'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { referenceDataSource } from '../../db/sources/reference-source'
import { LearningActions } from '../organization/LearningActions'
import { ensureLocalDatasetReady } from '../../db/initialization'
import type { ExampleSentence, GrammarEntry } from '../../types/domain'

export function GrammarDetailPage() {
  const { id } = useParams()
  const [entry, setEntry] = useState<GrammarEntry | null>(null)
  const [examples, setExamples] = useState<ExampleSentence[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setLoading(true); setFailed(false); setEntry(null); setExamples([])
    void (async () => {
      await ensureLocalDatasetReady()
      const found = id ? await referenceDataSource.grammar.getById(id) : undefined
      if (!live) return
      setEntry(found ?? null)
      if (!found) return
      const rows = await referenceDataSource.examples.getByIds(found.exampleSentenceIds, { limit: 8 })
      if (live) setExamples(rows)
    })().catch(() => { if (live) setFailed(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id])
  if (loading) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/grammar"><ArrowLeft size={15} /> Grammar</Link><p className="content-state" role="status">Loading grammar…</p></div>
  if (failed) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/grammar"><ArrowLeft size={15} /> Grammar</Link><EmptyState title="Grammar could not be loaded" description="The local grammar data could not be reached. Please try again." /></div>
  if (!entry) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/grammar"><ArrowLeft size={15} /> Grammar</Link><EmptyState title="Grammar pattern not found" description="This pattern is not present in the installed offline dataset." /></div>

  return <article className="content-detail-page grammar-detail-page"><Link className="dictionary-back-link" to="/grammar"><ArrowLeft size={15} /> Grammar</Link><PageHeader eyebrow="GRAMMAR PATTERN" title={entry.pattern} description={entry.meaningVi[0] ?? entry.meaningEn[0]} />
    <LearningActions itemType="grammar" itemId={entry.id} />
    {entry.jlptLevel && <div className="content-detail-meta"><Badge tone="primary">{entry.jlptLevel}</Badge></div>}
    {entry.meaningVi.length > 0 && <section className="content-section"><div className="content-section-heading"><h2>Meaning · Vietnamese</h2></div><ul className="content-meaning-list">{entry.meaningVi.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></section>}
    {entry.meaningEn.length > 0 && <section className="content-section"><div className="content-section-heading"><h2>Meaning · English</h2></div><ul className="content-meaning-list">{entry.meaningEn.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></section>}
    {entry.formation.length > 0 && <section className="content-section"><div className="content-section-heading"><h2>Formation</h2></div><ul className="content-formation-list">{entry.formation.map((formation) => <li key={formation}>{formation}</li>)}</ul></section>}
    {(entry.explanationVi || entry.explanationEn) && <section className="content-section"><div className="content-section-heading"><h2>Explanation</h2></div>{entry.explanationVi && <p>{entry.explanationVi}</p>}{entry.explanationEn && <p className={entry.explanationVi ? 'content-example-en' : undefined}>{entry.explanationEn}</p>}</section>}
    {examples.length > 0 && <section className="content-section"><div className="content-section-heading"><h2>Examples</h2></div><div className="content-example-list">{examples.map((example) => <article className="content-example" key={example.id}><p className="content-example-japanese" lang="ja">{example.japanese}</p>{example.reading && <p className="content-reading" lang="ja">{example.reading}</p>}{example.translationVi && <p>{example.translationVi}</p>}{example.translationEn && <p className={example.translationVi ? 'content-example-en' : undefined}>{example.translationEn}</p>}<ExampleAttribution example={example} /></article>)}</div></section>}
    {entry.notes.length > 0 && <section className="content-section"><div className="content-section-heading"><h2>Notes</h2></div><ul className="content-formation-list">{entry.notes.map((note) => <li key={note}>{note}</li>)}</ul></section>}
  </article>
}
