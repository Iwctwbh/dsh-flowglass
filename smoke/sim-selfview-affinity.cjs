// selfview-affinity 仿真：命令总线表面亲和路由（审计 E2）+ 超时命令作废（审计 M12）。
// 场景：FIFO 首派、成功后亲和、无表面时超时作废不复活、capture 流亲和。
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const routes = {}
const toolDefs = {}
let failures = 0
const check = (label, cond, detail) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : '')); if (!cond) failures++ }
const ctx = {
  get(n) { if (n === 'toolboxRegistry') return { register() { return () => {} } }; if (n === 'subprocess') return { spawn() { throw new Error('probe: no fs') } }; return undefined },
  effect(fn) { return fn() },
  on() { return () => {} },
  // 超时钳到 40ms：快速触发看门狗/心跳路径（sendToClient 12-20s、pull 心跳 25s 都会被钳短）
  timeout(fn, ms) { const t = setTimeout(fn, Math.min(ms || 0, 40)); t.unref && t.unref(); return () => clearTimeout(t) },
  interval(fn) { try { fn() } catch (e) {} return () => {} },
}
const harness = {
  handle(name, fn) { routes[name] = fn; return () => {} },
  defineTool: (d) => d,
  registerTool(c, tool) { toolDefs[tool.name] = tool; return () => {} },
}
;(async () => {
  const src = read('shared/runtime.js') + '\n' + read('shared/host.js') + '\n' + read('plugins/selfview/tool.js')
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + src + '\n})()')(ctx, harness, console)
  await plugin.apply(ctx)
  const pull = routes['selfview/pull']
  const result = routes['selfview/result']
  check('pull/result 已注册', typeof pull === 'function' && typeof result === 'function')

  // 1) 两表面挂起；首条命令 FIFO 给先挂起的 A，成功后建立亲和
  const pa1 = pull({ clientId: 'cid-a' })
  const pb1 = pull({ clientId: 'cid-b' })
  const execP1 = toolDefs.ui_snapshot.execute({ maxLines: 20 })
  const cmd1 = await Promise.race([pa1, pb1, new Promise((r) => setTimeout(() => r('T'), 300))])
  check('首条命令派发', cmd1 && cmd1 !== 'T' && cmd1.cmd === 'snapshot')
  await result({ id: cmd1.id, res: { ok: true, text: 'SNAP-A' } })
  await execP1

  // 2) 亲和：再次两表面挂起，新命令应给上次成功的 A
  const pa2 = pull({ clientId: 'cid-a' })
  const pb2 = pull({ clientId: 'cid-b' })
  const execP2 = toolDefs.ui_snapshot.execute({})
  const winner2 = await Promise.race([pa2.then(() => 'A'), pb2.then(() => 'B'), new Promise((r) => setTimeout(() => r('T'), 300))])
  check('第二条命令亲和派给上次成功的表面 A', winner2 === 'A', 'winner=' + winner2)
  if (winner2 === 'A') { const c = await pa2; await result({ id: c.id, res: { ok: true, text: 'SNAP-A2' } }) }
  else { const c = await pb2; await result({ id: c.id, res: { ok: true, text: 'SNAP-B2' } }) }
  await execP2

  // 3) M12 超时作废：无任何挂起表面时派命令 → 看门狗（钳 40ms）先作废 → 之后迟到的 pull 只见心跳
  const failP = toolDefs.ui_click.execute({ selector: '#x' })
  await new Promise((r) => setTimeout(r, 90)) // 等 40ms 钳位超时触发作废
  const late = await Promise.race([
    pull({ clientId: 'cid-c' }).then((c) => c),
    new Promise((r) => setTimeout(() => r('HANG'), 400)),
  ])
  check('超时作废：迟到 pull 不拿到已作废命令（落到心跳）', late !== 'HANG' && late.cmd === 'none', JSON.stringify(late).slice(0, 80))
  const failRes = await failP
  check('模型侧收到「命令已作废」错误', typeof failRes.text === 'string' && /作废/.test(failRes.text), String(failRes.text))

  // 4) 截图流亲和：push state stream=true 来自 cid-b → capture 派给 B
  await routes['selfview/push']({ kind: 'state', stream: true, note: '', clientId: 'cid-b' })
  const pcA = pull({ clientId: 'cid-a' })
  const pcB = pull({ clientId: 'cid-b' })
  const capP = toolDefs.ui_capture.execute()
  const capWinner = await Promise.race([pcA.then(() => 'A'), pcB.then(() => 'B'), new Promise((r) => setTimeout(() => r('T'), 300))])
  check('ui_capture 优先派给截屏流所在表面 B', capWinner === 'B', 'winner=' + capWinner)
  // 回填 capture 结果与挂起 pull，避免悬挂句柄
  try { const cc = capWinner === 'A' ? await pcA : await pcB; await result({ id: cc.id, res: { ok: false, error: 'no-stream' } }) } catch (e) {}
  await capP.catch(() => {})
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('PROBE FAIL', e); process.exit(1) })

