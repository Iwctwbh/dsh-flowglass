window.__ModuleLoader__.load({
  id: "dsh-dynamic-toolbox",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const TOOLBOX_MARKDOWN_TEXT = null
    const TOOLBOX_UI_PRIMITIVES = null
    const TOOLBOX_CREATE_PORTAL = null
    const name = "dsh-dynamic-toolbox/client"
    const inject = ['slots', 'remote', 'timer', 'sessions']

    const TOOLBOX_RUNTIME_OVERRIDES = {
  "mode": "static-bundle",
  "bundleId": "dynamic-toolbox",
  "displayName": "工具箱",
  "registryService": "toolboxRegistryDynamicToolbox",
  "artifactService": "toolboxArtifactsDynamicToolbox",
  "remoteService": "toolboxNativeDynamicToolbox",
  "remoteNamespace": "toolboxNativeDynamicToolbox",
  "bridgeService": "toolboxNativeBridgeDynamicToolbox",
  "rpcPrefix": "toolbox.dynamic-toolbox",
  "storagePrefix": "dsh.toolbox.dynamic-toolbox",
  "eventPrefix": "tb-dynamic-toolbox",
  "slotPrefix": "toolbox-dynamic-toolbox",
  "domId": "dynamic-toolbox",
  "hostIdPrefix": "toolbox-host-dynamic-toolbox",
  "dataDir": ".dsh-dynamic-toolbox",
  "capabilities": {
    "diskReload": false,
    "rebuildFromDisk": false,
    "pluginDefaults": false,
    "pluginRestart": false,
    "aiUsage": false,
    "managePlugins": false
  }
}
// ===== shared/runtime.js：两种模式共同的运行配置与命名辅助 =====
// 纯 JS：不访问 Node API、不依赖 Host/Client 专属全局，可拼接到 Host 与 Client payload。
// 动态模式：只拼接本文件（无 TOOLBOX_RUNTIME_OVERRIDES）→ 全部动态默认值，与历史行为一致。
  // 原生静态模式：构建器在本文件之前拼接 `const TOOLBOX_RUNTIME_OVERRIDES = {...}` JSON 字面量。
// 配置不走 globalThis/window/process.env（多 bundle 同进程会互相覆盖、批准包必须可审计、
// 全局变量会让 payload 内容哈希不能代表真实行为）——业务实现只读本文件定义的 TOOLBOX_RUNTIME。
const TOOLBOX_RUNTIME = (() => {
  const o = (typeof TOOLBOX_RUNTIME_OVERRIDES !== 'undefined' && TOOLBOX_RUNTIME_OVERRIDES) || {}
  const mode = o.mode || 'dynamic-dev'
  const bundleId = o.bundleId || 'dynamic'
  const rpcPrefix = o.rpcPrefix || 'toolbox'
  const storagePrefix = o.storagePrefix || 'dsh.toolbox'
  const eventPrefix = o.eventPrefix || 'tb'
  const slotPrefix = o.slotPrefix || 'toolbox'
  return Object.freeze({
    mode, // 'dynamic-dev' | 'static-bundle'
    bundleId, // 动态模式恒为 'dynamic'；静态安装包为 bundleId（如 'flow-plus'）
    displayName: o.displayName || '工具箱',
    registryService: o.registryService || 'toolboxRegistry',
    artifactService: o.artifactService || null,
    remoteService: o.remoteService || null,
    remoteNamespace: o.remoteNamespace || null,
    rpcPrefix, // 动态 'toolbox'；编译 'toolbox.<bundleId>' → rpc('tools') = '<prefix>/tools'
    storagePrefix, // 动态 'dsh.toolbox'；编译 'dsh.toolbox.<bundleId>'
    eventPrefix, // 动态 'tb'；编译 'tb-<bundleId>' → event('session-changed')
    slotPrefix, // 动态 'toolbox'；编译 'toolbox-<bundleId>' → slot('entry') / slot('drawer')
    domId: o.domId || 'dynamic', // DOM marker 命名值；动态恒 'dynamic'
    hostIdPrefix: o.hostIdPrefix || 'toolbox-host',
    dataDir: o.dataDir || '.dsh-dynamic-toolbox',
    capabilities: Object.freeze(Object.assign({
      diskReload: mode === 'dynamic-dev',
      rebuildFromDisk: mode === 'dynamic-dev',
      pluginDefaults: true,
      pluginRestart: true,
      aiUsage: true,
      managePlugins: true,
    }, o.capabilities || {})),
    // ---- 命名辅助（前缀已由构建器归一化，拼接即得最终名）----
    rpc: (suffix) => rpcPrefix + '/' + suffix,
    storageKey: (suffix) => storagePrefix + '.' + suffix,
    event: (suffix) => eventPrefix + '-' + suffix,
    slot: (name) => slotPrefix + '-' + name,
    // DOM 标记值：动态默认保持历史值（mounted="1"、entry=""），编译模式用 bundleId 区分多 bundle
    domValue: () => (bundleId === 'dynamic' ? '' : bundleId),
    domMountedValue: () => (bundleId === 'dynamic' ? '1' : bundleId),
    logTag: () => (bundleId === 'dynamic' ? '[toolbox]' : '[toolbox:' + bundleId + ']'),
  })
})()


    const json = Object.freeze({ parse(value) { return value } })
    const descriptor = (method) => ({
      id: "dsh-dynamic-toolbox/remote#toolboxNativeDynamicToolbox/" + method,
      service: "toolboxNativeDynamicToolbox",
      namespace: "toolboxNativeDynamicToolbox",
      method,
      invocation: { kind: 'direct' },
      parameters: [{
        name: 'request', wire: 'request', source: 'json',
        codec: { mode: 'strict', typeSymbol: "dsh-dynamic-toolbox#JsonRequest", schema: json, create: () => json },
      }],
      result: { mode: 'strict', typeSymbol: "dsh-dynamic-toolbox#JsonResult", schema: json, create: () => json },
    })
    const remoteContribution = Object.freeze({
      package: "dsh-dynamic-toolbox",
      descriptors: Object.freeze(["tools","panel","plugins","sessionInfo","selfviewPull","selfviewResult","selfviewPush"].map(descriptor)),
    })

    const styleDisposers = new Set()
    const styles = {
      insert(css) {
        if (typeof document === 'undefined') return () => {}
        const node = document.createElement('style')
        node.setAttribute('data-dsh-toolbox-style', TOOLBOX_RUNTIME.bundleId)
        node.textContent = String(css || '')
        ;(document.head || document.body || document.documentElement).appendChild(node)
        let active = true
        const dispose = () => { if (active) { active = false; styleDisposers.delete(dispose); node.remove() } }
        styleDisposers.add(dispose)
        return dispose
      },
    }
    const unwrap = async (promise) => {
      const answered = await promise
      if (!answered || answered.ok !== true) {
        const error = answered && answered.error
        throw new Error(error ? String(error.code || 'remote') + ': ' + String(error.message || error) : 'Remote 调用失败')
      }
      return answered.value
    }
    // toolbox/client.js 工厂在模块层创建，其 React effects 晚于 apply 执行；
    // Host facade 必须位于同一词法闭包，apply 只负责在 Remote 挂载后赋值。
    let host = null

    const createToolboxClient = () => {
// Plain-script prelude shared by static and dynamic Client assembly.
// Stages are recorded before calls so an interrupted receipt is never
// mistaken for a definite failure. Retry keeps already-created sessions.
const flowDurableEvents = (snapshot) => {
  if (!snapshot || !Array.isArray(snapshot.entries)) return null
  const events = snapshot.entries.map((entry) => entry && entry.type === 'event' ? entry.event
    : entry && entry.type !== 'transient' ? entry : null)
    .filter((event) => event && Number.isFinite(event.seq) && event.type !== 'assistant/live-chunk')
  if (snapshot.revision === 0 || (snapshot.revision == null && !events.length)) return null
  return events
}
const runFlowLaunchBatch = async (batch, api, changed) => {
  const notify = () => { batch.updatedAt = Date.now(); changed(batch) }
  for (const item of batch.items) {
    if (item.status === 'success' || item.status === 'unknown' || item.sid) continue
    item.stage = 'create'; item.status = 'pending'; notify()
    try { item.sid = await api.create(item); item.status = 'ready'; notify() }
    catch (error) { item.status = error.definite ? 'failed' : 'unknown'; item.error = String(error.message || error); notify() }
  }
  // All forks must precede sending to a reused source, preserving its prefix.
  for (const item of batch.items) {
    if (!item.sid || item.status === 'success' || item.status === 'unknown') continue
    if (item.stage !== 'send') {
      item.stage = 'configure'; item.status = 'pending'; notify()
      try { await api.configure(item); item.stage = 'send'; item.status = 'ready'; notify() }
      catch (error) { item.status = 'failed'; item.error = String(error.message || error); notify(); continue }
    }
    item.stage = 'send'; item.status = 'pending'; item.startedAt = Date.now(); notify()
    try { await api.send(item, batch.prompt); item.status = 'success'; item.error = ''; notify() }
    catch (error) { item.status = error.definite ? 'failed' : 'unknown'; item.error = String(error.message || error); notify() }
  }
  return batch
}

// Plain-script factory: state belongs to one Client instance and bundle.
const createFlowStableRuntime = (RT, React) => {
  const flowDrafts = new Map()
  const actionIcons = {
    bookmark: '<path d="M4 2.5h8v11l-4-2.5-4 2.5z"/>',
    relay: '<path d="M2.5 12v-2a4 4 0 0 1 4-4h6M9 2.5 12.5 6 9 9.5"/>',
    export: '<path d="M8 2v8M5 7l3 3 3-3M3 10v3h10v-3"/>',
    compare: '<rect x="2" y="3" width="4.5" height="10" rx="1"/><rect x="9.5" y="3" width="4.5" height="10" rx="1"/>',
  }
  const decorateFlowActions = (root) => {
    if (!root) return root
    for (const button of root.querySelectorAll('[data-flow-bookmark],.fl-zoom-relay,.fl-toolbar>[data-flow-bookmarks],.fl-toolbar>[data-flow-export],.fl-toolbar>[data-flow-compare-preview]')) {
      const kind = button.matches('.fl-zoom-relay') ? 'relay' : button.hasAttribute('data-flow-export') ? 'export' : button.hasAttribute('data-flow-compare-preview') ? 'compare' : 'bookmark'
      const label = button.getAttribute('aria-label') || (button.hasAttribute('data-flow-bookmarks') ? '查看标记' : button.textContent.trim())
      button.setAttribute('aria-label', label)
      button.setAttribute('title', button.getAttribute('title') || label)
      button.classList.add('fl-icon-button')
      button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + actionIcons[kind] + '</svg>'
    }
    return root
  }
  function FlowStableBody({ element }) {
    const ref = React.useRef(null)
    const pinned = React.useRef(true)
    const interactingUntil = React.useRef(0)
    React.useLayoutEffect(() => {
      const body = ref.current
      if (!body) return
      const reverse = () => getComputedStyle(body).flexDirection === 'column-reverse'
      const atBottom = () => reverse() ? Math.abs(body.scrollTop) < 40 : body.scrollHeight - body.clientHeight - body.scrollTop < 40
      const follow = () => { if (pinned.current) body.scrollTop = reverse() ? 0 : body.scrollHeight }
      const onScroll = () => {
        if (atBottom()) pinned.current = true
        else if (Date.now() < interactingUntil.current) pinned.current = false
      }
      const onInput = (event) => {
        interactingUntil.current = Date.now() + 1500
        if (event.type === 'wheel' && event.deltaY < 0 || event.type === 'keydown' && ['ArrowUp', 'PageUp', 'Home'].includes(event.key)) pinned.current = false
      }
      follow()
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(follow) : null
      if (observer) { observer.observe(body); for (const child of body.children) observer.observe(child) }
      body.addEventListener('scroll', onScroll, { passive: true })
      for (const name of ['wheel', 'pointerdown', 'keydown']) body.addEventListener(name, onInput, { passive: true })
      return () => {
        if (observer) observer.disconnect()
        body.removeEventListener('scroll', onScroll)
        for (const name of ['wheel', 'pointerdown', 'keydown']) body.removeEventListener(name, onInput)
      }
    }, [element.innerHTML])
    return React.createElement(element.tagName.toLowerCase(), { ...flowElementProps(element), ref, dangerouslySetInnerHTML: { __html: element.innerHTML } })
  }
  function FlowField({ tag, serverValue, children, ...props }) {
    const ref = React.useRef(null)
    React.useLayoutEffect(() => {
      if (ref.current && ref.current.value !== serverValue) ref.current.value = serverValue
    }, [serverValue])
    return React.createElement(tag, { ...props, ref, defaultValue: serverValue }, children)
  }
  const flowElementProps = (element) => {
    const props = {}
    const names = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', viewbox: 'viewBox' }
    for (const attr of element.attributes) {
      if (/^on/i.test(attr.name) || attr.name === 'selected' || attr.name === 'value') continue
      if (attr.name === 'style') {
        const style = {}
        for (const name of element.style) style[name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_m, letter) => letter.toUpperCase())] = element.style.getPropertyValue(name)
        props.style = style
      } else if (['disabled', 'multiple', 'readOnly', 'required', 'open'].includes(names[attr.name] || attr.name)) {
        props[names[attr.name] || attr.name] = true
      } else props[names[attr.name] || attr.name] = attr.value
    }
    return props
  }
  const flowReactContent = (node, key, draftKey) => {
    if (node.nodeType === 3) return node.textContent
    if (node.nodeType !== 1 || ['SCRIPT', 'IFRAME'].includes(node.tagName)) return null
    const tag = node.tagName.toLowerCase()
    const props = { ...flowElementProps(node), key }
    if (tag === 'select' && node.hasAttribute('data-lane')) props['aria-label'] = '分支 ' + (Number(node.getAttribute('data-lane')) + 1) + (node.hasAttribute('data-zoom-effort') ? ' 思考强度' : ' 模型')
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      props.defaultValue = node.value || node.getAttribute('value') || ''
      if (node.hasAttribute('data-zoom-prompt')) {
        props.key = 'prompt:' + draftKey
        props.defaultValue = flowDrafts.get(draftKey) || ''
        props.onInput = (event) => {
          const value = event.currentTarget.value
          flowDrafts.set(draftKey, value)
          try { localStorage.setItem(RT.storageKey('flow.draft.' + encodeURIComponent(draftKey)), value) } catch (e) {}
        }
      }
      if (node.hasAttribute('data-field') && !node.hasAttribute('data-zoom-prompt')) {
        const { defaultValue, ...fieldProps } = props
        return React.createElement(FlowField, { ...fieldProps, tag, serverValue: defaultValue }, tag === 'select' ? [...node.childNodes].map((child, index) => flowReactContent(child, index, draftKey)) : undefined)
      }
      if (tag === 'input' || tag === 'textarea') return React.createElement(tag, props)
    }
    if (tag === 'option') props.value = node.getAttribute('value') ?? node.textContent
    if (tag === 'svg') return React.createElement('svg', { ...props, dangerouslySetInnerHTML: { __html: node.innerHTML } })
    const children = [...node.childNodes].map((child, index) => flowReactContent(child, child.nodeType === 1 && (child.getAttribute('data-field') || child.getAttribute('data-flow-disclosure')) || index, draftKey))
    if (node.classList.contains('fl-zoom-lane-group')) {
      const lane = node.querySelector('[data-lane]')
      if (lane) children.unshift(React.createElement('span', { className: 'fl-zoom-lane-label', key: 'lane-label' }, '分支 ' + (Number(lane.getAttribute('data-lane')) + 1)))
    }
    return React.createElement(tag, props, children)
  }
  function FlowStablePanel(props) {
    const parsed = React.useMemo(() => {
      const template = document.createElement('template')
      template.innerHTML = props.html
      return decorateFlowActions(template.content.firstElementChild)
    }, [props.html])
    const scope = props.workspace + '\u0001' + (parsed && parsed.getAttribute('data-flow-scope') || '')
    const draftKey = scope + '\u0001' + (parsed && parsed.getAttribute('data-zoom-run-id') || 'session')
    if (!flowDrafts.has(draftKey)) {
      let saved = ''
      try { saved = localStorage.getItem(RT.storageKey('flow.draft.' + encodeURIComponent(draftKey))) || '' } catch (e) {}
      flowDrafts.set(draftKey, saved)
    }
    if (!parsed || !parsed.hasAttribute('data-flow')) return React.createElement('div', { dangerouslySetInnerHTML: { __html: props.html } })
    const rootProps = { ...flowElementProps(parsed), 'data-flow-stable': '1', 'data-flow-draft-key': draftKey }
    return React.createElement(parsed.tagName.toLowerCase(), rootProps, [...parsed.children].map((child, index) => {
      if (child.classList.contains('tb-pane-body')) return React.createElement(FlowStableBody, { key: 'body:' + scope + ':' + (parsed.getAttribute('data-flow-view') || 'session'), element: child })
      if (child.classList.contains('tb-pane-head') || child.classList.contains('fl-zoom-composer') || child.querySelector('.fl-zoom-composer')) return flowReactContent(child, 'composer-shell:' + draftKey, draftKey)
      if (child.hasAttribute('data-flow-inspector')) return React.createElement(FlowStableInspector, { key: 'inspector:' + scope + ':' + child.getAttribute('data-flow-inspector'), html: child.outerHTML })
      return React.createElement(child.tagName.toLowerCase(), {
        ...flowElementProps(child), key: child.className || index, dangerouslySetInnerHTML: { __html: child.innerHTML },
      })
    }))
  }
  function FlowStableInspector(props) {
    const ref = React.useRef(null)
    const [reading, setReading] = React.useState(false)
    const accepted = React.useRef(props.html)
    React.useEffect(() => {
      const onSelection = () => {
        const selection = document.getSelection()
        setReading(!!(selection && !selection.isCollapsed && ref.current && ref.current.contains(selection.anchorNode)))
      }
      document.addEventListener('selectionchange', onSelection)
      return () => document.removeEventListener('selectionchange', onSelection)
    }, [])
    if (!reading) accepted.current = props.html
    const template = document.createElement('template')
    template.innerHTML = accepted.current
    const element = template.content.firstElementChild
    const rendered = flowReactContent(element, 'inspector', '')
    return React.createElement(rendered.type, { ...rendered.props, ref, 'data-flow-reading': reading ? '1' : '0' }, rendered.props.children)
  }
  const clearFlowDraft = (key, expected) => {
    if (!key || String(flowDrafts.get(key) || '').trim() !== expected) return false
    flowDrafts.delete(key)
    try { localStorage.removeItem(RT.storageKey('flow.draft.' + encodeURIComponent(key))) } catch (e) {}
    return true
  }
  return { FlowStablePanel, FlowStableInspector, clearFlowDraft }
}

// ===== toolbox-client.js：工具箱框架 Client 半 — 抽屉 + Tab 栏 + 通用 HTML 面板壳 =====
// 工具列表经 host.call(RT.rpc('tools')) 轮询（1.5s，抽屉打开时）；
// 面板内容经 host.call(RT.rpc('panel')) 获取 HTML 片段 + 状态回传；
// 面板内交互：点击 [data-action]，表单输入收集 [data-field] 一并回传。

return {
  name: 'toolbox',
  inject: ['timer', 'sessions'],
  apply(ctx) {
    // ===== 命名空间（TOOLBOX_RUNTIME 由拼接的 shared/runtime.js 提供；动态默认=历史名称）=====
    const RT = TOOLBOX_RUNTIME
    // Full bundle names are useful for tooltips and accessibility, but they
    // are too long for the drawer/sidebar chrome. Keep the descriptive name
    // as the accessible label and use a compact visible label in the UI.
    const fullDisplayName = String(RT.displayName || '工具箱')
    const compactDisplayName = fullDisplayName.length > 24
      ? '工具箱'
      : fullDisplayName
    // 原生 Flowglass bundle 注入 Harness 官方 Markdown renderer；其他静态合集与
    // 动态开发模式没有这两个词法绑定时保持纯文本详情，不改变 Toolbox 通用契约。
    const flowMarkdownText = RT.bundleId === 'flow'
      && typeof TOOLBOX_MARKDOWN_TEXT !== 'undefined'
      // React.memo / forwardRef components are objects, while ordinary
      // function components are functions. MarkdownText currently uses memo.
      && (typeof TOOLBOX_MARKDOWN_TEXT === 'function'
        || (TOOLBOX_MARKDOWN_TEXT && typeof TOOLBOX_MARKDOWN_TEXT === 'object'))
      ? TOOLBOX_MARKDOWN_TEXT : null
    const flowCreatePortal = RT.bundleId === 'flow'
      && typeof TOOLBOX_CREATE_PORTAL !== 'undefined'
      && typeof TOOLBOX_CREATE_PORTAL === 'function'
      ? TOOLBOX_CREATE_PORTAL : null
    const flowUiPrimitives = RT.bundleId === 'flow'
      && typeof TOOLBOX_UI_PRIMITIVES !== 'undefined'
      && TOOLBOX_UI_PRIMITIVES
      ? TOOLBOX_UI_PRIMITIVES : null
    // Client-side fallback for a split reload: DSH can hot-reload client.js
    // while the native Host half stays resident until process restart.
    const FLOW_COPY_ICON_HTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.5"></rect><path d="M3 11H2.5A1.5 1.5 0 0 1 1 9.5v-7A1.5 1.5 0 0 1 2.5 1h7A1.5 1.5 0 0 1 11 2.5V3"></path></svg>'
    const FLOW_PREVIEW_ICON_HTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4S1.5 8 1.5 8Z"></path><circle cx="8" cy="8" r="1.8"></circle></svg>'
    // DSH alpha.2 uses labels.code while the rc.2 primitive uses codeLabels.
    // Keep both shapes stable so the renderer can be shared across either host.
    const FLOW_MARKDOWN_LABELS = Object.freeze({
      code: Object.freeze({ copyLabel: '复制代码', copiedLabel: '已复制' }),
      footnotes: '脚注',
    })
    // Stable React islands keep editable and readable DOM outside canvas HTML
    // replacement. The wire contract remains compatible with older consumers.
    const { FlowStablePanel, clearFlowDraft } = createFlowStableRuntime(RT, React)
    // 进程级单例（bundle 级）：页面已有本 bundle 主实例的抽屉时，本会话 Client 半空转——避免重复注册
    // sidebar.footer.action / shell.overlay 造成双抽屉。marker 值为空格分隔的 bundleId 列表
    // （多 bundle 同进程各挂各的抽屉，互不抢占）；标记随 fiber 卸载只移除自己那一份。
    const myDomId = RT.domMountedValue()
    if (typeof document !== 'undefined' && document.body) {
      const cur = (document.body.getAttribute('data-dsh-toolbox-mounted') || '').split(/\s+/).filter(Boolean)
      if (cur.indexOf(myDomId) >= 0) {
        console.log('toolbox: 页面已存在本工具箱抽屉（另一会话的主实例），本会话 Client 半跳过')
        return
      }
      document.body.setAttribute('data-dsh-toolbox-mounted', cur.concat([myDomId]).join(' '))
      ctx.effect(() => () => {
        try {
          if (!document.body) return
          const rest = (document.body.getAttribute('data-dsh-toolbox-mounted') || '').split(/\s+/).filter((v) => v && v !== myDomId)
          if (rest.length) document.body.setAttribute('data-dsh-toolbox-mounted', rest.join(' '))
          else document.body.removeAttribute('data-dsh-toolbox-mounted')
        } catch (e) {}
      })
    }
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const themeSvc = ctx.get('theme')
    const sessionsClient = ctx.sessions
    const workspacesClient = ctx.get('workspaces')

    // Flowglass 的“子代理跟随”要走 Harness 正式会话导航，不直接改 localStorage。
    // 子代理优先使用 catalog 的精确 address；若 catalog 尚未拉取，先刷新父会话再解析。
    const navigateHarnessSession = async (request) => {
      if (!request || !request.sessionId) return
      if (!sessionsClient) throw new Error('sessions 服务不可用')
      const target = String(request.sessionId)
      const parent = request.parentSessionId ? String(request.parentSessionId) : ''
      let navigationTarget = target
      if (request.kind === 'subagent' && parent) {
        let address = typeof sessionsClient.subagentAddress === 'function' ? sessionsClient.subagentAddress(target) : null
        if (!address && typeof sessionsClient.refreshSubagents === 'function') {
          try { await sessionsClient.refreshSubagents(parent) } catch (e) {}
          if (typeof sessionsClient.subagentAddress === 'function') address = sessionsClient.subagentAddress(target)
        }
        if (!address && sessionsClient.list && typeof sessionsClient.list.getSnapshot === 'function') {
          const snap = sessionsClient.list.getSnapshot()
          const catalog = snap && snap.subagentsByParent && snap.subagentsByParent[parent]
          const entry = catalog && Array.isArray(catalog.entries)
            ? catalog.entries.find((it) => it && it.kind === 'child' && it.id === target)
            : null
          if (entry && entry.mode) address = { parentSessionId: parent, childSessionId: target, mode: entry.mode }
        }
        if (address) navigationTarget = address
      }
      const uiWorkspace = ctx.get('uiWorkspace')
      if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
        uiWorkspace.openSession(navigationTarget)
        return
      }
      if (navigationTarget !== target && typeof sessionsClient.openSubagent === 'function') {
        sessionsClient.openSubagent(navigationTarget)
        return
      }
      if (typeof sessionsClient.open !== 'function') throw new Error('sessions.open 不可用')
      sessionsClient.open(target)
    }

    // ===== localStorage 变化事件桥（v6.5）=====
    // app-shell 每次切会话都会写 localStorage['dsh.sessions.current']（浏览器全局权威）。
    // 抽屉主实例挂在宿主会话下，useSessions 不响应 UI 切会话——本桥 patch Storage.setItem，
    // 写入该 key 的瞬间 dispatch 自定义事件，抽屉监听后立即读取（零延迟），替代轮询主路径。
    // 多 bundle 共享同一个 patch（__tbPatched 守卫 + __tbEvents 订阅集）：每个 bundle 只 dispatch
    // 自己的事件名；disposer 按订阅移除，最后一个退订时才恢复原始 setItem（引用计数恢复）。
    const SESSION_EVENT = RT.event('session-changed')
    try {
      if (typeof localStorage !== 'undefined' && typeof window !== 'undefined') {
        const proto = Object.getPrototypeOf(localStorage)
        let orig = proto && proto.setItem
        if (orig && orig.__tbPatched && orig.__tbEvents) {
          // 已有其他 bundle 的 patch：只订阅自己的事件名
          orig.__tbEvents.add(SESSION_EVENT)
          const shared = orig
          ctx.effect(() => () => {
            try {
              shared.__tbEvents.delete(SESSION_EVENT)
              if (!shared.__tbEvents.size && proto.setItem === shared && shared.__tbOrig) proto.setItem = shared.__tbOrig
            } catch (e) {}
          })
        } else if (orig && !orig.__tbPatched) {
          const events = new Set([SESSION_EVENT])
          const wrapped = function (k, v) {
            const r = orig.apply(this, arguments)
            try { if (k === 'dsh.sessions.current') { for (const ev of events) window.dispatchEvent(new CustomEvent(ev, { detail: v })) } } catch (e) {}
            return r
          }
          wrapped.__tbPatched = true
          wrapped.__tbEvents = events
          wrapped.__tbOrig = orig
          proto.setItem = wrapped
          ctx.effect(() => () => {
            try {
              events.delete(SESSION_EVENT)
              if (!events.size && proto.setItem === wrapped) proto.setItem = orig
            } catch (e) {}
          })
        }
      }
    } catch (e) {}

    // ===== Cordis 面板「隐藏无界面」联动（v6.6）=====
    // 管理视图「隐藏无界面」开关同时隐藏左下角官方 Cordis 面板里的 Host-only 行并修正
    // 触发按钮的 running 计数：官方行带 data-cordis-row=<pluginId> / data-cordis-awaiting 稳定钩子，
    // 触发按钮带 data-cordis-badge。host-only 集合经 toolbox/plugins 计算（Host 半已有 inventory），
    // MutationObserver 幂等打标隐藏（跳过待审批行）；计数 span 用 data-tb-count + CSS ::after
    // 覆盖——不与 React 文本节点打架。running 计数直接统计面板 DOM 里「可见且 running」的行：
    // 官方 badge 统计整个进程的动态插件，toolbox/plugins 只有当前工具箱的单仓库清单，
    // 用它计算会偏小；面板未打开时行不渲染，官方文本本就是正确的全局值，不覆盖。
    // 开关与管理视图共用、localStorage 持久化，默认开。动态模式保留历史 key；编译 bundle 按 bundleId 隔离。
    const PANEL_HIDE_KEY = RT.bundleId === 'dynamic' ? 'tbx-hide-host-only' : 'tbx-hide-host-only-' + RT.bundleId
    const PANEL_HIDE_TOKEN = RT.domMountedValue()
    const tokenList = (el, attr) => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)
    const setOwnToken = (el, attr, on) => {
      const next = tokenList(el, attr).filter((v) => v !== PANEL_HIDE_TOKEN)
      if (on) next.push(PANEL_HIDE_TOKEN)
      if (next.length) el.setAttribute(attr, next.join(' '))
      else el.removeAttribute(attr)
    }
    const panelHide = {
      on: (() => { try { return localStorage.getItem(PANEL_HIDE_KEY) !== '0' } catch (e) { return true } })(),
      headless: new Set(),
    }
    // 静态合集（capabilities.managePlugins=false）没有插件 inventory——plugins RPC 恒返回空清单，
    // 联动启用也只会把 headless 清空、一行都藏不住：整体不启用（不装 CSS/observer/轮询、不渲染开关）。
    const panelHideSupported = RT.capabilities.managePlugins !== false
    // styles.insert 返回 disposer——必须挂 ctx.effect，否则插件停止/重跑后旧样式残留，
    // 重跑一次叠一份（PLUGIN-DEV.md 规则4；主题插件同款约束）
    if (panelHideSupported) ctx.effect(() => styles.insert([
      'li[data-cordis-row][data-tb-hide~="' + PANEL_HIDE_TOKEN + '"]{display:none!important}',
      '[data-cordis-panel] section[data-tb-hide~="' + PANEL_HIDE_TOKEN + '"]{display:none!important}',
      'button[data-cordis-badge] span[data-tb-count]{font-size:0!important}',
      'button[data-cordis-badge] span[data-tb-count]::after{content:attr(data-tb-count);font-size:calc(12px*var(--tb-fs,1));line-height:16px}',
    ].join('')))
    function applyPanelHide() {
      if (typeof document === 'undefined' || !document.body) return
      const rows = document.querySelectorAll('li[data-cordis-row]')
      for (const li of rows) {
        const hide = panelHide.on && panelHide.headless.has(li.getAttribute('data-cordis-row')) && !li.hasAttribute('data-cordis-awaiting')
        setOwnToken(li, 'data-tb-hide', hide)
      }
      const panel = document.querySelector('[data-cordis-panel]')
      if (panel) for (const sec of panel.querySelectorAll('section')) {
        const lis = sec.querySelectorAll('li[data-cordis-row]')
        let vis = 0
        for (const li of lis) if (!li.hasAttribute('data-tb-hide')) vis++
        setOwnToken(sec, 'data-tb-hide', lis.length > 0 && vis === 0)
      }
      const badge = document.querySelector('button[data-cordis-badge]')
      if (!badge) return
      // running 计数直接统计面板 DOM 里「可见且 running」的行（官方 badge 是全进程口径，
      // toolbox/plugins 只有单仓库清单，用它计算会偏小）；面板未打开时行不渲染 → 不覆盖，
      // 保持官方全局计数
      let visibleRunning = null
      if (rows.length) {
        visibleRunning = 0
        for (const li of rows) {
          if (!li.hasAttribute('data-tb-hide') && li.getAttribute('data-cordis-status') === 'running') visibleRunning++
        }
      }
      for (const sp of badge.querySelectorAll('span')) {
        if (!/^\s*\d+\s+running\s*$/.test(sp.textContent || '') && !sp.hasAttribute('data-tb-count')) continue
        if (panelHide.on && visibleRunning !== null) {
          const txt = visibleRunning + ' running'
          if (sp.getAttribute('data-tb-count') !== txt) sp.setAttribute('data-tb-count', txt)
        } else if (sp.hasAttribute('data-tb-count')) sp.removeAttribute('data-tb-count')
      }
    }
    let panelHideRaf = 0
    function schedulePanelHide() {
      if (panelHideRaf) return
      panelHideRaf = requestAnimationFrame(() => { panelHideRaf = 0; applyPanelHide() })
    }
    async function refreshPanelHide() {
      try {
        const r = await host.call(RT.rpc('plugins'), {})
        if (!r || !r.ok || !Array.isArray(r.plugins)) return
        panelHide.headless = new Set(r.plugins.filter((p) => !p.hasClientHalf).map((p) => p.pluginId))
        applyPanelHide()
      } catch (e) {}
    }
    function setPanelHideOn(v) {
      panelHide.on = v
      try { localStorage.setItem(PANEL_HIDE_KEY, v ? '1' : '0') } catch (e) {}
      if (v) refreshPanelHide()
      applyPanelHide()
    }
    if (panelHideSupported && typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
      const mo = new MutationObserver(schedulePanelHide)
      mo.observe(document.body, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['data-cordis-awaiting', 'data-cordis-row', 'data-cordis-badge'],
      })
      ctx.effect(() => () => mo.disconnect())
      // 兜底轮询降频 + 页面隐藏时跳过：refreshPanelHide 每次都拉 runner.inventory()+manifestMap，
      // 页面不可见时纯属空转；MutationObserver 已覆盖面板 DOM 变化的主路径，这里只兜漏网
      const phIv = setInterval(() => {
        if (!panelHide.on) return
        try { if (typeof document !== 'undefined' && document.hidden) return } catch (e) {}
        refreshPanelHide()
      }, 10000)
      ctx.effect(() => () => clearInterval(phIv))
      refreshPanelHide()
      applyPanelHide()
    }

    const toolboxCss = [
      '.tb-entry{display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 10px;margin:0 4px 0 0;border:1px solid var(--dsw-alias-border-l2,#4a4b55);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#26272e);color:var(--dsw-alias-label-primary,#e8e8ea);font-size:calc(12px*var(--tb-fs,1));font-weight:600;line-height:1;cursor:pointer;white-space:nowrap;appearance:none;box-sizing:border-box;font-family:inherit}',
      '.tb-entry:hover{background:var(--dsw-alias-bg-layer-2,#30313a)}',
      '.tb-entry-active{color:var(--dsw-alias-brand-primary,#3b82f6);border-color:var(--dsw-alias-brand-primary,#3b82f6)}',
      // ---- 侧边栏导航条目（DOM 注入，样式对齐任务看板/SSH 导航行；无 DOM 环境走 Slot 兜底） ----
      '[data-dsh-toolbox-entry]{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:calc(13px*var(--tb-fs,1));display:flex;font-family:inherit;box-sizing:border-box}',
      '[data-dsh-toolbox-entry]:hover{background:var(--dsw-specific-sidebar-nav-item-hover,var(--dsw-alias-bg-layer-2,#31323b));color:var(--dsw-alias-label-primary)}',
      '[data-dsh-toolbox-entry][data-active]{background:var(--dsw-specific-sidebar-nav-item-active,var(--dsw-alias-bg-layer-2,#31323b));color:var(--dsw-alias-label-primary);font-weight:600}',
      '.tb-nav-icon{flex:none;display:inline-flex;justify-content:center;align-items:center}',
      '.tb-nav-label{overflow:hidden;text-overflow:ellipsis}',
      // Harness 宿主当前把收起状态标在 frame 上，但 frame 没有 data-dsh-frame。
      // 保留旧选择器兼容带有该标记的宿主，同时直接匹配官方标记，避免收起 rail 露出文字。
      '[data-dsh-frame][data-sidebar-collapsed] [data-dsh-toolbox-entry]{justify-content:center;width:100%;padding:0}',
      '[data-dsh-frame][data-sidebar-collapsed] .tb-nav-label{display:none}',
      '[data-sidebar-collapsed] [data-dsh-toolbox-entry]{justify-content:center;width:100%;padding:0}',
      '[data-sidebar-collapsed] .tb-nav-label{display:none}',
      '.jr-drawer{position:fixed;right:24px;top:64px;z-index:1300;width:520px;max-width:94vw;max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#17181d);border:1px solid var(--dsw-alias-border-l1,#3a3b44);border-radius:10px;color:var(--dsw-alias-label-primary,#e8e8ea);font-size:calc(13px*var(--tb-fs,1));pointer-events:auto;box-shadow:-14px 0 44px rgba(0,0,0,.24);animation:jrDrawerIn .16s ease-out;overflow:hidden}',
      // better-sidebar 嵌入态：只复用面板，不带 fixed 抽屉几何、阴影、拖拽 chrome。
      '.jr-drawer-embedded{position:relative;inset:auto;z-index:auto;width:100%;height:100%;min-height:0;max-width:none;max-height:none;border:0;border-radius:0;background:transparent;box-shadow:none;animation:none;overflow:hidden}',
      '.jr-drawer-embedded .jr-drawer-body{flex:1;min-height:0;padding:8px}',
      '.jr-docked{right:0;top:0;bottom:0;max-height:none;border-radius:0;border-top:none;border-right:none;border-bottom:none;border-left:1px solid var(--dsw-alias-border-l1,#3a3b44);box-shadow:-8px 0 24px rgba(0,0,0,.16)}',
      '.jr-docked .jr-drawer-body{flex:1;min-height:0}',
      // 全占右侧：左侧贴侧边栏右缘（left 由渲染时实测侧边栏给出），上下占满，替代主内容区视图
      // 挤压三栏停靠：抽屉 fixed 右栏（宽度内联给），主内容列 margin-right 让位（见 Drawer 内 effect），左中右并列互不遮挡
      '.jr-docked-full{right:0;top:0;bottom:0;max-height:none;max-width:none;width:auto;border-radius:0;border:none;border-left:1px solid var(--dsw-alias-border-l1,#3a3b44);box-shadow:none;animation:jrDrawerIn .16s ease-out}',
      '.jr-docked-full .jr-drawer-body{flex:1;min-height:0}',
      '@keyframes jrDrawerIn{from{transform:translateX(28px);opacity:.3}to{transform:translateX(0);opacity:1}}',
      // 弹层上浮进入：「回到最新」/带入弹窗/信息气泡/添加菜单共用（此前只引用未定义，动画从未生效）
      '@keyframes jrDrawerUp{from{transform:translateY(9px);opacity:0}to{transform:translateY(0);opacity:1}}',
      '.jr-drawer-header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#3a3b44);background:var(--dsw-alias-bg-base,#17181d);cursor:move;user-select:none}',
      '.jr-drawer-title{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(14px*var(--tb-fs,1))}',
      '.jr-overlay-close{width:30px;height:30px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#9a9aa5);cursor:pointer;border-radius:6px;padding:0}',
      '.jr-overlay-close:hover{color:var(--dsw-alias-label-primary,#e8e8ea);background:var(--dsw-alias-bg-layer-2,#30313a)}',
      '.jr-drawer-body{padding:14px;overflow:auto;display:flex;flex-direction:column;gap:12px}',
      // ---- 抽屉内滚动条统一接管：轨道透明（融入面板背景），thumb 用边框色；Webkit + Firefox 双写 ----
      '.jr-drawer *{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,#454650) transparent}',
      '.jr-drawer ::-webkit-scrollbar{width:9px;height:9px}',
      '.jr-drawer ::-webkit-scrollbar-track{background:transparent}',
      '.jr-drawer ::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#454650);border-radius:5px;border:2px solid transparent;background-clip:padding-box}',
      '.jr-drawer ::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-tertiary,#6f707c);border:2px solid transparent;background-clip:padding-box}',
      '.jr-drawer ::-webkit-scrollbar-corner{background:transparent}',
      '.jr-tabpanel{display:flex;flex-direction:column;gap:12px}',
      // ---- 三段式导航条（搜索整行 / 分类行 / 分类下工具行；分类与工具行横向滚动 + 滚轮横移见 HRow） ----
      '.tb-nav{display:flex;flex-direction:column;gap:8px;padding:10px 14px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#3a3b44);flex:none}',
      '.tb-nav-search{flex:none;width:100%}',
      '.tb-hrow{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin}',
      '.tb-cats{padding-bottom:2px}',
      '.tb-tools{padding-bottom:9px}',
      '.tb-hrow-empty{flex:none;color:var(--dsw-alias-label-secondary,#9a9aa5);font-size:calc(11.5px*var(--tb-fs,1));padding:2px 2px 10px}',
      '.tb-tab{flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#9a9aa5);font-size:calc(12px*var(--tb-fs,1));font-weight:600;cursor:pointer;white-space:nowrap;appearance:none;font-family:inherit}',
      // ---- 管理页树（分类节点 → 插件节点；分类头可折叠、可接拖放） ----
      '.tb-tree-cat{display:flex;align-items:center;gap:7px;height:26px;padding:0 6px;border-radius:6px;cursor:pointer;user-select:none;border:1px dashed transparent;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-tree-cat:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b))}',
      '.tb-tree-cat-drop{border-color:var(--tb-accent-border,rgba(91,141,239,.5));background:var(--tb-accent-bg,rgba(91,141,239,.08))}',
      '.tb-tree-chev{width:12px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));transition:transform .12s}',
      '.tb-tree-cat-open>.tb-tree-chev{transform:rotate(90deg)}',
      '.tb-tree-cat-label{font-size:calc(12px*var(--tb-fs,1));font-weight:700;letter-spacing:.3px}',
      '.tb-tree-kids{display:flex;flex-direction:column;gap:6px;padding:2px 0 6px 19px}',
      '.tb-drag{flex:none;cursor:grab;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-size:calc(11px*var(--tb-fs,1));letter-spacing:1px;line-height:1}',
      '.tb-tab:hover{background:var(--dsw-alias-bg-layer-2,#30313a);color:var(--dsw-alias-label-primary,#e8e8ea)}',
      '.tb-tab-active{color:var(--dsw-alias-brand-primary,#3b82f6);border-color:var(--dsw-alias-border-l2,#4a4b55);background:var(--dsw-alias-bg-layer-1,#26272e)}',
      // ---- Tab 忙碌转圈（替代面板内「处理中…」横幅，操作期间面板内容保持不动） ----
      '.tb-tab-spin{display:inline-block;width:10px;height:10px;border:1.5px solid var(--tb-accent-border,rgba(91,141,239,.35));border-top-color:var(--tb-accent,#3f6fd9);border-radius:50%;animation:tbSpin .7s linear infinite}',
      // ---- Tab 角标（工具经 data-tab-badge 声明；如流程图节点数 / 配额余量） ----
      '.tb-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;border-radius:999px;font-size:calc(9.5px*var(--tb-fs,1));font-weight:700;font-variant-numeric:tabular-nums;background:var(--tb-accent-bg,rgba(91,141,239,.16));color:var(--tb-accent-text,#7fa7f0);border:1px solid var(--tb-accent-border,rgba(91,141,239,.35))}',
      '@keyframes tbSpin{to{transform:rotate(360deg)}}',
      '.tb-empty{color:var(--dsw-alias-label-secondary,#9a9aa5);font-size:calc(12px*var(--tb-fs,1));text-align:center;padding:26px 0;line-height:1.7}',
      '.jr-snap-indicator{position:fixed;right:0;top:0;bottom:0;width:4px;background:var(--dsw-alias-brand-primary,#3b82f6);opacity:.65;z-index:1299;pointer-events:none}',
      '.jr-resize-left{position:absolute;left:0;top:0;bottom:0;width:6px;cursor:col-resize;z-index:6;touch-action:none}',
      '.jr-resize-left:hover{background:rgba(59,130,246,.28)}',
      '.jr-resize-right{position:absolute;top:0;right:0;bottom:0;width:6px;cursor:ew-resize;z-index:6;touch-action:none}',
      '.jr-resize-right:hover{background:rgba(59,130,246,.28)}',
      '.jr-resize-bottom{position:absolute;left:0;right:0;bottom:0;height:6px;cursor:ns-resize;z-index:6;touch-action:none}',
      '.jr-resize-bottom:hover{background:rgba(59,130,246,.28)}',
      '.jr-resize-corner{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:6;touch-action:none}',
      '.jr-resize-corner:hover{background:rgba(59,130,246,.22);border-radius:0 0 10px 0}',
      '.jr-resize-badge{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:5px 12px;border:1px solid var(--dsw-alias-border-l2,#4a4b55);border-radius:6px;background:var(--dsw-alias-bg-overlay,#1e1f24);color:var(--dsw-alias-label-primary,#e8e8ea);font-size:calc(12px*var(--tb-fs,1));font-variant-numeric:tabular-nums;z-index:1310;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.3)}',
      '.tb-frame{position:relative;display:flex;flex-direction:column;gap:10px;min-height:0}',
      // 「回到最新」浮标：只控制工具面板的主 .tb-pane-body，不影响 Harness 聊天区。
      '.tb-jump-latest{position:absolute;right:16px;bottom:14px;z-index:7;display:inline-flex;align-items:center;height:28px;padding:0 13px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#454650);background:var(--dsw-alias-bg-overlay,#1e1f24);color:var(--tb-accent-text,#7fa7f0);font-size:calc(12px*var(--tb-fs,1));font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);font-family:inherit;animation:jrDrawerUp .16s ease-out}',
      // 悬停不再回落实色底（选择器优先级高于统一玻璃层，实色会盖掉模糊）：只加深描边与光晕
      '.tb-jump-latest:hover{border-color:var(--tb-accent-border,rgba(91,141,239,.5));box-shadow:0 10px 26px rgba(0,0,0,.36),0 0 0 1px var(--tb-accent-ring,rgba(91,141,239,.16)),inset 0 1px 0 rgba(255,255,255,.12)}',
      '.tb-flow-zoom-float,.tb-flow-selection-bar{position:absolute;left:16px;bottom:14px;z-index:8;display:flex;align-items:center;gap:7px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:999px;background:var(--dsw-alias-bg-overlay,#1e1f24);box-shadow:0 4px 14px rgba(0,0,0,.3)}',
      '.tb-flow-zoom-float,.tb-flow-selection-bar{padding:3px 5px;opacity:.42;transition:opacity .15s}',
      '.tb-flow-zoom-float:hover,.tb-flow-zoom-float:focus-within,.tb-flow-selection-bar:hover,.tb-flow-selection-bar:focus-within{opacity:1}',
      '.tb-flow-zoom-float.with-selection{bottom:14px}',
      '.tb-flow-selection-bar{bottom:54px;flex-wrap:nowrap;white-space:nowrap}',
      '.tb-flow-zoom{display:inline-flex;align-items:center;gap:2px}',
      '.tb-flow-zoom-btn{width:25px;height:24px;border:none;border-radius:5px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));cursor:pointer;font-family:inherit}',
      '.tb-flow-zoom-btn:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-flow-zoom-value{min-width:43px;text-align:center;font-size:calc(11px*var(--tb-fs,1));font-variant-numeric:tabular-nums;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))}',
      '.tb-flow-select-btn{height:24px;padding:0 9px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:6px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font-size:calc(11px*var(--tb-fs,1));cursor:pointer;font-family:inherit}',
      '.tb-flow-icon-btn{position:relative;width:25px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:5px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));cursor:pointer;padding:0}',
      '.tb-flow-icon-btn:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-active-text,#7fa7f0)}',
      '.tb-flow-icon-btn:disabled{opacity:.4;cursor:default}',
      '.tb-flow-selection-count{width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:999px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font-size:calc(10.5px*var(--tb-fs,1));font-weight:600;font-variant-numeric:tabular-nums}',
      '.tb-flow-bring-popup{position:absolute;left:16px;bottom:94px;z-index:9;width:min(360px,calc(100% - 32px));display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:9px;background:var(--dsw-alias-bg-overlay,#1e1f24);box-shadow:0 8px 24px rgba(0,0,0,.35);animation:jrDrawerUp .14s ease-out}',
      '.tb-flow-add-popup{position:fixed;right:auto;bottom:auto;z-index:60;box-sizing:border-box;overflow:hidden;border-color:color-mix(in srgb,var(--tb-active-text,#7fa7f0) 34%,transparent);background:linear-gradient(145deg,color-mix(in srgb,var(--dsw-alias-bg-overlay,#1e1f24) 52%,rgba(122,162,240,.17)),color-mix(in srgb,var(--dsw-alias-bg-overlay,#1e1f24) 34%,transparent));box-shadow:0 24px 70px rgba(0,0,0,.48),0 7px 24px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.11);backdrop-filter:blur(26px) saturate(175%);-webkit-backdrop-filter:blur(26px) saturate(175%);animation:jrDrawerUp .16s ease-out}',
      '.tb-flow-add-popup::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,rgba(151,184,248,.68),transparent);pointer-events:none}',
      '.tb-flow-add-popup .tb-flow-popup-head{padding-bottom:7px;border-bottom:1px solid rgba(255,255,255,.07)}',
      '.tb-flow-add-popup .tb-flow-session-tree{flex:1;min-height:0;max-height:none}',
      '.tb-flow-add-popup .tb-flow-tree-workspace,.tb-flow-add-popup .tb-flow-tree-session{transition:background .14s ease,border-color .14s ease,transform .14s ease}',
      '.tb-flow-add-popup .tb-flow-tree-workspace:hover,.tb-flow-add-popup .tb-flow-tree-session:hover{background:color-mix(in srgb,var(--tb-active-text,#7fa7f0) 11%,transparent);transform:translateX(1px)}',
      '.tb-flow-add-popup .tb-flow-popup-actions{padding-top:8px;border-top:1px solid rgba(255,255,255,.07)}',
      '.tb-flow-popup-head{display:flex;align-items:center;gap:8px;font-size:calc(12px*var(--tb-fs,1));font-weight:600;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-flow-popup-head>span{flex:1}',
      '.tb-flow-popup-actions{display:flex;justify-content:flex-end;gap:7px}',
      '.tb-flow-session-tree{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow:auto;padding-right:3px}',
      '.tb-flow-tree-group{display:flex;flex-direction:column;gap:3px}',
      '.tb-flow-tree-workspace{width:100%;height:29px;display:flex;align-items:center;gap:7px;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font-size:calc(10.5px*var(--tb-fs,1));font-weight:600;padding:0 6px;border:none;border-radius:6px;background:transparent;cursor:pointer;text-align:left;font-family:inherit}',
      '.tb-flow-tree-workspace:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-flow-tree-folder{flex:none;color:var(--tb-active-text,#7fa7f0)}',
      '.tb-flow-tree-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tb-flow-tree-count{flex:none;font-size:calc(9.5px*var(--tb-fs,1));opacity:.7}',
      '.tb-flow-tree-chevron{flex:none;font-size:calc(9px*var(--tb-fs,1));transition:transform .12s;opacity:.7}',
      '.tb-flow-tree-workspace.open .tb-flow-tree-chevron{transform:rotate(90deg)}',
      '.tb-flow-tree-session{height:28px;display:flex;align-items:center;gap:7px;margin-left:12px;padding:0 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));text-align:left;cursor:pointer;font-family:inherit;font-size:calc(11px*var(--tb-fs,1))}',
      '.tb-flow-tree-session:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-flow-tree-session.on{border-color:var(--tb-accent-border,rgba(91,141,239,.5));background:var(--tb-accent-bg,rgba(91,141,239,.10));color:var(--tb-active-text,#7fa7f0)}',
      '.tb-flow-tree-session>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tb-flow-tree-id{flex:none;font-family:ui-monospace,Consolas,monospace;font-size:calc(9.5px*var(--tb-fs,1));opacity:.72}',
      // Zen：脱离 sidebar/drawer 几何约束占满视口，隐藏 Toolbox 外壳，Flow 自身 header 仍保留。
      '.jr-drawer.jr-flow-zen{position:fixed!important;inset:0!important;z-index:1600!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:none!important;border-radius:0!important;box-shadow:none!important}',
      '.jr-flow-zen>.jr-drawer-header,.jr-flow-zen>.tb-nav{display:none!important}',
      '.jr-flow-zen>.jr-drawer-body{flex:1;min-height:0;padding:10px!important}',
      '.tb-flow-session-select{height:25px;max-width:180px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:6px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-size:calc(11px*var(--tb-fs,1));padding:0 6px;font-family:inherit}',
      '.tb-flow-toolbar-note{font-size:calc(11px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}',
      // ---- 画中画（Document PiP）：主抽屉 DOM 的实时镜像窗口（脱离 WebUI 框体） ----
      '.jr-pip-root{display:flex;flex-direction:column;height:100vh;background:var(--dsw-alias-bg-base,#17181d);color:var(--dsw-alias-label-primary,#e8e8ea);font-size:calc(13px*var(--tb-fs,1));overflow:hidden;font-family:inherit}',
      '.jr-pip-bar{flex:none;display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#3a3b44);background:var(--dsw-alias-bg-layer-1,#26272e)}',
      '.jr-pip-bar-title{flex:1;min-width:0;font-size:calc(11.5px*var(--tb-fs,1));color:var(--dsw-alias-label-secondary,#9a9aa5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.jr-pip-bar-btn{flex:none;height:24px;padding:0 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#454650);background:transparent;color:var(--dsw-alias-label-primary,#e8e8ea);font-size:calc(11.5px*var(--tb-fs,1));cursor:pointer;font-family:inherit}',
      '.jr-pip-bar-btn:hover{background:var(--dsw-alias-bg-layer-2,#30313a)}',
      // 镜像容器：抽屉克隆充满窗口；拖拽把手/吸附指示/尺寸徽章在 pip 里无意义隐藏
      '.jr-pip-mirror{flex:1;min-height:0;overflow:hidden;position:relative}',
      '.jr-pip-mirror .jr-drawer{display:flex}',
      '.jr-pip-mirror .jr-resize-left,.jr-pip-mirror .jr-resize-right,.jr-pip-mirror .jr-resize-bottom,.jr-pip-mirror .jr-resize-corner,.jr-pip-mirror .jr-snap-indicator,.jr-pip-mirror .jr-resize-badge{display:none}',
      '.jr-pip-root *{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,#454650) transparent}',
      '.jr-pip-root ::-webkit-scrollbar{width:9px;height:9px}',
      '.jr-pip-root ::-webkit-scrollbar-track{background:transparent}',
      '.jr-pip-root ::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#454650);border-radius:5px;border:2px solid transparent;background-clip:padding-box}',
      '.tb-notice{color:var(--dsw-alias-label-secondary,#9a9aa5);font-size:calc(12px*var(--tb-fs,1));text-align:center;padding:8px 0}',
      '.tb-error{color:var(--dsw-alias-state-error-primary,#ef4444);font-size:calc(12px*var(--tb-fs,1));white-space:pre-wrap;word-break:break-word;border:1px solid var(--dsw-alias-border-l1,#3a3b44);border-radius:6px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1,#26272e)}',
      // ===== 共享设计系统（tb-）：工具面板 HTML 直接使用；颜色只消费 --tb-* 变量（带兜底），主题插件在 :root 声明即可覆盖 =====
      '.tb-root{font-size:calc(12.5px*var(--tb-fs,1));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-root *{box-sizing:border-box}',
      // ---- 按钮（!important 压宿主全局按钮样式） ----
      '.tb-btn{display:inline-flex;align-items:center;justify-content:center;height:var(--tb-ctl-h-sm,26px);padding:0 11px;border-radius:6px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650))!important;background:transparent!important;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))!important;font-size:calc(12px*var(--tb-fs,1));font-weight:500;font-family:inherit;line-height:1;cursor:pointer;white-space:nowrap;appearance:none;-webkit-appearance:none;outline:none;margin:0;box-shadow:none;text-shadow:none;transition:background .12s,border-color .12s,color .12s}',
      '.tb-btn:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b))!important}',
      '.tb-btn:active{transform:translateY(1px)}',
      '.tb-btn:disabled{opacity:.4;cursor:default;transform:none}',
      '.tb-btn-primary{background:var(--tb-accent,#3f6fd9)!important;border-color:var(--tb-accent,#3f6fd9)!important;color:#fff!important}',
      '.tb-btn-primary:hover{background:var(--tb-accent-hover,#4c7ceb)!important;border-color:var(--tb-accent-hover,#4c7ceb)!important}',
      '.tb-btn-ghost{border-color:transparent!important;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))!important}',
      '.tb-btn-ghost:hover{color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))!important}',
      '.tb-btn-danger-ghost{border-color:transparent!important;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))!important}',
      '.tb-btn-danger-ghost:hover{background:var(--tb-danger-bg,rgba(239,83,80,.1))!important;color:var(--tb-danger-text,#f28b82)!important}',
      '.tb-btn-sm{height:23px;padding:0 8px;font-size:calc(11.5px*var(--tb-fs,1))}',
      // ---- 输入（控件高度统一走 token：--tb-ctl-h 标准高 / --tb-ctl-h-sm 紧凑高，主题可覆盖） ----
      // flex:1 1 auto —— 曾经 flex:1（basis 0%）在纵向 flex（.tb-sec）里把 height 压成内容高（Cron/评审/提交信息/正则的输入框变矮），auto 基准则行列两相宜
      '.tb-query{display:flex;gap:8px;align-items:center}',
      '.tb-query .tb-btn{height:var(--tb-ctl-h,30px)}',
      '.tb-input{flex:1 1 auto;min-width:0;height:var(--tb-ctl-h,30px);padding:0 11px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:6px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-size:calc(12.5px*var(--tb-fs,1));outline:none;font-family:inherit;caret-color:var(--tb-accent,#3f6fd9);transition:border-color .12s,box-shadow .12s}',
      '.tb-input:hover{border-color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c))}',
      '.tb-input:focus{border-color:var(--tb-accent,#3f6fd9);box-shadow:0 0 0 3px var(--tb-accent-ring,rgba(91,141,239,.16))}',
      '.tb-input::placeholder{color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c))}',
      // ---- 多行输入 ----
      '.tb-textarea{width:100%;min-height:62px;padding:8px 11px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:6px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-size:calc(12px*var(--tb-fs,1));font-family:ui-monospace,Consolas,monospace;line-height:1.55;outline:none;resize:vertical;box-sizing:border-box;caret-color:var(--tb-accent,#3f6fd9)}',
      '.tb-textarea:focus{border-color:var(--tb-accent,#3f6fd9);box-shadow:0 0 0 3px var(--tb-accent-ring,rgba(91,141,239,.16))}',
      '.tb-textarea::placeholder{color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c))}',
      // ---- 下拉 ----
      '.tb-select{height:var(--tb-ctl-h-sm,26px);padding:0 8px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:6px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-size:calc(12px*var(--tb-fs,1));font-family:inherit;outline:none;cursor:pointer}',
      // ---- 芯片组（单选/开关） ----
      '.tb-chips{display:flex;gap:5px;flex-wrap:wrap}',
      '.tb-chip{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font-size:calc(11px*var(--tb-fs,1));font-weight:500;cursor:pointer;white-space:nowrap;font-family:inherit;transition:border-color .12s,color .12s,background .12s}',
      '.tb-chip:hover{border-color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-chip-on{background:var(--tb-accent-bg,rgba(91,141,239,.14));border-color:var(--tb-accent-border,rgba(91,141,239,.45));color:var(--tb-accent-text,#7fa7f0)}',
      // ---- 统计行 ----
      '.tb-stats{display:flex;gap:8px;flex-wrap:wrap}',
      '.tb-stat{flex:1;min-width:70px;display:flex;flex-direction:column;gap:2px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:8px;padding:7px 10px}',
      '.tb-stat-num{font-size:calc(15px*var(--tb-fs,1));font-weight:700;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-variant-numeric:tabular-nums}',
      '.tb-stat-label{font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      // ---- 分栏面板（固定头 + 时间线独立滚动）----
      // :has() 作用域化：只有含 .tb-pane 的 tab 启用高度链，其他工具保持整页滚动不变；
      // .tb-pane-body 用 column-reverse —— DOM 最新在前 ⇒ 视觉越往下越新，且滚动条默认停在底部
      '.jr-drawer-body:has(.tb-pane){overflow:hidden}',
      '.tb-frame:has(.tb-pane){flex:1;min-height:0;overflow:hidden}',
      '.tb-frame>.tb-panel-html{flex:1;min-height:0;display:flex;flex-direction:column}',
      '.tb-pane{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;gap:10px;overflow:hidden}',
      '.tb-pane-head{flex:none;display:flex;flex-direction:column;gap:10px}',
      '.tb-pane-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column-reverse;gap:4px;padding-right:4px}',
      // 正常方向变体（默认 column-reverse 是给轨迹的「最新在底、滚动条默认底部」；其他分栏工具用 tb-pane-col）
      '.tb-pane-col{flex-direction:column}',
      // ---- 横幅 ----
      '.tb-banner{padding:7px 11px;border-radius:6px;font-size:calc(12px*var(--tb-fs,1));line-height:1.6;white-space:pre-wrap;word-break:break-word;border:1px solid}',
      '.tb-banner-error{color:var(--tb-danger-text,#f2b8b5);background:var(--tb-danger-bg,rgba(239,83,80,.07));border-color:var(--tb-danger-border,rgba(239,83,80,.25))}',
      '.tb-banner-info{color:var(--tb-ok-text,#a5d6a7);background:var(--tb-ok-bg,rgba(102,187,106,.07));border-color:var(--tb-ok-border,rgba(102,187,106,.25))}',
      // ---- 状态点 + pill ----
      '.tb-dot{flex:none;width:6px;height:6px;border-radius:50%}',
      '.tb-dot-done{background:var(--tb-done,#66bb6a)}',
      '.tb-dot-active{background:var(--tb-active,#5b8def)}',
      '.tb-dot-todo{background:var(--tb-muted,#8a8b96)}',
      '.tb-dot-other{background:var(--tb-warn,#d4a72c)}',
      '.tb-pill{display:inline-flex;align-items:center;gap:5px;height:19px;padding:0 8px;border-radius:999px;font-size:calc(11px*var(--tb-fs,1));border:1px solid;white-space:nowrap}',
      '.tb-pill-done{color:var(--tb-done-text,#81c784);border-color:var(--tb-done-border,rgba(102,187,106,.35))}',
      '.tb-pill-active{color:var(--tb-active-text,#7fa7f0);border-color:var(--tb-active-border,rgba(91,141,239,.4))}',
      '.tb-pill-todo{color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));border-color:var(--tb-muted-border,rgba(138,139,150,.35))}',
      '.tb-pill-other{color:var(--tb-warn-text,#d4b95c);border-color:var(--tb-warn-border,rgba(212,167,44,.4))}',
      '.tb-pill-warn{color:var(--tb-warn-text,#d4b95c);border-color:var(--tb-warn-border,rgba(212,167,44,.4))}', // 语义同 other（警示黄）；轨迹「命令」类等需要语义名的场景用
      '.tb-pill-plain{color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));border-color:var(--tb-border-2,var(--dsw-alias-border-l2,#454650))}',
      // 可点 pill（管理视图「重启后」默认启停）：幽灵虚线弱化存在感，悬停/开启才上 accent，与展示型 pill 拉开层级
      '.tb-pill-btn{display:inline-flex;align-items:center;gap:5px;height:19px;padding:0 8px;border-radius:999px;font-size:calc(11px*var(--tb-fs,1));white-space:nowrap;font-family:inherit;line-height:1;background:transparent;border:1px dashed var(--tb-border-2,var(--dsw-alias-border-l2,#454650));color:var(--tb-text-3,#8b8c96);cursor:pointer}',
      '.tb-pill-btn:hover{color:var(--tb-active-text,#7fa7f0);border-color:var(--tb-active-border,rgba(91,141,239,.4))}',
      '.tb-pill-btn.on{color:var(--tb-active-text,#7fa7f0);border:1px solid var(--tb-active-border,rgba(91,141,239,.4));background:var(--tb-active-bg,rgba(91,141,239,.08))}',
      // ---- 文本色调 / 通用工具 ----
      '.tb-tx-done{color:var(--tb-done-text,#81c784)}',
      '.tb-tx-active{color:var(--tb-active-text,#7fa7f0)}',
      '.tb-tx-warn{color:var(--tb-warn-text,#d4b95c)}',
      '.tb-tx-danger{color:var(--tb-danger-text,#f28b82)}',
      '.tb-tx-muted{color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.tb-mono{font-family:ui-monospace,Consolas,monospace}',
      '.tb-num{font-variant-numeric:tabular-nums;font-size:calc(11px*var(--tb-fs,1));flex:none}',
      '.tb-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.tb-hr{height:1px;background:var(--tb-border,var(--dsw-alias-border-l1,#35363e))}',
      '.tb-note{font-size:calc(11.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      // ---- 卡片 ----
      '.tb-card{display:flex;flex-direction:column;gap:12px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:10px;padding:13px 14px}',
      '.tb-card-head{display:flex;align-items:flex-start;gap:9px}',
      '.tb-key{flex:none;display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:5px;background:var(--tb-accent-bg,rgba(91,141,239,.12));color:var(--tb-accent-text,#7fa7f0);font-family:ui-monospace,Consolas,monospace;font-size:calc(11px*var(--tb-fs,1));font-weight:600;letter-spacing:.3px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tb-title{flex:1;min-width:0;font-size:calc(13.5px*var(--tb-fs,1));font-weight:600;line-height:1.5;word-break:break-word}',
      '.tb-pills{display:flex;flex-wrap:wrap;gap:6px}',
      '.tb-meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px}',
      '.tb-meta-item{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.tb-meta-label{font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.tb-meta-value{font-size:calc(12px*var(--tb-fs,1));word-break:break-word}',
      '.tb-sec{display:flex;flex-direction:column;gap:6px}',
      '.tb-sec-label{font-size:calc(10.5px*var(--tb-fs,1));font-weight:600;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));letter-spacing:.5px}',
      '.tb-desc{white-space:pre-wrap;word-break:break-word;font-size:calc(12px*var(--tb-fs,1));line-height:1.7;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:6px;padding:9px 11px;max-height:220px;overflow:auto}',
      '.tb-code{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Consolas,monospace;font-size:calc(11px*var(--tb-fs,1));line-height:1.5;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:6px;padding:9px 11px;max-height:420px;overflow:auto;margin:0;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      // ---- 行（状态字母 + 路径） ----
      '.tb-line{display:flex;gap:8px;align-items:baseline;padding:1px 0;font-size:calc(12px*var(--tb-fs,1))}',
      '.tb-line-status{width:14px;text-align:center;font-weight:600;flex:none;font-family:ui-monospace,Consolas,monospace}',
      '.tb-line-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace}',
      // ---- 文件/附件行 ----
      '.tb-files{display:flex;flex-direction:column}',
      '.tb-file{display:flex;align-items:center;gap:9px;padding:6px 7px;margin:0 -7px;border-radius:6px;cursor:pointer;transition:background .12s}',
      '.tb-file:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#2b2c33))}',
      '.tb-ext{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:18px;padding:0 5px;border-radius:4px;font-size:calc(9.5px*var(--tb-fs,1));font-weight:700;letter-spacing:.3px;text-transform:uppercase;font-family:ui-monospace,Consolas,monospace;border:1px solid}',
      '.tb-ext-img{color:var(--tb-active-text,#7fa7f0);border-color:var(--tb-active-border,rgba(91,141,239,.4));background:var(--tb-accent-bg,rgba(91,141,239,.1))}',
      '.tb-ext-doc{color:var(--tb-done-text,#81c784);border-color:var(--tb-done-border,rgba(102,187,106,.35));background:var(--tb-ok-bg,rgba(102,187,106,.08))}',
      '.tb-ext-zip{color:var(--tb-warn-text,#d4b95c);border-color:var(--tb-warn-border,rgba(212,167,44,.35));background:rgba(212,167,44,.08)}',
      '.tb-ext-gen{color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));border-color:var(--tb-muted-border,rgba(138,139,150,.3))}',
      '.tb-file-name{flex:1;min-width:0;font-size:calc(12px*var(--tb-fs,1));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tb-file:hover .tb-file-name{color:var(--tb-accent-text,#7fa7f0)}',
      '.tb-file-meta{flex:none;font-size:calc(11px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.tb-file-act{flex:none;font-size:calc(11px*var(--tb-fs,1));color:var(--tb-accent,#3f6fd9);opacity:0;transition:opacity .12s}',
      '.tb-file:hover .tb-file-act{opacity:1}',
      // ---- 预览 ----
      '.tb-preview{display:flex;flex-direction:column;gap:8px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:8px;padding:10px}',
      '.tb-preview-head{display:flex;align-items:center;gap:8px}',
      '.tb-preview-name{flex:1;min-width:0;font-size:calc(12px*var(--tb-fs,1));font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tb-preview-img{display:block;max-width:100%;max-height:320px;border-radius:6px;margin:0 auto}',
      // ---- 记录/提交列表 ----
      '.tb-list-head{display:flex;align-items:center;gap:4px}',
      '.tb-list-title{flex:1;display:flex;align-items:center;gap:6px;font-size:calc(11px*var(--tb-fs,1));font-weight:600;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));letter-spacing:.4px}',
      '.tb-count{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:15px;padding:0 4px;border-radius:999px;background:var(--tb-accent-bg,rgba(91,141,239,.14));color:var(--tb-accent-text,#7fa7f0);font-size:calc(10px*var(--tb-fs,1));font-weight:700;font-variant-numeric:tabular-nums}',
      '.tb-list{display:flex;flex-direction:column;gap:4px}',
      '.tb-rec{display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:8px;cursor:pointer;transition:background .12s,border-color .12s}',
      '.tb-rec:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#2b2c33))}',
      '.tb-rec-active{border-color:var(--tb-accent-border,rgba(91,141,239,.5))}',
      '.tb-rec-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.tb-rec-top{display:flex;align-items:center;gap:8px;min-width:0}',
      '.tb-rec-key{flex:none;font-family:ui-monospace,Consolas,monospace;font-size:calc(11px*var(--tb-fs,1));font-weight:700;color:var(--tb-accent-text,#7fa7f0);letter-spacing:.3px}',
      '.tb-rec-summary{flex:1;min-width:0;font-size:calc(12px*var(--tb-fs,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.tb-rec-sub{display:flex;align-items:center;gap:8px;font-size:calc(11px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-variant-numeric:tabular-nums;flex-wrap:wrap}',
      '.tb-rec-status{display:inline-flex;align-items:center;gap:5px}',
      '.tb-rec-acts{flex:none;display:flex;gap:2px;opacity:0;transition:opacity .12s}',
      '.tb-rec:hover .tb-rec-acts,.tb-rec-active .tb-rec-acts{opacity:1}',
      // ---- 文件树（chevron 旋转 + 文件夹/文件图标 + 展开态高亮） ----
      '.tb-tree{display:flex;flex-direction:column;gap:1px;font-size:calc(12.5px*var(--tb-fs,1))}',
      '.tb-tree-row{display:flex;align-items:center;gap:6px;height:24px;padding:0 8px 0 2px;border-radius:6px;cursor:pointer;white-space:nowrap;transition:background .1s;user-select:none}',
      '.tb-tree-row:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#2b2c33))}',
      '.tb-tree-dir{color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-tree-dir .tb-tree-name{font-weight:600}',
      '.tb-tree-open>.tb-tree-chevron svg{transform:rotate(90deg)}',
      '.tb-tree-open>.tb-tree-ic{color:var(--tb-accent-text,#7fa7f0)}',
      '.tb-tree-file{color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));cursor:default}',
      '.tb-tree-chevron{width:12px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.tb-tree-chevron svg{transition:transform .12s}',
      '.tb-tree-ic{width:15px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.tb-tree-dir>.tb-tree-ic{color:var(--tb-accent-text,#7fa7f0);opacity:.85}',
      '.tb-tree-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.tb-tree-size{color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-size:calc(11px*var(--tb-fs,1));min-width:56px;text-align:right;flex:none;font-variant-numeric:tabular-nums}',
      // ---- 空状态 ----
      '.tb-empty{display:flex;flex-direction:column;align-items:center;gap:5px;padding:26px 14px;border:1px dashed var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:8px;text-align:center}',
      '.tb-empty-glyph{width:30px;height:30px;border-radius:8px;border:1px solid var(--tb-accent-border,rgba(91,141,239,.3));display:flex;align-items:center;justify-content:center;margin-bottom:3px}',
      '.tb-empty-glyph svg{stroke:var(--tb-accent,#3f6fd9)}',
      '.tb-empty-title{font-size:calc(12px*var(--tb-fs,1));font-weight:600;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))}',
      '.tb-empty-sub{font-size:calc(11px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      // ---- 管理视图（Tab 显示开关） ----
      '.tb-manage-list{display:flex;flex-direction:column;gap:6px}',
      '.tb-manage-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:8px}',
      '.tb-manage-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.tb-manage-label{font-size:calc(12.5px*var(--tb-fs,1));font-weight:600;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.tb-manage-id{font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-family:ui-monospace,Consolas,monospace}',
      '.tb-switch{position:relative;width:34px;height:19px;flex:none;border-radius:999px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));cursor:pointer;padding:0;appearance:none;outline:none;transition:background .15s,border-color .15s}',
      '.tb-switch::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));transition:transform .15s,background .15s}',
      '.tb-switch-on{background:var(--tb-accent,#3f6fd9);border-color:var(--tb-accent,#3f6fd9)}',
      '.tb-switch-on::after{transform:translateX(15px);background:#fff}',
      // ===== 流程图（flow 工具；fl- 前缀）=====
      // 主干：自上而下节点 + 向下箭头；子代理：git 树分支（├─ │ ╰─）；普通工具组：向右分支（├▶ ╰▶）
      // 卡片自适应宽度（不占满，凸显左右分支结构）；入/出两行展示调用的传入与返回
      '.fl-row{display:flex;min-width:0}',
      '.fl-node{position:relative;max-width:520px;min-width:0;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-left-width:2px;border-radius:8px;padding:7px 10px;display:flex;flex-direction:column;gap:3px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));box-shadow:0 2px 8px rgba(0,0,0,.18)}',
      // 消息卡可点开详情（与工具卡同一交互）：手势 + 选中高亮
      '.fl-node[data-action]{cursor:pointer;transition:border-color .12s}',
      '.fl-node[data-action]:hover{border-color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c))}',
      '.fl-branch-btn{position:absolute;right:6px;top:5px;width:23px;height:21px;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));cursor:pointer;padding:0;opacity:0;pointer-events:none;transform:translateY(2px);transition:opacity .12s,transform .12s,color .12s,border-color .12s}',
      '.fl-node:hover .fl-branch-btn,.fl-node:focus-within .fl-branch-btn{opacity:1;pointer-events:auto;transform:none}',
      '.fl-branch-btn:hover{color:var(--tb-active-text,#7fa7f0);border-color:var(--tb-accent-border,rgba(91,141,239,.45));background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b))}',
      '.fl-node[data-flow-role="ai"]{padding-right:36px}',
      '.fl-info{position:relative;flex:none;margin-left:auto;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));cursor:help;outline:none}',
      '.fl-info:hover,.fl-info:focus{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-active-text,#7fa7f0)}',
      '.fl-info-pop{position:absolute;right:0;top:30px;z-index:20;width:min(660px,84vw);display:none;padding:10px 12px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:8px;background:var(--dsw-alias-bg-overlay,#1e1f24);box-shadow:0 8px 24px rgba(0,0,0,.35);color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font-size:calc(11.5px*var(--tb-fs,1));font-weight:400;line-height:1.65;white-space:pre-line}',
      '.fl-info:hover .fl-info-pop,.fl-info:focus .fl-info-pop{display:block;animation:jrDrawerUp .12s ease-out}',
      '[data-flow-select-seq].fl-select-picked{outline:2px solid var(--tb-accent,#3f6fd9);outline-offset:2px;box-shadow:0 0 0 4px var(--tb-accent-ring,rgba(91,141,239,.16))}',
      '[data-flow-select-mode="1"] .tb-pane-body{cursor:crosshair;user-select:none}',
      '.fl-marquee{position:absolute;z-index:30;border:1px solid var(--tb-accent,#3f6fd9);background:var(--tb-accent-ring,rgba(91,141,239,.16));pointer-events:none;border-radius:3px}',
      // 选中高亮：tint 叠在实色底上（直接用半透明 accent 底会被身后主干线穿透）
      '.fl-node.fl-on{border-color:var(--tb-accent-border,rgba(91,141,239,.6));background:linear-gradient(var(--tb-accent-bg,rgba(91,141,239,.08)),var(--tb-accent-bg,rgba(91,141,239,.08))),var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e))}',
      '.fl-model{flex:none;font-size:calc(10px*var(--tb-fs,1));font-family:ui-monospace,Consolas,monospace;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));background:var(--dsw-alias-bg-base,#17181d);border-radius:3px;padding:1px 5px}',
      '.fl-glyph{flex:none;font-size:calc(9px*var(--tb-fs,1));line-height:1;opacity:.9}',
      '.fl-node-head{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}',
      '.fl-tag{flex:none;display:inline-flex;align-items:center;height:17px;padding:0 6px;border-radius:4px;font-size:calc(10px*var(--tb-fs,1));font-weight:700;letter-spacing:.3px}',
      // 重试/失败徽标（流镜助手卡头）：等待=琥珀 / 成功=绿 / 失败与错误码=红 / 未成行=灰
      '.fl-retry{flex:none;display:inline-flex;align-items:center;height:15px;padding:0 5px;border-radius:4px;font-size:calc(9.5px*var(--tb-fs,1));font-weight:600;letter-spacing:.2px}',
      '.fl-retry-ok{color:var(--tb-done-text,#81c784);background:rgba(102,187,106,.12)}',
      '.fl-retry-wait{color:#d4b95c;background:rgba(212,167,44,.12)}',
      '.fl-retry-fail{color:var(--tb-danger-text,#f28b82);background:rgba(242,139,130,.12)}',
      '.fl-retry-cancel{color:var(--tb-text-3,#777884);background:rgba(138,139,150,.10)}',
      '.fl-time{flex:none;font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.fl-preview{font-size:calc(12px*var(--tb-fs,1));line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));max-width:500px}',
      // ▼ 箭头自带画布底色块：主干竖线从下方穿过时字形不被线划过
      // （不用整体 opacity——色块必须 100% 不透明才盖得住线；字形色与线同 token，箭头实一点正好突出）
      '.fl-arrow{flex:none;align-self:center;line-height:1;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-size:calc(10px*var(--tb-fs,1));background:var(--dsw-alias-bg-base,#17181d);padding:0 3px;border-radius:3px}',
      // 泳道内连接符：上=弹性空隙（::before 主干线透出，长短随行高自适应）+ ▼ 贴内容顶；下=对称弹性空间保持卡片居中
      '.fl-conn{flex:1;min-height:16px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0}',
      '.fl-conn-gap{flex:1;min-height:4px}',
      // 流程图画布：bg-base 实色 + blueprint 网格线（中性灰蓝极低透明，明暗两主题均隐约可见；实色底防透明皮肤重影）
      '.jr-drawer [data-flow] .tb-pane-body{background:var(--dsw-alias-bg-base,#17181d);border-radius:8px;background-image:linear-gradient(rgba(128,138,150,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(128,138,150,.055) 1px,transparent 1px);background-size:22px 22px}',
      '.jr-drawer [data-flow] .tb-pane-body>*{zoom:var(--tb-flow-zoom,1)}',
      '.fl-par{flex:1;display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.fl-name{flex:1;min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:calc(11.5px*var(--tb-fs,1));font-weight:700;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.fl-args{font-family:ui-monospace,Consolas,monospace;font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      // ---- 三列泳道（手绘参考图 2：左=子代理分支区 / 中=主干用户·助手 / 右=工具调用卡） ----
      // 左泳道不再封顶 140px：随画布共同拉伸，给并行子代理足够的可读宽度。
      '.fl-lane{display:grid;grid-template-columns:minmax(140px,1.05fr) minmax(180px,1fr) minmax(220px,1.2fr);gap:0 10px;min-width:0;align-items:stretch}',
      '.fl-lane-main{min-width:0;display:flex;flex-direction:column;justify-content:center;position:relative}',
      // 主干竖线贯通：每行中列全高画线，且向下多延 4px 盖住容器行间距（gap:4px），行间首尾相接成一条连续线；
      // 卡片不透明底自然盖线、只在空隙露出；线色与 ▼ 箭头一致（text-3 + .7 透明度），2.5px
      '.fl-lane-main::before{content:"";position:absolute;left:calc(50% - 1.25px);top:0;bottom:-4px;width:2.5px;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));opacity:.7;z-index:0}',
      '.fl-lane-main>*{position:relative;z-index:1}',
      '.fl-lane-main .fl-node{max-width:none}',
      '.fl-lane-side{min-width:0;display:grid;grid-template-columns:84px minmax(0,1fr);gap:6px 8px;align-items:center}',
      // 并行调用组外框：同一步骤 >1 个调用时虚线框圈成一组，右上「并行 ×N」角标（底色盖边框）
      '.fl-lane-side.fl-grp{position:relative;border:1px dashed var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:10px;padding:10px 10px;margin:4px 0}',
      '.fl-grp-tag{position:absolute;top:-7px;right:10px;padding:0 5px;font-size:calc(9px*var(--tb-fs,1));line-height:13px;font-weight:600;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));background:var(--dsw-alias-bg-base,#17181d);border-radius:3px;letter-spacing:.3px}',
      '.fl-lane-line{width:2.5px;align-self:center;flex:1;min-height:26px;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));opacity:.7}',
      // 子代理分支块（左列）：真正参与行高计算，避免 height:0 导致多分支互相叠压。
      // auto-fit 让宽画布自动多列，窄画布保持单列。
      '.fl-subcol{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:8px;min-width:0;min-height:112px;align-items:stretch}',
      '.fl-subcol.fl-subgrp{border:1px dashed var(--tb-accent-border,rgba(91,141,239,.4));border-radius:10px;padding:11px 8px 8px}',
      '.fl-subgrp-tag{position:absolute;top:-7px;right:10px;padding:0 5px;font-size:calc(9px*var(--tb-fs,1));line-height:13px;font-weight:600;color:var(--tb-active-text,#7fa7f0);background:var(--dsw-alias-bg-base,#17181d);border-radius:3px;letter-spacing:.2px}',
      '.fl-subbranch{display:flex;flex-direction:column;gap:5px;min-width:0;min-height:104px}',
      // 分支行保底高度：中列只有一根竖线时（孤立分支行）分支不被压没
      '.fl-lane:has(> .fl-subcol){min-height:112px}',
      '.fl-sub-card{position:relative;flex:none;border:1px solid var(--tb-accent-border,rgba(91,141,239,.45));border-radius:8px;padding:5px 8px;background:var(--tb-accent-bg,rgba(91,141,239,.08));display:flex;flex-direction:column;gap:3px;min-width:0;cursor:pointer}',
      '.fl-sub-card::after{content:"";position:absolute;right:-11px;top:50%;width:10px;height:1px;background:var(--tb-accent-border,rgba(91,141,239,.45))}',
      '.fl-sub-steps{flex:1;min-height:22px;max-height:132px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:3px 4px 3px 8px;margin-left:6px;border-left:1px dashed var(--tb-accent-border,rgba(91,141,239,.4))}',
      // 出口卡贴底（支线步骤区 flex 填充把出口压到底部，与返回后的主干卡对齐）
      '.fl-sub-close{margin-top:auto}',
      '.fl-sub-meta{display:flex;align-items:center;gap:6px}',
      '.fl-sub-step{display:flex;align-items:center;gap:4px;min-width:0;font-size:calc(10.5px*var(--tb-fs,1))}',
      '.fl-sub-io{display:flex;align-items:baseline;gap:5px;font-family:ui-monospace,Consolas,monospace;font-size:calc(10.5px*var(--tb-fs,1));min-width:0}',
      '.fl-older{min-height:30px}',
      '.fl-wp{display:flex;flex-direction:column;justify-content:center;gap:10px;min-width:0}',
      '.fl-wl{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.fl-wl-txt{font-family:ui-monospace,Consolas,monospace;font-size:calc(9px*var(--tb-fs,1));line-height:1.2;color:var(--tb-accent-text,#7fa7f0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.fl-wl-row{position:relative;display:flex;align-items:center;gap:3px;height:8px}',
      '.fl-wl-line{flex:1;height:1px;min-width:8px;background:var(--tb-accent-border,rgba(91,141,239,.45))}',
      '.fl-wl-arr{flex:none;font-size:calc(7px*var(--tb-fs,1));line-height:1;color:var(--tb-accent-border,rgba(91,141,239,.6))}',
      '.fl-wl-b .fl-wl-txt{color:var(--tb-done-text,#81c784)}',
      '.fl-wl-b .fl-wl-line{background:rgba(102,187,106,.45)}',
      '.fl-wl-b .fl-wl-arr{color:rgba(102,187,106,.6)}',
      '.fl-wl-err .fl-wl-txt{color:var(--tb-danger-text,#f28b82)}',
      '.fl-wl-err .fl-wl-line{background:rgba(239,83,80,.5)}',
      '.fl-wl-err .fl-wl-arr{color:rgba(239,83,80,.6)}',
      '.fl-wl-wait .fl-wl-txt{color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-wl-wait .fl-wl-line{background:transparent;border-top:1px dashed var(--tb-border-2,var(--dsw-alias-border-l2,#454650))}',
      '.fl-callside{min-width:0;display:flex;flex-direction:column;gap:4px;justify-content:center}',
      '.fl-iocard{width:auto;max-width:none;min-width:0;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:9px;padding:6px 10px;display:flex;flex-direction:column;gap:3px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);transition:border-color .12s,box-shadow .12s}',
      '.fl-iocard:hover{border-color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c))}',
      '.fl-iocard.fl-on{border-color:var(--tb-accent-border,rgba(91,141,239,.6));background:var(--tb-accent-bg,rgba(91,141,239,.08))}',
      '.fl-iocard.fl-err{border-color:var(--tb-danger-border,rgba(239,83,80,.5))}',
      '.fl-live{border-color:var(--tb-accent-border,rgba(91,141,239,.65))!important;animation:flPulse 1.6s ease-in-out infinite}',
      // 右侧调用组：输入光点 .5s → 卡片至少流光一圈 1s；输出光点等真实完成态才触发 .5s。
      // 快速调用也先走完输入+一圈流光，慢调用则由 fl-live 接续流光等待结果。
      // 输入能量点沿蓝线左→右；输出能量点沿绿线右→左，不再让整条线同时闪烁。
      '.fl-min-anim>.fl-wl:not(.fl-wl-b)>.fl-wl-row::after{content:"";position:absolute;top:50%;left:0;width:6px;height:3px;border-radius:999px;pointer-events:none;background:var(--tb-accent-text,#7fa7f0);box-shadow:0 0 3px var(--tb-accent-text,#7fa7f0),0 0 7px var(--tb-accent-text,#7fa7f0);animation:flWireTravelRight .5s linear var(--fl-min-delay,0ms) 1 both}',
      '.fl-output-anim>.fl-wl.fl-wl-b>.fl-wl-row::after{content:"";position:absolute;top:50%;right:0;width:6px;height:3px;border-radius:999px;pointer-events:none;background:var(--tb-done-text,#81c784);box-shadow:0 0 3px var(--tb-done-text,#81c784),0 0 7px var(--tb-done-text,#81c784);animation:flWireTravelLeft .5s linear var(--fl-output-delay,0ms) 1 both}',
      '.fl-min-anim .fl-iocard{position:relative;border-color:var(--tb-accent-border,rgba(91,141,239,.65))!important}',
      // 固定序列期间压住原有的卡片/状态点循环脉冲，避免它与输入、流光、输出三个阶段并发。
      '.fl-min-anim .fl-live{animation:none}',
      '.fl-min-anim .fl-live .fl-iohead::before{animation:none;opacity:0}',
      // 主线用户/助手卡：新出现时固定流光一圈；助手仍在进行时，固定圈结束后由 fl-live 接续持续流光。
      '.fl-main-min-anim{position:relative;border-color:var(--tb-accent-border,rgba(91,141,239,.65))!important}',
      // 运行中卡片：渐变流光贴边转圈（conic-gradient 环形遮罩 + 角度动画）。
      // @property 驱动角度 → 亮段沿边框流动；mask-composite 裁出 1.5px 描边环，内容不被遮。
      // 不支持 mask-composite / @property 的环境走 @supports 整体降级为原有脉冲。
      '.fl-live{position:relative}',
      '@supports (mask-composite: exclude) or (-webkit-mask-composite: xor){' +
        '.fl-live::before,.fl-min-anim .fl-iocard::before,.fl-main-min-anim::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1.5px;' +
        'background:conic-gradient(from var(--fl-sweep,0deg),transparent 0deg,rgba(127,167,240,.9) 55deg,transparent 135deg);' +
        '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;' +
        'mask-composite:exclude;pointer-events:none}' +
        '.fl-live::before{animation:flSweep 1s linear infinite}' +
        '.fl-min-anim .fl-iocard::before{opacity:0;animation:flMinSweep 1s linear calc(500ms + var(--fl-min-delay,0ms)) 1 both}' +
        '.fl-main-min-anim::before{animation:flSweep 1s linear var(--fl-main-delay,0ms) 1 both}' +
        // 日模式（浅色）下加深加宽亮段，流光同样明显
        'body:not([data-ds-dark-theme]) .fl-live::before,body:not([data-ds-dark-theme]) .fl-min-anim .fl-iocard::before,body:not([data-ds-dark-theme]) .fl-main-min-anim::before{' +
        'background:conic-gradient(from var(--fl-sweep,0deg),transparent 0deg,rgba(43,102,240,.95) 80deg,transparent 165deg)}' +
      '}',
      '@property --fl-sweep{syntax:"<angle>";initial-value:0deg;inherits:false}',
      '@keyframes flSweep{to{--fl-sweep:360deg}}',
      '@keyframes flMinSweep{0%{opacity:0;--fl-sweep:0deg}.1%{opacity:1;--fl-sweep:0deg}99.9%{opacity:1;--fl-sweep:360deg}100%{opacity:0;--fl-sweep:360deg}}',
      '@keyframes flWireTravelRight{0%{opacity:0;left:0;transform:translateY(-50%) scale(.7)}10%{opacity:1}90%{opacity:1}100%{opacity:0;left:calc(100% - 6px);transform:translateY(-50%) scale(1)}}',
      '@keyframes flWireTravelLeft{0%{opacity:0;right:0;transform:translateY(-50%) scale(.7)}10%{opacity:1}90%{opacity:1}100%{opacity:0;right:calc(100% - 6px);transform:translateY(-50%) scale(1)}}',
      // LIVE 脉冲点（进行中调用卡头部，蓝图风）
      '.fl-live .fl-iohead::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--tb-done-text,#81c784);animation:flBlink 1.1s ease-in-out infinite}',
      // 助手卡进行中同款流光 + 脉冲点（与工具卡视觉一致）
      '.fl-live .fl-node-head::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--tb-done-text,#81c784);animation:flBlink 1.1s ease-in-out infinite}',
      '@keyframes flBlink{0%,100%{opacity:1}50%{opacity:.25}}',
      '@keyframes flPulse{0%,100%{box-shadow:0 0 0 1.5px var(--tb-accent-ring,rgba(91,141,239,.16))}50%{box-shadow:0 0 0 4px var(--tb-accent-ring,rgba(91,141,239,.16))}}',
      '.fl-iohead{display:flex;align-items:center;gap:6px;min-width:0}',
      '.fl-status{flex:none;white-space:nowrap;font-size:calc(10.5px*var(--tb-fs,1));font-variant-numeric:tabular-nums}',
      '.fl-io-tag{flex:none;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:3px;font-size:calc(9px*var(--tb-fs,1));font-weight:700}',
      // 卡片点击展开的完整详情（入=完整传入 JSON / 出=完整返回文本）
      '.fl-detail{display:flex;flex-direction:column;gap:6px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:8px;padding:8px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));max-width:460px;margin-top:2px}',
      '.fl-sec{display:flex;flex-direction:column;gap:3px}',
      // 右侧详情的最后一个内容区吃满剩余高度：工具详情为「出」，消息详情为「完整内容」。
      // 前面的元信息/传入仍按内容自然高度展示。
      '.fl-rail-body>.fl-sec:last-child{flex:1;min-height:0}',
      '.fl-rail-body>.fl-sec:last-child>.fl-pre,.fl-rail-body>.fl-sec:last-child>.fl-markdown-rendered{flex:1;min-height:0;max-height:none}',
      '.fl-sec-label{font-size:calc(11px*var(--tb-fs-detail,1));font-weight:600;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));letter-spacing:.4px}',
      '.fl-pre{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Consolas,monospace;font-size:calc(12px*var(--tb-fs-detail,1));line-height:1.5;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:6px;padding:6px 8px;max-height:220px;overflow:auto;margin:0;background:var(--dsw-alias-bg-base,#17181d);color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-spin{flex:none;display:inline-block;width:10px;height:10px;border:1.5px solid var(--tb-accent-border,rgba(91,141,239,.35));border-top-color:var(--tb-accent,#3f6fd9);border-radius:50%;animation:tbSpin .7s linear infinite}',
      // ---- 调用详情右侧浮层（不插入流程流撑高内容——展开/收起零跳跃，关闭回原来位置）----
      '.fl-rail{position:absolute;right:0;top:0;bottom:0;width:min(var(--fl-rail-w,350px),85%);display:flex;flex-direction:column;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));border-left:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));box-shadow:-8px 0 18px rgba(0,0,0,.24);z-index:4;border-radius:0 8px 8px 0}',
      // 动画只在展开动作那次渲染带（轮询重渲染不重播，防详情浮层闪烁）
      '.fl-rail-anim{animation:jrDrawerIn .16s ease-out}',
      '.fl-rail-head{flex:none;display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));font-size:calc(12px*var(--tb-fs-detail,1));font-weight:600;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-rail-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace}',
      '.fl-rail-x{flex:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));cursor:pointer;border-radius:5px;padding:0;font-size:calc(12px*var(--tb-fs-detail,1));font-family:inherit}',
      '.fl-rail-x:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-rail-body{flex:1;min-height:0;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px}',
      // 原生 Flowglass 按需用 React portal 把官方 MarkdownText 挂进 Host 详情 body；
      // 助手详情默认显示 Markdown，用户点预览图标可切回原始 pre。
      '.fl-rail-body[data-flow-markdown-enhanced="1"] [data-flow-markdown-source]{display:none}',
      '.fl-markdown-rendered{min-width:0;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:6px;padding:6px 8px;max-height:min(70vh,520px);overflow:auto;background:var(--dsw-alias-bg-base,#17181d);color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-size:calc(13px*var(--tb-fs-detail,1));line-height:1.6}',
      '.fl-markdown-rendered>*{min-width:0}',
      // 左缘拖拽手柄：隐形 9px 热区悬出边框 4px，悬停/拖拽中显 2px 提示线
      '.fl-rail-resize{position:absolute;left:-4px;top:0;bottom:0;width:9px;cursor:col-resize;z-index:6;touch-action:none}',
      '.fl-rail-resize::after{content:"";position:absolute;left:3px;top:0;bottom:0;width:2px;border-radius:1px;background:transparent;transition:background .12s}',
      '.fl-rail-resize:hover::after,.fl-rail-dragging .fl-rail-resize::after{background:var(--tb-accent-border,rgba(91,141,239,.5))}',
      '.fl-rail-dragging{user-select:none}',
      // rail 头部的分支按钮：复用卡片 .fl-branch-btn 外观，改为常显静态布局
      '.fl-rail-head .fl-branch-btn{position:static;opacity:1;pointer-events:auto;transform:none;width:22px;height:20px;flex:none}',
      '.fl-rule-list{display:flex;flex-direction:column;gap:8px}',
      '.fl-rule-card{display:flex;flex-direction:column;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:8px;background:var(--dsw-alias-bg-base,#17181d);overflow:hidden;transition:border-color .12s,opacity .12s}',
      '.fl-rule-card.fl-rule-open{border-color:var(--tb-accent-border,rgba(91,141,239,.55))}',
      '.fl-rule-card.fl-rule-off{opacity:.62}',
      '.fl-rule-summary{display:flex;align-items:center;min-width:0;padding:5px 6px 5px 8px;gap:3px}',
      '.fl-rule-main{flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:2px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-family:inherit}',
      '.fl-rule-main:hover .fl-rule-copy>strong{color:var(--tb-active-text,#7fa7f0)}',
      '.fl-rule-dot{flex:none;width:8px;height:8px;border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.06)}',
      '.fl-rule-badge{flex:none;max-width:70px;padding:1px 5px;border-radius:4px;font-size:calc(9px*var(--tb-fs-detail,1));font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fl-rule-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.fl-rule-copy>strong{font-size:calc(11.5px*var(--tb-fs-detail,1));font-weight:600;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .12s}',
      '.fl-rule-copy>small{font-size:calc(9.5px*var(--tb-fs-detail,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fl-rule-chevron{flex:none;width:15px;height:15px;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));transition:transform .12s}',
      '.fl-rule-open .fl-rule-chevron{transform:rotate(90deg)}',
      '.fl-rule-chevron svg,.fl-rule-icon svg,.fl-rule-add svg{display:block;width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}',
      '.fl-rule-switch{position:relative;flex:none;width:31px;height:18px;padding:0;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:999px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));cursor:pointer;transition:background .15s,border-color .15s}',
      '.fl-rule-switch>span{position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .15s,background .15s}',
      '.fl-rule-switch.is-on{background:var(--tb-accent,#3f6fd9);border-color:var(--tb-accent,#3f6fd9)}',
      '.fl-rule-switch.is-on>span{transform:translateX(13px);background:#fff}',
      '.fl-rule-switch:focus-visible{outline:2px solid var(--tb-accent-border,rgba(91,141,239,.65));outline-offset:2px}',
      '.fl-rule-icon{flex:none;width:25px;height:25px;padding:5px;border:0;border-radius:6px;background:transparent;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));cursor:pointer;transition:color .12s,background .12s}',
      '.fl-rule-icon:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-rule-delete:hover{color:var(--tb-danger-text,#f28b82);background:rgba(239,83,80,.1)}',
      '.fl-rule-editor{display:none;flex-direction:column;gap:8px;padding:4px 9px 9px;border-top:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e))}',
      '.fl-rule-open>.fl-rule-editor{display:flex}',
      '.fl-rule-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px 8px}',
      '.fl-rule-grid>label{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.fl-rule-grid>label>span{font-size:calc(10px*var(--tb-fs-detail,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-rule-grid .tb-input{width:100%;height:27px;padding:0 7px;font-size:calc(11px*var(--tb-fs-detail,1))}',
      '.fl-rule-color{width:100%;height:27px;padding:2px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:6px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));cursor:pointer}',
      '.fl-rule-editor-actions{display:flex;justify-content:flex-end;gap:6px}',
      '.fl-rule-new{display:none;padding:9px;border-style:dashed;overflow:visible}',
      '.fl-rule-new.fl-rule-open{display:flex}',
      '.fl-rule-new .fl-rule-editor{padding:0;border-top:0}',
      '.fl-rule-new-title{font-size:calc(12px*var(--tb-fs-detail,1));font-weight:600;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-rule-add{flex:none;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 7px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:6px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font:inherit;font-size:calc(10px*var(--tb-fs-detail,1));cursor:pointer}',
      '.fl-rule-add:hover{border-color:var(--tb-accent-border,rgba(91,141,239,.55));color:var(--tb-active-text,#7fa7f0)}',
      '.fl-rule-add svg{width:13px;height:13px}',
      '.fl-rule-source{display:flex;flex-direction:column;gap:7px;border-top:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));padding-top:8px}',
      '.fl-rule-source>summary{cursor:pointer;user-select:none}',
      '.fl-rule-source[open]>summary{margin-bottom:7px}',
      '.fl-rule-source .tb-textarea{min-height:210px;resize:vertical;margin-bottom:7px}',
      '@media(max-width:620px){.fl-rule-grid{grid-template-columns:minmax(0,1fr)}}',
      // 插件详情页中的 Flowglass 官方配置页（plugins.bundle.config）。
      '.fg-settings{display:flex;flex-direction:column;gap:16px;margin:20px 0 26px;color:var(--dsw-alias-label-primary,#dcdee4);font-family:inherit}',
      '.fg-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
      '.fg-settings-title{margin:0;font-size:16px;line-height:1.4;font-weight:650}',
      '.fg-settings-sub{margin:4px 0 0;color:var(--dsw-alias-label-secondary,#9a9ba6);font-size:12px;line-height:1.6}',
      '.fg-settings-section{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-border-l1,#35363e);border-radius:10px;background:var(--dsw-alias-bg-base,#17181d)}',
      '.fg-settings-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.fg-settings-section h3{margin:0;font-size:14px;font-weight:650}',
      '.fg-settings-note{margin:0;color:var(--dsw-alias-label-secondary,#9a9ba6);font-size:11.5px;line-height:1.6}',
      '.fg-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}',
      '.fg-settings-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:42px}',
      '.fg-settings-copy{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.fg-settings-copy>strong{font-size:12.5px;font-weight:600}',
      '.fg-settings-copy>small{color:var(--dsw-alias-label-tertiary,#777884);font-size:10.5px;line-height:1.45}',
      '.fg-settings-select,.fg-settings-input{width:min(210px,45%);height:30px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2,#454650);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#26272e);color:inherit;font:inherit;font-size:12px;box-sizing:border-box}',
      '.fg-settings-input.is-official{height:auto;padding:0;border:0;background:transparent}',
      '.fg-settings-toggle{position:relative;flex:none;width:36px;height:21px;padding:0;border:1px solid var(--dsw-alias-border-l2,#454650);border-radius:999px;background:var(--dsw-alias-bg-layer-1,#26272e);cursor:pointer}',
      '.fg-settings-toggle>span{position:absolute;left:2px;top:2px;width:15px;height:15px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#777884);transition:transform .15s,background .15s}',
      '.fg-settings-toggle.is-on{border-color:var(--tb-accent,#3f6fd9);background:var(--tb-accent,#3f6fd9)}',
      '.fg-settings-toggle.is-on>span{transform:translateX(15px);background:#fff}',
      '.fg-settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}',
      '.fg-settings-button{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,#454650);border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}',
      '.fg-settings-button:hover{border-color:var(--tb-accent-border,rgba(91,141,239,.55));color:var(--tb-active-text,#7fa7f0)}',
      '.fg-settings-button.primary{border-color:var(--tb-accent,#3f6fd9);background:var(--tb-accent,#3f6fd9);color:#fff}',
      '.fg-settings-button.danger:hover{border-color:#ef5350;color:#f28b82}',
      '.fg-settings-button:disabled{opacity:.45;cursor:not-allowed}',
      '.fg-settings-status{margin-right:auto;font-size:11.5px;color:var(--tb-done-text,#81c784)}',
      '.fg-settings-status.is-error{color:var(--tb-danger-text,#f28b82)}',
      '.fg-settings-rules{display:flex;flex-direction:column;gap:10px}',
      '.fg-settings-rule{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l1,#35363e);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#222329)}',
      '.fg-settings-rule.is-off{opacity:.62}',
      '.fg-settings-rule-head{display:flex;align-items:center;gap:9px}',
      '.fg-settings-rule-head>strong{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fg-settings-rule-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}',
      '.fg-settings-rule-grid label{display:flex;flex-direction:column;gap:4px;min-width:0;color:var(--dsw-alias-label-tertiary,#777884);font-size:10.5px}',
      '.fg-settings-rule-grid .fg-settings-input{width:100%;max-width:none}',
      '.fg-settings-color{width:100%;height:30px;padding:2px;border:1px solid var(--dsw-alias-border-l2,#454650);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#26272e);cursor:pointer}',
      '@media(max-width:760px){.fg-settings-grid{grid-template-columns:minmax(0,1fr)}.fg-settings-rule-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}',
      '.fl-skill-hero{display:flex;align-items:center;gap:7px;padding:8px;border:1px solid var(--tb-accent-border,rgba(91,141,239,.38));border-radius:7px;background:var(--tb-accent-bg,rgba(91,141,239,.08))}',
      '.fl-skill-hero>.fl-tag{color:var(--tb-active-text,#7fa7f0);background:rgba(91,141,239,.13)}',
      '.fl-skill-hero>strong{flex:1;min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:calc(13px*var(--tb-fs-detail,1));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fl-skill-field{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:8px;padding:7px 8px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:7px}',
      '.fl-skill-field>span{font-size:calc(10px*var(--tb-fs-detail,1));font-weight:600;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-skill-field>code{min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:calc(10.5px*var(--tb-fs-detail,1));color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));word-break:break-all}',
      '.fl-skill-instructions{flex:1;min-height:0}',
      '.fl-skill-instructions>.fl-pre,.fl-skill-instructions>.fl-markdown-rendered{flex:1;min-height:180px;max-height:none}',
      '.fl-skill-raw{flex:none;border-top:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));padding-top:7px}',
      '.fl-skill-raw>summary{cursor:pointer;user-select:none;font-size:calc(10.5px*var(--tb-fs-detail,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-skill-raw[open]>summary{margin-bottom:7px}',
      // 详情内容框标题行 + 复制按钮
      '.fl-sec-head{display:flex;align-items:center;gap:6px;min-width:0}',
      '.fl-sec-head .fl-sec-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fl-copy-btn,.fl-md-preview-btn{flex:none;width:22px;height:20px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));background:transparent;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));line-height:1;cursor:pointer;font-family:inherit;transition:color .12s,border-color .12s,background .12s}',
      '.fl-copy-btn:hover,.fl-md-preview-btn:hover{color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));border-color:var(--tb-accent-border,rgba(91,141,239,.45))}',
      '.fl-md-preview-btn[aria-pressed="true"]{color:var(--tb-active-text,#7fa7f0);border-color:var(--tb-accent-border,rgba(91,141,239,.45));background:var(--tb-active-bg,rgba(91,141,239,.12))}',
      '.fl-copy-btn.fl-copied{color:var(--tb-done-text,#81c784);border-color:var(--tb-done-text,#81c784)}',
      '.fl-copy-btn.fl-copy-fail{color:var(--tb-danger-text,#f28b82);border-color:var(--tb-danger-text,#f28b82)}',
      '.fl-branch-pill{flex:none;font-size:calc(9.5px*var(--tb-fs-detail,1));padding:0 5px;border-radius:3px;background:rgba(91,141,239,.12);color:var(--tb-active-text,#7fa7f0);font-weight:600}',
      '.fl-branch-txt{flex:1;min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:calc(11px*var(--tb-fs-detail,1));color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.fl-branch-ai{font-style:italic}',
      // ---- 大流镜 Zoom：超脱单会话的俯视树（根在顶部，会话分支自上而下展开）----
      // 布局：根卡居中 → trunk 竖线 → branches 横排（safe center，超宽横向滚动）；
      // 每个分支列顶部是头卡，下面是该会话的纵向流程（竖轨 + 横挑，最新在底）。
      '.fl-zoom-tree{display:flex;flex-direction:column;align-items:center;align-self:stretch;padding:4px 2px 10px;min-width:0}',
      '@keyframes flZoomFocusIn{from{opacity:.82;transform:scale(.975)}to{opacity:1;transform:scale(1)}}',
      '@keyframes flZoomOverviewIn{from{opacity:.82;transform:scale(1.025)}to{opacity:1;transform:scale(1)}}',
      '.fl-zoom-motion-focus>.tb-pane-body{transform-origin:center top;animation:flZoomFocusIn .16s ease-out}',
      '.fl-zoom-motion-overview>.tb-pane-body{transform-origin:center top;animation:flZoomOverviewIn .16s ease-out}',
      '.fl-zoom-near-flow{align-self:stretch;width:100%;min-width:0;display:flex;flex-direction:column;gap:0}',
      '.fl-zoom-rootcard{position:relative;width:min(340px,92%);display:flex;flex-direction:column;gap:5px;border:1px solid var(--tb-accent-border,rgba(91,141,239,.45));border-radius:10px;padding:8px 12px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer;transition:border-color .12s}',
      '.fl-zoom-rootcard:hover{border-color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c))}',
      '.fl-zoom-rootcard-virtual{border-style:dashed;cursor:default;align-items:center;padding:7px 12px}',
      '.fl-zoom-trunk{flex:none;width:1.5px;height:16px;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));opacity:.55}',
      '.fl-zoom-branches{position:relative;display:flex;gap:14px;align-items:flex-start;justify-content:safe center;align-self:stretch;overflow-x:auto;padding:16px 6px 4px}',
      '.fl-zoom-branch{position:relative;flex:none;width:min(236px,84%);display:flex;flex-direction:column;gap:8px;cursor:pointer;min-width:0}',
      // 分支与总线的连接：::before 竖降线（总线 → 分支头卡），::after 横线段（本分支中心 → 下一分支中心）
      '.fl-zoom-branch::before{content:"";position:absolute;top:-16px;left:50%;width:1.5px;height:16px;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));opacity:.55}',
      // 横线由“前一分支中心 → 当前分支中心”绘制；旧写法只到相邻卡片边缘，会在分支间留下半卡宽断口。
      '.fl-zoom-branch::after{content:"";position:absolute;top:-16px;left:calc(-50% - 14px);right:50%;height:1.5px;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));opacity:.55}',
      '.fl-zoom-branch:first-child::after{display:none}',
      '.fl-zoom-card,.fl-zoom-branch-head{position:relative;display:flex;flex-direction:column;gap:5px;min-width:0;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:10px;padding:8px 11px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));box-shadow:0 2px 8px rgba(0,0,0,.18);transition:border-color .12s}',
      '.fl-zoom-branch:hover .fl-zoom-branch-head{border-color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#6f707c))}',
      '.fl-zoom-head{display:flex;align-items:center;gap:7px;min-width:0}',
      '.fl-zoom-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--tb-text-3,#777884);opacity:.5}',
      '.fl-zoom-dot-online{background:var(--tb-active-text,#7fa7f0);opacity:.9}',
      '.fl-zoom-dot-running{background:var(--tb-done-text,#81c784);opacity:1;animation:flBlink 1.1s ease-in-out infinite}',
      '.fl-zoom-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(12px*var(--tb-fs,1));font-weight:600;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-zoom-id{flex:none;font-family:ui-monospace,Consolas,monospace;font-size:calc(10px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-zoom-badges{display:flex;flex-wrap:wrap;gap:4px}',
      '.fl-zoom-badge{display:inline-flex;align-items:center;height:16px;padding:0 5px;border-radius:4px;font-size:calc(9.5px*var(--tb-fs,1));font-weight:600;background:rgba(138,139,150,.12);color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))}',
      '.fl-zoom-badge-home{background:rgba(91,141,239,.12);color:var(--tb-active-text,#7fa7f0)}',
      '.fl-zoom-badge-cwd{background:rgba(212,167,44,.10);color:#d4b95c}',
      '.fl-zoom-stats{font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      // 分支纵向流程：左竖轨 + 每步横挑（git 树语感），自上而下最新在底
      '.fl-zoom-flow{position:relative;display:flex;flex-direction:column;gap:5px;padding:2px 0 2px 16px}',
      '.fl-zoom-flow::before{content:"";position:absolute;left:6px;top:0;bottom:4px;width:1.5px;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));opacity:.4}',
      '.fl-zoom-step{position:relative;display:flex;align-items:center;gap:6px;min-width:0;min-height:18px}',
      '.fl-zoom-step::before{content:"";position:absolute;left:-10px;top:50%;width:8px;height:1.5px;background:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));opacity:.4}',
      '.fl-zoom-step-txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))}',
      '.fl-zoom-step-ok{flex:none;font-size:calc(10px*var(--tb-fs,1));color:var(--tb-done-text,#81c784)}',
      '.fl-zoom-step-err{flex:none;font-size:calc(10px*var(--tb-fs,1));color:var(--tb-danger-text,#f28b82)}',
      '.fl-zoom-glyph{font-size:calc(10px*var(--tb-fs,1));line-height:1}',
      '.fl-zoom-tool{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 5px;border-radius:3px;font-size:calc(9.5px*var(--tb-fs,1));font-weight:600;line-height:1.5;flex:none}',
      '.fl-zoom-tool-err{color:var(--tb-danger-text,#f28b82)!important;background:rgba(242,139,130,.12)!important}',
      '.fl-zoom-tool-pending{animation:flBlink 1.1s ease-in-out infinite}',
      '.fl-zoom-more{font-size:calc(9.5px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      // 开工台（多代理并发开工/互通）：输入 + 模型分支 select（每条分支一个路由，左→右对应分支列）
      '.fl-zoom-composer{display:flex;flex-direction:column;gap:7px;padding:9px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:12px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));box-shadow:0 2px 10px rgba(0,0,0,.14)}',
      '.fl-zoom-composer-context{display:flex;align-items:center;gap:8px;min-width:0;padding-bottom:7px;border-bottom:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));font-size:calc(10px*var(--tb-fs,1))}',
      '.fl-zoom-composer-context>strong{flex:none;color:var(--tb-active-text,#7fa7f0)}',
      '.fl-zoom-composer-context>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-zoom-composer-targets{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:5px;min-width:0;margin-left:auto;overflow:visible}',
      '.fl-zoom-composer-targets.is-drop-target{outline:2px solid var(--tb-active-text,#7fa7f0);outline-offset:2px;border-radius:7px;background:rgba(91,141,239,.08)}',
      '.fl-zoom-composer-targets .fl-zoom-current-session{min-width:158px;max-width:220px}',
      '.fl-zoom-add-picker{height:27px;padding:0 8px;border:1px dashed var(--tb-accent-border,rgba(91,141,239,.45));border-radius:6px;background:transparent;color:var(--tb-active-text,#7fa7f0);font:inherit;font-size:calc(10px*var(--tb-fs,1));cursor:pointer;white-space:nowrap}',
      '.fl-zoom-add-picker:hover{background:rgba(91,141,239,.1)}',
      '.fl-zoom-add-menu{position:relative;flex:none}',
      '.fl-zoom-add-menu>summary{height:27px;display:inline-flex;align-items:center;padding:0 8px;border:1px dashed var(--tb-accent-border,rgba(91,141,239,.45));border-radius:6px;color:var(--tb-active-text,#7fa7f0);cursor:pointer;list-style:none;white-space:nowrap}',
      '.fl-zoom-add-menu>summary::-webkit-details-marker{display:none}',
      '.fl-zoom-add-pop{position:absolute;right:0;top:32px;z-index:30;width:280px;max-height:300px;display:flex;flex-direction:column;gap:4px;overflow:auto;padding:7px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:9px;background:var(--tb-bg,#17181c);box-shadow:0 10px 28px rgba(0,0,0,.48)}',
      '.fl-zoom-add-pop>button{min-height:31px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 7px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font:inherit;font-size:calc(10px*var(--tb-fs,1));text-align:left;cursor:pointer}',
      '.fl-zoom-add-pop>button:hover{border-color:var(--tb-accent-border,rgba(91,141,239,.45));background:rgba(91,141,239,.09);color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-zoom-add-pop>button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fl-zoom-add-pop>button code{color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-size:inherit}',
      '.fl-zoom-add-pop>.fl-zoom-add-new{display:flex;justify-content:center;border-color:var(--tb-accent-border,rgba(91,141,239,.45));color:var(--tb-active-text,#7fa7f0);font-weight:700}',
      '.fl-zoom-add-pop>small,.fl-zoom-add-empty{padding:4px 6px;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-size:calc(9px*var(--tb-fs,1))}',
      '.fl-zoom-prompt{width:100%;min-height:64px;max-height:160px;resize:vertical;border:1px solid var(--fg-border)!important;border-radius:6px;background:var(--fg-surface)!important;padding:8px 10px!important;line-height:1.5;box-sizing:border-box}',
      '.fl-zoom-prompt:focus{box-shadow:none!important;outline:none!important}',
      '.fl-zoom-composer-controls{display:flex;align-items:center;gap:6px;min-width:0;overflow-x:auto}',
      '.fl-zoom-composer-spacer{flex:1;min-width:10px}',
      '.fl-zoom-target-label{flex:none;font-size:calc(10px*var(--tb-fs,1));font-weight:650;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));white-space:nowrap}',
      '.fl-zoom-count{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:7px}',
      '.fl-zoom-count .tb-chip{min-width:25px;justify-content:center;padding:0 6px}',
      '.fl-zoom-lane-group{flex:none;display:inline-flex;align-items:center;min-width:0}',
      '.fl-zoom-lane{flex:none;height:26px;font-size:calc(11px*var(--tb-fs,1))}',
      '.fl-zoom-lane-model{width:144px;border-radius:6px 0 0 6px}',
      '.fl-zoom-lane-effort{width:92px;margin-left:-1px;border-radius:0 6px 6px 0}',
      '.fl-zoom-logbar{padding-top:2px;border-top:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e))}',
      '.fl-zoom-log-spacer{flex:1}',
      '.fl-zoom-history-drawer{position:absolute;right:0;top:0;bottom:0;z-index:18;width:min(292px,76%);display:flex;flex-direction:column;border-left:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));background:var(--tb-bg,#17181c);color:var(--tb-text,#dcdee4);box-shadow:-8px 0 24px rgba(0,0,0,.42)}',
      '.fl-zoom-history-drawer-head{height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;border-bottom:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));font-size:calc(11px*var(--tb-fs,1))}',
      '.fl-zoom-history-drawer-head button{width:24px;height:24px;border:none;border-radius:5px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));cursor:pointer}',
      // Flowglass 统一玻璃层：弹窗、详情侧栏、历史抽屉、浮动操作条、信息气泡与浮标共享材质，定位/尺寸仍由各组件自己控制。
      // 材质 = 48%→30% 渐变透明底（背后内容真实透出）+ 26px 模糊 + 175% 饱和 + accent 描边 + 分层投影 + 顶缘内高光；主题经 --tb-*/--dsw-* 变量自适应明暗与主色。
      '.tb-flow-bring-popup,.fl-rail,.fl-zoom-history-drawer,.tb-flow-zoom-float,.tb-flow-selection-bar,.fl-info-pop,.fl-zoom-add-pop,.tb-jump-latest,.jr-resize-badge{border-color:color-mix(in srgb,var(--tb-active-text,#7fa7f0) 34%,transparent);background:linear-gradient(145deg,color-mix(in srgb,var(--dsw-alias-bg-overlay,#1e1f24) 48%,rgba(122,162,240,.16)),color-mix(in srgb,var(--dsw-alias-bg-overlay,#1e1f24) 30%,transparent));box-shadow:0 20px 58px rgba(0,0,0,.42),0 6px 20px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.11);backdrop-filter:blur(26px) saturate(175%);-webkit-backdrop-filter:blur(26px) saturate(175%)}',
      // 弹层顶缘受光高光线（通高侧栏与 pill 浮标不加，避免横穿直边/小圆角显突兀）
      '.tb-flow-bring-popup::before,.fl-info-pop::before,.fl-zoom-add-pop::before{content:"";position:absolute;left:9%;right:9%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(151,184,248,.6),transparent);pointer-events:none}',
      '.fl-zoom-add-menu[open] .fl-zoom-add-pop{animation:jrDrawerUp .14s ease-out}',
      '.tb-flow-bring-popup .tb-flow-popup-head,.fl-rail-head,.fl-zoom-history-drawer-head{border-bottom-color:rgba(255,255,255,.08)}',
      '.tb-flow-bring-popup .tb-flow-tree-workspace,.tb-flow-bring-popup .tb-flow-tree-session{transition:background .14s ease,border-color .14s ease,transform .14s ease}',
      '.tb-flow-bring-popup .tb-flow-tree-workspace:hover,.tb-flow-bring-popup .tb-flow-tree-session:hover{background:color-mix(in srgb,var(--tb-active-text,#7fa7f0) 11%,transparent);transform:translateX(1px)}',
      '.fl-zoom-history-tree{flex:1;overflow:auto;padding:7px}',
      '.fl-history-node{margin-bottom:5px;border-radius:7px}',
      '.fl-history-node.is-active{background:rgba(91,141,239,.07)}',
      '.fl-history-run-line{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center}',
      '.fl-history-toggle{width:24px;height:26px;border:none;border-radius:5px;background:transparent;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font:inherit;cursor:pointer}',
      '.fl-history-toggle:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-history-run,.fl-history-round,.fl-history-session{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;border:none;border-radius:6px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font:inherit;cursor:pointer;text-align:left}',
      '.fl-history-run{min-height:30px;padding:4px 7px;font-size:calc(10.5px*var(--tb-fs,1));font-weight:650}',
      '.fl-history-round{min-height:27px;padding:3px 8px 3px 18px;font-size:calc(10px*var(--tb-fs,1));font-weight:600}',
      '.fl-history-round-node.is-active>.fl-history-round{background:rgba(91,141,239,.11);color:var(--tb-active-text,#7fa7f0)}',
      '.fl-history-session{min-height:24px;padding:3px 8px 3px 34px;font-size:calc(9.8px*var(--tb-fs,1))}',
      '.fl-history-run:hover,.fl-history-round:hover,.fl-history-session:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-history-session code{font-size:inherit;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-zoom-current-conversations{display:flex;align-items:center;gap:5px;overflow-x:auto;padding:5px 7px;border:1px solid var(--tb-accent-border,rgba(91,141,239,.45));border-radius:8px;background:rgba(91,141,239,.055)}',
      '.fl-zoom-current-conversations>strong{flex:none;font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-active-text,#7fa7f0)}',
      '.fl-zoom-current-item{position:relative;display:inline-flex;align-items:center;flex:none}',
      '.fl-zoom-current-item .fl-zoom-current-session{padding-right:26px}',
      '.fl-zoom-current-session{flex:none;display:grid;grid-template-columns:auto minmax(80px,1fr) auto;align-items:center;gap:6px;min-width:180px;max-width:270px;height:27px;padding:0 7px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:6px;background:transparent;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font:inherit;font-size:calc(10px*var(--tb-fs,1));cursor:pointer;text-align:left}',
      '.fl-zoom-current-session:hover,.fl-zoom-current-session.is-active{border-color:var(--tb-accent-border,rgba(91,141,239,.45));background:rgba(91,141,239,.08);color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-zoom-current-session span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fl-zoom-current-session code{font-size:inherit;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-zoom-current-remove{width:20px;height:20px;margin-left:-24px;z-index:1;border:none;border-radius:4px;background:transparent;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));cursor:pointer}',
      '.fl-zoom-current-remove:hover{background:rgba(242,139,130,.13);color:var(--tb-danger-text,#f28b82)}',
      '.fl-zoom-diff-scroll{align-self:stretch;overflow-x:auto;overflow-y:visible;padding:2px 2px 12px}',
      '.fl-zoom-diff-board{display:grid;align-items:stretch;width:max-content;min-width:max-content;margin-inline:auto;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:9px;overflow:clip;background:var(--tb-bg,var(--dsw-alias-bg-base,#17181c))}',
      '.fl-diff-corner,.fl-diff-session-head{position:sticky;top:0;z-index:4;min-height:58px;padding:7px 9px;border-bottom:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e))}',
      '.fl-diff-corner{left:0;z-index:5;display:flex;align-items:center;justify-content:center;font-size:calc(10px*var(--tb-fs,1));font-weight:700;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-diff-session-head{cursor:pointer;border-left:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e))}',
      '.fl-diff-session-head:hover{background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#31323b))}',
      '.fl-diff-session-label{display:inline-flex;margin-bottom:5px;padding:1px 6px;border-radius:999px;background:rgba(91,141,239,.13);color:var(--tb-active-text,#7fa7f0);font-size:calc(9.5px*var(--tb-fs,1));font-weight:750}',
      '.fl-diff-gutter{position:sticky;left:0;z-index:2;display:flex;flex-direction:column;gap:3px;padding:10px 7px;border-top:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));font-size:calc(10px*var(--tb-fs,1))}',
      '.fl-diff-gutter strong{font-size:calc(11px*var(--tb-fs,1));color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4))}',
      '.fl-diff-gutter small{display:flex;flex-direction:column;gap:2px;line-height:1.35;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-diff-dim{display:inline-flex;gap:4px;white-space:pre}',
      '.fl-diff-dim-same{color:var(--tb-done-text,#81c784)}',
      '.fl-diff-dim-change{color:#e6b94b;font-weight:700}',
      '.fl-diff-dim-missing{color:var(--tb-danger-text,#f28b82);font-weight:700}',
      '.fl-diff-round-fork{margin-top:5px;min-height:24px;padding:2px 5px;border:1px solid var(--tb-accent-border,rgba(91,141,239,.45));border-radius:5px;background:rgba(91,141,239,.08);color:var(--tb-active-text,#7fa7f0);font:inherit;font-size:calc(9.5px*var(--tb-fs,1));cursor:pointer}',
      '.fl-diff-same{box-shadow:inset 3px 0 var(--tb-done-text,#81c784)}',
      '.fl-diff-change{box-shadow:inset 3px 0 #d4b95c}',
      '.fl-diff-missing{box-shadow:inset 3px 0 var(--tb-danger-text,#f28b82)}',
      '.fl-diff-cell{position:relative;min-height:90px;padding:9px 10px 12px;border-top:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-left:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));background:rgba(128,128,128,.025)}',
      '.fl-diff-cell-same{background:rgba(129,199,132,.035)}',
      '.fl-diff-cell-base{background:rgba(91,141,239,.045)}',
      '.fl-diff-cell-change{background:rgba(212,167,44,.075)}',
      '.fl-diff-cell-missing{display:flex;align-items:center;justify-content:center;background:rgba(242,139,130,.055);color:var(--tb-danger-text,#f28b82)}',
      '.fl-diff-cell-head{display:flex;align-items:center;gap:6px;min-height:22px;margin-bottom:7px;font-size:calc(10px*var(--tb-fs,1));color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884))}',
      '.fl-diff-mark{width:14px;font-family:ui-monospace,Consolas,monospace;font-weight:800;text-align:center}',
      '.fl-diff-branch{margin-left:auto;min-height:23px;padding:2px 7px;border:1px solid var(--tb-accent-border,rgba(91,141,239,.45));border-radius:5px;background:rgba(91,141,239,.07);color:var(--tb-active-text,#7fa7f0);font:inherit;font-size:calc(9.5px*var(--tb-fs,1));font-weight:650;cursor:pointer;white-space:nowrap}',
      '.fl-diff-branch:hover{background:rgba(91,141,239,.12);border-color:var(--tb-accent-border,rgba(91,141,239,.45))}',
      '[data-flow-view="map"]>.tb-pane-body{flex-direction:column;justify-content:flex-start;gap:0;overflow:hidden;padding-right:0}',
      '[data-flow-view="map"]>.tb-pane-body>.fl-mindmap-wrap{zoom:1;flex:1;min-height:0;height:100%}',
      '.fl-mindmap-wrap{align-self:stretch;display:flex;flex-direction:column;gap:7px;min-width:0}',
      '.fl-mindmap-help{display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:8px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));font-size:calc(10px*var(--tb-fs,1));color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))}',
      '.fl-mindmap-help strong{color:var(--tb-active-text,#7fa7f0)}',
      '.fl-mindmap-help span{flex:1}',
      '.fl-mindmap-help button{flex:none;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:5px;background:transparent;color:inherit;font:inherit;cursor:pointer}',
      '.fl-mindmap-viewport{position:relative;flex:1;min-height:0;overflow:auto;border:1px solid var(--tb-border,var(--dsw-alias-border-l1,#35363e));border-radius:10px;background-color:var(--tb-bg,var(--dsw-alias-bg-base,#17181c));background-image:radial-gradient(circle,rgba(127,128,140,.22) 1px,transparent 1px);background-size:20px 20px;cursor:grab;touch-action:none}',
      '.fl-mindmap-viewport.is-panning{cursor:grabbing}',
      '.fl-mindmap-canvas{position:relative;min-width:100%;min-height:100%}',
      '.fl-mindmap-edges{position:absolute;inset:0;pointer-events:none;overflow:visible}',
      '.fl-mindmap-edges path{fill:none;stroke:var(--tb-accent-border,rgba(91,141,239,.45));stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.fl-map-turn-label{position:absolute;z-index:3;width:76px;display:flex;align-items:center;gap:5px;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-size:calc(9.5px*var(--tb-fs,1));pointer-events:none}',
      '.fl-map-turn-label span{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border:1px solid var(--tb-accent-border,rgba(91,141,239,.45));border-radius:50%;background:var(--tb-bg,var(--dsw-alias-bg-base,#17181c));color:var(--tb-active-text,#7fa7f0);font-weight:800}',
      '.fl-map-turn-label strong{white-space:nowrap}',
      '.fl-map-node{position:absolute;z-index:2;min-height:126px;display:flex;flex-direction:column;gap:7px;padding:9px;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:10px;background:var(--tb-card-bg,var(--dsw-alias-bg-layer-1,#26272e));box-shadow:0 5px 16px rgba(0,0,0,.22);cursor:move;user-select:none}',
      '.fl-map-node:hover{border-color:var(--tb-accent-border,rgba(91,141,239,.45));box-shadow:0 7px 20px rgba(0,0,0,.3)}',
      '.fl-map-node header{display:flex;align-items:center;justify-content:space-between;color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-size:calc(10.5px*var(--tb-fs,1))}',
      '.fl-map-node header span{color:var(--tb-active-text,#7fa7f0);font-weight:700}',
      '.fl-map-node p{flex:1;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font-size:calc(10px*var(--tb-fs,1));line-height:1.45}',
      '.fl-map-root{min-height:84px;justify-content:center;border-color:var(--tb-accent-border,rgba(91,141,239,.45));background:rgba(91,141,239,.1)}',
      '.fl-map-root strong{color:var(--tb-text,var(--dsw-alias-label-primary,#dcdee4));font-size:calc(11px*var(--tb-fs,1))}',
      '.fl-map-root span{color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6));font-size:calc(10px*var(--tb-fs,1))}',
      '.fl-map-branch{align-self:stretch;min-height:25px;border:1px solid var(--tb-accent-border,rgba(91,141,239,.45));border-radius:6px;background:rgba(91,141,239,.11);color:var(--tb-active-text,#7fa7f0);font:inherit;font-size:calc(10px*var(--tb-fs,1));font-weight:700;cursor:pointer}',
      '.fl-map-branch:hover{background:rgba(91,141,239,.2)}',
      '.fl-turn-cell-flow{display:flex;flex-direction:column;gap:0;min-width:0}',
      '.fl-compact-diff{display:flex;flex-direction:column;gap:6px;padding:2px 0}',
      '.fl-compact-diff>div{display:grid;grid-template-columns:16px minmax(0,1fr);gap:5px;align-items:start;font-size:calc(10.5px*var(--tb-fs,1));color:var(--tb-text-2,var(--dsw-alias-label-secondary,#9a9ba6))}',
      '.fl-compact-diff span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.fl-flow-two .fl-lane>div:first-child:empty,.fl-flow-two .fl-lane>div:last-child:empty{display:none}',
      '.fl-flow-two .fl-lane{grid-template-columns:minmax(180px,1fr) minmax(220px,1.2fr)}',
      '.fl-flow-two .fl-lane:has(>div:last-child:empty)>.fl-lane-main{grid-column:1/-1}',
      '.fl-zoom-badge-model{background:rgba(129,199,132,.14);color:var(--tb-done-text,#81c784);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      // 卡头 ⇪ 带入按钮（把该会话最新结论带入其他会话）
      '.fl-zoom-relay{flex:none;width:20px;height:18px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));border-radius:4px;background:transparent;color:var(--tb-text-3,var(--dsw-alias-label-tertiary,#777884));font-size:calc(11px*var(--tb-fs,1));line-height:1;cursor:pointer;font-family:inherit;opacity:0;transition:opacity .12s,color .12s,border-color .12s}',
      '.fl-zoom-branch:hover .fl-zoom-relay,.fl-zoom-rootcard:hover .fl-zoom-relay,.fl-zoom-picking .fl-zoom-relay{opacity:1}',
      '.fl-zoom-relay:hover{color:var(--tb-active-text,#7fa7f0);border-color:var(--tb-accent-border,rgba(91,141,239,.45))}',
      // 点选模式：分支/根卡变成可选目标（选中描边落在头卡上，与框选 fl-select-picked 同族）
      '.fl-zoom-picking .fl-zoom-branch:hover .fl-zoom-branch-head,.fl-zoom-picking .fl-zoom-rootcard:hover{border-color:var(--tb-accent-border,rgba(91,141,239,.45))}',
      '.fl-zoom-branch.fl-zoom-picked .fl-zoom-branch-head,.fl-zoom-card.fl-zoom-picked{border-color:var(--tb-accent,#3f6fd9);outline:2px solid var(--tb-accent,#3f6fd9);outline-offset:1px;box-shadow:0 0 0 4px var(--tb-accent-ring,rgba(91,141,239,.16))}',
      '.fl-zoom-badge-fleet{background:rgba(91,141,239,.12);color:var(--tb-active-text,#7fa7f0)}',
      // 操作条带入源标签
      '.tb-flow-zoom-relay-src{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;font-size:calc(10.5px*var(--tb-fs,1));font-weight:600;background:rgba(91,141,239,.12);color:var(--tb-active-text,#7fa7f0);white-space:nowrap}',
      // Flowglass UI: domain tokens and container queries stay inside the flow surface.
      // The shared Toolbox palette and other tools keep their existing presentation.
      '.tb-frame:has([data-flow]),[data-flow],.fg-settings{--fg-canvas:var(--dsw-alias-bg-base,#17181d);--fg-surface:var(--dsw-alias-bg-layer-1,#26272e);--fg-raised:var(--dsw-alias-bg-layer-2,#31323b);--fg-text:var(--dsw-alias-label-primary,#dcdee4);--fg-muted:var(--dsw-alias-label-secondary,#a5a7b2);--fg-subtle:var(--dsw-alias-label-tertiary,#858793);--fg-border:var(--dsw-alias-border-l2,#454650);--fg-accent:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#7fa7f0));--fg-success:var(--dsw-alias-state-success-primary,#81c784);--fg-warning:var(--dsw-alias-state-warn-primary,#d4b95c);--fg-danger:var(--dsw-alias-state-error-primary,#f28b82);--fg-wire:color-mix(in srgb,var(--fg-muted) 32%,transparent);--fg-selected:color-mix(in srgb,var(--fg-accent) 9%,var(--fg-surface));--fg-font-size:calc(var(--dsh-content-font-size,14px)*var(--tb-fs,1));--fg-inspector-width:clamp(320px,var(--fl-rail-w,360px),400px)}',
      '.tb-frame:has([data-flow]),.tb-frame:has([data-flow])>.tb-panel-html{min-width:0;max-width:100%}',
      '[data-flow]{container:flowglass/inline-size;min-width:0;max-width:100%;gap:12px;color:var(--fg-text);font-family:var(--dsw-font-family,inherit);font-size:var(--fg-font-size);line-height:1.5}',
      '[data-flow] *,[data-flow] *::before,[data-flow] *::after{box-sizing:border-box}',
      '[data-flow]>.tb-pane-head{gap:9px;padding:2px 2px 10px;border-bottom:1px solid var(--fg-border)}',
      '.jr-drawer [data-flow]>.tb-pane-body{background:var(--fg-canvas);background-image:none;gap:8px;padding:4px 4px 54px;overflow-x:hidden;scroll-padding:12px}',
      '[data-flow]>.tb-pane-head .tb-row{flex-wrap:wrap;gap:7px;min-width:0}',
      '[data-flow] :is(.tb-chip,.tb-btn-sm,.tb-select){min-height:28px;height:auto;font-size:calc(var(--fg-font-size)*.82);line-height:1.4}',
      '[data-flow] :is(.tb-chip,.tb-btn,.tb-select,.tb-input){color:var(--fg-muted);border-color:var(--fg-border);font-family:inherit}',
      '[data-flow] :is(.tb-chip-on,.tb-btn-primary){color:var(--fg-accent);border-color:var(--fg-accent);background:var(--fg-selected)}',
      '[data-flow] :is(.tb-note,.tb-sec-label){font-size:.8em;color:var(--fg-muted)}',
      '[data-flow] :is(button,summary,a,input,select,textarea,[role="button"],[tabindex]):focus-visible,.fg-settings :is(button,input,select,summary):focus-visible{outline:2px solid var(--fg-accent)!important;outline-offset:3px;border-radius:5px}',
      '[data-flow] :is(button,[role="button"]){touch-action:manipulation}',
      '[data-flow] :is(button,[role="button"]):disabled{opacity:.5;cursor:not-allowed}',
      '[data-flow] .fl-context-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0}',
      '[data-flow] .fl-breadcrumbs{display:flex;align-items:center;flex-wrap:wrap;gap:5px;min-width:0;font-size:.88em;color:var(--fg-muted)}',
      '[data-flow] .fl-breadcrumbs button{max-width:100%;height:auto;min-height:28px;white-space:normal;overflow-wrap:anywhere}',
      '[data-flow] .fl-session-title{min-width:0;flex:1 1 100%;font-size:1em;font-weight:650;color:var(--fg-text);overflow-wrap:anywhere;white-space:normal}',
      '[data-flow] :is(.fl-execution-status,.fl-sync-status){font-size:.8em;color:var(--fg-muted);overflow-wrap:anywhere}',
      '[data-flow] .fl-sync-status.is-paused{color:var(--fg-warning)}',
      '[data-flow] .fl-toolbar-more{position:relative;margin-left:auto;font-size:.85em}',
      '[data-flow] .fl-toolbar-more>summary{display:flex;align-items:center;justify-content:center;min-height:28px;padding:3px 9px;border:1px solid var(--fg-border);border-radius:6px;cursor:pointer;list-style:none;color:var(--fg-muted)}',
      '[data-flow] .fl-toolbar-more>summary::-webkit-details-marker{display:none}',
      '[data-flow] .fl-toolbar-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;display:flex;flex-direction:column;align-items:stretch;gap:5px;width:260px;max-width:calc(100cqi - 16px);padding:10px;background:var(--fg-surface);border:1px solid var(--fg-border);border-radius:9px;box-shadow:0 8px 26px rgba(0,0,0,.18)}',
      '[data-flow] .fl-toolbar-menu :is(button,label){min-height:32px;text-align:left;white-space:normal;overflow-wrap:anywhere}',
      '[data-flow] .fl-toolbar-menu .fl-info{margin-left:0;width:auto;max-width:100%;height:auto;min-height:28px}',
      '[data-flow] .fl-toolbar-menu .fl-info-pop{right:0;width:100%;max-height:50vh;overflow:auto}',
      '[data-flow] :is(.fl-node,.fl-iocard,.fl-sub-card,.fl-zoom-card,.fl-zoom-branch-head,.fl-map-node){border-color:var(--fg-border);background:var(--fg-surface);box-shadow:none;color:var(--fg-text);border-radius:8px}',
      '[data-flow] :is(.fl-node,.fl-iocard){padding:10px 12px;gap:6px}',
      '[data-flow] .fl-node[data-flow-role="ai"]{padding-right:36px}',
      '[data-flow] :is(.fl-node.fl-on,.fl-iocard.fl-on){border-color:var(--fg-accent);background:var(--fg-selected);box-shadow:0 0 0 1px var(--fg-accent)}',
      '[data-flow] .fl-node-open{display:flex;flex-direction:column;gap:6px;min-width:0;width:100%;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '[data-flow] button.fl-iocard{font:inherit;text-align:left;width:100%;appearance:none}',
      '[data-flow] :is(.fl-node-head,.fl-iohead){flex-wrap:wrap;gap:5px 8px;min-width:0}',
      '[data-flow] .fl-preview{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;max-width:none;white-space:normal;overflow-wrap:anywhere;word-break:normal;font-size:.92em;line-height:1.6;color:var(--fg-text)}',
      '[data-flow] :is(.fl-name,.fl-zoom-title){font-family:inherit;font-size:.92em;color:var(--fg-text);white-space:normal;overflow-wrap:anywhere}',
      '[data-flow] :is(.fl-args,.fl-sub-io,.fl-wl-txt,.fl-model,.fl-pre){font-family:var(--ds-font-family-code,ui-monospace),monospace}',
      '[data-flow] :is(.fl-tag,.fl-status,.fl-time,.fl-model,.fl-retry,.fl-zoom-stats,.fl-zoom-badge){height:auto;min-height:1.5em;font-size:.76em;line-height:1.5;letter-spacing:0}',
      '[data-flow] :is(.fl-time,.fl-model,.fl-zoom-stats){color:var(--fg-subtle);background:transparent}',
      '[data-flow] .fl-node-head .fl-tag{background:transparent}',
      '[data-flow] .fl-iohead>.fl-tag{color:var(--fg-text)!important;background:var(--fg-raised)!important;border-inline-start:2px solid var(--fg-tool-color,var(--fg-accent))}',
      '[data-flow] .fl-status{color:var(--fg-muted)!important}',
      '[data-flow] .fl-err .fl-status{color:var(--fg-danger)!important}',
      '[data-flow] .fl-live .fl-status{color:var(--fg-accent)!important}',
      '[data-flow] :is(.fl-args,.fl-sub-io){font-size:.8em;white-space:normal;overflow-wrap:anywhere}',
      '[data-flow] .fl-branch-btn{opacity:.75;pointer-events:auto;transform:none;min-width:26px;min-height:26px;background:var(--fg-surface)}',
      '[data-flow] .fl-branch-btn:hover{opacity:1}',
      '[data-flow] button.fl-icon-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;min-height:28px;padding:4px;line-height:1}[data-flow] .fl-icon-button svg{display:block;flex:none;width:16px;height:16px}[data-flow] .fl-icon-button.is-bookmarked svg{fill:var(--fg-selected)}',
      '[data-flow] .fl-zoom-relay{opacity:.75}',
      '[data-flow] :is(.fl-zoom-branch,.fl-zoom-rootcard):focus-within .fl-zoom-relay{opacity:1}',
      '[data-flow] .fl-system-context{min-width:0;padding:5px 8px;border-left:2px solid var(--fg-border);border-radius:4px;color:var(--fg-muted)}',
      '[data-flow] .fl-system-context>summary{font-size:.8em;cursor:pointer;overflow-wrap:anywhere;padding:3px 0}',
      '[data-flow] .fl-system-context[open]>summary{margin-bottom:7px}',
      '[data-flow] .fl-system-context .fl-node{background:var(--fg-canvas);border-left-width:1px}',
      '[data-flow] :is(.fl-lane-main::before,.fl-lane-line,.fl-zoom-trunk,.fl-zoom-branch::before,.fl-zoom-branch::after,.fl-zoom-flow::before,.fl-zoom-step::before){background:var(--fg-wire);opacity:1}',
      '[data-flow] .fl-lane-main::before{width:1px;left:50%;bottom:-8px}',
      '[data-flow] .fl-lane-line{width:1px}',
      '[data-flow] :is(.fl-grp,.fl-subgrp){border-color:var(--fg-border)}',
      '[data-flow] :is(.fl-retry-ok,.fl-zoom-step-ok){color:var(--fg-success)}',
      '[data-flow] .fl-retry-wait{color:var(--fg-warning)}',
      '[data-flow] :is(.fl-retry-fail,.fl-zoom-step-err){color:var(--fg-danger)}',
      '[data-flow] .fl-iocard.fl-err{border-color:var(--fg-danger)}',
      '[data-flow] .fl-live{border-color:var(--fg-accent)!important;animation:none}',
      '[data-flow] :is(.fl-live,.fl-main-min-anim)::before,[data-flow] .fl-min-anim .fl-iocard::before{display:none}',
      '[data-flow] :is(.fl-rail,.fl-zoom-history-drawer,.fl-info-pop,.fl-zoom-add-pop){background:var(--fg-surface);border-color:var(--fg-border);box-shadow:0 8px 26px rgba(0,0,0,.18);backdrop-filter:none;-webkit-backdrop-filter:none}',
      '[data-flow] .fl-rail{width:min(var(--fg-inspector-width),92%);border-radius:8px;z-index:20;max-width:100%;color:var(--fg-text)}',
      '[data-flow] .fl-rail-head{min-height:48px;gap:7px;padding:10px 12px;flex-wrap:wrap;border-bottom-color:var(--fg-border);font-size:.92em}',
      '[data-flow] .fl-rail-title{font-family:inherit;white-space:normal;overflow-wrap:anywhere;line-height:1.4}',
      '[data-flow] .fl-rail-back{flex:none;width:auto;min-height:28px;padding:3px 7px;border:1px solid var(--fg-border);border-radius:6px;background:transparent;color:var(--fg-muted);font:inherit;font-size:.85em;white-space:nowrap;cursor:pointer}',
      '[data-flow] .fl-rail-body{padding:12px;gap:12px;overscroll-behavior:contain;min-width:0}',
      '[data-flow] .fl-rail-body>.fl-sec{flex:1;min-height:180px}',
      '[data-flow] .fl-rail-body>.fl-sec>:is(.fl-pre,.fl-markdown-rendered){flex:1;min-height:0;max-height:none}',
      '[data-flow] .fl-rail-body>:is(.fl-tool-input,.fl-technical-info,.fl-detail-status){flex:none}',
      '[data-flow] .fl-rail-body.fl-tool-io{display:grid;grid-template-rows:auto minmax(0,2fr) minmax(0,3fr) auto;overflow:hidden}',
      '[data-flow] .fl-tool-io:has(>.fl-tool-input:not([open])){grid-template-rows:auto auto minmax(0,1fr) auto}',
      '[data-flow] .fl-tool-io>.fl-tool-input{min-height:0;overflow:auto}[data-flow] .fl-tool-io>.fl-tool-input .fl-pre{max-height:none}',
      '[data-flow] .fl-tool-io>.fl-sec{min-height:0;overflow:hidden}[data-flow] .fl-tool-io>.fl-technical-info{max-height:20vh;overflow:auto}',
      '[data-flow] .fl-sec{min-width:0;gap:6px}',
      '[data-flow] :is(.fl-pre,.fl-markdown-rendered){min-width:0;max-width:100%;padding:10px 12px;border-color:var(--fg-border);background:var(--fg-canvas);color:var(--fg-text);font-size:calc(var(--fg-font-size)*var(--tb-fs-detail,1));line-height:1.65;overflow-wrap:anywhere;word-break:normal}',
      '[data-flow] .fl-pre{white-space:pre-wrap}',
      '[data-flow] .fl-markdown-rendered :is(pre,table){max-width:100%;overflow:auto}',
      '[data-flow] :is(.fl-sec-label,.fl-technical-info>summary){font-size:.8em;line-height:1.5;color:var(--fg-muted);letter-spacing:0}',
      '[data-flow] .fl-technical-info{min-width:0;max-width:100%;padding-top:8px;border-top:1px solid var(--fg-border)}',
      '[data-flow] .fl-technical-info>summary{padding:4px 0;cursor:pointer}',
      '[data-flow] .fl-technical-info[open]>summary{margin-bottom:8px}',
      '[data-flow] :is(.fl-query-bar,.fl-replay-bar){min-width:0;border:1px solid var(--fg-border);border-radius:7px;background:var(--fg-canvas)}',
      '[data-flow] :is(.fl-query-bar,.fl-replay-bar)>summary{min-height:30px;padding:5px 9px;color:var(--fg-muted);font-size:.82em;cursor:pointer}',
      '[data-flow] :is(.fl-query-bar,.fl-replay-bar)[open]>summary{border-bottom:1px solid var(--fg-border)}',
      '[data-flow] .fl-filter-row{display:flex;align-items:flex-end;flex-wrap:wrap;gap:8px;padding:10px;min-width:0}',
      '[data-flow] .fl-filter-row>label{display:flex;flex:1 1 110px;flex-direction:column;gap:4px;min-width:0;color:var(--fg-muted);font-size:.78em}',
      '[data-flow] .fl-filter-row>label:first-child{flex-basis:180px}',
      '[data-flow] .fl-filter-row :is(input,select){width:100%;min-width:0;max-width:100%;height:auto;min-height:30px;background:var(--fg-surface);font-size:var(--fg-font-size)}',
      '[data-flow] :is(.fl-search-summary,.fl-replay-bar>.tb-note){margin:0;padding:0 10px 10px;color:var(--fg-subtle);font-size:.78em;line-height:1.5;overflow-wrap:anywhere}',
      '[data-flow] .fl-attention{align-self:flex-start;border-color:var(--fg-danger);color:var(--fg-danger);background:color-mix(in srgb,var(--fg-danger) 6%,var(--fg-surface));white-space:normal}',
      '[data-flow] .fl-unavailable{padding:9px 11px;border-left:2px solid var(--fg-warning);background:var(--fg-raised)}',
      '[data-flow] .fl-bookmark-btn{flex:none;min-height:26px;padding:2px 6px;border:1px solid transparent;border-radius:5px;background:var(--fg-surface);color:var(--fg-muted);font:inherit;font-size:calc(var(--fg-font-size)*.74);line-height:1.5;cursor:pointer}',
      '[data-flow] .fl-bookmark-btn:hover,[data-flow] .fl-bookmark-btn.is-bookmarked{color:var(--fg-accent);border-color:var(--fg-border);background:var(--fg-selected)}',
      '[data-flow] .fl-node>.fl-bookmark-btn{position:absolute;top:5px;right:6px;opacity:0;pointer-events:none}',
      '[data-flow] .fl-node[data-flow-role="ai"]{padding-right:12px}',
      '[data-flow] .fl-node[data-flow-role="ai"]>.fl-bookmark-btn{right:36px}',
      '[data-flow] .fl-node-head{padding-right:46px}',
      '[data-flow] .fl-node[data-flow-role="ai"] .fl-node-head{padding-right:76px}',
      '[data-flow] .fl-node:is(:hover,:focus-within)>.fl-bookmark-btn,[data-flow] .fl-node>.fl-bookmark-btn.is-bookmarked{opacity:1;pointer-events:auto}',
      '[data-flow] .fl-overview-list{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-self:stretch;min-width:0}',
      '.jr-drawer [data-flow][data-flow-board][data-flow-view="compact"]>.tb-pane-body{flex-direction:column;justify-content:flex-start}',
      '[data-flow] .fl-overview-source{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;min-width:0;padding:8px 10px;border-bottom:1px solid var(--fg-border);color:var(--fg-muted);font-size:.84em}',
      '[data-flow] .fl-overview-source>span{flex:1;min-width:100px;overflow-wrap:anywhere}',
      '[data-flow] .fl-overview-source>button{flex:none}',
      '[data-flow] .fl-overview-card{display:flex;flex-direction:column;gap:9px;min-width:0;padding:14px;border:1px solid var(--fg-border);border-radius:9px;background:var(--fg-surface)}',
      '[data-flow] .fl-overview-card.has-errors{border-left:3px solid var(--fg-danger)}',
      '[data-flow] .fl-overview-card>.fl-diff-session-label{align-self:flex-start;margin-bottom:0;font-size:.78em;background:var(--fg-selected);color:var(--fg-accent)}',
      '[data-flow] .fl-overview-card :is(.fl-zoom-title,.fl-current-step){white-space:normal;overflow-wrap:anywhere}',
      '[data-flow] .fl-current-step{margin:0;color:var(--fg-muted);font-size:.85em;line-height:1.6}',
      '[data-flow] .fl-detail-error{margin:0;padding:8px;border-left:2px solid var(--fg-danger);border-radius:4px;background:color-mix(in srgb,var(--fg-danger) 7%,var(--fg-surface));color:var(--fg-danger);font-size:.86em;line-height:1.6;overflow-wrap:anywhere}',
      '[data-flow] .fl-overview-conclusion{flex:1;min-width:0;padding-top:8px;border-top:1px solid var(--fg-border)}',
      '[data-flow] .fl-overview-conclusion p{margin:6px 0 0;color:var(--fg-text);font-size:.94em;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}',
      '[data-flow] .fl-overview-actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;min-width:0;padding-top:3px}',
      '[data-flow] .fl-conclusion-select{display:inline-flex;align-items:center;gap:6px;min-height:28px;color:var(--fg-muted);font-size:.82em;cursor:pointer}',
      '[data-flow] .fl-conclusion-select input{width:16px;height:16px;margin:0;accent-color:var(--fg-accent)}',
      '[data-flow] .fl-diff-shared-input{min-width:0;padding:12px;border-top:1px solid var(--fg-border);background:var(--fg-canvas)}',
      '[data-flow] .fl-diff-shared-input p{margin:6px 0 0;color:var(--fg-muted);font-size:.86em;line-height:1.6;overflow-wrap:anywhere;white-space:pre-wrap}',
      '@container flowglass (min-width:800px){[data-flow] .fl-overview-list{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@container flowglass (min-width:1200px){[data-flow] .fl-overview-list{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}}',
      '[data-flow] .fl-zoom-composer{box-shadow:none;border-color:var(--fg-border);background:var(--fg-surface);max-height:45cqh;overflow:auto}',
      '[data-flow] .fl-zoom-composer-controls{flex-wrap:wrap;overflow:visible}',
      '[data-flow] .fl-zoom-composer-context{flex-wrap:wrap}',
      '[data-flow] .fl-zoom-composer-context>span{white-space:normal;overflow-wrap:anywhere}',
      '[data-flow] .fl-zoom-composer-targets{justify-content:flex-start;margin-left:0}',
      '[data-flow] .fl-zoom-lane-group{max-width:100%;flex:1 1 220px}',
      '[data-flow] .fl-zoom-lane-model{width:auto;min-width:0;flex:1}',
      '[data-flow] .fl-zoom-lane-effort{width:98px;max-width:45%}',
      '[data-flow] .fl-zoom-prompt:focus-visible{outline:2px solid var(--fg-accent)!important;outline-offset:2px}',
      '[data-flow] .fl-zoom-logbar{border-top:0;padding-top:0}',
      '[data-flow] .fl-zoom-log-spacer{display:none}',
      '[data-flow] .fl-zoom-step-txt{font-size:.85em;white-space:normal;overflow-wrap:anywhere;line-height:1.5}',
      '[data-flow] .fl-zoom-current-conversations{flex-wrap:wrap;overflow:visible;border-color:var(--fg-border);background:var(--fg-canvas)}',
      '[data-flow] .fl-zoom-current-session{min-width:0;max-width:100%;height:auto;min-height:30px}',
      '[data-flow] .fl-compact-diff span{white-space:normal;overflow-wrap:anywhere}',
      '[data-flow] :is(.tb-empty,.tb-notice){max-width:100%;font-size:.9em;line-height:1.7;overflow-wrap:anywhere;color:var(--fg-muted)}',
      '[data-flow] .tb-empty{border-style:solid;border-color:var(--fg-border);padding:30px 18px}',
      '[data-flow] .fl-mindmap-help{flex-wrap:wrap;font-size:.8em;background:var(--fg-surface);border-color:var(--fg-border)}',
      '[data-flow] .fl-mindmap-help span{flex-basis:180px;overflow-wrap:anywhere}',
      '.jr-drawer [data-flow][data-flow-view="map"]>.tb-pane-body{padding:0;overflow:hidden}',
      '[data-flow] .fl-mindmap-viewport{background-color:var(--fg-canvas);border-color:var(--fg-border)}',
      '[data-flow] .fl-map-controls{display:flex;align-items:center;flex-wrap:wrap;gap:6px;width:100%}',
      '[data-flow] .fl-map-controls button{min-width:28px;min-height:28px;padding:3px 7px;background:var(--fg-surface);border-color:var(--fg-border);color:var(--fg-text);font:inherit;cursor:pointer}',
      '[data-flow] :is(.fl-map-zoom-controls,.fl-map-pan-controls){display:inline-flex;gap:3px;align-items:center}',
      '[data-flow] .fl-map-zoom-controls output{min-width:36px;font-variant-numeric:tabular-nums}',
      '[data-flow] .fl-map-select{flex:1;min-width:0;padding:3px 4px;border:0;border-radius:4px;background:transparent;color:var(--fg-text);text-align:left;font:inherit;font-weight:650;line-height:1.4;overflow-wrap:anywhere;cursor:pointer}',
      '[data-flow] .fl-map-select:hover{background:var(--fg-selected)}',
      '[data-flow] .fl-map-node.is-selected{border-color:var(--fg-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--fg-accent) 22%,transparent)}',
      '.tb-frame:has([data-flow][data-flow-view="map"])>.tb-flow-zoom-float{display:none}',
      '.tb-frame:has([data-flow]) :is(.tb-flow-zoom-float,.tb-flow-selection-bar,.tb-flow-bring-popup,.tb-jump-latest){background:var(--fg-surface);border-color:var(--fg-border);box-shadow:0 4px 16px rgba(0,0,0,.16);backdrop-filter:none;-webkit-backdrop-filter:none}',
      '.tb-frame:has([data-flow]>.fl-rail)>:is(.tb-flow-zoom-float,.tb-flow-selection-bar,.tb-jump-latest){display:none}',
      '.tb-frame:has([data-flow]){container:flowglass-frame/inline-size}',
      '.fg-workbench-overlay{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;min-width:0;padding:12px;background:color-mix(in srgb,var(--fg-canvas) 85%,transparent)}',
      '.fg-workbench{display:flex;flex-direction:column;gap:0;min-width:0;width:min(900px,100%);max-height:100%;border:1px solid var(--fg-border);border-radius:10px;background:var(--fg-surface);color:var(--fg-text);font-family:var(--dsw-font-family,inherit);font-size:var(--fg-font-size);box-shadow:0 10px 32px rgba(0,0,0,.2);overflow:hidden}',
      '.fg-workbench *{box-sizing:border-box}',
      '.fg-workbench-head{flex:none;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;min-height:48px;padding:12px 14px;border-bottom:1px solid var(--fg-border)}',
      '.fg-workbench-head :is(h2,h3){margin:0;font-size:1em;line-height:1.5}',
      '.fg-workbench-body{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;gap:12px;padding:14px;overflow:auto;overscroll-behavior:contain}',
      '.fg-workbench-actions{flex:none;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;padding:12px 14px;border-top:1px solid var(--fg-border)}',
      '.fg-workbench :is(button,input,select,textarea){max-width:100%;min-height:30px;font:inherit;font-size:.88em}',
      '.fg-workbench button{height:auto;white-space:normal;overflow-wrap:anywhere;line-height:1.5}',
      '.fg-workbench :is(button,input,select,textarea,a):focus-visible,.fg-launch-recovery button:focus-visible{outline:2px solid var(--fg-accent);outline-offset:2px}',
      '.fg-workbench-note{margin:0;color:var(--fg-muted);font-size:.84em;line-height:1.6;overflow-wrap:anywhere}',
      '.fg-workbench-preview{min-width:0;max-width:100%;max-height:340px;margin:0;padding:12px;border:1px solid var(--fg-border);border-radius:7px;background:var(--fg-canvas);color:var(--fg-text);font-family:var(--ds-font-family-code,ui-monospace),monospace;font-size:.86em;line-height:1.6;white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere}',
      '.fg-bookmark-item{display:flex;align-items:flex-start;flex-wrap:wrap;gap:9px;min-width:0;padding:11px;border:1px solid var(--fg-border);border-radius:7px;background:var(--fg-canvas);overflow-wrap:anywhere}',
      '.fg-bookmark-item>:first-child{flex:1;min-width:120px;max-width:100%}',
      '.fg-bookmark-item :is(p,small){margin:4px 0;color:var(--fg-muted);line-height:1.5}',
      '.fg-conclusions{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}',
      '.fg-conclusions>article{min-width:0;padding:12px;border:1px solid var(--fg-border);border-radius:8px;background:var(--fg-canvas);overflow-wrap:anywhere}',
      '.fg-conclusions :is(pre,p){max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}',
      '.fg-launch-recovery{flex:none;max-height:35%;min-height:0;display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--fg-border);border-radius:8px;background:var(--fg-surface);color:var(--fg-text);font-family:var(--dsw-font-family,inherit);font-size:var(--fg-font-size);overflow:auto;overscroll-behavior:contain}',
      '.fg-launch-recovery>header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}',
      '.fg-launch-result{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:7px 0;border-top:1px solid var(--fg-border);font-size:.85em;line-height:1.6;overflow-wrap:anywhere}',
      '.fg-launch-result>:first-child{flex:1 1 160px;min-width:0}',
      '.fg-launch-result button{height:auto;min-height:30px;font-size:inherit;white-space:normal}',
      '@container flowglass-frame (min-width:960px){.fg-conclusions{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@container flowglass-frame (max-width:479px){.fg-workbench-overlay{padding:0}.fg-workbench{width:100%;height:100%;border-radius:0}.fg-workbench-head,.fg-workbench-body,.fg-workbench-actions{padding:10px}.fg-workbench-actions{justify-content:flex-start}.fg-launch-recovery{max-height:38%;padding:8px}.fg-bookmark-item>:first-child{flex-basis:100%}}',
      // Below 800px, ordinary reading follows one column; the explicit relationship map keeps its canvas.
      '@container flowglass (max-width:799px){[data-flow] .fl-lane,[data-flow] .fl-flow-two .fl-lane{display:flex;flex-direction:column;gap:8px;min-height:0}[data-flow] .fl-lane>div:empty{display:none}[data-flow] .fl-lane-main{order:0}[data-flow] .fl-lane-main:has(>.fl-lane-line){display:none}[data-flow] .fl-lane-main::before{display:none}[data-flow] .fl-lane-side{order:1;grid-template-columns:50px minmax(0,1fr);gap:8px}[data-flow] .fl-subcol{order:2;min-height:0;grid-template-columns:minmax(0,1fr)}[data-flow] .fl-subbranch{min-height:0}[data-flow] .fl-sub-card::after{display:none}[data-flow] .fl-conn{min-height:9px}[data-flow] .fl-conn-gap{min-height:0}[data-flow] .fl-node{width:100%;max-width:none}[data-flow] .fl-zoom-branches{display:flex;flex-direction:column;gap:14px;padding:10px 0;overflow:visible}[data-flow] .fl-zoom-branch{width:100%;padding:10px;border:1px solid var(--fg-border);border-radius:9px;background:var(--fg-surface)}[data-flow] .fl-zoom-branch-head{padding:0;border:0;background:transparent}[data-flow] .fl-zoom-branch::before,[data-flow] .fl-zoom-branch::after,[data-flow] .fl-zoom-trunk{display:none}[data-flow] .fl-zoom-rootcard{width:100%}[data-flow] .fl-zoom-diff-scroll{overflow-x:hidden;padding:0}[data-flow] .fl-zoom-diff-board{display:flex;flex-direction:column;min-width:0;width:100%;border:0;background:transparent;overflow:visible}[data-flow] .fl-diff-corner,[data-flow] .fl-diff-session-head{display:none}[data-flow] .fl-diff-gutter{position:static;gap:5px;margin-top:16px;padding:10px;border:1px solid var(--fg-border);border-radius:8px;background:var(--fg-raised)}[data-flow] .fl-diff-gutter small{flex-direction:row;flex-wrap:wrap;gap:8px}[data-flow] .fl-diff-cell{min-height:0;margin-top:8px;padding:12px;border:1px solid var(--fg-border);border-radius:8px}[data-flow] .fl-diff-cell::before{content:attr(data-branch-label);display:block;margin-bottom:8px;color:var(--fg-text);font-size:.88em;font-weight:650;overflow-wrap:anywhere}[data-flow] .fl-diff-cell-missing{flex-direction:column;align-items:flex-start}[data-flow] .fl-diff-cell-head{flex-wrap:wrap}[data-flow] .fl-diff-branch{margin-left:0;white-space:normal}[data-flow] .fl-rail-resize{display:none}}',
      '@container flowglass (min-width:800px) and (max-width:1199px){[data-flow] .fl-lane{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}[data-flow] .fl-lane>div:empty{display:none}[data-flow] .fl-lane-main{grid-column:1}[data-flow] .fl-lane-side{grid-column:2;grid-template-columns:52px minmax(0,1fr)}[data-flow] .fl-subcol{grid-column:1/-1;grid-row:2;margin:10px 0;min-height:0}[data-flow] .fl-sub-card::after{display:none}[data-flow] .fl-zoom-branches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible;gap:16px}[data-flow] .fl-zoom-branch{width:100%}[data-flow] .fl-zoom-branch::before,[data-flow] .fl-zoom-branch::after{display:none}}',
      '@container flowglass (min-width:800px) and (max-width:1199px){[data-flow][data-flow-view="compact"] .fl-zoom-diff-scroll{overflow-x:hidden}[data-flow][data-flow-view="compact"] .fl-zoom-diff-board{display:flex;flex-direction:column;min-width:0;width:100%;border:0;background:transparent;overflow:visible}[data-flow][data-flow-view="compact"] :is(.fl-diff-corner,.fl-diff-session-head){display:none}[data-flow][data-flow-view="compact"] .fl-diff-gutter{position:static;gap:5px;margin-top:16px;padding:10px;border:1px solid var(--fg-border);border-radius:8px;background:var(--fg-raised)}[data-flow][data-flow-view="compact"] .fl-diff-gutter small{flex-direction:row;flex-wrap:wrap;gap:8px}[data-flow][data-flow-view="compact"] .fl-diff-cell{min-height:0;margin-top:8px;padding:12px;border:1px solid var(--fg-border);border-radius:8px}[data-flow][data-flow-view="compact"] .fl-diff-cell::before{content:attr(data-branch-label);display:block;margin-bottom:8px;color:var(--fg-text);font-size:.88em;font-weight:650;overflow-wrap:anywhere}[data-flow][data-flow-view="compact"] .fl-diff-cell-missing{flex-direction:column;align-items:flex-start}}',
      '@container flowglass (min-width:1200px){[data-flow] .fl-lane{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.2fr)}[data-flow] .fl-flow-two .fl-lane{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}[data-flow] .fl-zoom-branches{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));overflow:visible;gap:16px}[data-flow] .fl-zoom-branch{width:100%}[data-flow] .fl-zoom-branch::before,[data-flow] .fl-zoom-branch::after{display:none}[data-flow]:has(>.fl-rail)>.tb-pane-body{margin-inline-end:calc(var(--fg-inspector-width) + 12px)}[data-flow] .fl-rail{width:var(--fg-inspector-width);box-shadow:none;border:1px solid var(--fg-border)}}',
      // A narrow inspector replaces visible content without unmounting it or losing its scroll position.
      '@container flowglass (max-width:479px){[data-flow]:has(>.fl-rail)>:is(.tb-pane-head,.tb-pane-body,.fl-zoom-history-drawer){visibility:hidden;pointer-events:none}[data-flow] .fl-rail{inset:0;width:100%;border:0;border-radius:0;box-shadow:none}[data-flow] .fl-lane-side{grid-template-columns:minmax(0,1fr);padding-left:10px;border-left:1px solid var(--fg-wire)}[data-flow] .fl-lane-side>.fl-wp{display:none}[data-flow] .fl-lane-side.fl-grp{margin:0;padding:10px}[data-flow] .fl-preview{-webkit-line-clamp:4}[data-flow] .fl-zoom-composer-controls>[data-zoom-launch]{width:100%;white-space:normal}[data-flow] .fl-zoom-composer-spacer{display:none}[data-flow] .fl-zoom-history-drawer{width:100%}[data-flow] .fl-toolbar-menu{max-width:calc(100cqi - 8px)}[data-flow] .fl-rail-head .fl-branch-btn{width:26px;height:26px}}',
      // Keep the session surface a flow diagram at both sidebar and full-screen sizes.
      '.jr-drawer [data-flow]:not([data-flow-board])>.tb-pane-body{background-image:radial-gradient(circle,var(--fg-wire) .7px,transparent .8px);background-size:22px 22px;gap:4px;padding:16px 12px 54px}',
      '[data-flow]:not([data-flow-board])>.tb-pane-body>.fl-lane{flex-shrink:0;width:100%;max-width:1440px;align-self:flex-start;margin-inline:auto}',
      '[data-flow]>.tb-pane-head{flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px}',
      '[data-flow]>.tb-pane-head>.tb-row{flex:1 1 100%}',
      '[data-flow]>.tb-pane-head>:is(.fl-query-bar,.fl-replay-bar){flex:0 1 auto}',
      '[data-flow]>.tb-pane-head>:is(.fl-query-bar,.fl-replay-bar)[open]{flex-basis:100%}',
      '[data-flow] .fl-session-title{flex:1 1 180px;font-size:.95em}',
      '[data-flow] .fl-node{padding:8px 10px;border-radius:7px}',
      '[data-flow] .fl-node-open{gap:4px}',
      '[data-flow] .fl-preview{-webkit-line-clamp:2;font-size:12px;line-height:1.5}',
      '[data-flow] .fl-system-context{background:var(--fg-canvas);border:1px dashed var(--fg-border);padding:3px 9px}',
      '[data-flow] .fl-lane-main::before{width:2px;left:calc(50% - 1px);bottom:-4px}',
      '[data-flow] .fl-conn{min-height:18px}',
      '[data-flow] .fl-zoom-composer-controls{gap:10px}',
      '[data-flow] .fl-zoom-lane-group{display:flex;flex:1 1 100%;gap:8px;align-items:center}',
      '[data-flow] .fl-zoom-lane-label{flex:none;font-size:12px;color:var(--fg-muted)}',
      '@container flowglass (max-width:799px){[data-flow]:not([data-flow-board]) .fl-lane{gap:0}[data-flow]:not([data-flow-board]) .fl-lane-main::before{display:block}[data-flow]:not([data-flow-board]) .fl-lane-main:has(>.fl-lane-line){display:flex}[data-flow]:not([data-flow-board]) .fl-lane-side{margin:8px 0 8px 24px;padding:10px;border-left:2px solid var(--fg-wire);border-radius:7px;background:var(--fg-canvas)}[data-flow]:not([data-flow-board]) .fl-subcol{margin:8px 0 8px 24px}[data-flow] .fl-preview{-webkit-line-clamp:2}}',
      // Session diagrams retain the original three semantic lanes at every panel width.
      '[data-flow]:not([data-flow-board])>.tb-pane-body{overflow-x:auto!important}',
      '[data-flow]:not([data-flow-board]) .fl-lane{display:grid!important;grid-template-columns:minmax(180px,1.05fr) minmax(220px,1fr) minmax(240px,1.2fr)!important;gap:0 10px!important;min-width:680px;align-items:stretch}',
      '[data-flow]:not([data-flow-board]) .fl-lane>div:empty{display:block!important}',
      '[data-flow]:not([data-flow-board]) .fl-lane-main{grid-column:2!important;grid-row:1;order:initial!important}',
      '[data-flow]:not([data-flow-board]) .fl-lane-side{grid-column:3!important;grid-row:1;order:initial!important;margin:0!important;padding:0;grid-template-columns:64px minmax(0,1fr)!important;border-left:0;background:transparent}',
      '[data-flow]:not([data-flow-board]) .fl-lane-side>.fl-wp{display:flex!important}',
      '[data-flow]:not([data-flow-board]) .fl-subcol{grid-column:1!important;grid-row:1!important;order:initial!important;margin:0!important;min-height:112px;grid-template-columns:minmax(0,1fr)}',
      '[data-flow]:not([data-flow-board]) .fl-sub-card::after{display:block!important}',
      '.fg-settings{--fg-font-size:var(--dsh-content-font-size,14px);container:flowglass-settings/inline-size;min-width:0;font-family:var(--dsw-font-family,inherit);font-size:var(--fg-font-size);color:var(--fg-text)}',
      '.fg-settings :is(.fg-settings-head,.fg-settings-section-head,.fg-settings-rule-head,.fg-settings-actions){flex-wrap:wrap}',
      '.fg-settings :is(.fg-settings-title,.fg-settings-section h3){font-size:1.05em}',
      '.fg-settings :is(.fg-settings-sub,.fg-settings-note,.fg-settings-rule-preview,.fg-settings-copy>small){font-size:.82em;line-height:1.6;overflow-wrap:anywhere}',
      '.fg-settings :is(.fg-settings-select,.fg-settings-input,.fg-settings-button,.fg-settings-rule-grid label,.fg-settings-copy>strong){font-size:.9em}',
      '.fg-settings :is(.fg-settings-select,.fg-settings-input,.fg-settings-button){height:auto;min-height:32px;line-height:1.5}',
      '.fg-settings .fg-settings-button{white-space:normal}',
      '.fg-settings-rule-summary{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}',
      '.fg-settings-rule-preview{flex:none;min-width:0;margin:0;color:var(--fg-muted)}',
      '.fg-settings-rule-head>strong{white-space:normal;overflow-wrap:anywhere}',
      '.fg-settings-rule-grid{padding-top:10px;border-top:1px solid var(--fg-border)}',
      '@container flowglass-settings (max-width:719px){.fg-settings-grid{grid-template-columns:minmax(0,1fr)}.fg-settings-rule-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@container flowglass-settings (max-width:479px){.fg-settings-section{padding:12px}.fg-settings-row{flex-wrap:wrap;gap:8px}.fg-settings-copy{flex:1 1 180px}.fg-settings-rule-grid{grid-template-columns:minmax(0,1fr)}.fg-settings-select,.fg-settings-input{width:100%;max-width:none}.fg-settings-rule-head{gap:7px}.fg-settings-rule-head>strong{flex-basis:calc(100% - 60px)}.fg-settings-actions{justify-content:flex-start}}',

      '[data-flow][data-flow-board]>.tb-pane-body{flex-direction:column;justify-content:flex-start}[data-flow]>.tb-pane-body{animation:none!important}',
      '.jr-drawer [data-flow][data-flow-view="detail"]>.tb-pane-body{overflow:auto}[data-flow] .fl-zoom-diff-scroll{flex:none;overflow:visible}[data-flow] .fl-zoom-diff-board{margin-inline-start:0}',
      '[data-flow]>.tb-pane-head>:is(.fl-query-bar,.fl-replay-bar){border:0;padding:0}[data-flow] .fl-filter-panel>.fl-filter-row{position:static}[data-flow] .fl-filter-panel>p{margin:8px 0 0}',
      // One typography scale for the plugin; compact metadata never compounds em sizes.
      '[data-flow],.fg-settings{--fg-font-body:var(--fg-font-size);--fg-font-small:calc(var(--fg-font-size)*.86)}',
      '[data-flow] :is(button,input,select,textarea,summary,.fl-preview,.fl-title,.fl-zoom-title,.fl-zoom-step-txt),.fg-settings :is(p,button,input,select,label,strong){font-size:var(--fg-font-body);line-height:1.5}',
      '[data-flow] :is(.tb-note,.tb-sec-label,.fl-tag,.fl-status,.fl-time,.fl-model,.fl-zoom-stats,.fl-zoom-badge,.fl-zoom-lane-label),.fg-settings :is(small,.fg-settings-note,.fg-settings-rule-preview){font-size:var(--fg-font-small);line-height:1.5}',
      '.fg-settings-rule{height:auto;min-height:0;flex:none}.fg-settings-rule>p{margin:0;flex:none;overflow-wrap:anywhere}.fg-settings-rule-summary{display:block}',
      '[data-flow]>.tb-pane-head{position:relative;display:flex;flex-flow:row nowrap;gap:6px;min-height:38px;padding:4px 2px;align-items:center}',
      '[data-flow]>.tb-pane-head>:is(.fl-context-bar,.fl-toolbar){display:contents}',
      '[data-flow]>.tb-pane-head .fl-session-title{flex:1 1 100px;min-width:30px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '[data-flow]>.tb-pane-head :is(.fl-breadcrumbs,button,summary){flex-shrink:0;white-space:nowrap}',
      '[data-flow]>.tb-pane-head :is(.fl-query-bar,.fl-replay-bar){flex:0 0 auto;margin:0}',
      '[data-flow]>.tb-pane-head>:is(.fl-query-bar,.fl-replay-bar)[open]{flex-basis:auto}',
      '[data-flow]>.tb-pane-head>:is(.fl-query-bar,.fl-replay-bar)[open]>.fl-filter-panel,[data-flow]>.tb-pane-head>:is(.fl-query-bar,.fl-replay-bar)[open]>.fl-filter-panel{position:absolute;top:100%;left:0;right:0;z-index:40;padding:10px;background:var(--fg-surface);border:1px solid var(--fg-border)}',
      '[data-flow]>.tb-pane-head .fl-execution-status{display:none}[data-flow]>.tb-pane-head .fl-sync-status{white-space:nowrap}',
      '[data-flow] .fl-zoom-composer{flex:0 0 auto;width:100%}',
      '[data-flow] .fl-zoom-composer-context{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center}',
      '[data-flow] .fl-zoom-composer-context>strong{white-space:nowrap}[data-flow] .fl-zoom-composer-context>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}[data-flow] .fl-zoom-composer-context>.fl-zoom-composer-targets{grid-column:1/-1}',
      '[data-flow] .fl-zoom-composer-targets{width:100%;display:flex;gap:8px;flex-wrap:wrap}',
      '[data-flow] .fl-zoom-current-item{flex:0 1 240px;min-width:180px;display:flex}[data-flow] .fl-zoom-current-item .fl-zoom-current-session{flex:1;min-width:0;max-width:none;white-space:nowrap;grid-template-columns:auto minmax(0,1fr) auto}[data-flow] .fl-zoom-current-session>*{white-space:nowrap;min-width:0}[data-flow] .fl-zoom-current-session>:nth-child(2){overflow:hidden;text-overflow:ellipsis}',
      '[data-flow] .fl-zoom-step-txt{min-width:0;white-space:normal;overflow-wrap:anywhere}[data-flow] .fl-overview-process{border-top:1px solid var(--fg-border);padding-top:8px}[data-flow] .fl-overview-process .fl-zoom-flow{max-height:none}',
      '[data-flow]>.tb-pane-body{overflow-anchor:none;scrollbar-gutter:stable}[data-flow] .fl-mindmap-viewport{overflow-anchor:none}',
      '[data-flow] .fl-toolbar-menu{font-size:var(--fg-font-body);line-height:1.65}',
      '[data-flow] :is(.fl-help,.fl-technical-info)>summary{font-size:var(--fg-font-body);font-weight:600;line-height:1.65;white-space:normal}',
      '[data-flow] :is(.fl-help,.fl-technical-info)>p{font-size:var(--fg-font-body);font-weight:400;line-height:1.65;white-space:pre-line;overflow-wrap:anywhere;word-break:normal;margin:8px 0}',
      '[data-flow] .fl-help-text{white-space:pre-line;overflow-wrap:anywhere;word-break:normal}',
      '@container flowglass (max-width:1000px){[data-flow]>.tb-pane-head .fl-sync-status{display:none}}@container flowglass (max-width:699px){[data-flow]>.tb-pane-head>.fl-toolbar>[data-flow-bookmarks],[data-flow]>.tb-pane-head>.fl-toolbar>[data-flow-export],[data-flow]>.tb-pane-head>.fl-toolbar>[data-flow-compare-preview]{display:none}}',
      '@media(prefers-reduced-motion:reduce){[data-flow] *,[data-flow] *::before,[data-flow] *::after,.tb-frame:has([data-flow])>:is(.tb-flow-zoom-float,.tb-flow-selection-bar,.tb-flow-bring-popup,.tb-jump-latest),.fg-settings *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}',
    ].join('\n')
    // 编译 bundle 的主 UI 样式以独立 scope 包裹，避免不同 bundle/版本的 .tb-*、.jr-* 互相覆盖。
    // 动态模式保持历史全局样式；导航按钮位于 scope 外，编译模式另补值级选择器。
    // disposer 挂 ctx.effect：插件停止/重跑不回收会每次叠加一份 ~30KB 样式表（同 :100 处理）
    ctx.effect(() => styles.insert(RT.bundleId === 'dynamic'
      ? toolboxCss
      : '@scope ([data-dsh-toolbox-scope="' + RT.domValue() + '"]) {\n' + toolboxCss + '\n}'))
    if (RT.bundleId !== 'dynamic') {
      const nav = '[data-dsh-toolbox-entry="' + RT.domValue() + '"]'
      ctx.effect(() => styles.insert([
        nav + '{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex;font-family:inherit;box-sizing:border-box}',
        nav + ':hover{background:var(--dsw-specific-sidebar-nav-item-hover,var(--dsw-alias-bg-layer-2,#31323b));color:var(--dsw-alias-label-primary)}',
        nav + '[data-active]{background:var(--dsw-specific-sidebar-nav-item-active,var(--dsw-alias-bg-layer-2,#31323b));color:var(--dsw-alias-label-primary);font-weight:600}',
        '[data-dsh-frame][data-sidebar-collapsed] ' + nav + '{justify-content:center;width:100%;padding:0}',
        '[data-dsh-frame][data-sidebar-collapsed] ' + nav + ' .tb-nav-label{display:none}',
        '[data-sidebar-collapsed] ' + nav + '{justify-content:center;width:100%;padding:0}',
        '[data-sidebar-collapsed] ' + nav + ' .tb-nav-label{display:none}',
      ].join('\n')))
    }

    let open = false
    const listeners = new Set()
    function emit() { listeners.forEach((fn) => { try { fn() } catch (e) {} }) }
    const store = {
      isOpen() { return open },
      toggle() { open = !open; emit() },
      close() { open = false; emit() },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    }

    // ===== Flowglass 产品设置（官方插件详情页 + 流镜运行时共用） =====
    // 内置默认随 Git/npm 包发布；用户修改和自定义显示规则只写浏览器 localStorage。
    const FLOW_SETTINGS_EVENT = RT.event('flow-settings-changed')
    const FLOW_PREFERENCES_KEY = RT.storageKey('flow.preferences')
    const FLOW_RULES_KEY = RT.storageKey('flow.presentation-rules')
    const FLOW_PREFERENCES_DEFAULTS = Object.freeze({
      keepOpenOnSessionSwitch: true,
      zoomEnabled: true,
      defaultBranchCount: 2,
      defaultZoomView: 'compact',
      refreshMs: 2000,
    })
    const FLOW_DEFAULT_PRESENTATION_RULES = Object.freeze([
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['git', 'git.exe'], displayName: 'Git', actions: [], badge: 'Git', color: '#f05032' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['gh', 'gh.exe', 'github', 'github.exe'], displayName: 'GitHub', actions: [], badge: 'GitHub', color: '#8b949e' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['pnpm', 'pnpm.cmd', 'pnpm.exe'], displayName: 'pnpm', actions: [], badge: 'pnpm', color: '#f69220' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['npm', 'npm.cmd', 'npm.exe'], displayName: 'npm', actions: [], badge: 'npm', color: '#cb3837' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['dsh', 'dsh.cmd', 'dsh.exe'], displayName: 'DSH', actions: [], badge: 'DSH', color: '#7fa7f0' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['python', 'python.exe', 'python3', 'python3.exe', 'py', 'py.exe'], displayName: 'Python', actions: [], badge: 'Python', color: '#3776ab' },
    ])
    const flowDefaultPresentationRules = JSON.stringify(FLOW_DEFAULT_PRESENTATION_RULES)
    const cloneFlowRules = (rules) => JSON.parse(JSON.stringify(rules))
    const normalizeFlowPreferences = (value) => {
      const p = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const branchCount = Number(p.defaultBranchCount)
      const refreshMs = Number(p.refreshMs)
      return {
        keepOpenOnSessionSwitch: p.keepOpenOnSessionSwitch !== false,
        zoomEnabled: p.zoomEnabled !== false,
        defaultBranchCount: branchCount === 3 || branchCount === 4 ? branchCount : 2,
        defaultZoomView: p.defaultZoomView === 'detail' || p.defaultZoomView === 'map' ? p.defaultZoomView : 'compact',
        refreshMs: [0, 1000, 2000, 5000, 10000].includes(refreshMs) ? refreshMs : 2000,
      }
    }
    const readFlowPreferences = () => {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(FLOW_PREFERENCES_KEY)
        return normalizeFlowPreferences(raw ? JSON.parse(raw) : FLOW_PREFERENCES_DEFAULTS)
      } catch (e) { return normalizeFlowPreferences(FLOW_PREFERENCES_DEFAULTS) }
    }
    const splitFlowRuleList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
    const normalizeFlowRulesForStorage = (value) => {
      const rules = typeof value === 'string' ? JSON.parse(value || '[]') : value
      if (!Array.isArray(rules) || rules.length > 24) throw new Error('显示规则必须是数组，最多 24 条')
      return rules.map((rule, index) => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('第 ' + (index + 1) + ' 条显示规则无效')
        const tools = Array.isArray(rule.tools) ? rule.tools.map(String).map((item) => item.trim()).filter(Boolean) : []
        const executables = Array.isArray(rule.executables) ? rule.executables.map(String).map((item) => item.trim()).filter(Boolean) : []
        if (!tools.length || !executables.length) throw new Error('第 ' + (index + 1) + ' 条规则需要原始工具和可执行文件')
        const color = String(rule.color || '#81c784').toLowerCase()
        if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error('第 ' + (index + 1) + ' 条规则颜色无效')
        return {
          enabled: rule.enabled !== false,
          tools: [...new Set(tools)].slice(0, 8),
          executables: [...new Set(executables)].slice(0, 12),
          displayName: String(rule.displayName || '').trim().slice(0, 80),
          actions: [...new Set(Array.isArray(rule.actions) ? rule.actions.map(String).map((item) => item.trim()).filter(Boolean) : [])].slice(0, 32),
          badge: String(rule.badge || '').trim().slice(0, 12),
          color,
        }
      })
    }
    const readFlowRules = () => {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(FLOW_RULES_KEY)
        return typeof raw === 'string' ? raw : flowDefaultPresentationRules
      } catch (e) { return flowDefaultPresentationRules }
    }
    const readFlowRuleObjects = () => {
      try { return normalizeFlowRulesForStorage(readFlowRules()) }
      catch (e) { return cloneFlowRules(FLOW_DEFAULT_PRESENTATION_RULES) }
    }
    const writeFlowRules = (raw) => {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(FLOW_RULES_KEY, raw)
    }
    const writeFlowSettings = (preferences, rules) => {
      const nextPreferences = normalizeFlowPreferences(preferences)
      const nextRules = normalizeFlowRulesForStorage(rules)
      if (typeof localStorage === 'undefined') throw new Error('当前浏览器不支持本地设置')
      localStorage.setItem(FLOW_PREFERENCES_KEY, JSON.stringify(nextPreferences))
      localStorage.setItem(FLOW_RULES_KEY, JSON.stringify(nextRules))
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FLOW_SETTINGS_EVENT)) } catch (e) {}
      return { preferences: nextPreferences, rules: nextRules }
    }

    // ===== 官方右侧栏承载（Flowglass + 原生静态工具箱）=====
    // 接入层级（0.1.5 计划）：Harness 原生 sidebarRightTabs + slots
    //   > Better Sidebar >= 0.19 原生桥 > 固定右侧兜底面板。
    // 服务可晚于流镜出现/被 HMR 替换，所以两条桥都用 ctx.inject 驱动，并用这个
    // 小 store 让已挂载的独立入口/Drawer 同步让位/恢复。原生静态工具箱只走 Harness
    // 官方下拉框/Tab，不再注册独立导航入口或 shell.overlay 抽屉。
    const FLOW_TAB_ID = 'dsh-flowglass:flow'
    const FLOW_NATIVE_ID = 'dsh-flowglass/native' // 原生 page type 的 definition id（body/title 同 id 注册）
    const FLOW_NATIVE_KIND = 'dsh-flowglass:flow' // openTab 寻址的 kind
    const TOOLBOX_NATIVE_ID = 'dsh-dynamic-toolbox/native'
    const TOOLBOX_NATIVE_KIND = 'dsh-dynamic-toolbox:toolbox'
    const OFFICIAL_TOOLBOX_ONLY = RT.bundleId === 'dynamic-toolbox'
    const integrationListeners = new Set()
    const integration = {
      service: null, // betterSidebar 服务
      native: false, // Harness 原生右侧栏注册生效（最高层）
      enabled: true,
      active() { return this.native || (Boolean(this.service) && this.enabled) },
      emit() { integrationListeners.forEach((fn) => { try { fn() } catch (e) {} }) },
      subscribe(fn) { integrationListeners.add(fn); return () => integrationListeners.delete(fn) },
      sync(service) {
        this.service = service || null
        this.enabled = !service || typeof service.isTabEnabled !== 'function' || service.isTabEnabled(FLOW_TAB_ID) !== false
        if (this.active()) store.close()
        this.emit()
      },
      setNative(on) {
        const next = Boolean(on)
        if (this.native === next) return
        this.native = next
        if (this.active()) store.close()
        this.emit()
      },
    }
    // 原生 openTab 句柄（sidebarRightTabs 注入回调内置位；null = 原生不可用）
    let nativeOpenTab = null
    // 原生流镜 Tab 的展开意图跨 Session 保留。Harness 的右侧栏页面按 Session 重挂，
    // 旧 Tab 在切换过程中可能先隐藏/卸载；用目标 Session 区分“导航重挂”与用户主动关闭。
    let nativeFlowVisible = false
    let nativeFlowReopenSession = ''

    function useIntegrationActive() {
      const [, force] = React.useState(0)
      React.useEffect(() => integration.subscribe(() => force((t) => t + 1)), [])
      return integration.active()
    }

    function useOpenState() {
      const [, force] = React.useState(0)
      React.useEffect(() => store.subscribe(() => force((t) => t + 1)), [])
      return store.isOpen()
    }

    function Entry(props) {
      const isOpen = useOpenState()
      const sidebarActive = useIntegrationActive()
      const nativeActive = integration.native
      // 原生右侧栏生效时入口保留：点击 openTab（自动展开侧栏并聚焦流镜 Tab）；
      // Better Sidebar 桥生效时入口让位（Tab 已在其面板内）；两者都不可用 → 固定右侧兜底面板。
      if (sidebarActive && !nativeActive) return null
      return React.createElement(
        'button',
        {
          type: 'button',
          className: 'tb-entry' + (isOpen && !nativeActive ? ' tb-entry-active' : ''),
          title: fullDisplayName + (nativeActive ? '（在右侧栏打开流镜）' : '（工具集）'),
          onClick: () => {
            if (nativeActive && nativeOpenTab) { try { nativeOpenTab() } catch (e) {} return }
            store.toggle()
          },
        },
        props.wide ? compactDisplayName : '箱',
      )
    }

    // ===== 侧边栏导航入口（DOM 注入） =====
    // 侧边栏导航区（新会话 / 任务看板 / SSH 那一列）rc.7 仍无官方 Slot（footer 的
    // sidebar.footer.action 位置太差，用户决策回导航区），任务看板与 dsh-ssh 同样走
    // DOM 注入 + MutationObserver 自愈。条目插在「新会话」行之后的插件族块
    // （taskboard/ssh/toolbox）末尾——即 SSH 之后、工作区之前；族块相对定位保证多个
    // 自愈插件重插后顺序稳定。纯 DOM（不进 React 树），不会干扰宿主 reconciliation。
    // 无 DOM 环境（headless）退回官方 Slot 兜底。
    const NAV_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="12" height="8.5" rx="1.5"/><path d="M5.5 5V3.8A1.3 1.3 0 0 1 6.8 2.5h2.4A1.3 1.3 0 0 1 10.5 3.8V5"/><path d="M2 8.2h12"/></svg>'
    const FLOW_NAV_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M8 4.5v2.2M8 6.7L4 11M8 6.7l4 4.3"/></svg>'
    const ENTRY_NAV_ICON = RT.bundleId === 'flow' ? FLOW_NAV_ICON : NAV_ICON
    const NAV_FAMILY_SEL = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-toolbox-entry]'
    // 侧边栏入口图标引用（mountSidebarEntry 注入后绑定；无 DOM 环境走 Slot 兜底无图标，保持 null）。
    // Drawer 在只剩一个工具时经 replaceSidebarIcon 把工具箱图标临时换成该工具的图标。
    // desiredSidebarIcon 记录「最近希望显示的图标」：入口绑定晚于 Drawer effect 时，绑定后补刷一次，
    // 顺序无关（先想显示后绑定 / 先绑定后想显示都收敛到同一结果）。
    let sidebarIconEl = null
    let desiredSidebarIcon = ENTRY_NAV_ICON
    const applySidebarIcon = () => { if (sidebarIconEl) { try { sidebarIconEl.innerHTML = desiredSidebarIcon } catch (e) {} } }
    const replaceSidebarIcon = (html) => { desiredSidebarIcon = html || ENTRY_NAV_ICON; applySidebarIcon() }

    function mountSidebarEntry() {
      function sidebarRoot() {
        const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
        if (!column) return undefined
        const logoRow = column.querySelector('[class*="logoRow"]')
        return (logoRow && logoRow.parentElement) || column.firstElementChild || undefined
      }
      function newSessionButton(root) {
        const nested = root.querySelector('button[class*="newSession"]')
        if (nested) return nested
        for (const child of root.children) {
          if (child.tagName === 'BUTTON') return child
        }
        return undefined
      }
      function placeEntry(root, entry) {
        const button = newSessionButton(root)
        if (!button) return false
        if (entry.parentElement !== root) {
          const row = button.closest('[class*="logoRow"]')
          const base = (row && row.parentElement === root) ? row : button
          const family = Array.prototype.filter.call(root.children, (el) => el.matches && el.matches(NAV_FAMILY_SEL))
          const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
          root.insertBefore(entry, anchor)
        }
        return true
      }

      const entry = document.createElement('button')
      entry.type = 'button'
      entry.setAttribute('data-dsh-toolbox-entry', RT.domValue())
      entry.setAttribute('aria-label', fullDisplayName)
      entry.setAttribute('title', fullDisplayName)
      const safeLabel = compactDisplayName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      entry.innerHTML = '<span class="tb-nav-icon">' + ENTRY_NAV_ICON + '</span><span class="tb-nav-label">' + safeLabel + '</span>'
      const iconEl = entry.querySelector('.tb-nav-icon') // 单工具时替换此图标为工具图标
      sidebarIconEl = iconEl
      applySidebarIcon() // 补刷：Drawer 可能已在图标绑定前记录过单工具意图
      entry.addEventListener('click', () => {
        // 原生右侧栏生效：openTab 自动展开并聚焦流镜（Harness 保证 pane 内单例聚焦）；
        // 否则切换固定右侧兜底面板。
        if (integration.native && nativeOpenTab) { try { nativeOpenTab() } catch (e) {} return }
        store.toggle()
      })

      let root
      let placed = false
      function tryPlace() {
        if (root && !root.isConnected) { rootObserver.disconnect(); root = undefined; placed = false }
        if (placed) {
          if (document.body.contains(entry)) return
          rootObserver.disconnect(); root = undefined; placed = false
        }
        if (!root) root = sidebarRoot()
        if (!root) return
        placed = placeEntry(root, entry)
        if (placed) rootObserver.observe(root, { childList: true, subtree: true })
      }

      // body 级 watcher：整棵侧边栏重建时兜底发现新 root
      const waitObserver = new MutationObserver(() => { tryPlace() })
      waitObserver.observe(document.body, { childList: true, subtree: true })
      // root 级 watcher：React 重渲染挤掉条目时同帧重插（微任务先于绘制，无闪烁）
      const rootObserver = new MutationObserver(() => {
        if (!root || !root.isConnected) { placed = false; tryPlace(); return }
        if (!root.contains(entry)) placed = placeEntry(root, entry)
      })

      const syncActive = () => {
        if (store.isOpen()) entry.setAttribute('data-active', 'true')
        else entry.removeAttribute('data-active')
        if (!entry.style) return
        // 原生生效：入口保留（点击 openTab）；Better Sidebar 桥生效：让位；其余：固定兜底入口
        if (integration.active() && !integration.native) entry.style.display = 'none'
        else entry.style.display = ''
      }
      const unsubscribe = store.subscribe(syncActive)
      const unsubscribeIntegration = integration.subscribe(syncActive)
      syncActive()
      tryPlace()

      return () => {
        waitObserver.disconnect()
        rootObserver.disconnect()
        unsubscribe()
        unsubscribeIntegration()
        if (sidebarIconEl === iconEl) sidebarIconEl = null
        entry.remove()
      }
    }

    const MIN_W = 360
    const MIN_H = 240
    const SNAP_THRESHOLD = 120
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

    const fetchTools = (root) => host.call(RT.rpc('tools'), { root: root || undefined })
      .then((r) => (r && r.ok && Array.isArray(r.tools) ? r.tools : []))
      .catch(() => [])

    // ---- 抽屉几何与激活 Tab 本地记忆（localStorage；无 localStorage 的环境静默跳过）----
    const LS_KEY = RT.storageKey('drawer')
    const lsRead = () => {
      try {
        if (typeof localStorage === 'undefined') return null
        const raw = localStorage.getItem(LS_KEY)
        if (!raw) return null
        const p = JSON.parse(raw)
        return p && typeof p === 'object' ? p : null
      } catch (e) { return null }
    }
    const lsWrite = (patch) => {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(lsRead() || {}, patch)))
      } catch (e) {}
    }

    // ---- 工具分类（导航第二行 + 管理树共用）：默认表 + 用户覆盖（localStorage 持久化；键 = 工具/清单条目 id） ----
    const TOOL_CATS = [
      { id: 'ai', label: 'AI' },
      { id: 'dev', label: '开发' },
      { id: 'session', label: '会话' },
      { id: 'system', label: '系统' },
    ]
    const DEFAULT_CAT = {
      aiassist: 'ai', aiusage: 'ai', quota: 'ai',
      jira: 'dev', git: 'dev', files: 'dev', http: 'dev', ports: 'dev', calc: 'dev',
      trace: 'session', usage: 'session', prompt: 'session', context: 'session', search: 'session', lineage: 'session', tools: 'session', flow: 'session', flowedit: 'session',
      toolbox: 'system', selfview: 'system',
    }
    const CATS_LS_KEY = RT.storageKey('cats')
    // 抽屉导航临时记忆（客户端重载即清）：上次离开的 分类+工具；null = 重载后还没打开过抽屉
    let lastNav = null
    const catsRead = () => {
      try {
        if (typeof localStorage === 'undefined') return null
        const raw = localStorage.getItem(CATS_LS_KEY)
        if (!raw) return null
        const p = JSON.parse(raw)
        return p && typeof p === 'object' ? p : null
      } catch (e) { return null }
    }
    const catsWrite = (patch) => {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem(CATS_LS_KEY, JSON.stringify(Object.assign(catsRead() || {}, patch)))
      } catch (e) {}
    }

    // ===== 外观配置（主题预设 / 自定义主色 / 界面与详情字号）：localStorage 单一事实源 =====
    // 取代旧 theme-teal/theme-amber 插件：同一机制（向 scope 根或 :root 注入 --tb-* 变量），
    // 但配置收进管理页「外观」分区与 better-sidebar 流镜设置页，两处共用本 store，改动即时生效。
    const APPEARANCE_PRESETS = { default: '', teal: '#0d9488', amber: '#d97706' }
    // 预设变量族沿用旧主题插件原值（青绿/暖橙观感不变）；自定义主色由 accentFamilyVars 现算
    const APPEARANCE_PRESET_VARS = {
      teal: ['--tb-accent:#0d9488', '--tb-accent-hover:#14b8a6', '--tb-accent-text:#5eead4', '--tb-accent-bg:rgba(20,184,166,.14)', '--tb-accent-border:rgba(20,184,166,.45)', '--tb-accent-ring:rgba(20,184,166,.16)', '--tb-active:#14b8a6', '--tb-active-text:#5eead4', '--tb-active-border:rgba(20,184,166,.4)', '--tb-active-bg:rgba(20,184,166,.12)'],
      amber: ['--tb-accent:#d97706', '--tb-accent-hover:#f59e0b', '--tb-accent-text:#fbbf24', '--tb-accent-bg:rgba(245,158,11,.14)', '--tb-accent-border:rgba(245,158,11,.45)', '--tb-accent-ring:rgba(245,158,11,.16)', '--tb-active:#f59e0b', '--tb-active-text:#fbbf24', '--tb-active-border:rgba(245,158,11,.4)', '--tb-active-bg:rgba(245,158,11,.12)'],
    }
    const APP_LS_KEY = RT.storageKey('appearance')
    // Keep the UI sliders aligned with the persisted validation contract. The
    // old UI exposed a narrower range than the reader accepted, which made
    // some valid stored values impossible to select or reset from the panel.
    const APPEARANCE_SCALE_MIN = 0.7
    const APPEARANCE_SCALE_MAX = 2
    const APPEARANCE_RAIL_MIN = 240
    const APPEARANCE_RAIL_MAX = 1200
    const APPEARANCE_PERSIST_DEBOUNCE_MS = 150
    const appearanceClampScale = (v, dft) => {
      const n = Number(v)
      return Number.isFinite(n)
        ? Math.min(APPEARANCE_SCALE_MAX, Math.max(APPEARANCE_SCALE_MIN, Math.round(n * 100) / 100))
        : dft
    }
    // 详情侧拉框宽度：0 = 默认（350px，CSS 兜底）；有效范围 240–1200px。
    const appearanceClampRailW = (v) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= APPEARANCE_RAIL_MIN && n <= APPEARANCE_RAIL_MAX ? Math.round(n) : 0
    }
    const appearanceDefaults = () => ({ preset: 'default', accent: '', uiScale: 1, detailScale: 1, railW: 0 })
    const normalizeAppearance = (value) => {
      const dft = appearanceDefaults()
      const p = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      return {
        preset: Object.prototype.hasOwnProperty.call(APPEARANCE_PRESETS, p.preset) ? p.preset : dft.preset,
        accent: typeof p.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : '',
        uiScale: appearanceClampScale(p.uiScale, dft.uiScale),
        detailScale: appearanceClampScale(p.detailScale, dft.detailScale),
        railW: appearanceClampRailW(p.railW),
      }
    }
    const readAppearanceStorage = () => {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(APP_LS_KEY)
        return normalizeAppearance(raw ? JSON.parse(raw) : null)
      } catch (e) { return appearanceDefaults() }
    }
    let appearanceState = readAppearanceStorage()
    const appearanceListeners = new Set()
    let appearancePersistTimer = null
    const appearanceRead = () => appearanceState
    const persistAppearance = () => {
      appearancePersistTimer = null
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(APP_LS_KEY, JSON.stringify(appearanceState))
      } catch (e) {}
    }
    const scheduleAppearancePersist = () => {
      if (appearancePersistTimer !== null) clearTimeout(appearancePersistTimer)
      appearancePersistTimer = setTimeout(persistAppearance, APPEARANCE_PERSIST_DEBOUNCE_MS)
    }
    const appearanceWrite = (patch) => {
      appearanceState = normalizeAppearance(Object.assign({}, appearanceState, patch))
      scheduleAppearancePersist()
      appearanceListeners.forEach((fn) => { try { fn() } catch (e) {} })
    }
    const appearanceSubscribe = (fn) => {
      appearanceListeners.add(fn)
      return () => appearanceListeners.delete(fn)
    }
    // Keep multiple DSH windows in sync. The active window still updates
    // immediately through appearanceWrite; this listener covers writes from
    // another window/tab without changing the existing storage key.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const onAppearanceStorage = (event) => {
        if (!event || event.key !== APP_LS_KEY) return
        try {
          const next = event.newValue ? normalizeAppearance(JSON.parse(event.newValue)) : appearanceDefaults()
          if (appearancePersistTimer !== null) {
            clearTimeout(appearancePersistTimer)
            appearancePersistTimer = null
          }
          appearanceState = next
        } catch (e) { return }
        appearanceListeners.forEach((fn) => { try { fn() } catch (e) {} })
      }
      window.addEventListener('storage', onAppearanceStorage)
      ctx.effect(() => () => {
        window.removeEventListener('storage', onAppearanceStorage)
        if (appearancePersistTimer !== null) {
          clearTimeout(appearancePersistTimer)
          persistAppearance()
        }
      })
    }
    function useAppearance() {
      const [, force] = React.useState(0)
      React.useEffect(() => appearanceSubscribe(() => force((t) => t + 1)), [])
      return appearanceState
    }
    // 自定义主色 → accent/active 全家族（亮色提亮用向白混合近似旧主题的明暗关系）
    function accentFamilyVars(hex) {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
      const rgb = r + ',' + g + ',' + b
      const lift = (t) => '#' + [r, g, b].map((c) => ('0' + Math.round(c + (255 - c) * t).toString(16)).slice(-2)).join('')
      return [
        '--tb-accent:' + hex,
        '--tb-accent-hover:' + lift(0.12),
        '--tb-accent-text:' + lift(0.38),
        '--tb-accent-bg:rgba(' + rgb + ',.14)',
        '--tb-accent-border:rgba(' + rgb + ',.45)',
        '--tb-accent-ring:rgba(' + rgb + ',.16)',
        '--tb-active:' + lift(0.06),
        '--tb-active-text:' + lift(0.38),
        '--tb-active-border:rgba(' + rgb + ',.4)',
        '--tb-active-bg:rgba(' + rgb + ',.12)',
      ]
    }
    function appearanceCss() {
      const decls = ['--tb-fs:' + appearanceState.uiScale, '--tb-fs-detail:' + appearanceState.detailScale]
      if (appearanceState.railW) decls.push('--fl-rail-w:' + appearanceState.railW + 'px')
      if (appearanceState.accent) decls.push.apply(decls, accentFamilyVars(appearanceState.accent))
      else if (APPEARANCE_PRESET_VARS[appearanceState.preset]) decls.push.apply(decls, APPEARANCE_PRESET_VARS[appearanceState.preset])
      const sel = RT.bundleId === 'dynamic' ? ':root' : '[data-dsh-toolbox-scope="' + RT.domValue() + '"]'
      return sel + '{' + decls.join(';') + '}'
    }
    // 外观样式注入：变更即重插；disposer 挂 ctx.effect（插件停止/重跑不残留，同 :128 样式规则）
    let appearanceDispose = null
    const appearanceRender = () => {
      if (appearanceDispose) { try { appearanceDispose() } catch (e) {} appearanceDispose = null }
      try { appearanceDispose = styles.insert(appearanceCss()) } catch (e) {}
    }
    appearanceRender()
    ctx.effect(() => {
      const off = appearanceSubscribe(() => appearanceRender())
      return () => {
        off()
        if (appearanceDispose) { try { appearanceDispose() } catch (e) {} appearanceDispose = null }
      }
    })

    // 外观设置面板：全内联样式（better-sidebar 设置弹层不在本 bundle scope 内，tb-* 类不可依赖）；
    // 抽屉管理页与 better-sidebar 流镜设置页共用本组件
    function FlowFontSettings() {
      const a = useAppearance()
      return React.createElement('section', { className: 'fg-settings-section' },
        React.createElement('div', { className: 'fg-settings-section-head' }, React.createElement('h3', null, '流镜字号')),
        React.createElement('div', { className: 'fg-settings-row' },
          React.createElement('label', { className: 'fg-settings-copy', htmlFor: 'flowglass-font-scale' },
            React.createElement('strong', null, '界面字号'),
            React.createElement('small', null, '统一调整流镜标题、节点、按钮与说明文字；即时生效并保存在当前浏览器。')),
          React.createElement('input', { id: 'flowglass-font-scale', type: 'range', min: APPEARANCE_SCALE_MIN, max: APPEARANCE_SCALE_MAX, step: 0.05, value: a.uiScale,
            'aria-label': '流镜字号', 'aria-valuetext': Math.round(a.uiScale * 100) + '%',
            style: { width: '180px', flex: '0 0 180px', maxWidth: '100%', accentColor: 'var(--fg-accent)' },
            onChange: (event) => appearanceWrite({ uiScale: Number(event.target.value) }) }),
          React.createElement('output', { htmlFor: 'flowglass-font-scale' }, Math.round(a.uiScale * 100) + '%'),
          React.createElement('button', { type: 'button', className: 'fg-settings-button', disabled: Math.abs(a.uiScale - 1) < 0.001,
            onClick: () => appearanceWrite({ uiScale: 1 }) }, '恢复默认')),
        React.createElement('p', { className: 'fg-settings-font-preview', style: { fontSize: 'calc(var(--dsh-content-font-size,14px) * ' + a.uiScale + ')' } }, '字号预览：当前会话 · 并发任务 · 最新结论'))
    }
    function AppearancePanel() {
      const a = useAppearance()
      const rowStyle = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }
      const lblStyle = { fontSize: '11px', opacity: 0.7, minWidth: '58px' }
      const numStyle = { fontSize: '11px', opacity: 0.75, minWidth: '40px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
      const chipBase = { height: '22px', padding: '0 10px', borderRadius: '999px', border: '1px solid rgba(128,128,128,.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '11.5px', fontFamily: 'inherit', lineHeight: '1' }
      const sliderRow = (label, key, min, max) => React.createElement('div', { style: rowStyle },
        React.createElement('span', { style: lblStyle }, label),
        React.createElement('input', {
          type: 'range', min: min, max: max, step: 0.05, value: String(a[key]),
          title: label + '缩放（100% = 内置默认）',
          style: { flex: '1', minWidth: '110px', accentColor: 'var(--tb-accent,#3f6fd9)' },
          onChange: (e) => appearanceWrite({ [key]: Number(e.target.value) }),
        }),
        React.createElement('span', { style: numStyle }, Math.round(a[key] * 100) + '%'),
        Math.abs(a[key] - 1) > 0.001
          ? React.createElement('button', {
            type: 'button', style: Object.assign({}, chipBase, { padding: '0 6px', opacity: 0.65 }),
            title: '恢复 100%', onClick: () => appearanceWrite({ [key]: 1 }),
          }, '↺')
          : null,
      )
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: lblStyle }, '主题'),
          Object.keys(APPEARANCE_PRESETS).map((k) => {
            const active = !a.accent && a.preset === k
            return React.createElement('button', {
              key: k, type: 'button',
              title: k === 'default' ? '内置默认蓝' : k === 'teal' ? '青绿（原主题插件色）' : '暖橙（原主题插件色）',
              style: Object.assign({}, chipBase, active ? { borderColor: 'var(--tb-accent,#3f6fd9)', color: 'var(--tb-accent-text,#7fa7f0)', fontWeight: 600 } : null),
              onClick: () => appearanceWrite({ preset: k }),
            }, (k === 'default' ? '默认' : k === 'teal' ? '青绿' : '暖橙') + (APPEARANCE_PRESETS[k] ? '' : ''))
          }),
          React.createElement('input', {
            type: 'color', value: a.accent || APPEARANCE_PRESETS[a.preset] || '#3f6fd9',
            title: '自定义主色（优先于主题预设）',
            onChange: (e) => appearanceWrite({ accent: e.target.value }),
            style: { width: '26px', height: '22px', padding: '0', border: '1px solid rgba(128,128,128,.45)', borderRadius: '5px', background: 'transparent', cursor: 'pointer' },
          }),
          a.accent
            ? React.createElement('button', {
              type: 'button', style: Object.assign({}, chipBase, { padding: '0 8px', opacity: 0.75 }),
              title: '清除自定义主色，回到主题预设', onClick: () => appearanceWrite({ accent: '' }),
            }, '✕ 自定义')
            : null,
        ),
        sliderRow('界面字号', 'uiScale', APPEARANCE_SCALE_MIN, APPEARANCE_SCALE_MAX),
        sliderRow('详情字号', 'detailScale', APPEARANCE_SCALE_MIN, APPEARANCE_SCALE_MAX),
        // 详情侧拉框宽度：0 = 默认 350px；拖 rail 左缘手柄与滑杆写同一配置
        React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: lblStyle }, '详情宽度'),
          React.createElement('input', {
            type: 'range', min: APPEARANCE_RAIL_MIN, max: APPEARANCE_RAIL_MAX, step: 10, value: String(a.railW || 350),
            title: '详情侧拉框宽度（拖侧拉框左缘也可调，自动记忆）',
            style: { flex: '1', minWidth: '110px', accentColor: 'var(--tb-accent,#3f6fd9)' },
            onChange: (e) => appearanceWrite({ railW: Number(e.target.value) }),
          }),
          React.createElement('span', { style: numStyle }, a.railW ? a.railW + 'px' : '默认'),
          React.createElement('button', {
            type: 'button', style: Object.assign({}, chipBase, { padding: '0 6px', opacity: 0.65 }),
            title: '恢复默认 350px', onClick: () => appearanceWrite({ railW: 0 }),
          }, '↺'),
        ),
        // 预览块：内联按倍率现算 px（不依赖 CSS 变量）——管理页看不到流镜本体、sidebar 设置弹层
        // 又在本 bundle scope 之外，两处都靠它即时看效果；侧边模式下面板背后的流镜本身也在实时变
        React.createElement('div', {
          style: { border: '1px solid rgba(128,128,128,.35)', borderRadius: '6px', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: '5px', background: 'rgba(128,128,128,.07)' },
        },
          React.createElement('span', { style: { fontSize: '10px', opacity: 0.6, letterSpacing: '.4px' } }, '预览（拖动滑杆即时变化）'),
          React.createElement('div', { style: { fontSize: (12.5 * a.uiScale).toFixed(1) + 'px', lineHeight: 1.5 } },
            '界面文字 Aa123 — 按钮 / 标签 / 消息预览'),
          React.createElement('div', {
            style: {
              fontFamily: 'ui-monospace,Consolas,monospace', fontSize: (12 * a.detailScale).toFixed(1) + 'px', lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px solid rgba(128,128,128,.35)', borderRadius: '5px', padding: '4px 6px',
            },
          }, '入 · 完整传入 {"seq": 12}\n出 · 完整返回 文本详情示例 Aa123'),
        ),
      )
    }

    // better-sidebar 流镜 Tab 设置页只保留外观；承载方式由兼容层自动选择。
    function BetterSidebarFlowSettings() {
      const headStyle = { fontSize: '11px', fontWeight: 600, opacity: 0.7, letterSpacing: '.4px' }
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' } },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          React.createElement('span', { style: headStyle }, '外观（主题 / 主色 / 字号）'),
          React.createElement(AppearancePanel, null),
        ),
      )
    }

    // Harness 官方插件详情配置页：注册到 plugins.bundle.config，设置先暂存，保存后才写 localStorage。
    function FlowglassPluginSettings() {
      const initialPreferences = React.useMemo ? React.useMemo(() => readFlowPreferences(), []) : readFlowPreferences()
      const initialRules = React.useMemo ? React.useMemo(() => readFlowRuleObjects(), []) : readFlowRuleObjects()
      const [preferences, setPreferences] = React.useState(initialPreferences)
      const [rules, setRules] = React.useState(initialRules)
      const [savedKey, setSavedKey] = React.useState(() => JSON.stringify({ preferences: initialPreferences, rules: initialRules }))
      const [notice, setNotice] = React.useState(null)
      const [editingRule, setEditingRule] = React.useState(null)
      const currentKey = JSON.stringify({ preferences, rules })
      const dirty = currentKey !== savedKey
      const h = React.createElement
      const UiButton = flowUiPrimitives && flowUiPrimitives.Button
      const UiSwitch = flowUiPrimitives && flowUiPrimitives.Switch
      const UiInput = flowUiPrimitives && flowUiPrimitives.Input
      const button = (props, child) => UiButton
        ? h(UiButton, { variant: props.primary ? 'primary' : 'outline', size: 'sm', ...props, primary: undefined }, child)
        : h('button', { type: 'button', ...props, primary: undefined }, child)
      const setPreference = (key, value) => {
        setPreferences((current) => ({ ...current, [key]: value }))
        setNotice(null)
      }
      const moveRule = (index, direction) => {
        const next = index + direction
        if (next < 0 || next >= rules.length) return
        setRules((current) => {
          const reordered = current.slice()
          ;[reordered[index], reordered[next]] = [reordered[next], reordered[index]]
          return reordered
        })
        setEditingRule((current) => current === index ? next : current === next ? index : current)
        setNotice(null)
      }
      const setRule = (index, patch) => {
        setRules((current) => current.map((rule, at) => at === index ? { ...rule, ...patch } : rule))
        setNotice(null)
      }
      const toggle = (label, value, onChange) => UiSwitch
        ? h(UiSwitch, { checked: value, onChange, label })
        : h('button', {
          type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': value ? 'true' : 'false',
          className: 'fg-settings-toggle' + (value ? ' is-on' : ''), onClick: () => onChange(!value),
        }, h('span', null))
      const option = (value, label) => h('option', { key: String(value), value: String(value) }, label)
      const preferenceRow = (title, description, control) => h('div', { className: 'fg-settings-row' },
        h('span', { className: 'fg-settings-copy' }, h('strong', null, title), h('small', null, description)),
        control,
      )
      const reloadStaged = () => {
        const nextPreferences = readFlowPreferences()
        const nextRules = readFlowRuleObjects()
        setPreferences(nextPreferences)
        setRules(nextRules)
        setEditingRule(null)
        setSavedKey(JSON.stringify({ preferences: nextPreferences, rules: nextRules }))
        setNotice(null)
      }
      const save = (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault()
        try {
          const saved = writeFlowSettings(preferences, rules)
          const nextRules = cloneFlowRules(saved.rules)
          setPreferences(saved.preferences)
          setRules(nextRules)
          setSavedKey(JSON.stringify({ preferences: saved.preferences, rules: nextRules }))
          setNotice({ error: false, text: '设置已保存，并已应用到当前浏览器中的流镜。' })
        } catch (error) {
          setNotice({ error: true, text: String((error && error.message) || error) })
        }
      }
      const ruleCards = rules.map((rule, index) => {
        const title = rule.displayName || rule.executables[0] || '未命名规则'
        const input = (label, key, value, placeholder, list) => h('label', { key },
          h('span', null, label),
          h(UiInput || 'input', {
            className: 'fg-settings-input' + (UiInput ? ' is-official' : ''), value, placeholder,
            onChange: (event) => setRule(index, { [key]: list ? splitFlowRuleList(event.currentTarget.value) : event.currentTarget.value }),
          }),
        )
        return h('article', { key: index, className: 'fg-settings-rule' + (rule.enabled ? '' : ' is-off') },
          h('div', { className: 'fg-settings-rule-head' },
            toggle('启用规则 ' + (index + 1), rule.enabled, (enabled) => setRule(index, { enabled })),
            h('span', { className: 'fl-rule-dot', style: { background: rule.color } }),
            h('strong', null, title),
            button({ type: 'button', className: 'fg-settings-button', 'aria-label': '上移规则 ' + title, disabled: index === 0, onClick: () => moveRule(index, -1) }, '上移'),
            button({ type: 'button', className: 'fg-settings-button', 'aria-label': '下移规则 ' + title, disabled: index === rules.length - 1, onClick: () => moveRule(index, 1) }, '下移'),
            button({ type: 'button', className: 'fg-settings-button', 'aria-expanded': editingRule === index, 'aria-label': '编辑规则 ' + title,
              onClick: () => setEditingRule(editingRule === index ? null : index) }, editingRule === index ? '收起' : '编辑'),
            button({
              type: 'button', className: 'fg-settings-button danger',
              'aria-label': '删除规则 ' + title,
              onClick: () => {
                setRules((current) => current.filter((_item, at) => at !== index))
                setEditingRule((current) => current === index ? null : current > index ? current - 1 : current)
                setNotice(null)
              },
            }, '删除'),
          ),
          h('p', { className: 'fg-settings-rule-summary' }, (rule.tools || []).join(' / ') + ' · ' + ((rule.executables || []).join(' / ') || '尚未设置可执行文件') + ((rule.actions || []).length ? ' · ' + rule.actions.join(' / ') : ' · 任意子命令')),
          h('p', { className: 'fg-settings-rule-preview' }, '显示预览：' + (rule.badge ? '[' + rule.badge + '] ' : '') + (rule.displayName || rule.executables[0] || '原始工具名')),
          editingRule === index ? h('div', { className: 'fg-settings-rule-grid' },
            input('原始工具（逗号分隔）', 'tools', (rule.tools || []).join(', '), 'pwsh, bash', true),
            input('可执行文件（逗号分隔）', 'executables', (rule.executables || []).join(', '), 'git, git.exe', true),
            input('显示名称', 'displayName', rule.displayName || '', '可留空', false),
            input('子命令（逗号分隔）', 'actions', (rule.actions || []).join(', '), '为空时匹配任意子命令', true),
            input('徽章', 'badge', rule.badge || '', '可留空', false),
            h('label', { key: 'color' }, h('span', null, '颜色'), h('input', {
              type: 'color', className: 'fg-settings-color', value: rule.color || '#81c784',
              onChange: (event) => setRule(index, { color: event.currentTarget.value }),
            })),
          ) : null,
        )
      })
      return h('div', { 'data-dsh-toolbox-scope': RT.domValue() },
        h('form', { className: 'fg-settings', onSubmit: save },
          h('div', { className: 'fg-settings-head' },
            h('div', null,
              h('h2', { className: 'fg-settings-title' }, 'Flowglass 设置'),
              h('p', { className: 'fg-settings-sub' }, '配置仅保存在当前浏览器；内置默认规则随插件包发布，自定义规则不会写入 Git 或 npm 包。'),
            ),
          ),
          h(FlowFontSettings),
          h('section', { className: 'fg-settings-section' },
            h('div', { className: 'fg-settings-section-head' }, h('h3', null, '行为与并发任务')),
            h('div', { className: 'fg-settings-grid' },
              preferenceRow('切换 Session 时保持展开', '仅延续已展开的流镜；主动关闭后不会自动弹回。',
                toggle('切换 Session 时保持展开', preferences.keepOpenOnSessionSwitch, (value) => setPreference('keepOpenOnSessionSwitch', value))),
              preferenceRow('启用并发任务', '关闭后隐藏并发任务入口，并返回当前会话。',
                toggle('启用并发任务', preferences.zoomEnabled, (value) => setPreference('zoomEnabled', value))),
              preferenceRow('默认分支数量', '新会话第一次打开并发开工台时使用。',
                h('select', { className: 'fg-settings-select', value: String(preferences.defaultBranchCount), onChange: (event) => setPreference('defaultBranchCount', Number(event.currentTarget.value)) },
                  option(2, '2 个分支'), option(3, '3 个分支'), option(4, '4 个分支'))),
              preferenceRow('并发任务默认视图', '没有已保存历史视图时采用；已有视图保持不变。',
                h('select', { className: 'fg-settings-select', value: preferences.defaultZoomView, onChange: (event) => setPreference('defaultZoomView', event.currentTarget.value) },
                  option('compact', '概览'), option('detail', '对比'), option('map', '关系图'))),
              preferenceRow('轮询刷新', '事件推送仍然生效；关闭表示只使用事件驱动刷新。',
                h('select', { className: 'fg-settings-select', value: String(preferences.refreshMs), onChange: (event) => setPreference('refreshMs', Number(event.currentTarget.value)) },
                  option(0, '关闭轮询'), option(1000, '1 秒'), option(2000, '2 秒'), option(5000, '5 秒'), option(10000, '10 秒'))),
            ),
          ),
          h('section', { className: 'fg-settings-section' },
            h('div', { className: 'fg-settings-section-head' },
              h('div', null, h('h3', null, '工具显示规则'), h('p', { className: 'fg-settings-note' }, '按顺序匹配，首条命中生效；默认规则和自定义规则都可关闭、编辑或删除。')),
              h('div', { className: 'fg-settings-actions' },
                button({
                  type: 'button', className: 'fg-settings-button', disabled: rules.length >= 24,
                  onClick: () => { setEditingRule(rules.length); setRules((current) => [...current, { enabled: true, tools: ['pwsh'], executables: [], displayName: '', actions: [], badge: '', color: '#81c784' }]); setNotice(null) },
                }, '添加规则'),
                button({ type: 'button', className: 'fg-settings-button', title: '替换当前规则列表；保存设置后生效，保存前可放弃更改。', onClick: () => { setRules(cloneFlowRules(FLOW_DEFAULT_PRESENTATION_RULES)); setEditingRule(null); setNotice(null) } }, '恢复内置规则'),
              ),
            ),
            h('div', { className: 'fg-settings-rules' }, ruleCards.length ? ruleCards : h('p', { className: 'fg-settings-note' }, '当前没有显示规则。保存空列表后，刷新也不会恢复默认规则。')),
          ),
          h('div', { className: 'fg-settings-actions' },
            notice ? h('span', { className: 'fg-settings-status' + (notice.error ? ' is-error' : ''), role: notice.error ? 'alert' : 'status' }, notice.text) : null,
            button({ type: 'button', className: 'fg-settings-button', disabled: !dirty, onClick: reloadStaged }, '放弃更改'),
            button({ type: 'submit', primary: true, className: 'fg-settings-button primary', disabled: !dirty }, '保存设置'),
          ),
        ),
      )
    }


    // 横向滚动行：滚轮纵转横。React 根节点的 wheel 监听是 passive（preventDefault 会告警且无效），故挂原生非 passive
    function HRow(props) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const node = ref.current
        if (!node) return undefined
        const onWheel = (e) => {
          if (!e.deltaY || e.deltaX) return
          node.scrollLeft += e.deltaY
          e.preventDefault()
        }
        node.addEventListener('wheel', onWheel, { passive: false })
        return () => { try { node.removeEventListener('wheel', onWheel) } catch (e) {} }
      }, [])
      return React.createElement('div', { className: props.className, ref }, props.children)
    }

    function Drawer(props) {
      const drawerOpen = useOpenState()
      const sidebarActive = useIntegrationActive()
      const embedded = Boolean(props.embedded)
      const isOpen = embedded ? props.visible !== false : drawerOpen
      // 三态停靠：right 右侧栏 / full 全占右侧（贴侧边栏右缘起占满）/ float 浮动
      // 兼容旧版 docked 布尔（docked:false → float；docked:true/无 → right）与已移除的 bottom → right
      const [dockMode, setDockMode] = React.useState(() => {
        if (RT.bundleId === 'flow') return 'right'
        const s = lsRead()
        if (s && (s.dockMode === 'right' || s.dockMode === 'full' || s.dockMode === 'float')) {
          return s.dockMode
        }
        return (s && s.docked === false) ? 'float' : 'right'
      })
      const docked = dockMode !== 'float' // 右/底都算停靠（不用浮动 pos）
      const setDocked = (v) => setDockMode(v ? 'right' : 'float') // 旧调用点兼容（吸附右边缘）
      const [pos, setPos] = React.useState(() => { const s = lsRead(); return s && s.pos && typeof s.pos.x === 'number' && typeof s.pos.y === 'number' ? s.pos : null })
      const [drag, setDrag] = React.useState(null)
      const [width, setWidth] = React.useState(() => { const s = lsRead(); return s && typeof s.width === 'number' ? s.width : null })
      const [height, setHeight] = React.useState(() => { const s = lsRead(); return s && typeof s.height === 'number' ? s.height : null })
      const [snapHint, setSnapHint] = React.useState(false)
      const [resize, setResize] = React.useState(null)
      const [tools, setTools] = React.useState([])
      const toolsRef = React.useRef([]) // 最新工具列表（延迟回调里判断 active 是否仍有效）
      toolsRef.current = tools
      const [active, setActive] = React.useState(() => { const s = lsRead(); return s && typeof s.active === 'string' ? s.active : null })
      const [autoMs, setAutoMs] = React.useState({}) // toolId -> 自动刷新毫秒（面板 HTML 声明 data-autorefresh 驱动）
      const [tabBadges, setTabBadges] = React.useState({}) // toolId -> Tab 角标文本（面板 HTML 声明 data-tab-badge 驱动；借鉴 better-sidebar tab 角标）
      const [html, setHtml] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [flowSyncFailure, setFlowSyncFailure] = React.useState(false)
      const [copied, setCopied] = React.useState(null)
      const [flowMarkdownPreviewKey, setFlowMarkdownPreviewKey] = React.useState(null)
      const flowMarkdownDisabledKeyRef = React.useRef(null)
      const [flowMarkdownPortal, setFlowMarkdownPortal] = React.useState(null)
      const [busyTool, setBusyTool] = React.useState(null)
      const [showJumpLatest, setShowJumpLatest] = React.useState(false)
      const [flowZoom, setFlowZoom] = React.useState(() => {
        try { const n = Number(localStorage.getItem(RT.storageKey('flow.zoom'))); return n >= 60 && n <= 150 ? n : 100 } catch (e) { return 100 }
      })
      const [flowZen, setFlowZen] = React.useState(false)
      const [flowSelectedSeqs, setFlowSelectedSeqs] = React.useState([])
      const [flowTargetSession, setFlowTargetSession] = React.useState('')
      const [flowBringPopup, setFlowBringPopup] = React.useState(false)
      const [flowAddPopup, setFlowAddPopup] = React.useState(false)
      const [flowAddTargetSession, setFlowAddTargetSession] = React.useState('')
      const [flowAddAnchor, setFlowAddAnchor] = React.useState(null)
      const [flowTreeOpen, setFlowTreeOpen] = React.useState({})
      const [flowUiBusy, setFlowUiBusy] = React.useState(false)
      const [flowBookmarks, setFlowBookmarks] = React.useState([])
      const [flowWorkbench, setFlowWorkbench] = React.useState(null)
      const [flowLaunchBatch, setFlowLaunchBatch] = React.useState(null)
      const flowLaunchBusyRef = React.useRef(false)
      const [flowUiNotice, setFlowUiNotice] = React.useState('')
      // 大流镜 Zoom 会话互通：⇪ 带入后点选目标会话；普通“选择会话”入口已移除。
      const [zoomPick, setZoomPick] = React.useState([])
      const [zoomRelay, setZoomRelay] = React.useState(null) // { source, text } | null
      const zoomPromptRef = React.useRef('') // 开工台输入镜像（面板全量重渲染后恢复；模型分支调整经 Host RPC 也不丢）
      const flowMindMapPositionsRef = React.useRef(new Map()) // scope/node -> 手工布局；静默刷新后恢复
      const flowMindMapViewportRef = React.useRef(new Map()) // workspace/session/history -> zoom, scroll and selected node
      const readSessionsSnapshot = () => {
        if (RT.bundleId !== 'flow') return undefined
        try {
          const list = sessionsClient && sessionsClient.list
          return list && typeof list.getSnapshot === 'function' ? list.getSnapshot() : undefined
        } catch (e) { return undefined }
      }
      const [serviceSessionsSnapshot, setServiceSessionsSnapshot] = React.useState(readSessionsSnapshot)
      const [managing, setManaging] = React.useState(false)
      const [plugins, setPlugins] = React.useState([])
      const [pluginCaps, setPluginCaps] = React.useState(null) // Host 半 capabilities（编译模式降级 UI 依据；null=未加载，按全能力渲染）
      const canRebuildFromDisk = !pluginCaps || pluginCaps.rebuildFromDisk !== false
      const canAiUsage = !pluginCaps || pluginCaps.aiUsage !== false
      const [rebuilding, setRebuilding] = React.useState(false)
      const [rebuildLines, setRebuildLines] = React.useState(null)
      const [rebuildHistory, setRebuildHistory] = React.useState([])
      const [aiUsage, setAiUsage] = React.useState(null)
      const [pluginFilter, setPluginFilter] = React.useState('')
      const [hideHostOnly, setHideHostOnly] = React.useState(panelHide.on) // 「隐藏无界面」开关（管理页 + 左下角 Cordis 面板联动，localStorage 持久化）
      const [tabFilter, setTabFilter] = React.useState('') // 工具搜索（整行长条；仅会话内存）
      const [cat, setCat] = React.useState(() => { const s = lsRead(); return s && typeof s.cat === 'string' ? s.cat : 'ai' }) // 激活分类（localStorage 记忆）
      const [activeByCat, setActiveByCat] = React.useState(() => { const s = lsRead(); return (s && s.activeByCat && typeof s.activeByCat === 'object') ? s.activeByCat : {} }) // 各分类最近选中的工具（切分类时恢复）
      const [catOverrides, setCatOverrides] = React.useState(() => { const s = catsRead(); return (s && s.overrides && typeof s.overrides === 'object') ? s.overrides : {} }) // 管理树拖拽改归属的结果
      // refreshTools 在抽屉关闭的首帧 effect 中也可能立即拿到静态工具清单；必须在任何 early return 前初始化。
      const catOf = (id) => catOverrides[id] || DEFAULT_CAT[id] || 'dev'
      const [collapsedCats, setCollapsedCats] = React.useState(() => { const s = catsRead(); return (s && s.collapsed && typeof s.collapsed === 'object') ? s.collapsed : {} })
      const [dragId, setDragId] = React.useState(null) // 管理树正在拖拽的条目 id（entryId）
      // 明暗主题：theme 服务持有偏好；ThemeSnapshot 无顶层 colorScheme，生效明暗在 snapshot.active.colorScheme
      const schemeOf = (snap) => {
        const c = snap && snap.active && snap.active.colorScheme
        if (c === 'dark' || c === 'light') return c
        const top = snap && snap.colorScheme
        return (top === 'dark' || top === 'light') ? top : null
      }
      const [themeScheme, setThemeScheme] = React.useState(() => {
        try { return (themeSvc && schemeOf(themeSvc.getTheme())) || 'dark' } catch (e) { return 'dark' }
      })
      React.useEffect(() => {
        if (!themeSvc) return undefined
        const off = ctx.on('theme/change', (snap) => {
          try { const c = schemeOf(snap); if (c) setThemeScheme(c) } catch (e) {}
        })
        return typeof off === 'function' ? off : undefined
      }, [])
      const toggleTheme = () => {
        if (!themeSvc) return
        try {
          const cur = schemeOf(themeSvc.getTheme()) || themeScheme
          themeSvc.setTheme(cur === 'dark' ? 'light' : 'dark')
        } catch (e) {}
      }

      // ---- 画中画（Document PiP）：主抽屉 DOM 的实时镜像（不是独立实现） ----
      // 原则：主抽屉 React 树是唯一事实源；pip 窗口显示其 DOM 克隆（MutationObserver debounce 同步），
      // 交互事件按索引路径代理回主 DOM 触发——两种模式显示与行为完全一致；
      // 主抽屉全程照常运行（轮询/状态不受影响）；pip 未开启时零开销、零影响。
      // ⚠️ 整体禁用开关：所有情况下都不渲染画中画按钮、不开启 PiP 窗口（当前为 false，
      // 已按需求把所有情况下的画中画都关掉）；恢复时改回 true 即可，其余逻辑无需变动。
      const PIP_ENABLED = false
      const pipRef = React.useRef(null) // { win, mo, syncTimer, themeOff, enlarged, baseW, baseH } | null
      const [pipOn, setPipOn] = React.useState(false)
      const [mainHidden, setMainHidden] = React.useState(false) // pip 期间主抽屉可视觉隐藏（DOM 存活：镜像源与轮询不断）
      const pipSupported = PIP_ENABLED && typeof window !== 'undefined' && Boolean(window.documentPictureInPicture)
      const closePip = () => {
        const cur = pipRef.current
        pipRef.current = null
        setPipOn(false)
        setMainHidden(false)
        if (!cur) return
        try { if (cur.mo) cur.mo.disconnect() } catch (e) {}
        try { if (cur.syncTimer) clearTimeout(cur.syncTimer) } catch (e) {}
        try { if (typeof cur.themeOff === 'function') cur.themeOff() } catch (e) {}
        try { cur.win.close() } catch (e) {}
      }
      // 侧边栏重新点开抽屉 → 取消视觉隐藏；抽屉被真正关闭 → 联动关 pip（镜像源消失）
      React.useEffect(() => {
        if (isOpen && mainHidden) setMainHidden(false)
        if (!isOpen && pipRef.current) closePip()
      }, [isOpen])
      // 组件卸载/插件重跑 → 必关 pip（防孤儿窗）
      React.useEffect(() => () => {
        const cur = pipRef.current
        pipRef.current = null
        if (!cur) return
        try { if (cur.mo) cur.mo.disconnect() } catch (e) {}
        try { if (cur.syncTimer) clearTimeout(cur.syncTimer) } catch (e) {}
        try { cur.win.close() } catch (e) {}
      }, [])

      // 索引路径：镜像内元素 ↔ 主抽屉元素（cloneNode 同构，children 索引一一对应）
      const pathOf = (el, root) => {
        const p = []
        let n = el
        while (n && n !== root) {
          const parent = n.parentElement
          if (!parent) return null
          p.unshift(Array.prototype.indexOf.call(parent.children, n))
          n = parent
        }
        return n === root ? p : null
      }
      const byPath = (root, path) => {
        let n = root
        for (const i of path) {
          if (!n || !n.children || i >= n.children.length) return null
          n = n.children[i]
        }
        return n
      }

      const openPip = async () => {
        if (pipRef.current) { closePip(); return }
        if (!pipSupported) return
        const src0 = drawerRef.current
        if (!src0) return
        try {
          const win = await window.documentPictureInPicture.requestWindow({ width: Math.max(560, width || 520), height: Math.round((window.screen ? window.screen.availHeight : 900) * 0.8) })
          // 1. 克隆样式表（link 克隆 / style 标签深克隆；tb- 设计系统与宿主 dsw- 变量一并带走）
          for (const sheet of document.styleSheets) {
            try {
              if (sheet.href) { const l = win.document.createElement('link'); l.rel = 'stylesheet'; l.href = sheet.href; win.document.head.appendChild(l) }
              else if (sheet.ownerNode) win.document.head.appendChild(sheet.ownerNode.cloneNode(true))
            } catch (e) {}
          }
          // 2. 主题同步（body[data-ds-dark-theme] + colorScheme；theme/change 跟随）
          const syncTheme = () => {
            try {
              const dark = document.body.hasAttribute('data-ds-dark-theme')
              win.document.body.toggleAttribute('data-ds-dark-theme', dark)
              win.document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
            } catch (e) {}
          }
          syncTheme()
          win.document.title = RT.displayName + ' · 画中画'
          win.document.body.style.margin = '0'
          // 3. 结构：顶部工具条（pip 原生，非镜像）+ 镜像容器
          const rootEl = win.document.createElement('div')
          rootEl.className = 'jr-pip-root'
          // PiP 克隆保留 bundle root attribute（主题变量/CSS scope 挂在 bundle root 上）
          rootEl.setAttribute('data-dsh-toolbox-root', RT.bundleId)
          const barEl = win.document.createElement('div')
          barEl.className = 'jr-pip-bar'
          const barTitle = win.document.createElement('span')
          barTitle.className = 'jr-pip-bar-title'
          barTitle.textContent = compactDisplayName + ' · 画中画（内容与主窗口一致，操作实时同步）'
          barTitle.title = fullDisplayName
          const btnMax = win.document.createElement('button')
          btnMax.className = 'jr-pip-bar-btn'
          btnMax.textContent = '⤢ 放大'
          btnMax.title = '放大到屏幕 72%×88%（再点还原）'
          const btnBack = win.document.createElement('button')
          btnBack.className = 'jr-pip-bar-btn'
          btnBack.textContent = '✕ 回主窗口'
          btnBack.title = '关闭画中画，回主窗口抽屉'
          barEl.appendChild(barTitle)
          barEl.appendChild(btnMax)
          barEl.appendChild(btnBack)
          const mirrorEl = win.document.createElement('div')
          mirrorEl.className = 'jr-pip-mirror'
          rootEl.appendChild(barEl)
          rootEl.appendChild(mirrorEl)
          win.document.body.appendChild(rootEl)
          const entry = { win, mo: null, syncTimer: null, themeOff: null, enlarged: false, baseW: 0, baseH: 0 }
          pipRef.current = entry
          setPipOn(true)
          // 4. 镜像同步（整体重克隆 + 滚动/焦点恢复；MutationObserver debounce 合并突变批次）
          const resync = () => {
            if (pipRef.current !== entry) return
            const src = drawerRef.current
            if (!src) return
            const scrolls = []
            try {
              const ss = mirrorEl.querySelectorAll('.tb-pane-body, .tb-code, .fl-pre, .tb-desc, .jr-drawer-body, .tb-hrow')
              for (const s of ss) {
                const p = pathOf(s, mirrorEl)
                if (p) scrolls.push([p, s.scrollTop, s.scrollLeft])
              }
            } catch (e) {}
            let focusPath = null, selStart = null, selEnd = null
            try {
              const ae = win.document.activeElement
              if (ae && mirrorEl.contains(ae)) {
                focusPath = pathOf(ae, mirrorEl)
                if (typeof ae.selectionStart === 'number') { selStart = ae.selectionStart; selEnd = ae.selectionEnd }
              }
            } catch (e) {}
            const clone = src.cloneNode(true)
            // 脱离 fixed 外壳语义（充满 pip 窗口）；主抽屉被视觉隐藏时镜像保持可见
            clone.style.position = 'static'
            clone.style.left = 'auto'; clone.style.right = 'auto'; clone.style.top = 'auto'; clone.style.bottom = 'auto'
            clone.style.width = '100%'; clone.style.height = '100%'
            clone.style.maxWidth = 'none'; clone.style.maxHeight = 'none'
            clone.style.animation = 'none'; clone.style.boxShadow = 'none'; clone.style.borderRadius = '0'; clone.style.border = 'none'
            clone.style.visibility = 'visible'; clone.style.pointerEvents = 'auto'
            mirrorEl.innerHTML = ''
            mirrorEl.appendChild(clone)
            try { for (const [p, st, sl] of scrolls) { const el = byPath(mirrorEl, p); if (el) { el.scrollTop = st; el.scrollLeft = sl } } } catch (e) {}
            if (focusPath) {
              try {
                const el = byPath(mirrorEl, focusPath)
                if (el && typeof el.focus === 'function') {
                  el.focus()
                  if (selStart != null && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(selStart, selEnd) } catch (e2) {} }
                }
              } catch (e) {}
            }
          }
          resync()
          entry.mo = new MutationObserver(() => {
            if (entry.syncTimer) clearTimeout(entry.syncTimer)
            entry.syncTimer = setTimeout(() => { entry.syncTimer = null; resync() }, 40)
          })
          entry.mo.observe(src0, { subtree: true, childList: true, attributes: true, characterData: true })
          // 5. 事件代理（镜像 → 主 DOM）：click/input/change/keydown 按索引路径回放，
          //    React 合成事件在主端 root 正常触发；pip 端 preventDefault 防双重状态
          const relay = (e) => {
            const t = e.target
            if (!t || !mirrorEl.contains(t)) return
            const p = pathOf(t, mirrorEl)
            const src = drawerRef.current
            if (!p || !src) return
            const main = byPath(src, p)
            if (!main) return
            if (e.type === 'click') {
              e.preventDefault()
              main.click()
            } else if (e.type === 'input') {
              try {
                const proto = main.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
                const desc = Object.getOwnPropertyDescriptor(proto, 'value')
                if (desc && desc.set) desc.set.call(main, t.value)
                else main.value = t.value
                main.dispatchEvent(new Event('input', { bubbles: true }))
              } catch (err) {}
            } else if (e.type === 'change') {
              try {
                if (main.tagName === 'SELECT') {
                  main.value = t.value
                  main.dispatchEvent(new Event('change', { bubbles: true }))
                } else if (main.type === 'checkbox' || main.type === 'radio') {
                  main.click()
                } else {
                  main.value = t.value
                  main.dispatchEvent(new Event('change', { bubbles: true }))
                }
              } catch (err) {}
            } else if (e.type === 'keydown') {
              try { main.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true })) } catch (err) {}
            }
          }
          for (const type of ['click', 'input', 'change', 'keydown']) mirrorEl.addEventListener(type, relay)
          // 6. 工具条：放大/还原（resizeTo + moveTo 居中）；回主窗口
          btnBack.onclick = () => closePip()
          btnMax.onclick = () => {
            try {
              if (!entry.enlarged) {
                entry.baseW = win.outerWidth; entry.baseH = win.outerHeight
                const sw = window.screen ? window.screen.availWidth : 1600
                const sh = window.screen ? window.screen.availHeight : 900
                const w = Math.round(sw * 0.72), h = Math.round(sh * 0.88)
                win.resizeTo(w, h)
                win.moveTo(Math.round((sw - w) / 2), Math.round((sh - h) / 2))
                entry.enlarged = true
                btnMax.textContent = '⤡ 还原'
              } else {
                win.resizeTo(entry.baseW || 560, entry.baseH || 620)
                entry.enlarged = false
                btnMax.textContent = '⤢ 放大'
              }
            } catch (err) {}
          }
          // 7. 主题跟随 + pip 窗口被关（系统 X）→ 释放
          if (themeSvc) entry.themeOff = ctx.on('theme/change', () => syncTheme())
          win.addEventListener('pagehide', () => {
            if (pipRef.current === entry) { pipRef.current = null; setPipOn(false); setMainHidden(false) }
            if (entry.syncTimer) { try { clearTimeout(entry.syncTimer) } catch (e) {} }
            if (entry.mo) { try { entry.mo.disconnect() } catch (e) {} }
            if (typeof entry.themeOff === 'function') { try { entry.themeOff() } catch (e) {} }
          })
          // 并存模型：不关主抽屉（它是镜像事实源，轮询照跑）；用户可点主抽屉 X 仅视觉隐藏（mainHidden）
        } catch (e) {}
      }
      const drawerRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const stateRef = React.useRef({})
      const htmlRef = React.useRef({})
      const htmlScrollRef = React.useRef(null) // 静默刷新前记录的滚动位置（effect 里恢复，防自动刷新打断阅读）
      const flowDisclosureRef = React.useRef(new Map())
      const flowConclusionSelectionRef = React.useRef(new Map())
      const flowFocusRef = React.useRef(null)
      React.useLayoutEffect(() => {
        const label = active === 'flow' && panelRef.current && panelRef.current.querySelector('[data-flow-sync-state]')
        if (!label) return
        label.textContent = flowSyncFailure ? '同步失败' : label.getAttribute('data-flow-sync-state') === 'paused' ? '已暂停同步' : busyTool === 'flow' ? '更新中' : '已同步'
      }, [active, html, busyTool, flowSyncFailure])
      const seqRef = React.useRef({}) // toolId -> 最新请求序号：丢弃过期响应，防 provider/模型联动竞态
      const interactiveActionSeqRef = React.useRef({}) // toolId -> 在途显式动作；后台重挂/轮询不得抢占用户点击
      // 流程右侧调用卡的最短动画跨 innerHTML 轮询续播：scope 隔离主/子会话，key 对应调用 seq。
      const flowAnimRef = React.useRef({ scope: null, visible: 0, seen: new Set(), expires: new Map(), introEnds: new Map(), statuses: new Map(), outputStarts: new Map(), outputExpires: new Map(), timers: new Map() })
      const managingRef = React.useRef(false)
      managingRef.current = managing
      const activeRef = React.useRef(null) // 延迟回调里取最新 active（重启落定后的面板刷新）
      activeRef.current = active
      const openRef = React.useRef(isOpen) // 固定右侧兜底面板或嵌入 Tab 的统一可见状态
      openRef.current = isOpen
      const retryCountRef = React.useRef({}) // toolId -> 面板加载失败重试次数（一次性重试，非轮询；成功清零）
      const attemptedRef = React.useRef({}) // toolId -> 面板请求已发起（首开死锁兜底用：tools 补齐后补打一次，之后不再重复）
      const flowOlderLoadingRef = React.useRef(false) // 滚到 Flowglass 顶部时每次只发一个增量请求
      const lastPanelActiveRef = React.useRef(null) // 离开再返回 Flowglass 时重置为最近 60 条
      const flowScrollByScopeRef = React.useRef(new Map()) // 主/子流镜各自的阅读位置
      const flowScrollIntentRef = React.useRef(null) // enter=新子流镜到底；back=恢复上级
      const flowSuppressHistoryAnimRef = React.useRef(false) // 向上加载的历史节点不播放“新事件”动画
      const flowFollowStateBySessionRef = React.useRef(new Map()) // Harness 跟随切换后重建 Flowglass crumbs
      const flowHarnessNavTargetRef = React.useRef(null) // 只有 Flowglass 主动导航的目标会话才恢复返回链
      const suppressFlowClickUntilRef = React.useRef(0)
      const sidebarSessionMenuRef = React.useRef(null) // 原生左栏三点菜单最近一次所属 Session

      const exitFlowZen = async () => {
        const el = drawerRef.current
        try {
          if (typeof document !== 'undefined' && document.fullscreenElement === el && typeof document.exitFullscreen === 'function') await document.exitFullscreen()
        } catch (e) {}
        setFlowZen(false)
      }

      const toggleFlowZen = async () => {
        if (flowZen) { await exitFlowZen(); return }
        const el = drawerRef.current
        setFlowZen(true) // 先进入 CSS 全视口 Zen，Fullscreen API 被禁时仍可用。
        if (!el || typeof el.requestFullscreen !== 'function') return
        try { await el.requestFullscreen() }
        catch (e) { setError('浏览器拒绝原生全屏，已回退到视口 Zen 模式') }
      }

      // 停靠模式/激活 Tab/分类工具记忆变化即落盘（宽/高/浮动位置在手势结束时单独落盘，避免每帧写）
      React.useEffect(() => { lsWrite({ dockMode, active, activeByCat }) }, [dockMode, active, activeByCat])

      // Better Sidebar 的外部 Tab 契约只给当前 scope，不给 useSessions。
      // Drawer 直接订阅 DSH SessionRuntime.list，为工作区会话树提供完整、实时的 ids/byId。
      React.useEffect(() => {
        if (RT.bundleId !== 'flow') return undefined
        const list = sessionsClient && sessionsClient.list
        if (!list || typeof list.getSnapshot !== 'function') return undefined
        const sync = () => setServiceSessionsSnapshot(readSessionsSnapshot())
        sync()
        if (typeof list.subscribe !== 'function') return undefined
        const off = list.subscribe(sync)
        return typeof off === 'function' ? off : undefined
      }, [])

      // 完整工具箱的挤压三栏：full 模式给主内容列（DSH grid 的 centerCol）加 margin-right 让出抽屉宽度，
      // 聊天区收缩而非被覆盖（grid 项 margin 在轨道内生效，不影响侧边栏轨道）；
      // 关闭抽屉/切模式还原，拖拽调宽实时跟随；React 不管该列内联 style，不会被覆盖
      React.useEffect(() => {
        // Flowglass 固定右侧兜底面板必须是纯 overlay；Harness 已拥有右侧栏列，
        // 再改 centerCol 会把主会话二次挤到左侧。
        if (RT.bundleId === 'flow' || embedded || !isOpen || dockMode !== 'full') return undefined
        const col = typeof document !== 'undefined' ? document.querySelector('[class*="centerCol"]') : null
        if (!col) return undefined
        const w = width || 560
        const prev = col.style.marginRight
        col.style.marginRight = w + 'px'
        return () => { col.style.marginRight = prev }
      }, [embedded, isOpen, dockMode, width])

      // Native disclosures and explicit inspector navigation survive Host HTML replacement.
      // Keep this local to a workspace/session; no Session events or persisted preferences change.
      React.useLayoutEffect(() => {
        const root = panelRef.current
        const flow = active === 'flow' && root && root.querySelector('[data-flow]')
        if (!flow) return undefined
        const scope = currentCwd + '\u0001' + (flow.getAttribute('data-flow-scope') || '')
        const disclosures = flowDisclosureRef.current
        const conclusions = flowConclusionSelectionRef.current.get(scope)
        if (conclusions) for (const node of flow.querySelectorAll('[data-flow-conclusion]')) node.checked = conclusions.has(node.getAttribute('data-node-key'))
        for (const details of flow.querySelectorAll('details[data-flow-disclosure]')) {
          const key = scope + '\u0001' + details.getAttribute('data-flow-disclosure')
          if (disclosures.has(key)) details.open = disclosures.get(key)
        }
        const onToggle = (event) => {
          const details = event.target
          if (!details.matches || !details.matches('details[data-flow-disclosure]')) return
          disclosures.set(scope + '\u0001' + details.getAttribute('data-flow-disclosure'), details.open)
          // Bound local UI state in long-lived panels.
          if (disclosures.size > 500) disclosures.delete(disclosures.keys().next().value)
        }
        flow.addEventListener('toggle', onToggle, true)
        const pending = flowFocusRef.current
        if (pending) {
          flowFocusRef.current = null
          if (pending.scope === scope) {
            const rail = flow.querySelector('[data-flow-inspector]')
            let target = rail && rail.querySelector('.fl-rail-x')
            if (!rail) target = [...flow.querySelectorAll('[data-action="fdetail"][data-seq]')]
              .find((node) => node.getAttribute('data-seq') === pending.seq && !node.closest('.fl-rail'))
            if (target && typeof target.focus === 'function') target.focus({ preventScroll: true })
          }
        }
        const inspector = flow.querySelector('[data-flow-inspector]')
        const updateInspectorMode = () => {
          const modal = !!inspector && flow.clientWidth < 1200
          if (inspector) {
            inspector.setAttribute('role', modal ? 'dialog' : 'region')
            if (modal) inspector.setAttribute('aria-modal', 'true')
            else inspector.removeAttribute('aria-modal')
          }
          for (const child of flow.children) if (child !== inspector) child.inert = modal
        }
        updateInspectorMode()
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateInspectorMode) : null
        if (observer) observer.observe(flow)
        return () => {
          flow.removeEventListener('toggle', onToggle, true)
          if (observer) observer.disconnect()
          for (const child of flow.children) child.inert = false
        }
      }, [active, html])

      // 静默刷新后恢复滚动位置（loadPanel 在 setHtml 前把各滚动容器 scrollTop 记进 htmlScrollRef）
      React.useLayoutEffect(() => {
        if (!panelRef.current) return
        const flowIntent = flowScrollIntentRef.current
        const flow = panelRef.current.querySelector('[data-flow][data-flow-scope]')
        if (flowIntent && flow) {
          flowScrollIntentRef.current = null
          htmlScrollRef.current = null
          const body = flow.querySelector('.tb-pane-body')
          if (body) {
            const scope = flow.getAttribute('data-flow-scope') || ''
            if (flowIntent === 'back' && flowScrollByScopeRef.current.has(scope)) {
              body.scrollTop = flowScrollByScopeRef.current.get(scope)
            } else {
              // column-reverse 的视觉底部是 scrollTop=0。
              body.scrollTop = body.classList.contains('tb-pane-col') ? body.scrollHeight : 0
            }
          }
          return
        }
        // 明确声明默认到底部的正常方向面板（当前为「上下文」）优先于旧 Tab 的滚动位置恢复。
        const defaultBottom = panelRef.current.querySelector('[data-scroll-default="bottom"]')
        if (defaultBottom) {
          try { defaultBottom.scrollTop = defaultBottom.scrollHeight } catch (e) {}
          htmlScrollRef.current = null
          return
        }
        const saved = htmlScrollRef.current
        htmlScrollRef.current = null
        if (saved && saved.tool === activeRef.current) {
          try {
            const scrollers = panelRef.current.querySelectorAll('.tb-pane-body, .tb-code, .fl-pre, .tb-desc')
            scrollers.forEach((s, i) => {
              const position = saved.scrolls[i]
              if (position == null) return
              s.scrollTop = typeof position === 'number' ? position : position.bottom ? (s.classList.contains('tb-pane-col') ? s.scrollHeight : 0) : position.top
              if (typeof position === 'object') s.scrollLeft = position.left
            })
          } catch (e) {}
          return
        }
        // 切工具/新面板不恢复旧位置：正常方向（tb-pane-col）容器默认滚到最底查看
        // （上下文/提示词/搜索/Jira/谱系等；column-reverse 面板天然贴底，无需处理）
        try {
          panelRef.current.querySelectorAll('.tb-pane-body.tb-pane-col').forEach((s) => { s.scrollTop = s.scrollHeight })
        } catch (e) {}
      }, [html])

      // 详情侧拉框拖拽调宽。直接走 React 面板事件，确保 Better Sidebar 嵌入态
      // 也能命中；开始后 capture pointer，并阻断外层侧栏自己的拖拽处理。
      function onFlowRailResizeDown(e) {
        if (active !== 'flow' || e.button !== 0) return
        const t = e.target
        const handle = t && typeof t.closest === 'function' ? t.closest('.fl-rail-resize') : null
        if (!handle) return
        const rail = handle.closest('.fl-rail')
        const pane = rail && rail.closest('.tb-pane')
        if (!rail || !pane) return
        e.preventDefault()
        e.stopPropagation()
        const startW = rail.getBoundingClientRect().width
        const startX = e.clientX
        const pointerId = e.pointerId
        const maxW = Math.max(320, Math.round(pane.getBoundingClientRect().width * 0.85))
        let lastW = Math.round(startW)
        rail.classList.add('fl-rail-dragging')
        try { handle.setPointerCapture(pointerId) } catch (err) {}
        try { document.body.style.userSelect = 'none' } catch (err) {}
        const onMove = (ev) => {
          if (ev.pointerId !== pointerId) return
          lastW = Math.round(Math.min(maxW, Math.max(240, startW + (startX - ev.clientX))))
          rail.style.setProperty('--fl-rail-w', lastW + 'px')
        }
        const onUp = (ev) => {
          if (ev.pointerId !== pointerId) return
          rail.classList.remove('fl-rail-dragging')
          try { handle.releasePointerCapture(pointerId) } catch (err) {}
          try { document.body.style.userSelect = '' } catch (err) {}
          document.removeEventListener('pointermove', onMove)
          document.removeEventListener('pointerup', onUp)
          document.removeEventListener('pointercancel', onUp)
          appearanceWrite({ railW: lastW })
        }
        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
        document.addEventListener('pointercancel', onUp)
      }

      // header + 独立滚动区的原设计：离开主列表底部 40px 后显示浮标。
      // dangerouslySetInnerHTML 会替换面板 DOM，因此随 html/Tab 重新挂载捕获阶段 scroll 监听。
      React.useEffect(() => {
        if (!isOpen || managing) { setShowJumpLatest(false); return undefined }
        const root = panelRef.current
        if (!root) { setShowJumpLatest(false); return undefined }
        const primary = () => root.querySelector('.tb-pane-body')
        const update = (body) => {
          if (!body) { setShowJumpLatest(false); return }
          const away = body.classList.contains('tb-pane-col')
            ? (body.scrollHeight - body.scrollTop - body.clientHeight > 40)
            : (Math.abs(body.scrollTop) > 40)
          setShowJumpLatest(away)
        }
        const onScroll = (e) => {
          const body = primary()
          if (!body || e.target !== body) return // 排除 .fl-pre / 详情浮层等内部滚动区
          update(body)
        }
        update(primary())
        root.addEventListener('scroll', onScroll, true)
        return () => { try { root.removeEventListener('scroll', onScroll, true) } catch (e) {} }
      }, [isOpen, managing, active, html])

      const jumpToLatest = () => {
        const body = panelRef.current && panelRef.current.querySelector('.tb-pane-body')
        if (!body) return
        const top = body.classList.contains('tb-pane-col') ? body.scrollHeight : 0
        try { body.scrollTo({ top, behavior: 'smooth' }) } catch (e) { body.scrollTop = top }
        setShowJumpLatest(false)
      }

      // 新调用固定先走完 1.5s（输入 .5s + 流光 1s）；返回动画由 pending → 完成/失败的真实状态触发。
      // dangerouslySetInnerHTML 会整块替换卡片 DOM，因此用调用 key 保存截止时间，并在每次替换后把类续挂到新节点。
      React.useEffect(() => {
        const box = panelRef.current
        const flow = box && box.querySelector('[data-flow][data-flow-scope]')
        const store = flowAnimRef.current
        const clearStore = () => {
          for (const timer of store.timers.values()) { try { clearTimeout(timer) } catch (e) {} }
          store.timers.clear()
          store.expires.clear()
          store.introEnds.clear()
          store.statuses.clear()
          store.outputStarts.clear()
          store.outputExpires.clear()
          store.seen.clear()
        }
        if (active !== 'flow' || !flow) {
          if (store.scope != null) clearStore()
          store.scope = null
          return
        }
        const scope = flow.getAttribute('data-flow-scope') || ''
        const visible = Math.max(0, Number(flow.getAttribute('data-flow-visible')) || 0)
        const historyExpanded = store.scope === scope && visible > (store.visible || 0)
        const cards = [...flow.querySelectorAll('.fl-wp[data-flow-card]')]
        const mainSelector = '.fl-node[data-flow-main-card][data-flow-role="user"],.fl-node[data-flow-main-card][data-flow-role="ai"]'
        const mainCards = [...flow.querySelectorAll(mainSelector)]
        if (store.scope !== scope) {
          clearStore()
          store.scope = scope
          // 首次打开建立历史基线，但最新用户卡不能被吞掉：它通常就是触发本轮流程的当前消息。
          // DOM 因 column-reverse 不是时间顺序，按 seq 数值找最新用户卡。
          for (const card of cards) {
            const key = card.getAttribute('data-flow-card') || ''
            store.seen.add(key)
            if (key) store.statuses.set(key, card.getAttribute('data-flow-status') || 'pending')
          }
          let latestUserKey = ''
          let latestUserSeq = -Infinity
          for (const card of mainCards) {
            const rawKey = card.getAttribute('data-flow-main-card') || ''
            const seq = Number(rawKey)
            if (card.getAttribute('data-flow-role') === 'user' && Number.isFinite(seq) && seq > latestUserSeq) {
              latestUserSeq = seq
              latestUserKey = rawKey
            }
          }
          for (const card of mainCards) {
            const rawKey = card.getAttribute('data-flow-main-card') || ''
            if (rawKey !== latestUserKey) store.seen.add('main:' + rawKey)
          }
        }
        store.visible = visible
        if (flowSuppressHistoryAnimRef.current || historyExpanded) {
          // fmore 只是展开旧历史，不是新事件到达：把本次新出现的旧卡直接并入基线。
          flowSuppressHistoryAnimRef.current = false
          for (const card of cards) {
            const key = card.getAttribute('data-flow-card') || ''
            if (key) {
              store.seen.add(key)
              store.statuses.set(key, card.getAttribute('data-flow-status') || 'pending')
            }
          }
          for (const card of mainCards) {
            const key = card.getAttribute('data-flow-main-card') || ''
            if (key) store.seen.add('main:' + key)
          }
        }
        const now = Date.now()
        for (const card of cards) {
          const key = card.getAttribute('data-flow-card') || ''
          if (!key) continue
          const status = card.getAttribute('data-flow-status') || 'pending'
          const isNew = !store.seen.has(key)
          const previousStatus = store.statuses.get(key)
          if (isNew) {
            store.seen.add(key)
            store.introEnds.set(key, now + 1500)
          }
          const introEnd = store.introEnds.get(key) || 0
          // 首次看到时已经完成，或后续由 pending 变为完成/失败：输出从“至少一圈流光结束”和“真实结束”两者较晚者开始。
          if ((isNew && status !== 'pending') || (previousStatus === 'pending' && status !== 'pending')) {
            const outputStart = Math.max(now, introEnd)
            store.outputStarts.set(key, outputStart)
            store.outputExpires.set(key, outputStart + 500)
          }
          store.statuses.set(key, status)

          if (introEnd > now) {
            // DOM 被轮询替换时用负 delay 从原进度续播，不从 0 重新开始。
            card.style.setProperty('--fl-min-delay', '-' + Math.max(0, 1500 - (introEnd - now)) + 'ms')
            card.classList.add('fl-min-anim')
          }
          const introTimerKey = 'intro:' + key
          if (introEnd > now && !store.timers.has(introTimerKey)) {
            const timer = setTimeout(() => {
              store.timers.delete(introTimerKey)
              store.introEnds.delete(key)
              const currentFlow = panelRef.current && panelRef.current.querySelector('[data-flow][data-flow-scope]')
              if (!currentFlow || (currentFlow.getAttribute('data-flow-scope') || '') !== scope) return
              for (const current of currentFlow.querySelectorAll('.fl-wp[data-flow-card]')) {
                if ((current.getAttribute('data-flow-card') || '') === key) {
                  current.classList.remove('fl-min-anim')
                  current.style.removeProperty('--fl-min-delay')
                }
              }
            }, Math.max(0, introEnd - now))
            store.timers.set(introTimerKey, timer)
          }

          const outputStart = store.outputStarts.get(key) || 0
          const outputEnd = store.outputExpires.get(key) || 0
          if (outputEnd > now) {
            const outputDelay = outputStart > now ? outputStart - now : -(now - outputStart)
            card.style.setProperty('--fl-output-delay', outputDelay + 'ms')
            card.classList.add('fl-output-anim')
          }
          const outputTimerKey = 'output:' + key
          if (outputEnd > now && !store.timers.has(outputTimerKey)) {
            const timer = setTimeout(() => {
              store.timers.delete(outputTimerKey)
              store.outputStarts.delete(key)
              store.outputExpires.delete(key)
              const currentFlow = panelRef.current && panelRef.current.querySelector('[data-flow][data-flow-scope]')
              if (!currentFlow || (currentFlow.getAttribute('data-flow-scope') || '') !== scope) return
              for (const current of currentFlow.querySelectorAll('.fl-wp[data-flow-card]')) {
                if ((current.getAttribute('data-flow-card') || '') === key) {
                  current.classList.remove('fl-output-anim')
                  current.style.removeProperty('--fl-output-delay')
                }
              }
            }, Math.max(0, outputEnd - now))
            store.timers.set(outputTimerKey, timer)
          }
        }
        for (const card of mainCards) {
          const rawKey = card.getAttribute('data-flow-main-card') || ''
          if (!rawKey) continue
          const key = 'main:' + rawKey
          if (!store.seen.has(key)) {
            store.seen.add(key)
            store.expires.set(key, now + 1000)
          }
          const expires = store.expires.get(key) || 0
          if (expires <= now) continue
          card.style.setProperty('--fl-main-delay', '-' + Math.max(0, 1000 - (expires - now)) + 'ms')
          card.classList.add('fl-main-min-anim')
          if (!store.timers.has(key)) {
            const timer = setTimeout(() => {
              store.timers.delete(key)
              store.expires.delete(key)
              const currentFlow = panelRef.current && panelRef.current.querySelector('[data-flow][data-flow-scope]')
              if (!currentFlow || (currentFlow.getAttribute('data-flow-scope') || '') !== scope) return
              for (const current of currentFlow.querySelectorAll(mainSelector)) {
                if ((current.getAttribute('data-flow-main-card') || '') === rawKey) {
                  current.classList.remove('fl-main-min-anim')
                  current.style.removeProperty('--fl-main-delay')
                }
              }
            }, Math.max(0, expires - now))
            store.timers.set(key, timer)
          }
        }
      }, [active, html])

      React.useEffect(() => () => {
        const store = flowAnimRef.current
        for (const timer of store.timers.values()) { try { clearTimeout(timer) } catch (e) {} }
        store.timers.clear()
      }, [])

      // 工具与流式助手的运行耗时不依赖 2s 面板轮询：Client 每 250ms 就地更新一次。
      React.useEffect(() => {
        if (!isOpen || active !== 'flow') return undefined
        const updateTimers = () => {
          const root = panelRef.current
          if (!root) return
          const now = Date.now()
          for (const el of root.querySelectorAll('[data-flow-timer]')) {
            const started = Number(el.getAttribute('data-flow-timer'))
            if (!Number.isFinite(started)) continue
            const ms = Math.max(0, now - started)
            const shown = ms < 1000 ? Math.round(ms) + 'ms' : (ms / 1000).toFixed(1) + 's'
            el.textContent = (el.getAttribute('data-flow-timer-prefix') || '') + shown
          }
        }
        updateTimers()
        const timer = setInterval(updateTimers, 250)
        return () => { try { clearInterval(timer) } catch (e) {} }
      }, [isOpen, active, html])

      // Upgrade controls before paint when an old resident Host returns the
      // pre-icon HTML contract. New Hosts already emit the same controls, so
      // this path is idempotent and only fills missing markup/attributes.
      React.useLayoutEffect(() => {
        if (!isOpen || active !== 'flow') return undefined
        const root = panelRef.current
        if (!root) return undefined
        for (const button of root.querySelectorAll('[data-flow-copy]')) {
          if (!button.querySelector('svg')) button.innerHTML = FLOW_COPY_ICON_HTML
          button.setAttribute('title', '复制内容到剪贴板')
          button.setAttribute('aria-label', '复制内容到剪贴板')
        }
        const target = root.querySelector('[data-flow-markdown-body]')
        const source = target && target.querySelector('[data-flow-markdown-source]')
        if (!target || !source) {
          flowMarkdownDisabledKeyRef.current = null
          return undefined
        }
        let key = target.getAttribute('data-flow-markdown-key') || ''
        if (!key) {
          const close = target.closest('.fl-rail') && target.closest('.fl-rail').querySelector('[data-action="fdetail"][data-seq]')
          key = close ? (close.getAttribute('data-seq') || '') : ''
          if (key) target.setAttribute('data-flow-markdown-key', key)
        }
        let previewButton = target.querySelector('[data-flow-markdown-preview]')
        if (!previewButton && key) {
          previewButton = document.createElement('button')
          previewButton.type = 'button'
          previewButton.className = 'fl-md-preview-btn'
          previewButton.setAttribute('data-flow-markdown-preview', '1')
          previewButton.setAttribute('data-flow-markdown-key', key)
          previewButton.setAttribute('title', 'Markdown 预览')
          previewButton.setAttribute('aria-label', 'Markdown 预览')
          previewButton.setAttribute('aria-pressed', 'false')
          previewButton.innerHTML = FLOW_PREVIEW_ICON_HTML
          const head = source.closest('.fl-sec') && source.closest('.fl-sec').querySelector('.fl-sec-head')
          const copy = head && head.querySelector('[data-flow-copy]')
          if (head) head.insertBefore(previewButton, copy || null)
        }
        // 助手详情与结构化 Skill 说明默认使用官方 Markdown 预览；用户显式切回原文后，
        // 自动刷新保持原文，关闭详情后清掉例外，下次打开恢复预览。
        if (key && !flowMarkdownPreviewKey && flowMarkdownDisabledKeyRef.current !== key) {
          setFlowMarkdownPreviewKey(key)
        }
        return undefined
      }, [isOpen, active, html, flowMarkdownPreviewKey])

      // Host HTML remains the default text view. Only an explicit preview click
      // enables the official Markdown renderer. useLayoutEffect reconnects the
      // portal before paint after Host HTML replacement, avoiding text flashes.
      React.useLayoutEffect(() => {
        if (!flowMarkdownPreviewKey || !flowMarkdownText || !flowCreatePortal || !isOpen || active !== 'flow') {
          setFlowMarkdownPortal((current) => current === null ? current : null)
          return undefined
        }
        const root = panelRef.current
        const target = root && root.querySelector('[data-flow-markdown-body]')
        const source = target && target.querySelector('[data-flow-markdown-source]')
        const key = target && target.getAttribute('data-flow-markdown-key')
        if (!target || !source || key !== flowMarkdownPreviewKey) {
          setFlowMarkdownPreviewKey(null)
          setFlowMarkdownPortal((current) => current === null ? current : null)
          return undefined
        }
        target.setAttribute('data-flow-markdown-enhanced', '1')
        const previewButton = target.querySelector('[data-flow-markdown-preview]')
        if (previewButton) previewButton.setAttribute('aria-pressed', 'true')
        const mount = source.closest('.fl-sec') || target
        const text = String(source.textContent || '')
        const streaming = target.getAttribute('data-flow-markdown-streaming') === '1'
        setFlowMarkdownPortal((current) => current
          && current.target === target && current.mount === mount && current.text === text && current.streaming === streaming
          ? current
          : { target, mount, text, streaming })
        return () => {
          try { target.removeAttribute('data-flow-markdown-enhanced') } catch (e) {}
          try { if (previewButton) previewButton.setAttribute('aria-pressed', 'false') } catch (e) {}
        }
      }, [isOpen, active, html, flowMarkdownPreviewKey])

      // —— 当前会话/工作区解析（v6.5；0.1.5 原生 Tab 优先）——
      // 原生右侧栏 Tab：props.sessionId（Slot 标准属性）是权威来源，永远最先命中；
      // 固定右侧兜底面板（宿主会话下）才用 localStorage['dsh.sessions.current'] 事件桥（SESSION_EVENT，
      // 切会话零延迟）+ useSessions hook（响应式兜底）+ useState 初始化读取（无轮询）。
      // better-sidebar 嵌入态走 props.scope.sessionId（兼容路径，见 FlowglassSidebarView）。
      const readLsSession = () => {
        try {
          if (typeof localStorage === 'undefined') return undefined
          const raw = localStorage.getItem('dsh.sessions.current')
          if (!raw) return undefined
          const p = JSON.parse(raw)
          return p && typeof p.sessionId === 'string' && p.sessionId ? p.sessionId : undefined
        } catch (e) { return undefined }
      }
      const [lsSession, setLsSession] = React.useState(readLsSession)
      // 事件桥响应（v6.5）：app-shell 写 localStorage['dsh.sessions.current'] 的瞬间
      // 触发 SESSION_EVENT（见 apply 层 patch），立即刷新——零延迟，替代轮询主路径。
      React.useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onChanged = () => setLsSession(readLsSession())
        window.addEventListener(SESSION_EVENT, onChanged)
        return () => { try { window.removeEventListener(SESSION_EVENT, onChanged) } catch (e) {} }
      }, [])
      // 插件详情页保存 Flowglass 设置后，同一浏览器窗口立即重拉已打开的流镜。
      React.useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onFlowSettingsChanged = () => {
          if (activeRef.current !== 'flow' || !openRef.current || typeof loadPanelRef.current !== 'function') return
          loadPanelRef.current('flow', '__refresh', null, { silent: true })
        }
        window.addEventListener(FLOW_SETTINGS_EVENT, onFlowSettingsChanged)
        return () => { try { window.removeEventListener(FLOW_SETTINGS_EVENT, onFlowSettingsChanged) } catch (e) {} }
      }, [])
      const hookSession = props.useSessions((s) => (s && s.current ? String(s.current) : undefined))
      const hookFlowSessionIds = props.useSessions((s) => (s ? s.ids : undefined))
      const hookFlowSessionsById = props.useSessions((s) => (s ? s.byId : undefined))
      const useWorkspacesHook = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : () => undefined
      const hookWorkspaceItems = useWorkspacesHook((s) => (s && Array.isArray(s.items) ? s.items : undefined))
      const hookArchivedSessionIds = useWorkspacesHook((s) => (s && Array.isArray(s.archivedSessionIds) ? s.archivedSessionIds : undefined))
      let fallbackArchivedSessionIds = []
      if (!hookArchivedSessionIds && workspacesClient && workspacesClient.list && typeof workspacesClient.list.getSnapshot === 'function') {
        try {
          const snapshot = workspacesClient.list.getSnapshot()
          if (snapshot && Array.isArray(snapshot.archivedSessionIds)) fallbackArchivedSessionIds = snapshot.archivedSessionIds
        } catch (e) {}
      }
      const archivedSessionIds = (hookArchivedSessionIds || fallbackArchivedSessionIds).map(String)
      const archivedSessionSet = new Set(archivedSessionIds)
      const rawFlowSessionIds = hookFlowSessionIds != null
        ? hookFlowSessionIds
        : (RT.bundleId === 'flow' && serviceSessionsSnapshot ? serviceSessionsSnapshot.ids : undefined)
      const rawFlowSessionsById = hookFlowSessionsById != null
        ? hookFlowSessionsById
        : (RT.bundleId === 'flow' && serviceSessionsSnapshot ? serviceSessionsSnapshot.byId : undefined)
      // better-sidebar 的适配快照可能只给 byId，或把 ids 保留为 Set/其他可迭代容器。
      // 业务层统一收敛成数组，绝不直接假设 ids 可迭代。
      const allFlowSessionIds = Array.isArray(rawFlowSessionIds)
        ? rawFlowSessionIds
        : (rawFlowSessionIds && typeof rawFlowSessionIds[Symbol.iterator] === 'function'
            ? Array.from(rawFlowSessionIds)
            : (rawFlowSessionsById && typeof rawFlowSessionsById === 'object'
                ? (rawFlowSessionsById instanceof Map ? [...rawFlowSessionsById.keys()] : Object.keys(rawFlowSessionsById))
                : []))
      const flowSessionIds = allFlowSessionIds.map(String).filter((id) => !archivedSessionSet.has(id))
      const flowSessionRow = (id) => rawFlowSessionsById instanceof Map
        ? rawFlowSessionsById.get(id)
        : (rawFlowSessionsById && typeof rawFlowSessionsById === 'object' ? rawFlowSessionsById[id] : undefined)
      const currentSessionId = props.sessionId || (hookSession || lsSession) || undefined
      const harnessSelectedSessionId = hookSession || lsSession || props.sessionId || undefined
      // cwd：按 currentSessionId 经 Host RPC 查询（宿主视角 byId 记录不可靠）；hook 按自身 current 查作兜底
      const [sessionCwd, setSessionCwd] = React.useState(undefined)
      React.useEffect(() => {
        let alive = true
        let cancelRetry
        setSessionCwd(undefined)
        if (!currentSessionId) { setSessionCwd(undefined); return undefined }
        const resolveCwd = async (attempt) => {
          try {
            const r = await host.call(RT.rpc('session-info'), { session: currentSessionId })
            if (alive && r && r.ok && typeof r.cwd === 'string' && r.cwd) { setSessionCwd(r.cwd); return }
          } catch (error) {}
          if (alive && attempt < 3) cancelRetry = ctx.timeout(() => resolveCwd(attempt + 1), 500 * (attempt + 1))
        }
        resolveCwd(0)
        return () => { alive = false; if (typeof cancelRetry === 'function') cancelRetry() }
      }, [currentSessionId])
      const hookCwd = props.useSessions((s) => {
        if (!s || !s.current) return undefined
        const row = s.byId && s.byId[s.current]
        return row && typeof row.cwd === 'string' && row.cwd ? row.cwd : undefined
      })
      const currentCwd = props.cwd || sessionCwd || hookCwd
      const flowBookmarkStorageKey = RT.storageKey('flow.bookmarks.' + encodeURIComponent(currentCwd || ''))
      React.useEffect(() => {
        try {
          const stored = JSON.parse(localStorage.getItem(flowBookmarkStorageKey) || 'null')
          const items = stored && stored.version === 1 ? stored.items : Array.isArray(stored) ? stored : []
          setFlowBookmarks(items.filter((item) => item && typeof item.sessionId === 'string' && Number.isFinite(item.seq) && ['msg', 'call'].includes(item.kind)).slice(0, 200))
        } catch (e) { setFlowBookmarks([]) }
        setFlowWorkbench(null)
      }, [flowBookmarkStorageKey])
      const saveFlowBookmarks = (items) => {
        const bounded = items.slice(-200)
        localStorage.setItem(flowBookmarkStorageKey, JSON.stringify({ version: 1, items: bounded }))
        setFlowBookmarks(bounded)
      }
      // 并发记录按工作区持久化；Session 切换/原生右侧栏重挂后仍能恢复同一次大流镜。
      const zoomLogCwdRef = React.useRef(currentCwd || '')
      if (currentCwd) zoomLogCwdRef.current = currentCwd
      const flowZoomLogStorageKey = () => {
        const cwdKey = String(zoomLogCwdRef.current || 'default').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
        return RT.storageKey('flow.zoom-runs.' + cwdKey)
      }
      const readFlowZoomLog = () => {
        try {
          const raw = localStorage.getItem(flowZoomLogStorageKey())
          if (!raw) return { open: false, activeId: '', runs: [] }
          const parsed = JSON.parse(raw)
          if (!parsed || typeof parsed !== 'object') return { open: false, activeId: '', runs: [] }
          if (!archivedSessionSet.size || !Array.isArray(parsed.runs)) return parsed
          const runs = parsed.runs.map((run) => {
            if (!run || !Array.isArray(run.rounds)) return null
            const rounds = run.rounds.map((round) => {
              if (!round || !Array.isArray(round.sids)) return null
              const keep = round.sids.map((sid, i) => ({ sid: String(sid), i })).filter((item) => !archivedSessionSet.has(item.sid))
              return {
                ...round,
                sourceSids: Array.isArray(round.sourceSids) ? round.sourceSids.map(String).filter((sid) => !archivedSessionSet.has(sid)) : [],
                sids: keep.map((item) => item.sid),
                routes: keep.map((item) => (Array.isArray(round.routes) ? round.routes[item.i] : '') || ''),
                efforts: keep.map((item) => (Array.isArray(round.efforts) ? round.efforts[item.i] : '') || ''),
              }
            }).filter((round) => round && round.sids.length)
            const latest = rounds[rounds.length - 1]
            return latest ? { ...run, rounds, sids: latest.sids, routes: latest.routes, efforts: latest.efforts } : null
          }).filter(Boolean)
          const active = runs.find((run) => run.id === parsed.activeId) || runs[runs.length - 1]
          const round = active && (active.rounds.find((item) => item.id === parsed.roundId) || active.rounds[active.rounds.length - 1])
          return { ...parsed, runs, activeId: active ? active.id : '', roundId: round ? round.id : '' }
        } catch (e) { return { open: false, activeId: '', runs: [] } }
      }
      const writeFlowZoomLog = (state) => {
        try {
          // 合并回写而非覆盖：Host 返回的 state.zoomRuns 已被「归档 Session 过滤」裁剪（仅供显示），
          // 直接覆盖会把成员已归档的历史批次从存储里永久抹掉。以磁盘原文为底——本次出现的 run
          // 覆盖更新/追加，没出现的（被过滤的）原样保留。
          const prevRaw = (() => {
            try {
              const p = JSON.parse(localStorage.getItem(flowZoomLogStorageKey()) || 'null')
              return p && Array.isArray(p.runs) ? p.runs : []
            } catch (e) { return [] }
          })()
          const merged = prevRaw.slice()
          const indexById = new Map()
          merged.forEach((run, i) => { if (run && typeof run.id === 'string') indexById.set(run.id, i) })
          const stateRuns = state && Array.isArray(state.zoomRuns) ? state.zoomRuns : []
          for (const run of stateRuns) {
            if (!run || typeof run.id !== 'string') continue
            const at = indexById.get(run.id)
            if (typeof at === 'number') merged[at] = run
            else { indexById.set(run.id, merged.length); merged.push(run) }
          }
          localStorage.setItem(flowZoomLogStorageKey(), JSON.stringify({
            open: !!(state && state.zoom),
            scope: state && state.zoomScope === 'run' ? 'run' : 'tree',
            activeId: state && typeof state.zoomRunId === 'string' ? state.zoomRunId : '',
            roundId: state && typeof state.zoomRoundId === 'string' ? state.zoomRoundId : '',
            runs: merged.slice(-20),
            view: state && (state.zoomView === 'detail' || state.zoomView === 'map') ? state.zoomView : 'compact',
            mode: state && state.zoomMode === 'near' ? 'near' : 'panorama',
            focusSid: state && typeof state.zoomFocusSid === 'string' ? state.zoomFocusSid : '',
            lastFocusSid: state && typeof state.zoomLastFocusSid === 'string' ? state.zoomLastFocusSid : '',
          }))
        } catch (e) {}
      }
      // cwd 用 ref 固定：1.5s 轮询 interval 持有旧闭包，读取 ref 才能跟随「切工作区」拿到最新激活 cwd
      const cwdRef = React.useRef(currentCwd)
      cwdRef.current = currentCwd
      // 会话上下文检测：记录「上次已处理过」的 cwd 与 session id（只在 effect 内更新，
      // 不随渲染赋值——否则 effect 里比较恒等永远不会触发）
      const handledCwdRef = React.useRef(currentCwd || '')
      const handledSessionRef = React.useRef(currentSessionId || '')

      // ===== DSH 0.1.5 原生事件窗订阅（实时流叠加层，仅当前会话）=====
      // sessions.binding(sid).eventSource 订阅 SessionEventWindow：瞬时 assistant/live-chunk
      // 条目在 Client 预折叠成 attempt 快照，随每次流镜面板请求带给 Host 统一折叠器；
      // settle-assistant 把瞬时条目替换为持久结算 → 本轮消失的 attempt 记入 settled，
      // Host 结算卡继承该 firstSeq，框选/详情/分支等 UI 状态在结算替换时不丢。
      // 窗 revision 变化驱动一次防抖静默刷新（不必等 2s 轮询）。重连 baseline 由
      // Session Controller 重建为瞬时条目，本订阅天然覆盖（折叠器幂等，无重复卡）。
      const LIVE_TEXT_CAP = 8000
      const liveOverlayRef = React.useRef(null)
      const [liveRevision, setLiveRevision] = React.useState(0)
      const liveSettledRef = React.useRef([])
      React.useEffect(() => {
        liveOverlayRef.current = null
        liveSettledRef.current = []
        setLiveRevision(0)
        if (!sessionsClient || typeof sessionsClient.binding !== 'function' || !currentSessionId) return undefined
        let attempts = new Map()
        let initialized = false
        const appendCapped = (current, delta) => {
          const room = Math.max(0, LIVE_TEXT_CAP - current.length)
          return room === 0 ? current : current + String(delta).slice(0, room)
        }
        const acceptTransient = (entry, target) => {
          if (!entry || entry.type !== 'transient' || !entry.event) return
          const ev = entry.event
          if (ev.type !== 'assistant/live-chunk') return
          const d = ev.data || {}
          const id = String(d.attemptId == null ? '' : d.attemptId)
          if (!id) return
          let a = target.get(id)
          if (!a) {
            a = {
              attemptId: id,
              turn: typeof d.turn === 'number' ? d.turn : null,
              step: typeof d.step === 'number' ? d.step : null,
              firstSeq: ev.seq, firstAt: ev.time, lastAt: ev.time,
              text: '', reasoning: '', toolCall: false, finish: null,
            }
            target.set(id, a)
          }
          const chunk = d.chunk || {}
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
            a.text = appendCapped(a.text, chunk.text)
          } else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
            a.reasoning = appendCapped(a.reasoning, chunk.text)
          } else if (chunk.type === 'tool-call-delta') {
            a.toolCall = true
          } else if (chunk.type === 'finish' && chunk.reason) {
            const f = chunk.reason.failure || {}
            a.finish = {
              kind: String(chunk.reason.kind || ''),
              code: typeof f.code === 'string' ? f.code : '',
              message: typeof f.message === 'string' ? f.message : '',
            }
          }
          a.lastAt = ev.time
        }
        const publishWindow = (win) => {
          liveOverlayRef.current = {
            sessionId: currentSessionId,
            revision: win && typeof win.revision === 'number' ? win.revision : 0,
            attempts: [...attempts.values()],
            settled: liveSettledRef.current.slice(-8),
          }
          setLiveRevision((r) => r + 1)
        }
        const rebuildWindow = (win) => {
          const next = new Map()
          for (const entry of (win && Array.isArray(win.entries) && win.entries) || []) acceptTransient(entry, next)
          attempts = next
        }
        const foldWindow = (win) => {
          const change = win && win.change
          // First attachment must rebuild even when the source's latest change
          // was only an append; otherwise earlier chunks of an in-flight baseline
          // would be lost. Subsequent publications use the exact window delta.
          if (!initialized || !change || change.kind === 'replace') {
            rebuildWindow(win)
            initialized = true
          } else if (change.kind === 'append') {
            for (const entry of Array.isArray(change.entries) ? change.entries : []) acceptTransient(entry, attempts)
          } else if (change.kind === 'settle-assistant') {
            const id = String(change.attemptId == null ? '' : change.attemptId)
            const a = attempts.get(id)
            attempts.delete(id)
            // Only a durable settlement needs an occurrence bridge. An
            // abandonment has no replacement card and must not poison a later
            // attempt in the same turn/step.
            if (a && change.entry) {
              liveSettledRef.current.push({ attemptId: id, turn: a.turn, step: a.step, firstSeq: a.firstSeq })
              if (liveSettledRef.current.length > 24) liveSettledRef.current = liveSettledRef.current.slice(-24)
            }
          }
          // prepend carries durable history only, so the active attempt map is unchanged.
          publishWindow(win)
        }
        let off = null
        const attach = () => {
          let binding
          try { binding = sessionsClient.binding(currentSessionId) } catch (e) { binding = null }
          const src = binding && binding.eventSource
          if (!src || typeof src.getSnapshot !== 'function') return false
          foldWindow(src.getSnapshot())
          if (typeof src.subscribe === 'function') off = src.subscribe(() => foldWindow(src.getSnapshot()))
          return true
        }
        let retryTimer = null
        if (!attach()) {
          // binding 可能晚于会话列表就绪（冷启动/列表刷新）：限时重试挂接
          let tries = 0
          retryTimer = setInterval(() => {
            tries += 1
            if (off || attach() || tries > 20) { try { clearInterval(retryTimer) } catch (e) {} }
          }, 800)
        }
        return () => {
          try { if (off) off() } catch (e) {}
          try { if (retryTimer) clearInterval(retryTimer) } catch (e) {}
        }
      }, [currentSessionId, flowSessionIds.join('\u0001')])

      // 实时增长：事件窗 revision 变化 → 防抖静默重拉（流镜激活且可见时），不等 2s 轮询。
      // live 关（data-autorefresh 消失）/管理视图/不可见时不触发；暂停后重新可见的同步刷新
      // 由 isOpen effect 承接（active/open 变化重载面板）。
      React.useEffect(() => {
        if (!liveRevision) return undefined
        const t = setTimeout(() => {
          const st = stateRef.current.flow
          if (activeRef.current !== 'flow' || !openRef.current || managingRef.current) return
          if (!st || st.live === false || st.settings === true) return
          if (zoomComposerBusy()) return // 开工台编辑中：不抢重渲染
          if (typeof loadPanelRef.current === 'function') loadPanelRef.current('flow', '__refresh', null, { silent: true })
        }, 150)
        return () => { try { clearTimeout(t) } catch (e) {} }
      }, [liveRevision])

      React.useEffect(() => {
        if (!flowTargetSession || !flowSessionIds.includes(flowTargetSession)) setFlowTargetSession(currentSessionId || flowSessionIds[0] || '')
      }, [currentSessionId, flowSessionIds, flowTargetSession])

      // 原生左侧会话三点菜单没有扩展槽：以捕获阶段记录触发按钮，再给刚打开的
      // Rename/Fork/Archive 菜单追加一个 DOM 菜单项。动作只改 Flowglass 持久化并发组，
      // 不调用导航，因此“加入分支”不会把当前并发上下文切走。
      React.useEffect(() => {
        const titleOf = (id) => {
          const row = flowSessionRow(id) || {}
          return String(row.displayTitle || row.title || '')
        }
        const sessionForActionLabel = (label) => {
          let name = ''
          let m = /^会话“(.+)”的操作$/u.exec(label)
          if (m) name = m[1]
          else { m = /^Session actions for (.+)$/u.exec(label); if (m) name = m[1] }
          if (!name) return ''
          const matches = flowSessionIds.filter((id) => titleOf(id) === name)
          if (matches.length === 1) return matches[0]
          if (currentSessionId && matches.includes(currentSessionId)) return currentSessionId
          return ''
        }
        const activeRound = () => {
          const log = readFlowZoomLog()
          const runs = Array.isArray(log.runs) ? log.runs : []
          const run = runs.find((item) => item && item.id === log.activeId) || runs[runs.length - 1]
          if (!run || !Array.isArray(run.rounds) || !run.rounds.length) return null
          const round = run.rounds.find((item) => item && item.id === log.roundId) || run.rounds[run.rounds.length - 1]
          return round && Array.isArray(round.sids) ? round : null
        }
        const onPointerDown = (e) => {
          const button = e.target && e.target.closest ? e.target.closest('button[aria-label]') : null
          if (!button) return
          const sid = sessionForActionLabel(button.getAttribute('aria-label') || '')
          if (sid) sidebarSessionMenuRef.current = { sid, anchor: button }
        }
        const enhance = () => {
          const pending = sidebarSessionMenuRef.current
          if (!pending || !document.body) return
          for (const menu of document.body.querySelectorAll('[role="menu"]')) {
            if (menu.querySelector('[data-flow-sidebar-join]')) continue
            const items = [...menu.querySelectorAll('[role="menuitem"]')]
            const labels = items.map((item) => String(item.textContent || '').trim())
            const isSessionMenu = labels.some((x) => x === '重命名' || x === 'Rename')
              && labels.some((x) => x === '分叉会话' || x === 'Fork session')
              && labels.some((x) => x === '归档会话' || x === 'Archive session')
            if (!isSessionMenu) continue
            const template = items[items.length - 1]
            const wrap = template && template.parentElement
            const viewport = wrap && wrap.parentElement
            if (!wrap || !viewport) continue
            const clone = wrap.cloneNode(true)
            const button = clone.querySelector('[role="menuitem"]')
            if (!button) continue
            button.setAttribute('data-flow-sidebar-join', '1')
            button.removeAttribute('aria-haspopup'); button.removeAttribute('aria-expanded')
            const spans = button.querySelectorAll('span')
            if (spans[0]) spans[0].textContent = '＋'
            const round = activeRound()
            let label = '加入当前并发分支'
            let disabled = false
            if (!round) { label = '暂无当前并发'; disabled = true }
            else if (round.sids.includes(pending.sid)) { label = '已在当前并发中'; disabled = true }
            else if (round.sids.length >= 4) { label = '当前并发已满'; disabled = true }
            else {
              const member = flowSessionRow(round.sids[0]) || {}
              const candidate = flowSessionRow(pending.sid) || {}
              if (member.cwd && candidate.cwd && member.cwd !== candidate.cwd) { label = '不在当前工作区'; disabled = true }
            }
            if (spans[1]) spans[1].textContent = label
            else button.textContent = label
            button.disabled = disabled
            button.addEventListener('click', (event) => {
              event.preventDefault(); event.stopPropagation()
              if (button.disabled || typeof loadPanelRef.current !== 'function') return
              Promise.resolve(loadPanelRef.current('flow', 'fzoom-run-add', { dataset: { sid: pending.sid } }, { silent: true }))
                .then(() => { setFlowUiNotice('已加入当前并发：' + titleOf(pending.sid)); try { pending.anchor.click() } catch (err) {} })
                .catch((err) => { setError('加入当前并发失败: ' + String((err && err.message) || err)) })
            })
            viewport.appendChild(clone)
          }
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        const observer = new MutationObserver(() => { Promise.resolve().then(enhance) })
        if (document.body) observer.observe(document.body, { childList: true, subtree: true })
        return () => { document.removeEventListener('pointerdown', onPointerDown, true); observer.disconnect() }
      }, [currentSessionId, flowSessionIds.join('\u0001')])

      React.useEffect(() => {
        setFlowSelectedSeqs([])
        setFlowBringPopup(false)
        setFlowTreeOpen({})
        setFlowUiNotice('')
      }, [currentSessionId])

      React.useEffect(() => {
        if (active === 'flow') return
        exitFlowZen()
        setFlowSelectedSeqs([])
        setFlowBringPopup(false)
        setFlowTreeOpen({})
        setFlowUiNotice('')
      }, [active])

      React.useEffect(() => {
        if (!flowZen || typeof window === 'undefined') return undefined
        // 原生全屏时 Esc 由浏览器退出并触发 fullscreenchange；回退 Zen 则自行处理。
        const onKey = (e) => { if (e.key === 'Escape' && (typeof document === 'undefined' || !document.fullscreenElement)) setFlowZen(false) }
        window.addEventListener('keydown', onKey)
        return () => { try { window.removeEventListener('keydown', onKey) } catch (e) {} }
      }, [flowZen])

      React.useEffect(() => {
        if (typeof document === 'undefined') return undefined
        const onFullscreen = () => {
          const el = drawerRef.current
          if (document.fullscreenElement === el) setFlowZen(true)
          else if (!document.fullscreenElement) setFlowZen(false)
        }
        document.addEventListener('fullscreenchange', onFullscreen)
        return () => {
          try { document.removeEventListener('fullscreenchange', onFullscreen) } catch (e) {}
          const el = drawerRef.current
          try { if (document.fullscreenElement === el && document.exitFullscreen) document.exitFullscreen().catch(() => {}) } catch (e) {}
        }
      }, [])

      const flowScope = () => {
        const flow = panelRef.current && panelRef.current.querySelector('[data-flow][data-flow-scope]')
        return flow ? (flow.getAttribute('data-flow-scope') || '') : ''
      }

      // 大流镜看板根 / 开工台输入读取（开工台是 Host HTML + 客户端行为，不经 Host RPC）
      const flowBoardEl = () => {
        const el = panelRef.current && panelRef.current.querySelector('[data-flow][data-flow-board]')
        return el || null
      }
      // 开工台宿主根：全景 = 看板根；近观（分支单会话 1→N）刻意不带 data-flow-board（保留框选手势），
      // 但开工台仍渲染在同一 [data-flow] 根下——由开工台输入框回溯宿主根。否则近观里任务文本、
      // 模型/思考分支与启动属性（data-zoom-active-sids/run/round）全部读丢：点 ⚡ 永远误判空输入，
      // 只提示「先输入同一个任务再同时开始」，且 2s 轮询不暂停、输入镜像不恢复。
      const flowZoomHostEl = () => {
        const board = flowBoardEl()
        if (board) return board
        const root = panelRef.current
        const prompt = root && root.querySelector('[data-zoom-prompt]')
        return prompt && typeof prompt.closest === 'function' ? prompt.closest('[data-flow]') : null
      }
      const zoomComposerText = () => {
        const b = flowZoomHostEl()
        const input = b && b.querySelector('[data-zoom-prompt]')
        // DOM 暂时缺席（全量重渲染间隙）时用输入镜像兜底，不误解用户的已输入任务
        return input ? String(input.value || '') : String(zoomPromptRef.current || '')
      }
      // Legacy HTML consumers retain the guard; stable Composer islands can refresh while editing.
      const zoomComposerBusy = () => {
        const flow = flowZoomHostEl()
        return Boolean(flow && !flow.hasAttribute('data-flow-stable') && zoomComposerText().trim())
      }

      const setFlowZoomLevel = (value) => {
        const levels = [60, 75, 90, 100, 110, 125, 150]
        const nearest = levels.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, 100)
        setFlowZoom(nearest)
        try { localStorage.setItem(RT.storageKey('flow.zoom'), String(nearest)) } catch (e) {}
      }

      const stepFlowZoom = (direction) => {
        const levels = [60, 75, 90, 100, 110, 125, 150]
        const at = Math.max(0, levels.indexOf(flowZoom))
        setFlowZoomLevel(levels[Math.max(0, Math.min(levels.length - 1, at + direction))])
      }

      const branchFlowAt = async (seq, sourceSessionId) => {
        if (flowMutationBlocked()) return
        const source = sourceSessionId || flowScope()
        if (!source || !Number.isFinite(Number(seq))) return
        if (!sessionsClient || typeof sessionsClient.fork !== 'function') { setError('Harness 当前版本不支持会话分支'); return }
        setFlowUiBusy(true); setFlowUiNotice('正在创建分支会话…')
        try {
          const childId = await sessionsClient.fork({ sessionId: source, atSeq: Number(seq), increaseTitle: true })
          await navigateHarnessSession({ sessionId: childId })
          const reopen = () => { try { if (nativeOpenTab) nativeOpenTab() } catch (e) {} }
          try { ctx.timeout(reopen, 0); ctx.timeout(reopen, 180) } catch (e) {}
          setFlowUiNotice('已创建分支会话')
          setFlowSelectedSeqs([])
          setFlowBringPopup(false)
          setFlowTreeOpen({})
        } catch (e) { setError('分支失败: ' + String((e && e.message) || e)) }
        finally { setFlowUiBusy(false) }
      }

      const fetchSelectedFlowContext = async () => {
        if (!flowSelectedSeqs.length) throw new Error('请先框选流程卡片')
        const res = await host.call(RT.rpc('panel'), {
          tool: 'flow', action: 'fcontext',
          fields: { __el: { seqs: flowSelectedSeqs.join(',') } },
          state: stateRef.current.flow || null,
          root: currentCwd || undefined,
          session: currentSessionId || undefined,
        })
        if (!res || !res.ok || !res.flowContext || !res.flowContext.text) throw new Error((res && res.error) || '无法读取选中内容')
        return res.flowContext
      }

      // 跨会话草稿写入：alpha.2 的 Session 必须先 retain，并通过 bindingSource
      // 投影标准 props/hooks；0.1.5 继续使用 adapter.resolve 兼容路径。
      const withSessionProvideInfo = async (sessionId, operation) => {
        const uiSession = ctx.get('uiSession')
        if (!uiSession || !uiSession.adapter) {
          throw new Error('当前 Harness 不支持跨会话草稿写入（缺少 uiSession 绑定服务）')
        }
        if (sessionsClient && typeof sessionsClient.using === 'function'
          && typeof uiSession.adapter.bindingSource === 'function') {
          return sessionsClient.using(sessionId, { source: 'controllerOperation' }, (reference) => {
            const source = uiSession.adapter.bindingSource(reference)
            const binding = source && typeof source.getSnapshot === 'function' ? source.getSnapshot() : undefined
            if (!binding || binding.key == null) throw new Error('目标会话的 UI 绑定不可用')
            return operation({ props: binding.props, hooks: binding.hooks })
          })
        }
        if (typeof uiSession.adapter.resolve !== 'function') {
          throw new Error('当前 Harness 不支持跨会话草稿写入（缺少 uiSession 解析器）')
        }
        for (let i = 0; i < 3; i++) {
          const binding = uiSession.adapter.resolve(sessionId)
          if (binding) return operation({ props: binding.props, hooks: binding.hooks })
          await new Promise((resolve) => setTimeout(resolve, 120))
        }
        throw new Error('目标会话的 UI 绑定不可用')
      }

      const putFlowContextIntoDraft = async (sessionId, text, append) => {
        await withSessionProvideInfo(sessionId, (info) => {
          const actions = info && info.props && info.props.inputActions
          const input = info && info.hooks && info.hooks.input
          if (!actions || typeof actions.setDraft !== 'function') throw new Error('目标会话的输入区不可用')
          let next = text
          if (append && input && typeof input.getSnapshot === 'function') {
            const snap = input.getSnapshot()
            const previous = snap && typeof snap.draft === 'string' ? snap.draft : ''
            if (previous.trim()) next = previous.replace(/\s+$/, '') + '\n\n' + text
          }
          actions.setDraft(next)
        })
      }

      const createSelectedFlowSession = async () => {
        if (!flowSelectedSeqs.length) return
        if (!sessionsClient || typeof sessionsClient.create !== 'function') { setError('Harness 当前版本不支持创建空白会话'); return }
        setFlowUiBusy(true); setFlowUiNotice('正在用框选内容创建新会话…')
        try {
          const context = await fetchSelectedFlowContext()
          const sessionId = await sessionsClient.create(currentCwd ? { cwd: currentCwd } : {})
          await putFlowContextIntoDraft(sessionId, context.text, false)
          await navigateHarnessSession({ sessionId })
          setFlowSelectedSeqs([])
          setFlowBringPopup(false)
          setFlowTreeOpen({})
          setFlowUiNotice('已创建只包含框选内容的新会话草稿')
        } catch (e) { setError('新建会话失败: ' + String((e && e.message) || e)) }
        finally { setFlowUiBusy(false) }
      }

      const sendSelectedFlow = async () => {
        const target = flowTargetSession
        if (!target) { setFlowUiNotice('请选择目标会话'); return }
        if (!sessionsClient) { setFlowUiNotice('Harness 会话服务不可用'); return }
        setFlowUiBusy(true); setFlowUiNotice('正在整理并带入选中内容…')
        try {
          const context = await fetchSelectedFlowContext()
          await putFlowContextIntoDraft(target, context.text, true)
          if (target !== currentSessionId) await navigateHarnessSession({ sessionId: target })
          setFlowSelectedSeqs([])
          setFlowBringPopup(false)
          setFlowTreeOpen({})
          setFlowUiNotice('已追加到目标会话草稿')
        } catch (e) { setFlowUiNotice('带入失败: ' + String((e && e.message) || e)) }
        finally { setFlowUiBusy(false) }
      }

      // ===== 大流镜开工台/互通执行器（客户端行为）=====
      // create() 落定时列表投影可能尚未刷到 binding：短重试挂接（与 resolveSessionProvideInfoWithRetry 同构）
      const resolveZoomBinding = async (sid) => {
        for (let i = 0; i < 10; i++) {
          try {
            const b = sessionsClient && typeof sessionsClient.binding === 'function' ? sessionsClient.binding(sid) : undefined
            if (b && b.session && typeof b.session.prompt === 'function') return b
          } catch (e) {}
          await new Promise((r) => setTimeout(r, 150))
        }
        return undefined
      }
      const withZoomBinding = async (sid, operation) => {
        if (sessionsClient && typeof sessionsClient.using === 'function') {
          return sessionsClient.using(sid, { source: 'controllerOperation' }, (reference) => operation(reference.binding))
        }
        const binding = await resolveZoomBinding(sid)
        if (!binding) throw new Error('会话不可用或未上线')
        return operation(binding)
      }
      // 直接发送 = 目标会话排队执行一条用户消息（ISession.prompt mode 'queue'：运行中排队、空闲立即开工）
      const sendTextToSession = async (sid, text) => {
        await withZoomBinding(sid, async (binding) => {
          const res = await binding.session.prompt([{ type: 'text', text }], 'queue')
          if (!res || res.ok !== true) {
            const error = new Error((res && res.error && res.error.message) || '未收到发送回执')
            error.definite = !!(res && res.ok === false)
            throw error
          }
        })
      }
      // 模型分支：开工台每条分支一个路由 select（值 'provider/model'，'' = 默认跟随当前）
      const zoomLaneValues = () => {
        const b = flowZoomHostEl()
        if (!b) return []
        return [...b.querySelectorAll('[data-zoom-lane]')].map((s) => String(s.value || ''))
      }
      const zoomEffortValues = () => {
        const b = flowZoomHostEl()
        if (!b) return []
        return [...b.querySelectorAll('[data-zoom-effort]')].map((s) => String(s.value || ''))
      }
      // 经 remote.session.selectModel 落模型（GUI 模型选择同一 RPC）；必须在首次 prompt 前调用
      const selectSessionModel = async (sid, route, reasoningEffort) => {
        const slash = route.indexOf('/')
        if (slash <= 0) return
        const remoteSession = ctx.get('remote.session')
        if (!remoteSession || typeof remoteSession.selectModel !== 'function') throw new Error('模型选择通道不可用')
        const res = await remoteSession.selectModel({
          sessionId: sid,
          provider: route.slice(0, slash),
          model: route.slice(slash + 1),
          ...(reasoningEffort ? { reasoningEffort } : {}),
        })
        if (!res || res.ok !== true) throw new Error((res && res.error && res.error.message) || 'selectModel 被拒绝')
      }
      const renameSession = async (sid, title) => {
        await withZoomBinding(sid, async (binding) => {
          if (!binding.session || typeof binding.session.rename !== 'function') return
          const res = await binding.session.rename(String(title).slice(0, 120))
          if (res && res.ok === false) throw new Error((res.error && res.error.message) || '会话重命名失败')
        })
      }
      const zoomBranchTitle = (prompt, index, count, route) => {
        const task = String(prompt || '并发任务').replace(/\s+/g, ' ').trim().slice(0, 42)
        const model = route ? route.slice(route.indexOf('/') + 1) : '跟随当前'
        return '⚡ ' + task + ' · 分支 ' + (index + 1) + '/' + count + ' · ' + model
      }
      const currentSessionIsBlank = (sessionId) => {
        const row = sessionId ? flowSessionRow(sessionId) : null
        if (row && typeof row.blank === 'boolean') return row.blank
        try {
          const binding = sessionId && sessionsClient && typeof sessionsClient.binding === 'function'
            ? sessionsClient.binding(sessionId)
            : null
          const source = binding && binding.eventSource
          const snap = source && typeof source.getSnapshot === 'function' ? source.getSnapshot() : null
          return !!(snap && Array.isArray(snap.entries) && snap.entries.length === 0)
        } catch (e) { return false }
      }
      // ⚡ 同时开始：旧会话从当前完成轮次 fork，新会话在当前工作区 create；
      // 然后按需 selectModel（含 reasoningEffort）→ prompt，最后登记进看板。
      // 近观 1→N 可「沿用当前会话」（开工台 chip）：当前会话作为分支 1 直接继续，只新建 N−1 个分支，
      // 并带 linkSource 让 Host 把新轮次接进来源会话所属的大流镜历史（延长或派生，原历史不覆盖）。
      const startZoomLaunch = async () => {
        const replay = panelRef.current && panelRef.current.querySelector('[data-flow-replay-active="1"]')
        if (replay) { setFlowUiNotice('回放为只读，请先退出回放再发送。'); return }
        const prompt = zoomComposerText().trim()
        if (!prompt) { setFlowUiNotice('先输入同一个任务再同时开始'); return }
        const lanes = zoomLaneValues()
        const efforts = zoomEffortValues()
        const board = flowZoomHostEl()
        const activeSids = board ? String(board.getAttribute('data-zoom-active-sids') || '').split(',').filter(Boolean).slice(0, 4) : []
        const continueExisting = activeSids.length >= 2
        const count = continueExisting ? activeSids.length : Math.max(1, Math.min(4, lanes.length || 2))
        if (flowLaunchBatch && (flowLaunchBatch.registrationPending || flowLaunchBatch.items.some((item) => item.status !== 'success'))) {
          setFlowUiNotice('请先处理上次任务的失败或未知结果，再创建下一次任务。')
          return
        }
        // 近观（无 data-flow-board）才渲染「沿用当前会话」chip；全景 N→N 续跑天然复用现有分支
        const reuseEl = !continueExisting && board && !board.hasAttribute('data-flow-board') ? board.querySelector('[data-zoom-reuse]') : null
        const reuseCurrent = !!(reuseEl && reuseEl.getAttribute('aria-pressed') === 'true')
        // 以大流镜当前选中的 Session 为准；实时向 Host 查询 cwd，避免原生侧栏 props/useSessions 切换延迟。
        // Harness 当前选中 Session 是工作区归属权威；大流镜 scope 可能仍是切换前的旧会话。
        const sourceSessionId = flowScope() || harnessSelectedSessionId || currentSessionId
        // 「沿用」的权威目标 = 正在近观的会话（flowScope），而不是 Harness 选中态——避免 follow 关闭时发错会话
        const effSourceId = reuseCurrent ? (flowScope() || sourceSessionId) : sourceSessionId
        let launchCwd = currentCwd
        let launchWorkspaceId = ''
        // Browser 端 Workspace Controller 是分组归属的权威来源；Host scoped ctx 可能看不到 workspaceRegistry。
        if (sourceSessionId && Array.isArray(hookWorkspaceItems)) {
          const owner = hookWorkspaceItems.find((w) => w && Array.isArray(w.sessionIds) && w.sessionIds.some((sid) => String(sid) === sourceSessionId))
          if (owner && owner.workspaceId != null) launchWorkspaceId = String(owner.workspaceId)
        }
        if (!launchWorkspaceId && sourceSessionId && workspacesClient && workspacesClient.list && typeof workspacesClient.list.getSnapshot === 'function') {
          try {
            const snapshot = workspacesClient.list.getSnapshot()
            const owner = snapshot && Array.isArray(snapshot.items)
              ? snapshot.items.find((w) => w && Array.isArray(w.sessionIds) && w.sessionIds.some((sid) => String(sid) === sourceSessionId))
              : null
            if (owner && owner.workspaceId != null) launchWorkspaceId = String(owner.workspaceId)
          } catch (e) {}
        }
        if (sourceSessionId) {
          try {
            const info = await host.call(RT.rpc('session-info'), { session: sourceSessionId })
            if (info && info.ok && typeof info.cwd === 'string' && info.cwd) launchCwd = info.cwd
            if (!launchWorkspaceId && info && info.ok && typeof info.workspaceId === 'string' && info.workspaceId) launchWorkspaceId = info.workspaceId
          } catch (e) {}
        }
        const forkCurrent = !continueExisting && Boolean(effSourceId) && !currentSessionIsBlank(effSourceId)
        // 按实际路径检查能力：已有会话的 1→N 只需要 fork；空白会话首次并发只需要 create；
        // N→N 继续只需要现有 Session binding。不能因无关 API 缺失让按钮静默返回。
        if (!sessionsClient) { setError('Harness 会话服务不可用'); setFlowUiNotice('同时开始失败：Harness 会话服务不可用'); return }
        if (forkCurrent && typeof sessionsClient.fork !== 'function') { setError('Harness 当前版本不支持从已有会话分支'); setFlowUiNotice('同时开始失败：缺少会话分支能力'); return }
        if (!forkCurrent && !continueExisting && typeof sessionsClient.create !== 'function') { setError('Harness 当前版本不支持新建并发会话'); setFlowUiNotice('同时开始失败：缺少新建会话能力'); return }
        setFlowUiBusy(true); setFlowUiNotice(reuseCurrent
          ? '正在沿用当前会话开工（再新建 ' + Math.max(0, count - 1) + ' 个分支）…'
          : continueExisting
            ? '正在继续当前 ' + count + ' 个分支…'
            : '正在' + (forkCurrent ? '从当前会话分叉 ' : '在当前工作区新建 ') + count + ' 个会话并开工…')
        const created = []
        const failed = []
        try {
          const batch = {
            id: 'launch-' + Date.now(), prompt, sourceSessionId: effSourceId, workspace: currentCwd,
            originScope: flowScope(),
            forkCurrent, launchCwd, launchWorkspaceId, continueExisting, reuseCurrent,
            baseHistoryId: continueExisting && board ? (board.getAttribute('data-zoom-run-id') || '') : '',
            baseRoundId: continueExisting && board ? (board.getAttribute('data-zoom-round-id') || '') : '',
            sourceSids: continueExisting ? activeSids : (effSourceId ? [effSourceId] : []),
            linkSource: !continueExisting && board && !board.hasAttribute('data-flow-board') ? effSourceId : '',
            draftKey: board && board.getAttribute('data-flow-draft-key') || '',
            items: Array.from({ length: count }, (_unused, index) => ({
              index, sid: continueExisting ? activeSids[index] : reuseCurrent && index === 0 ? effSourceId : '',
              route: lanes[index] || '', effort: efforts[index] || '',
              rename: !continueExisting && !(reuseCurrent && index === 0), stage: 'create', status: 'ready',
            })),
          }
          await runFlowLaunchBatch(batch, flowLaunchApi(batch), saveFlowLaunchBatch)
          for (const item of batch.items) {
            if (item.status === 'success') created.push(item.sid)
            else failed.push('分支 ' + (item.index + 1) + '：' + (item.status === 'unknown' ? '结果未知，需核对' : item.error))
          }
          await registerFlowLaunch(batch)
          // 空白“新会话”只承担开工入口；分支启动后直接进入第一条实际工作会话。
          // 已有会话上的分叉仍留在父会话，方便继续查看父级与分支对比；「沿用」时当前会话即分支 1，不导航。
          if (!forkCurrent && !reuseCurrent && created.length
            && (cwdRef.current || '') === (batch.workspace || '') && flowScope() === batch.originScope) {
            const target = created[0]
            const followState = stateRef.current.flow
            if (followState) flowFollowStateBySessionRef.current.set(target, followState)
            flowHarnessNavTargetRef.current = target
            try { await navigateHarnessSession({ sessionId: target }) }
            catch (e) {
              flowHarnessNavTargetRef.current = null
              flowFollowStateBySessionRef.current.delete(target)
              throw e
            }
          }
          const input = board && board.querySelector('[data-zoom-prompt]')
          if (!failed.length) {
            if (loadPanelRef.current) await loadPanelRef.current('flow', 'fzoom-composer-close', null, { silent: true })
            clearFlowDraft(batch.draftKey, prompt)
            if (input && input.value.trim() === prompt) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); zoomPromptRef.current = '' }
          }
          setFlowUiNotice((reuseCurrent
            ? '已沿用当前会话开工' + (created.length > 1 ? '，新建 ' + (created.length - 1) + ' 个分支' : '')
            : continueExisting
              ? '已继续当前 ' + created.length + ' 个分支'
              : '已' + (forkCurrent ? '从当前会话分叉并' : '在当前工作区新建并') + '开工 ' + created.length + ' 个会话') + (failed.length ? '，' + failed.length + ' 个失败：' + failed[0] : ''))
        } catch (e) { setError('同时开始失败: ' + String((e && e.message) || e)) }
        finally { setFlowUiBusy(false) }
      }
      const executeZoomLaunch = async () => {
        if (flowLaunchBusyRef.current) return
        flowLaunchBusyRef.current = true
        try { await startZoomLaunch() } finally { flowLaunchBusyRef.current = false }
      }
      const saveFlowLaunchBatch = (batch) => {
        if ((cwdRef.current || '') === (batch.workspace || '')) setFlowLaunchBatch({ ...batch, items: batch.items.map((item) => ({ ...item })) })
        try { localStorage.setItem(RT.storageKey('flow.launch.' + encodeURIComponent(batch.workspace || '')), JSON.stringify(batch)) } catch (e) {}
      }
      const registerFlowLaunch = async (batch) => {
        const known = batch.items.filter((item) => item.sid)
        if (!known.length || !loadPanelRef.current) return
        batch.registrationPending = true
        if ((cwdRef.current || '') !== (batch.workspace || '') || (batch.originScope && flowScope() !== batch.originScope)) {
          saveFlowLaunchBatch(batch)
          return
        }
        if (!batch.runId || !batch.roundId) {
          const result = await loadPanelRef.current('flow', 'fzoom-joined', { dataset: {
            sids: known.map((item) => item.sid).join(','),
            meta: JSON.stringify({ prompt: batch.prompt, routes: known.map((item) => item.route), efforts: known.map((item) => item.effort),
              sourceSids: batch.sourceSids, baseHistoryId: batch.baseHistoryId, baseRoundId: batch.baseRoundId, ...(batch.linkSource ? { linkSource: batch.linkSource } : {}) }),
          } })
          if (result && result.ok && result.state) {
            batch.runId = result.state.zoomRunId; batch.roundId = result.state.zoomRoundId
            batch.registeredSids = known.map((item) => item.sid)
          }
        } else {
          for (const item of known.filter((item) => !(batch.registeredSids || []).includes(item.sid))) {
            const result = await loadPanelRef.current('flow', 'fzoom-run-add', { dataset: { sid: item.sid, run: batch.runId, round: batch.roundId, route: item.route, effort: item.effort } })
            if (result && result.ok) batch.registeredSids = [...(batch.registeredSids || []), item.sid]
          }
        }
        batch.registrationPending = known.some((item) => !(batch.registeredSids || []).includes(item.sid))
        saveFlowLaunchBatch(batch)
      }
      const flowLaunchApi = (batch) => ({
        create: () => batch.forkCurrent
          ? sessionsClient.fork({ sessionId: batch.sourceSessionId, increaseTitle: true })
          : sessionsClient.create(batch.launchWorkspaceId ? { workspaceId: batch.launchWorkspaceId } : (batch.launchCwd ? { cwd: batch.launchCwd } : {})),
        configure: async (item) => {
          if (item.route) await selectSessionModel(item.sid, item.route, item.effort)
          if (item.rename) await renameSession(item.sid, zoomBranchTitle(batch.prompt, item.index, batch.items.length, item.route))
        },
        send: async (item, text) => {
          // A durable position makes later receipt reconciliation conservative.
          try {
            await withZoomBinding(item.sid, (binding) => {
              const snapshot = binding.eventSource && binding.eventSource.getSnapshot()
              const events = flowDurableEvents(snapshot)
              item.beforeSeq = events ? Math.max(-1, ...events.map((entry) => entry.seq)) : null
            })
          } catch (e) { item.beforeSeq = null }
          saveFlowLaunchBatch(batch)
          await sendTextToSession(item.sid, text)
        },
      })
      const retryFlowLaunch = async () => {
        if (!flowLaunchBatch || flowLaunchBusyRef.current) return
        if (panelRef.current && panelRef.current.querySelector('[data-flow-replay-active="1"]')) { setFlowUiNotice('请先退出只读回放再恢复发送。'); return }
        flowLaunchBusyRef.current = true; setFlowUiBusy(true)
        try {
          await runFlowLaunchBatch(flowLaunchBatch, flowLaunchApi(flowLaunchBatch), saveFlowLaunchBatch)
          await registerFlowLaunch(flowLaunchBatch)
        }
        finally { flowLaunchBusyRef.current = false; setFlowUiBusy(false) }
      }
      const reconcileFlowLaunch = async () => {
        if (!flowLaunchBatch || flowLaunchBusyRef.current) return
        flowLaunchBusyRef.current = true; setFlowUiBusy(true)
        try {
        for (const item of flowLaunchBatch.items) {
          if (item.status !== 'unknown' || item.stage !== 'send' || !item.sid || item.beforeSeq == null) continue
          try {
            await withZoomBinding(item.sid, (binding) => {
              const snapshot = binding.eventSource && binding.eventSource.getSnapshot()
              const events = flowDurableEvents(snapshot)
              const found = events && events.some((entry) =>
                entry.seq > item.beforeSeq && entry.type === 'user/message' && entry.data && Array.isArray(entry.data.content)
                  && entry.data.content.filter((part) => part.type === 'text').map((part) => part.text).join('') === flowLaunchBatch.prompt)
              if (found) { item.status = 'success'; item.error = '' }
            })
          } catch (e) {}
        }
        saveFlowLaunchBatch(flowLaunchBatch)
        await registerFlowLaunch(flowLaunchBatch)
        setFlowUiNotice('已核对可用事件；未找到可靠回执的分支保留未知状态，不会重复发送。')
        } finally { flowLaunchBusyRef.current = false; setFlowUiBusy(false) }
      }
      React.useEffect(() => {
        try {
          const batch = JSON.parse(localStorage.getItem(RT.storageKey('flow.launch.' + encodeURIComponent(currentCwd || ''))) || 'null')
          if (batch && Array.isArray(batch.items)) {
            batch.items = batch.items.slice(0, 4).map((item) => ({ ...item, status: item.status === 'pending' ? 'unknown' : item.status }))
            setFlowLaunchBatch(batch)
          } else setFlowLaunchBatch(null)
        } catch (e) { setFlowLaunchBatch(null) }
      }, [currentCwd])
      // 从对比网格某一轮同时派生所有会话，形成新的并发批次（不自动追加消息）。
      const executeZoomRoundFork = async (el) => {
        if (flowMutationBlocked()) return
        if (!sessionsClient || typeof sessionsClient.fork !== 'function') { setError('Harness 当前版本不支持会话分支'); return }
        let spec = []
        try { spec = JSON.parse(el.getAttribute('data-spec') || '[]') } catch (e) {}
        spec = Array.isArray(spec) ? spec.filter((x) => x && typeof x.sid === 'string' && Number.isFinite(Number(x.seq))).slice(0, 4) : []
        if (spec.length < 2) { setFlowUiNotice('本轮至少需要两个可分支的会话'); return }
        const turn = el.getAttribute('data-turn') || ''
        const targetCount = Math.max(2, Math.min(4, zoomLaneValues().length || spec.length))
        const baseHistoryId = el.getAttribute('data-history') || ''
        const baseRoundId = el.getAttribute('data-round') || ''
        setFlowUiBusy(true); setFlowUiNotice('正在从第 ' + turn + ' 轮执行 ' + spec.length + '→' + targetCount + '…')
        const created = [], failed = []
        try {
          for (let i = 0; i < targetCount; i++) {
            const item = spec[i % spec.length]
            try {
              const child = await sessionsClient.fork({ sessionId: item.sid, atSeq: Number(item.seq), increaseTitle: true })
              await renameSession(child, '⚡ 第 ' + turn + ' 轮 · 分支 ' + (i + 1) + '/' + targetCount)
              created.push(child)
            }
            catch (e) { failed.push(String((e && e.message) || e)) }
          }
          if (created.length && typeof loadPanelRef.current === 'function') {
            await loadPanelRef.current('flow', 'fzoom-joined', { dataset: {
              sids: created.join(','),
              meta: JSON.stringify({ prompt: '第 ' + turn + ' 轮并发', routes: created.map(() => ''), efforts: created.map(() => ''), sourceSids: spec.map((x) => x.sid), baseHistoryId, baseRoundId }),
            } }, { silent: true })
          }
          setFlowUiNotice('已从第 ' + turn + ' 轮完成 ' + spec.length + '→' + created.length + (failed.length ? '，失败 ' + failed.length + ' 个：' + failed[0] : ''))
        } finally { setFlowUiBusy(false) }
      }
      // 单列本轮 1→N：N 取当前 composer 的并发数量，并继承所选历史的轮次前缀。
      const executeZoomCellFork = async (sourceSid, seq, turn, baseHistoryId, baseRoundId) => {
        if (flowMutationBlocked()) return
        if (!sourceSid || !Number.isFinite(Number(seq)) || !sessionsClient || typeof sessionsClient.fork !== 'function') return
        const targetCount = Math.max(2, Math.min(4, zoomLaneValues().length || 2))
        setFlowUiBusy(true); setFlowUiNotice('正在从第 ' + turn + ' 轮创建 1→' + targetCount + ' 分支…')
        try {
          const created = []
          for (let i = 0; i < targetCount; i++) {
            const child = await sessionsClient.fork({ sessionId: sourceSid, atSeq: Number(seq), increaseTitle: true })
            await renameSession(child, '⚡ 第 ' + turn + ' 轮 · 分支 ' + (i + 1) + '/' + targetCount)
            created.push(child)
          }
          if (typeof loadPanelRef.current === 'function') {
            loadPanelRef.current('flow', 'fzoom-joined', { dataset: {
              sids: created.join(','),
              meta: JSON.stringify({ prompt: '第 ' + turn + ' 轮分支', routes: created.map(() => ''), efforts: created.map(() => ''), sourceSids: [sourceSid], baseHistoryId, baseRoundId }),
            } }, { silent: true })
          }
          setFlowUiNotice('已从第 ' + turn + ' 轮建立 1→' + targetCount + ' 对比分支')
        } catch (e) { setError('本轮分支失败: ' + String((e && e.message) || e)) }
        finally { setFlowUiBusy(false) }
      }
      // 不切换 Harness 当前会话：在当前工作区创建一个空 Session，并直接加入当前并发组。
      const executeZoomAddNewSession = async () => {
        if (flowMutationBlocked()) return
        if (!sessionsClient || typeof sessionsClient.create !== 'function') { setFlowUiNotice('当前版本不支持新建 Session'); return }
        const sourceSessionId = harnessSelectedSessionId || currentSessionId || flowScope()
        let workspaceId = ''
        if (sourceSessionId && Array.isArray(hookWorkspaceItems)) {
          const owner = hookWorkspaceItems.find((w) => w && Array.isArray(w.sessionIds) && w.sessionIds.some((sid) => String(sid) === sourceSessionId))
          if (owner && owner.workspaceId != null) workspaceId = String(owner.workspaceId)
        }
        setFlowUiBusy(true); setFlowUiNotice('正在新建 Session 并加入当前并发…')
        try {
          const sid = await sessionsClient.create(workspaceId ? { workspaceId } : (currentCwd ? { cwd: currentCwd } : {}))
          await renameSession(sid, '⚡ 加入当前并发 · 新会话')
          if (typeof loadPanelRef.current === 'function') {
            await loadPanelRef.current('flow', 'fzoom-run-add', { dataset: { sid } }, { silent: true })
          }
          setFlowUiNotice('已新建并加入 Session ' + String(sid).replace(/^session-/, '').slice(0, 8))
        } catch (e) { setError('新建并加入失败: ' + String((e && e.message) || e)) }
        finally { setFlowUiBusy(false) }
      }
      // 带入/发送到选中：文本源 = ⇪ 带入暂存优先，其次开工台输入；目标 = 点选集合（排除带入源自身）
      const executeZoomCast = async (send) => {
        if (send && flowMutationBlocked()) return
        const text = (zoomRelay && zoomRelay.text ? zoomRelay.text : zoomComposerText()).trim()
        const targets = zoomPick.filter((sid) => !zoomRelay || sid !== zoomRelay.source)
        if (!text) { setFlowUiNotice('先输入任务，或点卡片的 ⇪ 带入它的最新结论'); return }
        if (!targets.length) { setFlowUiNotice('先点选至少一个目标会话'); return }
        setFlowUiBusy(true); setFlowUiNotice(send ? '正在直接发送到选中会话…' : '正在带入选中会话草稿…')
        let okCount = 0, failCount = 0, firstErr = ''
        try {
          for (const sid of targets) {
            try {
              if (send) await sendTextToSession(sid, text)
              else await putFlowContextIntoDraft(sid, text, true)
              okCount++
            } catch (e) { failCount++; if (!firstErr) firstErr = String((e && e.message) || e) }
          }
          setFlowUiNotice((send ? '已直接发送 ' : '已带入草稿 ') + okCount + ' 个会话' + (failCount ? '，' + failCount + ' 个失败：' + firstErr : ''))
          setZoomPick([]); setZoomRelay(null)
          if (!zoomRelay) {
            const board = flowZoomHostEl()
            const input = board && board.querySelector('[data-zoom-prompt]')
            if (input) input.value = ''
            zoomPromptRef.current = ''
          }
        } finally { setFlowUiBusy(false) }
      }

      // Zoom 仅缩放流镜画布内容，header/工具栏与滚动容器保持原尺寸。
      React.useLayoutEffect(() => {
        const flow = panelRef.current && panelRef.current.querySelector('[data-flow]')
        if (!flow || active !== 'flow') return
        const body = flow.querySelector('.tb-pane-body')
        if (body) body.style.setProperty('--tb-flow-zoom', String(flowZoom / 100))
      }, [active, html, flowZoom])

      // 导图画布：节点可自由拖动，空白处拖动平移；边线跟随节点。布局保存在 ref 中，
      // 避免 2s 实时刷新把用户正在整理的导图复位。
      React.useLayoutEffect(() => {
        const root = panelRef.current
        const viewport = root && root.querySelector('[data-flow-mindmap]')
        if (!viewport || active !== 'flow') return undefined
        const canvas = viewport.querySelector('.fl-mindmap-canvas')
        if (!canvas) return undefined
        const flowRoot = viewport.closest('[data-flow]')
        const scope = JSON.stringify([currentCwd || '', flowRoot && flowRoot.getAttribute('data-flow-scope') || '', viewport.getAttribute('data-map-scope') || 'current'])
        const keyOf = (node) => scope + '/' + (node.getAttribute('data-map-node') || '')
        const nodes = [...canvas.querySelectorAll('[data-map-node]')]
        const mapWrap = viewport.closest('.fl-mindmap-wrap') || viewport
        const ownerWindow = viewport.ownerDocument.defaultView
        let savedView = flowMindMapViewportRef.current.get(scope)
        if (!savedView) {
          try {
            const saved = JSON.parse(localStorage.getItem(RT.storageKey('flow.map-state')) || 'null')
            savedView = saved && saved.version === 1 && saved.scopes && saved.scopes[scope]
          } catch (e) {}
        }
        const hasSavedView = !!(savedView && typeof savedView === 'object' && savedView.updatedAt)
        savedView = savedView && typeof savedView === 'object' ? savedView : {}
        let scale = Number(savedView.scale) >= .1 && Number(savedView.scale) <= 2 ? Number(savedView.scale) : 1
        let autoFit = hasSavedView && savedView.autoFit === true
        let selectedId = typeof savedView.selectedId === 'string' ? savedView.selectedId : ''
        let saveTimer = null
        const baseWidth = parseFloat(canvas.style.width) || canvas.offsetWidth
        const baseHeight = parseFloat(canvas.style.height) || canvas.offsetHeight
        for (const node of nodes) {
          const id = node.getAttribute('data-map-node') || ''
          const saved = flowMindMapPositionsRef.current.get(keyOf(node)) || (savedView.positions && savedView.positions[id])
          if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
            const position = { x: Math.max(0, saved.x), y: Math.max(0, saved.y) }
            node.style.left = position.x + 'px'; node.style.top = position.y + 'px'
            flowMindMapPositionsRef.current.set(keyOf(node), position)
          }
        }
        const updateEdges = () => {
          const base = canvas.getBoundingClientRect()
          const sx = canvas.offsetWidth ? base.width / canvas.offsetWidth : 1
          const sy = canvas.offsetHeight ? base.height / canvas.offsetHeight : 1
          const rect = (r) => ({ x: (r.left - base.left) / sx, y: (r.top - base.top) / sy, w: r.width / sx, h: r.height / sy })
          const nodeRects = new Map([...canvas.querySelectorAll('[data-map-node]')].map((node) => [node.getAttribute('data-map-node') || '', rect(node.getBoundingClientRect())]))
          for (const path of canvas.querySelectorAll('[data-map-from][data-map-to]')) {
            const fromId = path.getAttribute('data-map-from') || ''
            const toId = path.getAttribute('data-map-to') || ''
            const ar = nodeRects.get(fromId), br = nodeRects.get(toId)
            if (!ar || !br) continue
            const acx = ar.x + ar.w / 2, acy = ar.y + ar.h / 2
            const bcx = br.x + br.w / 2, bcy = br.y + br.h / 2
            const dx = bcx - acx, dy = bcy - acy
            const vertical = br.y >= ar.y + ar.h + 12 || ar.y >= br.y + br.h + 12
            const x1 = vertical ? acx : (dx >= 0 ? ar.x + ar.w : ar.x)
            const y1 = vertical ? (dy >= 0 ? ar.y + ar.h : ar.y) : acy
            const x2 = vertical ? bcx : (dx >= 0 ? br.x : br.x + br.w)
            const y2 = vertical ? (dy >= 0 ? br.y : br.y + br.h) : bcy
            let blocked = false
            for (const [id, obstacle] of nodeRects) {
              if (id === fromId || id === toId) continue
              const left = obstacle.x - 8, right = obstacle.x + obstacle.w + 8
              const top = obstacle.y - 8, bottom = obstacle.y + obstacle.h + 8
              for (let step = 1; step < 24; step++) {
                const t = step / 24
                const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t
                if (px >= left && px <= right && py >= top && py <= bottom) { blocked = true; break }
              }
              if (blocked) break
            }
            let d = 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2
            if (blocked && !vertical) {
              const mid = (x1 + x2) / 2
              d = 'M ' + x1 + ' ' + y1 + ' H ' + mid + ' V ' + y2 + ' H ' + x2
            } else if (blocked) {
              const mid = (y1 + y2) / 2
              d = 'M ' + x1 + ' ' + y1 + ' V ' + mid + ' H ' + x2 + ' V ' + y2
            }
            path.setAttribute('d', d)
          }
        }
        const nodeBounds = () => {
          if (!nodes.length) return { left: 0, top: 0, right: baseWidth, bottom: baseHeight }
          return nodes.reduce((bounds, node) => {
            const left = parseFloat(node.style.left) || 0, top = parseFloat(node.style.top) || 0
            return { left: Math.min(bounds.left, left), top: Math.min(bounds.top, top), right: Math.max(bounds.right, left + node.offsetWidth), bottom: Math.max(bounds.bottom, top + node.offsetHeight) }
          }, { left: Infinity, top: Infinity, right: 0, bottom: 0 })
        }
        const saveView = () => {
          const positions = Object.create(null)
          for (const node of nodes) {
            const position = flowMindMapPositionsRef.current.get(keyOf(node))
            if (position) positions[node.getAttribute('data-map-node') || ''] = position
          }
          const value = { scale, left: viewport.scrollLeft, top: viewport.scrollTop, selectedId, autoFit, positions, updatedAt: Date.now() }
          flowMindMapViewportRef.current.set(scope, value)
          try {
            const old = JSON.parse(localStorage.getItem(RT.storageKey('flow.map-state')) || 'null')
            const scopes = old && old.version === 1 && old.scopes && typeof old.scopes === 'object' ? old.scopes : {}
            scopes[scope] = value
            const recent = Object.fromEntries(Object.entries(scopes).sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0)).slice(0, 20))
            localStorage.setItem(RT.storageKey('flow.map-state'), JSON.stringify({ version: 1, scopes: recent }))
          } catch (e) {}
        }
        const queueSave = () => {
          if (saveTimer != null) ownerWindow.clearTimeout(saveTimer)
          saveTimer = ownerWindow.setTimeout(() => { saveTimer = null; saveView() }, 180)
        }
        const applyScale = () => {
          canvas.style.zoom = String(scale)
          viewport.setAttribute('data-map-scale', String(scale))
          for (const output of mapWrap.querySelectorAll('[data-map-zoom-value]')) output.textContent = Math.round(scale * 100) + '%'
          for (const control of mapWrap.querySelectorAll('[data-map-zoom]')) {
            const direction = control.getAttribute('data-map-zoom')
            control.disabled = direction === 'out' ? scale <= .1 : direction === 'in' ? scale >= 2 : false
          }
        }
        const updateExtent = () => {
          const bounds = nodeBounds()
          canvas.style.width = Math.max(baseWidth, bounds.right + 40) + 'px'
          canvas.style.height = Math.max(baseHeight, bounds.bottom + 40) + 'px'
          const edges = canvas.querySelector('.fl-mindmap-edges')
          if (edges) { edges.setAttribute('width', canvas.style.width); edges.setAttribute('height', canvas.style.height) }
        }
        const selectNode = (node, focus) => {
          if (!node) return
          selectedId = node.getAttribute('data-map-node') || ''
          for (const item of nodes) {
            const picked = item === node
            item.classList.toggle('is-selected', picked)
            item.setAttribute('data-map-selected', picked ? 'true' : 'false')
            const select = item.querySelector('[data-map-select]')
            if (select) select.setAttribute('aria-pressed', picked ? 'true' : 'false')
          }
          if (focus) {
            const control = node.querySelector('[data-map-select]') || node
            try { control.focus({ preventScroll: true }) } catch (e) { control.focus() }
          }
          queueSave()
        }
        const fitView = () => {
          if (!viewport.clientWidth || !viewport.clientHeight) return
          const bounds = nodeBounds()
          scale = Math.max(.1, Math.min(1, (viewport.clientWidth - 40) / Math.max(1, bounds.right - bounds.left), (viewport.clientHeight - 40) / Math.max(1, bounds.bottom - bounds.top)))
          autoFit = true
          applyScale()
          viewport.scrollLeft = Math.max(0, (bounds.left + bounds.right) * scale / 2 - viewport.clientWidth / 2)
          viewport.scrollTop = Math.max(0, (bounds.top + bounds.bottom) * scale / 2 - viewport.clientHeight / 2)
          updateEdges(); queueSave()
        }
        const centerNode = () => {
          const node = nodes.find((item) => item.getAttribute('data-map-node') === selectedId) || nodes[0]
          if (!node) return
          autoFit = false
          selectNode(node, false)
          viewport.scrollLeft = Math.max(0, ((parseFloat(node.style.left) || 0) + node.offsetWidth / 2) * scale - viewport.clientWidth / 2)
          viewport.scrollTop = Math.max(0, ((parseFloat(node.style.top) || 0) + node.offsetHeight / 2) * scale - viewport.clientHeight / 2)
          queueSave()
        }
        const zoomView = (direction) => {
          const before = scale
          const levels = [.1, .15, .25, .35, .5, .65, .8, 1, 1.25, 1.5, 2]
          const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / before
          const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / before
          scale = direction === 'reset' ? 1 : direction === 'in' ? (levels.find((level) => level > before + .005) || 2) : ([...levels].reverse().find((level) => level < before - .005) || .1)
          autoFit = false
          applyScale()
          viewport.scrollLeft = Math.max(0, centerX * scale - viewport.clientWidth / 2)
          viewport.scrollTop = Math.max(0, centerY * scale - viewport.clientHeight / 2)
          updateEdges(); queueSave()
        }
        const panView = (direction) => {
          autoFit = false
          const distance = Math.max(80, Math.round(Math.min(viewport.clientWidth, viewport.clientHeight) * .35))
          if (direction === 'left' || direction === 'right') viewport.scrollLeft += direction === 'left' ? -distance : distance
          if (direction === 'up' || direction === 'down') viewport.scrollTop += direction === 'up' ? -distance : distance
          queueSave()
        }
        updateExtent(); applyScale(); updateEdges()
        selectNode(nodes.find((node) => node.getAttribute('data-map-node') === selectedId) || nodes[0], false)
        if (autoFit) fitView()
        else if (hasSavedView) { viewport.scrollLeft = Number(savedView.left) || 0; viewport.scrollTop = Number(savedView.top) || 0 }
        else {
          const bounds = nodeBounds()
          scale = Math.max(.1, Math.min(1, (viewport.clientWidth - 40) / Math.max(1, bounds.right - bounds.left)))
          applyScale()
          viewport.scrollLeft = Math.max(0, (bounds.left + bounds.right) * scale / 2 - viewport.clientWidth / 2)
          viewport.scrollTop = viewport.scrollHeight
          queueSave()
        }
        let drag = null
        const onDown = (e) => {
          if (e.button !== 0 || (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea'))) return
          const node = e.target && e.target.closest ? e.target.closest('[data-map-node]') : null
          if (node) {
            selectNode(node, false)
            const base = canvas.getBoundingClientRect()
            const scale = canvas.offsetWidth ? base.width / canvas.offsetWidth : 1
            drag = { kind: 'node', node, x: e.clientX, y: e.clientY, left: parseFloat(node.style.left) || 0, top: parseFloat(node.style.top) || 0, scale }
          } else {
            autoFit = false
            drag = { kind: 'pan', x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }
            viewport.classList.add('is-panning')
          }
          try { viewport.setPointerCapture(e.pointerId) } catch (err) {}
          e.preventDefault()
        }
        const onMove = (e) => {
          if (!drag) return
          if (drag.kind === 'node') {
            const x = Math.max(0, drag.left + (e.clientX - drag.x) / drag.scale)
            const y = Math.max(0, drag.top + (e.clientY - drag.y) / drag.scale)
            drag.node.style.left = x + 'px'; drag.node.style.top = y + 'px'
            flowMindMapPositionsRef.current.set(keyOf(drag.node), { x, y })
            autoFit = false
            updateExtent(); updateEdges(); queueSave()
          } else {
            viewport.scrollLeft = drag.left - (e.clientX - drag.x)
            viewport.scrollTop = drag.top - (e.clientY - drag.y)
          }
          e.preventDefault()
        }
        const finish = (e) => {
          if (!drag) return
          drag = null
          viewport.classList.remove('is-panning')
          queueSave()
          try { viewport.releasePointerCapture(e.pointerId) } catch (err) {}
        }
        const onReset = () => {
          for (const node of nodes) {
            const x = Number(node.getAttribute('data-map-default-x')) || 0
            const y = Number(node.getAttribute('data-map-default-y')) || 0
            node.style.left = x + 'px'; node.style.top = y + 'px'
            flowMindMapPositionsRef.current.delete(keyOf(node))
          }
          updateExtent(); updateEdges(); fitView()
        }
        const onMapClick = (e) => {
          const target = e.target && e.target.closest ? e.target.closest('[data-map-fit],[data-map-center],[data-map-reset],[data-map-zoom],[data-map-pan],[data-map-select]') : null
          if (!target || !mapWrap.contains(target)) return
          if (target.hasAttribute('data-map-fit')) fitView()
          else if (target.hasAttribute('data-map-center')) centerNode()
          else if (target.hasAttribute('data-map-reset')) onReset()
          else if (target.hasAttribute('data-map-zoom')) zoomView(target.getAttribute('data-map-zoom'))
          else if (target.hasAttribute('data-map-pan')) panView(target.getAttribute('data-map-pan'))
          else selectNode(target.closest('[data-map-node]'), false)
        }
        const onMapKeyDown = (e) => {
          if (e.isComposing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
          const target = e.target
          if (!target || !(target === viewport || (target.closest && target.closest('[data-map-select]')))) return
          e.preventDefault(); e.stopPropagation()
          const direction = e.key.slice(5).toLowerCase()
          const node = target.closest && target.closest('[data-map-node]')
          if (!node || e.shiftKey) { panView(direction); return }
          if (e.ctrlKey || e.metaKey) {
            const step = 20
            const x = Math.max(0, (parseFloat(node.style.left) || 0) + (direction === 'left' ? -step : direction === 'right' ? step : 0))
            const y = Math.max(0, (parseFloat(node.style.top) || 0) + (direction === 'up' ? -step : direction === 'down' ? step : 0))
            node.style.left = x + 'px'; node.style.top = y + 'px'
            flowMindMapPositionsRef.current.set(keyOf(node), { x, y })
            autoFit = false
            updateExtent(); updateEdges(); queueSave()
            return
          }
          const current = nodes.indexOf(node)
          const next = nodes[Math.max(0, Math.min(nodes.length - 1, current + (direction === 'left' || direction === 'up' ? -1 : 1)))]
          selectNode(next, true); centerNode()
        }
        const onResize = () => { if (autoFit) fitView(); else updateEdges() }
        const observer = ownerWindow && typeof ownerWindow.ResizeObserver === 'function' ? new ownerWindow.ResizeObserver(onResize) : null
        if (observer) observer.observe(viewport)
        else if (ownerWindow) ownerWindow.addEventListener('resize', onResize)
        viewport.addEventListener('scroll', queueSave, { passive: true })
        viewport.addEventListener('pointerdown', onDown)
        viewport.addEventListener('pointermove', onMove)
        viewport.addEventListener('pointerup', finish)
        viewport.addEventListener('pointercancel', finish)
        mapWrap.addEventListener('click', onMapClick)
        mapWrap.addEventListener('keydown', onMapKeyDown)
        return () => {
          if (saveTimer != null) ownerWindow.clearTimeout(saveTimer)
          saveView()
          if (observer) observer.disconnect()
          else if (ownerWindow) ownerWindow.removeEventListener('resize', onResize)
          viewport.removeEventListener('scroll', queueSave)
          viewport.removeEventListener('pointerdown', onDown)
          viewport.removeEventListener('pointermove', onMove)
          viewport.removeEventListener('pointerup', finish)
          viewport.removeEventListener('pointercancel', finish)
          mapWrap.removeEventListener('click', onMapClick)
          mapWrap.removeEventListener('keydown', onMapKeyDown)
        }
      }, [active, html, currentCwd])

      // “添加其他 Session”既可点击，也可把候选项拖入目标 Session 区；全程不切换 Harness 会话。
      React.useEffect(() => {
        const root = panelRef.current
        const drop = root && root.querySelector('[data-zoom-add-drop]')
        if (!drop || active !== 'flow') return undefined
        const candidates = [...root.querySelectorAll('[data-zoom-add-drag][data-sid]')]
        const onStart = (e) => {
          const sid = e.currentTarget.getAttribute('data-sid') || ''
          if (!sid || !e.dataTransfer) return
          e.dataTransfer.effectAllowed = 'copy'
          e.dataTransfer.setData('text/plain', sid)
        }
        const onOver = (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; drop.classList.add('is-drop-target') }
        const onLeave = (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('is-drop-target') }
        const onDrop = (e) => {
          e.preventDefault(); drop.classList.remove('is-drop-target')
          const sid = e.dataTransfer ? e.dataTransfer.getData('text/plain') : ''
          if (/^[\w-]{1,100}$/.test(sid) && typeof loadPanelRef.current === 'function') {
            loadPanelRef.current('flow', 'fzoom-run-add', { dataset: { sid } }, { silent: true })
          }
        }
        for (const candidate of candidates) candidate.addEventListener('dragstart', onStart)
        drop.addEventListener('dragover', onOver)
        drop.addEventListener('dragleave', onLeave)
        drop.addEventListener('drop', onDrop)
        return () => {
          for (const candidate of candidates) candidate.removeEventListener('dragstart', onStart)
          drop.removeEventListener('dragover', onOver)
          drop.removeEventListener('dragleave', onLeave)
          drop.removeEventListener('drop', onDrop)
        }
      }, [active, html])

      // 框选模式：在主滚动区拖出选框，用视口几何与可选卡片求交。
      React.useEffect(() => {
        const flow = panelRef.current && panelRef.current.querySelector('[data-flow]')
        const body = flow && flow.querySelector('.tb-pane-body')
        if (!flow || !body || active !== 'flow') return undefined
        if (flow.hasAttribute('data-flow-board')) return undefined // 大流镜 Zoom 总览：无可框选卡片，不接管指针
        flow.setAttribute('data-flow-select-mode', '1')
        for (const card of flow.querySelectorAll('[data-flow-select-seq]')) {
          const seq = Number(card.getAttribute('data-flow-select-seq'))
          card.classList.toggle('fl-select-picked', flowSelectedSeqs.includes(seq))
        }
        let drag = null
        const clearDrag = () => {
          if (!drag) return
          if (drag.box) { try { drag.box.remove() } catch (e) {} }
          drag = null
        }
        const onDown = (e) => {
          if (e.button !== 0) return
          const rect = body.getBoundingClientRect()
          if (e.clientX > rect.right - 14) return // 保留滚动条拖动
          const origin = flow.getBoundingClientRect()
          // 按下时不改 DOM、不捕获指针：保留卡片原生 click。
          drag = { x: e.clientX, y: e.clientY, originX: origin.left, originY: origin.top, box: null, moved: false, pointerId: e.pointerId }
        }
        const onMove = (e) => {
          if (!drag) return
          const left = Math.min(drag.x, e.clientX), top = Math.min(drag.y, e.clientY)
          const width = Math.abs(e.clientX - drag.x), height = Math.abs(e.clientY - drag.y)
          if (!drag.moved && (width > 3 || height > 3)) {
            const flow = panelRef.current && panelRef.current.querySelector('[data-flow]')
            if (!flow) { clearDrag(); return }
            const box = document.createElement('div')
            box.className = 'fl-marquee'
            flow.appendChild(box)
            drag.box = box
            drag.moved = true
            const body = flow.querySelector('.tb-pane-body')
            try { if (body && drag.pointerId != null) body.setPointerCapture(drag.pointerId) } catch (err) {}
          }
          if (!drag.moved || !drag.box) return
          if (drag.moved) e.preventDefault()
          Object.assign(drag.box.style, { left: (left - drag.originX) + 'px', top: (top - drag.originY) + 'px', width: width + 'px', height: height + 'px' })
        }
        const onUp = (e) => {
          if (!drag) return
          const d = drag
          if (d.moved) {
            const sel = d.box.getBoundingClientRect()
            const seqs = new Set()
            for (const card of flow.querySelectorAll('[data-flow-select-seq]')) {
              if (!card.getClientRects().length) continue // Collapsed system context is not selected implicitly.
              const r = card.getBoundingClientRect()
              if (r.right >= sel.left && r.left <= sel.right && r.bottom >= sel.top && r.top <= sel.bottom) {
                const seq = Number(card.getAttribute('data-flow-select-seq'))
                if (Number.isFinite(seq)) seqs.add(seq)
              }
            }
            setFlowSelectedSeqs([...seqs].sort((a, b) => a - b))
            setFlowBringPopup(false)
            setFlowUiNotice('')
            suppressFlowClickUntilRef.current = Date.now() + 120
          } else if (!e.button && !flowUiBusy && (flowSelectedSeqs.length || flow.querySelector('.fl-rail'))) {
            // 空白处单击：取消框选并关闭详情侧拉框（落在卡片或交互控件上则不干预，保留其原生行为）
            const t = e.target
            if (t && typeof t.closest === 'function'
              && !t.closest('[data-flow-select-seq]')
              && !t.closest('button,a,input,select,textarea,label,summary,details,[role="button"],.fl-rail')) {
              if (flowSelectedSeqs.length) { setFlowSelectedSeqs([]); setFlowBringPopup(false) }
              // 详情侧栏经 ✕ 同款 fdetail 切换路径收起（st.expanded === seq → null）
              const railX = flow.querySelector('.fl-rail-x')
              if (railX && typeof loadPanelRef.current === 'function') loadPanelRef.current('flow', 'fdetail', railX)
            }
          }
          clearDrag()
          try { if (d.pointerId != null) body.releasePointerCapture(d.pointerId) } catch (err) {}
        }
        body.addEventListener('pointerdown', onDown)
        body.addEventListener('pointermove', onMove)
        body.addEventListener('pointerup', onUp)
        body.addEventListener('pointercancel', onUp)
        return () => {
          clearDrag()
          try { body.removeEventListener('pointerdown', onDown); body.removeEventListener('pointermove', onMove); body.removeEventListener('pointerup', onUp); body.removeEventListener('pointercancel', onUp) } catch (e) {}
        }
      }, [active, html, flowSelectedSeqs, flowUiBusy])

      // 开工台（发消息）自动收回：打开时点面板空白处即折叠——落在开工台自身、添加/带入浮层、
      // 侧栏、历史抽屉、卡片与任意交互控件上都不干预（保留原生行为，也避免与动作请求竞态）。
      React.useEffect(() => {
        if (active !== 'flow') return undefined
        const pane = panelRef.current
        if (!pane) return undefined
        const onComposerBlankDown = (e) => {
          if (e.button !== 0 || flowUiBusy) return
          if (!pane.querySelector('.fl-zoom-composer')) return
          const t = e.target
          if (!t || typeof t.closest !== 'function') return
          if (t.closest('.fl-zoom-composer,[data-action="fzoom-composer"],.tb-flow-add-popup,.tb-flow-bring-popup,.fl-rail,.fl-zoom-history-drawer,button,a,input,select,textarea,label,summary,[data-flow-disclosure],[data-action],[data-flow-branch],[data-flow-select-seq],[data-map-node],[data-zoom-add-drop]')) return
          if (typeof loadPanelRef.current === 'function') loadPanelRef.current('flow', 'fzoom-composer', null)
        }
        pane.addEventListener('pointerdown', onComposerBlankDown)
        return () => { try { pane.removeEventListener('pointerdown', onComposerBlankDown) } catch (e) {} }
      }, [active, html, flowUiBusy])

      // 大流镜点选可视：选中描边 + 点选模式光标；看板每次全量重渲染后恢复开工台输入文本；
      // 离开看板（退出总览/切工具/近观收起开工台）清空点选、带入暂存与输入镜像
      React.useEffect(() => {
        const board = flowZoomHostEl()
        if (active !== 'flow' || !board) {
          if (zoomPick.length) setZoomPick([])
          if (zoomRelay) setZoomRelay(null)
          return
        }
        board.classList.toggle('fl-zoom-picking', !!zoomRelay)
        for (const card of board.querySelectorAll('[data-sid]')) {
          const sid = card.getAttribute('data-sid') || ''
          card.classList.toggle('fl-zoom-picked', zoomPick.includes(sid))
        }
        const input = board.querySelector('[data-zoom-prompt]')
        if (input && board.hasAttribute('data-flow-stable')) zoomPromptRef.current = input.value
        else if (input && input.value !== zoomPromptRef.current) input.value = zoomPromptRef.current
      }, [active, html, zoomPick, zoomRelay])

      function collectFields() {
        const fields = {}
        const box = panelRef.current
        if (!box) return fields
        const nodes = box.querySelectorAll('[data-field]')
        for (const el of nodes) {
          const name = el.getAttribute('data-field')
          if (name) fields[name] = el.value == null ? '' : String(el.value)
        }
        return fields
      }

      async function loadPanel(toolId, action, el, opts) {
        if (!toolId) { setHtml(null); return }
        attemptedRef.current[toolId] = true // 标记已发起请求（refreshTools 兜底据此判定是否补打）
        const silent = Boolean(opts && opts.silent) // 静默刷新（自动轮询）：不转圈、不清错误
        // 显式交互优先：用户点「近观」等动作在途时，Session effect 的空动作重挂或 2s
        // 静默刷新若后发，会抬高 seq 并把交互响应当成过期结果丢弃，表现为按钮完全切不动。
        // 后台请求跳过本轮即可；动作落定后下一次轮询会自然补上。
        if ((silent || !action) && interactiveActionSeqRef.current[toolId]) return
        const seq = (seqRef.current[toolId] || 0) + 1
        seqRef.current[toolId] = seq
        if (!silent && action) interactiveActionSeqRef.current[toolId] = seq
        if (!silent) setBusyTool(toolId)
        if (!silent) setError(null)
        // 联动切换在途锁定：禁用面板内 select，避免在陈旧 DOM 上继续操作（成功响应会整体重渲染解锁）
        let locked = null
        const unlock = () => { if (locked) for (const s of locked) { try { s.disabled = false } catch (e) {} } }
        try {
          if (toolId === 'flow') {
            const currentFlow = panelRef.current && panelRef.current.querySelector('[data-flow][data-flow-scope]')
            const currentBody = currentFlow && currentFlow.querySelector('.tb-pane-body')
            const currentScope = currentFlow && (currentFlow.getAttribute('data-flow-scope') || '')
            if (currentBody && currentScope && (action === 'fenter' || action === 'fback')) {
              flowScrollByScopeRef.current.set(currentScope, currentBody.scrollTop)
              flowScrollIntentRef.current = action === 'fback' ? 'back' : 'enter'
            }
            if (action === 'fmore') flowSuppressHistoryAnimRef.current = true
          }
          let fields = collectFields()
          const persistFlowRules = toolId === 'flow' && ['fsave-rule', 'fcreate-rule', 'fapply-rule-json', 'ftoggle-rule', 'fdelete-rule', 'freset-rules'].includes(action)
          if (toolId === 'flow') {
            fields.__flowPresentationRules = readFlowRules()
            fields.__flowBookmarks = JSON.stringify(flowBookmarks)
            fields.__flowPreferences = JSON.stringify(readFlowPreferences())
            fields.__flowZoomLog = JSON.stringify(readFlowZoomLog())
            fields.__flowArchivedSessionIds = JSON.stringify(archivedSessionIds)
            // Harness 普通 fork/create Session 没有 subagent 血缘；完整标题只在 Client
            // useSessions 快照里。把当前可见会话的紧凑索引交给 Host，用“分支 i/n”恢复同组全景。
            fields.__flowSessionIndex = JSON.stringify(flowSessionIds.slice(0, 200).map((id) => {
              const row = flowSessionRow(id) || {}
              return { id: String(id), title: String(row.displayTitle || row.title || '').slice(0, 160), cwd: String(row.cwd || '').slice(0, 260) }
            }).filter((x) => x.id && x.title))
          }
          if (el) {
            // 点击元素自身的 data-* 属性随请求带回（data-key / data-hash / data-path 等）
            const ds = el.dataset || {}
            const d = {}
            for (const k of Object.keys(ds)) d[k] = ds[k]
            fields = { ...fields, __el: d }
          }
          if (opts && opts.lockSelects) {
            const box = panelRef.current
            if (box) {
              locked = [...box.querySelectorAll('select:not([disabled])')]
              for (const s of locked) s.disabled = true
            }
          }
          // 超时保护（v6.5.3）：首次打开 RPC 通道未就绪时 host.call 可能永久 pending——
          // 5s 无响应即视为失败，走下方一次性重试，避免面板永久停在「加载面板…」
          const callP = host.call(RT.rpc('panel'), {
            tool: toolId,
            action: action || '',
            fields,
            state: stateRef.current[toolId] || null,
            root: currentCwd || undefined,
            session: currentSessionId || undefined,
            // 实时流叠加层（仅流镜）：事件窗在途 attempt + 最近结算 firstSeq。
            // 只在确有内容时随请求携带，避免空壳 JSON 每 2s 往返。
            live: toolId === 'flow' && liveOverlayRef.current
              && ((liveOverlayRef.current.attempts && liveOverlayRef.current.attempts.length)
                || (liveOverlayRef.current.settled && liveOverlayRef.current.settled.length))
              ? liveOverlayRef.current
              : undefined,
          })
          const timeoutP = new Promise((_, reject) => {
            try { ctx.timeout(() => reject(new Error('面板请求超时（5s）')), 5000) } catch (e) {}
          })
          const res = await Promise.race([callP, timeoutP])
          if (seqRef.current[toolId] !== seq) return // 已有更新的请求发出：过期响应直接丢弃（联动切换竞态修复）；DOM 由新请求的响应接管
          if (res && res.ok) {
            if (toolId === 'flow') setFlowSyncFailure(false)
            if (persistFlowRules) writeFlowRules(JSON.stringify((res.state && res.state.presentationRules) || []))
            retryCountRef.current[toolId] = 0 // 成功：清零一次性重试计数
            stateRef.current[toolId] = res.state
            htmlRef.current[toolId] = res.html
            if (toolId === 'flow' && ['fzoom', 'fzoom-open', 'fzoom-joined', 'fzoom-run', 'fzoom-round', 'fzoom-view', 'fzoom-focus-back', 'fzoom-focus-current', 'fzoom-run-add', 'fzoom-run-remove'].includes(action)) writeFlowZoomLog(res.state)
            // 会话 scope 变化（Harness 自己切换会话）默认进入新流镜底部；
            // Flowglass 内部 fback 则由 flowScrollIntentRef 恢复上级保存位置。
            const currentFlow = panelRef.current && panelRef.current.querySelector('[data-flow][data-flow-scope]')
            const currentScope = currentFlow && (currentFlow.getAttribute('data-flow-scope') || '')
            const scopeMatch = /data-flow-scope="([^"]*)"/.exec(res.html)
            const nextScope = scopeMatch ? scopeMatch[1] : ''
            if (toolId === 'flow' && (!currentFlow || ['fzoom-view', 'fzoom-run', 'fzoom-round', 'fzoom-joined'].includes(action))) flowScrollIntentRef.current = 'latest'
            if (toolId === 'flow' && currentScope && nextScope && currentScope !== nextScope && !flowScrollIntentRef.current) {
              const currentBody = currentFlow.querySelector('.tb-pane-body')
              if (currentBody) flowScrollByScopeRef.current.set(currentScope, currentBody.scrollTop)
              flowScrollIntentRef.current = 'enter'
            }
            // 任何动作都保存滚动位置（自动轮询/展开详情/提交等）：全量 innerHTML 重渲染会丢滚动/选择，
            // 先记录各可滚动子容器 scrollTop 与所属工具，setHtml 后经 effect 恢复（切工具不恢复）
            if (panelRef.current && !flowScrollIntentRef.current) {
              try {
                const scrolls = []
                const scrollers = panelRef.current.querySelectorAll('.tb-pane-body, .tb-code, .fl-pre, .tb-desc')
                for (const s of scrollers) scrolls.push(toolId === 'flow' ? {
                  top: s.scrollTop, left: s.scrollLeft,
                  bottom: s.classList.contains('tb-pane-body') && (s.classList.contains('tb-pane-col') ? s.scrollHeight - s.clientHeight - s.scrollTop < 40 : Math.abs(s.scrollTop) < 40),
                } : s.scrollTop)
                htmlScrollRef.current = { tool: toolId, scrolls }
              } catch (e) {}
            }
            // 切 Harness 会话时保留当前大流镜画面，等目标 Session 真正生效后一次性换页。
            // 若先 setHtml 再导航，原生 Session Tab 会经历“旧页聚焦 → 卸载 → 新页重开”；
            // 后面的双定时重开又会重复挂载，表现为明显闪屏。
            const deferFlowNavigationRender = toolId === 'flow' && action === 'fzoom-open' && !!res.navigateSession
            if (!deferFlowNavigationRender) {
              if (toolId === 'flow' && action === 'fdetail' && el) {
                flowFocusRef.current = {
                  scope: currentCwd + '\u0001' + nextScope,
                  seq: String((el.dataset && el.dataset.seq) || el.getAttribute && el.getAttribute('data-seq') || ''),
                }
              }
              setHtml(res.html)
            }
            // Host 只在 Flowglass 已开启“子代理跟随”且用户主动点击进入时返回该指令。
            // 使用 SessionRuntime 导航会让 Harness 的会话列表、会话页和持久选中态一起更新。
            if (toolId === 'flow' && res.navigateSession) {
              const target = String(res.navigateSession.sessionId || '')
              const oldScope = currentScope || ''
              if (target) {
                // Host 返回的 state 已包含新 sid + crumbs。Harness 切 Session 会清空常规面板缓存，
                // 因此在 Client 独立暂存，等目标 Session 真正成为 current 后再注入。
                flowFollowStateBySessionRef.current.set(target, res.state)
                if (action === 'fback' && oldScope) flowFollowStateBySessionRef.current.delete(oldScope)
                flowHarnessNavTargetRef.current = target
              }
              try { await navigateHarnessSession(res.navigateSession) }
              catch (e) {
                if (flowHarnessNavTargetRef.current === target) flowHarnessNavTargetRef.current = null
                if (target) flowFollowStateBySessionRef.current.delete(target)
                setError('Flowglass 已切换，但 Harness 跟随失败: ' + String((e && e.message) || e))
              }
              // 原生右侧栏是 Session 绑定视图；真正观察到 currentSessionId 变更后，
              // 下方会话 effect 只重开一次，避免导航前后的重复挂载闪屏。
            }
            // 大流镜 ⇪ 带入：Host 已取源会话最新结论 → 暂存并进入点选模式（点卡选目标后带入/发送）
            if (toolId === 'flow' && res.zoomRelay && typeof res.zoomRelay.text === 'string' && res.zoomRelay.text) {
              setFlowWorkbench({ mode: 'relay', text: res.zoomRelay.text, target: currentSessionId || '' })
            }
            // 自动刷新约定：工具 HTML 带 data-autorefresh="ms" → 抽屉静默定时重拉（静默 = 不转圈）
            const am = /data-autorefresh="(\d+)"/.exec(res.html)
            setAutoMs((cur) => {
              const has = Object.prototype.hasOwnProperty.call(cur, toolId)
              if (am) {
                const ms = Math.max(1500, parseInt(am[1], 10) || 2000)
                if (has && cur[toolId] === ms) return cur
                return { ...cur, [toolId]: ms }
              }
              if (!has) return cur
              const next = { ...cur }
              delete next[toolId]
              return next
            })
            // Tab 角标约定：工具 HTML 带 data-tab-badge="文本" → 该工具 Tab 显示角标（空字符串=清除）
            const bm = /data-tab-badge="([^"]{0,12})"/.exec(res.html)
            setTabBadges((cur) => {
              const has = Object.prototype.hasOwnProperty.call(cur, toolId)
              const val = bm ? bm[1] : null
              if (val) {
                if (has && cur[toolId] === val) return cur
                return { ...cur, [toolId]: val }
              }
              if (!has) return cur
              const next = { ...cur }
              delete next[toolId]
              return next
            })
            // copy 契约：Host 附带 copy 字符串 → 写剪贴板并短暂提示
            if (typeof res.copy === 'string' && res.copy) {
              try {
                if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(res.copy)
                  setCopied('已复制 ' + res.copy.length + ' 字符')
                } else {
                  setCopied('当前环境无剪贴板 API')
                }
              } catch (e) {
                setCopied('复制失败: ' + String((e && e.message) || e))
              }
            } else {
              setCopied(null)
            }
            return res
          } else {
            if (toolId === 'flow') setFlowSyncFailure(true)
            setError((res && res.error) || '面板加载失败')
            retryOnce(toolId)
          }
        } catch (e) {
          if (seqRef.current[toolId] === seq) {
            if (toolId === 'flow') setFlowSyncFailure(true)
            setError('面板请求异常: ' + String((e && e.message) || e))
            retryOnce(toolId)
          }
        } finally {
          // 解锁统一放 finally（幂等）：过期响应早退、失败、异常路径都要恢复面板内 select——
          // 原先「过期 return 跳过 unlock」+「后发请求锁不到已禁用的 select」组合会让控件
          // 永久禁用至下次成功动作。成功路径锁的是即将被 innerHTML 替换的旧节点，无害。
          unlock()
          if (interactiveActionSeqRef.current[toolId] === seq) delete interactiveActionSeqRef.current[toolId]
          if (seqRef.current[toolId] === seq) setBusyTool((cur) => (cur === toolId ? null : cur))
        }
      }
      // 一次性失败重试（v6.5.3，非轮询）：瞬时失败（首次打开通道未就绪/超时）时延迟重试，
      // 最长 2 次、间隔 1.2s；仅当抽屉仍打开且 active 未变才重试。成功清零（见 loadPanel 成功分支）。
      function retryOnce(toolId) {
        if ((retryCountRef.current[toolId] || 0) >= 2) return
        retryCountRef.current[toolId] = (retryCountRef.current[toolId] || 0) + 1
        try {
          ctx.timeout(() => {
            const cur = activeRef.current
            if (cur === toolId && openRef.current && typeof loadPanelRef.current === 'function') {
              loadPanelRef.current(toolId, '', null)
            }
          }, 1200)
        } catch (e) {}
      }
      // loadPanel 的最新引用：原生 change 监听只挂一次，经 ref 调用避免闭包捕获过期渲染帧
      const loadPanelRef = React.useRef(null)
      loadPanelRef.current = loadPanel

      // 关键修复：面板是 dangerouslySetInnerHTML 注入的裸 DOM，其中的 <select> 没有 React fiber；
      // React 18 ChangeEventPlugin 只在「目标是 React 受管的 select/input」时派发合成 onChange
      // （裸 DOM select 取到最近祖先纤维 = 容器 div，shouldUseChangeEvent(div)=false ⇒ 永不派发），
      // 所以容器上的 onChange 属性对面板内 select 永远不触发（点击/键盘事件无此目标类型检查，不受影响）。
      // 原生 change 事件正常冒泡——改在抽屉根节点挂原生监听（随抽屉关闭卸载、重开重挂）。
      React.useEffect(() => {
        if (!isOpen) return undefined
        const root = drawerRef.current
        if (!root) return undefined
        const onNativeChange = (e) => {
          const t = e.target
          const el = t && t.closest ? t.closest('[data-action-onchange]') : null
          if (!el) return
          const box = panelRef.current
          if (!box || !box.contains(el)) return // 仅面板内控件（排除壳自身的 React 表单输入）
          const tool = activeRef.current
          if (!tool || typeof loadPanelRef.current !== 'function') return
          // 联动切换在途锁定面板内 select（lockSelects），避免在陈旧 DOM 上连续操作
          loadPanelRef.current(tool, el.getAttribute('data-action-onchange') || '', el, { lockSelects: true })
        }
        root.addEventListener('change', onNativeChange)
        return () => { try { root.removeEventListener('change', onNativeChange) } catch (err) {} }
      }, [isOpen])

      // Flowglass 向上分页：.tb-pane-body 是 column-reverse，Chrome 中视觉顶部的
      // scrollTop 通常是负的 -max；也兼容返回正 max 的实现。使用绝对值与最大距离比较。
      // loadPanel 的旧 scrollTop 恢复会把原来最早的那张卡留在原位，新加载内容出现在它上方。
      React.useEffect(() => {
        if (!isOpen || active !== 'flow') return undefined
        const root = panelRef.current
        if (!root) return undefined
        const onFlowScroll = (e) => {
          const body = e.target
          if (!body || !body.classList || !body.classList.contains('tb-pane-body')) return
          const flow = body.closest && body.closest('[data-flow][data-flow-has-older="1"]')
          if (!flow || flowOlderLoadingRef.current) return
          const max = Math.max(0, body.scrollHeight - body.clientHeight)
          // 距视觉顶部 80px 内即预加载，避免必须精确碰顶才触发。
          if (max <= 0 || Math.abs(max - Math.abs(body.scrollTop)) > 80) return
          flowOlderLoadingRef.current = true
          flowSuppressHistoryAnimRef.current = true
          const load = loadPanelRef.current
          if (typeof load !== 'function') { flowOlderLoadingRef.current = false; return }
          Promise.resolve(load('flow', 'fmore', null, { silent: true }))
            .catch(() => {})
            .finally(() => { flowOlderLoadingRef.current = false })
        }
        root.addEventListener('scroll', onFlowScroll, true)
        return () => { try { root.removeEventListener('scroll', onFlowScroll, true) } catch (e) {} }
      }, [isOpen, active, html])

      async function refreshTools() {
        const list = await fetchTools(cwdRef.current)
        setTools(list)
        // 空列表 = 框架启动期工具未注册/暂缺，不是「真的没有工具」：不纠正 active、清成 null。
        // 否则抽屉打开前的挂载刷新会把 active 清掉并落盘，打开后出现无 tab 激活的假死态
        if (!list.length) return
        // 无有效记忆时的默认 Tab：会话「流程」（用户指定）；没有 flow 才退到列表第一个。
        // 分类芯片必须同步切到目标工具的分类（flow 在「会话」），否则面板与 Tab 栏错位
        const cur = activeRef.current
        if (cur && list.some((t) => t.id === cur)) return
        const flow = list.find((t) => t.id === 'flow')
        const target = flow ? flow.id : (list.length ? list[0].id : null)
        if (target && catOf(target) !== cat) setCat(catOf(target))
        setActive(target)
      }

      // ===== 插件生命周期开关（齿轮管理视图）：直连 Host 半 toolbox/plugins + toolbox/plugin-toggle =====
      async function refreshPlugins() {
        try {
          const r = await host.call(RT.rpc('plugins'), { session: currentSessionId || undefined })
          setPlugins(r && r.ok && Array.isArray(r.plugins) ? r.plugins : [])
          if (r && r.ok && r.capabilities && typeof r.capabilities === 'object') setPluginCaps(r.capabilities)
        } catch (e) {}
      }

      async function togglePlugin(p) {
        if (p.hasClientHalf) return
        if (p.running && p.canStop === false) return
        setError(null)
        try {
          const r = await host.call(RT.rpc('plugin-toggle'), {
            pluginId: p.pluginId,
            enable: !p.running,
            root: currentCwd || undefined,
            session: currentSessionId || undefined,
          })
          if (r && !r.ok) setError(r.error || '插件操作失败')
          else if (r && r.warning) setRebuildLines(['⚠ ' + String(r.warning)]) // 启停已生效但启停记忆写盘失败：不静默
        } catch (e) {
          setError('插件操作异常: ' + String((e && e.message) || e))
        }
        refreshPlugins()
        refreshTools() // 停止 → 注册表级联移除 Tab；启动 → 500ms 重试注册后自动回来
      }

      // 重跑类操作后的落定刷新：等注册表 500ms 重试周期过后再拉工具列表并重载当前面板——
      // 立即刷新会撞上「工具暂缺」窗口（registry 已清空、心跳未重挂），把 active Tab 挤走或报未注册
      function settleAfterRestart() {
        ctx.timeout(() => {
          refreshTools()
          const t = activeRef.current
          if (t) loadPanel(t, '', null)
        }, 700)
      }

      // 重跑单个插件：桩重读磁盘 impl，改完代码点这个即生效
      async function restartPlugin(p) {
        if (p.hasClientHalf) return
        setError(null)
        try {
          const r = await host.call(RT.rpc('plugin-restart'), {
            pluginId: p.pluginId,
            root: currentCwd || undefined,
            session: currentSessionId || undefined,
          })
          if (r && !r.ok) setError(r.error || '插件重跑失败')
        } catch (e) {
          setError('插件重跑异常: ' + String((e && e.message) || e))
        }
        refreshPlugins()
        settleAfterRestart()
      }

      // 批量启停：Host-only 插件一次全停/全启，启停记忆统一落盘
      async function toggleAll(enable) {
        setError(null)
        try {
          const r = await host.call(RT.rpc('plugin-toggle-all'), { enable, root: currentCwd || undefined, session: currentSessionId || undefined })
          const lines = []
          if (!r) lines.push('批量操作无响应')
          else {
            if (r.error) lines.push('✗ ' + r.error)
            if (r.warning) lines.push('⚠ ' + String(r.warning))
            if (Array.isArray(r.done) && r.done.length) lines.push((enable ? '已启动: ' : '已停止: ') + r.done.join('、'))
            if (Array.isArray(r.skippedClient) && r.skippedClient.length) lines.push('跳过（含 Client 半，需到 Cordis 面板）: ' + r.skippedClient.join('、'))
            if (Array.isArray(r.failed) && r.failed.length) lines.push('失败: ' + r.failed.join('；'))
            if (lines.length === 0) lines.push('没有可操作的插件')
          }
          setRebuildLines(lines)
        } catch (e) {
          setRebuildLines(['批量操作异常: ' + String((e && e.message) || e)])
        }
        refreshPlugins()
        refreshTools()
      }

      // 「重启后」pill 点击：只改启停记忆（下次重建的默认启停），不动当前运行态
      async function setDefaultPlugin(p) {
        if (p.defaultStart == null) return // 不在 plugins.json 清单内，无条目可记
        setError(null)
        try {
          const r = await host.call(RT.rpc('plugin-set-default'), {
            pluginId: p.pluginId,
            enabled: !p.defaultStart,
            root: currentCwd || undefined,
            session: currentSessionId || undefined,
          })
          if (r && !r.ok) setError(r.error || '默认启停设置失败')
        } catch (e) {
          setError('默认启停设置异常: ' + String((e && e.message) || e))
        }
        refreshPlugins()
      }

      // 批量重跑：运行中的 Host-only 插件全部重启（桩重读磁盘 impl）——改完多个工具一键生效
      async function restartAll() {
        setError(null)
        try {
          const r = await host.call(RT.rpc('plugin-restart-all'), { root: currentCwd || undefined, session: currentSessionId || undefined })
          const lines = []
          if (!r) lines.push('批量重跑无响应')
          else {
            if (r.error) lines.push('✗ ' + r.error)
            if (Array.isArray(r.done) && r.done.length) lines.push('已重跑: ' + r.done.join('、') + '（面板大本体如预览/diff 已随闭包重置）')
            if (Array.isArray(r.skippedClient) && r.skippedClient.length) lines.push('跳过（含 Client 半，需到 Cordis 面板）: ' + r.skippedClient.join('、'))
            if (Array.isArray(r.failed) && r.failed.length) lines.push('失败: ' + r.failed.join('；'))
            if (lines.length === 0) lines.push('没有运行中的 Host-only 插件')
          }
          setRebuildLines(lines)
        } catch (e) {
          setRebuildLines(['批量重跑异常: ' + String((e && e.message) || e)])
        }
        refreshPlugins()
        settleAfterRestart()
      }

      // 重建耗时历史（迷你柱状图；仅动态模式有磁盘重建语义）
      async function loadRebuildHistory() {
        if (pluginCaps && pluginCaps.rebuildFromDisk === false) { setRebuildHistory([]); return }
        try {
          const r = await host.call(RT.rpc('rebuild-history'))
          setRebuildHistory(r && r.ok && Array.isArray(r.history) ? r.history : [])
        } catch (e) {}
      }

      // AI 用量台账聚合（管理视图总行；bundle 未含 AI 工具时不请求不展示）
      async function loadAiUsage() {
        if (pluginCaps && pluginCaps.aiUsage === false) { setAiUsage(null); return }
        try {
          const r = await host.call(RT.rpc('ai-usage'))
          setAiUsage(r && r.ok ? r : null)
        } catch (e) {}
      }

      // 自举重建：框架读磁盘 payload.json 批量 define+run（幂等，已定义的跳过）
      async function runRebuild() {
        setRebuilding(true)
        setError(null)
        try {
          const r = await host.call(RT.rpc('rebuild'), { root: currentCwd || undefined, session: currentSessionId || undefined })
          const lines = []
          if (!r) lines.push('重建请求无响应')
          else {
            if (r.error) lines.push('✗ ' + r.error)
            if (Array.isArray(r.defined) && r.defined.length) lines.push('新定义: ' + r.defined.join('、'))
            if (Array.isArray(r.started) && r.started.length) lines.push('已启动: ' + r.started.join('、'))
            if (Array.isArray(r.skipped) && r.skipped.length) lines.push('跳过（已定义/框架自身）: ' + r.skipped.join('、'))
            if (Array.isArray(r.suppressed) && r.suppressed.length) lines.push('保持关闭（启停记忆）: ' + r.suppressed.join('、'))
            if (Array.isArray(r.failed) && r.failed.length) lines.push('失败: ' + r.failed.join('；'))
            if (typeof r.ms === 'number') lines.push('耗时: ' + r.ms + 'ms（payload 读盘 + define + run 串行）')
            if (lines.length === 0) lines.push('plugins.json 内插件均已存在，无需重建')
          }
          setRebuildLines(lines)
        } catch (e) {
          setRebuildLines(['重建异常: ' + String((e && e.message) || e)])
        } finally {
          setRebuilding(false)
        }
        loadRebuildHistory()
        refreshPlugins()
        refreshTools()
      }

      React.useEffect(() => {
        // 轮询减负：plugins 清单只有管理视图需要——普通模式只刷 tools（RPC  chatter 减半）
        const disp = ctx.interval(() => { if (openRef.current) { refreshTools(); if (managingRef.current) refreshPlugins() } }, 1500)
        // 抽屉打开时的导航恢复（用户指定）：重载后「第一次」打开 → 默认 会话+流程；之后打开 →
        // 恢复上次离开的 分类+工具（lastNav 临时记录）。两路都同步分类芯片与工具 Tab，防面板/Tab 栏错位。
        const offOpen = store.subscribe(() => {
          if (!store.isOpen()) return
          const remembered = lastNav && lastNav.active
          // 有记忆恢复记忆（工具已停则由 refreshTools 兜底回默认并同步分类）；无记忆默认 会话+流程
          if (remembered) { setCat(catOf(remembered)); setActive(remembered) }
          else { setCat(catOf('flow')); setActive('flow') }
          refreshTools(); refreshPlugins()
        })
        refreshTools()
        refreshPlugins()
        return () => { try { disp() } catch (e) {} offOpen() }
      }, [])

      // 会话/工作区切换跟随：当前会话的 cwd 或 session id 任一变化 = 切会话或切工作区。
      // 两个仓库工具 id 同名时 refreshTools 的「active 保持」分支不会重载面板，且 loadPanel
      // 只在 active 变化时触发——切会话（同工作区或跨工作区）active 不变，面板仍显示旧会话
      // 内容（如 flow 流程图）。这里清掉缓存并强制重拉当前面板（带新 session 参数）。
      React.useEffect(() => {
        const cwd = currentCwd || ''
        const sid = currentSessionId || ''
        if (!sid) return
        if (handledCwdRef.current === cwd && handledSessionRef.current === sid) return
        const cwdChanged = handledCwdRef.current !== cwd
        const sidChanged = handledSessionRef.current !== sid
        handledCwdRef.current = cwd
        handledSessionRef.current = sid
        // 清会话级缓存（cwd 或 sid 任一变化）：工具的 st.sid 是会话级 state（flow/trace 等
        // 优先 st.sid 渲染），切会话不清理会沿用旧会话 id——必须清空让工具从新会话重算。
        // 工具列表只在跨工作区（cwd 变）时重拉（工具按仓库根分组）。
        if (cwdChanged || sidChanged) {
          const isFlowFollow = sidChanged && flowHarnessNavTargetRef.current === sid
          const followState = isFlowFollow ? flowFollowStateBySessionRef.current.get(sid) : null
          htmlRef.current = {}
          stateRef.current = {}
          seqRef.current = {}
          if (followState) stateRef.current.flow = followState
          if (sidChanged) {
            flowHarnessNavTargetRef.current = null
            const keepNativeFlowOpen = readFlowPreferences().keepOpenOnSessionSwitch && nativeFlowVisible
              && (!nativeFlowReopenSession || nativeFlowReopenSession === sid)
            if ((isFlowFollow || keepNativeFlowOpen) && nativeOpenTab) {
              try {
                ctx.timeout(() => {
                  try { nativeOpenTab() } catch (e) {}
                  if (nativeFlowReopenSession === sid) nativeFlowReopenSession = ''
                }, 0)
              } catch (e) {}
            }
            if (!isFlowFollow) {
              // 用户手动切换 Session：不沿用之前 Flowglass 的临时返回链。
              flowFollowStateBySessionRef.current.clear()
              flowScrollByScopeRef.current.clear()
              flowScrollIntentRef.current = 'enter'
            }
          }
        }
        if (cwdChanged) {
          // 同时清上一工作区的在屏 HTML 与逐工具请求标记：经过无工具箱的工作区后延迟重载
          // 会因旧空列表跳过，新工具列表到达时 attemptedRef 又挡住补发，面板将一直残留
          // 上一工作区的缓存 HTML（retryCount 一并重置，失败重试额度不被旧工作区消耗）
          attemptedRef.current = {}
          retryCountRef.current = {}
          setHtml(null)
          refreshTools()
        }
        // 面板重载延后一拍：等 refreshTools 的 setTools/active 纠正落地（新仓库无同名工具时
        // active 已被兜底切到新列表第一个），用最新 activeRef 加载，避免对不存在工具发请求。
        ctx.timeout(() => {
          const t = activeRef.current
          const list = toolsRef.current
          if (t && (!list || list.some((x) => x.id === t)) && typeof loadPanelRef.current === 'function') {
            loadPanelRef.current(t, '', null)
          }
        }, 0)
        refreshPlugins()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [currentCwd, currentSessionId])

      // 单工具图标替换：只剩一个非工具箱工具时，侧边栏入口的「工具箱」图标换成该工具的图标；
      // 多工具 / 管理视图恢复工具箱图标。（图标随注册表下发，此项只消费 tools 的 icon 字段，平日不显示）
      React.useEffect(() => {
        const solo = !managing && tools.length === 1 && tools[0] && tools[0].icon
          ? tools[0].icon : null
        replaceSidebarIcon(solo || ENTRY_NAV_ICON)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tools, managing])

      // 面板自动刷新：当前工具的 HTML 声明了 data-autorefresh="ms" 时，静默轮询（不转圈、不抢滚动——silent 路径）
      const curAutoMs = active ? autoMs[active] : undefined
      React.useEffect(() => {
        if (!isOpen || !active || !curAutoMs) return undefined
        const disp = ctx.interval(() => {
          if (managingRef.current) return
          if (zoomComposerBusy()) return // 开工台编辑中：不抢重渲染（清空/开工后自动恢复）
          if (typeof loadPanelRef.current === 'function') loadPanelRef.current(active, '__refresh', null, { silent: true })
        }, curAutoMs)
        return () => { try { disp() } catch (e) {} }
      }, [isOpen, active, curAutoMs])

      // 激活 Tab 变化 → 切回该工具上次的面板并刷新。
      // isOpen 守卫：抽屉关闭时不预加载面板（页面加载早期 RPC 通道未就绪，
      // 提前 loadPanel 会永久卡住 → 首次打开显示「加载面板…」；打开抽屉时
      // isOpen 变化重新触发本 effect 正常加载）
      React.useEffect(() => {
        if (!isOpen) return
        if (!active) { lastPanelActiveRef.current = null; setHtml(null); return }
        // localStorage 记忆可能指向已停止的工具：tools 已加载且不含它时等 refreshTools 纠正，不闪错误
        if (tools.length && !tools.some((t) => t.id === active)) return
        const switched = lastPanelActiveRef.current !== active
        lastPanelActiveRef.current = active
        if (active === 'flow' && switched) {
          // 分页只是本次阅读状态：切换 Tab 后回来从最近 60 条重新开始。
          stateRef.current[active] = null
          htmlRef.current[active] = null
          htmlScrollRef.current = null
          setHtml(null)
        } else {
          setHtml(htmlRef.current[active] || null)
        }
        loadPanel(active, '', null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [active, isOpen])

      // 初次加载不变量（v6.5.4）：上面的激活 effect 只响应 [active, isOpen]，框架启动窗口里
      // tools 暂缺/暂空会让它 return 跳过，之后 active 不再变化就永远没人补加载（表现为
      // 无 tab 激活 + 面板永久「加载面板…」，手动切 tab 才好）。这里按 tools 强制不变量：
      // 抽屉开着且列表非空时，active 无效 → 兜底 flow/第一个（交给激活 effect 接管加载）；
      // active 有效但从未发起过面板请求 → 补发一次（attemptedRef 去重，不循环）
      React.useEffect(() => {
        if (!isOpen || !tools.length) return
        if (!active || !tools.some((t) => t.id === active)) {
          const flow = tools.find((t) => t.id === 'flow')
          const target = flow ? flow.id : tools[0].id
          setCat(catOf(target))
          setActive(target)
          return
        }
        if (!attemptedRef.current[active] && typeof loadPanelRef.current === 'function') {
          loadPanelRef.current(active, '', null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [tools, isOpen])

      // 详情内容框复制：读同段 .fl-pre 的 textContent（浏览器已把实体解码回原文）写剪贴板，
      // 纯客户端不绕 Host；1.2s 后经 ctx.timeout 复位按钮文案（插件停止随生命周期清理）
      async function copyFlowRailContent(btn) {
        const sec = btn.closest('.fl-sec')
        const pre = sec && sec.querySelector('.fl-pre')
        const text = pre ? String(pre.textContent || '') : ''
        let ok = false
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text)
            ok = true
          } else {
            const ta = document.createElement('textarea')
            ta.value = text
            ta.setAttribute('readonly', '')
            ta.style.position = 'fixed'
            ta.style.opacity = '0'
            document.body.appendChild(ta)
            ta.select()
            ok = document.execCommand('copy')
            ta.remove()
          }
        } catch (e) { ok = false }
        btn.classList.add(ok ? 'fl-copied' : 'fl-copy-fail')
        btn.setAttribute('title', ok ? '已复制' : '复制失败')
        btn.setAttribute('aria-label', ok ? '已复制' : '复制失败')
        ctx.timeout(() => {
          btn.classList.remove('fl-copied', 'fl-copy-fail')
          btn.setAttribute('title', '复制内容到剪贴板')
          btn.setAttribute('aria-label', '复制内容到剪贴板')
        }, 1200)
      }

      const flowMutationBlocked = () => {
        if (!panelRef.current || !panelRef.current.querySelector('[data-flow-replay-active="1"]')) return false
        setFlowUiNotice('回放为只读，请先退出回放再执行任务。')
        return true
      }
      const prepareFlowConclusions = async () => {
        const box = panelRef.current
        const chosen = box ? [...box.querySelectorAll('[data-flow-conclusion]:checked')].slice(0, 4) : []
        if (chosen.length < 2) { setFlowUiNotice('请选择 2–4 条已完成结论进行对比。'); return }
        setFlowUiBusy(true)
        try {
          const results = []
          for (const node of chosen) {
            const sid = node.getAttribute('data-sid')
            const seq = Number(node.getAttribute('data-seq'))
            const round = node.getAttribute('data-round') || '来源轮次未对齐'
            const response = await host.call(RT.rpc('panel'), {
              tool: 'flow', action: 'fcontext', fields: { __el: { seqs: String(seq), requireCompleted: '1' } },
              state: { sid, home: sid, live: false, follow: false, zoom: false }, root: currentCwd || undefined, session: sid,
            })
            if (!response || !response.ok || !response.flowContext || !response.flowContext.text
              || !Array.isArray(response.flowContext.seqs) || response.flowContext.seqs.length !== 1 || response.flowContext.seqs[0] !== seq) throw new Error('已完成结论不可用或节点已变化：' + sid)
            results.push({ sid, seq, round, text: response.flowContext.text })
          }
          const text = results.map((item, index) => '## 分支 ' + (index + 1) + '\n来源：' + item.sid + ' · ' + item.round + ' · 节点 ' + item.seq + '\n\n' + item.text).join('\n\n')
          setFlowWorkbench({ mode: 'compare', results, text, target: currentSessionId || '' })
        } catch (e) { setFlowUiNotice('结论读取失败：' + String(e.message || e)) }
        finally { setFlowUiBusy(false) }
      }
      const prepareFlowExport = () => {
        const flow = panelRef.current && panelRef.current.querySelector('[data-flow]')
        if (!flow) return
        const bounds = flow.getBoundingClientRect()
        const cards = [...flow.querySelectorAll('[data-flow-main-card],.fl-iocard,[data-map-node],.fl-overview-card')]
          .filter((node) => node.getClientRects().length && !node.closest('.fl-rail'))
          .map((node) => {
            const rect = node.getBoundingClientRect()
            return { kind: node.getAttribute('data-flow-role') || (node.hasAttribute('data-map-node') ? '关系节点' : '工具'),
              status: node.getAttribute('data-flow-status') || node.getAttribute('data-flow-state') || (node.closest('[data-flow-status]') && node.closest('[data-flow-status]').getAttribute('data-flow-status')) || (node.closest('.fl-tool-row') && node.closest('.fl-tool-row').querySelector('[data-flow-status]') && node.closest('.fl-tool-row').querySelector('[data-flow-status]').getAttribute('data-flow-status')) || 'unknown',
              x: Math.round(rect.left - bounds.left), y: Math.round(rect.top - bounds.top), width: Math.round(rect.width), height: Math.round(rect.height),
              visible: rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right,
              summary: String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180) }
          }).filter((node) => node.visible)
        setFlowWorkbench({ mode: 'export', format: 'json', includeText: false, width: Math.round(bounds.width), height: Math.round(bounds.height), cards,
          counts: { loaded: Number(flow.getAttribute('data-flow-visible')) || 0, total: Number(flow.getAttribute('data-flow-total')) || 0 }, view: flow.getAttribute('data-flow-view') || 'session' })
      }
      const flowExportText = (workbench) => {
        const cards = workbench.cards.map(({ summary, visible, ...card }) => ({ ...card, ...(workbench.includeText ? { summary } : {}) }))
        if (workbench.format === 'svg') {
          const escape = (value) => String(value).replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
          return '<svg xmlns="http://www.w3.org/2000/svg" width="' + workbench.width + '" height="' + workbench.height + '" viewBox="0 0 ' + workbench.width + ' ' + workbench.height + '"><rect width="100%" height="100%" fill="#f6f7f9"/><title>Flowglass 当前可见节点快照</title>' + cards.map((card) => '<g><rect x="' + card.x + '" y="' + card.y + '" width="' + card.width + '" height="' + Math.max(card.height, 32) + '" rx="8" fill="white" stroke="#758195"/><text x="' + (card.x + 8) + '" y="' + (card.y + 20) + '" font-family="sans-serif" font-size="12" fill="#263244">' + escape(card.kind + ' · ' + card.status) + '</text>' + (card.summary ? '<text x="' + (card.x + 8) + '" y="' + (card.y + 38) + '" font-family="sans-serif" font-size="11" fill="#465366">' + escape(card.summary.slice(0, Math.max(4, Math.floor(card.width / 12)))) + '</text>' : '') + '</g>').join('') + '</svg>'
        }
        return JSON.stringify({ schema: 'flowglass-diagnostic/1', version: '0.6.1', view: workbench.view, counts: workbench.counts, scope: '当前视口中的可见节点', includesSummaries: workbench.includeText, nodes: cards }, null, 2)
      }
      const downloadFlowExport = () => {
        if (!flowWorkbench || flowWorkbench.mode !== 'export') return
        const format = flowWorkbench.format
        const url = URL.createObjectURL(new Blob([flowExportText(flowWorkbench)], { type: format === 'svg' ? 'image/svg+xml;charset=utf-8' : 'application/json;charset=utf-8' }))
        const anchor = document.createElement('a')
        anchor.href = url; anchor.download = 'flowglass-' + Date.now() + '.' + format; anchor.click()
        ctx.timeout(() => URL.revokeObjectURL(url), 1000)
      }
      function onPanelClick(e) {
        if (!active) return
        const t = e.target
        if (active === 'flow' && t && t.closest) {
          if (t.matches('[data-flow-conclusion]')) {
            const scope = currentCwd + '\u0001' + flowScope()
            const selected = new Set(flowConclusionSelectionRef.current.get(scope) || [])
            if (t.checked) selected.add(t.getAttribute('data-node-key')); else selected.delete(t.getAttribute('data-node-key'))
            flowConclusionSelectionRef.current.set(scope, selected)
            return
          }
          const bookmark = t.closest('[data-flow-bookmark]')
          if (bookmark) {
            e.preventDefault(); e.stopPropagation()
            const item = { sessionId: bookmark.getAttribute('data-session') || bookmark.getAttribute('data-sid') || flowScope(),
              seq: Number(bookmark.getAttribute('data-seq')), kind: bookmark.getAttribute('data-kind') || 'msg', note: '', createdAt: Date.now() }
            const existing = flowBookmarks.find((saved) => saved.sessionId === item.sessionId && saved.seq === item.seq && saved.kind === item.kind)
            setFlowWorkbench({ mode: 'bookmarks', editing: existing || item })
            return
          }
          if (t.closest('[data-flow-bookmarks]')) { e.preventDefault(); setFlowWorkbench({ mode: 'bookmarks' }); return }
          if (t.closest('[data-flow-export]')) { e.preventDefault(); prepareFlowExport(); return }
          if (t.closest('[data-flow-compare-preview]')) { e.preventDefault(); prepareFlowConclusions(); return }
          if (t.closest('[data-action="fsearch-clear"]')) {
            const box = panelRef.current
            for (const field of box.querySelectorAll('[data-field="flowSearch"],[data-field="flowRole"],[data-field="flowStatus"]')) field.value = field.tagName === 'SELECT' ? 'all' : ''
          }
        }
        if (Date.now() < suppressFlowClickUntilRef.current) { e.preventDefault(); return }
        const branch = t && t.closest ? t.closest('[data-flow-branch]') : null
        if (active === 'flow' && branch) {
          if (panelRef.current.querySelector('[data-flow-replay-active="1"]')) { e.preventDefault(); setFlowUiNotice('回放为只读，请先退出回放再创建分支。'); return }
          e.preventDefault()
          e.stopPropagation()
          const detail = branch.closest('[data-flow-detail-session]')
          const sourceSid = detail ? (detail.getAttribute('data-flow-detail-session') || '') : ''
          const turn = branch.getAttribute('data-turn') || ''
          if (sourceSid && turn) executeZoomCellFork(sourceSid, Number(branch.getAttribute('data-seq')), turn, branch.getAttribute('data-history') || '', branch.getAttribute('data-round') || '')
          else branchFlowAt(Number(branch.getAttribute('data-seq')), sourceSid)
          return
        }
        const previewBtn = t && t.closest ? t.closest('[data-flow-markdown-preview]') : null
        if (active === 'flow' && previewBtn) {
          e.preventDefault()
          e.stopPropagation()
          const key = previewBtn.getAttribute('data-flow-markdown-key') || ''
          setFlowMarkdownPreviewKey((current) => {
            const disabling = current === key
            flowMarkdownDisabledKeyRef.current = disabling ? key : null
            return disabling ? null : key
          })
          return
        }
        const copyBtn = t && t.closest ? t.closest('[data-flow-copy]') : null
        if (active === 'flow' && copyBtn) {
          e.preventDefault()
          e.stopPropagation()
          copyFlowRailContent(copyBtn)
          return
        }
        const ruleEdit = t && t.closest ? t.closest('[data-flow-rule-edit]') : null
        const ruleNew = t && t.closest ? t.closest('[data-flow-rule-new]') : null
        const ruleCancel = t && t.closest ? t.closest('[data-flow-rule-cancel]') : null
        if (active === 'flow' && (ruleEdit || ruleNew || ruleCancel)) {
          e.preventDefault()
          e.stopPropagation()
          const box = panelRef.current
          if (!box) return
          const targetCard = ruleEdit ? ruleEdit.closest('.fl-rule-card') : ruleNew ? box.querySelector('.fl-rule-new') : ruleCancel.closest('.fl-rule-card')
          const opening = !ruleCancel && targetCard && !targetCard.classList.contains('fl-rule-open')
          for (const card of box.querySelectorAll('.fl-rule-card.fl-rule-open')) card.classList.remove('fl-rule-open')
          for (const button of box.querySelectorAll('[data-flow-rule-edit],[data-flow-rule-new]')) button.setAttribute('aria-expanded', 'false')
          if (opening && targetCard) {
            targetCard.classList.add('fl-rule-open')
            const trigger = ruleEdit || ruleNew
            trigger.setAttribute('aria-expanded', 'true')
            const first = targetCard.querySelector('input:not([type="hidden"])')
            if (first && typeof first.focus === 'function') first.focus()
          }
          return
        }
        // 大流镜开工台：客户端行为按钮（不经 Host RPC）
        const zLaunch = t && t.closest ? t.closest('[data-zoom-launch]') : null
        if (active === 'flow' && zLaunch) {
          e.preventDefault()
          e.stopPropagation()
          Promise.resolve(executeZoomLaunch()).catch((err) => {
            const message = '同时开始失败: ' + String((err && err.message) || err)
            setError(message)
            setFlowUiNotice(message)
            setFlowUiBusy(false)
          })
          return
        }
        const zAddNew = t && t.closest ? t.closest('[data-zoom-add-new]') : null
        if (active === 'flow' && zAddNew) {
          e.preventDefault()
          e.stopPropagation()
          Promise.resolve(executeZoomAddNewSession()).catch((err) => {
            const message = '新建并加入失败: ' + String((err && err.message) || err)
            setError(message); setFlowUiNotice(message); setFlowUiBusy(false)
          })
          return
        }
        const zAddPicker = t && t.closest ? t.closest('[data-zoom-add-picker]') : null
        if (active === 'flow' && zAddPicker) {
          e.preventDefault()
          e.stopPropagation()
          const r = zAddPicker.getBoundingClientRect()
          const vw = zAddPicker.ownerDocument.defaultView.innerWidth
          const vh = zAddPicker.ownerDocument.defaultView.innerHeight
          const width = Math.min(360, vw - 24)
          const height = Math.min(440, vh - 24)
          const left = Math.max(12, Math.min(r.right - width, vw - width - 12))
          const top = r.bottom + 6 + height <= vh - 12 ? r.bottom + 6 : Math.max(12, r.top - height - 6)
          setFlowAddAnchor({ left: left + 'px', top: top + 'px', width: width + 'px', maxHeight: height + 'px' })
          setFlowAddTargetSession('')
          setFlowTreeOpen(currentCwd ? { [currentCwd]: true } : {})
          setFlowAddPopup(true)
          setFlowUiNotice('')
          return
        }
        const zRoundFork = t && t.closest ? t.closest('[data-zoom-round-fork]') : null
        if (active === 'flow' && zRoundFork) {
          e.preventDefault()
          e.stopPropagation()
          executeZoomRoundFork(zRoundFork)
          return
        }
        // 大流镜带入模式：点分支/根卡 = 切换目标选中，而不是进入会话
        // （⇪ 带入按钮自身是 data-action="fzoom-relay"，仍走正常 RPC 取源会话结论）
        if (active === 'flow' && zoomRelay) {
          const relayBtn = t && t.closest ? t.closest('[data-action="fzoom-relay"]') : null
          const board = flowBoardEl()
          const card = !relayBtn && board && board.contains(t) && t.closest ? t.closest('[data-sid]') : null
          if (card) {
            e.preventDefault()
            e.stopPropagation()
            const sid = card.getAttribute('data-sid') || ''
            if (sid) setZoomPick((cur) => (cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid]))
            return
          }
        }
        const el = t && t.closest ? t.closest('[data-action]') : null
        if (!el) return
        e.preventDefault()
        const act = el.getAttribute('data-action') || ''
        loadPanel(active, act, el)
      }

      function onPanelKeyDown(e) {
        if (!active || e.isComposing) return
        const t = e.target
        if (active === 'flow' && e.key === 'Tab') {
          const dialog = t && t.closest && t.closest('[data-flow-workbench],[data-flow-inspector][aria-modal="true"]')
          const controls = dialog && [...dialog.querySelectorAll('button:not([disabled]),input,select,textarea,[tabindex="0"]')].filter((node) => node.getClientRects().length)
          if (controls && controls.length) {
            if (e.shiftKey && t === controls[0]) { e.preventDefault(); controls[controls.length - 1].focus() }
            else if (!e.shiftKey && t === controls[controls.length - 1]) { e.preventDefault(); controls[0].focus() }
          }
        }
        if (active === 'flow' && e.key === 'Escape') {
          if (flowWorkbench) { e.preventDefault(); e.stopPropagation(); setFlowWorkbench(null); return }
          const root = panelRef.current
          if (!root) return
          const disclosure = t && t.closest && t.closest('details[open]')
          if (disclosure) {
            e.preventDefault(); e.stopPropagation()
            disclosure.open = false
            const summary = disclosure.querySelector('summary')
            if (summary) summary.focus()
            return
          }
          const close = root.querySelector('[data-flow-inspector] .fl-rail-x')
          if (close) {
            e.preventDefault(); e.stopPropagation()
            loadPanel('flow', 'fdetail', close)
          }
          return
        }
        // Legacy and graph cards use role=button. Native buttons already dispatch
        // one click for Enter/Space, so do not activate them twice.
        const control = t && t.closest && t.closest('[role="button"][data-action]')
        if (active === 'flow' && control && t === control && control.tagName !== 'BUTTON'
          && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); e.stopPropagation()
          control.click()
          return
        }
        if (e.key !== 'Enter') return
        if (active === 'flow' && t && t.matches && t.matches('[data-field="flowSearch"]')) {
          e.preventDefault(); loadPanel('flow', 'fsearch'); return
        }
        // 大流镜开工台：回车即「同时开始」
        if (active === 'flow' && t && t.matches && t.matches('[data-zoom-prompt]') && !e.shiftKey) {
          e.preventDefault()
          executeZoomLaunch()
          return
        }
        if (!(t && t.matches && t.matches('[data-field]'))) return
        e.preventDefault()
        const box = panelRef.current
        const btn = box && box.querySelector('[data-action="query"], [data-action="query-record"]')
        if (btn) loadPanel(active, btn.getAttribute('data-action') || '', btn)
      }

      // 开工台输入镜像：input 事件委托（React onInput 走合成事件，原生 input 冒泡到 frame 即可）
      function onPanelInput(e) {
        const t = e.target
        if (t && t.matches && t.matches('[data-zoom-prompt]')) zoomPromptRef.current = String(t.value || '')
      }

      // 面板契约扩展：select 等控件加 data-action-onchange="xxx"，change 即触发该动作（无需手动按钮）。
      // 派发走抽屉根节点的原生 change 监听（见 loadPanelRef 旁的修复注释），不要用 React onChange 属性。

      function onHeaderDown(e) {
        if (e.button !== 0) return
        e.preventDefault()
        let rect = null
        try { rect = e.currentTarget.parentElement.getBoundingClientRect() } catch (err) {}
        const baseX = rect ? rect.left : 0
        const baseY = rect ? rect.top : 0
        setPos({ x: baseX, y: baseY })
        setDockMode('float')
        setDrag({ startX: e.clientX, startY: e.clientY, baseX, baseY })
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) {}
      }
      function onHeaderMove(e) {
        if (!drag) return
        const vw = e.currentTarget.ownerDocument.defaultView.innerWidth
        let x = drag.baseX + e.clientX - drag.startX
        const near = vw - (x + curW()) < SNAP_THRESHOLD
        if (near) x = vw - curW()
        setSnapHint(near)
        setPos({ x, y: drag.baseY + e.clientY - drag.startY })
      }
      function onHeaderUp(e) {
        if (!drag) return
        const vw = e.currentTarget.ownerDocument.defaultView.innerWidth
        const x = drag.baseX + e.clientX - drag.startX
        const near = vw - (x + curW()) < SNAP_THRESHOLD
        setDrag(null)
        setSnapHint(false)
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) {}
        if (near) { setDockMode('right'); lsWrite({ dockMode: 'right' }) }
        else if (e.type === 'pointerup') lsWrite({ dockMode: 'float', pos: { x, y: drag.baseY + e.clientY - drag.startY } })
      }

      function onResizeStart(e, mode) {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        let rect = null
        try { rect = drawerRef.current.getBoundingClientRect() } catch (err) {}
        setResize({
          mode,
          startX: e.clientX,
          startY: e.clientY,
          baseW: rect ? rect.width : curW(),
          baseH: rect ? rect.height : (height || 560),
        })
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) {}
      }
      function onResizeMove(e) {
        if (!resize) return
        const vw = e.currentTarget.ownerDocument.defaultView.innerWidth
        const vh = e.currentTarget.ownerDocument.defaultView.innerHeight
        const maxW = Math.min(1400, vw - 24)
        const maxH = vh - 96
        if (resize.mode === 'left') {
          setWidth(clamp(resize.baseW + (resize.startX - e.clientX), MIN_W, maxW))
        } else if (resize.mode === 'right') {
          setWidth(clamp(resize.baseW + (e.clientX - resize.startX), MIN_W, maxW))
        } else if (resize.mode === 'bottom') {
          setHeight(clamp(resize.baseH + (e.clientY - resize.startY), MIN_H, maxH))
        } else if (resize.mode === 'corner') {
          setWidth(clamp(resize.baseW + (e.clientX - resize.startX), MIN_W, maxW))
          setHeight(clamp(resize.baseH + (e.clientY - resize.startY), MIN_H, maxH))
        }
      }
      function onResizeEnd(e) {
        // 手势结束才落盘几何（move 每帧触发，直接写 localStorage 会卡）；cancel 事件的坐标不可信，不写
        if (resize && e.type === 'pointerup') {
          try {
            const vw = e.currentTarget.ownerDocument.defaultView.innerWidth
            const vh = e.currentTarget.ownerDocument.defaultView.innerHeight
            const maxW = Math.min(1400, vw - 24)
            const maxH = vh - 96
            const patch = {}
            if (resize.mode === 'left') patch.width = clamp(resize.baseW + (resize.startX - e.clientX), MIN_W, maxW)
            else if (resize.mode === 'right') patch.width = clamp(resize.baseW + (e.clientX - resize.startX), MIN_W, maxW)
            else if (resize.mode === 'bottom') patch.height = clamp(resize.baseH + (e.clientY - resize.startY), MIN_H, maxH)
            else if (resize.mode === 'corner') {
              patch.width = clamp(resize.baseW + (e.clientX - resize.startX), MIN_W, maxW)
              patch.height = clamp(resize.baseH + (e.clientY - resize.startY), MIN_H, maxH)
            }
            lsWrite(patch)
          } catch (err) {}
        }
        setResize(null)
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) {}
      }

      React.useEffect(() => {
        if (!flowWorkbench || !panelRef.current) return undefined
        const previous = document.activeElement
        const dialog = panelRef.current.querySelector('[data-flow-workbench]')
        const first = dialog && dialog.querySelector('button,input,select,textarea')
        if (first) first.focus()
        return () => {
          if (previous && previous.isConnected && previous.focus) previous.focus({ preventScroll: true })
          else {
            const fallback = panelRef.current && panelRef.current.querySelector('[data-flow-bookmarks],[data-flow-export]')
            if (fallback) fallback.focus({ preventScroll: true })
          }
        }
      }, [Boolean(flowWorkbench)])
      if ((!embedded && sidebarActive) || !isOpen) return null

      const curW = () => width || 520

      const flowSessionGroups = (() => {
        const groups = new Map()
        for (const id of flowSessionIds) {
          const row = flowSessionRow(id) || {}
          const cwd = typeof row.cwd === 'string' && row.cwd ? row.cwd : '其他会话'
          if (!groups.has(cwd)) groups.set(cwd, [])
          groups.get(cwd).push({ id, row })
        }
        return [...groups.entries()].sort(([a], [b]) => {
          if (a === currentCwd) return -1
          if (b === currentCwd) return 1
          return a.localeCompare(b)
        }).map(([cwd, sessions]) => ({
          cwd,
          label: cwd === '其他会话' ? cwd : (cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || cwd),
          sessions,
        }))
      })()

      const flowAddRound = (() => {
        const log = readFlowZoomLog()
        const runs = Array.isArray(log.runs) ? log.runs : []
        const run = runs.find((item) => item && item.id === log.activeId) || runs[runs.length - 1]
        if (!run || !Array.isArray(run.rounds) || !run.rounds.length) return null
        const round = run.rounds.find((item) => item && item.id === log.roundId) || run.rounds[run.rounds.length - 1]
        return round && Array.isArray(round.sids) ? round : null
      })()
      const flowAddMemberIds = flowAddRound ? flowAddRound.sids : []
      const flowAddWorkspaceCwd = flowAddMemberIds.length ? String((flowSessionRow(flowAddMemberIds[0]) || {}).cwd || '') : ''
      const flowAddGroups = flowSessionGroups.map((group) => ({
        ...group,
        sessions: group.sessions.filter(({ id }) => !flowAddMemberIds.includes(id)),
      })).filter((group) => group.sessions.length)
      const addSelectedFlowSession = async () => {
        if (!flowAddTargetSession || !flowAddRound || flowAddRound.sids.length >= 4 || typeof loadPanelRef.current !== 'function') return
        setFlowUiBusy(true); setFlowUiNotice('正在加入当前并发…')
        try {
          await loadPanelRef.current('flow', 'fzoom-run-add', { dataset: { sid: flowAddTargetSession } }, { silent: true })
          setFlowAddPopup(false); setFlowAddTargetSession(''); setFlowUiNotice('已加入当前并发')
        } catch (e) { setError('加入当前并发失败: ' + String((e && e.message) || e)) }
        finally { setFlowUiBusy(false) }
      }

      const flowZoomControl = active !== 'flow' || managing || flowBringPopup || flowAddPopup ? null : React.createElement('div', { className: 'tb-flow-zoom-float' + (flowSelectedSeqs.length ? ' with-selection' : '') },
        React.createElement('div', { className: 'tb-flow-zoom', title: '缩放流镜画布，不改变 header 和滚动区尺寸' },
          React.createElement('button', { type: 'button', className: 'tb-flow-zoom-btn', disabled: flowZoom <= 60, onClick: () => stepFlowZoom(-1) }, '−'),
          React.createElement('button', { type: 'button', className: 'tb-flow-zoom-value tb-flow-zoom-btn', title: '恢复 100%', onClick: () => setFlowZoomLevel(100) }, flowZoom + '%'),
          React.createElement('button', { type: 'button', className: 'tb-flow-zoom-btn', disabled: flowZoom >= 150, onClick: () => stepFlowZoom(1) }, '+'),
          React.createElement('button', {
            type: 'button', className: 'tb-flow-zoom-btn', title: flowZen ? '退出 Zen 原生全屏（Esc）' : '进入 Zen 原生全屏', onClick: toggleFlowZen,
          }, React.createElement('svg', { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
            flowZen
              ? React.createElement('path', { d: 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4' })
              : React.createElement('path', { d: 'M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4' }),
          )),
        ),
      )

      const flowSelectionBar = active !== 'flow' || managing || !flowSelectedSeqs.length ? null : React.createElement('div', { className: 'tb-flow-selection-bar' },
        React.createElement('span', { className: 'tb-flow-selection-count', title: '已选 ' + flowSelectedSeqs.length + ' 项' }, flowSelectedSeqs.length),
        React.createElement('button', {
          type: 'button', className: 'tb-flow-icon-btn', disabled: flowUiBusy,
          title: '所选新会话：只写入框选内容草稿，不继承其他历史', onClick: createSelectedFlowSession,
        }, React.createElement('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
          React.createElement('rect', { x: 2, y: 2.5, width: 9, height: 9, rx: 2 }),
          React.createElement('path', { d: 'M8.5 13.5h5v-5M11 11h2.5' }),
        )),
        React.createElement('button', {
          type: 'button', className: 'tb-flow-icon-btn', disabled: flowUiBusy,
          title: '带入会话', onClick: () => { setFlowBringPopup(true); setFlowTreeOpen({}); setFlowUiNotice('') },
        }, React.createElement('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
          React.createElement('path', { d: 'M2 4.5h7.5a3 3 0 0 1 3 3v4' }),
          React.createElement('path', { d: 'M4.5 2 2 4.5 4.5 7M10 10l2.5 2.5L15 10' }),
        )),
        React.createElement('button', {
          type: 'button', className: 'tb-flow-icon-btn', disabled: flowUiBusy,
          title: '清除框选', onClick: () => { setFlowSelectedSeqs([]); setFlowBringPopup(false) },
        }, React.createElement('svg', { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
          React.createElement('path', { d: 'M3.5 3.5l9 9M12.5 3.5l-9 9' }),
        )),
        flowUiBusy ? React.createElement('span', { className: 'tb-tab-spin' }) : null,
      )

      const flowBringDialog = active !== 'flow' || managing || !flowSelectedSeqs.length || !flowBringPopup ? null : React.createElement('div', { className: 'tb-flow-bring-popup' },
        React.createElement('div', { className: 'tb-flow-popup-head' },
          React.createElement('span', null, '带入会话 · ' + flowSelectedSeqs.length + ' 项'),
          React.createElement('button', { type: 'button', className: 'tb-flow-icon-btn', title: '关闭', onClick: () => setFlowBringPopup(false) }, '×'),
        ),
        React.createElement('div', { className: 'tb-flow-session-tree', role: 'tree', 'aria-label': '按工作区分组的会话' },
          flowSessionGroups.map((group) => React.createElement('div', { className: 'tb-flow-tree-group', key: group.cwd, role: 'group' },
            React.createElement('button', {
              type: 'button', className: 'tb-flow-tree-workspace' + (flowTreeOpen[group.cwd] ? ' open' : ''), title: group.cwd,
              'aria-expanded': Boolean(flowTreeOpen[group.cwd]),
              onClick: () => setFlowTreeOpen((cur) => ({ ...cur, [group.cwd]: !cur[group.cwd] })),
            },
              React.createElement('svg', { className: 'tb-flow-tree-folder', viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
                React.createElement('path', { d: 'M1.8 4.2h4l1.3 1.5h7.1v6.6a1.3 1.3 0 0 1-1.3 1.3H3.1a1.3 1.3 0 0 1-1.3-1.3z' }),
                React.createElement('path', { d: 'M1.8 5.7V3.8a1.3 1.3 0 0 1 1.3-1.3h2.7l1.3 1.7h5.8a1.3 1.3 0 0 1 1.3 1.3v.2' }),
              ),
              React.createElement('span', { className: 'tb-flow-tree-label' }, group.label),
              React.createElement('span', { className: 'tb-flow-tree-count' }, group.sessions.length),
              React.createElement('span', { className: 'tb-flow-tree-chevron', 'aria-hidden': true }, '▶'),
            ),
            flowTreeOpen[group.cwd] ? group.sessions.map(({ id, row }) => {
              const label = row && (row.displayTitle || row.title) ? (row.displayTitle || row.title) : id
              return React.createElement('button', {
                type: 'button', role: 'treeitem', key: id,
                className: 'tb-flow-tree-session' + (flowTargetSession === id ? ' on' : ''),
                'aria-selected': flowTargetSession === id,
                title: label + '\n' + id,
                onClick: () => setFlowTargetSession(id),
              }, React.createElement('span', null, label), React.createElement('span', { className: 'tb-flow-tree-id' }, String(id).replace(/^session-/, '').slice(0, 8)))
            }) : null,
          )),
        ),
        flowUiNotice ? React.createElement('div', { className: 'tb-flow-toolbar-note', title: flowUiNotice }, flowUiNotice) : null,
        React.createElement('div', { className: 'tb-flow-popup-actions' },
          React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy, onClick: () => setFlowBringPopup(false) }, '取消'),
          React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy || !flowTargetSession, title: '追加到目标会话草稿，不自动发送', onClick: sendSelectedFlow }, '带入草稿'),
        ),
      )

      const flowAddDialog = active !== 'flow' || managing || !flowAddPopup ? null : React.createElement('div', { className: 'tb-flow-bring-popup tb-flow-add-popup', style: flowAddAnchor || undefined },
        React.createElement('div', { className: 'tb-flow-popup-head' },
          React.createElement('span', null, '添加到当前并发 · ' + flowAddMemberIds.length + ' 个会话'),
          React.createElement('button', { type: 'button', className: 'tb-flow-icon-btn', title: '关闭', onClick: () => setFlowAddPopup(false) }, '×'),
        ),
        React.createElement('div', { className: 'tb-flow-session-tree', role: 'tree', 'aria-label': '按工作区分组选择要加入并发的会话' },
          flowAddGroups.map((group) => {
            const sameWorkspace = !flowAddWorkspaceCwd || group.cwd === flowAddWorkspaceCwd
            return React.createElement('div', { className: 'tb-flow-tree-group', key: group.cwd, role: 'group' },
              React.createElement('button', {
                type: 'button', className: 'tb-flow-tree-workspace' + (flowTreeOpen[group.cwd] ? ' open' : ''), title: group.cwd,
                'aria-expanded': Boolean(flowTreeOpen[group.cwd]),
                onClick: () => setFlowTreeOpen((cur) => ({ ...cur, [group.cwd]: !cur[group.cwd] })),
              },
                React.createElement('svg', { className: 'tb-flow-tree-folder', viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
                  React.createElement('path', { d: 'M1.8 4.2h4l1.3 1.5h7.1v6.6a1.3 1.3 0 0 1-1.3 1.3H3.1a1.3 1.3 0 0 1-1.3-1.3z' }),
                  React.createElement('path', { d: 'M1.8 5.7V3.8a1.3 1.3 0 0 1 1.3-1.3h2.7l1.3 1.7h5.8a1.3 1.3 0 0 1 1.3 1.3v.2' }),
                ),
                React.createElement('span', { className: 'tb-flow-tree-label' }, group.label),
                React.createElement('span', { className: 'tb-flow-tree-count' }, group.sessions.length),
                React.createElement('span', { className: 'tb-flow-tree-chevron', 'aria-hidden': true }, '▶'),
              ),
              flowTreeOpen[group.cwd] ? group.sessions.map(({ id, row }) => {
                const label = row && (row.displayTitle || row.title) ? (row.displayTitle || row.title) : id
                return React.createElement('button', {
                  type: 'button', role: 'treeitem', key: id, disabled: !sameWorkspace, draggable: sameWorkspace,
                  className: 'tb-flow-tree-session' + (flowAddTargetSession === id ? ' on' : ''),
                  'aria-selected': flowAddTargetSession === id,
                  title: sameWorkspace ? label + '\n' + id : label + '\n不在当前并发的工作区',
                  onClick: () => { if (sameWorkspace) setFlowAddTargetSession(id) },
                  onDragStart: sameWorkspace ? (e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', id) } : undefined,
                }, React.createElement('span', null, label), React.createElement('span', { className: 'tb-flow-tree-id' }, String(id).replace(/^session-/, '').slice(0, 8)))
              }) : null,
            )
          }),
        ),
        flowUiNotice ? React.createElement('div', { className: 'tb-flow-toolbar-note', title: flowUiNotice }, flowUiNotice) : null,
        React.createElement('div', { className: 'tb-flow-popup-actions' },
          React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy, onClick: () => setFlowAddPopup(false) }, '取消'),
          React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy, onClick: () => Promise.resolve(executeZoomAddNewSession()).then(() => setFlowAddPopup(false)) }, '新建并加入'),
          React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy || !flowAddTargetSession, onClick: addSelectedFlowSession }, '加入分支'),
        ),
      )

      // 大流镜操作条：点选模式/带入暂存激活时浮出——显示带入源、已选目标数，
      // 「带入草稿」追加到目标输入区（沿用带入会话机制，不自动发送），「直接发送」走 ISession.prompt 排队开工
      const zoomActionBar = active !== 'flow' || managing || !(zoomRelay || zoomPick.length) ? null : React.createElement('div', { className: 'tb-flow-selection-bar' },
        zoomRelay ? React.createElement('span', { className: 'tb-flow-zoom-relay-src', title: '带入来源会话：' + zoomRelay.source }, '⇪ ' + String(zoomRelay.source).replace(/^session-/, '').slice(0, 8)) : null,
        React.createElement('span', { className: 'tb-flow-selection-count', title: '已选 ' + zoomPick.length + ' 个目标会话' }, zoomPick.length),
        React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy, title: '把内容追加到目标会话输入区草稿（不自动发送）', onClick: () => executeZoomCast(false) }, '带入草稿'),
        React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy, title: '直接向目标会话发送（运行中排队、空闲立即开工）', onClick: () => executeZoomCast(true) }, '直接发送'),
        React.createElement('button', { type: 'button', className: 'tb-flow-select-btn', disabled: flowUiBusy, onClick: () => { setZoomPick([]); setZoomRelay(null); setFlowUiNotice('') } }, '清除'),
        flowUiBusy ? React.createElement('span', { className: 'tb-tab-spin' }) : null,
        flowUiNotice ? React.createElement('span', { className: 'tb-flow-toolbar-note', title: flowUiNotice }, flowUiNotice) : null,
      )
      const fh = React.createElement
      const workbenchTitle = flowWorkbench && ({ bookmarks: '节点标记', compare: '分支结论预览', relay: '带入会话', export: '本地导出预览' }[flowWorkbench.mode])
      const workbenchDialog = !flowWorkbench ? null : fh('div', { className: 'fg-workbench-overlay' },
        fh('section', { className: 'fg-workbench', 'data-flow-workbench': '1', role: 'dialog', 'aria-modal': 'true', 'aria-label': workbenchTitle },
          fh('header', { className: 'fg-workbench-head' }, fh('strong', null, workbenchTitle), fh('button', { type: 'button', className: 'tb-btn', onClick: () => setFlowWorkbench(null) }, '关闭')),
          fh('div', { className: 'fg-workbench-body' },
            flowWorkbench.mode === 'bookmarks' ? fh(React.Fragment, null,
              flowWorkbench.editing ? fh('form', { onSubmit: (event) => {
                event.preventDefault()
                const item = flowWorkbench.editing
                try {
                  saveFlowBookmarks([...flowBookmarks.filter((saved) => !(saved.sessionId === item.sessionId && saved.seq === item.seq && saved.kind === item.kind)), item])
                  setFlowWorkbench({ mode: 'bookmarks' })
                } catch (error) { setFlowUiNotice('标记保存失败：' + String(error.message || error)) }
              } },
                fh('p', null, 'Session ' + flowWorkbench.editing.sessionId + ' · 节点 ' + flowWorkbench.editing.seq),
                fh('label', null, '备注（可选）', fh('input', { className: 'tb-input fg-workbench-note', maxLength: 200, value: flowWorkbench.editing.note || '', onChange: (event) => setFlowWorkbench({ ...flowWorkbench, editing: { ...flowWorkbench.editing, note: event.currentTarget.value } }) })),
                fh('button', { type: 'submit', className: 'tb-btn' }, '保存标记'),
              ) : null,
              !flowBookmarks.length ? fh('p', null, '还没有标记。打开节点详情后可标记重要内容。') : flowBookmarks.map((item) => fh('article', { className: 'fg-bookmark-item', key: item.sessionId + '|' + item.kind + '|' + item.seq },
                fh('strong', null, item.note || '节点 ' + item.seq), fh('small', null, item.sessionId + ' · ' + item.kind),
                fh('div', { className: 'fg-workbench-actions' },
                  fh('button', { type: 'button', className: 'tb-btn', onClick: () => {
                    setFlowWorkbench(null)
                    loadPanel('flow', 'fbookmark-jump', { dataset: { sid: item.sessionId, seq: String(item.seq), kind: item.kind } })
                  } }, '定位'),
                  fh('button', { type: 'button', className: 'tb-btn', onClick: () => setFlowWorkbench({ mode: 'bookmarks', editing: item }) }, '编辑备注'),
                  fh('button', { type: 'button', className: 'tb-btn', onClick: () => {
                    try { saveFlowBookmarks(flowBookmarks.filter((saved) => saved !== item)) } catch (error) { setFlowUiNotice('删除标记失败：' + String(error.message || error)) }
                  } }, '删除标记'),
                ),
              )),
            ) : null,
            (flowWorkbench.mode === 'compare' || flowWorkbench.mode === 'relay') ? fh(React.Fragment, null,
              fh('p', null, '以下为已完成结论的确定性摘录。保留各分支来源；内容将在你确认后追加到所选会话草稿。'),
              fh('pre', { className: 'fg-workbench-preview', tabIndex: 0 }, flowWorkbench.text),
              fh('label', null, '目标会话', fh('select', { className: 'tb-select', value: flowWorkbench.target, onChange: (event) => setFlowWorkbench({ ...flowWorkbench, target: event.currentTarget.value }) },
                fh('option', { value: '' }, '选择会话'), flowSessionIds.map((sid) => fh('option', { key: sid, value: sid }, (flowSessionRow(sid) || {}).title || sid)))),
              fh('button', { type: 'button', className: 'tb-btn', disabled: flowUiBusy || !flowWorkbench.target, onClick: async () => {
                setFlowUiBusy(true)
                try { await putFlowContextIntoDraft(flowWorkbench.target, flowWorkbench.text, true); setFlowUiNotice('已追加带来源的结论到目标草稿。'); setFlowWorkbench(null) }
                catch (error) { setFlowUiNotice('带入失败：' + String(error.message || error)) }
                finally { setFlowUiBusy(false) }
              } }, '确认带入草稿'),
            ) : null,
            flowWorkbench.mode === 'export' ? fh(React.Fragment, null,
              fh('p', null, '导出范围：当前视口内 ' + flowWorkbench.cards.length + ' 个可见节点。默认只包含节点类型、状态、位置和计数。'),
              fh('label', null, '格式', fh('select', { className: 'tb-select', value: flowWorkbench.format, onChange: (event) => setFlowWorkbench({ ...flowWorkbench, format: event.currentTarget.value }) }, fh('option', { value: 'json' }, '诊断摘要 JSON'), fh('option', { value: 'svg' }, '节点快照 SVG'))),
              fh('label', null, fh('input', { type: 'checkbox', checked: flowWorkbench.includeText, onChange: (event) => setFlowWorkbench({ ...flowWorkbench, includeText: event.currentTarget.checked }) }), '包含当前可见节点摘要（请检查预览）'),
              fh('pre', { className: 'fg-workbench-preview', tabIndex: 0 }, flowExportText(flowWorkbench)),
              fh('button', { type: 'button', className: 'tb-btn', onClick: downloadFlowExport }, '保存到本地'),
            ) : null,
          ),
        ),
      )
      const launchRecovery = active !== 'flow' || !flowLaunchBatch || (!flowLaunchBatch.registrationPending && flowLaunchBatch.items.every((item) => item.status === 'success')) ? null
        : React.createElement('section', { className: 'fg-launch-recovery', 'aria-label': '分支发送结果' },
          React.createElement('strong', null, '分支发送结果'),
          flowLaunchBatch.registrationPending ? React.createElement('p', null, '部分会话尚未登记到并发记录。返回来源会话后，核对结果可补登记。',
            flowLaunchBatch.originScope ? React.createElement('button', { type: 'button', className: 'tb-btn', onClick: () => navigateHarnessSession({ sessionId: flowLaunchBatch.originScope }) }, '返回来源会话') : null,
          ) : null,
          flowLaunchBatch.items.map((item) => React.createElement('div', { key: item.index, className: 'fg-launch-result' },
            React.createElement('span', null, '分支 ' + (item.index + 1) + ' · ' + ({ create: '创建', configure: '配置', send: '发送' }[item.stage] || '') + ' · ' + ({ ready: '等待', pending: '进行中', success: '已完成', failed: '失败', unknown: '结果未知' }[item.status] || '状态未知')),
            item.error ? React.createElement('small', null, item.error) : null,
            item.sid ? React.createElement('button', { type: 'button', className: 'tb-btn', onClick: () => navigateHarnessSession({ sessionId: item.sid }) }, '查看会话') : null,
          )),
          React.createElement('div', { className: 'fg-settings-actions' },
            React.createElement('button', { type: 'button', className: 'tb-btn', disabled: flowUiBusy || !flowLaunchBatch.items.some((item) => item.status === 'failed'), onClick: retryFlowLaunch }, '仅重试明确失败项'),
            React.createElement('button', { type: 'button', className: 'tb-btn', disabled: flowUiBusy, onClick: reconcileFlowLaunch }, '核对未知结果'),
            React.createElement('button', { type: 'button', className: 'tb-btn', disabled: flowUiBusy, title: '停止本次恢复，已创建的会话与消息保留；未知结果仍需在会话中核对。', onClick: () => {
              try { localStorage.removeItem(RT.storageKey('flow.launch.' + encodeURIComponent(currentCwd || ''))) } catch (e) {}
              setFlowLaunchBatch(null)
            } }, '结束恢复'),
          ),
        )

      // 主题切换按钮：暗色下显示太阳（点击切亮），亮色下显示月亮（点击切暗）；theme 服务缺失时不渲染
      const themeButton = !themeSvc ? null : React.createElement('button', {
        type: 'button',
        className: 'jr-overlay-close',
        title: themeScheme === 'dark' ? '切换到亮色主题' : '切换到暗色主题',
        'aria-label': '切换明暗主题',
        onPointerDown: (ev) => ev.stopPropagation(),
        onClick: (ev) => { ev.stopPropagation(); toggleTheme() },
      },
        themeScheme === 'dark'
          ? React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' },
              React.createElement('circle', { cx: 7, cy: 7, r: 2.6 }),
              React.createElement('path', { d: 'M7 1.2v1.4M7 11.4v1.4M1.2 7h1.4M11.4 7h1.4M2.9 2.9l1 1M10.1 10.1l1 1M11.1 2.9l-1 1M3.9 10.1l-1 1' }),
            )
          : React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' },
              React.createElement('path', { d: 'M12.2 8.7A5.2 5.2 0 1 1 5.3 1.8a4.4 4.4 0 0 0 6.9 6.9z' }),
            ),
      )

      // 画中画按钮：浏览器支持 Document PiP 才渲染（Chrome/Edge 116+，localhost 安全上下文）
      const pipButton = !pipSupported ? null : React.createElement('button', {
        type: 'button',
        className: 'jr-overlay-close',
        title: '画中画：把工具箱放到独立小窗（脱离主窗口，可拖到任意位置）',
        'aria-label': '画中画',
        onPointerDown: (ev) => ev.stopPropagation(),
        onClick: (ev) => { ev.stopPropagation(); openPip() },
      },
        React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 },
          React.createElement('rect', { x: 1.5, y: 3, width: 11, height: 8, rx: 1 }),
          React.createElement('rect', { x: 7.5, y: 7, width: 3.6, height: 2.8, rx: 0.5, fill: 'currentColor', stroke: 'none' }),
        ),
      )

      const gearButton = RT.capabilities.managePlugins === false ? null : React.createElement('button', {
        type: 'button',
        className: 'jr-overlay-close',
        title: managing ? '返回工具面板' : '管理插件（停止/启动）',
        'aria-label': '管理插件',
        onPointerDown: (ev) => ev.stopPropagation(),
        onClick: (ev) => { ev.stopPropagation(); const next = !managing; setManaging(next); if (next) { refreshPlugins(); loadRebuildHistory(); loadAiUsage() } },
      },
        // sliders 图标（横线+滑块）：明确表示「管理/调节」，与明暗切换的太阳/月亮区分开
        React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' },
          React.createElement('path', { d: 'M1.8 4.2h10.4M1.8 9.8h10.4' }),
          React.createElement('circle', { cx: 9.2, cy: 4.2, r: 1.6 }),
          React.createElement('circle', { cx: 4.8, cy: 9.8, r: 1.6 }),
        ),
      )

      const dockButton = RT.bundleId === 'flow' ? null : React.createElement('button', {
        type: 'button',
        className: 'jr-overlay-close',
        title: dockMode === 'right' ? '切换到三栏停靠（挤压聊天区，左中右并列）' : dockMode === 'full' ? '切换为浮动' : '停靠到右侧',
        onPointerDown: (ev) => ev.stopPropagation(),
        onClick: (ev) => {
          ev.stopPropagation()
          setDockMode(dockMode === 'right' ? 'full' : dockMode === 'full' ? 'float' : 'right')
        },
      },
        dockMode === 'right'
          ? React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'currentColor' },
              React.createElement('rect', { x: 2.5, y: 2.5, width: 8, height: 8, rx: 1 }),
              React.createElement('rect', { x: 5.5, y: 5.5, width: 6, height: 6, rx: 1, opacity: 0.55 }),
            )
          : dockMode === 'full'
            ? React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'currentColor' },
                React.createElement('rect', { x: 1.5, y: 2, width: 2.6, height: 10, rx: 0.8, opacity: 0.35 }),
                React.createElement('rect', { x: 5.1, y: 2, width: 5, height: 10, rx: 0.8, opacity: 0.55 }),
                React.createElement('rect', { x: 11.1, y: 2, width: 1.6, height: 10, rx: 0.5 }),
              )
            : React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'currentColor' },
                React.createElement('rect', { x: 2, y: 2, width: 7, height: 10, rx: 1 }),
                React.createElement('rect', { x: 10.5, y: 5, width: 2.5, height: 7, rx: 0.5, opacity: 0.55 }),
              ),
      )

      const closeButton = React.createElement('button', {
        type: 'button',
        className: 'jr-overlay-close',
        title: '关闭',
        'aria-label': '关闭',
        onPointerDown: (ev) => ev.stopPropagation(),
        onClick: (ev) => { ev.stopPropagation(); if (pipOn) setMainHidden(true); else store.close() },
      },
        React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' },
          React.createElement('path', { d: 'M2 2l10 10M12 2L2 12' }),
        ),
      )

      const handles = []
      if (!embedded && (dockMode === 'right' || dockMode === 'full')) {
        handles.push(React.createElement('div', {
          key: 'resize-left',
          className: 'jr-resize-left',
          title: '拖拽调整宽度',
          onPointerDown: (e) => onResizeStart(e, 'left'),
          onPointerMove: onResizeMove,
          onPointerUp: onResizeEnd,
          onPointerCancel: onResizeEnd,
        }))
      } else if (!embedded && dockMode === 'float') {
        handles.push(React.createElement('div', {
          key: 'resize-right',
          className: 'jr-resize-right',
          title: '拖拽调整宽度',
          onPointerDown: (e) => onResizeStart(e, 'right'),
          onPointerMove: onResizeMove,
          onPointerUp: onResizeEnd,
          onPointerCancel: onResizeEnd,
        }))
        handles.push(React.createElement('div', {
          key: 'resize-bottom',
          className: 'jr-resize-bottom',
          title: '拖拽调整高度',
          onPointerDown: (e) => onResizeStart(e, 'bottom'),
          onPointerMove: onResizeMove,
          onPointerUp: onResizeEnd,
          onPointerCancel: onResizeEnd,
        }))
        handles.push(React.createElement('div', {
          key: 'resize-corner',
          className: 'jr-resize-corner',
          title: '拖拽调整大小',
          onPointerDown: (e) => onResizeStart(e, 'corner'),
          onPointerMove: onResizeMove,
          onPointerUp: onResizeEnd,
          onPointerCancel: onResizeEnd,
        }))
      }

      const style = {}
      if (!embedded && (dockMode === 'right' || dockMode === 'full') && width) style.width = width + 'px' // 停靠宽度可调（左缘拖拽）
      if (!embedded && dockMode === 'full' && !width) style.width = '560px' // 三栏停靠默认宽
      // pip 画中画期间主抽屉可视觉隐藏（DOM 与轮询存活——它是镜像事实源）
      if (!embedded && mainHidden) { style.visibility = 'hidden'; style.pointerEvents = 'none' }
      if (!embedded && dockMode === 'float') {
        if (height) style.height = height + 'px'
        if (pos) {
          style.left = pos.x + 'px'
          style.top = pos.y + 'px'
        }
      }

      // ---- 分类归属与迁移（导航行与管理树共用同一 catOf 数据源） ----
      const pickCat = (id) => {
        if (id === cat) return
        // 记住旧分类当前选择；切到新分类后恢复其上次选中的工具，无记录（或已停）则选该分类第一个
        const next = Object.assign({}, activeByCat)
        if (active) next[cat] = active
        setActiveByCat(next)
        setCat(id)
        lsWrite({ cat: id, activeByCat: next })
        const inCat = tools.filter((t) => catOf(t.id) === id)
        const remembered = next[id]
        const target = remembered && inCat.some((t) => t.id === remembered) ? remembered : (inCat.length ? inCat[0].id : null)
        setActive(target)
        lastNav = { cat: id, active: target }
      }
      const moveNode = (id, toCat) => {
        if (!id || !toCat) return
        if (catOf(id) === toCat) return
        const next = Object.assign({}, catOverrides)
        next[id] = toCat
        setCatOverrides(next)
        catsWrite({ overrides: next })
      }
      const toggleCat = (id) => {
        const next = Object.assign({}, collapsedCats)
        next[id] = !next[id]
        setCollapsedCats(next)
        catsWrite({ collapsed: next })
      }

      // ---- 三段式导航：搜索整行（全局匹配）/ 分类行 / 当前分类下的工具行 ----
      const tabFilterLc = tabFilter.trim().toLowerCase()
      const searching = tabFilterLc.length > 0
      const catCounts = {}
      for (const t of tools) { const c = catOf(t.id); catCounts[c] = (catCounts[c] || 0) + 1 }
      const visibleCats = TOOL_CATS.filter((c) => (catCounts[c.id] || 0) > 0)
      // 激活分类已空（工具全停）时回退到第一个非空分类，不闪空行
      const effCat = (catCounts[cat] || 0) > 0 ? cat : (visibleCats.length ? visibleCats[0].id : cat)
      const shownTools = searching
        ? tools.filter((t) => (String(t.label) + ' ' + String(t.id)).toLowerCase().indexOf(tabFilterLc) >= 0)
        : tools.filter((t) => catOf(t.id) === effCat)
      const toolButton = (t) => React.createElement('button', {
        key: t.id,
        type: 'button',
        className: 'tb-tab' + (t.id === active ? ' tb-tab-active' : ''),
        title: t.label + '（' + (TOOL_CATS.find((c) => c.id === catOf(t.id)) || {}).label + '）',
        onClick: () => { setActive(t.id); lastNav = { cat: catOf(t.id), active: t.id } },
      }, t.label,
        tabBadges[t.id] ? React.createElement('span', { className: 'tb-tab-badge' }, tabBadges[t.id]) : null,
        t.id === busyTool ? React.createElement('span', { className: 'tb-tab-spin' }) : null)

      let body = null
      if (managing) {
        // 与工具面板同款的「固定头 + 列表独立滚动」：tb-pane → tb-pane-head + tb-pane-body
        body = React.createElement('div', { className: 'tb-frame' },
          React.createElement('div', { className: 'tb-pane' },
            React.createElement('div', { className: 'tb-pane-head' },
              error ? React.createElement('div', { className: 'tb-error' }, String(error)) : null,
              copied ? React.createElement('div', { className: 'tb-banner tb-banner-info' }, String(copied)) : null,
              React.createElement('div', { className: 'tb-row' },
                React.createElement('button', {
                  type: 'button',
                  className: 'tb-btn tb-btn-primary',
                  disabled: rebuilding,
                  title: canRebuildFromDisk ? undefined : '编译合集：从固化的功能清单恢复 define/run（不读磁盘）',
                  onClick: runRebuild,
                }, rebuilding ? '重建中…' : (canRebuildFromDisk ? '从 plugins.json 重建/补齐' : '恢复编译清单')),
                React.createElement('button', {
                  type: 'button',
                  className: 'tb-btn',
                  onClick: () => toggleAll(true),
                }, '全部启动'),
                React.createElement('button', {
                  type: 'button',
                  className: 'tb-btn',
                  title: '重跑全部运行中的 Host-only 插件（改完多个工具代码一键生效；停着的不动）',
                  onClick: restartAll,
                }, '全部重跑'),
                React.createElement('button', {
                  type: 'button',
                  className: 'tb-btn tb-btn-ghost',
                  title: '隐藏全部无界面（Host-only）工具，只显示含界面的插件；再次点击恢复',
                  onClick: () => toggleAll(false),
                }, '全部停止'),
                panelHideSupported ? React.createElement('button', {
                  type: 'button',
                  className: 'tb-chip' + (hideHostOnly ? ' tb-chip-on' : ''),
                  title: '隐藏左下角 Cordis 面板里的无界面（Host-only）插件（管理页清单不受影响）；亮起为隐藏中，再次点击恢复' + (hideHostOnly ? '；当前隐藏 ' + panelHide.headless.size + ' 个' : ''),
                  onClick: () => { const nv = !hideHostOnly; setHideHostOnly(nv); setPanelHideOn(nv) },
                }, '隐藏CordisPlugin') : null,
                React.createElement('input', {
                  className: 'tb-input',
                  style: { flex: '1', minWidth: '120px' },
                  placeholder: '按名称 / ID 过滤插件',
                  value: pluginFilter,
                  onChange: (e) => setPluginFilter(e.target.value),
                }),
              ),
              React.createElement('div', { className: 'tb-note', style: { marginTop: '2px' } },
                React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '外观（主题 / 主色 / 字号，即时生效并记住）'),
                React.createElement(AppearancePanel, null)),
              rebuildLines
                ? React.createElement('div', { className: 'tb-note' }, rebuildLines.map((l, i) => React.createElement('div', { key: i }, l)))
                : null,
              rebuildHistory.length && canRebuildFromDisk
                ? (() => {
                    const max = Math.max.apply(null, rebuildHistory.map((h) => h.ms || 0).concat([1]))
                    return React.createElement('div', { className: 'tb-note' },
                      '重建耗时（最近 ' + rebuildHistory.length + ' 次，悬停看详情；红 = 有失败）',
                      React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '3px', height: '36px', marginTop: '6px' } },
                        rebuildHistory.map((h, i) => React.createElement('div', {
                          key: i,
                          title: (h.at || '') + ' · ' + (h.ms == null ? '—' : h.ms + 'ms') + ' · 定义 ' + h.defined + ' / 启动 ' + h.started + ' / 关闭 ' + h.suppressed + ' / 失败 ' + h.failed,
                          style: {
                            width: '10px',
                            height: Math.max(2, Math.round(((h.ms || 0) / max) * 32)) + 'px',
                            borderRadius: '2px',
                            background: h.failed > 0 ? 'var(--tb-danger,#d94f4f)' : 'var(--tb-accent,#3f6fd9)',
                            opacity: 0.85,
                          },
                        }))))
                  })()
                : null,
              aiUsage && canAiUsage && aiUsage.totals && aiUsage.totals.calls
                ? React.createElement('div', { className: 'tb-note' },
                    'AI 用量（台账最近 100 条）：共 ' + aiUsage.totals.calls + ' 次 · 输出 ' + aiUsage.totals.out + ' tok' + (aiUsage.totals.errors ? ' · 失败 ' + aiUsage.totals.errors + ' 次' : '') + (aiUsage.totals.todayCalls ? '；今日 ' + aiUsage.totals.todayCalls + ' 次 / ' + aiUsage.totals.todayOut + ' tok' : ''),
                    React.createElement('div', { className: 'tb-pills', style: { marginTop: '4px' } },
                      aiUsage.tools.map((t) => React.createElement('span', {
                        key: t.tool,
                        className: 'tb-pill tb-pill-plain',
                        title: t.tool + '：成功 ' + t.calls + ' 次 · 输出 ' + t.out + ' tok' + (t.errors ? ' · 失败 ' + t.errors + ' 次' : ''),
                      }, t.tool + ' ' + t.calls + '/' + (t.out >= 10000 ? (t.out / 1000).toFixed(1) + 'k' : t.out) + ' tok')),
                      React.createElement('button', {
                        type: 'button',
                        className: 'tb-btn tb-btn-sm tb-btn-ghost',
                        title: '复制台账汇总 CSV（tool,calls,output_tokens,errors）',
                        onClick: async () => {
                          if (!aiUsage || !Array.isArray(aiUsage.tools)) return
                          const csv = ['tool,calls,output_tokens,errors']
                            .concat(aiUsage.tools.map((t) => [t.tool, t.calls, t.out, t.errors].join(',')))
                            .join('\n')
                          try {
                            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                              await navigator.clipboard.writeText(csv)
                              setCopied('台账 CSV 已复制（' + aiUsage.tools.length + ' 个工具）')
                            } else setCopied('当前环境无剪贴板 API')
                          } catch (e) { setCopied('复制失败: ' + String((e && e.message) || e)) }
                        },
                      }, '复制 CSV')))
                : null,
              React.createElement('div', { className: 'tb-note' }, canRebuildFromDisk
                ? '开关 = 真停 / 真启插件（等同 Cordis 面板的停止/运行，两处状态同步），同时写入启停记忆 .dsh-dynamic-toolbox/toolbox-plugins.json；「重启后」pill = 下次重建的默认启停，点击切换、只改记忆不动当前状态。停止后 Tab 级联消失，启动后约 0.5s 自动挂回。含 Client 半的插件（框架）请到 Cordis 面板操作。'
                : '开关 = 真停 / 真启插件（等同 Cordis 面板的停止/运行，两处状态同步），同时写入本合集的启停记忆；「重启后」pill = 下次启动的默认启停，点击切换、只改记忆不动当前状态。停止后 Tab 级联消失，启动后约 0.5s 自动挂回。含 Client 半的插件请到 Cordis 面板操作。'),
            ),
            React.createElement('div', { className: 'tb-pane-body tb-pane-col' },
              (() => {
                // 管理页永远全量清单；「隐藏无界面」开关只作用于左下角 Cordis 面板
                const visiblePlugins = plugins
                if (visiblePlugins.length === 0) {
                  return React.createElement('div', { className: 'tb-notice' }, '暂无动态插件')
                }
                // 单个插件节点（行 key 用 pluginId，跨分类移动时稳定；条目 id 追加在副行便于辨认归属键）
                const manageRow = (p) =>
                      React.createElement('div', {
                        key: p.pluginId,
                        className: 'tb-manage-row',
                        draggable: Boolean(p.entryId),
                        onDragStart: (e) => {
                          if (!p.entryId) return
                          setDragId(p.entryId)
                          try { if (e.dataTransfer) e.dataTransfer.setData('text/plain', p.entryId) } catch (err) {}
                        },
                        onDragEnd: () => setDragId(null),
                      },
                        p.entryId ? React.createElement('span', { className: 'tb-drag', title: '拖拽到分类标题上调整归属' }, '⋮⋮') : null,
                        React.createElement('div', { className: 'tb-manage-main' },
                          React.createElement('span', { className: 'tb-manage-label' }, p.name),
                          React.createElement('span', { className: 'tb-manage-id' }, p.pluginId + (p.currentPackageId ? ' · ' + p.currentPackageId : '') + (p.entryId ? ' · ' + p.entryId : '')),
                        ),
                        React.createElement('span', { className: 'tb-pill ' + (p.running ? 'tb-pill-done' : 'tb-pill-todo') }, p.running ? '运行中' : '已停止'),
                        p.defaultStart != null
                          ? React.createElement('button', {
                            type: 'button',
                            className: 'tb-pill-btn' + (p.defaultStart ? ' on' : ''),
                            title: '下次重建的默认启停（启停记忆）——点击切换；只改记忆，不动当前运行状态',
                            onClick: () => setDefaultPlugin(p),
                          }, p.defaultStart ? '重启后启动' : '重启后关闭')
                          : null,
                        React.createElement('button', {
                          type: 'button',
                          className: 'tb-btn tb-btn-sm tb-btn-ghost',
                          title: p.hasClientHalf ? '含 Client 半，请到 Cordis 面板操作' : '重跑（重新从磁盘加载实现，改完代码点这个）',
                          disabled: Boolean(p.hasClientHalf),
                          style: p.hasClientHalf ? { opacity: 0.4, cursor: 'default' } : null,
                          onClick: () => restartPlugin(p),
                        }, '重跑'),
                        React.createElement('button', {
                          type: 'button',
                          className: 'tb-switch' + (p.running ? ' tb-switch-on' : ''),
                          // canStop=false：宿主缺少 stopFromPanel（停止降级）——运行中的插件开关禁用，停止的仍可启动
                          title: p.hasClientHalf ? '含 Client 半，请到 Cordis 面板操作'
                            : p.running ? (p.canStop === false ? '当前 DSH 缺少停止接口（stopFromPanel），无法停止' : '停止该插件')
                            : '启动该插件',
                          disabled: Boolean(p.hasClientHalf) || (p.running && p.canStop === false),
                          style: (p.hasClientHalf || (p.running && p.canStop === false)) ? { opacity: 0.4, cursor: 'default' } : null,
                          onClick: () => togglePlugin(p),
                        }),
                      )
                    // 过滤模式：平铺（原行为）；否则按分类树展示
                    const fq = pluginFilter.trim().toLowerCase()
                    if (fq) {
                      return React.createElement('div', { className: 'tb-manage-list' }, visiblePlugins
                        .filter((p) => (p.name || '').toLowerCase().indexOf(fq) >= 0 || (p.pluginId || '').toLowerCase().indexOf(fq) >= 0)
                        .map(manageRow))
                    }
                    const byCat = {}
                    for (const p of visiblePlugins) {
                      const cid = p.entryId ? catOf(p.entryId) : 'system' // 清单外插件归「系统」且不可拖（无稳定归属键）
                      if (!byCat[cid]) byCat[cid] = []
                      byCat[cid].push(p)
                    }
                    const chevron = React.createElement('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'currentColor' },
                      React.createElement('path', { d: 'M3 1.5 L7.5 5 L3 8.5 Z' }))
                    return React.createElement('div', null, TOOL_CATS
                      .filter((c) => byCat[c.id] && byCat[c.id].length)
                      .map((c) => {
                        const list = byCat[c.id]
                        const open = !collapsedCats[c.id]
                        const running = list.filter((p) => p.running).length
                        return React.createElement('div', { key: 'cat-' + c.id },
                          React.createElement('div', {
                            className: 'tb-tree-cat' + (open ? ' tb-tree-cat-open' : '') + (dragId && catOf(dragId) !== c.id ? ' tb-tree-cat-drop' : ''),
                            title: '点击折叠/展开；拖节点到此标题上即改分类（与导航行联动）',
                            onClick: () => toggleCat(c.id),
                            onDragOver: (e) => { if (dragId) e.preventDefault() },
                            onDrop: (e) => { e.preventDefault(); if (dragId) moveNode(dragId, c.id); setDragId(null) },
                          },
                            React.createElement('span', { className: 'tb-tree-chev' }, chevron),
                            React.createElement('span', { className: 'tb-tree-cat-label' }, c.label),
                            React.createElement('span', { className: 'tb-note' }, list.length + ' 个 · ' + running + ' 运行'),
                          ),
                          open ? React.createElement('div', { className: 'tb-tree-kids' }, list.map(manageRow)) : null,
                        )
                      }))
                  })()),
          ),
        )
      } else if (tools.length === 0) {
        body = currentCwd
          ? React.createElement('div', { className: 'tb-empty' },
              canRebuildFromDisk
                ? '当前工作区未检测到 dsh-dynamic-toolbox\n切换到一个包含工具箱的工作区后自动加载；本工作区下不显示工具'
                : '当前工作区暂未挂载本工具箱合集\n切换到一个有效工作区后自动加载；本工作区下不显示工具',
            )
          : React.createElement('div', { className: 'tb-empty' },
              '暂无工具\n运行工具插件（如 Jira）后自动出现在这里；已停止的插件可在右上角管理按钮里重新启动',
            )
      } else {
        body = React.createElement('div', { className: 'tb-frame', ref: panelRef, onClick: onPanelClick, onKeyDown: onPanelKeyDown, onInput: onPanelInput, onPointerDown: onFlowRailResizeDown },
          error ? React.createElement('div', { className: 'tb-error', role: 'alert' },
            String(error),
            active === 'flow' ? React.createElement('button', { type: 'button', className: 'tb-btn', onClick: () => loadPanel('flow', 'refresh') }, '重新同步') : null,
          ) : null,
          copied ? React.createElement('div', { className: 'tb-banner tb-banner-info' }, String(copied)) : null,
          active === 'flow' && flowUiNotice ? React.createElement('div', { className: 'tb-banner tb-banner-info', title: flowUiNotice }, String(flowUiNotice)) : null,
          launchRecovery,
          html
            ? active === 'flow' && typeof document !== 'undefined'
              ? React.createElement('div', { className: 'tb-panel-html' }, React.createElement(FlowStablePanel, { html, workspace: currentCwd }))
              : React.createElement('div', { className: 'tb-panel-html', dangerouslySetInnerHTML: { __html: html } })
            : React.createElement('div', { className: 'tb-notice' }, '加载面板…'),
          flowZoomControl,
          flowSelectionBar,
          flowBringDialog,
          flowAddDialog,
          zoomActionBar,
          workbenchDialog,
          showJumpLatest ? React.createElement('button', {
            type: 'button',
            className: 'tb-jump-latest',
            title: '平滑回到当前面板的最新内容',
            onClick: jumpToLatest,
          }, '↓ 回到最新') : null,
        )
      }

      const drawerEl = React.createElement('div', {
        ref: drawerRef,
        className: (embedded
          ? 'jr-drawer jr-drawer-embedded'
          : 'jr-drawer' + (dockMode === 'right' ? ' jr-docked' : dockMode === 'full' ? ' jr-docked-full' : ''))
          + (flowZen && active === 'flow' ? ' jr-flow-zen' : ''),
        // bundle root：CSS scope / 主题变量挂载点（多 bundle 共存隔离；PiP 克隆随 DOM 属性一并镜像）
        'data-dsh-toolbox-root': RT.bundleId,
        style,
      },
        embedded ? null : React.createElement('div', {
          className: 'jr-drawer-header',
          style: RT.bundleId === 'flow' ? { cursor: 'default' } : undefined,
          onPointerDown: RT.bundleId === 'flow' ? undefined : onHeaderDown,
          onPointerMove: RT.bundleId === 'flow' ? undefined : onHeaderMove,
          onPointerUp: RT.bundleId === 'flow' ? undefined : onHeaderUp,
          onPointerCancel: RT.bundleId === 'flow' ? undefined : onHeaderUp,
        },
          React.createElement('span', {
            className: 'jr-drawer-title',
            title: fullDisplayName + (managing ? ' · 管理' : ''),
          }, managing ? compactDisplayName + ' · 管理' : compactDisplayName),
          themeButton,
          pipButton,
          gearButton,
          dockButton,
          closeButton,
        ),
        // 只有一个工具时整条导航无意义：隐藏搜索工具栏/分类行/Tab 栏，抽屉退化为纯面板；
        // 对所有停靠形态（浮动/右停靠/全占/PiP 镜像）都走同一 Drawer 渲染，天然全部生效。
        managing || tools.length === 1 ? null : React.createElement('div', { className: 'tb-nav' },
          React.createElement('input', {
            className: 'tb-input tb-nav-search',
            placeholder: '搜索工具（共 ' + tools.length + ' 个，匹配名称 / ID）',
            value: tabFilter,
            onChange: (e) => setTabFilter(e.target.value),
          }),
          React.createElement(HRow, { className: 'tb-hrow tb-cats' },
            visibleCats.map((c) => React.createElement('button', {
              key: c.id,
              type: 'button',
              className: 'tb-chip' + (!searching && c.id === effCat ? ' tb-chip-on' : ''),
              title: '分类「' + c.label + '」；管理页（右上角管理按钮）可把节点拖到别的分类',
              onClick: () => pickCat(c.id),
            }, c.label + ' · ' + catCounts[c.id]))),
          React.createElement(HRow, { className: 'tb-hrow tb-tools' },
            shownTools.length
              ? shownTools.map(toolButton)
              : React.createElement('span', { className: 'tb-hrow-empty' }, searching ? '无匹配工具' : '该分类暂无运行中的工具')),
        ),
        React.createElement('div', { className: 'jr-drawer-body' }, body),
        handles,
      )

      const flowMarkdownPortalEl = flowMarkdownPortal && flowMarkdownText && flowCreatePortal
        ? flowCreatePortal(React.createElement('div', { className: 'fl-markdown-rendered' },
          React.createElement(flowMarkdownText, {
            text: flowMarkdownPortal.text,
            streaming: flowMarkdownPortal.streaming,
            labels: FLOW_MARKDOWN_LABELS,
            codeLabels: FLOW_MARKDOWN_LABELS.code,
          }),
        ), flowMarkdownPortal.mount || flowMarkdownPortal.target)
        : null
      const drawerWithPortal = React.createElement(React.Fragment, null, drawerEl, flowMarkdownPortalEl)

      // 静态 bundle 的整套 CSS 位于 @scope ([data-dsh-toolbox-scope="<bundle>"])；
      // 嵌入分支也必须保留这个祖先，否则浏览器只会显示未样式化的 Host HTML。
      if (embedded) {
        return React.createElement('div', {
          'data-dsh-toolbox-scope': RT.domValue(),
          style: { display: 'flex', width: '100%', height: '100%', minHeight: 0 },
        }, drawerWithPortal)
      }

      const overlay = React.createElement(React.Fragment, null,
        drawerWithPortal,
        snapHint ? React.createElement('div', { className: 'jr-snap-indicator' }) : null,
        resize ? React.createElement('div', { className: 'jr-resize-badge' },
          Math.round(width || 520) + ' × ' + (height ? Math.round(height) : '自动'),
        ) : null,
      )
      return RT.bundleId === 'dynamic' ? overlay : React.createElement('div', {
        'data-dsh-toolbox-scope': RT.domValue(),
        style: { display: 'contents' },
      }, overlay)
    }

    function FlowglassSidebarView(props) {
      const active = useIntegrationActive()
      if (!active) {
        return React.createElement('div', {
          'data-dsh-toolbox-scope': RT.domValue(),
          style: { width: '100%', height: '100%' },
        }, React.createElement('div', { className: 'tb-notice' }, '流镜右侧栏承载暂不可用。'))
      }
      return React.createElement(Drawer, {
        embedded: true,
        visible: props.visible,
        sessionId: props.scope && props.scope.sessionId,
        cwd: props.scope && props.scope.cwd,
        // 嵌入态由 better-sidebar scope 提供权威会话，不再读取 shell overlay 的 hook。
        useSessions: () => undefined,
      })
    }

    // 原生右侧栏 Tab body（0.1.5+）：Slot 标准属性是权威来源——
    //   props.sessionId：Tab 所属会话（不读 localStorage / DOM 会话标记）；
    //   props.useSessions：全局会话列表 hook（工作区会话树/cwd 兜底）；
    //   props.useTabInfo()：tab.visible 驱动不可见暂停（定时刷新/动画计时/Markdown 重渲染停摆）。
    function FlowglassNativeTabBody(props) {
      // 原生 Slot 契约保证该 hook 存在；保持无条件调用，避免在 try/条件分支
      // 内调用 hook 导致渲染间 hook 顺序漂移。
      const info = props.useTabInfo()
      const visible = !(info && info.tab && info.tab.visible === false)
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : () => undefined
      const selectedSessionId = useSessions((state) => state && state.current ? String(state.current) : '')
      const boundSessionId = String(props.sessionId || '')
      if (visible) {
        nativeFlowVisible = true
        nativeFlowReopenSession = ''
      } else if (nativeFlowVisible && selectedSessionId && boundSessionId && selectedSessionId !== boundSessionId) {
        // Session 导航会把旧页面标成不可见；这是重挂信号，不是用户关闭。
        nativeFlowReopenSession = selectedSessionId
      } else if (nativeFlowReopenSession !== boundSessionId) {
        // 同一 Session 内切走/关闭流镜时立即撤销保持展开意图。
        nativeFlowVisible = false
      }
      return React.createElement(Drawer, {
        embedded: true,
        visible,
        sessionId: props.sessionId,
        useSessions,
        useWorkspaces: typeof props.useWorkspaces === 'function' ? props.useWorkspaces : () => undefined,
      })
    }

    // 原生静态工具箱与 Flowglass 共用官方右侧栏协议，但不需要 Flowglass 的跨 Session
    // 保持展开状态机；官方 Tab 的 sessionId/useTabInfo 仍是面板上下文的权威来源。
    function ToolboxNativeTabBody(props) {
      const info = props.useTabInfo()
      const visible = !(info && info.tab && info.tab.visible === false)
      const useSessions = typeof props.useSessions === 'function' ? props.useSessions : () => undefined
      return React.createElement(Drawer, {
        embedded: true,
        visible,
        sessionId: props.sessionId,
        useSessions,
        useWorkspaces: typeof props.useWorkspaces === 'function' ? props.useWorkspaces : () => undefined,
      })
    }

    if (!OFFICIAL_TOOLBOX_ONLY && typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
      // 侧边栏导航区无官方 Slot：DOM 注入导航条目（新会话下方、SSH 之后），disposer 随插件停止清理
      ctx.effect(() => mountSidebarEntry())
    } else if (!OFFICIAL_TOOLBOX_ONLY) {
      // 无 DOM 环境兜底：官方 footer Slot（rc.7 root-scoped list Slot，owner 只传 { wide }）
      slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: RT.slot('entry'), order: -1000, label: RT.displayName },
        (props) => React.createElement(Entry, { wide: Boolean(props.wide) }),
      ))
    }

    if (!OFFICIAL_TOOLBOX_ONLY) {
      slots.inject('shell.overlay', () => slots.register(
        {
          name: 'shell.overlay',
          id: RT.slot('drawer'),
          order: 120,
          label: RT.displayName + '抽屉',
        },
        (props) => React.createElement(Drawer, props),
      ))
    }

    // Harness 官方插件管理页扩展点：点击 dsh-flowglass bundle 后，在详情页渲染配置表单。
    if (RT.bundleId === 'flow') {
      slots.inject('plugins.bundle.config', () => slots.register(
        { name: 'plugins.bundle.config', key: 'dsh-flowglass' },
        () => React.createElement(FlowglassPluginSettings, null),
      ))
    }

    // ===== Harness 原生右侧栏注册（0.1.5+）=====
    // 两段式公开契约：sidebarRightTabs.register 注册 page type（guide 入口随定义），
    // 同一个 definition id 在 sidebar.right.pane.tab 声明 body。服务不存在时 inject
    // fiber 保持等待（旧 Harness 无感降级到 better-sidebar / 固定右侧兜底面板）。
    if ((RT.bundleId === 'flow' || OFFICIAL_TOOLBOX_ONLY) && typeof ctx.inject === 'function') {
      // 两个服务由宿主相邻 provide，但晚加载/HMR 时仍是两个独立可见性边；
      // 同时等待，避免 registry 先到时永久捕获 undefined controller。
      ctx.inject(['sidebarRightTabs', 'sidebarRight'], (nativeCtx) => {
        const tabs = nativeCtx.get('sidebarRightTabs')
        if (!tabs || typeof tabs.register !== 'function') return
        const controller = nativeCtx.get('sidebarRight')
        const flowGlyph = (p) => React.createElement('svg', {
          width: (p && p.size) || 16, height: (p && p.size) || 16, viewBox: '0 0 16 16', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
          className: p && p.className, 'aria-hidden': true,
        },
          React.createElement('circle', { cx: 8, cy: 3, r: 1.5 }),
          React.createElement('circle', { cx: 4, cy: 12.5, r: 1.5 }),
          React.createElement('circle', { cx: 12, cy: 12.5, r: 1.5 }),
          React.createElement('path', { d: 'M8 4.5v2.2M8 6.7L4 11M8 6.7l4 4.3' }),
        )
        const toolboxGlyph = (p) => React.createElement('svg', {
          width: (p && p.size) || 16, height: (p && p.size) || 16, viewBox: '0 0 16 16', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
          className: p && p.className, 'aria-hidden': true,
        },
          React.createElement('rect', { x: 2, y: 5, width: 12, height: 8.5, rx: 1.5 }),
          React.createElement('path', { d: 'M5.5 5V3.8A1.3 1.3 0 0 1 6.8 2.5h2.4a1.3 1.3 0 0 1 1.3 1.3V5M2 8.2h12' }),
        )
        const nativeToolbox = OFFICIAL_TOOLBOX_ONLY
        const nativeId = nativeToolbox ? TOOLBOX_NATIVE_ID : FLOW_NATIVE_ID
        const nativeKind = nativeToolbox ? TOOLBOX_NATIVE_KIND : FLOW_NATIVE_KIND
        const nativeTitle = nativeToolbox ? '工具箱' : '流镜'
        const nativeDescription = nativeToolbox ? '打开工作区工具箱' : '查看当前会话、工具调用与子代理执行流程'
        // page type：无 resource patterns（按 kind 打开）；guide 项排在文件等常用入口之后
        const definition = {
          id: nativeId,
          kind: nativeKind,
          title: () => nativeTitle,
          guide: [{
            order: 40,
            title: () => nativeTitle,
            description: () => nativeDescription,
            icon: nativeToolbox ? toolboxGlyph : flowGlyph,
          }],
        }
        let disposeType = null
        let disposeBody = null
        const nativeSlots = nativeCtx.get('slots')
        const retract = () => {
          if (disposeBody) { try { disposeBody() } catch (e) {} disposeBody = null }
          if (disposeType) { try { disposeType() } catch (e) {} disposeType = null }
          nativeOpenTab = null
          nativeFlowVisible = false
          nativeFlowReopenSession = ''
          integration.setNative(false)
        }
        const applyNative = () => {
          {
            if (!disposeType) {
              try { disposeType = tabs.register(definition) } catch (e) { retract(); return }
              disposeBody = nativeSlots && typeof nativeSlots.inject === 'function'
                ? nativeCtx.effect(() => nativeSlots.inject('sidebar.right.pane.tab', () => nativeSlots.register(
                  { name: 'sidebar.right.pane.tab', key: nativeId },
                  (tabProps) => React.createElement(nativeToolbox ? ToolboxNativeTabBody : FlowglassNativeTabBody, tabProps),
                )))
                : null
              // 自有入口 → openTab：自动展开右侧栏；同 pane 重复打开聚焦既有 Tab（Harness 单例语义）
              nativeOpenTab = () => {
                if (controller && typeof controller.openTab === 'function') controller.openTab(nativeKind)
              }
              integration.setNative(true)
            }
          }
        }
        applyNative()
        const offMode = integration.subscribe(applyNative)
        nativeCtx.effect(() => () => {
          try { if (typeof offMode === 'function') offMode() } catch (e) {}
          retract()
        })
      })
    }

    // ===== Better Sidebar 兼容桥（次层；仅原生 flow bundle）=====
    // 原生右侧栏接管时撤销本桥注册，原生消失/被禁用时自动恢复——同一时刻只有一条
    // 注册路径生效。只有 registerTab 成功并取得 disposer 后 integration 才视为 active
    // 并隐藏 Drawer 入口；注册抛错/服务卸载/HMR 替换立即恢复 Drawer。
    if (RT.bundleId === 'flow' && typeof ctx.inject === 'function') {
      let bsService = null
      let bsDescriptor = null
      let bsDispose = null
      const syncBsRegistration = () => {
        if (!bsService || typeof bsService.registerTab !== 'function' || !bsDescriptor) return
        const want = !integration.native && integration.enabled !== false
        if (want && !bsDispose) {
          try {
            const d = bsService.registerTab(bsDescriptor)
            bsDispose = () => { try { d() } catch (e) {} }
          } catch (e) {
            bsDispose = null
            integration.sync(null) // 注册失败：恢复 Drawer 入口，不让用户失去唯一入口
            return
          }
        } else if (!want && bsDispose) {
          const d = bsDispose
          bsDispose = null
          try { d() } catch (e) {}
        }
      }
      ctx.inject(['betterSidebar'], (sidebarCtx) => {
        const service = sidebarCtx.get('betterSidebar')
        if (!service || typeof service.registerTab !== 'function') return
        const features = Array.isArray(service.features) ? service.features : []
        bsService = service
        bsDescriptor = {
          id: FLOW_TAB_ID,
          title: '流镜',
          order: 35,
          // 原生多 pane 语义下 single 只保证目标 pane 内去重（0.19 契约）
          single: true,
          description: '查看当前会话、工具调用与子代理执行流程',
          icon: (size) => React.createElement('svg', {
            width: size || 16, height: size || 16, viewBox: '0 0 16 16', fill: 'none',
            stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
          },
            React.createElement('circle', { cx: 8, cy: 3, r: 1.5 }),
            React.createElement('circle', { cx: 4, cy: 12.5, r: 1.5 }),
            React.createElement('circle', { cx: 12, cy: 12.5, r: 1.5 }),
            React.createElement('path', { d: 'M8 4.5v2.2M8 6.7L4 11M8 6.7l4 4.3' }),
          ),
          settings: features.indexOf('pluginSettings') < 0 ? undefined : {
            // 外观（主题/主色/字号，与管理页「外观」分区同源）
            render: (sprops) => React.createElement(BetterSidebarFlowSettings, sprops),
          },
          component: (tabProps) => React.createElement(FlowglassSidebarView, tabProps),
        }
        const sync = () => { integration.sync(service); syncBsRegistration() }
        sync()
        const offState = features.indexOf('stateSubscription') >= 0 && typeof service.subscribeState === 'function'
          ? service.subscribeState(sync)
          : null
        const offIntegration = integration.subscribe(syncBsRegistration)
        sidebarCtx.effect(() => () => {
          try { if (typeof offState === 'function') offState() } catch (e) {}
          try { if (typeof offIntegration === 'function') offIntegration() } catch (e) {}
          if (bsDispose) { const d = bsDispose; bsDispose = null; try { d() } catch (e) {} }
          bsService = null
          bsDescriptor = null
          integration.sync(null)
        })
      })
    }
  },
}

    }

const create_selfview = () => {
// ===== selfview-client.js：界面自查 Client 半 =====
// 动态模式经 Host 半 selfview/client-impl RPC 从磁盘拉取；静态模式在构建期直接打包，
// 两种模式共用 host.call('selfview/*') 通道。
// 职责：
//   1. getDisplayMedia 截屏流（一次授权持续复用；抓帧不需要用户激活，授权必须——所以授权/复制按钮
//      由本半注入真实 DOM 按钮到面板的 [data-selfview-mount]，React 合成事件与 RPC 都没有用户激活）；
//   2. 语义 DOM 快照（[eN] ref → 元素映射，供 ui_snapshot/ui_click 等模型工具）；
//   3. DOM 操作：点击/填充（原生 setter + input/change，绕 React 受控组件值跟踪）/滚动/按键；
//   4. 截图塞进聊天框：合成 ClipboardEvent('paste') + DataTransfer(File)，命中 composer 的 onPaste；
//   5. 长轮询命令通道：host.call('selfview/pull') 挂起 25s 心跳，结果回 selfview/result。

return {
  name: 'selfview-client',
  inject: ['timer'],
  apply(ctx) {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return

    // ---------- 模块状态（bar 重建不丢） ----------
    let stream = null
    let video = null
    let lastFrame = null // { blob, dataUrl, thumbB64, b64, w, h, at }
    let stopped = false
    let refMap = new Map() // 'e12' -> Element（最近一次快照）

    const sleep = (ms) => new Promise((r) => ctx.timeout(r, ms))
    // ---------- 表面标识（审计 E2）----------
    // 多个 GUI 表面（多标签页 / 桌面应用 + 浏览器）同时长轮询时，单 FIFO 命令队列会被任意
    // 表面抢走：ui_snapshot 的 refMap 在 A 页建立、ui_click 落到 B 页必然「ref 不存在」。
    // sessionStorage 天然按标签页隔离 —— 每个表面一个稳定 id，pull/push 都带上，Host 据此做亲和路由。
    let clientId = ''
    try {
      clientId = sessionStorage.getItem('dsh-selfview-cid') || ''
      if (!clientId) { clientId = 'c' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('dsh-selfview-cid', clientId) }
    } catch (e) { clientId = 'c' + Math.random().toString(36).slice(2, 10) }
    const pushState = (note) => host.call('selfview/push', { kind: 'state', stream: Boolean(stream && stream.active), note: note || '', clientId }).catch(() => {})
    const pushThumb = () => {
      if (!lastFrame) return
      host.call('selfview/push', { kind: 'thumb', thumbB64: lastFrame.thumbB64, w: lastFrame.w, h: lastFrame.h, clientId }).catch(() => {})
    }
    const pushLog = (line) => host.call('selfview/push', { kind: 'log', line, clientId }).catch(() => {})

    // ---------- 截屏 ----------
    async function enableStream() {
      if (stream && stream.active) return { ok: true, already: true }
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        return { ok: false, error: '此浏览器不支持 getDisplayMedia' }
      }
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      })
      stream = s
      const track = s.getVideoTracks()[0]
      if (track) {
        track.addEventListener('ended', () => {
          stream = null
          video = null
          pushState('截屏共享已结束（用户在浏览器停止了共享）')
          refreshBars()
        })
      }
      video = document.createElement('video')
      video.muted = true
      video.srcObject = s
      // play 失败（自动播放策略等）必须先停轨复位再抛错——否则 stream 已激活、UI 显示「共享中」，
      // 提示却说授权失败，状态自相矛盾且后续 capture 能走通（审计 L23）
      try {
        await video.play()
      } catch (e) {
        try { for (const t of s.getTracks()) t.stop() } catch (e2) {}
        stream = null
        video = null
        throw e
      }
      pushState('截屏共享已开启')
      return { ok: true }
    }

    function stopStream() {
      try { if (stream) for (const t of stream.getTracks()) t.stop() } catch (e) {}
      stream = null
      video = null
      pushState('截屏共享已停止')
      refreshBars()
    }

    function blobToB64(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^,]*,/, ''))
        fr.onerror = () => reject(new Error('FileReader 失败'))
        fr.readAsDataURL(blob)
      })
    }

    async function grabFrame() {
      if (!stream || !stream.active || !video || !video.videoWidth) throw new Error('no-stream')
      const w = video.videoWidth
      const h = video.videoHeight
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(video, 0, 0, w, h)
      const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 失败'))), 'image/jpeg', 0.85))
      // 缩略图（面板/日志用，宽 ≤ 360）
      const tw = Math.min(360, w)
      const th = Math.round((h * tw) / w)
      const tc = document.createElement('canvas')
      tc.width = tw
      tc.height = th
      tc.getContext('2d').drawImage(canvas, 0, 0, tw, th)
      const tBlob = await new Promise((res, rej) => tc.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 失败'))), 'image/jpeg', 0.7))
      const b64 = await blobToB64(blob)
      const thumbB64 = await blobToB64(tBlob)
      return { blob, b64, thumbB64, dataUrl: 'data:image/jpeg;base64,' + b64, w, h, at: Date.now() }
    }

    async function doCapture() {
      if (!stream || !stream.active) return { ok: false, error: 'no-stream' }
      try {
        lastFrame = await grabFrame()
        refreshBars()
        pushThumb()
        return { ok: true, jpegB64: lastFrame.b64, thumbB64: lastFrame.thumbB64, w: lastFrame.w, h: lastFrame.h }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    // ---------- 语义快照 ----------
    const ROLE_HIT = /^(button|link|tab|menuitem|switch|checkbox|radio|dialog|option|treeitem|combobox|textbox)$/
    const isVisible = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return false
      return true // 尺寸有效即认为可见（不逐元素 getComputedStyle，太贵）
    }
    const labelOf = (el) => {
      const pick = (s) => (typeof s === 'string' && s.trim() ? s.trim().replace(/\s+/g, ' ') : '')
      let s = pick(el.getAttribute && el.getAttribute('aria-label')) || pick(el.title) ||
        pick(el.getAttribute && el.getAttribute('placeholder')) || pick(el.value) ||
        pick(el.textContent)
      return s.length > 48 ? s.slice(0, 48) + '…' : s
    }
    const describe = (el, ref) => {
      const tag = el.tagName.toLowerCase()
      const type = tag === 'input' ? (' type=' + (el.type || 'text')) : ''
      const dis = el.disabled || el.getAttribute('aria-disabled') === 'true' ? '（禁用）' : ''
      const focus = el === document.activeElement ? '（焦点）' : ''
      return (ref ? '[' + ref + '] ' : '') + '<' + tag + type + '> "' + labelOf(el) + '"' + dis + focus
    }
    function doSnapshot(opts) {
      refMap = new Map()
      const maxLines = Math.max(20, Math.min(800, (opts && opts.maxLines) || 300))
      // 深度上限（审计 E1）：旧默认 14 在真实 DSH 界面上会把绝大多数交互元素挡在树外
      // （全页扫描几乎全盲，实测只剩 1 个元素）；放宽到 48 并允许 opts.maxDepth 调整。
      // isVisible 为假的子树整体剪枝，深度放开不会带来失控开销。
      const maxDepth = Math.max(14, Math.min(160, (opts && opts.maxDepth) || 48))
      let root = document.body
      if (opts && opts.selector) {
        root = document.querySelector(opts.selector)
        if (!root) return { ok: false, error: 'selector 未命中: ' + opts.selector }
      }
      const lines = []
      let n = 0
      let truncated = false
      const walk = (el, depth) => {
        if (lines.length >= maxLines) { truncated = true; return }
        if (depth > maxDepth || !el || !el.tagName) return
        const tag = el.tagName
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|PATH|NOSCRIPT)$/.test(tag)) return
        if (!isVisible(el)) return
        const role = (el.getAttribute && el.getAttribute('role')) || ''
        const interesting =
          /^(A|BUTTON|INPUT|TEXTAREA|SELECT|SUMMARY|H1|H2|H3|H4|H5|H6)$/.test(tag) ||
          ROLE_HIT.test(role) ||
          el.hasAttribute('contenteditable') ||
          el.hasAttribute('data-action') ||
          el.hasAttribute('data-field')
        let childDepth = depth
        if (interesting) {
          n += 1
          const ref = 'e' + n
          refMap.set(ref, el)
          lines.push('  '.repeat(Math.min(depth, 10)) + describe(el, ref))
          childDepth = depth + 1
        }
        for (const c of el.children) walk(c, childDepth + (interesting ? 0 : 1))
      }
      walk(root, 0)
      const head = '页面: ' + (document.title || '(无标题)') + ' @ ' + location.href + '\n可见可交互元素 ' + n + ' 个' + (truncated ? '（已达 ' + maxLines + ' 行上限，截断；用 selector 缩范围或调大 maxLines/maxDepth）' : '') + '：'
      return { ok: true, text: head + '\n' + lines.join('\n'), count: n }
    }

    // ---------- DOM 操作 ----------
    const resolveEl = (cmd) => {
      if (cmd.ref) {
        const el = refMap.get(String(cmd.ref))
        if (!el) return { error: 'ref 不存在或已过期: ' + cmd.ref + '（重新 ui_snapshot 获取最新引用）' }
        if (!document.contains(el)) return { error: 'ref 指向的元素已离开文档: ' + cmd.ref + '（重新 ui_snapshot）' }
        return { el }
      }
      if (cmd.selector) {
        const el = document.querySelector(cmd.selector)
        if (!el) return { error: 'selector 未命中: ' + cmd.selector }
        return { el }
      }
      return { error: '需要 ref 或 selector' }
    }
    const DANGER = /删除|清空|结束进程|停止全部|退出登录|注销|废弃|还原|delete|remove|discard|logout|sign[\s-]?out/i
    function doAct(cmd) {
      try {
        if (cmd.action === 'scroll') {
          const dx = cmd.dx || 0
          const dy = cmd.dy == null ? 600 : cmd.dy
          if (cmd.selector) {
            const hit = resolveEl(cmd)
            if (hit.error) return { ok: false, error: hit.error }
            hit.el.scrollBy({ left: dx, top: dy })
            return { ok: true, detail: describe(hit.el) + ' → scrollTop=' + Math.round(hit.el.scrollTop) }
          }
          window.scrollBy({ left: dx, top: dy })
          return { ok: true, detail: 'window → scrollY=' + Math.round(window.scrollY) }
        }
        if (cmd.action === 'press') {
          const key = String(cmd.key || '')
          if (!key) return { ok: false, error: '缺少 key' }
          const target = cmd.selector ? resolveEl(cmd).el : (document.activeElement || document.body)
          if (!target) return { ok: false, error: '无目标元素' }
          for (const type of ['keydown', 'keypress', 'keyup']) {
            target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true, view: window }))
          }
          return { ok: true, detail: key + ' @ ' + describe(target) }
        }
        const hit = resolveEl(cmd)
        if (hit.error) return { ok: false, error: hit.error }
        const el = hit.el
        if (cmd.action === 'click') {
          const label = labelOf(el)
          if (!cmd.allowDangerous && DANGER.test(label)) {
            return { ok: false, error: '疑似破坏性操作（"' + label + '"），已拦截；确认要点请用 allowDangerous=true' }
          }
          el.scrollIntoView && el.scrollIntoView({ block: 'nearest' }) // scrollIntoView 并非所有元素都有（svg/jsdom），缺则跳过
          el.focus && el.focus()
          el.click()
          pushLog('点击 ' + describe(el))
          return { ok: true, detail: describe(el) }
        }
        if (cmd.action === 'fill') {
          const text = String(cmd.text == null ? '' : cmd.text)
          el.focus && el.focus()
          const tag = el.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA') {
            const proto = tag === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text) // 原生 setter：绕 React 值跟踪
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          } else if (tag === 'SELECT') {
            el.value = text
            // 赋值不命中任何 option 时 value 静默不变——必须显式失败，否则模型以为下拉已设置（审计 L21）
            if (el.value !== String(text)) return { ok: false, error: '没有匹配的选项: ' + String(text).slice(0, 60) }
            el.dispatchEvent(new Event('change', { bubbles: true }))
          } else if (el.hasAttribute('contenteditable')) {
            el.textContent = text
            el.dispatchEvent(new Event('input', { bubbles: true }))
          } else {
            return { ok: false, error: '不是可填充元素: <' + tag.toLowerCase() + '>' }
          }
          pushLog('填充 ' + describe(el) + ' ← ' + text.slice(0, 30))
          return { ok: true, detail: describe(el) + ' ← "' + (text.length > 30 ? text.slice(0, 30) + '…' : text) + '"' }
        }
        return { ok: false, error: '未知 action: ' + cmd.action }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    // ---------- 粘贴进聊天框 ----------
    function pasteIntoComposer() {
      if (!lastFrame) return { ok: false, error: '还没有截图（先截一张）' }
      const ta = document.querySelector('textarea[data-phase]') ||
        document.querySelector('textarea[rows="2"]') ||
        document.querySelector('textarea')
      if (!ta) return { ok: false, error: '找不到聊天输入框（textarea[data-phase]）' }
      const file = new File([lastFrame.blob], 'webui-shot-' + lastFrame.at + '.jpg', { type: 'image/jpeg' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      ta.focus()
      ta.dispatchEvent(ev)
      pushLog('截图已粘贴进聊天框')
      return { ok: true, detail: ev.defaultPrevented ? '已进入聊天框附件区' : '已派发粘贴事件（聊天框未拦截，可能未接收——请目测确认）' }
    }

    // ---------- 面板按钮条（真实 DOM 按钮：授权/复制需要用户激活） ----------
    const barState = { note: '' }
    function ensureBar(mount) {
      if (mount.__selfviewBar) return
      mount.__selfviewBar = true
      mount.innerHTML = ''
      const bar = document.createElement('div')
      bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px'
      const mkBtn = (label, title, primary) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'tb-btn tb-btn-sm' + (primary ? ' tb-btn-primary' : '')
        b.textContent = label
        b.title = title || ''
        return b
      }
      const status = document.createElement('span')
      status.className = 'tb-note'
      const btnEnable = mkBtn('开启截屏', '浏览器弹窗选「当前标签页」；授权一次，流保持复用', true)
      const btnShot = mkBtn('截一张', '从共享流抓当前帧（不需再次授权）')
      const btnCopy = mkBtn('复制图片', '复制最近一帧到剪贴板（PNG）')
      const btnPaste = mkBtn('插入聊天框', '把最近一帧作为图片附件粘贴进聊天输入框（你确认后才会发送）')
      const btnStop = mkBtn('停止共享', '结束 getDisplayMedia 流')
      const note = document.createElement('span')
      note.className = 'tb-note'
      const preview = document.createElement('img')
      preview.style.cssText = 'max-width:100%;max-height:140px;border-radius:6px;display:none'
      const say = (t) => { note.textContent = t }

      const syncUI = () => {
        const on = Boolean(stream && stream.active)
        status.textContent = on ? '● 截屏共享中' : '○ 未开启'
        btnEnable.textContent = on ? '重新授权' : '开启截屏'
        btnShot.disabled = !on
        btnCopy.disabled = !on && !lastFrame
        btnPaste.disabled = !lastFrame
        btnStop.disabled = !on
        if (lastFrame) { preview.src = lastFrame.dataUrl; preview.style.display = 'block' }
      }
      btnEnable.onclick = async () => {
        btnEnable.disabled = true
        say('等待浏览器授权…（选「当前标签页」）')
        try {
          const r = await enableStream()
          say(r.ok ? '已开启 ✓ 之后截屏/模型 ui_capture 都直接用' : (r.error || '授权失败'))
        } catch (e) {
          say('授权被取消或失败: ' + String((e && e.message) || e))
        }
        btnEnable.disabled = false
        syncUI()
      }
      btnShot.onclick = async () => {
        say('抓帧中…')
        const r = await doCapture()
        say(r.ok ? '已截 ' + lastFrame.w + '×' + lastFrame.h + ' ✓' : ('失败: ' + (r.error === 'no-stream' ? '未开启共享' : r.error)))
        syncUI()
      }
      btnCopy.onclick = async () => {
        try {
          if (!lastFrame) { const r = await doCapture(); if (!r.ok) { say('先开启截屏'); syncUI(); return } }
          // 剪贴板只收 PNG：jpeg blob → ImageBitmap → canvas → png
          const bmp = await createImageBitmap(lastFrame.blob)
          const c = document.createElement('canvas')
          c.width = bmp.width
          c.height = bmp.height
          c.getContext('2d').drawImage(bmp, 0, 0)
          const png = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 失败'))), 'image/png'))
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          say('已复制到剪贴板 ✓（PNG ' + Math.round(png.size / 1024) + 'KB）')
          pushLog('截图已复制到剪贴板')
        } catch (e) {
          say('复制失败: ' + String((e && e.message) || e))
        }
        syncUI()
      }
      btnPaste.onclick = () => {
        const r = pasteIntoComposer()
        say(r.ok ? r.detail + ' ✓' : ('失败: ' + r.error))
        syncUI()
      }
      btnStop.onclick = () => { stopStream(); say('已停止共享') }
      bar.appendChild(status)
      bar.appendChild(btnEnable)
      bar.appendChild(btnShot)
      bar.appendChild(btnCopy)
      bar.appendChild(btnPaste)
      bar.appendChild(btnStop)
      mount.appendChild(bar)
      mount.appendChild(note)
      mount.appendChild(preview)
      mount.__selfviewSync = syncUI
      syncUI()
      if (barState.note) say(barState.note)
    }
    function refreshBars() {
      const mounts = document.querySelectorAll('[data-selfview-mount]')
      for (const m of mounts) {
        ensureBar(m)
        if (m.__selfviewSync) m.__selfviewSync()
      }
    }
    // 节流（审计 L24）：流式输出期间 mutation 极高频，每次回调全页 querySelectorAll 纯空扫；
    // 500ms trailing 合并，面板挂载点出现后最迟半秒内补上按钮条
    let moTimer = null
    const observer = new MutationObserver(() => {
      if (moTimer) return
      moTimer = ctx.timeout(() => {
        moTimer = null
        const mounts = document.querySelectorAll('[data-selfview-mount]')
        for (const m of mounts) ensureBar(m)
      }, 500)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    refreshBars() // 首扫：面板可能先于本半渲染（插件重启而抽屉开着），MutationObserver 只管之后的变更

    // ---------- 长轮询命令循环 ----------
    ;(async () => {
      while (!stopped) {
        let cmd = null
        try { cmd = await host.call('selfview/pull', { clientId }) } catch (e) { await sleep(2000); continue }
        if (stopped) break
        if (!cmd || cmd.cmd === 'none') continue
        if (cmd.cmd === 'stop') break
        let res
        try { res = await execCmd(cmd) } catch (e) { res = { ok: false, error: String((e && e.message) || e) } }
        try { await host.call('selfview/result', { id: cmd.id, res }) } catch (e) {}
      }
    })()
    async function execCmd(cmd) {
      if (cmd.cmd === 'capture') return doCapture()
      if (cmd.cmd === 'snapshot') return doSnapshot(cmd)
      if (cmd.cmd === 'act') return doAct(cmd)
      return { ok: false, error: '未知命令: ' + String(cmd.cmd) }
    }

    ctx.effect(() => () => {
      stopped = true
      try { observer.disconnect() } catch (e) {}
      try { if (stream) for (const t of stream.getTracks()) t.stop() } catch (e2) {}
      stream = null
      video = null
    })
  },
}

}

    async function apply(ctx) {
      try {
      const disposeRemote = await ctx.remote.$mount(remoteContribution)
      ctx.effect(() => () => { void disposeRemote() })
      ctx.effect(() => () => { for (const dispose of [...styleDisposers]) dispose() })
      const remote = ctx.get('remote.' + "toolboxNativeDynamicToolbox")
      if (!remote) throw new Error('静态工具箱 Remote namespace 未挂载: ' + "toolboxNativeDynamicToolbox")
      const methods = {
        [TOOLBOX_RUNTIME.rpc('tools')]: (args) => remote.tools(args || {}),
        [TOOLBOX_RUNTIME.rpc('panel')]: (args) => remote.panel(args || {}),
        [TOOLBOX_RUNTIME.rpc('plugins')]: (args) => remote.plugins(args || {}),
        [TOOLBOX_RUNTIME.rpc('session-info')]: (args) => remote.sessionInfo(args || {}),

        ["selfview/pull"]: (args) => remote.selfviewPull(args || {}),
        ["selfview/result"]: (args) => remote.selfviewResult(args || {}),
        ["selfview/push"]: (args) => remote.selfviewPush(args || {}),
      }
      host = {
        call(methodName, args) {
          const method = methods[methodName]
          if (!method) return Promise.resolve({ ok: false, error: '原生静态合集不支持管理动作: ' + methodName })
          return unwrap(method(args))
        },
      }
      const plugins = [createToolboxClient(), create_selfview()].filter(Boolean)
      for (const plugin of plugins) {
        if (!plugin || typeof plugin.apply !== 'function') throw new Error('静态 Client feature 未返回有效插件对象')
        const disposer = await plugin.apply(ctx)
        if (typeof disposer === 'function') ctx.effect(() => disposer)
      }
      console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态 Client 已加载（无动态批准）')
      } catch (error) {
        console.error(TOOLBOX_RUNTIME.logTag() + ' 原生静态 Client 加载失败', error)
        throw error
      }
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
