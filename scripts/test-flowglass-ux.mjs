// Offline browser regression: actual Host HTML + actual scoped Client CSS, synthetic logs only.
// node scripts/test-flowglass-ux.mjs [--baseline-ref HEAD] [--output .scratch/ux-current]
// PLAYWRIGHT_MODULE_PATH may point to an installed playwright directory or package entry.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { createFixtureRenderer, documentFor, fixtureNames, root } from '../smoke/fixtures/flowglass-ux.mjs'

const args = process.argv.slice(2)
const option = (name, fallback = '') => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const baselineRef = option('--baseline-ref')
const outputDir = path.resolve(root, option('--output', '.scratch/ux-' + (baselineRef ? 'baseline' : 'current')))
const require = createRequire(import.meta.url)
const candidates = [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(root, '.scratch/dsh-rc2-composition/node_modules/playwright'), path.join(root, '.scratch/pw-test/node_modules/playwright')].filter(Boolean)
let playwright, modulePath
for (const candidate of candidates) {
  try { modulePath = require.resolve(candidate); playwright = require(modulePath); break } catch {}
}
if (!playwright) throw new Error('Playwright is not installed. Set PLAYWRIGHT_MODULE_PATH to an existing playwright package. This test does not install dependencies.')
fs.mkdirSync(outputDir, { recursive: true })
const renderer = await createFixtureRenderer({ ref: baselineRef })
const browser = await playwright.chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 2000, height: 1140 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
const results = []
const failures = []
const sizes = [{ width: 360, height: 900 }, { width: 480, height: 900 }, { width: 720, height: 900 }, { width: 960, height: 900 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]
const variations = [{ theme: 'dark', font: 14, motion: 'no-preference' }, { theme: 'light', font: 14, motion: 'no-preference' }, { theme: 'dark', font: 20, motion: 'reduce' }, { theme: 'light', font: 20, motion: 'reduce' }]
try {
  for (const name of fixtureNames) {
    const samples = []
    let output
    for (let i = 0; i < 25; i++) { const t = performance.now(); output = await renderer.render(name); samples.push(performance.now() - t) }
    samples.sort((a, b) => a - b)
    for (const { width, height } of sizes) for (const variation of variations) {
      await page.emulateMedia({ colorScheme: variation.theme, reducedMotion: variation.motion })
      await page.setContent(documentFor(output.html, renderer.css, { width, height, ...variation }), { waitUntil: 'load' })
      await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))))
      const measurement = await page.evaluate(() => {
        const flow = document.querySelector('[data-flow]')
        const body = flow?.querySelector('.tb-pane-body')
        const paneRect = flow?.getBoundingClientRect()
        const nodes = [...document.querySelectorAll('[data-flow-select-seq]')]
        const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
        const scrollableDiagram = !flow.hasAttribute('data-flow-board') && getComputedStyle(body).overflowX === 'auto'
        const lanes = [...flow.querySelectorAll('.fl-lane')]
        const threeColumns = !scrollableDiagram || lanes.every((lane) => getComputedStyle(lane).display === 'grid' && getComputedStyle(lane).gridTemplateColumns.split(' ').length === 3 && lane.getBoundingClientRect().left >= paneRect.left - 2)
        const laneTracks = lanes.length ? getComputedStyle(lanes[0]).gridTemplateColumns.split(' ').map(parseFloat) : []
        const laneTrackTotal = laneTracks.reduce((sum, width) => sum + width, 0)
        const laneRatio = laneTrackTotal ? laneTracks.map((width) => Number((width / laneTrackTotal).toFixed(3))) : []
        const requestedLaneRatio = !scrollableDiagram || laneRatio.length !== 3 || laneRatio.every((value, index) => Math.abs(value - [0.2, 0.35, 0.45][index]) <= 0.015)
        const wrappedSubagentNames = [...flow.querySelectorAll('.fl-sub-card .fl-iohead>.fl-name')].filter(visible).filter((name) => {
          const style = getComputedStyle(name)
          return style.whiteSpace !== 'nowrap' || name.getBoundingClientRect().height > parseFloat(style.lineHeight) * 1.5
        }).length
        const laneBottoms = lanes.map((lane) => lane.getBoundingClientRect().bottom)
        const latestBottomGap = lanes.length && !flow.hasAttribute('data-flow-board') ? Math.round(body.getBoundingClientRect().bottom - Math.max(...laneBottoms)) : null
        const overflows = [...document.querySelectorAll('.fl-lane,.fl-msg,.fl-iocard,.fl-zoom-branch,.fl-zoom-card,.tb-pane-header,.fl-rail')].filter(visible).filter((el) => { if (scrollableDiagram && el.closest('.fl-lane')) return false; const r = el.getBoundingClientRect(); return r.left < paneRect.left - 2 || r.right > paneRect.right + 2 }).map((el) => ({ cls: el.className, width: Math.round(el.getBoundingClientRect().width) })).slice(0, 8)
        const inaccessible = [...document.querySelectorAll('.fl-msg[data-action],.fl-iocard[data-action],.fl-node-open[data-action]')].filter(visible).filter((el) => (el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') || el.tabIndex < 0).length
        const infiniteAnimations = [...document.querySelectorAll('[data-flow] *')].filter(visible).filter((el) => [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after')].some((style) => style.animationName !== 'none' && style.animationIterationCount === 'infinite')).length
        const parallelGroups = [...document.querySelectorAll('.fl-lane-side.fl-grp')]
        const parallelSeparators = [...document.querySelectorAll('.fl-lane-side.fl-grp>.fl-wp~.fl-wp')]
        const parallelEmphasis = parallelGroups.every((group) => { const style = getComputedStyle(group); return style.borderTopStyle === 'dashed' && style.borderLeftStyle === 'dashed' && parseFloat(style.borderTopWidth) >= 1 && parseFloat(style.borderLeftWidth) >= 1 && style.boxShadow === 'none' && style.backgroundColor === 'rgba(0, 0, 0, 0)' }) && parallelSeparators.every((separator) => { const style = getComputedStyle(separator); return style.borderTopStyle === 'dashed' && parseFloat(style.borderTopWidth) >= 1 })
        return { dom: flow?.querySelectorAll('*').length || 0, nodes: nodes.length, flowWidth: Math.round(paneRect?.width || 0), bodyClient: body?.clientWidth, bodyScroll: body?.scrollWidth, scrollableDiagram, threeColumns, laneRatio, requestedLaneRatio, wrappedSubagentNames, latestBottomGap, overflows, inaccessible, infiniteAnimations, parallelGroups: parallelGroups.length, parallelSeparators: parallelSeparators.length, parallelEmphasis, systemContexts: document.querySelectorAll('.fl-system-context').length, expandedContexts: document.querySelectorAll('.fl-system-context[open]').length }
      })
      const key = `${name}-${width}-${variation.theme}-${variation.font}`
      const row = { name, width, height, ...variation, payloadBytes: Buffer.byteLength(JSON.stringify(output)), hostP95Ms: Number(samples[Math.ceil(samples.length * .95) - 1].toFixed(2)), sampleCount: samples.length, sourceEventCount: output.sourceEventCount, ...measurement }
      results.push(row)
      if (!baselineRef) {
        if (!measurement.dom) failures.push(key + ': no actual Flowglass DOM')
        if (!['map', 'compare'].includes(name) && measurement.overflows.length) failures.push(key + ': content outside panel ' + JSON.stringify(measurement.overflows))
        if (!measurement.threeColumns) failures.push(key + ': session diagram must retain three reachable lanes')
        if (!measurement.requestedLaneRatio) failures.push(key + ': session diagram lane ratio is not 20/35/45: ' + measurement.laneRatio.join('/'))
        if (measurement.wrappedSubagentNames) failures.push(key + ': ' + measurement.wrappedSubagentNames + ' subagent names wrap vertically')
        if (measurement.latestBottomGap != null && measurement.latestBottomGap > 14) failures.push(key + ': latest session node is not bottom-aligned: ' + measurement.latestBottomGap + 'px')
        if (!measurement.scrollableDiagram && !['map', 'compare', 'detail'].includes(name) && measurement.bodyScroll > measurement.bodyClient + 2) failures.push(key + ': non-diagram content horizontally scrolls')
        if (measurement.inaccessible) failures.push(key + ': ' + measurement.inaccessible + ' cards missing keyboard semantics')
        if (variation.motion === 'reduce' && measurement.infiniteAnimations) failures.push(key + ': reduced motion still animates')
        if (name === 'long' && measurement.nodes > 60) failures.push(key + ': default history exceeds 60 nodes')
        if (name === 'normal' && (!measurement.systemContexts || measurement.expandedContexts)) failures.push(key + ': system context is not collapsed by default')
        if (name === 'normal' && (!measurement.parallelGroups || !measurement.parallelSeparators || !measurement.parallelEmphasis)) failures.push(key + ': right-lane parallel calls lack a distinct frame or separator')
      }
      if ((width === 360 || width === 1440) && variation.font === 14 && ['normal', 'failed', 'concurrent', 'compare', 'detail'].includes(name)) await page.locator('#fixture').screenshot({ path: path.join(outputDir, key + '.png') })
    }
    console.log(`${name}: ${sizes.length * variations.length} layouts; Host P95 ${samples[Math.ceil(samples.length * .95) - 1].toFixed(2)} ms`)
  }
} finally { await browser.close() }
if (pageErrors.length) failures.push(...pageErrors)
const report = { generatedAt: new Date().toISOString(), source: baselineRef || 'working-tree', sourceHashes: renderer.sourceHashes, browser: browser.version(), node: process.version, playwright: require(path.join(path.dirname(modulePath), 'package.json')).version, modulePath, limitations: ['Host render with synthetic logs and product CSS; does not mount React Client or official Markdown renderer.', 'Host timings use in-memory sessionQuery, warm caches and 25 samples; not RPC, user interaction, streaming latency, or production performance.', 'No connection to, changes to, or messages sent through a Harness server.'], results, failures }
fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`${results.length} layouts; ${failures.length} failures. Report: ${path.join(outputDir, 'report.json')}`)
for (const failure of failures.slice(0, 30)) console.error(failure)
if (failures.length) process.exitCode = 1
