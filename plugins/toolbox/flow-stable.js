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
