// ===== 工具箱 · calc 原生静态 Host 组件（构建生成，勿手改） =====


export const name = "dsh-dynamic-toolbox/feature/calc"
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

const create_calc = () => {
// ===== calc-tool.js：计算台（Host-only）— codec/regex/cron/txtdiff/gen 5 合一 =====
// 纯计算/纯 JS 小工具合并为单插件单 Tab「计算」，内部子模式芯片切换；
// 每个子模式独立状态命名空间（st.codec / st.regex / st.cron / st.txtdiff / st.gen），互不干扰。
// 大本体（txtdiff diff 行 / gen 随机串上限）沿用原实现的闭包或直接进子状态（有界）。
// 状态：{ sub, codec{...}, regex{...}, cron{...}, txtdiff{...}, gen{...} }

return {
  name: 'calc-tool',
  inject: ['fs', 'subprocess', 'timer'],
  apply(ctx) {
    const subprocess = ctx.get('subprocess')

    // ================= 子模式 codec：编解码 =================
    const CODEC_MODES = [
      ['b64e', 'Base64 编码'], ['b64d', 'Base64 解码'],
      ['urle', 'URL 编码'], ['urld', 'URL 解码'],
      ['jp', 'JSON 美化'], ['jm', 'JSON 压缩'],
      ['tsd', '时间戳 → 日期'], ['dts', '日期 → 时间戳'],
    ]
    const pad2 = (n) => (n < 10 ? '0' : '') + n
    const fmtLocal = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
    const codecConvert = (mode, input) => {
      const s = String(input == null ? '' : input)
      switch (mode) {
        case 'b64e': return { out: b64encode(s) }
        case 'b64d': return { out: b64decode(s.trim()) }
        case 'urle': return { out: encodeURIComponent(s) }
        case 'urld': return { out: decodeURIComponent(s) }
        case 'jp': return { out: JSON.stringify(JSON.parse(s), null, 2) }
        case 'jm': return { out: JSON.stringify(JSON.parse(s)) }
        case 'tsd': {
          let n = Number(s.trim())
          if (!isFinite(n)) return { error: '请输入数字时间戳（秒或毫秒）' }
          if (Math.abs(n) < 1e12) n = n * 1000
          const d = new Date(n)
          if (isNaN(d.getTime())) return { error: '时间戳超出有效范围' }
          return { out: '本地时间  ' + fmtLocal(d) + '\nISO       ' + d.toISOString() + '\n毫秒      ' + n }
        }
        case 'dts': {
          const t = Date.parse(s.trim())
          if (isNaN(t)) return { error: '无法解析日期，示例：2026-08-16 12:30:00 或 2026-08-16T04:30:00Z' }
          return { out: '毫秒时间戳  ' + t + '\n秒时间戳    ' + Math.floor(t / 1000) + '\nISO         ' + new Date(t).toISOString() }
        }
        default: return { error: '未知模式' }
      }
    }

    // ================= 子模式 regex：正则 =================
    const REGEX_FLAGS = [['g', '全局'], ['i', '忽略大小写'], ['m', '多行'], ['s', '点跨行'], ['u', 'Unicode']]
    const REGEX_CAP = 200
    const REGEX_PRESETS = [
      ['邮箱', '[\\w.-]+@[\\w-]+(\\.[\\w-]+)+', '联系 a.b-c@example.com 或 x@sub.domain.org'],
      ['手机号', '1[3-9]\\d{9}', '拨打 13812345678 或 19900001111'],
      ['URL', 'https?://[^\\s"\'<>]+', '见 https://example.com/a?b=1 和 http://x.org'],
      ['日期', '\\d{4}-\\d{2}-\\d{2}', '从 2026-08-16 到 2026-09-01'],
      ['UUID', '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', 'id: 2b9fbdc9-397f-43e4-921a-a46097560876'],
      ['中文段', '[\\u4e00-\\u9fa5]+', '混合 English 与 中文连续 段落'],
      ['IPv4', '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', '127.0.0.1 与 10.0.0.256'],
    ]
    // 正则执行迁入 node 子进程（审计 M2）：用户正则在主进程内同步 exec 时，灾难性回溯
    // （如 (a+)+$ 配长文本）会冻结整个 DSH 事件循环；REGEX_CAP 只限匹配条数、限不住回溯时间。
    // 脚本为静态模板（无用户输入插值），spec 经 stdin 传入（文本可 MB 级，避开 env 32K），
    // 父侧 withDeadline 3s 看门狗兜底——超时即 terminate，面板提示「已中止」。
    const REGEX_SCRIPT = [
      "const fs = require('fs')",
      "const spec = JSON.parse(fs.readFileSync(0, 'utf8'))",
      "const out = { ok: true, matches: [], error: null, truncated: false, count: 0, replaced: null }",
      "try {",
      "  const CAP = 200",
      "  const re = new RegExp(spec.pattern, (spec.flags || []).join(''))",
      "  if (spec.op === 'replace') {",
      "    let count = 0",
      "    if (re.global) { const cnt = new RegExp(spec.pattern, (spec.flags || []).join('')); let m",
      "      while ((m = cnt.exec(spec.text)) !== null) { count++; if (m[0] === '') cnt.lastIndex++; if (count >= 100000) break } }",
      "    else count = re.test(spec.text) ? 1 : 0",
      "    out.count = count",
      "    out.replaced = String(spec.text).replace(re, spec.replacement == null ? '' : String(spec.replacement))",
      "  } else {",
      "    let m",
      "    if (re.global) { while ((m = re.exec(spec.text)) !== null) {",
      "      if (out.matches.length >= CAP) { out.truncated = true; break }",
      "      out.matches.push({ i: m.index, text: m[0], groups: m.slice(1) })",
      "      if (m[0] === '') re.lastIndex++",
      "    } } else { const mm = re.exec(spec.text); if (mm) out.matches.push({ i: mm.index, text: mm[0], groups: mm.slice(1) }) }",
      "  }",
      "} catch (e) { out.ok = false; out.error = String((e && e.message) || e); out.matches = []; out.truncated = false; out.count = 0; out.replaced = null }",
      "process.stdout.write(JSON.stringify(out))",
    ].join('\n')
    const runRegexChild = async (op, pattern, flags, text, replacement, wsRoot) => {
      const r = await runChildJson(REGEX_SCRIPT, { op, pattern, flags: flags || ['g'], text: String(text == null ? '' : text), replacement }, wsRoot, 3000)
      if (r.ok === false) return op === 'replace' ? { out: '', count: 0, error: r.error } : { matches: [], error: r.error, truncated: false }
      return op === 'replace'
        ? { out: r.replaced == null ? '' : r.replaced, count: r.count || 0, error: r.error }
        : { matches: r.matches || [], error: r.error, truncated: !!r.truncated }
    }
    // 结果缓存（闭包，同 lastCron 先例）：渲染只画缓存，不再每次 render 现算——
    // key 是参数签名，输入变化后旧结果不展示，须重新点「测试」
    let lastRegex = null
    const regexSigOf = (r) => JSON.stringify([r.mode === 'replace' ? 'replace' : 'match', r.pattern || '', (r.flags || []).slice().sort(), r.text || '', r.replacement || ''])

    // ================= 子模式 cron：Cron 表达式 =================
    // 派生结果（字段明细含 Set / 未来时刻数组）留闭包——Set 不可 JSON 序列化，
    // 进 state 跨 RPC 会变空对象（原独立插件同样如此：每次动作现算，state 只留 expr）。
    let lastCronParsed = null
    let lastCronRuns = null
    const CRON_FIELDS = [
      { key: 'minute', label: '分', min: 0, max: 59 },
      { key: 'hour', label: '时', min: 0, max: 23 },
      { key: 'dom', label: '日', min: 1, max: 31 },
      { key: 'month', label: '月', min: 1, max: 12, names: { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 } },
      { key: 'dow', label: '周', min: 0, max: 7, names: { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } },
    ]
    const cronParseField = (text, def) => {
      const raw = String(text == null ? '' : text).trim()
      if (!raw) return { error: '不能为空' }
      const vals = new Set()
      let any = false
      const nameOf = (s) => {
        const up = s.toUpperCase()
        if (def.names && Object.prototype.hasOwnProperty.call(def.names, up)) return def.names[up]
        if (!/^\d+$/.test(s)) return null
        return Number(s)
      }
      for (const part0 of raw.split(',')) {
        const part = part0.trim()
        if (!part) return { error: '存在空项（多余逗号）' }
        const slash = part.split('/')
        if (slash.length > 2 || (slash[1] !== undefined && (!/^\d+$/.test(slash[1]) || Number(slash[1]) < 1))) return { error: '非法步长: ' + part }
        const step = slash[1] !== undefined ? Number(slash[1]) : 1
        let lo
        let hi
        const base = slash[0]
        if (base === '*' || base === '') {
          lo = def.min; hi = def.max
          if (base === '*' && step === 1) any = true
        } else if (base.indexOf('-') >= 0) {
          const pair = base.split('-')
          if (pair.length !== 2) return { error: '非法范围: ' + part }
          lo = nameOf(pair[0]); hi = nameOf(pair[1])
          if (lo == null || hi == null) return { error: '非法范围端点: ' + part }
          if (lo > hi) return { error: '范围起点大于终点: ' + part }
        } else {
          const v = nameOf(base)
          if (v == null) return { error: '非法值: ' + base }
          lo = v
          hi = slash[1] !== undefined ? def.max : v
        }
        if (lo < def.min || hi > def.max) return { error: '超出范围(' + def.min + '-' + def.max + '): ' + part }
        for (let v = lo; v <= hi; v += step) vals.add(def.key === 'dow' && v === 7 ? 0 : v)
      }
      return { set: vals, any }
    }
    const cronParse = (expr) => {
      const segs = String(expr || '').trim().split(/\s+/)
      if (segs.length !== 5) return { error: '需要 5 段（分 时 日 月 周），当前 ' + segs.length + ' 段' }
      const fields = []
      for (let i = 0; i < 5; i++) {
        const r = cronParseField(segs[i], CRON_FIELDS[i])
        if (r.error) return { error: '第 ' + (i + 1) + ' 段（' + CRON_FIELDS[i].label + '）' + r.error }
        fields.push(r)
      }
      return { fields }
    }
    const cronMatchDay = (dom, dow, y, mo, d) => {
      const dt = new Date(y, mo, d)
      const domHit = dom.set.has(d)
      const dowHit = dow.set.has(dt.getDay())
      if (!dom.any && !dow.any) return domHit || dowHit
      return domHit && dowHit
    }
    const cronNextRuns = (fields, count) => {
      const [minute, hour, dom, month, dow] = fields
      const out = []
      const t = new Date()
      t.setSeconds(0, 0)
      t.setMinutes(t.getMinutes() + 1)
      const limit = new Date(t.getTime())
      limit.setFullYear(limit.getFullYear() + 4)
      let cur = t
      while (out.length < count && cur < limit) {
        if (!month.set.has(cur.getMonth() + 1)) { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 0, 0); continue }
        if (!cronMatchDay(dom, dow, cur.getFullYear(), cur.getMonth(), cur.getDate())) {
          cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0)
          continue
        }
        if (!hour.set.has(cur.getHours())) { cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), cur.getHours() + 1, 0); continue }
        if (!minute.set.has(cur.getMinutes())) { cur = new Date(cur.getTime() + 60000); continue }
        out.push(new Date(cur))
        cur = new Date(cur.getTime() + 60000)
      }
      return out
    }
    const CRON_WEEK = ['日', '一', '二', '三', '四', '五', '六']
    const cronFmtRun = (d) =>
      d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' 周' + CRON_WEEK[d.getDay()]
    const cronFmtIn = (d) => {
      const mins = Math.max(0, Math.round((d.getTime() - Date.now()) / 60000))
      if (mins < 60) return mins + ' 分钟后'
      if (mins < 1440) return Math.floor(mins / 60) + ' 小时 ' + (mins % 60) + ' 分后'
      return Math.floor(mins / 1440) + ' 天 ' + Math.floor((mins % 1440) / 60) + ' 时后'
    }
    const cronSummarize = (set, min, max, any) => {
      if (any) return '每个'
      const arr = [...set].sort((a, b) => a - b)
      if (arr.length > 12) return arr.slice(0, 12).join(',') + ' …（共 ' + arr.length + ' 个）'
      return arr.join(',')
    }
    const CRON_PRESETS = [
      ['* * * * *', '每分钟'],
      ['0 * * * *', '每小时整点'],
      ['0 0 * * *', '每天 00:00'],
      ['0 9 * * 1-5', '工作日 09:00'],
      ['30 2 * * *', '每天 02:30'],
      ['0 0 * * 1', '每周一 00:00'],
      ['0 0 1 * *', '每月 1 号'],
      ['*/5 * * * *', '每 5 分钟'],
    ]

    // ================= 子模式 txtdiff：文本对比 =================
    let lastRows = null
    let lastStats = null
    const expanded = {}
    const TD_MAX_LINES = 20000
    const TD_MAX_CHARS = 2 * 1024 * 1024
    const TD_LCS_CAP = 1500
    const tdNorm = (s, trimWs) => (trimWs ? String(s).replace(/^\s+|\s+$/g, '') : String(s))
    const tdDiff = (a, b, trimWs) => {
      let la = String(a || '').split('\n').map((s) => s.replace(/\r$/, ''))
      let lb = String(b || '').split('\n').map((s) => s.replace(/\r$/, ''))
      let truncA = false
      let truncB = false
      if (la.length > TD_MAX_LINES) { la = la.slice(0, TD_MAX_LINES); truncA = true }
      if (lb.length > TD_MAX_LINES) { lb = lb.slice(0, TD_MAX_LINES); truncB = true }
      const ka = la.map((s) => tdNorm(s, trimWs))
      const kb = lb.map((s) => tdNorm(s, trimWs))
      let pre = 0
      while (pre < ka.length && pre < kb.length && ka[pre] === kb[pre]) pre++
      let suf = 0
      while (suf < ka.length - pre && suf < kb.length - pre && ka[ka.length - 1 - suf] === kb[kb.length - 1 - suf]) suf++
      const rows = []
      for (let i = 0; i < pre; i++) rows.push({ t: ' ', la: i + 1, lb: i + 1, text: la[i] })
      const n = ka.length - pre - suf
      const m = kb.length - pre - suf
      let coarse = false
      if (n * m > TD_LCS_CAP * TD_LCS_CAP) {
        coarse = true
        for (let i = 0; i < n; i++) rows.push({ t: '-', la: pre + i + 1, lb: null, text: la[pre + i] })
        for (let j = 0; j < m; j++) rows.push({ t: '+', la: null, lb: pre + j + 1, text: lb[pre + j] })
      } else if (n > 0 && m > 0) {
        const W = m + 1
        const dp = new Uint32Array((n + 1) * W)
        for (let i = n - 1; i >= 0; i--) {
          const ra = ka[pre + i]
          const rowOff = i * W
          const nextOff = (i + 1) * W
          for (let j = m - 1; j >= 0; j--) {
            dp[rowOff + j] = ra === kb[pre + j] ? dp[nextOff + j + 1] + 1 : Math.max(dp[nextOff + j], dp[rowOff + j + 1])
          }
        }
        let i = 0
        let j = 0
        while (i < n && j < m) {
          if (ka[pre + i] === kb[pre + j]) { rows.push({ t: ' ', la: pre + i + 1, lb: pre + j + 1, text: la[pre + i] }); i++; j++ }
          else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { rows.push({ t: '-', la: pre + i + 1, lb: null, text: la[pre + i] }); i++ }
          else { rows.push({ t: '+', la: null, lb: pre + j + 1, text: lb[pre + j] }); j++ }
        }
        while (i < n) { rows.push({ t: '-', la: pre + i + 1, lb: null, text: la[pre + i] }); i++ }
        while (j < m) { rows.push({ t: '+', la: null, lb: pre + j + 1, text: lb[pre + j] }); j++ }
      } else {
        for (let i = 0; i < n; i++) rows.push({ t: '-', la: pre + i + 1, lb: null, text: la[pre + i] })
        for (let j = 0; j < m; j++) rows.push({ t: '+', la: null, lb: pre + j + 1, text: lb[pre + j] })
      }
      const baseA = pre + n
      const baseB = pre + m
      for (let s = 0; s < suf; s++) rows.push({ t: ' ', la: baseA + s + 1, lb: baseB + s + 1, text: la[baseA + s] })
      let add = 0, del = 0, same = 0
      for (const r of rows) { if (r.t === '+') add++; else if (r.t === '-') del++; else same++ }
      return { rows, stats: { add, del, same, coarse, truncA, truncB } }
    }
    const tdDisplay = (rows) => {
      const out = []
      let i = 0
      let seg = 0
      while (i < rows.length) {
        if (rows[i].t !== ' ') { out.push({ row: rows[i] }); i++; continue }
        let j = i
        while (j < rows.length && rows[j].t === ' ') j++
        const len = j - i
        const key = 'seg' + (seg++)
        if (len > 9 && !expanded[key]) {
          for (let k = 0; k < 3; k++) out.push({ row: rows[i + k] })
          out.push({ collapse: key, count: len - 6 })
          for (let k = j - 3; k < j; k++) out.push({ row: rows[k] })
        } else {
          for (let k = i; k < j; k++) out.push({ row: rows[k] })
        }
        i = j
      }
      return out
    }
    const TD_ROW_STYLE = { ' ': '', '+': 'background:var(--tb-done-bg,rgba(76,175,80,.09))', '-': 'background:var(--tb-danger-bg,rgba(217,95,95,.09))' }
    const TD_TXT_CLS = { ' ': '', '+': 'tb-tx-done', '-': 'tb-tx-danger' }

    // ================= 子模式 gen：生成器 =================
    // 脚本经 argv -e 注入（静态模板 ~1.6KB，远低于 32K 命令行上限），spec 走 stdin——
    // 不再走 env：哈希输入文本可到 MB 级，Windows 环境块总长 32K 字符会莫名 spawn 失败（审计 L5）
    const GEN_SCRIPT = [
      "const spec = JSON.parse(require('fs').readFileSync(0, 'utf8'))",
      "const c = require('crypto')",
      "const out = { ok: true, items: [] }",
      "try {",
      "  if (spec.kind === 'uuid') {",
      "    const n = Math.max(1, Math.min(Number(spec.n) || 1, 200))",
      "    for (let i = 0; i < n; i++) out.items.push(c.randomUUID())",
      "  } else if (spec.kind === 'rand') {",
      "    const sets = { hex: '0123456789abcdef', b64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', num: '0123456789', easy: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' }",
      "    const cs = sets[spec.charset] || sets.alnum",
      "    const len = Math.max(1, Math.min(Number(spec.len) || 16, 4096))",
      "    const n = Math.max(1, Math.min(Number(spec.n) || 1, 50))",
      "    for (let k = 0; k < n; k++) { let s = ''; for (let i = 0; i < len; i++) s += cs[c.randomInt(0, cs.length)]; out.items.push(s) }",
      "  } else if (spec.kind === 'hash') {",
      "    const algo = ['md5', 'sha1', 'sha256', 'sha512'].indexOf(spec.algo) >= 0 ? spec.algo : 'sha256'",
      "    out.items.push(c.createHash(algo).update(String(spec.text == null ? '' : spec.text), 'utf8').digest('hex'))",
      "  } else { out.ok = false; out.error = 'unknown kind: ' + spec.kind }",
      "} catch (e) { out.ok = false; out.error = String((e && e.message) || e) }",
      "process.stdout.write(JSON.stringify(out))",
    ].join('\n')
    const runChildJson = async (script, spec, wsRoot, deadlineMs) => {
      if (!subprocess) return { ok: false, error: 'subprocess 服务不可用' }
      try {
        // withDeadline：graceMs 不是运行时长上限，挂死子进程必须由看门狗 terminate（审计 M3）
        const handle = withDeadline(ctx, subprocess.spawn({
          argv: ['node', '-e', script],
          cwd: wsRoot,
          stdio: { stdin: { data: JSON.stringify(spec) }, stdout: { maxBytes: 1024 * 1024 }, stderr: { maxBytes: 64 * 1024 } },
          graceMs: 5000,
        }), deadlineMs)
        const t0 = Date.now()
        const outcome = await handle.done
        const stdout = handle.collected.stdout.readFrom(0)
        if (outcome.exitCode !== 0) {
          const timedOut = deadlineMs && (Date.now() - t0) >= (deadlineMs - 300)
          return { ok: false, error: timedOut ? ('执行超时已中止（' + Math.round(deadlineMs / 1000) + 's 看门狗）') : (handle.collected.stderr.readFrom(0).text.slice(0, 300) || '子进程失败') }
        }
        if (stdout.lossy) return { ok: false, error: '输出超过收集上限，已丢弃' }
        return JSON.parse(stdout.text)
      } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
    }
    const runGen = (spec, wsRoot) => runChildJson(GEN_SCRIPT, spec, wsRoot, 30000)
    const GEN_CHARSETS = [['alnum', '字母数字'], ['hex', 'hex'], ['b64url', 'base64url'], ['num', '纯数字'], ['easy', '易读（无 0O1lI）']]
    const GEN_ALGOS = [['md5', 'MD5'], ['sha1', 'SHA-1'], ['sha256', 'SHA-256'], ['sha512', 'SHA-512']]
    const GEN_NS = [1, 5, 10, 50]
    const GEN_KIND_LABEL = { uuid: 'UUID v4', rand: '随机串', hash: '哈希' }

    // ================= 主渲染：子模式芯片 + 各子面板 =================
    const SUBS = [
      ['codec', '编解码'], ['regex', '正则'], ['cron', 'Cron'],
      ['txtdiff', '文本对比'], ['gen', '生成器'],
    ]

    const render = (st) => {
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root">')
      parts.push('<div class="tb-chips">' + SUBS.map(([v, label]) =>
        '<button type="button" class="tb-chip' + (st.sub === v ? ' tb-chip-on' : '') + '" data-action="sub" data-v="' + v + '">' + label + '</button>'
      ).join('') + '</div>')
      parts.push(renderSub(st) + '</div>')
      return parts.join('')
    }

    const renderSub = (st) => {
      if (st.sub === 'codec') return renderCodec(st.codec)
      if (st.sub === 'regex') return renderRegex(st.regex)
      if (st.sub === 'cron') return renderCron(st.cron)
      if (st.sub === 'txtdiff') return renderTxtdiff(st.txtdiff)
      if (st.sub === 'gen') return renderGen(st.gen)
      return '<div class="tb-notice">未知子模式</div>'
    }

    const renderCodec = (c) => {
      const parts = []
      parts.push('<div class="tb-chips">' + CODEC_MODES.map(([v, label]) =>
        '<button type="button" class="tb-chip' + (c.mode === v ? ' tb-chip-on' : '') + '" data-action="mode" data-m="' + v + '">' + label + '</button>'
      ).join('') + '</div>')
      parts.push('<div class="tb-sec"><span class="tb-sec-label">输入</span>' +
        '<textarea class="tb-textarea" data-field="input" placeholder="在此输入待转换内容">' + esc(c.input || '') + '</textarea></div>')
      parts.push('<div class="tb-row"><button type="button" class="tb-btn tb-btn-primary" data-action="run">转换</button>' +
        (c.output ? '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="copy">复制输出</button><span class="tb-note">输出 ' + fmtSize(c.output.length) + '</span>' : '') + '</div>')
      if (c.error) parts.push('<div class="tb-banner tb-banner-error">' + esc(c.error) + '</div>')
      if (c.output) parts.push('<pre class="tb-code">' + esc(c.output) + '</pre>')
      return parts.join('')
    }

    const renderRegex = (r) => {
      const mode = r.mode === 'replace' ? 'replace' : 'match'
      // 只画闭包缓存：签名匹配才展示（输入已变化则提示重新执行），渲染路径零正则计算
      const sig = regexSigOf(r)
      const m = mode === 'match' && lastRegex && lastRegex.key === sig && lastRegex.res.matches ? lastRegex.res : null
      const rp = mode === 'replace' && lastRegex && lastRegex.key === sig && lastRegex.res.count != null ? lastRegex.res : null
      const stale = r.pattern && !(lastRegex && lastRegex.key === sig)
      const parts = []
      parts.push('<div class="tb-chips">' +
        '<button type="button" class="tb-chip' + (mode === 'match' ? ' tb-chip-on' : '') + '" data-action="mode" data-v="match">匹配</button>' +
        '<button type="button" class="tb-chip' + (mode === 'replace' ? ' tb-chip-on' : '') + '" data-action="mode" data-v="replace">替换</button>' +
      '</div>')
      parts.push('<div class="tb-query">' +
        '<input class="tb-input tb-mono" data-field="pattern" placeholder="正则表达式，如 (\\w+)@(\\w+\\.com)" value="' + esc(r.pattern || '') + '" />' +
        '<button type="button" class="tb-btn tb-btn-primary" data-action="test">测试</button>' +
      '</div>')
      parts.push('<div class="tb-chips"><span class="tb-note">预设：</span>' + REGEX_PRESETS.map(([label, p]) =>
        '<button type="button" class="tb-chip" data-action="preset" data-p="' + esc(p) + '" title="' + esc(p) + '">' + esc(label) + '</button>'
      ).join('') + '</div>')
      parts.push('<div class="tb-chips">' + REGEX_FLAGS.map(([f, label]) =>
        '<button type="button" class="tb-chip' + ((r.flags || []).indexOf(f) >= 0 ? ' tb-chip-on' : '') + '" data-action="flag" data-f="' + f + '" title="' + label + '">' + f + '</button>'
      ).join('') + '<span class="tb-note">' + esc(REGEX_FLAGS.filter(([f]) => (r.flags || []).indexOf(f) >= 0).map(([, l]) => l).join(' · ')) + '</span></div>')
      if (mode === 'replace') {
        parts.push('<div class="tb-sec"><span class="tb-sec-label">替换为（支持 $1 分组 / $&amp; 全匹配 / $&lt;name&gt; 命名组）</span>' +
          '<input class="tb-input tb-mono" data-field="replacement" placeholder="如 [$2]$1 或 <空删除>" value="' + esc(r.replacement || '') + '" /></div>')
      }
      parts.push('<div class="tb-sec"><span class="tb-sec-label">测试文本</span>' +
        '<textarea class="tb-textarea" data-field="text" placeholder="在此粘贴待匹配的文本">' + esc(r.text || '') + '</textarea></div>')
      if (stale) {
        parts.push('<div class="tb-banner tb-banner-info">参数已变化——点「测试」执行（正则在子进程内运行，3s 超时自动中止，防灾难性回溯冻结主进程）</div>')
      }
      const err = m ? m.error : (rp ? rp.error : null)
      if (err) {
        parts.push('<div class="tb-banner tb-banner-error">正则无效：' + esc(err) + '</div>')
      } else if (r.pattern && mode === 'match' && m) {
        parts.push('<div class="tb-list-head"><span class="tb-list-title">匹配结果<span class="tb-count">' + m.matches.length + '</span></span>' +
          (m.truncated ? '<span class="tb-note">仅显示前 ' + REGEX_CAP + ' 条</span>' : '') + '</div>')
        if (m.matches.length === 0) {
          parts.push('<div class="tb-notice">无匹配</div>')
        } else {
          parts.push('<div class="tb-list">' + m.matches.map((mt, idx) => {
            const groups = (mt.groups || []).map((g, gi) =>
              '<div class="tb-line"><span class="tb-line-status">$' + (gi + 1) + '</span><span class="tb-line-path">' + esc(g == null ? '（未参与）' : g) + '</span></div>'
            ).join('')
            return '<div class="tb-card">' +
              '<div class="tb-card-head"><span class="tb-pill tb-pill-active">#' + (idx + 1) + '</span>' +
              '<span class="tb-note">位置 ' + mt.i + ' · 长度 ' + mt.text.length + '</span></div>' +
              '<pre class="tb-code">' + esc(mt.text || '（空匹配）') + '</pre>' +
              (groups ? '<div class="tb-sec"><span class="tb-sec-label">捕获分组</span>' + groups + '</div>' : '') +
            '</div>'
          }).join('') + '</div>')
        }
      } else if (r.pattern && mode === 'replace' && rp) {
        parts.push('<div class="tb-list-head"><span class="tb-list-title">替换结果<span class="tb-count">' + rp.count + ' 处</span></span>' +
          (rp.out ? '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="copy-out">复制结果</button>' : '') + '</div>')
        parts.push('<pre class="tb-code" style="max-height:480px">' + esc(rp.out.length > 20000 ? rp.out.slice(0, 20000) + '\n…（仅显示前 20000 字符，共 ' + rp.out.length + '）' : rp.out) + '</pre>')
      }
      return parts.join('')
    }

    const renderCron = (c) => {
      const parsed = lastCronParsed
      const runs = lastCronRuns
      const parts = []
      parts.push('<div class="tb-sec"><span class="tb-sec-label">Cron 表达式（分 时 日 月 周）</span>' +
        '<input class="tb-input tb-mono" data-field="expr" placeholder="如 0 9 * * 1-5" value="' + esc(c.expr || '') + '" /></div>')
      parts.push('<div class="tb-chips">' + CRON_PRESETS.map((p) =>
        '<button type="button" class="tb-chip" data-action="preset" data-v="' + esc(p[0]) + '" title="点击填入">' + esc(p[1]) + '</button>'
      ).join('') + '</div>')
      parts.push('<div class="tb-row">' +
        '<button type="button" class="tb-btn tb-btn-primary" data-action="calc">解析</button>' +
        '<span class="tb-note">标准 5 段；日/周同时受限时任一命中即运行（OR 语义）</span></div>')
      if (parsed && parsed.error) parts.push('<div class="tb-banner tb-banner-error">' + esc(parsed.error) + '</div>')
      if (parsed && !parsed.error && runs) {
        parts.push('<div class="tb-card"><div class="tb-sec"><span class="tb-sec-label">字段明细</span>' +
          parsed.fields.map((f, i) =>
            '<div class="tb-line"><span class="tb-line-status tb-tx-muted" style="width:auto;min-width:28px">' + esc(CRON_FIELDS[i].label) + '</span>' +
            '<span class="tb-line-path tb-mono">' + esc(cronSummarize(f.set, CRON_FIELDS[i].min, CRON_FIELDS[i].max, f.any)) + '</span></div>'
          ).join('') + '</div></div>')
        if (runs.length) {
          parts.push('<div class="tb-list-head"><span class="tb-list-title">未来 ' + runs.length + ' 次运行（本地时区）</span></div>')
          parts.push('<div class="tb-list">' + runs.map((d) =>
            '<div class="tb-rec"><div class="tb-rec-main">' +
              '<div class="tb-rec-top"><span class="tb-rec-key tb-mono">' + esc(cronFmtRun(d)) + '</span></div>' +
              '<div class="tb-rec-sub"><span>' + esc(cronFmtIn(d)) + '</span></div>' +
            '</div></div>'
          ).join('') + '</div>')
        } else {
          parts.push('<div class="tb-notice">未来 4 年内无运行时刻（检查日/月/周组合是否过窄）</div>')
        }
      }
      if (!parsed) parts.push('<div class="tb-notice">输入表达式或点预设芯片，解析后显示字段明细与未来运行时刻</div>')
      return parts.join('')
    }

    const renderTxtdiff = (t) => {
      const parts = []
      parts.push('<div class="tb-sec"><span class="tb-sec-label">左（原文）</span>' +
        '<textarea class="tb-textarea tb-mono" data-field="a" placeholder="粘贴原文" style="min-height:90px">' + esc(t.a || '') + '</textarea></div>')
      parts.push('<div class="tb-sec"><span class="tb-sec-label">右（新文）</span>' +
        '<textarea class="tb-textarea tb-mono" data-field="b" placeholder="粘贴新文" style="min-height:90px">' + esc(t.b || '') + '</textarea></div>')
      parts.push('<div class="tb-row">' +
        '<button type="button" class="tb-btn tb-btn-primary" data-action="compare">对比</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="swap" title="交换左右">⇄ 交换</button>' +
        '<button type="button" class="tb-chip' + (t.trimWs ? ' tb-chip-on' : '') + '" data-action="trim-ws" title="比较时忽略每行首尾空白">忽略首尾空白</button>' +
        (t.a || t.b ? '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="clear">清空</button>' : '') +
      '</div>')
      if (t.notice) parts.push('<div class="tb-banner tb-banner-info">' + esc(t.notice) + '</div>')
      if (lastRows && lastStats) {
        const s = lastStats
        parts.push('<div class="tb-row">' +
          '<span class="tb-pill tb-pill-done">+' + s.add + '</span>' +
          '<span class="tb-pill tb-pill-other">−' + s.del + '</span>' +
          '<span class="tb-pill tb-pill-plain">相同 ' + s.same + '</span>' +
          (s.coarse ? '<span class="tb-note">差异段过大，已按整块增删展示（未做行级对齐）</span>' : '') +
          (s.truncA || s.truncB ? '<span class="tb-note">超出 20000 行上限，已截断' + (s.truncA && s.truncB ? '（双侧）' : s.truncA ? '（左）' : '（右）') + '</span>' : '') +
        '</div>')
        if (s.add === 0 && s.del === 0) parts.push('<div class="tb-notice">两侧文本完全一致' + (t.trimWs ? '（忽略首尾空白口径）' : '') + '</div>')
        const disp = tdDisplay(lastRows)
        parts.push('<div class="tb-list">' + disp.map((d) => {
          if (d.collapse) {
            return '<div class="tb-line" data-action="expand" data-k="' + d.collapse + '" title="点击展开" style="cursor:pointer;justify-content:center">' +
              '<span class="tb-note">⋯ ' + d.count + ' 行相同，点击展开 ⋯</span></div>'
          }
          const row = d.row
          return '<div class="tb-line" style="' + (TD_ROW_STYLE[row.t] || '') + ';font-family:ui-monospace,Consolas,monospace">' +
            '<span class="tb-note" style="min-width:38px;text-align:right;flex:none">' + (row.la == null ? '' : row.la) + '</span>' +
            '<span class="tb-note" style="min-width:38px;text-align:right;flex:none">' + (row.lb == null ? '' : row.lb) + '</span>' +
            '<span class="' + (TD_TXT_CLS[row.t] || '') + '" style="flex:none;width:14px">' + (row.t === ' ' ? '' : row.t) + '</span>' +
            '<span class="tb-line-path" style="white-space:pre-wrap;word-break:break-all">' + esc(row.text) + '</span>' +
          '</div>'
        }).join('') + '</div>')
      } else {
        parts.push('<div class="tb-notice">填入左右文本后点「对比」；结果在这里以统一视图展示（长相同段自动折叠）</div>')
      }
      return parts.join('')
    }

    const renderGen = (g) => {
      const parts = []
      parts.push('<div class="tb-card"><div class="tb-sec"><span class="tb-sec-label">UUID v4</span>' +
        '<div class="tb-row">' + GEN_NS.map((n) =>
          '<button type="button" class="tb-chip' + (g.n === n ? ' tb-chip-on' : '') + '" data-action="uuid-n" data-v="' + n + '">' + n + ' 个</button>'
        ).join('') +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-action="uuid">生成</button></div></div></div>')
      parts.push('<div class="tb-card"><div class="tb-sec"><span class="tb-sec-label">随机串（CSPRNG）</span>' +
        '<div class="tb-chips" style="margin-bottom:6px">' + GEN_CHARSETS.map(([v, label]) =>
          '<button type="button" class="tb-chip' + (g.charset === v ? ' tb-chip-on' : '') + '" data-action="charset" data-v="' + v + '">' + label + '</button>'
        ).join('') + '</div>' +
        '<div class="tb-row"><span class="tb-note">长度</span>' +
        '<input class="tb-input tb-mono" style="max-width:80px;height:24px" data-field="len" value="' + esc(g.len || '') + '" />' +
        '<span class="tb-note">条数</span>' +
        '<input class="tb-input tb-mono" style="max-width:64px;height:24px" data-field="randN" value="' + esc(g.randN || '') + '" />' +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-action="rand">生成</button></div></div></div>')
      parts.push('<div class="tb-card"><div class="tb-sec"><span class="tb-sec-label">哈希摘要</span>' +
        '<div class="tb-chips" style="margin-bottom:6px">' + GEN_ALGOS.map(([v, label]) =>
          '<button type="button" class="tb-chip' + (g.algo === v ? ' tb-chip-on' : '') + '" data-action="algo" data-v="' + v + '">' + label + '</button>'
        ).join('') + '</div>' +
        '<textarea class="tb-textarea" data-field="text" placeholder="待计算哈希的文本" style="min-height:56px">' + esc(g.text || '') + '</textarea>' +
        '<div class="tb-row" style="margin-top:6px"><button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-action="hash">计算</button></div></div></div>')
      if (g.notice) parts.push('<div class="tb-banner tb-banner-info">' + esc(g.notice) + '</div>')
      const items = g.items || []
      if (items.length) {
        parts.push('<div class="tb-list-head"><span class="tb-list-title">' + esc(GEN_KIND_LABEL[g.itemsKind] || '结果') + '<span class="tb-count">' + items.length + '</span></span>' +
          '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="copy-all">复制全部</button></div>')
        parts.push('<div class="tb-list">' + items.map((it, i) =>
          '<div class="tb-rec" data-action="copy-one" data-i="' + i + '" title="点击复制">' +
            '<div class="tb-rec-main"><div class="tb-rec-top"><span class="tb-rec-summary tb-mono" style="word-break:break-all">' + esc(it) + '</span></div></div>' +
          '</div>'
        ).join('') + '</div>')
      } else {
        parts.push('<div class="tb-notice">生成结果在这里，点条目复制单项</div>')
      }
      return parts.join('')
    }

    // ================= 主 handler：按 st.sub 分派到子状态，动作名保持原工具语义 =================
    const handler = async ({ action, fields, state, root, session }) => {
      const ws = resolveWorkspace(ctx, root, session)
      const el = fields && fields.__el ? fields.__el : {}
      const init = {
        sub: 'codec',
        codec: { mode: 'b64e', input: '', output: '', error: null },
        regex: { pattern: '', flags: ['g'], text: '', mode: 'match', replacement: '' },
        cron: { expr: '' },
        txtdiff: { a: '', b: '', trimWs: false, notice: null },
        gen: { n: 5, charset: 'alnum', len: '16', randN: '3', algo: 'sha256', text: '', items: [], itemsKind: '', notice: null },
      }
      const st = (state && typeof state === 'object' && state) ? state : init
      if (!st.codec || typeof st.codec !== 'object') st.codec = Object.assign({}, init.codec)
      if (!st.regex || typeof st.regex !== 'object') st.regex = Object.assign({}, init.regex)
      if (!st.cron || typeof st.cron !== 'object') st.cron = Object.assign({}, init.cron)
      if (!st.txtdiff || typeof st.txtdiff !== 'object') st.txtdiff = Object.assign({}, init.txtdiff)
      if (!st.gen || typeof st.gen !== 'object') st.gen = Object.assign({}, init.gen)

      // 子模式切换（动作名 sub）
      if (action === 'sub' && el.v && SUBS.some(([v]) => v === el.v)) {
        st.sub = String(el.v)
        return { ok: true, html: render(st), state: st }
      }

      // ---- 各子模式字段同步 + 动作 ----
      let copy = null
      if (st.sub === 'codec') {
        const c = st.codec
        if (typeof fields.input === 'string') c.input = fields.input
        if (action === 'mode' && el.m) c.mode = String(el.m)
        if ((action === 'run' || action === 'mode') && c.input) {
          try {
            const r = codecConvert(c.mode, c.input)
            c.output = r.out || ''
            c.error = r.error || null
          } catch (e) { c.output = ''; c.error = String((e && e.message) || e) }
        }
        if (action === 'copy' && c.output) copy = c.output
      } else if (st.sub === 'regex') {
        const r = st.regex
        if (typeof fields.pattern === 'string') r.pattern = fields.pattern
        if (typeof fields.text === 'string') r.text = fields.text
        if (typeof fields.replacement === 'string') r.replacement = fields.replacement
        if (action === 'mode' && el.v) r.mode = el.v === 'replace' ? 'replace' : 'match'
        else if (action === 'flag' && el.f) {
          const f = String(el.f)
          const cur = Array.isArray(r.flags) ? r.flags.slice() : ['g']
          const i = cur.indexOf(f)
          if (i >= 0) cur.splice(i, 1); else cur.push(f)
          r.flags = cur
        } else if (action === 'preset' && el.p) {
          r.pattern = String(el.p)
          const preset = REGEX_PRESETS.find(([, p]) => p === el.p)
          if (!r.text && preset && preset[2]) r.text = preset[2]
        }
        if (action === 'test' || action === 'preset') {
          // 「测试」/点预设：正则进子进程执行（3s 看门狗），结果进闭包缓存供渲染
          const op = r.mode === 'replace' ? 'replace' : 'match'
          const res = await runRegexChild(op, r.pattern, r.flags || ['g'], r.text || '', r.replacement || '', ws.root)
          lastRegex = { key: regexSigOf(r), res }
        }
        if (action === 'copy-out') {
          const rp = await runRegexChild('replace', r.pattern, r.flags || ['g'], r.text || '', r.replacement || '', ws.root)
          if (!rp.error) copy = rp.out
        }
      } else if (st.sub === 'cron') {
        const c = st.cron
        if (typeof fields.expr === 'string') c.expr = fields.expr
        if (action === 'preset' && el.v) c.expr = String(el.v)
        if (action === 'calc' || action === 'preset' || (action === '' && c.expr)) {
          if (!c.expr.trim()) {
            lastCronParsed = { error: '请输入 cron 表达式' }
            lastCronRuns = null
          } else {
            lastCronParsed = cronParse(c.expr)
            if (!lastCronParsed.error) lastCronRuns = cronNextRuns(lastCronParsed.fields, 8)
            else lastCronRuns = null
          }
        }
      } else if (st.sub === 'txtdiff') {
        const t = st.txtdiff
        if (typeof fields.a === 'string') t.a = fields.a
        if (typeof fields.b === 'string') t.b = fields.b
        t.notice = null
        if (action === 'compare') {
          for (const k of Object.keys(expanded)) delete expanded[k]
          if (t.a.length > TD_MAX_CHARS) { t.a = t.a.slice(0, TD_MAX_CHARS); t.notice = '左侧文本超 2MB，已截断' }
          if (t.b.length > TD_MAX_CHARS) { t.b = t.b.slice(0, TD_MAX_CHARS); t.notice = (t.notice ? t.notice + '；' : '') + '右侧文本超 2MB，已截断' }
          const r = tdDiff(t.a, t.b, t.trimWs)
          lastRows = r.rows
          lastStats = r.stats
        } else if (action === 'swap') {
          const tmp = t.a; t.a = t.b; t.b = tmp
          if (lastRows) { const r = tdDiff(t.a, t.b, t.trimWs); lastRows = r.rows; lastStats = r.stats }
        } else if (action === 'trim-ws') {
          t.trimWs = !t.trimWs
          if (lastRows) {
            for (const k of Object.keys(expanded)) delete expanded[k]
            const r = tdDiff(t.a, t.b, t.trimWs)
            lastRows = r.rows
            lastStats = r.stats
          }
        } else if (action === 'expand' && el.k) {
          expanded[String(el.k)] = true
        } else if (action === 'clear') {
          t.a = ''; t.b = ''
          lastRows = null; lastStats = null
          for (const k of Object.keys(expanded)) delete expanded[k]
        }
      } else if (st.sub === 'gen') {
        const g = st.gen
        if (!Array.isArray(g.items)) g.items = []
        if (typeof fields.len === 'string') g.len = fields.len
        if (typeof fields.randN === 'string') g.randN = fields.randN
        if (typeof fields.text === 'string') g.text = fields.text
        g.notice = null
        const doGen = async (spec, kind) => {
          const r = await runGen(spec, ws.root)
          if (!r || r.ok === false) { g.notice = '生成失败: ' + ((r && r.error) || '(无响应)'); return }
          g.items = r.items || []
          g.itemsKind = kind
        }
        if (action === 'uuid-n' && el.v) g.n = Number(el.v) || 5
        else if (action === 'charset' && el.v) g.charset = String(el.v)
        else if (action === 'algo' && el.v) g.algo = String(el.v)
        else if (action === 'uuid') await doGen({ kind: 'uuid', n: g.n }, 'uuid')
        else if (action === 'rand') await doGen({ kind: 'rand', charset: g.charset, len: g.len, n: g.randN }, 'rand')
        else if (action === 'hash') await doGen({ kind: 'hash', algo: g.algo, text: g.text }, 'hash')
        if (action === 'copy-one' && el.i != null) {
          const it = g.items[Number(el.i)]
          if (typeof it === 'string') copy = it
        } else if (action === 'copy-all' && g.items.length) {
          copy = g.items.join('\n')
        }
      }

      const out = { ok: true, html: render(st), state: st }
      if (copy != null) out.copy = copy
      return out
    }

    tryRegisterTool(ctx, { id: 'calc', label: '计算', order: 8, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 5.5h5"/><path d="M6 8h.01M8 8h.01M10 8h.01M6 10.5h.01M8 10.5h.01M10 10.5h.01"/></svg>' }, handler)
  },
}
}

export async function apply(ctx) {
  applyingContext = ctx
  try {
    const feature = create_calc()
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
    console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态组件已加载: calc')
  } finally {
    applyingContext = null
  }
}
