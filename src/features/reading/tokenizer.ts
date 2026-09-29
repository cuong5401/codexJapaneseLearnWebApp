export interface ReadingToken {
  index: number
  surface: string
  reading?: string
  baseForm: string
  partOfSpeech?: string
  start: number
  end: number
  isPunctuation: boolean
  isKnown: boolean
}

type WorkerReply = { id: number; type: 'loading' | 'result' | 'error'; tokens?: ReadingToken[]; message?: string }
let worker: Worker | undefined
let requestId = 0
const pending = new Map<number, { resolve: (tokens: ReadingToken[]) => void; reject: (error: Error) => void; onLoading?: () => void }>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./tokenizer.worker.ts', import.meta.url), { type: 'module', name: 'kotoba-reading-tokenizer' })
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const task = pending.get(event.data.id)
    if (!task) return
    if (event.data.type === 'loading') { task.onLoading?.(); return }
    pending.delete(event.data.id)
    if (event.data.type === 'error') task.reject(new Error(event.data.message ?? 'The local tokenizer could not load.'))
    else task.resolve(event.data.tokens ?? [])
  }
  worker.onerror = (event) => {
    const detail = event.message || `The local tokenizer worker could not load (${event.filename || 'unknown worker'}:${event.lineno}).`
    for (const task of pending.values()) task.reject(new Error(detail))
    pending.clear(); worker?.terminate(); worker = undefined
  }
  return worker
}

export function tokenizeReading(text: string, onLoading?: () => void): Promise<ReadingToken[]> {
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject, onLoading })
    getWorker().postMessage({ id, text, dictionaryUrl: `${import.meta.env.BASE_URL}kuromoji/` })
  })
}

export function katakanaToHiragana(text: string): string {
  return text.replace(/[\u30a1-\u30f6]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function renderReadingMarkup(text: string, tokens: ReadingToken[], showFurigana: boolean, selectedIndex?: number): string {
  let output = ''
  let cursor = 0
  for (const token of tokens) {
    const start = Math.max(cursor, Math.min(text.length, token.start))
    const end = Math.max(start, Math.min(text.length, token.end))
    if (start > cursor) output += escapeHtml(text.slice(cursor, start))
    const surface = escapeHtml(text.slice(start, end))
    if (token.isPunctuation) output += surface
    else {
      const label = token.reading ? ` aria-label="${escapeHtml(`${token.surface}, ${katakanaToHiragana(token.reading)}`)}"` : ''
      const selected = token.index === selectedIndex ? ' is-keyboard-selected' : ''
      const reading = showFurigana && token.reading && token.reading !== token.surface && /[\u3400-\u9fff]/u.test(token.surface)
        ? `<ruby>${surface}<rt>${escapeHtml(katakanaToHiragana(token.reading))}</rt></ruby>`
        : surface
      output += `<span data-token-index="${Math.max(0, Math.trunc(token.index))}" class="reading-token${selected}"${label}>${reading}</span>`
    }
    cursor = end
  }
  if (cursor < text.length) output += escapeHtml(text.slice(cursor))
  return output
}
