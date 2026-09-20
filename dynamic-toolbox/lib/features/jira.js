// ===== 工具箱 · jira 原生静态 Host 组件（构建生成，勿手改） =====


export const name = "dsh-dynamic-toolbox/feature/jira"
export const inject = ["fs","credentials","subprocess","timer","toolboxRegistryDynamicToolbox"]

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

const create_jira = () => {
// ===== jira-tool.js：Jira 工具（Host-only，HTML 面板经工具箱 RPC 渲染）=====
// 复用 host.js 的凭据/子进程/记录持久化逻辑；交互语义同原 client.js
// 归档规范（参考 prompt/Jira.md）：查询成功即自动归档 → .dsh-dynamic-toolbox/data/jira/{key}/ 下写 issue.md
// （人类可读：字段表+描述+附件清单）+ issue.json（面板离线查看的机读副本）+ 下载全部附件；
// 点击记录 = 读本地归档（零 API），行尾「刷新」才重新打 API 并覆盖归档。
// 工单本体（description/附件清单）与预览图（base64，可 MB 级）留闭包 lastIssue/lastPreview——
// 不进 state（state 每次动作来回传输，必须轻量）；重跑后面板按重新查询降级。
// 状态：{ input, records, error, info }

const FETCH_SCRIPT = `
const base = (process.env.JIRA_BASE_URL || '').replace(/\\/+$/, '');
const email = process.env.JIRA_EMAIL || '';
const token = process.env.JIRA_TOKEN || '';
const auth = 'Basic ' + Buffer.from(email + ':' + token).toString('base64');
const FIELDS = 'summary,description,status,priority,issuetype,key,created,updated,attachment,assignee,reporter';
function adfText(node) {
  if (!node) return '';
  if (node.type === 'hardBreak') return '\\n';
  let text = node.text || '';
  if (Array.isArray(node.content)) for (const c of node.content) text += adfText(c);
  if (['paragraph','heading','codeBlock','listItem'].includes(node.type)) text += '\\n';
  return text;
}
(async () => {
  const out = { ok: false, issue: null, error: null };
  try {
    if (!email || !token) { out.error = 'JIRA_EMAIL or JIRA_TOKEN is not configured'; console.log(JSON.stringify(out)); return; }
    const key = process.env.JIRA_ISSUE_KEY || '';
    if (!key) { out.error = 'missing issue key'; console.log(JSON.stringify(out)); return; }
    const url = base + '/rest/api/3/issue/' + encodeURIComponent(key) + '?fields=' + encodeURIComponent(FIELDS);
    const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) { out.error = 'Jira API ' + res.status; console.log(JSON.stringify(out)); return; }
    const data = await res.json();
    const f = data.fields || {};
    const person = (p) => (p && p.displayName) || null;
    out.issue = {
      key: data.key, id: data.id,
      summary: f.summary || null,
      status: f.status && f.status.name || null,
      priority: f.priority && f.priority.name || null,
      issuetype: f.issuetype && f.issuetype.name || null,
      assignee: person(f.assignee), reporter: person(f.reporter),
      created: f.created || null, updated: f.updated || null,
      description: (adfText(f.description) || '').trim(),
      attachments: (f.attachment || []).slice(0, 100).map((a) => ({
        filename: a.filename, size: a.size, author: person(a.author), content: a.content,
      })),
    };
    out.ok = true;
  } catch (e) { out.error = String((e && e.message) || e); }
  console.log(JSON.stringify(out));
})()
`

const ATTACH_SCRIPT = `
const fs = require('fs');
const path = require('path');
const base = (process.env.JIRA_BASE_URL || '').replace(/\\/+$/, '');
const email = process.env.JIRA_EMAIL || '';
const token = process.env.JIRA_TOKEN || '';
const auth = 'Basic ' + Buffer.from(email + ':' + token).toString('base64');
// 流式落盘（审计 M7）：content-length 缺失（chunked）/虚报时不能依赖预检——
// 边下边累计字节数，超 20MB 立即断流、销毁半成品并抛错，杜绝整包 arrayBuffer 入内存
const LIMIT = 20 * 1024 * 1024;
async function streamTo(res, outPath) {
  // 先写同目录唯一临时件（评审 P1）：直接写最终路径会立刻截断已有归档，失败再 unlink 就是
  // 数据丢失。成功后 rename 原子替换；失败只清理临时件，旧文件原样保留。
  const tmp = outPath + '.part-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  let total = 0;
  const ws = fs.createWriteStream(tmp);
  try {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > LIMIT) throw new Error('attachment too large (>20MB, streamed)');
      if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
    }
    await new Promise((resolve, reject) => ws.end((err) => (err ? reject(err) : resolve())));
    fs.renameSync(tmp, outPath);
    return total;
  } catch (e) {
    ws.destroy();
    try { fs.unlinkSync(tmp) } catch (e2) {}
    throw e;
  }
}
(async () => {
  try {
    const url = process.env.JIRA_ATTACH_URL || '';
    const key = process.env.JIRA_ISSUE_KEY || '';
    const fname = process.env.JIRA_ATTACH_NAME || 'attachment';
    const root = process.env.JIRA_ARCHIVE_ROOT || '.dsh-dynamic-toolbox/data/jira';
    if (!email || !token) { console.log('ERR|JIRA_EMAIL or JIRA_TOKEN is not configured'); return; }
    if (!url.startsWith(base)) { console.log('ERR|attachment url not allowed'); return; }
    const safe = String(fname).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'attachment';
    const dir = path.join(root, key);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, safe);
    const res = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(120000) });
    if (!res.ok) { console.log('ERR|HTTP ' + res.status); return; }
    // content-length 预检仅作快速路径（可信时省一次建文件）；真实边界由 streamTo 流式保证
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl > LIMIT) { console.log('ERR|attachment too large'); return; }
    const total = await streamTo(res, out);
    console.log('OK|' + out);
    console.log('LEN|' + total);
    if (total <= 5 * 1024 * 1024) console.log('B64|' + fs.readFileSync(out).toString('base64'));
  } catch (e) { console.log('ERR|' + String((e && e.message) || e)); }
})()
`

// 一键归档脚本：读 <dataDir>/jira-issue-in-<唯一后缀>.json（archiveIssue 先落盘，规避 Windows 环境变量长度限制；
// 唯一后缀防并发动作互相覆盖错档），创建 Jira-Issue/{key}/ → 下载全部附件（覆盖同名）→ 写 issue.md（模板参考 prompt/Jira.md）→ 写 issue.json 机读副本
const ARCHIVE_SCRIPT = `
const fs = require('fs');
const path = require('path');
const base = (process.env.JIRA_BASE_URL || '').replace(/\\/+$/, '');
const email = process.env.JIRA_EMAIL || '';
const token = process.env.JIRA_TOKEN || '';
const auth = 'Basic ' + Buffer.from(email + ':' + token).toString('base64');
const cell = (v) => String(v == null || v === '' ? '—' : v).split('|').join('｜').split('\\r\\n').join(' ').split('\\n').join(' ');
const fmtSz = (n) => (n == null || isNaN(Number(n)) ? '—' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
// 流式落盘（审计 M7）：同 ATTACH_SCRIPT——content-length 缺失/虚报时边下边累计，超 20MB 断流删残件
const LIMIT = 20 * 1024 * 1024;
async function streamTo(res, outPath) {
  // 同 ATTACH_SCRIPT：临时件 + 成功 rename 原子替换，失败只清临时件（不破坏已有归档）
  const tmp = outPath + '.part-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  let total = 0;
  const ws = fs.createWriteStream(tmp);
  try {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > LIMIT) throw new Error('附件超过 20MB 上限（流式检测）');
      if (!ws.write(chunk)) await new Promise((r) => ws.once('drain', r));
    }
    await new Promise((resolve, reject) => ws.end((err) => (err ? reject(err) : resolve())));
    fs.renameSync(tmp, outPath);
    return total;
  } catch (e) {
    ws.destroy();
    try { fs.unlinkSync(tmp) } catch (e2) {}
    throw e;
  }
}
(async () => {
  const out = { ok: false, dir: '', archivedAt: '', files: [], errors: [] };
  try {
    const inFile = process.env.JIRA_ISSUE_FILE || '';
    const issue = JSON.parse(fs.readFileSync(inFile, 'utf8'));
    try { fs.unlinkSync(inFile) } catch (e) {}
    const key = String(issue.key || '');
    if (!key) { out.error = 'missing issue key'; console.log(JSON.stringify(out)); return; }
    const root = process.env.JIRA_ARCHIVE_ROOT || '.dsh-dynamic-toolbox/data/jira';
    const dir = path.join(root, key);
    fs.mkdirSync(dir, { recursive: true });
    const atts = Array.isArray(issue.attachments) ? issue.attachments : [];
    for (const a of atts) {
      const fname = String(a.filename || 'attachment').replace(/[\\\\/:*?"<>|]/g, '_').trim() || 'attachment';
      const rec = { filename: a.filename || fname, size: a.size != null ? a.size : null, author: a.author || null, content: a.content || null, path: key + '/' + fname, downloaded: false, error: null };
      try {
        const url = String(a.content || '');
        if (!url.startsWith(base)) throw new Error('附件地址不被允许');
        const res = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(120000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        // content-length 预检仅快速路径；真实边界由 streamTo 流式保证（审计 M7）
        const cl = Number(res.headers.get('content-length') || 0);
        if (cl > LIMIT) throw new Error('附件超过 20MB 上限');
        const outPath = path.join(dir, fname);
        rec.size = await streamTo(res, outPath);
        rec.downloaded = true;
      } catch (e) { rec.error = String((e && e.message) || e); out.errors.push((a.filename || fname) + ': ' + rec.error); }
      out.files.push(rec);
    }
    out.archivedAt = new Date().toISOString();
    const L = [];
    L.push('# ' + key + ': ' + (issue.summary || '(无标题)'));
    L.push('');
    L.push('| 字段 | 值 |');
    L.push('|------|-----|');
    L.push('| Key | ' + cell(issue.key) + ' |');
    L.push('| ID | ' + cell(issue.id) + ' |');
    L.push('| Type | ' + cell(issue.issuetype) + ' |');
    L.push('| Status | ' + cell(issue.status) + ' |');
    L.push('| Priority | ' + cell(issue.priority) + ' |');
    L.push('| Assignee | ' + cell(issue.assignee) + ' |');
    L.push('| Reporter | ' + cell(issue.reporter) + ' |');
    L.push('| Created | ' + cell(issue.created) + ' |');
    L.push('| Updated | ' + cell(issue.updated) + ' |');
    L.push('');
    L.push('## 描述');
    L.push('');
    L.push(issue.description ? String(issue.description) : '（无描述）');
    L.push('');
    L.push('## 附件清单');
    L.push('');
    if (out.files.length) {
      L.push('| 文件名 | 大小 | 上传者 | 下载路径 |');
      L.push('|--------|------|--------|----------|');
      for (const f of out.files) L.push('| ' + cell(f.filename) + ' | ' + fmtSz(f.size) + ' | ' + cell(f.author) + ' | ./' + cell(f.path.split('/').pop()) + ' |');
    } else {
      L.push('（无附件）');
    }
    L.push('');
    L.push('> 归档时间：' + out.archivedAt + (out.errors.length ? '；部分附件失败：' + out.errors.join('；') : ''));
    fs.writeFileSync(path.join(dir, 'issue.md'), L.join('\\n'));
    fs.writeFileSync(path.join(dir, 'issue.json'), JSON.stringify(Object.assign({}, issue, { archivedAt: out.archivedAt, attachments: out.files }), null, 2));
    out.dir = (root + '/' + key).split('\\\\').join('/');
    out.ok = true;
  } catch (e) { out.error = String((e && e.message) || e); }
  console.log(JSON.stringify(out));
})()
`

// 本地附件预览：只允许读 <cwd>/Jira-Issue/ 下的文件（防路径逃逸），≤5MB 转 base64
const LOCAL_B64_SCRIPT = `
const fs = require('fs');
const path = require('path');
(async () => {
  try {
    const root = path.resolve(process.env.JIRA_ARCHIVE_ROOT || '.dsh-dynamic-toolbox/data/jira');
    const target = path.resolve(root, String(process.env.JIRA_LOCAL_FILE || ''));
    if (target.indexOf(root + path.sep) !== 0) { console.log('ERR|非法路径'); return; }
    const buf = fs.readFileSync(target);
    if (buf.length > 5 * 1024 * 1024) { console.log('ERR|文件较大，暂不支持网页预览'); return; }
    console.log('B64|' + buf.toString('base64'));
  } catch (e) { console.log('ERR|' + String((e && e.message) || e)); }
})()
`

const REL_DATA_DIR = '.dsh-dynamic-toolbox'
// 相对路径统一正斜杠：反斜杠在 POSIX 上会成为字面文件名字符（与数据目录分裂）
const REL_WATCH_FILE = '.dsh-dynamic-toolbox/jira-watch.json'
const REL_ARCHIVE_DIR = pluginDataDir('jira') // .dsh-dynamic-toolbox/data/jira（shared 约定：内容产物目录）

return {
  name: 'jira-tool',
  inject: ['credentials', 'subprocess', 'timer'],
  apply(ctx) {
    const fsService = ctx.get('fs')
    const subprocess = ctx.get('subprocess')
    let lastIssue = null // 工单本体（闭包持有，不进 state）
    let lastPreview = null // 预览图 { name, data(base64) }（闭包持有，不进 state）

    // sessionId 优先：拿到当前会话 → root 与 session 同时确定（写入策略需要 session 才能按会话 cwd 授权）
    const resolveWs = (rootArg, sessionId) => {
      const sessionsSvc = ctx.get('sessions')
      if (sessionId && sessionsSvc) {
        try {
          const s = sessionsSvc.get(sessionId)
          const cwd = s && s.header && s.header.cwd
          if (s && typeof cwd === 'string' && cwd) return { root: cwd.replace(/[\\/]+$/, ''), session: s }
        } catch (e) {}
      }
      if (rootArg && /^([A-Za-z]:[\\/]|\/)/.test(rootArg)) {
        return { root: rootArg.replace(/[\\/]+$/, ''), session: null }
      }
      // 弱兜底：取 sessions.list()[0]（list 最新在前，即最新会话）——仅在无 sessionId 且 rootArg
      // 非绝对路径时触达。旧实现遍历取「最后一个」会命中最旧会话、落错工作区，已废弃。
      // 注：此层兜底与 shared/host.js 的 resolveWorkspace 存在语义差异，待后续统一到共享实现。
      if (sessionsSvc) {
        try {
          const first = sessionsSvc.list()[0]
          const cwd = first && first.header && first.header.cwd
          if (first && typeof cwd === 'string' && cwd) return { root: cwd.replace(/[\\/]+$/, ''), session: first }
        } catch (e) {}
      }
      const sp = ctx.get('sandboxPolicy')
      const root = sp && typeof sp.workspaceRoot === 'string' ? sp.workspaceRoot.replace(/[\\/]+$/, '') : ''
      return { root, session: null }
    }

    const resolveCred = async (ref) => {
      const r = await ctx.credentials.resolve(ref)
      return r ? r.value : undefined
    }
    // ===== 凭据设置（面板内配置，写入 credentials 服务的可写层 —— 与 Harness 设置的 API Key 同机制同存储）=====
    // 三键：JIRA_BASE_URL / JIRA_EMAIL / JIRA_TOKEN。describe 只暴露配置状态与来源、不暴露值；
    // set 拒绝空值（清空走 unset），被只读来源（真实环境变量）遮蔽时 set/unset 会拒绝。
    // 安全约定：输入框永远渲染空值、密文绝不进 state / HTML，每次动作后由 describe 刷新状态。
    const CRED_ROWS = [
      ['JIRA_BASE_URL', 'Base URL', 'credUrl', 'text', '如 https://your-team.atlassian.net'],
      ['JIRA_EMAIL', '邮箱', 'credEmail', 'text', '如 you@example.com'],
      ['JIRA_TOKEN', 'API Token', 'credToken', 'password', 'Atlassian API Token'],
    ]
    const describeCred = async (ref) => {
      try {
        const info = await ctx.credentials.describe(ref)
        if (!info || typeof info !== 'object') return null
        const src = info.source
        return {
          configured: Boolean(info.configured),
          source: typeof src === 'string' ? src : (src && (src.id || src.kind || src.label)) || '',
          writable: info.writable !== false,
        }
      } catch (e) { return null }
    }
    const describeAllCreds = async () => {
      const out = {}
      for (const row of CRED_ROWS) out[row[0]] = await describeCred(row[0])
      return out
    }
    const renderCredSettings = (st) => {
      if (!st.credOpen) return ''
      const info = st.credInfo || {}
      const rows = CRED_ROWS.map(([ref, label, field, type, ph]) => {
        const d = info[ref]
        const pill = d == null
          ? '<span class="tb-pill tb-pill-plain">状态未知</span>'
          : d.configured
            ? '<span class="tb-pill tb-pill-done">已配置' + (d.source ? ' · ' + esc(d.source) : '') + '</span>'
            : '<span class="tb-pill tb-pill-todo">未配置</span>'
        const roHint = d && d.configured && d.writable === false
          ? '<span class="tb-note">被只读来源（环境变量）遮蔽，需在系统环境中修改</span>' : ''
        return '<div class="tb-sec"><span class="tb-sec-label">' + esc(label) + '（' + esc(ref) + '）' + pill + '</span>' +
          '<input class="tb-input tb-mono" type="' + type + '" data-field="' + field + '" value="" placeholder="' + esc(ph) + '（留空保持不变）" autocomplete="off">' +
          roHint + '</div>'
      })
      return '<div class="tb-card">' +
        '<div class="tb-sec-label">Jira 凭据 · 保存到 Harness 凭据存储（与设置的 API Key 同机制，立即生效）</div>' +
        rows.join('') +
        '<div class="tb-row">' +
          '<button type="button" class="tb-btn tb-btn-primary" data-action="save-cred">保存凭据</button>' +
          '<button type="button" class="tb-btn tb-btn-sm tb-btn-danger-ghost" data-action="clear-cred">清除全部</button>' +
          '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="toggle-cred">收起</button>' +
        '</div></div>'
    }
    const baseEnv = async () => {
      const [base, email, token] = await Promise.all([
        resolveCred('JIRA_BASE_URL'),
        resolveCred('JIRA_EMAIL'),
        resolveCred('JIRA_TOKEN'),
      ])
      return {
        JIRA_BASE_URL: base || 'https://your-team.atlassian.net',
        JIRA_EMAIL: email || '',
        JIRA_TOKEN: token || '',
      }
    }
    const runNode = async (script, env, wsRoot) => {
      if (!subprocess) return { ok: false, error: 'subprocess 服务不可用' }
      const handle = subprocess.spawn({
        argv: ['node', '-'],
        cwd: wsRoot,
        stdio: {
          stdin: { data: script },
          // 注意：≤5MB 附件回传 base64 约 6.7MB，已贴近此 8MB 上限；调大预览阈值前先同步放大 maxBytes
          stdout: { maxBytes: 8 * 1024 * 1024 },
          stderr: { maxBytes: 256 * 1024 },
        },
        graceMs: 120000,
        env,
      })
      const outcome = await handle.done
      const stdout = handle.collected.stdout.readFrom(0).text
      const stderr = handle.collected.stderr.readFrom(0).text
      if (outcome.exitCode !== 0) return { ok: false, error: (stderr || stdout).slice(0, 500) }
      return { ok: true, stdout }
    }

    const ensureDirPromises = {}
    const ensureDataDir = (wsRoot) => {
      const existing = ensureDirPromises[wsRoot]
      if (existing) return existing
      const p = (async () => {
        if (!subprocess) return
        try {
          const abs = await dataPathAbs(ctx, '.dsh-dynamic-toolbox', wsRoot) // 仓库根的数据目录（随配置的 dataDir）
          const handle = subprocess.spawn({
            argv: ['node', '-e', "require('fs').mkdirSync(process.argv[1], { recursive: true })", abs],
            cwd: wsRoot,
            stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
            graceMs: 30000,
          })
          await handle.done
        } catch (e) {}
      })()
      ensureDirPromises[wsRoot] = p
      return p
    }

    const readJsonFile = async (rel, wsRoot) => {
      if (!fsService) return []
      let target = null
      try {
        target = await resolveDataPath(ctx, rel, wsRoot)
        if (!target || !await fsService.stat(target)) return []
      } catch (e) { return [] }
      let raw = null
      try { raw = await fsService.readText(target) } catch (e) { return [] }
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch (e) {
        // 解析失败：原文隔离备份（best-effort），阻断「损坏→显示空→下次写入覆盖销毁」链条；
        // 显式 workspace-write@仓库根，避免缺省策略回落宿主进程 cwd 被 FS_SANDBOX_DENIED
        try {
          const qBase = await storeBase(ctx, wsRoot)
          await fsService.writeText(target + '.corrupt-' + Date.now(), String(raw == null ? '' : raw), undefined, undefined, { mode: 'workspace-write', workspaceRoot: qBase })
          console.warn('jira/readJsonFile: JSON 解析失败，原文已隔离备份 (' + rel + ')')
        } catch (e2) {}
        return []
      }
    }
    const writeJsonFile = async (rel, data, ws) => {
      if (!fsService) return false
      try {
        await ensureDataDir(ws.root)
        const target = await resolveDataPath(ctx, rel, ws.root)
        if (!target) return false
        // 有会话 → 按会话策略（cwd 即工作区边界）；无会话 → 显式以仓库根为可写根
        // （缺省会回落到部署默认策略，其 root 是宿主进程 cwd，写不进仓库会被 FS_SANDBOX_DENIED 静默吞掉）
        const sp = ctx.get('sandboxPolicy')
        const base = await storeBase(ctx, ws.root)
        const policy = sp && ws.session ? sp.resolve({ session: ws.session }) : { mode: 'workspace-write', workspaceRoot: base }
        await fsService.writeText(target, JSON.stringify(data, null, 2), undefined, undefined, policy)
        return true
      } catch (e) {
        console.error('jira/records 持久化失败:', String((e && e.message) || e))
        return false
      }
    }
    // 归档临时文件善后：fs 服务无删除 API，尽力用空内容覆写（文件内含完整工单本体的敏感副本）。
    // 正常路径下 ARCHIVE_SCRIPT 读入后已自行 unlink，这里只兜底「子进程未跑起/早退」的残留；
    // best-effort，失败静默（只影响残留，不影响功能）。
    const scrubTempFile = async (rel, ws) => {
      if (!fsService) return
      try {
        const target = await resolveDataPath(ctx, rel, ws.root)
        if (!target || !await fsService.stat(target)) return
        const sp = ctx.get('sandboxPolicy')
        const base = await storeBase(ctx, ws.root)
        const policy = sp && ws.session ? sp.resolve({ session: ws.session }) : { mode: 'workspace-write', workspaceRoot: base }
        await fsService.writeText(target, '', undefined, undefined, policy)
      } catch (e) {}
    }


    const fmtDate = (iso) => {
      if (!iso) return '—'
      const d = new Date(iso)
      if (isNaN(d.getTime())) return esc(iso)
      return esc(d.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))
    }
    const getTimeAgo = (iso) => {
      if (!iso) return '未知时间'
      const d = new Date(iso)
      if (isNaN(d.getTime())) return '未知时间'
      const now = new Date()
      const diffMs = now - d
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)
      if (diffMins < 1) return '刚刚'
      if (diffMins < 60) return diffMins + ' 分钟前'
      if (diffHours < 24) return diffHours + ' 小时前'
      if (diffDays < 30) return diffDays + ' 天前'
      return fmtDate(iso)
    }
    const mimeFor = (name) => {
      const n = String(name || '').toLowerCase()
      if (n.indexOf('.png') > -1) return 'image/png'
      if (n.indexOf('.jpg') > -1 || n.indexOf('.jpeg') > -1) return 'image/jpeg'
      if (n.indexOf('.gif') > -1) return 'image/gif'
      if (n.indexOf('.webp') > -1) return 'image/webp'
      if (n.indexOf('.bmp') > -1) return 'image/bmp'
      return 'image/png'
    }
    // 状态 → pill 色调：进行中=蓝、完成=绿、待办=灰、其他=黄
    const statusTone = (s) => {
      const v = String(s || '').toLowerCase()
      if (/完成|已完成|done|closed|resolved|解决|关闭/.test(v)) return 'done'
      if (/进行|progress|开发|处理中|review|评审|测试/.test(v)) return 'active'
      if (/待办|todo|to do|open|新建|未开始|backlog/.test(v)) return 'todo'
      return 'other'
    }

    const fetchIssue = async (key, ws) => {
      const env = await baseEnv()
      env.JIRA_ISSUE_KEY = key
      const res = await runNode(FETCH_SCRIPT, env, ws.root)
      if (!res.ok) return { ok: false, error: res.error }
      return JSON.parse(res.stdout)
    }
    const downloadAttachment = async (url, key, filename, ws) => {
      const env = await baseEnv()
      env.JIRA_ATTACH_URL = url
      env.JIRA_ISSUE_KEY = key
      env.JIRA_ATTACH_NAME = filename
      env.JIRA_ARCHIVE_ROOT = await dataPathAbs(ctx, pluginDataDir('jira'), ws.root) // 绝对路径：归档落仓库根
      const res = await runNode(ATTACH_SCRIPT, env, ws.root)
      if (!res.ok) return res
      let path = ''
      let len = 0
      let b64 = ''
      for (const line of res.stdout.split(/\r?\n/)) {
        if (line.indexOf('OK|') === 0) path = line.slice(3).trim()
        else if (line.indexOf('LEN|') === 0) len = Number(line.slice(4)) || 0
        else if (line.indexOf('B64|') === 0) b64 = line.slice(4)
        else if (line.indexOf('ERR|') === 0) return { ok: false, error: line.slice(4) }
      }
      if (!path) return { ok: false, error: '附件归档失败' }
      if (!/^[A-Za-z]:[\\/]/.test(path) && path.charAt(0) !== '/') path = ws.root + '\\' + path
      return { ok: true, path, len, previewable: b64.length > 0, data: b64 || null }
    }

    // ---- 归档（prompt/Jira.md 规范）：Jira-Issue/{key}/ = issue.md + issue.json + 全部附件 ----
    // issue.json 是面板离线查看的机读副本；issue.md 是人类可读摘要（字段表+描述+附件清单）。
    // 临时输入文件带唯一后缀：即便入口串行化被绕过，也不会出现「A 的子进程读到 B 的工单」的错档覆盖。
    const archiveIssue = async (issue, ws) => {
      const inRel = REL_DATA_DIR + '/jira-issue-in-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.json'
      if (!await writeJsonFile(inRel, issue, ws)) return { ok: false, error: '临时文件写入失败' }
      const env = await baseEnv()
      env.JIRA_ISSUE_FILE = await dataPathAbs(ctx, inRel, ws.root)
      env.JIRA_ARCHIVE_ROOT = await dataPathAbs(ctx, pluginDataDir('jira'), ws.root) // 绝对路径：归档落仓库根
      const res = await runNode(ARCHIVE_SCRIPT, env, ws.root)
      await scrubTempFile(inRel, ws) // 尽力清理残留（正常路径子进程已 unlink，stat 不中即跳过）
      if (!res.ok) return { ok: false, error: res.error }
      try { return JSON.parse(res.stdout) } catch (e) { return { ok: false, error: '归档结果解析失败' } }
    }
    // 读本地归档（零 API）；无归档返回 null
    const loadArchive = async (key, ws) => {
      if (!fsService) return null
      try {
        const target = await resolveDataPath(ctx, pluginDataDir('jira') + '/' + key + '/issue.json', ws.root)
        if (!target || !await fsService.stat(target)) return null
        const data = JSON.parse(await fsService.readText(target))
        if (!data || typeof data !== 'object' || !data.key) return null
        return data
      } catch (e) { return null }
    }
    // 归档模式下补下载成功的附件 → 回写 issue.json 对应条目
    const updateArchiveEntry = async (key, filename, size, ws) => {
      const data = await loadArchive(key, ws)
      if (!data || !Array.isArray(data.attachments)) return
      for (const a of data.attachments) {
        if (a && a.filename === filename) { a.downloaded = true; a.error = null; if (size) a.size = size }
      }
      await writeJsonFile(REL_ARCHIVE_DIR + '/' + key + '/issue.json', data, ws)
    }
    // 本地附件预览（base64，≤5MB；LOCAL_B64_SCRIPT 限定 Jira-Issue/ 内）
    const previewLocalFile = async (relPath, ws) => {
      const res = await runNode(LOCAL_B64_SCRIPT, { JIRA_ARCHIVE_ROOT: await dataPathAbs(ctx, pluginDataDir('jira'), ws.root), JIRA_LOCAL_FILE: relPath }, ws.root)
      if (!res.ok) return { ok: false, error: res.error }
      for (const line of res.stdout.split(/\r?\n/)) {
        if (line.indexOf('B64|') === 0) return { ok: true, data: line.slice(4) }
        if (line.indexOf('ERR|') === 0) return { ok: false, error: line.slice(4) }
      }
      return { ok: false, error: '预览读取失败' }
    }
    // 查询 + 自动归档 + 记录落盘（query / view-record 兜底 / refresh-record / refresh-all 共用）
    const fetchAndArchive = async (k, st, ws, opts) => {
      const setView = !opts || opts.setView !== false
      const res = await fetchIssue(k, ws)
      if (!res.ok) return { ok: false, error: res.error }
      const ar = await archiveIssue(res.issue, ws)
      const old = (st.records || []).find((x) => x && x.key === res.issue.key)
      const rec = {
        key: res.issue.key, summary: res.issue.summary, status: res.issue.status, updated: res.issue.updated,
        fetchedAt: new Date().toISOString(),
        archivedAt: (ar.ok && ar.archivedAt) || (old && old.archivedAt) || null,
      }
      const r2 = await runRecords('upsert', rec, ws)
      if (r2.ok) {
        st.records = r2.records
        if (r2.persisted === false) st.info = '⚠ 记录未能写入 .dsh-dynamic-toolbox/jira-watch.json，仅保存在面板内存中'
      }
      if (setView) {
        lastIssue = ar.ok
          ? Object.assign({}, res.issue, { __archived: true, archivedAt: ar.archivedAt, attachments: ar.files })
          : res.issue
        if (ar.ok) {
          const fails = (ar.files || []).filter((f) => !f.downloaded)
          st.info = '已归档 → ' + REL_ARCHIVE_DIR + '/' + res.issue.key + '/（附件 ' + ((ar.files || []).length - fails.length) + '/' + (ar.files || []).length + '）' +
            (fails.length ? '；失败：' + fails.map((f) => f.filename).join('、') : '')
        } else {
          st.info = '⚠ 查询成功但归档失败：' + (ar.error || '未知原因') + '（仅本次内存展示）'
        }
      }
      return { ok: true, archived: Boolean(ar.ok) }
    }

    const render = (st, busy) => {
      const parts = []
      parts.push('<div class="tb-query">' +
        '<input class="tb-input" data-field="key" placeholder="输入 Jira ID，如 PROJ-123" value="' + esc(st.input || '') + '" />' +
        '<button type="button" class="tb-btn tb-btn-primary" data-action="query"' + (busy ? ' disabled' : '') + '>' + (busy ? '查询中…' : '查询') + '</button>' +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="toggle-cred">' + (st.credOpen ? '收起设置' : '凭据设置') + '</button>' +
      '</div>')
      parts.push(renderCredSettings(st))
      if (st.error) parts.push('<div class="tb-banner tb-banner-error">' + esc(st.error) + '</div>')
      if (st.info) parts.push('<div class="tb-banner tb-banner-info">' + esc(st.info) + '</div>')
      if (lastIssue) {
        const i = lastIssue
        const it = []
        it.push('<div class="tb-card-head">' +
          '<span class="tb-key">' + esc(i.key) + '</span>' +
          '<div class="tb-title">' + esc(i.summary || '(无标题)') + '</div>' +
          '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="close-issue" title="关闭详情（记录保留在列表中）" style="margin-left:auto">关闭</button>' +
        '</div>')
        const pills = []
        if (i.status) pills.push('<span class="tb-pill tb-pill-' + statusTone(i.status) + '"><span class="tb-dot tb-dot-' + statusTone(i.status) + '"></span>' + esc(i.status) + '</span>')
        if (i.priority) pills.push('<span class="tb-pill tb-pill-plain">优先级 ' + esc(i.priority) + '</span>')
        if (i.issuetype) pills.push('<span class="tb-pill tb-pill-plain">' + esc(i.issuetype) + '</span>')
        if (i.__archived) pills.push('<span class="tb-pill tb-pill-done" title="归档时间 ' + esc(i.archivedAt || '') + '；查看未访问 API">本地归档 · ' + esc(getTimeAgo(i.archivedAt)) + '</span>')
        if (pills.length) it.push('<div class="tb-pills">' + pills.join('') + '</div>')
        it.push('<div class="tb-meta">' + [['经办人', i.assignee], ['报告人', i.reporter], ['创建时间', fmtDate(i.created)], ['更新时间', fmtDate(i.updated)]].map((row) =>
          '<div class="tb-meta-item"><span class="tb-meta-label">' + esc(row[0]) + '</span><span class="tb-meta-value">' + (row[1] == null || row[1] === '' ? '—' : esc(String(row[1]))) + '</span></div>'
        ).join('') + '</div>')
        if (i.description) {
          it.push('<div class="tb-sec"><div class="tb-sec-label">描述</div><div class="tb-desc">' + esc(i.description) + '</div></div>')
        }
        if (i.attachments && i.attachments.length) {
          const isArc = Boolean(i.__archived)
          const failCount = isArc ? i.attachments.filter((a) => !a.downloaded).length : 0
          it.push('<div class="tb-sec"><div class="tb-sec-label">附件 · ' + i.attachments.length +
            (isArc
              ? ' <span class="tb-note">已归档到 ' + esc(REL_ARCHIVE_DIR + '/' + i.key + '/') + (failCount ? '；' + failCount + ' 个失败（行尾「刷新」重试）' : '') + '</span>'
              : ' <button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="download-all"' + (busy ? ' disabled' : '') + '>全部归档</button>') +
            '</div><div class="tb-files">' +
            i.attachments.map((a) => {
              const ext = String((a.filename || '').split('.').pop() || '').toLowerCase()
              const extClass = /^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext) ? 'tb-ext-img'
                : /^(zip|rar|7z|tar|gz)$/.test(ext) ? 'tb-ext-zip'
                : /^(pdf|docx?|xlsx?|pptx?|txt|md|csv|log)$/.test(ext) ? 'tb-ext-doc' : 'tb-ext-gen'
              const extLabel = ext ? ext.slice(0, 4) : 'file'
              if (isArc) {
                if (!a.downloaded) {
                  return '<div class="tb-file" title="归档失败：' + esc(a.error || '') + '（行尾「刷新」重试）">' +
                    '<span class="tb-ext ' + extClass + '">' + esc(extLabel) + '</span>' +
                    '<span class="tb-file-name">' + esc(a.filename || '(未命名)') + '</span>' +
                    '<span class="tb-file-meta">归档失败</span>' +
                    '<span class="tb-file-act">—</span>' +
                  '</div>'
                }
                return '<div class="tb-file" data-action="preview-local" data-path="' + esc(a.path || '') + '" title="本地预览（零 API）">' +
                  '<span class="tb-ext ' + extClass + '">' + esc(extLabel) + '</span>' +
                  '<span class="tb-file-name">' + esc(a.filename || '(未命名)') + '</span>' +
                  '<span class="tb-file-meta">' + esc((a.size != null ? fmtSize(a.size) : '') + (a.author ? ' · ' + a.author : '')) + '</span>' +
                  '<span class="tb-file-act">' + (busy ? '读取中…' : '预览') + '</span>' +
                '</div>'
              }
              return '<div class="tb-file" data-action="download" data-url="' + esc(a.content || '') + '" data-filename="' + esc(a.filename || '') + '" title="点击预览 / 归档">' +
                '<span class="tb-ext ' + extClass + '">' + esc(extLabel) + '</span>' +
                '<span class="tb-file-name">' + esc(a.filename || '(未命名)') + '</span>' +
                '<span class="tb-file-meta">' + esc((a.size != null ? fmtSize(a.size) : '') + (a.author ? ' · ' + a.author : '')) + '</span>' +
                '<span class="tb-file-act">' + (busy ? '下载中…' : '预览') + '</span>' +
              '</div>'
            }).join('') + '</div></div>')
        }
        if (lastPreview && lastPreview.data) {
          it.push('<div class="tb-preview">' +
            '<div class="tb-preview-head"><span class="tb-preview-name">' + esc(lastPreview.name || '预览') + '</span>' +
            '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="close-preview">关闭</button></div>' +
            '<img class="tb-preview-img" src="data:' + mimeFor(lastPreview.name) + ';base64,' + lastPreview.data + '" alt="' + esc(lastPreview.name || 'preview') + '" />' +
          '</div>')
        }
        parts.push('<div class="tb-card">' + it.join('') + '</div>')
      }
      const records = st.records || []
      let body = ''
      parts.push('<div class="tb-list-head">' +
        '<span class="tb-list-title">已查询记录<span class="tb-count">' + records.length + '</span></span>' +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="refresh-all"' + (busy || records.length === 0 ? ' disabled' : '') + '>全部刷新</button>' +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-danger-ghost" data-action="clear"' + (records.length === 0 ? ' disabled' : '') + '>清空</button>' +
      '</div>')
      if (records.length === 0) {
        body = '<div class="tb-empty">' +
          '<div class="tb-empty-glyph"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg></div>' +
          '<div class="tb-empty-title">暂无查询记录</div>' +
          '<div class="tb-empty-sub">输入 Jira ID 查询后将自动保存</div>' +
        '</div>'
      } else {
        body = '<div class="tb-list">' + records.map((r) => {
          const tone = statusTone(r.status)
          return '<div class="tb-rec' + (lastIssue && lastIssue.key === r.key ? ' tb-rec-active' : '') + '" data-action="view-record" data-key="' + esc(r.key) + '" title="点击查看本地归档（零 API）">' +
            '<div class="tb-rec-main">' +
              '<div class="tb-rec-top">' +
                '<span class="tb-rec-key">' + esc(r.key) + '</span>' +
                (r.summary ? '<span class="tb-rec-summary">' + esc(String(r.summary)) + '</span>' : '') +
              '</div>' +
              '<div class="tb-rec-sub">' +
                (r.status ? '<span class="tb-rec-status"><span class="tb-dot tb-dot-' + tone + '"></span>' + esc(r.status) + '</span>' : '') +
                '<span class="tb-rec-time">' + esc(getTimeAgo(r.updated)) + '</span>' +
                (r.archivedAt
                  ? '<span title="归档时间 ' + esc(r.archivedAt) + '">已归档 · ' + esc(getTimeAgo(r.archivedAt)) + '</span>'
                  : '<span>未归档（点击查看时自动归档）</span>') +
              '</div>' +
            '</div>' +
            '<div class="tb-rec-acts">' +
              '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="refresh-record" data-key="' + esc(r.key) + '" title="从 Jira 重新获取并覆盖归档"' + (busy ? ' disabled' : '') + '>刷新</button>' +
              '<button type="button" class="tb-btn tb-btn-sm tb-btn-danger-ghost" data-action="remove" data-key="' + esc(r.key) + '"' + (busy ? ' disabled' : '') + '>删除</button>' +
            '</div>' +
          '</div>'
        }).join('') + '</div>'
      }
      return '<div class="jr-tabpanel tb-root tb-pane"><div class="tb-pane-head">' + parts.join('') + '</div><div class="tb-pane-body tb-pane-col">' + body + '</div></div>'
    }

    // per-root 动作串行链：Client 壳的请求序号防护只丢弃过期响应，Host 侧动作仍会并发执行；
    // 入口统一排队后，「共享临时文件错档 / 记录读-改-写竞态 / 双击重复查询」从根上消失。
    // render(st, busy) 的 busy 死参数暂不重构（按钮 disabled 维持现状，竞态已由本锁消除）。
    const _actionChains = {}
    const serializedAction = (rootKey, fn) => {
      const key = String(rootKey || '?')
      const prev = _actionChains[key] || Promise.resolve()
      const run = prev.then(fn, fn) // 前序失败不阻塞后续；fn 自带 try/catch 契约
      _actionChains[key] = run.then(() => undefined, () => undefined)
      return run
    }
    const handleAction = async (ws, { action, fields, state }) => {
      const st = (state && typeof state === 'object' && state) ? state : { input: '', records: [], error: null, info: null, credOpen: false, credInfo: null }
      // state 迁移：issue/preview 本体已挪闭包（旧 state 可能还挂着 description/base64 大字段）
      delete st.issue; delete st.preview
      try {
        if (action === 'toggle-cred') {
          st.credOpen = !st.credOpen
          if (st.credOpen) st.credInfo = await describeAllCreds()
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'save-cred') {
          const saved = []
          const failed = []
          for (const [ref, label, field] of CRED_ROWS) {
            const v = String(fields[field] != null ? fields[field] : '').trim()
            if (!v) continue
            try { await ctx.credentials.set(ref, v); saved.push(label) }
            catch (e) { failed.push(label + ': ' + String((e && e.message) || e)) }
          }
          st.credOpen = true
          st.credInfo = await describeAllCreds()
          if (failed.length) st.error = '凭据保存失败 — ' + failed.join('；')
          else st.error = null
          st.info = saved.length ? '已保存 ' + saved.join('、') + ' 到 Harness 凭据存储，下次查询立即生效' : '没有输入新值（留空保持不变）'
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'clear-cred') {
          const failed = []
          for (const [ref, label] of CRED_ROWS) {
            try { await ctx.credentials.unset(ref) }
            catch (e) { failed.push(label + ': ' + String((e && e.message) || e)) }
          }
          st.credOpen = true
          st.credInfo = await describeAllCreds()
          if (failed.length) { st.error = '凭据清除失败 — ' + failed.join('；'); st.info = null }
          else { st.error = null; st.info = '已清除 Jira 凭据（环境变量来源不受影响）' }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'query' || action === 'refresh-record') {
          // query = 输入框主动查询；refresh-record = 记录行尾「刷新」——两者都打 API 并自动归档
          const elKey = fields.__el && fields.__el.key != null ? fields.__el.key : null
          const k = String(elKey != null ? elKey : (fields.key != null ? fields.key : st.input)).trim()
          if (!k || (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(k) && !/^\d+$/.test(k))) { st.error = '非法的 Jira key: ' + k; if (!/^\d+$/.test(k) && k) st.input = k; return { ok: true, html: render(st, false), state: st } }
          st.input = k
          st.error = null
          st.info = null
          lastPreview = null
          const res = await fetchAndArchive(k, st, ws)
          if (!res.ok) {
            st.error = (res.error || '查询失败')
            if (/not configured/i.test(String(res.error || ''))) st.error += '（点「凭据设置」直接配置，立即生效）'
            lastIssue = null
          }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'view-record' || action === 'query-record') {
          // 点击记录 = 读本地归档（零 API）；本地无归档才回退 API + 自动归档
          const elKey = fields.__el && fields.__el.key != null ? fields.__el.key : null
          const k = String(elKey != null ? elKey : (fields.key != null ? fields.key : '')).trim()
          if (!k) { st.error = '缺少 Jira key'; return { ok: true, html: render(st, false), state: st } }
          st.input = k
          st.error = null
          st.info = null
          lastPreview = null
          const arc = await loadArchive(k, ws)
          if (arc) {
            lastIssue = Object.assign({}, arc, { __archived: true })
            st.info = '本地归档（' + getTimeAgo(arc.archivedAt) + '归档）· 未访问 API；点行尾「刷新」可从 Jira 重新获取并覆盖归档'
          } else {
            const res = await fetchAndArchive(k, st, ws)
            if (!res.ok) {
              st.error = '本地无归档，联网获取失败：' + (res.error || '')
              if (/not configured/i.test(String(res.error || ''))) st.error += '（点「凭据设置」直接配置，立即生效）'
              lastIssue = null
            } else if (st.info == null || st.info === '') {
              st.info = '本地无归档，已从 Jira 获取并自动归档'
            }
          }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'download') {
          const el = fields.__el || {}
          const url = String(el.url != null ? el.url : fields.url || '').trim()
          const key = lastIssue && lastIssue.key ? lastIssue.key : ''
          const filename = String(el.filename != null ? el.filename : fields.filename || 'attachment')
          if (!/^https?:\/\//i.test(url)) { st.error = '非法的附件地址'; return { ok: true, html: render(st, false), state: st } }
          st.error = null
          st.info = null
          const res = await downloadAttachment(url, key, filename, ws)
          if (!res.ok) { st.error = res.error || '附件下载失败' }
          else {
            if (lastIssue && lastIssue.__archived) await updateArchiveEntry(key, filename, res.len, ws)
            const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename)
            if (res.previewable && isImage) lastPreview = { name: filename, data: res.data }
            else {
              lastPreview = null
              st.info = '已归档：' + res.path + (res.previewable ? '（该类型暂不支持网页预览）' : '（文件较大，暂不支持网页预览）')
            }
          }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'preview-local') {
          // 归档附件的本地预览（零 API）
          const el = fields.__el || {}
          const rel = String(el.path != null ? el.path : fields.path || '')
          const filename = rel.split('/').pop() || 'attachment'
          st.error = null
          st.info = null
          const res = await previewLocalFile(rel, ws)
          if (!res.ok) { st.error = res.error || '预览读取失败' }
          else if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(filename)) lastPreview = { name: filename, data: res.data }
          else { lastPreview = null; st.info = '该类型暂不支持网页预览：' + filename + '（文件已在本地归档，可直接打开）' }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'download-all') {
          const list = (lastIssue && Array.isArray(lastIssue.attachments)) ? lastIssue.attachments : []
          const key = lastIssue && lastIssue.key ? lastIssue.key : ''
          if (!list.length) { st.info = '当前工单没有附件'; return { ok: true, html: render(st, false), state: st } }
          st.error = null
          lastPreview = null
          const okNames = []
          const failNames = []
          for (const a of list) {
            const url = String(a.content || '')
            const fname = String(a.filename || 'attachment')
            if (!/^https?:\/\//i.test(url)) { failNames.push(fname + '（非法地址）'); continue }
            const res = await downloadAttachment(url, key, fname, ws)
            if (res.ok) okNames.push(fname)
            else failNames.push(fname + '（' + (res.error || '失败') + '）')
          }
          st.info = '批量归档完成：成功 ' + okNames.length + ' / 共 ' + list.length + ' → ' + REL_ARCHIVE_DIR + '/' + key + '/' +
            (failNames.length ? '；失败：' + failNames.join('、') : '')
          if (!okNames.length && failNames.length) { st.error = '批量归档全部失败：' + failNames.join('、'); st.info = null }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'close-preview') {
          lastPreview = null
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'close-issue') {
          // 关闭详情卡（记录保留在列表中，再点行可重新查看本地归档）
          lastIssue = null
          lastPreview = null
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'remove') {
          const elKey = fields.__el && fields.__el.key != null ? fields.__el.key : fields.key
          const r2 = await runRecords('remove', null, ws, String(elKey || ''))
          if (r2.ok) {
            st.records = r2.records
            if (lastIssue && lastIssue.key === elKey) lastIssue = null
          }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'clear') {
          const r2 = await runRecords('clear', null, ws)
          if (r2.ok) { st.records = []; lastIssue = null; lastPreview = null }
          return { ok: true, html: render(st, false), state: st }
        }
        if (action === 'refresh-all') {
          st.error = null
          st.info = null
          const list = (st.records || []).slice()
          for (const r of list) {
            const res = await fetchAndArchive(r.key, st, ws, { setView: false })
            if (!res.ok) st.error = (res.error || '') + '（' + r.key + '）'
          }
          if (!st.error) st.info = '全部刷新完成（已重新归档 ' + list.length + ' 个工单）'
          return { ok: true, html: render(st, false), state: st }
        }
        // 默认（''）：加载记录列表
        const r0 = await runRecords('list', null, ws)
        if (r0.ok) st.records = r0.records
        return { ok: true, html: render(st, false), state: st }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e), html: '' }
      }
    }
    const handler = ({ action, fields, state, root, session }) => {
      const ws = resolveWs(root, session)
      if (!ws.root) return Promise.resolve({ ok: false, error: '无法确定工作区根', html: '' })
      // ws 在排队前解析一次并传入执行体，保证锁键与实际读写的工作区一致
      return serializedAction(ws.root, () => handleAction(ws, { action, fields, state }))
    }

    const runRecords = async (action, rec, ws, key) => {
      try {
        if (action === 'list') return { ok: true, records: await readJsonFile(REL_WATCH_FILE, ws.root) }
        if (action === 'upsert') {
          if (!rec || typeof rec.key !== 'string' || !rec.key) return { ok: false, error: 'record.key 必填' }
          const records = await readJsonFile(REL_WATCH_FILE, ws.root)
          const idx = records.findIndex((r) => r && r.key === rec.key)
          if (idx >= 0) records[idx] = rec
          else records.push(rec)
          const persisted = await writeJsonFile(REL_WATCH_FILE, records, ws)
          return { ok: true, records, persisted }
        }
        if (action === 'remove') {
          const records = await readJsonFile(REL_WATCH_FILE, ws.root)
          const next = records.filter((r) => !r || r.key !== key)
          const persisted = await writeJsonFile(REL_WATCH_FILE, next, ws)
          return { ok: true, records: next, persisted }
        }
        if (action === 'clear') {
          const persisted = await writeJsonFile(REL_WATCH_FILE, [], ws)
          return { ok: true, records: [], persisted }
        }
        return { ok: false, error: '未知 action: ' + String(action) }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    tryRegisterTool(ctx, { id: 'jira', label: 'Jira', order: 0, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 6.5h6M5 9.5h4"/></svg>' }, handler)
  },
}
}

export async function apply(ctx) {
  applyingContext = ctx
  try {
    const feature = create_jira()
    if (!feature || typeof feature.apply !== 'function') throw new Error('静态 feature 未返回有效插件对象')
    const disposer = await feature.apply(ctx)
    if (typeof disposer === 'function') ctx.effect(() => disposer)
    console.log(TOOLBOX_RUNTIME.logTag() + ' 原生静态组件已加载: jira')
  } finally {
    applyingContext = null
  }
}
