// files 工具仿真：mock fs 服务（内存虚拟目录树）+ mock sessions，覆盖工作区解析三层语义：
// ① sessionId 优先——panel 传入的 root 已被框架替换为工具箱仓库根，必须以当前会话 cwd 为准；
// ② 显式绝对路径围栏（审计 M1）——越界路径硬报错，不静默回落；
// ③ 兜底链——无有效会话时围栏内的绝对路径可采信；另覆盖展开/预览/刷新契约。
const ROOT = require('path').resolve(__dirname, '..')
const read = (p) => require('fs').readFileSync(require('path').join(ROOT, p), 'utf8')

// ---- 内存虚拟目录树：两个工作区 + 一个「工具箱仓库根」（模拟框架 panel RPC 实际传入的 root）----
const WS = 'C:/sim/current-ws'        // 当前激活会话的 cwd（用户期望看到的工作区）
const OLD = 'C:/sim/old-ws'           // 更旧的会话 cwd（list 兜底不该选中它）
// 工具箱仓库根：真实部署里 clone 为宿主工作区的子目录（如 <ws>/dsh-flowglass），≠ 会话工作区本身
const REPO = WS + '/toolbox-repo'
const OUTSIDE = 'D:/somewhere-else'   // 围栏外目录

const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '')
const vkey = (p) => { let s = norm(p); if (/^[a-zA-Z]:/.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1); return s }
const vfs = new Map() // 目录键 → 条目[{ name, type, size, text }]
const addDir = (abs, entries) => vfs.set(vkey(abs), entries)
addDir(WS, [
  { name: 'ws-readme.md', type: 'file', size: 12, text: '# current ws\nbody' },
  { name: 'sub', type: 'directory', size: null },
])
addDir(WS + '/sub', [{ name: 'inner.txt', type: 'file', size: 6, text: 'inner!' }])
addDir(REPO, [{ name: 'repo-only.txt', type: 'file', size: 4, text: 'repo' }])
addDir(OLD, [{ name: 'old-only.txt', type: 'file', size: 4, text: 'old' }])

const fsService = {
  async resolve(rel, opts) {
    const cwd = norm((opts && opts.cwd) || '')
    if (!rel || rel === '.') return cwd
    return cwd + '/' + norm(String(rel))
  },
  async stat(t) {
    const k = vkey(t)
    for (const [dirKey, entries] of vfs) {
      for (const e of entries) {
        if ((dirKey === k && e.type === 'directory') || dirKey + '/' + e.name.toLowerCase() === k) {
          return { size: e.size == null ? undefined : e.size }
        }
      }
    }
    return null
  },
  async listDir(t) {
    const e = vfs.get(vkey(t))
    if (!e) throw new Error('ENOENT: ' + t)
    return e.map((x) => ({ name: x.name, type: x.type, size: x.size }))
  },
  async readText(t) {
    for (const [, entries] of vfs) {
      for (const e of entries) if (e.text != null && vkey(t).endsWith('/' + e.name.toLowerCase())) return e.text
    }
    throw new Error('ENOENT: ' + t)
  },
}

// 当前会话 = WS；list() 最新在前但含旧会话
const SESSIONS = {
  get(id) { return id === 'cur' ? { header: { cwd: WS } } : undefined },
  list() { return [{ header: { cwd: WS } }, { header: { cwd: OLD } }] },
}

const handlers = {}
const ctx = {
  get(name) {
    if (name === 'fs') return fsService
    if (name === 'sessions') return SESSIONS
    if (name === 'toolboxRegistry') return { register(d, h) { handlers[d.id] = h; return () => {} } }
    if (name === 'sandboxPolicy') return { workspaceRoot: WS }
    return undefined
  },
  on() {}, effect() {},
  timeout(fn, ms) { const t = setTimeout(fn, ms); t.unref && t.unref(); return () => clearTimeout(t) },
  interval(fn) { try { fn() } catch (e) {} return () => {} },
}

let failures = 0
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''))
  if (!cond) failures++
}

;(async () => {
  const src = read('shared/runtime.js') + '\n' + read('shared/host.js') + '\n' + read('plugins/files/tool.js')
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + src + '\n})()')(ctx, undefined, console)
  await plugin.apply(ctx)
  const h = handlers.files
  if (!h) { console.log('FAIL | files 未注册'); process.exit(1) }

  // ---- ① sessionId 优先：root 是框架仓库根也必须列当前会话 cwd ----
  let r = await h({ action: '', fields: {}, state: null, root: REPO, session: 'cur' })
  check('打开 → 列当前会话工作区（而非框架仓库根）', r.ok && r.html.indexOf('ws-readme.md') >= 0 && r.html.indexOf('repo-only.txt') < 0)
  check('标题显示工作区目录名', r.html.indexOf('current-ws') >= 0)

  // 展开子目录 + 预览文本文件
  r = await h({ action: 'expand', fields: { __el: { path: 'sub' } }, state: r.state, root: REPO, session: 'cur' })
  check('展开子目录列出内部条目', r.ok && r.html.indexOf('inner.txt') >= 0)
  r = await h({ action: 'preview', fields: { __el: { path: 'ws-readme.md' } }, state: r.state, root: REPO, session: 'cur' })
  check('文本预览渲染内容', r.ok && r.html.indexOf('# current ws') >= 0)

  // 刷新清空展开态/预览；根目录缓存由 ensureRoot 立即重建（只剩 '/' 一项）
  r = await h({ action: 'refresh', fields: {}, state: r.state, root: REPO, session: 'cur' })
  check('刷新 → 清空展开态/预览，仅重建根目录缓存', Object.keys(r.state.dirs).length === 1 && r.state.dirs['/'] && Object.keys(r.state.expanded).length === 0 && r.state.preview === null)

  // ---- ② 无有效会话：围栏内绝对路径兜底可采信（未知 session id 走 get 未命中）----
  r = await h({ action: '', fields: {}, state: null, root: REPO, session: 'ghost' })
  check('无效 session → 回落围栏内 rootArg（工具箱仓库）', r.ok && r.html.indexOf('repo-only.txt') >= 0)

  // ---- ③ 围栏外绝对路径 → 硬报错（M1：不枚举盘外目录）----
  r = await h({ action: '', fields: {}, state: null, root: OUTSIDE, session: 'ghost' })
  check('围栏外路径 → 拒绝并报错', !r.ok && String(r.error).indexOf('无法确定工作区根') >= 0)

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('仿真异常:', e); process.exit(2) })
