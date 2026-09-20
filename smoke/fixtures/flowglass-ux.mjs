// Synthetic, local-only fixtures. The renderer and CSS are loaded from product source.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const text = (value) => [{ type: 'text', text: value }]
const event = (seq, type, data) => ({ seq, time: 1800000000000 + seq * 100, type, data })
const user = (seq, value, source = 'user') => event(seq, 'user/message', { content: text(value), source: { kind: source } })
const answer = (seq, value, step = seq) => event(seq, 'assistant/message', { turn: 1, step, message: { content: text(value) }, stream: [], usage: { outputTokens: 42 } })
const call = (seq, name, id, args) => event(seq, 'tool/call', { turn: 1, step: 2, name, callId: id, arguments: JSON.stringify(args) })
const result = (seq, id, value, failed = false) => event(seq, 'tool/result', { message: { content: [{ type: 'tool-result', toolCallId: id, isError: failed, content: text(value) }] } })
const childId = '228a8697-2b7a-422a-b3c0-1cf61c965d5c'
const normal = [
  user(1, '请检查窄侧栏内的中文长标题与执行结果，并保留现有分支历史。'),
  user(2, '测试用系统上下文：仅包含虚构文件与示例路径。', 'system'),
  answer(3, '先读取配置与样式，再核对执行结果。'),
  call(4, 'read', 'read-demo', { file_path: 'src/example-with-a-long-file-name.ts' }),
  call(5, 'grep', 'grep-demo', { pattern: 'container-query-and-accessible-controls' }),
  result(6, 'read-demo', '配置读取成功。' + ' VeryLongUnbrokenIdentifier'.repeat(8) + '\n' + Array.from({ length: 80 }, (_, i) => `输出第 ${i + 1} 行：synthetic local-only result`).join('\n')),
  result(7, 'grep-demo', '找到 3 处匹配，均为脱敏测试数据。'),
  answer(8, '检查完成：标题与结果应清晰可读，工具详情保留输入和输出。\n\n```ts\n' + 'const longIdentifier = "synthetic-output";'.repeat(12) + '\n```'),
]
const failed = [user(1, '运行测试并解释失败原因。'), call(2, 'bash', 'failed-demo', { command: 'npm run example-check' }), result(3, 'failed-demo', '示例检查失败：预期值与实际结果不同。', true), event(4, 'assistant/attempt', { turn: 1, step: 3, stream: [{ type: 'text-chunks', time0: 1800000000400, index: 0, dt: [], texts: ['正在整理失败原因'] }, { type: 'chunk', time: 1800000000450, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'FIXTURE_ERROR', message: '模拟连接中断' } } } }] }), event(5, 'turn/end', { turn: 1, reason: { kind: 'error' } })]
const running = [user(1, '继续读取并等待工具结果。'), answer(2, '正在读取示例目录。'), call(3, 'read', 'running-demo', { file_path: 'src/example.ts' })]
const subagent = [...normal.slice(0, 3), call(4, 'subagent', 'child-demo', { description: '核对可访问性与键盘操作', prompt: '仅检查虚构示例' }), result(5, 'child-demo', 'started subagent ' + childId), answer(6, '子代理已启动，正在核对键盘路径。')]
const retry = [user(1, '重试一次失败的生成。'), event(2, 'turn/start', { turn: 1 }), event(3, 'step/start', { turn: 1, step: 1 }), event(4, 'assistant/attempt', { turn: 1, step: 1, stream: [{ type: 'chunk', time: 1800000000400, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'FIXTURE_RETRY', message: '模拟暂时不可用' } } } }] }), event(5, 'llm/retry', { retryId: 'fixture-retry', turn: 1, step: 1, retry: 1, maxRetries: 3, delayMs: 60000, failure: { code: 'FIXTURE_RETRY', message: '模拟暂时不可用' } })]
export const fixtureNames = ['empty', 'normal', 'running', 'failed', 'retry', 'subagent', 'long', 'concurrent', 'compare', 'map', 'detail', 'composer']

export async function createFixtureRenderer({ ref = '' } = {}) {
  const sourceHashes = {}
  const read = (relative) => {
    const source = ref
      ? execFileSync('git', ['show', `${ref}:${relative}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
      : fs.readFileSync(path.join(root, relative), 'utf8')
    sourceHashes[relative] = createHash('sha256').update(source).digest('hex')
    return source
  }
  const client = read('plugins/toolbox/client.js')
  const start = client.indexOf('const toolboxCss = [')
  const end = client.indexOf("].join('\\n')", start)
  if (start < 0 || end < 0) throw new Error('Unable to locate product toolboxCss array')
  const css = new Function(client.slice(start, end + "].join('\\n')".length) + '; return toolboxCss')()
  const entries = { empty: [], normal, running, failed, retry, subagent, long: Array.from({ length: 1200 }, (_, i) => i % 2 ? answer(i + 1, `历史结论 ${i + 1}：分页仅显示最近节点。`) : user(i + 1, `历史问题 ${i + 1}：用于测量，不读取真实日志。`)), [childId]: [answer(1, '已检查聚焦和激活语义。'), call(2, 'grep', 'child-read', { pattern: 'tabindex' })] }
  for (let i = 1; i <= 4; i++) entries['branch-' + i] = i === 2 ? failed : [user(1, '比较同一输入的分支结果。'), answer(2, `分支 ${i}：${'示例中文结果与 English summary '.repeat(i)}`)]
  const headers = Object.fromEntries(Object.keys(entries).map((id) => [id, { id, cwd: root, title: id === 'normal' ? '窄侧栏与分支历史的脱敏检查任务' : '测试会话 · ' + id }]))
  headers[childId] = { ...headers[childId], origin: 'subagent', parentSession: 'subagent', delegationDepth: 1 }
  const isRunning = (id) => ['running', 'retry', childId, 'branch-3'].includes(id)
  const record = (id) => ({ header: headers[id], live: isRunning(id), persisted: true })
  let handler
  const ctx = {
    get(name) {
      if (name === 'sessionQuery') return { async readSession(id) { return { session: headers[id], header: headers[id], events: entries[id] || [] } }, async listSessions() { return Object.keys(entries).map(record) }, async traceSession(id) { return { target: record(id), root: record(id), complete: true, descendants: id === 'normal' ? [1, 2, 3, 4].map((n) => ({ session: record('branch-' + n), descendants: [] })) : id === 'subagent' ? [{ session: record(childId), descendants: [] }] : [] } } }
      if (name === 'sessions') return { get(id) { return isRunning(id) ? { id, header: headers[id], events: entries[id], isRunning: true } : undefined }, list() { return Object.keys(entries).filter(isRunning).map((id) => ({ id, header: headers[id], isRunning: true })) } }
      if (name === 'toolboxRegistry') return { register(_descriptor, fn) { handler = fn; return () => {} } }
      if (name === 'sandboxPolicy') return { workspaceRoot: root }
      if (name === 'llm') return { async listProviders() { return [] }, async listModels() { return [] } }
      return undefined
    },
    on() {}, effect() {}, interval(fn) { try { fn() } catch {} return () => {} }, timeout() { return () => {} },
  }
  const source = ['shared/runtime.js', 'shared/host.js', 'plugins/flow/tool.js'].map(read).join('\n')
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + source + '\n})()')(ctx, undefined, console)
  await plugin.apply(ctx)
  if (!handler) throw new Error('Actual Host did not register flow handler')
  return {
    css, sourceHashes,
    sessionRows: Object.fromEntries(Object.entries(headers).map(([id, header]) => [id, { ...header, live: isRunning(id), isRunning: isRunning(id) }])),
    dispatch: (request) => handler({ action: '', fields: {}, state: null, root, session: 'normal', ...request }),
    async render(name) {
      if (!fixtureNames.includes(name)) throw new Error('Unknown fixture: ' + name)
      const session = ['concurrent', 'compare', 'map', 'detail', 'composer'].includes(name) ? 'normal' : name
      const request = { action: '', fields: {}, state: null, root, session }
      let output = await handler(request)
      if (['concurrent', 'compare', 'map', 'composer'].includes(name)) {
        output = await handler({ ...request, action: 'fzoom', state: output.state })
        if (name === 'map') output = await handler({ ...request, action: 'fzoom-joined', state: output.state, fields: { __el: { sids: 'branch-1,branch-2,branch-3,branch-4', meta: JSON.stringify({ sourceSids: ['normal'], prompt: '四条分支的关系图验证' }) } } })
        output = await handler({ ...request, action: 'fzoom-view', state: output.state, fields: { __el: { view: name === 'compare' ? 'detail' : name === 'map' ? 'map' : 'compact' } } })
      }
      if (name === 'composer') output = await handler({ ...request, action: 'fzoom-composer', state: output.state })
      if (name === 'detail') output = await handler({ ...request, action: 'fdetail', state: output.state, fields: { __el: { seq: '4' } } })
      if (!output.ok || !output.html) throw new Error(output.error || 'Empty fixture output')
      return { ...output, sourceEventCount: entries[session].length }
    },
  }
}

// Only host framing/theme tokens are mocked; every Flowglass element/style is product source.
export function documentFor(html, css, { width = 480, height = 900, theme = 'dark', font = 14 } = {}) {
  const dark = theme === 'dark'
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flowglass synthetic UX fixture</title><style>
  :root{--dsw-font-family:Arial,"Microsoft YaHei",sans-serif;--dsh-content-font-size:${font}px;--tb-fs:1;--dsw-alias-bg-base:${dark ? '#17181d' : '#ffffff'};--dsw-alias-bg-layer-1:${dark ? '#24262d' : '#f4f5f7'};--dsw-alias-bg-layer-2:${dark ? '#30333c' : '#eaedf1'};--dsw-alias-border-l1:${dark ? '#41444e' : '#d5d9e0'};--dsw-alias-border-l2:${dark ? '#555a65' : '#c5cad3'};--dsw-alias-label-primary:${dark ? '#ecedf0' : '#20232b'};--dsw-alias-label-secondary:${dark ? '#bbc0cc' : '#535d6e'};--dsw-alias-label-tertiary:${dark ? '#929bad' : '#657083'};--dsw-alias-brand-primary:${dark ? '#85aafa' : '#295ac6'};--dsw-alias-state-success-primary:${dark ? '#95d2ab' : '#287346'};--dsw-alias-state-warning-primary:${dark ? '#e7c16c' : '#865d0b'};--dsw-alias-state-error-primary:${dark ? '#f29c99' : '#b93632'}}
  html,body{margin:0;width:100%;height:100%;font-family:var(--dsw-font-family);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}#fixture{width:${width}px;height:${height}px;max-width:100%;overflow:hidden} @scope ([data-dsh-toolbox-scope="flow"]){${css}}</style></head><body${dark ? ' data-ds-dark-theme' : ''}><div id="fixture" data-dsh-toolbox-scope="flow"><div class="jr-drawer jr-drawer-embedded" data-dsh-toolbox-root="flow"><div class="jr-drawer-body"><div class="tb-frame"><div class="tb-panel-html">${html}</div></div></div></div></div></body></html>`
}
