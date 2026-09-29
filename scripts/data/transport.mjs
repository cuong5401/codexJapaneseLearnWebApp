import { japanese, meaning } from './format.mjs'

// Static dictionary tuple schema 2:
// [id, word, reading, English glosses, POS, compact optional fields]
// Missing derivable/empty values are reconstructed by the browser decoder.
export function encodeDictionaryRecord(row) {
  const extra = {}
  if (row.meanings.vi?.length) extra.v = row.meanings.vi
  if (row.normalizedWord !== japanese(row.word)) extra.nw = row.normalizedWord
  if (row.normalizedReading !== japanese(row.reading)) extra.nr = row.normalizedReading
  if (row.normalizedMeaningVi?.length) extra.nv = row.normalizedMeaningVi
  const normalizedEn = row.meanings.en.map(meaning)
  if (JSON.stringify(row.normalizedMeaningEn) !== JSON.stringify(normalizedEn)) extra.ne = row.normalizedMeaningEn
  if (row.jlptLevel != null) extra.l = row.jlptLevel
  if (row.isCommon != null) extra.c = row.isCommon
  if (row.frequencyRank != null) extra.fr = row.frequencyRank
  if (row.kanjiIds?.length) extra.k = row.kanjiIds
  if (row.kanjiLookupKeys?.length) extra.lk = row.kanjiLookupKeys
  if (row.exampleSentenceIds?.length) extra.e = row.exampleSentenceIds
  if (row.tags?.length) extra.t = row.tags
  if (row.forms) extra.f = [
    row.forms.written.map((form) => [form.text, form.information, form.priority]),
    row.forms.readings.map((form) => [form.text, form.restrictions, form.noKanji, form.information, form.priority]),
  ]
  if (row.senses?.length) extra.s = row.senses.map((sense) => {
    const detail = {}
    for (const [short, field] of [['w', 'writtenRestrictions'], ['r', 'readingRestrictions'], ['i', 'information'], ['m', 'misc'], ['f', 'fields'], ['d', 'dialects'], ['x', 'crossReferences'], ['a', 'antonyms']]) {
      if (sense[field]?.length) detail[short] = sense[field]
    }
    return detail && Object.keys(detail).length
      ? [sense.meaningsEn, sense.partsOfSpeech, detail]
      : [sense.meaningsEn, sense.partsOfSpeech]
  })
  const provenance = row.provenance ?? []
  const inferred = row.id.startsWith('jmdict:')
    ? [{ datasetId: 'jmdict', recordId: row.id.slice('jmdict:'.length) }]
    : row.id.startsWith('openjlpt-vocab:')
      ? [{ datasetId: 'openjlpt', recordId: row.id }]
      : []
  if (JSON.stringify(provenance) !== JSON.stringify(inferred)) extra.p = provenance.map((item) => [item.datasetId, item.recordId])
  if (row.jlptAssignments?.length) extra.ja = row.jlptAssignments.map((item) => [item.level, item.word, item.reading, item.sourceRecordId])
  return [row.id, row.word, row.reading, row.meanings.en, row.partsOfSpeech, extra]
}

export function decodeDictionaryRecord(value, datasetVersion) {
  if (!Array.isArray(value) || value.length !== 6) throw new Error('Invalid compact dictionary tuple.')
  const [id, word, reading, meaningsEn, partsOfSpeech, extra] = value
  if (typeof id !== 'string' || typeof word !== 'string' || typeof reading !== 'string' || !Array.isArray(meaningsEn) || !Array.isArray(partsOfSpeech) || !extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('Invalid compact dictionary fields.')
  const provenance = extra.p?.map(([datasetId, recordId]) => ({ datasetId, recordId })) ?? (id.startsWith('jmdict:')
    ? [{ datasetId: 'jmdict', recordId: id.slice('jmdict:'.length) }]
    : id.startsWith('openjlpt-vocab:') ? [{ datasetId: 'openjlpt', recordId: id }] : undefined)
  const forms = extra.f ? {
    written: extra.f[0].map(([text, information, priority]) => ({ text, information, priority })),
    readings: extra.f[1].map(([text, restrictions, noKanji, information, priority]) => ({ text, restrictions, noKanji, information, priority })),
  } : undefined
  const senses = extra.s?.map(([sensesEn, sensesPos, detail = {}]) => ({
    meaningsEn: sensesEn,
    partsOfSpeech: sensesPos,
    writtenRestrictions: detail.w ?? [],
    readingRestrictions: detail.r ?? [],
    information: detail.i ?? [],
    misc: detail.m ?? [],
    fields: detail.f ?? [],
    dialects: detail.d ?? [],
    crossReferences: detail.x ?? [],
    antonyms: detail.a ?? [],
  }))
  return {
    id, datasetVersion, word, reading,
    normalizedWord: extra.nw ?? japanese(word),
    normalizedReading: extra.nr ?? japanese(reading),
    meanings: { vi: extra.v ?? [], en: meaningsEn },
    normalizedMeaningVi: extra.nv ?? [],
    normalizedMeaningEn: extra.ne ?? meaningsEn.map(meaning),
    partsOfSpeech,
    jlptLevel: extra.l ?? null,
    isCommon: extra.c ?? null,
    frequencyRank: extra.fr ?? null,
    kanjiIds: extra.k ?? [],
    ...(extra.lk ? { kanjiLookupKeys: extra.lk } : {}),
    exampleSentenceIds: extra.e ?? [],
    tags: extra.t ?? [],
    ...(forms ? { forms } : {}),
    ...(senses ? { senses } : {}),
    ...(provenance ? { provenance } : {}),
    ...(extra.ja ? { jlptAssignments: extra.ja.map(([level, assignmentWord, assignmentReading, sourceRecordId]) => ({ level, word: assignmentWord, reading: assignmentReading, sourceRecordId })) } : {}),
  }
}

// Search shard schema 2: { normalizedKey: [compactIds, totalMatches] }.
export function encodeSearchShard(postings) {
  return Object.fromEntries(Object.entries(postings).map(([key, posting]) => [key, [posting.ids, posting.total]]))
}

export function decodeSearchPosting(value) {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[0]) || !Number.isInteger(value[1])) throw new Error('Invalid compact search posting.')
  return { ids: value[0], total: value[1] }
}
