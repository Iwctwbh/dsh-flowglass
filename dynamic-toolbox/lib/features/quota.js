// ===== 工具箱 · quota 原生静态 Host 组件（构建生成，勿手改） =====


export const name = "dsh-dynamic-toolbox/feature/quota"
export const inject = ["subprocess","timer","toolboxRegistryDynamicToolbox"]

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

const create_quota = () => {
// ===== quota-tool.js：API 配额查询（Host-only，经工具箱 RPC 注册）=====
// 多提供商配额/余额查询（提供商与数据接口分类参考 cc-switch 的用量查询模板）：
//   · Kimi Coding（k3）：GET api.kimi.com/coding/v1/usages（官方 usages：周额度 + 5h 滑动窗口 + 并发）
//   · DeepSeek：GET api.deepseek.com/user/balance（官方余额：总额 / 赠送 / 充值，is_available）
//   · Qwen Token Plan（阿里云百炼）：POST bailian.console.aliyun.com/data/api.json?…queryCodingPlanInstanceInfoV2
//     （端点与 5h/周/月窗口字段参考 CodexBar 文档；部分 CN 账号 API 模式可能要求控制台会话，失败时明示）
// Key 凭据链：环境变量 → ~/.dsh/.credentials.yaml（键名随提供商，Node 子进程读取，沙箱外）。
// 子进程跑 https 查询（插件求值器无 fetch/process；Node 走系统 TUN 代理可直连，curl 走 schannel 会被拒）。
// 状态：{ loading, error, data, at, provider }（data 是脱敏后的余量摘要，key 永不出子进程）
// 注：查询走用户自己的 API Key，产生的是配额查询请求（轻量，不计入模型 token 用量）。

return {
  name: 'quota-tool',
  inject: ['subprocess', 'timer'],
  apply(ctx) {
    const subprocess = ctx.get('subprocess')

    // 提供商表：id / 显示名 / 凭据键名（cc-switch 模板分类：Token Plan 套餐配额 + 第三方余额）
    // qwen 特殊：阿里云未开放套餐用量 API key 接口（zeldaEasy 端点实测 ConsoleNeedLogin），
    // 只能走控制台 Cookie 会话（CodexBar baseline 同款）——凭据键为 Cookie 而非 API key
    const PROVIDERS = [
      { id: 'kimi', label: 'Kimi Coding', keyName: 'KIMI_CODING_API_KEY' },
      { id: 'deepseek', label: 'DeepSeek', keyName: 'DEEPSEEK_API_KEY' },
      { id: 'qwen', label: 'Qwen Plan · 百炼', keyName: 'QWEN_TOKEN_PLAN_CN_API_KEY', credName: 'QWEN_TOKEN_PLAN_CN_COOKIE', credNote: '控制台 Cookie（bailian.console.aliyun.com 登录后从浏览器复制）' },
    ]
    const providerOf = (id) => {
      for (const p of PROVIDERS) { if (p.id === id) return p }
      return PROVIDERS[0]
    }

    // 子进程脚本：读凭据 → 按提供商查询 → 输出归一化 JSON（windows[] 配额窗口 / balances[] 余额）。
    // 数组 join 规避模板 \n 转义坑（PLUGIN-DEV.md 血泪）；提供商 id/键名经 JSON.stringify 内联。
    const scriptFor = (pid, keyName, cookieName) => [
      "const https = require('https')",
      "const fs = require('fs')",
      "const os = require('os')",
      "const path = require('path')",
      'const PID = ' + JSON.stringify(pid),
      'const KEY_NAME = ' + JSON.stringify(keyName),
      'const COOKIE_NAME = ' + JSON.stringify(cookieName || ''),
      "function readNamed(n) {",
      "  if (!n) return ''",
      "  if (process.env[n]) return process.env[n]",
      "  try {",
      "    const f = path.join(os.homedir(), '.dsh', '.credentials.yaml')",
      "    const re = new RegExp('^' + n + ':\\\\s*(.+)\\\\s*$', 'm')",
      "    const m = fs.readFileSync(f, 'utf8').match(re)",
      "    if (m) return m[1].trim()",
      "  } catch (e) {}",
      "  return ''",
      "}",
      "const out = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0) }",
      "const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0 }",
      "const key = readNamed(KEY_NAME)",
      "if (!key && PID !== 'qwen') out({ ok: false, error: '未找到 ' + KEY_NAME + '（环境变量或 ~/.dsh/.credentials.yaml）' })",
      "function req(o) { return new Promise((resolve) => {",
      "  const r = https.request({ host: o.host, port: 443, path: o.path, method: o.method, timeout: 20000, headers: o.headers }, (res) => {",
      "    let body = ''",
      "    res.on('data', (c) => body += c)",
      "    res.on('end', () => {",
      "      let j = null",
      "      try { j = JSON.parse(body) } catch (e) {}",
      "      resolve({ status: res.statusCode, json: j, raw: body })",
      "    })",
      "  })",
      "  r.on('error', (e) => resolve({ status: 0, error: '网络错误: ' + e.message }))",
      "  r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: '请求超时（20s）' }) })",
      "  if (o.body) r.write(o.body)",
      "  r.end()",
      "})}",
      "(async () => {",
      "  try {",
      // ---- Kimi Coding：官方 usages（周额度 + 滑动窗口 + 并发）----
      "    if (PID === 'kimi') {",
      "      const r = await req({ host: 'api.kimi.com', path: '/coding/v1/usages', method: 'GET', headers: { Authorization: 'Bearer ' + key, 'User-Agent': 'KimiCLI/1.5' } })",
      "      if (r.error) out({ ok: false, error: r.error })",
      "      const j = r.json || {}",
      "      if (r.status !== 200) out({ ok: false, error: 'HTTP ' + r.status + ': ' + ((j.error && j.error.message) || (r.raw || '').slice(0, 200)) })",
      "      const usage = j.usage || {}",
      "      const win = (j.limits && j.limits[0] && j.limits[0].detail) || {}",
      "      const winInfo = (j.limits && j.limits[0] && j.limits[0].window) || {}",
      "      out({ ok: true, data: {",
      "        plan: (j.user && j.user.membership && j.user.membership.level) || '',",
      "        windows: [",
      "          { label: '主额度（每周重置）', used: num(usage.used), total: num(usage.limit), resetTime: usage.resetTime || '' },",
      "          { label: '限流窗口（' + (num(winInfo.duration) || 300) + ' 分钟滑动）', used: num(win.used), total: num(win.limit), resetTime: win.resetTime || '' },",
      "        ],",
      "        extra: '并发 ' + ((j.parallel && Array.isArray(j.parallel.details)) ? j.parallel.details.length : 0) + ' / ' + num(j.parallel && j.parallel.limit) + ((j.boosterWallet && j.boosterWallet.status && j.boosterWallet.status !== 'STATUS_DISABLED') ? ' · 加量包已启用' : '')",
      "      } })",
      "    }",
      // ---- DeepSeek：官方余额（is_available + 各币种总额/赠送/充值）----
      "    else if (PID === 'deepseek') {",
      "      const r = await req({ host: 'api.deepseek.com', path: '/user/balance', method: 'GET', headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } })",
      "      if (r.error) out({ ok: false, error: r.error })",
      "      const j = r.json || {}",
      "      if (r.status !== 200) out({ ok: false, error: 'HTTP ' + r.status + ': ' + ((j.error && j.error.message) || (r.raw || '').slice(0, 200)) })",
      "      const infos = Array.isArray(j.balance_infos) ? j.balance_infos : []",
      "      out({ ok: true, data: {",
      "        available: !!j.is_available,",
      "        balances: infos.map((b) => ({ currency: b.currency || '', total: num(b.total_balance), granted: num(b.granted_balance), toppedUp: num(b.topped_up_balance) }))",
      "      } })",
      "    }",
      // ---- Qwen Token Plan（阿里云百炼 Coding Plan）：控制台 Cookie 会话模式 ----
      // 阿里云未开放套餐用量 API key 接口（zeldaEasy 实测 ConsoleNeedLogin），只能控制台会话（CodexBar baseline 同款）
      "    else if (PID === 'qwen') {",
      "      const cookie = readNamed(COOKIE_NAME)",
      "      if (!cookie) out({ ok: false, error: 'Qwen Plan 套餐用量阿里云未开放 API key 查询接口（实测 ConsoleNeedLogin），仅支持控制台会话：登录百炼控制台 bailian.console.aliyun.com 后，浏览器 F12 → Network → 任意请求 → 复制 Cookie 整行，写入凭据键 ' + COOKIE_NAME + '（环境变量或 ~/.dsh/.credentials.yaml）；或前往控制台「订阅套餐」页直接查看' })",
      "      const qPath = '/data/api.json?action=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&product=broadscope-bailian&api=queryCodingPlanInstanceInfoV2'",
      "      const r = await req({ host: 'bailian.console.aliyun.com', path: qPath, method: 'POST', body: '{}', headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' } })",
      "      if (r.error) out({ ok: false, error: r.error })",
      "      if (r.status !== 200) out({ ok: false, error: 'HTTP ' + r.status + ': ' + (r.raw || '').slice(0, 200) })",
      "      const j = r.json || {}",
      "      if (j.code === 'ConsoleNeedLogin') out({ ok: false, error: '控制台 Cookie 已过期或不完整，请重新登录百炼控制台后复制最新 Cookie 更新到 ' + COOKIE_NAME })",
      "      const datas = j.data || {}",
      "      const infos = Array.isArray(datas.codingPlanInstanceInfos) ? datas.codingPlanInstanceInfos : []",
      "      if (!infos.length) out({ ok: false, error: '未返回套餐信息：' + (r.raw || '').slice(0, 160) })",
      "      const inst = infos[0] || {}",
      "      const q = inst.codingPlanQuotaInfo || datas.codingPlanQuotaInfo || {}",
      "      const wins = []",
      "      if (num(q.per5HourTotalQuota)) wins.push({ label: '5 小时窗口', used: num(q.per5HourUsedQuota), total: num(q.per5HourTotalQuota), resetTime: q.per5HourQuotaNextRefreshTime || '' })",
      "      if (num(q.perWeekTotalQuota)) wins.push({ label: '每周额度', used: num(q.perWeekUsedQuota), total: num(q.perWeekTotalQuota), resetTime: q.perWeekQuotaNextRefreshTime || '' })",
      "      if (num(q.perBillMonthTotalQuota)) wins.push({ label: '每月额度', used: num(q.perBillMonthUsedQuota), total: num(q.perBillMonthTotalQuota), resetTime: q.perBillMonthQuotaNextRefreshTime || '' })",
      "      out({ ok: true, data: { plan: inst.planName || inst.instanceName || inst.packageName || '', windows: wins } })",
      "    }",
      "  } catch (e) { out({ ok: false, error: '查询异常: ' + String((e && e.message) || e) }) }",
      "})()",
    ].join('\n')

    const runQuery = async (wsRoot, pid) => {
      if (!subprocess) return { ok: false, error: 'subprocess 服务不可用' }
      const p = providerOf(pid)
      try {
        // 外层看门狗 30s：wall-clock 到点主动 terminate()（内层 https timeout:20000+destroy 是应用层读超时，保持不动；
        // DNS 卡死/连接挂起不经过它）。注意 graceMs 只是「退出后 SIGTERM→SIGKILL 升级窗口」，不是运行超时。
        const handle = withDeadline(ctx, subprocess.spawn({
          argv: ['node', '-e', scriptFor(p.id, p.keyName, p.credName)],
          cwd: wsRoot,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 16 * 1024 } },
          graceMs: 30000,
        }), 30000)
        const outcome = await handle.done
        const so = handle.collected.stdout.readFrom(0)
        if (outcome.exitCode !== 0) {
          return { ok: false, error: handle.collected.stderr.readFrom(0).text.slice(0, 300) || '子进程失败' }
        }
        // lossy：stdout 超 64KB 上限被截尾，JSON 大概率已残缺——给出明确错误而不是晦涩的 SyntaxError
        if (so.lossy) {
          try { return Object.assign(JSON.parse(so.text), { truncated: true }) } catch (e) {}
          return { ok: false, error: '查询输出超过上限（64KB）已截尾，结果不完整', truncated: true }
        }
        return JSON.parse(so.text)
      } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
    }

    // 用量比例 → 状态色（剩余比例越高越绿，低则黄/红）
    const levelOf = (remaining, limit) => {
      if (!limit) return 'plain'
      const r = remaining / limit
      if (r > 0.5) return 'done'
      if (r > 0.2) return 'other'
      return 'warn'
    }
    const fmtTime = (iso) => {
      if (!iso) return '—'
      try {
        // 兼容 ISO 字符串与数字时间戳（秒/毫秒，百炼窗口刷新时间是 epoch）
        let d
        if (typeof iso === 'number' || /^\d{10,}$/.test(String(iso))) {
          let n = Number(iso)
          if (n < 1e12) n *= 1000
          d = new Date(n)
        } else {
          d = new Date(iso)
        }
        if (isNaN(d.getTime())) return String(iso)
        const p2 = (n) => (n < 10 ? '0' : '') + n
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes())
      } catch (e) { return String(iso) }
    }
    const fmtNum = (n) => {
      const v = Number(n)
      if (!isFinite(v)) return String(n)
      return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : String(v)
    }
    const bar = (used, limit) => {
      if (!limit) return ''
      const pct = Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
      return '<div style="flex:1;height:8px;border-radius:999px;background:var(--tb-input-bg,var(--dsw-alias-bg-layer-1,#26272e));border:1px solid var(--tb-border-2,var(--dsw-alias-border-l2,#454650));overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:var(--tb-accent,#3f6fd9);transition:width .2s"></div></div>'
    }

    // 配额窗口卡片（统一模型：label + 剩余 pill + 进度条 + 重置时间）
    const windowCard = (w) => {
      const remaining = Math.max(0, (w.total || 0) - (w.used || 0))
      return '<div class="tb-card"><div class="tb-sec"><span class="tb-sec-label">' + esc(w.label) + '</span>' +
        '<div class="tb-row"><span class="tb-pill tb-pill-' + levelOf(remaining, w.total) + '">剩 ' + fmtNum(remaining) + '</span>' +
        '<span class="tb-note">已用 ' + fmtNum(w.used) + ' / ' + fmtNum(w.total) + '</span></div>' +
        '<div class="tb-row">' + bar(w.used, w.total) + '</div>' +
        '<div class="tb-note">重置：' + esc(fmtTime(w.resetTime)) + '（本地）</div>' +
      '</div></div>'
    }

    const LEVEL_LABEL = { LEVEL_ADVANCED: '高级版', LEVEL_BASIC: '基础版', LEVEL_FREE: '免费版' }

    const render = (st) => {
      const p = providerOf(st.provider)
      const d = st.data
      // Tab 角标：第一窗口剩余量 / 余额总值
      let badge = ''
      if (d && Array.isArray(d.windows) && d.windows.length) badge = fmtNum(Math.max(0, (d.windows[0].total || 0) - (d.windows[0].used || 0)))
      else if (d && Array.isArray(d.balances) && d.balances.length) badge = fmtNum(d.balances[0].total)
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root" data-tab-badge="' + esc(badge) + '">')
      if (st.truncated) parts.push('<div class="tb-banner tb-banner-info">输出超过上限已截尾</div>')
      // 提供商选择芯片 + 刷新
      parts.push('<div class="tb-row">' +
        PROVIDERS.map((pv) => '<button type="button" class="tb-chip' + (pv.id === p.id ? ' tb-chip-on' : '') + '" data-action="pick" data-v="' + pv.id + '">' + esc(pv.label) + '</button>').join('') +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-action="query"' + (st.loading ? ' disabled' : '') + '>' + (st.loading ? '查询中…' : '刷新') + '</button>' +
      '</div>')
      parts.push('<div class="tb-row"><span class="tb-note">' + (p.credName ? '凭据键 ' + p.credName + '（' + p.credNote + '）' : '凭据键 ' + p.keyName + '（环境变量 / ~/.dsh/.credentials.yaml）') + '</span>' +
        (st.at ? '<span class="tb-note">更新于 ' + esc(st.at) + '</span>' : '') + '</div>')
      if (st.error) parts.push('<div class="tb-banner tb-banner-error">' + esc(st.error) + '</div>')
      if (d) {
        if (d.plan) {
          parts.push('<div class="tb-pills"><span class="tb-pill tb-pill-active">' + esc(LEVEL_LABEL[d.plan] || d.plan) + '</span>' +
            (d.extra ? '<span class="tb-pill tb-pill-plain">' + esc(d.extra) + '</span>' : '') + '</div>')
        }
        if (Array.isArray(d.windows)) for (const w of d.windows) parts.push(windowCard(w))
        if (Array.isArray(d.balances)) {
          for (const b of d.balances) {
            parts.push('<div class="tb-card"><div class="tb-sec"><span class="tb-sec-label">余额（' + esc(b.currency || '币种') + '）</span>' +
              '<div class="tb-row"><span class="tb-pill tb-pill-' + (b.total > 5 ? 'done' : b.total > 1 ? 'other' : 'warn') + '">总 ' + fmtNum(b.total) + '</span>' +
              '<span class="tb-note">赠送 ' + fmtNum(b.granted) + ' · 充值 ' + fmtNum(b.toppedUp) + '</span></div>' +
            '</div></div>')
          }
          parts.push('<div class="tb-note">账户状态：' + (d.available ? '可用' : '不可用（余额不足或已停用）') + '</div>')
        }
        if (!d.windows && !d.balances) parts.push('<div class="tb-notice">该提供商未返回配额窗口</div>')
        if (p.id === 'kimi') parts.push('<div class="tb-note">双层限流：周额度 + 滑动窗口，任一耗尽触发 429。额度查询本身不计模型 token。</div>')
      } else if (!st.error && !st.loading) {
        parts.push('<div class="tb-notice">点「刷新」查询 ' + esc(p.label) + ' 配额/余额</div>')
      }
      parts.push('</div>')
      return parts.join('')
    }

    const handler = async ({ action, fields, state, root, session }) => {
      const ws = resolveWorkspace(ctx, root, session)
      const st = (state && typeof state === 'object' && state) ? state : { loading: false, error: null, data: null, at: null, provider: 'kimi', truncated: false }
      if (!providerOf(st.provider).id || PROVIDERS.every((p) => p.id !== st.provider)) st.provider = 'kimi'
      const el = fields && fields.__el ? fields.__el : {}

      if (action === 'pick' && el.v) {
        // 切换提供商：清空旧数据并立即查询新提供商
        st.provider = String(el.v)
        st.data = null
        st.error = null
        action = 'query'
      }
      if (action === 'query' || (action === '' && !st.data && !st.error)) {
        st.loading = true
        const r = await runQuery(ws.root, st.provider)
        st.loading = false
        if (r && r.ok) {
          st.data = r.data
          st.error = null
          st.truncated = !!r.truncated // 输出截尾标志 → 面板顶部提示条
          try { st.at = new Date().toTimeString().slice(0, 8) } catch (e) { st.at = '' }
        } else {
          st.error = (r && r.error) || '查询失败'
          st.truncated = false
        }
      }
      return { ok: true, html: render(st), state: st }
    }

    tryRegisterTool(ctx, { id: 'quota', label: '配额', order: 25, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 11.5a6.5 6.5 0 0 1 11 0"/><path d="M8 6v2.5l2.5 1.5"/></svg>' }, handler)
  },
}

}

export async function apply(ctx) {
  applyingContext = ctx
  try {
    const feature = create_quota()
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
    console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态组件已加载: quota')
  } finally {
    applyingContext = null
  }
}
