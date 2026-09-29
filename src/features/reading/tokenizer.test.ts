import { describe, expect, it } from 'vitest'
import { katakanaToHiragana, renderReadingMarkup, type ReadingToken } from './tokenizer'

describe('reading token display helpers', () => {
  it('converts Katakana readings to Hiragana and preserves long-vowel marks', () => {
    expect(katakanaToHiragana('トショカン')).toBe('としょかん')
    expect(katakanaToHiragana('コーヒー')).toBe('こーひー')
  })

  it('renders escaped clickable token markup and useful kanji furigana', () => {
    const text = '<img src=x> 猫です。'
    const start = text.indexOf('猫')
    const tokens: ReadingToken[] = [
      { index: 0, surface: '猫', reading: 'ネコ', baseForm: '猫', start, end: start + 1, isPunctuation: false, isKnown: true },
      { index: 1, surface: 'です。', baseForm: 'です。', start: start + 1, end: text.length, isPunctuation: true, isKnown: false },
    ]
    const html = renderReadingMarkup(text, tokens, true, 0)
    expect(html).toContain('&lt;img src=x&gt; ')
    expect(html).not.toContain('<img')
    expect(html).toContain('<ruby>猫<rt>ねこ</rt></ruby>')
    expect(html).toContain('data-token-index="0"')
    expect(html).toContain('is-keyboard-selected')
  })
})
