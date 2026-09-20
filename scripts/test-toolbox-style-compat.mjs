// Style isolation gate: actual flowedit HTML beside actual Flowglass HTML.
// Compare every computed CSS property and element geometry against HEAD styles.
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
if (!playwright) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed playwright package.')
let renderFlowedit
const ctx = {
  get(name) {
    if (name === 'toolboxRegistry') return { register(_descriptor, handler) { renderFlowedit = handler; return () => {} } }
    if (name === 'sandboxPolicy') return { workspaceRoot: root }
  },
  effect() {}, on() {}, interval(fn) { fn(); return () => {} }, timeout() { return () => {} },
}
const source = ['shared/runtime.js', 'shared/host.js', 'plugins/flowedit/tool.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n')
const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + source + '\n})()')(ctx, undefined, console)
await plugin.apply(ctx)
const legacy = await renderFlowedit({ action: 'preview', fields: {}, state: { files: [], name: 'synthetic', md: '# 样式兼容验证\n\n## 输入\n收集需求\n\n### gate:ifElse 是否通过\n- 是 → 输出\n- 否 → 修正\n\n## 修正\n修复问题\n\n## 输出\n给出结果', view: 'split', dirty: false }, root, session: 'synthetic-session' })
assert.ok(legacy.html.includes('fl-node') && legacy.html.includes('fl-row'), 'actual flowedit shares fl-* classes')
const baseline = await createFixtureRenderer({ ref: 'HEAD' })
const current = await createFixtureRenderer()
const flow = await current.render('normal')
const browser = await playwright.chromium.launch({ headless: true })
const page = await browser.newPage()
let cases = 0
try {
  for (const width of [360, 720, 1440]) for (const theme of ['light', 'dark']) for (const mode of ['dynamic-global', 'compiled-scope']) {
    await page.setViewportSize({ width: width * 2 + 32, height: 960 })
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme })
    const snapshots = []
    for (const css of [baseline.css, current.css]) {
      let doc = documentFor(legacy.html, mode === 'compiled-scope' ? css : '', { width, theme })
      const sibling = `<section id="flow-fixture" data-dsh-toolbox-scope="flow" style="position:absolute;left:${width + 16}px;top:0;width:${width}px;height:900px"><div class="jr-drawer jr-drawer-embedded"><div class="jr-drawer-body"><div class="tb-frame"><div class="tb-panel-html">${flow.html}</div></div></div></div></section>`
      if (mode === 'dynamic-global') doc = doc.replace('</head>', `<style>${css}</style></head>`)
      doc = doc.replace('</body>', sibling + '</body>')
      await page.setContent(doc)
      await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))))
      snapshots.push(await page.evaluate(() => [...document.querySelectorAll('#fixture .tb-panel-html *')].map((node) => {
        const styles = getComputedStyle(node)
        const css = Object.fromEntries([...styles].filter((key) => !key.startsWith('--')).map((key) => [key, styles.getPropertyValue(key)]))
        const rect = node.getBoundingClientRect()
        return { tag: node.tagName, className: node.className, rect: [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100), css }
      })))
    }
    assert.deepEqual(snapshots[1], snapshots[0], `flowedit remains visually unchanged at ${width}px ${theme} ${mode}`)
    cases++
    console.log(`flowedit + flow ${width}px ${theme} ${mode}: identical geometry and computed styles`)
  }
} finally { await browser.close() }
console.log(`${cases} compatibility layouts passed`)
