// Plan §11.6: full catalog build plus real ordinary-tool Host/DOM delegation.
// No external HTTP request or user workspace write is performed.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { buildBundle } from '../build/build-bundle.mjs'
import { makeSourceLoader } from '../build/source-loader.mjs'
import { PLUGINS } from '../build/plugin-catalog.mjs'
import { createFixtureRenderer, documentFor, root } from '../smoke/fixtures/flowglass-ux.mjs'

const require = createRequire(import.meta.url)
let playwright
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(root, '.scratch/dsh-rc2-composition/node_modules/playwright'), path.join(root, '.scratch/pw-test/node_modules/playwright')].filter(Boolean)) { try { playwright = require(candidate); break } catch {} }
if (!playwright) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright package; no dependencies are installed by this test.')
const loader = makeSourceLoader(pathToFileURL(root + path.sep))
const features = PLUGINS.filter((entry) => entry.bundle?.selectable).map((entry) => entry.key)
const built = buildBundle(loader, { features, id: 'dynamic-toolbox', name: 'dsh-dynamic-toolbox', version: '0.6.1' })
assert.ok(built.ok, built.errors?.join('\n'))
const info = JSON.parse(built.files.get('BUILDINFO.json'))
assert.deepEqual(info.features.explicit.slice().sort(), features.slice().sort(), 'every selectable catalog entry explicitly requested')
assert.equal(info.componentRows.length, features.filter((key) => PLUGINS.find((entry) => entry.key === key).hostFiles?.length).length)
const outputDir = path.join(root, '.scratch/ux-toolbox-compat')
for (const [file, contents] of built.files) { const destination = path.join(outputDir, file); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, contents) }
console.log(`PASS | explicit complete catalog (${features.length} features), ${info.componentRows.length} independently loadable Host rows`)

const handlers = {}
const states = new Map()
let requests = 0
const subprocess = { spawn({ stdio }) {
  requests++
  const spec = JSON.parse(stdio.stdin.data)
  const payload = JSON.stringify({ ok: true, status: 200, statusText: 'OK', headers: { 'content-type': 'application/json', 'x-fixture-url': spec.url }, body: JSON.stringify({ result: 'synthetic asynchronous result' }), bytes: 42, ms: 150, truncated: false })
  return { done: new Promise((resolve) => setTimeout(() => resolve({ exitCode: 0 }), 150)), collected: { stdout: { readFrom: () => ({ text: payload }) }, stderr: { readFrom: () => ({ text: '' }) } } }
} }
const registry = { register(descriptor, handler) { handlers[descriptor.id] = handler; return () => { delete handlers[descriptor.id] } } }
const ctx = { get(name) { if (name === 'toolboxRegistry') return registry; if (name === 'subprocess') return subprocess; if (name === 'sandboxPolicy') return { workspaceRoot: root }; return undefined }, on() {}, effect() {}, interval(fn) { try { fn() } catch {} return () => {} }, timeout() { return () => {} } }
for (const id of ['calc', 'http']) {
  const source = ['shared/runtime.js', 'shared/host.js', `plugins/${id}/tool.js`].map(loader.read).join('\n')
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + source + '\n})()')(ctx, undefined, console)
  await plugin.apply(ctx)
  assert.equal(typeof handlers[id], 'function')
}
const dispatch = async ({ id, action = '', fields = {}, bundle = 'dynamic-source', workspace = 'workspace-a', session = 'session-a' }) => {
  const key = bundle + ':' + workspace + ':' + session + ':' + id
  const output = await handlers[id]({ action, fields, state: states.get(key) || null, root, session })
  assert.ok(output.ok)
  states.set(key, output.state)
  return output
}
const client = loader.read('plugins/toolbox/client.js')
const fieldStart = client.indexOf('function collectFields()')
const fieldEnd = client.indexOf('async function loadPanel(', fieldStart)
const clickStart = client.indexOf('function onPanelClick(e)')
const clickEnd = client.indexOf('function onPanelKeyDown(e)', clickStart)
assert.ok(fieldStart > 0 && fieldEnd > fieldStart && clickStart > 0 && clickEnd > clickStart)
const sourceDelegation = client.slice(fieldStart, fieldEnd) + '\n' + client.slice(clickStart, clickEnd)
const renderer = await createFixtureRenderer()
const browser = await playwright.chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 940 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.exposeFunction('fixtureToolRequest', dispatch)
try {
  for (const mode of ['dynamic-source', 'native-toolbox']) {
    await page.setContent(documentFor('', renderer.css, { width: 720 }).replaceAll('data-dsh-toolbox-scope="flow"', `data-dsh-toolbox-scope="${mode}"`))
    await page.addScriptTag({ content: `(() => {
      let active = ''; const panelRef = { current: document.querySelector('.tb-frame') }; const suppressFlowClickUntilRef = { current: 0 };
      window.toolRequests = [];
      async function loadPanel(id, action, element) { const fields = collectFields(); fields.__el = element ? { ...element.dataset } : {}; const promise = window.fixtureToolRequest({ id, action, fields, bundle: '${mode}' }); window.toolRequests.push(promise); const result = await promise; panelRef.current.querySelector('.tb-panel-html').innerHTML = result.html; }
      ${sourceDelegation}
      panelRef.current.addEventListener('click', onPanelClick);
      window.showTool = async (id, workspace = 'workspace-a', session = 'session-a') => { active = id; const result = await window.fixtureToolRequest({ id, workspace, session, bundle: '${mode}' }); panelRef.current.querySelector('.tb-panel-html').innerHTML = result.html; };
    })()` })
    await page.evaluate(() => window.showTool('calc'))
    await page.locator('[data-field="input"]').fill('工具箱兼容 ✓')
    await page.locator('[data-action="run"]').click()
    await page.evaluate(() => Promise.all(window.toolRequests))
    assert.ok((await page.locator('.tb-panel-html').textContent()).includes(Buffer.from('工具箱兼容 ✓').toString('base64')))
    console.log(`PASS | ${mode}: actual calc fields/click delegation/Host conversion result`)
    await page.evaluate(() => window.showTool('http'))
    await page.locator('[data-field="url"]').fill('https://fixture.invalid/example')
    const before = requests
    await page.locator('[data-action="send"]').click()
    await page.evaluate(() => Promise.all(window.toolRequests))
    assert.equal(requests, before + 1)
    assert.ok((await page.locator('.tb-panel-html').textContent()).includes('synthetic asynchronous result'))
    await page.locator('[data-action="res-tab"][data-v="headers"]').click()
    await page.evaluate(() => Promise.all(window.toolRequests))
    assert.ok((await page.locator('.tb-panel-html').textContent()).includes('x-fixture-url'))
    assert.equal(requests, before + 1, 'detail navigation does not resend HTTP')
    assert.equal(await page.locator('[data-flow-stable]').count(), 0, 'ordinary tools retain generic HTML path')
    console.log(`PASS | ${mode}: asynchronous ordinary tool output/details, no external HTTP, no Flow-only dependency`)
    await page.evaluate(() => window.showTool('calc', 'workspace-b', 'session-b'))
    assert.equal(await page.locator('[data-field="input"]').inputValue(), '')
    await page.evaluate(() => window.showTool('calc'))
    assert.equal(await page.locator('[data-field="input"]').inputValue(), '工具箱兼容 ✓')
    console.log(`PASS | ${mode}: synthetic workspace/Session response state remains isolated`)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }
fs.writeFileSync(path.join(outputDir, 'COMPAT-TEST.json'), JSON.stringify({ generatedAt: new Date().toISOString(), features, componentRows: info.componentRows, browser: browser.version(), assertions: 'actual shared click/field code + actual calc/http Host; transport/state store mocked; no full Harness mount', externalRequests: 0 }, null, 2) + '\n')
console.log('Compatibility bundle and report: ' + outputDir)
