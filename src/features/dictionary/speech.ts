export interface JapaneseSpeechApi {
  cancel(): void
  speak(utterance: SpeechSynthesisUtterance): void
  getVoices(): SpeechSynthesisVoice[]
}

export function pronounceJapanese(text: string, api?: JapaneseSpeechApi | null): boolean {
  const speech = api === undefined
    ? (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)
    : api
  if (!speech || !text.trim() || typeof SpeechSynthesisUtterance === 'undefined') return false
  try {
    speech.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ja-JP'
    utterance.rate = 0.92
    const voices = speech.getVoices()
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === 'ja-jp')
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('ja-'))
      ?? null
    speech.speak(utterance)
    return true
  } catch {
    return false
  }
}
