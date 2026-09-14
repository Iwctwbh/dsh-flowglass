// ===== scripts/web-smoke.mjs：DSH 0.1.5-rc.2 真实 Web profile 浏览器冒烟 =====
// 前置（一次性，见 README「开发与验证」）：
//   .scratch/dsh-rc2-composition/    npm install @deepseek-ai/dsh@0.1.5-rc.2 dsh-better-sidebar@0.19.1 playwright
//   .scratch/dsh-home-rc2/           dsh plugin --profile web add <dsh-flowglass.tgz> + dsh-better-sidebar@0.19.1
//                                     storages/workspace.json 种子工作区（见下 seedWorkspace）
//   node …/dsh/lib/bin.js --profile web --no-open --port 3987   （DSH_HOME=.scratch/dsh-home-rc2）
// 用法：node web-smoke.mjs <带 token 的 Web URL>   （playwright 需可解析；在 .scratch/dsh-rc2-composition 下运行）
// 断言：流镜入口挂载、Client 半加载、点击入口经 openTab 打开【原生右侧栏】流镜 Tab
// （宿主链路 rightbarCol→panel→pane→paneBody + 嵌入 Drawer 单实例）、面板渲染当前会话、
//  better-sidebar 桥被原生接管（无双实例）。独立抽屉/事件窗实时流的协议级行为由
//  sim-flow / sim-toolbox-client 覆盖。
import { chromium } from 'playwright'

const url = process.argv[2] || process.env.DSH_WEB_URL
if (!url) { console.error('用法: node web-smoke.mjs <带 token 的 Web URL>'); process.exit(2) }

let failures = 0
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''))
  if (!cond) failures++
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1720, height: 940 } })
const consoleErrors = []
page.on('pageerror', (err) => consoleErrors.push(String(err).slice(0, 200)))

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(5000)

// 首跑弹窗（内测声明/API Key）按需关闭；工作区由 storages/workspace.json 种子预置
for (const label of ['继续', '稍后配置']) {
  const btn = await page.$(`button:has-text("${label}")`)
  if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(1200) }
}

const entry = await page.waitForSelector('[data-dsh-toolbox-entry]', { timeout: 30000 }).catch(() => null)
check('流镜入口已挂载（导航区 DOM 注入路径）', Boolean(entry))
check('无页面级致命错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' ; '))

if (entry) {
  const visible = await entry.isVisible()
  check('原生接管时入口保留可见（点击 openTab，不隐藏）', visible)
  await entry.click({ force: true }).catch(() => {})
  await page.waitForTimeout(4000)
}

const diag = await page.evaluate(() => {
  const scope = document.querySelector('[data-dsh-toolbox-scope="flow"]')
  const chain = []
  if (scope) {
    let n = scope
    for (let i = 0; i < 14 && n && n !== document.body; i++) {
      n = n.parentElement
      if (!n) break
      chain.push(String(n.className))
    }
  }
  return {
    scopeCount: document.querySelectorAll('[data-dsh-toolbox-scope="flow"]').length,
    embeddedDrawer: Boolean(document.querySelector('.jr-drawer-embedded')),
    drawerFixed: Boolean(document.querySelector('.jr-drawer:not(.jr-drawer-embedded)')),
    inRightbarCol: chain.some((c) => /rightbarCol/.test(c)),
    hasBetterSidebarChrome: Boolean(document.querySelector('[class*="betterSidebar"], [data-better-sidebar]')),
    sessionLabel: (() => { const m = /([0-9a-f]{8}) · (\d+) 条事件/.exec(document.body.innerText || ''); return m ? m[1] : null })(),
    flowPanelAlive: (document.body.innerText || '').indexOf('实时同步中') >= 0,
  }
}).catch(() => null)
check('点击入口 → 流镜 Tab body 挂载（scope=flow 嵌入 Drawer）', Boolean(diag && diag.scopeCount === 1), JSON.stringify(diag).slice(0, 160))
check('宿主是 Harness 原生右侧栏（rightbarCol 链路，非 better-sidebar 容器）',
  Boolean(diag && diag.inRightbarCol && !diag.hasBetterSidebarChrome))
check('嵌入 Drawer 单实例（原生接管，better-sidebar 桥已撤销）', Boolean(diag && diag.scopeCount === 1 && diag.embeddedDrawer && !diag.drawerFixed))
check('流镜面板在当前会话内渲染（会话标注 + 实时同步开关）', Boolean(diag && diag.flowPanelAlive && diag.sessionLabel), diag ? diag.sessionLabel : '')

await page.screenshot({ path: 'web-smoke.png' }).catch(() => {})
await browser.close()
console.log(failures ? ('>>> ' + failures + ' 项失败') : '>>> web-smoke 全部通过')
process.exit(failures ? 1 : 0)
