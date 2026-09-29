import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { referenceDataSource } from '../../db/sources/reference-source'
import { LearningActions } from '../organization/LearningActions'
import { ensureLocalDatasetReady } from '../../db/initialization'
import type { DictionaryEntry, KanjiEntry } from '../../types/domain'
import { KanjiAttribution } from './KanjiAttribution'

const WORD_STEP = 30
/** Static reverse-lookup postings keep at most 256 dictionary IDs per kanji. */
const WORD_MAX = 256

export function KanjiDetailPage() {
  const { character } = useParams()
  const [entry, setEntry] = useState<KanjiEntry | null>(null)
  const [words, setWords] = useState<DictionaryEntry[]>([])
  const [wordLimit, setWordLimit] = useState(WORD_STEP)
  const [loadingWords, setLoadingWords] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setLoading(true); setFailed(false); setEntry(null); setWords([]); setWordLimit(WORD_STEP)
    void (async () => {
      await ensureLocalDatasetReady()
      if (!character) { setEntry(null); return }
      const found = await referenceDataSource.kanji.getByCharacter(character)
      if (!live) return
      setEntry(found ?? null)
      if (found) setWords(await referenceDataSource.dictionary.getByKanji(found.character, { limit: WORD_STEP }))
    })().catch(() => { if (live) setFailed(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [character])

  async function showMoreWords() {
    if (!entry || loadingWords) return
    const next = Math.min(WORD_MAX, wordLimit + WORD_STEP * 2)
    setLoadingWords(true)
    try { setWords(await referenceDataSource.dictionary.getByKanji(entry.character, { limit: next })); setWordLimit(next) } catch { /* keep the words already shown */ } finally { setLoadingWords(false) }
  }

  if (loading) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link><p className="content-state" role="status">Loading kanji…</p></div>
  if (failed) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link><EmptyState title="Kanji could not be loaded" description="The local kanji data could not be reached. Please try again." /></div>
  if (!entry) return <div className="content-detail-page"><Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link><EmptyState title="Kanji not found" description="This character is not present in the installed offline dataset." /></div>

  return <article className="content-detail-page kanji-detail-page">
    <Link className="dictionary-back-link" to="/kanji"><ArrowLeft size={15} /> Kanji</Link>
    <PageHeader eyebrow="KANJI ENTRY" title={entry.character} description={entry.meanings.vi[0] ?? entry.meanings.en[0]} />
    <LearningActions itemType="kanji" itemId={entry.character} />
    <KanjiAttribution />
    {entry.jlptLevel && <div className="content-detail-meta"><Badge tone="primary">{entry.jlptLevel}</Badge>{entry.grade != null && <span>School grade {entry.grade}</span>}{entry.frequencyRank != null && <span>Frequency rank {entry.frequencyRank.toLocaleString()}</span>}</div>}
    <section className="content-section"><div className="content-section-heading"><h2>Meanings</h2></div>{entry.meanings.vi.length > 0 && <div className="dictionary-meaning-block"><h3>Vietnamese</h3><ul className="content-meaning-list">{entry.meanings.vi.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></div>}{entry.meanings.en.length > 0 && <div className="dictionary-meaning-block"><h3>English</h3><ul className="content-meaning-list">{entry.meanings.en.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></div>}</section>
    <section className="content-section content-reading-grid"><div><h2>音読み <span>Onyomi</span></h2><p lang="ja">{entry.onyomi.length ? entry.onyomi.join('、') : 'Not listed'}</p></div><div><h2>訓読み <span>Kunyomi</span></h2><p lang="ja">{entry.kunyomi.length ? entry.kunyomi.join('、') : 'Not listed'}</p></div></section>
    <section className="content-section"><div className="content-section-heading"><h2>Character information</h2></div><dl className="content-facts">{entry.strokeCount != null && <div><dt>Strokes</dt><dd>{entry.strokeCount}</dd></div>}{entry.radical && <div><dt>Radical</dt><dd lang="ja">{entry.radical}{entry.radicalName ? ` · ${entry.radicalName}` : ''}</dd></div>}{entry.grade != null && <div><dt>School grade</dt><dd>{entry.grade}</dd></div>}{entry.frequencyRank != null && <div><dt>Frequency rank</dt><dd>{entry.frequencyRank.toLocaleString()}</dd></div>}</dl></section>
    <section className="content-section"><div className="content-section-heading"><h2>Stroke order</h2></div><p className="content-subtle">Stroke order data is not available in the current offline dataset.</p></section>
    {entry.commonCompounds.length > 0 && <section className="content-section"><div className="content-section-heading"><h2>Common compounds</h2></div><p className="content-compounds" lang="ja">{entry.commonCompounds.join(' · ')}</p></section>}
    <section className="content-section"><div className="content-section-heading"><h2>Dictionary words containing {entry.character}</h2><span className="content-subtle">{words.length}{words.length === wordLimit ? '+' : ''} words</span></div>{words.length ? <ul className="content-word-list">{words.map((word) => <li key={word.id}><Link to={`/dictionary/${encodeURIComponent(word.id)}`}><span lang="ja">{word.word}</span><span lang="ja" className="content-reading">{word.reading}</span><span>{word.meanings.vi[0] ?? word.meanings.en[0] ?? ''}</span></Link></li>)}</ul> : <p className="content-subtle">No linked dictionary entries are available in this dataset.</p>}{words.length === wordLimit && wordLimit < WORD_MAX && <div className="content-load-more"><Button variant="secondary" disabled={loadingWords} onClick={() => void showMoreWords()}>{loadingWords ? 'Loading…' : 'Show more words'}</Button></div>}</section>
  </article>
}
