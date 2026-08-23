// ports 工具仿真：在测试进程内以合成 require/process 求值子进程脚本（PORTS_FIXTURE 注入预置输出、
// 显式指定 process.platform），在任意主机平台上覆盖三平台解析分支（win32 netstat/tasklist、
// darwin lsof、linux ss→netstat 回退）+ 面板协议（过滤/两步确认结束进程/无 PID 行隐藏按钮/枚举失败错误契约）。
// 不 spawn 真实命令：解析分支全真跑，外部命令调用零依赖。
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// 各平台真实命令输出样本（键 = 子脚本 run() 的 cmd 名；PORTS_FIXTURE 缺 key 视为失败空输出）
const FIXTURES = {
  win32: {
    netstat: [
      '',
      'Active Connections',
      '',
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1232',
      '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       4321',
      '  TCP    192.168.1.5:6463       1.2.3.4:443            ESTABLISHED     999',
    ].join('\r\n'),
    tasklist: '"node.exe","4321","Console","1","51,200 K"\r\n"svchost.exe","1232","Services","0","12,800 K"',
  },
  darwin: {
    lsof: [
      'COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
      'node    4321 user   23u  IPv4  0xdead        0t0  TCP *:3000 (LISTEN)',
      'node    4321 user   24u  IPv6  0xbeef        0t0  TCP [::1]:3000 (LISTEN)',
      'WindowS 1232 user   15u  IPv4  0xcafe        0t0  TCP *:135 (LISTEN)',
    ].join('\n'),
  },
  linuxSs: {
    ss: [
      'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
      'LISTEN 0      4096       127.0.0.1:3000      0.0.0.0:*     users:(("node",pid=4321,fd=20))',
      'LISTEN 0      511            0.0.0.0:80          0.0.0.0:*',
      'LISTEN 0      4096           [::]:22             [::]:*     users:(("sshd",pid=800,fd=3))',
      'LISTEN 0      4096 [fe80::1%eth0]:5353           [::]:*     users:(("mdns",pid=900,fd=4))',
    ].join('\n'),
  },
  linuxNetstat: {
    ss: '',
    netstat: [
      'Active Internet connections (only servers)',
      'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name',
      'tcp        0      0 127.0.0.1:3000          0.0.0.0:*               LISTEN      4321/node',
      'tcp6       0      0 :::22                   :::*                    LISTEN      800/sshd',
    ].join('\n'),
  },
  linuxFail: { ss: '', netstat: '' },
}

let fixture = null // 当前平台样本（null = 不注入 PORTS_FIXTURE）
let childPlatform = 'win32' // 子脚本领到的 process.platform
let killMode = 'ok' // 结束进程子进程的模拟结果：ok / deny
let killSpawnCount = 0

// 在测试进程内求值子脚本：合成 require（只许 child_process，且 FIX 模式禁 spawn）+ 合成 process
// （可指定 platform/env，stdout/stderr/exit 捕获；exit 用哨兵异常模拟真实中断语义）
const runChildScript = (script) => {
  let out = '', err = '', exitCode = 0
  const fn = new Function('require', 'process', script)
  try {
    fn((name) => {
      if (name !== 'child_process') throw new Error('仿真只允许 require child_process')
      return { spawnSync: () => { throw new Error('FIX 模式下不允许 spawn 真实命令') } }
    }, {
      platform: childPlatform,
      env: fixture ? { PORTS_FIXTURE: JSON.stringify(fixture) } : {},
      stdout: { write: (s) => { out += s } },
      stderr: { write: (s) => { err += s } },
      exit: (c) => { throw { __sentinelExit: c || 0 } },
    })
  } catch (e) {
    if (e && Object.prototype.hasOwnProperty.call(e, '__sentinelExit')) exitCode = e.__sentinelExit
    else throw e
  }
  return { status: exitCode, stdout: out, stderr: err }
}

const subprocess = {
  spawn(spec) {
    const argv = (spec && spec.argv) || []
    if (argv[1] === '-') {
      // 列表脚本：真实求值（fixture 驱动三平台分支）；脚本经 spec.stdio.stdin.data 传入
      const r = runChildScript((spec.stdio && spec.stdio.stdin && spec.stdio.stdin.data) || '')
      return {
        done: Promise.resolve({ exitCode: r.status }),
        collected: {
          stdout: { readFrom: () => ({ text: r.stdout, lossy: false }) },
          stderr: { readFrom: () => ({ text: r.stderr, lossy: false }) },
        },
      }
    }
    // 结束进程脚本（node -e）：不真杀进程，按 killMode 模拟结果
    killSpawnCount++
    if (killMode === 'deny') {
      return {
        done: Promise.resolve({ exitCode: 1 }),
        collected: {
          stdout: { readFrom: () => ({ text: '', lossy: false }) },
          stderr: { readFrom: () => ({ text: 'EPERM 拒绝访问。', lossy: false }) },
        },
      }
    }
    return {
      done: Promise.resolve({ exitCode: 0 }),
      collected: {
        stdout: { readFrom: () => ({ text: 'ok', lossy: false }) },
        stderr: { readFrom: () => ({ text: '', lossy: false }) },
      },
    }
  },
}

const handlers = {}
const ctx = {
  get(name) {
    if (name === 'subprocess') return subprocess
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
const rowsOf = (st) => (st.rows || []).map((r) => r.port + '@' + r.pid + ':' + r.proc).join(', ')

;(async () => {
  const src = read('shared/runtime.js') + '\n' + read('shared/host.js') + '\n' + read('plugins/ports/tool.js')
  const plugin = await new Function('ctx', 'harness', 'console', 'return (async () => {\n' + src + '\n})()')(ctx, undefined, console)
  await plugin.apply(ctx)
  const h = handlers.ports
  if (!h) { console.log('FAIL | ports 未注册'); process.exit(1) }

  // ---- win32 分支（原逻辑回归）----
  fixture = FIXTURES.win32
  childPlatform = 'win32'
  let r = await h({ action: '', fields: {}, state: null })
  check('win32 打开自动加载', Array.isArray(r.state.rows) && r.state.rows.length === 2, rowsOf(r.state))
  check('win32 只留 LISTENING（排除 ESTABLISHED）', !r.state.rows.some((x) => x.port === 6463))
  check('win32 tasklist 进程名映射', r.state.rows.some((x) => x.port === 135 && x.pid === 1232 && x.proc === 'svchost.exe'))
  check('win32 渲染端口/进程/结束按钮', r.html.indexOf(':3000') >= 0 && r.html.indexOf('node.exe') >= 0 && r.html.indexOf('data-action="kill"') >= 0)

  // 过滤：端口号 / 进程名
  r = await h({ action: 'refresh', fields: { q: '3000' }, state: r.state })
  check('过滤端口号 3000 → 单行', r.state.q === '3000' && r.html.indexOf(':3000') >= 0 && r.html.indexOf(':135') < 0)
  r = await h({ action: 'refresh', fields: { q: 'svchost' }, state: r.state })
  check('过滤进程名 svchost → 命中 135', r.html.indexOf(':135') >= 0 && r.html.indexOf(':3000') < 0)
  r = await h({ action: 'refresh', fields: { q: '' }, state: r.state })

  // 两步确认结束进程：武装 → 取消 → 伪造确认拒绝 → PID 0 拒绝 → 武装确认失败 → 再武装成功
  r = await h({ action: 'kill', fields: { __el: { pid: '4321' } }, state: r.state })
  check('「结束」只武装不执行', r.state.arm === '4321' && r.html.indexOf('确认结束') >= 0)
  r = await h({ action: 'kill-cancel', fields: {}, state: r.state })
  check('「取消」解除武装', r.state.arm === null && r.html.indexOf('确认结束') < 0)
  const beforeForged = killSpawnCount
  r = await h({ action: 'kill-confirm', fields: { __el: { pid: '4321' } }, state: { ...r.state, arm: '4321' } })
  check('未武装伪造确认 → Host 拒绝且不 spawn', r.html.indexOf('结束请求已拒绝') >= 0 && killSpawnCount === beforeForged)
  r = await h({ action: 'kill-confirm', fields: { __el: { pid: '0' } }, state: { ...r.state, arm: '0', rows: [{ port: 1, pid: 0, proc: 'fake' }] } })
  check('PID 0 → 拒绝且不 spawn（POSIX 进程组保护）', r.html.indexOf('结束请求已拒绝') >= 0 && killSpawnCount === beforeForged)
  r = await h({ action: 'kill', fields: { __el: { pid: '4321' } }, state: r.state })
  killMode = 'deny'
  r = await h({ action: 'kill-confirm', fields: { __el: { pid: '4321' } }, state: r.state })
  check('结束失败 → 错误透传', r.html.indexOf('结束失败') >= 0 && r.html.indexOf('EPERM') >= 0)
  r = await h({ action: 'kill', fields: { __el: { pid: '4321' } }, state: r.state })
  killMode = 'ok'
  r = await h({ action: 'kill-confirm', fields: { __el: { pid: '4321' } }, state: r.state })
  check('结束成功 → info 提示并重载列表', r.html.indexOf('已结束进程 PID 4321') >= 0 && Array.isArray(r.state.rows))

  // ---- darwin 分支（lsof）----
  fixture = FIXTURES.darwin
  childPlatform = 'darwin'
  r = await h({ action: 'refresh', fields: {}, state: null })
  check('darwin lsof 解析（IPv4+IPv6 同端口不同地址各一行）', r.state.rows.length === 3, rowsOf(r.state))
  check('darwin COMMAND 列作进程名', r.state.rows.some((x) => x.port === 135 && x.proc === 'WindowS'))
  check('darwin IPv6 方括号地址切分', r.state.rows.some((x) => x.port === 3000 && x.addr === '[::1]' && x.pid === 4321))

  // ---- linux 分支：ss 主路径 ----
  fixture = FIXTURES.linuxSs
  childPlatform = 'linux'
  r = await h({ action: 'refresh', fields: {}, state: null })
  check('linux ss 解析 users:(("name",pid=n))', r.state.rows.some((x) => x.port === 3000 && x.pid === 4321 && x.proc === 'node'), rowsOf(r.state))
  check('linux ss 本地地址 %lo 后缀剥离与 [::] 切分', r.state.rows.some((x) => x.port === 22 && x.addr === '[::]' && x.proc === 'sshd'))
  check('linux IPv6 scope 仅从 host 剥离且保留端口', r.state.rows.some((x) => x.port === 5353 && x.addr === '[fe80::1]' && x.pid === 900 && x.proc === 'mdns'), rowsOf(r.state))
  check('linux 无权限行 pid=0 → 「PID 不可见」且无结束按钮', r.html.indexOf('PID 不可见') >= 0 && r.html.indexOf('data-pid="0"') < 0)
  check('linux 无 root 提示横幅', r.html.indexOf('部分端口未显示 PID') >= 0)

  // ---- linux 分支：netstat 回退 ----
  fixture = FIXTURES.linuxNetstat
  r = await h({ action: 'refresh', fields: {}, state: null })
  check('ss 不可用回退 netstat -tlnp', r.state.rows.length === 2 && r.state.rows.some((x) => x.port === 22 && x.proc === 'sshd'), rowsOf(r.state))
  check('netstat 回退 tcp6 裸 IPv6 切分', r.state.rows.some((x) => x.port === 22 && x.addr === '::'))

  // ---- 枚举失败契约 ----
  fixture = FIXTURES.linuxFail
  r = await h({ action: 'refresh', fields: {}, state: null })
  check('命令全部不可用 → 错误横幅', r.html.indexOf('tb-banner-error') >= 0 && r.html.indexOf('枚举监听端口失败') >= 0 && r.state.rows.length === 0)

  console.log(failures ? ('\n共 ' + failures + ' 项失败') : '\n全部通过')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('仿真异常:', e); process.exit(2) })
