import { ArrowLeft, BookmarkPlus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { PageHeader } from '../../components/ui/page-header'
import { myVocabularyService } from '../../db/repositories/my-vocabulary'
import { NotebookRepository } from '../../db/repositories/user-data'
import type { Notebook, NotebookResolvedItem } from '../../types/domain'
import { AddToReviewButton, FavoriteButton, StudyStatusControl } from './LearningActions'

const notebooks = new NotebookRepository()

function NotebookContentRow({ item, onRemove }: { item: NotebookResolvedItem; onRemove: () => void }) {
  const typeName: Record<NotebookResolvedItem['itemType'], string> = { 'reference-word': 'Dictionary', 'custom-word': 'Custom', kanji: 'Kanji', grammar: 'Grammar' }
  return <li className={`notebook-content-row${item.unavailable ? ' is-unavailable' : ''}`}>
    <div className="notebook-content-main">
      <div className="notebook-content-title-line"><Badge>{typeName[item.itemType]}</Badge>{item.href ? <Link to={item.href} className="notebook-content-title">{item.title}</Link> : <strong className="notebook-content-title">{item.title}</strong>}</div>
      {item.reading && <span className="personal-word-reading" lang="ja">{item.reading}</span>}
      {item.meaning && <p className="personal-word-meaning">{item.meaning}</p>}
      {item.unavailable && <p className="personal-word-note">This item is no longer available in the current data. Its notebook membership is preserved.</p>}
    </div>
    <div className="notebook-content-actions">
      <FavoriteButton itemType={item.itemType} itemId={item.itemId} />
      {(item.itemType === 'reference-word' || item.itemType === 'custom-word') && <AddToReviewButton itemType={item.itemType} itemId={item.itemId} snapshot={{ word: item.title, reading: item.reading, meaningVi: item.meaning }} />}
      <StudyStatusControl itemType={item.itemType} itemId={item.itemId} />
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.title} from notebook`} onClick={onRemove}><Trash2 size={15} /></Button>
    </div>
  </li>
}

export function NotebookDetailPage() {
  const { id } = useParams()
  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [resolved, setResolved] = useState<NotebookResolvedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError('')
    try {
      const found = await notebooks.get(id)
      setNotebook(found ?? null)
      if (!found) { setResolved([]); return }
      const page = await notebooks.listItems(found.id, 200)
      setResolved(await myVocabularyService.resolveNotebookItems(page.items))
    } catch { setError('Notebook contents could not be loaded.') }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])
  async function remove(item: NotebookResolvedItem) {
    if (!id) return
    await notebooks.removeItem(id, item.itemType, item.itemId)
    await load()
  }
  if (loading) return <p className="content-state" role="status">Loading notebook…</p>
  if (!notebook) return <div className="organization-page"><EmptyState title="Notebook not found" description="It may have been deleted from this device." action={<Button asChild variant="secondary"><Link to="/notebook">Back to notebooks</Link></Button>} /></div>
  return <div className="organization-page">
    <Link className="dictionary-back-link" to="/notebook"><ArrowLeft size={15} /> Notebooks</Link>
    <PageHeader eyebrow="NOTEBOOK" title={notebook.name} description={`${resolved.length} ${resolved.length === 1 ? 'item' : 'items'} · Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(notebook.updatedAt)}`} action={<Button asChild variant="secondary"><Link to="/dictionary"><BookmarkPlus size={15} />Find items</Link></Button>} />
    {error && <p className="organization-error" role="alert">{error}</p>}
    {!resolved.length && <EmptyState icon={<BookmarkPlus size={20} />} title="No items in this notebook yet." description="Add a dictionary word, custom word, kanji, or grammar pattern to collect it here." action={<div className="organization-empty-actions"><Button asChild variant="secondary"><Link to="/dictionary">Search dictionary</Link></Button><Button asChild><Link to="/my-vocabulary/new">Add custom word</Link></Button></div>} />}
    {!!resolved.length && <ul className="notebook-content-list">{resolved.map((item) => <NotebookContentRow key={`${item.itemType}:${item.itemId}`} item={item} onRemove={() => void remove(item)} />)}</ul>}
  </div>
}
