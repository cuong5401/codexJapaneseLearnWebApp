import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { CustomWordRepository } from '../../db/repositories/custom-words'
import type { CustomWord } from '../../types/domain'

const words = new CustomWordRepository()
type WordFields = { word: string; reading: string; meaningsVi: string[]; meaningsEn: string[]; partsOfSpeech: string[]; notes: string; tags: string[] }
const blankFields: WordFields = { word: '', reading: '', meaningsVi: [''], meaningsEn: [''], partsOfSpeech: [], notes: '', tags: [] }
const cleanLines = (values: string[]) => values.map((value) => value.trim()).filter(Boolean)

function MeaningEditor({ label, values, onChange, describedBy }: { label: string; values: string[]; onChange: (values: string[]) => void; describedBy: string }) {
  const language = label === 'Vietnamese meanings' ? 'Vietnamese' : 'English'
  return <fieldset className="custom-meaning-fieldset"><legend>{label}</legend><div className="custom-meaning-list">
    {values.map((value, index) => <div className="custom-meaning-input-row" key={`${label}-${index}`}><label className="sr-only" htmlFor={`${label}-${index}`}>{label} {index + 1}</label><Input id={`${label}-${index}`} aria-describedby={describedBy} value={value} onChange={(event) => onChange(values.map((current, i) => i === index ? event.target.value : current))} placeholder={index === 0 ? `Add a ${language} meaning` : 'Another meaning'} /><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${language.toLowerCase()} meaning ${index + 1}`} disabled={values.length === 1} onClick={() => onChange(values.filter((_, i) => i !== index))}><X size={15} /></Button></div>)}
    <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...values, ''])}><Plus size={14} />Add meaning</Button>
  </div></fieldset>
}

export function CustomWordFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [fields, setFields] = useState<WordFields>(() => ({ ...blankFields, word: searchParams.get('word') ?? '' }))
  const [existing, setExisting] = useState<CustomWord | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [error, setError] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [posDraft, setPosDraft] = useState('')
  useEffect(() => {
    if (!id) return
    let live = true
    void words.getById(id).then((word) => {
      if (!live) return
      if (!word) { setError('This custom word could not be found.'); return }
      setExisting(word); setFields({ word: word.word, reading: word.reading, meaningsVi: word.meaningsVi.length ? word.meaningsVi : [''], meaningsEn: word.meaningsEn.length ? word.meaningsEn : [''], partsOfSpeech: word.partsOfSpeech, notes: word.notes ?? '', tags: word.tags ?? [] })
    }).catch(() => { if (live) setError('This custom word could not be loaded.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id])
  function set<K extends keyof WordFields>(key: K, value: WordFields[K]) { setFields((current) => ({ ...current, [key]: value })) }
  function addTag() { const value = tagDraft.trim(); if (value && !fields.tags.includes(value)) set('tags', [...fields.tags, value]); setTagDraft('') }
  function addPos() { const value = posDraft.trim(); if (value && !fields.partsOfSpeech.includes(value)) set('partsOfSpeech', [...fields.partsOfSpeech, value]); setPosDraft('') }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const payload = { ...fields, word: fields.word.trim(), reading: fields.reading.trim(), meaningsVi: cleanLines(fields.meaningsVi), meaningsEn: cleanLines(fields.meaningsEn), notes: fields.notes?.trim(), tags: fields.tags.map((tag) => tag.trim()).filter(Boolean) }
    try {
      const word = existing
        ? (await words.update(existing.id, payload), { ...existing, ...payload })
        : await words.create({ ...payload, sourceType: 'manual' })
      navigate(`/my-vocabulary/custom/${encodeURIComponent(word.id)}`, { replace: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your word could not be saved.') }
  }
  if (loading) return <p className="content-state" role="status">Loading custom word…</p>
  if (id && !existing) return <div className="organization-page"><PageHeader title="Word not found" /><p className="organization-error" role="alert">{error}</p><Button asChild variant="secondary"><Link to="/my-vocabulary">Back to My Vocabulary</Link></Button></div>

  return <div className="organization-page organization-form-page">
    <Link className="dictionary-back-link" to={existing ? `/my-vocabulary/custom/${encodeURIComponent(existing.id)}` : '/my-vocabulary'}>← My Vocabulary</Link>
    <PageHeader eyebrow="PERSONAL VOCABULARY" title={existing ? 'Edit custom word' : 'Add custom word'} description="Keep a word you want to remember, in your own words." />
    <form className="custom-word-form" onSubmit={(event) => void submit(event)}>
      <label className="organization-form-field" htmlFor="custom-word"><span>Word <b aria-hidden="true">*</b></span><Input id="custom-word" autoFocus maxLength={120} required aria-describedby={error ? 'custom-form-error' : undefined} value={fields.word} onChange={(event) => set('word', event.target.value)} placeholder="見落とす" /></label>
      <label className="organization-form-field" htmlFor="custom-reading"><span>Reading</span><Input id="custom-reading" aria-describedby={error ? 'custom-form-error custom-form-hint' : 'custom-form-hint'} maxLength={120} value={fields.reading} onChange={(event) => set('reading', event.target.value)} placeholder="みおとす" /></label>
      <p id="custom-form-hint" className="custom-form-hint">A reading or at least one meaning is required.</p>
      <div className="custom-meaning-grid"><MeaningEditor label="Vietnamese meanings" values={fields.meaningsVi} describedBy={error ? 'custom-form-error custom-form-hint' : 'custom-form-hint'} onChange={(value) => set('meaningsVi', value)} /><MeaningEditor label="English meanings" values={fields.meaningsEn} describedBy={error ? 'custom-form-error custom-form-hint' : 'custom-form-hint'} onChange={(value) => set('meaningsEn', value)} /></div>
      <div className="organization-form-field"><span>Parts of speech <small>Optional</small></span><div className="custom-chip-entry"><Input aria-label="Part of speech" value={posDraft} onChange={(event) => setPosDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addPos() } }} placeholder="noun, verb…" /><Button type="button" variant="secondary" size="sm" onClick={addPos}>Add</Button></div><div className="custom-chip-list">{fields.partsOfSpeech.map((pos) => <button type="button" key={pos} className="custom-chip" onClick={() => set('partsOfSpeech', fields.partsOfSpeech.filter((value) => value !== pos))}>{pos}<X size={12} aria-label="Remove" /></button>)}</div></div>
      <label className="organization-form-field" htmlFor="custom-notes"><span>Notes <small>Optional</small></span><textarea id="custom-notes" rows={3} maxLength={2000} value={fields.notes ?? ''} onChange={(event) => set('notes', event.target.value)} placeholder="A phrase, context, or reminder…" /></label>
      <div className="organization-form-field"><span>Tags <small>Optional</small></span><div className="custom-chip-entry"><Input aria-label="Tag" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="仕事" /><Button type="button" variant="secondary" size="sm" onClick={addTag}>Add</Button></div><div className="custom-chip-list">{fields.tags.map((tag) => <button type="button" key={tag} className="custom-chip" onClick={() => set('tags', fields.tags.filter((value) => value !== tag))}>{tag}<X size={12} aria-label="Remove" /></button>)}</div></div>
      {error && <p id="custom-form-error" className="organization-error" role="alert">{error}</p>}
      <div className="organization-form-actions"><Button asChild variant="ghost"><Link to={existing ? `/my-vocabulary/custom/${encodeURIComponent(existing.id)}` : '/my-vocabulary'}>Cancel</Link></Button><Button type="submit">{existing ? 'Save changes' : 'Save word'}</Button></div>
    </form>
  </div>
}
