import { afterEach, describe, expect, it, vi } from 'vitest'
import { pronounceJapanese, type JapaneseSpeechApi } from './speech'

class MockUtterance {
  lang = ''
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  constructor(readonly text: string) {}
}

describe('Japanese pronunciation helper', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('restarts speech and prefers an available ja-JP voice', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance as unknown as typeof SpeechSynthesisUtterance)
    const utterances: MockUtterance[] = []
    const cancel = vi.fn()
    const speak = vi.fn((utterance: SpeechSynthesisUtterance) => utterances.push(utterance as unknown as MockUtterance))
    const voice = { lang: 'ja-JP', name: 'Japanese' } as SpeechSynthesisVoice
    const api = { cancel, speak, getVoices: () => [voice] } as JapaneseSpeechApi
    expect(pronounceJapanese('すいせん', api)).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(utterances[0]).toMatchObject({ text: 'すいせん', lang: 'ja-JP', voice })
  })

  it('returns false when speech synthesis is unavailable', () => {
    expect(pronounceJapanese('かな', null)).toBe(false)
  })

  it('keeps the Japanese locale and uses the browser default when no Japanese voice is installed', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance as unknown as typeof SpeechSynthesisUtterance)
    let spoken: MockUtterance | undefined
    const api = { cancel: vi.fn(), speak: (utterance: SpeechSynthesisUtterance) => { spoken = utterance as unknown as MockUtterance }, getVoices: () => [] } as JapaneseSpeechApi
    expect(pronounceJapanese('かな', api)).toBe(true)
    expect(spoken).toMatchObject({ lang: 'ja-JP', voice: null })
  })
})
