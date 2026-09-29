import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { bucket, searchBucket, japanese, stableId, validText } from './format.mjs'
import { mergeVocabulary, normalizeGrammar, normalizeKanji, parseJmdict, parseOpenJlpt } from './parsers.mjs'
import { decodeDictionaryRecord, decodeSearchPosting, encodeDictionaryRecord, encodeSearchShard } from './transport.mjs'

describe('production data pipeline parsers', () => {
  it('streams JMdict, expands local entities, preserves senses, restrictions, variants and Unicode', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE JMdict [<!ENTITY n "noun (common) (futsuumeishi)"><!ENTITY adj-i "adjective (keiyoushi)">]>
<JMdict><entry><ent_seq>1000000</ent_seq><k_ele><keb>推薦</keb><ke_pri>news1</ke_pri></k_ele><k_ele><keb>推奨</keb></k_ele><r_ele><reb>すいせん</reb></r_ele><sense><pos>&n;</pos><gloss>recommendation</gloss><gloss xml:lang="ger">Empfehlung</gloss></sense><sense><pos>&adj-i;</pos><gloss>to recommend</gloss><stagk>推薦</stagk></sense></entry></JMdict>`
    const { entries } = await parseJmdict(Readable.from([xml]), 'test.1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ id: 'jmdict:1000000', word: '推薦', reading: 'すいせん', meanings: { vi: [], en: ['recommendation', 'to recommend'] }, forms: { written: [{ text: '推薦' }, { text: '推奨' }] }, jlptLevel: null, isCommon: true, provenance: [{ datasetId: 'jmdict', recordId: '1000000' }] })
    expect(entries[0].senses?.[0]?.partsOfSpeech).toContain('noun (common) (futsuumeishi)')
    expect(entries[0].senses?.[1]?.writtenRestrictions).toEqual(['推薦'])
    expect(entries[0].meanings.vi).toEqual([])
  })

  it('merges only one exact spelling+reading match, preserves source levels and stable IDs', async () => {
    const parsed = await parseJmdict(Readable.from(['<!DOCTYPE JMdict [<!ENTITY n "noun">]><JMdict><entry><ent_seq>123</ent_seq><k_ele><keb>改善</keb></k_ele><r_ele><reb>かいぜん</reb></r_ele><sense><pos>&n;</pos><gloss>improvement</gloss></sense></entry></JMdict>']), 'v1')
    expect(parsed.entries[0]?.id).toBe('jmdict:123')
    const row = { word: '改善', reading: 'かいぜん', meanings: ['improvement'], level: 'N3' }
    parseOpenJlpt([row], 'vocabulary', 'N3')
    const merged = mergeVocabulary(parsed.entries, [row], 'v1')
    const again = mergeVocabulary([...parsed.entries], [row], 'v1', merged.identity)
    expect(merged.identity).toEqual(again.identity)
    expect(merged.levels.N3.size).toBe(1)
    expect(merged.dictionary[0]).toMatchObject({ jlptLevel: 'N3', meanings: { vi: [], en: ['improvement'] } })
    expect(merged.conflicts).toEqual([])
    const ambiguous = mergeVocabulary([parsed.entries[0], { ...parsed.entries[0], id: 'jmdict:other' }], [row], 'v1')
    expect(ambiguous.conflicts[0]?.reason).toBe('ambiguous-exact-pair')
    expect(Object.keys(merged.identity)).toEqual([stableId('openjlpt-vocab', '改善\u001fかいぜん')])
    expect(Object.values(merged.identity)).toEqual([{ entryId: 'jmdict:123', reading: 'かいぜん' }])
    const emptyReading = { ...row, word: '改善', reading: '', level: 'N3' }
    const uniquelyResolved = mergeVocabulary(parsed.entries, [emptyReading], 'v1')
    expect(uniquelyResolved.dictionary[0]).toMatchObject({ id: 'jmdict:123', word: '改善', reading: 'かいぜん', meanings: { vi: [] } })
    const ambiguousReading = mergeVocabulary([parsed.entries[0], { ...parsed.entries[0], id: 'jmdict:124', reading: 'なおす', normalizedReading: 'なおす' }], [emptyReading], 'v1')
    expect(ambiguousReading.conflicts[0]?.reason).toBe('ambiguous-exact-pair')
    expect(ambiguousReading.dictionary.find((entry) => entry.id.startsWith('openjlpt-vocab:'))?.reading).toBe('')
  })

  it('normalizes real shaped kanji and grammar rows without inventing Vietnamese or official status', () => {
    const kanji = normalizeKanji({ character: '漢', level: 'N2', strokes: 13, grade: null, freq: 1100, onyomi: ['カン'], kunyomi: ['から'], meanings: ['Sino-'] }, 'v1')
    const grammar = normalizeGrammar({ pattern: '〜にしたがって', level: 'N2', meaning: 'as; in accordance with', formation: 'Noun + にしたがって', tags: ['change'], examples: [] }, 'v1')
    expect(kanji).toMatchObject({ character: '漢', meanings: { vi: [], en: ['Sino-'] }, jlptLevel: 'N2', provenance: [{ datasetId: 'openjlpt', recordId: '漢' }] })
    expect(grammar).toMatchObject({ meaningVi: [], meaningEn: ['as; in accordance with'], jlptLevel: 'N2' })
    expect(japanese('カタカナ')).toBe('かたかな')
    expect(() => validText('�', 'bad')).toThrow('Corrupt Unicode')
    expect(bucket('hello', 4096)).toBe('0cab')
    expect(searchBucket('w:推薦', 1024)).toBe(searchBucket('r:推薦', 1024))
    expect(searchBucket('w:推薦', 1024)).toBe(searchBucket('p:推薦', 1024))
  })

  it('round-trips the compact static record and index formats without losing domain fields', async () => {
    const parsed = await parseJmdict(Readable.from([`<!DOCTYPE JMdict [<!ENTITY n "noun">]><JMdict><entry><ent_seq>456</ent_seq><k_ele><keb>推薦</keb></k_ele><r_ele><reb>すいせん</reb></r_ele><sense><pos>&n;</pos><gloss>recommendation</gloss><misc>word usually written using kana alone</misc></sense></entry></JMdict>`]), 'release.test')
    const record = parsed.entries[0]
    record.meanings.vi = ['lời giới thiệu']
    record.normalizedMeaningVi = ['loi gioi thieu']
    record.normalizedWord = 'custom-normalized-word'
    record.normalizedMeaningEn = ['custom-normalized-meaning']
    record.partsOfSpeech = ['noun']
    record.jlptLevel = 'N3'
    record.isCommon = true
    record.frequencyRank = 123
    record.kanjiIds = ['推', '薦']
    record.kanjiLookupKeys = ['推', '薦']
    record.exampleSentenceIds = ['example:1']
    record.tags = ['curated']
    record.jlptAssignments = [{ level: 'N3', word: '推薦', reading: 'すいせん', sourceRecordId: 'source:456' }]
    record.provenance = [{ datasetId: 'jmdict', recordId: '456' }, { datasetId: 'openjlpt', recordId: 'source:456' }]
    const transport = encodeDictionaryRecord(record)
    expect(decodeDictionaryRecord(JSON.parse(JSON.stringify(transport)), 'release.test')).toEqual(record)
    expect(JSON.stringify(transport).length).toBeLessThan(JSON.stringify(record).length)
    const shard = encodeSearchShard({ 'w:推薦': { ids: ['jmdict:456'], total: 300 } })
    expect(shard['w:推薦']).toEqual([['jmdict:456'], 300])
    expect(decodeSearchPosting(shard['w:推薦'])).toEqual({ ids: ['jmdict:456'], total: 300 })
  })
})
