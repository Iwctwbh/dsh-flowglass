// trace 工具仿真：mock sessionQuery（readSession 计数）+ sessionPersistence（readFrom 计数）。
// 断言：M8 多块结果配对（首块空文本占位、第二块才是 tool-result —— 旧实现只看首块会永久
// 「待结果」：状态/耗时/输出体量/失败计数/详情与复制输出全链路）、M9 详情输入侧 12000 截断
// 标注与 HTML 有界（复制按钮仍保留全文）、L11 fmtTime NaN 守卫（缺 time 的注入事件不渲染
// NaN:NaN:NaN）、L4 按会话各建读取器（s-a→s-b→s-a 切回不再全量重读，走 readFrom 增量）。
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ---- 会话 s-a 事件样本：用户 → 助手 → grep(多块结果) → pwsh(失败) → write(大参数) → 注入(缺 time) ----
const BIG_ARGS = JSON.stringify({ file_path: 'big.txt', content: 'X'.repeat(20000) })
const SA = [
  { seq: 1, time: 1000, type: 'user/message', data: { content: [{ type: 'text', text: '查一下流镜' }], source: { kind: 'user' } } },
  { seq: 2, time: 1100, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '好的' }] }, usage: { inputTokens: 100, outputTokens: 7, cacheReadTokens: 50 } } },
  { seq: 3, time: 1200, type: 'tool/call', data: { turn: 1, step: 1, name: 'grep', callId: 'c1', arguments: '{"pattern":"foo"}' } },
  // M8 关键样本：结果首块是空文本占位，第二块才是 tool-result
  { seq: 4, time: 1500, type: 'tool/result', data: { message: { content: [
    { type: 'text', text: '' },
    { type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'grep hits body' }] },
  ] } } },
  { seq: 5, time: 1600, type: 'tool/call', data: { turn: 1, step: 2, name: 'pwsh', callId: 'c2', arguments: '{"command":"dir"}' } },
  { seq: 6, time: 1700, type: 'tool/result', data: { error: { name: 'E', code: 'X' }, message: { content: [{ type: 'tool-result', toolCallId: 'c2', content: [{ type: 'text', text: 'boom' }] }] } } },
  // M9 关键样本：arguments 美化后 >12000 字符
  { seq: 7, time: 1800, type: 'tool/call', data: { turn: 2, step: 1, name: 'write', callId: 'c3', arguments: BIG_ARGS } },
  { seq: 8, time: 1850, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c3', content: [{ type: 'text', text: 'written' }] }] } } },
  // 跨块失败样本：首块是无 toolCallId 的前置说明，isError 落在第二块 tool-result 上——
  // 旧实现只看 content[0].isError 会把真实失败误标成功
  { seq: 9, time: 1900, type: 'tool/call', data: { turn: 2, step: 2, name: 'edit', callId: 'c4', arguments: '{"f":"a"}' } },
  { seq: 10, time: 1950, type: 'tool/result', data: { message: { content: [
    { type: 'text', text: '前置说明：工具返回如下' },
    { type: 'tool-result', toolCallId: 'c4', isError: true, content: [{ type: 'text', text: 'edit failed body' }] },
  ] } } },
  // L11 关键样本：注入事件缺 time 字段
  { seq: 11, type: 'user/message', data: { content: [{ type: 'text', text: '系统注入提示' }], source: { kind: 'plugin' } } },
]
// ---- 会话 s-b 事件样本（切会话缓存验证用）----
const SB = [
  { seq: 1, time: 2000, type: 'user/message', data: { content: [{ type: 'text', text: '另一个会话' }], source: { kind: 'user' } } },
]

const readSessionCalls = {}
const sessionQuery = {
  async readSession(sid) {
    readSessionCalls[sid] = (readSessionCalls[sid] || 0) + 1
    if (sid === 's-a') return { session: { id: 's-a' }, events: SA }
    if (sid === 's-b') return { session: { id: 's-b' }, events: SB }
    return { session: { id: sid }, events: [] }
  },
  async listSessions() { return [{ header: { id: 's-a' } }, { header: { id: 's-b' } }] },
}
const readFromLog = []
const sessionPersistence = {
  async readFrom(sid, from) { readFromLog.push(sid + '@' + from); return { events: [], meta: { id: sid } } },
}

const handlers = {}
const ctx = {
  get(name) {
    if (name === 'sessionQuery') return sessionQuery
    if (name === 'sessionPersistence') return sessionPersistence
    if (name === 'toolboxRegistry') return { register(d, h) { handlers[d.id] = h; return () => {} } }
    if (name === 'sandboxPolicy') return { workspaceRoot: ROOT }
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
  const src = read('shared/runtime.js') + '\n' + read('shared/host.js') + '\n' + read('plugins/trace/tool.js')
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + src + '\n})()')(ctx, undefined, console)
  await plugin.apply(ctx)
  const h = handlers.trace
  if (!h) { console.log('FAIL | trace 未注册'); process.exit(1) }

  // ---- 打开 + 「全部」过滤（默认过滤不含 文件/消息 类，先全开再断言）----
  let r = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-a' })
  check('打开 → 渲染时间线', r.ok === true && r.html.indexOf('调用时间线') >= 0)
  r = await h({ action: 'filter', fields: { __el: { v: 'all' } }, state: r.state, root: ROOT, session: 's-a' })

  // ---- M8：多块结果配对（首块空文本占位，第二块才是 tool-result）----
  check('M8 配对：grep 状态 ✓ 且耗时 300ms', r.html.indexOf('✓ 300ms') >= 0)
  check('M8 配对：无永久「待结果」', r.html.indexOf('待结果') < 0)
  check('M8 输出体量：outLen=14（输出 14 B）', r.html.indexOf('输出 14 B') >= 0)
  check('M8 失败计入：pwsh 失败计入统计（与跨块样本合计 2）', r.html.indexOf('2 失败') >= 0)

  // ---- 跨块失败：isError 在第二块 tool-result 上，必须计入失败（旧实现只看 content[0]）----
  check('跨块失败：edit 标记 ✗ 50ms', r.html.indexOf('✗ 50ms') >= 0)
  check('跨块失败：统计行 2 失败', r.html.indexOf('2 失败') >= 0)

  // ---- L11：缺 time 的注入事件不渲染 NaN ----
  check('L11 NaN 守卫：注入消息可见', r.html.indexOf('系统注入提示') >= 0)
  check('L11 NaN 守卫：全页无 NaN 渲染', r.html.indexOf('NaN') < 0)

  // ---- M8 详情/复制路径：输出文本同样遍历多块 ----
  r = await h({ action: 'detail', fields: { __el: { seq: '3' } }, state: r.state, root: ROOT, session: 's-a' })
  check('M8 详情输出：多块结果取到正文', r.html.indexOf('grep hits body') >= 0)
  let rc = await h({ action: 'copy-out', fields: {}, state: r.state, root: ROOT, session: 's-a' })
  check('M8 复制输出：完整正文', rc.copy === 'grep hits body')

  // ---- M9：详情输入侧 12000 截断 + HTML 有界；复制按钮保留全文 ----
  r = await h({ action: 'detail', fields: { __el: { seq: '7' } }, state: r.state, root: ROOT, session: 's-a' })
  const pretty = JSON.stringify(JSON.parse(BIG_ARGS), null, 2)
  check('M9 输入截断：标注总长（截断，共 N 字符）', r.html.indexOf('…（截断，共 ' + pretty.length + ' 字符）') >= 0)
  check('M9 输入截断：HTML 有界（<40KB）', r.html.length < 40000, 'len=' + r.html.length)
  rc = await h({ action: 'copy-in', fields: {}, state: r.state, root: ROOT, session: 's-a' })
  check('M9 复制输入：保留全文', typeof rc.copy === 'string' && rc.copy === pretty && rc.copy.length > 12000)

  // ---- L4：按会话各建读取器，s-a→s-b→s-a 切回不再全量重读 ----
  r = await h({ action: 'pick', fields: { sid: 's-b' }, state: r.state, root: ROOT, session: 's-a' })
  check('切到 s-b → 渲染另一会话', r.html.indexOf('另一个会话') >= 0)
  r = await h({ action: 'pick', fields: { sid: 's-a' }, state: r.state, root: ROOT, session: 's-a' })
  check('切回 s-a → 内容恢复', r.html.indexOf('查一下流镜') >= 0 && r.html.indexOf('输出 14 B') >= 0)
  check('L4 会话缓存：s-a 只全量读 1 次', (readSessionCalls['s-a'] || 0) === 1, JSON.stringify(readSessionCalls))
  check('L4 会话缓存：s-b 只全量读 1 次', (readSessionCalls['s-b'] || 0) === 1)
  check('L4 会话缓存：切回走 readFrom 增量', readFromLog.indexOf('s-a@' + SA.length) >= 0, readFromLog.join(','))

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('仿真异常:', e); process.exit(2) })
