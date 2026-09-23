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
// DSH 0.1.7 工具消息：结果 ID、失败位在 message 上，正文是直接 text 块。
const V4_TOOL_EVENTS = [
  { seq: 1, time: 1000, type: 'tool/call', data: { turn: 1, step: 1, name: 'pwsh', callId: 'v4-ok', arguments: '{"cmd":"npm pack"}' } },
  { seq: 2, time: 1250, type: 'tool/result', data: { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'v4-ok' }, toolCallId: 'v4-ok', content: [{ type: 'text', text: 'package ready' }], isError: false } } },
  { seq: 3, time: 1300, type: 'tool/call', data: { turn: 1, step: 2, name: 'plugin_manager', callId: 'v4-error', arguments: '{}' } },
  { seq: 4, time: 1450, type: 'tool/result', data: { turn: 1, step: 2, message: { role: 'tool', source: { kind: 'tool', callId: 'v4-error' }, toolCallId: 'v4-error', content: [{ type: 'text', text: 'install failed' }], isError: true } } },
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

const PRESENTATION_RULE_EVENTS = [
  { seq: 1, time: 13000, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '检索记忆' }] }, stream: [] } },
  { seq: 2, time: 13010, type: 'tool/call', data: { turn: 1, step: 2, name: 'pwsh', callId: 'memory-1', arguments: JSON.stringify({ command: "& 'C:\\Users\\tester\\.agents\\skills\\engram-memory\\scripts\\engram-memory.ps1' search 'flowglass'", description: 'Search memory' }) } },
  { seq: 3, time: 13020, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'memory-1', content: [{ type: 'text', text: '# Search: flowglass' }] }] } } },
]

const DEFAULT_PRESENTATION_RULE_EVENTS = [
  { seq: 1, time: 13100, type: 'tool/call', data: { turn: 1, step: 1, name: 'pwsh', callId: 'default-git', arguments: JSON.stringify({ command: 'git status' }) } },
  { seq: 2, time: 13101, type: 'tool/call', data: { turn: 1, step: 2, name: 'bash', callId: 'default-github', arguments: JSON.stringify({ command: 'gh pr status' }) } },
  { seq: 3, time: 13102, type: 'tool/call', data: { turn: 1, step: 3, name: 'pwsh', callId: 'default-pnpm', arguments: JSON.stringify({ command: 'pnpm.cmd test' }) } },
  { seq: 4, time: 13103, type: 'tool/call', data: { turn: 1, step: 4, name: 'bash', callId: 'default-npm', arguments: JSON.stringify({ command: 'npm run lint' }) } },
  { seq: 5, time: 13104, type: 'tool/call', data: { turn: 1, step: 5, name: 'pwsh', callId: 'default-dsh', arguments: JSON.stringify({ command: 'dsh.exe --version' }) } },
  { seq: 6, time: 13105, type: 'tool/call', data: { turn: 1, step: 6, name: 'bash', callId: 'default-python', arguments: JSON.stringify({ command: 'python3 -m pytest' }) } },
]

const SKILL_DETAIL_EVENTS = [
  { seq: 1, time: 14000, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '加载记忆技能' }] }, stream: [] } },
  { seq: 2, time: 14010, type: 'tool/call', data: { turn: 1, step: 2, name: 'skill', callId: 'skill-1', arguments: '{"name":"engram-memory"}' } },
  { seq: 3, time: 14030, type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'skill-1', content: [{ type: 'text', text: '<skill_content name="engram-memory">\n<skill_resources>\nBase directory for this skill: C:\\Users\\tester\\.agents\\skills\\engram-memory\nResolve relative paths against this base directory.\n</skill_resources>\n\n<skill_instructions>\n# Engram Memory\n\nUse durable project-aware memory.\n\n## Activation\n\nSearch only when relevant.\n</skill_instructions>\n</skill_content>' }] }] } } },
]

const LONG_EVENTS = Array.from({ length: 130 }, (_, i) => ({
  seq: i + 1,
  time: 4000 + i,
  type: 'user/message',
  data: { content: [{ type: 'text', text: 'long-' + String(i + 1).padStart(3, '0') }], source: { kind: 'user' } },
}))

const SESSIONS = {
  's-main': MAIN_EVENTS,
  's-v4-tools': V4_TOOL_EVENTS,
  '228a8697-2b7a-422a-b3c0-1cf61c965d5c': CHILD_EVENTS,
  '338a8697-2b7a-422a-b3c0-1cf61c965d6d': CHILD_EVENTS,
  's-fleet-1': CHILD_EVENTS,
  's-fleet-2': CHILD_EVENTS,
  's-finished': [
    { seq: 1, time: 1550, type: 'user/message', data: { content: [{ type: 'text', text: '已完成的调研任务' }], source: { kind: 'user' } } },
    { seq: 1.5, time: 1555, type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'reasoner-x' } } } },
    { seq: 2, time: 1560, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '调研结论' }] }, stream: [], usage: { outputTokens: 6 } } },
  ],
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
  's-presentation-rules': PRESENTATION_RULE_EVENTS,
  's-default-presentation-rules': DEFAULT_PRESENTATION_RULE_EVENTS,
  's-skill-detail': SKILL_DETAIL_EVENTS,
  's-long': LONG_EVENTS,
}
// 大流镜 Zoom 血缘树：s-main → 228a/338a（在线子代理）+ s-finished（仅落盘的历史子代理）
const LINEAGE = {
  's-main': {
    target: { header: { id: 's-main', cwd: ROOT }, live: true, persisted: true },
    descendants: [
      { session: { header: { id: '228a8697-2b7a-422a-b3c0-1cf61c965d5c', origin: 'subagent', parentSession: 's-main', delegationDepth: 1 }, live: true, persisted: true }, descendants: [] },
      { session: { header: { id: '338a8697-2b7a-422a-b3c0-1cf61c965d6d', origin: 'subagent', parentSession: 's-main', delegationDepth: 1 }, live: false, persisted: true }, descendants: [] },
      { session: { header: { id: 's-finished', origin: 'subagent', parentSession: 's-main', delegationDepth: 1 }, live: false, persisted: true }, descendants: [] },
    ],
    complete: true,
    root: { header: { id: 's-main', cwd: ROOT }, live: true, persisted: true },
  },
  '228a8697-2b7a-422a-b3c0-1cf61c965d5c': {
    target: { header: { id: '228a8697-2b7a-422a-b3c0-1cf61c965d5c', origin: 'subagent', parentSession: 's-main', delegationDepth: 1 }, live: true, persisted: true },
    ancestors: [{ header: { id: 's-main', cwd: ROOT }, live: true, persisted: true }],
    descendants: [], complete: true,
    root: { header: { id: 's-main', cwd: ROOT }, live: true, persisted: true },
  },
}
const sessionQuery = {
  async readSession(sid) { return { session: { id: sid }, events: SESSIONS[sid] || [] } },
  async listSessions() { return [{ header: { id: 's-main' }, live: true }] },
  async traceSession(sid) { const tr = LINEAGE[sid]; if (!tr) throw new Error('unknown session: ' + sid); return tr },
}
const sessions = {
  get: (id) => (/^(228|338)a8697/.test(id) && SESSIONS[id] ? { events: SESSIONS[id], header: { id, origin: 'subagent', parentSession: 's-main', delegationDepth: 1 } } : undefined),
  list: () => [
    { id: 's-main', header: { id: 's-main', cwd: ROOT } },
    { id: '228a8697-2b7a-422a-b3c0-1cf61c965d5c', header: { id: '228a8697-2b7a-422a-b3c0-1cf61c965d5c', origin: 'subagent', parentSession: 's-main', delegationDepth: 1 } },
  ],
}
const llm = {
  listProviders: async () => [{ id: 'deepseek', name: 'DeepSeek' }],
  listModels: async () => [{ id: 'reasoner-x', name: 'Reasoner X' }],
  resolveModelInfo: async () => ({
    reasoning: {
      efforts: [{ id: 'high', name: '高' }, { id: 'max', name: '最高' }],
      defaultEffort: 'high',
    },
  }),
}

const handlers = {}
const ctx = {
  get(name) {
    if (name === 'sessionQuery') return sessionQuery
    if (name === 'sessions') return sessions
    if (name === 'llm') return llm
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
  // Expose the real projection helper to exercise invalidation without weakening
  // product encapsulation or depending on the log reader's own caching policy.
  const flowSource = read('plugins/flow/tool.js').replace('    const nodeKeyOf =',
    '    ctx.__projectionTest = { projectFlowItems, durableProjectionCache }\n    const nodeKeyOf =')
  const src = read('shared/runtime.js') + '\n' + read('shared/host.js') + '\n' + flowSource
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + src + '\n})()')(ctx, undefined, console)
  await plugin.apply(ctx)
  const h = handlers.flow
  if (!h) { console.log('FAIL | flow 未注册'); process.exit(1) }

  // ================= ① 形态回归（durable 0.1.5 事件） =================
  let r = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-main' })
  check('打开默认当前会话 → 渲染主干', r.state.zoom === false && r.html.includes('aria-current="page">当前会话'))
  check('说明收敛到更多菜单内的原生折叠区', r.html.includes('data-flow-disclosure="more"') && r.html.includes('data-flow-disclosure="help"') && r.html.includes('• 中列是用户/助手主线'))
  check('自动刷新声明 data-autorefresh=1000', r.html.indexOf('data-autorefresh="1000"') >= 0)
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
  check('调用完成状态与耗时使用可读文案', r.html.includes('已完成 · 100ms'))
  const v4Tools = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-v4-tools' })
  check('0.1.7 工具结果按 message ID 结算并显示耗时',
    v4Tools.html.includes('已完成 · 250ms') && v4Tools.html.includes('失败 · 150ms')
      && !v4Tools.html.includes('data-flow-status="pending"') && !v4Tools.html.includes('data-flow-timer="1000"'))
  check('0.1.7 工具正文直接从 message content 读取',
    v4Tools.html.includes('package ready') && v4Tools.html.includes('install failed'))
  check('子代理入口卡（fl-sub-open）与支线步骤', r.html.indexOf('fl-sub-open') >= 0 && r.html.indexOf('fl-sub-steps') >= 0)
  check('子代理出口卡（fl-sub-close）', r.html.indexOf('fl-sub-close') >= 0)
  check('alpha.4 send_message 归入子代理并可钻取', r.html.indexOf('data-action="fenter" data-seq="13"') >= 0)
  check('子代理 live 徽章（运行中）', r.html.indexOf('运行中') >= 0)
  check('同 step 并行子代理合并成组', r.html.indexOf('并行子代理 ×2') >= 0 && r.html.indexOf('fl-subgrp') >= 0)
  check('子代理跟随开关默认开启', r.html.includes('data-action="toggle-follow" aria-pressed="true"') && r.state.follow === true)
  check('消息与工具详情使用原生按钮且分支按钮不嵌套', /<button type="button" class="fl-node-open"[^>]*data-action="fdetail"/.test(r.html)
    && /<button type="button" class="fl-iocard[^>]*data-action="fdetail"/.test(r.html)
    && !/<button[^>]*class="fl-node-open"(?:(?!<\/button>)[\s\S])*<button/.test(r.html))
  check('子代理入口与出口可由键盘聚焦', /class="fl-sub-card fl-sub-open[^>]*role="button" tabindex="0"/.test(r.html)
    && /class="fl-sub-card fl-sub-close" role="button" tabindex="0"/.test(r.html))
  SESSIONS['s-system-context'] = [
    { seq: 1, time: 1000, type: 'user/message', data: { content: [{ type: 'text', text: '可见用户输入' }], source: { kind: 'user' } } },
    { seq: 2, time: 1001, type: 'user/message', data: { content: [{ type: 'text', text: '保留完整系统上下文' }], source: { kind: 'system' } } },
  ]
  let contextView = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-system-context' })
  check('系统上下文默认折叠且保留节点与原文', contextView.html.includes('data-flow-disclosure="system:2"><summary>系统上下文')
    && contextView.html.includes('data-flow-main-card="2"') && contextView.html.includes('保留完整系统上下文'))
  contextView = await h({ action: 'fcontext', fields: { __el: { seqs: '2' } }, state: contextView.state, root: ROOT, session: 's-system-context' })
  check('折叠不改变框选导出的系统上下文', contextView.flowContext.seqs.join(',') === '2' && contextView.flowContext.text.includes('保留完整系统上下文'))
  contextView = await h({ action: 'fdetail', fields: { __el: { seq: '2' } }, state: contextView.state, root: ROOT, session: 's-system-context' })
  check('定位系统上下文会展开来源并显示命名 Inspector', contextView.html.includes('data-flow-disclosure="system:2" open')
    && contextView.html.includes('data-flow-inspector="2" role="region" aria-label="系统上下文详情"'))

  // 声明式工具显示规则：内置规则随包发布，自定义与用户改动只由 Client localStorage 携带。
  let defaults = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-default-presentation-rules' })
  check('首次使用内置六条工具显示规则', defaults.state.presentationRules.length === 6
    && defaults.html.indexOf('<span class="fl-name">Git status</span>') >= 0
    && defaults.html.indexOf('<span class="fl-name">GitHub pr</span>') >= 0
    && defaults.html.indexOf('<span class="fl-name">pnpm test</span>') >= 0
    && defaults.html.indexOf('<span class="fl-name">npm run</span>') >= 0
    && defaults.html.indexOf('<span class="fl-name">DSH --version</span>') >= 0
    && defaults.html.indexOf('<span class="fl-name">Python -m</span>') >= 0)
  defaults = await h({ action: 'ftoggle-rule', fields: { __el: { index: '0' } }, state: defaults.state, root: ROOT, session: 's-default-presentation-rules' })
  check('内置默认规则可单独关闭', defaults.state.presentationRules[0].enabled === false
    && defaults.html.indexOf('<span class="fl-name">Git status</span>') < 0
    && defaults.html.indexOf('<span class="fl-name">pwsh</span>') >= 0)
  defaults = await h({ action: 'fdelete-rule', fields: { __el: { index: '1' } }, state: defaults.state, root: ROOT, session: 's-default-presentation-rules' })
  check('内置默认规则可单独删除', defaults.state.presentationRules.length === 5
    && defaults.state.presentationRules.every((rule) => rule.displayName !== 'GitHub'))

  // 未命中内置规则的命令仍保留原始工具名；编辑界面已迁到官方插件详情页。
  let pr = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-presentation-rules' })
  check('流镜头部不再重复显示设置入口', pr.html.indexOf('data-action="fsettings"') < 0)
  check('内置规则未命中时保留原始 pwsh 标题', pr.html.indexOf('<span class="fl-name">pwsh</span>') >= 0)
  const engramRules = JSON.stringify([{
    enabled: true,
    tools: ['pwsh'],
    executables: ['engram-memory.ps1'],
    displayName: 'engram-lattice',
    actions: ['search', 'recall', 'memory'],
    badge: '记忆',
    color: '#81c784',
  }])
  pr = await h({ action: 'fapply-rule-json', fields: { flowPresentationRules: engramRules }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  check('规则命中后投影名称与徽章', pr.html.indexOf('<span class="fl-name">engram-lattice search</span>') >= 0 && pr.html.indexOf('>记忆</span>') >= 0)
  check('规则 JSON 仍由 Host 严格收窄', pr.state.presentationRules.length === 1 && pr.state.presentationRules[0].displayName === 'engram-lattice')
  pr = await h({ action: 'fsave-rule', fields: {
    'flowRule.0.enabled': '1',
    'flowRule.0.tools': 'pwsh',
    'flowRule.0.executables': 'engram-memory.ps1',
    'flowRule.0.displayName': 'engram-lattice',
    'flowRule.0.actions': 'search, recall, memory',
    'flowRule.0.badge': '记忆',
    'flowRule.0.color': '#81c784',
    __el: { index: '0' },
  }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  check('单条规则保存仍保留 Host 兼容动作', pr.state.presentationRules[0].actions.length === 3)
  pr = await h({ action: 'ftoggle-rule', fields: { __el: { index: '0' } }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  check('规则可单独停用', pr.state.presentationRules[0].enabled === false && pr.html.indexOf('engram-lattice search') < 0)
  pr = await h({ action: 'ftoggle-rule', fields: { __el: { index: '0' } }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  const addFields = {
    'flowRule.new.enabled': '1',
    'flowRule.new.tools': 'bash',
    'flowRule.new.executables': 'git',
    'flowRule.new.displayName': 'Git',
    'flowRule.new.actions': 'status, diff',
    'flowRule.new.badge': '',
    'flowRule.new.color': '#7fa7f0',
  }
  pr = await h({ action: 'fcreate-rule', fields: addFields, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  check('规则可单独创建', pr.state.presentationRules.length === 2 && pr.state.presentationRules[1].displayName === 'Git')
  pr = await h({ action: 'fdelete-rule', fields: { __el: { index: '1' } }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  check('规则可单独删除', pr.state.presentationRules.length === 1 && pr.state.presentationRules.every((rule) => rule.displayName !== 'Git'))
  pr = await h({ action: 'fdetail', fields: { __el: { seq: '2' } }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  check('详情标题使用投影名称但保留完整原始命令', pr.html.indexOf('工具 · engram-lattice search') >= 0 && pr.html.indexOf('engram-memory.ps1') >= 0)
  let invalidRuleRejected = false
  try {
    await h({ action: 'fapply-rule-json', fields: { flowPresentationRules: '{bad' }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  } catch (e) { invalidRuleRejected = /有效 JSON/.test(String(e && e.message)) }
  check('无效声明式 JSON 被明确拒绝', invalidRuleRejected)
  const inferredRules = JSON.stringify([{
    enabled: true,
    tools: ['pwsh'],
    executables: ['engram-memory.ps1'],
    displayName: '',
    actions: ['search'],
    badge: '',
  }])
  pr = await h({ action: 'fapply-rule-json', fields: { flowPresentationRules: inferredRules }, state: pr.state, root: ROOT, session: 's-presentation-rules' })
  check('displayName 为空时不推导默认名称，badge 为空时不渲染徽章',
    pr.html.indexOf('<span class="fl-name">search</span>') >= 0
      && pr.html.indexOf('engram-memory search') < 0
      && pr.html.indexOf('>命令</span>') < 0 && pr.html.indexOf('>记忆</span>') < 0)

  const configuredPreferences = JSON.stringify({
    keepOpenOnSessionSwitch: false,
    zoomEnabled: false,
    defaultBranchCount: 4,
    defaultZoomView: 'map',
    refreshMs: 5000,
    laneRatio: [25, 30, 45],
  })
  let configured = await h({ action: '', fields: { __flowPreferences: configuredPreferences }, state: null, root: ROOT, session: 's-main' })
  check('插件详情偏好控制轮询、默认视图、分支数、列宽和大流镜入口', configured.html.indexOf('data-autorefresh="5000"') >= 0
    && configured.html.indexOf('data-action="fzoom"') < 0
    && configured.state.zoomView === 'map' && configured.state.zoomLanes.length === 4
    && configured.state.__flowPreferences === undefined)
  configured = await h({ action: 'fzoom', fields: { __flowPreferences: configuredPreferences }, state: configured.state, root: ROOT, session: 's-main' })
  check('关闭大流镜后旧入口动作也不会重新打开', configured.state.zoom === false && configured.html.indexOf('data-flow-board="1"') < 0)

  // Skill 详情：语义化名称/资源/Markdown 说明，原始 XML 收进折叠区。
  let sk = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-skill-detail' })
  check('Skill 调用卡直接显示技能名', sk.html.indexOf('<span class="fl-name">engram-memory</span>') >= 0
    && sk.html.indexOf('<span class="fl-name">skill</span>') < 0)
  check('Skill 调用状态使用不可换行状态单元', sk.html.indexOf('<span class="fl-status"') >= 0)
  sk = await h({ action: 'fdetail', fields: { __el: { seq: '2' } }, state: sk.state, root: ROOT, session: 's-skill-detail' })
  check('Skill 详情使用技能名称和语义区域', sk.html.indexOf('技能 · engram-memory') >= 0
    && sk.html.indexOf('基础目录') >= 0 && sk.html.indexOf('资源说明') >= 0 && sk.html.indexOf('使用说明') >= 0)
  check('Skill 使用说明声明 Markdown 挂载点', sk.html.indexOf('data-flow-markdown-detail="1"') >= 0
    && sk.html.indexOf('data-flow-markdown-source="1"') >= 0 && sk.html.indexOf('# Engram Memory') >= 0)
  check('Skill 原始 XML 收入折叠区且内容保留', sk.html.indexOf('class="fl-skill-raw"') >= 0
    && sk.html.indexOf('<summary>原始返回</summary>') >= 0 && sk.html.indexOf('&lt;skill_content name=&quot;engram-memory&quot;&gt;') >= 0)

  // live 开关
  r = await h({ action: 'toggle-live', fields: {}, state: r.state, root: ROOT, session: 's-main' })
  check('暂停 → 无 autorefresh 声明', r.html.indexOf('data-autorefresh="1000"') < 0)
  check('暂停同步保留独立可见状态', r.html.includes('data-flow-sync-state="paused">已暂停同步'))
  r = await h({ action: 'toggle-live', fields: {}, state: r.state, root: ROOT, session: 's-main' })
  check('恢复 → autorefresh 回归', r.html.indexOf('data-autorefresh="1000"') >= 0)

  // 跟随开关 + 钻取
  r = await h({ action: 'fenter', fields: { __el: { seq: '8' } }, state: r.state, root: ROOT, session: 's-main' })
  check('进入子流镜仍实时', r.html.includes('aria-current="page">子代理') && r.html.indexOf('data-autorefresh="1000"') >= 0)
  check('跟随返回 Harness 子会话导航', r.navigateSession && r.navigateSession.sessionId === '228a8697-2b7a-422a-b3c0-1cf61c965d5c' && r.navigateSession.parentSessionId === 's-main')
  r = await h({ action: '', fields: {}, state: r.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('Harness 切到子 Session 后仍保留返回链', r.html.indexOf('data-action="fback"') >= 0 && r.state.home === 's-main' && r.state.crumbs.length === 1)
  r = await h({ action: 'fback', fields: {}, state: r.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('返回上级也返回 Harness 导航', r.navigateSession && r.navigateSession.sessionId === 's-main')
  const crumbView = await h({ action: 'fback', fields: { __el: { depth: '0' } }, state: { ...r.state, sid: 's-long', follow: false,
    crumbs: [{ sid: 's-main', label: '主任务' }, { sid: 's-finished', label: '中间任务' }] }, root: ROOT, session: 's-main' })
  check('面包屑可以直接回到祖先并截断返回链', crumbView.state.sid === 's-main' && crumbView.state.crumbs.length === 0 && !crumbView.navigateSession)

  // 详情
  r = await h({ action: 'fdetail', fields: { __el: { seq: '3' } }, state: r.state, root: ROOT, session: 's-main' })
  check('点工具卡 → 右侧浮层展开详情（fl-rail）', r.html.indexOf('fl-rail') >= 0 && r.html.indexOf('file a content') >= 0)
  const toolInspector = r.html.slice(r.html.indexOf('data-flow-inspector="3"'))
  check('工具详情输入默认展开并位于输出上方，技术信息折叠', toolInspector.includes('<details open class="fl-tool-input"') && toolInspector.indexOf('data-flow-disclosure="input:3"') < toolInspector.indexOf('file a content')
    && toolInspector.includes('data-flow-disclosure="technical:3"') && toolInspector.includes('关闭详情并返回流程'))
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
  check('卡片不再常驻完整模型路由', !lr.html.includes('deepseek/reasoner-x'))
  const routeDetail = await h({ action: 'fdetail', fields: { __el: { seq: '3.25' } }, state: { ...lr.state }, root: ROOT, session: 's-live', live: liveOverlay('s-live', 2, [attempt('att-1', 1, 1, 3.25, 3030, 3060, { text: 'Hello 流镜世界' })]) })
  check('模型路由保留在详情技术信息中', routeDetail.html.includes('data-flow-disclosure="technical:3.25"') && routeDetail.html.includes('deepseek/reasoner-x'))

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
  check('失败卡计时落定（无运行计时器）', fr.html.indexOf('data-flow-timer') < 0 && fr.html.includes('已中断'))
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
  check('加载更早提示位于 column-reverse 的视觉顶部，最新节点保持贴底', r.html.indexOf('data-flow-older-hint') > r.html.indexOf('long-071'))
  r = await h({ action: 'fmore', fields: {}, state: r.state, root: ROOT, session: 's-long' })
  check('向上加载 → 120 条', r.html.indexOf('data-flow-visible="120"') >= 0 && r.html.indexOf('long-011') >= 0 && r.html.indexOf('long-010') < 0)
  r = await h({ action: 'fmore', fields: {}, state: r.state, root: ROOT, session: 's-long' })
  check('全部加载后不再显示自动加载占位', r.html.indexOf('data-flow-visible="130"') >= 0 && r.html.indexOf('long-001') >= 0 && r.html.indexOf('data-flow-older-hint') < 0)

  // __refresh 静默动作（自动轮询路径；state 遗留 s-long 钻取 → 子代理流镜头）
  r = await h({ action: '__refresh', fields: {}, state: r.state, root: ROOT, session: 's-main' })
  check('__refresh → 正常渲染（跟随遗留钻取态切子代理流镜头）', r.ok === true && r.html.includes('aria-current="page">子代理') && r.html.indexOf('data-action="fback"') >= 0)

  // ================= ④ 大流镜 Zoom（多会话并发总览） =================
  let z = await h({ action: 'fzoom', fields: {}, state: null, root: ROOT, session: 's-main' })
  check('大流镜：进入总览（两种尺度切换 + 看板标记 + 自动刷新）', z.state.zoom === true
    && z.state.zoomMode === 'panorama'
    && z.html.includes('aria-label="观察范围"') && z.html.includes('data-action="fzoom-focus-back" aria-current="page">并发任务')
    && z.html.includes('data-action="fzoom-focus-current"') && z.html.includes('>查看选中分支</button>')
    && z.html.indexOf('data-action="fzoom-scope"') < 0 && z.html.indexOf('🌳 会话树') < 0
    && z.html.indexOf('data-flow-board="1"') >= 0 && z.html.indexOf('data-autorefresh="1000"') >= 0)
  check('大流镜：血缘树 4 卡（主会话 + 3 后代）', countCards(z.html, 'data-action="fzoom-open"') === 4)
  check('大流镜：首条用户消息作卡标题（触发内容即身份）', z.html.indexOf('帮我看下这个目录') >= 0 && z.html.indexOf('已完成的调研任务') >= 0)
  check('大流镜：无用户消息的会话回退短 id 标题', z.html.indexOf('会话 228a8697') >= 0)
  check('概览来源上下文只显示一次，子代理层级保留在技术信息', countCards(z.html, 'class="fl-overview-source"') === 1 && z.html.includes('子代理 L1') && z.html.includes('data-flow-disclosure="branch:'))
  check('概览：来源会话与分支收敛为摘要卡', z.html.includes('fl-overview-list') && countCards(z.html, '<article class="fl-overview-card') === 3 && z.html.includes('来源会话') && z.html.includes('3 个分支'))
  check('概览：优先显示最新结论并保留过程入口', z.html.includes('fl-overview-conclusion') && z.html.includes('调研结论') && countCards(z.html, 'data-action="fzoom-open"') === 4)
  check('大流镜：模型徽章来自会话 request/header 路由', z.html.indexOf('deepseek/reasoner-x') >= 0)
  check('大流镜：历史会话状态点（未上线后代）', z.html.indexOf('历史') >= 0)
  check('大流镜：首轮无运行中徽标（无增长）', z.html.indexOf('fl-zoom-dot-running') < 0 && z.html.indexOf('data-tab-badge=""') >= 0)
  // 子代理日志增长 → 下一轮该会话亮起运行中（agents 状态面缺失时的增长兜底），Tab 角标报活
  SESSIONS['228a8697-2b7a-422a-b3c0-1cf61c965d5c'] = SESSIONS['228a8697-2b7a-422a-b3c0-1cf61c965d5c'].concat([
    { seq: 4, time: 1580, type: 'assistant/message', data: { turn: 1, step: 3, message: { content: [{ type: 'text', text: '调研推进中' }] }, stream: [] } },
  ])
  z = await h({ action: '__refresh', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：日志增长 → 运行中状态点 + 角标报活', z.html.indexOf('fl-zoom-dot-running') >= 0 && z.html.indexOf('1 运行中') >= 0 && z.html.indexOf('data-tab-badge="1活"') >= 0)
  check('大流镜：运行中卡持续实时刷新', z.html.indexOf('data-autorefresh="1000"') >= 0)
  // 从全景点卡就是放大进入 Session：直接切到近观，同时跟随 Harness。
  z = await h({ action: 'fzoom-open', fields: { __el: { sid: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：全景点入 Session 直接放大到近观', z.state.zoom === true && z.state.zoomFocusSid === '228a8697-2b7a-422a-b3c0-1cf61c965d5c'
    && z.state.sid === '228a8697-2b7a-422a-b3c0-1cf61c965d5c' && z.state.zoomMode === 'near'
    && z.html.includes('data-action="fzoom-focus-back">并发任务') && z.html.includes('<span aria-current="page">')
    && z.html.indexOf('fl-zoom-motion-focus') >= 0)
  check('大流镜：切换时跟随导航（子代理寻址）', z.navigateSession && z.navigateSession.kind === 'subagent'
    && z.navigateSession.sessionId === '228a8697-2b7a-422a-b3c0-1cf61c965d5c' && z.navigateSession.parentSessionId === 's-main')
  check('大流镜近观：复用完整单会话流镜并铺满画布', z.state.zoomMode === 'near'
    && z.state.zoomFocusSid === '228a8697-2b7a-422a-b3c0-1cf61c965d5c'
    && z.html.includes('data-action="fzoom-focus-back">并发任务') && z.html.includes('<span aria-current="page">')
    && z.html.indexOf('fl-zoom-near-flow') >= 0 && z.html.indexOf('data-flow-near-session="228a8697-2b7a-422a-b3c0-1cf61c965d5c"') >= 0
    && z.html.indexOf('class="fl-lane"') >= 0 && z.html.indexOf('fl-zoom-diff-board') < 0 && z.html.indexOf('data-flow-board="1"') < 0)
  z = await h({ action: 'fzoom-open', fields: { __el: { sid: 's-finished' } }, state: z.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('大流镜近观：沿用原流镜的正向时间顺序（用户在上、助手在下）', z.state.zoomMode === 'near'
    && z.html.indexOf('已完成的调研任务') >= 0 && z.html.indexOf('调研结论') > z.html.indexOf('已完成的调研任务'))
  z = await h({ action: 'fzoom-open', fields: { __el: { sid: '338a8697-2b7a-422a-b3c0-1cf61c965d6d' } }, state: z.state, root: ROOT, session: 's-finished' })
  check('大流镜：近观中切换会话仍保持近观', z.state.zoomMode === 'near'
    && z.state.zoomFocusSid === '338a8697-2b7a-422a-b3c0-1cf61c965d6d'
    && z.html.indexOf('data-flow-near-session="338a8697-2b7a-422a-b3c0-1cf61c965d6d"') >= 0
    && z.html.indexOf('fl-zoom-diff-board') < 0)
  z = await h({ action: 'fzoom-focus-back', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：从近观切回全景仍保留选中分支', z.state.zoomMode === 'panorama'
    && z.state.zoomFocusSid === '338a8697-2b7a-422a-b3c0-1cf61c965d6d'
    && z.html.indexOf('fl-zoom-motion-overview') >= 0 && countCards(z.html, 'data-action="fzoom-open"') === 4)
  z = await h({ action: 'fzoom-focus-current', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：尺度开关也能从全景切到当前 Session 的近观', z.state.zoomMode === 'near'
    && z.state.zoomFocusSid === '338a8697-2b7a-422a-b3c0-1cf61c965d6d' && z.html.indexOf('fl-zoom-near-flow') >= 0)
  z = await h({ action: 'fzoom-focus-back', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  // 单会话头部有大流镜入口
  z = await h({ action: 'fzoom', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：退出总览回单会话（头部带入口）', z.state.zoom === false && z.html.indexOf('data-action="fzoom"') >= 0)

  // 设置入口已迁到官方插件详情页；大流镜保留使用说明。
  z = await h({ action: 'fzoom', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：头部保留使用说明且不再重复显示设置入口', z.state.zoom === true
    && z.html.indexOf('data-action="fsettings"') < 0
    && z.html.includes('data-flow-disclosure="help"'))
  z = await h({ action: 'fzoom', fields: {}, state: z.state, root: ROOT, session: 's-main' }) // 退出，恢复后续用例形态

  // 默认观察尺度：多卡（并发组/血缘树）默认全景；单卡会话（普通/新会话）默认近观铺满完整流镜
  const lone = await h({ action: 'fzoom', fields: {}, state: null, root: ROOT, session: 's-live' })
  check('大流镜：单会话进入默认近观（全景仅一卡没有信息量）', lone.state.zoom === true
    && lone.state.zoomMode === 'near'
    && lone.html.indexOf('fl-zoom-near-flow') >= 0
    && lone.html.indexOf('data-flow-near-session="s-live"') >= 0
    && lone.html.indexOf('fl-zoom-motion-focus') >= 0)

  // 开工台（多代理并发开工）+ 会话互通（带入/发送）
  z = await h({ action: 'fzoom', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  z = await h({ action: 'fzoom-scope', fields: { __el: { scope: 'tree' } }, state: z.state, root: ROOT, session: 's-main' }) // 回到血缘树档
  check('大流镜：并发消息区默认折叠', z.state.zoomComposerOpen === false
    && z.html.indexOf('data-action="fzoom-composer" aria-expanded="false"') >= 0
    && z.html.indexOf('data-zoom-prompt') < 0)
  z = await h({ action: 'fzoom-composer', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：开工台（任务输入 + 模型/思考分支 + 同时开始，无选择会话按钮）', z.html.indexOf('data-zoom-prompt') >= 0
    && z.html.indexOf('data-zoom-lane') >= 0 && z.html.indexOf('data-zoom-effort') >= 0
    && z.html.indexOf('data-zoom-launch') >= 0 && z.html.indexOf('data-zoom-pickmode') < 0)
  check('大流镜：模型分支默认 2 条且含「默认（跟随当前）」档', countCards(z.html, 'data-zoom-lane="1"') === 2 && z.html.indexOf('默认（跟随当前）') >= 0)
  check('大流镜：开工按钮明确新建并发送的 Session 数', z.html.indexOf('⚡ 新建 2 个会话并发送') >= 0
    && z.html.indexOf('目标分支数') >= 0)
  let directLeaf = await h({ action: 'fzoom', fields: {}, state: null, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('大流镜：从侧栏直接进入叶子 Session 时近观可用', directLeaf.state.zoomMode === 'panorama'
    && directLeaf.state.zoomFocusSid === '228a8697-2b7a-422a-b3c0-1cf61c965d5c'
    && directLeaf.html.indexOf('data-action="fzoom-focus-current" title="用完整流镜查看当前选中分支" disabled') < 0
    && countCards(directLeaf.html, 'data-action="fzoom-open"') === 4
    && directLeaf.html.includes('class="fl-overview-source"') && directLeaf.html.includes('查看来源会话'))
  directLeaf = await h({ action: 'fzoom-view', fields: { __el: { view: 'detail' } }, state: directLeaf.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('大流镜：血缘树三分支可切换详细轮次对比', directLeaf.state.zoomView === 'detail'
    && directLeaf.html.indexOf('fl-zoom-diff-board') >= 0
    && countCards(directLeaf.html, 'fl-diff-session-head') === 3
    && directLeaf.html.indexOf('data-flow-main-card') >= 0)
  directLeaf = await h({ action: 'fzoom-focus-current', fields: {}, state: directLeaf.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('大流镜：侧栏叶子 Session 可实际切换近观', directLeaf.state.zoomMode === 'near'
    && directLeaf.html.indexOf('data-flow-near-session="228a8697-2b7a-422a-b3c0-1cf61c965d5c"') >= 0)
  const fleetIndex = JSON.stringify([
    { id: 's-fleet-1', title: '⚡ 你好 测试 · 分支 1/2 · deepseek-v4-flash', cwd: ROOT },
    { id: 's-fleet-2', title: '⚡ 你好 测试 · 分支 2/2 · glm-5.3-flash', cwd: ROOT },
    { id: 's-other', title: '其他可加入会话', cwd: ROOT },
  ])
  let namedFleet = await h({ action: 'fzoom', fields: { __flowSessionIndex: fleetIndex }, state: null, root: ROOT, session: 's-fleet-1' })
  check('大流镜：无血缘的 Harness 命名分支可恢复同组全景', namedFleet.state.zoomMode === 'panorama'
    && namedFleet.html.indexOf('data-flow-total="2"') >= 0
    && countCards(namedFleet.html, '<article class="fl-overview-card') === 2 && namedFleet.html.includes('fl-overview-conclusion')
    && namedFleet.html.indexOf('s-fleet-1') >= 0 && namedFleet.html.indexOf('s-fleet-2') >= 0)
  namedFleet = await h({ action: 'fzoom-view', fields: { __flowSessionIndex: fleetIndex, __el: { view: 'detail' } }, state: namedFleet.state, root: ROOT, session: 's-fleet-1' })
  check('大流镜：命名分支全景的精简/详细可实际切换', namedFleet.state.zoomView === 'detail'
    && namedFleet.html.indexOf('fl-compact-diff') < 0 && namedFleet.html.indexOf('data-flow-main-card') >= 0)
  namedFleet = await h({ action: 'fzoom-composer', fields: { __flowSessionIndex: fleetIndex }, state: namedFleet.state, root: ROOT, session: 's-fleet-1' })
  check('大流镜：已有分支组的发送区明确目标 Session', namedFleet.html.indexOf('⚡ 发送到当前 2 个会话') >= 0
    && namedFleet.html.indexOf('发送到当前 2 个会话') >= 0
    && namedFleet.html.indexOf('data-zoom-active-sids="s-fleet-1,s-fleet-2"') >= 0)
  check('大流镜：全景 N→N 续跑天然复用分支，不渲染「沿用当前会话」chip', namedFleet.html.indexOf('data-zoom-reuse') < 0)
  namedFleet = await h({ action: 'fzoom-focus-current', fields: { __flowSessionIndex: fleetIndex }, state: namedFleet.state, root: ROOT, session: 's-fleet-1' })
  check('大流镜：近观并发是当前 Session 的 1→N，不冒充全景 N→N 继续', namedFleet.state.zoomMode === 'near'
    && namedFleet.html.indexOf('⚡ 从当前会话发起 1→2') >= 0 && namedFleet.html.indexOf('data-zoom-active-sids=""') >= 0
    && namedFleet.html.indexOf('⚡ 发送到当前 2 个会话') < 0)
  check('大流镜：近观开工台保留输入与模型分支但不带看板标记（Client 由开工台回溯宿主根）',
    namedFleet.html.indexOf('data-zoom-prompt') >= 0 && namedFleet.html.indexOf('data-zoom-lane') >= 0
      && namedFleet.html.indexOf('data-flow-board') < 0)
  namedFleet = await h({ action: 'fzoom-reuse', fields: { __flowSessionIndex: fleetIndex }, state: namedFleet.state, root: ROOT, session: 's-fleet-1' })
  check('大流镜：近观开工台可开「沿用当前会话」（chip 回写 + 文案切换）', namedFleet.state.zoomReuse === true
    && namedFleet.html.indexOf('data-zoom-reuse="1"') >= 0 && namedFleet.html.indexOf('aria-pressed="true"') >= 0
    && namedFleet.html.indexOf('沿用当前会话 + 新建 1 个分支') >= 0
    && namedFleet.html.indexOf('这条消息将发送到当前会话，并派生 1 个新分支') >= 0)
  namedFleet = await h({ action: 'fzoom-reuse', fields: { __flowSessionIndex: fleetIndex }, state: namedFleet.state, root: ROOT, session: 's-fleet-1' })
  check('大流镜：「沿用当前会话」可关回（恢复纯派生 1→N 文案）', namedFleet.state.zoomReuse === false
    && namedFleet.html.indexOf('aria-pressed="false"') >= 0 && namedFleet.html.indexOf('⚡ 从当前会话发起 1→2') >= 0)
  // 近观「沿用当前会话」：linkSource 把新轮次接进来源会话所属历史（延长同一历史，不另起记录）；
  // 轮次 sids 允许包含来源会话本身（当前会话 = 分支 1）。
  let reuseSt = { live: true, follow: true, limit: 60, sid: 's-main', home: 's-main', expanded: null, crumbs: [], zoom: true, zoomScope: 'run', zoomRuns: [], zoomRunId: '', zoomRoundId: '' }
  reuseSt = (await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-main,s-live', meta: JSON.stringify({ prompt: '你好', sourceSids: ['s-main'], routes: ['', ''], efforts: ['', ''] }),
  } }, state: reuseSt, root: ROOT, session: 's-main' })).state
  const reuseRunId = reuseSt.zoomRunId
  reuseSt = (await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-main,s-fleet-1', meta: JSON.stringify({ prompt: '近观沿用 1→2', sourceSids: ['s-main'], linkSource: 's-main', routes: ['', ''], efforts: ['', ''] }),
  } }, state: reuseSt, root: ROOT, session: 's-main' })).state
  check('大流镜：近观沿用 1→N 延长同一条历史，当前会话保留为新一轮分支 1', reuseSt.zoomRuns.length === 1
    && reuseSt.zoomRunId === reuseRunId
    && reuseSt.zoomRuns[0].rounds.length === 3
    && reuseSt.zoomRuns[0].rounds[2].sids.join(',') === 's-main,s-fleet-1'
    && reuseSt.zoomRuns[0].rounds[2].sourceSids.join(',') === 's-main'
    && reuseSt.zoomRuns[0].rounds[2].prompt === '近观沿用 1→2')
  // 分支树导图：会话竖列 × 全部历史轮次——r2 只有 s-main（沿用）与 s-fleet-1（分叉），s-live 缺轮留空；
  // 沿用 = 同列竖边，分叉 = 来源斜边，首列从根任务出边；分叉新列插到来源列右侧。
  const reuseMap = await h({ action: 'fzoom-view', fields: { __el: { view: 'map' } }, state: reuseSt, root: ROOT, session: 's-main' })
  const mapX = (id) => { const m = reuseMap.html.match(new RegExp('data-map-node="' + id + '" data-map-default-x="(\\d+)"')); return m ? Number(m[1]) : -1 }
  check('大流镜导图：分支树覆盖全部轮次（沿用/分叉/缺轮各就其位）', reuseMap.state.zoomView === 'map'
    && reuseMap.html.indexOf('data-map-node="r1-s-main"') >= 0 && reuseMap.html.indexOf('data-map-node="r1-s-live"') >= 0
    && reuseMap.html.indexOf('data-map-node="r2-s-main"') >= 0 && reuseMap.html.indexOf('data-map-node="r2-s-fleet-1"') >= 0
    && reuseMap.html.indexOf('data-map-node="r2-s-live"') < 0
    && reuseMap.html.indexOf('· 3 个会话') >= 0)
  check('大流镜导图：沿用=同列竖边、分叉=来源斜边（首列从根任务出边）',
    reuseMap.html.indexOf('data-map-from="root" data-map-to="r1-s-main"') >= 0
      && reuseMap.html.indexOf('data-map-from="root" data-map-to="r1-s-live"') >= 0
      && reuseMap.html.indexOf('data-map-from="r1-s-main" data-map-to="r2-s-main"') >= 0
      && reuseMap.html.indexOf('data-map-from="r1-s-main" data-map-to="r2-s-fleet-1"') >= 0)
  check('大流镜导图：分叉的新列插到来源列右侧（s-fleet-1 位于 s-main 与 s-live 之间）',
    mapX('r2-s-fleet-1') > mapX('r1-s-main') && mapX('r2-s-fleet-1') < mapX('r1-s-live'))
  // Forks can inherit many log turns, including an identical earlier prompt.
  const prefixLength = MAIN_EVENTS.length
  MAIN_EVENTS.push(
    { seq: 901, time: 9000, type: 'user/message', data: { content: [{ type: 'text', text: '帮我看下这个目录' }], source: { kind: 'user' } } },
    { seq: 902, time: 9100, type: 'assistant/message', data: { turn: 7, step: 1, message: { content: [{ type: 'text', text: 'MAP_CURRENT_RESULT' }] }, stream: [] } },
  )
  const actualRoundState = structuredClone(reuseSt)
  actualRoundState.zoomRuns = [{ id: 'map-prefix', prompt: '帮我看下这个目录', rounds: [
    { id: 'prefix', kind: 'initial', at: 8999, prompt: '初始', sids: ['s-live'], sourceSids: [] },
    { id: 'actual', kind: 'round', at: 9200, prompt: '帮我看下这个目录', sids: ['s-main'], sourceSids: ['s-live'] },
  ] }]
  actualRoundState.zoomRunId = 'map-prefix'; actualRoundState.zoomRoundId = 'actual'
  const actualRoundMap = await h({ action: 'fzoom-view', fields: { __el: { view: 'map' } }, state: actualRoundState, root: ROOT, session: 's-main' })
  check('关系图按输入和提交时间匹配继承前缀后的真实轮次，分支锚点指向该回答', actualRoundMap.html.includes('MAP_CURRENT_RESULT') && actualRoundMap.html.includes('data-seq="902"') && !actualRoundMap.html.includes('<p>好的，我先并行读文件'))
  actualRoundMap.state.zoomRuns[0].rounds[1].prompt = '尚未发送的新任务'
  const missingRoundMap = await h({ action: 'fzoom-view', fields: { __el: { view: 'map' } }, state: actualRoundMap.state, root: ROOT, session: 's-main' })
  check('关系图缺少本轮输入时不借用旧回答或提供错误的分叉锚点', missingRoundMap.html.includes('本轮尚无完整回答') && !missingRoundMap.html.includes('从这里发起 1→'))
  MAIN_EVENTS.splice(prefixLength)
  const sourceOnlyRun = {
    id: 'run-source-only', at: 10, prompt: '来源会话并发', name: '来源会话并发', parentId: '', forkRoundId: '',
    rounds: [
      { id: 'source-initial', kind: 'initial', at: 9, prompt: '初始', sourceSids: [], sids: ['s-main'], routes: [''], efforts: [''] },
      { id: 'source-output', kind: 'round', at: 10, prompt: '输出', sourceSids: ['s-main'], sids: ['s-live'], routes: [''], efforts: [''] },
    ], sids: ['s-live'], routes: [''], efforts: [''],
  }
  let sourceNear = await h({ action: '__refresh', fields: {}, state: {
    live: true, follow: true, limit: 60, sid: 's-live', home: 's-main', expanded: null, crumbs: [],
    zoom: true, zoomScope: 'run', zoomMode: 'near', zoomFocusSid: 's-live', zoomLastFocusSid: 's-live',
    zoomBoundSessionId: 's-live', zoomRuns: [sourceOnlyRun], zoomRunId: 'run-source-only', zoomRoundId: 'source-output',
  }, root: ROOT, session: 's-main' })
  check('大流镜近观：当前 Session 仅是并发来源时仍显示其自身流镜', sourceNear.state.sid === 's-main'
    && sourceNear.state.zoomFocusSid === 's-main' && sourceNear.html.indexOf('data-flow-near-session="s-main"') >= 0
    && sourceNear.html.indexOf('帮我看下这个目录') >= 0 && sourceNear.html.indexOf('当前会话还没有事件') < 0)
  const memberRun = {
    id: 'run-member', at: 5, prompt: '所属并发', name: '所属并发', parentId: '', forkRoundId: '',
    rounds: [{ id: 'member-round', kind: 'round', at: 5, prompt: '成员轮', sourceSids: [], sids: ['s-main', '228a8697-2b7a-422a-b3c0-1cf61c965d5c'], routes: ['', ''], efforts: ['', ''] }],
    sids: ['s-main', '228a8697-2b7a-422a-b3c0-1cf61c965d5c'], routes: ['', ''], efforts: ['', ''],
  }
  let memberBinding = await h({ action: 'fzoom-scope', fields: { __el: { scope: 'run' } }, state: {
    ...sourceNear.state, zoomMode: 'panorama', zoomScope: 'tree', zoomRuns: [memberRun, sourceOnlyRun], zoomRunId: 'run-source-only', zoomRoundId: 'source-output', zoomBoundSessionId: '',
  }, root: ROOT, session: 's-main' })
  check('大流镜：当前 Session 的成员轮优先于更新的来源轮', memberBinding.state.zoomRunId === 'run-member'
    && memberBinding.state.zoomRoundId === 'member-round' && memberBinding.html.indexOf('data-zoom-active-sids="s-main,228a8697-2b7a-422a-b3c0-1cf61c965d5c"') >= 0)
  z = await h({ action: 'fzoom-lanes', fields: { __el: { count: '3' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：并发数支持 2/3/4，选择 3 后生成三条模型分支', z.state.zoomLanes.length === 3 && z.html.indexOf('⚡ 新建 3 个会话并发送') >= 0 && countCards(z.html, 'data-zoom-lane="1"') === 3
    && z.html.indexOf('data-action="fzoom-lanes" data-count="4"') >= 0)
  z = await h({ action: 'fzoom-lane', fields: { __el: { lane: '0' }, 'zoomLane.0': 'deepseek/reasoner-x' }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：模型切换后同一行显示该模型思考强度', z.state.zoomLanes[0] === 'deepseek/reasoner-x'
    && z.html.indexOf('思考：默认（high）') >= 0 && z.html.indexOf('>最高</option>') >= 0)
  z = await h({ action: 'fzoom-effort', fields: { __el: { lane: '0' }, 'zoomEffort.0': 'max' }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：思考强度回写分支状态', z.state.zoomEfforts[0] === 'max')
  z = await h({ action: 'fzoom-lanes', fields: { __el: { count: '2' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：并发数可切回 2', z.state.zoomLanes.length === 2)
  check('大流镜：卡头 ⇪ 带入按钮', z.html.indexOf('data-action="fzoom-relay"') >= 0)
  z = await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-main,228a8697-2b7a-422a-b3c0-1cf61c965d5c',
    meta: JSON.stringify({ prompt: '第一轮并发', routes: ['deepseek/reasoner-x', ''], efforts: ['max', ''], sourceSids: ['s-main'] }),
  } }, state: z.state, root: ROOT, session: 's-main' })
  const firstRunId = z.state.zoomRunId
  check('大流镜：一次同时开始形成独立批次且只显示本次 2 个会话', z.state.zoomScope === 'run'
    && z.state.zoomRuns.length === 1 && z.state.zoomRuns[0].sids.length === 2
    && z.state.zoomRuns[0].rounds.length === 2 && z.html.indexOf('1→2') >= 0
    && countCards(z.html, '<article class="fl-overview-card') === 2 && z.html.indexOf('第一轮并发') >= 0
    && z.html.indexOf('class="tb-row fl-zoom-logbar"') >= 0
    && z.html.indexOf('发送到当前 2 个会话') >= 0 && countCards(z.html, 'fl-zoom-current-session') === 2
    && z.html.indexOf('任务历史 · 1') >= 0)
  const archivedMemberId = '228a8697-2b7a-422a-b3c0-1cf61c965d5c'
  const archivedView = await h({ action: '__refresh', fields: {
    __flowArchivedSessionIds: JSON.stringify([archivedMemberId]),
    __flowSessionIndex: JSON.stringify([
      { id: 's-main', title: '主会话', cwd: ROOT },
      { id: archivedMemberId, title: '归档成员', cwd: ROOT },
    ]),
  }, state: JSON.parse(JSON.stringify(z.state)), root: ROOT, session: 's-main' })
  check('归档 Session：从并发成员、会话索引与大流镜渲染中统一排除', archivedView.state.zoomRuns[0].sids.length === 1
    && !archivedView.state.zoomRuns[0].sids.includes(archivedMemberId)
    && archivedView.html.indexOf(archivedMemberId) < 0 && archivedView.html.indexOf('归档成员') < 0)
  const addSessionIndex = JSON.stringify([
    { id: 's-main', title: '主会话', cwd: ROOT },
    { id: '228a8697-2b7a-422a-b3c0-1cf61c965d5c', title: '并发成员', cwd: ROOT },
    { id: 's-other', title: '其他可加入会话', cwd: ROOT },
  ])
  z = await h({ action: '__refresh', fields: { __flowSessionIndex: addSessionIndex }, state: z.state, root: ROOT, session: 's-main' })
  check('当前并发：发送区提供与带入会话同款的 Session 树选择入口', z.html.indexOf('添加其他 Session') >= 0
    && z.html.indexOf('data-zoom-add-picker="1"') >= 0)
  z = await h({ action: 'fzoom-view', fields: { __el: { view: 'detail' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：详细模式按普通流镜卡片渲染每轮每个会话', z.state.zoomView === 'detail'
    && z.html.indexOf('fl-zoom-diff-board') >= 0 && countCards(z.html, 'data-flow-detail-session=') >= 2
    && z.html.indexOf('class="fl-lane"') >= 0 && z.html.indexOf('data-flow-main-card') >= 0)
  check('大流镜：Git diff 式轮次横排对齐 + 单一共享滚动 + 本轮分支入口', z.html.indexOf('fl-zoom-diff-scroll') >= 0
    && z.html.indexOf('fl-diff-gutter') >= 0 && z.html.includes('未对齐 · 缺少同源输入证据')
    && z.html.indexOf('fl-diff-branch') >= 0)
  check('没有同源证据的轮次不宣称差异已对齐', z.html.includes('未对齐') && !z.html.includes('fl-diff-shared-input'))
  z = await h({ action: 'fzoom-view', fields: { __el: { view: 'compact' } }, state: z.state, root: ROOT, session: 's-main' })
  check('概览枚举保留 compact 且显示分支最新结果', z.state.zoomView === 'compact' && z.html.includes('fl-overview-list') && z.html.includes('最新结论') && !z.html.includes('fl-zoom-diff-board'))
  check('概览直接显示执行过程并声明正常时间方向', z.html.includes('最近执行过程') && z.html.includes('fl-zoom-step') && z.html.includes('tb-pane-body tb-pane-col'))
  z = await h({ action: 'fzoom-composer', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  z = await h({ action: 'fzoom-composer-close', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  const closedAgain = await h({ action: 'fzoom-composer-close', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('发送成功关闭开工区是幂等操作且保留当前任务', !z.state.zoomComposerOpen && !closedAgain.state.zoomComposerOpen && z.state.zoomRunId === closedAgain.state.zoomRunId && !z.html.includes('class="fl-zoom-composer"'))
  z = await h({ action: 'fzoom-view', fields: { __el: { view: 'map' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：导图保留拓扑但无匹配输入时不提供错误的 1→N 入口', z.state.zoomView === 'map'
    && z.html.indexOf('data-flow-view="map"') >= 0 && z.html.indexOf('data-flow-mindmap="1"') >= 0 && z.html.indexOf('data-map-node=') >= 0
    && z.html.indexOf('fl-map-turn-label') >= 0 && z.html.indexOf('<path data-map-from=') >= 0
    && z.html.indexOf('data-map-node="root" data-map-default-x=') >= 0 && z.html.indexOf('data-map-default-y="24"') >= 0
    && z.html.indexOf(' L ') >= 0
    && z.html.indexOf('从这里发起 1→2') < 0 && z.html.includes('本轮尚无完整回答') && z.html.includes('data-map-reset="1"') && z.html.includes('data-map-fit="1"'))
  z = await h({ action: 'fzoom-view', fields: { __el: { view: 'compact' } }, state: z.state, root: ROOT, session: 's-main' })
  z = await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-live', meta: JSON.stringify({ prompt: '第二轮并发', routes: [''], efforts: [''] }),
  } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：新批次不与旧批次合并并生成并发记录', z.state.zoomRuns.length === 2
    && countCards(z.html, '<article class="fl-overview-card') === 1
    && z.html.indexOf('任务历史 · 2') >= 0
    && z.html.indexOf('大流镜 B ·') < 0)
  const secondRunId = z.state.zoomRunId
  z = await h({ action: 'fzoom-scope', fields: { __el: { scope: 'run' } }, state: z.state, root: ROOT, session: 's-main' })
  check('本次并发：切到当前选中分支相关历史的最新一轮', z.state.zoomRunId === firstRunId
    && z.state.zoomRoundId === z.state.zoomRuns[0].rounds[z.state.zoomRuns[0].rounds.length - 1].id)
  z = await h({ action: 'fzoom-run', fields: { __el: { run: secondRunId } }, state: z.state, root: ROOT, session: 's-main' })
  z = await h({ action: 'fzoom-run-add', fields: { __el: { sid: 's-main' } }, state: z.state, root: ROOT, session: 's-main' })
  check('当前并发：可显式添加其他 Session（无需切换当前会话，最多 4 个）', z.state.zoomRuns[1].sids.includes('s-main') && z.state.zoomRuns[1].sids.length === 2)
  z = await h({ action: 'fzoom-run-remove', fields: { __el: { sid: 's-main' } }, state: z.state, root: ROOT, session: 's-main' })
  check('当前并发：可移除成员并保持至少一个', !z.state.zoomRuns[1].sids.includes('s-main') && z.state.zoomRuns[1].sids.length === 1)
  z = await h({ action: 'fzoom-history', fields: {}, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜历史：按需打开侧边栏 tree，不常驻占用画布高度', z.state.zoomHistoryOpen === true
    && z.html.indexOf('fl-zoom-history-drawer') >= 0 && z.html.indexOf('fl-zoom-history-tree') >= 0
    && z.html.indexOf('aria-expanded="false"') >= 0 && z.html.indexOf('fl-history-round-node') < 0
    && z.html.indexOf('⚡ 第二轮并发') >= 0 && z.html.indexOf('⚡ 大流镜 B') < 0)
  z = await h({ action: 'fzoom-history-toggle', fields: { __el: { run: firstRunId } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜历史：右三角点击后变下三角并展开轮次/对话', z.state.zoomExpandedHistories.includes(firstRunId)
    && z.html.indexOf('aria-expanded="true"') >= 0 && z.html.indexOf('fl-history-round-node') >= 0)
  z = await h({ action: 'fzoom-run', fields: { __el: { run: firstRunId } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：可从记录切回第一次并发', z.state.zoomRunId === firstRunId
    && countCards(z.html, '<article class="fl-overview-card') === 2 && z.html.indexOf('第一轮并发') >= 0)
  const restoredTask = await h({ action: '', fields: { __flowZoomLog: JSON.stringify({ scope: 'run', open: true, activeId: z.state.zoomRunId, roundId: z.state.zoomRoundId, view: 'compact', mode: 'panorama', runs: z.state.zoomRuns }) }, state: null, root: ROOT, session: 's-main' })
  check('面板重挂后保持当前任务范围而非退回整棵会话树', restoredTask.state.zoomScope === 'run' && countCards(restoredTask.html, '<article class="fl-overview-card') === 2)
  z = await h({ action: 'fzoom-open', fields: { __el: { run: firstRunId, sid: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' } }, state: z.state, root: ROOT, session: 's-main' })
  z = await h({ action: 'fzoom-focus-back', fields: {}, state: z.state, root: ROOT, session: '228a8697-2b7a-422a-b3c0-1cf61c965d5c' })
  check('大流镜：跟随分支后缩小仍恢复原并发的全部分支', z.state.zoomRunId === firstRunId
    && z.state.zoomMode === 'panorama' && z.state.zoomFocusSid === '228a8697-2b7a-422a-b3c0-1cf61c965d5c'
    && countCards(z.html, '<article class="fl-overview-card') === 2)
  z = await h({ action: 'fzoom-open', fields: { __el: { run: secondRunId, sid: 's-live' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：从当前并发对话项内嵌所属流镜', z.state.zoomRunId === secondRunId
    && z.state.sid === 's-live' && z.state.zoom === true && z.state.zoomFocusSid === 's-live'
    && z.navigateSession && z.navigateSession.sessionId === 's-live')
  z = await h({ action: 'fzoom-relay', fields: { __el: { sid: 's-main' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：⇪ 带入取源会话最新助手结论（带来源前缀）', z.zoomRelay && z.zoomRelay.sourceSessionId === 's-main'
    && z.zoomRelay.text.indexOf('来自会话') >= 0 && z.zoomRelay.text.indexOf('子代理已启动') >= 0)
  const zNoRelay = await h({ action: 'fzoom-relay', fields: { __el: { sid: 's-live' } }, state: z.state, root: ROOT, session: 's-main' })
  check('大流镜：无助手结论的会话带入明确报错', zNoRelay.ok === false && zNoRelay.error.indexOf('结论') >= 0)

  // 拓扑历史 A/B/C：A 先沿最新轮延长；从 A 旧轮派生 B；A 已有子历史后再从最新轮派生 C。
  let topo = { ...z.state, zoomRuns: [], zoomRunId: '', zoomRoundId: '', zoomFocusSid: '', zoomHistoryOpen: false }
  topo = (await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-main,228a8697-2b7a-422a-b3c0-1cf61c965d5c', meta: JSON.stringify({ prompt: 'A 第一轮', sourceSids: ['s-main'], routes: ['', ''], efforts: ['', ''] }),
  } }, state: topo, root: ROOT, session: 's-main' })).state
  const topoA = topo.zoomRuns[0]
  const aRound1 = topoA.rounds[topoA.rounds.length - 1]
  topo = (await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-main,228a8697-2b7a-422a-b3c0-1cf61c965d5c', meta: JSON.stringify({ prompt: 'A 第二轮', sourceSids: aRound1.sids, baseHistoryId: topoA.id, baseRoundId: aRound1.id, routes: ['', ''], efforts: ['', ''] }),
  } }, state: topo, root: ROOT, session: 's-main' })).state
  const aRound2 = topo.zoomRuns[0].rounds[topo.zoomRuns[0].rounds.length - 1]
  check('拓扑历史 A：沿最新轮继续时延长同一历史', topo.zoomRuns.length === 1 && topo.zoomRuns[0].rounds.length === 3)
  topo = (await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-main,228a8697-2b7a-422a-b3c0-1cf61c965d5c', meta: JSON.stringify({ prompt: 'B 新一轮', sourceSids: ['s-main'], baseHistoryId: topoA.id, baseRoundId: aRound1.id, routes: ['', ''], efforts: ['', ''] }),
  } }, state: topo, root: ROOT, session: 's-main' })).state
  topo = (await h({ action: 'fzoom-joined', fields: { __el: {
    sids: 's-main,228a8697-2b7a-422a-b3c0-1cf61c965d5c', meta: JSON.stringify({ prompt: 'C 新一轮', sourceSids: aRound2.sids, baseHistoryId: topoA.id, baseRoundId: aRound2.id, routes: ['', ''], efforts: ['', ''] }),
  } }, state: topo, root: ROOT, session: 's-main' })).state
  await h({ action: 'fzoom-history', fields: {}, state: topo, root: ROOT, session: 's-main' })
  const topoShape = (history) => {
    const nums = [history.rounds[0].sids.length]
    for (const round of history.rounds.slice(1)) {
      const source = round.sourceSids.length || nums[nums.length - 1]
      if (source !== nums[nums.length - 1]) nums.push(source)
      nums.push(round.sids.length)
    }
    return nums.join('→')
  }
  check('拓扑历史 B/C：旧轮与最新轮派生产生不同继承形态', topo.zoomRuns.length === 3
    && topo.zoomRuns.map((x) => x.name).join(',') === '大流镜 A,大流镜 B,大流镜 C'
    && topoShape(topo.zoomRuns[1]) === '1→2→1→2' && topoShape(topo.zoomRuns[2]) === '1→2→2→2',
  JSON.stringify(topo.zoomRuns.map((x) => ({ name: x.name, parentId: x.parentId, rounds: x.rounds.map((r) => ({ source: r.sourceSids.length, out: r.sids.length })) }))))

  // 搜索范围、标记定位、只读回放及有证据的对比。
  let search = await h({ action: 'fsearch', fields: { flowSearch: 'long-001', flowSearchScope: 'loaded' }, state: null, root: ROOT, session: 's-long' })
  check('已加载搜索不会暗中扩大历史窗口', search.html.includes('没有匹配的节点') && search.html.includes('当前已加载节点 · 已检查 60 项'))
  search = await h({ action: 'fsearch', fields: { flowSearch: 'LONG-001', flowSearchScope: 'all' }, state: search.state, root: ROOT, session: 's-long' })
  check('全会话搜索可定位首屏之外的节点且不区分大小写', search.html.includes('data-flow-main-card="1"') && search.html.includes('全会话已记录日志 · 已检查 130 项 · 命中 1 项'))
  search = await h({ action: 'fsearch-clear', fields: {}, state: search.state, root: ROOT, session: 's-long' })
  check('清除筛选恢复分页窗口', search.state.flowSearch === '' && search.html.includes('data-flow-visible="60"') && search.html.includes('data-flow-has-older="1"'))
  const failedOnly = await h({ action: 'ffilter', fields: { flowStatus: 'failed', flowSearchScope: 'all' }, state: null, root: ROOT, session: 's-fail-attempt' })
  check('失败筛选与需要关注入口保留真实错误', failedOnly.html.includes('PI_AI_ERROR') && failedOnly.html.includes('需要关注 · 1 项失败') && failedOnly.state.flowStatus === 'failed')
  const roleOnly = await h({ action: 'ffilter', fields: { flowRole: 'call' }, state: null, root: ROOT, session: 's-main' })
  check('类型筛选只显示工具且保留工具稳定身份', !roleOnly.html.includes('data-flow-role="ai"') && roleOnly.html.includes('data-flow-node-key="s-main|call|3"'))
  const bookmark = await h({ action: 'fbookmark-jump', fields: { __el: { sid: 's-long', kind: 'msg', seq: '1' }, __flowBookmarks: JSON.stringify([{ sessionId: 's-long', kind: 'msg', seq: 1, note: '重要起点' }]) }, state: null, root: ROOT, session: 's-main' })
  check('标记恢复准确会话、节点类型、历史窗口与详情', bookmark.state.sid === 's-long' && bookmark.state.expanded === 1 && bookmark.state.limit >= 130
    && bookmark.html.includes('data-flow-inspector="1"') && bookmark.html.includes('data-node-key="s-long|msg|1"') && bookmark.html.includes('class="fl-bookmark-btn is-bookmarked"'))
  const invalidBookmark = await h({ action: 'fbookmark-jump', fields: { __el: { sid: 's-long', kind: 'call', seq: '1' } }, state: null, root: ROOT, session: 's-main' })
  check('节点类型不匹配时解释标记失效而不误开同 seq 消息', invalidBookmark.state.sid === 's-main' && invalidBookmark.html.includes('此标记的节点已不可用'))
  let replay = await h({ action: 'freplay', fields: { flowReplaySeq: '3' }, state: null, root: ROOT, session: 's-main',
    live: liveOverlay('s-main', 999, [attempt('future-attempt', 9, 9, 999, 9999, 10000, { text: '未来实时秘密内容' })]) })
  check('回放只使用事件前缀，不泄露未来工具结果或实时内容', replay.html.includes('data-flow-replay-active="1"') && replay.html.includes('data-flow-node-key="s-main|call|3"')
    && !replay.html.includes('file a content') && !replay.html.includes('未来实时秘密内容') && !replay.html.includes('data-flow-branch') && !replay.html.includes('data-flow-timer'))
  replay = await h({ action: 'fcontext', fields: { __el: { seqs: '3,7' } }, state: replay.state, root: ROOT, session: 's-main' })
  check('回放框选导出也不带入未来消息或工具结果', replay.flowContext.seqs.join(',') === '3' && !replay.flowContext.text.includes('file a content') && !replay.flowContext.text.includes('再派个子代理调研'))
  replay = await h({ action: 'freplay', fields: { flowReplaySeq: '10' }, state: replay.state, root: ROOT, session: 's-main' })
  check('回放不会读取子代理当前日志', !replay.html.includes('child hits') && !replay.html.includes('我开始调研') && !replay.html.includes('data-action="fenter"'))
  replay = await h({ action: 'freplay', fields: { flowReplaySeq: '10', __el: { step: '-1' } }, state: replay.state, root: ROOT, session: 's-main' })
  check('回放逐事件定位边界', replay.state.replaySeq === 9)
  replay = await h({ action: 'freplay-live', fields: {}, state: replay.state, root: ROOT, session: 's-main' })
  check('返回最新恢复完整流程与分支操作', replay.state.replaySeq === null && replay.html.includes('file a content') && replay.html.includes('data-flow-branch'))
  const comparisonEvents = (input, result) => [
    { seq: 1, time: 1000, type: 'user/message', data: { content: [{ type: 'text', text: input }], source: { kind: 'user' } } },
    { seq: 2, time: 1010, type: 'turn/start', data: { turn: 1 } },
    { seq: 3, time: 1020, type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: result }] }, stream: [] } },
    { seq: 4, time: 1030, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  SESSIONS['s-align-a'] = comparisonEvents('同源输入完整内容', '同一个结论')
  SESSIONS['s-align-b'] = comparisonEvents('同源输入完整内容', '同一个结论')
  let aligned = await h({ action: 'fzoom-joined', fields: { __el: { sids: 's-align-a,s-align-b', meta: JSON.stringify({ prompt: '对比任务' }) } }, state: null, root: ROOT, session: 's-align-a' })
  const alignedRunId = aligned.state.zoomRunId
  const alignedRoundId = aligned.state.zoomRoundId
  aligned = await h({ action: 'fzoom-view', fields: { __el: { view: 'detail' } }, state: aligned.state, root: ROOT, session: 's-align-a' })
  check('相同完整输入支持可靠对齐且只显示一次共享输入', countCards(aligned.html, 'class="fl-diff-shared-input"') === 1 && aligned.html.includes('共享输入 · 已对齐')
    && !aligned.html.includes('data-flow-role="user"') && countCards(aligned.html, 'data-flow-conclusion="1"') === 2)
  aligned = await h({ action: 'fdifferences', fields: {}, state: aligned.state, root: ROOT, session: 's-align-a' })
  check('仅看差异隐藏完全相同且已对齐的轮次', aligned.state.flowDifferences === true && !aligned.html.includes('class="fl-diff-gutter'))
  SESSIONS['s-unaligned-a'] = comparisonEvents('长输入'.repeat(80) + 'A', '一样的结果')
  SESSIONS['s-unaligned-b'] = comparisonEvents('长输入'.repeat(80) + 'B', '一样的结果')
  let unaligned = await h({ action: 'fzoom-joined', fields: { __el: { sids: 's-unaligned-a,s-unaligned-b', meta: '{}' } }, state: null, root: ROOT, session: 's-unaligned-a' })
  unaligned = await h({ action: 'fzoom-view', fields: { __el: { view: 'detail' } }, state: unaligned.state, root: ROOT, session: 's-unaligned-a' })
  check('截断预览相同不会被误判为同源输入', unaligned.html.includes('未对齐 · 缺少同源输入证据') && !unaligned.html.includes('class="fl-diff-shared-input"'))
  const recovered = await h({ action: 'fzoom-run-add', fields: { __el: { sid: 's-main', run: alignedRunId, round: alignedRoundId, route: 'deepseek/reasoner-x' } }, state: aligned.state, root: ROOT, session: 's-align-a' })
  check('恢复发送可向指定已有轮次补入成功会话', recovered.state.zoomRuns.find((run) => run.id === alignedRunId).rounds.find((round) => round.id === alignedRoundId).sids.includes('s-main')
    && recovered.state.zoomRuns.length === 1)
  const invalidRecovery = await h({ action: 'fzoom-run-add', fields: { __el: { sid: 's-main', run: 'missing-run', round: alignedRoundId } }, state: recovered.state, root: ROOT, session: 's-align-a' })
  check('恢复轮次失效时拒绝静默添加到另一轮', invalidRecovery.ok === false && invalidRecovery.error.includes('恢复目标轮次已不可用'))
  const completed = await h({ action: 'fcontext', fields: { __el: { seqs: '3', requireCompleted: '1' } }, state: null, root: ROOT, session: 's-align-a' })
  check('结论读取必须准确命中一个已完成助手节点', completed.ok && completed.flowContext.seqs.join(',') === '3' && completed.flowContext.text.includes('同一个结论'))
  const staleConclusion = await h({ action: 'fcontext', fields: { __el: { seqs: '999', requireCompleted: '1' } }, state: null, root: ROOT, session: 's-align-a' })
  check('失效结论不以空上下文标题冒充成功摘录', staleConclusion.ok === false && staleConclusion.error.includes('所选结论已不可用'))
  const userConclusion = await h({ action: 'fcontext', fields: { __el: { seqs: '1', requireCompleted: '1' } }, state: null, root: ROOT, session: 's-align-a' })
  check('结论接口拒绝用户输入节点', userConclusion.ok === false)
  const failedConclusion = await h({ action: 'fcontext', fields: { __el: { seqs: '4', requireCompleted: '1' } }, state: null, root: ROOT, session: 's-fail-attempt' })
  check('结论接口拒绝失败助手节点', failedConclusion.ok === false)
  const plainState = (value) => !value || (Object.getOwnPropertyNames(value).every((key) => Object.prototype.propertyIsEnumerable.call(value, key) && !key.startsWith('__')))
  check('正常与早返回错误 state 清理全部临时私有字段以满足 losslessJSON wire',
    [completed, staleConclusion, invalidRecovery, bookmark, invalidBookmark].every((result) => plainState(result.state)))
  const { projectFlowItems, durableProjectionCache } = ctx.__projectionTest
  durableProjectionCache.clear()
  const cacheEvents = comparisonEvents('缓存输入', '缓存结果')
  const log = { events: cacheEvents, count: cacheEvents.length, changed: false }
  let projection = projectFlowItems('cache', log, null, null)
  const initialCache = durableProjectionCache.get('cache')
  projection.find((item) => item.role === 'ai').preview = '仅修改本次渲染'
  projection = projectFlowItems('cache', log, null, null)
  check('未变化 durable projection 命中缓存且调用者修改不污染后续结果', durableProjectionCache.get('cache') === initialCache && projection.find((item) => item.role === 'ai').preview === '缓存结果')
  cacheEvents.push({ seq: 5, time: 1040, type: 'user/message', data: { content: [{ type: 'text', text: '新追加输入' }], source: { kind: 'user' } } })
  projection = projectFlowItems('cache', { ...log, count: 5 }, null, null)
  check('追加事件使 projection 缓存失效', projection.some((item) => item.full === '新追加输入') && durableProjectionCache.get('cache') !== initialCache)
  cacheEvents[2].data.message.content[0].text = '同数组同计数的修改'
  projection = projectFlowItems('cache', { ...log, count: 5 }, null, null)
  check('changed=false 的同数组原地修改不会返回旧结果', projection.some((item) => item.full === '同数组同计数的修改'))
  const sameCountReplacement = structuredClone(cacheEvents)
  sameCountReplacement[2].data.message.content[0].text = '相同计数的新数组'
  projection = projectFlowItems('cache', { events: sameCountReplacement, count: 5, changed: false }, null, null)
  check('相同计数的新 durable 数组使缓存失效', projection.some((item) => item.full === '相同计数的新数组'))
  const beforeChanged = durableProjectionCache.get('cache')
  projectFlowItems('cache', { events: sameCountReplacement, count: 5, changed: true }, null, null)
  check('reader changed=true 明确使缓存失效', durableProjectionCache.get('cache') !== beforeChanged)
  projection = projectFlowItems('cache', { events: sameCountReplacement, count: 5, changed: false }, null, 2)
  check('回放游标改变不会复用未来结论', !projection.some((item) => item.role === 'ai'))
  projection = projectFlowItems('cache', { events: sameCountReplacement, count: 5, changed: false }, null, null)
  check('退出回放重建完整 durable projection', projection.some((item) => item.full === '相同计数的新数组'))
  const liveLog = { events: LIVE_PREFIX_EVENTS, count: LIVE_PREFIX_EVENTS.length, changed: false }
  projectFlowItems('cache-live', liveLog, null, null)
  const durableOnly = durableProjectionCache.get('cache-live')
  projection = projectFlowItems('cache-live', liveLog, liveOverlay('cache-live', 1, [attempt('cache-att', 1, 1, 3.5, 3030, 3040, { text: '实时增长' })]), null)
  check('live overlay 绕过缓存并保留原 durable 缓存', projection.some((item) => item.full === '实时增长') && durableProjectionCache.get('cache-live') === durableOnly)
  const rawLiveEvents = LIVE_PREFIX_EVENTS.concat([{ seq: 4, time: 3040, type: 'assistant/live-chunk', data: { attemptId: 'raw-cache', turn: 1, step: 1, chunk: { type: 'text-delta', text: '原始瞬时内容' } } }])
  projectFlowItems('raw-live-cache', { events: rawLiveEvents, count: rawLiveEvents.length, changed: false }, null, null)
  check('含瞬时chunk及Date.now回退的日志不缓存', !durableProjectionCache.has('raw-live-cache'))
  for (let i = 0; i < 17; i++) projectFlowItems('scope-' + i, log, null, null)
  check('durable projection 缓存限制16个会话并驱逐旧scope', durableProjectionCache.size === 16 && !durableProjectionCache.has('scope-0') && durableProjectionCache.has('scope-16'))
  let cachedRules = await h({ action: '', fields: {}, state: null, root: ROOT, session: 's-default-presentation-rules' })
  cachedRules = await h({ action: 'ftoggle-rule', fields: { __el: { index: '0' } }, state: cachedRules.state, root: ROOT, session: 's-default-presentation-rules' })
  check('展示规则变化不被durable缓存遮蔽', !cachedRules.html.includes('<span class="fl-name">Git status</span>') && cachedRules.html.includes('<span class="fl-name">pwsh</span>'))

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('仿真异常:', e); process.exit(2) })
