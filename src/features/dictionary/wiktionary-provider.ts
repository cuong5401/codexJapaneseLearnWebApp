import type { ExternalDictionaryEntry } from '../../types/domain'
import { OnlineLookupError, normalizeExternalEntry, type OnlineDictionaryProvider } from './online-provider'

const API_ROOT = 'https://en.wiktionary.org/api/rest_v1/page/definition/'
const SOURCE_ROOT = 'https://en.wiktionary.org/wiki/'
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/u

type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
const asString = (value: unknown) => typeof value === 'string' ? value : ''

/** Reduce limited wiki markup to plain text. React renders the result as text, never HTML. */
export function wiktionaryPlainText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/gu, '$2')
    .replace(/\[([^\s\]]+)\s+([^\]]+)\]/gu, '$2')
    .replace(/\{\{[^{}]*\}\}/gu, ' ')
    .replace(/'{2,5}/gu, '')
    .replace(/&nbsp;/giu, ' ').replace(/&amp;/giu, '&').replace(/&lt;/giu, '<').replace(/&gt;/giu, '>').replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, ' ').trim()
}

function isJapaneseSection(value: JsonObject): boolean {
  const code = asString(value.languageCode ?? value.language_code ?? value.langCode ?? value.lang_code).toLowerCase()
  const label = asString(value.language ?? value.lang ?? value.languageName).toLowerCase()
  return code === 'ja' || label === 'japanese' || label === '日本語'
}

function collectDefinitions(value: unknown, out: JsonObject[], japaneseContext = false): void {
  if (Array.isArray(value)) { for (const child of value) collectDefinitions(child, out, japaneseContext); return }
  const current = object(value)
  if (!current) return
  const inJapanese = japaneseContext || isJapaneseSection(current)
  if (inJapanese && Array.isArray(current.definitions)) {
    for (const definition of current.definitions) {
      const item = object(definition)
      if (item) out.push({ ...current, ...item })
    }
  }
  for (const [key, child] of Object.entries(current)) {
    if (['japanese', 'ja'].includes(key.toLowerCase()) && child !== current.definitions) collectDefinitions(child, out, true)
    else if (key === 'definitions' && Array.isArray(child) && inJapanese) continue
    else if (typeof child === 'object' && child !== null) collectDefinitions(child, out, inJapanese)
  }
}

function extractReading(section: JsonObject, definitions: JsonObject[]): string {
  const candidates: unknown[] = [section.reading, section.kana, section.pronunciation, section.pronunciations]
  for (const definition of definitions) candidates.push(definition.reading, definition.kana, definition.pronunciation)
  for (const candidate of candidates) {
    const strings = Array.isArray(candidate) ? candidate.map((item) => typeof item === 'string' ? item : object(item)?.value).filter((item): item is string => typeof item === 'string') : [candidate]
    const reading = strings.map(wiktionaryPlainText).find((text) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u.test(text))
    if (reading) return reading
  }
  return ''
}

export function parseWiktionaryDefinitions(payload: unknown, query: string): ExternalDictionaryEntry[] {
  const root = object(payload)
  if (!root) throw new OnlineLookupError('invalid-response', 'Wiktionary returned an invalid response.')
  const hasDefinitionShape = Array.isArray(root.definitions) || Object.keys(root).some((key) => ['japanese', 'ja'].includes(key.toLowerCase()))
  if (!hasDefinitionShape) throw new OnlineLookupError('invalid-response', 'Wiktionary returned an unsupported definition format.')
  const groups: JsonObject[] = []
  collectDefinitions(root, groups)
  const meaningsEn: string[] = []
  const partsOfSpeech = new Set<string>()
  const examples: ExternalDictionaryEntry['examples'] = []
  let reading = ''
  for (const group of groups) {
    const rawDefinition = group.definition ?? group.text ?? group.gloss
    const candidates = Array.isArray(rawDefinition) ? rawDefinition : [rawDefinition]
    for (const candidate of candidates) {
      const text = wiktionaryPlainText(candidate)
      if (text && !JAPANESE.test(text) && meaningsEn.length < 12) meaningsEn.push(text)
    }
    const pos = wiktionaryPlainText(group.partOfSpeech ?? group.part_of_speech ?? group.pos)
    if (pos) partsOfSpeech.add(pos)
    if (!reading) reading = extractReading(group, [group])
    const rawExamples = group.examples ?? group.parsedExamples
    if (Array.isArray(rawExamples)) for (const raw of rawExamples) {
      const example = object(raw)
      const japanese = wiktionaryPlainText(typeof raw === 'string' ? raw : example?.text ?? example?.example ?? example?.japanese)
      if (japanese && JAPANESE.test(japanese) && examples.length < 3) examples.push({ japanese })
    }
  }
  const word = wiktionaryPlainText(root.word ?? root.title ?? query)
  if (!word || !JAPANESE.test(word) || !meaningsEn.length) return []
  const title = word.replace(/ /gu, '_')
  return [normalizeExternalEntry({
    word, reading, meaningsVi: [], meaningsEn: [...new Set(meaningsEn)], partsOfSpeech: [...partsOfSpeech], examples,
    sourceProvider: 'Wiktionary', sourceUrl: `${SOURCE_ROOT}${encodeURIComponent(title)}`,
  })]
}

export class WiktionaryOnlineDictionaryProvider implements OnlineDictionaryProvider {
  readonly id = 'wiktionary-en'
  async search(query: string, options: { signal?: AbortSignal } = {}): Promise<ExternalDictionaryEntry[]> {
    return this.lookupAll(query, options)
  }
  async lookup(word: string, options: { signal?: AbortSignal } = {}): Promise<ExternalDictionaryEntry | undefined> {
    return (await this.lookupAll(word, options))[0]
  }
  private async lookupAll(query: string, options: { signal?: AbortSignal }): Promise<ExternalDictionaryEntry[]> {
    const response = await fetch(`${API_ROOT}${encodeURIComponent(query.trim().replace(/ /gu, '_'))}`, { method: 'GET', headers: { Accept: 'application/json' }, signal: options.signal })
    if (response.status === 404) throw new OnlineLookupError('not-found', 'No Wiktionary page was found for this term.')
    if (response.status === 429) throw new OnlineLookupError('rate-limited', 'Wiktionary is temporarily rate limiting lookups.')
    if (response.status >= 500) throw new OnlineLookupError('provider-unavailable', 'Wiktionary is temporarily unavailable.')
    if (!response.ok) throw new OnlineLookupError('provider-unavailable', 'Wiktionary could not complete the lookup.')
    let payload: unknown
    try { payload = await response.json() } catch (cause) { throw new OnlineLookupError('invalid-response', 'Wiktionary returned unreadable data.', { cause }) }
    return parseWiktionaryDefinitions(payload, query)
  }
}
