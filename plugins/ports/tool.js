// ===== ports-tool.js：端口与进程查看工具（Host-only，HTML 面板经工具箱 RPC 渲染）=====
// 跨平台列监听端口 + 进程名：node 子进程整脚本执行，子进程内按 process.platform 分支——
//   win32  → netstat -ano -p tcp 解析 LISTENING 行 + tasklist CSV 取 PID→进程名（原逻辑保留）
//   darwin → lsof -nP -iTCP -sTCP:LISTEN（COMMAND 列即进程名；无 sudo 只见本用户端口，属系统限制）
//   linux  → 先 ss -tlnp（iproute2 系统自带），不可用再退 netstat -tlnp；
//            无 root 时 ss/netstat 不回其他用户端口的 PID/进程名 → 该行 pid=0，隐藏「结束」按钮
// 结束进程统一走子进程 process.kill(pid,'SIGKILL')：win32 即 TerminateProcess（等价 taskkill /F），
//   POSIX 发 SIGKILL；EPERM/ESRCH 等错误原样透传面板。
// 测试钩子：子进程 env 带 PORTS_FIXTURE（JSON：{netstat|tasklist|ss|lsof → 预置 stdout}）时不 spawn
//   真实命令、直接喂预置输出走同一套解析分支——smoke/sim-ports.cjs 借此在任意平台测三分支。
// 状态：{ rows, q, arm, error, info, truncated }（rows 为标量小对象数组，纯 JSON）

return {
  name: 'ports-tool',
  inject: ['fs', 'subprocess', 'timer'],
  apply(ctx) {
    const subprocess = ctx.get('subprocess')

    // node 子进程是真实 node，process/Buffer/require 可用；插件求值器里这些全局被遮蔽——
    // 脚本只经 stdin / argv 传入，绝不在插件侧拼用户输入
    // 注意 impl 字符串转义：'\\s' → 子脚本 '\s'，'\\d' → '\d'
    const LIST_SCRIPT = [
      'const { spawnSync } = require("child_process")',
      // PORTS_FIXTURE 存在时全命令走预置输出（缺 key 视为失败空输出），测试完全封闭不碰真实命令
      'let FIX = null',
      'try { FIX = JSON.parse(process.env.PORTS_FIXTURE || "null") } catch (e) { FIX = null }',
      'const run = (cmd, args) => {',
      '  if (FIX) {',
      '    const has = Object.prototype.hasOwnProperty.call(FIX, cmd)',
      '    const out = has ? String(FIX[cmd]) : ""',
      '    return { status: out ? 0 : 1, stdout: out, stderr: "" }',
      '  }',
      '  return spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 8388608 })',
      '}',
      'const rows = []',
      'const seen = {}',
      'const push = (addr, port, pid, proc) => {',
      '  const p = Number(port)',
      '  if (!p) return',
      '  const k = addr + "|" + p + "|" + (Number(pid) || 0)',
      '  if (seen[k]) return',
      '  seen[k] = 1',
      '  rows.push({ addr: String(addr || "*"), port: p, pid: Number(pid) || 0, proc: String(proc || "") })',
      '}',
      '// host:port 切分：lastIndexOf 兼容裸 IPv6（:::22）、方括号 IPv6（[::]:22）与 IPv4；',
      '// IPv6 scope 只从 host 部分剥离，不能从整串的 % 处截断（会连末尾端口一起丢掉）',
      'const splitHostPort = (s) => {',
      '  const i = s.lastIndexOf(":")',
      '  if (i <= 0) return null',
      '  let host = s.slice(0, i)',
      '  const port = s.slice(i + 1)',
      '  const pct = host.indexOf("%")',
      '  if (pct > 0) { const close = host.indexOf("]", pct); host = close >= 0 ? host.slice(0, pct) + host.slice(close) : host.slice(0, pct) }',
      '  return [host, port]',
      '}',
      'let failed = false',
      '',
      'if (process.platform === "win32") {',
      '  const n = run("netstat", ["-ano", "-p", "tcp"])',
      '  const tl = run("tasklist", ["/FO", "CSV", "/NH"])',
      '  const procs = {}',
      '  for (const line of String(tl.stdout || "").split(/\\r?\\n/)) {',
      '    const m = /^"([^"]*)","(\\d+)"/.exec(line)',
      '    if (m) procs[m[2]] = m[1]',
      '  }',
      '  for (const line of String(n.stdout || "").split(/\\r?\\n/)) {',
      '    const t = line.trim().split(/\\s+/)',
      '    if (t.length >= 5 && t[3] === "LISTENING") {',
      '      const hp = splitHostPort(t[1])',
      '      if (hp && /^\\d+$/.test(t[4])) push(hp[0], hp[1], t[4], procs[t[4]] || "")',
      '    }',
      '  }',
      '  failed = !rows.length && n.status !== 0 && !String(n.stdout || "").trim()',
      '} else if (process.platform === "darwin") {',
      '  const r = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"])',
      '  for (const line of String(r.stdout || "").split(/\\r?\\n/)) {',
      '    const t = line.trim().split(/\\s+/)',
      '    if (t.length < 9 || t[7] !== "TCP") continue',
      '    const hp = splitHostPort(t[8])',
      '    if (hp) push(hp[0], hp[1], /^\\d+$/.test(t[1]) ? t[1] : 0, t[0])',
      '  }',
      '  failed = !rows.length && r.status !== 0 && !String(r.stdout || "").trim()',
      '} else {',
      '  let r = run("ss", ["-tlnp"])',
      '  let viaSs = true',
      '  if (!String(r.stdout || "").trim() && r.status !== 0) { r = run("netstat", ["-tlnp"]); viaSs = false }',
      '  for (const line of String(r.stdout || "").split(/\\r?\\n/)) {',
      '    if (viaSs) {',
      '      const t = line.trim().split(/\\s+/)',
      '      if (t.length < 4 || t[0] !== "LISTEN") continue',
      '      const hp = splitHostPort(t[3])',
      '      if (!hp) continue',
      '      const u = /users:\\(\\("([^"]*)",pid=(\\d+)/.exec(line)',
      '      push(hp[0], hp[1], u ? u[2] : 0, u ? u[1] : "")',
      '    } else {',
      '      const t = line.trim().split(/\\s+/)',
      '      if (t.length < 4 || (t[0] !== "tcp" && t[0] !== "tcp6")) continue',
      '      const hp = splitHostPort(t[3])',
      '      if (!hp) continue',
      '      const pm = /^(\\d+)\\/(.+)$/.exec(t[t.length - 1] || "")',
      '      push(hp[0], hp[1], pm ? pm[1] : 0, pm ? pm[2] : "")',
      '    }',
      '  }',
      '  failed = !rows.length && r.status !== 0 && !String(r.stdout || "").trim()',
      '}',
      '',
      'if (failed) {',
      '  process.stderr.write("枚举监听端口失败：" + (process.platform === "win32" ? "netstat/tasklist" : process.platform === "darwin" ? "lsof" : "ss/netstat") + " 均不可用或被拒绝")',
      '  process.exit(2)',
      '}',
      'process.stdout.write(JSON.stringify(rows))',
    ].join('\n')

    // 两步确认的事实源留在 Host 闭包，绝不信任客户端回传的 state/fields：否则可伪造
    // { arm:'0', rows:[{pid:0}] } 绕过确认。POSIX process.kill(0, SIGKILL) 会杀当前进程组。
    let armedPid = ''
    let armedAt = 0
    let lastRows = []
    const ARM_TTL_MS = 30000

    const runNode = async (script, argv1) => {
      if (!subprocess) return { ok: false, error: 'subprocess 服务不可用' }
      // 两处路径（列表脚本经 stdin / 结束进程经 node -e）都走同一个 spawn：统一包 15s wall-clock 看门狗，
      // 到点主动 terminate()。注意 graceMs 只是「退出后 SIGTERM→SIGKILL 升级窗口」，不是运行超时。
      const spec = {
        argv: argv1 == null ? ['node', '-'] : ['node', '-e', script, String(argv1)],
        stdio: argv1 == null
          ? { stdin: { data: script }, stdout: { maxBytes: 2 * 1024 * 1024 }, stderr: { maxBytes: 128 * 1024 } }
          : { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 64 * 1024 } },
        graceMs: 30000,
      }
      const handle = withDeadline(ctx, subprocess.spawn(spec), 15000)
      const outcome = await handle.done
      const so = handle.collected.stdout.readFrom(0)
      const se = handle.collected.stderr.readFrom(0)
      const truncated = !!(so.lossy || se.lossy) // lossy = 输出超过 maxBytes 被截尾，记给调用方提示
      if (outcome.exitCode !== 0) return { ok: false, error: (se.text || so.text).slice(0, 500), truncated }
      return { ok: true, stdout: so.text, truncated }
    }

    const loadRows = async () => {
      const res = await runNode(LIST_SCRIPT)
      if (!res.ok) return { error: res.error, rows: [], truncated: !!res.truncated }
      try {
        const parsed = JSON.parse(res.stdout.trim() || '[]')
        const rows = Array.isArray(parsed) ? parsed : [parsed]
        return { rows: rows.filter((r) => r && typeof r.port === 'number'), truncated: !!res.truncated }
      } catch (e) {
        return { error: '解析失败' + (res.truncated ? '（输出超过上限已截尾）' : '') + ': ' + res.stdout.slice(0, 300), rows: [], truncated: !!res.truncated }
      }
    }

    const render = (st) => {
      const rows = (st.rows || []).filter((r) => {
        const q = (st.q || '').trim().toLowerCase()
        if (!q) return true
        return String(r.port).indexOf(q) >= 0 || String(r.proc || '').toLowerCase().indexOf(q) >= 0 || String(r.pid).indexOf(q) >= 0
      })
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root">')
      parts.push('<div class="tb-query">' +
        '<input class="tb-input" data-field="q" placeholder="按端口 / 进程名 / PID 过滤" value="' + esc(st.q || '') + '" />' +
        '<button type="button" class="tb-btn tb-btn-primary" data-action="refresh">刷新</button>' +
      '</div>')
      if (st.error) parts.push('<div class="tb-banner tb-banner-error">' + esc(st.error) + '</div>')
      if (st.truncated) parts.push('<div class="tb-banner tb-banner-info">输出超过上限已截尾</div>')
      if (st.info) parts.push('<div class="tb-banner tb-banner-info">' + esc(st.info) + '</div>')
      if ((st.rows || []).some((r) => r && !r.pid)) {
        parts.push('<div class="tb-banner tb-banner-info">部分端口未显示 PID / 进程名（Linux 无 root 时看不到其他用户进程的归属，需提权才能结束）</div>')
      }
      parts.push('<div class="tb-list-head"><span class="tb-list-title">监听端口<span class="tb-count">' + rows.length + '</span></span>' +
        '<span class="tb-note">共 ' + (st.rows || []).length + ' 条</span></div>')
      if (rows.length === 0) {
        parts.push('<div class="tb-notice">' + (st.rows ? '无匹配项' : '点击「刷新」加载') + '</div>')
      } else {
        parts.push('<div class="tb-list">' + rows.map((r) => {
          const killable = r.pid > 0
          const armed = killable && st.arm === String(r.pid)
          const act = !killable
            ? '<span class="tb-note">PID 不可见</span>'
            : armed
              ? '<button type="button" class="tb-btn tb-btn-sm tb-btn-danger-ghost" data-action="kill-confirm" data-pid="' + r.pid + '">确认结束</button>' +
                '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="kill-cancel">取消</button>'
              : '<button type="button" class="tb-btn tb-btn-sm tb-btn-ghost" data-action="kill" data-pid="' + r.pid + '">结束</button>'
          return '<div class="tb-rec' + (armed ? ' tb-rec-active' : '') + '">' +
            '<div class="tb-rec-main">' +
              '<div class="tb-rec-top"><span class="tb-rec-key">:' + r.port + '</span>' +
              '<span class="tb-rec-summary">' + esc(r.proc || '（未知进程）') + '</span>' + act + '</div>' +
              '<div class="tb-rec-sub"><span>' + esc(r.addr || '*') + '</span><span>PID ' + (killable ? r.pid : '—') + '</span></div>' +
            '</div>' +
          '</div>'
        }).join('') + '</div>')
      }
      parts.push('</div>')
      return parts.join('')
    }

    const handler = async ({ action, fields, state }) => {
      const st = (state && typeof state === 'object' && state) ? state : { rows: null, q: '', arm: null, error: null, info: null, truncated: false }
      const el = fields && fields.__el ? fields.__el : {}
      if (typeof fields.q === 'string') st.q = fields.q
      st.error = null; st.info = null; st.truncated = false

      if (action === '' || action === 'refresh') {
        const r = await loadRows()
        st.rows = r.rows; st.error = r.error || null; st.arm = null
        lastRows = Array.isArray(r.rows) ? r.rows : []
        armedPid = ''; armedAt = 0
        st.truncated = !!r.truncated // 输出截尾标志 → 面板提示条（kill 后重载同理）
      } else if (action === 'kill' && el.pid && /^\d+$/.test(String(el.pid))) {
        const pid = String(el.pid)
        const n = Number(pid)
        const listed = Number.isSafeInteger(n) && n > 0 && lastRows.some((r) => r && r.pid === n)
        if (!listed) {
          st.arm = null; armedPid = ''; armedAt = 0
          st.error = '结束请求已拒绝：PID 不在当前监听列表'
        } else {
          st.arm = pid; armedPid = pid; armedAt = Date.now()
        }
      } else if (action === 'kill-cancel') {
        st.arm = null; armedPid = ''; armedAt = 0
      } else if (action === 'kill-confirm' && el.pid && /^\d+$/.test(String(el.pid))) {
        const pid = String(el.pid)
        const n = Number(pid)
        const listed = Number.isSafeInteger(n) && n > 0 && lastRows.some((r) => r && r.pid === n)
        const confirmed = listed && armedPid === pid && armedAt > 0 && Date.now() - armedAt <= ARM_TTL_MS
        st.arm = null; armedPid = ''; armedAt = 0
        if (!confirmed) {
          st.error = '结束请求已拒绝：PID 未武装、已过期或不在当前监听列表'
        } else {
          // 统一 process.kill(SIGKILL)：win32 即 TerminateProcess（等价旧 taskkill /F），POSIX 发信号
          const res = await runNode('try{const p=Number(process.argv[1]);if(!Number.isSafeInteger(p)||p<=0)throw new Error("invalid pid");process.kill(p,"SIGKILL");process.stdout.write("ok")}catch(e){process.stderr.write(String((e&&e.message)||e));process.exit(1)}', pid)
          if (res.ok) {
            st.info = '已结束进程 PID ' + pid
            const r = await loadRows()
            st.rows = r.rows; st.error = r.error || null
            lastRows = Array.isArray(r.rows) ? r.rows : []
            st.truncated = !!r.truncated
          } else {
            st.error = '结束失败: ' + res.error
          }
        }
      }
      return { ok: true, html: render(st), state: st }
    }

    tryRegisterTool(ctx, { id: 'ports', label: '端口', order: 5, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2v3M11 2v3"/><path d="M4.5 5h7v2a3.5 3.5 0 0 1-7 0z"/><path d="M8 10.5V14"/></svg>' }, handler)
  },
}
