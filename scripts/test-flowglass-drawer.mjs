// Mount the assembled product Client through its registered shell slot using
// real React DOM and the actual Host handler. Session writes remain in-memory spies.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { assembleClientSource } from '../build/source-assembly.mjs'
import { createFixtureRenderer, documentFor, root } from '../smoke/fixtures/flowglass-ux.mjs'

const require = createRequire(import.meta.url)
let playwright, modulePath
for (const entry of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(root, '.scratch/dsh-rc2-composition/node_modules/playwright'), path.join(root, '.scratch/pw-test/node_modules/playwright')].filter(Boolean)) {
  try { modulePath = require.resolve(entry); playwright = require(modulePath); break } catch {}
}
if (!playwright) throw new Error('Set PLAYWRIGHT_MODULE_PATH to an installed playwright package.')
const dependencyRequire = createRequire(modulePath)
const dependencySource = (name, file) => fs.readFileSync(path.join(path.dirname(dependencyRequire.resolve(name + '/package.json')), file), 'utf8')
const client = assembleClientSource((file) => fs.readFileSync(path.join(root, file), 'utf8'), 'plugins/toolbox/client.js', { includeRuntime: true })
const renderer = await createFixtureRenderer()
const browser = await playwright.chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1120, height: 960 }, acceptDownloads: true })
const errors = [], calls = []
page.on('pageerror', (error) => errors.push(String(error)))
let checks = 0
const check = (label, result) => { assert.equal(result, true, label); checks++; console.log('PASS | ' + label) }
try {
  await page.route('http://flowglass.test/**', (route) => route.fulfill({ contentType: 'text/html', body: documentFor('', '', { width: 960 }) }))
  await page.exposeFunction('fixtureRpc', async (name, request = {}) => {
    calls.push({ name, action: request.action })
    if (name.endsWith('/tools')) return { ok: true, tools: [{ id: 'flow', label: '流镜', order: 2 }] }
    if (name.endsWith('/panel')) return renderer.dispatch(request)
    if (name.endsWith('/session-info')) return { ok: true, cwd: root, workspaceId: 'synthetic-workspace' }
    if (name.endsWith('/plugins')) return { ok: true, plugins: [], capabilities: { managePlugins: false, aiUsage: false, rebuildFromDisk: false } }
    throw new Error('Unexpected fixture RPC: ' + name)
  })
  await page.goto('http://flowglass.test/')
  await page.addScriptTag({ content: dependencySource('react', 'umd/react.development.js') })
  await page.addScriptTag({ content: dependencySource('react-dom', 'umd/react-dom.development.js') })
  await page.evaluate(({ client, rows, root }) => {
    localStorage.clear()
    localStorage.setItem('fixtureflow.drawer', JSON.stringify({ active: 'flow' }))
    localStorage.setItem('fixtureflow.flow.preferences', JSON.stringify({ refreshMs: 0, followSubagent: false }))
    const cleanups = [], registrations = {}
    const snapshot = { current: 'normal', ids: Object.keys(rows), byId: rows }
    const workspace = { items: [{ workspaceId: 'synthetic-workspace', cwd: root, sessionIds: snapshot.ids }], archivedSessionIds: [] }
    window.fixtureWrites = { prompts: [], creates: [], forks: [], drafts: {}, navigation: [], blobs: [] }
    const sessions = {
      list: { getSnapshot: () => snapshot, subscribe: () => () => {} },
      using: async (sid, _options, operation) => operation({ binding: { session: { prompt: (...args) => { window.fixtureWrites.prompts.push({ sid, args }); return { ok: true } } } } }),
      create: async (...args) => { window.fixtureWrites.creates.push(args); return 'fixture-created' },
      fork: async (...args) => { window.fixtureWrites.forks.push(args); return 'fixture-forked' },
      open: (sid) => { window.fixtureWrites.navigation.push(sid) },
    }
    const slots = { inject: (_name, factory) => factory(), register: (entry, component) => { registrations[entry.name] = component; return () => { delete registrations[entry.name] } } }
    const ctx = {
      sessions,
      get(name) {
        if (name === 'slots') return slots
        if (name === 'workspaces') return { list: { getSnapshot: () => workspace, subscribe: () => () => {} } }
        if (name === 'uiWorkspace') return { openSession: (target) => { window.fixtureWrites.navigation.push(target) } }
        if (name === 'uiSession') return { adapter: { resolve: (sid) => ({ props: { inputActions: { setDraft: (draft) => { window.fixtureWrites.drafts[sid] = draft } } }, hooks: { input: { getSnapshot: () => ({ draft: window.fixtureWrites.drafts[sid] || '原有草稿' }) } } }) } }
      },
      effect: (fn) => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); return cleanup },
      on: () => () => {},
      interval: (fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id) },
      timeout: (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id) },
    }
    const styles = { insert: (css) => { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); return () => style.remove() } }
    const overrides = { mode: 'static-bundle', bundleId: 'flow', displayName: '流镜', rpcPrefix: 'fixtureflow', storagePrefix: 'fixtureflow', eventPrefix: 'fixtureflow', capabilities: { managePlugins: false, rebuildFromDisk: false, diskReload: false, aiUsage: false } }
    const plugin = new Function('React', 'host', 'styles', 'ctx', 'const TOOLBOX_RUNTIME_OVERRIDES = ' + JSON.stringify(overrides) + ';\n' + client)(React, { call: window.fixtureRpc }, styles, ctx)
    plugin.apply(ctx)
    if (!registrations['shell.overlay']) throw new Error('Product Client did not register its shell slot')
    const reactRoot = ReactDOM.createRoot(document.querySelector('#fixture'))
    window.mountDrawer = (visible = true, sessionId = 'normal') => { snapshot.current = sessionId; ReactDOM.flushSync(() => reactRoot.render(React.createElement(registrations['shell.overlay'], { embedded: true, visible, sessionId, cwd: root, useSessions: (selector) => selector(snapshot), useWorkspaces: (selector) => selector(workspace) }))) }
    window.refreshDrawer = () => window.dispatchEvent(new Event('fixtureflow-flow-settings-changed'))
    window.disposeDrawer = () => { ReactDOM.flushSync(() => reactRoot.unmount()); cleanups.reverse().forEach((cleanup) => cleanup()) }
    const createObjectURL = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => { window.fixtureWrites.blobs.push(blob); return createObjectURL(blob) }
    window.mountDrawer()
  }, { client, rows: renderer.sessionRows, root })
  await page.locator('[data-flow-stable] .fl-node-open').first().waitFor()
  check('complete assembled Client Drawer mounts actual Host output', await page.locator('[data-flow-stable]').count() === 1)
  check('initial Client hooks produce no runtime exceptions', errors.length === 0)
  check('default Flowglass text scale matches Harness ordinary text', await page.locator('[data-dsh-toolbox-scope="flow"]').last().evaluate((element) => getComputedStyle(element).getPropertyValue('--tb-fs').trim() === '0.85'))
  const node = page.locator('[data-flow-main-card="8"]')
  await node.hover()
  await node.locator('[data-flow-bookmark]').click()
  for (const width of [360, 480, 960]) {
    await page.locator('#fixture').evaluate((element, width) => { element.style.width = width + 'px' }, width)
    check(`workbench fits ${width}px panel`, await page.locator('[data-flow-workbench]').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1 && [...dialog.querySelectorAll('button,input,select,pre')].every((item) => { const r = item.getBoundingClientRect(), d = dialog.getBoundingClientRect(); return r.left >= d.left - 1 && r.right <= d.right + 1 })))
  }
  await page.getByLabel('备注（可选）').fill('synthetic bookmark note')
  await page.getByRole('button', { name: '保存标记', exact: true }).click()
  check('bookmark note is saved and listed', await page.locator('.fg-bookmark-item').filter({ hasText: 'synthetic bookmark note' }).count() === 1)
  const checkFocusLoop = async (selector, label) => {
    await page.locator(selector).evaluate((dialog) => {
      const items = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')].filter((item) => item.getClientRects().length && getComputedStyle(item).visibility !== 'hidden')
      window.focusFirst = items[0]; window.focusLast = items.at(-1); window.focusLast.focus()
    })
    await page.keyboard.press('Tab')
    check(label + ' Tab wraps to first control', await page.evaluate(() => document.activeElement === window.focusFirst))
    await page.keyboard.press('Shift+Tab')
    check(label + ' Shift+Tab wraps to last control', await page.evaluate(() => document.activeElement === window.focusLast))
  }
  await checkFocusLoop('[data-flow-workbench]', 'workbench')
  await page.getByRole('button', { name: '定位', exact: true }).click()
  await page.locator('[data-flow-inspector]').waitFor()
  check('bookmark jump reopens its selected node Inspector', (await page.locator('[data-flow-inspector]').textContent()).includes('检查完成'))
  await checkFocusLoop('[data-flow-inspector]', 'modal Inspector')
  await page.evaluate(() => { window.inspectorBefore = document.querySelector('[data-flow-inspector]'); window.refreshDrawer() })
  await page.waitForTimeout(200)
  check('full Client refresh keeps Inspector mounted', await page.evaluate(() => document.querySelector('[data-flow-inspector]') === window.inspectorBefore))
  await page.evaluate(() => window.mountDrawer(false))
  await page.evaluate(() => window.mountDrawer(true))
  await page.locator('[data-flow-inspector]').waitFor()
  check('hide and reopen preserve selected Inspector without hook-order failures', errors.length === 0)
  await page.locator('.fl-rail-back').click()
  await page.locator('[data-flow-inspector]').waitFor({ state: 'detached' })
  await page.locator('.fl-query-bar>summary').click()
  await page.getByLabel('查找节点', { exact: true }).fill('配置读取成功')
  await page.locator('[data-action="fsearch"]').click()
  await page.waitForFunction(() => document.querySelector('.fl-search-summary')?.textContent.includes('命中 1 项'))
  check('search uses actual Host matching through Client RPC', (await page.locator('.fl-search-summary').textContent()).includes('命中 1 项'))
  await page.locator('[data-action="fsearch-clear"]').click()
  await page.waitForFunction(() => document.querySelectorAll('.fl-node-open').length > 1)
  check('clear search restores ordinary flow', await page.getByLabel('查找节点', { exact: true }).inputValue() === '')
  await page.evaluate(() => window.mountDrawer(true, 'failed'))
  await page.locator('.fl-attention').waitFor()
  await page.locator('.fl-attention').click()
  await page.waitForFunction(() => document.querySelector('[data-field="flowStatus"]')?.value === 'failed')
  check('attention shortcut synchronizes status filter UI', await page.locator('[data-field="flowStatus"]').inputValue() === 'failed')
  await page.locator('[data-action="fsearch-clear"]').click()
  await page.locator('.fl-replay-bar>summary').click()
  await page.getByLabel('回放事件位置', { exact: true }).fill('1')
  await page.locator('[data-action="freplay"]:not([data-step])').click()
  await page.locator('[data-flow-replay-active="1"]').waitFor()
  await page.locator('[data-action="freplay"][data-step="1"]').click()
  await page.waitForFunction(() => document.querySelector('[data-field="flowReplaySeq"]')?.value === '2')
  check('replay next event updates controlled event position', await page.getByLabel('回放事件位置', { exact: true }).inputValue() === '2')
  await page.locator('[data-action="freplay-live"]').click()
  await page.locator('[data-flow-replay-active="1"]').waitFor({ state: 'detached' })
  await page.evaluate(() => window.mountDrawer(true, 'normal'))
  await page.locator('[data-flow-main-card="8"]').waitFor()
  const showMore = async () => { const menu = page.locator('.fl-toolbar-more'); if (await menu.getAttribute('open') === null) await menu.locator(':scope>summary').click() }
  await showMore()
  await page.locator('[data-flow-export]').first().click()
  const preview = page.locator('.fg-workbench-preview')
  const exported = JSON.parse(await preview.textContent())
  check('export preview excludes all text summaries by default', exported.includesSummaries === false && exported.nodes.every((item) => !Object.hasOwn(item, 'summary')))
  await page.getByRole('button', { name: '保存到本地', exact: true }).click()
  const blob = await page.evaluate(async () => window.fixtureWrites.blobs.at(-1).text())
  check('downloaded JSON equals reviewed export', blob === await preview.textContent())
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('[data-action="fzoom"]').click()
  await page.locator('[data-flow-conclusion]').first().waitFor()
  await page.waitForTimeout(200)
  const compactGeometry = await page.evaluate(() => { const list = document.querySelector('.fl-overview-list'), body = list.closest('.tb-pane-body'); return { top: body.firstElementChild.getBoundingClientRect().top - body.getBoundingClientRect().top, direction: getComputedStyle(body).flexDirection } })
  if (compactGeometry.top >= 16) console.error('Compact geometry:', compactGeometry)
  check('compact branch overview starts at top of content area', compactGeometry.top < 16)
  await page.locator('[data-flow-conclusion]').nth(0).check()
  await page.locator('[data-flow-conclusion]').nth(1).check()
  await page.locator('[data-flow-compare-preview]').first().click()
  await page.getByRole('dialog', { name: '分支结论预览' }).waitFor()
  const conclusionPreview = await page.locator('.fg-workbench-preview').textContent()
  check('selected conclusions preview includes both sources', conclusionPreview.includes('## 分支 1') && conclusionPreview.includes('## 分支 2') && conclusionPreview.includes('来源：'))
  await page.getByRole('button', { name: '确认带入草稿', exact: true }).click()
  await page.waitForFunction(() => Boolean(window.fixtureWrites.drafts.normal))
  check('confirmed preview appends to target draft without changing its source', await page.evaluate((text) => window.fixtureWrites.drafts.normal === '原有草稿\n\n' + text, conclusionPreview))
  check('bookmark, search, export and conclusion actions never send or create tasks', await page.evaluate(() => !window.fixtureWrites.prompts.length && !window.fixtureWrites.creates.length && !window.fixtureWrites.forks.length))
  await page.evaluate(() => window.disposeDrawer())
  check('full Client lifecycle completes without browser exceptions', errors.length === 0)
} catch (error) {
  console.error('Browser errors:', errors)
  console.error('Recent RPCs:', calls.slice(-12))
  throw error
} finally { await browser.close() }
console.log(`${checks} full Client Drawer checks passed; synthetic Host/services only.`)
