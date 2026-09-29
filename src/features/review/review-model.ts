import { db } from '../../db/database'
import { CustomWordRepository } from '../../db/repositories/custom-words'
import { referenceDataSource } from '../../db/sources/reference-source'
import type { ExampleSentence, SrsCard } from '../../types/domain'

export interface ReviewCardViewModel {
  word: string
  reading: string
  meaningsVi: string[]
  meaningsEn: string[]
  example?: ExampleSentence
  unavailable: boolean
}

const customWords = new CustomWordRepository()

export async function buildReviewCardViewModel(card: SrsCard): Promise<ReviewCardViewModel> {
  if (card.itemType === 'reference-word') {
    const entry = await referenceDataSource.dictionary.getById(card.itemId)
    if (entry) {
      const [example] = await referenceDataSource.examples.getByIds(entry.exampleSentenceIds, { limit: 1 })
      return { word: entry.word, reading: entry.reading, meaningsVi: entry.meanings.vi, meaningsEn: entry.meanings.en, example, unavailable: false }
    }
    const saved = await db.savedReferenceWords.get(card.itemId)
    const word = saved?.wordSnapshot ?? card.snapshotWord
    return { word: word ?? 'Unavailable dictionary entry', reading: saved?.readingSnapshot ?? card.snapshotReading ?? '', meaningsVi: saved?.meaningSnapshot ? [saved.meaningSnapshot] : card.snapshotMeaningVi ? [card.snapshotMeaningVi] : [], meaningsEn: card.snapshotMeaningEn ? [card.snapshotMeaningEn] : [], unavailable: true }
  }
  if (card.itemType === 'custom-word') {
    const entry = await customWords.getById(card.itemId)
    if (entry) return { word: entry.word, reading: entry.reading, meaningsVi: entry.meaningsVi, meaningsEn: entry.meaningsEn, example: entry.examples?.[0] ? { id: 'custom-example', datasetVersion: 'user', japanese: entry.examples[0].japanese, reading: entry.examples[0].reading ?? null, translationVi: entry.examples[0].translationVi ?? null, translationEn: entry.examples[0].translationEn ?? null, source: null, tags: [] } : undefined, unavailable: false }
  }
  return { word: card.snapshotWord ?? 'Unavailable saved word', reading: card.snapshotReading ?? '', meaningsVi: card.snapshotMeaningVi ? [card.snapshotMeaningVi] : [], meaningsEn: card.snapshotMeaningEn ? [card.snapshotMeaningEn] : [], unavailable: true }
}
