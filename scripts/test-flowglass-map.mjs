// Offline browser regression of the actual graph effect and Host graph markup.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createFixtureRenderer, documentFor, root } from '../smoke/fixtures/flowglass-ux.mjs'

const require = createRequire(import.meta.url)
let playwright
for (const entry of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(root, '.scratch/dsh-rc2-composition/node_modules/playwright'), path.join(root, '.scratch/pw-test/node_modules/playwright')].filter(Boolean)) {
  try { playwright = require(entry); break } catch {}
}
if (!playwright) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed playwright package; this test does not install dependencies.')
const source = fs.readFileSync(path.join(root, 'plugins/toolbox/client.js'), 'utf8')
const start = source.indexOf('React.useEffect(() => {', source.indexOf('// 导图画布：'))
const end = source.indexOf('// “添加其他 Session”', start)
assert.ok(start > 0 && end > start, 'actual graph effect can be loaded')
const effect = source.slice(start, end)
const renderer = await createFixtureRenderer()
const fixture = await renderer.render('map')
assert.match(fixture.html, /data-flow-mindmap/, 'fixture renders an actual graph')
const browser = await playwright.chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1520, height: 960 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
try {
  // A local origin provides real browser storage; all requests are fulfilled in memory.
  await page.route('http://flowglass.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }))
  await page.goto('http://flowglass.test/')
  for (const width of [360, 720, 1440]) {
    await page.setContent(documentFor(fixture.html, renderer.css, { width, height: 900 }))
    await page.evaluate(({ effect, width }) => {
      localStorage.clear()
      window.graphPositions = { current: new Map() }
      window.graphViews = { current: new Map() }
      window.installGraph = () => {
        const React = { useEffect(callback) { window.disposeGraph = callback() } }
        const execute = new Function('React', 'panelRef', 'active', 'html', 'currentCwd', 'RT', 'flowMindMapPositionsRef', 'flowMindMapViewportRef', effect)
        execute(React, { current: document.querySelector('.tb-frame') }, 'flow', 'fixture', 'synthetic-workspace-' + width, { storageKey: (key) => 'fixture.' + key }, window.graphPositions, window.graphViews)
      }
      window.installGraph()
    }, { effect, width })
    await page.waitForTimeout(220)
    const fit = await page.evaluate(() => {
      const viewport = document.querySelector('[data-flow-mindmap]')
      const rect = viewport.getBoundingClientRect()
      return { scale: Number(viewport.dataset.mapScale), outside: [...document.querySelectorAll('[data-map-node]')].filter((node) => { const r = node.getBoundingClientRect(); return r.left < rect.left - 1 || r.top < rect.top - 1 || r.right > rect.right + 1 || r.bottom > rect.bottom + 1 }).length }
    })
    assert.equal(fit.outside, 0, width + ': first fit shows every branch')
    assert.ok(fit.scale >= .1 && fit.scale <= 1, width + ': fit scale is supported')
    if (width === 360) {
      await page.locator('#fixture').evaluate((node) => { node.style.width = '480px' })
      await page.waitForTimeout(100)
      assert.ok(Number(await page.locator('[data-flow-mindmap]').getAttribute('data-map-scale')) > fit.scale, 'fit follows host panel expansion')
    }
    await page.locator('[data-map-zoom="reset"]').click()
    assert.equal(await page.locator('[data-flow-mindmap]').getAttribute('data-map-scale'), '1')
    await page.locator('[data-map-zoom="out"]').click()
    assert.equal(await page.locator('[data-flow-mindmap]').getAttribute('data-map-scale'), '0.8')
    const rootSelect = page.locator('[data-map-node="root"] [data-map-select]')
    await rootSelect.focus()
    await page.keyboard.press('ArrowRight')
    const selected = page.locator('[data-map-selected="true"]')
    const id = await selected.getAttribute('data-map-node')
    assert.notEqual(id, 'root', width + ': keyboard selects next node')
    const before = await selected.evaluate((node) => parseFloat(node.style.left))
    await page.keyboard.press('Control+ArrowRight')
    assert.equal(await selected.evaluate((node) => parseFloat(node.style.left)), before + 20, width + ': keyboard moves selected node')
    const changedEdge = await page.locator(`[data-map-to="${id}"]`).getAttribute('d')
    assert.ok(changedEdge?.startsWith('M '), width + ': edges follow keyboard layout')
    await page.locator('[data-map-fit]').click()
    assert.equal(await selected.evaluate((node) => parseFloat(node.style.left)), before + 20, width + ': fit retains manual layout')
    await page.locator('[data-map-zoom="reset"]').click()
    await page.locator('[data-map-center]').click()
    const state = await page.evaluate(() => {
      const view = document.querySelector('[data-flow-mindmap]')
      window.disposeGraph()
      return { left: view.scrollLeft, top: view.scrollTop }
    })
    await page.evaluate((html) => {
      document.querySelector('.tb-panel-html').innerHTML = html
      window.installGraph()
    }, fixture.html)
    await page.waitForTimeout(220)
    assert.equal(await page.locator('[data-map-selected="true"]').getAttribute('data-map-node'), id, width + ': selection survives refresh')
    assert.equal(await page.locator('[data-map-selected="true"]').evaluate((node) => parseFloat(node.style.left)), before + 20, width + ': manual node position survives refresh')
    const restored = await page.locator('[data-flow-mindmap]').evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }))
    assert.ok(Math.abs(restored.left - state.left) <= 1 && Math.abs(restored.top - state.top) <= 1, width + ': viewport survives refresh')
    await page.locator('[data-map-reset]').click()
    assert.equal(await page.locator('[data-map-selected="true"]').evaluate((node) => parseFloat(node.style.left)), before, width + ': reset restores default layout')
    await page.locator('[data-map-zoom="reset"]').click()
    await page.locator('[data-map-zoom="in"]').click()
    await page.locator('[data-map-zoom="in"]').click()
    await page.locator('[data-map-pan="left"]').click()
    const panBefore = await page.locator('[data-flow-mindmap]').evaluate((node) => node.scrollLeft)
    await page.locator('[data-map-pan="right"]').click()
    assert.ok(await page.locator('[data-flow-mindmap]').evaluate((node) => node.scrollLeft) > panBefore, width + ': pan buttons move enlarged graph')
    await page.evaluate((html) => {
      window.disposeGraph()
      window.graphPositions = { current: new Map() }
      window.graphViews = { current: new Map() }
      document.querySelector('.tb-panel-html').innerHTML = html
      window.installGraph()
    }, fixture.html)
    assert.equal(await page.locator('[data-flow-mindmap]').getAttribute('data-map-scale'), '1.5', width + ': local storage restores graph after remount')
    assert.equal(await page.locator('[data-map-selected="true"]').getAttribute('data-map-node'), id, width + ': local storage restores selected node')
    await page.evaluate(() => window.disposeGraph())
    console.log(`graph ${width}px: fit, zoom, keyboard, layout, refresh and reset passed`)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }
