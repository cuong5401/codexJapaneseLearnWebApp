import { BookOpen, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { Input } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { NotebookRepository } from '../../db/repositories/user-data'
import type { Notebook } from '../../types/domain'

const repository = new NotebookRepository()
type NotebookRow = Notebook & { itemCount: number }

export function NotebookListPage() {
  const [rows, setRows] = useState<NotebookRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [editing, setEditing] = useState<Notebook | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<Notebook | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { const page = await repository.list(200); setRows(await Promise.all(page.items.map(async (notebook) => ({ ...notebook, itemCount: await repository.countItems(notebook.id) })))) }
    catch { setError('Your notebooks could not be loaded.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try { await repository.create(createName); setCreateName(''); setShowCreate(false); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Notebook could not be created.') }
    finally { setBusy(false) }
  }
  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return
    setBusy(true); setError('')
    try { await repository.rename(editing.id, editName); setEditing(null); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Notebook could not be renamed.') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!deleting) return
    setBusy(true); setError('')
    try { await repository.remove(deleting.id); setDeleting(null); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Notebook could not be deleted.') }
    finally { setBusy(false) }
  }
  return <div className="organization-page">
    <PageHeader eyebrow="YOUR STUDY SPACE" title="Notebooks" description="Group saved words, kanji, and grammar into your own topics." action={<Button type="button" onClick={() => { setShowCreate((value) => !value); setError('') }}><Plus size={16} />New notebook</Button>} />
    {showCreate && <form className="notebook-create-form" onSubmit={(event) => void create(event)}><label htmlFor="notebook-name">Notebook name</label><div><Input id="notebook-name" autoFocus maxLength={60} value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="仕事, 旅行, N2…" /><Button type="submit" disabled={busy}>Create</Button></div></form>}
    {error && <p className="organization-error" role="alert">{error}</p>}
    {loading && <p className="content-state" role="status">Loading notebooks…</p>}
    {!loading && rows.length === 0 && <EmptyState icon={<BookOpen size={20} />} title="No items in this notebook space yet." description="Create a topic notebook, then add vocabulary, kanji, or grammar from its detail page." action={<Button type="button" variant="secondary" onClick={() => setShowCreate(true)}>Create your first notebook</Button>} />}
    {!!rows.length && <ul className="notebook-list">{rows.map((notebook) => <li className="notebook-list-row" key={notebook.id}>
      <Link to={`/notebook/${encodeURIComponent(notebook.id)}`} className="notebook-list-main"><span className="notebook-list-icon"><BookOpen size={18} /></span><span className="notebook-list-copy"><strong>{notebook.name}</strong><small>{notebook.itemCount} {notebook.itemCount === 1 ? 'item' : 'items'} · Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(notebook.updatedAt)}</small></span><MoreHorizontal className="notebook-list-chevron" size={17} /></Link>
      <div className="notebook-row-actions"><Button type="button" size="sm" variant="ghost" aria-label={`Rename ${notebook.name}`} onClick={() => { setEditing(notebook); setEditName(notebook.name); setError('') }}><Pencil size={14} />Rename</Button><Button type="button" size="sm" variant="ghost" className="button-danger" aria-label={`Delete ${notebook.name}`} onClick={() => setDeleting(notebook)}><Trash2 size={14} />Delete</Button></div>
    </li>)}</ul>}
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}><DialogContent className="organization-dialog"><DialogTitle>Rename notebook</DialogTitle><DialogDescription>Choose a name of up to 60 characters.</DialogDescription><form className="organization-dialog-form" onSubmit={(event) => void rename(event)}><label htmlFor="rename-notebook">Name</label><Input id="rename-notebook" autoFocus maxLength={60} value={editName} onChange={(event) => setEditName(event.target.value)} />{error && <p className="organization-error" role="alert">{error}</p>}<div className="organization-dialog-actions"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>Save name</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null) }}><DialogContent className="organization-dialog"><DialogTitle>Delete “{deleting?.name}”?</DialogTitle><DialogDescription>This removes the notebook and its membership links only. The words, kanji, grammar, study status, and other notebooks stay in your collection.</DialogDescription>{error && <p className="organization-error" role="alert">{error}</p>}<div className="organization-dialog-actions"><Button type="button" variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button><Button type="button" className="button-danger" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />Delete notebook</Button></div></DialogContent></Dialog>
  </div>
}
