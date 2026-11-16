// Real DOM regression for the desktop sidebar wrappers and native-guide handoff.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { assembleClientSource } from '../build/source-assembly.mjs'

const require = createRequire(import.meta.url)
let playwright
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', '../.scratch/pw-test/node_modules/playwright', '../.scratch/dsh-rc2-composition/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(candidate); break } catch {}
}
if (!playwright) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed Playwright package.')
const source = assembleClientSource((file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8'), 'plugins/toolbox/client.js', { includeRuntime: true })
const browser = await playwright.chromium.launch({ headless: true })
try {
  for (const modern of [true, false]) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.setContent(`<div data-pane="sidebar"><div id="sidebar-root">
      <div class="logoRow">Harness</div>
      ${modern ? '<div class="newSessionRow"><button class="newSession">新会话</button></div><div class="scrollRegion"><div class="scrollArea"><nav class="panelList"><button>更多</button></nav><section>工作区</section></div></div>' : '<button class="newSession">新会话</button><section>工作区</section>'}
      <footer>用户设置</footer></div></div>`)
    const result = await page.evaluate(async ({ source, modern }) => {
      const cleanups = []
      const pending = []
      const definitions = []
      const services = {}
      const slots = { inject() { return () => {} }, register() { return () => {} } }
      const ctx = {
        get(name) { return name === 'slots' ? slots : services[name] },
        effect(fn) { const dispose = fn(); if (typeof dispose === 'function') cleanups.push(dispose); return dispose },
        inject(names, cb) { pending.push({ names, cb }) },
        timeout() { return () => {} },
      }
      const React = { createElement: (type, props, ...children) => ({ type, props, children }) }
      const storage = { getItem() { return null }, setItem() {} }
      const plugin = await new Function('ctx', 'React', 'host', 'styles', 'console', 'document', 'MutationObserver', 'localStorage',
        'return (async () => { const TOOLBOX_RUNTIME_OVERRIDES = { bundleId: "flow", displayName: "流镜" };\n' + source + '\n})()')(
        ctx, React, { call: async () => ({ ok: false }) }, { insert() { return () => {} } }, console, document, MutationObserver, storage)
      plugin.apply(ctx)
      const entry = () => document.querySelector('[data-dsh-toolbox-entry="flow"]')
      const expectedParent = modern ? document.querySelector('nav') : document.querySelector('#sidebar-root')
      const correctPosition = () => entry()?.parentElement === expectedParent
        && (modern || entry()?.previousElementSibling?.className === 'newSession')
      if (!correctPosition()) throw new Error('Fallback entry is outside navigation or appended below Settings')
      entry().remove()
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (!correctPosition()) throw new Error('Entry did not recover after a host rerender')

      services.sidebarRightTabs = { register(definition) {
        definitions.push(definition)
        return () => { definitions.splice(definitions.indexOf(definition), 1) }
      } }
      services.sidebarRight = { openTab() {} }
      const nativeCleanups = []
      for (const { names, cb } of pending) {
        if (!names.every((name) => services[name])) continue
        const child = Object.create(ctx)
        child.effect = (fn) => { const dispose = fn(); if (typeof dispose === 'function') nativeCleanups.push(dispose); return dispose }
        cb(child)
      }
      if (entry()) throw new Error('Native guide left a duplicate sidebar entry')
      const definition = definitions[0]
      if (definitions.length !== 1 || definition.guide[0].id !== definition.kind || definition.guide[0].title() !== '流镜') {
        throw new Error('Native Start/More Tools entry is missing its stable identity')
      }
      for (const dispose of nativeCleanups.reverse()) dispose()
      if (!correctPosition()) throw new Error('Native unload did not restore the fallback entry')
      for (const dispose of cleanups.reverse()) dispose()
      await new Promise((resolve) => setTimeout(resolve, 0))
      return { entries: document.querySelectorAll('[data-dsh-toolbox-entry]').length, definitions: definitions.length }
    }, { source, modern })
    assert.deepEqual(result, { entries: 0, definitions: 0 })
    assert.deepEqual(errors, [])
    console.log(`PASS | ${modern ? 'wrapped desktop' : 'legacy'} sidebar: navigation placement, rerender recovery, native guide handoff/unload and cleanup`)
    await page.close()
  }
} finally {
  await browser.close()
}
