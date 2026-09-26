import type { DictionaryEntry } from '../../types/domain'
import { normalizeJapanese } from '../../lib/japanese-normalization'
import { normalizeSearchInput, normalizeVietnamese } from '../../lib/search-normalization'

export const SYNTHETIC_DATA_TAG = 'dev-generated-synthetic'
export function generateSyntheticDictionary(count: number, datasetVersion = `synthetic-${Date.now()}`): DictionaryEntry[] {
  if (!Number.isInteger(count) || count < 1 || count > 100_000) throw new RangeError('synthetic record count must be between 1 and 100,000')
  return Array.from({ length: count }, (_, offset) => {
    const serial = String(offset + 1).padStart(6, '0')
    const word = `試験語${serial}`
    return {
      id: `synthetic-${serial}`, datasetVersion, word, reading: `しけんご${serial}`, normalizedWord: normalizeJapanese(word),
      normalizedReading: normalizeJapanese(`しけんご${serial}`), meanings: { vi: [`Dữ liệu thử nghiệm tổng hợp ${serial}`], en: [`Synthetic test record ${serial}`] },
      normalizedMeaningVi: [normalizeVietnamese(`du lieu thu nghiem tong hop ${serial}`)],
      normalizedMeaningEn: [normalizeSearchInput(`Synthetic test record ${serial}`)],
      partsOfSpeech: ['synthetic-test'], jlptLevel: null, isCommon: null, frequencyRank: null, kanjiIds: [], exampleSentenceIds: [], tags: [SYNTHETIC_DATA_TAG],
    }
  })
}
