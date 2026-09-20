const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const source = fs.readFileSync(path.join(__dirname, '../shared/host.js'), 'utf8')
const makeReader = new Function(source + '\nreturn makeSessionLogReader')()
const seedError = new Error('seeded session constructor seed must equal its inherited prefix')
const events = Array.from({ length: 123 }, (_, seq) => ({ seq, time: seq, type: 'user/message', data: { content: [{ type: 'text', text: 'event ' + seq }] } }))
let windows = 0
const query = {
  async readSession() { throw seedError },
  async listEvents() { return events.map(({ seq, time, type }) => ({ seq, time, type })) },
  async readEvent({ seq, after }) { assert(after <= 50); windows++; return { session: { id: 'fork', cwd: 'D:/test' }, events: events.slice(seq, seq + after + 1) } },
}
;(async () => {
  const ctx = { get() {} }
  const reader = makeReader(ctx, query)
  const result = await reader('fork')
  assert.deepStrictEqual(result.events, events)
  assert.equal(result.header.cwd, 'D:/test')
  assert.equal(windows, 3)
  console.log('PASS | 冷分叉兼容读取全部123个事件，分页不重不漏并保留header')
  assert.equal((await reader('fork')).changed, false)
  console.log('PASS | 未变化的兼容日志保持缓存契约')
  await assert.rejects(makeReader(ctx, { ...query, async readSession() { throw new Error('permission denied') } })('fork'), /permission denied/)
  console.log('PASS | 其他读取错误不进入兼容路径')
  await assert.rejects(makeReader(ctx, { ...query, async readEvent() { return { events: [] } } })('fork'), /inherited prefix/)
  console.log('PASS | 分页缺失不伪装成完整日志')
})().catch((error) => { console.error(error); process.exitCode = 1 })
