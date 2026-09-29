import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Pagination, PaginationSummary } from '../../components/ui/pagination'
import { pageCountFor, readPageParam } from '../../lib/pagination'
import type { JlptLevel } from '../../types/domain'
import type { LevelProgress } from '../jlpt/progress-model'
import { calculateCategoryProgress } from '../jlpt/progress-model'
import { ProgressView, type LoadState } from './ProgressPage'
import { createQuizAggregate, summarizeQuizzes, summarizeSrsCards, summarizeStudyActivity } from './progress-model'
import type { LocalProgress } from './progress-service'

const NOW = new Date(2026, 8, 29, 15).getTime()
const render = (element: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

function localProgress(patch: Partial<LocalProgress> = {}): LocalProgress {
  return {
    generatedAt: NOW, isEmpty: false,
    vocabulary: { tracked: 3, unseen: 1, learning: 1, known: 1, suspended: 0 },
    studied: { kanji: 0, grammar: 0 },
    activity: summarizeStudyActivity(new Map([[`2026-09-29`, 4]]), NOW),
    reviews: { total: 4, ratings: { 1: 1, 2: 0, 3: 2, 4: 1 } },
    srs: summarizeSrsCards([], NOW),
    quizzes: summarizeQuizzes(createQuizAggregate()),
    recentQuizzes: [], recentActivity: [],
    ...patch,
  }
}
const jlptReady: LoadState<Map<JlptLevel, LevelProgress>> = { status: 'ready', data: new Map((['N5', 'N4', 'N3', 'N2', 'N1'] as const).map((level) => [level, { vocabulary: calculateCategoryProgress(level === 'N5' ? 10 : 0, 1, 1), kanji: calculateCategoryProgress(0, 0, 0), grammar: calculateCategoryProgress(20, 0, 0) }])) }

describe('ProgressView states', () => {
  it('shows a loading status before local data is read', () => {
    const html = render(<ProgressView local={{ status: 'loading' }} jlpt={{ status: 'loading' }} />)
    expect(html).toContain('role="status"')
    expect(text(html)).toContain('学習データを読み込んでいます')
    expect(html).not.toContain('progress-overview')
  })

  it('shows an alert when local history cannot be read', () => {
    const html = render(<ProgressView local={{ status: 'error' }} jlpt={{ status: 'loading' }} />)
    expect(html).toContain('role="alert"')
    expect(text(html)).toContain('学習履歴を読み込めませんでした')
  })

  it('shows the empty state with study actions and no statistics', () => {
    const html = render(<ProgressView local={{ status: 'ready', data: localProgress({ isEmpty: true }) }} jlpt={jlptReady} />)
    expect(text(html)).toContain('まだ学習データがありません')
    for (const href of ['#/review', '#/dictionary', '#/jlpt']) expect(html).toContain(`href="/${href.slice(2)}"`)
    expect(html).not.toContain('progress-overview')
  })

  it('keeps local statistics visible when JLPT reference data fails', () => {
    const html = render(<ProgressView local={{ status: 'ready', data: localProgress() }} jlpt={{ status: 'error' }} />)
    expect(html).toContain('progress-overview')
    expect(text(html)).toContain('JLPTのデータを読み込めませんでした')
    expect(text(html)).toContain('評価の分布')
  })

  it('labels dataset progress, marks untagged levels, and never shows quiz accuracy without quizzes', () => {
    const html = render(<ProgressView local={{ status: 'ready', data: localProgress() }} jlpt={jlptReady} />)
    const content = text(html)
    expect(content).toContain('データセット上の進捗')
    expect(content).toContain('公式JLPTシラバスの達成度ではありません')
    expect(content).toContain('該当データなし')
    expect(content).toContain('完了したクイズはまだありません')
    expect(content).toContain('クイズの正解率とは異なります')
    expect([...html.matchAll(/role="progressbar"(?![^>]*aria-label)/g)]).toHaveLength(0)
  })
})

describe('pagination', () => {
  it('reads page parameters defensively and counts pages', () => {
    expect(readPageParam(new URLSearchParams('page=3'))).toBe(3)
    for (const bad of ['', 'page=0', 'page=-2', 'page=1.5', 'page=abc']) expect(readPageParam(new URLSearchParams(bad))).toBe(1)
    expect(pageCountFor(2211, 100)).toBe(23)
    expect(pageCountFor(99, 100)).toBe(1)
    expect(pageCountFor(0, 100)).toBe(1)
  })

  it('renders range text and hides controls for a single page', () => {
    expect(text(renderToStaticMarkup(<PaginationSummary page={23} pageSize={100} total={2211} shown={11} noun="characters" />))).toContain('Showing 2,201–2,211 of 2,211 characters')
    expect(renderToStaticMarkup(<Pagination page={1} pageCount={1} onChange={() => undefined} label="Pages" />)).toBe('')
    const html = renderToStaticMarkup(<Pagination page={1} pageCount={23} onChange={() => undefined} label="Kanji pages" />)
    expect(html).toContain('aria-label="Kanji pages"')
    expect(html.match(/<option/g)).toHaveLength(23)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Previous/)
  })
})
