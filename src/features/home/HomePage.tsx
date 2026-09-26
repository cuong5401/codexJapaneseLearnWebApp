import { ArrowRight, BookOpen, Flame, RotateCcw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { SearchHistoryRepository } from '../../db/repositories/user-data'
import type { SearchHistory } from '../../types/domain'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { Progress } from '../../components/ui/progress'
import { SectionHeader } from '../../components/ui/section-header'
import { uiCopy } from '../../app/copy'

const jlptProgress = [
  { level: 'N5', value: 92 }, { level: 'N4', value: 75 }, { level: 'N3', value: 41 }, { level: 'N2', value: 18 }, { level: 'N1', value: 3 },
]

const vocabulary = [
  { word: '改善', reading: 'かいぜん', meaning: 'cải thiện', level: 'N3' },
  { word: '郵便局', reading: 'ゆうびんきょく', meaning: 'bưu điện', level: 'N5' },
  { word: '影響', reading: 'えいきょう', meaning: 'ảnh hưởng', level: 'N3' },
  { word: '上昇', reading: 'じょうしょう', meaning: 'tăng lên', level: 'N2' },
  { word: '対応', reading: 'たいおう', meaning: 'ứng phó', level: 'N3' },
  { word: '読解', reading: 'どっかい', meaning: 'đọc hiểu', level: 'N3' },
]

const continueItems = [
  { title: 'N3 Vocabulary', detail: '72 / 100 words', value: 72, icon: BookOpen, path: '/jlpt' },
  { title: 'Grammar N3', detail: '31 / 50 patterns', value: 62, icon: Sparkles, path: '/grammar' },
]

function todayLabel() {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
}

const searchHistoryRepository = new SearchHistoryRepository()

export function HomePage() {
  const navigate = useNavigate()
  const [recentSearches, setRecentSearches] = useState<SearchHistory[]>([])
  useEffect(() => { void searchHistoryRepository.list(6).then(setRecentSearches).catch(() => setRecentSearches([])) }, [])
  return <div className="home-page">
    <PageHeader eyebrow={todayLabel()} title="おはようございます" description="今日も少しずつ、日本語に触れていきましょう。" />

    <section className="review-callout" aria-labelledby="review-heading">
      <div className="review-callout-icon"><RotateCcw size={19} /></div>
      <div className="review-callout-copy"><p className="eyebrow">{uiCopy.home.reviewEyebrow}</p><h2 id="review-heading">{uiCopy.home.reviewsDue}</h2><p>{uiCopy.home.reviewDescription}</p></div>
      <Button onClick={() => navigate('/review')} className="review-cta">{uiCopy.home.openReview} <ArrowRight size={16} /></Button>
    </section>

    <div className="summary-strip" aria-label={uiCopy.home.studySummary}>
      <div className="summary-item"><div className="summary-label"><span>{uiCopy.home.dailyGoal}</span><span className="summary-value">18 <span>/ 30 {uiCopy.home.words}</span></span></div><Progress value={60} label={`${uiCopy.home.dailyGoal} 18 of 30 ${uiCopy.home.words}`} /></div>
      <div className="summary-separator" />
      <div className="summary-stat"><span className="summary-stat-icon goal-icon"><BookOpen size={17} /></span><span><small>{uiCopy.home.studiedToday}</small><strong>18 <em>{uiCopy.home.words}</em></strong></span></div>
      <div className="summary-separator" />
      <div className="summary-stat"><span className="summary-stat-icon streak-icon"><Flame size={17} /></span><span><small>{uiCopy.home.studyStreak}</small><strong>12 <em>{uiCopy.home.days}</em></strong></span></div>
    </div>

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
          <SectionHeader title={uiCopy.home.todaysVocabulary} eyebrow={uiCopy.home.vocabularyEyebrow} action={<Link to="/dictionary" className="section-action">{uiCopy.home.openDictionary} <ArrowRight size={14} /></Link>} />
          <div className="vocabulary-table" role="list" aria-label={uiCopy.home.todaysVocabulary}>
            {vocabulary.map((item) => <Link to="/dictionary" className="vocabulary-row" role="listitem" key={item.word}>
              <span className="vocab-word">{item.word}</span><span className="vocab-reading">{item.reading}</span><span className="vocab-meaning">{item.meaning}</span><Badge>{item.level}</Badge>
            </Link>)}
          </div>
        </section>
      </div>

      <aside className="home-side-column">
        <section className="home-section jlpt-section">
          <SectionHeader title={uiCopy.home.jlptProgress} eyebrow={uiCopy.home.jlptEyebrow} action={<Link to="/jlpt" className="text-icon-link" aria-label={uiCopy.home.viewJlpt}><ArrowRight size={16} /></Link>} />
          <div className="jlpt-list">
            {jlptProgress.map(({ level, value }) => <div className="jlpt-row" key={level}><Badge tone={level === 'N3' ? 'primary' : 'neutral'}>{level}</Badge><Progress value={value} label={`${level} progress ${value}%`} /><span className="jlpt-percent">{value}%</span></div>)}
          </div>
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
