import { preferredMeaning, secondaryMeaning } from '../../lib/display-meaning'
import { ArrowLeft, ArrowRight, BookOpen, BookText, GraduationCap, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { Pagination, PaginationSummary } from '../../components/ui/pagination'
import { pageCountFor, useListParams } from '../../lib/pagination'
import { ReferenceAttribution } from '../dictionary/ReferenceAttribution'
import { Progress } from '../../components/ui/progress'
import { referenceDataSource } from '../../db/sources/reference-source'
import { ensureLocalDatasetReady } from '../../db/initialization'
import { QuizAttemptRepository, StudyRepository } from '../../db/repositories/user-data'
import { AddToReviewButton, FavoriteButton, NotebookPicker, SaveReferenceWordButton, StudyStatusControl } from '../organization/LearningActions'
import { generateQuizQuestions, isCorrectChoice } from './quiz-model'
import { getAllLevelsProgress, getLevelProgress, type CategoryProgress, type JlptCategory, type LevelProgress } from './progress-model'
import { createQuizSession, recordQuizAnswer, summarizeQuizSession, type QuizSessionState } from './quiz-session'
import type { DictionaryEntry, GrammarEntry, JlptLevel, KanjiEntry, QuizAttempt, QuizQuestionType, StudyStatus } from '../../types/domain'

const levels: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']
const categories: Array<{ id: JlptCategory; label: string; icon: typeof BookOpen }> = [
  { id: 'vocabulary', label: 'Vocabulary', icon: BookOpen },
  { id: 'kanji', label: 'Kanji', icon: GraduationCap },
  { id: 'grammar', label: 'Grammar', icon: BookText },
]
const studies = new StudyRepository()
const attempts = new QuizAttemptRepository()
const questionTypeLabels: Record<QuizQuestionType, string> = { 'japanese-meaning': 'Japanese → meaning', 'meaning-japanese': 'Meaning → Japanese', reading: 'Reading' }
/** Matches the materialized static JLPT page size, so one list page reads one static file. */
const categoryPageSize = 100
const quizPoolSize = 200
async function countVocabularyForLevel(level: JlptLevel): Promise<number> {
  const source = referenceDataSource.dictionary
  if (source.countByJlptLevel) return source.countByJlptLevel(level)
  let total = 0
  for (let offset = 0; ; offset += 500) {
    const page = await source.getByJlptLevel(level, { limit: 500, offset })
    total += page.items.length
    if (page.items.length < 500) return total
  }
}
async function countCategoryForLevel(category: JlptCategory, level: JlptLevel): Promise<number> {
  const source = referenceDataSource[category === 'vocabulary' ? 'dictionary' : category]
  if (source.countByJlptLevel) return source.countByJlptLevel(level)
  let total = 0
  for (let offset = 0; ; offset += 500) {
    const page = await source.getByJlptLevel(level, { limit: 500, offset })
    total += page.items.length
    if (page.items.length < 500) return total
  }
}

function useLevelParam(): JlptLevel | null {
  const { level } = useParams()
  return levels.includes(level as JlptLevel) ? level as JlptLevel : null
}
function DatasetProgress({ label, progress }: { label: string; progress: CategoryProgress }) {
  const percent = progress.available ? Math.round(progress.studied * 100 / progress.available) : 0
  return <div className="jlpt-progress-row">
    <div className="jlpt-progress-heading"><span>{label}</span><span>{progress.studied} studied <span aria-hidden="true">·</span> {progress.available} available</span></div>
    <Progress value={percent} label={`${label}: ${progress.studied} of ${progress.available} available items studied`} />
    <div className="jlpt-status-counts"><span>{progress.unseen} unseen</span><span>{progress.learning} learning</span><span>{progress.known} known</span></div>
  </div>
}

export function JlptOverviewPage() {
  const [items, setItems] = useState<Array<{ level: JlptLevel; progress: LevelProgress }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [recent, setRecent] = useState<QuizAttempt[]>([])
  useEffect(() => {
    let live = true
    void ensureLocalDatasetReady().then(async () => {
      const progress = await getAllLevelsProgress(referenceDataSource, studies)
      const values = levels.map((level) => ({ level, progress: progress.get(level)! }))
      const history = await attempts.listRecent(undefined, 5)
      if (live) { setItems(values); setRecent(history) }
    }).catch(() => { if (live) setError(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])
  return <div className="jlpt-page jlpt-overview">
    <PageHeader eyebrow="STUDY BY LEVEL" title="JLPT study" description="Work through the reference content currently available for each level." />
    <p className="jlpt-dataset-note"><span>Dataset progress</span> counts only items available in this dataset. It does not measure completion of the official JLPT syllabus.</p>
    {loading && <p className="content-state" role="status">Loading JLPT reference data…</p>}
    {error && <EmptyState title="JLPT progress could not be loaded" description="The configured reference source or local study data could not be reached." />}
    {!loading && !error && <div className="jlpt-level-list" aria-label="JLPT levels">{levels.map((level) => {
      const progress = items.find((item) => item.level === level)?.progress
      return <section key={level} className="jlpt-level-card">
        <div className="jlpt-level-card-head"><Link to={`/jlpt/${level}`} className="jlpt-level-link"><span className="jlpt-level-label">{level}</span><span>Level overview <ArrowRight size={15} aria-hidden="true" /></span></Link><Link className="jlpt-quiz-link" to={`/jlpt/${level}/quiz`}><Sparkles size={15} />Practice quiz</Link></div>
        <div className="jlpt-overview-metrics">{categories.map(({ id, label }) => <div key={id} className="jlpt-overview-metric"><span>{label}</span><strong>{progress ? `${progress[id].studied} studied` : '—'}</strong><small>{progress ? `${progress[id].available} available` : 'Loading'}</small></div>)}</div>
      </section>
    })}</div>}
    {recent.length > 0 && <section className="jlpt-history-section"><div className="jlpt-section-heading"><div><p className="eyebrow">RECENT PRACTICE</p><h2>Quiz history</h2></div></div><ul className="jlpt-history-list">{recent.map((attempt) => <li key={attempt.id}><Link to={`/jlpt/${attempt.jlptLevel}/quiz/summary?attempt=${encodeURIComponent(attempt.id)}`} state={{ attemptId: attempt.id }}><span><strong>{attempt.jlptLevel} vocabulary</strong><small>{new Date(attempt.completedAt).toLocaleDateString()}</small></span><span>{attempt.correctCount}/{attempt.questionCount} correct <ArrowRight size={14} /></span></Link></li>)}</ul></section>}
  </div>
}

export function JlptLevelPage() {
  const level = useLevelParam()
  const [progress, setProgress] = useState<LevelProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!level) return
    let live = true
    void ensureLocalDatasetReady().then(() => getLevelProgress(referenceDataSource, studies, level)).then((value) => { if (live) setProgress(value) }).catch(() => { if (live) setError(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [level])
  if (!level) return <Navigate to="/jlpt" replace />
  return <div className="jlpt-page jlpt-level-page">
    <Link to="/jlpt" className="jlpt-back-link"><ArrowLeft size={15} />All JLPT levels</Link>
    <PageHeader eyebrow="JLPT LEVEL" title={level} description="Study the vocabulary, kanji, and grammar tagged for this level." action={<Button asChild><Link to={`/jlpt/${level}/quiz`}><Sparkles size={16} />Practice quiz</Link></Button>} />
    <p className="jlpt-dataset-note"><span>Dataset progress</span> is based on currently available tagged records, not the full official exam scope.</p>
    {loading && <p className="content-state" role="status">Loading {level} data…</p>}
    {error && <EmptyState title="JLPT progress could not be loaded" description="The configured reference source or local study data could not be reached." />}
    <div className="jlpt-category-list">{categories.map(({ id, label, icon: Icon }) => <section className="jlpt-category-card" key={id}><div className="jlpt-category-card-heading"><span className="jlpt-category-icon"><Icon size={18} /></span><div><h2>{label}</h2><p>{progress ? `${progress[id].available} available · ${progress[id].studied} studied` : 'Loading dataset counts'}</p></div><Link to={`/jlpt/${level}/${id}`} aria-label={`Open ${level} ${label}`}><ArrowRight size={17} /></Link></div>{progress && <DatasetProgress label={label} progress={progress[id]} />}</section>)}</div>
    {!loading && !error && progress && !Object.values(progress).some((item) => item.available > 0) && <EmptyState title={`No ${level} content in this dataset yet`} description="The development reference data is intentionally incomplete. No vocabulary, kanji, or grammar has been assigned to this level." />}
    <p className="jlpt-inline-note">Reading practice can use your own text in <Link to="/reading">Reading Mode</Link>. Official JLPT passages are not included.</p>
  </div>
}

function filterByStatus<T extends { id: string }>(items: T[], stateMap: Map<string, StudyStatus>, filter: 'all' | 'unseen' | 'learning' | 'known') {
  if (filter === 'all') return items
  return items.filter((item) => {
    const status = stateMap.get(item.id) ?? 'unseen'
    return filter === 'unseen' ? status !== 'learning' && status !== 'known' : status === filter
  })
}
type StudyEntry = DictionaryEntry | KanjiEntry | GrammarEntry
export function JlptCategoryPage() {
  const level = useLevelParam()
  const { category: categoryParam } = useParams()
  const category = categories.find((entry) => entry.id === categoryParam)?.id
  const { page, setPage } = useListParams()
  const [items, setItems] = useState<StudyEntry[]>([])
  const [states, setStates] = useState<Map<string, StudyStatus>>(new Map())
  const [filter, setFilter] = useState<'all' | 'unseen' | 'learning' | 'known'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [available, setAvailable] = useState(0)
  useEffect(() => {
    const activeCategory = category
    if (!level || !activeCategory) return
    let live = true
    setLoading(true); setError(false)
    const repo = referenceDataSource[activeCategory === 'vocabulary' ? 'dictionary' : activeCategory]
    void ensureLocalDatasetReady().then(async () => {
      const [pageResult, total] = await Promise.all([repo.getByJlptLevel(level, { limit: categoryPageSize, offset: (page - 1) * categoryPageSize }), countCategoryForLevel(activeCategory, level)])
      if (!live) return
      if (!pageResult.items.length && total > 0 && page > 1) { setPage(pageCountFor(total, categoryPageSize), { replace: true }); return }
      const pairs = await Promise.all(pageResult.items.map(async (item) => [item.id, await studies.getStatus(activeCategory === 'vocabulary' ? 'reference-word' : activeCategory, item.id)] as const))
      if (!live) return
      setItems(pageResult.items); setStates(new Map(pairs)); setAvailable(total)
    }).catch(() => { if (live) setError(true) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [level, category, page, setPage])
  if (!level || !category) return <Navigate to="/jlpt" replace />
  const label = categories.find((item) => item.id === category)?.label ?? category
  function setRowStatus(id: string, status: StudyStatus) { setStates((current) => new Map(current).set(id, status)) }
  const shownItems = filterByStatus(items, states, filter)
  const pageCount = pageCountFor(available, categoryPageSize)
  return <div className="jlpt-page jlpt-list-page">
    <Link to={`/jlpt/${level}`} className="jlpt-back-link"><ArrowLeft size={15} />{level} overview</Link>
    <PageHeader eyebrow={`${level} · STUDY`} title={label} description={`${available} ${label.toLocaleLowerCase()} records currently available in this dataset.`} />
    <nav className="jlpt-category-tabs" aria-label={`${level} study categories`}>{categories.map((item) => <Link key={item.id} to={`/jlpt/${level}/${item.id}`} className={item.id === category ? 'is-active' : ''} aria-current={item.id === category ? 'page' : undefined}>{item.label}</Link>)}</nav>
    <p className="jlpt-dataset-note"><span>Dataset content</span> includes only records tagged {level}. Official syllabus coverage is not implied.</p>
    <div className="jlpt-filter-row" role="group" aria-label="Filter learning status on this page">{(['all', 'unseen', 'learning', 'known'] as const).map((value) => <button type="button" key={value} className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    {!error && items.length > 0 && <p className="content-result-count" role="status"><PaginationSummary page={page} pageSize={categoryPageSize} total={available} shown={items.length} noun={label.toLowerCase()} />{filter !== 'all' ? ` · ${shownItems.length} ${filter} on this page` : ''}{loading ? ' · Loading…' : ''}</p>}
    {loading && !items.length && <p className="content-state" role="status">Loading {label.toLowerCase()}…</p>}
    {error && <EmptyState title={`${label} could not be loaded`} description="The configured reference source could not return this level. Please try again." />}
    {!loading && !error && shownItems.length === 0 && <EmptyState title={items.length ? 'No items on this page match this filter' : `No ${level} ${label.toLowerCase()} available`} description={items.length ? 'Try another page or choose another learning status filter.' : 'The development dataset is intentionally incomplete. Add a trusted reference pack to browse records for this level.'} />}
    {!error && items.length > 0 && <Pagination page={page} pageCount={pageCount} onChange={setPage} label={`${level} ${label} pages (top)`} compact />}
    {!error && shownItems.length > 0 && <ul className="jlpt-study-list" aria-busy={loading}>{shownItems.map((entry) => <li key={entry.id} className="jlpt-study-row">
      {category === 'vocabulary' && <VocabularyRow entry={entry as DictionaryEntry} status={states.get(entry.id) ?? 'unseen'} onStatusChange={(value) => setRowStatus(entry.id, value)} />}
      {category === 'kanji' && <KanjiRow entry={entry as KanjiEntry} status={states.get(entry.id) ?? 'unseen'} onStatusChange={(value) => setRowStatus(entry.id, value)} />}
      {category === 'grammar' && <GrammarRow entry={entry as GrammarEntry} status={states.get(entry.id) ?? 'unseen'} onStatusChange={(value) => setRowStatus(entry.id, value)} />}
    </li>)}</ul>}
    {!error && <Pagination page={page} pageCount={pageCount} onChange={setPage} label={`${level} ${label} pages (bottom)`} />}
    {category === 'vocabulary' && <ReferenceAttribution />}
  </div>
}

function RowStateAndActions({ itemType, itemId, status, onStatusChange }: { itemType: 'reference-word' | 'kanji' | 'grammar'; itemId: string; status: StudyStatus; onStatusChange: (status: StudyStatus) => void }) {
  return <div className="jlpt-row-tools"><StudyStatusControl itemType={itemType} itemId={itemId} value={status} onChange={onStatusChange} /><FavoriteButton itemType={itemType} itemId={itemId} /><NotebookPicker itemType={itemType} itemId={itemId} /></div>
}
function VocabularyRow({ entry, status, onStatusChange }: { entry: DictionaryEntry; status: StudyStatus; onStatusChange: (status: StudyStatus) => void }) {
  return <><div className="jlpt-row-main"><Link to={`/dictionary/${encodeURIComponent(entry.id)}`} className="jlpt-row-title"><strong lang="ja">{entry.word}</strong><span lang="ja">{entry.reading}</span></Link><p>{preferredMeaning(entry.meanings) ?? 'Meaning unavailable'}</p><small>{[secondaryMeaning(entry.meanings), entry.partsOfSpeech.join(', ')].filter(Boolean).join(' · ')}</small></div><RowStateAndActions itemType="reference-word" itemId={entry.id} status={status} onStatusChange={onStatusChange} /><div className="jlpt-row-actions"><SaveReferenceWordButton entry={entry} /><AddToReviewButton itemType="reference-word" itemId={entry.id} snapshot={{ word: entry.word, reading: entry.reading, meaningVi: entry.meanings.vi[0], meaningEn: entry.meanings.en[0] }} /></div></>
}
function KanjiRow({ entry, status, onStatusChange }: { entry: KanjiEntry; status: StudyStatus; onStatusChange: (status: StudyStatus) => void }) {
  return <><div className="jlpt-row-main jlpt-row-kanji"><Link to={`/kanji/${encodeURIComponent(entry.character)}`} className="jlpt-row-title"><strong lang="ja">{entry.character}</strong><span>{entry.meanings.vi[0] ?? entry.meanings.en[0] ?? 'Meaning unavailable'}</span></Link><p>On {entry.onyomi.join('、') || '—'} <span aria-hidden="true">·</span> Kun {entry.kunyomi.join('、') || '—'}</p></div><RowStateAndActions itemType="kanji" itemId={entry.id} status={status} onStatusChange={onStatusChange} /></>
}
function GrammarRow({ entry, status, onStatusChange }: { entry: GrammarEntry; status: StudyStatus; onStatusChange: (status: StudyStatus) => void }) {
  return <><div className="jlpt-row-main"><Link to={`/grammar/${encodeURIComponent(entry.id)}`} className="jlpt-row-title"><strong lang="ja">{entry.pattern}</strong><span>{entry.meaningVi[0] ?? entry.meaningEn[0] ?? 'Meaning unavailable'}</span></Link>{entry.formation[0] && <p>{entry.formation[0]}</p>}</div><RowStateAndActions itemType="grammar" itemId={entry.id} status={status} onStatusChange={onStatusChange} /></>
}

export function JlptQuizSetupPage() {
  const level = useLevelParam()
  const navigate = useNavigate()
  const [types, setTypes] = useState<QuizQuestionType[]>(['japanese-meaning', 'meaning-japanese', 'reading'])
  const [count, setCount] = useState<10 | 20 | 30>(10)
  const [available, setAvailable] = useState(0)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  useEffect(() => {
    if (!level) return
    let live = true
    void ensureLocalDatasetReady().then(async () => {
      const total = await countVocabularyForLevel(level)
      if (live) setAvailable(total)
    }).catch(() => { if (live) setError('Vocabulary data could not be loaded from the configured reference source.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [level])
  if (!level) return <Navigate to="/jlpt" replace />
  const validLevel = level
  function toggleType(type: QuizQuestionType) { setTypes((current) => current.includes(type) ? current.filter((value) => value !== type) : [...current, type]) }
  async function startQuiz() {
    if (!types.length) { setError('Choose at least one question type.'); return }
    setStarting(true); setError('')
    try {
      const maxOffset = Math.max(0, available - quizPoolSize)
      const offset = maxOffset ? Math.floor(Math.random() * (maxOffset + 1)) : 0
      const page = await referenceDataSource.dictionary.getByJlptLevel(validLevel, { limit: quizPoolSize, offset })
      const questions = generateQuizQuestions(page.items, { level: validLevel, count, questionTypes: types })
      if (!questions.length) { setError('There are not enough unambiguous vocabulary entries with valid distractors for a quiz yet.'); return }
      const session = createQuizSession(questions, Date.now())
      navigate(`/jlpt/${level}/quiz/session`, { state: { session } })
    } catch { setError('Quiz questions could not be prepared. Please try again.') }
    finally { setStarting(false) }
  }
  return <div className="jlpt-page jlpt-quiz-page">
    <Link to={`/jlpt/${level}`} className="jlpt-back-link"><ArrowLeft size={15} />{level} overview</Link>
    <PageHeader eyebrow={`${level} · VOCABULARY`} title="Practice quiz" description="Use only vocabulary currently available in this dataset." />
    <section className="jlpt-quiz-setup">
      <div><p className="eyebrow">SESSION LENGTH</p><div className="jlpt-count-options" role="group" aria-label="Question count">{([10, 20, 30] as const).map((value) => <button key={value} type="button" aria-pressed={count === value} className={count === value ? 'is-active' : ''} onClick={() => setCount(value)}>{value} questions</button>)}</div></div>
      <fieldset className="jlpt-type-options"><legend>Question types</legend>{(Object.entries(questionTypeLabels) as Array<[QuizQuestionType, string]>).map(([id, label]) => <label key={id}><input type="checkbox" checked={types.includes(id)} onChange={() => toggleType(id)} /><span>{label}</span></label>)}</fieldset>
      {(location.state as { notice?: string } | null)?.notice && <p className="jlpt-inline-note" role="status">{(location.state as { notice?: string }).notice}</p>}
      <p className="jlpt-setup-note">{loading ? 'Checking available vocabulary…' : `${available} vocabulary entries tagged ${level}.`} A session draws from a bounded sample of up to {quizPoolSize} entries and uses only unambiguous questions with valid distractors.</p>
      {error && <p className="jlpt-error" role="alert">{error}</p>}
      <Button onClick={() => void startQuiz()} disabled={loading || starting || !available || !types.length}><Sparkles size={16} />{starting ? 'Preparing quiz…' : 'Start quiz'}</Button>
    </section>
    <QuizHistory level={level} />
    <p className="jlpt-inline-note">Grammar and kanji quizzes are not included. The current reference dataset does not provide authored question material for those categories.</p>
  </div>
}

function QuizHistory({ level }: { level: JlptLevel }) {
  const [history, setHistory] = useState<QuizAttempt[]>([])
  useEffect(() => { let live = true; void attempts.listRecent(level, 5).then((items) => { if (live) setHistory(items) }); return () => { live = false } }, [level])
  return history.length ? <section className="jlpt-history-section"><div className="jlpt-section-heading"><div><p className="eyebrow">LOCAL HISTORY</p><h2>Recent attempts</h2></div></div><ul className="jlpt-history-list">{history.map((attempt) => <li key={attempt.id}><Link to={`/jlpt/${level}/quiz/summary?attempt=${encodeURIComponent(attempt.id)}`} state={{ attemptId: attempt.id }}><span><strong>{attempt.correctCount}/{attempt.questionCount} correct</strong><small>{new Date(attempt.completedAt).toLocaleString()}</small></span><span>View summary <ArrowRight size={14} /></span></Link></li>)}</ul></section> : null
}

export function JlptQuizSessionPage() {
  const level = useLevelParam()
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const incoming = navigationType === 'PUSH' ? (location.state as { session?: QuizSessionState } | null)?.session : undefined
  const [session, setSession] = useState<QuizSessionState | null>(incoming ?? null)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const promptRef = useRef<HTMLHeadingElement>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const activeQuestion = session?.questions[session.currentIndex]
  const validLevel = level
  function answer(choiceId: string) { if (feedback || !choiceId) return; setSelected(choiceId); setFeedback(true) }
  useEffect(() => { if (activeQuestion) (feedback ? feedbackRef.current : promptRef.current)?.focus() }, [feedback, session?.currentIndex, activeQuestion])
  async function next() {
    if (!feedback || !session || !activeQuestion || !validLevel) return
    if (!selected) return
    const nextState = recordQuizAnswer(session, selected)
    if (nextState.currentIndex < session.questions.length) {
      setSession(nextState); setSelected(null); setFeedback(false); return
    }
    setSaving(true); setError('')
    try {
      const result = summarizeQuizSession(nextState)
      const attempt: QuizAttempt = { id: crypto.randomUUID(), jlptLevel: validLevel, category: 'vocabulary', questionTypes: [...new Set(nextState.questions.map((item) => item.questionType))], startedAt: nextState.startedAt, completedAt: Date.now(), questionCount: result.questionCount, correctCount: result.correctCount, durationMs: Math.max(0, Date.now() - nextState.startedAt), answers: nextState.answers }
      await attempts.save(attempt)
      navigate(`/jlpt/${level}/quiz/summary?attempt=${encodeURIComponent(attempt.id)}`, { state: { attemptId: attempt.id } })
    } catch { setSaving(false); setError('Could not save quiz history. You can try continuing again.') }
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!activeQuestion) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], button, a')) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (!feedback && /^[1-4]$/.test(event.key)) { event.preventDefault(); const choice = activeQuestion.choices[Number(event.key) - 1]; if (choice) answer(choice.id) }
      else if (feedback && event.key === 'Enter') { event.preventDefault(); void next() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  if (!level) return <Navigate to="/jlpt" replace />
  if (!session?.questions.length || !activeQuestion) return <Navigate to={`/jlpt/${level}/quiz`} replace state={{ notice: 'Your quiz session was not saved. Start a new session to continue.' }} />
  const question = activeQuestion
  const correct = feedback && selected === question.correctChoiceId
  return <div className="jlpt-page jlpt-quiz-page jlpt-session-page">
    <p className="eyebrow">{level} VOCABULARY PRACTICE</p>
    <div className="jlpt-session-progress"><span>Question {session.currentIndex + 1} of {session.questions.length}</span><Progress value={(session.currentIndex + (feedback ? 1 : 0)) * 100 / session.questions.length} label={`Question ${session.currentIndex + 1} of ${session.questions.length}`} /></div>
    <section className="jlpt-question-card" aria-labelledby="jlpt-question-prompt">
      <p className="jlpt-question-type">{questionTypeLabels[question.questionType]}</p>
      <h1 ref={promptRef} tabIndex={-1} id="jlpt-question-prompt" lang={question.questionType === 'meaning-japanese' ? 'vi' : 'ja'}>{question.prompt}</h1>
      <ol className="jlpt-answer-list" aria-label="Answer choices">{question.choices.map((choice, index) => {
        const isChosen = selected === choice.id
        const isAnswer = choice.id === question.correctChoiceId
        const state = feedback && isAnswer ? ' is-correct' : feedback && isChosen ? ' is-incorrect' : isChosen ? ' is-selected' : ''
        return <li key={choice.id}><button type="button" className={`jlpt-answer-choice${state}`} disabled={feedback} aria-pressed={isChosen} onClick={() => answer(choice.id)}><span className="jlpt-choice-key" aria-hidden="true">{index + 1}</span><span>{choice.label}</span>{feedback && isAnswer && <span className="jlpt-sr-feedback">Correct answer</span>}{feedback && isChosen && !isCorrectChoice(question, choice.id) && <span className="jlpt-sr-feedback">Your selected answer</span>}</button></li>
      })}</ol>
      {feedback && <div ref={feedbackRef} tabIndex={-1} className={`jlpt-answer-feedback${correct ? ' is-correct' : ' is-incorrect'}`} role="status" aria-live="polite"><strong>{correct ? '✓ Correct' : '× Incorrect'}</strong><div className="jlpt-explanation"><b lang="ja">{question.entry.word}</b><span lang="ja">{question.entry.reading}</span><p>{[preferredMeaning(question.entry.meanings), secondaryMeaning(question.entry.meanings)].filter(Boolean).join(' · ') || 'Meaning unavailable'}</p></div></div>}
      {error && <p className="jlpt-error" role="alert">{error}</p>}
      {feedback && <div className="jlpt-question-footer"><span>Press Enter to continue</span><Button onClick={() => void next()} disabled={saving}>{saving ? 'Saving…' : session.currentIndex + 1 < session.questions.length ? 'Next question' : 'Finish quiz'}<ArrowRight size={16} /></Button></div>}
      {!feedback && <p className="jlpt-shortcut-note">Choose an answer <span aria-hidden="true">·</span> Press 1–4 to select</p>}
    </section>
    <Link to={`/jlpt/${level}/quiz`} className="jlpt-abandon-link">End this session</Link>
  </div>
}

export function JlptQuizSummaryPage() {
  const level = useLevelParam()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<Map<string, DictionaryEntry>>(new Map())
  const attemptId = searchParams.get('attempt') ?? (location.state as { attemptId?: string } | null)?.attemptId
  useEffect(() => {
    let live = true
    void (async () => {
      const item = attemptId ? await attempts.get(attemptId) : undefined
      if (!live) return
      setAttempt(item ?? null)
      if (item) {
        const ids = [...new Set(item.answers.filter((answer) => !answer.isCorrect).map((answer) => answer.itemId))]
        const values = await Promise.all(ids.map(async (id) => [id, await referenceDataSource.dictionary.getById(id)] as const))
        if (live) setEntries(new Map(values.filter((pair): pair is readonly [string, DictionaryEntry] => !!pair[1])))
      }
    })().catch(() => undefined).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [attemptId])
  if (!level) return <Navigate to="/jlpt" replace />
  if (loading) return <div className="jlpt-page"><p className="content-state" role="status">Loading quiz summary…</p></div>
  if (!attempt) return <div className="jlpt-page"><EmptyState title="Quiz summary unavailable" description="This completed attempt could not be found in local history." action={<Button asChild><Link to={`/jlpt/${level}/quiz`}>Start another quiz</Link></Button>} /></div>
  const percentage = attempt.questionCount ? Math.round(attempt.correctCount * 100 / attempt.questionCount) : 0
  const byType = Object.fromEntries((Object.keys(questionTypeLabels) as QuizQuestionType[]).map((type) => { const answers = attempt.answers.filter((item) => item.questionType === type); return [type, { correct: answers.filter((item) => item.isCorrect).length, total: answers.length }] })) as Record<QuizQuestionType, { correct: number; total: number }>
  const mistakes = attempt.answers.filter((answer) => !answer.isCorrect)
  return <div className="jlpt-page jlpt-quiz-page jlpt-summary-page">
    <Link to={`/jlpt/${level}`} className="jlpt-back-link"><ArrowLeft size={15} />{level} overview</Link>
    <PageHeader eyebrow={`${level} · VOCABULARY`} title="Quiz summary" description={`Completed ${new Date(attempt.completedAt).toLocaleString()}.`} />
    <section className="jlpt-summary-score"><div><span className="jlpt-score-count">{attempt.correctCount}<small> / {attempt.questionCount}</small></span><strong>{percentage}% correct</strong></div><Progress value={percentage} label={`${percentage}% correct`} /><p>Quiz practice reflects this session only. It does not change StudyState or review scheduling.</p></section>
    <section className="jlpt-type-breakdown"><h2>By question type</h2><dl>{(Object.entries(byType) as Array<[QuizQuestionType, { correct: number; total: number }]>).filter(([, value]) => value.total).map(([type, value]) => <div key={type}><dt>{questionTypeLabels[type]}</dt><dd>{value.correct} / {value.total}</dd></div>)}</dl></section>
    <section className="jlpt-mistakes-section"><div className="jlpt-section-heading"><div><p className="eyebrow">REVIEW</p><h2>{mistakes.length ? `${mistakes.length} missed ${mistakes.length === 1 ? 'answer' : 'answers'}` : 'All answers correct'}</h2></div></div>
      {!mistakes.length && <p className="jlpt-inline-note">Great work. There are no missed answers to review.</p>}
      {mistakes.length > 0 && <ul className="jlpt-mistake-list">{mistakes.map((answer) => { const entry = entries.get(answer.itemId); return <li key={answer.questionId}><p className="jlpt-mistake-type">{questionTypeLabels[answer.questionType]}</p><strong>{entry?.word ?? answer.prompt}</strong>{entry?.reading && <span lang="ja">{entry.reading}</span>}<p>{entry ? preferredMeaning(entry.meanings) ?? answer.correctAnswer : answer.correctAnswer}</p><small>Your answer: {answer.selectedAnswer || 'No answer'} <span aria-hidden="true">·</span> Correct: {answer.correctAnswer}</small>{entry && <Link to={`/dictionary/${encodeURIComponent(entry.id)}`}>Open dictionary entry <ArrowRight size={13} /></Link>}<div className="jlpt-row-actions">{entry && <><SaveReferenceWordButton entry={entry} /><AddToReviewButton itemType="reference-word" itemId={entry.id} snapshot={{ word: entry.word, reading: entry.reading, meaningVi: entry.meanings.vi[0], meaningEn: entry.meanings.en[0] }} /><NotebookPicker itemType="reference-word" itemId={entry.id} /></>}</div></li> })}</ul>}
    </section>
    <div className="jlpt-summary-actions"><Button asChild><Link to={`/jlpt/${level}/quiz`}>Practice again</Link></Button><Button variant="secondary" asChild><Link to={`/jlpt/${level}/vocabulary`}>Study vocabulary</Link></Button></div>
  </div>
}
