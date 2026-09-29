import { SaxesParser } from 'saxes'
import { assert, japanese, meaning, stableId, validText, LEVELS } from './format.mjs'

const children = (node, name) => node.children.filter((child) => child.name === name)
const texts = (node, name) => children(node, name).map((child) => child.text.trim())
const unique = (values) => [...new Set(values)]
const hasKanji = (value) => /\p{Script=Han}/u.test(value)

/** Strict streaming XML; local literal DTD entities only, never network entities. */
export async function parseJmdict(chunks, version) {
  const entries = []
  const parser = new SaxesParser()
  const stack = []
  let created = null
  parser.on('doctype', (doctype) => {
    for (const match of doctype.matchAll(/<!ENTITY\s+([\w-]+)\s+"([^"<&]*)"\s*>/g)) parser.ENTITIES[match[1]] = match[2]
  })
  parser.on('comment', (text) => { const date = text.match(/JMdict created:\s*(\d{4}-\d{2}-\d{2})/); if (date) created = date[1] })
  parser.on('opentag', (tag) => {
    if (!stack.length && tag.name !== 'entry') return
    const node = { name: tag.name, attributes: tag.attributes, text: '', children: [] }
    if (stack.length) stack.at(-1).children.push(node)
    stack.push(node)
  })
  parser.on('text', (text) => { if (stack.length) stack.at(-1).text += text })
  parser.on('closetag', () => {
    if (!stack.length) return
    const node = stack.pop()
    if (!stack.length) entries.push(normalizeJmdictEntry(node, version))
  })
  for await (const chunk of chunks) parser.write(chunk)
  parser.close()
  assert(entries.length > 0, 'JMdict contains no entries')
  return { entries, created }
}

function normalizeJmdictEntry(node, version) {
  const seq = texts(node, 'ent_seq')[0]
  assert(/^\d+$/.test(seq), 'JMdict entry missing stable ent_seq')
  const written = children(node, 'k_ele').map((form) => ({ text: validText(texts(form, 'keb')[0], seq), information: texts(form, 'ke_inf'), priority: texts(form, 'ke_pri') }))
  const readings = children(node, 'r_ele').map((form) => ({ text: validText(texts(form, 'reb')[0], seq), restrictions: texts(form, 're_restr'), noKanji: children(form, 're_nokanji').length > 0, information: texts(form, 're_inf'), priority: texts(form, 're_pri') }))
  assert(readings.length, `JMdict ${seq}: no readings`)
  let inheritedPos = []
  const senses = children(node, 'sense').map((sense) => {
    const pos = texts(sense, 'pos'); if (pos.length) inheritedPos = pos
    return { meaningsEn: children(sense, 'gloss').filter((gloss) => !gloss.attributes['xml:lang'] || gloss.attributes['xml:lang'] === 'eng').map((gloss) => validText(gloss.text.trim(), seq)), partsOfSpeech: inheritedPos, writtenRestrictions: texts(sense, 'stagk'), readingRestrictions: texts(sense, 'stagr'), information: texts(sense, 's_inf'), misc: texts(sense, 'misc'), fields: texts(sense, 'field'), dialects: texts(sense, 'dial'), crossReferences: texts(sense, 'xref'), antonyms: texts(sense, 'ant') }
  })
  assert(senses.length > 0, `JMdict ${seq}: no senses`)
  // Pick a valid spelling/reading pair; all alternative forms/restrictions remain intact.
  const common = (form) => form.priority.some((tag) => /^(news1|ichi1|spec1|spec2|gai1)$/.test(tag))
  const primaryWritten = written.find(common) ?? written[0]
  const compatible = readings.filter((reading) => !primaryWritten || (!reading.noKanji && (!reading.restrictions.length || reading.restrictions.includes(primaryWritten.text))))
  const primaryReading = compatible.find(common) ?? compatible[0] ?? readings[0]
  const word = primaryWritten?.text ?? primaryReading.text
  const selectedSenses = senses.filter((sense) => (!sense.writtenRestrictions.length || sense.writtenRestrictions.includes(word)) && (!sense.readingRestrictions.length || sense.readingRestrictions.includes(primaryReading.text)))
  const en = unique(selectedSenses.flatMap((sense) => sense.meaningsEn))
  const isCommon = [...written, ...readings].some(common) ? true : null
  return { id: `jmdict:${seq}`, datasetVersion: version, word, reading: primaryReading.text, normalizedWord: japanese(word), normalizedReading: japanese(primaryReading.text), meanings: { vi: [], en }, normalizedMeaningVi: [], normalizedMeaningEn: en.map(meaning), partsOfSpeech: unique(selectedSenses.flatMap((sense) => sense.partsOfSpeech)), jlptLevel: null, isCommon, frequencyRank: null, kanjiIds: unique([...written.flatMap((form) => Array.from(form.text))].filter(hasKanji)), exampleSentenceIds: [], tags: [], forms: { written, readings }, senses, provenance: [{ datasetId: 'jmdict', recordId: seq }] }
}

export function parseOpenJlpt(rows, category, level) {
  assert(LEVELS.includes(level) && Array.isArray(rows) && rows.length > 0, `Invalid OpenJLPT ${category}/${level}`)
  for (const row of rows) {
    assert(row.level === level, `OpenJLPT level mismatch ${level}`)
    validText(row[category === 'vocabulary' ? 'word' : category === 'kanji' ? 'character' : 'pattern'], category)
    if (category === 'vocabulary') { validText(row.reading, 'reading', true); assert(Array.isArray(row.meanings) && row.meanings.every((text) => validText(text, 'meaning')), 'Invalid vocabulary meanings') }
    if (category === 'kanji') assert(Array.isArray(row.onyomi) && Array.isArray(row.kunyomi) && Array.isArray(row.meanings), 'Invalid kanji metadata')
    if (category === 'grammar') { validText(row.meaning, 'grammar meaning'); validText(row.formation, 'formation') }
  }
  return rows
}

export const openWordId = (row) => stableId('openjlpt-vocab', `${row.word}\u001f${row.reading}`)
/** Only an exact valid orthography+reading pair, or unambiguous kana-only empty reading, merges. */
export function mergeVocabulary(dictionary, rows, version, priorIdentity = {}) {
  const pairs = new Map()
  const byWritten = new Map()
  for (const entry of dictionary) {
    for (const read of entry.forms.readings) {
      const forms = read.noKanji || !entry.forms.written.length ? [read.text] : entry.forms.written.filter((form) => !read.restrictions.length || read.restrictions.includes(form.text)).map((form) => form.text)
      for (const word of unique([...forms, read.text])) {
        const key = `${word}\u001f${read.text}`
        if (!pairs.has(key)) pairs.set(key, [])
        pairs.get(key).push(entry)
        if (!byWritten.has(word)) byWritten.set(word, [])
        byWritten.get(word).push({ entry, reading: read.text })
      }
    }
  }
  const byId = new Map(dictionary.map((entry) => [entry.id, entry]))
  const conflicts = [], identity = {}, sourceToEntry = new Map(), levels = Object.fromEntries(LEVELS.map((level) => [level, new Set()]))
  for (const row of rows) {
    const sourceId = openWordId(row)
    const reading = row.reading || (/^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u.test(row.word) ? row.word : '')
    const candidatePairs = reading
      ? unique(pairs.get(`${row.word}\u001f${reading}`) ?? []).map((entry) => ({ entry, reading }))
      : [...new Map((byWritten.get(row.word) ?? []).map((pair) => [`${pair.entry.id}\u001f${pair.reading}`, pair])).values()]
    const candidates = unique(candidatePairs.map((pair) => pair.entry))
    // Never silently transfer an existing source identity to a different JMdict entry.
    const previous = priorIdentity[sourceId]
    const previousId = typeof previous === 'string' ? previous : previous?.entryId
    const previousReading = typeof previous === 'object' ? previous.reading : undefined
    const previousMatches = previousId ? candidatePairs.filter((pair) => pair.entry.id === previousId && (!previousReading || pair.reading === previousReading)) : []
    let matchedPair = previousMatches.length === 1 ? previousMatches[0] : !previousId && candidatePairs.length === 1 ? candidatePairs[0] : undefined
    let entry = matchedPair?.entry
    if (previous && entry && !candidates.includes(entry)) entry = undefined
    if (!entry) {
      entry = byId.get(sourceId)
      if (!entry) {
        const en = row.meanings
        const displayReading = reading || (candidatePairs.length === 1 ? candidatePairs[0].reading : '')
        entry = { id: sourceId, datasetVersion: version, word: row.word, reading: displayReading, normalizedWord: japanese(row.word), normalizedReading: japanese(displayReading), meanings: { vi: [], en }, normalizedMeaningVi: [], normalizedMeaningEn: en.map(meaning), partsOfSpeech: [], jlptLevel: null, isCommon: null, frequencyRank: null, kanjiIds: unique(Array.from(row.word).filter(hasKanji)), exampleSentenceIds: [], tags: [], provenance: [{ datasetId: 'openjlpt', recordId: sourceId }] }
        dictionary.push(entry); byId.set(entry.id, entry)
      }
      conflicts.push({ sourceId, word: row.word, reading: row.reading, candidates: candidates.map((item) => item.id), reason: previous ? 'previous-identity-no-longer-matches' : candidates.length > 1 ? 'ambiguous-exact-pair' : 'no-exact-pair' })
    }
    else {
      // OpenJLPT glosses enrich a JMdict entry only after unique orthography + reading resolution.
      if (!entry.reading && matchedPair) { entry.reading = matchedPair.reading; entry.normalizedReading = japanese(matchedPair.reading) }
      entry.meanings.en = unique([...entry.meanings.en, ...row.meanings])
      entry.normalizedMeaningEn = entry.meanings.en.map(meaning)
    }
    identity[sourceId] = { entryId: entry.id, reading: matchedPair?.reading ?? entry.reading ?? '' }; sourceToEntry.set(sourceId, entry)
    entry.provenance = uniqueProvenance([...entry.provenance, { datasetId: 'openjlpt', recordId: sourceId }])
    entry.jlptAssignments ??= []
    if (!entry.jlptAssignments.some((item) => item.level === row.level && item.sourceRecordId === sourceId)) entry.jlptAssignments.push({ level: row.level, word: row.word, reading: row.reading, sourceRecordId: sourceId })
    entry.jlptLevel = LEVELS.find((level) => entry.jlptAssignments.some((item) => item.level === level))
    levels[row.level].add(entry.id)
  }
  return { dictionary, identity, conflicts, sourceToEntry, levels }
}
function uniqueProvenance(values) { return [...new Map(values.map((value) => [`${value.datasetId}:${value.recordId}`, value])).values()] }

export function normalizeKanji(row, version) {
  return { id: `openjlpt-kanji:${row.character.codePointAt(0).toString(16)}`, datasetVersion: version, character: row.character, meanings: { vi: [], en: row.meanings }, onyomi: row.onyomi, kunyomi: row.kunyomi, strokeCount: row.strokes ?? null, radical: row.radical ?? null, radicalName: null, jlptLevel: row.level, jlptAssignments: [{ level: row.level, sourceRecordId: row.character }], grade: row.grade ?? null, frequencyRank: row.freq ?? null, commonCompounds: [], tags: [], provenance: [{ datasetId: 'openjlpt', recordId: row.character }] }
}
export function normalizeGrammar(row, version) {
  return { id: stableId('openjlpt-grammar', row.pattern), datasetVersion: version, pattern: row.pattern, normalizedPattern: japanese(row.pattern), meaningVi: [], meaningEn: [row.meaning], jlptLevel: row.level, jlptAssignments: [{ level: row.level, sourceRecordId: row.pattern }], formation: [row.formation], explanationVi: null, explanationEn: null, exampleSentenceIds: [], notes: [], tags: row.tags ?? [], provenance: [{ datasetId: 'openjlpt', recordId: row.pattern }] }
}
