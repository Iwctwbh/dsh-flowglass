// toolbox client.js 仿真（rc.7 改造 16.2 + 用户决策回导航区 + v6.6 Cordis 面板隐藏联动 + 0.1.5 原生右侧栏）：
// ①有 DOM 环境：导航区 DOM 注入（新会话下方、插件族块末尾），不注册 sidebar.footer.action；
//   body 级 MutationObserver watcher 自愈；teardown 断开 watcher 并移除条目；
// ②无 DOM 环境（headless）：退回官方 footer Slot 注册（sidebar.footer.action + shell.overlay）；
// ③Entry（Slot 兜底用）宽栏渲染「工具箱」、折叠 rail 渲染「箱」，点击切换开合；
// ④注入 CSS 同时含导航条目选择器（[data-dsh-toolbox-entry]）与抽屉/入口样式；
// ⑤「隐藏无界面」联动：Host-only 行打 data-tb-hide 隐藏（待审批行不隐藏）、计数 span 用
//   面板 DOM「可见且 running」行覆盖（不信任单仓库 toolbox/plugins 清单）；开关关闭后恢复；
// ⑥工具箱长名称在可见 chrome 统一使用「工具箱」，完整名称保留在 tooltip/aria-label；
// ⑦DSH 0.1.5 原生右侧栏（bundleId=flow）：sidebarRightTabs 两段式注册（page type + body Slot）、
//   自有入口 openTab、原生接管时撤销 better-sidebar 桥、注册失败恢复固定右侧兜底、旧 drawer 偏好忽略、
//   原生 Tab body 透传 Slot 标准属性（sessionId/useSessions/useTabInfo→visible）。
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let failures = 0
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''))
  if (!cond) failures++
}

// ---- mock React：createElement 返回纯节点；hooks 单组件顺序槽位版 ----
let hookCells = []
let hookIdx = 0
const React = {
  Fragment: 'Fragment',
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  useState(init) {
    const i = hookIdx++
    if (!(i in hookCells)) hookCells[i] = typeof init === 'function' ? init() : init
    return [hookCells[i], (v) => { hookCells[i] = typeof v === 'function' ? v(hookCells[i]) : v }]
  },
  useEffect(fn) { const dis = fn(); if (typeof dis === 'function') dis() },
}
const renderHooked = (component, props) => { hookIdx = 0; return component(props) }

const makeSlots = () => ({
  injected: {},
  registrations: [],
  inject(name, factory) { this.injected[name] = factory },
  register(entry, component) { this.registrations.push({ entry, component }); return () => {} },
  activateAll() { for (const name of Object.keys(this.injected)) this.injected[name]() },
})

const makeCtx = () => {
  const teardowns = []
  const injectCalls = []
  const ctx = {
    teardowns,
    injectCalls,
    slotsFor: null,
    services: {},
    get(name) { if (name === 'slots') return this.slotsFor; if (Object.prototype.hasOwnProperty.call(this.services, name)) return this.services[name]; return undefined },
    effect(fn) { const dis = fn(); if (typeof dis === 'function') teardowns.push(dis); return () => {} },
    inject(names, cb) { injectCalls.push({ names, cb, done: false }) },
    timeout(fn) { return () => {} },
    // 模拟 cordis inject fiber：依赖可满足时执行回调（每条至多一次），服务后到时再次调用补跑
    runInject() {
      for (const rec of injectCalls) {
        if (rec.done) continue
        if (!rec.names.every((n) => ctx.get(n) !== undefined)) continue
        rec.done = true
        const child = Object.create(ctx)
        child.get = (name) => (name === 'slots' ? ctx.slotsFor : (Object.prototype.hasOwnProperty.call(ctx.services, name) ? ctx.services[name] : undefined))
        child.effect = (fn) => { const dis = fn(); if (typeof dis === 'function') teardowns.push(dis); return () => {} }
        rec.cb(child)
      }
    },
  }
  return ctx
}

// ---- 最小假 DOM：支持 client.js 用到的属性读写 + 后代查询（querySelector/querySelectorAll）。
// 选择器匹配只实现实际用到的简单形态（tag、[attr]、tag[attr]、[attr="v"]、逗号列表）；
// *= / 后代组合等不支持的语法按「不匹配」处理，绝不抛错。侧边栏 root 不可发现（tryPlace no-op）。
const selMatch = (el, sel) => {
  sel = String(sel || '').trim()
  if (!sel) return false
  if (sel.indexOf(',') >= 0) return sel.split(',').some((s) => selMatch(el, s))
  if (/[*^$~|]=/.test(sel) || /\s/.test(sel)) return false
  const attrs = []
  let rest = sel
  const re = /\[([a-zA-Z-]+)(?:="([^"]*)")?\]/g
  let m
  while ((m = re.exec(sel))) {
    attrs.push([m[1], m[2]])
    rest = rest.split(m[0]).join('')
  }
  const tag = rest.trim()
  if (tag && el.tagName !== tag.toUpperCase()) return false
  for (const [k, v] of attrs) {
    if (!el.hasAttribute(k)) return false
    if (v != null && el.attrs[k] !== v) return false
  }
  return Boolean(tag) || attrs.length > 0
}
const collect = (root, sel, out) => {
  for (const c of root.children || []) {
    if (selMatch(c, sel)) out.push(c)
    collect(c, sel, out)
  }
  return out
}
const makeFakeDom = () => {
  const observers = []
  class MutationObserver {
    constructor(cb) { this.cb = cb; observers.push(this); this.observing = false }
    observe() { this.observing = true }
    disconnect() { this.observing = false }
  }
  const makeEl = (tag) => ({
    tagName: (tag || 'div').toUpperCase(),
    attrs: {}, children: [], listeners: {}, textContent: '',
    setAttribute(k, v) { this.attrs[k] = String(v) },
    removeAttribute(k) { delete this.attrs[k] },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
    getAttribute(k) { return this.hasAttribute(k) ? this.attrs[k] : null },
    addEventListener(t, fn) { this.listeners[t] = fn },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c },
    remove() { this.removed = true },
    querySelector(sel) { return collect(this, sel, [])[0] || null },
    querySelectorAll(sel) { return collect(this, sel, []) },
    matches(sel) { return selMatch(this, sel) },
    contains() { return false },
    parentElement: null,
    isConnected: false,
    innerHTML: '',
    type: '',
  })
  const body = makeEl('body')
  return {
    observers,
    MutationObserver,
    body,
    document: {
      body,
      createElement: (t) => makeEl(t),
      querySelector: (sel) => collect(body, sel, [])[0] || null,
      querySelectorAll: (sel) => collect(body, sel, []),
    },
  }
}

const makeLocalStorage = (init) => {
  const store = new Map(Object.entries(init || {}))
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  }
}

const evalClient = (src, extra) => {
  const fn = new Function('ctx', 'React', 'host', 'styles', 'console', 'document', 'MutationObserver', 'localStorage',
    'return (async () => {\n' + src + '\n})()')
  return fn(extra.ctx, React, extra.host || { call: async () => ({ ok: false }) }, extra.styles, console,
    extra.document, extra.MutationObserver, extra.localStorage)
}

const tick = () => new Promise((r) => setTimeout(r, 15))

;(async () => {
  const src = read('shared/runtime.js') + '\n' + read('plugins/toolbox/client.js')

  // 静态断言：双路径都在（DOM 主 + Slot 兜底）
  check('源码含导航区 DOM 注入主路径', src.indexOf('function mountSidebarEntry()') >= 0 && src.indexOf('data-dsh-toolbox-entry') >= 0)
  check('源码含无 DOM 兜底 Slot 分支', src.indexOf("slots.inject('sidebar.footer.action'") >= 0 && src.indexOf("typeof MutationObserver !== 'undefined'") >= 0)

  // —— 路径 A：无 DOM → Slot 兜底 ——
  {
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const inserted = []
    const impl = await evalClient(src, { ctx, styles: { insert(css) { inserted.push(css); return () => {} } } })
    check('A: 返回插件对象', impl && typeof impl.apply === 'function')
    impl.apply(ctx)
    check('A: 无 DOM 时注册 sidebar.footer.action 与 shell.overlay',
      Boolean(slots.injected['sidebar.footer.action']) && Boolean(slots.injected['shell.overlay']),
      Object.keys(slots.injected).join(','))
    slots.activateAll()
    const sidebarReg = slots.registrations.find((r) => r.entry && r.entry.name === 'sidebar.footer.action')
    check('A: footer 条目契约（id/order/label）',
      sidebarReg && sidebarReg.entry.id === 'toolbox-entry' && sidebarReg.entry.order === -1000 && sidebarReg.entry.label === '工具箱',
      sidebarReg ? JSON.stringify(sidebarReg.entry) : '(未注册)')

    const entryEl = sidebarReg.component({ wide: true })
    let rendered = renderHooked(entryEl.type, { wide: true })
    check('A: 宽栏显示「工具箱」', rendered.children.indexOf('工具箱') >= 0, JSON.stringify(rendered.children))
    rendered = renderHooked(entryEl.type, { wide: false })
    check('A: 折叠 rail 显示「箱」', rendered.children.indexOf('箱') >= 0)
    rendered.props.onClick()
    rendered = renderHooked(entryEl.type, { wide: true })
    check('A: 点击后 active 态', String(rendered.props.className).indexOf('tb-entry-active') >= 0)
    for (const dis of ctx.teardowns) dis()
  }

  // —— 长 Bundle 名称：可见标题收敛，完整名称保留为 tooltip/aria-label ——
  {
    const longName = 'Jira + Git + 文件 + 流镜 + 工作流编辑 + 轨迹 + HTTP + 端口 + 计算 + 用量 + 提示词 + 上下文 + AI 助手 + 工具清单 + 搜索 + 血缘 + AI 台账 + 配额 + 界面自查 工具箱'
    const staticSrc = 'const TOOLBOX_RUNTIME_OVERRIDES = { bundleId: \'dynamic-toolbox\', displayName: ' + JSON.stringify(longName) + ' }\n' + src
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const impl = await evalClient(staticSrc, { ctx, styles: { insert() { return () => {} } } })
    impl.apply(ctx)
    slots.activateAll()
    const sidebarReg = slots.registrations.find((r) => r.entry && r.entry.name === 'sidebar.footer.action')
    const entryEl = sidebarReg.component({ wide: true })
    const rendered = renderHooked(entryEl.type, { wide: true })
    check('长 Bundle 名称：可见入口收敛为「工具箱」', rendered.children.indexOf('工具箱') >= 0)
    check('长 Bundle 名称：完整名称保留在 title', rendered.props.title === longName + '（工具集）')
    for (const dis of ctx.teardowns) dis()
  }

  // —— 路径 B：有 DOM → 导航区注入，不注册 sidebar.footer.action ——
  {
    const dom = makeFakeDom()
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const impl = await evalClient(src, { ctx, styles: { insert() { return () => {} } }, document: dom.document, MutationObserver: dom.MutationObserver })
    impl.apply(ctx)
    check('B: 有 DOM 时不注册 sidebar.footer.action（走 DOM 注入）', slots.injected['sidebar.footer.action'] === undefined, Object.keys(slots.injected).join(','))
    check('B: shell.overlay 仍注册', Boolean(slots.injected['shell.overlay']))
    check('B: panel-hide watcher 与 body 级自愈 watcher 启动（root 级待放置后启动）',
      dom.observers.length === 3 && dom.observers[0].observing === true && dom.observers[1].observing === true && dom.observers[2].observing === false,
      'observers=' + dom.observers.length)
    check('B: 页面互斥标记已置位', dom.document.body.hasAttribute('data-dsh-toolbox-mounted'))
    check('B: teardown 已登记（mutex + panel-hide + DOM entry）', ctx.teardowns.length >= 3, 'count=' + ctx.teardowns.length)
    for (const dis of ctx.teardowns) dis()
    check('B: 停止后 watcher 全断开', dom.observers.every((o) => !o.observing))
    check('B: 停止后互斥标记清除', !dom.document.body.hasAttribute('data-dsh-toolbox-mounted'))
  }

  // —— 路径 C：「隐藏无界面」联动官方 Cordis 面板 ——
  {
    const dom = makeFakeDom()
    // 官方面板 DOM：panel section + 4 行（Host-only running / 含界面 running / Host-only idle / Host-only 待审批）
    const makeRow = (id, status, extra) => {
      const li = dom.document.createElement('li')
      li.setAttribute('data-cordis-row', id)
      if (status) li.setAttribute('data-cordis-status', status)
      if (extra) for (const k of Object.keys(extra)) li.setAttribute(k, extra[k])
      return li
    }
    const panel = dom.document.createElement('section')
    panel.setAttribute('data-cordis-panel', '')
    const ul = dom.document.createElement('ul')
    const rowA = makeRow('plugin-a', 'running') // Host-only，running → 隐藏
    const rowB = makeRow('plugin-b', 'running') // 含 Client 半，running → 可见
    const rowC = makeRow('plugin-c', 'idle') // Host-only，停止 → 隐藏
    const rowD = makeRow('plugin-d', 'running', { 'data-cordis-awaiting': '' }) // 待审批 → 不隐藏
    for (const r of [rowA, rowB, rowC, rowD]) ul.appendChild(r)
    panel.appendChild(ul)
    dom.body.appendChild(panel)
    // 触发按钮 + 官方计数文本（官方口径 = 全进程动态插件，此处 3 running）
    const badge = dom.document.createElement('button')
    badge.setAttribute('data-cordis-badge', '4')
    const spLabel = dom.document.createElement('span'); spLabel.textContent = '插件'
    const spCount = dom.document.createElement('span'); spCount.textContent = '3 running'
    badge.appendChild(spLabel)
    badge.appendChild(spCount)
    dom.body.appendChild(badge)

    // toolbox/plugins 只回当前仓库清单（刻意与面板行同集，验证计数不走它）
    const plugins = [
      { pluginId: 'plugin-a', hasClientHalf: false, running: true },
      { pluginId: 'plugin-b', hasClientHalf: true, running: true },
      { pluginId: 'plugin-c', hasClientHalf: false, running: false },
      { pluginId: 'plugin-d', hasClientHalf: false, running: true },
    ]
    const host = { call: async (m) => (m === 'toolbox/plugins' ? { ok: true, plugins } : { ok: false }) }
    const localStorage = makeLocalStorage({})

    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const impl = await evalClient(src, {
      ctx, styles: { insert() { return () => {} } }, document: dom.document, MutationObserver: dom.MutationObserver,
      host, localStorage,
    })
    impl.apply(ctx)
    await tick() // 等 refreshPanelHide 的 host.call 落定

    check('C: Host-only 行被隐藏', rowA.hasAttribute('data-tb-hide') && rowC.hasAttribute('data-tb-hide'))
    check('C: 含界面行与待审批行不隐藏', !rowB.hasAttribute('data-tb-hide') && !rowD.hasAttribute('data-tb-hide'))
    check('C: running 计数按面板 DOM 可见行覆盖（2 而非单仓库含界面口径的 1）',
      spCount.getAttribute('data-tb-count') === '2 running', 'got=' + spCount.getAttribute('data-tb-count'))
    check('C: 非计数 span 不被覆盖', !spLabel.hasAttribute('data-tb-count'))
    for (const dis of ctx.teardowns) dis()

    // 恢复：开关关闭（localStorage '0'）→ 隐藏行恢复、计数覆盖移除（回官方全局口径）
    localStorage.setItem('tbx-hide-host-only', '0')
    const slots2 = makeSlots()
    const ctx2 = makeCtx(); ctx2.slotsFor = slots2
    const impl2 = await evalClient(src, {
      ctx: ctx2, styles: { insert() { return () => {} } }, document: dom.document, MutationObserver: dom.MutationObserver,
      host, localStorage,
    })
    impl2.apply(ctx2)
    await tick()
    check('C: 开关关闭后隐藏行恢复', !rowA.hasAttribute('data-tb-hide') && !rowC.hasAttribute('data-tb-hide'))
    check('C: 开关关闭后计数覆盖移除', !spCount.hasAttribute('data-tb-count'))
    for (const dis of ctx2.teardowns) dis()
  }

  // —— CSS：导航条目与抽屉样式齐备 ——
  {
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const inserted = []
    const impl = await evalClient(src, { ctx, styles: { insert(css) { inserted.push(css); return () => {} } } })
    impl.apply(ctx)
    const css = inserted.join('\n')
    check('CSS 含导航条目选择器', css.indexOf('[data-dsh-toolbox-entry]{') >= 0 && css.indexOf('.tb-nav-icon') >= 0)
    check('CSS 含折叠 rail 变体', css.indexOf('[data-dsh-frame][data-sidebar-collapsed] [data-dsh-toolbox-entry]') >= 0
      && css.indexOf('[data-sidebar-collapsed] [data-dsh-toolbox-entry]') >= 0
      && css.indexOf('[data-sidebar-collapsed] .tb-nav-label{display:none}') >= 0)
    check('CSS 含 .tb-entry 与 .jr-drawer', css.indexOf('.tb-entry{') >= 0 && css.indexOf('.jr-drawer{') >= 0)
    check('Flowglass 固定右侧兜底不再挤压 Harness 主会话列',
      src.indexOf("RT.bundleId === 'flow' || embedded || !isOpen || dockMode !== 'full'") >= 0
        && src.indexOf("if (RT.bundleId === 'flow') return 'right'") >= 0)
    check('长 Bundle 标题单行省略，避免抽屉头部撑高', css.indexOf('.jr-drawer-title{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;') >= 0)
    check('CSS/源码含工具面板「回到最新」浮标', css.indexOf('.tb-jump-latest{') >= 0
      && src.indexOf('showJumpLatest') >= 0 && src.indexOf('↓ 回到最新') >= 0)
    check('源码保留 80px 历史预加载，不再渲染顶部 loading 浮层', src.indexOf('> 80') >= 0
      && src.indexOf('tb-flow-older-loading') < 0 && src.indexOf('setFlowOlderLoading') < 0)
    check('CSS/源码含 Flowglass 透明 Zoom+Zen、默认框选、悬停分支和工作区会话树', css.indexOf('.tb-flow-zoom-float') >= 0
      && css.indexOf('.jr-drawer.jr-flow-zen') >= 0 && css.indexOf('.tb-flow-selection-bar') >= 0
      && css.indexOf('.tb-flow-bring-popup') >= 0 && css.indexOf('.tb-flow-session-tree') >= 0 && css.indexOf('.fl-marquee{') >= 0
      && src.indexOf('requestFullscreen') >= 0 && src.indexOf('flowSelectMode') < 0 && src.indexOf('branchFlowAt') >= 0 && src.indexOf('sendSelectedFlow') >= 0)
    check('框选矩形使用 Flow 根局部坐标，兼容 Better Sidebar/Zen 定位包含块', css.indexOf('.fl-marquee{position:absolute') >= 0
      && src.indexOf('originX: origin.left') >= 0 && src.indexOf("left - drag.originX") >= 0 && src.indexOf("top - drag.originY") >= 0)
    check('指针移动超过 3px 才创建选框/捕获，普通卡片 click 不被吞', src.indexOf('box: null, moved: false') >= 0
      && src.indexOf("if (!drag.moved && (width > 3 || height > 3))") >= 0 && src.indexOf('body.setPointerCapture(drag.pointerId)') >= 0)
    check('框选后空白处单击取消框选并收起详情侧栏，卡片/交互控件与忙碌态不受影响', (() => {
      const at = src.indexOf('空白处单击：取消框选')
      return at >= 0 && src.indexOf("(flowSelectedSeqs.length || flow.querySelector('.fl-rail'))") >= 0
        && src.indexOf("!t.closest('[data-flow-select-seq]')", at) >= 0
        && src.indexOf("!t.closest('button,a,input,select,textarea,label')", at) >= 0
        && src.indexOf('!e.button && !flowUiBusy && (flowSelectedSeqs.length') >= 0
        && src.indexOf('[active, html, flowSelectedSeqs, flowUiBusy]', at) >= 0
        && src.indexOf('setFlowSelectedSeqs([])', at) >= 0 && src.indexOf('setFlowBringPopup(false)', src.indexOf('setFlowSelectedSeqs([])', at)) >= 0
        && src.indexOf("const railX = flow.querySelector('.fl-rail-x')", at) >= 0
        && src.indexOf("loadPanelRef.current('flow', 'fdetail', railX)", at) >= 0
    })())
    check('框选图标栏复用 Zoom 透明度/按钮尺寸，工作区树默认收起并使用文件夹图标', css.indexOf('.tb-flow-zoom-float,.tb-flow-selection-bar{padding:3px 5px;opacity:.42') >= 0
      && css.indexOf('.tb-flow-icon-btn{position:relative;width:25px;height:24px') >= 0
      && src.indexOf('flowTreeOpen[group.cwd] ? group.sessions.map') >= 0 && src.indexOf("className: 'tb-flow-tree-folder'") >= 0)
    check('会话树兼容 Array/Set/byId-only 的 Better Sidebar 快照', src.indexOf('rawFlowSessionIds[Symbol.iterator]') >= 0
      && src.indexOf('Array.from(rawFlowSessionIds)') >= 0 && src.indexOf('Object.keys(rawFlowSessionsById)') >= 0)
    check('Better Sidebar 嵌入态直接订阅 sessionsClient.list 补齐完整会话树', src.indexOf('serviceSessionsSnapshot') >= 0
      && src.indexOf('list.subscribe(sync)') >= 0 && src.indexOf('serviceSessionsSnapshot.ids') >= 0)
    check('跨会话草稿写入单路径：uiSession 绑定（provideInfo 回退已按 0.1.5 基线删除）', src.indexOf("ctx.get('uiSession')") >= 0
      && src.indexOf('uiSession.adapter.resolve') >= 0
      && src.indexOf('resolveSessionProvideInfo') >= 0
      && src.indexOf("typeof sessionsClient.provideInfo === 'function'") < 0
      && src.indexOf('sessionsClient.provideInfo(sessionId)') < 0)
    check('Better Sidebar 会话回退严格限定 Flowglass，完整 Toolbox 不启用', src.indexOf("if (RT.bundleId !== 'flow') return undefined") >= 0
      && src.indexOf("RT.bundleId === 'flow' && serviceSessionsSnapshot") >= 0)
    check('Flowglass 显示规则以 localStorage 持久化、随 panel 请求携带且设置打开时暂停 live 刷新',
      src.indexOf("RT.storageKey('flow.presentation-rules')") >= 0
        && src.indexOf('fields.__flowPresentationRules') >= 0
        && src.indexOf("['fsave-rule', 'fcreate-rule', 'fapply-rule-json', 'ftoggle-rule', 'fdelete-rule', 'freset-rules']") >= 0
        && src.indexOf('writeFlowRules(JSON.stringify((res.state && res.state.presentationRules) || []))') >= 0
        && src.indexOf('st.settings === true') >= 0)
    check('规则展开/收起由 Client 原地切换，不触发 panel 刷新',
      src.indexOf("closest('[data-flow-rule-edit]')") >= 0
        && src.indexOf("closest('[data-flow-rule-new]')") >= 0
        && src.indexOf("closest('[data-flow-rule-cancel]')") >= 0
        && src.indexOf("targetCard.classList.add('fl-rule-open')") >= 0
        && src.indexOf("querySelectorAll('.fl-rule-card.fl-rule-open')") >= 0)
    check('Markdown 增强严格限定原生 Flow bundle，动态 Toolbox 保留原文 fallback',
      src.indexOf("RT.bundleId === 'flow'") >= 0
        && src.indexOf("typeof TOOLBOX_MARKDOWN_TEXT !== 'undefined'") >= 0
        && src.indexOf("typeof TOOLBOX_MARKDOWN_TEXT === 'object'") >= 0
        && css.indexOf('[data-flow-markdown-enhanced="1"] [data-flow-markdown-source]{display:none}') >= 0)
    check('Markdown 默认预览、可切回文本，并兼容 alpha.2 labels.code 与 rc.2 codeLabels',
      src.indexOf('flowMarkdownPreviewKey') >= 0
        && src.indexOf('flowMarkdownDisabledKeyRef') >= 0
        && src.indexOf('setFlowMarkdownPreviewKey(key)') >= 0
        && src.indexOf('FLOW_MARKDOWN_LABELS') >= 0
        && src.indexOf('labels: FLOW_MARKDOWN_LABELS') >= 0
        && src.indexOf('codeLabels: FLOW_MARKDOWN_LABELS.code') >= 0
        && src.indexOf("closest('[data-flow-markdown-preview]')") >= 0
        && src.indexOf('React.useLayoutEffect(() => {') >= 0
        && css.indexOf('.fl-md-preview-btn[aria-pressed="true"]') >= 0)
    check('Markdown 预览挂在原文所在内容节并使用同类边框滚动框',
      src.indexOf("const mount = source.closest('.fl-sec') || target") >= 0
        && src.indexOf('flowMarkdownPortal.mount || flowMarkdownPortal.target') >= 0
        && css.indexOf('.fl-markdown-rendered{min-width:0;border:1px solid') >= 0
        && css.indexOf('max-height:min(70vh,520px);overflow:auto') >= 0)
    check('Skill 语义详情复用 Markdown 渲染并保留折叠原文样式',
      css.indexOf('.fl-skill-hero{') >= 0 && css.indexOf('.fl-skill-instructions{') >= 0
        && css.indexOf('.fl-skill-raw{') >= 0 && src.indexOf('结构化 Skill 说明默认使用官方 Markdown 预览') >= 0)
    check('工具卡名称与状态保持单行，名称优先省略而非挤压状态',
      css.indexOf('.fl-name{flex:1;min-width:0;') >= 0
        && css.indexOf('.fl-status{flex:none;white-space:nowrap;') >= 0
        && css.indexOf('font-variant-numeric:tabular-nums;white-space:nowrap') >= 0)
    check('详情最后一个内容框填满右侧剩余高度，传入和元信息保持自然高度',
      css.indexOf('.fl-rail-body>.fl-sec:last-child{flex:1;min-height:0}') >= 0
        && css.indexOf('.fl-rail-body>.fl-sec:last-child>.fl-pre,.fl-rail-body>.fl-sec:last-child>.fl-markdown-rendered{flex:1;min-height:0;max-height:none}') >= 0)
    check('详情上限统一为容器 85%，Better Sidebar 嵌入态仍使用兼容拖拽事件链',
      css.indexOf('.fl-rail{position:absolute;right:0;top:0;bottom:0;width:min(var(--fl-rail-w,350px),85%)') >= 0
        && css.indexOf('.jr-drawer-embedded .fl-rail{width:min(var(--fl-rail-w,350px),100%)}') < 0
        && src.indexOf('pane.getBoundingClientRect().width * 0.85') >= 0
        && src.indexOf('onPointerDown: onFlowRailResizeDown') >= 0
        && src.indexOf('handle.setPointerCapture(pointerId)') >= 0)
    check('Client 可在 Host 尚未重启时把旧文字复制按钮升级为图标并补齐预览按钮',
      src.indexOf('FLOW_COPY_ICON_HTML') >= 0
        && src.indexOf("if (!button.querySelector('svg')) button.innerHTML = FLOW_COPY_ICON_HTML") >= 0
        && src.indexOf("document.createElement('button')") >= 0
        && src.indexOf("head.insertBefore(previewButton, copy || null)") >= 0)
    check('详情复制按钮保持 SVG 图标，反馈只更新 title 与 aria-label',
      src.indexOf("btn.setAttribute('title', ok ? '已复制' : '复制失败')") >= 0
        && src.indexOf("btn.textContent = ok ? '已复制' : '复制失败'") < 0)
    check('框选图标栏位于 Zoom 上方，计数使用圆形描边', css.indexOf('.tb-flow-zoom-float.with-selection{bottom:14px}') >= 0
      && css.indexOf('.tb-flow-selection-bar{bottom:54px') >= 0 && css.indexOf('.tb-flow-selection-count{width:24px;height:24px;padding:0') >= 0)
    check('面板主布局只作用于 HTML 包装层，不会把左下浮层拉成竖条', css.indexOf('.tb-frame>.tb-panel-html{') >= 0
      && css.indexOf('.tb-frame:has(.tb-pane)>div{') < 0 && src.indexOf("className: 'tb-panel-html'") >= 0)
    check('CSS 含隐藏行与计数覆盖规则', css.indexOf('li[data-cordis-row][data-tb-hide~="1"]{display:none!important}') >= 0
      && css.indexOf('button[data-cordis-badge] span[data-tb-count]::after') >= 0)
    check('大流镜看板：框选取框在 board 模式不接管指针', src.indexOf("hasAttribute('data-flow-board')") >= 0)
    check('大流镜分支横线连续连接相邻中心，不再留下半卡宽断口',
      css.indexOf('.fl-zoom-branch::after{content:"";position:absolute;top:-16px;left:calc(-50% - 14px);right:50%') >= 0
        && css.indexOf('.fl-zoom-branch:first-child::after{display:none}') >= 0)
    check('大流镜聚焦缩放只在视角切换时播放轻量过渡',
      css.indexOf('@keyframes flZoomFocusIn') >= 0 && css.indexOf('@keyframes flZoomOverviewIn') >= 0
        && css.indexOf('.fl-zoom-motion-focus>.tb-pane-body') >= 0 && css.indexOf('.fl-zoom-motion-overview>.tb-pane-body') >= 0
        && css.indexOf('.fl-zoom-near-flow{align-self:stretch;width:100%') >= 0)
    check('大流镜开工台：客户端行为按钮 + 输入镜像恢复 + 输入非空暂停自动刷新/事件窗重拉',
      src.indexOf("closest('[data-zoom-launch]')") >= 0
        && src.indexOf("closest('[data-zoom-pickmode]')") < 0
        && src.indexOf('executeZoomLaunch') >= 0 && src.indexOf('zoomPromptRef') >= 0
        && src.indexOf('onPanelInput') >= 0 && src.indexOf('onInput: onPanelInput') >= 0
        && (src.match(/zoomComposerBusy\(\)/g) || []).length >= 2
        && css.indexOf('.fl-zoom-composer{') >= 0 && css.indexOf('.fl-zoom-prompt{') >= 0)
    check('大流镜开工：旧会话 fork / 新会话同工作区 create + 模型思考强度先于 prompt',
      src.indexOf("querySelectorAll('[data-zoom-lane]')") >= 0
        && src.indexOf("querySelectorAll('[data-zoom-effort]')") >= 0
        && src.indexOf("ctx.get('remote.session')") >= 0
        && src.indexOf('remoteSession.selectModel') >= 0
        && src.indexOf('await selectSessionModel(sid, route, efforts[i]') >= 0
        && src.indexOf('sessionsClient.fork({ sessionId: sourceSessionId') >= 0
        && src.indexOf('sessionsClient.create(launchWorkspaceId ? { workspaceId: launchWorkspaceId }') >= 0
        && src.indexOf("host.call(RT.rpc('session-info'), { session: sourceSessionId })") >= 0
        && src.indexOf('const harnessSelectedSessionId = hookSession || lsSession || props.sessionId') >= 0
        && src.indexOf('const sourceSessionId = harnessSelectedSessionId || currentSessionId || flowScope()') >= 0
        && src.indexOf("const workspacesClient = ctx.get('workspaces')") >= 0
        && src.indexOf('const hookWorkspaceItems = useWorkspacesHook') >= 0
        && src.indexOf('Array.isArray(hookWorkspaceItems)') >= 0
        && src.indexOf('workspacesClient.list.getSnapshot()') >= 0
        && src.indexOf('w.sessionIds.some((sid) => String(sid) === sourceSessionId)') >= 0
        && src.indexOf("b.session.prompt([{ type: 'text', text }], 'queue')") >= 0
        && src.indexOf("await loadPanelRef.current('flow', 'fzoom-joined'") >= 0
        && src.indexOf("if (!forkCurrent && created.length)") >= 0
        && src.indexOf("await navigateHarnessSession({ sessionId: target })") >= 0
        && css.indexOf('.fl-zoom-lane-group{') >= 0 && css.indexOf('.fl-zoom-badge-model{') >= 0)
    check('大流镜已有分支组发送下一轮时复用 Session，不再新建',
      src.indexOf("board.getAttribute('data-zoom-active-sids')") >= 0
        && src.indexOf('const continueExisting = activeSids.length >= 2') >= 0
        && src.indexOf('const sid = continueExisting') >= 0
        && src.indexOf('if (!continueExisting) await renameSession') >= 0
        && src.indexOf('sourceSids: continueExisting ? activeSids') >= 0
        && src.indexOf("baseHistoryId: continueExisting && board ? (board.getAttribute('data-zoom-run-id')") >= 0)
    check('大流镜同时开始按路径检查能力且错误不再静默',
      src.indexOf("if (forkCurrent && typeof sessionsClient.fork !== 'function')") >= 0
        && src.indexOf("if (!forkCurrent && !continueExisting && typeof sessionsClient.create !== 'function')") >= 0
        && src.indexOf('Promise.resolve(executeZoomLaunch()).catch') >= 0
        && src.indexOf("active === 'flow' && flowUiNotice ? React.createElement('div', { className: 'tb-banner tb-banner-info'") >= 0)
    check('大流镜批次日志跨会话持久化，导航生效后单次恢复原生右侧栏',
      src.indexOf("RT.storageKey('flow.zoom-runs.'") >= 0
        && src.indexOf('fields.__flowZoomLog = JSON.stringify(readFlowZoomLog())') >= 0
        && src.indexOf("'fzoom-focus-back'") >= 0 && src.indexOf("'fzoom-focus-current'") >= 0
        && src.indexOf("mode: state && state.zoomMode === 'near' ? 'near' : 'panorama'") >= 0
        && src.indexOf('lastFocusSid: state && typeof state.zoomLastFocusSid') >= 0
        && src.indexOf('writeFlowZoomLog(res.state)') >= 0
        && src.indexOf('合并回写而非覆盖') >= 0 && src.indexOf('indexById') >= 0
        && src.indexOf('merged.slice(-20)') >= 0
        && src.indexOf('const deferFlowNavigationRender') >= 0
        && src.indexOf('if (!deferFlowNavigationRender) setHtml(res.html)') >= 0
        && src.indexOf('if (isFlowFollow && nativeOpenTab)') >= 0
        && css.indexOf('.fl-zoom-history-drawer{') >= 0 && css.indexOf('.fl-history-node{') >= 0 && css.indexOf('.fl-zoom-current-session{') >= 0
        && css.indexOf('.fl-history-toggle{') >= 0
        && css.indexOf('.fl-zoom-diff-board{') >= 0
        && css.indexOf('.fl-diff-cell-change{') >= 0 && css.indexOf('.fl-diff-missing{') >= 0)
    check('大流镜把 Harness 会话标题索引交给 Host 恢复无血缘兄弟分支',
      src.indexOf('fields.__flowSessionIndex = JSON.stringify(flowSessionIds.slice(0, 200)') >= 0
        && src.indexOf("row.displayTitle || row.title || ''") >= 0)
    check('归档 Session 在 Client 会话树、并发日志和 Host 请求中统一过滤',
      src.indexOf('const hookArchivedSessionIds = useWorkspacesHook') >= 0
        && src.indexOf('const archivedSessionSet = new Set(archivedSessionIds)') >= 0
        && src.indexOf('filter((id) => !archivedSessionSet.has(id))') >= 0
        && src.indexOf('fields.__flowArchivedSessionIds = JSON.stringify(archivedSessionIds)') >= 0
        && src.indexOf('if (!archivedSessionSet.size || !Array.isArray(parsed.runs)) return parsed') >= 0)
    check('大流镜显式尺度切换不会被 Session 重挂或静默刷新抢占',
      src.indexOf('const interactiveActionSeqRef = React.useRef({})') >= 0
        && src.indexOf("if ((silent || !action) && interactiveActionSeqRef.current[toolId]) return") >= 0
        && src.indexOf("if (!silent && action) interactiveActionSeqRef.current[toolId] = seq") >= 0
        && src.indexOf("if (interactiveActionSeqRef.current[toolId] === seq) delete interactiveActionSeqRef.current[toolId]") >= 0)
    check('大流镜开工区接近 Harness composer，详细轮次按二/三泳道自适应宽度',
      css.indexOf('.fl-zoom-composer{display:flex;flex-direction:column') >= 0
        && css.indexOf('.fl-zoom-diff-scroll{') >= 0 && css.indexOf('overflow-x:auto;overflow-y:visible') >= 0
        && css.indexOf('.fl-flow-two .fl-lane{grid-template-columns:minmax(180px,1fr) minmax(220px,1.2fr)}') >= 0)
    check('轮次 diff 较窄时保持居中，精简模式有独立摘要样式',
      css.indexOf('margin-inline:auto') >= 0 && css.indexOf('.fl-compact-diff{') >= 0
        && css.indexOf('.fl-diff-dim-change{') >= 0)
    check('详细流镜的任意助手轮次从所属 Session 分支，而不是误用当前看板 Session',
      src.indexOf("branch.closest('[data-flow-detail-session]')") >= 0
        && src.indexOf('const source = sourceSessionId || flowScope()') >= 0)
    check('轮次左栏可一次派生整个并发批次，当前并发成员可增删',
      src.indexOf("closest('[data-zoom-round-fork]')") >= 0
        && src.indexOf('executeZoomRoundFork') >= 0
        && src.indexOf('executeZoomCellFork') >= 0 && src.indexOf('baseHistoryId') >= 0 && src.indexOf('targetCount') >= 0
        && src.indexOf("'fzoom-run-add'") >= 0 && src.indexOf("'fzoom-run-remove'") >= 0
        && css.indexOf('.fl-diff-round-fork{') >= 0 && css.indexOf('.fl-zoom-current-remove{') >= 0)
    check('并发组可选择/拖拽其他 Session、原地新建加入，左栏三点菜单也可直接加入',
      src.indexOf('executeZoomAddNewSession') >= 0
        && src.indexOf("querySelector('[data-zoom-add-drop]')") >= 0
        && src.indexOf('const flowAddDialog =') >= 0
        && src.indexOf('setFlowAddAnchor({ left:') >= 0
        && src.indexOf('添加到当前并发 · ') >= 0
        && src.indexOf("className: 'tb-flow-session-tree'") >= 0
        && src.indexOf("className: 'tb-flow-tree-workspace'") >= 0
        && src.indexOf("className: 'tb-flow-tree-session'") >= 0
        && src.indexOf('加入当前并发分支') >= 0
        && src.indexOf('data-flow-sidebar-join') >= 0
        && src.indexOf("loadPanelRef.current('flow', 'fzoom-run-add'") >= 0
        && css.indexOf('.fl-zoom-add-picker{') >= 0 && css.indexOf('.fl-zoom-composer-targets.is-drop-target{') >= 0
        && css.indexOf('.tb-flow-add-popup{position:fixed') >= 0
        && css.indexOf('backdrop-filter:blur(26px) saturate(175%)') >= 0
        && css.indexOf('.tb-flow-bring-popup,.fl-rail,.fl-zoom-history-drawer,.tb-flow-zoom-float,.tb-flow-selection-bar,.fl-info-pop,.fl-zoom-add-pop,.tb-jump-latest,.jr-resize-badge{') >= 0
        && css.indexOf('@keyframes jrDrawerUp{') >= 0
        && css.indexOf('.tb-flow-bring-popup::before,.fl-info-pop::before,.fl-zoom-add-pop::before{') >= 0
        && css.indexOf('.fl-info:hover .fl-info-pop,.fl-info:focus .fl-info-pop{display:block;animation:jrDrawerUp .12s ease-out}') >= 0)
    check('并发会话标题带任务/分支序号/模型指向，历史树位于右侧；拓扑不写死进标题（由 zoomTopology 按轮次现算）',
      src.indexOf('zoomBranchTitle') >= 0 && src.indexOf("' · 分支 '") >= 0
        && src.indexOf("' 轮 · ' + spec.length + '→'") < 0
        && src.indexOf("' 轮 · 1→' + targetCount") < 0
        && src.indexOf("轮分支 1→'") < 0 && src.indexOf("轮并发 ' + spec.length") < 0
        && css.indexOf('.fl-zoom-history-drawer{position:absolute;right:0') >= 0
        && css.indexOf('width:max-content;min-width:max-content;margin-inline:auto') >= 0)
    check('开工台（发消息）点面板空白处自动收回，落在控件/卡片/浮层上不受影响',
      src.indexOf('onComposerBlankDown') >= 0
        && src.indexOf("t.closest('.fl-zoom-composer") >= 0
        && src.indexOf("loadPanelRef.current('flow', 'fzoom-composer', null)") >= 0)
    check('info 说明气泡加宽减少换行', css.indexOf('.fl-info-pop{position:absolute;right:0;top:30px;z-index:20;width:min(660px,84vw)') >= 0)
    check('大流镜互通：⇪ 带入暂存 + 点选目标 + 带入草稿/直接发送',
      src.indexOf('setZoomRelay({ source:') >= 0
        && src.indexOf('res.zoomRelay') >= 0
        && src.indexOf("[data-action=\"fzoom-relay\"]") >= 0
        && src.indexOf('executeZoomCast') >= 0
        && src.indexOf('putFlowContextIntoDraft(sid, text, true)') >= 0
        && css.indexOf('.fl-zoom-branch.fl-zoom-picked .fl-zoom-branch-head') >= 0 && css.indexOf('.fl-zoom-relay{') >= 0)
  }

  // —— 路径 D（0.1.5 原生右侧栏，bundleId=flow）：两段式注册 + 自有入口 openTab ——
  {
    const flowSrc = 'const TOOLBOX_RUNTIME_OVERRIDES = { bundleId: \'flow\', displayName: \'流镜\' }\n' + src
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const localStorage = makeLocalStorage({})
    const definitions = []
    const openTabCalls = []
    ctx.services.sidebarRightTabs = { register(def) { definitions.push(def); return () => { const i = definitions.indexOf(def); if (i >= 0) definitions.splice(i, 1) } } }
    ctx.services.sidebarRight = { openTab(kind) { openTabCalls.push(kind) } }
    const impl = await evalClient(flowSrc, { ctx, styles: { insert() { return () => {} } }, localStorage })
    impl.apply(ctx)
    ctx.runInject()
    check('D: 原生服务就绪 → page type 注册恰好一次', definitions.length === 1, 'count=' + definitions.length)
    const def = definitions[0]
    check('D: definition id/kind 符合约定（dsh-flowglass/native + dsh-flowglass:flow）',
      def && def.id === 'dsh-flowglass/native' && def.kind === 'dsh-flowglass:flow')
    check('D: page type 不声明 resource patterns（按 kind 打开）', def && def.patterns === undefined)
    check('D: 标题与 guide 项（标题/描述/图标/顺序）',
      def && def.title() === '流镜' && def.guide && def.guide.length === 1
        && def.guide[0].order === 40 && def.guide[0].title() === '流镜'
        && def.guide[0].description().indexOf('子代理') >= 0 && typeof def.guide[0].icon === 'function')
    slots.activateAll()
    const bodyReg = slots.registrations.find((r) => r.entry && r.entry.name === 'sidebar.right.pane.tab' && r.entry.key === 'dsh-flowglass/native')
    check('D: body 以同一 definition id 注册 sidebar.right.pane.tab', Boolean(bodyReg))
    // body 组件只透传 Slot 标准属性：sessionId 权威 + useSessions + useTabInfo 的 visible
    const bodyWrap = bodyReg.component({ useTabInfo: () => ({ tab: { visible: true } }), sessionId: 's-1', useSessions: (sel) => sel({ ids: ['s-1'], byId: {}, current: 's-1' }) })
    const bodyNode = bodyWrap.type(bodyWrap.props)
    check('D: Tab body 嵌入 Drawer（embedded + visible + sessionId 权威）',
      bodyNode && bodyNode.props && bodyNode.props.embedded === true
        && bodyNode.props.visible === true && bodyNode.props.sessionId === 's-1')
    const hiddenWrap = bodyReg.component({ useTabInfo: () => ({ tab: { visible: false } }), sessionId: 's-1', useSessions: () => undefined })
    const hiddenNode = hiddenWrap.type(hiddenWrap.props)
    check('D: tab.visible=false → Drawer 进入不可见暂停态', hiddenNode && hiddenNode.props && hiddenNode.props.visible === false)
    // 无 DOM → footer Entry 兜底：原生激活时点击走 openTab（自动展开），不开独立抽屉
    const entryReg = slots.registrations.find((r) => r.entry && r.entry.name === 'sidebar.footer.action')
    check('D: 无 DOM 时 footer Entry 仍注册（原生激活不隐藏入口）', Boolean(entryReg))
    const rendered = renderHooked(entryReg.component({ wide: true }).type, { wide: true })
    check('D: 原生激活 → Entry 可见且标题指向右侧栏', rendered.children.indexOf('流镜') >= 0 && String(rendered.props.title).indexOf('右侧栏') >= 0)
    rendered.props.onClick()
    check('D: 点击入口 → ctx.sidebarRight.openTab(dsh-flowglass:flow)', openTabCalls.length === 1 && openTabCalls[0] === 'dsh-flowglass:flow')
    for (const dis of ctx.teardowns) dis()
    check('D: teardown 撤销 page type 注册', definitions.length === 0)
  }

  // registry 与 controller 是两个服务边：只到 registry 时不得提前激活并捕获空 controller。
  {
    const flowSrc = 'const TOOLBOX_RUNTIME_OVERRIDES = { bundleId: \'flow\', displayName: \'流镜\' }\n' + src
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const definitions = []
    const openTabCalls = []
    ctx.services.sidebarRightTabs = { register(def) { definitions.push(def); return () => {} } }
    const impl = await evalClient(flowSrc, { ctx, styles: { insert() { return () => {} } }, localStorage: makeLocalStorage({}) })
    impl.apply(ctx)
    ctx.runInject()
    check('D2: 仅 registry 到达时不提前激活原生入口', definitions.length === 0)
    ctx.services.sidebarRight = { openTab(kind) { openTabCalls.push(kind) } }
    ctx.runInject()
    slots.activateAll()
    check('D2: controller 到达后完成原生注册', definitions.length === 1)
    const entryReg = slots.registrations.find((r) => r.entry && r.entry.name === 'sidebar.footer.action')
    const rendered = renderHooked(entryReg.component({ wide: true }).type, { wide: true })
    rendered.props.onClick()
    check('D2: 晚到 controller 被原生入口正确调用', openTabCalls[0] === 'dsh-flowglass:flow')
    for (const dis of ctx.teardowns) dis()
  }

  // —— 路径 E（层级切换）：先 better-sidebar 桥接管，原生服务后到 → 原生接管并撤销桥 ——
  {
    const flowSrc = 'const TOOLBOX_RUNTIME_OVERRIDES = { bundleId: \'flow\', displayName: \'流镜\' }\n' + src
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const localStorage = makeLocalStorage({})
    const definitions = []
    const bsTabs = []
    let bsRegisterCalls = 0
    const bsService = {
      features: ['stateSubscription', 'pluginSettings'],
      registerTab(d) { bsRegisterCalls += 1; bsTabs.push(d); return () => { const i = bsTabs.indexOf(d); if (i >= 0) bsTabs.splice(i, 1) } },
      subscribeState() { return () => {} },
      isTabEnabled() { return true },
      getSnapshot() { return null },
    }
    ctx.services.betterSidebar = bsService
    const impl = await evalClient(flowSrc, { ctx, styles: { insert() { return () => {} } }, localStorage })
    impl.apply(ctx)
    // 先只有 betterSidebar：桥注册接管
    ctx.runInject()
    check('E: 无原生服务 → better-sidebar 桥注册 Tab', bsTabs.length === 1 && definitions.length === 0,
      'bs=' + bsTabs.length + ' native=' + definitions.length)
    check('E: 桥 descriptor 带 description（0.19 契约）', bsTabs[0] && typeof bsTabs[0].description === 'string' && bsTabs[0].description.indexOf('子代理') >= 0)
    // 原生服务后到：inject 补跑 → 原生接管 → 桥撤销（同一时刻只有一条注册路径）
    ctx.services.sidebarRightTabs = { register(def) { definitions.push(def); return () => { const i = definitions.indexOf(def); if (i >= 0) definitions.splice(i, 1) } } }
    ctx.services.sidebarRight = { openTab() {} }
    ctx.runInject()
    check('E: 原生服务后到 → 原生接管 + 桥撤销', definitions.length === 1 && bsTabs.length === 0,
      'bs=' + bsTabs.length + ' native=' + definitions.length)
    check('E: 桥注册恰好一次后撤销（无重复注册）', bsRegisterCalls === 1, 'calls=' + bsRegisterCalls)
    for (const dis of ctx.teardowns) dis()
    check('E: teardown 后两条路径全部清空', definitions.length === 0 && bsTabs.length === 0)
  }

  // —— 路径 F（降级）：原生注册抛错 / 旧 drawer 偏好被忽略 ——
  {
    const flowSrc = 'const TOOLBOX_RUNTIME_OVERRIDES = { bundleId: \'flow\', displayName: \'流镜\' }\n' + src
    const slots = makeSlots()
    const ctx = makeCtx(); ctx.slotsFor = slots
    const localStorage = makeLocalStorage({})
    let failRegister = true
    const definitions = []
    ctx.services.sidebarRightTabs = { register(def) { if (failRegister) throw new Error('registry busy'); definitions.push(def); return () => { const i = definitions.indexOf(def); if (i >= 0) definitions.splice(i, 1) } } }
    ctx.services.sidebarRight = { openTab() {} }
    const impl = await evalClient(flowSrc, { ctx, styles: { insert() { return () => {} } }, localStorage })
    impl.apply(ctx)
    ctx.runInject()
    check('F: 原生注册抛错 → 不产生注册（Drawer 入口不消失）', definitions.length === 0)
    slots.activateAll()
    const entryReg = slots.registrations.find((r) => r.entry && r.entry.name === 'sidebar.footer.action')
    const rendered = renderHooked(entryReg.component({ wide: true }).type, { wide: true })
    check('F: 注册失败 → Entry 可见（回到固定右侧兜底路径）', rendered && rendered.children.length > 0)
    // 历史版本留下的 drawer 偏好不再影响自动兼容承载。
    const slots2 = makeSlots()
    const ctx2 = makeCtx(); ctx2.slotsFor = slots2
    const definitions2 = []
    ctx2.services.sidebarRightTabs = { register(def) { definitions2.push(def); return () => { const i = definitions2.indexOf(def); if (i >= 0) definitions2.splice(i, 1) } } }
    ctx2.services.sidebarRight = { openTab() {} }
    const localStorage2 = makeLocalStorage({ 'dsh.toolbox.flow.display': '{"displayMode":"drawer"}' })
    const impl2 = await evalClient(flowSrc, { ctx: ctx2, styles: { insert() { return () => {} } }, localStorage: localStorage2 })
    impl2.apply(ctx2)
    ctx2.runInject()
    check('F: 旧 drawer 偏好被忽略 → 原生 Tab 正常注册', definitions2.length === 1, 'count=' + definitions2.length)
    for (const dis of ctx.teardowns) dis()
    for (const dis of ctx2.teardowns) dis()
  }

  // —— 静态断言：0.1.5 原生事件窗订阅 / 会话操作对齐 ——
  {
    check('源码含原生事件窗订阅（binding().eventSource + settle 记录）', src.indexOf('sessionsClient.binding') >= 0
      && src.indexOf('eventSource') >= 0 && src.indexOf('assistant/live-chunk') >= 0
      && src.indexOf('liveSettledRef') >= 0 && src.indexOf('firstSeq') >= 0)
    check('实时叠加层随流镜面板请求透传（live 参数）', src.indexOf('live: toolId === \'flow\'') >= 0
      && src.indexOf('liveOverlayRef.current') >= 0)
    check('事件窗 revision 驱动防抖静默刷新', src.indexOf('setLiveRevision') >= 0
      && src.indexOf('liveRevision') >= 0 && src.indexOf("loadPanelRef.current('flow', '__refresh', null, { silent: true })") >= 0)
    check('跨会话草稿写入走 uiSession 绑定（provideInfo 回退已删除）', src.indexOf('uiSession.adapter.resolve') >= 0
      && src.indexOf('sessionsClient.provideInfo') < 0)
    check('原生 body 权威属性（sessionId/useSessions/useTabInfo→visible）', src.indexOf('function FlowglassNativeTabBody') >= 0
      && src.indexOf('props.useTabInfo') >= 0 && src.indexOf('visible = !(info && info.tab && info.tab.visible === false)') >= 0
      && src.indexOf('useWorkspaces: typeof props.useWorkspaces') >= 0)
    check('Flowglass 不再暴露显示方式选择或独立悬浮入口',
      src.indexOf('FlowDisplayModeSelect') < 0 && src.indexOf("RT.storageKey('flow.display')") < 0
        && src.indexOf("const dockButton = RT.bundleId === 'flow' ? null") >= 0
        && src.indexOf("onPointerDown: RT.bundleId === 'flow' ? undefined : onHeaderDown") >= 0)
    check('Flowglass 导航入口首帧使用流镜图标而非工具箱图标',
      src.indexOf("const ENTRY_NAV_ICON = RT.bundleId === 'flow' ? FLOW_NAV_ICON : NAV_ICON") >= 0
        && src.indexOf("'<span class=\"tb-nav-icon\">' + ENTRY_NAV_ICON") >= 0
        && src.indexOf('replaceSidebarIcon(solo || ENTRY_NAV_ICON)') >= 0)
    check('事件窗后续更新按 change 增量折叠且严格截断单块文本',
      src.indexOf("change.kind === 'append'") >= 0 && src.indexOf("change.kind === 'settle-assistant'") >= 0
        && src.indexOf('String(delta).slice(0, room)') >= 0)
    check('面板 RPC 契约透传 live（registry 同步见 sim-flow）', src.indexOf('live && typeof live === \'object\'') >= 0
      || read('shared/registry.js').indexOf('call.live') >= 0)
  }

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('仿真异常:', e); process.exit(2) })
