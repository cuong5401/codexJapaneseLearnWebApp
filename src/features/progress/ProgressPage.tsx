import { ArrowRight, Bookmark, BookmarkPlus, CalendarDays, ChartNoAxesColumnIncreasing, CircleCheck, Flame, GraduationCap, Minus, RotateCcw, Search, Sparkles, Star, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { Progress } from '../../components/ui/progress'
import { SectionHeader } from '../../components/ui/section-header'
import { ensureLocalDatasetReady } from '../../db/initialization'
import { referenceDataSource } from '../../db/sources/reference-source'
import type { ReviewRating } from '../../db/srs/scheduler'
import type { JlptLevel, QuizQuestionType, StudyStatus } from '../../types/domain'
import type { CategoryProgress, JlptCategory, LevelProgress } from '../jlpt/progress-model'
import { percent, ratio, type ActivityDay, type StudyActivity } from './progress-model'
import { loadJlptDatasetProgress, loadLocalProgress, type LocalProgress, type ResolvedActivity } from './progress-service'

export type LoadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

const levels: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']
const categoryLabels: Record<JlptCategory, string> = { vocabulary: '語彙', kanji: '漢字', grammar: '文法' }
const ratingLabels: Record<ReviewRating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }
const quizTypeLabels: Record<QuizQuestionType, string> = { 'japanese-meaning': '日本語 → 意味', 'meaning-japanese': '意味 → 日本語', reading: '読み' }
const statusLabels: Record<Exclude<StudyStatus, 'unseen'>, string> = { learning: '学習中', known: '習得済み', suspended: '保留' }
const numberFormat = new Intl.NumberFormat('ja-JP')
const count = (value: number) => numberFormat.format(value)
const dayLabel = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
const timeLabel = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function dayFromKey(key: string) { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day) }

export function ProgressPage() {
  const [local, setLocal] = useState<LoadState<LocalProgress>>({ status: 'loading' })
  const [jlpt, setJlpt] = useState<LoadState<Map<JlptLevel, LevelProgress>>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    const ready = ensureLocalDatasetReady()
    void ready.then(() => loadLocalProgress({ referenceSource: referenceDataSource })).then((data) => { if (live) setLocal({ status: 'ready', data }) }).catch(() => { if (live) setLocal({ status: 'error' }) })
    void ready.then(() => loadJlptDatasetProgress(referenceDataSource)).then((data) => { if (live) setJlpt({ status: 'ready', data }) }).catch(() => { if (live) setJlpt({ status: 'error' }) })
    return () => { live = false }
  }, [])

  return <ProgressView local={local} jlpt={jlpt} />
}

/** Pure view of the loaded state, rendered directly in tests. */
export function ProgressView({ local, jlpt }: { local: LoadState<LocalProgress>; jlpt: LoadState<Map<JlptLevel, LevelProgress>> }) {
  return <div className="progress-page">
    <PageHeader eyebrow="YOUR LEARNING" title="学習の進捗" description="この端末に保存された学習履歴をもとに集計しています。" />
    {local.status === 'loading' && <p className="content-state" role="status">学習データを読み込んでいます…</p>}
    {local.status === 'error' && <p className="organization-error" role="alert">この端末の学習履歴を読み込めませんでした。ページを再読み込みしてください。</p>}
    {local.status === 'ready' && (local.data.isEmpty ? <ProgressEmptyState /> : <ProgressDashboard data={local.data} jlpt={jlpt} />)}
  </div>
}

function ProgressEmptyState() {
  return <EmptyState
    icon={<ChartNoAxesColumnIncreasing size={21} />}
    title="まだ学習データがありません"
    description="単語を学習したり、復習したりすると、ここに進捗が表示されます。"
    action={<div className="progress-empty-actions">
      <Button asChild size="sm"><Link to="/review"><RotateCcw size={15} />復習する</Link></Button>
      <Button asChild size="sm" variant="secondary"><Link to="/dictionary"><Search size={15} />単語を探す</Link></Button>
      <Button asChild size="sm" variant="secondary"><Link to="/jlpt"><GraduationCap size={15} />JLPTを学ぶ</Link></Button>
    </div>}
  />
}

function ProgressDashboard({ data, jlpt }: { data: LocalProgress; jlpt: LoadState<Map<JlptLevel, LevelProgress>> }) {
  const { vocabulary, activity, srs } = data
  const overview = [
    { label: '学習した単語', value: count(vocabulary.learning + vocabulary.known), note: '学習中＋習得済み' },
    { label: '学習中', value: count(vocabulary.learning), note: '単語' },
    { label: '習得済み', value: count(vocabulary.known), note: '単語' },
    { label: '復習予定', value: count(srs.dueNow), note: '今すぐ復習できるカード' },
    { label: '今週の学習日数', value: `${activity.thisWeek.activeDays}日`, note: `今週 ${activity.thisWeek.elapsedDays}日中` },
  ]
  return <>
    <section className="progress-overview" aria-label="概要">
      <dl>{overview.map((item) => <div className="progress-stat" key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><small>{item.note}</small></dd></div>)}</dl>
    </section>
    <div className="progress-grid">
      <div className="progress-column">
        <ActivitySection activity={activity} />
        <SrsSection data={data} />
        <RatingsSection data={data} />
        <QuizSection data={data} />
      </div>
      <div className="progress-column">
        <JlptSection state={jlpt} />
        <VocabularySection data={data} />
        <RecentActivitySection items={data.recentActivity} />
      </div>
    </div>
  </>
}

function ActivitySection({ activity }: { activity: StudyActivity }) {
  const max = Math.max(0, ...activity.recentDays.map((day) => day.reviews))
  const trend = { up: { icon: TrendingUp, label: '前の7日より増加' }, down: { icon: TrendingDown, label: '前の7日より減少' }, flat: { icon: Minus, label: '前の7日と同じ' }, none: { icon: Minus, label: '直近2週間の復習はありません' } }[activity.trend]
  const TrendIcon = trend.icon
  return <section className="progress-section" aria-label="学習アクティビティ">
    <SectionHeader eyebrow="STUDY ACTIVITY" title="学習アクティビティ" />
    <dl className="progress-streaks">
      <div><dt><Flame size={15} aria-hidden="true" />連続学習</dt><dd><strong>{activity.streak.current}</strong>日</dd></div>
      <div><dt><CalendarDays size={15} aria-hidden="true" />最長記録</dt><dd><strong>{activity.streak.longest}</strong>日</dd></div>
      <div><dt><RotateCcw size={15} aria-hidden="true" />今日の復習</dt><dd><strong>{count(activity.today)}</strong>件</dd></div>
    </dl>
    <ol className="progress-chart" aria-label="直近14日間の復習数">
      {activity.recentDays.map((day) => <ActivityBar day={day} max={max} key={day.day} />)}
    </ol>
    <p className="progress-trend"><TrendIcon size={15} aria-hidden="true" /><span>直近7日 <strong>{count(activity.last7Days)}</strong>件 · その前の7日 {count(activity.previous7Days)}件 — {trend.label}</span></p>
    <p className="progress-note">学習日は、端末のローカル日付で復習を1件以上記録した日です。今週は月曜日から数えます。</p>
  </section>
}

function ActivityBar({ day, max }: { day: ActivityDay; max: number }) {
  const date = dayFromKey(day.day)
  const height = day.reviews && max ? Math.max(8, Math.round(day.reviews / max * 100)) : 0
  return <li className={day.isToday ? 'is-today' : undefined}>
    <span className="progress-bar-slot" aria-hidden="true">{day.reviews ? <span className="progress-bar" style={{ height: `${height}%` }} /> : <span className="progress-bar-empty" />}</span>
    <span className="progress-bar-label" aria-hidden="true">{day.isToday ? '今日' : date.getDate()}</span>
    <span className="sr-only">{dayLabel.format(date)}{day.isToday ? '（今日）' : ''}: 復習{day.reviews}件</span>
  </li>
}

function Distribution({ label, items }: { label: string; items: Array<{ key: string; label: string; value: number; tone: string }> }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return <div className="progress-distribution">
    <div className="progress-stack" aria-hidden="true">{items.filter((item) => item.value > 0).map((item) => <span key={item.key} className={`tone-${item.tone}`} style={{ flexGrow: item.value }} />)}</div>
    <ul aria-label={label}>{items.map((item) => <li key={item.key}><span className={`progress-swatch tone-${item.tone}`} aria-hidden="true" /><span>{item.label}</span><strong>{count(item.value)}</strong><small>{total ? percent(ratio(item.value, total)) : '—'}</small></li>)}</ul>
  </div>
}

function SrsSection({ data }: { data: LocalProgress }) {
  const { srs } = data
  return <section className="progress-section" aria-label="復習カードの状態">
    <SectionHeader eyebrow="SRS STATUS" title="復習カードの状態" action={<Link to="/review" className="section-action">復習する <ArrowRight size={14} /></Link>} />
    {srs.total ? <>
      <dl className="progress-due">
        <div><dt>今すぐ</dt><dd>{count(srs.dueNow)}</dd></div>
        <div><dt>今日中</dt><dd>{count(srs.dueToday)}</dd></div>
        <div><dt>期限切れ</dt><dd>{count(srs.overdue)}</dd></div>
      </dl>
      <Distribution label={`復習カード ${srs.total}枚の内訳`} items={[
        { key: 'new', label: 'New', value: srs.states.new, tone: 'muted' },
        { key: 'learning', label: 'Learning', value: srs.states.learning + srs.states.relearning, tone: 'warning' },
        { key: 'review', label: 'Review', value: srs.states.review, tone: 'primary' },
        { key: 'suspended', label: 'Suspended', value: srs.states.suspended, tone: 'faint' },
      ]} />
      <p className="progress-note">Learning には再学習中（relearning）のカード{srs.states.relearning ? ` ${srs.states.relearning}枚` : ''}を含みます。期限切れは今日より前に期限を迎えたカードです。</p>
    </> : <p className="progress-empty-line">復習カードはまだありません。単語の詳細ページから復習に追加できます。</p>}
  </section>
}

function RatingsSection({ data }: { data: LocalProgress }) {
  const { total, ratings } = data.reviews
  return <section className="progress-section" aria-label="評価の分布">
    <SectionHeader eyebrow="REVIEW RATINGS" title="評価の分布" />
    {total ? <>
      <p className="progress-summary-line">これまでの復習 <strong>{count(total)}</strong>件</p>
      <ul className="progress-bars" aria-label="SRS評価ごとの件数">
        {([1, 2, 3, 4] as const).map((rating) => <li key={rating}><span className="progress-bars-label">{ratingLabels[rating]}</span><Progress value={ratio(ratings[rating], total) * 100} label={`${ratingLabels[rating]}: ${ratings[rating]}件（${percent(ratio(ratings[rating], total))}）`} /><strong>{count(ratings[rating])}</strong><small>{percent(ratio(ratings[rating], total))}</small></li>)}
      </ul>
      <p className="progress-note">復習時に自分で選んだ評価の割合です。クイズの正解率とは異なります。</p>
    </> : <p className="progress-empty-line">復習の記録はまだありません。</p>}
  </section>
}

function QuizSection({ data }: { data: LocalProgress }) {
  const { quizzes, recentQuizzes } = data
  const modes = (Object.keys(quizTypeLabels) as QuizQuestionType[]).filter((type) => quizzes.byType[type].answered > 0)
  return <section className="progress-section" aria-label="クイズの成績">
    <SectionHeader eyebrow="QUIZ PERFORMANCE" title="クイズの成績" action={<Link to="/jlpt" className="section-action">クイズへ <ArrowRight size={14} /></Link>} />
    {quizzes.completed ? <>
      <dl className="progress-quiz-stats">
        <div><dt>完了したクイズ</dt><dd>{count(quizzes.completed)}</dd></div>
        <div><dt>回答した問題</dt><dd>{count(quizzes.questions)}</dd></div>
        <div><dt>正解数</dt><dd>{count(quizzes.correct)}</dd></div>
        <div><dt>正解率</dt><dd>{percent(quizzes.accuracy)}</dd></div>
        <div><dt>平均スコア</dt><dd>{percent(quizzes.averageScore)}</dd></div>
      </dl>
      {modes.length > 0 && <ul className="progress-bars" aria-label="出題形式ごとの正解率">
        {modes.map((type) => { const stats = quizzes.byType[type]; const value = ratio(stats.correct, stats.answered); return <li key={type}><span className="progress-bars-label">{quizTypeLabels[type]}</span><Progress value={value * 100} label={`${quizTypeLabels[type]}: ${stats.answered}問中${stats.correct}問正解（${percent(value)}）`} /><strong>{stats.correct}/{stats.answered}</strong><small>{percent(value)}</small></li> })}
      </ul>}
      <ul className="progress-list" aria-label="最近のクイズ">
        {recentQuizzes.map((attempt) => <li key={attempt.id}><Link to={`/jlpt/${attempt.jlptLevel}/quiz/summary?attempt=${encodeURIComponent(attempt.id)}`} state={{ attemptId: attempt.id }}><span><strong>{attempt.jlptLevel} 語彙クイズ</strong><small>{timeLabel.format(attempt.completedAt)}</small></span><span>{attempt.correctCount}/{attempt.questionCount} 正解 <ArrowRight size={14} aria-hidden="true" /></span></Link></li>)}
      </ul>
      <p className="progress-note">正解率は全問題の正解数 ÷ 問題数、平均スコアは各クイズのスコアの平均です。</p>
    </> : <p className="progress-empty-line">完了したクイズはまだありません。JLPTの各レベルから語彙クイズに挑戦できます。</p>}
  </section>
}

function JlptSection({ state }: { state: LoadState<Map<JlptLevel, LevelProgress>> }) {
  return <section className="progress-section" aria-label="JLPT データセット上の進捗">
    <SectionHeader eyebrow="JLPT DATASET" title="データセット上の進捗" action={<Link to="/jlpt" className="text-icon-link" aria-label="JLPTの学習を開く"><ArrowRight size={16} /></Link>} />
    {state.status === 'loading' && <p className="progress-empty-line" role="status">JLPTデータを読み込んでいます…</p>}
    {state.status === 'error' && <p className="progress-empty-line" role="alert">JLPTのデータを読み込めませんでした。ほかの統計には影響ありません。</p>}
    {state.status === 'ready' && <div className="progress-jlpt">
      {levels.map((level) => { const progress = state.data.get(level); return <div className="progress-jlpt-level" key={level}>
        <Link to={`/jlpt/${level}`} className="progress-jlpt-badge" aria-label={`${level} レベルを開く`}><Badge>{level}</Badge></Link>
        <ul aria-label={`${level} の進捗`}>{(Object.keys(categoryLabels) as JlptCategory[]).map((category) => <JlptRow key={category} level={level} category={category} progress={progress?.[category]} />)}</ul>
      </div> })}
    </div>}
    <p className="progress-note">学習中または習得済みにした件数 ÷ このデータセットで各レベルに分類された件数です。公式JLPTシラバスの達成度ではありません。</p>
  </section>
}

function JlptRow({ level, category, progress }: { level: JlptLevel; category: JlptCategory; progress?: CategoryProgress }) {
  const label = categoryLabels[category]
  if (!progress?.available) return <li><span className="progress-bars-label">{label}</span><span className="progress-unavailable">該当データなし</span></li>
  const value = ratio(progress.studied, progress.available)
  return <li><span className="progress-bars-label">{label}</span><Progress value={value * 100} label={`${level} ${label}: データセット ${progress.available}件中 ${progress.studied}件を学習（学習中 ${progress.learning}・習得済み ${progress.known}）`} /><strong>{count(progress.studied)}<span>/{count(progress.available)}</span></strong></li>
}

function VocabularySection({ data }: { data: LocalProgress }) {
  const { vocabulary, studied } = data
  return <section className="progress-section" aria-label="単語の学習状況">
    <SectionHeader eyebrow="MY VOCABULARY" title="単語の学習状況" action={<Link to="/my-vocabulary" className="text-icon-link" aria-label="My Vocabulary を開く"><ArrowRight size={16} /></Link>} />
    {vocabulary.tracked ? <Distribution label={`対象の単語 ${vocabulary.tracked}語の学習状況`} items={[
      { key: 'unseen', label: '未学習', value: vocabulary.unseen, tone: 'muted' },
      { key: 'learning', label: '学習中', value: vocabulary.learning, tone: 'warning' },
      { key: 'known', label: '習得済み', value: vocabulary.known, tone: 'primary' },
      ...(vocabulary.suspended ? [{ key: 'suspended', label: '保留', value: vocabulary.suspended, tone: 'faint' }] : []),
    ]} /> : <p className="progress-empty-line">保存・作成した単語はまだありません。</p>}
    <p className="progress-note">対象は保存・作成・学習状況の設定・復習への追加をした単語 {count(vocabulary.tracked)}語です（辞書全体ではありません）。{studied.kanji || studied.grammar ? ` ほかに漢字 ${count(studied.kanji)}件・文法 ${count(studied.grammar)}件を学習中または習得済みにしています。` : ''}</p>
  </section>
}

function RecentActivitySection({ items }: { items: ResolvedActivity[] }) {
  return <section className="progress-section" aria-label="最近の学習">
    <SectionHeader eyebrow="RECENT ACTIVITY" title="最近の学習" />
    {items.length ? <ul className="progress-activity">{items.map((item) => <ActivityRow item={item} key={activityKey(item)} />)}</ul> : <p className="progress-empty-line">最近の学習記録はまだありません。</p>}
  </section>
}

function activityKey(item: ResolvedActivity) {
  switch (item.kind) {
    case 'review': return `review:${item.day}`
    case 'quiz': return `quiz:${item.attempt.id}`
    case 'custom-word': return `custom:${item.itemId}`
    case 'status': return `status:${item.itemType}:${item.itemId}`
    case 'saved-word': return `saved:${item.itemId}`
    case 'favorite': return `favorite:${item.itemType}:${item.itemId}`
  }
}

function ItemLink({ title, href, unavailable }: { title: string; href?: string; unavailable: boolean }) {
  return href ? <Link to={href} lang="ja">{title}</Link> : <span lang="ja" className={unavailable ? 'progress-unavailable' : undefined}>{title}</span>
}

function ActivityRow({ item }: { item: ResolvedActivity }) {
  const time = <time dateTime={new Date(item.at).toISOString()}>{timeLabel.format(item.at)}</time>
  if (item.kind === 'review') return <li><span className="progress-activity-icon"><RotateCcw size={15} aria-hidden="true" /></span><span className="progress-activity-copy"><strong>復習 {count(item.reviews)}件</strong><small>{item.resolved.length ? item.resolved.map((resolved, index) => <span key={resolved.itemType + resolved.itemId}>{index > 0 && '・'}<ItemLink {...resolved} /></span>) : '記録済みの復習'}</small></span>{time}</li>
  if (item.kind === 'quiz') return <li><span className="progress-activity-icon"><Sparkles size={15} aria-hidden="true" /></span><span className="progress-activity-copy"><strong>{item.attempt.jlptLevel} クイズを完了</strong><small><Link to={`/jlpt/${item.attempt.jlptLevel}/quiz/summary?attempt=${encodeURIComponent(item.attempt.id)}`} state={{ attemptId: item.attempt.id }}>{item.attempt.correctCount}/{item.attempt.questionCount} 正解</Link></small></span>{time}</li>
  if (item.kind === 'custom-word') return <li><span className="progress-activity-icon"><BookmarkPlus size={15} aria-hidden="true" /></span><span className="progress-activity-copy"><strong>単語を追加</strong><small><ItemLink {...item.resolved} /></small></span>{time}</li>
  if (item.kind === 'saved-word') return <li><span className="progress-activity-icon"><Bookmark size={15} aria-hidden="true" /></span><span className="progress-activity-copy"><strong>単語を保存</strong><small><ItemLink {...item.resolved} /></small></span>{time}</li>
  if (item.kind === 'favorite') return <li><span className="progress-activity-icon"><Star size={15} aria-hidden="true" /></span><span className="progress-activity-copy"><strong>お気に入りに追加</strong><small><ItemLink {...item.resolved} /></small></span>{time}</li>
  return <li><span className="progress-activity-icon"><CircleCheck size={15} aria-hidden="true" /></span><span className="progress-activity-copy"><strong>学習状況: {statusLabels[item.status]}</strong><small><ItemLink {...item.resolved} /></small></span>{time}</li>
}
