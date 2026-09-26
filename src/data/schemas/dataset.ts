import { z } from 'zod'

const jlptLevel = z.enum(['N5', 'N4', 'N3', 'N2', 'N1']).nullable()
const stringList = z.array(z.string())
const meanings = z.object({ vi: stringList, en: stringList })
const base = { id: z.string().min(1), datasetVersion: z.string().min(1), tags: stringList }

export const dictionaryEntrySchema = z.object({
  ...base, word: z.string().min(1), reading: z.string(), normalizedWord: z.string().min(1), normalizedReading: z.string(),
  normalizedMeaningVi: stringList.optional(), normalizedMeaningEn: stringList.optional(),
  meanings, partsOfSpeech: stringList, jlptLevel, isCommon: z.boolean().nullable(), frequencyRank: z.number().int().positive().nullable(),
  kanjiIds: stringList, exampleSentenceIds: stringList, kanjiLookupKeys: stringList.optional(),
})
export const kanjiEntrySchema = z.object({
  ...base, character: z.string().min(1), meanings, onyomi: stringList, kunyomi: stringList,
  strokeCount: z.number().int().positive().nullable(), radical: z.string().nullable(), radicalName: z.string().nullable(),
  jlptLevel, grade: z.number().int().positive().nullable(), frequencyRank: z.number().int().positive().nullable(), commonCompounds: stringList, searchKeys: stringList.optional(),
})
export const grammarEntrySchema = z.object({
  ...base, pattern: z.string().min(1), normalizedPattern: z.string().min(1), meaningVi: stringList, meaningEn: stringList,
  jlptLevel, formation: stringList, explanationVi: z.string().nullable(), explanationEn: z.string().nullable(),
  exampleSentenceIds: stringList, notes: stringList,
})
export const exampleSentenceSchema = z.object({
  ...base, japanese: z.string().min(1), reading: z.string().nullable(), translationVi: z.string().nullable(),
  translationEn: z.string().nullable(), source: z.string().nullable(),
})

export const datasetManifestSchema = z.object({
  datasetVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/), schemaVersion: z.number().int().positive(), generatedAt: z.string().datetime(),
  collections: z.record(z.enum(['dictionary', 'kanji', 'grammar', 'examples']), z.object({
    count: z.number().int().nonnegative(), chunks: z.array(z.object({
      id: z.string().min(1), path: z.string().min(1), itemCount: z.number().int().nonnegative(), bytes: z.number().int().nonnegative().optional(),
    })).min(1),
  })),
})

export type DatasetManifest = z.infer<typeof datasetManifestSchema>
export type DatasetCollection = keyof DatasetManifest['collections']
