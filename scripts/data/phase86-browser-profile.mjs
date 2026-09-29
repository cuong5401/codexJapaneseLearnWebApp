import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createServer as createNetServer } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const base = '/JapanLearnAppWeb/'
const dist = resolve('dist')
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const profile = await mkdtemp(resolve(tmpdir(), 'kotoba-phase86-chrome-'))
const textTypes = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml'])
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const servedResponses = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (pathname === base.slice(0, -1)) { servedResponses.push({ path: pathname, status: 308, bodyBytes: 0 }); response.writeHead(308, { Location: base }); response.end(); return }
    if (!pathname.startsWith(base)) { servedResponses.push({ path: pathname, status: 404, bodyBytes: 0 }); response.writeHead(404); response.end(); return }
    const relative = decodeURIComponent(pathname.slice(base.length)) || 'index.html'
    const filename = resolve(dist, relative)
    if (!(filename === dist || filename.startsWith(dist + sep))) { servedResponses.push({ path: pathname, status: 403, bodyBytes: 0 }); response.writeHead(403); response.end(); return }
    const bytes = await readFile(filename)
    const extension = extname(filename)
    const isText = textTypes.has(extension)
    const shouldGzip = isText && /gzip/u.test(request.headers['accept-encoding'] ?? '')
    const body = shouldGzip ? gzipSync(bytes, { level: 6 }) : bytes
    const immutable = pathname.includes('/assets/') || pathname.includes('/data/production/versions/')
    servedResponses.push({ path: pathname, status: 200, bodyBytes: body.length, contentEncoding: shouldGzip ? 'gzip' : 'identity' })
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : pathname.endsWith('/index.html') ? 'no-cache' : 'public, max-age=3600',
      ...(shouldGzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}),
    })
    response.end(body)
  } catch { response.writeHead(404); response.end() }
})

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => { const address = probe.address(); probe.close(() => resolvePort(address.port)) })
  })
}

function waitForEvent(target, name, timeout = 10_000) {
  return Promise.race([new Promise((resolveEvent) => {
    if (typeof target.addEventListener === 'function') target.addEventListener(name, resolveEvent, { once: true })
    else target.once(name, resolveEvent)
  }), delay(timeout).then(() => { throw new Error(`Timed out waiting for ${name}`) })])
}

const result = { mode: 'headless Chrome + local gzip static preview', viewport: '390×844', cache: 'fresh profile; immutable version assets; manifest revalidated', scenarios: [] }
let browser
let socket
let targetProcess

try {
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen) })
  const appPort = server.address().port
  const debugPort = await freePort()
  targetProcess = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true })
  let targets
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json()); if (targets.some((item) => item.type === 'page')) break } catch {}
    await delay(200)
  }
  const page = targets?.find((item) => item.type === 'page')
  if (!page) throw new Error(`Chrome debugging endpoint did not start. Check CHROME_PATH: ${chromePath}`)
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await waitForEvent(socket, 'open')

  let commandId = 0
  const commands = new Map()
  const handlers = new Map()
  const requests = []
  const requestById = new Map()
  const inflight = new Set()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const command = commands.get(message.id)
      if (!command) return
      commands.delete(message.id)
      if (message.error) command.reject(new Error(message.error.message))
      else command.resolve(message.result)
      return
    }
    for (const handler of handlers.get(message.method) ?? []) handler(message.params)
  })
  function send(method, params = {}) {
    const id = ++commandId
    return new Promise((resolveCommand, rejectCommand) => {
      commands.set(id, { resolve: resolveCommand, reject: rejectCommand })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  function on(method, handler) { handlers.set(method, [...(handlers.get(method) ?? []), handler]) }
  on('Network.requestWillBeSent', (event) => {
    const request = { id: event.requestId, url: event.request.url, method: event.request.method, startedAt: Date.now(), status: undefined, fromDiskCache: false, transferredBytes: 0 }
    requests.push(request); requestById.set(event.requestId, request); inflight.add(event.requestId)
  })
  on('Network.requestServedFromCache', (event) => { const request = requestById.get(event.requestId); if (request) request.fromDiskCache = true })
  on('Network.responseReceived', (event) => {
    const request = requestById.get(event.requestId)
    if (request) { request.status = event.response.status; request.fromDiskCache ||= event.response.fromDiskCache ?? false }
  })
  on('Network.loadingFinished', (event) => { const request = requestById.get(event.requestId); if (request) request.transferredBytes = event.encodedDataLength; inflight.delete(event.requestId) })
  on('Network.loadingFailed', (event) => { const request = requestById.get(event.requestId); if (request) request.failure = event.errorText; inflight.delete(event.requestId) })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable', { maxTotalBufferSize: 16 * 1024 * 1024 })
  await send('Network.setCacheDisabled', { cacheDisabled: false })
  await send('Page.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Browser evaluation failed')
    return response.result?.value
  }
  async function waitIdle(timeout = 45_000) {
    const started = Date.now(); let stableSince = 0
    while (Date.now() - started < timeout) {
      const blocking = [...inflight].filter((id) => !requestById.get(id)?.url.includes('/assets/tokenizer.worker-'))
      if (blocking.length === 0) { if (!stableSince) stableSince = Date.now(); if (Date.now() - stableSince > 500) return }
      else stableSince = 0
      await delay(100)
    }
    const pendingUrls = [...inflight].map((id) => requestById.get(id)?.url ?? id)
    throw new Error(`Network did not become idle; ${inflight.size} request(s) remain: ${pendingUrls.join(', ')}`)
  }
  async function waitFor(expression, timeout = 30_000) {
    const started = Date.now()
    while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(100) }
    throw new Error(`Browser condition timed out: ${expression}`)
  }
  async function scenario(name, action, timeout = 45_000) {
    const startIndex = requests.length
    const servedStart = servedResponses.length
    const startedAt = Date.now()
    await action()
    await waitIdle(timeout)
    const entries = requests.slice(startIndex)
    const done = entries.filter((item) => item.status !== undefined || item.failure)
    const served = servedResponses.slice(servedStart)
    const data = served.filter((item) => item.path.includes('/data/production/'))
    const tokenizer = served.filter((item) => item.path.includes('/kuromoji/'))
    const jsCss = served.filter((item) => /\/assets\/.*\.(js|css)(\?|$)/u.test(item.path))
    result.scenarios.push({
      name,
      durationMs: Date.now() - startedAt,
      requestCount: served.length,
      encodedBytes: served.reduce((sum, item) => sum + item.bodyBytes, 0),
      referenceRequests: data.length,
      referenceEncodedBytes: data.reduce((sum, item) => sum + item.bodyBytes, 0),
      tokenizerRequests: tokenizer.length,
      tokenizerEncodedBytes: tokenizer.reduce((sum, item) => sum + item.bodyBytes, 0),
      jsCssRequests: jsCss.length,
      jsCssEncodedBytes: jsCss.reduce((sum, item) => sum + item.bodyBytes, 0),
      cacheHits: done.filter((item) => item.fromDiskCache).length,
      failedRequests: done.filter((item) => item.failure).map((item) => ({ url: item.url, reason: item.failure })),
      requestedFiles: served.map((item) => ({ path: item.path.replace(base, ''), status: item.status, bytes: item.bodyBytes, contentEncoding: item.contentEncoding ?? 'identity' })),
    })
  }
  async function navigateHash(hash) { await evaluate(`location.hash = ${JSON.stringify(hash)}`); await delay(350) }

  const origin = `http://127.0.0.1:${appPort}${base}`
  await scenario('home-cold', async () => { await send('Page.navigate', { url: origin }); await waitFor("document.readyState === 'complete'") })
  await scenario('dictionary-fresh-推薦', async () => { await navigateHash('#/dictionary?q=' + encodeURIComponent('推薦')) })
  await scenario('session-search-食べる', async () => { await navigateHash('#/dictionary?q=' + encodeURIComponent('食べる')) })
  await scenario('dictionary-search-recommend', async () => { await navigateHash('#/dictionary?q=recommend') })
  await scenario('dictionary-detail', async () => { await navigateHash('#/dictionary/jmdict%3A1371170') })
  await scenario('session-search-推奨', async () => { await navigateHash('#/dictionary?q=' + encodeURIComponent('推奨')) })
  await scenario('session-search-改善', async () => { await navigateHash('#/dictionary?q=' + encodeURIComponent('改善')) })
  await send('Network.emulateNetworkConditions', { offline: false, latency: 180, downloadThroughput: 200 * 1024, uploadThroughput: 64 * 1024, connectionType: 'cellular3g' })
  await scenario('dictionary-throttled-影響', async () => { await navigateHash('#/dictionary?q=' + encodeURIComponent('影響')) })
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'none' })
  await scenario('session-search-省略', async () => { await navigateHash('#/dictionary?q=' + encodeURIComponent('省略')) })
  await scenario('session-search-読解', async () => { await navigateHash('#/dictionary?q=' + encodeURIComponent('読解')) })
  await scenario('jlpt-n5-vocabulary', async () => { await navigateHash('#/jlpt/N5/vocabulary') })
  await scenario('jlpt-n1-vocabulary', async () => { await navigateHash('#/jlpt/N1/vocabulary') })
  await scenario('kanji-detail-推', async () => { await navigateHash('#/kanji/' + encodeURIComponent('推')) })
  await scenario('reading-library-no-tokenizer', async () => { await navigateHash('#/reading') })
  await scenario('reading-new-editor', async () => { await navigateHash('#/reading/new'); await waitFor("!!document.querySelector('.reading-editor textarea')") })
  await scenario('reading-tokenizer-first-use', async () => {
    await evaluate(`(() => { const title = document.querySelector('.reading-editor input'); const textarea = document.querySelector('.reading-editor textarea'); const button = document.querySelector('.reading-editor button'); const set = (element, value) => { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set; setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }; if (!title || !textarea || !button) throw new Error('Reading editor controls were not found.'); set(title, 'Phase 8.6 QA'); set(textarea, '私は日本語を勉強しています。'); button.click(); })()`)
    await waitFor("document.querySelectorAll('[data-token-index]').length > 0", 60_000)
  }, 90_000)
  await scenario('reading-token-offline-lookup', async () => {
    await evaluate("document.querySelector('[data-token-index]:not([class*=punctuation])')?.click()")
    await waitFor("!!document.querySelector('.reading-lookup-dialog') && !document.querySelector('.reading-lookup-loading')", 30_000)
  })
  await scenario('browser-http-cache-after-reload', async () => {
    await navigateHash('#/dictionary?q=' + encodeURIComponent('推薦'))
    await waitIdle()
    await send('Page.reload', { ignoreCache: false })
    await waitFor("document.readyState === 'complete'")
    await waitIdle()
  })
  result.summary = {
    basePath: base,
    scenarioCount: result.scenarios.length,
    freshDictionary: result.scenarios.find((item) => item.name === 'dictionary-fresh-推薦'),
    coldShell: result.scenarios.find((item) => item.name === 'home-cold'),
    tokenizerAssetsOnHome: result.scenarios.find((item) => item.name === 'home-cold').tokenizerRequests,
    tokenizerAssetsBeforeReading: result.scenarios.filter((item) => !item.name.startsWith('reading-')).reduce((sum, item) => sum + item.tokenizerRequests, 0),
    sessionSearches: result.scenarios.filter((item) => item.name.startsWith('session-search-') || item.name === 'dictionary-search-recommend'),
    detail: result.scenarios.find((item) => item.name === 'dictionary-detail'),
    throttledDictionary: result.scenarios.find((item) => item.name === 'dictionary-throttled-影響'),
    jlpt: result.scenarios.filter((item) => item.name.startsWith('jlpt-')),
    kanji: result.scenarios.find((item) => item.name === 'kanji-detail-推'),
    reading: result.scenarios.filter((item) => item.name.startsWith('reading-')),
    httpCacheReload: result.scenarios.find((item) => item.name === 'browser-http-cache-after-reload'),
    indexedDbStoreNames: await evaluate("indexedDB.databases().then(items => items.flatMap(item => item.name ? [item.name] : []))"),
  }
  await send('Browser.close').catch(() => undefined)
  const concise = (item) => item && ({ name: item.name, durationMs: item.durationMs, requests: item.requestCount, transferredBodyBytes: item.encodedBytes, referenceRequests: item.referenceRequests, referenceBytes: item.referenceEncodedBytes, tokenizerRequests: item.tokenizerRequests, tokenizerBytes: item.tokenizerEncodedBytes, jsCssRequests: item.jsCssRequests, jsCssBytes: item.jsCssEncodedBytes, cacheHits: item.cacheHits, failures: item.failedRequests })
  const report = { mode: result.mode, viewport: result.viewport, cache: result.cache, summary: {
    ...result.summary,
    coldShell: concise(result.summary.coldShell),
    freshDictionary: concise(result.summary.freshDictionary),
    sessionSearches: result.summary.sessionSearches.map(concise),
    detail: concise(result.summary.detail),
    throttledDictionary: concise(result.summary.throttledDictionary),
    jlpt: result.summary.jlpt.map(concise),
    kanji: concise(result.summary.kanji),
    reading: result.summary.reading.map(concise),
    httpCacheReload: concise(result.summary.httpCacheReload),
  } }
  const reportText = JSON.stringify(report, null, 2)
  if (process.env.PHASE86_PROFILE_OUTPUT) await writeFile(resolve(process.env.PHASE86_PROFILE_OUTPUT), `${reportText}\n`)
  console.log(reportText)
} catch (error) {
  console.error('Completed profile scenarios:', JSON.stringify(result.scenarios.map(({ name, requestCount, encodedBytes, referenceRequests, referenceEncodedBytes, tokenizerRequests, tokenizerEncodedBytes }) => ({ name, requestCount, encodedBytes, referenceRequests, referenceEncodedBytes, tokenizerRequests, tokenizerEncodedBytes }))))
  console.error('Browser profiling failed:', error)
  throw error
} finally {
  socket?.close()
  if (targetProcess && targetProcess.exitCode === null) {
    await Promise.race([new Promise((resolveExit) => targetProcess.once('exit', resolveExit)), delay(3_000)]).catch(() => undefined)
    if (targetProcess.exitCode === null) targetProcess.kill()
  }
  await new Promise((resolveClose) => server.close(resolveClose)).catch(() => undefined)
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { await rm(profile, { recursive: true, force: true }); break }
    catch (error) { if (attempt === 9 || !['EBUSY', 'EPERM'].includes(error.code)) console.warn(`Temporary browser profile cleanup deferred: ${profile} (${error.code})`); else await delay(500) }
  }
}
