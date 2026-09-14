// flow 工具仿真（DSH 0.1.5 统一流协议）：mock sessionQuery（主会话 + 子代理会话）+ sessions（live 判定）。
// 断言分三组：
//  ① 形态回归：主干流程节点顺序与箭头、平行卡片分组（同 step 多调用）、子代理 git 树分支
//     （├─/│/╰─ + 子会话步骤展开 + live 徽章）、自动刷新声明、live 开关、事件配对状态色、
//     工具/消息详情、框选上下文、向上分页。
//  ② 实时叠加层（live 参数 = Client 事件窗折叠的 attempt 快照 + 最近结算 firstSeq）：
//     live-chunk 增长、message.stream 结算替换（不重复）、settle 先于 end frame、
//     attempt.stream 失败/取消/重试、max-tokens、reasoning 流、纯 tool-call 流、
//     baseline 重建、重复/缺 attemptId 帧不产生重复卡、结算后框选/详情保持稳定。
//  ③ 旧协议防线：assistant/chunk 不再被解析（0.1.2 历史兼容仅 assistant/message）。
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ---- 主会话事件样本（0.1.5 durable）：用户 → 助手 → [read+grep 平行] → 助手 → [subagent x2 并行] → 助手 ----
// 助手 message 带 turn/step 与内嵌 stream 记录（text-chunks 紧凑形态 + dt 前缀和时间戳）
const MAIN_EVENTS = [
  { seq: 1, time: 1000, type: 'user/message', data: { content: [{ type: 'text', text: '帮我看下这个目录' }], source: { kind: 'user' } } },
  { seq: 2, time: 1100, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '好的，我先并行读文件' }] }, stream: [{ type: 'text-chunks', time0: 1050, index: 0, dt: [20, 20], texts: ['好的，', '我先并行', '读文件'] }], usage: { outputTokens: 12 } } },
  { seq: 3, time: 1200, type: 'tool/call', data: { turn: 1, step: 2, name: 'read', callId: 'c1', arguments: '{"file_path":"a.js"}' } },
  { seq: 4, time: 1210, type: 'tool/call', data: { turn: 1, step: 2, name: 'grep', callId: 'c2', arguments: '{"pattern":"foo"}' } },
  { seq: 5, time: 1300, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'file a content' }] }] } } },
  { seq: 6, time: 1310, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c2', content: [{ type: 'text', text: 'grep hits' }] }] } } },
  { seq: 7, time: 1400, type: 'assistant/message', data: { turn: 1, step: 3, message: { content: [{ type: 'text', text: '再派个子代理调研' }] }, stream: [{ type: 'text-chunks', time0: 1360, index: 0, dt: [10], texts: ['再派个', '子代理调研'] }], usage: { outputTokens: 9 } } },
  { seq: 8, time: 1500, type: 'tool/call', data: { turn: 1, step: 4, name: 'subagent', callId: 'c3', arguments: '{"description":"调研","prompt":"看看"}' } },
  { seq: 9, time: 1501, type: 'tool/call', data: { turn: 1, step: 4, name: 'subagent', callId: 'c4', arguments: '{"description":"审核","prompt":"检查"}' } },
  { seq: 10, time: 1600, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c3', content: [{ type: 'text', text: 'started subagent 228a8697-2b7a-422a-b3c0-1cf61c965d5c' }] }] } } },
  { seq: 11, time: 1610, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c4', content: [{ type: 'text', text: 'started subagent 338a8697-2b7a-422a-b3c0-1cf61c965d6d' }] }] } } },
  { seq: 12, time: 1700, type: 'assistant/message', data: { turn: 1, step: 5, message: { content: [{ type: 'text', text: '子代理已启动' }] }, stream: [{ type: 'text-chunks', time0: 1660, index: 0, dt: [], texts: ['子代理已启动'] }], usage: { outputTokens: 5 } } },
  { seq: 13, time: 1800, type: 'tool/call', data: { turn: 2, step: 1, name: 'send_message', callId: 'c5', arguments: JSON.stringify({ agent_id: '228a8697-2b7a-422a-b3c0-1cf61c965d5c', message: '请补充结论' }) } },
  { seq: 14, time: 1810, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c5', content: [{ type: 'text', text: 'message delivered to agent 228a8697-2b7a-422a-b3c0-1cf61c965d5c' }] }] } } },
]
// ---- 子代理会话事件样本 ----
const CHILD_EVENTS = [
  { seq: 1, time: 1510, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '我开始调研' }] }, stream: [] } },
  { seq: 2, time: 1520, type: 'tool/call', data: { turn: 1, step: 2, name: 'grep', callId: 'x1', arguments: '{"pattern":"bar"}' } },
  { seq: 3, time: 1560, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'x1', content: [{ type: 'text', text: 'child hits' }] }] } } },
]
// ---- 进行中会话（durable 前缀）：turn/step 已开、尚无结算；实时内容全靠 live 叠加层 ----
const LIVE_PREFIX_EVENTS = [
  { seq: 1, time: 3000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 3010, type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'reasoner-x' } } } },
  { seq: 3, time: 3020, type: 'step/start', data: { turn: 1, step: 1 } },
]
// live 叠加层 helper：attempt 快照（Client 折叠后形态）
const liveOverlay = (sid, revision, attempts, settled) => ({ sessionId: sid, revision, attempts, settled: settled || [] })
const attempt = (id, turn, step, firstSeq, firstAt, lastAt, extra) => Object.assign({
  attemptId: id, turn, step, firstSeq, firstAt, lastAt, text: '', reasoning: '', toolCall: false, finish: null,
}, extra || {})

// ---- 结算过程会话：先只有 turn/step 前缀，durable message 由测试中途追加（模拟事件窗结算时序）----
const SETTLE_PREFIX = [
  { seq: 1, time: 4000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 4010, type: 'step/start', data: { turn: 1, step: 1 } },
]
const SETTLE_MESSAGE = { seq: 5, time: 4200, type: 'assistant/message', data: {
  turn: 1, step: 1,
  message: { content: [{ type: 'text', text: '最终答案：42' }] },
  stream: [
    { type: 'reasoning-chunks', time0: 4020, index: 0, dt: [5, 5], texts: ['思考 A ', '思考 B ', '思考 C'] },
    { type: 'text-chunks', time0: 4100, index: 1, dt: [10, 10], texts: ['最终', '答案：', '42'] },
    { type: 'chunk', time: 4190, chunk: { type: 'finish', reason: { kind: 'stop' } } },
  ],
  usage: { outputTokens: 42 },
} }
const SETTLE_TAIL = [
  { seq: 6, time: 4210, type: 'step/end', data: { turn: 1, step: 1 } },
  { seq: 7, time: 4220, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
]
// ---- 失败尝试会话：assistant/attempt（stream error 终态）无 message ----
const FAIL_ATTEMPT_EVENTS = [
  { seq: 1, time: 5000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 5010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 4, time: 5200, type: 'assistant/attempt', data: {
    turn: 1, step: 1,
    stream: [
      { type: 'text-chunks', time0: 5020, index: 0, dt: [5], texts: ['partial ', 'content'] },
      { type: 'chunk', time: 5190, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message: 'upstream boom' } } } },
    ],
  } },
  { seq: 5, time: 5210, type: 'step/end', data: { turn: 1, step: 1 } },
  { seq: 6, time: 5220, type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { code: 'PI_AI_ERROR', message: 'upstream boom' } } } },
]
// ---- 取消尝试会话：finish aborted ----
const ABORT_ATTEMPT_EVENTS = [
  { seq: 1, time: 6000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 6010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 4, time: 6200, type: 'assistant/attempt', data: {
    turn: 1, step: 1,
    stream: [
      { type: 'reasoning-chunks', time0: 6020, index: 0, dt: [], texts: ['用户按了停止'] },
      { type: 'chunk', time: 6190, chunk: { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'user cancel' } } } },
    ],
  } },
  { seq: 5, time: 6210, type: 'step/end', data: { turn: 1, step: 1 } },
]
// ---- 重试成功会话：第一试失败（durable attempt）→ llm/retry 调度+起跳 → 第二试成功（durable message）----
const RETRY_OK_EVENTS = [
  { seq: 1, time: 7000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 7010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 3, time: 7020, type: 'assistant/attempt', data: {
    turn: 1, step: 1,
    stream: [{ type: 'chunk', time: 7019, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE', message: 'no content' } } } }],
  } },
  { seq: 4, time: 7021, type: 'llm/retry', data: { retryId: 'r1', turn: 1, step: 1, provider: 'openrouter', mode: 'normal', retry: 1, maxRetries: 5, delayMs: 500, failure: { message: 'no content', code: 'EMPTY_RESPONSE' } } },
  { seq: 5, time: 7521, type: 'llm/retry-started', data: { retryId: 'r1', turn: 1, step: 1, retry: 1 } },
  { seq: 6, time: 7600, type: 'assistant/message', data: {
    turn: 1, step: 1,
    message: { content: [{ type: 'text', text: '重试后成功输出' }] },
    stream: [{ type: 'text-chunks', time0: 7550, index: 0, dt: [10], texts: ['重试后', '成功输出'] }],
    usage: { outputTokens: 7 },
  } },
  { seq: 7, time: 7610, type: 'step/end', data: { turn: 1, step: 1 } },
  { seq: 8, time: 7620, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
]
// ---- 重试仍失败：第二试也 error 终局（durable attempt，无 message）----
const RETRY_FAIL_EVENTS = [
  { seq: 1, time: 8000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 8010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 3, time: 8020, type: 'assistant/attempt', data: {
    turn: 1, step: 1,
    stream: [{ type: 'chunk', time: 8019, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE', message: 'no content' } } } }],
  } },
  { seq: 4, time: 8021, type: 'llm/retry', data: { retryId: 'r2', turn: 1, step: 1, provider: 'openrouter', mode: 'normal', retry: 1, maxRetries: 5, delayMs: 500, failure: { message: 'no content', code: 'EMPTY_RESPONSE' } } },
  { seq: 5, time: 8521, type: 'llm/retry-started', data: { retryId: 'r2', turn: 1, step: 1, retry: 1 } },
  { seq: 6, time: 8600, type: 'assistant/attempt', data: {
    turn: 1, step: 1,
    stream: [
      { type: 'text-chunks', time0: 8550, index: 0, dt: [], texts: ['retrying'] },
      { type: 'chunk', time: 8590, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message: 'ERROR' } } } },
    ],
  } },
  { seq: 7, time: 8610, type: 'step/end', data: { turn: 1, step: 1 } },
  { seq: 8, time: 8620, type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { code: 'PI_AI_ERROR', message: 'ERROR' } } } },
]
// ---- 重试等待中：第一试失败已结算、重试已调度未起跳、步骤仍开 → live 叠加层空、卡片显示等待徽标 ----
const RETRY_WAIT_EVENTS = [
  { seq: 1, time: 9000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 9010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 3, time: 9020, type: 'assistant/attempt', data: {
    turn: 1, step: 1,
    stream: [{ type: 'chunk', time: 9019, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE', message: 'no content' } } } }],
  } },
  { seq: 4, time: 9021, type: 'llm/retry', data: { retryId: 'r3', turn: 1, step: 1, provider: 'openrouter', mode: 'normal', retry: 1, maxRetries: 5, delayMs: 60000, failure: { message: 'no content', code: 'EMPTY_RESPONSE' } } },
]
// ---- max-tokens 结算：message 带 finish max-tokens ----
const MAX_TOKENS_EVENTS = [
  { seq: 1, time: 10000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 10010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 4, time: 10200, type: 'assistant/message', data: {
    turn: 1, step: 1,
    message: { content: [{ type: 'text', text: '写到一半被截断' }] },
    stream: [
      { type: 'text-chunks', time0: 10020, index: 0, dt: [], texts: ['写到一半被截断'] },
      { type: 'chunk', time: 10190, chunk: { type: 'finish', reason: { kind: 'max-tokens' } } },
    ],
    usage: { outputTokens: 8192 },
  } },
  { seq: 5, time: 10210, type: 'step/end', data: { turn: 1, step: 1 } },
]
// ---- 纯 tool-call 流：无可见文本，message 内容只有 tool-call 块 ----
const TOOLCALL_ONLY_EVENTS = [
  { seq: 1, time: 11000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 11010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 4, time: 11200, type: 'assistant/message', data: {
    turn: 1, step: 1,
    message: { content: [{ type: 'tool-call', id: 'call_1', name: 'read', arguments: '{"file_path":"b.js"}' }] },
    stream: [{ type: 'tool-call-chunks', time0: 11020, index: 0, id: 'call_1', name: 'read', dt: [5], args: ['{"file_', 'path":"b.js"}'] }],
  } },
]
// ---- 旧协议防线（0.1.2 历史日志）：assistant/chunk 帧不被解析、不产生任何助手卡 ----
const LEGACY_CHUNK_EVENTS = [
  { seq: 1, time: 12000, type: 'turn/start', data: { turn: 1 } },
  { seq: 2, time: 12010, type: 'step/start', data: { turn: 1, step: 1 } },
  { seq: 3, time: 12020, type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'legacy' } } },
  { seq: 4, time: 12100, type: 'step/end', data: { turn: 1, step: 1 } },
]

const LONG_EVENTS = Array.from({ length: 130 }, (_, i) => ({
  seq: i + 1,
  time: 4000 + i,
  type: 'user/message',
  data: { content: [{ type: 'text', text: 'long-' + String(i + 1).padStart(3, '0') }], source: { kind: 'user' } },
}))

const SESSIONS = {
  's-main': MAIN_EVENTS,
  '228a8697-2b7a-422a-b3c0-1cf61c965d5c': CHILD_EVENTS,
  '338a8697-2b7a-422a-b3c0-1cf61c965d6d': CHILD_EVENTS,
  's-live': LIVE_PREFIX_EVENTS,
  's-settle': SETTLE_PREFIX.slice(),
  's-settle-cold': SETTLE_PREFIX.concat([SETTLE_MESSAGE], SETTLE_TAIL),
  's-fail-attempt': FAIL_ATTEMPT_EVENTS,
  's-abort-attempt': ABORT_ATTEMPT_EVENTS,
  's-retry-ok': RETRY_OK_EVENTS,
  's-retry-fail': RETRY_FAIL_EVENTS,
  's-retry-wait': RETRY_WAIT_EVENTS,
  's-max-tokens': MAX_TOKENS_EVENTS,
  's-toolcall-only': TOOLCALL_ONLY_EVENTS,
  's-legacy-chunk': LEGACY_CHUNK_EVENTS,
  's-long': LONG_EVENTS,
}
const sessionQuery = {
  async readSession(sid) { return { session: { id: sid }, events: SESSIONS[sid] || [] } },
  async listSessions() { return [{ header: { id: 's-main' }, live: true }] },
}
const sessions = { get: (id) => (/^(228|338)a8697/.test(id) ? { events: CHILD_EVENTS, header: { id } } : undefined), list: () => [] }

const handlers = {}
const ctx = {
  get(name) {
    if (name === 'sessionQuery') return sessionQuery
    if (name === 'sessions') return sessions
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
const countCards = (html, marker) => (html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length

;(async () => {
  const src = read('shared/runtime.js') + '\n' + read('shared/host.js') + '\n' + read('plugins/flow/tool.js')
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + src + '\n})()')(ctx, undefined, console)
  await plugin.apply(ctx)
  const h = handlers.flow
  if (!h) { console.log('FAIL | flow 未注册'); process.exit(1) }

  // ================= ① 形态回归（durable 0.1.5 事件） =================
  let r = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-main' })
  check('打开 → 渲染主干', r.html.indexOf('实时流镜') >= 0)
  check('说明收敛到 info 浮层', r.html.indexOf('class="fl-info"') >= 0 && r.html.indexOf('• 中列是用户/助手主线') >= 0)
  check('自动刷新声明 data-autorefresh=2000', r.html.indexOf('data-autorefresh="2000"') >= 0)
  check('用户/助手消息节点', r.html.indexOf('帮我看下这个目录') >= 0 && r.html.indexOf('好的，我先并行读文件') >= 0)
  check('stream 展开的最终文本成为卡片内容（durable message）', r.html.indexOf('再派个子代理调研') >= 0)
  check('已完成助手主线卡提供 Harness 分支按钮（finalSeq 锚点）', r.html.indexOf('data-flow-branch') >= 0 && r.html.indexOf('data-flow-branch data-seq="2"') >= 0)
  check('助手卡暴露折叠器状态（data-flow-state=settled）', r.html.indexOf('data-flow-state="settled"') >= 0)
  check('流镜卡片带框选序号标记', r.html.indexOf('data-flow-select-seq="1"') >= 0 && r.html.indexOf('data-flow-select-seq="3"') >= 0)
  check('箭头连接符 ▼', r.html.indexOf('fl-arrow') >= 0 && r.html.indexOf('▼') >= 0)
  check('调用泳道布局（fl-lane 三列 + fl-wp 连线对）', r.html.indexOf('fl-lane') >= 0 && r.html.indexOf('fl-wp') >= 0)
  check('输入线 ▶ 右出 / 输出线 ◀ 回左', r.html.indexOf('▶') >= 0 && r.html.indexOf('◀') >= 0)
  check('平行卡片组（read+grep 各一张工具卡）', r.html.indexOf('fl-callside') >= 0 && r.html.indexOf('read') >= 0 && r.html.indexOf('grep') >= 0)
  check('输入线标签=提取关键参数（输入 file_path: a.js）', r.html.indexOf('输入 file_path: a.js') >= 0)
  check('输出线标签=返回结果摘要（file a content）', r.html.indexOf('file a content') >= 0)
  check('工具卡存在（fl-iocard）', r.html.indexOf('fl-iocard') >= 0)
  check('调用状态 ✓ 与耗时', r.html.indexOf('✓') >= 0)
  check('子代理入口卡（fl-sub-open）与支线步骤', r.html.indexOf('fl-sub-open') >= 0 && r.html.indexOf('fl-sub-steps') >= 0)
  check('子代理出口卡（fl-sub-close）', r.html.indexOf('fl-sub-close') >= 0)
  check('alpha.4 send_message 归入子代理并可钻取', r.html.indexOf('data-action="fenter" data-seq="13"') >= 0)
  check('子代理 live 徽章（运行中）', r.html.indexOf('运行中') >= 0)
  check('同 step 并行子代理合并成组', r.html.indexOf('并行子代理 ×2') >= 0 && r.html.indexOf('fl-subgrp') >= 0)
  check('子代理跟随开关默认开启', r.html.indexOf('● 子代理跟随') >= 0 && r.state.follow === true)

  // live 开关
  r = await h({ action: 'toggle-live', fields: {}, state: r.state, root: ROOT, session: 's-main' })
  check('暂停 → 无 autorefresh 声明', r.html.indexOf('data-autorefresh="2000"') < 0)
  r = await h({ action: 'toggle-live', fields: {}, state: r.state, root: ROOT, session: 's-main' })
  check('恢复 → autorefresh 回归', r.html.indexOf('data-autorefresh="2000"') >= 0)

  // 跟随开关 + 钻取
  r = await h({ action: 'fenter', fields: { __el: { seq: '8' } }, state: r.state, root: ROOT, session: 's-main' })
  check('进入子流镜仍实时', r.html.indexOf('子代理流镜') >= 0 && r.html.indexOf('data-autorefresh="2000"') >= 0)
  check('跟随返回 Harness 子会话导航', r.navigateSession && r.navigateSession.sessionId === '228a8697-2b7a-422a-b3c0-1cf61c965d5c' && r.navigateSession.parentSessionId === 's-main')
  r = await h({ action: '', fields: {}, state: r.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('Harness 切到子 Session 后仍保留返回链', r.html.indexOf('data-action="fback"') >= 0 && r.state.home === 's-main' && r.state.crumbs.length === 1)
  r = await h({ action: 'fback', fields: {}, state: r.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('返回上级也返回 Harness 导航', r.navigateSession && r.navigateSession.sessionId === 's-main')

  // 详情
  r = await h({ action: 'fdetail', fields: { __el: { seq: '3' } }, state: r.state, root: ROOT, session: 's-main' })
  check('点工具卡 → 右侧浮层展开详情（fl-rail）', r.html.indexOf('fl-rail') >= 0 && r.html.indexOf('file a content') >= 0)
  r = await h({ action: 'fdetail', fields: { __el: { seq: '3' } }, state: r.state, root: ROOT, session: 's-main' })
  check('再点 → 收起详情', r.html.indexOf('fl-rail') < 0)
  r = await h({ action: 'fdetail', fields: { __el: { seq: '2' } }, state: r.state, root: ROOT, session: 's-main' })
  check('助手详情声明 Markdown 挂载点与原文 fallback', r.html.indexOf('data-flow-markdown-detail="1"') >= 0 && r.html.indexOf('好的，我先并行读文件') >= 0)
  check('助手详情 meta 带 attempt/结束原因位（settled 无异常不硬造）', r.html.indexOf('data-flow-markdown-preview="1"') >= 0)
  r = await h({ action: 'fdetail', fields: { __el: { seq: '2' } }, state: r.state, root: ROOT, session: 's-main' })

  // 框选上下文
  r = await h({ action: 'fcontext', fields: { __el: { seqs: '1,3' } }, state: r.state, root: ROOT, session: 's-main' })
  check('框选内容返回完整消息/工具上下文', r.flowContext && r.flowContext.sourceSessionId === 's-main'
    && r.flowContext.seqs.join(',') === '1,3' && r.flowContext.text.indexOf('帮我看下这个目录') >= 0 && r.flowContext.text.indexOf('file_path') >= 0)

  // ================= ② 实时叠加层（0.1.5 live） =================
  // 实时增长：同一 attempt 的快照两次 revision → 一张卡，内容增长
  let lr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-live',
    live: liveOverlay('s-live', 1, [attempt('att-1', 1, 1, 3.25, 3030, 3040, { text: 'Hel' })]) })
  check('live attempt → 流式助手卡（streaming 态 + attempt 身份）', lr.html.indexOf('data-flow-state="streaming"') >= 0 && lr.html.indexOf('data-flow-attempt="att-1"') >= 0)
  check('live 增长内容展示', lr.html.indexOf('Hel') >= 0)
  check('实时卡运行计时器', lr.html.indexOf('data-flow-timer') >= 0)
  lr = await h({ action: '', fields: {}, state: lr.state, root: ROOT, session: 's-live',
    live: liveOverlay('s-live', 2, [attempt('att-1', 1, 1, 3.25, 3030, 3060, { text: 'Hello 流镜世界' })]) })
  check('同一 attempt 增长 → 仍一张卡且内容更新', countCards(lr.html, 'data-flow-role="ai"') === 1 && lr.html.indexOf('Hello 流镜世界') >= 0)
  check('叠加层激活会话流光（fl-live）', lr.html.indexOf('fl-live') >= 0)
  check('request/header 的模型路由贴卡', lr.html.indexOf('deepseek/reasoner-x') >= 0)

  // 结算时序（s-settle 动态推进）：live 在途 → durable message 落盘 + settled firstSeq → 结算替换
  let sr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-settle',
    live: liveOverlay('s-settle', 9, [attempt('att-9', 1, 1, 4.5, 4020, 4180, { text: '最终答案：4', reasoning: '思考 A 思考 B' })]) })
  check('结算前（live 在途）→ 一张流式卡', countCards(sr.html, 'data-flow-role="ai"') === 1 && sr.html.indexOf('data-flow-state="streaming"') >= 0)
  // 打开详情（浮点 seq 4.5）
  sr = await h({ action: 'fdetail', fields: { __el: { seq: String(4.5) } }, state: sr.state, root: ROOT, session: 's-settle',
    live: liveOverlay('s-settle', 10, [attempt('att-9', 1, 1, 4.5, 4020, 4180, { text: '最终答案：4', reasoning: '思考 A 思考 B' })]) })
  check('流式卡详情可打开（浮点 seq）', sr.html.indexOf('fl-rail') >= 0 && sr.html.indexOf('助手消息') >= 0)
  // 结算：live attempt 消失、settled 带 firstSeq=4.5、durable message(seq 5) 落盘 → 一张卡、详情不关
  SESSIONS['s-settle'].push(SETTLE_MESSAGE, ...SETTLE_TAIL)
  sr = await h({ action: '', fields: {}, state: sr.state, root: ROOT, session: 's-settle',
    live: liveOverlay('s-settle', 11, [], [{ attemptId: 'att-9', turn: 1, step: 1, firstSeq: 4.5 }]) })
  check('结算替换 → 恰好一张助手卡（实时草稿不与最终消息重复）', countCards(sr.html, 'data-flow-role="ai"') === 1)
  check('结算卡继承 attempt firstSeq（详情/框选连续，不关闭）', sr.html.indexOf('fl-rail') >= 0 && sr.html.indexOf('data-flow-main-card="4.5"') >= 0)
  check('结算卡 settled 态 + finalSeq 分支锚点', sr.html.indexOf('data-flow-state="settled"') >= 0 && sr.html.indexOf('data-flow-branch data-seq="5"') >= 0)
  check('结算卡文本来自 durable message', sr.html.indexOf('最终答案：42') >= 0 && sr.html.indexOf('最终答案：4</span>') < 0)
  check('结算卡 token 信息', sr.html.indexOf('+42 tok') >= 0)
  sr = await h({ action: '', fields: {}, state: sr.state, root: ROOT, session: 's-settle', live: undefined })
  check('冷读（无叠加层）→ 结算卡一致（单一折叠器两条来源等价）', countCards(sr.html, 'data-flow-role="ai"') === 1 && sr.html.indexOf('最终答案：42') >= 0 && sr.html.indexOf('data-flow-branch data-seq="5"') >= 0)
  const coldSettle = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-settle-cold' })
  check('冷会话（全程无 live）→ 同一张结算卡', countCards(coldSettle.html, 'data-flow-role="ai"') === 1 && coldSettle.html.indexOf('最终答案：42') >= 0 && coldSettle.html.indexOf('data-flow-branch data-seq="5"') >= 0)

  // settle 先于 end frame（settle 竞态）：durable message 已在、live attempt 仍挂 → 以 durable 为准不重复
  sr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-settle-cold',
    live: liveOverlay('s-settle-cold', 12, [attempt('att-9', 1, 1, 4.5, 4020, 4195, { text: '最终答案：42' })], [{ attemptId: 'att-8', turn: 1, step: 1, firstSeq: 4.2 }]) })
  check('settle 先于 end frame 到达 → 无重复卡', countCards(sr.html, 'data-flow-role="ai"') === 1 && sr.html.indexOf('data-flow-state="settled"') >= 0)

  // baseline 重建：attempt 快照重建（同 attemptId）→ 仍一张卡
  lr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-live',
    live: liveOverlay('s-live', 1, [attempt('att-1', 1, 1, 3.5, 3030, 3045, { text: 'rebuilt prefix' })]) })
  lr = await h({ action: '', fields: {}, state: lr.state, root: ROOT, session: 's-live',
    live: liveOverlay('s-live', 2, [attempt('att-1', 1, 1, 3.5, 3030, 3055, { text: 'rebuilt prefix + more' })]) })
  check('重连 baseline 重建实时 attempt → 一张卡内容续增', countCards(lr.html, 'data-flow-role="ai"') === 1 && lr.html.indexOf('rebuilt prefix + more') >= 0)

  // 原始 live-chunk 事件透传路径（测试/整窗）：缺 attemptId 的帧不产生卡；重复帧不裂卡
  const RAW_LIKE_EVENTS = SESSIONS['s-live'].concat([
    { seq: 3.1, time: 3031, type: 'assistant/live-chunk', data: { attemptId: 'att-raw', turn: 1, step: 1, chunk: { type: 'text-delta', text: 'raw ' } } },
    { seq: 3.2, time: 3032, type: 'assistant/live-chunk', data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'orphan' } } },
    { seq: 3.3, time: 3033, type: 'assistant/live-chunk', data: { attemptId: 'att-raw', turn: 1, step: 1, chunk: { type: 'text-delta', text: 'frames' } } },
  ])
  SESSIONS['s-raw-live'] = RAW_LIKE_EVENTS
  const rr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-raw-live' })
  check('原始 live-chunk 帧 → 一张实时卡（缺 attemptId 帧被忽略）', countCards(rr.html, 'data-flow-role="ai"') === 1 && rr.html.indexOf('data-flow-attempt="att-raw"') >= 0 && rr.html.indexOf('raw frames') >= 0 && rr.html.indexOf('orphan') < 0)

  // 失败/取消/中断
  const fr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-fail-attempt' })
  check('assistant/attempt 结算 → 失败卡（真实错误码徽标）', fr.html.indexOf('data-flow-state="failed"') >= 0 && fr.html.indexOf('✗ PI_AI_ERROR') >= 0)
  check('失败卡保留已生成片段', fr.html.indexOf('partial content') >= 0)
  check('失败卡计时落定（无运行计时器）', fr.html.indexOf('data-flow-timer') < 0 && fr.html.indexOf('⏱') >= 0)
  check('失败卡无流光脉冲', fr.html.indexOf('fl-live') < 0)
  const ar = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-abort-attempt' })
  check('aborted attempt → 取消卡（已取消标记）', ar.html.indexOf('data-flow-state="abandoned"') >= 0 && ar.html.indexOf('（已取消）') >= 0 && ar.html.indexOf('用户按了停止') >= 0)
  // 中断（live attempt + 步骤终结、无结算）
  SESSIONS['s-interrupted'] = LIVE_PREFIX_EVENTS.concat([{ seq: 4, time: 3100, type: 'step/end', data: { turn: 1, step: 1 } }, { seq: 5, time: 3110, type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { code: 'X', message: 'net' } } } }])
  const ir = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-interrupted',
    live: liveOverlay('s-interrupted', 4, [attempt('att-i', 1, 1, 3.4, 3030, 3050, { text: '断了' })]) })
  check('步骤终结无结算 → 中断落定（保留片段）', ir.html.indexOf('（生成已中断）') >= 0 && ir.html.indexOf('断了') >= 0 && ir.html.indexOf('data-flow-timer') < 0)

  // 重试可视化
  const okr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-retry-ok' })
  check('重试后成功 → 绿色重试徽标（一张卡）', countCards(okr.html, 'data-flow-role="ai"') === 1 && okr.html.indexOf('fl-retry-ok') >= 0 && okr.html.indexOf('⟳ 重试 1/5 · 成功') >= 0)
  check('重试徽标 title 带触发失败码', okr.html.indexOf('EMPTY_RESPONSE') >= 0)
  check('重试后成功 → 不出现错误码徽标', okr.html.indexOf('✗') < 0)
  const failr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-retry-fail' })
  check('重试仍失败 → 红色重试徽标 + 真实错误码', failr.html.indexOf('fl-retry-fail') >= 0 && failr.html.indexOf('⟳ 重试 1/5 · 失败') >= 0 && failr.html.indexOf('✗ PI_AI_ERROR') >= 0)
  check('重试失败卡保留片段（retrying）', failr.html.indexOf('retrying') >= 0)
  const waitr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-retry-wait' })
  check('重试等待中 → 琥珀倒计时徽标（durable attempt 卡承载）', waitr.html.indexOf('fl-retry-wait') >= 0 && waitr.html.indexOf('⟳ 等待重试 1/5') >= 0)
  check('重试等待中 → 无运行计时器但保持等待态', waitr.html.indexOf('data-flow-timer') < 0)
  // 重试在途（第二试 live）：第一试已 durable 结算、第二试 live → 一张流式卡 + 重试进行中徽标
  SESSIONS['s-retry-active'] = RETRY_WAIT_EVENTS.slice(0, 4).concat([
    { seq: 5, time: 9521, type: 'llm/retry-started', data: { retryId: 'r3', turn: 1, step: 1, retry: 1 } },
  ])
  const actr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-retry-active',
    live: liveOverlay('s-retry-active', 2, [attempt('att-r2', 1, 1, 5.3, 9530, 9540, { text: '第二试输出中' })]) })
  check('重试起跳 → live 第二试替换为流式卡（仍一张）', countCards(actr.html, 'data-flow-role="ai"') === 1 && actr.html.indexOf('data-flow-state="streaming"') >= 0 && actr.html.indexOf('第二试输出中') >= 0)
  check('重试起跳 → 进行中徽标', actr.html.indexOf('⟳ 重试 1/5 · 进行中') >= 0)

  // max-tokens / 纯 tool-call / reasoning
  const mr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-max-tokens' })
  check('max-tokens → 截断徽标 + 结束原因', mr.html.indexOf('⤒ 已达上限') >= 0)
  const mrd = await h({ action: 'fdetail', fields: { __el: { seq: '4' } }, state: mr.state, root: ROOT, session: 's-max-tokens' })
  check('max-tokens 详情 meta 带结束原因', mrd.html.indexOf('结束 max-tokens') >= 0)
  const tr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-toolcall-only' })
  check('纯 tool-call 流 → 无文本时卡片给（工具调用）占位', tr.html.indexOf('（工具调用）') >= 0 && countCards(tr.html, 'data-flow-role="ai"') === 1)
  const reasoningLive = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-live',
    live: liveOverlay('s-live', 1, [attempt('att-rs', 1, 1, 3.3, 3030, 3040, { reasoning: '深度思考中', text: '' })]) })
  check('reasoning-only 流 → 思考内容作为流式预览', reasoningLive.html.indexOf('深度思考中') >= 0 && reasoningLive.html.indexOf('正在生成…') < 0)
  // settle 会话 reasoning 混合：结算后正文为准（reasoning 只进详情）
  const sd = await h({ action: 'fdetail', fields: { __el: { seq: '5' } }, state: null, root: ROOT, session: 's-settle' })
  check('混合流结算 → 正文来自 message 文本', sd.html.indexOf('最终答案：42') >= 0)

  // ================= ③ 旧协议防线 =================
  const lg = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-legacy-chunk' })
  check('assistant/chunk 不再被解析（0.1.2 历史帧不产生助手卡）', countCards(lg.html, 'data-flow-role="ai"') === 0)

  // ================= 长会话分页（回归） =================
  r = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-long' })
  check('长会话初始仅显示最近 60 条', r.html.indexOf('data-flow-visible="60"') >= 0 && r.html.indexOf('long-071') >= 0 && r.html.indexOf('long-070') < 0)
  r = await h({ action: 'fmore', fields: {}, state: r.state, root: ROOT, session: 's-long' })
  check('向上加载 → 120 条', r.html.indexOf('data-flow-visible="120"') >= 0 && r.html.indexOf('long-011') >= 0 && r.html.indexOf('long-010') < 0)
  r = await h({ action: 'fmore', fields: {}, state: r.state, root: ROOT, session: 's-long' })
  check('全部加载后不再显示自动加载占位', r.html.indexOf('data-flow-visible="130"') >= 0 && r.html.indexOf('long-001') >= 0 && r.html.indexOf('data-flow-older-hint') < 0)

  // __refresh 静默动作（自动轮询路径；state 遗留 s-long 钻取 → 子代理流镜头）
  r = await h({ action: '__refresh', fields: {}, state: r.state, root: ROOT, session: 's-main' })
  check('__refresh → 正常渲染（跟随遗留钻取态切子代理流镜头）', r.ok === true && r.html.indexOf('子代理流镜') >= 0 && r.html.indexOf('data-action="fback"') >= 0)

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('仿真异常:', e); process.exit(2) })
