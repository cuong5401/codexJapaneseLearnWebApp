import { ExampleAttribution } from '../../components/ui/example-attribution'
import { ArrowLeft, Check, Clock3, RotateCcw, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { SettingsRepository, SrsRepository } from '../../db/repositories/user-data'
import type { SrsCard } from '../../types/domain'
import { pronounceJapanese } from '../dictionary/speech'
import { buildReviewCardViewModel, type ReviewCardViewModel } from './review-model'
import { type ReviewRating } from '../../db/srs/scheduler'

const srs = new SrsRepository()
const settings = new SettingsRepository()
const DAILY_LIMIT_KEY = 'review.dailyNewLimit'
const LIMIT_OPTIONS = [0, 5, 10, 20, 30, 50]
const ratingLabels: Record<ReviewRating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

function readLimit(value: unknown) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : 20 }
function durationLabel(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function ReviewDashboardPage() {
  const [limit, setLimit] = useState(20)
  const [counts, setCounts] = useState({ due: 0, learning: 0, new: 0, introducedToday: 0, dailyNewLimit: 20, nextDueAt: null as number | null })
  const [suspended, setSuspended] = useState<SrsCard[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const navigate = useNavigate()
  async function refresh(nextLimit = limit) {
    const [nextCounts, suspendedCards] = await Promise.all([srs.counts(Date.now(), nextLimit), srs.listSuspended(50)])
    setCounts(nextCounts); setSuspended(suspendedCards)
  }
  useEffect(() => {
    let live = true
    void settings.get(DAILY_LIMIT_KEY).then(async (setting) => {
      const next = readLimit(setting?.value)
      if (!live) return
      setLimit(next)
      const [nextCounts, cards] = await Promise.all([srs.counts(Date.now(), next), srs.listSuspended(50)])
      if (live) { setCounts(nextCounts); setSuspended(cards) }
    }).catch(() => { if (live) setLoadError('Review data could not be loaded from this device.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])
  async function updateLimit(value: number) { setLimit(value); await settings.set(DAILY_LIMIT_KEY, value); await refresh(value) }
  async function start() {
    const remainingNew = Math.max(0, limit - counts.introducedToday)
    const queue = await srs.listSessionQueue(Date.now(), remainingNew)
    if (queue.length) navigate('/review/session', { state: { queue } })
  }
  async function unsuspend(id: string) { await srs.setSuspended(id, false); await refresh() }
  const newRemaining = Math.max(0, limit - counts.introducedToday)
  const canStart = counts.due + counts.learning + Math.min(counts.new, newRemaining) > 0
  return <div className="review-page review-dashboard">
    <PageHeader eyebrow="YOUR STUDY SPACE" title="Review" description="A focused queue of words ready to revisit." />
    <section className="review-overview" aria-label="Review queue overview">
      <div className="review-count"><strong>{counts.due}</strong><span>Due</span></div>
      <div className="review-count"><strong>{counts.learning}</strong><span>Learning</span></div>
      <div className="review-count"><strong>{counts.new}</strong><span>New available</span></div>
    </section>
    {loadError && <p className="organization-error" role="alert">{loadError}</p>}
    <section className="review-start-panel">
      <div><p className="eyebrow">TODAY</p><h2>{loading ? 'Loading your queue…' : canStart ? `${counts.due + counts.learning + Math.min(counts.new, newRemaining)} ${counts.due + counts.learning + Math.min(counts.new, newRemaining) === 1 ? 'card' : 'cards'} ready` : 'You are all caught up'}</h2><p>{loading ? 'Checking this device for due cards.' : canStart ? 'Reviews come first, followed by short learning steps and new words.' : counts.new ? 'Your daily new card limit has been reached. Your next scheduled review will appear here.' : 'Your next due cards will appear here when it is time.'}</p></div>
      <Button onClick={() => void start()} disabled={loading || !canStart}><RotateCcw size={16} />Start review</Button>
    </section>
    {!loading && !canStart && <p className="review-next-note"><Clock3 size={15} />{counts.nextDueAt ? `Next scheduled review: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(counts.nextDueAt)}.` : counts.new ? 'Your new card limit has been reached for today.' : 'No cards are scheduled yet. Add a word to review to get started.'}</p>}
    <section className="review-settings-panel" aria-labelledby="daily-limit-title">
      <div><h2 id="daily-limit-title">Daily new card limit</h2><p>Choose how many new cards can enter review each local calendar day.</p></div>
      <label className="review-limit-select"><span className="sr-only">Daily new card limit</span><select value={limit} onChange={(event) => void updateLimit(Number(event.target.value))}>{LIMIT_OPTIONS.map((item) => <option key={item} value={item}>{item} per day</option>)}</select></label>
      <p className="review-limit-progress">Introduced today: {counts.introducedToday} / {limit}</p>
    </section>
    {!!suspended.length && <section className="review-suspended-section"><div className="review-section-heading"><h2>Suspended cards</h2><span>{suspended.length}{suspended.length === 50 ? '+' : ''}</span></div><ul className="review-suspended-list">{suspended.map((card) => <li key={card.id}><span lang="ja">{card.snapshotWord ?? card.itemId}</span><Button type="button" variant="quiet" size="sm" onClick={() => void unsuspend(card.id)}>Resume</Button></li>)}</ul></section>}
    {loading && <p className="content-state" role="status">Loading review queue…</p>}
  </div>
}

interface SessionSummary { counts: Record<ReviewRating, number>; answered: number; durationMs: number }
interface ReviewRouteState { queue?: SrsCard[]; summary?: SessionSummary }

export function ReviewSessionPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const queue = useMemo(() => (location.state as ReviewRouteState | null)?.queue ?? [], [location.state])
  const [index, setIndex] = useState(0)
  const [view, setView] = useState<ReviewCardViewModel | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmReset, setConfirmReset] = useState(false)
  const [speechUnavailable, setSpeechUnavailable] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [ratings, setRatings] = useState<Record<ReviewRating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })
  const [answered, setAnswered] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const startedAt = useRef(Date.now())
  const cardStartedAt = useRef(Date.now())
  const rateRef = useRef<(rating: ReviewRating) => void>(() => undefined)
  const savingRef = useRef(false)
  const [savingAnswer, setSavingAnswer] = useState(false)
  const card = queue[index]

  useEffect(() => {
    let live = true
    setView(null); setRevealed(false); setSpeechUnavailable(false); cardStartedAt.current = Date.now()
    if (!card) { setLoading(false); return () => { live = false } }
    setLoading(true)
    void buildReviewCardViewModel(card).then((model) => { if (live) setView(model) }).catch(() => { if (live) setView({ word: card.snapshotWord ?? card.itemId, reading: card.snapshotReading ?? '', meaningsVi: card.snapshotMeaningVi ? [card.snapshotMeaningVi] : [], meaningsEn: card.snapshotMeaningEn ? [card.snapshotMeaningEn] : [], unavailable: true }) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [card])

  const finish = useCallback((nextRatings = ratings, nextAnswered = answered, nextSkipped = skipped) => {
    const summary: SessionSummary = { counts: nextRatings, answered: nextAnswered, durationMs: Date.now() - startedAt.current }
    navigate('/review/summary', { replace: true, state: { summary, skipped: nextSkipped } })
  }, [answered, navigate, ratings, skipped])
  const moveNext = useCallback((nextRatings = ratings, nextAnswered = answered, nextSkipped = skipped) => {
    if (index + 1 >= queue.length) finish(nextRatings, nextAnswered, nextSkipped)
    else setIndex((current) => current + 1)
  }, [answered, finish, index, queue.length, ratings, skipped])
  const rate = useCallback(async (rating: ReviewRating) => {
    if (!card || !revealed || view?.unavailable || savingRef.current) return
    savingRef.current = true; setSavingAnswer(true)
    setSaveError('')
    try {
      await srs.answer(card.id, rating, Date.now(), Date.now() - cardStartedAt.current)
      const nextRatings = { ...ratings, [rating]: ratings[rating] + 1 }
      setRatings(nextRatings); setAnswered((value) => value + 1); moveNext(nextRatings, answered + 1)
    } catch { setSaveError('Your answer could not be saved. The card remains in this session; try again.') }
    finally { savingRef.current = false; setSavingAnswer(false) }
  }, [answered, card, moveNext, ratings, revealed, view])
  useEffect(() => { rateRef.current = rate }, [rate])
  function skip() { const nextSkipped = skipped + 1; setSkipped(nextSkipped); if (index + 1 >= queue.length) finish(ratings, answered, nextSkipped); else setIndex((current) => current + 1) }
  async function suspend() {
    if (!card) return
    setSaveError('')
    try { await srs.setSuspended(card.id, true); moveNext() }
    catch { setSaveError('This card could not be suspended. Please try again.') }
  }
  async function reset() {
    if (!card) return
    setSaveError('')
    try { await srs.reset(card.id); setConfirmReset(false); moveNext() }
    catch { setSaveError('This card could not be reset. Please try again.') }
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (!revealed) setRevealed(true); return }
      if (revealed && !view?.unavailable && ['1', '2', '3', '4'].includes(event.key)) { event.preventDefault(); rateRef.current(Number(event.key) as ReviewRating) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [revealed, view])

  if (!queue.length) return <div className="review-page"><PageHeader eyebrow="REVIEW" title="No session is active" description="Start a review session from your dashboard." /><Button asChild><Link to="/review">Review dashboard</Link></Button></div>
  if (!card) return null
  return <div className="review-page review-session">
    <div className="review-session-top"><Link to="/review" className="dictionary-back-link"><ArrowLeft size={15} /> Review</Link><span>Card {index + 1} of {queue.length}</span></div>
    <div className="review-session-progress" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index}><span style={{ width: `${(index / queue.length) * 100}%` }} /></div>
    {loading || !view ? <p className="content-state" role="status">Loading card…</p> : <>
      <section className={`review-card${revealed ? ' is-revealed' : ''}`} aria-labelledby="review-word">
        <p className="eyebrow">{card.state === 'new' ? 'NEW WORD' : card.state === 'learning' || card.state === 'relearning' ? 'LEARNING STEP' : 'REVIEW'}</p>
        <h1 id="review-word" lang="ja">{view.word}</h1>
        {view.unavailable && <p className="review-unavailable" role="status">This saved entry is unavailable. The card has not been changed.</p>}
        {!revealed && !view.unavailable && <Button className="review-reveal" size="lg" onClick={() => setRevealed(true)}>Reveal answer <span className="review-shortcut">Space</span></Button>}
        {revealed && <div className="review-answer" aria-live="polite">
          {view.reading && <p className="review-reading" lang="ja">{view.reading}</p>}
          {view.meaningsVi.length > 0 && <div><h2>Vietnamese</h2><ul>{view.meaningsVi.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></div>}
          {view.meaningsEn.length > 0 && <div><h2>English</h2><ul>{view.meaningsEn.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></div>}
          {view.example && <article className="review-example"><p lang="ja">{view.example.japanese}</p>{view.example.reading && <small lang="ja">{view.example.reading}</small>}{(view.example.translationVi || view.example.translationEn) && <span>{view.example.translationVi || view.example.translationEn}</span>}<ExampleAttribution example={view.example} /></article>}
          <Button type="button" variant="quiet" size="sm" onClick={() => setSpeechUnavailable(!pronounceJapanese(view.reading || view.word))}><Volume2 size={15} />Play pronunciation</Button>{speechUnavailable && <span className="review-unavailable">Speech synthesis is unavailable.</span>}
        </div>}
      </section>
      {saveError && <p className="organization-error" role="alert">{saveError}</p>}
      {view.unavailable ? <div className="review-unavailable-actions"><Button variant="secondary" onClick={skip}>Skip this unavailable card</Button></div> : revealed && <div className="review-ratings" role="group" aria-label="How well did you remember this word?">
        {([1, 2, 3, 4] as ReviewRating[]).map((rating) => <Button key={rating} type="button" disabled={savingAnswer} variant={rating === 3 ? 'primary' : 'secondary'} onClick={() => void rate(rating)}><span>{ratingLabels[rating]}</span><small>{rating === 1 ? '1' : rating === 2 ? '2' : rating === 3 ? '3' : '4'}</small></Button>)}
      </div>}
      <div className="review-session-secondary"><Button type="button" variant="quiet" size="sm" onClick={() => void suspend()}>Suspend card</Button><Button type="button" variant="quiet" size="sm" onClick={() => setConfirmReset(true)}>Reset progress</Button><span><Check size={13} /> {answered} answered · {skipped} skipped</span></div>
    </>}
    <Dialog open={confirmReset} onOpenChange={setConfirmReset}><DialogContent className="organization-dialog"><DialogTitle>Reset this card?</DialogTitle><DialogDescription>This removes this card’s review history and returns it to New. The rest of the queue stays in place.</DialogDescription><div className="organization-dialog-actions"><Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button><Button onClick={() => void reset()}>Reset card</Button></div></DialogContent></Dialog>
  </div>
}

export function ReviewSummaryPage() {
  const location = useLocation()
  const data = location.state as (ReviewRouteState & { skipped?: number }) | null
  const summary = data?.summary
  if (!summary) return <div className="review-page"><EmptyState title="Session summary unavailable" description="Start a new session to see its results." action={<Button asChild><Link to="/review">Review dashboard</Link></Button>} /></div>
  return <div className="review-page review-summary-page"><PageHeader eyebrow="SESSION COMPLETE" title="Nice work" description="Your answers have been saved on this device." />
    <section className="review-summary-grid"><div><strong>{summary.answered}</strong><span>Answered</span></div><div><strong>{durationLabel(summary.durationMs)}</strong><span>Time spent</span></div><div><strong>{data?.skipped ?? 0}</strong><span>Skipped</span></div></section>
    <section className="review-summary-ratings"><h2>Answer breakdown</h2>{([1, 2, 3, 4] as ReviewRating[]).map((rating) => <div key={rating}><span>{ratingLabels[rating]}</span><strong>{summary.counts[rating]}</strong></div>)}</section>
    <div className="review-summary-actions"><Button asChild variant="secondary"><Link to="/review">Back to review</Link></Button><Button asChild><Link to="/review"><RotateCcw size={15} />Review again</Link></Button></div>
  </div>
}
