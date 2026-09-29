import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assert, digest, bucket, searchBucket, LEVELS, validText } from './format.mjs'
import { decodeDictionaryRecord, decodeSearchPosting } from './transport.mjs'

const categories = ['dictionary', 'kanji', 'grammar', 'examples']
const sourcePath = (root, version, path) => resolve(root, version, path)

export async function validateProduction(root, manifest) {
  manifest ??= JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
  assert(manifest.schemaVersion === 2 && manifest.transportVersion === 2 && manifest.pipelineVersion && manifest.datasetVersion && manifest.sourceFingerprint, 'Invalid production manifest')
  assert(!('assetMetadata' in manifest) && !('assetMetadataSha256' in manifest), 'Build integrity details must not ship in the runtime manifest')
  assert(manifest.sources?.length >= 3 && manifest.search?.format === 'object-arrays-v1' && manifest.search.sharding === 'fnv1a-normalized-suffix-v1', 'Missing source registry or search transport descriptor')
  const integrityPath = resolve('scripts/data/reports', manifest.datasetVersion, 'integrity.json')
  const integrity = JSON.parse(await readFile(integrityPath, 'utf8'))
  assert(integrity.schemaVersion === 1 && integrity.datasetVersion === manifest.datasetVersion && Array.isArray(integrity.files), 'Invalid build-time integrity inventory')
  const files = integrity.files
  const sourceBytes = await readFile(sourcePath(root, manifest.basePath, 'sources.json'))
  const sources = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes))
  assert(JSON.stringify(sources.map((source) => source.id)) === JSON.stringify(manifest.sources), 'Source registry does not match manifest IDs')
  const sourceIds = new Set(sources.map((source) => source.id))
  for (const source of sources) assert(source.id && source.url && source.license && source.licenseUrl && source.attribution && source.version, `Missing source metadata ${source.id}`)

  const byCategory = Object.fromEntries(categories.map((key) => [key, new Map()]))
  const indexes = [], indexKeys = new Set(), lists = new Map(), jlptPages = new Map()
  let validatedJlptPages = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (const file of files) {
    const bytes = await readFile(sourcePath(root, manifest.basePath, file.path))
    assert(bytes.length === file.bytes && digest(bytes) === file.sha256, `Checksum/size mismatch: ${file.path}`)
    const value = JSON.parse(decoder.decode(bytes))
    assert((Array.isArray(value) ? value.length : Object.keys(value).length) === file.count, `Count mismatch: ${file.path}`)
    const [category, subcategory, name, pageName] = file.path.split('/')
    if (byCategory[category]) {
      const rows = category === 'dictionary' ? value.map((row) => decodeDictionaryRecord(row, manifest.datasetVersion)) : value
      for (const row of rows) {
        assert(!byCategory[category].has(row.id), `Duplicate stable ID ${row.id}`)
        assert(row.datasetVersion === manifest.datasetVersion && row.provenance?.length, `Missing version/provenance: ${row.id}`)
        assert(file.path === `${category}/${bucket(row.id, manifest.recordBuckets[category])}.json`, `Wrong record chunk: ${row.id}`)
        for (const provenance of row.provenance) assert(sourceIds.has(provenance.datasetId), `Unknown source ${row.id}`)
        assert(row.jlptLevel == null || LEVELS.includes(row.jlptLevel), `Invalid JLPT ${row.id}`)
        if (row.jlptAssignments) {
          assert(row.jlptAssignments.every((assignment) => LEVELS.includes(assignment.level) && assignment.sourceRecordId), `Invalid source JLPT assignment ${row.id}`)
          assert(new Set(row.jlptAssignments.map((assignment) => `${assignment.level}:${assignment.sourceRecordId}`)).size === row.jlptAssignments.length, `Duplicate source JLPT assignment ${row.id}`)
        }
        validText(row.word ?? row.character ?? row.pattern ?? row.japanese, row.id)
        if (row.reading != null) validText(row.reading, row.id, true)
        assert(!JSON.stringify(row).includes('\ufffd'), `Replacement character ${row.id}`)
        byCategory[category].set(row.id, row)
      }
    } else if (category === 'search') indexes.push(file.path)
    else if (category === 'jlpt') lists.set(`${subcategory}/${name.replace('.json', '')}`, value)
    else if (category === 'jlpt-pages') jlptPages.set(`${subcategory}/${name}/${pageName.replace('.json', '')}`, value)
  }
  for (const [category, rows] of Object.entries(byCategory)) assert(rows.size === manifest.counts[category], `Manifest count differs: ${category}`)
  for (const category of ['dictionary', 'grammar']) for (const row of byCategory[category].values()) {
    assert(row.exampleSentenceIds.length <= 5, `Too many examples ${row.id}`)
    for (const id of row.exampleSentenceIds) assert(byCategory.examples.has(id), `Dangling example ${id}`)
  }
  for (const row of byCategory.examples.values()) if (row.id.startsWith('tatoeba:')) assert(row.attribution?.length === 2 && row.attribution.every((item) => item.author && item.sentenceId && item.url && item.license), `Missing Tatoeba attribution ${row.id}`)

  for (const path of indexes) {
    const index = JSON.parse(await readFile(sourcePath(root, manifest.basePath, path), 'utf8'))
    for (const [key, compact] of Object.entries(index)) {
      assert(path === `search/${searchBucket(key, manifest.indexBuckets)}.json`, `Wrong search shard ${key}`)
      indexKeys.add(key)
      const posting = decodeSearchPosting(compact)
      assert(posting.total >= posting.ids.length && posting.ids.length <= manifest.search.postingLimit && new Set(posting.ids).size === posting.ids.length, `Invalid postings ${key}`)
      const category = ['c', 'u'].includes(key[0]) ? 'kanji' : ['g', 'h'].includes(key[0]) ? 'grammar' : 'dictionary'
      for (const id of posting.ids) assert(byCategory[category].has(id), `Unresolved search ID ${id}`)
    }
  }
  assert(indexes.length === manifest.search.shardCount, 'Search shard count differs from manifest')

  for (const [path, ids] of lists) {
    const [category, level] = path.split('/')
    assert(LEVELS.includes(level) && ['vocabulary', 'kanji', 'grammar'].includes(category), `Invalid JLPT list ${path}`)
    assert(ids.length === manifest.jlptCounts[level][category] && new Set(ids).size === ids.length, `JLPT count mismatch ${path}`)
    const collection = category === 'vocabulary' ? 'dictionary' : category
    for (const id of ids) {
      const row = byCategory[collection].get(id)
      assert(row && (row.jlptLevel === level || row.jlptAssignments?.some((assignment) => assignment.level === level)), `Invalid level list ID ${id}`)
    }
    const expectedPages = Math.ceil(ids.length / manifest.jlptPageSize)
    for (let index = 0; index < expectedPages; index += 1) {
      const key = `${category}/${level}/${String(index).padStart(4, '0')}`
      const transportRows = jlptPages.get(key)
      assert(transportRows?.length === Math.min(manifest.jlptPageSize, ids.length - index * manifest.jlptPageSize), `Missing or malformed JLPT page ${key}`)
      const rows = category === 'vocabulary' ? transportRows.map((row) => decodeDictionaryRecord(row, manifest.datasetVersion)) : transportRows
      const expectedIds = ids.slice(index * manifest.jlptPageSize, (index + 1) * manifest.jlptPageSize)
      assert(JSON.stringify(rows.map((row) => row.id)) === JSON.stringify(expectedIds), `JLPT page order mismatch ${key}`)
      for (const row of rows) {
        const canonical = byCategory[collection].get(row.id)
        assert(canonical && JSON.stringify(row) === JSON.stringify(canonical), `JLPT page content mismatch ${row.id}`)
      }
      jlptPages.delete(key)
      validatedJlptPages += 1
    }
  }
  assert(lists.size === LEVELS.length * 3 && jlptPages.size === 0, 'Unexpected or missing JLPT lists/pages')

  const requiredSearchForms = [
    '\u63a8\u85a6', '\u63a8\u85a6\u72b6', '\u6539\u5584', '\u5f71\u97ff', '\u9032\u6357', '\u5bfe\u5fdc', '\u8aad\u89e3',
    '\u98df\u3079\u308b', '\u96e8\u5bbf\u308a',
  ]
  for (const word of requiredSearchForms) assert([...byCategory.dictionary.values()].some((row) => row.word === word || row.forms?.written.some((form) => form.text === word)), `Unicode regression: ${word}`)
  assert(indexKeys.has('p:\u98df\u3079'), 'Unicode prefix search regression: 食べ')
  console.log(`Validated ${Object.values(manifest.counts).reduce((a, b) => a + b, 0).toLocaleString()} UTF-8 records, ${indexes.length} compact search shards, ${files.length} build-only checksums, ${validatedJlptPages} JLPT pages, links and source assignments.`)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await validateProduction(resolve('public/data/production'))
