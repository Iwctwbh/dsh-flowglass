// Exercise the actual Client recovery state machine, without creating sessions.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../plugins/toolbox/flow-launch.js'), 'utf8')
const run = new Function(source + '; return runFlowLaunchBatch')()
const durable = new Function(source + '; return flowDurableEvents')()
const batch = () => ({ prompt: 'synthetic task', items: [{ index: 0, sid: 'source', stage: 'create', status: 'ready' }, { index: 1, sid: '', stage: 'create', status: 'ready' }] })
const check = (label, result) => { assert.ok(result, label); console.log('PASS | ' + label) }
;(async () => {
  check('unready event source is not a reliable baseline', durable({ revision: 0, entries: [] }) === null)
  check('ready empty source is a reliable empty baseline', durable({ revision: 1, entries: [] }).length === 0)
  const durableEvent = { seq: 7, type: 'user/message', data: { content: [{ type: 'text', text: 'fixture' }] } }
  check('Harness wrapped durable entries exclude transients', durable({ revision: 2, entries: [{ type: 'event', event: durableEvent }, { type: 'transient', event: { seq: 8, type: 'assistant/live-chunk' } }] })[0] === durableEvent)
  check('legacy flattened event windows remain supported', durable({ revision: 2, entries: [durableEvent] })[0] === durableEvent)
  let work = batch(), calls = [], fail = true
  const api = {
    create: async (item) => { calls.push('create:' + item.index); return 'child' },
    configure: async (item) => { calls.push('configure:' + item.sid); if (item.sid === 'child' && fail) throw new Error('configuration rejected') },
    send: async (item) => { calls.push('send:' + item.sid) },
  }
  await run(work, api, () => {})
  check('create all branches before sending to reused source', calls.indexOf('create:1') < calls.indexOf('send:source'))
  check('configuration failure retains created session', work.items[1].sid === 'child' && work.items[1].status === 'failed')
  fail = false; await run(work, api, () => {})
  check('retry reuses session and does not resend successful source', calls.filter((x) => x === 'create:1').length === 1 && calls.filter((x) => x === 'send:source').length === 1 && calls.filter((x) => x === 'send:child').length === 1)
  work = batch(); calls = []
  api.send = async (item) => { calls.push('send:' + item.sid); throw Object.assign(new Error('definite rejection'), { definite: true }) }
  await run(work, api, () => {}); await run(work, api, () => {})
  check('definite send rejection is retryable without reconfigure', work.items.every((item) => item.status === 'failed') && calls.filter((x) => x === 'configure:child').length === 1 && calls.filter((x) => x === 'send:child').length === 2)
  work = batch(); calls = []
  api.send = async (item) => { calls.push('send:' + item.sid); throw new Error('receipt lost') }
  await run(work, api, () => {}); await run(work, api, () => {})
  check('unknown send receipt cannot be blindly retried', work.items.every((item) => item.status === 'unknown') && calls.filter((x) => x === 'send:source').length === 1)
  work = batch(); calls = []
  api.create = async () => { calls.push('create'); throw new Error('create receipt lost') }
  await run(work, api, () => {}); await run(work, api, () => {})
  check('unknown create receipt cannot duplicate sessions', work.items[1].status === 'unknown' && calls.filter((x) => x === 'create').length === 1)
})().catch((error) => { console.error(error); process.exitCode = 1 })
