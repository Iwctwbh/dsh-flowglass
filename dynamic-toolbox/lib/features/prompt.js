// ===== 工具箱 · prompt 原生静态 Host 组件（构建生成，勿手改） =====


export const name = "dsh-dynamic-toolbox/feature/prompt"
export const inject = ["fs","systemPrompt","timer","toolboxRegistryDynamicToolbox"]

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

const create_prompt = () => {
// ===== prompt-tool.js：系统提示词装配查看（Host-only）=====
// systemPrompt.assemble({}) 全局装配（无会话上下文）：sections / contexts / tools /
// variables 四块，点击任意条目展开完整文本。
// 状态：{ open }（open 形如 'sec:0' / 'ctx:0' / 'vars'；文本每次重取，不进 state）

return {
  name: 'prompt-tool',
  inject: ['fs', 'systemPrompt', 'timer'],
  apply(ctx) {
    const sp = ctx.get('systemPrompt')

    const oneLine = (s, max) => {
      const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
      return t.length > max ? t.slice(0, max - 1) + '…' : t
    }
    const CAP = 60000

    // 装配结果 TTL 缓存：连续展开/收起点击（1.5s 窗口内）不再重复全量 assemble；
    // 点「刷新」强制重取。装配是全局无会话的，无需按会话分键。
    let asmCache = null // { at, asm }
    const getAsm = async (force) => {
      const now = Date.now()
      if (!force && asmCache && now - asmCache.at < 1500) return asmCache.asm
      const asm = await sp.assemble({})
      asmCache = { at: now, asm }
      return asm
    }

    const renderList = (title, items, prefix, open) => {
      if (!items.length) return ''
      return '<div class="tb-list-head"><span class="tb-list-title">' + title + '<span class="tb-count">' + items.length + '</span></span></div>' +
        '<div class="tb-list">' + items.map((it, i) => {
          const key = prefix + ':' + i
          return '<div class="tb-rec' + (open === key ? ' tb-rec-active' : '') + '" data-action="open" data-k="' + key + '">' +
            '<div class="tb-rec-main">' +
              '<div class="tb-rec-top"><span class="tb-rec-key">' + esc(it.name) + '</span>' +
              '<span class="tb-rec-summary">' + esc(oneLine(it.text, 80)) + '</span></div>' +
              '<div class="tb-rec-sub"><span>' + fmtSize((it.text || '').length) + '</span></div>' +
            '</div>' +
          '</div>'
        }).join('') + '</div>'
    }

    const handler = async ({ action, fields, state }) => {
      if (!sp) return { ok: false, error: 'systemPrompt 服务不可用', html: '' }
      const st = (state && typeof state === 'object' && state) ? state : { open: null }
      const el = fields && fields.__el ? fields.__el : {}
      if (action === 'open' && el.k) st.open = st.open === String(el.k) ? null : String(el.k)
      else if (action === 'close') st.open = null

      try {
        const asm = await getAsm(action === 'refresh')
        const sections = asm.sections || []
        const contexts = asm.contexts || []
        const tools = asm.tools || []
        const variables = asm.variables || {}
        const totalChars = sections.concat(contexts).reduce((n, s) => n + ((s.text || '').length), 0)

        const parts = []
        parts.push('<div class="jr-tabpanel tb-root tb-pane"><div class="tb-pane-head">')
        parts.push('<div class="tb-banner tb-banner-info">全局装配（无会话上下文）：会话级 section / 变量可能不在其中；结果缓存 1.5s，点「刷新」强制重取 ' +
          '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="refresh">刷新</button></div>')
        parts.push('<div class="tb-stats">' +
          '<div class="tb-stat"><span class="tb-stat-num">' + sections.length + '</span><span class="tb-stat-label">提示词节</span></div>' +
          '<div class="tb-stat"><span class="tb-stat-num">' + contexts.length + '</span><span class="tb-stat-label">上下文块</span></div>' +
          '<div class="tb-stat"><span class="tb-stat-num">' + tools.length + '</span><span class="tb-stat-label">工具 schema</span></div>' +
          '<div class="tb-stat"><span class="tb-stat-num">' + fmtSize(totalChars) + '</span><span class="tb-stat-label">总字符</span></div>' +
        '</div>')

        // 体积占比：最大的 6 个 section/context 各占总量多少（找提示词臃肿点）
        const sized = sections.map((s) => ({ name: s.name, size: (s.text || '').length }))
          .concat(contexts.map((c) => ({ name: c.name + '（ctx）', size: (c.text || '').length })))
          .sort((a, b) => b.size - a.size)
          .slice(0, 6)
        if (totalChars > 0 && sized.length > 1) {
          parts.push('<div class="tb-card"><div class="tb-sec"><span class="tb-sec-label">体积占比 Top ' + sized.length + '</span>' +
            sized.map((s) => {
              const pct = Math.round((s.size / totalChars) * 100)
              return '<div class="tb-row" style="flex-wrap:nowrap" title="' + esc(s.name) + ' · ' + fmtSize(s.size) + '（' + pct + '%）">' +
                '<span class="tb-num" style="min-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.name) + '</span>' +
                '<div style="flex:1;height:8px;border-radius:4px;background:var(--tb-hover-bg,var(--dsw-alias-bg-layer-2,#2b2c33));overflow:hidden">' +
                  '<div style="height:100%;width:' + Math.max(2, pct) + '%;background:var(--tb-accent,#3f6fd9);border-radius:4px"></div>' +
                '</div>' +
                '<span class="tb-num" style="min-width:76px;text-align:right">' + fmtSize(s.size) + ' · ' + pct + '%</span>' +
              '</div>'
            }).join('') + '</div></div>')
        }

        // 详情卡
        if (st.open) {
          const m = /^(\w+):(\d+)$/.exec(st.open)
          let text = null, title = ''
          if (m && m[1] === 'sec' && sections[Number(m[2])]) { text = sections[Number(m[2])].text; title = sections[Number(m[2])].name }
          if (m && m[1] === 'ctx' && contexts[Number(m[2])]) { text = contexts[Number(m[2])].text; title = contexts[Number(m[2])].name }
          if (st.open === 'vars') {
            title = 'variables'
            text = Object.keys(variables).map((k) => k + ' = ' + (variables[k] == null ? '（未设置）' : variables[k])).join('\n')
          }
          if (text != null) {
            parts.push('<div class="tb-preview"><div class="tb-preview-head">' +
              '<span class="tb-preview-name">' + esc(title) + '</span>' +
              '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="close">关闭</button></div>' +
              '<pre class="tb-code">' + esc(text.length > CAP ? text.slice(0, CAP) + '\n…（截断，共 ' + text.length + ' 字符）' : text) + '</pre></div>')
          }
        }

        parts.push('</div>') // .tb-pane-head 结束
        parts.push('<div class="tb-pane-body tb-pane-col">')
        parts.push(renderList('提示词节（sections）', sections, 'sec', st.open))
        parts.push(renderList('上下文块（contexts）', contexts, 'ctx', st.open))
        const varCount = Object.keys(variables).length
        if (varCount) {
          parts.push('<div class="tb-list-head"><span class="tb-list-title">变量（variables）<span class="tb-count">' + varCount + '</span></span></div>' +
            '<div class="tb-list"><div class="tb-rec' + (st.open === 'vars' ? ' tb-rec-active' : '') + '" data-action="open" data-k="vars">' +
            '<div class="tb-rec-main"><div class="tb-rec-top"><span class="tb-rec-key">variables</span>' +
            '<span class="tb-rec-summary">' + esc(oneLine(Object.keys(variables).join(', '), 80)) + '</span></div></div></div></div>')
        }
        parts.push('<div class="tb-note">工具 schema 清单见「工具」Tab</div>')
        parts.push('</div></div>') // .tb-pane-body + .tb-pane 结束
        return { ok: true, html: parts.join(''), state: st }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e), html: '', state: st }
      }
    }

    tryRegisterTool(ctx, { id: 'prompt', label: '提示词', order: 9, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 6.5h6M5 9h4"/></svg>' }, handler)
  },
}

}

export async function apply(ctx) {
  applyingContext = ctx
  try {
    const feature = create_prompt()
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
    console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态组件已加载: prompt')
  } finally {
    applyingContext = null
  }
}
