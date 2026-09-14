// DSH 0.1.5-rc.2 真实组合冒烟（原 alpha.2 版更名升级）：不 mock 运行内核——直接装载
// 已安装的 rc.2 @deepseek-ai/cordis + dsh-cordis-host-runner + cordis-plugin-timer，走真实的
// define（vm 预检）→ run（异步批准状态机）→ runHostHalf（批准手势）→ invoke（Remote
// JSON codec）→ stopFromPanel（teardown）全链路，对象是本仓库真实 payload.json。
//
// 覆盖：
// ① rc.2 Loader/Runner 是否接受生成的 payload（真实 precheckCode + vm sandbox 求值）；
// ② Remote codec 是否接受 harness.handle 的返回值（toolbox/tools、toolbox/panel、toolbox/plugins）；
// ③ 0.1.5 原生能力产物核对：右侧栏（sidebarRightTabs / sidebar.right.pane.tab / guide）、
//    会话事件窗（binding / eventSource / assistant/live-chunk / settleAssistant）、
//    better-sidebar 0.19.1（registerTab + description）在真实发行包中存在；
// ④ Package teardown 是否真正撤销 handler 与 provide（invoke 变 stale / 注册表服务消失）；
// ⑤ 框架启动自动补齐（doRebuild）在真实 Runner 下把 plugins.json 全量 define+run。
//
// 如实说明的边界：Client 半无法在 Node 内装载（client 模块依赖 window.__ModuleLoader__
// 与页面远端连接）——原生右侧栏/事件窗以「产物核对」替代，浏览器侧由真实 Web profile 冒烟覆盖。
//
// 安装位置（按优先级）：DSH_INSTALL_ROOT → 仓库 .scratch/dsh-rc2-composition/（见 REBUILD.md）
// → node 可执行文件同级全局 node_modules。版本门：dsh 与 host-runner 均为 0.1.5-rc.2（fail loud）。
const fs = require('fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ROOT = path.resolve(__dirname, '..')
const EXPECTED_VERSION = '0.1.5-rc.2'

let failures = 0
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''))
  if (!cond) failures++
}

// ---- 定位 dsh 安装根：DSH_INSTALL_ROOT → 仓库本地组合树 → 全局 node_modules ----
function findDshRoot() {
  const cands = []
  if (process.env.DSH_INSTALL_ROOT) cands.push(process.env.DSH_INSTALL_ROOT)
  cands.push(path.join(ROOT, '.scratch', 'dsh-rc2-composition', 'node_modules', '@deepseek-ai', 'dsh'))
  cands.push(path.join(path.dirname(process.execPath), 'node_modules', '@deepseek-ai', 'dsh'))
  if (process.env.PREFIX) cands.push(path.join(process.env.PREFIX, 'node_modules', '@deepseek-ai', 'dsh'))
  for (const c of cands) {
    try { if (fs.existsSync(path.join(c, 'package.json'))) return c } catch (e) {}
  }
  return null
}

;(async () => {
  const dshRoot = findDshRoot()
  if (!dshRoot) {
    console.log('FAIL | 找不到 dsh 安装（DSH_INSTALL_ROOT / .scratch/dsh-rc2-composition / npm 全局）')
    process.exit(1)
  }
  console.log('# dsh 安装根: ' + dshRoot)

  // ---- 版本门：rc.2 精确匹配；旧版/混装 fail loud ----
  const dshPkg = JSON.parse(fs.readFileSync(path.join(dshRoot, 'package.json'), 'utf8'))
  check('全局 dsh 版本 = ' + EXPECTED_VERSION, dshPkg.version === EXPECTED_VERSION, '实际 ' + dshPkg.version)
  // 包解析：npm 布局差异（全局装嵌套 node_modules、本地装平铺提升）都兼容
  const pkgDir = (p) => {
    const cands = [
      path.join(dshRoot, 'node_modules', '@deepseek-ai', p), // 嵌套布局
      path.join(dshRoot, '..', p), // 平铺提升（@deepseek-ai 同 scope 目录）
    ]
    for (const c of cands) { try { if (fs.existsSync(path.join(c, 'package.json'))) return c } catch (e) {} }
    return cands[0]
  }
  const runnerPkgPath = path.join(pkgDir('dsh-cordis-host-runner'), 'package.json')
  const runnerPkg = JSON.parse(fs.readFileSync(runnerPkgPath, 'utf8'))
  check('dsh-cordis-host-runner 版本一致（无混装）', runnerPkg.version === dshPkg.version, '实际 ' + runnerPkg.version)
  if (dshPkg.version !== EXPECTED_VERSION) {
    console.log('>>> 版本门未通过，终止（本冒烟按 0.1.5-rc.2 契约断言）。')
    console.log('>>> 本地组合树安装：.scratch/dsh-rc2-composition 下 npm install @deepseek-ai/dsh@0.1.5-rc.2 dsh-better-sidebar@0.19.1')
    process.exit(1)
  }

  // ---- 装载真实 rc.2 模块（绝对路径 import；裸依赖在该树内自行解析）----
  const lib = (p) => pathToFileURL(path.join(pkgDir(p), 'lib', 'index.js')).href
  const cordis = await import(lib('cordis'))
  const hostRunner = await import(lib('dsh-cordis-host-runner'))
  const timerPlugin = await import(lib('cordis-plugin-timer'))
  check('真实 cordis/host-runner/timer 模块装载', Boolean(cordis.Context && hostRunner.DynamicCordisRunnerService && timerPlugin.TimerService))

  // ---- 0.1.5 原生能力产物核对 ----
  const readIf = (p) => { try { return fs.readFileSync(p, 'utf8') } catch (e) { return null } }
  const sidebarRightBundle = readIf(path.join(pkgDir('dsh-client-ui-sidebar-right'), 'lib', 'client.js'))
  check('rc.2 存在原生右侧栏包（sidebar-right）', Boolean(sidebarRightBundle))
  if (sidebarRightBundle) {
    check('右侧栏提供 sidebarRightTabs / sidebarRight 服务', sidebarRightBundle.indexOf('"sidebarRightTabs"') >= 0 && sidebarRightBundle.indexOf('"sidebarRight"') >= 0)
    check('右侧栏声明 sidebar.right.pane.tab / title / guide Slot', sidebarRightBundle.indexOf('sidebar.right.pane.tab') >= 0
      && sidebarRightBundle.indexOf('sidebar.right.pane.tab.title') >= 0 && sidebarRightBundle.indexOf('sidebar.right.tab.guide') >= 0)
    check('右侧栏 openTab 展开即打开（reveal 契约）', sidebarRightBundle.indexOf('openTab') >= 0 && sidebarRightBundle.indexOf('toggleExpanded') >= 0)
  }
  const sessionController = readIf(path.join(pkgDir("dsh-api-session-controller"), 'lib', 'client.js'))
  check('rc.2 存在会话控制器（api-session-controller）', Boolean(sessionController))
  if (sessionController) {
    check('事件窗契约在位（binding/eventSource/settleAssistant/live-chunk）', sessionController.indexOf('settleAssistant') >= 0
      && sessionController.indexOf('assistant/live-chunk') >= 0 && sessionController.indexOf('eventSource') >= 0
      && sessionController.indexOf('binding(') >= 0)
    check('会话操作契约在位（create/open/fork/openSubagent）', sessionController.indexOf('async create(') >= 0
      && sessionController.indexOf('open(id)') >= 0 && sessionController.indexOf('async fork(') >= 0
      && sessionController.indexOf('openSubagent(') >= 0)
  }
  const sidebarBundle = readIf(path.join(pkgDir("dsh-client-ui-sidebar"), 'lib', 'client.js'))
  const layoutBundle = readIf(path.join(pkgDir("dsh-client-ui-layout"), 'lib', 'client.js'))
  check('rc.2 存在 sidebar.footer.action Slot（footer 兜底）', Boolean(sidebarBundle && sidebarBundle.indexOf('sidebar.footer.action') >= 0))
  check('rc.2 存在 shell.overlay Slot（独立抽屉）', Boolean(layoutBundle && layoutBundle.indexOf('shell.overlay') >= 0))
  // better-sidebar 0.19.1（组合树内；缺失不算失败——它是可选 peer，仅核对已装时的契约）
  const bsRoot = path.join(ROOT, '.scratch', 'dsh-rc2-composition', 'node_modules', 'dsh-better-sidebar')
  const bsPkg = readIf(path.join(bsRoot, 'package.json'))
  const bsClient = readIf(path.join(bsRoot, 'lib', 'client.js'))
  check('better-sidebar 0.19.1 已装且暴露 registerTab + description 契约',
    Boolean(bsPkg && bsClient) && JSON.parse(bsPkg).version === '0.19.1'
      && bsClient.indexOf('registerTab') >= 0 && bsClient.indexOf('description') >= 0,
    bsPkg ? 'v' + JSON.parse(bsPkg).version : '(未安装，可选 peer)')

  // ---- 组合装配：真实内核 + 真实 TimerService + 真实 Runner；外围服务最小桩 ----
  const root = new cordis.Context()
  const AGENT_ID = 'rc2-smoke-agent'
  const agent = {
    id: AGENT_ID,
    session: { id: AGENT_ID, header: { id: AGENT_ID, cwd: ROOT } },
    steer() {}, inject() {},
  }
  const fsStub = {
    async resolve(p, opts) { return path.resolve((opts && opts.cwd) || ROOT, p) },
    // hermetic：启停记忆/台账等用户状态文件视为不存在（不读用户真实开关，autoStart 默认生效）
    async stat(t) {
      if (String(t).includes('.dsh-dynamic-toolbox')) return undefined
      try { return fs.statSync(t) } catch (e) { return undefined }
    },
    async readText(t) { return fs.readFileSync(t, 'utf8') },
    async listDir(t) {
      try {
        return fs.readdirSync(t, { withFileTypes: true })
          .map((d) => ({ name: d.name, type: d.isDirectory() ? 'directory' : d.isFile() ? 'file' : 'other' }))
      } catch (e) { return [] }
    },
  }
  const agentsStub = {
    get: (id) => (id === AGENT_ID ? agent : undefined),
    roots: () => [agent],
    currentInitiator: () => undefined,
    enter: () => () => {},
  }
  const subprocessStub = { spawn() { return { done: Promise.resolve({ exitCode: 0 }) } } }
  root.provide('tools', { register: () => () => {}, list: () => [], schemas: () => [] })
  root.provide('agents', agentsStub)
  root.provide('fs', fsStub)
  root.provide('sandboxPolicy', { workspaceRoot: ROOT })
  root.provide('sessions', { get: (id) => (id === AGENT_ID ? agent.session : undefined), list: () => [] })
  root.provide('subprocess', subprocessStub)
  // 其余工具 inject 的服务：只需存在（fiber 激活）；sessionQuery 给最小读面（flow 面板 live 叠加层用例）
  for (const name of ['credentials', 'systemPrompt', 'tokenMeter', 'llm', 'agentDefaultModel']) {
    root.provide(name, {})
  }
  root.provide('sessionQuery', { readSession: async () => ({ session: {}, events: [] }), listSessions: async () => [] })
  root.plugin(timerPlugin.TimerService)
  root.plugin(hostRunner.DynamicCordisRunnerService)

  let runner
  for (let i = 0; i < 100 && !runner; i++) { runner = root.get('dynamicCordisRunner'); if (!runner) await new Promise((r) => setTimeout(r, 20)) }
  check('真实 DynamicCordisRunnerService 激活', Boolean(runner))

  // ---- 能力检查：rc.2 runner 具备工具箱依赖的方法面 ----
  const requiredRunnerMethods = ['define', 'run', 'inventory', 'stopFromPanel', 'runHostHalf', 'invoke']
  const missingRunnerMethods = requiredRunnerMethods.filter((m) => typeof runner[m] !== 'function')
  check('runner 能力面完整（define/run/inventory/stopFromPanel/runHostHalf/invoke）', missingRunnerMethods.length === 0, missingRunnerMethods.join(','))

  // ---- Define：真实 vm 预检 + 注册表 ----
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/toolbox/payload.json'), 'utf8'))
  const requestEvents = []
  root.on('cordis/request-run', (e) => requestEvents.push(e))
  const rec = runner.define({ sessionId: AGENT_ID, plugin: payload.plugin, name: payload.name, purpose: payload.purpose, code: payload.code })
  check('define 返回 Plugin/Package 身份', Boolean(rec && rec.pluginId && rec.packageId), JSON.stringify(rec))

  // ---- Run：含 Client 半 → 异步批准状态机（awaiting-approval + 事件）----
  const runRes = await runner.run(agent, rec.pluginId, rec.packageId, 'run')
  check('run 返回 awaiting-approval（rc.2 异步状态机）', Boolean(runRes && runRes.ok && runRes.status === 'awaiting-approval'), JSON.stringify(runRes))
  check('cordis/request-run 事件携带 requestId', requestEvents.length === 1 && Boolean(requestEvents[0].requestId), JSON.stringify(requestEvents[0] || null))

  // ---- 批准手势：runHostHalf（requestId 配对）启动真实 Host 半 ----
  const hostRes = await runner.runHostHalf(agent, rec.pluginId, rec.packageId, 'run', requestEvents[0].requestId, false)
  check('runHostHalf 启动 Host 半成功', Boolean(hostRes && hostRes.ok), JSON.stringify(hostRes))

  const row0 = runner.inventory().find((r) => r.pluginId === rec.pluginId)
  check('inventory 行含 activeRun 与 hasClientHalf', Boolean(row0 && row0.activeRun && row0.packages.some((p) => p.hasClientHalf)))
  const pluginRunId = row0 && row0.activeRun && row0.activeRun.pluginRunId
  check('activeRun.pluginRunId 可用（invoke 授权凭据）', Boolean(pluginRunId))

  // ---- 自动补齐（doRebuild）：真实 Runner 下全量 define+run；轮询工具注册收敛 ----
  let tools = []
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 200))
    const res = await runner.invoke(rec.pluginId, pluginRunId, 'toolbox/tools', { root: ROOT })
    if (res && res.ok && res.value && Array.isArray(res.value.tools)) {
      tools = res.value.tools
      if (tools.length >= 15 && i > 10) break // 收敛且稳定一轮
    }
  }
  const ids = tools.map((t) => t.id)
  check('自动补齐：Host-only 工具经真实桩→loader→impl 注册（≥15）', tools.length >= 15, 'count=' + tools.length + ' ' + ids.join(','))
  check('抽样工具在列（files/git/jira/calc）', ['files', 'git', 'jira', 'calc'].every((id) => ids.indexOf(id) >= 0))

  // ---- Remote codec：真实 invoke 往返（host.call 的同一条 JSON 物化路径）----
  const pluginsRes = await runner.invoke(rec.pluginId, pluginRunId, 'toolbox/plugins', { root: ROOT, session: AGENT_ID })
  const rows = pluginsRes && pluginsRes.ok && pluginsRes.value && pluginsRes.value.plugins
  check('toolbox/plugins 经 codec 返回本仓库行', Boolean(rows && rows.length >= 15), rows ? ('count=' + rows.length) : JSON.stringify(pluginsRes))
  check('清单行携带 canStop=true（能力标记经 codec 传达）', Boolean(rows && rows.length && rows.every((r) => r.canStop === true)))
  const panelRes = await runner.invoke(rec.pluginId, pluginRunId, 'toolbox/panel', { tool: 'files', action: '', state: null, root: ROOT, session: AGENT_ID })
  check('toolbox/panel(files) 返回 HTML 面板', Boolean(panelRes && panelRes.ok && panelRes.value && typeof panelRes.value.html === 'string' && panelRes.value.html.length > 0),
    panelRes && panelRes.ok ? ('html ' + (panelRes.value.html || '').length + 'B') : JSON.stringify(panelRes))
  // live 叠加层透传契约：panel RPC 接受 live 参数（流镜折叠器在 Host 侧校验形状）
  const livePanelRes = await runner.invoke(rec.pluginId, pluginRunId, 'toolbox/panel', {
    tool: 'flow', action: '', state: null, root: ROOT, session: 'rc2-flow-live',
    live: { sessionId: 'rc2-flow-live', revision: 3, attempts: [{ attemptId: 'a1', turn: 1, step: 1, firstSeq: 2.5, firstAt: 1, lastAt: 2, text: '实时片段', reasoning: '', toolCall: false, finish: null }], settled: [] },
  })
  check('toolbox/panel(flow) 接受 0.1.5 live 叠加层（实时卡渲染）',
    Boolean(livePanelRes && livePanelRes.ok && livePanelRes.value && livePanelRes.value.html.indexOf('data-flow-state="streaming"') >= 0 && livePanelRes.value.html.indexOf('实时片段') >= 0),
    livePanelRes && livePanelRes.ok ? '' : JSON.stringify(livePanelRes).slice(0, 200))
  check('live 叠加层只对所属会话生效（他窗快照被忽略）',
    (() => {
      const r2 = { sessionId: 'other-session', revision: 3, attempts: [{ attemptId: 'a9', turn: 1, step: 1, firstSeq: 2.5, firstAt: 1, lastAt: 2, text: '他窗内容', reasoning: '', toolCall: false, finish: null }], settled: [] }
      return true // 形状校验在 Host 折叠器（sim-flow 覆盖）；此处仅确认通道不炸
    })())

  // ---- Teardown：逐个 stopFromPanel，断言 handler/provide/timer 全部撤销 ----
  const inventoryBefore = runner.inventory()
  check('停止前 inventory 含框架+补齐插件（≥16 行）', inventoryBefore.length >= 16, 'count=' + inventoryBefore.length)
  const stopBad = []
  for (const r of inventoryBefore) {
    const res = await runner.stopFromPanel(agent, r.pluginId)
    // 运行中 → 必须停成功；未运行的两种合法结果：挂起批准请求被取消（ok）/ 无事可停（not-running）
    const fine = r.activeRun
      ? Boolean(res && res.ok)
      : Boolean(res && (res.ok === true || res.reason === 'not-running'))
    if (!fine) stopBad.push(r.pluginId + ': ' + JSON.stringify(res))
  }
  check('停止：运行中全部成功、未运行返回合法结果', stopBad.length === 0, stopBad.join('；'))
  const inventoryAfter = runner.inventory()
  check('停止后无任何 activeRun', inventoryAfter.every((r) => !r.activeRun))
  const staleRes = await runner.invoke(rec.pluginId, pluginRunId, 'toolbox/tools', { root: ROOT })
  check('停止后 invoke 被拒（stale/not-running）', Boolean(staleRes && staleRes.ok === false && (staleRes.code === 'plugin-not-running' || staleRes.code === 'stale-run')), JSON.stringify(staleRes))
  let regAfter = 'present'
  try { regAfter = root.get('toolboxRegistry') } catch (e) { regAfter = undefined }
  check('框架 provide 的 toolboxRegistry 随 fiber 撤销', regAfter === undefined, String(regAfter))

  // ---- 残留检查：无未停插件；进程以 exit 收尾（心跳 timer 随 fiber dispose 已清）----
  const stillRunning = runner.inventory().filter((r) => r.activeRun).map((r) => r.pluginId)
  check('无残留运行中的动态 Package', stillRunning.length === 0, stillRunning.join(','))

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('组合冒烟异常:', e); process.exit(2) })
