import { writeFile } from 'node:fs/promises'

const debuggerOrigin = 'http://127.0.0.1:9231'
const appOrigin = 'http://127.0.0.1:5173'
const outputDirectory = 'D:/04. 学習/chatCodex/JapanLearnAppWeb/screenshots/'
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function json(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

async function clearCaptureOrigin() {
  const targets = await json(`${debuggerOrigin}/json/list`)
  for (const target of targets.filter((item) => item.type === 'page' && item.url.startsWith(appOrigin))) {
    await fetch(`${debuggerOrigin}/json/close/${target.id}`)
  }
  const blank = (await json(`${debuggerOrigin}/json/list`)).find((item) => item.type === 'page' && item.url === 'about:blank')
  if (!blank) return
  const ws = new WebSocket(blank.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  await new Promise((resolve) => {
    ws.addEventListener('message', (event) => { if (JSON.parse(event.data).id === 1) resolve() })
    ws.send(JSON.stringify({ id: 1, method: 'Storage.clearDataForOrigin', params: { origin: appOrigin, storageTypes: 'indexeddb,local_storage' } }))
  })
  ws.close()
}

async function createTab(path, width, height, theme) {
  const target = await json(`${debuggerOrigin}/json/new?${encodeURIComponent(`${appOrigin}${path}`)}`, { method: 'PUT' })
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((argument) => argument.value ?? '').join(' '))
    }
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  })
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('kotoba-theme', '${theme}')` })
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 })
  await send('Page.navigate', { url: `${appOrigin}${path}` })
  return { ws, send, errors, width, height }
}

async function evaluate(tab, expression) {
  const response = await tab.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return response.result?.result?.value
}

async function waitForText(tab, text, timeout = 12_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const pageText = await evaluate(tab, 'document.body?.innerText ?? ""')
    if (pageText?.includes(text)) return pageText
    await pause(150)
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(text)} on ${await evaluate(tab, 'location.href')}: ${(await evaluate(tab, 'document.body?.innerText ?? ""')).slice(0, 500)}`)
}

async function waitForExpression(tab, expression, timeout = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await evaluate(tab, expression)) return
    await pause(120)
  }
  throw new Error(`Timed out waiting for browser state: ${expression}`)
}

async function capture(name, route, width, height, theme, expectedText) {
  const tab = await createTab(route, width, height, theme)
  await waitForText(tab, expectedText)
  await pause(300)
  const metrics = JSON.parse(await evaluate(tab, `JSON.stringify({title:document.title,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,300)})`))
  const layout = await tab.send('Page.getLayoutMetrics')
  const contentSize = layout.result.cssContentSize
  const image = await tab.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.min(contentSize.width, width), height: contentSize.height, scale: 1 },
  })
  await writeFile(`${outputDirectory}${name}`, Buffer.from(image.result.data, 'base64'))
  console.log(JSON.stringify({ path: `screenshots/${name}`, ...metrics, consoleErrors: tab.errors }))
  tab.ws.close()
}

await clearCaptureOrigin()
if (process.env.PHASE4_SKIP_CAPTURE !== '1') {
await capture('word-detail-390-light.png', '/dictionary/required-%E6%8E%A8%E8%96%A6', 390, 844, 'light', 'Pronounce')
await capture('word-detail-1440-light.png', '/dictionary/required-%E6%8E%A8%E8%96%A6', 1440, 1000, 'light', 'Pronounce')
await capture('kanji-390-list.png', '/kanji', 390, 844, 'light', 'Showing')
await capture('kanji-390-detail.png', '/kanji/%E6%8E%A8', 390, 844, 'light', 'Stroke order')
await capture('kanji-1440-list.png', '/kanji', 1440, 1000, 'light', 'Showing')
await capture('kanji-1440-detail.png', '/kanji/%E6%8E%A8', 1440, 1000, 'light', 'Stroke order')
await capture('grammar-390-list.png', '/grammar', 390, 844, 'light', 'Showing')
await capture('grammar-390-detail.png', '/grammar/grammar-wo-kinjienai', 390, 844, 'light', 'Examples')
await capture('grammar-1440-list.png', '/grammar', 1440, 1000, 'light', 'Showing')
await capture('grammar-1440-detail.png', '/grammar/grammar-wo-kinjienai', 1440, 1000, 'light', 'Examples')
await capture('phase4-390-dark.png', '/grammar/grammar-wo-kinjienai', 390, 844, 'dark', 'Examples')
await capture('word-detail-390-dark.png', '/dictionary/required-%E6%8E%A8%E8%96%A6', 390, 844, 'dark', 'Pronounce')
await capture('kanji-390-list-dark.png', '/kanji', 390, 844, 'dark', 'Showing')
await capture('kanji-390-detail-dark.png', '/kanji/%E6%8E%A8', 390, 844, 'dark', 'Stroke order')
await capture('kanji-360-list.png', '/kanji', 360, 780, 'light', 'Showing')
await capture('kanji-768-list.png', '/kanji', 768, 900, 'light', 'Showing')
await capture('kanji-1024-list.png', '/kanji', 1024, 900, 'light', 'Showing')
}

const interaction = await createTab('/kanji', 390, 844, 'light')
await waitForText(interaction, '日')
await evaluate(interaction, `(()=>{const input=document.querySelector('input[type=search]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'すすむ');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
await waitForText(interaction, '進')
const readingSearch = await evaluate(interaction, `document.body.innerText.includes('進')`)
await evaluate(interaction, `(()=>{const select=document.querySelector('select');select.value='N3';select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
await pause(500)
const levelFilter = await evaluate(interaction, `document.body.innerText.includes('進')`)
await interaction.send('Page.navigate', { url: `${appOrigin}/kanji/%E6%8E%A8` })
await waitForText(interaction, 'Stroke order')
await interaction.send('Page.reload')
await waitForText(interaction, 'Stroke order')
const directReload = await evaluate(interaction, `decodeURIComponent(location.pathname) === '/kanji/推'`)
await waitForText(interaction, 'Dictionary words containing')
const scrollState = JSON.parse(await evaluate(interaction, `(()=>{const main=document.querySelector('.main-content');const words=document.querySelector('.content-word-list');const nav=document.querySelector('.mobile-nav');main.scrollTop=main.scrollHeight;const last=words?.lastElementChild?.querySelector('a')?.getBoundingClientRect();return JSON.stringify({hasLinkedWords:!!words,scrollTop:main.scrollTop,scrollHeight:main.scrollHeight,lastWordAboveBottomNav:!!last&&last.bottom<=nav.getBoundingClientRect().top})})()`))
console.log(JSON.stringify({ interaction: { kanjiReadingSearch: readingSearch, kanjiJlptFilter: levelFilter, directRouteReload: directReload, kanjiDetailScroll: scrollState }, consoleErrors: interaction.errors }))
interaction.ws.close()

const dictionaryTab = await createTab('/dictionary?q=%E6%8E%A8%E8%96%A6', 390, 844, 'light')
await waitForText(dictionaryTab, '推薦')
await waitForExpression(dictionaryTab, `[...document.querySelectorAll('a')].some((item)=>item.getAttribute('href')?.startsWith('/dictionary/') && item.innerText.includes('推薦'))`)
const clickedWord = await evaluate(dictionaryTab, `(()=>{const link=[...document.querySelectorAll('a')].find((item)=>item.getAttribute('href')?.startsWith('/dictionary/') && item.innerText.includes('推薦'));if(link)link.click();return !!link})()`)
if (!clickedWord) throw new Error('Could not open the matching dictionary result from the search page.')
await waitForText(dictionaryTab, 'Pronounce')
const openedDictionaryDetail = await evaluate(dictionaryTab, `location.pathname.startsWith('/dictionary/')`)
await evaluate(dictionaryTab, 'history.back()')
await waitForExpression(dictionaryTab, `location.pathname === '/dictionary' && location.search.includes('q=')`)
await waitForExpression(dictionaryTab, `document.querySelector('input[role=combobox]')?.value === '推薦'`)
const browserBackRestoredQuery = await evaluate(dictionaryTab, `document.querySelector('input[role=combobox]')?.value === '推薦'`)
console.log(JSON.stringify({ dictionary: { directDetailFromSearch: openedDictionaryDetail, browserBackRestoredQuery }, consoleErrors: dictionaryTab.errors }))
dictionaryTab.ws.close()

const grammarTab = await createTab('/grammar', 390, 844, 'light')
await waitForText(grammarTab, 'Showing')
await evaluate(grammarTab, `(()=>{const input=document.querySelector('input[type=search]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'despite');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
await waitForText(grammarTab, '～にもかかわらず')
await evaluate(grammarTab, `(()=>{const select=document.querySelector('select');select.value='N2';select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
await pause(350)
const grammarSearchAndFilter = await evaluate(grammarTab, `document.body.innerText.includes('～にもかかわらず') && document.body.innerText.includes('N2')`)
console.log(JSON.stringify({ grammar: { englishMeaningSearchAndLevelFilter: grammarSearchAndFilter }, consoleErrors: grammarTab.errors }))
grammarTab.ws.close()

const invalidKanjiTab = await createTab('/kanji/%E4%B8%8D%E5%AD%98%E5%9C%A8', 390, 844, 'light')
await waitForText(invalidKanjiTab, 'Kanji not found')
const invalidKanjiState = await evaluate(invalidKanjiTab, `document.body.innerText.includes('not present in the installed offline dataset')`)
invalidKanjiTab.ws.close()
const invalidGrammarTab = await createTab('/grammar/no-such-pattern', 390, 844, 'light')
await waitForText(invalidGrammarTab, 'Grammar pattern not found')
const invalidGrammarState = await evaluate(invalidGrammarTab, `document.body.innerText.includes('not present in the installed offline dataset')`)
invalidGrammarTab.ws.close()
const invalidWordTab = await createTab('/dictionary/no-such-entry', 390, 844, 'light')
await waitForText(invalidWordTab, 'Entry not found')
const invalidWordState = await evaluate(invalidWordTab, `document.body.innerText.includes('Entry not found')`)
console.log(JSON.stringify({ invalidRoutes: { kanji: invalidKanjiState, grammar: invalidGrammarState, dictionary: invalidWordState }, consoleErrors: invalidWordTab.errors }))
invalidWordTab.ws.close()
