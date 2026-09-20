// ===== 工具箱 · aiassist 原生静态 Host 组件（构建生成，勿手改） =====


export const name = "dsh-dynamic-toolbox/feature/aiassist"
export const inject = ["fs","timer","toolboxRegistryDynamicToolbox"]

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

const create_aiassist = () => {
// ===== aiassist-tool.js：AI 助手（Host-only）— 7 个 AI 工具合一 =====
// ask/translate/promptopt/review/commitmsg/aisummary/compare 合并为单插件单 Tab「AI 助手」，
// 一张 PRESETS 表（单一事实源）+ 通用 handler + 分段渲染；通过 preset 芯片切换，
// 每个 preset 定义 { id, label, mode, input, params, sys, store, cap } —— 切换 prompt/system 即切换用途。
// 无缝迁移：沿用原 .dsh-dynamic-toolbox/toolbox-<key>.json 落盘文件与台账 tool 键（历史/用量连续）。
// 大本体（git diff / 会话日志采样 / 对比结果）一律留闭包不进 state（state 每次动作来回传输必须轻量）。
// 状态：{ preset, provider, model, picked[], q, path, code, params{target,style,extra}, info, history[], notice }

return {
  name: 'aiassist-tool',
  // llm/agentDefaultModel 为可选依赖（makeLlmHelper 内部 ctx.get + available:false 优雅降级），
  // 不进 inject：服务缺失时 Tab 仍在、可浏览历史，发送时提示「llm 服务不可用」。
  // 注意：运行时桩 payload 的 inject 来自 build/plugin-catalog.mjs，需同步改为 ['fs','timer'] 并重新生成。
  inject: ['fs', 'timer'],
  apply(ctx) {
    const ai = makeLlmHelper(ctx)
    const subprocess = ctx.get('subprocess')
    const fsService = ctx.get('fs')
    const sq = ctx.get('sessionQuery')
    const readLog = sq ? makeSessionLogReader(ctx, sq) : null

    // ===== PRESETS 表（单一事实源；store = 落盘文件名，同时是台账 tool 键）=====
    const TARGETS = ['简体中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español', 'Русский']
    const STYLES = ['通用', '代码', '分析', '创意']
    const DIFF_CAP = 8000
    const CODE_CAP = 20000
    const LOG_CAP = 12000
    const LOG_HEAD = 4000
    const LANGS = { js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX', json: 'JSON', py: 'Python', java: 'Java', go: 'Go', rs: 'Rust', yml: 'YAML', yaml: 'YAML', md: 'Markdown', html: 'HTML', css: 'CSS', ps1: 'PowerShell', sh: 'Shell', sql: 'SQL', vue: 'Vue' }

    const PRESETS = [
      { id: 'ask', label: '问答', mode: 'single', input: 'text', params: [],
        hint: '向所选模型直接提问（不写入会话）', store: 'toolbox-ask.json', cap: 10,
        sys: () => '', row: (it) => aiHistoryCard(it, it.q, it.a, '问', '答') },
      { id: 'translate', label: '翻译', mode: 'single', input: 'text',
        params: [{ key: 'target', label: '目标语言', options: TARGETS }],
        hint: '粘贴或输入要翻译的内容（保留 Markdown / 代码格式）', store: 'toolbox-translate.json', cap: 10,
        sys: (st) => '你是专业翻译引擎。规则：只输出译文本身，不输出任何解释、注音、拼音或多余引号；完整保留原文的换行、Markdown 标记与代码格式。目标语言：' + (st.params && st.params.target || TARGETS[0]),
        row: (it) => aiHistoryCard(it, it.src, it.dst, '原文 → ' + (it.target || ''), '译文'), copyKey: 'dst' },
      { id: 'promptopt', label: '优化', mode: 'single', input: 'text',
        params: [{ key: 'style', label: '风格', options: STYLES }],
        hint: '用大白话描述你想让 AI 做什么，优化器负责补全结构', store: 'toolbox-promptopt.json', cap: 10,
        sys: (st) => '你是提示词工程专家。把用户的粗糙草稿改写为高质量结构化提示词，包含【角色】【任务】【背景】【约束】【输出格式】五个小节（不适用的可省略）；风格倾向：' + (st.params && st.params.style || STYLES[0]) + '；语言跟随草稿（中文草稿用中文，英文草稿用英文）；只输出优化后的提示词本身，不要解释、不要代码块围栏。',
        row: (it) => aiHistoryCard(it, it.draft, it.opt, '草稿（' + (it.style || '通用') + '）', '优化后'), copyKey: 'opt' },
      { id: 'review', label: '评审', mode: 'single', input: 'fileOrText', params: [],
        hint: '工作区相对路径或粘贴代码 → 三级评审 + 评分', store: 'toolbox-review.json', cap: 5,
        sys: () => '你是资深代码评审。输出三部分：🔴 严重问题 / 🟡 改进建议 / 🟢 可选优化，每条含位置（行号或函数名）、问题与具体改法；末尾给总体评分 x/10 与一句总结。中文、精炼、Markdown 列表，不要客套话。',
        row: (it) => aiHistoryCard(it, it.target + (it.chars ? '（' + it.chars + ' 字符' + (it.truncated ? '，已截断' : '') + '）' : ''), it.report, '评审对象', '报告'), copyKey: 'report' },
      { id: 'commitmsg', label: '提交信息', mode: 'single', input: 'gitsource',
        params: [{ key: 'extra', label: '补充说明', type: 'text' }],
        hint: '扫描 git diff → 生成 Conventional Commits 中文提交信息', store: 'toolbox-commitmsg.json', cap: 5,
        sys: () => '你是提交信息撰写助手。依据给定 git diff 生成一条符合 Conventional Commits 的提交信息：首行 “type(scope): 中文主题”（≤50 字，type 从 feat/fix/refactor/docs/chore/test/perf/style 中选，scope 可省略）；改动复杂时空一行，每行以 “- ” 列出要点；只输出提交信息本身，不要代码块围栏、不要解释。',
        row: (it) => aiHistoryCard(it, it.scope === 'staged' ? '暂存区改动' : '工作区改动', it.msg, 'diff 范围', '提交信息'), copyKey: 'msg' },
      { id: 'aisummary', label: '摘要', mode: 'single', input: 'sessionlog', params: [],
        hint: '对当前会话做四节 AI 摘要', store: 'toolbox-aisummary.json', cap: 1,
        sys: () => '你是会话摘要助手。把给定的 用户/助手 对话流水整理为四节中文摘要：🎯 目标（用户想达成什么）/ ✅ 进展（已完成的关键事项）/ 🔑 关键决定（技术选型、约定、踩坑结论）/ 📌 待办（未完成或后续要做的事）。每节 1-4 条要点，精炼，不要复述原文。',
        row: (it) => aiHistoryCard(it, it.meta && it.meta.at ? '会话摘要 · ' + it.meta.at : '会话摘要', it.summary, '', '摘要'), copyKey: 'summary' },
      { id: 'compare', label: '对比', mode: 'multi', input: 'text', params: [],
        hint: '同一问题并发发给所有已选模型', store: 'toolbox-compare.json', cap: 3,
        sys: () => '' },
    ]
    const PRESET_MAP = {}
    for (const p of PRESETS) PRESET_MAP[p.id] = p

    // ===== 历史条目标签文案（保持与原 tools 一致） =====
    const LABELS = { ask: '问答', translate: '翻译', promptopt: '优化', review: '评审', commitmsg: '提交信息', aisummary: '摘要', compare: '对比' }

    // ===== 闭包：大本体不进 state =====
    let lastResults = null   // compare 结果本体（{ q, t, items[] }）
    let lastDiff = null      // commitmsg diff 本体（{ scope, text, truncated }）
    let lastLog = null       // aisummary 日志采样本体（{ text, truncated, omitted, events }）
    const paramMem = {}      // presetId -> params 记忆（切换回来恢复上次参数）
    // compare rounds 落盘串行链：双击「并发对比」时两个在途 send 各自基于磁盘追加自己的轮次，
    // 不再整文件互相覆盖丢轮次（与台账写锁同型的轻量 per-root promise 链）
    let cmpSaveChain = Promise.resolve()
    const enqueueCompareSave = (fn) => {
      const run = cmpSaveChain.then(fn, fn)
      cmpSaveChain = run.then(() => undefined, () => undefined)
      return run
    }

    const pad2 = (n) => (n < 10 ? '0' : '') + n
    const fmtClock = (t) => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }
    // 数值槽位先归一再拼 HTML（history 可经 state 往返/磁盘恢复，防御深度；非法值不出 NaN/注入面）
    const numOf = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

    // ===== 通用历史卡片（AI 类历史统一视觉；原 7 个工具的卡片样式不变）=====
    function aiHistoryCard(it, srcText, dstText, srcLabel, dstLabel) {
      const ms = numOf(it.ms)
      const outN = Number(it.out)
      const out = it.out != null && Number.isFinite(outN) ? outN : null
      const parts = []
      parts.push('<div class="tb-card">')
      if (srcLabel && srcText) parts.push('<div class="tb-sec"><span class="tb-sec-label">' + esc(srcLabel) + '</span>' +
        '<div style="font-size:12.5px;white-space:pre-wrap;word-break:break-word">' + esc(String(srcText).slice(0, 500)) + '</div></div>')
      parts.push(it.err
        ? '<div class="tb-banner tb-banner-error">' + esc(it.err) + '</div>'
        : '<div class="tb-sec"><span class="tb-sec-label">' + esc(dstLabel || '结果') + '</span><pre class="tb-code">' + esc(it.a != null ? it.a : (dstText || '（空结果）')) + '</pre></div>')
      parts.push('<div class="tb-rec-sub"><span>' + esc(it.route || '') + '</span><span>' + ms + 'ms</span>' +
        (out != null ? '<span>输出 ' + out + ' tok</span>' : '') +
        '<span>' + fmtClock(numOf(it.t)) + '</span>' +
        (dstText ? '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="copy" data-i="' + numOf(it.__i) + '">复制</button>' : '') +
        '</div></div>')
      return parts.join('')
    }

    // ===== 输入源采集：text / fileOrText / gitsource / sessionlog =====
    const collectInput = async (p, st, ws, sessionId) => {
      if (p.input === 'text') {
        return st.q && st.q.trim() ? { content: st.q.trim() } : { error: '请输入内容' }
      }
      if (p.input === 'fileOrText') {
        if (st.path && st.path.trim()) {
          const target = st.path.trim()
          const m = target.toLowerCase().match(/\.([a-z0-9]+)$/)
          const lang = m && LANGS[m[1]] ? LANGS[m[1]] : (m ? m[1] : '')
          if (!fsService) return { error: 'fs 服务不可用' }
          try {
            const t = await fsService.resolve(target, { cwd: ws.root })
            if (!await fsService.stat(t)) return { error: '文件不存在: ' + target }
            const full = await fsService.readText(t)
            const truncated = full.length > CODE_CAP
            return { content: full.slice(0, CODE_CAP), meta: { target, lang, chars: full.length, truncated } }
          } catch (e) { return { error: '读取失败: ' + String((e && e.message) || e) } }
        }
        if (st.code && st.code.trim()) {
          const c = st.code.trim()
          return { content: c.slice(0, CODE_CAP), meta: { target: '(粘贴代码)', chars: c.length, truncated: c.length > CODE_CAP } }
        }
        return { error: '请填写文件路径或粘贴代码' }
      }
      if (p.input === 'gitsource') {
        const scan = await scanGit(ws.root)
        if (scan.error) return { error: scan.error }
        lastDiff = scan
        return { meta: scan }
      }
      if (p.input === 'sessionlog') {
        if (!readLog) return { error: 'sessionQuery 服务不可用' }
        if (!sessionId) return { error: '未获取到当前会话 ID' }
        const r = await readLog(sessionId)
        const t = transcript(r.events || [])
        if (!t.text.trim()) return { error: '当前会话还没有可摘要的对话内容' }
        lastLog = { text: t.text, truncated: t.truncated, omitted: t.omitted, events: r.count }
        return { meta: { events: r.count, chars: t.text.length, truncated: t.truncated, omitted: t.omitted } }
      }
      return { error: '未知输入类型' }
    }

    // ===== commitmsg：git scan（沿用原实现；diff 本体留闭包）=====
    const runGit = async (args, root) => {
      if (!subprocess) return { ok: false, error: 'subprocess 服务不可用' }
      try {
        const handle = subprocess.spawn({
          argv: ['git', ...args],
          cwd: root,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 4 * 1024 * 1024 }, stderr: { maxBytes: 256 * 1024 } },
          graceMs: 60000,
        })
        const outcome = await handle.done
        const stdout = handle.collected.stdout.readFrom(0).text
        const stderr = handle.collected.stderr.readFrom(0).text
        return { ok: outcome.exitCode === 0, code: outcome.exitCode, out: stdout, err: stderr }
      } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
    }
    const firstLine = (s) => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 3).join(' | ')
    const scanGit = async (root) => {
      if (!subprocess) return { error: 'subprocess 服务不可用' }
      const st = await runGit(['status', '--porcelain'], root)
      if (!st.ok) return { error: firstLine(st.err) || 'not a git repository' }
      let staged = 0, unstaged = 0, untracked = 0
      for (const line of (st.out || '').split(/\r?\n/)) {
        if (!line) continue
        const xy = line.slice(0, 2)
        if (xy === '??') { untracked++; continue }
        if (xy[0] !== ' ' && xy[0] !== '?') staged++
        if (xy[1] !== ' ' && xy[1] !== '?') unstaged++
      }
      let scope = 'staged'
      let d = await runGit(['diff', '--staged'], root)
      if (!d.ok) return { error: firstLine(d.err) || 'git diff 失败' }
      if (!(d.out || '').trim()) {
        scope = 'unstaged'
        d = await runGit(['diff'], root)
        if (!d.ok) return { error: firstLine(d.err) || 'git diff 失败' }
      }
      const full = (d.out || '').trim()
      return { scope, text: full.slice(0, DIFF_CAP), truncated: full.length > DIFF_CAP, staged, unstaged, untracked, chars: full.length, empty: !full }
    }

    // ===== aisummary：会话日志 → 对话流水（沿用原实现）=====
    const textOf = (blocks) => {
      if (!Array.isArray(blocks)) return ''
      return blocks.map((b) => (b && b.type === 'text' ? b.text : '')).filter(Boolean).join('\n')
    }
    const transcript = (events) => {
      const lines = []
      for (const ev of events) {
        if (!ev || typeof ev.seq !== 'number') continue
        const d = ev.data || {}
        if (ev.type === 'user/message') {
          const t = textOf(d.content)
          if (t) lines.push('用户：' + t)
        } else if (ev.type === 'assistant/message') {
          const t = textOf((d.message || {}).content)
          if (t) lines.push('助手：' + t)
        }
      }
      const full = lines.join('\n\n')
      if (full.length <= LOG_CAP) return { text: full, truncated: false, omitted: 0 }
      const head = full.slice(0, LOG_HEAD)
      const tail = full.slice(-(LOG_CAP - LOG_HEAD))
      return { text: head + '\n\n…（中间省略 ' + (full.length - LOG_CAP) + ' 字符）…\n\n' + tail, truncated: true, omitted: full.length - LOG_CAP }
    }

    // ===== 磁盘历史读写（按 preset 的 store 文件；读取归一化为数组）=====
    const storeRel = (p) => '.dsh-dynamic-toolbox/' + p.store
    const loadHistory = async (p, ws) => {
      const saved = await readJsonStore(ctx, storeRel(p), ws.root, null)
      if (p.id === 'aisummary') {
        // aisummary 磁盘是单对象 { sid, summary, meta }（原实现结构，保持兼容）
        if (saved && typeof saved.summary === 'string' && saved.summary) return [saved]
        return []
      }
      return Array.isArray(saved) ? saved : []
    }
    const persistHistory = async (p, st, ws) => {
      let data = st.history || []
      if (p.id === 'aisummary') {
        const top = data[0]
        if (!top) data = []
        else data = { sid: top.sid, summary: top.summary, meta: top.meta }
      }
      return writeJsonStore(ctx, storeRel(p), data, ws.root, ws.session)
    }

    // ===== 对比默认路由（仅供参考提示；不强制）=====
    const defaultRoute = async () => {
      const tmp = { provider: '', model: '' }
      await ai.resolveRoute(tmp)
      return tmp.provider && tmp.model ? tmp.provider + '/' + tmp.model : ''
    }
    const askOne = async (q, route, ws) => {
      const slash = route.indexOf('/')
      const st = { provider: route.slice(0, slash), model: route.slice(slash + 1) }
      const r = await ai.chat(st, '', q, undefined, { root: ws.root, session: ws.session, tool: 'compare' })
      return { route, a: r.a || '', ms: r.ms || 0, out: r.out != null ? r.out : null, err: r.err || null }
    }

    // ===== 渲染 =====
    const render = (st, route, roll) => {
      const p = PRESET_MAP[st.preset] || PRESETS[0]
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root">')
      // preset 芯片行
      parts.push('<div class="tb-chips">' + PRESETS.map((x) =>
        '<button type="button" class="tb-chip' + (x.id === p.id ? ' tb-chip-on' : '') + '" data-action="preset" data-p="' + esc(x.id) + '">' + esc(x.label) + '</button>'
      ).join('') + '</div>')
      // 路由 / 模型选择
      if (p.mode === 'multi') {
        parts.push('<div class="tb-row">' +
          '<select class="tb-select" data-field="provider" data-action-onchange="route" title="Provider（切换后自动加载模型芯片）">' +
            route.providers.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === st.provider ? ' selected' : '') + '>' + esc(x.name || x.id) + '</option>').join('') +
          '</select>' +
          '<span class="tb-note">点芯片加入对比，再点移除' + (roll && roll.calls ? ' · 累计 ' + roll.calls + ' 次 / 输出 ' + roll.out + ' tok' : '') + '</span></div>')
        if (route.models.length) {
          parts.push('<div class="tb-chips">' + route.models.map((m) => {
            const r = st.provider + '/' + m.id
            const on = (st.picked || []).indexOf(r) >= 0
            return '<button type="button" class="tb-chip' + (on ? ' tb-chip-on' : '') + '" data-action="pick" data-r="' + esc(r) + '">' + esc(m.name || m.id) + '</button>'
          }).join('') + '</div>')
        }
        parts.push('<div class="tb-row"><span class="tb-sec-label">已选 ' + (st.picked || []).length + ' 个：</span>' +
          ((st.picked || []).length
            ? st.picked.map((r) => '<button type="button" class="tb-chip tb-chip-on" data-action="pick" data-r="' + esc(r) + '" title="点击移除">' + esc(r) + ' ×</button>').join('')
            : '<span class="tb-note">（至少选 1 个）</span>') +
        '</div>')
      } else {
        const note = '旁路调用 · 不写入会话' + (roll && roll.calls ? ' · 累计 ' + roll.calls + ' 次 / 输出 ' + roll.out + ' tok' : '')
        parts.push(ai.routeRow(st, route, note))
      }
      // 参数区（translate 目标语言 / promptopt 风格 / commitmsg 补充说明）
      for (const param of p.params || []) {
        if (param.options) {
          parts.push('<div class="tb-row"><span class="tb-sec-label">' + esc(param.label) + '</span>' +
            '<select class="tb-select" data-field="' + esc(param.key) + '">' +
              param.options.map((o) => '<option value="' + esc(o) + '"' + (o === (st.params || {})[param.key] ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
            '</select></div>')
        } else if (param.type === 'text') {
          parts.push('<div class="tb-sec"><span class="tb-sec-label">' + esc(param.label) + '（可选）</span>' +
            '<input class="tb-input" data-field="' + esc(param.key) + '" placeholder="如：这次改动是为了修复重建时主题丢失" value="' + esc((st.params || {})[param.key] || '') + '"></div>')
        }
      }
      // 输入区
      if (p.input === 'text') {
        parts.push('<div class="tb-sec"><span class="tb-sec-label">' + (p.mode === 'multi' ? '问题' : '输入') + '</span>' +
          '<textarea class="tb-textarea" data-field="q" placeholder="' + esc(p.hint || '') + '">' + esc(st.q || '') + '</textarea></div>')
      } else if (p.input === 'fileOrText') {
        parts.push('<div class="tb-sec"><span class="tb-sec-label">文件路径（工作区相对，优先于粘贴）</span>' +
          '<input class="tb-input tb-mono" data-field="path" placeholder="如 shared/host.js" value="' + esc(st.path || '') + '"></div>')
        parts.push('<div class="tb-sec"><span class="tb-sec-label">或直接粘贴代码</span>' +
          '<textarea class="tb-textarea" data-field="code" placeholder="路径留空时评审这里粘贴的代码">' + esc(st.code || '') + '</textarea></div>')
      } else if (p.input === 'gitsource' || p.input === 'sessionlog') {
        if (st.info) {
          if (st.info.error) {
            parts.push('<div class="tb-banner tb-banner-error">' + esc(st.info.error) + '</div>')
          } else if (p.input === 'gitsource') {
            const num = (v) => numOf(v)
            parts.push('<div class="tb-banner tb-banner-info">暂存 ' + num(st.info.staged) + ' · 未暂存 ' + num(st.info.unstaged) + ' · 未跟踪 ' + num(st.info.untracked) +
              (st.info.empty ? ' · 暂存区与工作区 diff 均为空（未跟踪文件不参与 diff）'
                : ' · 取用 ' + (st.info.scope === 'staged' ? '暂存区' : '工作区') + ' diff ' + num(st.info.chars) + ' 字符' + (st.info.truncated ? '（超 ' + DIFF_CAP + ' 已截断）' : '')) +
              '</div>')
          } else if (p.input === 'sessionlog') {
            const num = (v) => numOf(v)
            parts.push('<div class="tb-banner tb-banner-info">事件 ' + num(st.info.events) + ' · 对话 ' + num(st.info.chars) + ' 字符' +
              (st.info.truncated ? '（首尾采样，省略 ' + num(st.info.omitted) + '）' : '') + '</div>')
          }
        }
      }
      // 动作按钮
      const btn = { ask: '发送', translate: '翻译', promptopt: '优化提示词', review: '开始评审', commitmsg: '生成提交信息', aisummary: '生成 / 刷新摘要', compare: '并发对比' }
      const acts = []
      if (p.input === 'gitsource' || p.input === 'sessionlog') {
        acts.push('<button type="button" class="tb-btn" data-action="scan">' + (p.input === 'gitsource' ? '扫描改动' : '读取会话') + '</button>')
      }
      acts.push('<button type="button" class="tb-btn tb-btn-primary" data-action="send">' + (btn[p.id] || '执行') + '</button>')
      if ((st.history || []).length) acts.push('<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="clear">清空历史</button>')
      if (p.mode === 'multi' && lastResults) acts.push('<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="clear-results">清除结果</button>')
      parts.push('<div class="tb-row">' + acts.join('') + '</div>')
      if (st.notice) parts.push('<div class="tb-banner tb-banner-info">' + esc(st.notice) + '</div>')
      // 结果 / 历史区
      if (p.mode === 'multi') {
        const res = lastResults
        if (res) {
          parts.push('<div class="tb-card" style="gap:6px"><div class="tb-sec"><span class="tb-sec-label">问题 · ' + fmtClock(res.t) + '</span>' +
            '<div style="font-size:12.5px;white-space:pre-wrap;word-break:break-word">' + esc(res.q) + '</div></div></div>')
          for (const it of res.items) {
            const ms = numOf(it.ms)
            const outN = Number(it.out)
            parts.push('<div class="tb-card">' +
              '<div class="tb-card-head"><span class="tb-key">' + esc(it.route) + '</span>' +
              '<span class="tb-note">' + ms + 'ms' + (it.out != null && Number.isFinite(outN) ? ' · 输出 ' + outN + ' tok' : '') + '</span></div>' +
              (it.err
                ? '<div class="tb-banner tb-banner-error">' + esc(it.err) + '</div>'
                : '<pre class="tb-code">' + esc(it.a || '（空回复）') + '</pre>') +
            '</div>')
          }
        } else {
          parts.push('<div class="tb-notice">结果区：并发对比后按模型分别展示</div>')
        }
      } else {
        const h = st.history || []
        for (let i = 0; i < h.length; i++) {
          const it = Object.assign({}, h[i], { __i: i })
          parts.push(p.row ? p.row(it) : aiHistoryCard(it, '', it.a, '', '结果'))
        }
        if (!h.length) parts.push('<div class="tb-notice">' + (p.id === 'aisummary' ? '点击「生成 / 刷新摘要」对当前会话做 AI 摘要（最近一次结果落盘保留）' : (p.id === 'compare' ? '' : '结果显示在这里（最近 ' + p.cap + ' 条落盘保留）')) + '</div>')
      }
      parts.push('</div>')
      return parts.join('')
    }

    // ===== handler（通用动作分派）=====
    const handler = async ({ action, fields, state, root, session }) => {
      const ws = resolveWorkspace(ctx, root, session)
      const init = { preset: 'ask', provider: '', model: '', picked: [], q: '', path: '', code: '', params: {}, info: null, history: [], notice: null }
      const st = (state && typeof state === 'object' && state) ? state : init
      if (!Array.isArray(st.history)) st.history = []
      if (!Array.isArray(st.picked)) st.picked = []
      if (!st.params || typeof st.params !== 'object') st.params = {}
      const el = fields && fields.__el ? fields.__el : {}
      const p = PRESET_MAP[st.preset] || PRESETS[0]

      // 同步表单字段
      if (typeof fields.q === 'string') st.q = fields.q
      if (typeof fields.path === 'string') st.path = fields.path
      if (typeof fields.code === 'string') st.code = fields.code
      if (typeof fields.provider === 'string' && fields.provider) st.provider = fields.provider
      if (typeof fields.model === 'string' && fields.model) st.model = fields.model
      for (const param of p.params || []) {
        if (typeof fields[param.key] === 'string') st.params[param.key] = fields[param.key]
      }

      // 动作分派
      if (action === 'preset' && el.p && PRESET_MAP[el.p]) {
        paramMem[st.preset] = st.params
        st.preset = el.p
        st.params = paramMem[el.p] || {}
        st.info = null
        st.notice = null
        const np = PRESET_MAP[st.preset]
        st.history = await loadHistory(np, ws)
        if (np.mode === 'multi' && !st.picked.length) {
          const d = await defaultRoute()
          if (d) st.picked = [d]
        }
      } else if (action === 'route') {
        st.model = ''
        if (p.mode === 'multi') st.picked = [] // provider 换了，旧芯片路由作废（与 compare 原行为一致）
      } else if (action === 'pick' && el.r && p.mode === 'multi') {
        const i = st.picked.indexOf(String(el.r))
        if (i >= 0) st.picked.splice(i, 1); else st.picked.push(String(el.r))
      } else if (action === 'scan') {
        const inp = await collectInput(p, st, ws, session)
        if (inp.error) { st.notice = inp.error; st.info = null }
        else if (inp.meta) st.info = inp.meta
      } else if (action === 'clear') {
        st.history = []
        const persisted = await persistHistory(p, st, ws)
        st.notice = persisted ? null : '⚠ 历史未能写入 ' + storeRel(p) + '，仅保存在面板内存中'
      } else if (action === 'send') {
        if (!ai.available) {
          st.notice = 'llm 服务不可用（可切换 preset 浏览历史）'
        } else if (p.mode === 'multi') {
          if (!(st.q || '').trim()) {
            st.notice = '请输入问题'
          } else if (!st.picked.length) {
            st.notice = '请至少选择 1 个模型'
          } else {
            const items = await Promise.all(st.picked.map((r) => askOne(st.q.trim(), r, ws)))
            lastResults = { q: st.q.trim(), t: Date.now(), items }
            const newRound = {
              q: lastResults.q, t: lastResults.t,
              items: items.map((it) => ({ route: it.route, a: String(it.a || '').slice(0, 4000), err: it.err, ms: it.ms, out: it.out })),
            }
            // 落盘走串行链：并发 send 各自「读磁盘→追加本轮→覆写」，不再互相整文件覆盖丢轮次
            st.history = await enqueueCompareSave(async () => {
              const saved = await readJsonStore(ctx, storeRel(p), ws.root, [])
              const rounds = [newRound].concat(Array.isArray(saved) ? saved : []).slice(0, p.cap)
              const persisted = await writeJsonStore(ctx, storeRel(p), rounds, ws.root, ws.session)
              st.notice = persisted ? null : '⚠ 对比记录未能写入 ' + storeRel(p)
              return rounds
            }).catch(() => st.history)
          }
        } else {
          const inp = await collectInput(p, st, ws, session)
          if (inp.error) {
            st.notice = inp.error
          } else if (!ai.available) {
            st.notice = 'llm 服务不可用'
          } else {
            await ai.resolveRoute(st)
            let user
            if (p.id === 'commitmsg') {
              user = (st.params.extra && st.params.extra.trim() ? '补充说明：' + st.params.extra.trim() + '\n\n' : '') +
                'git diff（' + (lastDiff.scope === 'staged' ? '暂存区' : '工作区') + (lastDiff.truncated ? '，已截断' : '') + '）：\n' + lastDiff.text
            } else if (p.id === 'review') {
              user = '文件：' + inp.meta.target + (inp.meta.lang ? '（' + inp.meta.lang + '）' : '') + '\n```\n' + inp.content + '\n```' + (inp.meta.truncated ? '\n（内容过长，仅评审前 ' + CODE_CAP + ' 字符）' : '')
            } else if (p.id === 'aisummary') {
              user = lastLog ? lastLog.text : ''
            } else {
              user = inp.content
            }
            const r = await ai.chat(st, p.sys(st), user, undefined, { root: ws.root, session: ws.session, tool: p.id })
            const ts = Date.now()
            if (p.id === 'translate') {
              st.history = [{
                src: inp.content.slice(0, 500), dst: (r.a || '').slice(0, 4000), err: r.err || null,
                target: st.params.target || TARGETS[0], ms: r.ms || 0, out: r.out != null ? r.out : null, route: r.route || '', t: ts,
              }].concat(st.history || []).slice(0, p.cap)
            } else if (p.id === 'promptopt') {
              st.history = [{
                draft: inp.content.slice(0, 300), opt: (r.a || '').slice(0, 6000), err: r.err || null,
                style: st.params.style || STYLES[0], ms: r.ms || 0, out: r.out != null ? r.out : null, route: r.route || '', t: ts,
              }].concat(st.history || []).slice(0, p.cap)
            } else if (p.id === 'review') {
              st.history = [{
                target: inp.meta.target, chars: inp.content.length, truncated: inp.meta.truncated, report: (r.a || '').slice(0, 8000), err: r.err || null,
                ms: r.ms || 0, out: r.out != null ? r.out : null, route: r.route || '', t: ts,
              }].concat(st.history || []).slice(0, p.cap)
            } else if (p.id === 'commitmsg') {
              st.history = [{
                msg: (r.a || '').slice(0, 2000), err: r.err || null, scope: lastDiff.scope,
                ms: r.ms || 0, out: r.out != null ? r.out : null, route: r.route || '', t: ts,
              }].concat(st.history || []).slice(0, p.cap)
            } else if (p.id === 'aisummary') {
              let at = ''
              try { at = new Date().toISOString().slice(0, 19).replace('T', ' ') } catch (e) {}
              st.history = [{
                sid: session, summary: (r.a || '').slice(0, 8000),
                meta: { events: lastLog.events, chars: lastLog.text.length, truncated: lastLog.truncated, omitted: lastLog.omitted, ms: r.ms || 0, out: r.out != null ? r.out : null, route: r.route || '', at },
              }]
            } else {
              st.history = [{ q: inp.content, a: r.a || '', err: r.err || null, ms: r.ms || 0, out: r.out != null ? r.out : null, route: r.route || '', t: ts }].concat(st.history || []).slice(0, p.cap)
            }
            const persisted = await persistHistory(p, st, ws)
            st.notice = persisted ? null : '⚠ 历史未能写入 ' + storeRel(p) + '，仅保存在面板内存中'
          }
        }
      } else if (action === 'clear-results') {
        lastResults = null
      } else if (action === '') {
        st.history = await loadHistory(p, ws)
        if (p.id === 'compare') {
          const saved = st.history
          if (Array.isArray(saved) && saved.length && saved[0] && Array.isArray(saved[0].items)) lastResults = saved[0]
          const d = await defaultRoute()
          if (!st.picked.length && d) st.picked = [d]
        }
        st.info = null
        st.notice = null
      }

      // 渲染数据
      const show = st
      const route = await ai.resolveRoute(show)
      const roll = await ai.rollup(ws.root, p.id)
      const out = { ok: true, html: render(show, route, roll), state: show }
      if (action === 'copy' && el.i != null) {
        const it = (st.history || [])[Number(el.i)]
        const copyKey = p.copyKey || 'a'
        if (it && typeof it[copyKey] === 'string' && it[copyKey]) out.copy = it[copyKey]
      }
      return out
    }

    tryRegisterTool(ctx, { id: 'aiassist', label: 'AI 助手', order: 11, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l1.4 2.8 3.1.45-2.25 2.2.5 3.1-2.75-1.45-2.75 1.45.5-3.1-2.25-2.2 3.1-.45z"/><circle cx="13" cy="13" r="1.2"/></svg>' }, handler)
  },
}
}

export async function apply(ctx) {
  applyingContext = ctx
  try {
    const feature = create_aiassist()
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
    console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态组件已加载: aiassist')
  } finally {
    applyingContext = null
  }
}
