import { ArrowLeft, BookOpen, Check, Clock3, FilePlus2, LoaderCircle, Pencil, Trash2, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { PageHeader } from '../../components/ui/page-header'
import { ensureLocalDatasetReady } from '../../db/initialization'
import { customWordRepository } from '../../db/repositories/custom-words'
import { readingDocumentRepository } from '../../db/repositories/reading-documents'
import { DictionaryRepository } from '../../db/repositories/reference'
import { SettingsRepository } from '../../db/repositories/user-data'
import { onlineLookupService } from '../dictionary/online-lookup-service'
import { AddToReviewButton, FavoriteButton, NotebookPicker, SaveReferenceWordButton } from '../organization/LearningActions'
import type { CustomWord, DictionaryEntry, ExternalDictionaryEntry, ReadingDocument } from '../../types/domain'
import { katakanaToHiragana, renderReadingMarkup, tokenizeReading, type ReadingToken } from './tokenizer'

const dictionary = new DictionaryRepository()
const settings = new SettingsRepository()
type Lookup = { kind: 'reference'; value: DictionaryEntry } | { kind: 'custom'; value: CustomWord } | { kind: 'online'; value: ExternalDictionaryEntry }
type Mode = 'list' | 'editor' | 'document'

function formatDate(value: number) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(value) }
function shortDate(value: number) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value) }

export function ReadingPage() {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const id = params.id
  const isNew = location.pathname === '/reading/new'
  const isEditing = location.pathname.endsWith('/edit')
  const mode: Mode = isNew || isEditing ? 'editor' : id ? 'document' : 'list'
  const [documents, setDocuments] = useState<ReadingDocument[]>([])
  const [document, setDocument] = useState<ReadingDocument | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [tokens, setTokens] = useState<ReadingToken[]>([])
  const [tokenState, setTokenState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [tokenizerFailure, setTokenizerFailure] = useState('')
  const [furigana, setFurigana] = useState(true)
  const [activeToken, setActiveToken] = useState<ReadingToken | null>(null)
  const [focusedTokenIndex, setFocusedTokenIndex] = useState<number | undefined>()
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [lookupState, setLookupState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [lookupMessage, setLookupMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const readerRef = useRef<HTMLDivElement>(null)
  const generation = useRef(0)

  const loadList = useCallback(async () => setDocuments(await readingDocumentRepository.list()), [])
  useEffect(() => { void loadList().catch(() => setMessage('Could not open your local reading library.')) }, [loadList])
  useEffect(() => {
    if (mode !== 'document' || !id) { setDocument(null); setTokens([]); setTokenState('idle'); return }
    let live = true
    setMessage('')
    void Promise.all([readingDocumentRepository.get(id), settings.get('reading.furigana')]).then(async ([saved, preference]) => {
      if (!live) return
      if (!saved) { setMessage('This reading document is not available.'); return }
      setDocument(saved); setText(saved.text); setTitle(saved.title)
      if (typeof preference?.value === 'boolean') setFurigana(preference.value)
      await ensureLocalDatasetReady()
      if (!live) return
      setTokenState('loading')
      const request = ++generation.current
      try {
        const nextTokens = await tokenizeReading(saved.text, () => live && setTokenState('loading'))
        if (live && request === generation.current) { setTokens(nextTokens); setTokenState('ready') }
      } catch (error) { if (live) { setTokens([]); setTokenState('error'); setTokenizerFailure(error instanceof Error ? error.message : 'The tokenizer could not start.') } }
    }).catch(() => { if (live) { setTokenState('error'); setMessage('Local data could not be opened. Your document text is still saved.') } })
    return () => { live = false; generation.current += 1 }
  }, [id, mode])


  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const saved = await readingDocumentRepository.save({ ...(id && !isNew ? { id } : {}), title, text })
      setDocument(saved); setTitle(saved.title); setText(saved.text); await loadList()
      navigate(`/reading/${saved.id}`, { replace: true })
    } catch { setMessage('Could not save this document to local storage.') }
    finally { setBusy(false) }
  }

  async function deleteDocument() {
    if (!document || !window.confirm(`Delete “${document.title}” from your reading library?`)) return
    await readingDocumentRepository.delete(document.id); await loadList(); navigate('/reading')
  }

  async function toggleFurigana() {
    const next = !furigana; setFurigana(next)
    try { await settings.set('reading.furigana', next) } catch { setMessage('Could not save the furigana preference.') }
  }

  async function openLookup(token: ReadingToken) {
    setActiveToken(token); setLookup(null); setLookupState('loading'); setLookupMessage('Checking your saved words and offline dictionary…')
    const candidates = [...new Set([token.baseForm, token.surface].filter(Boolean))]
    try {
      for (const candidate of candidates) {
        const custom = (await customWordRepository.findByWord(candidate))[0]
        if (custom) { setLookup({ kind: 'custom', value: custom }); setLookupState('ready'); setLookupMessage('From My Vocabulary'); return }
      }
      for (const candidate of candidates) {
        const entry = await dictionary.getByExactWord(candidate)
        if (entry) { setLookup({ kind: 'reference', value: entry }); setLookupState('ready'); setLookupMessage('From offline dictionary'); return }
      }
      if (token.reading) {
        const entry = await dictionary.getByExactReading(token.reading)
        if (entry) { setLookup({ kind: 'reference', value: entry }); setLookupState('ready'); setLookupMessage('Matched by reading in offline dictionary'); return }
      }
      const page = await import('../../db/sources/reference-source').then(({ referenceDataSource }) => referenceDataSource.dictionary.search(token.baseForm, { limit: 5 }))
      const ranked = page.items.find((entry) => entry.word === token.baseForm) ?? page.items.find((entry) => entry.word === token.surface) ?? page.items[0]
      if (ranked) { setLookup({ kind: 'reference', value: ranked }); setLookupState('ready'); setLookupMessage('From offline dictionary'); return }
      const online = await onlineLookupService.lookup(token.baseForm || token.surface)
      if (online) { setLookup({ kind: 'online', value: online }); setLookupState('ready'); setLookupMessage(`Online result · ${online.sourceProvider}`); return }
      setLookupState('ready'); setLookupMessage('No local or online match was found.')
    } catch (error) {
      setLookupState('error'); setLookupMessage(error instanceof Error ? error.message : 'Could not look up this word.')
    }
  }

  function moveToken(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const wordTokens = tokens.filter((token) => !token.isPunctuation)
    const current = wordTokens.findIndex((token) => token.index === (focusedTokenIndex ?? index))
    const next = wordTokens[Math.max(0, Math.min(wordTokens.length - 1, current + direction))]
    if (next) setFocusedTokenIndex(next.index)
  }

  const firstWordTokenIndex = useMemo(() => tokens.find((token) => !token.isPunctuation)?.index, [tokens])
  useEffect(() => { setFocusedTokenIndex(firstWordTokenIndex) }, [firstWordTokenIndex, id])
  const readingMarkup = useMemo(() => tokenState === 'ready' ? renderReadingMarkup(text, tokens, furigana, focusedTokenIndex) : '', [text, tokenState, tokens, furigana, focusedTokenIndex])

  return <section className="reading-page">
    {mode === 'list' && <><PageHeader eyebrow="STUDY SPACE" title="Reading" description="Read Japanese text, look up words, and keep passages on this device." action={<Button onClick={() => navigate('/reading/new')}><FilePlus2 size={16} />New reading</Button>} />
      <div className="reading-library-heading"><div><h2>Your reading library</h2><p>{documents.length ? `${documents.length} saved ${documents.length === 1 ? 'document' : 'documents'}` : 'Documents stay on this device.'}</p></div></div>
      {documents.length ? <ul className="reading-document-list">{documents.map((item) => <li key={item.id} className="reading-document-row"><Link to={`/reading/${item.id}`} className="reading-document-link"><span className="reading-document-icon"><BookOpen size={18} /></span><span className="reading-document-copy"><strong>{item.title}</strong><span lang="ja">{item.text.replace(/\s+/g, ' ').slice(0, 104) || 'No text yet'}</span></span><span className="reading-document-date"><Clock3 size={14} />{shortDate(item.updatedAt)}</span></Link><span className="reading-document-count">{item.text.length.toLocaleString()} chars</span></li>)}</ul> : <div className="reading-empty"><span className="reading-empty-icon"><BookOpen size={23} /></span><h2>No readings yet</h2><p>Paste a passage in Japanese. It will be saved on this device and available offline.</p><Button variant="secondary" onClick={() => navigate('/reading/new')}><FilePlus2 size={16} />Add your first text</Button></div>}
    </>}

    {mode === 'editor' && <><Link className="reading-back-link" to={id && !isNew ? `/reading/${id}` : '/reading'}><ArrowLeft size={15} />{id && !isNew ? 'Back to reading' : 'Reading library'}</Link><PageHeader eyebrow="READING · EDITOR" title={isNew ? 'New reading' : 'Edit reading'} description="Text is saved locally when you choose Save reading." />
      <form className="reading-editor" onSubmit={(event) => void saveDocument(event)}>
        <label className="reading-field"><span>Title <small>optional</small></span><Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="A short title for this passage" /></label>
        <label className="reading-field"><span>Japanese text</span><textarea className="reading-textarea" required value={text} onChange={(event) => setText(event.target.value)} placeholder="日本語の文章をここに貼り付けてください。" lang="ja" rows={15} /></label>
        <div className="reading-editor-footer"><span>{text.length.toLocaleString()} characters · Saved only on this device</span><Button disabled={busy || !text.trim()}>{busy ? 'Saving…' : <><Check size={16} />Save reading</>}</Button></div>
        {message && <p role="alert" className="reading-status reading-status-error">{message}</p>}
      </form>
    </>}

    {mode === 'document' && <>
      <Link className="reading-back-link" to="/reading"><ArrowLeft size={15} />Reading library</Link>
      {document && <><PageHeader eyebrow="READING · LOCAL DOCUMENT" title={document.title} description={`${document.text.length.toLocaleString()} characters · Last edited ${formatDate(document.updatedAt)}`} action={<div className="reading-document-actions"><Button variant="secondary" onClick={() => navigate(`/reading/${document.id}/edit`)}><Pencil size={15} />Edit text</Button><Button variant="quiet" aria-label="Delete reading" onClick={() => void deleteDocument()}><Trash2 size={16} /></Button></div>} />
        <div className="reading-toolbar"><span className="reading-source-state"><span className="local-indicator" />Text stays on this device</span><Button size="sm" variant="quiet" aria-pressed={furigana} onClick={() => void toggleFurigana()}><Volume2 size={15} />Furigana {furigana ? 'on' : 'off'}</Button></div>
        {tokenState === 'loading' && <div className="reading-tokenizer-status" role="status"><LoaderCircle size={17} className="reading-spin" /><span><strong>Preparing offline reading</strong><small>Loading Japanese word data the first time may take a moment. The text stays usable while this runs.</small></span></div>}
        {tokenState === 'error' && <p className="reading-tokenizer-fallback" role="status">Local word analysis could not load ({tokenizerFailure || 'local assets unavailable'}). Your text is available below as plain Japanese.</p>}
        <div ref={readerRef} className={`reading-prose${tokenState === 'ready' ? ' is-tokenized' : ''}`} role={tokenState === 'ready' ? 'group' : undefined} tabIndex={tokenState === 'ready' ? 0 : undefined} aria-label={tokenState === 'ready' ? 'Japanese text. Focus here, use arrow keys to move between words, and press Enter to look up the selected word.' : undefined} onKeyDown={(event) => { if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) moveToken(event, focusedTokenIndex ?? firstWordTokenIndex ?? 0); else if (event.key === 'Enter' && focusedTokenIndex !== undefined) { event.preventDefault(); const token = tokens.find((candidate) => candidate.index === focusedTokenIndex); if (token) void openLookup(token) } }} onClick={(event) => { const target = (event.target as HTMLElement).closest<HTMLElement>('[data-token-index]'); const token = target && tokens.find((candidate) => candidate.index === Number(target.dataset.tokenIndex)); if (token) { setFocusedTokenIndex(token.index); void openLookup(token) } }} lang="ja">
          {tokenState === 'ready' ? <span className="reading-markup" dangerouslySetInnerHTML={{ __html: readingMarkup }} /> : <span className="reading-plain-text">{text}</span>}
        </div>
        <p className="reading-help">Select a word to see its reading and meaning. {tokenState === 'ready' ? 'Arrow keys move between words; Enter opens a lookup.' : ''}</p>
        {message && <p className="reading-status reading-status-error" role="alert">{message}</p>}
        <WordLookup open={!!activeToken} onOpenChange={(open) => { if (!open) { setActiveToken(null); setLookup(null) } }} token={activeToken} lookup={lookup} lookupState={lookupState} message={lookupMessage} />
      </>}
    </>}
  </section>
}

function WordLookup({ open, onOpenChange, token, lookup, lookupState, message }: { open: boolean; onOpenChange: (open: boolean) => void; token: ReadingToken | null; lookup: Lookup | null; lookupState: 'loading' | 'ready' | 'error'; message: string }) {
  const navigate = useNavigate()
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  useEffect(() => { setSaveMessage('') }, [token?.index])
  const word = lookup?.value.word ?? token?.baseForm ?? token?.surface ?? ''
  const reading = lookup?.value.reading ?? (token?.reading ? katakanaToHiragana(token.reading) : '')
  const meaningsVi = lookup?.kind === 'reference' ? lookup.value.meanings.vi : lookup?.kind === 'custom' ? lookup.value.meaningsVi : lookup?.kind === 'online' ? lookup.value.meaningsVi : []
  const meaningsEn = lookup?.kind === 'reference' ? lookup.value.meanings.en : lookup?.kind === 'custom' ? lookup.value.meaningsEn : lookup?.kind === 'online' ? lookup.value.meaningsEn : []
  const partsOfSpeech = lookup?.kind === 'reference' ? lookup.value.partsOfSpeech : lookup?.kind === 'custom' ? lookup.value.partsOfSpeech : lookup?.kind === 'online' ? lookup.value.partsOfSpeech : token?.partOfSpeech ? [token.partOfSpeech] : []
  const localItem = lookup?.kind === 'reference' ? { itemType: 'reference-word' as const, itemId: lookup.value.id } : lookup?.kind === 'custom' ? { itemType: 'custom-word' as const, itemId: lookup.value.id } : null
  async function saveOnline() {
    if (lookup?.kind !== 'online') return
    setSaveBusy(true)
    try {
      const result = await customWordRepository.saveExternalWithResult(lookup.value)
      setSaveMessage(result.created ? 'Saved to My Vocabulary on this device.' : 'This word is already in My Vocabulary.')
      onOpenChange(false); navigate(`/my-vocabulary/custom/${result.word.id}`)
    } catch { setSaveMessage('Could not save this word locally.') }
    finally { setSaveBusy(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="reading-lookup-dialog" aria-describedby="reading-lookup-description">
    <div className="reading-lookup-head"><div><p className="eyebrow">WORD LOOKUP</p><DialogTitle lang="ja" className="reading-lookup-word">{token?.surface ?? 'Word'}{word !== token?.surface && <small>{word}</small>}</DialogTitle><DialogDescription id="reading-lookup-description">{message}</DialogDescription></div><span className={`reading-lookup-origin ${lookup?.kind === 'online' ? 'is-online' : ''}`}>{lookup?.kind === 'online' ? 'Online' : lookup ? 'Offline' : lookupState === 'error' ? 'Unavailable' : 'Checking'}</span></div>
    {lookupState === 'loading' && <div className="reading-lookup-loading" role="status"><LoaderCircle size={17} className="reading-spin" />Looking up {word}…</div>}
    {lookupState === 'error' && <p className="reading-status reading-status-error" role="alert">{message}</p>}
    {lookupState === 'ready' && lookup && <div className="reading-lookup-content">
      {(reading || token?.reading) && <p className="reading-lookup-reading" lang="ja">{reading || katakanaToHiragana(token?.reading ?? '')}</p>}
      {partsOfSpeech.length > 0 && <p className="reading-lookup-pos">{partsOfSpeech.slice(0, 3).join(' · ')}</p>}
      {meaningsVi.length > 0 && <section><h3>Vietnamese</h3><ul>{meaningsVi.slice(0, 4).map((meaning, index) => <li key={index}>{meaning}</li>)}</ul></section>}
      {meaningsEn.length > 0 && <section><h3>English</h3><ul>{meaningsEn.slice(0, 4).map((meaning, index) => <li key={index}>{meaning}</li>)}</ul></section>}
      {lookup.kind === 'reference' && <>{lookup.value.jlptLevel && <span className="reading-level-tag">{lookup.value.jlptLevel}</span>}<div className="reading-lookup-actions"><FavoriteButton {...localItem!} /><NotebookPicker {...localItem!} /><AddToReviewButton {...localItem!} snapshot={{ word: lookup.value.word, reading: lookup.value.reading, meaningVi: meaningsVi[0], meaningEn: meaningsEn[0] }} /><SaveReferenceWordButton entry={{ id: lookup.value.id, word: lookup.value.word, reading: lookup.value.reading, meanings: lookup.value.meanings }} /><Button variant="secondary" onClick={() => navigate(`/dictionary/${encodeURIComponent(lookup.value.id)}`)}>Full dictionary entry</Button></div></>}
      {lookup.kind === 'custom' && <><div className="reading-lookup-actions"><FavoriteButton {...localItem!} /><NotebookPicker {...localItem!} /><AddToReviewButton {...localItem!} snapshot={{ word: lookup.value.word, reading: lookup.value.reading, meaningVi: meaningsVi[0], meaningEn: meaningsEn[0] }} /><Button variant="secondary" onClick={() => navigate(`/my-vocabulary/custom/${encodeURIComponent(lookup.value.id)}`)}>Open saved word</Button></div></>}
      {lookup.kind === 'online' && <div className="reading-online-source">{lookup.value.sourceUrl ? <a href={lookup.value.sourceUrl} target="_blank" rel="noreferrer">Source: {lookup.value.sourceProvider}</a> : <span>Source: {lookup.value.sourceProvider}</span>}<Button disabled={saveBusy} onClick={() => void saveOnline()}>{saveBusy ? 'Saving…' : 'Save to My Vocabulary'}</Button>{saveMessage && <p role="status">{saveMessage}</p>}</div>}
    </div>}
    {lookupState === 'ready' && !lookup && <p className="reading-no-result">{message}</p>}
  </DialogContent></Dialog>
}
