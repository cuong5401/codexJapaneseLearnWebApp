import { createHash } from 'node:crypto'

export const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1']
// Stable-ID buckets balance dictionary chunks near 200 records each while
// keeping reverse lookup deterministic. JLPT pages are materialized separately.
export const RECORD_BUCKETS = { dictionary: 1024, kanji: 16, grammar: 4, examples: 8 }
export const INDEX_BUCKETS = 1024
export const POSTING_LIMIT = 256
export const digest = (value) => createHash('sha256').update(value).digest('hex')
export const stableId = (namespace, value) => `${namespace}:${digest(value).slice(0, 24)}`
export function bucket(key, size) {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619)
  return ((hash >>> 0) % size).toString(16).padStart(4, '0')
}
export function searchBucket(key, size) {
  const separator = key.indexOf(':')
  assert(separator > 0, `Invalid search key: ${key}`)
  return bucket(key.slice(separator + 1), size)
}
export const japanese = (value) => value.normalize('NFKC').replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60)).toLowerCase().trim()
export const meaning = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim()
export const tokens = (value) => meaning(value).match(/[\p{L}\p{N}]+/gu) ?? []
export function prefixes(value) { return Array.from(value).map((_, index, chars) => chars.slice(0, index + 1).join('')) }
export function assert(condition, message) { if (!condition) throw new Error(message) }
export function validText(value, label, allowEmpty = false) {
  assert(typeof value === 'string' && (allowEmpty || value.trim()), `Invalid text: ${label}`)
  assert(!/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value), `Corrupt Unicode: ${label}`)
  return value
}
