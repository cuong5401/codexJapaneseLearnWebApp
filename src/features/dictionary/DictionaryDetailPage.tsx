import { ArrowLeft, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { ensureLocalDatasetReady } from '../../db/initialization'
import { referenceDataSource } from '../../db/sources/reference-source'
import { AddToReviewButton, LearningActions, SaveReferenceWordButton } from '../organization/LearningActions'
import type { DictionaryEntry, ExampleSentence, KanjiEntry } from '../../types/domain'
import { pronounceJapanese } from './speech'
import { ReferenceAttribution } from './ReferenceAttribution'
import { ExampleAttribution } from '../../components/ui/example-attribution'

export function DictionaryDetailPage() {
  const { id } = useParams()
  const [entry, setEntry] = useState<DictionaryEntry | null>(null)
  const [examples, setExamples] = useState<ExampleSentence[]>([])
  const [kanji, setKanji] = useState<KanjiEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [speechUnavailable, setSpeechUnavailable] = useState(false)

  useEffect(() => {
    let live = true
    setLoading(true); setFailed(false); setEntry(null); setExamples([]); setKanji([])
    void ensureLocalDatasetReady().then(async () => {
      const found = id ? await referenceDataSource.dictionary.getById(id) : undefined
      if (!live) return
      setEntry(found ?? null)
      if (!found) return
      const [exampleRows, kanjiRows] = await Promise.all([
        referenceDataSource.examples.getByIds(found.exampleSentenceIds, { limit: 6 }),
        Promise.all(found.kanjiIds.slice(0, 12).map((character) => referenceDataSource.kanji.getByCharacter(character))),
      ])
      if (!live) return
      setExamples(exampleRows)
      setKanji(kanjiRows.filter((row): row is KanjiEntry => !!row))
    }).catch(() => { if (live) setFailed(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id])

  if (loading) return <div className="dictionary-detail-page"><Link className="dictionary-back-link" to="/dictionary"><ArrowLeft size={15} /> Dictionary</Link><div className="dictionary-message" role="status">Loading entry…</div></div>
  if (failed) return <div className="dictionary-detail-page"><Link className="dictionary-back-link" to="/dictionary"><ArrowLeft size={15} /> Dictionary</Link><EmptyState title="Entry could not be loaded" description="The local dictionary could not be reached. Please try again." /></div>
  if (!entry) return <div className="dictionary-detail-page"><Link className="dictionary-back-link" to="/dictionary"><ArrowLeft size={15} /> Dictionary</Link><EmptyState title="Entry not found" description="This entry may belong to an older dictionary version." action={<Link to="/dictionary"><Button>Back to dictionary</Button></Link>} /></div>

  return <article className="dictionary-detail-page content-detail-page">
    <Link className="dictionary-back-link" to="/dictionary"><ArrowLeft size={15} /> Dictionary</Link>
    <PageHeader eyebrow="DICTIONARY ENTRY" title={entry.word} description={entry.reading} />
    {entry.forms && <div className="content-subtle">
      {entry.forms.written.length > 1 && <p>Written forms: <span lang="ja">{entry.forms.written.map((form) => form.text).join('、')}</span></p>}
      {entry.forms.readings.length > 1 && <p>Readings: <span lang="ja">{entry.forms.readings.map((form) => `${form.text}${form.restrictions.length ? ` (${form.restrictions.join('、')})` : ''}`).join('、')}</span></p>}
    </div>}
    <div className="content-detail-actions">
      <Button type="button" variant="secondary" aria-label={`Pronounce ${entry.word}`} onClick={() => setSpeechUnavailable(!pronounceJapanese(entry.reading))}>
        <Volume2 size={16} aria-hidden="true" /> Pronounce
      </Button>
      {speechUnavailable && <span role="status" className="content-inline-note">Speech synthesis is unavailable in this browser.</span>}
    </div>
    <div className="organization-detail-actions"><LearningActions itemType="reference-word" itemId={entry.id} showStatus /><SaveReferenceWordButton entry={entry} /><AddToReviewButton itemType="reference-word" itemId={entry.id} snapshot={{ word: entry.word, reading: entry.reading, meaningVi: entry.meanings.vi[0], meaningEn: entry.meanings.en[0] }} /></div>
    <section className="content-section" aria-labelledby="entry-meaning-title">
      <div className="content-section-heading"><h2 id="entry-meaning-title">Meaning</h2><div className="dictionary-detail-badges">{entry.partsOfSpeech.map((pos) => <Badge key={pos}>{pos}</Badge>)}{entry.jlptLevel && <Badge tone="primary">{entry.jlptLevel}</Badge>}{entry.isCommon === true && <Badge tone="success">Common</Badge>}</div></div>
      {entry.meanings.vi.length > 0 && <div className="dictionary-meaning-block"><h3>Vietnamese</h3><ul className="content-meaning-list content-primary-meaning">{entry.meanings.vi.map((meaning, index) => <li key={`${index}-${meaning}`}>{meaning}</li>)}</ul></div>}
      {entry.senses?.length ? <div className="dictionary-meaning-block"><h3>English senses</h3><ol className="content-meaning-list">{entry.senses.map((sense, index) => <li key={index}><p className={entry.meanings.vi.length ? undefined : 'content-primary-meaning'}>{sense.meaningsEn.join('; ')}</p>{sense.partsOfSpeech.length > 0 && <small className="content-subtle">{sense.partsOfSpeech.join(' · ')}</small>}{(sense.writtenRestrictions.length > 0 || sense.readingRestrictions.length > 0) && <p className="content-subtle">Applies to <span lang="ja">{[...sense.writtenRestrictions, ...sense.readingRestrictions].join('、')}</span></p>}{[...sense.information, ...sense.misc, ...sense.fields, ...sense.dialects].length > 0 && <p className="content-subtle">{[...sense.information, ...sense.misc, ...sense.fields, ...sense.dialects].join(' · ')}</p>}</li>)}</ol></div> : entry.meanings.en.length > 0 && <div className="dictionary-meaning-block"><h3>English</h3><ul className={`content-meaning-list${entry.meanings.vi.length ? '' : ' content-primary-meaning'}`}>{entry.meanings.en.map((meaning, index) => <li key={`${index}-${meaning}`}>{meaning}</li>)}</ul></div>}
      {entry.frequencyRank != null && <p className="content-subtle">Frequency rank: {entry.frequencyRank.toLocaleString()}</p>}
    </section>
    {examples.length > 0 && <section className="content-section" aria-labelledby="word-examples-title"><div className="content-section-heading"><h2 id="word-examples-title">Example sentences</h2><span className="content-subtle">{examples.length} in the offline dataset</span></div><div className="content-example-list">{examples.map((example) => <article className="content-example" key={example.id}><p className="content-example-japanese" lang="ja">{example.japanese}</p>{example.reading && <p className="content-reading" lang="ja">{example.reading}</p>}{example.translationVi && <p>{example.translationVi}</p>}{example.translationEn && <p className={example.translationVi ? 'content-example-en' : undefined}>{example.translationEn}</p>}<ExampleAttribution example={example} /></article>)}</div></section>}
    {kanji.length > 0 && <section className="content-section" aria-labelledby="word-kanji-title"><div className="content-section-heading"><h2 id="word-kanji-title">Kanji in this word</h2><span className="content-subtle">{kanji.length}</span></div><ul className="content-kanji-links">{kanji.map((item) => <li key={item.id}><Link to={`/kanji/${encodeURIComponent(item.character)}`} aria-label={`Open kanji ${item.character}`}><span lang="ja">{item.character}</span><span>{item.meanings.vi[0] ?? item.meanings.en[0] ?? ''}</span></Link></li>)}</ul></section>}
    <p className="dictionary-entry-source">Entry ID: <code>{entry.id}</code></p>
    <ReferenceAttribution />
  </article>
}
