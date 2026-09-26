import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { DictionaryRepository, KanjiRepository } from '../../db/repositories/reference'
import { ensureLocalDatasetReady } from '../../db/initialization'
import type { DictionaryEntry, KanjiEntry } from '../../types/domain'

const kanjiRepository = new KanjiRepository()
const dictionaryRepository = new DictionaryRepository()

export function KanjiDetailPage() {
  const { character } = useParams()
  const [entry, setEntry] = useState<KanjiEntry | null>(null)
  const [words, setWords] = useState<DictionaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setLoading(true); setFailed(false); setEntry(null); setWords([])
    void (async () => {
      await ensureLocalDatasetReady()
      if (!character) { setEntry(null); return }
      const found = await kanjiRepository.getByCharacter(character)
      if (!live) return
      setEntry(found ?? null)
      if (found) setWords(await dictionaryRepository.getByKanji(found.character, { limit: 30 }))
    })().catch(() => { if (live) setFailed(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [character])

  if (loading) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link><p className="content-state" role="status">Loading kanji…</p></div>
  if (failed) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link><EmptyState title="Kanji could not be loaded" description="The local kanji data could not be reached. Please try again." /></div>
  if (!entry) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link><EmptyState title="Kanji not found" description="This character is not present in the installed offline dataset." /></div>

  return <article className="content-detail-page kanji-detail-page">
    <Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link>
    <PageHeader eyebrow="KANJI ENTRY" title={entry.character} description={entry.meanings.vi[0] ?? entry.meanings.en[0]} />
    {entry.jlptLevel && <div className="content-detail-meta"><Badge tone="primary">{entry.jlptLevel}</Badge>{entry.grade != null && <span>School grade {entry.grade}</span>}{entry.frequencyRank != null && <span>Frequency rank {entry.frequencyRank.toLocaleString()}</span>}</div>}
    <section className="content-section"><div className="content-section-heading"><h2>Meanings</h2></div>{entry.meanings.vi.length > 0 && <div className="dictionary-meaning-block"><h3>Vietnamese</h3><ul className="content-meaning-list">{entry.meanings.vi.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></div>}{entry.meanings.en.length > 0 && <div className="dictionary-meaning-block"><h3>English</h3><ul className="content-meaning-list">{entry.meanings.en.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></div>}</section>
    <section className="content-section content-reading-grid"><div><h2>音読み <span>Onyomi</span></h2><p lang="ja">{entry.onyomi.length ? entry.onyomi.join('、') : 'Not listed'}</p></div><div><h2>訓読み <span>Kunyomi</span></h2><p lang="ja">{entry.kunyomi.length ? entry.kunyomi.join('、') : 'Not listed'}</p></div></section>
    <section className="content-section"><div className="content-section-heading"><h2>Character information</h2></div><dl className="content-facts">{entry.strokeCount != null && <div><dt>Strokes</dt><dd>{entry.strokeCount}</dd></div>}{entry.radical && <div><dt>Radical</dt><dd lang="ja">{entry.radical}{entry.radicalName ? ` · ${entry.radicalName}` : ''}</dd></div>}{entry.grade != null && <div><dt>School grade</dt><dd>{entry.grade}</dd></div>}{entry.frequencyRank != null && <div><dt>Frequency rank</dt><dd>{entry.frequencyRank.toLocaleString()}</dd></div>}</dl></section>
    <section className="content-section"><div className="content-section-heading"><h2>Stroke order</h2></div><p className="content-subtle">Stroke order data is not available in the current offline dataset.</p></section>
    {entry.commonCompounds.length > 0 && <section className="content-section"><div className="content-section-heading"><h2>Common compounds</h2></div><p className="content-compounds" lang="ja">{entry.commonCompounds.join(' · ')}</p></section>}
    <section className="content-section"><div className="content-section-heading"><h2>Dictionary words containing {entry.character}</h2><span className="content-subtle">Up to {words.length}{words.length === 30 ? '+' : ''}</span></div>{words.length ? <ul className="content-word-list">{words.map((word) => <li key={word.id}><Link to={`/dictionary/${encodeURIComponent(word.id)}`}><span lang="ja">{word.word}</span><span lang="ja" className="content-reading">{word.reading}</span><span>{word.meanings.vi[0] ?? word.meanings.en[0] ?? ''}</span></Link></li>)}</ul> : <p className="content-subtle">No linked dictionary entries are available in this dataset.</p>}</section>
  </article>
}
