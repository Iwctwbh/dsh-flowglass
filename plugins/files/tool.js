// ===== files-tool.js：工作区文件工具（Host-only，HTML 面板经工具箱 RPC 渲染）=====
// 状态：{ dirs: {路径: 条目[]}, expanded: {路径: bool} }，由客户端回传（无损 JSON）

return {
  name: 'files-tool',
  inject: ['fs', 'timer'],
  apply(ctx) {
    const fsService = ctx.get('fs')

    // 路径规范化与包含判断：Windows 盘符/UNC 大小写不敏感折叠（与宿主 id 同算法），POSIX 保持原样
    const normRoot = (p) => String(p || '').replace(/[\\/]+$/, '')
    const canonPath = (p) => {
      let s = String(p || '').replace(/\\/g, '/').replace(/\/+$/, '')
      if (/^[a-zA-Z]:/.test(s) || s.indexOf('//') === 0) s = s.toLowerCase()
      return s
    }
    const isUnder = (child, base) => {
      const c = canonPath(child)
      const b = canonPath(base)
      return c === b || c.startsWith(b + '/')
    }

    const resolveWs = (rootArg, sessionId) => {
      const sessionsSvc = ctx.get('sessions')
      // 1) sessionId 优先：当前激活会话的 cwd 才是「当前工作区」。框架 panel RPC 传入的 root
      //    已被 Host 替换为工具箱仓库根——仓库 clone 为宿主项目子目录时 ≠ 会话工作区，
      //    直接采信会列错目录。与 jira/http 的 resolveWs 同语义（审计 L8 后的统一行为）。
      if (sessionId && sessionsSvc) {
        try {
          const s = sessionsSvc.get(sessionId)
          const cwd = s && s.header && s.header.cwd
          if (s && typeof cwd === 'string' && cwd) return { root: cwd.replace(/[\\/]+$/, ''), session: s }
        } catch (e) {}
      }
      let hit = null
      const sessionCwds = []
      if (sessionsSvc) {
        try {
          for (const s of sessionsSvc.list()) {
            const cwd = s && s.header && s.header.cwd
            if (typeof cwd === 'string' && cwd) {
              if (!hit) hit = s // 取第一个有 cwd 的会话（list 最新在前；旧行为取最后一个=最旧，属审计 L8 同款缺陷）
              sessionCwds.push(cwd.replace(/[\\/]+$/, ''))
            }
          }
        } catch (e) {}
      }
      const sp = ctx.get('sandboxPolicy')
      const policyRoot = sp && typeof sp.workspaceRoot === 'string' ? sp.workspaceRoot.replace(/[\\/]+$/, '') : ''
      // 显式绝对路径围栏：仅当落在会话 cwd / 策略工作区之内才采信（覆盖仓库 clone 为子目录、
      // 框架传入子目录仓库根的场景）；其余一律拒绝回落默认解析——面板协议字段客户端可控，
      // 裸收任意绝对路径等于把浏览工具变成盘外目录枚举/文本读取原语（审计 M1）。
      if (rootArg && /^([A-Za-z]:[\\/]|\/|\\\\)/.test(rootArg)) {
        const allowed = policyRoot ? sessionCwds.concat([policyRoot]) : sessionCwds
        if (allowed.some((b) => isUnder(rootArg, b))) return { root: normRoot(rootArg), session: null }
        return { root: '', session: null }
      }
      if (hit) return { root: hit.header.cwd.replace(/[\\/]+$/, ''), session: hit }
      return { root: policyRoot, session: null }
    }

    // 相对路径围栏：拒绝空值/绝对形式/盘符/UNC/任何 .. 段。树节点路径虽由 Host 渲染产生，
    // 但 state 每次动作从客户端回传、可被篡改，不能当作边界依据（审计 M1 第二层）。
    const safeRel = (p) => {
      const s = String(p == null ? '' : p)
      if (!s || /^([A-Za-z]:[\\/]|\/|\\\\)/.test(s)) return null
      if (s.split(/[\\/]+/).some((seg) => seg === '..')) return null
      return s
    }

    const sortEntries = (entries) => entries
      .slice()
      .sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return (a.name || '').localeCompare(b.name || '')
      })
      .map((e) => ({ name: e.name, type: e.type, size: typeof e.size === 'number' ? e.size : null }))

    const ensureRoot = async (st, base) => {
      if (st.dirs['/']) return
      const target = await fsService.resolve('.', { cwd: base })
      st.dirs['/'] = sortEntries(await fsService.listDir(target))
    }

    // 树图标（内联 SVG，stroke 跟随 currentColor，颜色由 tb-tree-* 类控制）
    const ICO_CHEV = '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>'
    const ICO_FOLDER = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.8v6.7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.2a1 1 0 0 0-1-1H8.1L6.9 4a1 1 0 0 0-.7-.3H3.5a1 1 0 0 0-1 1z"/></svg>'
    const ICO_FILE = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h4.8l3.2 3.2v7.8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M8.8 2.5v3.2h3.2"/></svg>'

    const MAX_PER_DIR = 300 // 单文件夹渲染上限（node_modules 级目录防爆 HTML）
    const renderTree = (dirs, expanded) => {
      const rows = []
      const walk = (dirPath, depth) => {
        const key = dirPath || '/'
        const list = dirs[key] || []
        if (!list.length && dirPath) return
        const pad = (depth * 16 + 2) + 'px'
        const shown = list.length > MAX_PER_DIR ? list.slice(0, MAX_PER_DIR) : list
        for (const e of shown) {
          const fullPath = dirPath ? dirPath + '/' + e.name : e.name
          const isDir = e.type === 'directory'
          const isOpen = !!expanded[fullPath]
          if (isDir) {
            rows.push('<div class="tb-tree-row tb-tree-dir' + (isOpen ? ' tb-tree-open' : '') + '" style="padding-left:' + pad + '" data-action="expand" data-path="' + esc(fullPath) + '" title="' + esc(fullPath) + '">' +
              '<span class="tb-tree-chevron">' + ICO_CHEV + '</span>' +
              '<span class="tb-tree-ic">' + ICO_FOLDER + '</span>' +
              '<span class="tb-tree-name">' + esc(e.name) + '</span></div>')
            if (isOpen) walk(fullPath, depth + 1)
          } else {
            rows.push('<div class="tb-tree-row tb-tree-file" style="padding-left:' + pad + '" title="' + esc(fullPath) + '" data-action="preview" data-path="' + esc(fullPath) + '">' +
              '<span class="tb-tree-chevron"></span>' +
              '<span class="tb-tree-ic">' + ICO_FILE + '</span>' +
              '<span class="tb-tree-name">' + esc(e.name) + '</span>' +
              '<span class="tb-tree-size">' + fmtSize(e.size) + '</span></div>')
          }
        }
        if (list.length > MAX_PER_DIR) {
          rows.push('<div class="tb-tree-row" style="padding-left:' + pad + '"><span class="tb-tree-chevron"></span>' +
            '<span class="tb-note">… 还有 ' + (list.length - MAX_PER_DIR) + ' 个条目未显示（共 ' + list.length + '）</span></div>')
        }
      }
      walk('', 0)
      return rows.join('\n')
    }

    // 文本预览：常见代码/文本扩展名才读；其余（图片/二进制/压缩包）提示不支持。
    // 先查大小再读（L4）：readText 无上限，点一个几百 MB 的日志会全量进主进程再丢弃。
    const PREVIEW_CAP = 16 * 1024
    const PREVIEW_MAX_BYTES = 2 * 1024 * 1024
    const TEXT_EXTS = /^(txt|md|markdown|json|jsonc|js|mjs|cjs|ts|tsx|jsx|css|html?|xml|ya?ml|toml|ini|env|sh|ps1|bat|cmd|py|java|go|rs|c|h|cpp|hpp|cs|sql|vue|svelte|log|csv|gitignore|gitattributes|editorconfig|lock|rc)$/
    const previewFile = async (rel, wsRoot) => {
      const ext = String(rel.split('.').pop() || '').toLowerCase()
      if (!TEXT_EXTS.test(ext)) return { error: '该类型（.' + ext + '）暂不支持文本预览' }
      const target = await fsService.resolve(rel, { cwd: wsRoot })
      const meta = await fsService.stat(target)
      if (!meta) return { error: '文件不存在: ' + rel }
      if (typeof meta.size === 'number' && meta.size > PREVIEW_MAX_BYTES) {
        return { error: '文件过大（约 ' + Math.max(1, Math.round(meta.size / 1024 / 1024)) + 'MB），文本预览上限 2MB' }
      }
      const text = await fsService.readText(target)
      return { text: text.length > PREVIEW_CAP ? text.slice(0, PREVIEW_CAP) : text, truncated: text.length > PREVIEW_CAP, total: text.length }
    }

    const handler = async ({ action, fields, state, root, session }) => {
      const ws = resolveWs(root, session)
      if (!ws.root) return { ok: false, error: '无法确定工作区根', html: '' }
      const st = (state && typeof state === 'object' && state) ? state : { dirs: {}, expanded: {}, preview: null, previewError: null }
      try {
        const elPath = fields.__el && fields.__el.path ? fields.__el.path : fields.path
        if (action === 'expand' && elPath) {
          const p = safeRel(elPath)
          if (!p) return { ok: false, error: '非法路径: ' + String(elPath), html: '' }
          const willOpen = !(st.expanded || {})[p]
          st.expanded = { ...(st.expanded || {}), [p]: willOpen }
          st.dirs = st.dirs || {}
          if (willOpen && !st.dirs[p]) {
            const target = await fsService.resolve(p || '.', { cwd: ws.root })
            st.dirs[p] = sortEntries(await fsService.listDir(target))
          }
        } else if (action === 'preview' && elPath) {
          const p = safeRel(elPath)
          if (!p) return { ok: false, error: '非法路径: ' + String(elPath), html: '' }
          // state 只记路径（本体每次动作重读，保持 state 轻量）；再点同一文件 = 收起
          st.preview = st.preview && st.preview.path === p ? null : { path: p }
        } else if (action === 'close-preview') {
          st.preview = null
        } else if (action === 'refresh') {
          st.dirs = {}
          st.expanded = {}
          st.preview = null
        }
        await ensureRoot(st, ws.root)
        const rows = renderTree(st.dirs, st.expanded || {})
        const rootName = ws.root.split(/[\\/]/).filter(Boolean).pop() || '工作区'
        let previewHtml = ''
        if (st.preview && st.preview.path) {
          try {
            const pv = safeRel(st.preview.path)
            const r = pv ? await previewFile(pv, ws.root) : { error: '非法路径: ' + String(st.preview.path) }
            previewHtml = r.error
              ? '<div class="tb-banner tb-banner-info">' + esc(st.preview.path + '：' + r.error) + '</div>'
              : '<div class="tb-preview"><div class="tb-preview-head">' +
                '<span class="tb-preview-name">' + esc(st.preview.path) + '</span>' +
                '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="close-preview">关闭</button></div>' +
                '<pre class="tb-code">' + esc(r.text) + (r.truncated ? '\n…（截断，共 ' + r.total + ' 字符）' : '') + '</pre></div>'
          } catch (e) {
            previewHtml = '<div class="tb-banner tb-banner-error">预览失败: ' + esc(String((e && e.message) || e)) + '</div>'
          }
        }
        const html = '<div class="jr-tabpanel tb-root">' +
            '<div class="tb-row"><span class="tb-key" title="' + esc(ws.root) + '">' + esc(rootName) + '</span>' +
            '<button type="button" class="tb-btn tb-btn-sm" data-action="refresh">刷新</button></div>' +
            previewHtml +
            '<div class="tb-tree">' + rows + '</div>' +
            (rows ? '' : '<div class="tb-notice">空目录</div>') +
          '</div>'
        return { ok: true, html, state: { dirs: st.dirs, expanded: st.expanded, preview: st.preview } }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e), html: '' }
      }
    }

    tryRegisterTool(ctx, { id: 'files', label: '文件', order: 2, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5a1.5 1.5 0 0 1 1.5-1.5h3L8.5 6h4A1.5 1.5 0 0 1 14 7.5v3a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 10.5z"/></svg>' }, handler)
  },
}