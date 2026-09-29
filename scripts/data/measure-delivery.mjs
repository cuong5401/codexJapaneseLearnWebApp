import { readFile, readdir, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { extname, resolve } from 'node:path'

const production = resolve('public/data/production')
const manifest = JSON.parse(await readFile(resolve(production, 'manifest.json'), 'utf8'))
const release = resolve(production, manifest.basePath)
const integrity = JSON.parse(await readFile(resolve('scripts/data/reports', manifest.datasetVersion, 'integrity.json'), 'utf8'))
const groups = new Map()
const distributions = new Map()

for (const file of integrity.files) {
  const category = file.path.split('/')[0]
  const bytes = await readFile(resolve(release, file.path))
  const current = groups.get(category) ?? { files: 0, rawBytes: 0, gzipBytes: 0 }
  current.files += 1
  current.rawBytes += bytes.length
  const gzipBytes = gzipSync(bytes, { level: 6 }).length
  current.gzipBytes += gzipBytes
  groups.set(category, current)
  const distribution = distributions.get(category) ?? { raw: [], gzip: [], counts: [] }
  distribution.raw.push(bytes.length)
  distribution.gzip.push(gzipBytes)
  distribution.counts.push(file.count)
  distributions.set(category, distribution)
}

const runtimeFiles = ['manifest.json', 'sources.json']
const runtimeStats = await Promise.all(runtimeFiles.map(async (name) => {
  const bytes = await readFile(resolve(production, name))
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: 6 }).length }
}))
const published = {
  files: integrity.files.length + runtimeFiles.length,
  rawBytes: [...groups.values()].reduce((sum, group) => sum + group.rawBytes, 0) + runtimeStats.reduce((sum, item) => sum + item.raw, 0),
  gzipBytes: [...groups.values()].reduce((sum, group) => sum + group.gzipBytes, 0) + runtimeStats.reduce((sum, item) => sum + item.gzip, 0),
}

const distributionStats = Object.fromEntries([...distributions].map(([category, values]) => {
  const summarize = (items) => {
    const sorted = [...items].sort((a, b) => a - b)
    return { minimum: sorted[0], median: sorted[Math.floor(sorted.length / 2)], average: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length), maximum: sorted.at(-1) }
  }
  return [category, { rawBytesPerFile: summarize(values.raw), gzipBytesPerFile: summarize(values.gzip), entriesPerFile: summarize(values.counts) }]
}))

const distGroups = new Map()
const distFiles = []
async function walkDist(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = resolve(path, entry.name)
    if (entry.isDirectory()) await walkDist(target)
    else {
      const bytes = await readFile(target)
      const relative = target.slice(resolve('dist').length + 1).replaceAll('\\', '/')
      const groupName = relative.split('/')[0]
      const group = distGroups.get(groupName) ?? { files: 0, rawBytes: 0 }
      group.files += 1; group.rawBytes += bytes.length; distGroups.set(groupName, group)
      const canEstimateGzip = (groupName === 'assets' && ['.js', '.css'].includes(extname(target))) || relative === 'index.html'
      distFiles.push({ path: relative, bytes: bytes.length, gzipBytes: canEstimateGzip ? gzipSync(bytes, { level: 6 }).length : undefined })
    }
  }
}
await walkDist(resolve('dist'))

console.log(JSON.stringify({
  datasetVersion: manifest.datasetVersion,
  records: manifest.counts,
  jlptCounts: manifest.jlptCounts,
  search: manifest.search,
  integrityFiles: integrity.files.length,
  groups: Object.fromEntries(groups),
  distributionStats,
  runtimeManifestBytes: (await stat(resolve(production, 'manifest.json'))).size,
  rootSourcesBytes: (await stat(resolve(production, 'sources.json'))).size,
  productionWithRootMetadata: published,
  dist: { fileCount: distFiles.length, rawBytes: distFiles.reduce((sum, item) => sum + item.bytes, 0), groups: Object.fromEntries(distGroups), keyBundles: distFiles.filter((item) => /(^|\/)(index-[^/]+\.(js|css)|tokenizer\.worker-[^/]+\.js|ReadingPage-[^/]+\.js)$/.test(item.path)) },
}, null, 2))
