// ===== 工具箱 · http 原生静态 Host 组件（构建生成，勿手改） =====


export const name = "dsh-dynamic-toolbox/feature/http"
export const inject = ["fs","subprocess","timer","toolboxRegistryDynamicToolbox"]

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
    let snap
    try { snap = await sq.readSession(sid) }
    catch (error) {
      // Some Harness builds pass the complete fork log to a constructor that
      // expects only the inherited seed. Its public raw-event APIs still read
      // the same logical corpus correctly, without making the session live.
      if (!String(error && error.message || error).includes('seeded session constructor seed must equal its inherited prefix') || typeof sq.listEvents !== 'function' || typeof sq.readEvent !== 'function') throw error
      const records = await sq.listEvents(sid)
      if (!Array.isArray(records) || !records.length) throw error
      const events = []
      let header = null
      for (let offset = 0; offset < records.length; offset += 51) {
        const window = await sq.readEvent({ sessionId: sid, seq: records[offset].seq, before: 0, after: Math.min(50, records.length - offset - 1) })
        if (!window || !Array.isArray(window.events) || window.events.length !== Math.min(51, records.length - offset)) throw error
        for (let i = 0; i < window.events.length; i++) if (window.events[i].seq !== records[offset + i].seq) throw error
        header = window.session
        events.push(...window.events)
      }
      snap = { session: header, events }
    }
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


let applyingContext = null
const harness = {
  handle(name, handler) {
    const bridge = applyingContext && applyingContext.get(TOOLBOX_RUNTIME.bridgeService)
    if (!bridge || typeof bridge.register !== 'function') throw new Error('静态工具箱 Bridge 服务不可用')
    return bridge.register(name, handler)
  },
  defineTool(tool) { return tool },
  registerTool() { throw new Error('当前静态组件未启用模型工具服务') },
}

const create_http = () => {
// ===== http-tool.js：HTTP 接口调试工具（Host-only，Postman/Apifox 风格）=====
// method 芯片 + URL + Query Params / Headers 键值对编辑器（启用开关/增删行）+
// Body 类型（none/JSON/raw/form）+ 响应区 Body/响应头切换与 JSON 美化 + 历史一键重发。
// 所有输入常驻 DOM（display:none 隐藏），保证任何动作时表单值完整回传进 state。
// 请求 spec 经环境变量传入 node 子进程 fetch，用户输入不进脚本文本。
// 响应本体留闭包 lastResult（可达 256KB，不进 state——state 每次动作来回传输，必须轻量）。
// 状态：{ method, url, params[], headers[], bodyType, body, form[], tab, resTab, history[] }

return {
  name: 'http-tool',
  inject: ['fs', 'subprocess', 'timer'],
  apply(ctx) {
    const subprocess = ctx.get('subprocess')
    let lastResult = null // 最近一次响应本体（闭包持有，不进 state；插件重跑即清空，面板提示重发）

    // 子进程脚本：数组 join 无内嵌 \n 字面量（规避双层求值转义坑）。
    // 脚本经 argv -e 注入（静态模板 <1KB），请求 spec（含可达 MB 级的 body）走 stdin——
    // 不走 env：Windows 环境块总长 32K 字符，大 body 会让 spawn 莫名失败（审计 L5）
    const FETCH_SCRIPT = [
      "const spec = JSON.parse(require('fs').readFileSync(0, 'utf8'))",
      "const ctrl = new AbortController()",
      "setTimeout(() => ctrl.abort(), 30000)",
      "const t0 = Date.now()",
      "(async () => {",
      "  try {",
      "    const init = { method: spec.method || 'GET', headers: spec.headers || {}, redirect: 'follow', signal: ctrl.signal }",
      "    if (spec.body != null && spec.body !== '' && init.method !== 'GET' && init.method !== 'HEAD') init.body = spec.body",
      "    const res = await fetch(spec.url, init)",
      "    const buf = Buffer.from(await res.arrayBuffer())",
      "    const headers = {}",
      "    res.headers.forEach((v, k) => { headers[k] = v })",
      "    let body = buf.toString('utf8')",
      "    const truncated = body.length > 262144",
      "    if (truncated) body = body.slice(0, 262144)",
      "    process.stdout.write(JSON.stringify({ ok: true, status: res.status, statusText: res.statusText, headers, body, bytes: buf.length, truncated, ms: Date.now() - t0 }))",
      "  } catch (e) {",
      "    process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e), ms: Date.now() - t0 }))",
      "  }",
      "})()",
    ].join('\n')

    const REL_STORE = '.dsh-dynamic-toolbox/toolbox-http.json'

    // sessionId 优先：root 与 session 同时确定（写策略按会话 cwd 授权）
    const resolveWs = (rootArg, sessionId) => {
      const sessionsSvc = ctx.get('sessions')
      if (sessionId && sessionsSvc) {
        try {
          const s = sessionsSvc.get(sessionId)
          const cwd = s && s.header && s.header.cwd
          if (s && typeof cwd === 'string' && cwd) return { root: cwd.replace(/[\\/]+$/, ''), session: s }
        } catch (e) {}
      }
      if (rootArg && /^([A-Za-z]:[\\/]|\/)/.test(rootArg)) return { root: rootArg.replace(/[\\/]+$/, ''), session: null }
      if (sessionsSvc) {
        try {
          let hit = null
          for (const s of sessionsSvc.list()) {
            const cwd = s && s.header && s.header.cwd
            if (typeof cwd === 'string' && cwd) hit = s
          }
          if (hit) return { root: hit.header.cwd.replace(/[\\/]+$/, ''), session: hit }
        } catch (e) {}
      }
      const sp = ctx.get('sandboxPolicy')
      const root = sp && typeof sp.workspaceRoot === 'string' ? sp.workspaceRoot.replace(/[\\/]+$/, '') : ''
      return { root, session: null }
    }

    const runNode = async (script, spec, cwd) => {
      if (!subprocess) return { ok: false, error: 'subprocess 服务不可用' }
      // 外层看门狗 45s：wall-clock 到点主动 terminate()（子进程脚本内的 AbortController 30s 保持不动）。
      // 注意 graceMs 只是「退出后 SIGTERM→SIGKILL 升级窗口」，不是运行超时——别把它当 45s 上限理解。
      const handle = withDeadline(ctx, subprocess.spawn({
        argv: ['node', '-e', script],
        cwd,
        stdio: { stdin: { data: JSON.stringify(spec) }, stdout: { maxBytes: 4 * 1024 * 1024 }, stderr: { maxBytes: 128 * 1024 } },
        graceMs: 45000,
      }), 45000)
      const outcome = await handle.done
      const so = handle.collected.stdout.readFrom(0)
      const se = handle.collected.stderr.readFrom(0)
      // lossy 标志：输出超过 maxBytes 被截尾，记给调用方并入面板提示
      const truncated = !!(so.lossy || se.lossy)
      if (outcome.exitCode !== 0) return { ok: false, error: (se.text || so.text).slice(0, 500), truncated }
      return { ok: true, stdout: so.text, truncated }
    }

    // ---- 键值对（params/headers/form）同步与组装 ----
    const syncKV = (fields, prefix, cur) => {
      const rows = []
      for (let i = 0; ; i++) {
        const k = fields[prefix + '.k.' + i]
        const v = fields[prefix + '.v.' + i]
        if (k === undefined && v === undefined) break
        rows.push({ k: String(k == null ? '' : k), v: String(v == null ? '' : v), on: cur && cur[i] ? cur[i].on !== false : true })
      }
      return rows
    }
    const enabled = (rows) => (rows || []).filter((r) => r.on !== false && r.k)

    // 历史快照脱敏：键名小写匹配这些敏感头的值替换为 '<redacted>' 占位，其余头原样保存
    const SENSITIVE_HEADER_RE = /^(authorization|cookie|proxy-authorization|x-api-key)$/
    const maskHeaders = (rows) => (rows || []).map((r) =>
      (r && r.k && r.v && SENSITIVE_HEADER_RE.test(String(r.k).trim().toLowerCase()))
        ? { k: r.k, v: '<redacted>', on: r.on }
        : r
    )

    const buildRequest = (st) => {
      let url = st.url || ''
      const qp = enabled(st.params)
      if (qp.length) {
        const q = qp.map((r) => encodeURIComponent(r.k) + '=' + encodeURIComponent(r.v)).join('&')
        url += (url.indexOf('?') >= 0 ? '&' : '?') + q
      }
      const headers = {}
      for (const r of enabled(st.headers)) {
        if (r.v === '<redacted>') continue // 历史脱敏占位值不真发出去（重发前需在 Headers 区重填）
        headers[r.k] = r.v
      }
      let body = null
      if (st.bodyType === 'json') {
        body = st.body || ''
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'
      } else if (st.bodyType === 'raw') {
        body = st.body || ''
      } else if (st.bodyType === 'form') {
        body = enabled(st.form).map((r) => encodeURIComponent(r.k) + '=' + encodeURIComponent(r.v)).join('&')
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
      return { method: st.method, url, headers, body }
    }

    const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
    const BODY_TYPES = [['none', 'none'], ['json', 'JSON'], ['raw', 'raw'], ['form', 'form']]
    const TABS = [['params', 'Params'], ['headers', 'Headers'], ['body', 'Body']]
    const statusPill = (s) => {
      if (s >= 200 && s < 300) return 'tb-pill-done'
      if (s >= 300 && s < 400) return 'tb-pill-active'
      if (s >= 400 && s < 500) return 'tb-pill-other'
      return 'tb-pill-plain'
    }
    const pad2 = (n) => (n < 10 ? '0' : '') + n
    const fmtClock = (t) => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) }
    const oneLine = (s, max) => {
      const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
      return t.length > max ? t.slice(0, max - 1) + '…' : t
    }
    const prettyBody = (body) => {
      const t = String(body || '')
      try { return JSON.stringify(JSON.parse(t), null, 2) } catch (e) { return t }
    }

    // ---- 键值对编辑器（Postman 风格：开关 + key + value + 删除 + 添加行）----
    const renderKV = (list, rows, addLabel) => {
      const rowsHtml = (rows || []).map((r, i) =>
        '<div class="tb-row" style="flex-wrap:nowrap;gap:5px">' +
          '<button type="button" class="tb-chip' + (r.on !== false ? ' tb-chip-on' : '') + '" style="height:20px;padding:0 7px;flex:none" data-action="kv-toggle" data-list="' + list + '" data-i="' + i + '" title="启用/禁用">' + (r.on !== false ? '✓' : '○') + '</button>' +
          '<input class="tb-input tb-mono" style="height:26px;width:36%;flex:none" data-field="' + list + '.k.' + i + '" placeholder="Key" value="' + esc(r.k) + '" />' +
          '<input class="tb-input tb-mono" style="height:26px" data-field="' + list + '.v.' + i + '" placeholder="Value" value="' + esc(r.v) + '" />' +
          '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" style="flex:none" data-action="kv-del" data-list="' + list + '" data-i="' + i + '" title="删除">×</button>' +
        '</div>'
      ).join('')
      return rowsHtml + '<div class="tb-row"><button type="button" class="tb-btn tb-btn-sm" data-action="kv-add" data-list="' + list + '">+ ' + addLabel + '</button></div>'
    }

    const render = (st) => {
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root">')
      // 方法 + URL + 发送
      parts.push('<div class="tb-chips">' + METHODS.map((m) =>
        '<button type="button" class="tb-chip' + (st.method === m ? ' tb-chip-on' : '') + '" data-action="method" data-v="' + m + '">' + m + '</button>'
      ).join('') + '</div>')
      parts.push('<div class="tb-query">' +
        '<input class="tb-input tb-mono" data-field="url" placeholder="https://api.example.com/path" value="' + esc(st.url || '') + '" />' +
        '<button type="button" class="tb-btn tb-btn-primary" data-action="send">发送</button>' +
      '</div>')
      // 最终 URL 预览（Params 合并后）
      const req = buildRequest(st)
      if (st.url && req.url !== st.url) {
        parts.push('<div class="tb-note tb-mono" style="word-break:break-all">最终 URL：' + esc(req.url) + '</div>')
      }
      // 分区芯片
      const tab = st.tab || 'params'
      parts.push('<div class="tb-chips">' + TABS.map(([v, label]) => {
        const n = v === 'params' ? enabled(st.params).length : v === 'headers' ? enabled(st.headers).length : (st.bodyType === 'form' ? enabled(st.form).length : (st.bodyType === 'none' ? 0 : 1))
        return '<button type="button" class="tb-chip' + (tab === v ? ' tb-chip-on' : '') + '" data-action="tab" data-v="' + v + '">' + label + (n ? ' ' + n : '') + '</button>'
      }).join('') + '</div>')

      // 三个分区全部渲染，非活跃区 display:none（保证字段随任何动作回传）
      parts.push('<div style="' + (tab === 'params' ? '' : 'display:none') + '">' + renderKV('params', st.params, '参数') + '</div>')
      parts.push('<div style="' + (tab === 'headers' ? '' : 'display:none') + '">' + renderKV('headers', st.headers, '请求头') + '</div>')
      let bodyHtml = '<div class="tb-chips" style="margin-bottom:8px">' + BODY_TYPES.map(([v, label]) =>
        '<button type="button" class="tb-chip' + (st.bodyType === v ? ' tb-chip-on' : '') + '" data-action="body-type" data-v="' + v + '">' + label + '</button>'
      ).join('') + '</div>'
      if (st.bodyType === 'json' || st.bodyType === 'raw') {
        bodyHtml += '<textarea class="tb-textarea" data-field="body" placeholder="' + (st.bodyType === 'json' ? '{ "key": "value" }' : '原始请求体') + '">' + esc(st.body || '') + '</textarea>'
      } else if (st.bodyType === 'form') {
        bodyHtml += renderKV('form', st.form, '表单项')
      } else {
        bodyHtml += '<div class="tb-note">无请求体</div>'
      }
      parts.push('<div style="' + (tab === 'body' ? '' : 'display:none') + '">' + bodyHtml + '</div>')

      // 响应区（本体在闭包 lastResult；state 不带它，切换 Tab/KV 编辑不再来回传大 JSON）
      if (st.notice) parts.push('<div class="tb-banner tb-banner-info">' + esc(st.notice) + '</div>')
      const r = lastResult
      if (r) {
        if (!r.ok) {
          parts.push('<div class="tb-banner tb-banner-error">' + esc(r.error || '请求失败') + (r.ms != null ? '（' + r.ms + 'ms）' : '') + '</div>')
        } else {
          const resTab = st.resTab || 'body'
          parts.push('<div class="tb-card">' +
            '<div class="tb-card-head">' +
              '<span class="tb-pill ' + statusPill(r.status) + '">' + r.status + ' ' + esc(r.statusText || '') + '</span>' +
              '<span class="tb-note">' + r.ms + 'ms · ' + fmtSize(r.bytes) + (r.truncated ? ' · 已截断' : '') + '</span>' +
            '</div>' +
            '<div class="tb-chips">' +
              '<button type="button" class="tb-chip' + (resTab === 'body' ? ' tb-chip-on' : '') + '" data-action="res-tab" data-v="body">响应体</button>' +
              '<button type="button" class="tb-chip' + (resTab === 'headers' ? ' tb-chip-on' : '') + '" data-action="res-tab" data-v="headers">响应头 ' + Object.keys(r.headers || {}).length + '</button>' +
              (r.body ? '<button type="button" class="tb-chip" data-action="copy-res">复制响应体</button>' : '') +
            '</div>' +
            (resTab === 'body'
              ? '<pre class="tb-code" style="max-height:480px">' + esc(prettyBody(r.body) || '（空）') + '</pre>'
              : '<div class="tb-sec">' + Object.keys(r.headers || {}).map((k) =>
                  '<div class="tb-line"><span class="tb-line-status tb-tx-muted" style="width:auto;min-width:120px;text-align:left">' + esc(k) + '</span><span class="tb-line-path">' + esc(r.headers[k]) + '</span></div>'
                ).join('') + '</div>') +
          '</div>')
        }
      }

      // 历史
      const h = st.history || []
      if (h.length) {
        parts.push('<div class="tb-list-head"><span class="tb-list-title">历史<span class="tb-count">' + h.length + '</span></span>' +
          '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="clear-history">清空</button></div>')
        parts.push('<div class="tb-list">' + h.map((it, i) =>
          '<div class="tb-rec" data-action="rerun" data-i="' + i + '" title="点击重新发送">' +
            '<div class="tb-rec-main">' +
              '<div class="tb-rec-top"><span class="tb-pill tb-pill-plain">' + esc(it.m) + '</span>' +
              '<span class="tb-rec-summary">' + esc(oneLine(it.u, 70)) + '</span></div>' +
              '<div class="tb-rec-sub"><span>' + (it.s ? '<span class="' + (it.s < 400 ? 'tb-tx-done' : 'tb-tx-danger') + '">' + esc(it.s) + '</span>' : '<span class="tb-tx-danger">失败</span>') + '</span>' +
              '<span>' + esc(it.ms != null ? it.ms + 'ms' : '') + '</span><span>' + fmtClock(it.t) + '</span></div>' +
            '</div>' +
          '</div>'
        ).join('') + '</div>')
      }
      parts.push('</div>')
      return parts.join('')
    }

    const send = async (st, ws, redactCount) => {
      const spec = buildRequest(st)
      const res = await runNode(FETCH_SCRIPT, spec, ws.root)
      if (!res.ok) { lastResult = { ok: false, error: res.error }; return }
      try {
        lastResult = JSON.parse(res.stdout)
      } catch (e) {
        lastResult = { ok: false, error: '响应解析失败' + (res.truncated ? '（子进程输出超过上限已截尾）' : '') + ': ' + res.stdout.slice(0, 300) }
      }
      const r = lastResult
      st.history = [{
        m: spec.method, u: spec.url,
        params: st.params,
        headers: maskHeaders(st.headers), // 落盘前脱敏：authorization/cookie 等敏感头只存 '<redacted>' 占位
        bodyType: st.bodyType, body: st.body, form: st.form,
        s: r.ok ? r.status : 0, ms: r.ms != null ? r.ms : null, t: Date.now(),
      }].concat(st.history || []).slice(0, 8)
      const persisted = await writeJsonStore(ctx, REL_STORE, st.history, ws.root, ws.session)
      // 提示条并入现有 notice 通道：输出截尾 / 敏感头待重填 / 历史写盘失败
      const notes = []
      if (res.truncated) notes.push('子进程输出超过上限已截尾')
      if (redactCount) notes.push(String(redactCount) + ' 个敏感头需重填')
      if (!persisted) notes.push('⚠ 历史未能写入 ' + REL_STORE + '，仅保存在面板内存中')
      st.notice = notes.join('；') || null
    }

    const handler = async ({ action, fields, state, root, session }) => {
      const ws = resolveWs(root, session)
      const st = (state && typeof state === 'object' && state) ? state : {
        method: 'GET', url: '', params: [], headers: [], bodyType: 'none', body: '', form: [],
        tab: 'params', resTab: 'body', history: [], notice: null,
      }
      if ('result' in st) delete st.result // state 迁移：响应本体已挪闭包（旧 state 里可能还挂着大 JSON）
      if (!Array.isArray(st.params)) st.params = []
      if (!Array.isArray(st.headers)) st.headers = []
      if (!Array.isArray(st.form)) st.form = []
      const el = fields && fields.__el ? fields.__el : {}
      // 全量表单同步（所有输入常驻 DOM，任何动作时值都在 fields 里）
      if (typeof fields.url === 'string') st.url = fields.url
      if (typeof fields.body === 'string') st.body = fields.body
      const p = syncKV(fields, 'params', st.params); if (p.length || st.tab === 'params') st.params = p
      const hh = syncKV(fields, 'headers', st.headers); if (hh.length || st.tab === 'headers') st.headers = hh
      const f = syncKV(fields, 'form', st.form); if (f.length || (st.tab === 'body' && st.bodyType === 'form')) st.form = f

      const LIST_OF = { params: 'params', headers: 'headers', form: 'form' }
      if (action === 'method' && el.v) st.method = String(el.v)
      else if (action === 'tab' && el.v) st.tab = String(el.v)
      else if (action === 'res-tab' && el.v) st.resTab = String(el.v)
      else if (action === 'body-type' && el.v) st.bodyType = String(el.v)
      else if (action === 'kv-add' && LIST_OF[el.list]) st[el.list].push({ k: '', v: '', on: true })
      else if (action === 'kv-del' && LIST_OF[el.list] && el.i != null) st[el.list].splice(Number(el.i), 1)
      else if (action === 'kv-toggle' && LIST_OF[el.list] && el.i != null) {
        const row = st[el.list][Number(el.i)]
        if (row) row.on = row.on === false
      }
      else if (action === 'send') {
        if (!/^https?:\/\//i.test(st.url || '')) {
          lastResult = { ok: false, error: '请输入以 http(s):// 开头的 URL' }
        } else {
          await send(st, ws)
        }
      }
      else if (action === 'rerun' && el.i != null) {
        const it = (st.history || [])[Number(el.i)]
        if (it) {
          st.method = it.m; st.url = it.u
          st.params = it.params || []; st.headers = it.headers || []
          st.bodyType = it.bodyType || 'none'; st.body = it.body || ''; st.form = it.form || []
          // 历史快照里敏感头是 '<redacted>' 占位：buildRequest 组装时跳过这些头，这里统计数量提醒重填
          const nRedacted = (st.headers || []).filter((r) => r && r.v === '<redacted>').length
          await send(st, ws, nRedacted)
        }
      }
      else if (action === 'clear-history') {
        st.history = []
        const persisted = await writeJsonStore(ctx, REL_STORE, [], ws.root, ws.session)
        st.notice = persisted ? null : '⚠ 历史未能写入 ' + REL_STORE + '，仅保存在面板内存中'
      }
      else if (action === '') {
        // 打开 Tab：磁盘为准恢复历史（面板 state 只是镜像）
        const saved = await readJsonStore(ctx, REL_STORE, ws.root, null)
        if (Array.isArray(saved)) st.history = saved
        st.notice = null
      }

      const out = { ok: true, html: render(st), state: st }
      if (action === 'copy-res' && lastResult && lastResult.ok && lastResult.body) out.copy = lastResult.body
      return out
    }

    tryRegisterTool(ctx, { id: 'http', label: 'HTTP', order: 4, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8h9"/><path d="M8 4.5L11.5 8 8 11.5"/><circle cx="13.5" cy="8" r="1.2"/></svg>' }, handler)
  },
}

}

export async function apply(ctx) {
  applyingContext = ctx
  try {
    const feature = create_http()
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
    console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态组件已加载: http')
  } finally {
    applyingContext = null
  }
}
