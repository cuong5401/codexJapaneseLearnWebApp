import { describe, expect, it } from 'vitest'
import { preferredMeaning, secondaryMeaning } from './display-meaning'

describe('meaning language fallback', () => {
  it('prefers Vietnamese and offers English as secondary text', () => {
    const meanings = { vi: ['ăn'], en: ['to eat'] }
    expect(preferredMeaning(meanings)).toBe('ăn')
    expect(secondaryMeaning(meanings)).toBe('to eat')
  })
  it('shows English once when Vietnamese is absent or blank', () => {
    const meanings = { vi: [' '], en: ['to eat'] }
    expect(preferredMeaning(meanings)).toBe('to eat')
    expect(secondaryMeaning(meanings)).toBeUndefined()
    expect(preferredMeaning({ vi: [], en: [] })).toBeUndefined()
  })
})
