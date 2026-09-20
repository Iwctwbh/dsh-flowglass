// Real React DOM regression for the Client's stable composer/Inspector islands.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createFixtureRenderer, documentFor, root } from '../smoke/fixtures/flowglass-ux.mjs'

const require = createRequire(import.meta.url)
const candidates = [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(root, '.scratch/dsh-rc2-composition/node_modules/playwright'), path.join(root, '.scratch/pw-test/node_modules/playwright')].filter(Boolean)
let playwright, modulePath
for (const candidate of candidates) { try { modulePath = require.resolve(candidate); playwright = require(modulePath); break } catch {} }
if (!playwright) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an existing Playwright installation; this test does not install dependencies.')
const dependencyRequire = createRequire(modulePath)
const dependencySource = (name, file) => fs.readFileSync(path.join(path.dirname(dependencyRequire.resolve(name + '/package.json')), file), 'utf8')
const source = fs.readFileSync(path.join(root, 'plugins/toolbox/flow-stable.js'), 'utf8')
const renderer = await createFixtureRenderer()
const composer = (await renderer.render('composer')).html
const detail = (await renderer.render('detail')).html
const shell = documentFor('', renderer.css, { width: 960 })
const server = http.createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(shell) })
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await playwright.chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1120, height: 960 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
let checks = 0
const check = (label, result) => { assert.equal(result, true, label); checks++; console.log('PASS | ' + label) }
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.addScriptTag({ content: dependencySource('react', 'umd/react.development.js') })
  await page.addScriptTag({ content: dependencySource('react-dom', 'umd/react-dom.development.js') })
  const bootstrap = `(() => { const RT = { storageKey: key => 'fixture.flow.' + key }; ${source}; const { FlowStablePanel } = createFlowStableRuntime(RT, React); let reactRoot = ReactDOM.createRoot(document.querySelector('.tb-panel-html')); window.mountFlow = (html, workspace = 'workspace-a') => ReactDOM.flushSync(() => reactRoot.render(React.createElement(FlowStablePanel, { html, workspace }))); window.remountFlow = () => { ReactDOM.flushSync(() => reactRoot.unmount()); reactRoot = ReactDOM.createRoot(document.querySelector('.tb-panel-html')); }; const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document); window.inspectorListeners = new Set(); document.addEventListener = (type, listener, options) => { if (type === 'selectionchange') window.inspectorListeners.add(listener); return add(type, listener, options); }; document.removeEventListener = (type, listener, options) => { if (type === 'selectionchange') window.inspectorListeners.delete(listener); return remove(type, listener, options); }; })()`
  await page.addScriptTag({ content: bootstrap })
  await page.evaluate((html) => window.mountFlow(html), composer)
  check('actual Host composer mounts through actual stable Client component', await page.locator('[data-flow-stable] [data-zoom-prompt]').count() === 1)
  check('empty model and effort values retain a visibly selected default option', await page.locator('select').evaluateAll((selects) => selects.every((select) => select.value === '' && select.selectedIndex === 0 && select.options[0].value === '')))
  const selectFixture = '<div data-flow data-flow-scope="select-regression"><div class="tb-pane-head"><select data-field="route"><option value="">Default</option><option value="model-a">Model A</option><option value="model-b">Model B</option></select></div></div>'
  await page.evaluate((html) => window.mountFlow(html), selectFixture)
  await page.locator('select').selectOption('model-a')
  await page.evaluate((html) => window.mountFlow(html), selectFixture)
  check('unrelated React render does not reset a selection before its Host response', await page.locator('select').inputValue() === 'model-a')
  await page.evaluate((html) => window.mountFlow(html.replace('value="model-a"', 'value="model-a" selected')), selectFixture)
  check('Host acknowledgment preserves the selected model', await page.locator('select').inputValue() === 'model-a')
  await page.evaluate((html) => window.mountFlow(html.replace('value="model-b"', 'value="model-b" selected')), selectFixture)
  check('Host model changes synchronize even while the select has focus', await page.locator('select').inputValue() === 'model-b')
  await page.evaluate((html) => window.mountFlow(html), selectFixture)
  check('returning to default selects the actual empty option', await page.locator('select').inputValue() === '' && await page.locator('select').evaluate((select) => select.selectedIndex) === 0)
  await page.evaluate((html) => window.mountFlow(html), composer)
  const prompt = page.locator('[data-zoom-prompt]')
  await prompt.fill('测试草稿 Mixed draft 内容')
  await prompt.focus()
  await page.evaluate(() => { const input = document.querySelector('[data-zoom-prompt]'); input.setSelectionRange(2, 7); window.originalPrompt = input; input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '中' })) })
  await page.evaluate((html) => window.mountFlow(html.replaceAll('并发任务', '并发任务更新').replaceAll('示例中文结果', '实时追加内容')), composer)
  check('refresh during IME preserves textarea identity, focus, value and selection', await page.evaluate(() => { const input = document.querySelector('[data-zoom-prompt]'); return input === window.originalPrompt && document.activeElement === input && input.value === '测试草稿 Mixed draft 内容' && input.selectionStart === 2 && input.selectionEnd === 7 }))
  await page.evaluate(() => document.querySelector('[data-zoom-prompt]').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中' })))
  await page.evaluate((html) => window.mountFlow(html, 'workspace-b'), composer)
  check('new workspace does not receive previous workspace draft', await prompt.inputValue() === '')
  await page.evaluate((html) => window.mountFlow(html, 'workspace-a'), composer)
  check('returning workspace restores its own draft', await prompt.inputValue() === '测试草稿 Mixed draft 内容')
  await page.evaluate((html) => { const template = document.createElement('template'); template.innerHTML = html; template.content.firstElementChild.setAttribute('data-flow-scope', 'different-session'); window.mountFlow(template.innerHTML) }, composer)
  check('different session scope does not receive previous draft', await prompt.inputValue() === '')
  await page.evaluate((html) => { window.remountFlow(); window.mountFlow(html) }, composer)
  check('unmount/reopen restores scoped draft', await prompt.inputValue() === '测试草稿 Mixed draft 内容')
  await page.reload()
  await page.addScriptTag({ content: dependencySource('react', 'umd/react.development.js') })
  await page.addScriptTag({ content: dependencySource('react-dom', 'umd/react-dom.development.js') })
  await page.addScriptTag({ content: bootstrap })
  await page.evaluate((html) => window.mountFlow(html), composer)
  check('page reload restores draft from localStorage without in-memory cache', await prompt.inputValue() === '测试草稿 Mixed draft 内容')
  await page.evaluate((html) => window.mountFlow(html), detail)
  check('actual Host Inspector mounts in stable Client island', await page.locator('[data-flow-inspector]').count() === 1)
  const inspector = page.locator('[data-flow-inspector]')
  await page.evaluate(() => {
    const rail = document.querySelector('[data-flow-inspector]'); window.originalInspector = rail
    const scroll = [...rail.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY)); if (!scroll) throw new Error('Fixture has no scrollable Inspector output'); scroll.scrollTop = 120; window.inspectorScrollNode = scroll; window.inspectorScroll = scroll.scrollTop; if (!window.inspectorScroll) throw new Error('Inspector fixture did not scroll')
    const text = [...rail.querySelectorAll('*')].flatMap((el) => [...el.childNodes]).find((node) => node.nodeType === 3 && node.textContent.includes('配置读取成功'))
    if (!text) throw new Error('Fixture has no tool output text')
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 7)
    const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'))
  })
  await page.waitForFunction(() => document.querySelector('[data-flow-inspector]').getAttribute('data-flow-reading') === '1')
  await page.evaluate((html) => window.mountFlow(html.replaceAll('配置读取成功', '配置读取更新')), detail)
  check('refresh preserves Inspector DOM, selected text and nonzero scroll while reading', await page.evaluate(() => { const rail = document.querySelector('[data-flow-inspector]'); return rail === window.originalInspector && document.getSelection().toString() === '配置读取成功。' && window.inspectorScrollNode.isConnected && window.inspectorScrollNode.scrollTop === window.inspectorScroll }))
  await page.evaluate(() => { document.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange')) })
  await page.waitForFunction(() => document.querySelector('[data-flow-inspector]').getAttribute('data-flow-reading') === '0')
  check('Inspector accepts pending content when selection ends', (await inspector.textContent()).includes('配置读取更新'))
  for (let i = 0; i < 20; i++) await page.evaluate((html) => { window.remountFlow(); window.mountFlow(html) }, i % 2 ? composer : detail)
  check('20 remounts keep exactly one Flowglass root', await page.locator('[data-flow-stable]').count() === 1)
  check('Inspector selection listeners are released after 20 remounts', await page.evaluate(() => window.inspectorListeners.size === 0))
  check('no browser page errors', errors.length === 0)
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)) }
console.log(`${checks} stable-island checks passed. Synthetic logs, local React DOM, no Harness instance used.`)
