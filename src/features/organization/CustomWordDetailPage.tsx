import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { CustomWordRepository } from '../../db/repositories/custom-words'
import type { CustomWord } from '../../types/domain'
import { AddToReviewButton, LearningActions } from './LearningActions'

const words = new CustomWordRepository()

export function CustomWordDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [word, setWord] = useState<CustomWord | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    let live = true
    setLoading(true); setFailed(false)
    void (id ? words.getById(id) : Promise.resolve(undefined)).then((value) => { if (live) setWord(value ?? null) }).catch(() => { if (live) setFailed(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id])
  async function remove() {
    if (!id) return
    setDeleting(true)
    try { await words.delete(id); navigate('/my-vocabulary', { replace: true }) }
    catch { setFailed(true); setDeleting(false); setConfirmDelete(false) }
  }
  if (loading) return <p className="content-state" role="status">Loading custom word…</p>
  if (failed) return <div className="organization-page"><EmptyState title="Word could not be loaded" description="Your saved word may be temporarily unavailable. Please try again." action={<Button asChild variant="secondary"><Link to="/my-vocabulary">Back to My Vocabulary</Link></Button>} /></div>
  if (!word) return <div className="organization-page"><EmptyState title="Custom word not found" description="This word may have been removed from your collection." action={<Button asChild variant="secondary"><Link to="/my-vocabulary">Back to My Vocabulary</Link></Button>} /></div>
  return <article className="organization-page content-detail-page custom-word-detail">
    <Link className="dictionary-back-link" to="/my-vocabulary"><ArrowLeft size={15} /> My Vocabulary</Link>
    <PageHeader eyebrow={word.sourceType === 'online' ? 'ONLINE SAVED WORD' : 'CUSTOM WORD'} title={word.word} description={word.reading || 'Reading not added'} action={<Button asChild variant="secondary"><Link to={`/my-vocabulary/custom/${encodeURIComponent(word.id)}/edit`}><Pencil size={15} />Edit</Link></Button>} />
    <div className="organization-detail-actions"><LearningActions itemType="custom-word" itemId={word.id} showStatus /><AddToReviewButton itemType="custom-word" itemId={word.id} snapshot={{ word: word.word, reading: word.reading, meaningVi: word.meaningsVi[0], meaningEn: word.meaningsEn[0] }} /></div>
    <section className="content-section"><div className="content-section-heading"><h2>Meaning</h2><div className="dictionary-detail-badges">{word.partsOfSpeech.map((part) => <Badge key={part}>{part}</Badge>)}</div></div>
      {word.meaningsVi.length > 0 && <div className="dictionary-meaning-block"><h3>Vietnamese</h3><ul className="content-meaning-list content-primary-meaning">{word.meaningsVi.map((meaning, index) => <li key={`${index}-${meaning}`}>{meaning}</li>)}</ul></div>}
      {word.meaningsEn.length > 0 && <div className="dictionary-meaning-block"><h3>English</h3><ul className={`content-meaning-list${word.meaningsVi.length ? '' : ' content-primary-meaning'}`}>{word.meaningsEn.map((meaning, index) => <li key={`${index}-${meaning}`}>{meaning}</li>)}</ul></div>}
      {!word.meaningsVi.length && !word.meaningsEn.length && <p className="content-subtle">No meanings added.</p>}
    </section>
    {word.notes && <section className="content-section"><div className="content-section-heading"><h2>Notes</h2></div><p className="custom-word-notes">{word.notes}</p></section>}
    {!!word.tags?.length && <section className="content-section"><div className="content-section-heading"><h2>Tags</h2></div><div className="custom-chip-list">{word.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div></section>}
    {word.examples?.length ? <section className="content-section"><div className="content-section-heading"><h2>Examples</h2></div><div className="content-example-list">{word.examples.map((example, index) => <article className="content-example" key={`${index}-${example.japanese}`}><p className="content-example-japanese" lang="ja">{example.japanese}</p>{example.reading && <p className="content-reading" lang="ja">{example.reading}</p>}{example.translationVi && <p>{example.translationVi}</p>}{example.translationEn && <p className={example.translationVi ? 'content-example-en' : undefined}>{example.translationEn}</p>}</article>)}</div></section> : null}
    <section className="content-section"><div className="content-section-heading"><h2>Source</h2></div><p className="content-subtle">{word.sourceType === 'online' ? `Saved from ${word.sourceProvider ?? 'an online dictionary'}.` : 'Created by you.'}</p>{word.sourceUrl && <a className="organization-source-link" href={word.sourceUrl} target="_blank" rel="noopener noreferrer">View original source</a>}</section>
    <div className="custom-word-danger-zone"><Button type="button" variant="ghost" className="button-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Delete word</Button></div>
    <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}><DialogContent className="organization-dialog"><DialogTitle>Delete this custom word?</DialogTitle><DialogDescription>This also removes its notebook memberships, favorite, study state, SRS cards, and review logs. Other vocabulary and notebooks remain.</DialogDescription><div className="organization-dialog-actions"><Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button type="button" className="button-danger" disabled={deleting} onClick={() => void remove()}><Trash2 size={15} />Delete word</Button></div></DialogContent></Dialog>
  </article>
}
