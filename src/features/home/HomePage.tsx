import { ArrowRight, BookOpen, RotateCcw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { SearchHistoryRepository, SrsRepository, StudyRepository } from '../../db/repositories/user-data'
import { referenceDataSource } from '../../db/sources/reference-source'
import { ensureLocalDatasetReady } from '../../db/initialization'
import { getAllLevelsProgress } from '../jlpt/progress-model'
import { preferredMeaning } from '../../lib/display-meaning'
import type { DictionaryEntry, SearchHistory } from '../../types/domain'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { Progress } from '../../components/ui/progress'
import { SectionHeader } from '../../components/ui/section-header'
import { uiCopy } from '../../app/copy'
import { ReferenceAttribution } from '../dictionary/ReferenceAttribution'

const jlptLevels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const

function todayLabel() {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
}

const searchHistoryRepository = new SearchHistoryRepository()
const srsRepository = new SrsRepository()
const studyRepository = new StudyRepository()

export function HomePage() {
  const navigate = useNavigate()
  const [vocabulary, setVocabulary] = useState<DictionaryEntry[]>([])
  const [recentSearches, setRecentSearches] = useState<SearchHistory[]>([])
  const [reviewCount, setReviewCount] = useState<number | null>(null)
  const [jlptProgress, setJlptProgress] = useState<Awaited<ReturnType<typeof getAllLevelsProgress>> | null>(null)
  useEffect(() => { let live = true; void Promise.all([searchHistoryRepository.list(6), srsRepository.counts(), ensureLocalDatasetReady().then(async () => { const [levels, words] = await Promise.all([getAllLevelsProgress(referenceDataSource, studyRepository), referenceDataSource.dictionary.getByJlptLevel('N5', { limit: 6 })]); return { levels, words: words.items } })]).then(([searches, counts, levels]) => { if (live) { setRecentSearches(searches); setReviewCount(counts.due + counts.learning); setJlptProgress(levels.levels); setVocabulary(levels.words) } }).catch(() => { if (live) { setRecentSearches([]); setJlptProgress(null) } }); return () => { live = false } }, [])
  const continueItems = [
    { title: 'N5 Vocabulary', progress: jlptProgress?.get('N5')?.vocabulary, icon: BookOpen, path: '/jlpt/N5/vocabulary' },
    { title: 'Grammar N5', progress: jlptProgress?.get('N5')?.grammar, icon: Sparkles, path: '/jlpt/N5/grammar' },
  ].map((item) => ({ ...item, detail: item.progress ? `${item.progress.studied} studied / ${item.progress.available} available` : 'Reference data unavailable', value: item.progress?.available ? Math.round(item.progress.studied * 100 / item.progress.available) : 0 }))
  return <div className="home-page">
    <PageHeader eyebrow={todayLabel()} title="おはようございます" description="今日も少しずつ、日本語に触れていきましょう。" />

    <section className="review-callout" aria-labelledby="review-heading">
      <div className="review-callout-icon"><RotateCcw size={19} /></div>
      <div className="review-callout-copy"><p className="eyebrow">{uiCopy.home.reviewEyebrow}</p><h2 id="review-heading">{reviewCount === null ? 'Review queue' : `${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'} due`}</h2><p>{reviewCount === 0 ? 'No cards due now. Add words to review or come back later.' : uiCopy.home.reviewDescription}</p></div>
      <Button onClick={() => navigate('/review')} className="review-cta">{uiCopy.home.openReview} <ArrowRight size={16} /></Button>
    </section>

    <div className="home-grid">
      <div className="home-main-column">
        <section className="home-section continue-section">
          <SectionHeader title={uiCopy.home.continueLearning} eyebrow={uiCopy.home.continueEyebrow} />
          <div className="continue-list">
            {continueItems.map(({ title, detail, value, icon: Icon, path }) => <Link className="continue-row" to={path} key={title}>
              <span className="continue-icon"><Icon size={18} /></span>
              <span className="continue-copy"><strong>{title}</strong><small>{detail}</small></span>
              <span className="continue-progress"><Progress value={value} label={`${title} ${value}% complete`} /><small>{value}%</small></span>
              <ArrowRight className="continue-arrow" size={16} />
            </Link>)}
          </div>
        </section>

        <section className="home-section vocabulary-section">
          <SectionHeader title="Explore N5 vocabulary" eyebrow={uiCopy.home.vocabularyEyebrow} action={<Link to="/dictionary" className="section-action">{uiCopy.home.openDictionary} <ArrowRight size={14} /></Link>} />
          <div className="vocabulary-table" role="list" aria-label="N5 reference vocabulary">
            {!vocabulary.length && <p className="content-subtle">Reference vocabulary will appear when data is available.</p>}
            {vocabulary.map((item) => <Link to={`/dictionary/${encodeURIComponent(item.id)}`} className="vocabulary-row" role="listitem" key={item.id}>
              <span className="vocab-word">{item.word}</span><span className="vocab-reading">{item.reading}</span><span className="vocab-meaning">{preferredMeaning(item.meanings) ?? 'Meaning unavailable'}</span>{item.jlptLevel && <Badge>{item.jlptLevel}</Badge>}
            </Link>)}
          </div>
        </section>
        <ReferenceAttribution />
      </div>

      <aside className="home-side-column">
        <section className="home-section jlpt-section">
          <SectionHeader title={uiCopy.home.jlptProgress} eyebrow={uiCopy.home.jlptEyebrow} action={<Link to="/jlpt" className="text-icon-link" aria-label={uiCopy.home.viewJlpt}><ArrowRight size={16} /></Link>} />
          <div className="jlpt-list">
            {jlptLevels.map((level) => { const progress = jlptProgress?.get(level)?.vocabulary; const value = progress?.available ? progress.studied * 100 / progress.available : 0; return <div className="jlpt-row" key={level}><Badge>{level}</Badge><Progress value={value} label={`${level} dataset progress: ${progress?.studied ?? 0} of ${progress?.available ?? 0} available vocabulary records studied`} /><span className="jlpt-percent">{jlptProgress ? `${progress?.studied ?? 0}/${progress?.available ?? 0}` : '—'}</span></div>})}
          </div>
          <p className="home-jlpt-note">Dataset progress only; not full JLPT syllabus completion.</p>
          <Link to="/progress" className="section-action">View learning progress <ArrowRight size={14} /></Link>
        </section>

        <section className="home-section recent-section">
          <SectionHeader title={uiCopy.home.recentlySearched} eyebrow={uiCopy.home.recentEyebrow} action={<Link to="/dictionary" className="text-icon-link" aria-label={uiCopy.home.openDictionary}><ArrowRight size={16} /></Link>} />
          <ul className="recent-list">
            {recentSearches.length ? recentSearches.map((item) => <li key={item.id}><Link to={`/dictionary?q=${encodeURIComponent(item.query)}`} className="recent-row"><span className="recent-word"><strong>{item.query}</strong><small>Recent lookup</small></span><span className="recent-meaning">Open search</span></Link></li>) : <li className="recent-empty">Your dictionary searches will appear here.</li>}
          </ul>
        </section>
      </aside>
    </div>
  </div>
}
