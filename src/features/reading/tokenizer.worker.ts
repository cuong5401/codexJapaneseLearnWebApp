import kuromoji from './vendor/kuromoji.js'

interface TokenizerToken {
  surface_form: string
  reading?: string
  basic_form?: string
  pos?: string
  word_position?: number
}
interface ReadingToken {
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
type Request = { id: number; text: string; dictionaryUrl: string }

let tokenizer: { tokenize(text: string): TokenizerToken[] } | null = null
const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<Request>) => void): void
  postMessage(message: unknown): void
}

scope.addEventListener('message', (event: MessageEvent<Request>) => {
  const { id, text, dictionaryUrl } = event.data
  if (!tokenizer) {
    scope.postMessage({ id, type: 'loading' })
    kuromoji.builder({ dicPath: dictionaryUrl }).build((error, built) => {
      if (error) { scope.postMessage({ id, type: 'error', message: String(error) }); return }
      tokenizer = built
      tokenize(id, text)
    })
  } else tokenize(id, text)
})

function tokenize(id: number, text: string) {
  try {
    const source = tokenizer!.tokenize(text) as TokenizerToken[]
    let cursor = 0
    const tokens: ReadingToken[] = source.map((item, index) => {
      const surface = item.surface_form || ''
      let start = text.indexOf(surface, cursor)
      if (start < 0) start = Math.max(0, (item.word_position ?? cursor + 1) - 1)
      const end = start + surface.length
      cursor = end
      const reading = item.reading && item.reading !== '*' ? item.reading : undefined
      const baseForm = item.basic_form && item.basic_form !== '*' ? item.basic_form : surface
      return { index, surface, ...(reading ? { reading } : {}), baseForm, ...(item.pos ? { partOfSpeech: item.pos } : {}), start, end, isPunctuation: item.pos === '記号' || /^[\p{P}\p{S}\s]+$/u.test(surface), isKnown: Boolean(reading || item.basic_form) }
    })
    scope.postMessage({ id, type: 'result', tokens })
  } catch (error) { scope.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : 'Tokenization failed.' }) }
}
