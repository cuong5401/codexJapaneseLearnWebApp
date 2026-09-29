import { BookmarkPlus, Heart, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { NotebookRepository } from '../../db/repositories/user-data'
import { myVocabularyService, type MyVocabularyOptions } from '../../db/repositories/my-vocabulary'
import type { Notebook, PersonalVocabularyItem, StudyStatus } from '../../types/domain'
import { AddToReviewButton, FavoriteButton, NotebookPicker, StudyStatusControl } from './LearningActions'

const notebookRepository = new NotebookRepository()

function PersonalWordRow({ item, onChange }: { item: PersonalVocabularyItem; onChange: (status?: StudyStatus) => void }) {
  const path = item.itemType === 'reference-word' ? `/dictionary/${encodeURIComponent(item.itemId)}` : `/my-vocabulary/custom/${encodeURIComponent(item.itemId)}`
  return <li className="personal-word-row">
    <div className="personal-word-main">
      {item.unavailable ? <strong className="personal-word-title">{item.word}</strong> : <Link className="personal-word-title" to={path}>{item.word}</Link>}
      {item.reading && <span className="personal-word-reading" lang="ja">{item.reading}</span>}
      <p className="personal-word-meaning">{item.meaningsVi[0] ?? item.meaningsEn[0] ?? (item.unavailable ? 'This dictionary entry is no longer available.' : 'No meaning added yet.')}</p>
      {item.notes && <p className="personal-word-note">{item.notes}</p>}
      <div className="personal-word-meta"><Badge>{item.source === 'reference' ? 'Dictionary' : item.source === 'online-saved' ? 'Online saved' : 'Custom'}</Badge>{item.tags.slice(0, 3).map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}{item.notebookIds.length > 0 && <span>{item.notebookIds.length} notebook{item.notebookIds.length === 1 ? '' : 's'}</span>}</div>
    </div>
    <div className="personal-word-actions">
      <FavoriteButton itemType={item.itemType} itemId={item.itemId} onChange={() => onChange()} />
      <NotebookPicker itemType={item.itemType} itemId={item.itemId} onSaved={() => onChange()} />
      <AddToReviewButton itemType={item.itemType} itemId={item.itemId} snapshot={{ word: item.word, reading: item.reading, meaningVi: item.meaningsVi[0], meaningEn: item.meaningsEn[0] }} />
      <StudyStatusControl itemType={item.itemType} itemId={item.itemId} value={item.status} onChange={(value) => onChange(value)} />
    </div>
  </li>
}

export function MyVocabularyPage() {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<MyVocabularyOptions['source']>('all')
  const [status, setStatus] = useState<StudyStatus | 'all'>('all')
  const [notebookId, setNotebookId] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sort, setSort] = useState<MyVocabularyOptions['sort']>('recent-added')
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [items, setItems] = useState<PersonalVocabularyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => { void notebookRepository.list(200).then((page) => setNotebooks(page.items)) }, [])
  useEffect(() => {
    let live = true
    setLoading(true); setError('')
    void myVocabularyService.list({ query, source, status, notebookId, favoritesOnly, sort, limit: 200 }).then((rows) => {
      if (live) setItems(rows)
    }).catch(() => { if (live) setError('Your vocabulary could not be loaded. Try again.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [query, source, status, notebookId, favoritesOnly, sort, revision])

  const hasSavedItems = items.length > 0 || query.length > 0 || status !== 'all' || source !== 'all' || notebookId !== 'all' || favoritesOnly
  return <div className="organization-page">
    <PageHeader eyebrow="YOUR STUDY SPACE" title="My Vocabulary" description="Words you’ve saved from the dictionary and words you’ve created." action={<Button asChild><Link to="/my-vocabulary/new"><Plus size={16} />Add custom word</Link></Button>} />
    <div className="organization-controls" aria-label="Filter personal vocabulary">
      <label className="organization-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search your vocabulary</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search word, meaning, notes, or tags" /></label>
      <label className="organization-filter"><span>Source</span><select value={source} onChange={(event) => setSource(event.target.value as MyVocabularyOptions['source'])}><option value="all">All sources</option><option value="reference">Dictionary</option><option value="custom">Custom</option></select></label>
      <label className="organization-filter"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as StudyStatus | 'all')}><option value="all">All statuses</option><option value="unseen">Unseen</option><option value="learning">Learning</option><option value="known">Known</option></select></label>
      <label className="organization-filter"><span>Notebook</span><select value={notebookId} onChange={(event) => setNotebookId(event.target.value)}><option value="all">All notebooks</option>{notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}</select></label>
      <label className="organization-filter"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as MyVocabularyOptions['sort'])}><option value="recent-added">Recently added</option><option value="recent-updated">Recently updated</option><option value="lexical">Japanese order</option><option value="status">Learning status</option></select></label>
      <label className="organization-favorites-filter"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /><Heart size={15} aria-hidden="true" />Favorites only</label>
    </div>
    {error && <p className="organization-error" role="alert">{error}</p>}
    {!loading && items.length === 0 && <EmptyState icon={<BookmarkPlus size={20} />} title={hasSavedItems ? 'No matching words' : 'Your saved vocabulary will appear here.'} description={hasSavedItems ? 'Try another search or clear a filter.' : 'Save a dictionary word or add a word of your own to start a personal collection.'} action={!hasSavedItems && <div className="organization-empty-actions"><Button asChild variant="secondary"><Link to="/dictionary">Search dictionary</Link></Button><Button asChild><Link to="/my-vocabulary/new">Add custom word</Link></Button></div>} />}
    {loading && <p className="content-state" role="status">Loading your vocabulary…</p>}
    {items.length > 0 && <><p className="content-result-count">{items.length}{items.length === 200 ? '+' : ''} saved {items.length === 1 ? 'word' : 'words'}</p><ul className="personal-word-list">{items.map((item) => <PersonalWordRow key={`${item.itemType}:${item.itemId}`} item={item} onChange={(nextStatus) => { if (nextStatus) setItems((current) => current.map((row) => row.itemId === item.itemId && row.itemType === item.itemType ? { ...row, status: nextStatus } : row)); setRevision((current) => current + 1) }} />)}</ul></>}
  </div>
}
