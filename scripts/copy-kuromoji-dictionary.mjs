import { mkdir, copyFile, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/kuromoji')
const target = resolve(root, 'public/kuromoji')
await mkdir(target, { recursive: true })
for (const filename of await readdir(target)) {
  if (filename.endsWith('.dat.gz')) await unlink(resolve(target, filename))
}
for (const filename of await readdir(resolve(source, 'dict'))) {
  await copyFile(resolve(source, 'dict', filename), resolve(target, filename.replace(/\.dat\.gz$/, '.dat.gzdata')))
}
await copyFile(resolve(source, 'LICENSE-2.0.txt'), resolve(target, 'LICENSE-2.0.txt'))
await copyFile(resolve(source, 'NOTICE.md'), resolve(target, 'NOTICE.md'))
const vendor = resolve(root, 'src/features/reading/vendor')
await mkdir(vendor, { recursive: true })
const browserBundle = await readFile(resolve(source, 'build/kuromoji.js'), 'utf8')
const patchedBundle = browserBundle.replaceAll('.dat.gz', '.dat.gzdata')
if (patchedBundle === browserBundle || (browserBundle.match(/\.dat\.gz/g) ?? []).length !== 12) throw new Error(`Unexpected Kuromoji browser bundle dictionary references: ${basename(resolve(source, 'build/kuromoji.js'))}`)
await writeFile(resolve(vendor, 'kuromoji.js'), `const module = { exports: {} };\nconst exports = module.exports;\n${patchedBundle}\nexport default module.exports;\n`)
await copyFile(resolve(source, 'LICENSE-2.0.txt'), resolve(vendor, 'LICENSE-2.0.txt'))
await copyFile(resolve(source, 'NOTICE.md'), resolve(vendor, 'NOTICE.md'))
console.log('Prepared the local Kuromoji dictionary and license notices.')
