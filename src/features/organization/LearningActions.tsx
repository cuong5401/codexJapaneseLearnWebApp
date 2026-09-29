import { BookmarkPlus, Check, Layers3, Star } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { FavoritesRepository, NotebookRepository, SavedReferenceVocabularyRepository, StudyRepository, SrsRepository } from '../../db/repositories/user-data'
import type { ItemType, Notebook, StudyStatus } from '../../types/domain'

const favorites = new FavoritesRepository()
const notebooks = new NotebookRepository()
const study = new StudyRepository()
const savedVocabulary = new SavedReferenceVocabularyRepository()
const srsRepository = new SrsRepository()

export function AddToReviewButton({ itemType, itemId, snapshot }: { itemType: Extract<ItemType, 'reference-word' | 'custom-word'>; itemId: string; snapshot?: { word?: string; reading?: string; meaningVi?: string; meaningEn?: string } }) {
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { let live = true; void srsRepository.getForItem(itemType, itemId).then((card) => { if (live) setSaved(!!card) }); return () => { live = false } }, [itemType, itemId])
  async function add() {
    setBusy(true); setMessage('')
    try { const result = await srsRepository.addToReview(itemType, itemId, snapshot); setSaved(true); setMessage(result.created ? 'Added to review.' : 'Already in review.') }
    catch { setMessage('Could not add this word to review.') }
    finally { setBusy(false) }
  }
  return <span className="review-add-action"><Button type="button" variant={saved ? 'secondary' : 'quiet'} className="learning-action-button" disabled={busy || saved} onClick={() => void add()}><Layers3 size={16} aria-hidden="true" />{saved ? 'In review' : 'Add to review'}</Button>{message && <span className="sr-only" role="status">{message}</span>}</span>
}

export function SaveReferenceWordButton({ entry }: { entry: { id: string; word: string; reading: string; meanings: { vi: string[]; en: string[] } } }) {
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { let live = true; void savedVocabulary.isSaved(entry.id).then((value) => { if (live) setSaved(value) }); return () => { live = false } }, [entry.id])
  async function toggle() {
    setBusy(true)
    try {
      if (saved) { await savedVocabulary.remove(entry.id); setSaved(false) }
      else { await savedVocabulary.save(entry); setSaved(true) }
    } finally { setBusy(false) }
  }
  return <Button type="button" variant={saved ? 'secondary' : 'quiet'} className="learning-action-button" aria-label={saved ? 'Remove from My Vocabulary' : 'Save to My Vocabulary'} aria-pressed={saved} disabled={busy} onClick={() => void toggle()}>
    {saved ? <Check size={16} aria-hidden="true" /> : <BookmarkPlus size={16} aria-hidden="true" />}{saved ? 'Saved to My Vocabulary' : 'Save word'}
  </Button>
}

export function FavoriteButton({ itemType, itemId, onChange }: { itemType: ItemType; itemId: string; onChange?: (favorite: boolean) => void }) {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { let live = true; void favorites.isFavorite(itemType, itemId).then((value) => { if (live) setActive(value) }); return () => { live = false } }, [itemType, itemId])
  async function toggle() { setBusy(true); try { const next = await favorites.toggle(itemType, itemId); setActive(next); onChange?.(next) } finally { setBusy(false) } }
  return <Button type="button" variant={active ? 'secondary' : 'quiet'} className="learning-action-button" aria-label={active ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={active} disabled={busy} onClick={() => void toggle()}>
    <Star size={16} aria-hidden="true" className={active ? 'favorite-icon is-favorite' : 'favorite-icon'} />{active ? 'Favorited' : 'Favorite'}
  </Button>
}

export function NotebookPicker({ itemType, itemId, onSaved }: { itemType: ItemType; itemId: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notebook[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const [page, current] = await Promise.all([notebooks.list(200), notebooks.getNotebookIds(itemType, itemId)])
    setItems(page.items); setSelected(current); setMessage('')
  }, [itemType, itemId])
  useEffect(() => { if (open) void load() }, [open, load])
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) }
  async function save() {
    setBusy(true); setMessage('')
    try {
      const current = await notebooks.getNotebookIds(itemType, itemId)
      const remove = current.filter((id) => !selected.includes(id))
      await Promise.all(remove.map((id) => notebooks.removeItem(id, itemType, itemId)))
      await notebooks.addItems(selected, itemType, itemId)
      setOpen(false)
      onSaved?.()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update notebooks.') }
    finally { setBusy(false) }
  }
  return <>
    <Button type="button" variant="secondary" className="learning-action-button" onClick={() => setOpen(true)}><BookmarkPlus size={16} aria-hidden="true" />Add to notebook</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="organization-dialog">
        <DialogTitle>Add to notebooks</DialogTitle>
        <DialogDescription>Choose one or more notebooks for this item.</DialogDescription>
        {items.length ? <div className="notebook-check-list">{items.map((notebook) => <label key={notebook.id} className="notebook-check-row"><input type="checkbox" checked={selected.includes(notebook.id)} onChange={() => toggle(notebook.id)} /><span>{notebook.name}</span></label>)}</div> : <div className="organization-empty-inline"><p>You haven’t created a notebook yet.</p><Link to="/notebook" onClick={() => setOpen(false)}>Create a notebook</Link></div>}
        {message && <p className="organization-error" role="alert">{message}</p>}
        <div className="organization-dialog-actions"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" disabled={busy || !items.length} onClick={() => void save()}><Check size={15} />Save</Button></div>
      </DialogContent>
    </Dialog>
  </>
}

export function LearningActions({ itemType, itemId, showStatus = false }: { itemType: ItemType; itemId: string; showStatus?: boolean }) {
  return <div className="learning-actions"><FavoriteButton itemType={itemType} itemId={itemId} /><NotebookPicker itemType={itemType} itemId={itemId} />{showStatus && <StudyStatusControl itemType={itemType} itemId={itemId} />}</div>
}

export function StudyStatusControl({ itemType, itemId, value, onChange }: { itemType: ItemType; itemId: string; value?: StudyStatus; onChange?: (value: StudyStatus) => void }) {
  const [status, setStatus] = useState<StudyStatus>(value ?? 'unseen')
  useEffect(() => { if (value !== undefined) { setStatus(value); return } let live = true; void study.getStatus(itemType, itemId).then((next) => { if (live) setStatus(next) }); return () => { live = false } }, [itemType, itemId, value])
  async function change(next: StudyStatus) { setStatus(next); await study.setStatus(itemType, itemId, next); onChange?.(next) }
  return <label className="study-status-control"><span>Status</span><select aria-label="Learning status" value={status} onChange={(event) => void change(event.target.value as StudyStatus)}>
    <option value="unseen">Unseen</option><option value="learning">Learning</option><option value="known">Known</option>
  </select></label>
}
