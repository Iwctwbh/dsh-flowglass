// 原生静态 Bundle 仿真：构建 Flow-only 包，执行生成 Host（mock Cordis/Remote），
// 断言 feature 直接注册、Remote tools/panel 可用，且产物不含任何动态 runner/payload。
const path = require('path')
const { pathToFileURL } = require('url')
const ROOT = path.resolve(__dirname, '..')

let failures = 0
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''))
  if (!cond) failures++
}

;(async () => {
  const { buildBundle } = await import('../build/build-bundle.mjs')
  const { makeSourceLoader } = await import('../build/source-loader.mjs')
  const loader = makeSourceLoader(pathToFileURL(ROOT + path.sep))
  const built = buildBundle(loader, { features: ['flow'], version: '0.1.0' })
  check('Flow 原生静态构建成功', built.ok, built.errors && built.errors.join('；'))
  if (!built.ok) process.exit(2)
  const files = built.files
  check('产物为 Host/Client/Remote 三入口', files.has('lib/index.js') && files.has('lib/client.js') && files.has('lib/remote.js'))
  check('不生成 payloads/runtime-profile', !files.has('lib/payloads.js') && !files.has('lib/runtime-profile.js'))
  const combined = ['lib/index.js', 'lib/client.js', 'lib/remote.js'].map((file) => files.get(file)).join('\n')
  check('零 dynamicCordisRunner/runner.define/dyn 路径', !/dynamicCordisRunner|runner\.define|runner\.run|dyn\//.test(combined))
  const pkg = JSON.parse(files.get('package.json'))
  const flowPatch = files.get('cordis.patch.yml')
  check('Flowglass patch 保持单一 Loader 行，不受工具箱组件拆分影响',
    (flowPatch.match(/^\s+- id:/gm) || []).length === 1 && !flowPatch.includes('/feature/'))
  check('默认 Flow 构建产出 dsh-flowglass', pkg.name === 'dsh-flowglass', pkg.name)
  check('package 声明原生 dsh.client', pkg.dsh.client.platform === 'web' && pkg.exports['./client'] === './lib/client.js')
  check('inject 指向 ui-session/session-controller/sidebar-right 且不含已删除的 client-runtime',
    pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-session')
      && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes')
      && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-api-session-controller')
      && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-workspace')
      && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right')
      && !pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
  check('Host Typert 协议声明为 peer（0.1.5-rc.1+ 基线）',
    pkg.peerDependencies['@deepseek-ai/dsh-typert-protocol'] === '^0.1.5-rc.1 || ^0.1.6-alpha.2 || ^0.1.7-alpha.2')
  check('Flow 包声明 optional better-sidebar peer（>=0.19）',
    pkg.peerDependencies['dsh-better-sidebar'] === '>=0.19.0'
      && pkg.peerDependenciesMeta['dsh-better-sidebar'].optional === true)
  check('Flow 包声明官方 Markdown renderer 与 portal peer',
    pkg.peerDependencies['@deepseek-ai/dsh-client-ui-primitives'] === '^0.1.5-rc.1 || ^0.1.6-alpha.2 || ^0.1.7-alpha.2'
      && pkg.peerDependencies['react-dom'] === '^18.3.1')
  const client = files.get('lib/client.js')
  const host = files.get('lib/index.js')
  check('Flowglass profile/Host 不生成拆分组件 Bridge',
    !JSON.parse(files.get('BUILDINFO.json')).profile.bridgeService
      && !host.includes('ctx.provide(TOOLBOX_RUNTIME.bridgeService'))
  check('Flow Client 显式注入 sessions，并仅通过注入属性读取',
    client.includes("const inject = ['slots', 'remote', 'timer', 'sessions']")
      && client.includes('const sessionsClient = ctx.sessions')
      && !client.includes("ctx.get('sessions') || ctx.sessions"))
  check('Remote strict codec 同时支持旧 schema 与 alpha.2 create() 工厂',
    client.includes('schema: json, create: () => json')
      && files.get('lib/remote.js').includes('schema: json, create: () => json'))
  check('Flow 配置页使用官方插件详情 Slot 与 UI primitives', client.includes("plugins.bundle.config")
    && client.includes("key: 'dsh-flowglass'") && client.includes('TOOLBOX_UI_PRIMITIVES')
    && client.includes('Button: TOOLBOX_BUTTON') && client.includes('Switch: TOOLBOX_SWITCH') && client.includes('Input: TOOLBOX_INPUT'))
  check('Flow Client 含 Sidebar Tab 与嵌入布局适配',
    client.includes("FLOW_TAB_ID = 'dsh-flowglass:flow'")
      && client.includes("ctx.inject(['betterSidebar']")
      && client.includes('jr-drawer-embedded')
      && !client.includes('if (embedded) return drawerEl')
      && client.includes('props.visible !== false'))
  check('Flow Client 注册 Harness 原生右侧栏（两段式 + 层级切换）',
    client.includes("ctx.inject(['sidebarRightTabs', 'sidebarRight']")
      && client.includes("FLOW_NATIVE_ID = 'dsh-flowglass/native'")
      && client.includes("sidebar.right.pane.tab")
      && client.includes('FlowglassNativeTabBody')
      && client.includes('openTab(nativeKind)')
      && client.includes('syncBsRegistration'))
  check('Flow Client 订阅原生事件窗（实时叠加层 + settle 连续性）',
    client.includes('sessionsClient.binding')
      && client.includes('assistant/live-chunk')
      && client.includes('liveSettledRef')
      && client.includes("loadPanelRef.current('flow', '__refresh', null, { silent: true })"))
  check('Flow Client 加载官方 MarkdownText，并兼容 alpha.2/rc.2 Markdown labels',
    client.includes("require('@deepseek-ai/dsh-client-ui-primitives')")
      && client.includes("require('react-dom')")
      && client.includes('data-flow-markdown-enhanced')
      && client.includes('flowCreatePortal(React.createElement')
      && client.includes('labels: FLOW_MARKDOWN_LABELS')
      && client.includes('codeLabels: FLOW_MARKDOWN_LABELS.code'))
  check('动态批准明确为 false', JSON.parse(files.get('BUILDINFO.json')).dynamicApprovalRequired === false)
  check('Flow 跟随指令穿过静态 Host 注册表并优先走 alpha.2 uiWorkspace', host.includes('out.navigateSession')
    && client.includes('uiWorkspace.openSession(navigationTarget)') && client.includes('sessionsClient.openSubagent(navigationTarget)'))
  check('Flow Client 保留跟随返回链，且历史加载无顶部 loading 浮层', client.includes('flowFollowStateBySessionRef') && !client.includes('tb-flow-older-loading'))
  check('Flow Client 恢复工具面板「回到最新」浮标', client.includes('tb-jump-latest') && client.includes('showJumpLatest') && client.includes('↓ 回到最新'))
  check('Flow Client 含透明 Zoom+Zen/默认框选/真实分支/工作区会话树 popup', client.includes('tb-flow-zoom-float') && client.includes('jr-flow-zen')
    && client.includes('requestFullscreen') && client.includes('fullscreenchange')
    && client.includes('tb-flow-selection-bar') && client.includes('tb-flow-bring-popup') && client.includes('tb-flow-session-tree') && client.includes('fl-marquee')
    && client.includes('sessionsClient.fork') && client.includes('sessionsClient.create') && client.includes('inputActions'))
  check('跨会话草稿写入走 alpha.2 retain/bindingSource，并保留 0.1.5 resolve 兼容', client.includes("ctx.get('uiSession')")
    && client.includes('sessionsClient.using') && client.includes('uiSession.adapter.bindingSource')
    && client.includes('uiSession.adapter.resolve') && client.includes('withSessionProvideInfo')
    && !client.includes("typeof sessionsClient.provideInfo === 'function'"))
  check('框选矩形转换为 Flow 根局部坐标', client.includes('.fl-marquee{position:absolute') && client.includes('originX: origin.left') && client.includes('left - drag.originX'))
  check('框选超过移动阈值才起框，保留卡片单击', client.includes('box: null, moved: false') && client.includes('if (!drag.moved && (width > 3 || height > 3))'))
  check('工作区树默认收起并使用文件夹节点', client.includes('flowTreeOpen[group.cwd] ? group.sessions.map') && client.includes('tb-flow-tree-folder'))
  check('会话树兼容 Better Sidebar 的非数组 ids/byId-only 快照', client.includes('Array.from(rawFlowSessionIds)') && client.includes('Object.keys(rawFlowSessionsById)'))
  check('Better Sidebar 嵌入态从 sessionsClient.list 实时补齐完整会话树', client.includes('serviceSessionsSnapshot') && client.includes('list.subscribe(sync)'))
  check('Better Sidebar 会话回退只在 bundleId=flow 的 Flowglass 产品启用', client.includes("if (RT.bundleId !== 'flow') return undefined") && client.includes("RT.bundleId === 'flow' && serviceSessionsSnapshot"))

  const defaultBuilt = buildBundle(loader, { version: '0.1.0' })
  check('空功能选择默认构建 Flowglass', defaultBuilt.ok
    && JSON.parse(defaultBuilt.files.get('package.json')).name === 'dsh-flowglass'
    && JSON.parse(defaultBuilt.files.get('BUILDINFO.json')).bundleId === 'flow')

  // 去掉 ESM import/export 后，在 mock Cordis 环境真实执行生成 Host。
  let hostSource = files.get('lib/index.js')
    .replace(/^import .*$/gm, '')
    .replace('export const name =', 'const name =')
    .replace('export const inject =', 'const inject =')
    .replace('export async function apply(ctx)', 'async function apply(ctx)')
  hostSource += '\nreturn { name, inject, apply, makeStaticRegistry }'
  class MockRemoteService {
    constructor(ctx, service, options) { this.ctx = ctx; this.name = service; this.namespace = options && options.namespace; ctx.provide(service, this) }
  }
  const Remote = () => (_method, context) => { context.addInitializer(() => {}) }
  const services = {}
  const effects = []
  const intervals = []
  const session = { id: 's1', header: { id: 's1', cwd: 'D:/work/native' }, events: [] }
  const ctx = {
    get(name) {
      if (name === 'sessionQuery') return {
        async readSession() { return { session: session.header, events: [] } },
        async listSessions() { return [{ id: 's1', header: session.header }, { header: { id: 'cold-session', cwd: 'D:/work/cold' }, live: false, persisted: true }] },
      }
      if (name === 'sessions') return { get: (id) => id === 's1' ? session : undefined }
      return services[name]
    },
    provide(name, value) { services[name] = value },
    interval(fn) { intervals.push(fn); return () => {} }, timeout() { return () => {} },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose) },
    on() {},
  }
  const module = await new Function('TypertRemoteService', 'Remote', 'console', 'return (async () => {\n' + hostSource + '\n})()')(MockRemoteService, Remote, console)
  await module.apply(ctx)
  const transport = module.makeStaticRegistry()
  transport.register({ id: 'relay' }, () => ({ ok: true, html: '<div/>', zoomRelay: { text: 'relay test', sourceSessionId: 'source', ignored: true } }))
  const relayed = await transport.panel('', { tool: 'relay' })
  check('原生面板透传带入结论与来源但不透传额外字段', relayed.zoomRelay.text === 'relay test' && relayed.zoomRelay.sourceSessionId === 'source' && !('ignored' in relayed.zoomRelay))
  transport.register({ id: 'failed' }, () => ({ ok: false, html: '', error: 'no conclusion' }))
  const rejected = await transport.panel('', { tool: 'failed' })
  check('原生面板保留工具错误而不伪装成成功', rejected.ok === false && rejected.error === 'no conclusion')
  for (const fn of intervals.splice(0)) fn()
  const info = JSON.parse(files.get('BUILDINFO.json'))
  const remote = services[info.profile.remoteService]
  check('原生 Remote Service 已提供', remote && typeof remote.tools === 'function' && typeof remote.panel === 'function')
  const tools = remote.tools({ root: 'D:/work/native' })
  check('Flow 由静态 Host 直接注册', tools.ok && tools.tools.some((tool) => tool.id === 'flow'), JSON.stringify(tools))
  const panel = await remote.panel({ root: 'D:/work/native', session: 's1', tool: 'flow', action: '', fields: {}, state: null })
  check('原生 Remote panel 可渲染 Flow', panel && panel.ok === true && typeof panel.html === 'string' && panel.html.includes('data-flow'), JSON.stringify(panel).slice(0, 300))
  const sessionInfo = await remote.sessionInfo({ session: 's1' })
  check('原生 Remote sessionInfo 可解析 cwd', sessionInfo.ok && sessionInfo.cwd === 'D:/work/native')
  const coldInfo = await remote.sessionInfo({ session: 'cold-session' })
  check('未加载会话通过真实 SessionRecord.header.id 解析工作目录', coldInfo.ok && coldInfo.cwd === 'D:/work/cold')

  // selfview 共享同一份功能源码，但静态包必须改走原生 Remote 与 tools service。
  const selfviewBuilt = buildBundle(loader, { features: ['selfview'], version: '0.1.0' })
  const selfviewHost = selfviewBuilt.ok ? selfviewBuilt.files.get('lib/index.js') : ''
  const selfviewClient = selfviewBuilt.ok ? selfviewBuilt.files.get('lib/client.js') : ''
  const selfviewRemote = selfviewBuilt.ok ? selfviewBuilt.files.get('lib/remote.js') : ''
  const selfviewPkg = selfviewBuilt.ok ? JSON.parse(selfviewBuilt.files.get('package.json')) : {}
  check('selfview 可编译为原生静态功能', selfviewBuilt.ok, selfviewBuilt.errors && selfviewBuilt.errors.join('；'))
  check('selfview 静态桥接含三条 Remote',
    selfviewHost.includes('selfviewPull(request)')
      && selfviewClient.includes('["selfview/pull"]')
      && selfviewRemote.includes('descriptor("selfviewPush")'))
  check('selfview 模型工具改走原生 tools service',
    selfviewHost.includes("from '@deepseek-ai/dsh-tools'")
      && selfviewHost.includes("ctx.get('tools')")
      && selfviewPkg.peerDependencies['@deepseek-ai/dsh-tools'] === '^0.1.5-rc.1 || ^0.1.6-alpha.2 || ^0.1.7-alpha.2')

  const allToolboxFeatures = ['jira', 'git', 'files', 'flow', 'flowedit', 'trace', 'http', 'ports', 'calc', 'usage', 'prompt', 'context', 'aiassist', 'tools', 'search', 'lineage', 'aiusage', 'quota', 'selfview']
  const largeBuilt = buildBundle(loader, {
    features: allToolboxFeatures,
    version: '0.1.0',
  })
  const largeId = largeBuilt.ok ? JSON.parse(largeBuilt.files.get('BUILDINFO.json')).bundleId : ''
  check('大功能组合自动生成合法短 bundleId', largeBuilt.ok && /^bundle-\d+-[a-f0-9]{12}$/.test(largeId) && largeId.length <= 40, largeId || (largeBuilt.errors || []).join('；'))

  const toolboxBuilt = buildBundle(loader, {
    features: allToolboxFeatures,
    id: 'dynamic-toolbox',
    name: 'dsh-dynamic-toolbox',
    label: '工具箱',
    version: '0.7.2',
  })
  check('官方静态工具箱构建成功', toolboxBuilt.ok, toolboxBuilt.errors && toolboxBuilt.errors.join('；'))
  if (toolboxBuilt.ok) {
    const toolboxPatch = toolboxBuilt.files.get('cordis.patch.yml')
    const toolboxPkg = JSON.parse(toolboxBuilt.files.get('package.json'))
    const toolboxInfo = JSON.parse(toolboxBuilt.files.get('BUILDINFO.json'))
    check('静态工具箱为核心加每个 Host 功能生成真实组件行',
      (toolboxPatch.match(/^\s+- id:/gm) || []).length === 1 + allToolboxFeatures.length
        && toolboxInfo.componentRows.length === allToolboxFeatures.length)
    check('静态工具箱组件行使用独立导出，不重复实例化主入口',
      allToolboxFeatures.every((key) => toolboxPatch.includes("name: 'dsh-dynamic-toolbox/feature/" + key + "'")
        && toolboxPkg.exports['./feature/' + key] === './lib/features/' + key + '.js'
        && toolboxBuilt.files.has('lib/features/' + key + '.js')))
    check('工具箱核心不再内嵌 Host 功能，Flowglass 仍内嵌 flow',
      !toolboxBuilt.files.get('lib/index.js').includes('const create_jira') && host.includes('const create_flow'))
    const selfviewComponent = toolboxBuilt.files.get('lib/features/selfview.js')
     const toolboxClient = toolboxBuilt.files.get('lib/client.js').replace(/\r\n/g, '\n')
    check('selfview 组件通过核心 Bridge 注册 RPC，并独立注册模型工具',
      selfviewComponent.includes('TOOLBOX_RUNTIME.bridgeService')
        && selfviewComponent.includes("from '@deepseek-ai/dsh-tools'")
        && selfviewComponent.includes("harness.handle('selfview/pull'"))
    check('静态工具箱只注册 Harness 官方右侧栏入口，不注册独立抽屉',
      toolboxClient.includes("TOOLBOX_NATIVE_ID = 'dsh-dynamic-toolbox/native'")
        && toolboxClient.includes("TOOLBOX_NATIVE_KIND = 'dsh-dynamic-toolbox:toolbox'")
        && toolboxClient.includes('function ToolboxNativeTabBody')
        && toolboxClient.includes('if (!OFFICIAL_TOOLBOX_ONLY) {\n      slots.inject(\'shell.overlay\''))
    check('静态工具箱同步 Flowglass 的 Harness workspace/右侧栏依赖与 alpha.2 peer 范围',
      toolboxPkg.dsh.client.inject.includes('@deepseek-ai/dsh-api-workspace-controller')
        && toolboxPkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-workspace')
        && toolboxPkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right')
        && toolboxPkg.peerDependencies['@deepseek-ai/dsh-typert-protocol'].includes('^0.1.6-alpha.2')
        && toolboxPkg.peerDependencies['@deepseek-ai/dsh-tools'].includes('^0.1.6-alpha.2'))

    let toolboxCoreSource = toolboxBuilt.files.get('lib/index.js')
      .replace(/^import .*$/gm, '')
      .replace('export const name =', 'const name =')
      .replace('export const inject =', 'const inject =')
      .replace('export async function apply(ctx)', 'async function apply(ctx)')
    toolboxCoreSource += '\nreturn { name, inject, apply }'
    const toolboxCore = await new Function('TypertRemoteService', 'Remote', 'console', 'return (async () => {\n' + toolboxCoreSource + '\n})()')(MockRemoteService, Remote, console)
    await toolboxCore.apply(ctx)
    let calcSource = toolboxBuilt.files.get('lib/features/calc.js')
      .replace('export const name =', 'const name =')
      .replace('export const inject =', 'const inject =')
      .replace('export async function apply(ctx)', 'async function apply(ctx)')
    calcSource += '\nreturn { name, inject, apply }'
    const calcComponent = await new Function('console', 'return (async () => {\n' + calcSource + '\n})()')(console)
    await calcComponent.apply(ctx)
    for (const fn of intervals.splice(0)) fn()
    const toolboxRemoteService = services[toolboxInfo.profile.remoteService]
    const toolboxTools = toolboxRemoteService.tools({ root: 'D:/work/native' })
    check('拆分后的功能 Fiber 可向核心注册表真实挂载',
      toolboxTools.ok && toolboxTools.tools.some((tool) => tool.id === 'calc'), JSON.stringify(toolboxTools))
  }

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((error) => { console.error('仿真异常:', error); process.exit(2) })
