// ===== 流镜 · DSH 原生静态 Host（构建生成，勿手改） =====
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'


export const name = "dsh-flowglass"
export const inject = ["fs","sessionQuery","timer"]

const TOOLBOX_RUNTIME_OVERRIDES = {
  "mode": "static-bundle",
  "bundleId": "flow",
  "displayName": "流镜",
  "registryService": "toolboxRegistryFlow",
  "artifactService": "toolboxArtifactsFlow",
  "remoteService": "toolboxNativeFlow",
  "remoteNamespace": "toolboxNativeFlow",
  "rpcPrefix": "toolbox.flow",
  "storagePrefix": "dsh.toolbox.flow",
  "eventPrefix": "tb-flow",
  "slotPrefix": "toolbox-flow",
  "domId": "flow",
  "hostIdPrefix": "toolbox-host-flow",
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


// 静态注册表：feature 只挂载一次，handler 每次调用接收当前 root/session，适用于任意工作区。
const makeStaticRegistry = () => {
  const entries = new Map()
  return {
    register(desc, handler) {
      if (!desc || typeof desc.id !== 'string' || !desc.id || typeof handler !== 'function') return () => {}
      const entry = { id: desc.id, label: desc.label || desc.id, order: typeof desc.order === 'number' ? desc.order : 0, icon: desc.icon || null, handler }
      entries.set(desc.id, entry)
      return () => { if (entries.get(desc.id) === entry) entries.delete(desc.id) }
    },
    tools() {
      return [...entries.values()].sort((a, b) => a.order - b.order).map((x) => ({ id: x.id, label: x.label, order: x.order, icon: x.icon || null }))
    },
    async panel(root, call) {
      const toolId = call && typeof call.tool === 'string' ? call.tool : ''
      const entry = entries.get(toolId)
      if (!entry) return { ok: false, error: '工具未注册: ' + (toolId || '(空)') }
      try {
        const res = await entry.handler({
          action: call && typeof call.action === 'string' ? call.action : '',
          fields: call && call.fields && typeof call.fields === 'object' ? call.fields : {},
          state: call && call.state || null,
          root: typeof root === 'string' && root ? root : undefined,
          session: call && typeof call.session === 'string' && call.session ? call.session : undefined,
        })
        if (!res || typeof res.html !== 'string') return { ok: false, error: '工具返回了无效面板内容' }
        const out = { ok: true, html: res.html, state: res.state == null ? null : res.state }
        if (typeof res.copy === 'string' && res.copy) out.copy = res.copy
        if (res.navigateSession && typeof res.navigateSession === 'object' && typeof res.navigateSession.sessionId === 'string') {
          out.navigateSession = {
            sessionId: res.navigateSession.sessionId,
            ...(typeof res.navigateSession.parentSessionId === 'string' ? { parentSessionId: res.navigateSession.parentSessionId } : {}),
            ...(res.navigateSession.kind === 'subagent' || res.navigateSession.kind === 'session' ? { kind: res.navigateSession.kind } : {}),
          }
        }
        if (res.flowContext && typeof res.flowContext === 'object' && typeof res.flowContext.text === 'string') {
          out.flowContext = {
            text: res.flowContext.text,
            ...(typeof res.flowContext.sourceSessionId === 'string' ? { sourceSessionId: res.flowContext.sourceSessionId } : {}),
            ...(Array.isArray(res.flowContext.seqs) ? { seqs: res.flowContext.seqs.filter((v) => typeof v === 'number') } : {}),
          }
        }
        return out
      } catch (error) { return { ok: false, error: String(error && error.message || error) } }
    },
  }
}

// ===== shared-host.js：注入到每个 Host-only 工具包开头的公共辅助（make-payloads.mjs 自动拼接）=====
// HTML 转义（面板内容来自 Host 拼接，转义用户数据防止破坏结构）
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const fmtSize = (n) => {
  if (n == null) return ''
  const b = Number(n)
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}

// 幂等注册到工具箱框架：框架未启动时每 500ms 快重试；注册成功后降为 2000ms 慢心跳
// （注册表实例更换——工具箱插件重启/更新——时自动重注册）；插件停止时自动从注册表移除（Tab 级联消失）
const tryRegisterTool = (ctx, desc, handler) => {
  let off = null
  let regSeen = null
  const once = () => {
    // ctx.get 在服务重 provide 的窗口期可能 throw（isolate key 变化）——必须捕获，
    // 否则一次异常就让 interval 心跳中断，注册再也无法自愈
    let reg
    try { reg = ctx.get(TOOLBOX_RUNTIME.registryService) } catch (e) { return }
    if (!reg || typeof reg.register !== 'function') return
    if (reg === regSeen && off) return
    if (off) { try { off() } catch (e) {} off = null }
    try {
      const d = reg.register({ id: desc.id, label: desc.label, order: desc.order, icon: desc.icon || null }, handler)
      off = () => { try { d() } catch (e) {} }
      regSeen = reg
    } catch (e) {}
  }
  let ivSlow = null
  const ivFast = ctx.interval(() => {
    const had = off
    once()
    if (!had && off && !ivSlow) {
      // 刚注册成功：停快重试，改慢心跳（框架重启导致注册表实例更换时仍能自动挂上）
      try { ivFast() } catch (e) {}
      ivSlow = ctx.interval(once, 2000)
      ctx.effect(() => { if (ivSlow) ivSlow() })
    }
  }, 500)
  ctx.effect(() => ivFast)
  ctx.effect(() => () => { if (off) off() })
}
// ===== end shared-host.js =====

// ===== UTF-8 安全 Base64（纯 JS）=====
// 注意：动态 Host 求值器遮蔽 Node 特有全局（Buffer/process 不可用），base64 必须自带实现。
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const b64encode = (str) => {
  const s = String(str == null ? '' : str)
  const bytes = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const cp = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00)
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]
    out += B64_CHARS[a >> 2] + B64_CHARS[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)]
    out += b === undefined ? '=' : B64_CHARS[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)]
    out += c === undefined ? '=' : B64_CHARS[c & 63]
  }
  return out
}
const b64decode = (input) => {
  const s = String(input == null ? '' : input).replace(/[^A-Za-z0-9+/=]/g, '')
  const bytes = []
  for (let i = 0; i < s.length; i += 4) {
    const n0 = B64_CHARS.indexOf(s[i]), n1 = B64_CHARS.indexOf(s[i + 1])
    const n2 = s[i + 2] === '=' || s[i + 2] === undefined ? 0 : B64_CHARS.indexOf(s[i + 2])
    const n3 = s[i + 3] === '=' || s[i + 3] === undefined ? 0 : B64_CHARS.indexOf(s[i + 3])
    const v = (n0 << 18) | (n1 << 12) | (n2 << 6) | n3
    bytes.push((v >> 16) & 255)
    if (s[i + 2] !== '=' && s[i + 2] !== undefined) bytes.push((v >> 8) & 255)
    if (s[i + 3] !== '=' && s[i + 3] !== undefined) bytes.push(v & 255)
  }
  let out = ''
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]
    if (b < 0x80) { out += String.fromCharCode(b); i += 1 }
    else if (b < 0xe0) { out += String.fromCharCode(((b & 31) << 6) | (bytes[i + 1] & 63)); i += 2 }
    else if (b < 0xf0) { out += String.fromCharCode(((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)); i += 3 }
    else {
      const cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63)
      const u = cp - 0x10000
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023)); i += 4
    }
  }
  return out
}

// ===== 会话日志读取（带缓存；日志只追加 ⇒ count 不变即命中）=====
// 活会话读内存快照（零 IO）；兼容 alpha.2 的 events 与 alpha.4 的
// seq/snapshotEvents；持久化会话增量 readFrom，失败回退全量 readSession。
// 返回 { events, header, count, changed }；changed=false 时上层可复用已构建的模型。
// 用法：const readLog = makeSessionLogReader(ctx, ctx.get('sessionQuery'))
const makeSessionLogReader = (ctx, sq) => {
  let cache = null // { sid, count, events, header }
  return async (sid) => {
    const sessionsSvc = ctx.get('sessions')
    if (sessionsSvc) {
      try {
        const live = sessionsSvc.get(sid)
        // DSH alpha.4 made Session.events private. seq is the log length, so
        // unchanged live sessions avoid materializing another snapshot.
        if (live && typeof live.snapshotEvents === 'function') {
          const seq = typeof live.seq === 'number' && Number.isSafeInteger(live.seq) ? live.seq : null
          if (seq != null && cache && cache.sid === sid && cache.count === seq) {
            return { events: cache.events, header: cache.header, count: cache.count, changed: false }
          }
          const events = live.snapshotEvents()
          if (Array.isArray(events)) {
            const count = events.length
            const hit = cache && cache.sid === sid && cache.count === count
            if (!hit) cache = { sid, count, events, header: live.header }
            return { events: cache.events, header: cache.header, count: cache.count, changed: !hit }
          }
        }
        // DSH alpha.2 compatibility: Session.events was public then.
        if (live && live.events && typeof live.events.length === 'number') {
          const hit = cache && cache.sid === sid && cache.count === live.events.length
          if (!hit) cache = { sid, count: live.events.length, events: live.events, header: live.header }
          return { events: cache.events, header: cache.header, count: cache.count, changed: !hit }
        }
      } catch (e) {}
    }
    const sp2 = ctx.get('sessionPersistence')
    if (sp2 && cache && cache.sid === sid && cache.events) {
      try {
        const inc = await sp2.readFrom(sid, cache.count)
        const add = (inc && inc.events) || []
        if (add.length === 0) return { events: cache.events, header: cache.header, count: cache.count, changed: false }
        cache = { sid, count: cache.count + add.length, events: cache.events.concat(add), header: (inc && inc.meta) || cache.header }
        return { events: cache.events, header: cache.header, count: cache.count, changed: true }
      } catch (e) {}
    }
    const snap = await sq.readSession(sid)
    const events = (snap && snap.events) || []
    const header = (snap && snap.session) || null
    const hit = cache && cache.sid === sid && cache.count === events.length
    if (!hit) cache = { sid, count: events.length, events, header }
    return { events: cache.events, header: cache.header, count: cache.count, changed: !hit }
  }
}

// ===== 仓库根发现（clone 部署关键）：工具箱数据/产物一律归属「本仓库根」，而非会话 cwd =====
// 场景：本仓库被 clone 到别的项目根目录下当子目录（如 D:\\other\\dsh-dynamic-toolbox\\），
// DSH 在宿主项目根运行——会话 cwd / workspaceRoot 都是宿主项目，若按会话 cwd 落盘会污染宿主。
// 这里先直下找 plugins.json，找不到再扫一级子目录（plugins.json 在子目录里即为本仓库）。
// 数据目录名由仓库根的 toolbox.config.json 配置（dataDir，默认 .dsh-dynamic-toolbox）。
let _repoCache = null // 进程内缓存（仓库位置运行期不变）
const findRepoRoot = async (ctx) => {
  // 原生安装包适用于任意工作区，不把源码仓库 plugins.json 当部署标记。
  if (typeof TOOLBOX_RUNTIME !== 'undefined' && TOOLBOX_RUNTIME.mode === 'static-bundle') return null
  if (_repoCache) return _repoCache
  const fsService = ctx.get('fs')
  if (!fsService) return null
  const roots = []
  const sp = ctx.get('sandboxPolicy')
  if (sp && typeof sp.workspaceRoot === 'string' && sp.workspaceRoot) roots.push(sp.workspaceRoot)
  const ss = ctx.get('sessions')
  if (ss) { try { for (const s of ss.list()) { const c = s && s.header && s.header.cwd; if (typeof c === 'string' && c && roots.indexOf(c) < 0) roots.push(c) } } catch (e) {} }
  // 命中校验（MiMo M1）：光「存在 plugins.json」不够（无关项目/无关 clone 子目录也可能有），
  // 必须解析出清单且含 id:'toolbox' 条目——这是本仓库的强标记，杜绝误判锁定错误仓库根。
  const hasManifest = async (dir) => {
    try {
      const t = await fsService.resolve('plugins.json', { cwd: dir })
      if (!await fsService.stat(t)) return null
      const parsed = JSON.parse(await fsService.readText(t))
      if (!parsed || !Array.isArray(parsed.plugins)) return null
      if (!parsed.plugins.some((e) => e && e.id === 'toolbox')) return null
      return dir.replace(/[\\/]+$/, '')
    } catch (e) { return null }
  }
  for (const root of roots) {
    const hit = await hasManifest(root)
    if (hit) { _repoCache = hit; return hit }
  }
  for (const root of roots) {
    try {
      const dt = await fsService.resolve('.', { cwd: root })
      const entries = await fsService.listDir(dt)
      for (const ent of entries || []) {
        if (!ent || ent.type !== 'directory' || !ent.name) continue
        if (ent.name.charAt(0) === '.' || ent.name === 'node_modules') continue
        const sub = root.replace(/[\\/]+$/, '') + '/' + ent.name
        const hit = await hasManifest(sub)
        if (hit) { _repoCache = hit; return hit }
      }
    } catch (e) {}
  }
  return null
}
// 数据目录名：读仓库根 toolbox.config.json 的 dataDir（默认 .dsh-dynamic-toolbox）
let _dataDirCache = null
const repoDataDir = async (ctx) => {
  if (_dataDirCache) return _dataDirCache
  let dir = '.dsh-dynamic-toolbox'
  const fsService = ctx.get('fs')
  const repoRoot = await findRepoRoot(ctx)
  if (fsService && repoRoot) {
    try {
      const cf = await fsService.resolve('toolbox.config.json', { cwd: repoRoot })
      if (await fsService.stat(cf)) {
        const cfg = JSON.parse(await fsService.readText(cf))
        if (cfg && typeof cfg.dataDir === 'string' && /^[A-Za-z0-9._-]+$/.test(cfg.dataDir)) dir = cfg.dataDir
      }
    } catch (e) {}
  }
  _dataDirCache = dir
  return dir
}

// ===== 工作区记录持久化（<仓库根>/<dataDir>/<file>，纯 JSON）=====
// 约定：凡持有「记录/历史」的工具一律落盘仓库根（clone 部署时也不污染宿主项目），面板 state 只做镜像。
// 写策略：有会话按会话 resolve（cwd 即可写边界）；无会话显式 workspace-write@仓库根 ——
// 绝不回落部署默认策略（其可写根是宿主进程 cwd，写工作区会被 FS_SANDBOX_DENIED 拒绝）。
const storePolicy = (ctx, wsRoot, session) => {
  const sp = ctx.get('sandboxPolicy')
  if (sp && session) return sp.resolve({ session })
  return { mode: 'workspace-write', workspaceRoot: wsRoot }
}
const ensureStoreDir = async (ctx, wsRoot) => {
  const subprocess = ctx.get('subprocess')
  if (!subprocess || !wsRoot) return
  try {
    const handle = subprocess.spawn({
      argv: ['node', '-e', "require('fs').mkdirSync(process.argv[1], { recursive: true })", await repoDataDir(ctx)],
      cwd: wsRoot,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
      graceMs: 15000,
    })
    await handle.done
  } catch (e) {}
}
// 数据落盘根：优先仓库根（findRepoRoot），其次调用方给的 wsRoot（向后兼容/兜底）
const storeBase = async (ctx, wsRoot) => {
  const repo = await findRepoRoot(ctx)
  return repo || wsRoot
}
// 数据目录名映射：rel 里的 .dsh-dynamic-toolbox 前缀换成配置的 dataDir（支持自定义目录名）
const mapDataRel = async (ctx, rel) => {
  const dir = await repoDataDir(ctx)
  if (dir === '.dsh-dynamic-toolbox') return rel
  return String(rel).replace(/^\.dsh-dynamic-toolbox/, dir)
}
const readJsonStore = async (ctx, rel, wsRoot, fallback) => {
  const fsService = ctx.get('fs')
  const base = await storeBase(ctx, wsRoot)
  if (!fsService || !base) return fallback
  let target = null
  try {
    target = await fsService.resolve(await mapDataRel(ctx, rel), { cwd: base })
    if (!await fsService.stat(target)) return fallback
  } catch (e) { return fallback } // resolve/stat IO 失败：不动原文件，按缺省处理
  let raw = null
  try { raw = await fsService.readText(target) } catch (e) { return fallback }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    // 解析失败（半截写/手工改坏）：先把原文隔离为 .corrupt-<时间戳> 备份再返回 fallback，
    // 阻断「损坏 → 显示空 → 下次成功写入覆盖销毁现场」的静默丢历史链条（best-effort）
    try {
      await fsService.writeText(target + '.corrupt-' + Date.now(), String(raw == null ? '' : raw), undefined, undefined, { mode: 'workspace-write', workspaceRoot: base })
      console.warn('readJsonStore: JSON 解析失败，原文已隔离备份 (' + rel + ')')
    } catch (e2) {
      console.warn('readJsonStore: JSON 解析失败且隔离备份未成功 (' + rel + ')')
    }
    return fallback
  }
  return parsed == null ? fallback : parsed
}
const writeJsonStore = async (ctx, rel, data, wsRoot, session) => {
  const fsService = ctx.get('fs')
  const base = await storeBase(ctx, wsRoot)
  if (!fsService || !base) return false
  try {
    await ensureStoreDir(ctx, base)
    const target = await fsService.resolve(await mapDataRel(ctx, rel), { cwd: base })
    await fsService.writeText(target, JSON.stringify(data, null, 2), undefined, undefined, storePolicy(ctx, base, session))
    return true
  } catch (e) {
    console.error('store 持久化失败 (' + rel + '):', String((e && e.message) || e))
    return false
  }
}

// ===== 工作区解析（AI 类工具共享；等价于各工具曾各自实现的 resolveWs）=====
// 优先按会话 cwd，其次动作透传的 root，最后沙箱工作区根；返回 { root, session }
const resolveWorkspace = (ctx, rootArg, sessionId) => {
  const sessionsSvc = ctx.get('sessions')
  if (sessionId && sessionsSvc) {
    try {
      const s = sessionsSvc.get(sessionId)
      const cwd = s && s.header && s.header.cwd
      if (s && typeof cwd === 'string' && cwd) return { root: cwd.replace(/[\\/]+$/, ''), session: s }
    } catch (e) {}
  }
  if (rootArg && /^([A-Za-z]:[\\/]|\/)/.test(rootArg)) return { root: rootArg.replace(/[\\/]+$/, ''), session: null }
  const sp = ctx.get('sandboxPolicy')
  const root = sp && typeof sp.workspaceRoot === 'string' ? sp.workspaceRoot.replace(/[\\/]+$/, '') : ''
  return { root, session: null }
}

// ===== LLM 路由与调用（AI 类工具共享；llm/agentDefaultModel 缺失时优雅降级）=====
// const ai = makeLlmHelper(ctx)
//   await ai.resolveRoute(st)          // 规范化 st.provider/st.model，返回 { providers, models }（模型按 provider 缓存）
//   await ai.chat(st, system, user, timeoutMs?, track?)  // { a, ms, out, route } | { err, ms, route }；120s 超时守卫
//     track = { root, session, tool }：调用结果异步追加进用量台账 .dsh-dynamic-toolbox/toolbox-ai-usage.json（cap 100，不阻塞响应）
//   await ai.rollup(root, tool)        // 台账中该工具的累计 { calls, out }（仅统计成功调用）
//   ai.routeRow(st, route, note)       // provider/model 双下拉 HTML（provider 切换走 data-action-onchange="route"）
// 注意：system 并入首条 user 消息文本（GenerateOptions 的 system 角色 source 契约未公开，此形态与 ask 一致、最稳）。
const AI_USAGE_REL = '.dsh-dynamic-toolbox/toolbox-ai-usage.json'
// ===== 用量台账写锁：per-root promise 链串行化所有对 toolbox-ai-usage.json 的读-改-写 =====
// 背景：chat 的 track 是响应后异步追加，compare 多模型并发时多个 RMW 同帧起跑会互相整文件覆盖丢记录；
// 「清空台账」也必须经同一把锁，避免清空写入 [] 后被在途追加的旧快照复活。fn 内部自行容错。
const _aiUsageWriteChains = new Map()
const enqueueAiUsageWrite = (root, fn) => {
  const key = String(root || '?')
  const prev = _aiUsageWriteChains.get(key) || Promise.resolve()
  const run = prev.then(fn, fn) // 前序失败不阻塞后续
  // 链上只存「已消化异常」的 promise，保证队列永不带毒；调用方拿 run 自行处理结果
  _aiUsageWriteChains.set(key, run.then(() => undefined, () => undefined))
  return run
}
const makeLlmHelper = (ctx) => {
  const llm = ctx.get('llm')
  const adm = ctx.get('agentDefaultModel')
  const modelsCache = {} // provider -> LlmModelInfo[]
  // provider 拓扑变化（适配器注册/注销）时清空缓存，避免模型清单陈旧（ctx.on 随插件停止自动清理）
  try { ctx.on('llm/adapters-updated', () => { for (const k of Object.keys(modelsCache)) delete modelsCache[k] }) } catch (e) {}

  const listProviders = async () => {
    if (!llm) return []
    try { return (await llm.listProviders()) || [] } catch (e) { return [] }
  }
  const listModels = async (provider) => {
    if (!llm || !provider) return []
    if (modelsCache[provider]) return modelsCache[provider]
    let list = []
    try { list = (await llm.listModels(provider)) || [] } catch (e) {}
    modelsCache[provider] = list
    return list
  }
  // 路由解析：state 选择 → 当前会话默认 → 第一个 provider 的第一个模型；
  // provider 与 model 不匹配时（切换了 provider）回退该 provider 的首个模型
  const resolveRoute = async (st) => {
    const providers = await listProviders()
    if (!providers.length) return { providers: [], models: [] }
    let def = null
    if (adm) {
      try {
        const s = adm.currentSelection && adm.currentSelection()
        if (s && s.provider && s.model) def = s
      } catch (e) {}
    }
    if (!st.provider || !providers.some((p) => p.id === st.provider)) {
      st.provider = def && providers.some((p) => p.id === def.provider) ? def.provider : providers[0].id
      st.model = ''
    }
    const models = await listModels(st.provider)
    if (!st.model || !models.some((m) => m.id === st.model)) {
      st.model = def && def.provider === st.provider && models.some((m) => m.id === def.model)
        ? def.model
        : (models.length ? models[0].id : '')
    }
    return { providers, models }
  }
  const chat = async (st, system, user, timeoutMs, track) => {
    if (!llm) return { err: 'llm 服务不可用' }
    if (!st.provider || !st.model) return { err: '未选择模型路由' }
    const Ctrl = typeof AbortController !== 'undefined' ? AbortController : null
    const ctrl = Ctrl ? new Ctrl() : null
    const cancel = ctrl ? ctx.timeout(() => ctrl.abort(), timeoutMs || 120000) : null
    const t0 = Date.now()
    let text = ''
    let usage = null
    let result
    try {
      const stream = llm.stream({
        provider: st.provider,
        model: st.model,
        messages: [{
          id: 'ai-' + t0,
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'text', text: (system ? String(system) + '\n\n' : '') + String(user == null ? '' : user) }],
        }],
        signal: ctrl ? ctrl.signal : undefined,
      })
      for await (const ch of stream) {
        if (!ch) continue
        if (ch.type === 'text-delta') text += ch.text
        else if (ch.type === 'usage') usage = ch.usage
      }
      result = { a: text, ms: Date.now() - t0, out: usage ? usage.outputTokens : null, route: st.provider + '/' + st.model }
    } catch (e) {
      result = { err: String((e && e.message) || e), ms: Date.now() - t0, route: st.provider + '/' + st.model }
    } finally {
      if (cancel) { try { cancel() } catch (e) {} }
    }
    // 用量台账：异步落盘（ensureStoreDir 会起子进程，绝不能阻塞响应）；
    // 经 per-root 写锁 enqueueAiUsageWrite 串行化，与并发调用/「清空台账」互斥，消除读-改-写丢更新
    if (track && track.root) {
      const rec = { t: t0, tool: String(track.tool || '?'), out: result.out != null ? result.out : null, ms: result.ms || 0, ok: !result.err }
      ;(async () => {
        try {
          await enqueueAiUsageWrite(track.root, async () => {
            const cur = await readJsonStore(ctx, AI_USAGE_REL, track.root, [])
            await writeJsonStore(ctx, AI_USAGE_REL, (Array.isArray(cur) ? cur : []).concat([rec]).slice(-100), track.root, track.session)
          })
        } catch (e) {}
      })()
    }
    return result
  }
  const rollup = async (root, tool) => {
    if (!root) return null
    const cur = await readJsonStore(ctx, AI_USAGE_REL, root, [])
    if (!Array.isArray(cur)) return null
    let calls = 0
    let out = 0
    for (const r of cur) {
      if (r && r.tool === tool && r.ok) { calls++; if (typeof r.out === 'number') out += r.out }
    }
    return { calls, out }
  }
  const routeRow = (st, route, note) =>
    '<div class="tb-row">' +
      '<select class="tb-select" data-field="provider" data-action-onchange="route" title="Provider（切换后自动刷新模型列表）">' +
        route.providers.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === st.provider ? ' selected' : '') + '>' + esc(p.name || p.id) + '</option>').join('') +
      '</select>' +
      '<select class="tb-select tb-mono" data-field="model" title="模型" style="max-width:220px">' +
        route.models.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === st.model ? ' selected' : '') + '>' + esc(m.name || m.id) + '</option>').join('') +
      '</select>' +
      (note ? '<span class="tb-note">' + esc(note) + '</span>' : '') +
    '</div>'
  return { available: Boolean(llm), listProviders, listModels, resolveRoute, chat, rollup, routeRow }
}

// ===== 内容产物目录约定：<仓库根>/<dataDir>/data/<插件key>/ =====
// 与 <dataDir>（工具内部 JSON 状态）分家：这里放人会直接打开的内容产物（Jira 附件、导出件等）。
// 点号目录与仓库 .git 同族、不污染根目录观感；所有插件产物收一处，.gitignore 只需一行 <dataDir>/data/。
// 注：目录名随 toolbox.config.json 的 dataDir；调用方用 resolveDataPath(ctx, rel, wsRoot) 解析绝对路径。
const TOOLBOX_DATA_DIR = '.dsh-dynamic-toolbox/data'
const pluginDataDir = (key) => TOOLBOX_DATA_DIR + '/' + key
// 数据/产物相对路径 → 绝对路径：走仓库根 + 配置的 dataDir（clone 部署归属本仓库，不污染宿主）
const resolveDataPath = async (ctx, rel, wsRoot) => {
  const fsService = ctx.get('fs')
  const base = await storeBase(ctx, wsRoot)
  if (!fsService || !base) return null
  return fsService.resolve(await mapDataRel(ctx, rel), { cwd: base })
}
// 同上的纯字符串绝对路径版（供子进程 argv/env 使用，它们拿不到 FsTarget）
const dataPathAbs = async (ctx, rel, wsRoot) => {
  const base = await storeBase(ctx, wsRoot)
  if (!base) return ''
  return base.replace(/[\\/]+$/, '') + '/' + (await mapDataRel(ctx, rel))
}

// ===== 清单查找（plugins.json，仓库根）：根探测与桩一致（直下 + 一级子目录扫描）=====
// 返回 { manifest, root } 或 null。供需要读清单元数据的工具用（如轨迹工具按条目 modelTools
// 把插件注册的模型工具归「插件」——沙箱内 ctx.tools.get 被刻意降级为 schema 视图，清单是事实源）。
const findManifest = async (ctx) => {
  const fs = ctx.get('fs')
  if (!fs) return null
  const root = await findRepoRoot(ctx)
  if (!root) return null
  try {
    const t = await fs.resolve('plugins.json', { cwd: root })
    if (await fs.stat(t)) return { manifest: JSON.parse(await fs.readText(t)), root }
  } catch (e) {}
  return null
}

// ===== 子进程 wall-clock 看门狗 =====
// spawn 的 graceMs 只是「退出后 SIGTERM→SIGKILL 升级窗口 + 管道排空延迟」，不是运行时长上限；
// 裸 await handle.done 遇到 git 凭证 GUI 弹窗/网络盘锁文件会永久挂起。withDeadline 在 ms 到点时
// 主动 terminate()，done settle（含被杀后的非零退出）后清计时器。用法：
//   const h = withDeadline(ctx, sub.spawn({...}), 60000)
//   const outcome = await h.done
// 超时路径 outcome 为被终止的非零结果；调用方照常读 collected，必要时按 exitCode 区分提示。
const withDeadline = (ctx, handle, ms) => {
  let cancel = null
  try {
    cancel = ctx.timeout(() => {
      try { handle.terminate() } catch (e) {}
    }, ms)
  } catch (e) { /* timer 服务不可用：退化为无看门狗（与旧行为一致） */ }
  if (cancel && handle && handle.done && typeof handle.done.then === 'function') {
    handle.done.then(() => { try { cancel() } catch (e) {} }, () => { try { cancel() } catch (e) {} })
  }
  return handle
}


// Compatibility seam for features shared with dynamic mode. In a static
// bundle harness.handle is backed by native Remote methods, while model tools
// are registered directly against DSH's tools service.
const nativeBridgeHandlers = new Map()
const callNativeBridge = async (name, request) => {
  const handler = nativeBridgeHandlers.get(name)
  if (!handler) return { ok: false, error: '原生 RPC 未注册: ' + name }
  return await handler(request)
}
const harness = {
  handle(name, handler) {
    if (typeof name !== 'string' || !name || typeof handler !== 'function') return () => {}
    nativeBridgeHandlers.set(name, handler)
    return () => { if (nativeBridgeHandlers.get(name) === handler) nativeBridgeHandlers.delete(name) }
  },
  defineTool(tool) { return tool },
  registerTool() { throw new Error('当前静态合集未启用模型工具服务') },
}

const create_flow = () => {
// ===== flow-tool.js：实时流镜（Host-only，经工具箱 RPC 注册）=====
// 当前 session 在干什么 → 自上而下不断加载的流程图（与「轨迹」工具互补：轨迹是过滤时间线，流程图是形态视图）。
// 形态约定（用户定制）：
//   · 主 session：自上而下箭头串联 用户消息 → 助手 → 工具组 → 助手 …（最新在底部，滚动条贴底跟随）
//   · 子代理（subagent/workflow/ralph）：git 树形式——从主干 ├─ 分出支线，支线内实时展示子会话事件流，╰─ 合并回主干
//   · 插件/技能/MCP/命令/文件 等普通工具调用：同一步骤内的多个调用 → 平行卡片并排（调用并返回成组）
// 实时：面板根带 data-autorefresh="2000"，框架抽屉每 2s 静默重拉（live 开关可暂停）。
// 钻取：点子代理分支「进入 →」切换到该子会话的流程图（当前会话压 crumbs 栈，「← 返回」逐级退回）。
// 数据源（DSH 0.1.5 统一折叠器，同一 parseItems 供两条来源）：
//   · 当前会话实时：Client 订阅 Session Controller 事件窗（ctx.sessions.binding(sid).eventSource），
//     把瞬时 assistant/live-chunk 折叠成 attempt 快照随面板 RPC 传入（live 叠加层）；结算由事件窗
//     settle-assistant 自动去重，Client 只附最近结算 attempt 的 firstSeq 供 UI 连续性。
//   · 冷会话/跨会话/子代理钻取：Host sessionQuery（makeSessionLogReader 缓存）读持久事件，
//     assistant/message 与 assistant/attempt 的内嵌 stream 记录被精确重放出同样的卡片。
//   · 旧 assistant/chunk 协议（0.1.2）不再被解析——0.1.5 日志不含该事件。
// 状态：{ live, follow, limit, sid, home, expanded, crumbs }（轻量标量；事件本体与流程模型每次动作重建，不进 state）

return {
  name: 'flow-tool',
  inject: ['fs', 'sessionQuery', 'timer'],
  apply(ctx) {
    const sq = ctx.get('sessionQuery')
    const fs = ctx.get('fs')

    // ---- 会话日志读取缓存（主会话 + 每个子代理会话各一个读取器，避免缓存抖动）----
    const readers = {}
    const growth = {} // sid → 上次渲染的日志条数：本轮条数增长 = 会话活跃（助手卡流光判定用）
    const readLog = async (sid) => {
      if (!sq) return { events: [], count: 0 }
      if (!readers[sid]) readers[sid] = makeSessionLogReader(ctx, sq)
      try { return await readers[sid](sid) } catch (e) { return { events: [], count: 0 } }
    }

    // ---- 工具分类（与 trace 工具同口径：真实清单优先，名字启发式兜底）----
    let manifestTools = null
    const loadManifestTools = async () => {
      if (manifestTools) return
      manifestTools = []
      try {
        const found = await findManifest(ctx)
        const list = found && found.manifest && Array.isArray(found.manifest.plugins) ? found.manifest.plugins : []
        for (const e of list) {
          if (e && Array.isArray(e.modelTools)) {
            for (const n of e.modelTools) if (typeof n === 'string' && n) manifestTools.push(n)
          }
        }
      } catch (e) {}
    }
    const RE_SKILL = /^skill$/
    const RE_MCP = /mcp/i
    const RE_SUBAGENT = /^(subagent|subagent_fork|send_message|workflow|ralph)$/
    const RE_SHELL = /^(pwsh|bash|sh|terminal_(open|send|read|close|list|signal)|run_code)$/
    const RE_FILE = /^(read|write|edit|glob|grep|read_image)$/
    const kindOf = (name) => {
      if (/^cordis_/.test(name)) return 'cordis'
      if (/^ssh_/.test(name)) return 'cordis'
      if (manifestTools && manifestTools.indexOf(name) >= 0) return 'cordis'
      if (RE_SKILL.test(name)) return 'skill'
      if (RE_MCP.test(name)) return 'mcp'
      if (RE_SUBAGENT.test(name)) return 'subagent'
      if (RE_SHELL.test(name)) return 'shell'
      if (RE_FILE.test(name)) return 'file'
      return 'builtin'
    }
    const KIND_META = {
      skill: { label: '技能', color: '#7fa7f0', bg: 'rgba(91,141,239,.12)' },
      cordis: { label: '插件', color: '#d4b95c', bg: 'rgba(212,167,44,.10)' },
      mcp: { label: 'MCP', color: '#81c784', bg: 'rgba(102,187,106,.10)' },
      shell: { label: '命令', color: '#d4b95c', bg: 'rgba(212,167,44,.08)' },
      file: { label: '文件', color: '#7fa7f0', bg: 'rgba(91,141,239,.10)' },
      builtin: { label: '内置', color: '#9a9ba6', bg: 'rgba(138,139,150,.10)' },
    }

    // ---- 声明式工具显示规则 ----
    // 规则只投影卡片标题/徽章，不改日志中的工具名、参数或结果。Client 以 localStorage
    // 为事实源并在每次 panel 请求中携带 JSON；Host 在使用前收窄，未知字段一律忽略。
    const MAX_PRESENTATION_RULES = 24
    const textField = (value, name, max) => {
      if (typeof value !== 'string' || !value.trim()) throw new Error('显示规则缺少 ' + name)
      const out = value.trim()
      if (out.length > max) throw new Error('显示规则的 ' + name + ' 最长 ' + max + ' 字符')
      return out
    }
    const optionalTextField = (value, name, max) => {
      if (value == null || value === '') return ''
      return textField(value, name, max)
    }
    const stringList = (value, name, maxItems, maxLength, required) => {
      if (value == null && !required) return []
      if (!Array.isArray(value) || (required && value.length === 0) || value.length > maxItems) {
        throw new Error('显示规则的 ' + name + ' 必须是 1–' + maxItems + ' 项字符串数组')
      }
      const out = []
      for (const item of value) {
        const s = textField(item, name, maxLength)
        if (!out.includes(s)) out.push(s)
      }
      return out
    }
    const normalizePresentationRules = (raw) => {
      let value = raw
      if (typeof value === 'string') {
        if (value.length > 16000) throw new Error('显示规则 JSON 不能超过 16000 字符')
        try { value = JSON.parse(value || '[]') } catch (e) { throw new Error('显示规则不是有效 JSON') }
      }
      if (!Array.isArray(value) || value.length > MAX_PRESENTATION_RULES) {
        throw new Error('显示规则必须是数组，最多 ' + MAX_PRESENTATION_RULES + ' 条')
      }
      return value.map((rule, index) => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('第 ' + (index + 1) + ' 条显示规则必须是对象')
        const color = rule.color == null || rule.color === '' ? '#81c784' : textField(rule.color, 'color', 7)
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('第 ' + (index + 1) + ' 条显示规则的 color 必须是 #RRGGBB')
        return {
          enabled: rule.enabled !== false,
          tools: stringList(rule.tools, 'tools', 8, 64, true),
          executables: stringList(rule.executables, 'executables', 12, 128, true),
          displayName: optionalTextField(rule.displayName, 'displayName', 80),
          actions: stringList(rule.actions, 'actions', 32, 64, false),
          badge: optionalTextField(rule.badge, 'badge', 12),
          color: color.toLowerCase(),
        }
      })
    }
    const commandTokens = (command) => String(command || '').match(/"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+/g) || []
    const cleanToken = (token) => String(token || '').replace(/^[&'"(]+|['"),;]+$/g, '')
    const tokenBasename = (token) => {
      const clean = cleanToken(token).replace(/[\\/]+$/, '')
      const parts = clean.split(/[\\/]/)
      return (parts[parts.length - 1] || '').toLowerCase()
    }
    const commandOf = (call) => {
      try {
        const args = JSON.parse(call.argsRaw || '{}')
        return typeof args.command === 'string' ? args.command : ''
      } catch (e) { return '' }
    }
    const displayIdentity = (call, rules) => {
      const fallback = { name: call.name, meta: KIND_META[call.cat] || KIND_META.builtin }
      if (!Array.isArray(rules) || !rules.length) return fallback
      const command = commandOf(call)
      if (!command) return fallback
      const tokens = commandTokens(command)
      for (const rule of rules) {
        if (!rule.enabled || !rule.tools.includes(call.name)) continue
        const wanted = rule.executables.map((value) => tokenBasename(value))
        const at = tokens.findIndex((token) => wanted.includes(tokenBasename(token)))
        if (at < 0) continue
        const action = cleanToken(tokens[at + 1] || '')
        if (rule.actions.length && !rule.actions.includes(action)) continue
        return {
          name: [rule.displayName, action].filter(Boolean).join(' '),
          meta: { label: rule.badge, color: rule.color, bg: rule.color + '1f' },
        }
      }
      return fallback
    }

    const pad2 = (n) => (n < 10 ? '0' : '') + n
    const fmtTime = (t) => {
      const d = new Date(t)
      if (isNaN(d.getTime())) return '' // 注入类事件可能缺 time 字段，防空值渲染出 NaN:NaN:NaN
      return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
    }
    const fmtDur = (ms) => ms == null ? '' : (ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's')
    const oneLine = (s, max) => {
      const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
      return t.length > max ? t.slice(0, max - 1) + '…' : t
    }
    const textOf = (blocks) => {
      if (!Array.isArray(blocks)) return ''
      return blocks.map((b) => (b && b.type === 'text' ? b.text : '')).filter(Boolean).join('\n')
    }

    // ---- 0.1.5 统一流折叠器（同一逻辑供实时叠加层与持久事件两条来源）----
    // AssistantStreamRecord[]（assistant/message / assistant/attempt 内嵌的紧凑流记录）
    // → [{ time, chunk }] 精确重放；text-chunks/reasoning-chunks/tool-call-chunks 的
    // time0+dt[] 前缀和还原每个 delta 的原始时间戳，'chunk' 记录原样透传。
    const expandStreamRecords = (stream) => {
      const out = []
      if (!Array.isArray(stream)) return out
      for (const rec of stream) {
        if (!rec || typeof rec !== 'object') continue
        if (rec.type === 'chunk') {
          if (rec.chunk && typeof rec.chunk === 'object') out.push({ time: rec.time, chunk: rec.chunk })
        } else if (rec.type === 'text-chunks' || rec.type === 'reasoning-chunks') {
          const texts = Array.isArray(rec.texts) ? rec.texts : []
          let t = typeof rec.time0 === 'number' ? rec.time0 : 0
          for (let i = 0; i < texts.length; i++) {
            if (i > 0 && Array.isArray(rec.dt)) t += typeof rec.dt[i - 1] === 'number' ? rec.dt[i - 1] : 0
            out.push({ time: t, chunk: { type: rec.type === 'text-chunks' ? 'text-delta' : 'reasoning-delta', index: rec.index, text: String(texts[i]) } })
          }
        } else if (rec.type === 'tool-call-chunks') {
          const args = Array.isArray(rec.args) ? rec.args : []
          let t = typeof rec.time0 === 'number' ? rec.time0 : 0
          for (let i = 0; i < args.length; i++) {
            if (i > 0 && Array.isArray(rec.dt)) t += typeof rec.dt[i - 1] === 'number' ? rec.dt[i - 1] : 0
            out.push({ time: t, chunk: { type: 'tool-call-delta', index: rec.index, id: rec.id, name: rec.name, argumentsDelta: String(args[i]) } })
          }
        }
      }
      return out
    }

    // 一个 attempt 的累计状态：assistant/live-chunk 瞬时累计与持久 stream 重放共用同一形状。
    // attemptId 是实时节点身份（assistant-attempt:<id>）；seq（浮点或整数）只用于排序与 UI 定位。
    const makeAttemptState = (attemptId, turn, step) => ({
      attemptId: String(attemptId || ''), turn, step,
      firstSeq: null, firstAt: null, lastAt: null,
      text: '', reasoning: '', toolCall: false,
      finishKind: '', failCode: '', failMsg: '', usage: null,
    })
    const applyChunkToAttempt = (a, time, chunk) => {
      if (a.firstAt == null) a.firstAt = time
      a.lastAt = time
      if (!chunk || typeof chunk !== 'object') return
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') a.text += chunk.text
      else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') a.reasoning += chunk.text
      else if (chunk.type === 'tool-call-delta') a.toolCall = true
      else if (chunk.type === 'usage' && chunk.usage) a.usage = chunk.usage
      else if (chunk.type === 'finish' && chunk.reason) {
        a.finishKind = String(chunk.reason.kind || '')
        const f = chunk.reason.failure
        if (f && typeof f === 'object') {
          a.failCode = typeof f.code === 'string' ? f.code : ''
          a.failMsg = typeof f.message === 'string' ? f.message : ''
        }
      }
    }
    // Client 叠加层传入的 attempt 快照（eventSource 瞬时条目在 Client 预折叠）→ 同一 attempt 状态
    const attemptFromSnapshot = (snap) => {
      const a = makeAttemptState(
        snap && snap.attemptId,
        snap && typeof snap.turn === 'number' ? snap.turn : null,
        snap && typeof snap.step === 'number' ? snap.step : null,
      )
      if (!snap) return a
      a.firstSeq = typeof snap.firstSeq === 'number' ? snap.firstSeq : null
      a.firstAt = typeof snap.firstAt === 'number' ? snap.firstAt : null
      a.lastAt = typeof snap.lastAt === 'number' ? snap.lastAt : a.firstAt
      // Remote JSON is a trust boundary. The Client normally applies the same
      // cap, but a stale or modified caller must not make the Host render an
      // unbounded live overlay.
      a.text = String(snap.text || '').slice(0, 8000)
      a.reasoning = String(snap.reasoning || '').slice(0, 8000)
      a.toolCall = Boolean(snap.toolCall)
      if (snap.finish && typeof snap.finish === 'object') {
        a.finishKind = String(snap.finish.kind || '')
        a.failCode = typeof snap.finish.code === 'string' ? snap.finish.code : ''
        a.failMsg = typeof snap.finish.message === 'string' ? snap.finish.message : ''
      }
      return a
    }

    // ---- 事件流 → 基础条目（统一折叠：live 叠加层 + 持久事件进同一次扫描）----
    // live = { sessionId, revision, attempts: [...], settled: [...] }：
    //   attempts —— 事件窗内仍在途的 attempt 快照（实时增长）；
    //   settled  —— 最近结算 attempt 的 { turn, step, firstSeq }（结算后卡片继承瞬时 firstSeq，
    //                框选/详情/滚动等 UI 状态在 settle 替换时不丢）。
    const parseItems = (events, live) => {
      const items = []
      const byCallId = {}
      const stepStarts = {} // turn:step → step/start 时间；助手运行计时从请求步骤开始，而不是首个 token 才开始
      const stepEnds = {} // turn:step → step/end 时间；无最终 message 的草稿据此落定（请求失败/中断）
      const turnEnds = {} // turn → turn/end 时间；step/end 缺失时的兜底落定依据
      const retriesByStep = {} // turn:step → dsh-llm-retry 的重试链（llm/retry 调度事件，按序追加）
      const retryById = {} // retryId → 链上条目；llm/retry-started 按 id 回填起跳时间
      let route = '' // 最近 request/header 的 provider/model，贴给后续助手消息卡
      let curTurn = null // 最近 turn/start 的轮次：user/message 不带 turn，用它推算归属
      // turn:step → 助手卡装配状态（durable message / durable attempts / 在途 live attempt 汇聚到同一张卡）
      const stepCards = new Map()

      const stepKey = (turn, step) => String(turn) + ':' + step
      const cardOf = (turn, step) => {
        const k = stepKey(turn, step)
        let c = stepCards.get(k)
        if (!c) {
          c = { key: k, turn, step, uiSeq: null, attempts: [], message: null, live: null }
          stepCards.set(k, c)
        }
        return c
      }

      // 先吸收 Client 叠加层的 attempt 快照（在途 attempt，重试换 attempt 归并同卡）
      if (live && Array.isArray(live.attempts)) {
        for (const snap of live.attempts) {
          if (!snap || snap.attemptId == null) continue
          const a = attemptFromSnapshot(snap)
          if (a.turn == null || a.step == null) continue
          cardOf(a.turn, a.step).live = a
        }
      }

      for (const ev of events) {
        if (!ev || typeof ev.seq !== 'number') continue
        const d = ev.data || {}
        if (ev.type === 'turn/start') { if (typeof d.turn === 'number') curTurn = d.turn; continue }
        if (ev.type === 'step/start') {
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          stepStarts[stepKey(turn, step)] = ev.time
          cardOf(turn, step)
          continue
        }
        if (ev.type === 'step/end') {
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          stepEnds[stepKey(turn, step)] = ev.time
          continue
        }
        if (ev.type === 'turn/end') {
          if (typeof d.turn === 'number') turnEnds[d.turn] = ev.time
          continue
        }
        // dsh-llm-retry 的持久事件：调度（含退避时长与触发失败码）写入等待期之前，起跳在重发时写入。
        // 重试不换 step 号——同 turn:step 的失败→等待→重发共享同一张助手卡，徽标直接挂卡上。
        if (ev.type === 'llm/retry') {
          const key = String(d.turn) + ':' + d.step
          const f = d.failure || {}
          const entry = { retry: d.retry, maxRetries: d.maxRetries, delayMs: d.delayMs, code: typeof f.code === 'string' ? f.code : '', message: typeof f.message === 'string' ? f.message : '', time: ev.time, startedAt: 0 }
          ;(retriesByStep[key] || (retriesByStep[key] = [])).push(entry)
          if (typeof d.retryId === 'string' && d.retryId) retryById[d.retryId] = entry
          continue
        }
        if (ev.type === 'llm/retry-started') {
          const r = typeof d.retryId === 'string' ? retryById[d.retryId] : null
          if (r) r.startedAt = ev.time
          continue
        }
        if (ev.type === 'request/header') {
          const cfg = d.header && d.header.config
          if (cfg && cfg.model) route = (cfg.provider ? cfg.provider + '/' : '') + cfg.model
          continue
        }
        if (ev.type === 'tool/call') {
          const it = {
            kind: 'call', seq: ev.seq, time: ev.time, turn: d.turn, step: d.step,
            name: String(d.name || '?'), cat: kindOf(String(d.name || '')),
            argsRaw: typeof d.arguments === 'string' ? d.arguments : '',
            status: 'pending', dur: null, resultText: '', outLen: 0,
          }
          items.push(it)
          if (d.callId != null) byCallId[String(d.callId)] = it
        } else if (ev.type === 'tool/result') {
          const m = d.message || {}
          // 遍历 content 找第一个带 toolCallId 的块（首块非 tool-result 时也能配上对）
          let callId = null
          let text = ''
          if (Array.isArray(m.content)) {
            for (const block of m.content) {
              if (callId == null && block && block.toolCallId != null) callId = String(block.toolCallId)
              if (!text && block) { const t = textOf(block.content); if (t) text = t }
            }
          }
          const failed = !!(d.error || (Array.isArray(m.content) && m.content[0] && m.content[0].isError))
          const it = callId ? byCallId[callId] : null
          if (it) {
            it.status = failed ? 'error' : 'ok'
            it.dur = ev.time - it.time
            it.resultText = text
            it.outLen = text.length
            it.resSeq = ev.seq // 结果事件位置：子代理出口卡对齐「结果之后的第一条消息」用
          }
        } else if (ev.type === 'user/message') {
          const src = d.source && d.source.kind ? String(d.source.kind) : 'user'
          const preview = oneLine(textOf(d.content), 110)
          // 空内容的上下文注入（subagent-settled 占位等）是噪声，不进流程图
          if (src !== 'user' && !preview) continue
          items.push({ kind: 'msg', role: src === 'user' ? 'user' : 'inject', seq: ev.seq, time: ev.time, turn: curTurn, preview, full: textOf(d.content) })
        } else if (ev.type === 'assistant/live-chunk') {
          // 客户端瞬时事件（测试/整窗透传路径；常规面板走 live.attempts 快照）。
          // 同一 attemptId 幂等累计；缺失 attemptId 的帧跳过（不产生重复卡）。
          if (d.attemptId == null) continue
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          const card = cardOf(turn, step)
          let a = card.live && card.live.attemptId === String(d.attemptId) ? card.live : null
          if (!a) {
            a = makeAttemptState(d.attemptId, turn, step)
            card.live = a
          }
          if (a.firstSeq == null) a.firstSeq = ev.seq
          applyChunkToAttempt(a, ev.time, d.chunk)
        } else if (ev.type === 'assistant/message' || ev.type === 'assistant/attempt') {
          // 持久结算事件：精确重放内嵌 stream；message 形成最终卡，attempt 形成失败/取消卡。
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          const card = cardOf(turn, step)
          const a = makeAttemptState(null, turn, step)
          for (const { time, chunk } of expandStreamRecords(d.stream)) applyChunkToAttempt(a, time, chunk)
          if (ev.type === 'assistant/message') {
            card.message = { ev, data: d, stream: a, route }
          } else {
            card.attempts.push({ ev, stream: a })
          }
        }
      }

      // ---- 装配：turn:step → 一张助手卡（实时草稿 → 结算替换，保留 UI 连续性）----
      for (const card of stepCards.values()) {
        const k = card.key
        // UI 连续性：结算事件继承在途/最近结算 attempt 的 firstSeq 作为卡片定位 seq
        let uiSeq = null
        if (card.live) uiSeq = card.live.firstSeq
        if (uiSeq == null && live && Array.isArray(live.settled)) {
          const hit = live.settled.find((s) => s && s.turn === card.turn && s.step === card.step && typeof s.firstSeq === 'number')
          if (hit) uiSeq = hit.firstSeq
        }
        let it
        if (card.message) {
          // 成功（或已中断但形成可见消息）的最终卡：durable message 是权威内容
          const { ev, data, stream, route: msgRoute } = card.message
          const m = data.message || {}
          const u = data.usage || stream.usage || null
          const finalText = textOf(m.content)
          it = {
            kind: 'msg', role: 'ai', seq: uiSeq != null ? uiSeq : ev.seq, time: ev.time, turn: card.turn, step: card.step,
            attemptId: card.live ? card.live.attemptId : '',
            akey: card.live ? 'assistant-attempt:' + card.live.attemptId : 'assistant-event:' + ev.seq,
            finalSeq: ev.seq, runStart: stepStarts[k] != null ? stepStarts[k] : (stream.firstAt != null ? stream.firstAt : ev.time),
            runDur: Math.max(0, ev.time - (stepStarts[k] != null ? stepStarts[k] : (stream.firstAt != null ? stream.firstAt : ev.time))),
            preview: oneLine(finalText, 110) || (stream.toolCall ? '（工具调用）' : (stream.reasoning ? oneLine(stream.reasoning, 110) : '（工具调用）')),
            full: finalText || stream.text || stream.reasoning,
            tok: u ? (u.outputTokens || 0) : null, route: msgRoute || route,
            streaming: false, settled: true,
            interrupted: data.interrupted === true,
            finishKind: stream.finishKind || (data.interrupted === true ? 'interrupted' : ''),
            failCode: '', failMsg: '',
          }
        } else if (card.attempts.length && !card.live) {
          // 已落定的失败/取消/重试前尝试：无在途 attempt、无 message → 失败终局卡
          const last = card.attempts[card.attempts.length - 1]
          const s = last.stream
          const failed = s.finishKind === 'error' || s.finishKind === 'aborted' || Boolean(s.failCode)
          const uiSeqFinal = uiSeq != null ? uiSeq : last.ev.seq
          const runFrom = stepStarts[k] != null ? stepStarts[k] : (s.firstAt != null ? s.firstAt : last.ev.time)
          const runTo = s.lastAt != null ? s.lastAt : last.ev.time
          it = {
            kind: 'msg', role: 'ai', seq: uiSeqFinal, time: last.ev.time, turn: card.turn, step: card.step,
            attemptId: '', akey: 'assistant-event:' + last.ev.seq, finalSeq: last.ev.seq,
            runStart: runFrom, runDur: Math.max(0, runTo - runFrom),
            preview: (s.text || s.reasoning ? oneLine(s.text || s.reasoning, 100) + ' ' : '') + (s.finishKind === 'aborted' ? '（已取消）' : '（生成失败）'),
            full: s.text || s.reasoning,
            tok: null, route, streaming: false, settled: true,
            interrupted: false, failed: s.finishKind === 'error' || Boolean(s.failCode),
            abandoned: s.finishKind === 'aborted',
            finishKind: s.finishKind, failCode: s.failCode || '', failMsg: s.failMsg || '',
          }
          if (!failed && !s.failCode && s.finishKind !== 'aborted') it.preview = oneLine(s.text || s.reasoning, 110) || '（尝试未形成消息）'
          // 步骤仍在开（无 step/end、无在途 live）且重试已调度未起跳 → 等待重试态：
          // 卡片落定但徽标显示退避倒计时（下一次 live attempt 到来时替换为流式卡）
          const rsEarly = retriesByStep[k]
          const stepOpen = stepEnds[k] == null && (card.turn == null || turnEnds[card.turn] == null)
          const pendRetry = rsEarly && rsEarly.length && !rsEarly[rsEarly.length - 1].startedAt
          if (rsEarly && rsEarly.length) it.retries = rsEarly
          if (stepOpen) {
            it.interrupted = !pendRetry // 步骤没结束也没有等待中的重试 → 视作被中断（兜底语义）
            it.awaitingRetry = Boolean(pendRetry)
          } else {
            it.interrupted = true
          }
          items.push(it)
          continue
        } else {
          // 实时草稿（事件窗在途 attempt）：无 durable message/attempt 落定
          const a = card.live
          if (!a) continue
          it = {
            kind: 'msg', role: 'ai', seq: a.firstSeq != null ? a.firstSeq : (a.firstAt != null ? a.firstAt : Date.now()),
            time: a.firstAt, turn: card.turn, step: card.step,
            attemptId: a.attemptId, akey: 'assistant-attempt:' + a.attemptId, finalSeq: null,
            runStart: stepStarts[k] != null ? stepStarts[k] : (a.firstAt != null ? a.firstAt : Date.now()),
            preview: '', full: a.text || a.reasoning,
            tok: null, route, streaming: true, settled: false,
            finishKind: a.finishKind, failCode: a.failCode || '', failMsg: a.failMsg || '',
          }
          const endedAt = stepEnds[k] != null ? stepEnds[k]
            : (card.turn != null && turnEnds[card.turn] != null ? turnEnds[card.turn] : null)
          if (endedAt != null && !a.text && !a.reasoning && !a.toolCall && a.finishKind === '') {
            // 步骤终结但没看到任何帧（事件窗断连且 baseline 未覆盖）→ 不凭空造卡
            continue
          }
          if (endedAt != null || a.finishKind === 'error' || a.finishKind === 'aborted') {
            // 步骤/轮次已终结（或收到终态失败帧）却没有 durable 结算 → 请求失败/中断/被重试调度：
            // 落定卡片（停止流光脉冲与耗时计时），标记中断并保留已生成片段
            it.streaming = false
            it.interrupted = true
            it.failed = a.finishKind === 'error' || Boolean(a.failCode)
            it.abandoned = a.finishKind === 'aborted'
            it.settled = a.finishKind !== ''
            const endRef = endedAt != null ? endedAt : (a.lastAt != null ? a.lastAt : it.runStart)
            it.runDur = Math.max(0, endRef - it.runStart)
            it.preview = (it.full ? oneLine(it.full, 100) + ' ' : '') + (it.abandoned ? '（已取消）' : '（生成已中断）')
          } else {
            it.preview = oneLine(it.full, 110) || (a.toolCall ? '正在准备工具调用…' : (a.reasoning ? '思考中…' : '正在生成…'))
          }
        }
        // 重试链挂卡（含重试后成功的卡与终局失败的中断卡）
        const rs = retriesByStep[k]
        if (rs && rs.length) it.retries = rs
        items.push(it)
      }
      // 统一按 seq 稳定排序：live 草稿的浮点 seq 天然落在相邻持久事件之间
      const order = items.map((it, i) => [it.seq, i, it])
      order.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]))
      return order.map((e) => e[2])
    }

    // ---- 条目 → 流程节点：消息各成节点；同步骤连续普通调用合成平行卡片组；子代理调用独立成分支节点 ----
    const buildNodes = (items) => {
      const nodes = []
      for (const it of items) {
        if (it.kind === 'msg') { nodes.push({ t: 'msg', it }); continue }
        if (it.cat === 'subagent') {
          const last = nodes[nodes.length - 1]
          // 同一 step 里连续启动的子代理是真并行分支：合成一个左泳道组，
          // 避免 N 个子代理被拆成 N 个空主干行、把画布垂直拉长。
          if (last && last.t === 'subs' && last.turn === it.turn && last.step === it.step) last.calls.push(it)
          else nodes.push({ t: 'subs', turn: it.turn, step: it.step, calls: [it] })
          continue
        }
        const last = nodes[nodes.length - 1]
        if (last && last.t === 'par' && last.turn === it.turn && last.step === it.step) last.calls.push(it)
        else nodes.push({ t: 'par', turn: it.turn, step: it.step, calls: [it] })
      }
      return nodes
    }

    // ---- 子代理调用 → 目标会话 id（旧版结果文本 / alpha.4 send_message）----
    const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i
    const childIdOf = (call) => {
      const m = /(?:subagent|agent)\s+([0-9a-f]{8}-[0-9a-f-]{27,})/i.exec(call.resultText || '')
      if (m) return m[1]
      if (call && call.name === 'send_message') {
        try {
          const args = JSON.parse(call.argsRaw || '{}')
          const id = args && typeof args.agent_id === 'string' ? args.agent_id.trim() : ''
          if (SESSION_ID_RE.test(id)) return id
        } catch (e) {}
      }
      return null
    }
    // 子代理分支：从子会话日志提取紧凑步骤流（限量；读失败/未启动给占位）
    const childRows = async (childId, cap) => {
      const r = await readLog(childId)
      if (!r.events || !r.events.length) return { rows: [], live: false, total: 0 }
      const items = parseItems(r.events)
      const rows = []
      for (const it of items) {
        if (it.kind === 'msg') {
          if (it.role === 'ai') rows.push({ txt: it.preview, cls: 'ai' })
        } else {
          const km = KIND_META[it.cat] || KIND_META.builtin
          rows.push({ txt: it.name + ' ' + oneLine(it.argsRaw, 40), cls: '', pill: km.label, status: it.status, dur: it.dur })
        }
      }
      let live = false
      try {
        const agentsSvc = ctx.get('agents')
        if (agentsSvc) {
          const agent = agentsSvc.get(childId)
          live = !!(agent && agent.status === 'running')
        } else {
          // 旧版 harness/测试环境没有 agents 状态面，只能以仍挂载的 session 作为兼容兜底。
          const sessionsSvc = ctx.get('sessions')
          live = !!(sessionsSvc && sessionsSvc.get(childId))
        }
      } catch (e) {}
      return { rows: rows.slice(-cap), live, total: rows.length }
    }

    // ---- 渲染 ----
    const statusGlyph = (s, dur) => {
      if (s === 'ok') return '<span style="color:var(--tb-done-text,#81c784)">✓ ' + fmtDur(dur) + '</span>'
      if (s === 'error') return '<span style="color:var(--tb-danger-text,#f28b82)">✗ ' + fmtDur(dur) + '</span>'
      return '<span class="fl-spin"></span>'
    }

    // 进出摘要：传入/返回（用户核心诉求——看到传给 skill 什么、skill 返回什么）
    // 传入：从 arguments JSON 提取最有信息量的字段（command/file_path/pattern/prompt…），而非整段 JSON
    const ARG_KEYS = ['command', 'file_path', 'path', 'pattern', 'query', 'q', 'description', 'prompt', 'text', 'content', 'url', 'name', 'key', 'expression', 'expr', 'code', 'script', 'tool', 'method', 'message', 'input', 'old_string', 'new_string']
    const inSummary = (c) => {
      try {
        const a = JSON.parse(c.argsRaw || '{}')
        for (const k of ARG_KEYS) {
          if (typeof a[k] === 'string' && a[k].trim()) return k + ': ' + oneLine(a[k], 72)
          if (typeof a[k] === 'number' || typeof a[k] === 'boolean') return k + ': ' + a[k]
        }
        const ks = Object.keys(a)
        if (ks.length) return ks[0] + ': ' + oneLine(String(a[ks[0]]), 72)
        return '（无参数）'
      } catch (e) { return oneLine(c.argsRaw, 72) || '（无参数）' }
    }
    // 返回：结果首条有意义文本 + 体量 + 状态
    const outSummary = (c) => {
      if (c.status === 'pending') return null
      if (c.status === 'error') {
        const t = (c.resultText || '').trim()
        return { text: t ? oneLine(t, 72) : '（调用失败）', err: true }
      }
      const lines = String(c.resultText || '').split('\n').map((s) => s.trim()).filter(Boolean)
      const first = lines[0] || ''
      return { text: (first ? oneLine(first, 72) : '（空返回）') + (c.outLen > 72 ? ' · ' + fmtSize(c.outLen) : ''), err: false }
    }
    // 调用连线单元（形态约定·手绘参考图：主干卡在左、工具卡在右，中间两条水平连线——
    // 上=输入摘要 + 横线 + ▶ 右出；下=◀ + 横线 + 输出摘要 回左；输出线绿色系、错误红色系、进行中虚线）；
    // 进行中的工具卡高亮脉冲（调用到哪步哪步亮）；点击工具卡展开完整传入/返回（详情挂卡下方）
    const renderCallWire = (c, expandedSeq, presentationRules) => {
      const identity = displayIdentity(c, presentationRules)
      const km = identity.meta
      const isExp = expandedSeq === c.seq
      const pending = c.status === 'pending'
      const o = outSummary(c)
      return '<div class="fl-wp" data-flow-card="' + c.seq + '" data-flow-status="' + c.status + '">' +
          '<div class="fl-wl"><span class="fl-wl-txt">输入 ' + esc(inSummary(c)) + '</span>' +
            '<span class="fl-wl-row"><span class="fl-wl-line"></span><span class="fl-wl-arr">▶</span></span></div>' +
          (pending
            ? '<div class="fl-wl fl-wl-b fl-wl-wait"><span class="fl-wl-txt">输出 进行中…</span>' +
              '<span class="fl-wl-row"><span class="fl-wl-arr">◀</span><span class="fl-wl-line"></span></span></div>'
            : '<div class="fl-wl fl-wl-b' + (o && o.err ? ' fl-wl-err' : '') + '"><span class="fl-wl-txt">输出 ' + esc(o ? o.text : '') + '</span>' +
              '<span class="fl-wl-row"><span class="fl-wl-arr">◀</span><span class="fl-wl-line"></span></span></div>') +
        '</div>' +
        '<div class="fl-callside">' +
          '<div class="fl-iocard' + (pending ? ' fl-live' : '') + (isExp ? ' fl-on' : '') + (o && o.err ? ' fl-err' : '') + '" data-action="fdetail" data-seq="' + c.seq + '" data-flow-select-seq="' + c.seq + '" title="点击在右侧查看完整传入/返回">' +
            '<div class="fl-iohead">' + (km.label ? '<span class="fl-tag" style="color:' + km.color + ';background:' + km.bg + '">' + esc(km.label) + '</span>' : '') +
            '<span class="fl-name">' + esc(identity.name) + '</span>' +
            (pending ? '<span class="fl-spin"></span><span class="fl-time" data-flow-timer="' + c.time + '" data-flow-timer-prefix="⏱ ">⏱ 0ms</span>' : statusGlyph(c.status, c.dur)) + '</div>' +
          '</div>' +
        '</div>'
    }

    // 同一步骤的多个并行调用（>1）用虚线外框 + 「并行 ×N」角标圈成一组；单调用保持散卡
    const grpSide = (node, units) => {
      const n = node.calls.length
      if (n < 2) return '<div class="fl-lane-side">' + units + '</div>'
      return '<div class="fl-lane-side fl-grp"><span class="fl-grp-tag">并行 ×' + n + '</span>' + units + '</div>'
    }

    // 泳道中列包装：连接符（▼ 上方空隙由 ::before 主干线自适应填满，▼ 贴内容顶）+ 内容 + 对称弹性空间
    // —— 卡片保持垂直居中，▼ 始终落在「上一张卡 → 这一张卡」的空隙底端（先线后箭头）；可视首行不加（顶部不悬空）
    const connMain = (content, withConn) =>
      (withConn ? '<div class="fl-conn"><span class="fl-arrow">▼</span></div>' : '') +
      content +
      (withConn ? '<span class="fl-conn-gap"></span>' : '')

    // 孤立调用组（前无助手消息，如连续工具步）：中列只画主干竖线贯穿——无卡的行不放 ▼ 连接符（线本身即连续性）
    const renderPar = (node, expandedSeq, presentationRules) => {
      const units = node.calls.map((c) => renderCallWire(c, expandedSeq, presentationRules)).join('')
      return '<div class="fl-lane"><div></div>' +
        '<div class="fl-lane-main"><span class="fl-lane-line"></span></div>' +
        grpSide(node, units) +
      '</div>'
    }

    // 重试/失败徽标（llm/retry 链 + 终态错误码）：等待中显示退避倒计时（面板 2s 重拉自动递减）；
    // 起跳后按卡片终局判定成功/失败；调度后未起跳即终结 = 未成行
    const retryBadgeHtml = (it) => {
      let out = ''
      const rs = it.retries
      if (rs && rs.length) {
        const last = rs[rs.length - 1]
        const max = typeof last.maxRetries === 'number' ? '/' + last.maxRetries : ''
        const tip = esc((last.code || '') + (last.message ? '：' + last.message : ''))
        if ((it.streaming || it.awaitingRetry) && !last.startedAt) {
          const remain = Math.max(0, Math.ceil((last.time + (last.delayMs || 0) - Date.now()) / 1000))
          out += '<span class="fl-retry fl-retry-wait" title="' + tip + '">⟳ 等待重试 ' + last.retry + max + (remain ? ' · ' + remain + 's' : '') + '</span>'
        } else if (it.streaming) {
          out += '<span class="fl-retry fl-retry-wait" title="' + tip + '">⟳ 重试 ' + last.retry + max + ' · 进行中</span>'
        } else if (!last.startedAt) {
          out += '<span class="fl-retry fl-retry-cancel" title="退避等待期间步骤/轮次已结束">⟳ 重试 ' + last.retry + max + ' 未成行</span>'
        } else if (it.interrupted) {
          out += '<span class="fl-retry fl-retry-fail" title="' + tip + '">⟳ 重试 ' + last.retry + max + ' · 失败</span>'
        } else {
          out += '<span class="fl-retry fl-retry-ok" title="' + tip + '">⟳ 重试 ' + last.retry + max + ' · 成功</span>'
        }
      }
      if (it.interrupted && it.failCode) {
        out += '<span class="fl-retry fl-retry-fail" title="' + esc(it.failMsg || '') + '">✗ ' + esc(it.failCode) + '</span>'
      }
      if (it.finishKind === 'max-tokens') {
        out += '<span class="fl-retry fl-retry-cancel" title="输出因 max-tokens 长度上限截断">⤒ 已达上限</span>'
      }
      return out
    }

    const msgCardInner = (it, expandedSeq, live) => {
      const isUser = it.role === 'user'
      const isAi = it.role === 'ai'
      const aiRunning = isAi && it.streaming
      const color = isUser ? 'var(--tb-done-text,#81c784)' : isAi ? 'var(--tb-active-text,#7fa7f0)' : 'var(--tb-text-3,#777884)'
      const label = isUser ? '用户' : isAi ? '助手' : '注入'
      // 卡片统一面片底色（fl-node），角色色只落在左侧色条 + 几何符号/tag 上，避免整卡彩色半透明的杂乱感
      // 用户/助手/注入卡均可点开右侧详情浮层看完整内容（与工具卡同一交互）；live=进行中 → 与工具卡同款流光脉冲
      // data-flow-state 暴露折叠器终态（streaming/settled/failed/abandoned）；data-flow-attempt 带实时 attempt 身份
      const branchSeq = it.finalSeq != null ? it.finalSeq : it.seq
      const flowState = it.streaming ? 'streaming' : (it.abandoned ? 'abandoned' : (it.failed || (it.interrupted && it.failCode) ? 'failed' : 'settled'))
      const branch = isAi && !it.streaming
        ? '<button type="button" class="fl-branch-btn" data-flow-branch data-seq="' + branchSeq + '" title="从这条助手消息在 Harness 中创建新分支" aria-label="在新对话中分支">' +
          '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v5a3 3 0 0 0 3 3h4"/><path d="M8 5l3-3 3 3"/><path d="M11 2v4"/><path d="M9 9l2 2-2 2"/></svg></button>'
        : ''
      return '<div class="fl-node' + (expandedSeq === it.seq ? ' fl-on' : '') + (live ? ' fl-live' : '') + '" style="border-left-color:' + color + '" data-flow-main-card="' + it.seq + '" data-flow-role="' + it.role + '" data-flow-state="' + flowState + '"' + (isAi && it.attemptId ? ' data-flow-attempt="' + esc(it.attemptId) + '"' : '') + ' data-flow-select-seq="' + it.seq + '" data-action="fdetail" data-seq="' + it.seq + '" title="点击查看完整消息">' +
        '<div class="fl-node-head"><span class="fl-glyph" style="color:' + color + '">' + (isUser ? '▲' : isAi ? '◆' : '■') + '</span><span class="fl-tag" style="color:' + color + '">' + label + '</span>' +
        (isAi && it.route ? '<span class="fl-model">' + esc(it.route) + '</span>' : '') +
        (fmtTime(it.time) ? '<span class="fl-time">' + fmtTime(it.time) + '</span>' : '') +
        (aiRunning && it.runStart ? '<span class="fl-time" data-flow-timer="' + it.runStart + '" data-flow-timer-prefix="⏱ ">⏱ 0ms</span>' : (isAi && it.runDur != null ? '<span class="fl-time">⏱ ' + fmtDur(it.runDur) + '</span>' : '')) +
        (it.tok ? '<span class="fl-time">+' + it.tok + ' tok</span>' : '') + (isAi ? retryBadgeHtml(it) : '') + branch + '</div>' +
        '<div class="fl-preview"' + (it.interrupted ? ' style="color:var(--tb-danger-text,#f28b82)"' : '') + '>' + esc(it.preview || '（空）') + '</div>' +
      '</div>'
    }

    const renderMsg = (it, expandedSeq, withConn, live) => '<div class="fl-lane"><div></div><div class="fl-lane-main">' + connMain(msgCardInner(it, expandedSeq, live), withConn) + '</div><div></div></div>'

    const copyButtonHtml = '<button type="button" class="fl-copy-btn" data-flow-copy="1" title="复制内容到剪贴板" aria-label="复制内容到剪贴板">' +
      '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11H2.5A1.5 1.5 0 0 1 1 9.5v-7A1.5 1.5 0 0 1 2.5 1h7A1.5 1.5 0 0 1 11 2.5V3"/></svg></button>'
    const markdownPreviewButtonHtml = (seq) => '<button type="button" class="fl-md-preview-btn" data-flow-markdown-preview="1" data-flow-markdown-key="' + seq + '" title="Markdown 预览" aria-label="Markdown 预览" aria-pressed="false">' +
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4S1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.8"/></svg></button>'

    // 完整详情 → 右侧浮层（不插入流程流撑高内容：展开/收起零跳跃，滚动位置不动）：
    // 完整输入参数（美化 JSON）+ 完整返回结果（均截断标注，防大参数撑爆 HTML）；头部 ✕ 或再点卡片关闭
    const detailRail = (c, anim, presentationRules) => {
      const identity = displayIdentity(c, presentationRules)
      let input = c.argsRaw || ''
      try { input = JSON.stringify(JSON.parse(c.argsRaw || '{}'), null, 2) } catch (e) {}
      const cap = 8000
      const inShown = input.length > cap ? input.slice(0, cap) + '\n…（截断，共 ' + input.length + ' 字符）' : input
      const out = c.status === 'pending' ? '（进行中，尚无返回）' : (c.resultText || '（空返回）')
      const outShown = out.length > cap ? out.slice(0, cap) + '\n…（截断，共 ' + out.length + ' 字符）' : out
      // anim=是否新展开（轮询重渲染不重播滑入动画，防闪烁）
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '"><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head"><span class="fl-rail-title">' + esc(identity.name) + ' · 详情</span>' +
        '<button type="button" class="fl-rail-x" data-action="fdetail" data-seq="' + c.seq + '" title="关闭详情">✕</button></div>' +
        '<div class="fl-rail-body">' +
          '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">入 · 完整传入' + (input.length > cap ? '（截断）' : '') + '</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(inShown) + '</pre></div>' +
          '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">出 · 完整返回' + (c.outLen ? '（' + fmtSize(c.outLen) + '）' : '') + '</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(outShown) + '</pre></div>' +
        '</div>' +
      '</div>'
    }

    // 消息详情浮层（用户/助手/注入卡点击）：角色 + 时间/模型/tokens 元信息 + 完整内容（截断标注）
    const msgRail = (it, anim) => {
      const label = it.role === 'user' ? '用户消息' : it.role === 'ai' ? '助手消息' : '注入消息'
      const cap = 8000
      const full = String(it.full || it.preview || '')
      const shown = full.length > cap ? full.slice(0, cap) + '\n…（截断，共 ' + full.length + ' 字符）' : full
      const meta = []
      if (fmtTime(it.time)) meta.push('时间 ' + fmtTime(it.time))
      if (it.route) meta.push('模型 ' + it.route)
      if (it.attemptId) meta.push('attempt ' + String(it.attemptId).slice(0, 12))
      if (it.tok) meta.push('输出 +' + it.tok + ' tok')
      if (it.finishKind && it.finishKind !== 'stop') meta.push('结束 ' + it.finishKind)
      if (it.failCode) meta.push('错误 ' + it.failCode + (it.failMsg ? '：' + oneLine(it.failMsg, 80) : ''))
      if (it.retries && it.retries.length) meta.push('重试 ' + it.retries.length + ' 次（' + it.retries.map((r) => r.code || '?').join(' → ') + '）')
      // 与外层助手卡同款分支按钮：详情头部可直接从这条消息创建新分支（复用 data-flow-branch 委托）
      const branch = it.role === 'ai' && !it.streaming
        ? '<button type="button" class="fl-branch-btn" data-flow-branch data-seq="' + (it.finalSeq != null ? it.finalSeq : it.seq) + '" title="从这条助手消息在 Harness 中创建新分支" aria-label="在新对话中分支">' +
          '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v5a3 3 0 0 0 3 3h4"/><path d="M8 5l3-3 3 3"/><path d="M11 2v4"/><path d="M9 9l2 2-2 2"/></svg></button>'
        : ''
      const markdown = it.role === 'ai'
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '"' + (markdown ? ' data-flow-markdown-detail="1"' : '') + '><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head"><span class="fl-rail-title">' + label + ' · 详情</span>' + branch +
        '<button type="button" class="fl-rail-x" data-action="fdetail" data-seq="' + it.seq + '" title="关闭详情">✕</button></div>' +
        '<div class="fl-rail-body"' + (markdown ? ' data-flow-markdown-body="1" data-flow-markdown-key="' + it.seq + '" data-flow-markdown-streaming="' + (it.streaming ? '1' : '0') + '"' : '') + '>' +
          (meta.length ? '<div class="fl-sec"><span class="fl-sec-label">' + esc(meta.join(' · ')) + '</span></div>' : '') +
          '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">完整内容' + (full.length > cap ? '（截断）' : '') + '</span>' + (markdown ? markdownPreviewButtonHtml(it.seq) : '') + copyButtonHtml + '</div><pre class="fl-pre"' + (markdown ? ' data-flow-markdown-source="1"' : '') + '>' + esc(shown || '（空）') + '</pre></div>' +
        '</div>' +
      '</div>'
    }

    const presentationRulesRail = (st) => {
      const value = JSON.stringify(st.presentationRules || [], null, 2)
      const example = '[\n  {\n    "enabled": true,\n    "tools": ["pwsh"],\n    "executables": ["engram-memory.ps1"],\n    "displayName": "engram-lattice",\n    "actions": ["search", "recall", "memory"],\n    "badge": "记忆",\n    "color": "#81c784"\n  }\n]'
      return '<div class="fl-rail fl-rail-anim"><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head"><span class="fl-rail-title">工具显示规则</span>' +
        '<button type="button" class="fl-rail-x" data-action="fsettings" title="关闭设置">✕</button></div>' +
        '<div class="fl-rail-body">' +
          '<div class="tb-note">规则只改变流镜中的标题和徽章；原始工具名、参数、结果及会话日志保持不变。按顺序匹配，首条命中生效。displayName 为空时不添加名称，badge 为空时不显示徽章。</div>' +
          '<textarea class="tb-textarea" style="min-height:260px;resize:vertical" spellcheck="false" data-field="flowPresentationRules" placeholder="' + esc(example) + '">' + esc(value) + '</textarea>' +
          (st.ruleNotice ? '<div class="tb-note" style="color:var(--tb-done-text,#81c784)">' + esc(st.ruleNotice) + '</div>' : '') +
          '<div class="tb-row"><button type="button" class="tb-btn tb-btn-sm" data-action="fsave-rules">保存并应用</button>' +
          '<button type="button" class="tb-btn tb-btn-sm" data-action="freset-rules">清空规则</button></div>' +
          '<details><summary class="tb-note" style="cursor:pointer">字段说明与 Engram 示例</summary><pre class="fl-pre">' + esc(example) + '</pre></details>' +
        '</div></div>'
    }

    // 子代理分支内容（左列）：入口卡（可点详情）+ 支线步骤（限高滚动）+ 出口卡
    // 运行中 = 调用在途（pending）或子会话仍 live——任一成立入口卡持续 fl-live（流光/脉冲/转圈）
    const subBranchHtml = async (c) => {
      const cid = childIdOf(c)
      let subLive = c.status === 'pending'
      let sub2 = null
      if (cid) {
        try { sub2 = await childRows(cid, 10); if (sub2.live) subLive = true } catch (e) {}
      }

      // 有子会话 id 后，整张入口卡就是“进入子流镜”的主点击面；
      // 子代理尚在启动时仍保留详情行为，避免点击无效。
      let sub = '<div class="fl-sub-card fl-sub-open' + (subLive ? ' fl-live' : '') + '" data-action="' + (cid ? 'fenter' : 'fdetail') + '" data-seq="' + c.seq + '" data-flow-select-seq="' + c.seq + '" title="' + (cid ? '进入该子代理的实时流镜' : '点击查看完整任务传入/返回') + '">' +
        '<div class="fl-iohead"><span class="fl-tag" style="color:var(--tb-active-text,#7fa7f0);background:rgba(91,141,239,.12)">子代理</span>' +
        '<span class="fl-name">' + esc(c.name) + '</span>' + statusGlyph(c.status, c.dur) + '</div>' +
        '<div class="fl-sub-io"><span class="fl-io-tag">入</span><span class="fl-branch-txt">' + esc(inSummary(c)) + '</span></div>' +
      '</div>'
      let steps = ''
      if (cid && sub2) {
        steps += '<div class="fl-sub-meta"><span class="fl-time">↳ ' + esc(cid.slice(0, 8)) + '… · ' + sub2.total + ' 步</span>' + (sub2.live ? '<span class="fl-tag" style="color:var(--tb-done-text,#81c784)">运行中</span>' : '') +
          '<button type="button" class="tb-btn tb-btn-sm" data-action="fenter" data-seq="' + c.seq + '" title="进入该子代理的完整流程图（可逐级返回）">进入 →</button></div>'
        for (const r of sub2.rows) {
          steps += '<div class="fl-sub-step">' +
            (r.pill ? '<span class="fl-branch-pill">' + esc(r.pill) + '</span>' : '') +
            '<span class="fl-branch-txt' + (r.pill ? '' : ' fl-branch-ai') + '">' + esc(r.txt) + '</span>' +
            (r.pill ? statusGlyph(r.status, r.dur) : '') +
          '</div>'
        }
        if (sub2.total > sub2.rows.length) steps += '<div class="fl-sub-step"><span class="fl-time">… 更早 ' + (sub2.total - sub2.rows.length) + ' 步未展开</span></div>'
      } else if (c.status === 'pending') {
        steps = '<div class="fl-sub-step"><span class="fl-time">子代理启动中…</span></div>'
      }
      if (steps) sub += '<div class="fl-sub-steps">' + steps + '</div>'
      if (c.status !== 'pending') {
        const o = outSummary(c)
        sub += '<div class="fl-sub-card fl-sub-close" data-action="fdetail" data-seq="' + c.seq + '" title="点击查看完整任务传入/返回">' +
          '<div class="fl-sub-io"><span class="fl-io-tag">出</span>' +
          '<span class="fl-time">' + fmtDur(c.dur) + '</span>' +
          (o ? '<span class="fl-args">' + esc(o.text) + '</span>' : '') + '</div>' +
        '</div>'
      }
      return sub
    }

    const flowContextOf = (items, seqs, sid) => {
      const wanted = new Set(seqs)
      const selected = items.filter((it) => wanted.has(it.seq)).sort((a, b) => a.seq - b.seq)
      const chunks = ['以下是从 Flowglass 会话 ' + sid + ' 框选的流程片段（' + selected.length + ' 项）：']
      for (const it of selected) {
        if (it.kind === 'msg') {
          const role = it.role === 'user' ? '用户' : it.role === 'ai' ? '助手' : '注入'
          chunks.push('\n[' + role + ' · seq ' + it.seq + ']\n' + String(it.full || it.preview || '（空）'))
        } else {
          chunks.push('\n[工具 ' + it.name + ' · seq ' + it.seq + ']\n传入：' + (it.argsRaw || '（无参数）') + '\n返回：' + (it.status === 'pending' ? '（进行中）' : (it.resultText || '（空返回）')))
        }
      }
      const text = chunks.join('\n')
      const cap = 24000
      return {
        sourceSessionId: sid,
        seqs: selected.map((it) => it.seq),
        text: text.length > cap ? text.slice(0, cap) + '\n…（框选内容过长，已截断）' : text,
      }
    }

    // 同步子代理组：每个分支是一个可自行拉伸的小流镜，宽屏自动多列、窄屏回落单列。
    const subGroupHtml = async (node) => {
      const branches = await Promise.all(node.calls.map(subBranchHtml))
      return (node.calls.length > 1 ? '<span class="fl-subgrp-tag">并行子代理 ×' + node.calls.length + '</span>' : '') +
        branches.map((html) => '<div class="fl-subbranch">' + html + '</div>').join('')
    }

    const subColHtml = (node, html) => '<div class="fl-subcol' + (node.calls.length > 1 ? ' fl-subgrp' : '') + '">' + html + '</div>'

    const render = async (st, sid, live) => {
      const r = await readLog(sid)
      // 活跃度：日志条数较上轮渲染增长 = 会话正在工作（用于助手卡流光；静止会话/他人会话不误亮）
      const prevCount = growth[sid]
      const active = prevCount != null && (r.count || 0) > prevCount
      growth[sid] = r.count || 0
      await loadManifestTools()
      // 事件窗在途 attempt（live 叠加层）= 会话正在生成的最直接信号
      const overlayLive = Boolean(live && Array.isArray(live.attempts) && live.attempts.some((a) => a && a.attemptId != null))
      const items = parseItems(r.events || [], live)
      const nodes = buildNodes(items)
      // 会话仍在运行且最新事件是一条助手消息 → 该助手卡持续流光；日志增长作为 sessions 服务缺失时的兜底。
      const lastIt = items.length ? items[items.length - 1] : null
      let sessionLive = false
      let hasAgentStatus = false
      try {
        const agentsSvc = ctx.get('agents')
        if (agentsSvc) {
          hasAgentStatus = true
          const agent = agentsSvc.get(sid)
          sessionLive = !!(agent && agent.status === 'running')
        }
      } catch (e) {}
      // provider/配额等请求错误有时先把 agent 置 idle，step/end / turn/end 尚未进入本次日志快照。
      // agent 状态是权威终态：强制结算残留流式草稿，避免“正在生成”和客户端计时无限增长。
      // 例外：事件窗在途 attempt（live 叠加层）就是当前进行中的最直接证据——窗口说在生成，
      // 就不按 agent idle 强制结算（跨会话查看/agents 不认识该会话时尤为重要）。
      if (hasAgentStatus && !sessionLive && !overlayLive) {
        const tail = r.events && r.events.length ? r.events[r.events.length - 1] : null
        const settledAt = tail && Number.isFinite(Number(tail.time)) ? Number(tail.time) : null
        for (const it of items) {
          if (it.kind !== 'msg' || it.role !== 'ai' || !it.streaming) continue
          it.streaming = false
          it.interrupted = true
          it.runDur = Math.max(0, (settledAt != null ? settledAt : it.runStart) - it.runStart)
          it.preview = (it.full ? oneLine(it.full, 100) + ' ' : '') + '（生成失败或已中断）'
        }
      }
      const liveAiSeq = (overlayLive || (hasAgentStatus ? sessionLive : active)) && lastIt && lastIt.kind === 'msg' && lastIt.role === 'ai' && !lastIt.interrupted ? lastIt.seq : null
      const PAGE = 60
      const limit = Number.isFinite(Number(st.limit)) ? Math.max(PAGE, Math.floor(Number(st.limit) / PAGE) * PAGE) : PAGE
      st.limit = limit
      const shown = nodes.slice(-limit)
      const hasOlder = nodes.length > shown.length
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root tb-pane" data-flow data-flow-scope="' + esc(sid) + '" data-flow-has-older="' + (hasOlder ? '1' : '0') + '" data-flow-visible="' + shown.length + '" data-flow-total="' + nodes.length + '" data-autorefresh="' + (st.live && !st.settings ? '2000' : '') + '" data-tab-badge="' + (st.live ? String(nodes.length) : '') + '">')
      // 固定头
      parts.push('<div class="tb-pane-head">')
      // 钻取态：查看的不是面板所属会话 → 头部给「← 返回」+ 层级标注（crumbs 栈深度）
      const drilled = !!(st.home && sid !== st.home)
      const depth = drilled && Array.isArray(st.crumbs) ? st.crumbs.length : 0
      const help = [
        '• 中列是用户/助手主线，右列是工具调用（输入 ▶ / 输出 ◀），左列是子代理分支。',
        '• 点击卡片查看完整内容。',
        '• 悬停助手卡可从该节点创建 Harness 分支。',
        '• 画布默认可拖动框选，点击空白处取消框选并收起详情；左下可新建仅所选内容的会话草稿或带入已有会话。',
        '• Zoom 支持缩放与 Zen 原生全屏。',
        '• 点击子代理卡进入实时子流镜，“子代理跟随”开启时 Harness 同步切换。',
        '• 滚到顶部会每次自动加载更早 60 个节点。',
      ].join('\n')
      parts.push('<div class="tb-row">' +
        (drilled ? '<button type="button" class="tb-btn tb-btn-sm" data-action="fback" title="返回上一级流程图">← 返回</button>' : '') +
        '<span class="tb-sec-label">' + (drilled ? '子代理流镜' : '实时流镜') + '</span>' +
        '<span class="tb-note">' + esc(sid.replace(/^session-/, '').slice(0, 8)) + ' · ' + items.length + ' 条事件 · ' + nodes.length + ' 节点' + (drilled ? ' · 第 ' + (depth + 1) + ' 层' : '') + '</span>' +
        '<button type="button" class="tb-chip' + (st.live ? ' tb-chip-on' : '') + '" data-action="toggle-live">' + (st.live ? '● 实时同步中' : '⏸ 已暂停') + '</button>' +
        '<button type="button" class="tb-chip' + (st.follow ? ' tb-chip-on' : '') + '" data-action="toggle-follow" title="开启后，点击子代理会同时切换 DeepSeek Harness 主会话">' + (st.follow ? '● 子代理跟随' : '○ 子代理跟随') + '</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="refresh">刷新</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="fsettings" title="配置工具卡片的声明式显示规则">⚙ 显示规则</button>' +
        '<span class="fl-info" tabindex="0" aria-label="流镜使用说明">' +
          '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4"/><circle cx="8" cy="4.7" r=".7" fill="currentColor" stroke="none"/></svg>' +
          '<span class="fl-info-pop">' + esc(help) + '</span>' +
        '</span>' +
      '</div>')
      parts.push('</div>')
      // 流程体：tb-pane-body 为 column-reverse——这里以「视觉最新在底」渲染：DOM 先放最新节点，滚动条默认贴底
      parts.push('<div class="tb-pane-body">')
      if (!shown.length) {
        parts.push('<div class="tb-notice">当前会话还没有事件</div>')
      } else {
        // 子代理分支内容并行预取（串行 await 会让多个子代理分支的 readLog 延迟叠加）
        const subHtmls = {}
        await Promise.all(shown.map(async (n, i) => { if (n.t === 'subs') subHtmls[i] = await subGroupHtml(n) }))
        const rows = []
        for (let i = 0; i < shown.length; i++) {
          const n = shown[i]
          const withConn = rows.length > 0 // 可视首行（最老）不画连接符
          let h
          // 助手消息后紧跟的同步骤节点统一归并：普通调用组(par)与子代理(sub)任意顺序/兼有都并进同一行
          // —— 左=分支、中=助手卡、右=工具组（此前 par/sub 只认单一模式，混合步骤会把子代理落单到下一行导致分支错位）
          if (n.t === 'msg' && n.it.role === 'ai' && shown[i + 1] && (shown[i + 1].t === 'par' || shown[i + 1].t === 'subs')) {
            let parN = null, subN = null, subIdx = -1, next = i + 1
            if (shown[next] && shown[next].t === 'par') { parN = shown[next]; next++ }
            if (shown[next] && shown[next].t === 'subs') { subN = shown[next]; subIdx = next; next++ }
            if (!parN && shown[next] && shown[next].t === 'par') { parN = shown[next]; next++ }
            const subCalls = subN ? subN.calls : []
            // 进行中判定：工具组有 pending / 子代理还在跑 / 该助手消息正活跃
            const aiLive = (parN && parN.calls.some((c) => c.status === 'pending')) || subCalls.some((c) => c.status === 'pending') || n.it.seq === liveAiSeq
            let main = msgCardInner(n.it, st.expanded, aiLive)
            let lastI = next - 1
            // 并行分支全部返回后，出口对齐最后一个结果之后的主干消息。
            const allSettled = subCalls.length > 0 && subCalls.every((c) => c.resSeq != null)
            const resultSeq = allSettled ? Math.max(...subCalls.map((c) => c.resSeq)) : null
            if (resultSeq != null) {
              // 已完成：中列从卡A 起 ▼ 串到「结果之后的第一条消息」（出口卡贴底与其对齐）；
              // 合并边界按轮次（turn）——只吞同轮消息，下一轮的用户/助手消息回到独立行（对齐基准）
              for (let j = next; j < shown.length; j++) {
                const m = shown[j]
                if (m.t !== 'msg') break
                if (subN.turn != null && m.it.turn != null && m.it.turn !== subN.turn) break
                main += '<span class="fl-arrow">▼</span>' + msgCardInner(m.it, st.expanded, m.it.seq === liveAiSeq)
                lastI = j
                if (m.it.seq > resultSeq) break
              }
            }
            h = '<div class="fl-lane">' +
              (subN ? subColHtml(subN, subHtmls[subIdx] || '') : '<div></div>') +
              '<div class="fl-lane-main">' + connMain(main, withConn) + '</div>' +
              (parN ? grpSide(parN, parN.calls.map((c) => renderCallWire(c, st.expanded, st.presentationRules)).join('')) : '<div></div>') +
            '</div>'
            i = lastI
          } else if (n.t === 'msg') h = renderMsg(n.it, st.expanded, withConn, n.it.seq === liveAiSeq)
          else if (n.t === 'par') h = renderPar(n, st.expanded, st.presentationRules)
          else h = '<div class="fl-lane">' + subColHtml(n, subHtmls[i] || '') + '<div class="fl-lane-main"><span class="fl-lane-line"></span></div><div></div></div>'
          rows.push(h)
        }
        if (hasOlder) rows.push('<div class="tb-notice fl-older" data-flow-older-hint>' +
          '已显示最近 ' + shown.length + ' 个节点 · 继续向上滚动会自动加载更早 ' + Math.min(PAGE, nodes.length - shown.length) + ' 条' +
        '</div>')
        parts.push(rows.reverse().join(''))
      }
      parts.push('</div>')
      // 详情右侧浮层：展开状态且目标仍在可视事件集内时渲染（工具调用→传入/返回；消息→完整内容）
      if (st.expanded != null) {
        const target = items.find((it) => it.seq === st.expanded && (it.kind === 'call' || it.kind === 'msg'))
        if (target) parts.push(target.kind === 'call' ? detailRail(target, st.freshSeq === target.seq, st.presentationRules) : msgRail(target, st.freshSeq === target.seq))
      }
      if (st.settings) parts.push(presentationRulesRail(st))
      delete st.freshSeq // 一次性动画标记，不残留进 state
      parts.push('</div>')
      return parts.join('')
    }

    const handler = async ({ action, fields, state, session, live }) => {
      if (!sq) return { ok: false, error: 'sessionQuery 服务不可用', html: '' }
      const st = (state && typeof state === 'object' && state) ? state : { live: true, follow: true, limit: 60, sid: null, home: null, expanded: null, crumbs: [] }
      if (typeof st.follow !== 'boolean') st.follow = true
      if (!Number.isFinite(Number(st.limit)) || Number(st.limit) < 60) st.limit = 60
      if (typeof st.expanded !== 'number' && st.expanded != null) st.expanded = null
      if (!Array.isArray(st.crumbs)) st.crumbs = []
      if (fields && Object.prototype.hasOwnProperty.call(fields, '__flowPresentationRules')) {
        st.presentationRules = normalizePresentationRules(fields.__flowPresentationRules)
      } else if (!Array.isArray(st.presentationRules)) st.presentationRules = []
      const el = fields && fields.__el ? fields.__el : {}
      // home=面板所属会话（钻取不改变归属）；sid=当前查看的会话（默认=home）。
      // 跟随模式下 Harness 已经把当前 session 切到 st.sid，但 crumbs 表明这仍是
      // 从父流镜钻取进来的链；此时必须保留原 home，才能继续渲染“← 返回”。
      const carriedFollow = st.follow === true && st.home && session && st.sid === session && st.crumbs.length > 0
      const home = carriedFollow ? st.home : (session || st.home || st.sid)
      if (!home) return { ok: true, html: '<div class="jr-tabpanel tb-root"><div class="tb-notice">未找到当前会话</div></div>', state: st }
      st.home = home
      if (!st.sid) st.sid = home
      let navigateSession = null
      let flowContext = null
      // live 叠加层归一：只接受属于当前查看会话的窗快照（钻取到子会话时忽略）；
      // attempts = 在途 attempt；settled = 最近结算 attempt 的 firstSeq（UI 连续性）。
      const liveOverlay = live && typeof live === 'object' && typeof live.sessionId === 'string' && live.sessionId === st.sid
        ? {
          sessionId: live.sessionId,
          revision: typeof live.revision === 'number' ? live.revision : 0,
          attempts: Array.isArray(live.attempts) ? live.attempts.slice(-8) : [],
          settled: Array.isArray(live.settled) ? live.settled.slice(-8) : [],
        }
        : null
      if (action === 'toggle-live') st.live = !st.live
      else if (action === 'toggle-follow') st.follow = !st.follow
      else if (action === 'fsettings') {
        st.settings = !st.settings
        st.expanded = null
        st.ruleNotice = ''
      }
      else if (action === 'fsave-rules') {
        st.presentationRules = normalizePresentationRules(fields.flowPresentationRules || '[]')
        st.settings = true
        st.ruleNotice = '已保存并应用 ' + st.presentationRules.length + ' 条规则'
      }
      else if (action === 'freset-rules') {
        st.presentationRules = []
        st.settings = true
        st.ruleNotice = '已清空显示规则'
      }
      else if (action === 'fmore') st.limit = Math.min(100000, Number(st.limit) + 60)
      else if (action === 'fcontext' && typeof el.seqs === 'string') {
        const seqs = el.seqs.split(',').map((v) => Number(v)).filter((v) => Number.isFinite(v))
        const r = await readLog(st.sid)
        flowContext = flowContextOf(parseItems(r.events || [], liveOverlay), seqs, st.sid)
      }
      else if (action === 'fdetail' && el.seq != null) {
        const seq = Number(el.seq)
        st.expanded = st.expanded === seq ? null : seq
        st.freshSeq = st.expanded // 仅新展开的那次渲染播放滑入动画（null=收起不播；轮询不重播）
      } else if (action === 'fenter' && el.seq != null) {
        // 钻取：解析当前查看会话的日志，找到该子代理调用的子会话 id 后切入（当前会话压栈）
        const seq = Number(el.seq)
        const r = await readLog(st.sid)
        const call = parseItems(r.events || []).find((it) => it.kind === 'call' && it.seq === seq && it.cat === 'subagent')
        const cid = call ? childIdOf(call) : null
        if (cid && cid !== st.sid) {
          const parentSid = st.sid
          st.crumbs.push({ sid: st.sid, label: call.name + ' ' + cid.slice(0, 8) })
          st.sid = cid
          st.expanded = null
          if (st.follow) navigateSession = { sessionId: cid, parentSessionId: parentSid, kind: 'subagent' }
        }
      } else if (action === 'fback') {
        const prev = st.crumbs.pop()
        if (prev && prev.sid) {
          st.sid = prev.sid
          st.expanded = null
          if (st.follow) navigateSession = { sessionId: prev.sid, kind: 'session' }
        }
      }
      const sid = st.sid
      try {
        const html = await render(st, sid, liveOverlay)
        return { ok: true, html, state: st, navigateSession, flowContext }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e), html: '', state: st }
      }
    }

    tryRegisterTool(ctx, { id: 'flow', label: '流镜', order: 2, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M8 4.5v2.2M8 6.7L4 11M8 6.7l4 4.3"/></svg>' }, handler)
  },
}

}

// Remote 使用标准装饰器的运行时标记；生成代码是普通 JS，因此显式执行 decorator initializer。
const exposeRemote = (klass, method, exportName) => {
  const initializers = []
  Remote(exportName || method)(klass.prototype[method], {
    private: false, static: false, name: method,
    addInitializer(fn) { initializers.push(fn) },
  })
  const marker = Object.create(klass.prototype)
  for (const init of initializers) init.call(marker)
}

class NativeToolboxRemote extends TypertRemoteService {
  constructor(ctx, registry) {
    super(ctx, "toolboxNativeFlow", { namespace: "toolboxNativeFlow" })
    this.registry = registry
  }
  tools(request) {
    const root = request && typeof request.root === 'string' ? request.root : undefined
    return { ok: true, root: root || null, tools: this.registry.tools() }
  }
  panel(request) {
    const root = request && typeof request.root === 'string' ? request.root : undefined
    return this.registry.panel(root, request || {})
  }
  plugins(request) {
    void request
    return { ok: true, plugins: [], capabilities: TOOLBOX_RUNTIME.capabilities }
  }
  async sessionInfo(request) {
    const sid = request && typeof request.session === 'string' ? request.session : ''
    if (!sid) return { ok: false, error: '缺少会话 id' }
    const sessions = this.ctx.get('sessions')
    if (sessions && typeof sessions.get === 'function') {
      try {
        const session = sessions.get(sid)
        const cwd = session && session.header && session.header.cwd
        if (typeof cwd === 'string' && cwd) return { ok: true, cwd }
      } catch (error) {}
    }
    const query = this.ctx.get('sessionQuery')
    if (query && typeof query.listSessions === 'function') {
      try {
        const rows = await query.listSessions()
        const hit = (rows || []).find((row) => row && row.id === sid)
        const cwd = hit && hit.header && hit.header.cwd
        if (typeof cwd === 'string' && cwd) return { ok: true, cwd }
      } catch (error) {}
    }
    return { ok: false, error: '会话不存在或不可读: ' + sid }
  }
}
for (const method of ["tools","panel","plugins","sessionInfo"]) exposeRemote(NativeToolboxRemote, method)

export async function apply(ctx) {
  const registry = makeStaticRegistry()
  ctx.provide(TOOLBOX_RUNTIME.registryService, registry)
  const features = [create_flow()]
  for (const feature of features) {
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
  }
  new NativeToolboxRemote(ctx, registry)
  console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态 Host 已加载（功能: ' + registry.tools().map((x) => x.id).join(', ') + '）')
}
