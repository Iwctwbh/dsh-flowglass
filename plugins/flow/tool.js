// ===== flow-tool.js：实时流镜（Host-only，经工具箱 RPC 注册）=====
// 当前 session 在干什么 → 自上而下不断加载的流程图（与「轨迹」工具互补：轨迹是过滤时间线，流程图是形态视图）。
// 形态约定（用户定制）：
//   · 主 session：自上而下箭头串联 用户消息 → 助手 → 工具组 → 助手 …（最新在底部，滚动条贴底跟随）
//   · 子代理（subagent/workflow/ralph）：git 树形式——从主干 ├─ 分出支线，支线内实时展示子会话事件流，╰─ 合并回主干
//   · 插件/技能/MCP/命令/文件 等普通工具调用：同一步骤内的多个调用 → 平行卡片并排（调用并返回成组）
//   · 大流镜 Zoom（st.zoom）：血缘树或“单次并发批次”两档；每会话一卡（状态点 + 标题 + 统计 + 触发链），
//     并发日志可切回历史批次；点卡切换 Harness 会话但保持大流镜与当前批次不消失。
// 实时：面板根按插件详情设置声明 data-autorefresh，框架抽屉静默重拉（live 开关可暂停）。
// 钻取：点子代理分支「进入 →」切换到该子会话的流程图（当前会话压 crumbs 栈，「← 返回」逐级退回）。
// 数据源（DSH 0.1.5 统一折叠器，同一 parseItems 供两条来源）：
//   · 当前会话实时：Client 订阅 Session Controller 事件窗（ctx.sessions.binding(sid).eventSource），
//     把瞬时 assistant/live-chunk 折叠成 attempt 快照随面板 RPC 传入（live 叠加层）；结算由事件窗
//     settle-assistant 自动去重，Client 只附最近结算 attempt 的 firstSeq 供 UI 连续性。
//   · 冷会话/跨会话/子代理钻取：Host sessionQuery（makeSessionLogReader 缓存）读持久事件，
//     assistant/message 与 assistant/attempt 的内嵌 stream 记录被精确重放出同样的卡片。
//   · 旧 assistant/chunk 协议（0.1.2）不再被解析——0.1.5 日志不含该事件。
// 状态：{ live, follow, limit, sid, home, expanded, crumbs, zoom, zoomScope, zoomRuns, zoomRunId }（事件本体与流程模型每次动作重建，不进 state）

return {
  name: 'flow-tool',
  inject: ['fs', 'sessionQuery', 'timer'],
  apply(ctx) {
    const sq = ctx.get('sessionQuery')
    const fs = ctx.get('fs')

    // ---- 会话日志读取缓存（主会话 + 每个子代理会话各一个读取器，避免缓存抖动）----
    const readers = {}
    const growth = {} // sid → 上次渲染的日志条数：本轮条数增长 = 会话活跃（助手卡流光判定用）
    const readLog = async (sid) => {
      if (!sq) return { events: [], count: 0 }
      if (!readers[sid]) readers[sid] = makeSessionLogReader(ctx, sq)
      try { return await readers[sid](sid) } catch (e) { return { events: [], count: 0, unavailable: true, error: String(e && e.message || e).slice(0, 300) } }
    }

    // ---- 工具分类（与 trace 工具同口径：真实清单优先，名字启发式兜底）----
    let manifestTools = null
    const loadManifestTools = async () => {
      if (manifestTools) return
      manifestTools = []
      try {
        const found = await findManifest(ctx)
        const list = found && found.manifest && Array.isArray(found.manifest.plugins) ? found.manifest.plugins : []
        for (const e of list) {
          if (e && Array.isArray(e.modelTools)) {
            for (const n of e.modelTools) if (typeof n === 'string' && n) manifestTools.push(n)
          }
        }
      } catch (e) {}
    }
    const RE_SKILL = /^skill$/
    const RE_MCP = /mcp/i
    const RE_SUBAGENT = /^(subagent|subagent_fork|send_message|workflow|ralph)$/
    const RE_SHELL = /^(pwsh|bash|sh|terminal_(open|send|read|close|list|signal)|run_code)$/
    const RE_FILE = /^(read|write|edit|glob|grep|read_image)$/
    const kindOf = (name) => {
      if (/^cordis_/.test(name)) return 'cordis'
      if (/^ssh_/.test(name)) return 'cordis'
      if (manifestTools && manifestTools.indexOf(name) >= 0) return 'cordis'
      if (RE_SKILL.test(name)) return 'skill'
      if (RE_MCP.test(name)) return 'mcp'
      if (RE_SUBAGENT.test(name)) return 'subagent'
      if (RE_SHELL.test(name)) return 'shell'
      if (RE_FILE.test(name)) return 'file'
      return 'builtin'
    }
    const KIND_META = {
      skill: { label: '技能', color: '#7fa7f0', bg: 'rgba(91,141,239,.12)' },
      cordis: { label: '插件', color: '#d4b95c', bg: 'rgba(212,167,44,.10)' },
      mcp: { label: 'MCP', color: '#81c784', bg: 'rgba(102,187,106,.10)' },
      shell: { label: '命令', color: '#d4b95c', bg: 'rgba(212,167,44,.08)' },
      file: { label: '文件', color: '#7fa7f0', bg: 'rgba(91,141,239,.10)' },
      builtin: { label: '内置', color: '#9a9ba6', bg: 'rgba(138,139,150,.10)' },
    }

    // ---- 声明式工具显示规则 ----
    // 规则只投影卡片标题/徽章，不改日志中的工具名、参数或结果。Client 以 localStorage
    // 为事实源并在每次 panel 请求中携带 JSON；Host 在使用前收窄，未知字段一律忽略。
    const MAX_PRESENTATION_RULES = 24
    const DEFAULT_PRESENTATION_RULES = [
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['git', 'git.exe'], displayName: 'Git', actions: [], badge: 'Git', color: '#f05032' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['gh', 'gh.exe', 'github', 'github.exe'], displayName: 'GitHub', actions: [], badge: 'GitHub', color: '#8b949e' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['pnpm', 'pnpm.cmd', 'pnpm.exe'], displayName: 'pnpm', actions: [], badge: 'pnpm', color: '#f69220' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['npm', 'npm.cmd', 'npm.exe'], displayName: 'npm', actions: [], badge: 'npm', color: '#cb3837' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['dsh', 'dsh.cmd', 'dsh.exe'], displayName: 'DSH', actions: [], badge: 'DSH', color: '#7fa7f0' },
      { enabled: true, tools: ['pwsh', 'bash', 'sh', 'run_code'], executables: ['python', 'python.exe', 'python3', 'python3.exe', 'py', 'py.exe'], displayName: 'Python', actions: [], badge: 'Python', color: '#3776ab' },
    ]
    const DEFAULT_FLOW_PREFERENCES = Object.freeze({
      keepOpenOnSessionSwitch: true,
      zoomEnabled: true,
      defaultBranchCount: 2,
      defaultZoomView: 'compact',
      refreshMs: 1000,
      laneRatio: Object.freeze([20, 35, 45]),
    })
    const normalizeFlowPreferences = (raw) => {
      let value = raw
      if (typeof value === 'string') {
        try { value = JSON.parse(value || '{}') } catch (e) { value = {} }
      }
      const p = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      const branchCount = Number(p.defaultBranchCount)
      const refreshMs = Number(p.refreshMs)
      const laneRatio = Array.isArray(p.laneRatio) && p.laneRatio.length === 3 ? p.laneRatio.map(Number) : []
      const validLaneRatio = laneRatio.every((item) => Number.isInteger(item) && item >= 10 && item <= 80 && item % 5 === 0) && laneRatio.reduce((sum, item) => sum + item, 0) === 100
      return {
        keepOpenOnSessionSwitch: p.keepOpenOnSessionSwitch !== false,
        zoomEnabled: p.zoomEnabled !== false,
        defaultBranchCount: branchCount === 3 || branchCount === 4 ? branchCount : 2,
        defaultZoomView: p.defaultZoomView === 'detail' || p.defaultZoomView === 'map' ? p.defaultZoomView : 'compact',
        refreshMs: [0, 1000, 2000, 5000, 10000].includes(refreshMs) ? refreshMs : 1000,
        laneRatio: validLaneRatio ? laneRatio : [20, 35, 45],
      }
    }
    const flowPreferencesOf = (st) => st && st.__flowPreferences ? st.__flowPreferences : DEFAULT_FLOW_PREFERENCES
    const flowAutorefreshOf = (st) => {
      const ms = Number(flowPreferencesOf(st).refreshMs)
      return st.live && ms > 0 ? String(ms) : ''
    }
    const textField = (value, name, max) => {
      if (typeof value !== 'string' || !value.trim()) throw new Error('显示规则缺少 ' + name)
      const out = value.trim()
      if (out.length > max) throw new Error('显示规则的 ' + name + ' 最长 ' + max + ' 字符')
      return out
    }
    const optionalTextField = (value, name, max) => {
      if (value == null || value === '') return ''
      return textField(value, name, max)
    }
    const stringList = (value, name, maxItems, maxLength, required) => {
      if (value == null && !required) return []
      if (!Array.isArray(value) || (required && value.length === 0) || value.length > maxItems) {
        throw new Error('显示规则的 ' + name + ' 必须是 1–' + maxItems + ' 项字符串数组')
      }
      const out = []
      for (const item of value) {
        const s = textField(item, name, maxLength)
        if (!out.includes(s)) out.push(s)
      }
      return out
    }
    const normalizePresentationRules = (raw) => {
      let value = raw
      if (typeof value === 'string') {
        if (value.length > 16000) throw new Error('显示规则 JSON 不能超过 16000 字符')
        try { value = JSON.parse(value || '[]') } catch (e) { throw new Error('显示规则不是有效 JSON') }
      }
      if (!Array.isArray(value) || value.length > MAX_PRESENTATION_RULES) {
        throw new Error('显示规则必须是数组，最多 ' + MAX_PRESENTATION_RULES + ' 条')
      }
      return value.map((rule, index) => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('第 ' + (index + 1) + ' 条显示规则必须是对象')
        const color = rule.color == null || rule.color === '' ? '#81c784' : textField(rule.color, 'color', 7)
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('第 ' + (index + 1) + ' 条显示规则的 color 必须是 #RRGGBB')
        return {
          enabled: rule.enabled !== false,
          tools: stringList(rule.tools, 'tools', 8, 64, true),
          executables: stringList(rule.executables, 'executables', 12, 128, true),
          displayName: optionalTextField(rule.displayName, 'displayName', 80),
          actions: stringList(rule.actions, 'actions', 32, 64, false),
          badge: optionalTextField(rule.badge, 'badge', 12),
          color: color.toLowerCase(),
        }
      })
    }
    const commaList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
    const ruleFromFields = (fields, prefix) => ({
      enabled: fields[prefix + '.enabled'] !== '0',
      tools: commaList(fields[prefix + '.tools']),
      executables: commaList(fields[prefix + '.executables']),
      displayName: String(fields[prefix + '.displayName'] || ''),
      actions: commaList(fields[prefix + '.actions']),
      badge: String(fields[prefix + '.badge'] || ''),
      color: String(fields[prefix + '.color'] || ''),
    })
    const commandTokens = (command) => String(command || '').match(/"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+/g) || []
    const cleanToken = (token) => String(token || '').replace(/^[&'"(]+|['"),;]+$/g, '')
    const tokenBasename = (token) => {
      const clean = cleanToken(token).replace(/[\\/]+$/, '')
      const parts = clean.split(/[\\/]/)
      return (parts[parts.length - 1] || '').toLowerCase()
    }
    const commandOf = (call) => {
      try {
        const args = JSON.parse(call.argsRaw || '{}')
        return typeof args.command === 'string' ? args.command : ''
      } catch (e) { return '' }
    }
    const displayIdentity = (call, rules) => {
      const fallback = { name: call.name, meta: KIND_META[call.cat] || KIND_META.builtin }
      if (call.name === 'skill') {
        try {
          const args = JSON.parse(call.argsRaw || '{}')
          if (typeof args.name === 'string' && args.name.trim()) return { name: args.name.trim(), meta: KIND_META.skill }
        } catch (e) {}
        return fallback
      }
      if (!Array.isArray(rules) || !rules.length) return fallback
      const command = commandOf(call)
      if (!command) return fallback
      const tokens = commandTokens(command)
      for (const rule of rules) {
        if (!rule.enabled || !rule.tools.includes(call.name)) continue
        const wanted = rule.executables.map((value) => tokenBasename(value))
        const at = tokens.findIndex((token) => wanted.includes(tokenBasename(token)))
        if (at < 0) continue
        const action = cleanToken(tokens[at + 1] || '')
        if (rule.actions.length && !rule.actions.includes(action)) continue
        return {
          name: [rule.displayName, action].filter(Boolean).join(' '),
          meta: { label: rule.badge, color: rule.color, bg: rule.color + '1f' },
        }
      }
      return fallback
    }

    const pad2 = (n) => (n < 10 ? '0' : '') + n
    const fmtTime = (t) => {
      const d = new Date(t)
      if (isNaN(d.getTime())) return '' // 注入类事件可能缺 time 字段，防空值渲染出 NaN:NaN:NaN
      return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
    }
    const fmtDur = (ms) => ms == null ? '' : (ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's')
    const oneLine = (s, max) => {
      const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
      return t.length > max ? t.slice(0, max - 1) + '…' : t
    }
    const textOf = (blocks) => {
      if (!Array.isArray(blocks)) return ''
      return blocks.map((b) => (b && b.type === 'text' ? b.text : '')).filter(Boolean).join('\n')
    }

    // ---- 0.1.5 统一流折叠器（同一逻辑供实时叠加层与持久事件两条来源）----
    // AssistantStreamRecord[]（assistant/message / assistant/attempt 内嵌的紧凑流记录）
    // → [{ time, chunk }] 精确重放；text-chunks/reasoning-chunks/tool-call-chunks 的
    // time0+dt[] 前缀和还原每个 delta 的原始时间戳，'chunk' 记录原样透传。
    const expandStreamRecords = (stream) => {
      const out = []
      if (!Array.isArray(stream)) return out
      for (const rec of stream) {
        if (!rec || typeof rec !== 'object') continue
        if (rec.type === 'chunk') {
          if (rec.chunk && typeof rec.chunk === 'object') out.push({ time: rec.time, chunk: rec.chunk })
        } else if (rec.type === 'text-chunks' || rec.type === 'reasoning-chunks') {
          const texts = Array.isArray(rec.texts) ? rec.texts : []
          let t = typeof rec.time0 === 'number' ? rec.time0 : 0
          for (let i = 0; i < texts.length; i++) {
            if (i > 0 && Array.isArray(rec.dt)) t += typeof rec.dt[i - 1] === 'number' ? rec.dt[i - 1] : 0
            out.push({ time: t, chunk: { type: rec.type === 'text-chunks' ? 'text-delta' : 'reasoning-delta', index: rec.index, text: String(texts[i]) } })
          }
        } else if (rec.type === 'tool-call-chunks') {
          const args = Array.isArray(rec.args) ? rec.args : []
          let t = typeof rec.time0 === 'number' ? rec.time0 : 0
          for (let i = 0; i < args.length; i++) {
            if (i > 0 && Array.isArray(rec.dt)) t += typeof rec.dt[i - 1] === 'number' ? rec.dt[i - 1] : 0
            out.push({ time: t, chunk: { type: 'tool-call-delta', index: rec.index, id: rec.id, name: rec.name, argumentsDelta: String(args[i]) } })
          }
        }
      }
      return out
    }

    // 一个 attempt 的累计状态：assistant/live-chunk 瞬时累计与持久 stream 重放共用同一形状。
    // attemptId 是实时节点身份（assistant-attempt:<id>）；seq（浮点或整数）只用于排序与 UI 定位。
    const makeAttemptState = (attemptId, turn, step) => ({
      attemptId: String(attemptId || ''), turn, step,
      firstSeq: null, firstAt: null, lastAt: null,
      text: '', reasoning: '', toolCall: false,
      finishKind: '', failCode: '', failMsg: '', usage: null,
    })
    const applyChunkToAttempt = (a, time, chunk) => {
      if (a.firstAt == null) a.firstAt = time
      a.lastAt = time
      if (!chunk || typeof chunk !== 'object') return
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') a.text += chunk.text
      else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') a.reasoning += chunk.text
      else if (chunk.type === 'tool-call-delta') a.toolCall = true
      else if (chunk.type === 'usage' && chunk.usage) a.usage = chunk.usage
      else if (chunk.type === 'finish' && chunk.reason) {
        a.finishKind = String(chunk.reason.kind || '')
        const f = chunk.reason.failure
        if (f && typeof f === 'object') {
          a.failCode = typeof f.code === 'string' ? f.code : ''
          a.failMsg = typeof f.message === 'string' ? f.message : ''
        }
      }
    }
    // Client 叠加层传入的 attempt 快照（eventSource 瞬时条目在 Client 预折叠）→ 同一 attempt 状态
    const attemptFromSnapshot = (snap) => {
      const a = makeAttemptState(
        snap && snap.attemptId,
        snap && typeof snap.turn === 'number' ? snap.turn : null,
        snap && typeof snap.step === 'number' ? snap.step : null,
      )
      if (!snap) return a
      a.firstSeq = typeof snap.firstSeq === 'number' ? snap.firstSeq : null
      a.firstAt = typeof snap.firstAt === 'number' ? snap.firstAt : null
      a.lastAt = typeof snap.lastAt === 'number' ? snap.lastAt : a.firstAt
      // Remote JSON is a trust boundary. The Client normally applies the same
      // cap, but a stale or modified caller must not make the Host render an
      // unbounded live overlay.
      a.text = String(snap.text || '').slice(0, 8000)
      a.reasoning = String(snap.reasoning || '').slice(0, 8000)
      a.toolCall = Boolean(snap.toolCall)
      if (snap.finish && typeof snap.finish === 'object') {
        a.finishKind = String(snap.finish.kind || '')
        a.failCode = typeof snap.finish.code === 'string' ? snap.finish.code : ''
        a.failMsg = typeof snap.finish.message === 'string' ? snap.finish.message : ''
      }
      return a
    }

    // ---- 事件流 → 基础条目（统一折叠：live 叠加层 + 持久事件进同一次扫描）----
    // live = { sessionId, revision, attempts: [...], settled: [...] }：
    //   attempts —— 事件窗内仍在途的 attempt 快照（实时增长）；
    //   settled  —— 最近结算 attempt 的 { turn, step, firstSeq }（结算后卡片继承瞬时 firstSeq，
    //                框选/详情/滚动等 UI 状态在 settle 替换时不丢）。
    const parseItems = (events, live) => {
      const items = []
      const byCallId = {}
      const stepStarts = {} // turn:step → step/start 时间；助手运行计时从请求步骤开始，而不是首个 token 才开始
      const stepEnds = {} // turn:step → step/end 时间；无最终 message 的草稿据此落定（请求失败/中断）
      const turnEnds = {} // turn → turn/end 时间；step/end 缺失时的兜底落定依据
      const retriesByStep = {} // turn:step → dsh-llm-retry 的重试链（llm/retry 调度事件，按序追加）
      const retryById = {} // retryId → 链上条目；llm/retry-started 按 id 回填起跳时间
      let route = '' // 最近 request/header 的 provider/model，贴给后续助手消息卡
      let curTurn = null // 最近 turn/start 的轮次：user/message 不带 turn，用它推算归属
      // turn:step → 助手卡装配状态（durable message / durable attempts / 在途 live attempt 汇聚到同一张卡）
      const stepCards = new Map()

      const stepKey = (turn, step) => String(turn) + ':' + step
      const cardOf = (turn, step) => {
        const k = stepKey(turn, step)
        let c = stepCards.get(k)
        if (!c) {
          c = { key: k, turn, step, uiSeq: null, attempts: [], message: null, live: null }
          stepCards.set(k, c)
        }
        return c
      }

      // 先吸收 Client 叠加层的 attempt 快照（在途 attempt，重试换 attempt 归并同卡）
      if (live && Array.isArray(live.attempts)) {
        for (const snap of live.attempts) {
          if (!snap || snap.attemptId == null) continue
          const a = attemptFromSnapshot(snap)
          if (a.turn == null || a.step == null) continue
          cardOf(a.turn, a.step).live = a
        }
      }

      for (const ev of events) {
        if (!ev || typeof ev.seq !== 'number') continue
        const d = ev.data || {}
        if (ev.type === 'turn/start') { if (typeof d.turn === 'number') curTurn = d.turn; continue }
        if (ev.type === 'step/start') {
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          stepStarts[stepKey(turn, step)] = ev.time
          cardOf(turn, step)
          continue
        }
        if (ev.type === 'step/end') {
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          stepEnds[stepKey(turn, step)] = ev.time
          continue
        }
        if (ev.type === 'turn/end') {
          if (typeof d.turn === 'number') turnEnds[d.turn] = ev.time
          continue
        }
        // dsh-llm-retry 的持久事件：调度（含退避时长与触发失败码）写入等待期之前，起跳在重发时写入。
        // 重试不换 step 号——同 turn:step 的失败→等待→重发共享同一张助手卡，徽标直接挂卡上。
        if (ev.type === 'llm/retry') {
          const key = String(d.turn) + ':' + d.step
          const f = d.failure || {}
          const entry = { retry: d.retry, maxRetries: d.maxRetries, delayMs: d.delayMs, code: typeof f.code === 'string' ? f.code : '', message: typeof f.message === 'string' ? f.message : '', time: ev.time, startedAt: 0 }
          ;(retriesByStep[key] || (retriesByStep[key] = [])).push(entry)
          if (typeof d.retryId === 'string' && d.retryId) retryById[d.retryId] = entry
          continue
        }
        if (ev.type === 'llm/retry-started') {
          const r = typeof d.retryId === 'string' ? retryById[d.retryId] : null
          if (r) r.startedAt = ev.time
          continue
        }
        if (ev.type === 'request/header') {
          const cfg = d.header && d.header.config
          if (cfg && cfg.model) route = (cfg.provider ? cfg.provider + '/' : '') + cfg.model
          continue
        }
        if (ev.type === 'tool/call') {
          const it = {
            kind: 'call', seq: ev.seq, time: ev.time, turn: d.turn, step: d.step,
            name: String(d.name || '?'), cat: kindOf(String(d.name || '')),
            argsRaw: typeof d.arguments === 'string' ? d.arguments : '',
            status: 'pending', dur: null, resultText: '', outLen: 0,
          }
          items.push(it)
          if (d.callId != null) byCallId[String(d.callId)] = it
        } else if (ev.type === 'tool/result') {
          const m = d.message || {}
          // 0.1.7 的工具消息在 message 上记录调用 ID 和正文；旧日志把二者放在结果块里。
          let callId = m.toolCallId != null ? String(m.toolCallId)
            : m.source && m.source.kind === 'tool' && m.source.callId != null ? String(m.source.callId) : null
          let text = textOf(m.content)
          if (Array.isArray(m.content)) {
            for (const block of m.content) {
              if (callId == null && block && block.toolCallId != null) callId = String(block.toolCallId)
              if (!text && block) { const t = textOf(block.content); if (t) text = t }
            }
          }
          const failed = !!(d.error || m.isError || (Array.isArray(m.content) && m.content.some((block) => block && block.isError)))
          const it = callId ? byCallId[callId] : null
          if (it) {
            it.status = failed ? 'error' : 'ok'
            it.dur = ev.time - it.time
            it.resultText = text
            it.outLen = text.length
            it.resSeq = ev.seq // 结果事件位置：子代理出口卡对齐「结果之后的第一条消息」用
          }
        } else if (ev.type === 'user/message') {
          const src = d.source && d.source.kind ? String(d.source.kind) : 'user'
          const preview = oneLine(textOf(d.content), 110)
          // 空内容的上下文注入（subagent-settled 占位等）是噪声，不进流程图
          if (src !== 'user' && !preview) continue
          items.push({ kind: 'msg', role: src === 'user' ? 'user' : 'inject', seq: ev.seq, time: ev.time, turn: curTurn, preview, full: textOf(d.content) })
        } else if (ev.type === 'assistant/live-chunk') {
          // 客户端瞬时事件（测试/整窗透传路径；常规面板走 live.attempts 快照）。
          // 同一 attemptId 幂等累计；缺失 attemptId 的帧跳过（不产生重复卡）。
          if (d.attemptId == null) continue
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          const card = cardOf(turn, step)
          let a = card.live && card.live.attemptId === String(d.attemptId) ? card.live : null
          if (!a) {
            a = makeAttemptState(d.attemptId, turn, step)
            card.live = a
          }
          if (a.firstSeq == null) a.firstSeq = ev.seq
          applyChunkToAttempt(a, ev.time, d.chunk)
        } else if (ev.type === 'assistant/message' || ev.type === 'assistant/attempt') {
          // 持久结算事件：精确重放内嵌 stream；message 形成最终卡，attempt 形成失败/取消卡。
          const turn = typeof d.turn === 'number' ? d.turn : curTurn
          const step = typeof d.step === 'number' ? d.step : 0
          const card = cardOf(turn, step)
          const a = makeAttemptState(null, turn, step)
          for (const { time, chunk } of expandStreamRecords(d.stream)) applyChunkToAttempt(a, time, chunk)
          if (ev.type === 'assistant/message') {
            card.message = { ev, data: d, stream: a, route }
          } else {
            card.attempts.push({ ev, stream: a })
          }
        }
      }

      // ---- 装配：turn:step → 一张助手卡（实时草稿 → 结算替换，保留 UI 连续性）----
      for (const card of stepCards.values()) {
        const k = card.key
        // UI 连续性：结算事件继承在途/最近结算 attempt 的 firstSeq 作为卡片定位 seq
        let uiSeq = null
        if (card.live) uiSeq = card.live.firstSeq
        if (uiSeq == null && live && Array.isArray(live.settled)) {
          const hit = live.settled.find((s) => s && s.turn === card.turn && s.step === card.step && typeof s.firstSeq === 'number')
          if (hit) uiSeq = hit.firstSeq
        }
        let it
        if (card.message) {
          // 成功（或已中断但形成可见消息）的最终卡：durable message 是权威内容
          const { ev, data, stream, route: msgRoute } = card.message
          const m = data.message || {}
          const u = data.usage || stream.usage || null
          const finalText = textOf(m.content)
          it = {
            kind: 'msg', role: 'ai', seq: uiSeq != null ? uiSeq : ev.seq, time: ev.time, turn: card.turn, step: card.step,
            attemptId: card.live ? card.live.attemptId : '',
            akey: card.live ? 'assistant-attempt:' + card.live.attemptId : 'assistant-event:' + ev.seq,
            finalSeq: ev.seq, runStart: stepStarts[k] != null ? stepStarts[k] : (stream.firstAt != null ? stream.firstAt : ev.time),
            runDur: Math.max(0, ev.time - (stepStarts[k] != null ? stepStarts[k] : (stream.firstAt != null ? stream.firstAt : ev.time))),
            preview: oneLine(finalText, 110) || (stream.toolCall ? '（工具调用）' : (stream.reasoning ? oneLine(stream.reasoning, 110) : '（工具调用）')),
            full: finalText || stream.text || stream.reasoning,
            tok: u ? (u.outputTokens || 0) : null, route: msgRoute || route,
            streaming: false, settled: true,
            interrupted: data.interrupted === true,
            finishKind: stream.finishKind || (data.interrupted === true ? 'interrupted' : ''),
            failCode: '', failMsg: '',
          }
        } else if (card.attempts.length && !card.live) {
          // 已落定的失败/取消/重试前尝试：无在途 attempt、无 message → 失败终局卡
          const last = card.attempts[card.attempts.length - 1]
          const s = last.stream
          const failed = s.finishKind === 'error' || s.finishKind === 'aborted' || Boolean(s.failCode)
          const uiSeqFinal = uiSeq != null ? uiSeq : last.ev.seq
          const runFrom = stepStarts[k] != null ? stepStarts[k] : (s.firstAt != null ? s.firstAt : last.ev.time)
          const runTo = s.lastAt != null ? s.lastAt : last.ev.time
          it = {
            kind: 'msg', role: 'ai', seq: uiSeqFinal, time: last.ev.time, turn: card.turn, step: card.step,
            attemptId: '', akey: 'assistant-event:' + last.ev.seq, finalSeq: last.ev.seq,
            runStart: runFrom, runDur: Math.max(0, runTo - runFrom),
            preview: (s.text || s.reasoning ? oneLine(s.text || s.reasoning, 100) + ' ' : '') + (s.finishKind === 'aborted' ? '（已取消）' : '（生成失败）'),
            full: s.text || s.reasoning,
            tok: null, route, streaming: false, settled: true,
            interrupted: false, failed: s.finishKind === 'error' || Boolean(s.failCode),
            abandoned: s.finishKind === 'aborted',
            finishKind: s.finishKind, failCode: s.failCode || '', failMsg: s.failMsg || '',
          }
          if (!failed && !s.failCode && s.finishKind !== 'aborted') it.preview = oneLine(s.text || s.reasoning, 110) || '（尝试未形成消息）'
          // 步骤仍在开（无 step/end、无在途 live）且重试已调度未起跳 → 等待重试态：
          // 卡片落定但徽标显示退避倒计时（下一次 live attempt 到来时替换为流式卡）
          const rsEarly = retriesByStep[k]
          const stepOpen = stepEnds[k] == null && (card.turn == null || turnEnds[card.turn] == null)
          const pendRetry = rsEarly && rsEarly.length && !rsEarly[rsEarly.length - 1].startedAt
          if (rsEarly && rsEarly.length) it.retries = rsEarly
          if (stepOpen) {
            it.interrupted = !pendRetry // 步骤没结束也没有等待中的重试 → 视作被中断（兜底语义）
            it.awaitingRetry = Boolean(pendRetry)
          } else {
            it.interrupted = true
          }
          items.push(it)
          continue
        } else {
          // 实时草稿（事件窗在途 attempt）：无 durable message/attempt 落定
          const a = card.live
          if (!a) continue
          it = {
            kind: 'msg', role: 'ai', seq: a.firstSeq != null ? a.firstSeq : (a.firstAt != null ? a.firstAt : Date.now()),
            time: a.firstAt, turn: card.turn, step: card.step,
            attemptId: a.attemptId, akey: 'assistant-attempt:' + a.attemptId, finalSeq: null,
            runStart: stepStarts[k] != null ? stepStarts[k] : (a.firstAt != null ? a.firstAt : Date.now()),
            preview: '', full: a.text || a.reasoning,
            tok: null, route, streaming: true, settled: false,
            finishKind: a.finishKind, failCode: a.failCode || '', failMsg: a.failMsg || '',
          }
          const endedAt = stepEnds[k] != null ? stepEnds[k]
            : (card.turn != null && turnEnds[card.turn] != null ? turnEnds[card.turn] : null)
          if (endedAt != null && !a.text && !a.reasoning && !a.toolCall && a.finishKind === '') {
            // 步骤终结但没看到任何帧（事件窗断连且 baseline 未覆盖）→ 不凭空造卡
            continue
          }
          if (endedAt != null || a.finishKind === 'error' || a.finishKind === 'aborted') {
            // 步骤/轮次已终结（或收到终态失败帧）却没有 durable 结算 → 请求失败/中断/被重试调度：
            // 落定卡片（停止流光脉冲与耗时计时），标记中断并保留已生成片段
            it.streaming = false
            it.interrupted = true
            it.failed = a.finishKind === 'error' || Boolean(a.failCode)
            it.abandoned = a.finishKind === 'aborted'
            it.settled = a.finishKind !== ''
            const endRef = endedAt != null ? endedAt : (a.lastAt != null ? a.lastAt : it.runStart)
            it.runDur = Math.max(0, endRef - it.runStart)
            it.preview = (it.full ? oneLine(it.full, 100) + ' ' : '') + (it.abandoned ? '（已取消）' : '（生成已中断）')
          } else {
            it.preview = oneLine(it.full, 110) || (a.toolCall ? '正在准备工具调用…' : (a.reasoning ? '思考中…' : '正在生成…'))
          }
        }
        // 重试链挂卡（含重试后成功的卡与终局失败的中断卡）
        const rs = retriesByStep[k]
        if (rs && rs.length) it.retries = rs
        items.push(it)
      }
      // 统一按 seq 稳定排序：live 草稿的浮点 seq 天然落在相邻持久事件之间
      const order = items.map((it, i) => [it.seq, i, it])
      order.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]))
      return order.map((e) => e[2])
    }

    // ---- 条目 → 流程节点：消息各成节点；同步骤连续普通调用合成平行卡片组；子代理调用独立成分支节点 ----
    const buildNodes = (items) => {
      const nodes = []
      for (const it of items) {
        if (it.kind === 'msg') { nodes.push({ t: 'msg', it }); continue }
        if (it.cat === 'subagent') {
          const last = nodes[nodes.length - 1]
          // 同一 step 里连续启动的子代理是真并行分支：合成一个左泳道组，
          // 避免 N 个子代理被拆成 N 个空主干行、把画布垂直拉长。
          if (last && last.t === 'subs' && last.turn === it.turn && last.step === it.step) last.calls.push(it)
          else nodes.push({ t: 'subs', turn: it.turn, step: it.step, calls: [it] })
          continue
        }
        const last = nodes[nodes.length - 1]
        if (last && last.t === 'par' && last.turn === it.turn && last.step === it.step) last.calls.push(it)
        else nodes.push({ t: 'par', turn: it.turn, step: it.step, calls: [it] })
      }
      return nodes
    }

    // Only cache durable projections. Live overlays carry settle identities and must
    // always be folded afresh. Callers may settle top-level display fields locally.
    const durableProjectionCache = new Map()
    const projectFlowItems = (sid, log, live, replaySeq) => {
      const events = log.events || []
      const prefix = () => replaySeq == null ? events : events.filter((event) => Number(event.seq) <= replaySeq)
      if (live || log.unavailable || events.some((event) => event.type === 'assistant/live-chunk')) return parseItems(prefix(), live)
      // Some adapters mutate a returned events array without changing its count.
      // Exact source comparison prevents a same-count edit from reusing old nodes.
      let sourceJson
      try { sourceJson = JSON.stringify(events) } catch (e) { return parseItems(prefix(), live) }
      if (sourceJson.length > 2000000) return parseItems(prefix(), live)
      const count = log.count == null ? events.length : log.count
      const tailSeq = events.length ? events[events.length - 1].seq : null
      const cached = durableProjectionCache.get(sid)
      let items
      if (log.changed !== true && cached && cached.events === events && cached.length === events.length && cached.count === count && cached.tailSeq === tailSeq && cached.replaySeq === replaySeq && cached.sourceJson === sourceJson) items = cached.items
      else {
        items = parseItems(prefix())
        durableProjectionCache.delete(sid)
        durableProjectionCache.set(sid, { events, length: events.length, count, tailSeq, replaySeq, sourceJson, items })
        while (durableProjectionCache.size > 16 || [...durableProjectionCache.values()].reduce((sum, entry) => sum + entry.sourceJson.length, 0) > 8000000) durableProjectionCache.delete(durableProjectionCache.keys().next().value)
      }
      return items.map((item) => ({ ...item }))
    }

    const nodeKeyOf = (sid, it) => sid + '|' + it.kind + '|' + it.seq
    const nodeIdentityHtml = (it, st) => ' data-flow-node-key="' + esc(nodeKeyOf(st.sid || '', it)) + '" data-flow-node-kind="' + it.kind + '"'
    const bookmarkButtonHtml = (it, st) => {
      const key = nodeKeyOf(st.sid || '', it)
      const saved = Array.isArray(st.__flowBookmarks) && st.__flowBookmarks.some((b) => b.sessionId === st.sid && b.kind === it.kind && Number(b.seq) === it.seq)
      return '<button type="button" class="fl-bookmark-btn' + (saved ? ' is-bookmarked' : '') + '" data-flow-bookmark="1" data-node-key="' + esc(key) + '" data-sid="' + esc(st.sid || '') + '" data-kind="' + it.kind + '" data-seq="' + it.seq + '" aria-pressed="' + (saved ? 'true' : 'false') + '" aria-label="' + (saved ? '编辑节点标记' : '标记此节点') + '">' + (saved ? '已标记' : '标记') + '</button>'
    }
    const replayEventsOf = (events, st) => st.replaySeq == null ? events : events.filter((e) => Number(e.seq) <= st.replaySeq)
    const itemMatches = (it, st) => {
      if (st.flowRole !== 'all' && (it.kind === 'call' ? 'call' : it.role) !== st.flowRole) return false
      const failed = it.kind === 'call' ? it.status === 'error' : it.failed || (it.interrupted && it.failCode)
      const running = it.kind === 'call' ? it.status === 'pending' : it.streaming || it.awaitingRetry
      if (st.flowStatus === 'failed' && !failed) return false
      if (st.flowStatus === 'running' && !running) return false
      const query = (st.flowSearch || '').trim().toLocaleLowerCase()
      return !query || [it.full, it.preview, it.name, it.argsRaw, it.resultText, it.failMsg, it.failCode].filter(Boolean).join('\n').toLocaleLowerCase().includes(query)
    }
    const selectFlowNodes = (nodes, st, limit) => {
      const filtered = !!(st.flowSearch || st.flowRole !== 'all' || st.flowStatus !== 'all')
      const source = filtered && st.flowSearchScope === 'all' ? nodes : nodes.slice(-limit)
      const items = source.flatMap((n) => n.t === 'msg' ? [n.it] : n.calls)
      const matches = filtered ? items.filter((it) => itemMatches(it, st)) : items
      const result = filtered ? buildNodes(matches) : source
      return { shown: filtered ? result.slice(0, 200) : result, filtered, matches: matches.length, searched: items.length,
        truncated: filtered && result.length > 200, hasOlder: !filtered && nodes.length > source.length }
    }
    const queryToolbarHtml = (st, selection, events) => {
      const option = (value, label, current) => '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + label + '</option>'
      const maxSeq = events.reduce((max, e) => Math.max(max, Number(e.seq) || 0), 0)
      return '<details class="fl-query-bar" data-flow-disclosure="query"' + (selection.filtered ? ' open' : '') + '><summary title="查找与筛选">查找' + (selection.filtered ? ' · ' + selection.matches + ' 项' : '') + '</summary><div class="fl-filter-panel"><div class="fl-filter-row">' +
        '<label>查找<input class="tb-input" type="search" data-field="flowSearch" value="' + esc(st.flowSearch || '') + '" placeholder="消息、工具或错误" aria-label="查找节点"></label>' +
        '<label>范围<select class="tb-select" data-field="flowSearchScope" data-action-onchange="fsearch">' + option('loaded', '已加载节点', st.flowSearchScope) + option('all', '全会话日志', st.flowSearchScope) + '</select></label>' +
        '<label>类型<select class="tb-select" data-field="flowRole" data-action-onchange="ffilter">' + ['all', 'user', 'ai', 'call', 'inject'].map((value, i) => option(value, ['全部类型', '用户', '助手', '工具', '系统上下文'][i], st.flowRole)).join('') + '</select></label>' +
        '<label>状态<select class="tb-select" data-field="flowStatus" data-action-onchange="ffilter">' + ['all', 'running', 'failed'].map((value, i) => option(value, ['全部状态', '运行中', '失败'][i], st.flowStatus)).join('') + '</select></label>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="fsearch">查找</button><button type="button" class="tb-btn tb-btn-sm" data-action="fsearch-clear">清除筛选</button></div>' +
        '<p class="fl-search-summary">' + (st.flowSearchScope === 'all' ? '全会话已记录日志' : '当前已加载节点') + (st.replaySeq != null ? ' · 回放时点之前' : '') + ' · 已检查 ' + selection.searched + ' 项' + (selection.filtered ? ' · 命中 ' + selection.matches + ' 项' : '') + (selection.truncated ? ' · 显示前 200 个节点，请缩小条件' : '') + '</p></div></details>' +
        '<details class="fl-replay-bar" data-flow-disclosure="replay"' + (st.replaySeq != null ? ' open' : '') + '><summary title="只读回放">回放' + (st.replaySeq != null ? ' · seq ' + st.replaySeq : '') + '</summary><div class="fl-filter-panel"><div class="fl-filter-row">' +
        '<label>事件位置<input class="tb-input" type="number" min="0" max="' + maxSeq + '" step="1" data-field="flowReplaySeq" value="' + (st.replaySeq == null ? maxSeq : st.replaySeq) + '" aria-label="回放事件位置"></label>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="freplay">查看此时点</button><button type="button" class="tb-btn tb-btn-sm" data-action="freplay" data-step="-1">上一个事件</button><button type="button" class="tb-btn tb-btn-sm" data-action="freplay" data-step="1">下一个事件</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="freplay-live">返回最新</button></div><p class="tb-note">按已记录事件回放；此时点之后的结果和实时内容不会显示。</p></div></details>'
    }

    // ---- 子代理调用 → 目标会话 id（旧版结果文本 / alpha.4 send_message）----
    const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i
    const childIdOf = (call) => {
      const m = /(?:subagent|agent)\s+([0-9a-f]{8}-[0-9a-f-]{27,})/i.exec(call.resultText || '')
      if (m) return m[1]
      if (call && call.name === 'send_message') {
        try {
          const args = JSON.parse(call.argsRaw || '{}')
          const id = args && typeof args.agent_id === 'string' ? args.agent_id.trim() : ''
          if (SESSION_ID_RE.test(id)) return id
        } catch (e) {}
      }
      return null
    }
    // 子代理分支：从子会话日志提取紧凑步骤流（限量；读失败/未启动给占位）
    const childRows = async (childId, cap) => {
      const r = await readLog(childId)
      if (!r.events || !r.events.length) return { rows: [], live: false, total: 0 }
      const items = parseItems(r.events)
      const rows = []
      for (const it of items) {
        if (it.kind === 'msg') {
          if (it.role === 'ai') rows.push({ txt: it.preview, cls: 'ai' })
        } else {
          const km = KIND_META[it.cat] || KIND_META.builtin
          rows.push({ txt: it.name + ' ' + oneLine(it.argsRaw, 40), cls: '', pill: km.label, status: it.status, dur: it.dur })
        }
      }
      let live = false
      try {
        const agentsSvc = ctx.get('agents')
        if (agentsSvc) {
          const agent = agentsSvc.get(childId)
          live = !!(agent && agent.status === 'running')
        } else {
          // 旧版 harness/测试环境没有 agents 状态面，只能以仍挂载的 session 作为兼容兜底。
          const sessionsSvc = ctx.get('sessions')
          live = !!(sessionsSvc && sessionsSvc.get(childId))
        }
      } catch (e) {}
      return { rows: rows.slice(-cap), live, total: rows.length }
    }

    // ---- 渲染 ----
    const statusGlyph = (s, dur) => {
      if (s === 'ok') return '<span class="fl-status" style="color:var(--tb-done-text,#81c784)">已完成 · ' + fmtDur(dur) + '</span>'
      if (s === 'error') return '<span class="fl-status" style="color:var(--tb-danger-text,#f28b82)">失败 · ' + fmtDur(dur) + '</span>'
      return '<span class="fl-spin" aria-hidden="true"></span><span class="fl-status">运行中</span>'
    }

    const syncStatusHtml = (st) => '<span class="fl-sync-status' + (st.live ? '' : ' is-paused') + '" data-flow-sync-state="' + (st.live ? 'live' : 'paused') + '">' + (st.live ? '已同步' : '已暂停同步') + '</span>'
    const toolbarMoreHtml = (st, help, technical) => '<details class="fl-toolbar-more" data-flow-disclosure="more"><summary>更多</summary><div class="fl-toolbar-menu">' +
      '<button type="button" class="tb-btn tb-btn-sm" data-flow-bookmarks="1">标记</button><button type="button" class="tb-btn tb-btn-sm" data-flow-export="1">导出</button>' +
      (st.zoom ? '<button type="button" class="tb-btn tb-btn-sm" data-flow-compare-preview="1">比较所选结论</button>' : '') +
      '<button type="button" class="tb-btn tb-btn-sm" data-action="refresh">立即刷新</button>' +
      '<button type="button" class="tb-chip" data-action="toggle-live" aria-pressed="' + (st.live ? 'true' : 'false') + '">' + (st.live ? '暂停自动同步' : '恢复自动同步') + '</button>' +
      '<button type="button" class="tb-chip" data-action="toggle-follow" aria-pressed="' + (st.follow ? 'true' : 'false') + '" title="查看分支或子代理时，同时切换 DeepSeek Harness 主会话">查看时同步切换主会话：' + (st.follow ? '开' : '关') + '</button>' +
      (technical ? '<details class="fl-technical-info" data-flow-disclosure="technical:session"><summary>技术信息</summary><p class="tb-note">' + esc(technical) + '</p></details>' : '') +
      '<details class="fl-help" data-flow-disclosure="help"><summary>使用说明</summary><p class="tb-note fl-help-text">' + esc(help) + '</p></details>' +
      '</div></details>'
    const inspectorBackHtml = (seq) => '<button type="button" class="fl-rail-x fl-rail-back" data-action="fdetail" data-seq="' + seq + '" aria-label="关闭详情并返回流程" title="关闭详情（Escape）">← 返回</button>'
    const inspectorTechnicalHtml = (seq, text) => '<details class="fl-technical-info" data-flow-disclosure="technical:' + seq + '"><summary>技术信息</summary><p class="tb-note">' + esc(text) + '</p></details>'

    // 进出摘要：传入/返回（用户核心诉求——看到传给 skill 什么、skill 返回什么）
    // 传入：从 arguments JSON 提取最有信息量的字段（command/file_path/pattern/prompt…），而非整段 JSON
    const ARG_KEYS = ['command', 'file_path', 'path', 'pattern', 'query', 'q', 'description', 'prompt', 'text', 'content', 'url', 'name', 'key', 'expression', 'expr', 'code', 'script', 'tool', 'method', 'message', 'input', 'old_string', 'new_string']
    const inSummary = (c) => {
      try {
        const a = JSON.parse(c.argsRaw || '{}')
        for (const k of ARG_KEYS) {
          if (typeof a[k] === 'string' && a[k].trim()) return k + ': ' + oneLine(a[k], 72)
          if (typeof a[k] === 'number' || typeof a[k] === 'boolean') return k + ': ' + a[k]
        }
        const ks = Object.keys(a)
        if (ks.length) return ks[0] + ': ' + oneLine(String(a[ks[0]]), 72)
        return '（无参数）'
      } catch (e) { return oneLine(c.argsRaw, 72) || '（无参数）' }
    }
    // 返回：结果首条有意义文本 + 体量 + 状态
    const outSummary = (c) => {
      if (c.status === 'pending') return null
      if (c.status === 'error') {
        const t = (c.resultText || '').trim()
        return { text: t ? oneLine(t, 72) : '（调用失败）', err: true }
      }
      const lines = String(c.resultText || '').split('\n').map((s) => s.trim()).filter(Boolean)
      const first = lines[0] || ''
      return { text: (first ? oneLine(first, 72) : '（空返回）') + (c.outLen > 72 ? ' · ' + fmtSize(c.outLen) : ''), err: false }
    }
    // 调用连线单元（形态约定·手绘参考图：主干卡在左、工具卡在右，中间两条水平连线——
    // 上=输入摘要 + 横线 + ▶ 右出；下=◀ + 横线 + 输出摘要 回左；输出线绿色系、错误红色系、进行中虚线）；
    // 进行中的工具卡高亮脉冲（调用到哪步哪步亮）；点击工具卡展开完整传入/返回（详情挂卡下方）
    const renderCallWire = (c, expandedSeq, presentationRules, st = {}) => {
      const identity = displayIdentity(c, presentationRules)
      const km = identity.meta
      const isExp = expandedSeq === c.seq
      const pending = c.status === 'pending'
      const o = outSummary(c)
      return '<div class="fl-wp" data-flow-card="' + c.seq + '" data-flow-status="' + c.status + '">' +
          '<div class="fl-wl"><span class="fl-wl-txt">输入 ' + esc(inSummary(c)) + '</span>' +
            '<span class="fl-wl-row"><span class="fl-wl-line"></span><span class="fl-wl-arr">▶</span></span></div>' +
          (pending
            ? '<div class="fl-wl fl-wl-b fl-wl-wait"><span class="fl-wl-txt">输出 进行中…</span>' +
              '<span class="fl-wl-row"><span class="fl-wl-arr">◀</span><span class="fl-wl-line"></span></span></div>'
            : '<div class="fl-wl fl-wl-b' + (o && o.err ? ' fl-wl-err' : '') + '"><span class="fl-wl-txt">输出 ' + esc(o ? o.text : '') + '</span>' +
              '<span class="fl-wl-row"><span class="fl-wl-arr">◀</span><span class="fl-wl-line"></span></span></div>') +
        '</div>' +
        '<div class="fl-callside">' +
          '<button type="button" class="fl-iocard' + (pending && st.replaySeq == null ? ' fl-live' : '') + (isExp ? ' fl-on' : '') + (o && o.err ? ' fl-err' : '') + '" data-action="fdetail" data-seq="' + c.seq + '" data-flow-select-seq="' + c.seq + '"' + nodeIdentityHtml(c, st) + ' aria-expanded="' + (isExp ? 'true' : 'false') + '" aria-label="查看工具详情：' + esc(identity.name) + '" title="查看完整输入与输出">' +
            '<span class="fl-iohead">' + (km.label ? '<span class="fl-tag" style="--fg-tool-color:' + km.color + ';color:' + km.color + ';background:' + km.bg + '">' + esc(km.label) + '</span>' : '') +
            '<span class="fl-name">' + esc(identity.name) + '</span>' +
            (pending && st.replaySeq != null ? '<span class="fl-status">此时尚未完成</span>' : pending ? '<span class="fl-spin" aria-hidden="true"></span><span class="fl-time" data-flow-timer="' + c.time + '" data-flow-timer-prefix="运行中 · ">运行中</span>' : statusGlyph(c.status, c.dur)) + '</span>' +
          '</button>' +
        '</div>'
    }

    // 同一步骤的多个并行调用（>1）用虚线外框 + 「并行 ×N」角标圈成一组；单调用保持散卡
    const grpSide = (node, units) => {
      const n = node.calls.length
      if (n < 2) return '<div class="fl-lane-side">' + units + '</div>'
      return '<div class="fl-lane-side fl-grp"><span class="fl-grp-tag">并行 ×' + n + '</span>' + units + '</div>'
    }

    // 泳道中列包装：连接符（▼ 上方空隙由 ::before 主干线自适应填满，▼ 贴内容顶）+ 内容 + 对称弹性空间
    // —— 卡片保持垂直居中，▼ 始终落在「上一张卡 → 这一张卡」的空隙底端（先线后箭头）；可视首行不加（顶部不悬空）
    const connMain = (content, withConn) =>
      (withConn ? '<div class="fl-conn"><span class="fl-arrow">▼</span></div>' : '') +
      content +
      (withConn ? '<span class="fl-conn-gap"></span>' : '')

    // 孤立调用组（前无助手消息，如连续工具步）：中列只画主干竖线贯穿——无卡的行不放 ▼ 连接符（线本身即连续性）
    const renderPar = (node, expandedSeq, presentationRules, st) => {
      const units = node.calls.map((c) => renderCallWire(c, expandedSeq, presentationRules, st)).join('')
      return '<div class="fl-lane"><div></div>' +
        '<div class="fl-lane-main"><span class="fl-lane-line"></span></div>' +
        grpSide(node, units) +
      '</div>'
    }

    // 重试/失败徽标（llm/retry 链 + 终态错误码）：等待中显示退避倒计时（面板 2s 重拉自动递减）；
    // 起跳后按卡片终局判定成功/失败；调度后未起跳即终结 = 未成行
    const retryBadgeHtml = (it) => {
      let out = ''
      const rs = it.retries
      if (rs && rs.length) {
        const last = rs[rs.length - 1]
        const max = typeof last.maxRetries === 'number' ? '/' + last.maxRetries : ''
        const tip = esc((last.code || '') + (last.message ? '：' + last.message : ''))
        if ((it.streaming || it.awaitingRetry) && !last.startedAt) {
          const remain = Math.max(0, Math.ceil((last.time + (last.delayMs || 0) - Date.now()) / 1000))
          out += '<span class="fl-retry fl-retry-wait" title="' + tip + '">⟳ 等待重试 ' + last.retry + max + (remain ? ' · ' + remain + 's' : '') + '</span>'
        } else if (it.streaming) {
          out += '<span class="fl-retry fl-retry-wait" title="' + tip + '">⟳ 重试 ' + last.retry + max + ' · 进行中</span>'
        } else if (!last.startedAt) {
          out += '<span class="fl-retry fl-retry-cancel" title="退避等待期间步骤/轮次已结束">⟳ 重试 ' + last.retry + max + ' 未成行</span>'
        } else if (it.interrupted) {
          out += '<span class="fl-retry fl-retry-fail" title="' + tip + '">⟳ 重试 ' + last.retry + max + ' · 失败</span>'
        } else {
          out += '<span class="fl-retry fl-retry-ok" title="' + tip + '">⟳ 重试 ' + last.retry + max + ' · 成功</span>'
        }
      }
      if (it.interrupted && it.failCode) {
        out += '<span class="fl-retry fl-retry-fail" title="' + esc(it.failMsg || '') + '">✗ ' + esc(it.failCode) + '</span>'
      }
      if (it.finishKind === 'max-tokens') {
        out += '<span class="fl-retry fl-retry-cancel" title="输出因 max-tokens 长度上限截断">⤒ 已达上限</span>'
      }
      return out
    }

    const msgCardInner = (it, expandedSeq, live, st = {}) => {
      const isUser = it.role === 'user'
      const isAi = it.role === 'ai'
      const aiRunning = isAi && it.streaming && st.replaySeq == null
      const color = isUser ? 'var(--tb-done-text,#81c784)' : isAi ? 'var(--tb-active-text,#7fa7f0)' : 'var(--tb-text-3,#777884)'
      const label = isUser ? '用户' : isAi ? '助手' : '系统上下文'
      // 卡片统一面片底色（fl-node），角色色只落在左侧色条 + 几何符号/tag 上，避免整卡彩色半透明的杂乱感
      // 用户/助手/注入卡均可点开右侧详情浮层看完整内容（与工具卡同一交互）；live=进行中 → 与工具卡同款流光脉冲
      // data-flow-state 暴露折叠器终态（streaming/settled/failed/abandoned）；data-flow-attempt 带实时 attempt 身份
      const branchSeq = it.finalSeq != null ? it.finalSeq : it.seq
      const flowState = it.streaming ? 'streaming' : (it.abandoned ? 'abandoned' : (it.failed || (it.interrupted && it.failCode) ? 'failed' : 'settled'))
      const branch = isAi && !it.streaming && st.replaySeq == null
        ? '<button type="button" class="fl-branch-btn" data-flow-branch data-seq="' + branchSeq + '" title="从这条助手消息在 Harness 中创建新分支" aria-label="在新对话中分支">' +
          '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v5a3 3 0 0 0 3 3h4"/><path d="M8 5l3-3 3 3"/><path d="M11 2v4"/><path d="M9 9l2 2-2 2"/></svg></button>'
        : ''
      const card = '<div class="fl-node' + (expandedSeq === it.seq ? ' fl-on' : '') + (live ? ' fl-live' : '') + '" style="border-left-color:' + color + '" data-flow-main-card="' + it.seq + '" data-flow-role="' + it.role + '" data-flow-state="' + flowState + '"' + (isAi && it.attemptId ? ' data-flow-attempt="' + esc(it.attemptId) + '"' : '') + ' data-flow-select-seq="' + it.seq + '"' + nodeIdentityHtml(it, st) + '>' +
        '<button type="button" class="fl-node-open" data-action="fdetail" data-seq="' + it.seq + '" aria-expanded="' + (expandedSeq === it.seq ? 'true' : 'false') + '" aria-label="查看' + label + '详情" title="查看完整消息">' +
        '<span class="fl-node-head"><span class="fl-glyph" aria-hidden="true" style="color:' + color + '">' + (isUser ? '▲' : isAi ? '◆' : '■') + '</span><span class="fl-tag" style="color:' + color + '">' + label + '</span>' +
        (isAi && it.route ? '<span class="fl-model">' + esc(String(it.route).split('/').pop()) + '</span>' : '') +
        '<span class="fl-node-meta">' +
        (fmtTime(it.time) ? '<span class="fl-time">' + fmtTime(it.time) + '</span>' : '') +
        (aiRunning && it.runStart ? '<span class="fl-time" data-flow-timer="' + it.runStart + '" data-flow-timer-prefix="生成中 · ">生成中</span>' : (isAi && it.interrupted ? '<span class="fl-time">' + (it.abandoned ? '已取消' : '已中断') + '</span>' : (isAi && it.runDur != null && !it.interrupted ? '<span class="fl-time">' + fmtDur(it.runDur) + '</span>' : ''))) +
        '</span>' +
        (isAi ? retryBadgeHtml(it) : '') + '</span>' +
        '<span class="fl-preview"' + (it.interrupted ? ' style="color:var(--tb-danger-text,#f28b82)"' : '') + '>' + esc(it.preview || '（空）') + '</span></button>' + branch + bookmarkButtonHtml(it, st) +
      '</div>'
      // 折叠只影响呈现；原始节点、seq 与框选上下文仍完整保留。
      return !isUser && !isAi
        ? '<details class="fl-system-context" data-flow-disclosure="system:' + it.seq + '"' + (expandedSeq === it.seq ? ' open' : '') + '><summary>系统上下文<span class="tb-note"> · 1 项</span></summary>' + card + '</details>'
        : card
    }

    const renderMsg = (it, expandedSeq, withConn, live, st) => '<div class="fl-lane"><div></div><div class="fl-lane-main">' + connMain(msgCardInner(it, expandedSeq, live, st), withConn) + '</div><div></div></div>'

    const copyButtonHtml = '<button type="button" class="fl-copy-btn" data-flow-copy="1" title="复制内容到剪贴板" aria-label="复制内容到剪贴板">' +
      '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11H2.5A1.5 1.5 0 0 1 1 9.5v-7A1.5 1.5 0 0 1 2.5 1h7A1.5 1.5 0 0 1 11 2.5V3"/></svg></button>'
    const markdownPreviewButtonHtml = (seq) => '<button type="button" class="fl-md-preview-btn" data-flow-markdown-preview="1" data-flow-markdown-key="' + seq + '" title="Markdown 预览" aria-label="Markdown 预览" aria-pressed="false">' +
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4S1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.8"/></svg></button>'

    const skillDetailOf = (c) => {
      if (c.name !== 'skill' || c.status !== 'ok') return null
      let requestedName = ''
      try {
        const args = JSON.parse(c.argsRaw || '{}')
        if (typeof args.name === 'string') requestedName = args.name.trim()
      } catch (e) {}
      const raw = String(c.resultText || '')
      const contentMatch = /<skill_content\b[^>]*\bname=(['"])(.*?)\1[^>]*>/i.exec(raw)
      const resourcesMatch = /<skill_resources>\s*([\s\S]*?)\s*<\/skill_resources>/i.exec(raw)
      const instructionsMatch = /<skill_instructions>\s*([\s\S]*?)\s*<\/skill_instructions>/i.exec(raw)
      if (!instructionsMatch) return null
      const name = (contentMatch && contentMatch[2].trim()) || requestedName || 'skill'
      const resources = resourcesMatch ? resourcesMatch[1].trim() : ''
      const baseMatch = /^Base directory for this skill:\s*(.+)$/mi.exec(resources)
      const baseDir = baseMatch ? baseMatch[1].trim() : ''
      const resourceNote = resources.replace(/^Base directory for this skill:\s*.+(?:\r?\n)?/mi, '').trim()
      return { name, raw, instructions: instructionsMatch[1].trim(), baseDir, resourceNote }
    }

    const skillDetailRail = (c, anim, st) => {
      const skill = skillDetailOf(c)
      if (!skill) return null
      const cap = 16000
      const instructions = skill.instructions.length > cap ? skill.instructions.slice(0, cap) + '\n…（截断，共 ' + skill.instructions.length + ' 字符）' : skill.instructions
      const raw = skill.raw.length > cap ? skill.raw.slice(0, cap) + '\n…（截断，共 ' + skill.raw.length + ' 字符）' : skill.raw
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '" data-flow-inspector="' + c.seq + '" role="region" aria-label="技能详情" data-flow-markdown-detail="1"><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head">' + inspectorBackHtml(c.seq) + bookmarkButtonHtml(c, st) + '<span class="fl-rail-title">技能 · ' + esc(skill.name) + '</span></div>' +
        '<div class="fl-rail-body" data-flow-markdown-body="1" data-flow-markdown-key="' + c.seq + '" data-flow-markdown-streaming="0">' +
          '<div class="fl-skill-hero"><span class="fl-tag">技能</span><strong>' + esc(skill.name) + '</strong>' + statusGlyph(c.status, c.dur) + '</div>' +
          (skill.baseDir ? '<div class="fl-skill-field"><span>基础目录</span><code>' + esc(skill.baseDir) + '</code></div>' : '') +
          (skill.resourceNote ? '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">资源说明</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(skill.resourceNote) + '</pre></div>' : '') +
          '<div class="fl-sec fl-skill-instructions"><div class="fl-sec-head"><span class="fl-sec-label">使用说明</span>' + markdownPreviewButtonHtml(c.seq) + copyButtonHtml + '</div>' +
          '<pre class="fl-pre" data-flow-markdown-source="1">' + esc(instructions || '（空）') + '</pre></div>' +
          '<details class="fl-skill-raw"><summary>原始返回</summary><div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">完整 XML' + (skill.raw.length > cap ? '（截断）' : '') + '</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(raw || '（空）') + '</pre></div></details>' +
        '</div></div>'
    }

    // 完整详情 → 右侧浮层（不插入流程流撑高内容：展开/收起零跳跃，滚动位置不动）：
    // 完整输入参数（美化 JSON）+ 完整返回结果（均截断标注，防大参数撑爆 HTML）；头部 ✕ 或再点卡片关闭
    const detailRail = (c, anim, presentationRules, st) => {
      const skill = skillDetailRail(c, anim, st)
      if (skill) return skill
      const identity = displayIdentity(c, presentationRules)
      let input = c.argsRaw || ''
      try { input = JSON.stringify(JSON.parse(c.argsRaw || '{}'), null, 2) } catch (e) {}
      const cap = 8000
      const inShown = input.length > cap ? input.slice(0, cap) + '\n…（截断，共 ' + input.length + ' 字符）' : input
      const out = c.status === 'pending' ? '（进行中，尚无返回）' : (c.resultText || '（空返回）')
      const outShown = out.length > cap ? out.slice(0, cap) + '\n…（截断，共 ' + out.length + ' 字符）' : out
      // anim=是否新展开（轮询重渲染不重播滑入动画，防闪烁）
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '" data-flow-inspector="' + c.seq + '" role="region" aria-label="工具详情"><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head">' + inspectorBackHtml(c.seq) + bookmarkButtonHtml(c, st) + '<span class="fl-rail-title">工具 · ' + esc(identity.name) + '</span></div>' +
        '<div class="fl-rail-body fl-tool-io">' +
          '<div class="fl-detail-status">' + statusGlyph(c.status, c.dur) + '</div>' +
          '<details open class="fl-tool-input" data-flow-disclosure="input:' + c.seq + '"><summary>输入' + (input.length > cap ? '（截断）' : '') + '</summary><div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">完整参数</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(inShown) + '</pre></div></details>' +
          '<div class="fl-sec' + (c.status === 'error' ? ' fl-detail-error' : '') + '"><div class="fl-sec-head"><span class="fl-sec-label">输出' + (c.outLen ? '（' + fmtSize(c.outLen) + '）' : '') + '</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(outShown) + '</pre></div>' +
          inspectorTechnicalHtml(c.seq, '工具 ' + c.name + ' · seq ' + c.seq + (fmtTime(c.time) ? ' · 时间 ' + fmtTime(c.time) : '')) +
        '</div>' +
      '</div>'
    }

    // 消息详情浮层（用户/助手/注入卡点击）：角色 + 时间/模型/tokens 元信息 + 完整内容（截断标注）
    const msgRail = (it, anim, st) => {
      const label = it.role === 'user' ? '用户消息' : it.role === 'ai' ? '助手消息' : '系统上下文'
      const cap = 8000
      const full = String(it.full || it.preview || '')
      const shown = full.length > cap ? full.slice(0, cap) + '\n…（截断，共 ' + full.length + ' 字符）' : full
      const meta = []
      if (fmtTime(it.time)) meta.push('时间 ' + fmtTime(it.time))
      if (it.route) meta.push('模型 ' + it.route)
      if (it.attemptId) meta.push('attempt ' + String(it.attemptId).slice(0, 12))
      if (it.tok) meta.push('输出 +' + it.tok + ' tok')
      if (it.runDur != null) meta.push('耗时 ' + fmtDur(it.runDur))
      meta.push('seq ' + it.seq)
      if (it.finishKind && it.finishKind !== 'stop') meta.push('结束 ' + it.finishKind)
      if (it.failCode) meta.push('错误 ' + it.failCode + (it.failMsg ? '：' + oneLine(it.failMsg, 80) : ''))
      if (it.retries && it.retries.length) meta.push('重试 ' + it.retries.length + ' 次（' + it.retries.map((r) => r.code || '?').join(' → ') + '）')
      // 与外层助手卡同款分支按钮：详情头部可直接从这条消息创建新分支（复用 data-flow-branch 委托）
      const branch = it.role === 'ai' && !it.streaming && st.replaySeq == null
        ? '<button type="button" class="fl-branch-btn" data-flow-branch data-seq="' + (it.finalSeq != null ? it.finalSeq : it.seq) + '" title="从这条助手消息在 Harness 中创建新分支" aria-label="在新对话中分支">' +
          '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v5a3 3 0 0 0 3 3h4"/><path d="M8 5l3-3 3 3"/><path d="M11 2v4"/><path d="M9 9l2 2-2 2"/></svg></button>'
        : ''
      const markdown = it.role === 'ai'
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '" data-flow-inspector="' + it.seq + '" role="region" aria-label="' + label + '详情"' + (markdown ? ' data-flow-markdown-detail="1"' : '') + '><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head">' + inspectorBackHtml(it.seq) + bookmarkButtonHtml(it, st) + '<span class="fl-rail-title">' + label + '</span>' + branch + '</div>' +
        '<div class="fl-rail-body"' + (markdown ? ' data-flow-markdown-body="1" data-flow-markdown-key="' + it.seq + '" data-flow-markdown-streaming="' + (it.streaming ? '1' : '0') + '"' : '') + '>' +
          (it.interrupted ? '<div class="fl-detail-error">' + esc(it.failMsg || (it.abandoned ? '生成已取消' : '生成失败或已中断')) + '</div>' : it.streaming ? '<div class="fl-detail-status">正在生成</div>' : '') +
          '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">完整内容' + (full.length > cap ? '（截断）' : '') + '</span>' + (markdown ? markdownPreviewButtonHtml(it.seq) : '') + copyButtonHtml + '</div><pre class="fl-pre"' + (markdown ? ' data-flow-markdown-source="1"' : '') + '>' + esc(shown || '（空）') + '</pre></div>' +
          inspectorTechnicalHtml(it.seq, meta.join(' · ')) +
        '</div>' +
      '</div>'
    }

    const presentationRulesRail = (st, anim) => {
      const value = JSON.stringify(st.presentationRules || [], null, 2)
      const example = '[\n  {\n    "enabled": true,\n    "tools": ["pwsh"],\n    "executables": ["engram-memory.ps1"],\n    "displayName": "engram-lattice",\n    "actions": ["search", "recall", "memory"],\n    "badge": "记忆",\n    "color": "#81c784"\n  }\n]'
      const trashIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 2.5h4l.7 2H5.3l.7-2Z"/><path d="M4.5 4.5l.6 9h5.8l.6-9M7 7v4M9 7v4"/></svg>'
      const chevronIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5.5 3.5 4.5 4.5-4.5 4.5"/></svg>'
      const plusIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>'
      const input = (field, value, placeholder) => '<input class="tb-input" data-field="' + field + '" value="' + esc(value) + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>'
      const fieldsFor = (prefix, rule) => '<div class="fl-rule-grid">' +
        '<label><span>原始工具</span>' + input(prefix + '.tools', (rule.tools || []).join(', '), 'pwsh, bash') + '</label>' +
        '<label><span>可执行文件</span>' + input(prefix + '.executables', (rule.executables || []).join(', '), 'tool.ps1, tool') + '</label>' +
        '<label><span>显示名称</span>' + input(prefix + '.displayName', rule.displayName || '', '可留空') + '</label>' +
        '<label><span>子命令</span>' + input(prefix + '.actions', (rule.actions || []).join(', '), 'search, recall') + '</label>' +
        '<label><span>徽章</span>' + input(prefix + '.badge', rule.badge || '', '可留空') + '</label>' +
        '<label><span>颜色</span><input class="fl-rule-color" type="color" data-field="' + prefix + '.color" value="' + esc(rule.color || '#81c784') + '"></label>' +
      '</div>'
      const editor = (prefix, rule, saveAction, index) => '<div class="fl-rule-editor">' +
        '<input type="hidden" data-field="' + prefix + '.enabled" value="' + (rule.enabled ? '1' : '0') + '">' + fieldsFor(prefix, rule) +
        '<div class="fl-rule-editor-actions"><button type="button" class="tb-btn tb-btn-sm" data-flow-rule-cancel="1">取消</button>' +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-action="' + saveAction + '"' + (index == null ? '' : ' data-index="' + index + '"') + '>保存</button></div></div>'
      const rows = (st.presentationRules || []).map((rule, index) => {
        const title = rule.displayName || '未命名规则'
        const summary = rule.tools.join(', ') + ' · ' + rule.executables.length + ' 个程序 · ' + (rule.actions.length || '任意') + ' 个子命令'
        return '<section class="fl-rule-card' + (!rule.enabled ? ' fl-rule-off' : '') + '"><div class="fl-rule-summary">' +
          '<button type="button" class="fl-rule-main" data-flow-rule-edit="1" title="展开编辑规则" aria-expanded="false">' +
            '<span class="fl-rule-dot" style="background:' + esc(rule.color) + '"></span>' +
            (rule.badge ? '<span class="fl-rule-badge" style="color:' + esc(rule.color) + ';background:' + esc(rule.color) + '1f">' + esc(rule.badge) + '</span>' : '') +
            '<span class="fl-rule-copy"><strong>' + esc(title) + '</strong><small>' + esc(summary) + '</small></span>' +
            '<span class="fl-rule-chevron">' + chevronIcon + '</span></button>' +
          '<button type="button" class="fl-rule-switch' + (rule.enabled ? ' is-on' : '') + '" data-action="ftoggle-rule" data-index="' + index + '" title="' + (rule.enabled ? '停用规则' : '启用规则') + '" aria-label="' + (rule.enabled ? '停用规则' : '启用规则') + '" aria-pressed="' + (rule.enabled ? 'true' : 'false') + '"><span></span></button>' +
          '<button type="button" class="fl-rule-icon fl-rule-delete" data-action="fdelete-rule" data-index="' + index + '" title="删除规则" aria-label="删除规则">' + trashIcon + '</button></div>' +
          editor('flowRule.' + index, rule, 'fsave-rule', index) + '</section>'
      }).join('')
      const empty = '<div class="tb-notice">暂无规则。点击“添加规则”，或展开 JSON 源码导入。</div>'
      const blank = { tools: [], executables: [], displayName: '', actions: [], badge: '', color: '#81c784' }
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '"><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head"><span class="fl-rail-title">工具显示规则</span><button type="button" class="fl-rule-add" data-flow-rule-new="1" aria-expanded="false">' + plusIcon + '<span>添加规则</span></button>' +
        '<button type="button" class="fl-rail-x" data-action="fsettings" title="关闭设置">✕</button></div>' +
        '<div class="fl-rail-body">' +
          '<div class="tb-note">规则只改变流镜中的标题和徽章；原始工具名、参数、结果及会话日志保持不变。按顺序匹配，首条命中生效。displayName 为空时不添加名称，badge 为空时不显示徽章。</div>' +
          '<div class="fl-rule-list">' + (rows || empty) + '</div>' +
          '<section class="fl-rule-card fl-rule-new"><div class="fl-rule-new-title">新增规则</div>' + editor('flowRule.new', blank, 'fcreate-rule') + '</section>' +
          (st.ruleNotice ? '<div class="tb-note" style="color:var(--tb-done-text,#81c784)">' + esc(st.ruleNotice) + '</div>' : '') +
          '<details class="fl-rule-source"><summary class="tb-note">JSON 源码</summary><textarea class="tb-textarea" spellcheck="false" data-field="flowPresentationRules" placeholder="' + esc(example) + '">' + esc(value) + '</textarea>' +
          '<div class="tb-row"><button type="button" class="tb-btn tb-btn-sm" data-action="fapply-rule-json">从 JSON 应用</button>' + ((st.presentationRules || []).length ? '<button type="button" class="tb-btn tb-btn-sm" data-action="freset-rules">清空全部</button>' : '') + '</div></details>' +
        '</div></div>'
    }

    // 子代理分支内容（左列）：入口卡（可点详情）+ 支线步骤（限高滚动）+ 出口卡
    // 运行中 = 调用在途（pending）或子会话仍 live——任一成立入口卡持续 fl-live（流光/脉冲/转圈）
    const subBranchHtml = async (c, st) => {
      const cid = childIdOf(c)
      let subLive = st.replaySeq == null && c.status === 'pending'
      let sub2 = null
      if (cid && st.replaySeq == null) {
        try { sub2 = await childRows(cid, 10); if (sub2.live) subLive = true } catch (e) {}
      }

      // 有子会话 id 后，整张入口卡就是“进入子流镜”的主点击面；
      // 子代理尚在启动时仍保留详情行为，避免点击无效。
      let sub = '<div class="fl-sub-card fl-sub-open' + (subLive ? ' fl-live' : '') + '" role="button" tabindex="0" data-action="' + (cid && st.replaySeq == null ? 'fenter' : 'fdetail') + '" data-seq="' + c.seq + '" data-flow-select-seq="' + c.seq + '"' + nodeIdentityHtml(c, st) + ' title="' + (cid && st.replaySeq == null ? '查看子代理过程' : '查看完整任务输入与输出') + '">' +
        '<div class="fl-iohead"><span class="fl-tag" style="color:var(--tb-active-text,#7fa7f0);background:rgba(91,141,239,.12)">子代理</span>' +
        '<span class="fl-name">' + esc(c.name) + '</span>' + statusGlyph(c.status, c.dur) + '</div>' +
        '<div class="fl-sub-io"><span class="fl-io-tag">入</span><span class="fl-branch-txt">' + esc(inSummary(c)) + '</span></div>' +
      '</div>'
      let steps = ''
      if (cid && sub2) {
        steps += '<div class="fl-sub-meta"><span class="fl-time">↳ ' + esc(cid.slice(0, 8)) + '… · ' + sub2.total + ' 步</span>' + (sub2.live ? '<span class="fl-tag" style="color:var(--tb-done-text,#81c784)">运行中</span>' : '') +
          '<button type="button" class="tb-btn tb-btn-sm" data-action="fenter" data-seq="' + c.seq + '" title="进入该子代理的完整流程图（可逐级返回）">进入 →</button></div>'
        for (const r of sub2.rows) {
          steps += '<div class="fl-sub-step">' +
            (r.pill ? '<span class="fl-branch-pill">' + esc(r.pill) + '</span>' : '') +
            '<span class="fl-branch-txt' + (r.pill ? '' : ' fl-branch-ai') + '">' + esc(r.txt) + '</span>' +
            (r.pill ? statusGlyph(r.status, r.dur) : '') +
          '</div>'
        }
        if (sub2.total > sub2.rows.length) steps += '<div class="fl-sub-step"><span class="fl-time">… 更早 ' + (sub2.total - sub2.rows.length) + ' 步未展开</span></div>'
      } else if (c.status === 'pending') {
        steps = '<div class="fl-sub-step"><span class="fl-time">子代理启动中…</span></div>'
      }
      if (steps) sub += '<div class="fl-sub-steps">' + steps + '</div>'
      if (c.status !== 'pending') {
        const o = outSummary(c)
        sub += '<div class="fl-sub-card fl-sub-close" role="button" tabindex="0" data-action="fdetail" data-seq="' + c.seq + '" title="查看完整任务输入与输出">' +
          '<div class="fl-sub-io"><span class="fl-io-tag">出</span>' +
          '<span class="fl-time">' + fmtDur(c.dur) + '</span>' +
          (o ? '<span class="fl-args">' + esc(o.text) + '</span>' : '') + '</div>' +
        '</div>'
      }
      return sub
    }

    const flowContextOf = (items, seqs, sid) => {
      const wanted = new Set(seqs)
      const selected = items.filter((it) => wanted.has(it.seq)).sort((a, b) => a.seq - b.seq)
      const chunks = ['以下是从 Flowglass 会话 ' + sid + ' 框选的流程片段（' + selected.length + ' 项）：']
      for (const it of selected) {
        if (it.kind === 'msg') {
          const role = it.role === 'user' ? '用户' : it.role === 'ai' ? '助手' : '注入'
          chunks.push('\n[' + role + ' · seq ' + it.seq + ']\n' + String(it.full || it.preview || '（空）'))
        } else {
          chunks.push('\n[工具 ' + it.name + ' · seq ' + it.seq + ']\n传入：' + (it.argsRaw || '（无参数）') + '\n返回：' + (it.status === 'pending' ? '（进行中）' : (it.resultText || '（空返回）')))
        }
      }
      const text = chunks.join('\n')
      const cap = 24000
      return {
        sourceSessionId: sid,
        seqs: selected.map((it) => it.seq),
        text: text.length > cap ? text.slice(0, cap) + '\n…（框选内容过长，已截断）' : text,
      }
    }

    // 同步子代理组：每个分支是一个可自行拉伸的小流镜，宽屏自动多列、窄屏回落单列。
    const subGroupHtml = async (node, st) => {
      const branches = await Promise.all(node.calls.map((c) => subBranchHtml(c, st)))
      return (node.calls.length > 1 ? '<span class="fl-subgrp-tag">并行子代理 ×' + node.calls.length + '</span>' : '') +
        branches.map((html) => '<div class="fl-subbranch">' + html + '</div>').join('')
    }

    const subColHtml = (node, html) => '<div class="fl-subcol' + (node.calls.length > 1 ? ' fl-subgrp' : '') + '">' + html + '</div>'

    // 普通流镜与大流镜详细对比共用同一泳道渲染器：返回视觉顺序（旧→新）的行。
    const renderFlowNodeRows = async (nodes, st, liveAiSeq) => {
      const subHtmls = {}
      await Promise.all(nodes.map(async (n, i) => { if (n.t === 'subs') subHtmls[i] = await subGroupHtml(n, st) }))
      const rows = []
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        const withConn = rows.length > 0
        let h
        if (n.t === 'msg' && n.it.role === 'ai' && nodes[i + 1] && (nodes[i + 1].t === 'par' || nodes[i + 1].t === 'subs')) {
          let parN = null, subN = null, subIdx = -1, next = i + 1
          if (nodes[next] && nodes[next].t === 'par') { parN = nodes[next]; next++ }
          if (nodes[next] && nodes[next].t === 'subs') { subN = nodes[next]; subIdx = next; next++ }
          if (!parN && nodes[next] && nodes[next].t === 'par') { parN = nodes[next]; next++ }
          const subCalls = subN ? subN.calls : []
          const aiLive = (parN && parN.calls.some((c) => c.status === 'pending')) || subCalls.some((c) => c.status === 'pending') || n.it.seq === liveAiSeq
          let main = msgCardInner(n.it, st.expanded, st.replaySeq == null && aiLive, st)
          let lastI = next - 1
          const allSettled = subCalls.length > 0 && subCalls.every((c) => c.resSeq != null)
          const resultSeq = allSettled ? Math.max(...subCalls.map((c) => c.resSeq)) : null
          if (resultSeq != null) {
            for (let j = next; j < nodes.length; j++) {
              const m = nodes[j]
              if (m.t !== 'msg') break
              if (subN.turn != null && m.it.turn != null && m.it.turn !== subN.turn) break
              main += '<span class="fl-arrow">▼</span>' + msgCardInner(m.it, st.expanded, m.it.seq === liveAiSeq, st)
              lastI = j
              if (m.it.seq > resultSeq) break
            }
          }
          h = '<div class="fl-lane">' +
            (subN ? subColHtml(subN, subHtmls[subIdx] || '') : '<div></div>') +
            '<div class="fl-lane-main">' + connMain(main, withConn) + '</div>' +
            (parN ? grpSide(parN, parN.calls.map((c) => renderCallWire(c, st.expanded, st.presentationRules, st)).join('')) : '<div></div>') +
          '</div>'
          i = lastI
        } else if (n.t === 'msg') h = renderMsg(n.it, st.expanded, withConn, n.it.seq === liveAiSeq, st)
        else if (n.t === 'par') h = renderPar(n, st.expanded, st.presentationRules, st)
        else h = '<div class="fl-lane">' + subColHtml(n, subHtmls[i] || '') + '<div class="fl-lane-main"><span class="fl-lane-line"></span></div><div></div></div>'
        rows.push(h)
      }
      return rows
    }

    // ---- 开工台模型分支：路由 + 思考强度清单（llm 服务缺失时仅跟随当前）----
    const ai = makeLlmHelper(ctx)
    const zoomLlm = ctx.get('llm')
    let zoomRoutesCache = null
    const buildZoomRoutes = async () => {
      if (zoomRoutesCache) return zoomRoutesCache
      const routes = []
      try {
        const providers = await ai.listProviders()
        for (const p of providers) {
          const models = await ai.listModels(p.id)
          for (const m of models) {
            let reasoning = null
            try {
              const info = zoomLlm && typeof zoomLlm.resolveModelInfo === 'function'
                ? await zoomLlm.resolveModelInfo(p.id, m.id)
                : null
              reasoning = info && info.reasoning ? info.reasoning : null
            } catch (e) {}
            routes.push({
              value: p.id + '/' + m.id,
              label: (p.name || p.id) + ' / ' + (m.name || m.id),
              efforts: reasoning && Array.isArray(reasoning.efforts)
                ? reasoning.efforts.map((x) => ({ id: String(x.id), name: x.name || String(x.id) }))
                : [],
              defaultEffort: reasoning && reasoning.defaultEffort != null ? String(reasoning.defaultEffort) : '',
            })
          }
        }
      } catch (e) {}
      zoomRoutesCache = routes
      return routes
    }
    try { ctx.on('llm/adapters-updated', () => { zoomRoutesCache = null }) } catch (e) {}

    // ---- 大流镜 Zoom：多会话并发总览（对比各会话的流程触发差异）=====
    // 会话集合两档：tree=面板所属会话的血缘树（本会话 + 全部子代理后代，含已落盘）；
    // live=Harness 当前全部在线会话（跨工作区并发面）。每会话一张卡：状态点 + 触发链
    // 条带（用户 ▲ / 助手 ◆ / 工具名徽章，错误红、进行中脉冲）+ 统计行；点卡进入该会话
    // 的完整流镜（crumb 带 zoom 标记，「← 返回」回到总览），跟随开启时 Harness 同步切换。
    // 摘要缓存按「日志条数 + 显示规则哈希」命中（日志只追加），静止会话 2s 轮询零重解析。
    const ZOOM_CAP = 12
    const ZOOM_STRIP = 16
    const zoomCache = {} // sid → { key, data }
    const zoomGrowth = {} // sid → 上轮日志条数（agents 状态面缺失时的活跃度兜底，与单会话 growth 同构）
    const hashText = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36) }

    // 大流镜历史是“带继承前缀的并发拓扑版本”，每个 history 内含初始态 + 多个并发轮次。
    const normalizeZoomRuns = (value) => {
      if (!Array.isArray(value)) return []
      const out = []
      for (const raw of value.slice(-20)) {
        if (!raw || typeof raw !== 'object') continue
        const id = typeof raw.id === 'string' && /^[\w-]{1,80}$/.test(raw.id) ? raw.id : ''
        const legacySids = Array.isArray(raw.sids) ? raw.sids.map(String).filter((s) => /^[\w-]{1,80}$/.test(s)).slice(0, 4) : []
        const rounds = []
        const sourceRounds = Array.isArray(raw.rounds) && raw.rounds.length ? raw.rounds : (legacySids.length ? [{ id: id + '-round-1', kind: 'round', at: raw.at, prompt: raw.prompt, sids: legacySids, routes: raw.routes, efforts: raw.efforts, sourceSids: [] }] : [])
        for (let i = 0; i < sourceRounds.length; i++) {
          const rr = sourceRounds[i] || {}
          const sids = Array.isArray(rr.sids) ? [...new Set(rr.sids.map(String).filter((s) => /^[\w-]{1,80}$/.test(s)))].slice(0, 4) : []
          if (!sids.length) continue
          rounds.push({
            id: typeof rr.id === 'string' && /^[\w-]{1,100}$/.test(rr.id) ? rr.id : id + '-round-' + (i + 1),
            kind: rr.kind === 'initial' ? 'initial' : 'round',
            at: Number.isFinite(Number(rr.at)) ? Number(rr.at) : 0,
            prompt: typeof rr.prompt === 'string' ? rr.prompt.slice(0, 240) : '',
            sourceSids: Array.isArray(rr.sourceSids) ? [...new Set(rr.sourceSids.map(String).filter((s) => /^[\w-]{1,80}$/.test(s)))].slice(0, 4) : [],
            sids,
            routes: Array.isArray(rr.routes) ? rr.routes.map(String).slice(0, sids.length) : [],
            efforts: Array.isArray(rr.efforts) ? rr.efforts.map(String).slice(0, sids.length) : [],
          })
        }
        if (!id || !rounds.length) continue
        const last = rounds[rounds.length - 1]
        out.push({
          id,
          at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : 0,
          prompt: typeof raw.prompt === 'string' ? raw.prompt.slice(0, 240) : '',
          name: typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 40) : '',
          parentId: typeof raw.parentId === 'string' ? raw.parentId : '',
          forkRoundId: typeof raw.forkRoundId === 'string' ? raw.forkRoundId : '',
          rounds,
          sids: last.sids,
          routes: last.routes,
          efforts: last.efforts,
        })
      }
      for (let i = 0; i < out.length; i++) if (!out[i].name) out[i].name = '大流镜 ' + String.fromCharCode(65 + (i % 26))
      return out
    }

    const zoomTopology = (history) => {
      const rounds = history && Array.isArray(history.rounds) ? history.rounds : []
      if (!rounds.length) return ''
      const nums = [rounds[0].sids.length]
      for (let i = 1; i < rounds.length; i++) {
        const r = rounds[i]
        const sourceCount = r.sourceSids.length || nums[nums.length - 1]
        if (sourceCount !== nums[nums.length - 1]) nums.push(sourceCount)
        nums.push(r.sids.length)
      }
      return nums.join('→')
    }

    // 当前 Harness 会话可能位于某条历史的早期轮次，或作为后一轮的来源。
    // 选择包含它的最近活跃历史，并展示该历史的最新一轮，而不是沿用别的会话留下的 activeId。
    const latestZoomRunForSession = (runs, sid) => {
      if (!sid) return null
      let best = null
      for (let runIndex = 0; runIndex < runs.length; runIndex++) {
        const run = runs[runIndex]
        const rounds = Array.isArray(run.rounds) ? run.rounds : []
        // initial 轮只是“从哪些 Session 发起”的来源占位，不代表这些 Session 属于输出分支组。
        const memberRounds = rounds.filter((round) => round.kind !== 'initial' && round.sids.includes(sid))
        const sourceRounds = rounds.filter((round) => round.sourceSids.includes(sid) || (round.kind === 'initial' && round.sids.includes(sid)))
        if (!memberRounds.length && !sourceRounds.length) continue
        // “当前 Session 属于哪组”优先看它作为成员的轮次；仅作为某次 1→N 的来源，不能把
        // 全景劫持到新建输出 Session。只有完全找不到成员轮次时，才以来源关系兜底。
        const membership = memberRounds.length ? 1 : 0
        const round = membership ? memberRounds[memberRounds.length - 1] : sourceRounds[sourceRounds.length - 1]
        const score = Number(round && round.at) || Number(run.at) || 0
        if (!best || membership > best.membership || (membership === best.membership && (score > best.score || (score === best.score && runIndex > best.runIndex)))) {
          best = { run, round, score, runIndex, membership }
        }
      }
      return best
    }

    const agentRunning = (sid) => {
      try {
        const agentsSvc = ctx.get('agents')
        if (!agentsSvc || typeof agentsSvc.get !== 'function') return null // 无状态面：调用方走增长兜底
        const a = agentsSvc.get(sid)
        return !!(a && a.status === 'running')
      } catch (e) { return null }
    }
    const sessionLive = (sid) => {
      try {
        const ss = ctx.get('sessions')
        return !!(ss && typeof ss.get === 'function' && ss.get(sid))
      } catch (e) { return false }
    }

    // 单会话紧凑摘要：首条用户消息作标题（触发内容即会话身份，便于对比「同一触发引发的不同流程」）、
    // 节点/工具/错误/tok 统计、最近 ZOOM_STRIP 个触发 glyph 条带（工具名过显示规则投影）
    const boardSummary = async (sid, rulesKey, rules) => {
      const r = await readLog(sid)
      const prev = zoomGrowth[sid]
      zoomGrowth[sid] = r.count || 0
      const grew = prev != null && (r.count || 0) > prev
      const key = (r.count || 0) + ':' + rulesKey
      const hit = zoomCache[sid]
      if (hit && hit.key === key) return { ...hit.data, grew }
      const items = parseItems(r.events || [])
      let tools = 0, toolErr = 0, tok = 0, lastTime = 0, title = '', route = '', hasSubagent = false
      let conclusion = null, currentStep = '', latestError = ''
      const strip = []
      for (const it of items) {
        if (typeof it.time === 'number' && it.time > lastTime) lastTime = it.time
        if (it.kind === 'msg') {
          if (it.role === 'user') { if (!title && it.preview) title = it.preview; strip.push({ g: 'user', txt: it.preview }) }
          else if (it.role === 'ai') { if (it.tok) tok += it.tok; if (it.route) route = it.route; strip.push({ g: 'ai', txt: it.preview }); if (!it.streaming && !it.failed && !it.interrupted) conclusion = { seq: it.seq, text: String(it.full || it.preview || '') }; if (it.failed || it.interrupted) latestError = it.failMsg || it.preview || '助手生成中断' }
          else strip.push({ g: 'sys', txt: it.preview })
        } else {
          tools++
          if (it.cat === 'subagent') hasSubagent = true
          if (it.status === 'error') { toolErr++; latestError = it.name + '：' + oneLine(it.resultText || '调用失败', 160) }
          if (it.status === 'pending') currentStep = it.name
          const identity = displayIdentity(it, rules)
          strip.push({ g: 'tool', name: identity.name, status: it.status, color: identity.meta.color, bg: identity.meta.bg, txt: inSummary(it) })
        }
      }
      const data = { sid, nodes: items.length, tools, toolErr, tok, lastTime, title, route, hasSubagent, conclusion, currentStep, latestError, unavailable: r.unavailable === true, unavailableReason: r.error || '', strip: strip.slice(-ZOOM_STRIP), stripTotal: strip.length }
      zoomCache[sid] = { key, data }
      return { ...data, grew }
    }

    // 会话集合收集：tree=当前会话可达血缘根 + 整棵后代树（SessionLineageNode 递归，带深度）；
    // live=sessions.list() 在线会话。trace 不可用/失败时兜底仅 home（在线判定走 sessions）。
    // run=当前选中的一次并发批次，严格只显示该次创建的会话；tree=当前会话血缘树。
    const collectZoomSessions = async (st, home) => {
      const out = []
      const seen = new Set()
      const archived = st.__archivedSessionIds instanceof Set ? st.__archivedSessionIds : new Set()
      const recordTitle = (rec) => {
        const header = rec && rec.header
        return String((rec && (rec.title || rec.name)) || (header && (header.title || header.name)) || '')
      }
      const fleetTitle = (title) => {
        const m = String(title || '').match(/^⚡\s*(.*?)\s*·\s*分支\s*(\d+)\s*\/\s*(\d+)(?:\s*·.*)?$/)
        if (!m) return null
        const index = Number(m[2]), total = Number(m[3])
        return index >= 1 && total >= 2 && index <= total ? { prompt: m[1].trim(), index, total } : null
      }
      const push = (rec, depth) => {
        const header = (rec && rec.header) || null
        const sid2 = header && header.id ? String(header.id) : ''
        if (!sid2 || seen.has(sid2) || archived.has(sid2)) return
        seen.add(sid2)
        out.push({ sid: sid2, header, live: !!(rec && rec.live), persisted: !!(rec && rec.persisted), depth,
          fleetPeer: !!(rec && rec.fleetPeer), fleetPrompt: rec && rec.fleetPrompt ? String(rec.fleetPrompt) : '' })
      }
      if (st.zoomScope === 'run') {
        const run = st.zoomRuns.find((x) => x.id === st.zoomRunId) || st.zoomRuns[st.zoomRuns.length - 1]
        const round = run && (run.rounds.find((x) => x.id === st.zoomRoundId) || run.rounds[run.rounds.length - 1])
        for (const runSid of (round && round.sids) || []) {
          let header = null
          try { const ss = ctx.get('sessions'); const s = ss && typeof ss.get === 'function' ? ss.get(runSid) : null; if (s) header = s.header || null } catch (e) {}
          if (!header) { try { const rr = await readLog(runSid); header = { ...((rr && rr.header) || {}), id: runSid } } catch (e) { header = { id: runSid } } }
          push({ header, live: sessionLive(runSid), persisted: true }, 0)
          const rec = out[out.length - 1]
          if (rec && rec.sid === runSid) rec.fleet = true
        }
      } else {
        if (home && sq && typeof sq.traceSession === 'function') {
          try {
            let tr = await sq.traceSession(home)
            // traceSession(home).descendants 只包含当前目标的后代。从侧栏直接进入某个叶子分支时，
            // 这会退化为单卡；沿 ancestors 找到可达根并重新 trace，才能恢复共同父级及兄弟分支。
            const ancestors = tr && Array.isArray(tr.ancestors) ? tr.ancestors : []
            const rootRec = ancestors.length ? ancestors[ancestors.length - 1] : null
            const rootSid = rootRec && rootRec.header && rootRec.header.id ? String(rootRec.header.id) : ''
            if (rootSid && rootSid !== home) {
              try { tr = await sq.traceSession(rootSid) } catch (e) {}
            }
            push(tr && tr.target, 0)
            const walk = (nodes, d) => { for (const n of nodes || []) { push(n && n.session, d); walk(n && n.descendants, d + 1) } }
            walk(tr && tr.descendants, 1)
          } catch (e) {}
        }
        if (!seen.has(home) && home) out.unshift({ sid: home, header: null, live: sessionLive(home), persisted: false, depth: 0 })
        // Harness 并发创建的普通 Session 不是 subagent，traceSession 没有父子血缘；关联只体现在
        // 标准标题“⚡ <任务> · 分支 i/n · <模型>”和相邻创建记录中。没有可见兄弟时，从最近会话
        // 索引恢复同组分支，仍以虚拟并发根横向展示，避免全景退化成当前 Session 一张卡。
        if (out.length <= 1) {
          try {
            const clientIndex = Array.isArray(st.__zoomSessionIndex) ? st.__zoomSessionIndex : []
            const recent = clientIndex.length
              ? clientIndex
              : (sq && typeof sq.listSessions === 'function' ? await sq.listSessions() : [])
            const current = (recent || []).find((x) => String((x && (x.id || (x.header || {}).id)) || '') === home)
            let meta = fleetTitle(recordTitle(current))
            if (!meta) {
              const rr = await readLog(home)
              meta = fleetTitle(recordTitle(rr))
            }
            if (meta) {
              const matches = []
              for (const item of recent || []) {
                const parsed = fleetTitle(recordTitle(item))
                const itemSid = String((item && (item.id || (item.header || {}).id)) || '')
                if (!itemSid || !parsed || parsed.prompt !== meta.prompt || parsed.total !== meta.total) continue
                matches.push({ item, sid: itemSid, index: parsed.index })
              }
              // 每个分支序号只取最近列表中的第一条；必须包含当前会话且至少恢复两条。
              const unique = []
              const indexes = new Set()
              for (const hit of matches) if (!indexes.has(hit.index)) { indexes.add(hit.index); unique.push(hit) }
              if (unique.length >= 2 && unique.some((x) => x.sid === home)) {
                unique.sort((a, b) => a.index - b.index)
                out.length = 0; seen.clear()
                for (const hit of unique) {
                  const rawHeader = (hit.item && hit.item.header) || {}
                  push({ header: { ...rawHeader, id: hit.sid, title: recordTitle(hit.item) }, live: sessionLive(hit.sid), persisted: true, fleetPeer: true, fleetPrompt: meta.prompt }, 1)
                  const added = out[out.length - 1]
                  if (added && added.sid === hit.sid) added.fleet = true
                }
              }
            }
          } catch (e) {}
        }
      }
      return out
    }

    // 分支纵向流程：最近 ZOOM_FLOW 步，自上而下（最新在底，与单会话流镜同向）；
    // 左侧竖轨 + 每步横挑（git 树语感），工具步带状态色徽章 + ✓/✗/转圈
    const ZOOM_FLOW = 8
    const zoomFlowHtml = (sum) => {
      const flow = sum.strip.slice(-ZOOM_FLOW)
      const rows = flow.map((e) => {
        if (e.g === 'tool') {
          const cls = e.status === 'error' ? ' fl-zoom-tool-err' : e.status === 'pending' ? ' fl-zoom-tool-pending' : ''
          return '<div class="fl-zoom-step">' +
            '<span class="fl-zoom-tool' + cls + '" style="color:' + e.color + ';background:' + e.bg + '" title="' + esc(e.name + (e.txt ? ' · ' + e.txt : '')) + (e.status === 'error' ? '（失败）' : e.status === 'pending' ? '（进行中）' : '') + '">' + esc(e.name) + '</span>' +
            '<span class="fl-zoom-step-txt">' + esc(oneLine(e.txt || '', 24)) + '</span>' +
            (e.status === 'pending' ? '<span class="fl-spin"></span>' : e.status === 'error' ? '<span class="fl-zoom-step-err">✗</span>' : '<span class="fl-zoom-step-ok">✓</span>') +
          '</div>'
        }
        const glyph = e.g === 'user' ? '▲' : e.g === 'ai' ? '◆' : '■'
        const color = e.g === 'user' ? 'var(--tb-done-text,#81c784)' : e.g === 'ai' ? 'var(--tb-active-text,#7fa7f0)' : 'var(--tb-text-3,#777884)'
        const label = e.g === 'user' ? '用户' : e.g === 'ai' ? '助手' : '注入'
        return '<div class="fl-zoom-step"><span class="fl-zoom-glyph" style="color:' + color + '" title="' + label + '">' + glyph + '</span>' +
          '<span class="fl-zoom-step-txt">' + esc(oneLine(e.txt || '', 26)) + '</span></div>'
      }).join('')
      const more = sum.stripTotal > flow.length ? '<div class="fl-zoom-step"><span class="fl-zoom-more">… 更早 ' + (sum.stripTotal - flow.length) + ' 步</span></div>' : ''
      return '<div class="fl-zoom-flow">' + more + rows + '</div>'
    }

    // 详细模式轮次对比：按 turn 对齐输入、工具轨迹和助手结果；只做确定性的文本/调用签名比较。
    const buildZoomTurnCompare = async (branches) => {
      const perSession = new Map()
      const turnSet = new Set()
      const fileRefs = (raw) => {
        const out = []
        try {
          const value = JSON.parse(raw || '{}')
          const walk = (v, key) => {
            if (typeof v === 'string') {
              if (/(?:file|path|cwd|root|target)/i.test(key || '') || /(?:[A-Za-z]:[\\/]|\/)[^\s"']+/.test(v)) out.push(v.replace(/\\/g, '/'))
            } else if (Array.isArray(v)) for (const x of v) walk(x, key)
            else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], k)
          }
          walk(value, '')
        } catch (e) {}
        return out
      }
      await Promise.all(branches.map(async (c) => {
        const grouped = new Map()
        try {
          const r = await readLog(c.rec.sid)
          let pendingInput = []
          for (const it of parseItems(r.events || [])) {
            if (it.kind === 'msg' && it.role === 'user') { pendingInput.push(it); continue }
            if (!Number.isFinite(Number(it.turn))) continue
            const turn = Number(it.turn)
            let row = grouped.get(turn)
            if (!row) { row = { input: [], tools: [], files: [], result: [], items: [] }; grouped.set(turn, row) }
            if (pendingInput.length && (it.kind === 'call' || it.role === 'ai')) {
              row.items.push(...pendingInput)
              row.input.push(...pendingInput.map((input) => String(input.full || input.preview || '')))
              pendingInput = []
            }
            row.items.push(it)
            if (it.kind === 'call') {
              row.tools.push(it.name + ':' + it.status + ':' + (it.argsRaw || ''))
              row.files.push(...fileRefs(it.argsRaw || ''))
            }
            else if (it.role === 'user') row.input.push(String(it.full || it.preview || ''))
            else if (it.role === 'ai') row.result.push(String(it.full || it.preview || ''))
          }
          if (pendingInput.length) {
            const turn = Math.max(0, ...grouped.keys()) + 1
            grouped.set(turn, { input: pendingInput.map((it) => String(it.full || it.preview || '')), tools: [], files: [], result: [], items: pendingInput })
          }
        } catch (e) {}
        for (const turn of grouped.keys()) turnSet.add(turn)
        perSession.set(c.rec.sid, grouped)
      }))
      const turns = [...turnSet].sort((a, b) => a - b)
      const norm = (xs) => xs.join('\n').replace(/\s+/g, ' ').trim()
      const rows = turns.map((turn) => {
        const values = branches.map((c) => {
          const raw = perSession.get(c.rec.sid).get(turn)
          return raw ? { input: norm(raw.input), tools: norm(raw.tools), files: [...new Set(raw.files)].sort().join('\n'), result: norm(raw.result), items: raw.items } : null
        })
        const dimension = (key) => {
          if (values.some((v) => !v)) return '缺'
          return new Set(values.map((v) => v[key])).size === 1 ? '同' : '异'
        }
        const dims = { input: dimension('input'), flow: dimension('tools'), files: dimension('files'), result: dimension('result') }
        // 相同数组位置或 turn 数字不是同源证据；只在完整输入一致时声明对齐。
        const aligned = values.length > 1 && values.every((v) => v && v.input) && dims.input === '同'
        return { turn, values, dims, aligned, sharedInput: aligned ? values[0].input : '',
          same: aligned && dims.flow === '同' && dims.files === '同', identical: aligned && Object.values(dims).every((value) => value === '同') }
      })
      return { rows, branches, perSession }
    }

    const renderZoom = async (st, sid, live) => {
      const home = st.home || sid
      await loadManifestTools()
      const rules = Array.isArray(st.presentationRules) ? st.presentationRules : []
      const rulesKey = hashText(JSON.stringify(rules))
      const recs = await collectZoomSessions(st, home)
      // 摘要并行预取（串行 await 会让多会话读日志延迟叠加，与子代理分支同处理）
      const cards = await Promise.all(recs.map(async (rec) => {
        let sum = null
        try { sum = await boardSummary(rec.sid, rulesKey, rules) } catch (e) {}
        const ar = agentRunning(rec.sid)
        const running = ar === true || (ar === null && !!(sum && sum.grew))
        const live = running || rec.live || sessionLive(rec.sid)
        return { rec, sum, running, live }
      }))
      // 分支左右顺序 = 收集顺序（血缘 DFS / 在线创建序 / 开工登记序），不按活跃重排：
      // 树形布局的分支列不能随 2s 轮询逐帧跳位（运行中状态由状态点/流光表达，不靠排序）
      const total = cards.length
      const runningCount = cards.filter((c) => c.running).length
      const shownCards = cards.slice(0, ZOOM_CAP)
      const bySid = new Map(shownCards.map((c) => [c.rec.sid, c]))
      // 超脱单会话的俯视树：tree 以面板所属会话为根；run 以当前批次为虚拟根。
      // tree 总览的顶卡是实际血缘根（depth=0），不是当前叶子 Session；当前选中项由 selectedCard 独立表示。
      const inferredFleet = st.zoomScope === 'tree' && shownCards.some((c) => c.rec.fleetPeer)
      const inferredFleetPrompt = inferredFleet ? ((shownCards.find((c) => c.rec.fleetPrompt) || {}).rec || {}).fleetPrompt : ''
      const rootC = st.zoomScope === 'tree' && !inferredFleet ? (shownCards.find((c) => c.rec.depth === 0) || bySid.get(home) || null) : null
      const allBranches = rootC ? shownCards.filter((c) => c !== rootC) : shownCards
      const activeRun = st.zoomRuns.find((x) => x.id === st.zoomRunId) || st.zoomRuns[st.zoomRuns.length - 1] || null
      const activeRound = activeRun && (activeRun.rounds.find((x) => x.id === st.zoomRoundId) || activeRun.rounds[activeRun.rounds.length - 1])
      // 观察模式与会话选择正交：全景展示所选并发的全部分支；近观用原单会话流镜
      // 铺满画布。切换分支只更新 selectedSid，不得隐式改变 zoomMode。
      // tree 模式的 rootC 也是一个合法 Session：从侧栏直接进入叶子分支时，树只有根、没有
      // allBranches。若只从 allBranches 选目标，「近观」会被误判为无目标并 disabled。
      const selectableCards = rootC ? shownCards : allBranches
      // 进入大流镜的默认尺度（fzoom 打开时置位，消费即删）：全景有多张卡可看才默认全景；
      // 单卡会话（普通/新会话的全景只有它自己，没有信息量）默认近观，直接用完整流镜铺满画布。
      if (st.zoomAutoMode) {
        delete st.zoomAutoMode
        st.zoomMode = shownCards.length > 1 ? 'panorama' : 'near'
        st.zoomMotion = shownCards.length > 1 ? 'overview' : 'focus'
      }
      const nearMode = st.zoomMode === 'near'
      // 近观的权威目标是当前实际查看的 st.sid，而不是“最新并发轮”的第一条输出。
      // 当前 Session 可能只是该轮 sourceSids，不在 activeRound.sids 中；此时构造一张临时卡读取它本身。
      let selectedCard = nearMode && st.sid ? (selectableCards.find((c) => c.rec.sid === st.sid) || null) : null
      if (!selectedCard && !nearMode && typeof st.zoomFocusSid === 'string') selectedCard = selectableCards.find((c) => c.rec.sid === st.zoomFocusSid) || null
      if (!selectedCard && st.sid) selectedCard = selectableCards.find((c) => c.rec.sid === st.sid) || null
      if (!selectedCard && nearMode && st.sid) {
        let header = null
        try { const rr = await readLog(st.sid); header = { ...((rr && rr.header) || {}), id: st.sid } } catch (e) { header = { id: st.sid } }
        let sum = null
        try { sum = await boardSummary(st.sid, rulesKey, rules) } catch (e) {}
        selectedCard = { rec: { sid: st.sid, header, live: sessionLive(st.sid), persisted: true, depth: 0 }, sum, running: agentRunning(st.sid) === true, live: sessionLive(st.sid) }
      }
      if (!selectedCard) selectedCard = selectableCards[0] || null
      st.zoomFocusSid = selectedCard ? selectedCard.rec.sid : ''
      const branches = allBranches
      // 全景发送 = N→N 继续现有组；近观发送 = 当前单 Session 的 1→N 派生。
      const continueBranches = !nearMode && (st.zoomScope === 'run' || inferredFleet) ? branches : []
      const continueCurrentGroup = continueBranches.length >= 2
      const zoomView = st.zoomView
      const targetBranchCount = Math.max(2, Math.min(4, st.zoomLanes.length || 2))
      let nearFlow = null
      if (nearMode && selectedCard) {
        const nearLog = await readLog(selectedCard.rec.sid)
        const nearLive = live && live.sessionId === selectedCard.rec.sid ? live : null
        const items = projectFlowItems(selectedCard.rec.sid, nearLog, nearLive, null)
        const nodes = buildNodes(items)
        const limit = Number.isFinite(Number(st.limit)) ? Math.max(60, Math.floor(Number(st.limit) / 60) * 60) : 60
        st.limit = limit
        const selection = selectFlowNodes(nodes, st, limit)
        nearFlow = { items, nodes, shown: selection.shown, selection, events: nearLog.events || [], hasOlder: selection.hasOlder }
      }
      const zoomMotion = st.zoomMotion === 'focus' || st.zoomMotion === 'overview' ? st.zoomMotion : ''
      delete st.zoomMotion
      const currentConversationItems = activeRun && activeRound ? activeRound.sids.map((runSid, i) =>
        '<span class="fl-zoom-current-item"><button type="button" class="fl-zoom-current-session' + (runSid === st.zoomFocusSid ? ' is-active' : '') + '" data-action="fzoom-open" data-run="' + esc(activeRun.id) + '" data-sid="' + esc(runSid) + '" title="选择会话 ' + (i + 1) + '；保持当前观察模式">' +
          '<span>会话 ' + (i + 1) + '</span><span>' + esc(activeRound.routes[i] || '跟随当前') + '</span><code>' + esc(runSid.replace(/^session-/, '').slice(0, 8)) + '</code>' +
        '</button><button type="button" class="fl-zoom-current-remove" data-action="fzoom-run-remove" data-sid="' + esc(runSid) + '" title="从当前并发移除">×</button></span>').join('') : ''
      const addSessionMenu = activeRound && activeRound.sids.length < 4
        ? '<button type="button" class="fl-zoom-add-picker" data-zoom-add-picker="1">＋ 添加其他 Session</button>'
        : ''
      const headOf = (c, isRoot, quiet) => {
        const rec = c.rec
        const sum = c.sum
        const short = rec.sid.replace(/^session-/, '').slice(0, 8)
        const indexed = (st.__zoomSessionIndex || []).find((row) => row.id === rec.sid)
        const title = (indexed && indexed.title) || (rec.header && rec.header.title) || (sum && sum.title) || '会话 ' + short
        const badges = []
        if (isRoot) badges.push('<span class="fl-zoom-badge fl-zoom-badge-home">' + (rec.sid === home ? '面板所属' : '血缘根') + '</span>')
        if (rec.fleet) badges.push('<span class="fl-zoom-badge fl-zoom-badge-fleet">⚡ 并发</span>')
        if (sum && sum.route) badges.push('<span class="fl-zoom-badge fl-zoom-badge-model" title="该会话的模型路由">' + esc(sum.route) + '</span>')
        if (rec.header && rec.header.origin === 'subagent') badges.push('<span class="fl-zoom-badge">子代理 L' + Math.max(1, rec.depth || 1) + '</span>')
        if (st.zoomScope === 'run' && rec.header && rec.header.cwd) {
          const cwdShort = String(rec.header.cwd).replace(/[\\/]+$/, '').split(/[\\/]/).pop()
          if (cwdShort) badges.push('<span class="fl-zoom-badge fl-zoom-badge-cwd" title="' + esc(rec.header.cwd) + '">' + esc(cwdShort) + '</span>')
        }
        const dotCls = c.running ? ' fl-zoom-dot-running' : c.live ? ' fl-zoom-dot-online' : ''
        const statusTxt = c.running ? '运行中' : c.live ? '在线' : '历史'
        const stats = sum
          ? '节点 ' + sum.nodes + ' · 工具 ' + sum.tools + (sum.toolErr ? ' · ✗ ' + sum.toolErr : '') + (sum.tok ? ' · +' + sum.tok + ' tok' : '') + (sum.lastTime ? ' · ' + fmtTime(sum.lastTime) : '')
          : '（日志为空或读取失败）'
        return '<div class="fl-zoom-head">' +
            '<span class="fl-zoom-dot' + dotCls + '" title="' + statusTxt + '"></span>' +
            '<span class="fl-zoom-title">' + esc(oneLine(title, 42)) + '</span>' +
            '<span class="fl-zoom-status">' + statusTxt + '</span>' +
            '<button type="button" class="fl-zoom-relay" data-action="fzoom-relay" data-sid="' + esc(rec.sid) + '" aria-label="带入其他会话" title="把该会话的最新助手结论带入其他会话">带入</button>' +
          '</div>' +
          (quiet ? '<details class="fl-technical-info" data-flow-disclosure="branch:' + esc(rec.sid) + '"><summary>技术信息</summary><p class="tb-note">Session ' + esc(rec.sid) + '</p>' : '') +
          (badges.length ? '<div class="fl-zoom-badges">' + badges.join('') + '</div>' : '') +
          '<div class="fl-zoom-stats">' + esc(stats) + '</div>' + (quiet ? '</details>' : '')
      }
      const openTip = st.follow ? '进入该会话的流镜视角，并切换 Harness' : '进入该会话的流镜视角'
      const zoomHelp = [
        '• 并发任务支持概览、对比、关系图。点击分支查看完整过程，用面包屑返回。',
        '• 继续任务会向当前分支组发送；查看单个分支时可以从该会话创建并发任务。',
        '• 「沿用当前会话」会直接继续当前会话，只新建剩余分支。',
        '• 任务历史按轮次保存关系，从旧轮继续会产生新历史分支。',
        '• 关系图同列连线表示沿用，跨列连线表示派生。',
        '• 「带入」将该会话的最新结论带入其他会话。',
      ].join('\n')
      const parts = []
      const conclusionSelector = (sourceSid, seq, round) => '<label class="fl-conclusion-select"><input type="checkbox" data-flow-conclusion="1" data-sid="' + esc(sourceSid) + '" data-seq="' + seq + '" data-round="' + esc(round || '') + '" data-node-key="' + esc(nodeKeyOf(sourceSid, { kind: 'msg', seq })) + '">选择结论</label>'
      parts.push('<div class="jr-tabpanel tb-root tb-pane' + (zoomMotion ? ' fl-zoom-motion-' + zoomMotion : '') + '" data-flow' + (!nearMode ? ' data-flow-board="1"' : '') + ' data-flow-view="' + esc(zoomView) + '" data-flow-scope="' + esc(sid) + '" data-zoom-active-sids="' + esc(continueBranches.map((c) => c.rec.sid).join(',')) + '" data-zoom-run-id="' + esc(activeRun ? activeRun.id : '') + '" data-zoom-round-id="' + esc(activeRound ? activeRound.id : '') + '" data-flow-has-older="' + (nearFlow && nearFlow.hasOlder ? '1' : '0') + '" data-flow-visible="' + (nearFlow ? nearFlow.shown.length : shownCards.length) + '" data-flow-total="' + (nearFlow ? nearFlow.nodes.length : total) + '" data-autorefresh="' + flowAutorefreshOf(st) + '" data-tab-badge="' + (st.live && runningCount ? String(runningCount) + '活' : '') + '">')
      parts.push('<div class="tb-pane-head">')
      const selectedTitle = selectedCard ? oneLine((selectedCard.sum && selectedCard.sum.title) || '当前分支', 36) : '未选中分支'
      parts.push('<div class="tb-row fl-context-bar"><nav class="fl-breadcrumbs" aria-label="观察范围">' +
        '<button type="button" class="tb-chip" data-action="fzoom">当前会话</button><span aria-hidden="true">/</span>' +
        '<button type="button" class="tb-chip' + (!nearMode ? ' tb-chip-on' : '') + '" data-action="fzoom-focus-back"' + (!nearMode ? ' aria-current="page"' : '') + '>并发任务</button>' +
        (nearMode ? '<span aria-hidden="true">/</span><span aria-current="page">' + esc(selectedTitle) + '</span>' : '') + '</nav>' +
        '<span class="fl-execution-status">' + branches.length + ' 个分支 · ' + (runningCount ? runningCount + ' 运行中' : '暂无运行任务') + '</span>' + syncStatusHtml(st) + '</div>')
      parts.push('<div class="tb-row fl-toolbar">' +
        '<span class="fl-session-title">' + esc(nearMode ? selectedTitle : oneLine((activeRun && activeRun.prompt) || inferredFleetPrompt || '并发执行过程', 56)) + '</span>' +
        (!nearMode && selectedCard ? '<button type="button" class="tb-btn tb-btn-sm" data-action="fzoom-focus-current">查看选中分支</button>' : '') +
        '<button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-action="fzoom-composer" aria-expanded="' + (st.zoomComposerOpen ? 'true' : 'false') + '">' + (continueCurrentGroup ? '继续任务' : '创建并发任务') + '</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-flow-bookmarks="1">标记</button><button type="button" class="tb-btn tb-btn-sm" data-flow-export="1">导出</button>' +
        (!nearMode ? '<button type="button" class="tb-btn tb-btn-sm" data-flow-compare-preview="1">比较所选结论</button>' : '') +
        toolbarMoreHtml(st, zoomHelp, 'Session ' + sid + ' · ' + total + ' 个会话') + '</div>')
      if (nearFlow) parts.push(queryToolbarHtml(st, nearFlow.selection, nearFlow.events))
      // 开工台（客户端行为，不经 Host RPC：输入/启动按钮由 Client 面板委托读写）：
      // 同一任务 ⚡ 同时开始 —— 旧会话从当前完成轮次分叉，新会话在同一工作区新建；每条
      // 分支可在同一紧凑控件内选模型与思考强度。输入非空时 Client 暂停自动刷新；选择经
      // data-action-onchange 回写 state（重渲染不丢）。
      parts.push('</div>')
      if (st.zoomComposerOpen) {
        const routes = await buildZoomRoutes()
        const routeOptions = (sel) => '<option value="">默认（跟随当前）</option>' + routes.map((r) => '<option value="' + esc(r.value) + '"' + (r.value === sel ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('')
        const effortOptions = (route, sel) => {
          const meta = routes.find((r) => r.value === route)
          if (!meta || !meta.efforts.length) return '<option value="">思考：跟随模型</option>'
          const inherited = meta.defaultEffort ? '默认（' + meta.defaultEffort + '）' : '默认'
          return '<option value="">思考：' + esc(inherited) + '</option>' + meta.efforts.map((e) => '<option value="' + esc(e.id) + '"' + (e.id === sel ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('')
        }
        const laneSelects = st.zoomLanes.map((lane, i) =>
          '<span class="fl-zoom-lane-group" title="分支 ' + (i + 1) + '：模型与思考强度（左→右对应看板分支列）">' +
            '<select class="tb-select fl-zoom-lane fl-zoom-lane-model" data-field="zoomLane.' + i + '" data-action-onchange="fzoom-lane" data-lane="' + i + '" data-zoom-lane="1">' + routeOptions(lane) + '</select>' +
            '<select class="tb-select fl-zoom-lane fl-zoom-lane-effort" data-field="zoomEffort.' + i + '" data-action-onchange="fzoom-effort" data-lane="' + i + '" data-zoom-effort="1"' + (!lane ? ' disabled' : '') + '>' + effortOptions(lane, st.zoomEfforts[i] || '') + '</select>' +
          '</span>'
        ).join('')
        // 近观 1→N 可「沿用当前会话」：当前会话作为分支 1 直接继续，只新建 N−1 个分支。
        // Client 启动时读 chip 的 aria-pressed（data-zoom-reuse）；开关经 fzoom-reuse 回写 state，重渲染不丢。
        const zoomReuseOn = nearMode && selectedCard && st.zoomReuse === true
        const reuseChip = nearMode && selectedCard
          ? '<button type="button" class="tb-chip' + (zoomReuseOn ? ' tb-chip-on' : '') + '" data-action="fzoom-reuse" data-zoom-reuse="1" aria-pressed="' + (zoomReuseOn ? 'true' : 'false') + '" title="开启后：当前会话作为分支 1 直接继续，只新建 ' + (targetBranchCount - 1) + ' 个新分支；本轮接进同一条大流镜历史">沿用当前会话</button>'
          : ''
        const zoomComposerContext = continueCurrentGroup && activeRun && activeRound
          ? '<div class="fl-zoom-composer-context"><strong>发送到当前 ' + activeRound.sids.length + ' 个会话</strong><span>' + esc(oneLine(activeRun.prompt || '并发任务', 28)) + ' · ' + esc(zoomTopology(activeRun)) + '</span><div class="fl-zoom-composer-targets" data-zoom-add-drop="1">' + currentConversationItems + addSessionMenu + '</div></div>'
          : nearMode && selectedCard
            ? '<div class="fl-zoom-composer-context"><strong>' + (zoomReuseOn ? '沿用当前会话，再新建 ' + (targetBranchCount - 1) + ' 个分支（1→' + targetBranchCount + '）' : '从当前单会话发起 1→' + targetBranchCount) + '</strong><span>来源 Session：' + esc(selectedCard.rec.sid.replace(/^session-/, '').slice(0, 8)) + '</span></div>'
            : '<div class="fl-zoom-composer-context"><strong>新建并发会话</strong><span>输入一次，创建并发送到 ' + targetBranchCount + ' 个 Session</span></div>'
        const zoomPromptPlaceholder = continueCurrentGroup ? '这条消息将同时发送到上面列出的 Session' : nearMode && selectedCard ? (zoomReuseOn ? '这条消息将发送到当前会话，并派生 ' + (targetBranchCount - 1) + ' 个新分支' : '这条消息将从当前 Session 派生并发送到新分支') : '输入第一个任务，创建新的并发 Session'
        const zoomLaunchLabel = continueCurrentGroup ? '发送到当前 ' + continueBranches.length + ' 个会话' : nearMode && selectedCard ? (zoomReuseOn ? '沿用当前会话 + 新建 ' + (targetBranchCount - 1) + ' 个分支' : '从当前会话发起 1→' + targetBranchCount) : '新建 ' + st.zoomLanes.length + ' 个会话并发送'
        parts.push('<div class="fl-zoom-composer">' +
          zoomComposerContext +
          '<textarea class="tb-input fl-zoom-prompt" data-zoom-prompt="1" rows="2" placeholder="' + zoomPromptPlaceholder + '"></textarea>' +
          '<div class="fl-zoom-composer-controls">' + laneSelects + reuseChip +
            '<span class="fl-zoom-target-label">目标分支数</span>' +
            '<span class="fl-zoom-count" title="新并发将生成的目标分支数">' + [2, 3, 4].map((n) => '<button type="button" class="tb-chip' + (st.zoomLanes.length === n ? ' tb-chip-on' : '') + '" data-action="fzoom-lanes" data-count="' + n + '">' + n + '</button>').join('') + '</span>' +
            '<span class="fl-zoom-composer-spacer"></span>' +
            '<button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-zoom-launch="1">⚡ ' + zoomLaunchLabel + '</button>' +
          '</div></div>')
      }
      // 显示方式与历史保留为轻量工具行；并发路径、目标 Session 与发送输入统一收进上方发送区。
      parts.push('<div class="tb-row fl-zoom-logbar"><span class="tb-note fl-zoom-log-spacer"></span>' +
        '<span class="tb-sec-label">显示</span>' +
        (nearMode ? '<span class="tb-note">分支过程</span>' :
          '<button type="button" class="tb-chip' + (st.zoomView === 'compact' ? ' tb-chip-on' : '') + '" data-action="fzoom-view" data-view="compact" aria-pressed="' + (st.zoomView === 'compact' ? 'true' : 'false') + '">概览</button>' +
          '<button type="button" class="tb-chip' + (st.zoomView === 'detail' ? ' tb-chip-on' : '') + '" data-action="fzoom-view" data-view="detail" aria-pressed="' + (st.zoomView === 'detail' ? 'true' : 'false') + '">对比</button>' +
          '<button type="button" class="tb-chip' + (st.zoomView === 'map' ? ' tb-chip-on' : '') + '" data-action="fzoom-view" data-view="map" aria-pressed="' + (st.zoomView === 'map' ? 'true' : 'false') + '">关系图</button>') +
        (!nearMode && zoomView === 'detail' ? '<button type="button" class="tb-chip" data-action="fdifferences" aria-pressed="' + (st.flowDifferences ? 'true' : 'false') + '">' + (st.flowDifferences ? '仅看差异' : '显示全部') + '</button>' : '') +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="fzoom-history">任务历史 · ' + st.zoomRuns.length + '</button>' +
      '</div>')
      if (st.zoomHistoryOpen) {
        parts.push('<aside class="fl-zoom-history-drawer"><div class="fl-zoom-history-drawer-head"><strong>任务历史</strong><button type="button" data-action="fzoom-history" aria-label="关闭任务历史">×</button></div><div class="fl-zoom-history-tree">' +
          st.zoomRuns.slice().reverse().map((run) => {
            const active = run.id === st.zoomRunId
            const expanded = st.zoomExpandedHistories.includes(run.id)
            const summary = oneLine(run.prompt || run.name || '并发任务', 24)
            return '<section class="fl-history-node' + (active ? ' is-active' : '') + '"><div class="fl-history-run-line">' +
              '<button type="button" class="fl-history-toggle" data-action="fzoom-history-toggle" data-run="' + esc(run.id) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '" title="' + (expanded ? '折叠历史' : '展开历史') + '">' + (expanded ? '▾' : '▸') + '</button>' +
              '<button type="button" class="fl-history-run" data-action="fzoom-run" data-run="' + esc(run.id) + '" title="' + esc(run.prompt || '并发任务') + '"><span>⚡ ' + esc(summary) + '</span><small>' + esc(zoomTopology(run)) + '</small></button></div>' +
              (expanded ? '<div class="fl-history-rounds">' + run.rounds.map((round, ri) => '<section class="fl-history-round-node' + (active && round.id === st.zoomRoundId ? ' is-active' : '') + '"><button type="button" class="fl-history-round" data-action="fzoom-round" data-run="' + esc(run.id) + '" data-round="' + esc(round.id) + '"><span>└ ' + (ri === 0 ? '初始' : '第 ' + ri + ' 轮') + '</span><small>' + (round.sourceSids.length ? round.sourceSids.length + '→' : '') + round.sids.length + '</small></button>' +
                '<div class="fl-history-children">' + round.sids.map((runSid, i) => '<button type="button" class="fl-history-session" data-action="fzoom-open" data-run="' + esc(run.id) + '" data-round="' + esc(round.id) + '" data-sid="' + esc(runSid) + '"><span>└ 对话 ' + (i + 1) + '</span><code>' + esc(runSid.replace(/^session-/, '').slice(0, 8)) + '</code></button>').join('') + '</div></section>').join('') + '</div>' : '') + '</section>'
          }).join('') + '</div></aside>')
      }
      parts.push('<div class="tb-pane-body tb-pane-col">')
      if (!shownCards.length) {
        parts.push('<div class="tb-notice">' + (st.zoomScope === 'run' ? '还没有并发记录——输入任务后点「⚡ 同时开始」' : '没有可显示的会话') + '</div>')
      } else if (nearFlow && selectedCard) {
        // 近观不是单列 diff：直接复用原单会话流镜节点，铺满大流镜画布。
        const nearRows = await renderFlowNodeRows(nearFlow.shown, st, null)
        if (nearFlow.hasOlder) nearRows.push('<div class="tb-notice fl-older" data-flow-older-hint>已显示最近 ' + nearFlow.shown.length + ' 个节点 · 继续向上滚动会自动加载更早 ' + Math.min(60, nearFlow.nodes.length - nearFlow.shown.length) + ' 条</div>')
        // 普通流镜把 rows.reverse() 作为 tb-pane-body 的直接子项，再由 column-reverse 还原视觉时间序。
        // 近观多了一层 wrapper，不能再 reverse，否则视觉顺序会变成“助手在上、用户在下”。
        parts.push('<div class="fl-zoom-near-flow" data-flow-near-session="' + esc(selectedCard.rec.sid) + '">' + (nearRows.length ? nearRows.join('') : '<div class="tb-notice">当前会话还没有事件</div>') + '</div>')
      } else if (zoomView === 'compact') {
        if (rootC) parts.push('<div class="fl-overview-source"><span class="tb-sec-label">来源会话</span><span>' + esc(oneLine((rootC.sum && rootC.sum.title) || rootC.rec.sid, 80)) + '</span><button type="button" class="tb-btn tb-btn-sm" data-action="fzoom-open" data-sid="' + esc(rootC.rec.sid) + '">查看来源会话</button></div>')
        if (!branches.length) parts.push('<div class="tb-notice">尚无并发分支。使用“创建并发任务”开始比较。</div>')
        parts.push('<div class="fl-overview-list">' + branches.map((c, i) => '<article class="fl-overview-card' + (c.sum && c.sum.latestError ? ' has-errors' : '') + '" data-flow-detail-session="' + esc(c.rec.sid) + '">' +
          '<div class="fl-diff-session-label">分支 ' + (i + 1) + '</div>' + headOf(c, false, true) +
          (c.sum && c.sum.currentStep ? '<p class="fl-current-step">当前步骤：' + esc(c.sum.currentStep) + '</p>' : '') +
          (c.sum && c.sum.latestError ? '<p class="fl-detail-error">' + esc(c.sum.latestError) + '</p>' : '') +
          (c.sum && c.sum.strip.length ? '<div class="fl-overview-process"><span class="tb-sec-label">最近执行过程</span>' + zoomFlowHtml(c.sum) + '</div>' : '') +
          '<div class="fl-overview-conclusion"><span class="tb-sec-label">最新结论</span><p>' + esc(c.sum && c.sum.unavailable ? '会话日志暂不可用，请稍后刷新重试。' + (c.sum.unavailableReason ? '（' + c.sum.unavailableReason + '）' : '') : c.sum && c.sum.conclusion ? oneLine(c.sum.conclusion.text, 260) : c.running ? '正在执行，尚无已完成结论。' : '尚无已完成结论。') + '</p></div>' +
          '<div class="fl-overview-actions"><button type="button" class="tb-btn tb-btn-sm" data-action="fzoom-open" data-sid="' + esc(c.rec.sid) + '">查看分支过程</button>' +
          (c.sum && c.sum.conclusion ? conclusionSelector(c.rec.sid, c.sum.conclusion.seq, activeRound && activeRound.id) : '') + '</div></article>').join('') + '</div>')
      } else {
        if ((st.zoomScope === 'run' || inferredFleet || zoomView === 'detail') && branches.length) {
          // 精简/详细共用 Git diff 轮次网格；详细单元格用普通流镜泳道，精简只保留轮次摘要。
          const comparison = await buildZoomTurnCompare(branches)
          const widths = zoomView === 'detail'
            ? branches.map((c) => (c.sum && c.sum.hasSubagent) ? 'minmax(620px,680px)' : 'minmax(420px,480px)')
            : branches.map(() => 'minmax(220px,280px)')
          if (zoomView === 'map') {
            const nodeW = 244
            const nodeH = 126
            const colGap = 94
            const rowGap = 54
            const rootW = 190
            const rootY = 24
            const firstRowY = 156
            const nodePos = new Map()
            const nodeHtml = []
            const turnHtml = []
            const edges = []
            let canvasW = 760
            let canvasH = 520
            // 分支树导图（run 视角且有历史轮次）：每条会话一条竖列（分叉的新会话插到来源列右侧），
            // 历史的每个轮次一行；每节点一条父边——同列竖线 = 沿用继续，跨列斜线 = 分叉。
            // 覆盖全部轮次，不再只画最新一轮的分支（单分支继续/子组派生都在同一棵树上）。
            const runRounds = st.zoomScope === 'run' && activeRun && Array.isArray(activeRun.rounds) ? activeRun.rounds : []
            if (runRounds.length) {
              const MAP_CAP_ROUNDS = 8
              const MAP_CAP_LANES = 8
              const workRounds = runRounds.filter((r) => r && r.kind !== 'initial').slice(-MAP_CAP_ROUNDS)
              const laneOrder = [] // 会话竖列顺序：首现追加；分叉插到来源列右侧
              const laneTurn = new Map() // sid → 已分配的最近日志 turn（分叉会话含继承前缀）
              const latestNode = new Map() // sid → 最近一次出现的节点 id
              const titleIndex = new Map((Array.isArray(st.__zoomSessionIndex) ? st.__zoomSessionIndex : []).map((x) => [x.id, x.title]))
              const mapCards = []
              for (const round of workRounds) for (const s of round.sids) if (!mapCards.some((c) => c.rec.sid === s)) mapCards.push({ rec: { sid: s } })
              const mapCompare = await buildZoomTurnCompare(mapCards)
              // 第一遍：定列（laneOrder）与每节点的日志 turn——沿用 = 自身 turn+1；新分会话 = 来源当前 turn+1
              const nodeRows = []
              workRounds.forEach((round, rowIdx) => {
                const ri = runRounds.indexOf(round) // 历史轮次序号（含初始轮），与历史抽屉的「第 N 轮」一致
                const sources = round.sourceSids.length ? round.sourceSids : (ri > 0 ? runRounds[ri - 1].sids : [])
                const inserted = new Map()
                const rowNodes = []
                round.sids.forEach((sid, i) => {
                  const src = sources.includes(sid) ? sid : (sources.length ? sources[Math.min(i, sources.length - 1)] : null)
                  if (!laneOrder.includes(sid)) {
                    if (laneOrder.length >= MAP_CAP_LANES) return
                    if (src && laneOrder.includes(src)) {
                      const at = laneOrder.indexOf(src) + 1 + (inserted.get(src) || 0)
                      laneOrder.splice(at, 0, sid)
                      inserted.set(src, (inserted.get(src) || 0) + 1)
                    } else laneOrder.push(sid)
                  }
                  // A fork inherits earlier conversation turns. Topology row numbers
                  // are not log turn numbers: locate the actual submitted input.
                  const grouped = mapCompare.perSession.get(sid)
                  const prompt = String(round.prompt || '').replace(/\s+/g, ' ').trim()
                  const previous = laneTurn.get(sid) || 0
                  const candidates = grouped ? [...grouped.entries()].filter(([turn, value]) => turn > previous && prompt && value.input.some((input) => String(input).slice(0, 240).replace(/\s+/g, ' ').trim() === prompt)) : []
                  const distance = ([, value]) => Math.min(...value.items.filter((it) => it.role === 'user').map((it) => Math.abs(Number(it.time) - Number(round.at))))
                  candidates.sort((a, b) => distance(a) - distance(b))
                  const matched = candidates.length === 1 || (candidates.length > 1 && distance(candidates[0]) < distance(candidates[1])) ? candidates[0] : null
                  const turn = matched ? matched[0] : null
                  if (turn != null) laneTurn.set(sid, turn)
                  rowNodes.push({ sid, round, ri, rowIdx, src, turn })
                })
                nodeRows.push(rowNodes)
              })
              const treeLaneWidth = laneOrder.length * nodeW + Math.max(0, laneOrder.length - 1) * colGap
              canvasW = Math.max(760, treeLaneWidth + 220)
              const laneStartX = Math.round((canvasW - treeLaneWidth) / 2)
              const rootX = Math.round((canvasW - rootW) / 2)
              canvasH = Math.max(520, firstRowY + nodeRows.length * nodeH + Math.max(0, nodeRows.length - 1) * rowGap + 44)
              nodePos.set('root', { x: rootX, y: rootY, w: rootW, h: 84 })
              nodeHtml.push('<article class="fl-map-node fl-map-root" data-map-node="root" data-map-default-x="' + rootX + '" data-map-default-y="' + rootY + '" style="left:' + rootX + 'px;top:' + rootY + 'px;width:' + rootW + 'px"><button type="button" class="fl-map-select" data-map-select aria-pressed="false" aria-label="选中并发任务">' + esc(oneLine((activeRun && activeRun.prompt) || '当前并发', 28)) + '</button><span>' + esc(zoomTopology(activeRun)) + ' · ' + laneOrder.length + ' 个会话</span></article>')
              nodeRows.forEach((rowNodes2, rowIdx) => {
                if (!rowNodes2.length) return
                const ri = rowNodes2[0].ri
                const rowY = firstRowY + rowIdx * (nodeH + rowGap)
                turnHtml.push('<div class="fl-map-turn-label" style="left:' + Math.max(12, laneStartX - 86) + 'px;top:' + (rowY + Math.round(nodeH / 2) - 15) + 'px"><span>' + ri + '</span><strong>第 ' + ri + ' 轮</strong></div>')
                // 同一轮内先成节点、再统一连边：边的来源解析到「上一轮」的状态（分叉边从被分叉的那一轮连出），
                // 最后才更新 latestNode——避免同轮相邻节点互相串链。
                for (const n of rowNodes2) {
                  const lane = laneOrder.indexOf(n.sid)
                  const nodeId = 'r' + n.ri + '-' + n.sid
                  n.nodeId = nodeId
                  n.from = n.src && latestNode.has(n.src) ? latestNode.get(n.src) : 'root'
                  const x = laneStartX + lane * (nodeW + colGap)
                  const y = rowY
                  nodePos.set(nodeId, { x, y, w: nodeW, h: nodeH })
                  const grouped = mapCompare.perSession.get(n.sid)
                  const value = grouped ? grouped.get(n.turn) : null
                  const lastAi = value ? value.items.filter((it) => it.kind === 'msg' && it.role === 'ai' && !it.streaming).slice(-1)[0] : null
                  const branchSeq = lastAi ? (lastAi.finalSeq != null ? lastAi.finalSeq : lastAi.seq) : null
                  const result = oneLine((value && value.result) || '（本轮尚无完整回答）', 92)
                  const card = bySid.get(n.sid)
                  const title = titleIndex.get(n.sid) || (card && card.sum && card.sum.title) || ''
                  const label = title ? oneLine(title, 16) : '会话 ' + (lane + 1)
                  nodeHtml.push('<article class="fl-map-node" data-map-node="' + nodeId + '" data-map-default-x="' + x + '" data-map-default-y="' + y + '" data-flow-detail-session="' + esc(n.sid) + '" style="left:' + x + 'px;top:' + y + 'px;width:' + nodeW + 'px">' +
                    '<header><button type="button" class="fl-map-select" data-map-select aria-pressed="false" aria-label="选中' + esc(label) + '第 ' + n.ri + ' 轮">' + esc(label) + '</button><span>第 ' + n.ri + ' 轮</span></header>' +
                    '<p>' + esc(result) + '</p>' +
                    (branchSeq == null ? '' : '<button type="button" class="fl-map-branch" data-flow-branch data-history="' + esc(activeRun.id) + '" data-round="' + esc(n.round.id) + '" data-turn="' + n.ri + '" data-seq="' + branchSeq + '" title="以 ' + esc(label) + ' 的第 ' + n.ri + ' 轮回答为唯一来源，创建 ' + targetBranchCount + ' 个新 Session">从这里发起 1→' + targetBranchCount + '</button>') +
                  '</article>')
                }
                for (const n of rowNodes2) {
                  if (!edges.some((e) => e.from === n.from && e.to === n.nodeId)) edges.push({ from: n.from, to: n.nodeId })
                  latestNode.set(n.sid, n.nodeId)
                }
              })
            } else {
            // 无并发历史（血缘树/推断并发）：保留按日志轮次 × 当前分支列的旧版布局
            const rows = comparison.rows
            const laneWidth = branches.length * nodeW + Math.max(0, branches.length - 1) * colGap
            canvasW = Math.max(760, laneWidth + 220)
            const laneStartX = Math.round((canvasW - laneWidth) / 2)
            const rootX = Math.round((canvasW - rootW) / 2)
            canvasH = Math.max(520, firstRowY + rows.length * nodeH + Math.max(0, rows.length - 1) * rowGap + 44)
            nodePos.set('root', { x: rootX, y: rootY, w: rootW, h: 84 })
            nodeHtml.push('<article class="fl-map-node fl-map-root" data-map-node="root" data-map-default-x="' + rootX + '" data-map-default-y="' + rootY + '" style="left:' + rootX + 'px;top:' + rootY + 'px;width:' + rootW + 'px"><button type="button" class="fl-map-select" data-map-select aria-pressed="false" aria-label="选中并发任务">' + esc(oneLine((activeRun && activeRun.prompt) || '当前并发', 28)) + '</button><span>' + esc(zoomTopology(activeRun)) + ' · ' + branches.length + ' 个会话</span></article>')
            for (let r = 0; r < rows.length; r++) {
              const row = rows[r]
              const displayTurn = row.turn === 0 ? 1 : row.turn
              const rowY = firstRowY + r * (nodeH + rowGap)
              turnHtml.push('<div class="fl-map-turn-label" style="left:' + Math.max(12, laneStartX - 86) + 'px;top:' + (rowY + Math.round(nodeH / 2) - 15) + 'px"><span>' + displayTurn + '</span><strong>第 ' + displayTurn + ' 轮</strong></div>')
              for (let i = 0; i < branches.length; i++) {
                const value = row.values[i]
                if (!value) continue
                const nodeId = 't' + row.turn + '-s' + i
                const x = laneStartX + i * (nodeW + colGap)
                const y = rowY
                nodePos.set(nodeId, { x, y, w: nodeW, h: nodeH })
                const previous = r > 0 ? 't' + rows[r - 1].turn + '-s' + i : 'root'
                if (nodePos.has(previous)) edges.push({ from: previous, to: nodeId })
                const lastAi = value.items.filter((it) => it.kind === 'msg' && it.role === 'ai' && !it.streaming).slice(-1)[0]
                const branchSeq = lastAi ? (lastAi.finalSeq != null ? lastAi.finalSeq : lastAi.seq) : null
                const result = oneLine(value.result || '（本轮尚无完整回答）', 92)
                nodeHtml.push('<article class="fl-map-node" data-map-node="' + nodeId + '" data-map-default-x="' + x + '" data-map-default-y="' + y + '" data-flow-detail-session="' + esc(branches[i].rec.sid) + '" style="left:' + x + 'px;top:' + y + 'px;width:' + nodeW + 'px">' +
                  '<header><button type="button" class="fl-map-select" data-map-select aria-pressed="false" aria-label="选中分支 ' + (i + 1) + ' 第 ' + displayTurn + ' 轮">分支 ' + (i + 1) + '</button><span>第 ' + displayTurn + ' 轮</span></header>' +
                  '<p>' + esc(result) + '</p>' +
                  (branchSeq == null || !activeRun || !activeRound ? '' : '<button type="button" class="fl-map-branch" data-flow-branch data-history="' + esc(activeRun.id) + '" data-round="' + esc(activeRound.id) + '" data-turn="' + displayTurn + '" data-seq="' + branchSeq + '" title="以会话 ' + (i + 1) + ' 的第 ' + displayTurn + ' 轮回答为唯一来源，创建 ' + targetBranchCount + ' 个新 Session">从这里发起 1→' + targetBranchCount + '</button>') +
                '</article>')
              }
            }
            }
            const connectorPath = (a, b, fromId, toId) => {
              const acx = a.x + a.w / 2, acy = a.y + a.h / 2
              const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2
              const dx = bcx - acx, dy = bcy - acy
              const vertical = b.y >= a.y + a.h + 12 || a.y >= b.y + b.h + 12
              const x1 = vertical ? acx : (dx >= 0 ? a.x + a.w : a.x)
              const y1 = vertical ? (dy >= 0 ? a.y + a.h : a.y) : acy
              const x2 = vertical ? bcx : (dx >= 0 ? b.x : b.x + b.w)
              const y2 = vertical ? (dy >= 0 ? b.y : b.y + b.h) : bcy
              let blocked = false
              for (const [id, rect] of nodePos) {
                if (id === fromId || id === toId) continue
                const left = rect.x - 8, right = rect.x + rect.w + 8, top = rect.y - 8, bottom = rect.y + rect.h + 8
                for (let step = 1; step < 24; step++) {
                  const t = step / 24
                  const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t
                  if (px >= left && px <= right && py >= top && py <= bottom) { blocked = true; break }
                }
                if (blocked) break
              }
              if (!blocked) return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2
              if (!vertical) {
                const mid = (x1 + x2) / 2
                return 'M ' + x1 + ' ' + y1 + ' H ' + mid + ' V ' + y2 + ' H ' + x2
              }
              const mid = (y1 + y2) / 2
              return 'M ' + x1 + ' ' + y1 + ' V ' + mid + ' H ' + x2 + ' V ' + y2
            }
            const lineHtml = edges.map((edge) => {
              const a = nodePos.get(edge.from), b = nodePos.get(edge.to)
              return '<path data-map-from="' + edge.from + '" data-map-to="' + edge.to + '" d="' + connectorPath(a, b, edge.from, edge.to) + '" />'
            }).join('')
            parts.push('<div class="fl-mindmap-wrap"><div class="fl-mindmap-help"><strong>关系图</strong><span>选择节点后可定位；方向键切换节点，Shift + 方向键平移，Ctrl + 方向键整理位置。</span>' +
              '<div class="fl-map-controls" role="toolbar" aria-label="关系图视口">' +
                '<button type="button" data-map-fit="1">适应画布</button><button type="button" data-map-center="1">定位选中</button><button type="button" data-map-reset="1">恢复布局</button>' +
                '<span class="fl-map-zoom-controls"><button type="button" data-map-zoom="out" aria-label="缩小关系图">−</button><button type="button" data-map-zoom="reset" title="恢复 100%"><output data-map-zoom-value aria-live="polite">100%</output></button><button type="button" data-map-zoom="in" aria-label="放大关系图">+</button></span>' +
                '<span class="fl-map-pan-controls"><button type="button" data-map-pan="left" aria-label="向左平移画布">←</button><button type="button" data-map-pan="up" aria-label="向上平移画布">↑</button><button type="button" data-map-pan="down" aria-label="向下平移画布">↓</button><button type="button" data-map-pan="right" aria-label="向右平移画布">→</button></span>' +
              '</div></div>' +
              '<div class="fl-mindmap-viewport" data-flow-mindmap="1" tabindex="0" role="region" aria-label="关系图画布，方向键平移" data-map-scope="' + esc((activeRun && activeRun.id) || 'current') + '"><div class="fl-mindmap-canvas" style="width:' + canvasW + 'px;height:' + canvasH + 'px"><svg class="fl-mindmap-edges" aria-hidden="true" width="' + canvasW + '" height="' + canvasH + '">' + lineHtml + '</svg>' + turnHtml.join('') + nodeHtml.join('') + '</div></div></div>')
          } else {
          parts.push('<div class="fl-zoom-diff-scroll"><div class="fl-zoom-diff-board" style="grid-template-columns:92px ' + widths.join(' ') + '">')
          parts.push('<div class="fl-diff-corner">轮次</div>')
          for (const c of branches) {
            const branchIndex = branches.indexOf(c) + 1
            parts.push('<div class="fl-diff-session-head" data-action="fzoom-open" data-sid="' + esc(c.rec.sid) + '" role="button" tabindex="0" title="' + openTip + '"><div class="fl-diff-session-label">会话 ' + branchIndex + '</div>' + headOf(c, false) + '</div>')
          }
          if (st.flowDifferences && comparison.rows.every((row) => row.identical)) parts.push('<div class="tb-notice" style="grid-column:1 / -1">已对齐的轮次没有差异。切换“显示全部”可查看完整过程。</div>')
          for (const row of comparison.rows) {
            if (st.flowDifferences && row.identical) continue
            const displayTurn = row.turn === 0 ? 1 : row.turn
            const label = !row.aligned ? '未对齐 · 缺少同源输入证据' : row.same ? '流程一致' : row.values.some((v) => !v) ? '流程缺失' : '流程有差异'
            const gutterCls = !row.aligned ? ' fl-diff-unaligned' : row.same ? ' fl-diff-same' : row.values.some((v) => !v) ? ' fl-diff-missing' : ' fl-diff-change'
            const dim = (name, value) => '<span class="fl-diff-dim fl-diff-dim-' + (value === '同' ? 'same' : value === '异' ? 'change' : 'missing') + '">' + name + ' ' + value + '</span>'
            const roundFork = []
            for (let i = 0; i < branches.length; i++) {
              const value = row.values[i]
              const lastAi = value && value.items.filter((it) => it.kind === 'msg' && it.role === 'ai' && !it.streaming).slice(-1)[0]
              if (lastAi) roundFork.push({ sid: branches[i].rec.sid, seq: lastAi.finalSeq != null ? lastAi.finalSeq : lastAi.seq })
            }
            if (row.sharedInput) parts.push('<div class="fl-diff-shared-input" style="grid-column:1 / -1"><span class="tb-sec-label">共享输入 · 已对齐</span><p>' + esc(oneLine(row.sharedInput, 400)) + '</p></div>')
            parts.push('<div class="fl-diff-gutter' + gutterCls + '"><strong>第 ' + displayTurn + ' 轮</strong><span>' + label + '</span>' +
              (row.aligned ? '<small>' + dim('输入', row.dims.input) + dim('流程', row.dims.flow) + dim('文件', row.dims.files) + dim('结果', row.dims.result) + '</small>' : '') +
              (roundFork.length < 2 || !activeRun || !activeRound ? '' : '<button type="button" class="fl-diff-round-fork" data-zoom-round-fork="1" data-history="' + esc(activeRun.id) + '" data-round="' + esc(activeRound.id) + '" data-turn="' + displayTurn + '" data-spec="' + esc(JSON.stringify(roundFork)) + '" title="以本轮全部 ' + roundFork.length + ' 个会话为来源，创建 ' + targetBranchCount + ' 个新 Session">本轮全部：' + roundFork.length + '→' + targetBranchCount + '</button>') +
              '</div>')
            const baseline = row.values.find((v) => v) || null
            const baselineSig = baseline ? baseline.input + '\n' + baseline.tools + '\n' + baseline.files : ''
            for (let i = 0; i < branches.length; i++) {
              const c = branches[i]
              const value = row.values[i]
              const branchLabel = '分支 ' + (i + 1) + ' · ' + oneLine((c.sum && c.sum.title) || c.rec.sid, 42)
              if (!value) {
                parts.push('<div class="fl-diff-cell fl-diff-cell-missing" data-branch-label="' + esc(branchLabel) + '"><span>− 此对话缺少本轮</span></div>')
                continue
              }
              const sig = value.input + '\n' + value.tools + '\n' + value.files
              const changed = row.aligned && !row.same && sig !== baselineSig
              const hasSubagent = value.items.some((it) => it.kind === 'call' && it.cat === 'subagent')
              const lastAi = value.items.filter((it) => it.kind === 'msg' && it.role === 'ai' && !it.streaming).slice(-1)[0]
              const branchSeq = lastAi ? (lastAi.finalSeq != null ? lastAi.finalSeq : lastAi.seq) : null
              let flowHtml
              if (zoomView === 'detail') {
                const detailState = { ...st, __flowBookmarks: st.__flowBookmarks, zoom: false, sid: c.rec.sid, home: c.rec.sid, crumbs: [], settings: false, expanded: null }
                const nodeRows = await renderFlowNodeRows(buildNodes(row.sharedInput ? value.items.filter((it) => it.role !== 'user') : value.items), detailState, null)
                flowHtml = '<div class="fl-turn-cell-flow ' + (hasSubagent ? 'fl-flow-three' : 'fl-flow-two') + '">' + nodeRows.join('') + '</div>'
              } else {
                const user = value.items.filter((it) => it.kind === 'msg' && it.role === 'user').slice(-1)[0]
                const aiLast = value.items.filter((it) => it.kind === 'msg' && it.role === 'ai').slice(-1)[0]
                const tools = value.items.filter((it) => it.kind === 'call').map((it) => it.name)
                flowHtml = '<div class="fl-compact-diff">' +
                  (user ? '<div><b>▲</b><span>' + esc(oneLine(user.preview || user.full || '', 72)) + '</span></div>' : '') +
                  (tools.length ? '<div><b>◇</b><span>' + esc([...new Set(tools)].join(' → ')) + '</span></div>' : '<div><b>◇</b><span>无工具调用</span></div>') +
                  (aiLast ? '<div><b>◆</b><span>' + esc(oneLine(aiLast.preview || aiLast.full || '', 82)) + '</span></div>' : '') +
                '</div>'
              }
              parts.push('<div class="fl-diff-cell' + (!row.aligned ? ' fl-diff-cell-unaligned' : row.same ? ' fl-diff-cell-same' : changed ? ' fl-diff-cell-change' : ' fl-diff-cell-base') + '" data-branch-label="' + esc(branchLabel) + '" data-flow-detail-session="' + esc(c.rec.sid) + '">' +
                '<div class="fl-diff-cell-head"><span class="fl-diff-mark">' + (row.same ? ' ' : changed ? '+' : '±') + '</span>' +
                  '<span>' + (!row.aligned ? '未对齐' : row.same ? '本轮一致' : changed ? '与基准不同' : '对比基准') + '</span>' +
                  '<span class="fl-comparison-status">' + (value.items.some((it) => it.kind === 'call' ? it.status === 'error' : it.failed || it.interrupted) ? '存在失败或中断' : value.items.some((it) => it.kind === 'call' ? it.status === 'pending' : it.streaming) ? '执行尚未完成' : '已记录结果') + '</span>' +
                  (lastAi && !lastAi.failed && !lastAi.interrupted ? conclusionSelector(c.rec.sid, lastAi.seq, activeRound && activeRound.id) : '') +
                  (branchSeq == null || !activeRun || !activeRound ? '' : '<button type="button" class="fl-diff-branch" data-flow-branch data-history="' + esc(activeRun.id) + '" data-round="' + esc(activeRound.id) + '" data-turn="' + displayTurn + '" data-seq="' + branchSeq + '" title="以会话 ' + (i + 1) + ' 的第 ' + displayTurn + ' 轮回答为唯一来源，创建 ' + targetBranchCount + ' 个新 Session">会话 ' + (i + 1) + '：从第 ' + displayTurn + ' 轮发起 1→' + targetBranchCount + '</button>') +
                '</div>' + flowHtml + '</div>')
            }
          }
          parts.push('</div></div>')
          }
        } else {
        parts.push('<div class="fl-zoom-tree">')
        // 根节点：tree=面板所属会话卡（可进入/可带入）；live=虚拟并发根（纯标识，不可点）
        if (rootC) {
          parts.push('<div class="fl-zoom-card fl-zoom-rootcard' + (rootC.running ? ' fl-live' : '') + '" data-action="fzoom-open" data-sid="' + esc(rootC.rec.sid) + '" role="button" tabindex="0" title="' + openTip + '">' + headOf(rootC, true) + '</div>')
        } else {
          parts.push('<div class="fl-zoom-rootcard fl-zoom-rootcard-virtual"><span class="fl-zoom-title">⚡ ' + esc(activeRun && activeRun.prompt ? oneLine(activeRun.prompt, 54) : inferredFleetPrompt ? oneLine(inferredFleetPrompt, 54) : '本次并发') + ' · ' + total + ' 个会话</span></div>')
        }
        if (!branches.length) {
          parts.push('<div class="tb-notice">还没有分支会话——用开工台「⚡ 同时开始」并发开工，或在单会话里派生子代理</div>')
        } else {
          parts.push('<div class="fl-zoom-trunk"></div>')
          parts.push('<div class="fl-zoom-branches">' + branches.map((c) => {
            const flowHtml = c.sum && c.sum.strip.length
              ? zoomFlowHtml(c.sum)
              : '<div class="fl-zoom-flow"><div class="fl-zoom-step"><span class="fl-zoom-more">（暂无事件）</span></div></div>'
            return '<div class="fl-zoom-branch" data-action="fzoom-open" data-sid="' + esc(c.rec.sid) + '" role="button" tabindex="0" title="' + openTip + '">' +
              '<div class="fl-zoom-card fl-zoom-branch-head' + (c.running ? ' fl-live' : '') + '">' + headOf(c, false) + '</div>' +
              flowHtml +
            '</div>'
          }).join('') + '</div>')
          if (total > shownCards.length) parts.push('<div class="tb-notice">仅显示前 ' + shownCards.length + ' 个分支 · 共 ' + total + ' 个会话</div>')
        }
        parts.push('</div>')
        }
      }
      parts.push('</div>')
      if (nearFlow && st.expanded != null) {
        const target = nearFlow.items.find((it) => it.seq === st.expanded && (it.kind === 'call' || it.kind === 'msg'))
        if (target) parts.push(target.kind === 'call' ? detailRail(target, st.freshSeq === target.seq, st.presentationRules, st) : msgRail(target, st.freshSeq === target.seq, st))
      }
      delete st.freshSeq
      delete st.freshSettings
      parts.push('</div>')
      return parts.join('')
    }

    const render = async (st, sid, live) => {
      if (st.replaySeq != null && st.replaySessionId && st.replaySessionId !== sid) { st.replaySeq = null; st.replaySessionId = '' }
      if (st.zoom && st.replaySeq == null) return renderZoom(st, sid, live)
      if (st.replaySeq != null) st.zoom = false
      const r = await readLog(sid)
      const replaying = st.replaySeq != null
      const events = replayEventsOf(r.events || [], st)
      if (replaying) live = null
      // 活跃度：日志条数较上轮渲染增长 = 会话正在工作（用于助手卡流光；静止会话/他人会话不误亮）
      const prevCount = growth[sid]
      const active = prevCount != null && (r.count || 0) > prevCount
      growth[sid] = r.count || 0
      await loadManifestTools()
      // 事件窗在途 attempt（live 叠加层）= 会话正在生成的最直接信号
      const overlayLive = Boolean(live && Array.isArray(live.attempts) && live.attempts.some((a) => a && a.attemptId != null))
      const items = projectFlowItems(sid, r, live, st.replaySeq)
      const nodes = buildNodes(items)
      // 会话仍在运行且最新事件是一条助手消息 → 该助手卡持续流光；日志增长作为 sessions 服务缺失时的兜底。
      const lastIt = items.length ? items[items.length - 1] : null
      let sessionLive = false
      let hasAgentStatus = false
      try {
        const agentsSvc = ctx.get('agents')
        if (agentsSvc && !replaying) {
          hasAgentStatus = true
          const agent = agentsSvc.get(sid)
          sessionLive = !!(agent && agent.status === 'running')
        }
      } catch (e) {}
      // provider/配额等请求错误有时先把 agent 置 idle，step/end / turn/end 尚未进入本次日志快照。
      // agent 状态是权威终态：强制结算残留流式草稿，避免“正在生成”和客户端计时无限增长。
      // 例外：事件窗在途 attempt（live 叠加层）就是当前进行中的最直接证据——窗口说在生成，
      // 就不按 agent idle 强制结算（跨会话查看/agents 不认识该会话时尤为重要）。
      if (hasAgentStatus && !sessionLive && !overlayLive) {
        const tail = r.events && r.events.length ? r.events[r.events.length - 1] : null
        const settledAt = tail && Number.isFinite(Number(tail.time)) ? Number(tail.time) : null
        for (const it of items) {
          if (it.kind !== 'msg' || it.role !== 'ai' || !it.streaming) continue
          it.streaming = false
          it.interrupted = true
          it.runDur = Math.max(0, (settledAt != null ? settledAt : it.runStart) - it.runStart)
          it.preview = (it.full ? oneLine(it.full, 100) + ' ' : '') + '（生成失败或已中断）'
        }
      }
      const liveAiSeq = !replaying && (overlayLive || (hasAgentStatus ? sessionLive : active)) && lastIt && lastIt.kind === 'msg' && lastIt.role === 'ai' && !lastIt.interrupted ? lastIt.seq : null
      const PAGE = 60
      const limit = Number.isFinite(Number(st.limit)) ? Math.max(PAGE, Math.floor(Number(st.limit) / PAGE) * PAGE) : PAGE
      st.limit = limit
      const selection = selectFlowNodes(nodes, st, limit)
      const shown = selection.shown
      const hasOlder = selection.hasOlder
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root tb-pane" data-flow data-flow-replay-active="' + (replaying ? '1' : '0') + '" data-flow-scope="' + esc(sid) + '" data-flow-has-older="' + (hasOlder ? '1' : '0') + '" data-flow-visible="' + shown.length + '" data-flow-total="' + nodes.length + '" data-autorefresh="' + (replaying ? '0' : flowAutorefreshOf(st)) + '" data-tab-badge="' + (st.live && !replaying ? String(nodes.length) : '') + '">')
      // 固定头
      parts.push('<div class="tb-pane-head">')
      // 钻取态：查看的不是面板所属会话 → 头部给「← 返回」+ 层级标注（crumbs 栈深度）
      const drilled = !!((st.home && sid !== st.home) || (Array.isArray(st.crumbs) && st.crumbs.length))
      const breadcrumbs = st.crumbs.length ? st.crumbs : drilled && st.home ? [{ sid: st.home, label: '当前会话' }] : []
      const firstUser = items.find((it) => it.kind === 'msg' && it.role === 'user')
      const sessionTitle = oneLine((!replaying && r.header && (r.header.title || r.header.name)) || (firstUser && firstUser.preview) || (drilled ? '子代理过程' : '会话执行过程'), 64)
      const pendingTools = items.filter((it) => it.kind === 'call' && it.status === 'pending').length
      const errors = items.filter((it) => it.kind === 'call' ? it.status === 'error' : it.failed || (it.interrupted && it.failCode)).length
      const running = overlayLive || sessionLive || pendingTools > 0
      const executionStatus = (replaying ? '只读回放 · seq ' + st.replaySeq : running ? '运行中' + (pendingTools ? ' · ' + pendingTools + ' 个工具' : '') : '暂无运行任务') + (errors ? ' · ' + errors + ' 项失败' : '')
      const help = [
        '• 中列是用户/助手主线，右列是工具调用（输入 ▶ / 输出 ◀），左列是子代理分支。',
        '• 点击卡片查看完整内容。',
        '• 悬停助手卡可从该节点创建 Harness 分支。',
        '• 画布默认可拖动框选，点击空白处取消框选并收起详情；左下可新建仅所选内容的会话草稿或带入已有会话。',
        '• 面板大小与全屏由 Harness 侧栏控制。',
        '• 点击子代理卡查看执行过程；“查看时同步切换主会话”开启时 Harness 同步切换。',
        '• 滚到顶部会每次自动加载更早 60 个节点。',
      ].join('\n')
      parts.push('<div class="tb-row fl-context-bar"><nav class="fl-breadcrumbs" aria-label="观察范围">' +
        (replaying ? '' : breadcrumbs.map((crumb, index) => '<button type="button" class="tb-chip" data-action="fback" data-depth="' + index + '" title="返回' + esc(crumb.label || '上级会话') + '">' + esc(index === 0 ? (crumb.zoom ? '并发任务' : '当前会话') : (crumb.label || '上级子代理')) + '</button><span aria-hidden="true">/</span>').join('')) +
        '<span aria-current="page">' + (drilled ? '子代理' : '当前会话') + '</span></nav>' +
        '<span class="fl-execution-status' + (errors ? ' has-errors' : '') + '">' + executionStatus + '</span>' + (replaying ? '' : syncStatusHtml(st)) + '</div>')
      parts.push('<div class="tb-row fl-toolbar"><span class="fl-session-title">' + esc(sessionTitle) + '</span>' +
        (flowPreferencesOf(st).zoomEnabled && !replaying ? '<button type="button" class="tb-btn tb-btn-sm" data-action="fzoom">并发任务</button>' : '') +
        '<button type="button" class="tb-btn tb-btn-sm" data-flow-bookmarks="1">标记</button><button type="button" class="tb-btn tb-btn-sm" data-flow-export="1">导出</button>' +
        toolbarMoreHtml(st, help, 'Session ' + sid + ' · ' + items.length + ' 条事件 · ' + nodes.length + ' 个节点') + '</div>')
      parts.push(queryToolbarHtml(st, selection, r.events || []))
      if (errors) parts.push('<button type="button" class="fl-attention tb-chip" data-action="ffilter" data-status="failed">需要关注 · ' + errors + ' 项失败</button>')
      if (st.flowNotice) parts.push('<div class="tb-notice fl-unavailable" role="status">' + esc(st.flowNotice) + '</div>')
      parts.push('</div>')
      // 流程体：tb-pane-body 为 column-reverse——这里以「视觉最新在底」渲染：DOM 先放最新节点，滚动条默认贴底
      parts.push('<div class="tb-pane-body">')
      if (!shown.length) {
        parts.push('<div class="tb-notice">' + (r.unavailable ? '会话日志暂不可用。<button type="button" class="tb-btn tb-btn-sm" data-action="refresh">重试</button>' : selection.filtered ? '没有匹配的节点。可清除筛选或改为搜索全会话日志。' : replaying ? '此时点还没有可显示的节点。' : '当前会话还没有事件') + '</div>')
      } else {
        const rows = await renderFlowNodeRows(shown, st, liveAiSeq)
        parts.push(rows.reverse().join(''))
        if (hasOlder) parts.push('<div class="tb-notice fl-older" data-flow-older-hint>' +
          '已显示最近 ' + shown.length + ' 个节点 · 继续向上滚动会自动加载更早 ' + Math.min(PAGE, nodes.length - shown.length) + ' 条' +
        '</div>')
      }
      parts.push('</div>')
      // 详情右侧浮层：展开状态且目标仍在可视事件集内时渲染（工具调用→传入/返回；消息→完整内容）
      if (st.expanded != null) {
        const target = items.find((it) => it.seq === st.expanded && (it.kind === 'call' || it.kind === 'msg'))
        if (target) parts.push(target.kind === 'call' ? detailRail(target, st.freshSeq === target.seq, st.presentationRules, st) : msgRail(target, st.freshSeq === target.seq, st))
      }
      delete st.freshSeq // 一次性动画标记，不残留进 state
      delete st.freshSettings
      parts.push('</div>')
      return parts.join('')
    }

    const handler = async ({ action, fields, state, session, live }) => {
      if (!sq) return { ok: false, error: 'sessionQuery 服务不可用', html: '' }
      const st = (state && typeof state === 'object' && state) ? state : { live: true, follow: true, limit: 60, sid: null, home: null, expanded: null, crumbs: [] }
      const wireState = () => {
        for (const key of ['__flowPreferences', '__flowBookmarks', '__zoomSessionIndex', '__archivedSessionIds']) {
          try { delete st[key] } catch (e) {}
        }
        return st
      }
      const flowPreferences = normalizeFlowPreferences(fields && fields.__flowPreferences)
      try { Object.defineProperty(st, '__flowPreferences', { value: flowPreferences, configurable: true }) } catch (e) {}
      st.flowSearch = typeof st.flowSearch === 'string' ? st.flowSearch.slice(0, 500) : ''
      st.flowSearchScope = st.flowSearchScope === 'all' ? 'all' : 'loaded'
      st.flowRole = ['all', 'user', 'ai', 'inject', 'call'].includes(st.flowRole) ? st.flowRole : 'all'
      st.flowStatus = ['all', 'running', 'failed'].includes(st.flowStatus) ? st.flowStatus : 'all'
      st.flowDifferences = st.flowDifferences === true
      st.replaySeq = st.replaySeq != null && Number.isFinite(Number(st.replaySeq)) && Number(st.replaySeq) >= 0 ? Number(st.replaySeq) : null
      let bookmarks = []
      try { const parsed = JSON.parse(fields && fields.__flowBookmarks || '[]'); if (Array.isArray(parsed)) bookmarks = parsed.slice(0, 1000) } catch (e) {}
      try { Object.defineProperty(st, '__flowBookmarks', { value: bookmarks, configurable: true }) } catch (e) {}
      // 显示规则设置已迁到官方插件详情页；旧版本遗留的侧栏打开态在升级后直接收起。
      st.settings = false
      if (typeof st.follow !== 'boolean') st.follow = true
      if (!Number.isFinite(Number(st.limit)) || Number(st.limit) < 60) st.limit = 60
      if (typeof st.expanded !== 'number' && st.expanded != null) st.expanded = null
      if (!Array.isArray(st.crumbs)) st.crumbs = []
      if (typeof st.zoom !== 'boolean') st.zoom = false
      if (st.zoomScope !== 'tree' && st.zoomScope !== 'run') st.zoomScope = 'tree'
      if (st.zoomView !== 'compact' && st.zoomView !== 'detail' && st.zoomView !== 'map') st.zoomView = flowPreferences.defaultZoomView
      if (typeof st.zoomFocusSid !== 'string') st.zoomFocusSid = ''
      if (typeof st.zoomLastFocusSid !== 'string') st.zoomLastFocusSid = ''
      if (st.zoomMode !== 'panorama' && st.zoomMode !== 'near') st.zoomMode = st.zoomFocusSid ? 'near' : 'panorama'
      if (typeof st.zoomComposerOpen !== 'boolean') st.zoomComposerOpen = false
      // 近观开工台「沿用当前会话」：开启后 1→N 时当前会话作为分支 1 直接继续，只新建 N−1 个分支
      if (typeof st.zoomReuse !== 'boolean') st.zoomReuse = false
      if (typeof st.zoomHistoryOpen !== 'boolean') st.zoomHistoryOpen = false
      if (!Array.isArray(st.zoomExpandedHistories)) st.zoomExpandedHistories = []
      if (!Array.isArray(st.zoomRuns)) st.zoomRuns = []
      st.zoomRuns = normalizeZoomRuns(st.zoomRuns)
      let archivedSessionIds = []
      if (fields && typeof fields.__flowArchivedSessionIds === 'string' && fields.__flowArchivedSessionIds) {
        try {
          const rawArchived = JSON.parse(fields.__flowArchivedSessionIds)
          if (Array.isArray(rawArchived)) archivedSessionIds = rawArchived.slice(0, 1000).filter((id) => typeof id === 'string' && /^[\w-]{1,100}$/.test(id))
        } catch (e) {}
      }
      const archivedSessionSet = new Set(archivedSessionIds)
      try { Object.defineProperty(st, '__archivedSessionIds', { value: archivedSessionSet, configurable: true }) } catch (e) {}
      if (archivedSessionSet.size) {
        st.zoomRuns = st.zoomRuns.map((run) => {
          const rounds = run.rounds.map((round) => {
            const keep = round.sids.map((sid, i) => ({ sid, i })).filter((item) => !archivedSessionSet.has(item.sid))
            return {
              ...round,
              sourceSids: round.sourceSids.filter((sid) => !archivedSessionSet.has(sid)),
              sids: keep.map((item) => item.sid),
              routes: keep.map((item) => round.routes[item.i] || ''),
              efforts: keep.map((item) => round.efforts[item.i] || ''),
            }
          }).filter((round) => round.sids.length)
          const latest = rounds[rounds.length - 1]
          return latest ? { ...run, rounds, sids: latest.sids, routes: latest.routes, efforts: latest.efforts } : null
        }).filter(Boolean)
      }
      // Client 会话索引只服务本次渲染，不进入返回 state / localStorage。严格裁剪字段与长度。
      let zoomSessionIndex = []
      if (fields && typeof fields.__flowSessionIndex === 'string' && fields.__flowSessionIndex) {
        try {
          const rawIndex = JSON.parse(fields.__flowSessionIndex)
          if (Array.isArray(rawIndex)) zoomSessionIndex = rawIndex.slice(0, 200).map((x) => ({
            id: x && typeof x.id === 'string' && /^[\w-]{1,100}$/.test(x.id) ? x.id : '',
            title: x && typeof x.title === 'string' ? x.title.slice(0, 160) : '',
            cwd: x && typeof x.cwd === 'string' ? x.cwd.slice(0, 260) : '',
          })).filter((x) => x.id && x.title && !archivedSessionSet.has(x.id))
        } catch (e) {}
      }
      try { Object.defineProperty(st, '__zoomSessionIndex', { value: zoomSessionIndex, configurable: true }) } catch (e) {}
      if (typeof st.zoomRunId !== 'string') st.zoomRunId = ''
      if (typeof st.zoomRoundId !== 'string') st.zoomRoundId = ''
      // Client localStorage 是跨 Session/Tab 重挂的批次日志来源；每次请求注入，Host 只消费校验后的紧凑副本。
      if (fields && typeof fields.__flowZoomLog === 'string' && fields.__flowZoomLog) {
        try {
          const saved = JSON.parse(fields.__flowZoomLog)
          st.zoomRuns = normalizeZoomRuns(saved && saved.runs)
          st.zoomRunId = saved && typeof saved.activeId === 'string' ? saved.activeId : st.zoomRunId
          st.zoomRoundId = saved && typeof saved.roundId === 'string' ? saved.roundId : st.zoomRoundId
          if (saved && typeof saved.open === 'boolean') st.zoom = saved.open
          if (saved && (saved.scope === 'run' || saved.scope === 'tree')) st.zoomScope = saved.scope
          if (saved && (saved.view === 'compact' || saved.view === 'detail' || saved.view === 'map')) st.zoomView = saved.view
          if (saved && typeof saved.focusSid === 'string') st.zoomFocusSid = saved.focusSid
          if (saved && typeof saved.lastFocusSid === 'string') st.zoomLastFocusSid = saved.lastFocusSid
          if (saved && (saved.mode === 'panorama' || saved.mode === 'near')) st.zoomMode = saved.mode
        } catch (e) {}
      }
      if (!flowPreferences.zoomEnabled) {
        st.zoom = false
        st.zoomComposerOpen = false
        if (typeof action === 'string' && action.indexOf('fzoom') === 0) action = ''
      }
      if (!st.zoomRuns.some((x) => x.id === st.zoomRunId)) st.zoomRunId = st.zoomRuns.length ? st.zoomRuns[st.zoomRuns.length - 1].id : ''
      if (st.zoomScope === 'run' && session && st.zoomBoundSessionId !== session) {
        const selected = st.zoomRuns.find((x) => x.id === st.zoomRunId)
        const selectedRound = selected && (selected.rounds.find((x) => x.id === st.zoomRoundId) || selected.rounds[selected.rounds.length - 1])
        // 大流镜主动近观分支并跟随 Harness 时，只是镜头移到了该分支；不能因为 Session
        // 随之变化就重新绑定到另一条（可能只有一个成员的）较新历史，否则切回全景只剩一张卡。
        const internalFocusNavigation = st.zoomFocusSid === session && selectedRound
          && (selectedRound.sids.includes(session) || selectedRound.sourceSids.includes(session))
        if (!internalFocusNavigation) {
          const latest = latestZoomRunForSession(st.zoomRuns, session)
          if (latest) { st.zoomRunId = latest.run.id; st.zoomRoundId = latest.round.id }
          // Harness 手动切换/面板重挂时，近观继续保持该模式，但目标必须换成当前 Session；
          // 不允许 localStorage 中旧批次的 focusSid 把视图带到另一个空白输出会话。
          st.sid = session
          st.zoomFocusSid = session
          st.zoomLastFocusSid = session
        }
        st.zoomBoundSessionId = session
      }
      const selectedHistory = st.zoomRuns.find((x) => x.id === st.zoomRunId)
      if (selectedHistory && !selectedHistory.rounds.some((x) => x.id === st.zoomRoundId)) st.zoomRoundId = selectedHistory.rounds[selectedHistory.rounds.length - 1].id
      st.zoomExpandedHistories = st.zoomExpandedHistories.filter((id) => typeof id === 'string' && st.zoomRuns.some((run) => run.id === id))
      // 模型分支（路由 + 思考强度；空值跟随当前/模型默认；2–4 条，左→右对应看板分支列）
      if (!Array.isArray(st.zoomLanes) || st.zoomLanes.length < 2) st.zoomLanes = Array(flowPreferences.defaultBranchCount).fill('')
      st.zoomLanes = st.zoomLanes.slice(0, 4).map((v) => (typeof v === 'string' ? v : ''))
      if (!Array.isArray(st.zoomEfforts)) st.zoomEfforts = []
      st.zoomEfforts = st.zoomLanes.map((_, i) => (typeof st.zoomEfforts[i] === 'string' ? st.zoomEfforts[i] : ''))
      if (fields && Object.prototype.hasOwnProperty.call(fields, '__flowPresentationRules')) {
        st.presentationRules = normalizePresentationRules(fields.__flowPresentationRules)
      } else if (!Array.isArray(st.presentationRules)) st.presentationRules = normalizePresentationRules(DEFAULT_PRESENTATION_RULES)
      const el = fields && fields.__el ? fields.__el : {}
      // home=面板所属会话（钻取不改变归属）；sid=当前查看的会话（默认=home）。
      // 跟随模式下 Harness 已经把当前 session 切到 st.sid，但 crumbs 表明这仍是
      // 从父流镜钻取进来的链；此时必须保留原 home，才能继续渲染“← 返回”。
      const carriedFollow = st.follow === true && st.home && session && st.sid === session
        && (st.crumbs.length > 0 || (st.zoom && st.zoomFocusSid === session))
      const home = carriedFollow ? st.home : (session || st.home || st.sid)
      if (!home) return { ok: true, html: '<div class="jr-tabpanel tb-root"><div class="tb-notice">未找到当前会话</div></div>', state: wireState() }
      st.home = home
      if (!st.sid) st.sid = home
      let navigateSession = null
      let flowContext = null
      let zoomRelay = null
      // live 叠加层归一：只接受属于当前查看会话的窗快照（钻取到子会话时忽略）；
      // attempts = 在途 attempt；settled = 最近结算 attempt 的 firstSeq（UI 连续性）。
      const liveOverlay = live && typeof live === 'object' && typeof live.sessionId === 'string' && live.sessionId === st.sid
        ? {
          sessionId: live.sessionId,
          revision: typeof live.revision === 'number' ? live.revision : 0,
          attempts: Array.isArray(live.attempts) ? live.attempts.slice(-8) : [],
          settled: Array.isArray(live.settled) ? live.settled.slice(-8) : [],
        }
        : null
      if (action === 'fsearch' || action === 'ffilter') {
        st.flowSearch = typeof fields.flowSearch === 'string' ? fields.flowSearch.slice(0, 500) : st.flowSearch
        st.flowSearchScope = fields.flowSearchScope === 'all' ? 'all' : fields.flowSearchScope === 'loaded' ? 'loaded' : st.flowSearchScope
        if (['all', 'user', 'ai', 'inject', 'call'].includes(fields.flowRole)) st.flowRole = fields.flowRole
        if (['all', 'running', 'failed'].includes(fields.flowStatus)) st.flowStatus = fields.flowStatus
        if (el.status === 'failed') { st.flowStatus = 'failed'; st.flowSearchScope = 'all' }
        st.expanded = null
      } else if (action === 'fsearch-clear') {
        st.flowSearch = ''; st.flowRole = 'all'; st.flowStatus = 'all'; st.expanded = null
      } else if (action === 'fdifferences') st.flowDifferences = !st.flowDifferences
      else if (action === 'freplay' || action === 'freplay-live') {
        if (action === 'freplay-live') { st.replaySeq = null; st.replaySessionId = '' }
        else {
          const log = await readLog(st.sid)
          const seqs = (log.events || []).map((e) => Number(e.seq)).filter(Number.isFinite).sort((a, b) => a - b)
          const max = seqs.length ? seqs[seqs.length - 1] : 0
          const value = Number(fields.flowReplaySeq)
          let target = Number.isFinite(value) ? value : st.replaySeq == null ? max : st.replaySeq
          if (Number(el.step) < 0) target = seqs.filter((seq) => seq < target).pop() || 0
          if (Number(el.step) > 0) target = seqs.find((seq) => seq > target) || max
          st.replaySeq = Math.max(0, Math.min(max, target)); st.replaySessionId = st.sid; st.zoom = false
        }
        st.expanded = null
      } else if (action === 'fbookmark-jump') {
        const targetSid = typeof el.sid === 'string' && /^[\w-]{1,100}$/.test(el.sid) ? el.sid : ''
        const seq = Number(el.seq)
        let log = { events: [] }
        try { if (targetSid && !st.__archivedSessionIds.has(targetSid)) log = await readLog(targetSid) } catch (e) {}
        const target = parseItems(log.events || []).find((it) => it.seq === seq && it.kind === el.kind)
        if (!target) st.flowNotice = '此标记的节点已不可用；会话可能已归档、移除，或节点记录已经变化。'
        else {
          st.sid = targetSid; st.zoom = false; st.replaySeq = null; st.expanded = seq; st.freshSeq = seq
          st.flowSearch = ''; st.flowRole = 'all'; st.flowStatus = 'all'; st.flowNotice = ''
          const nodes = buildNodes(parseItems(log.events || []))
          const at = nodes.findIndex((n) => n.t === 'msg' ? n.it === target || n.it.seq === seq : n.calls.some((c) => c.seq === seq))
          st.limit = Math.max(60, Math.ceil((nodes.length - at) / 60) * 60)
        }
      } else if (action === 'toggle-live') st.live = !st.live
      else if (action === 'toggle-follow') st.follow = !st.follow
      else if (action === 'fzoom') {
        st.zoom = !st.zoom
        if (st.zoom) {
          const latest = latestZoomRunForSession(st.zoomRuns, session || st.sid)
          if (latest) {
            st.zoomScope = 'run'; st.zoomRunId = latest.run.id; st.zoomRoundId = latest.round.id; st.zoomFocusSid = ''
          } else st.zoomScope = 'tree'
          st.zoomBoundSessionId = session || st.sid || ''
          // 进入大流镜时的默认观察尺度交由 renderZoom 按全景卡数选择（多卡→全景；单卡→近观），消费即删。
          st.zoomAutoMode = true
        }
        st.expanded = null
        st.settings = false
      }
      else if (action === 'fzoom-scope') {
        st.zoomScope = el.scope === 'run' ? 'run' : 'tree'
        if (st.zoomScope === 'run') {
          const latest = latestZoomRunForSession(st.zoomRuns, session || st.sid)
          if (latest) { st.zoomRunId = latest.run.id; st.zoomRoundId = latest.round.id; st.zoomFocusSid = '' }
          st.zoomBoundSessionId = session || st.sid || ''
        }
      }
      else if (action === 'fzoom-view') {
        st.zoomView = el.view === 'detail' ? 'detail' : el.view === 'map' ? 'map' : 'compact'
      }
      else if (action === 'fzoom-composer-close') st.zoomComposerOpen = false
      else if (action === 'fzoom-composer') st.zoomComposerOpen = !st.zoomComposerOpen
      else if (action === 'fzoom-reuse') st.zoomReuse = !st.zoomReuse
      else if (action === 'fzoom-history') st.zoomHistoryOpen = !st.zoomHistoryOpen
      else if (action === 'fzoom-history-toggle' && typeof el.run === 'string' && st.zoomRuns.some((run) => run.id === el.run)) {
        st.zoomExpandedHistories = st.zoomExpandedHistories.includes(el.run)
          ? st.zoomExpandedHistories.filter((id) => id !== el.run)
          : [...st.zoomExpandedHistories, el.run]
      }
      else if (action === 'fzoom-focus-back') { st.zoomMode = 'panorama'; st.zoomMotion = 'overview' }
      else if (action === 'fzoom-focus-current') {
        const run = st.zoomRuns.find((x) => x.id === st.zoomRunId) || st.zoomRuns[st.zoomRuns.length - 1]
        const round = run && (run.rounds.find((x) => x.id === st.zoomRoundId) || run.rounds[run.rounds.length - 1])
        const remembered = typeof st.zoomLastFocusSid === 'string' ? st.zoomLastFocusSid : ''
        const selected = typeof st.zoomFocusSid === 'string' ? st.zoomFocusSid : ''
        const target = selected || remembered || (round && (round.sids.includes(st.sid) ? st.sid : round.sids[0])) || st.sid
        if (target) { st.zoom = true; st.zoomMode = 'near'; st.zoomFocusSid = target; st.zoomLastFocusSid = target; st.sid = target; st.expanded = null; st.zoomMotion = 'focus' }
      }
      else if (action === 'fzoom-lane') {
        // 模型分支选择回写：值必须是已加载路由或 ''（默认）；未知值一律忽略
        const idx = Number(el.lane)
        const value = typeof fields['zoomLane.' + idx] === 'string' ? fields['zoomLane.' + idx] : ''
        const routes = await buildZoomRoutes()
        if (Number.isInteger(idx) && idx >= 0 && idx < st.zoomLanes.length && (value === '' || routes.some((r) => r.value === value))) {
          st.zoomLanes = st.zoomLanes.map((v, i) => (i === idx ? value : v))
          const meta = routes.find((r) => r.value === value)
          const prior = st.zoomEfforts[idx] || ''
          st.zoomEfforts = st.zoomEfforts.map((v, i) => (i === idx && (!meta || !meta.efforts.some((e) => e.id === prior)) ? '' : v))
        }
      }
      else if (action === 'fzoom-effort') {
        const idx = Number(el.lane)
        const value = typeof fields['zoomEffort.' + idx] === 'string' ? fields['zoomEffort.' + idx] : ''
        const routes = await buildZoomRoutes()
        const meta = routes.find((r) => r.value === st.zoomLanes[idx])
        if (Number.isInteger(idx) && idx >= 0 && idx < st.zoomEfforts.length && (value === '' || (meta && meta.efforts.some((e) => e.id === value)))) {
          st.zoomEfforts = st.zoomEfforts.map((v, i) => (i === idx ? value : v))
        }
      }
      else if (action === 'fzoom-lane-add' && st.zoomLanes.length < 4) {
        st.zoomLanes = [...st.zoomLanes, '']
        st.zoomEfforts = [...st.zoomEfforts, '']
      }
      else if (action === 'fzoom-lane-del' && st.zoomLanes.length > 2) {
        st.zoomLanes = st.zoomLanes.slice(0, -1)
        st.zoomEfforts = st.zoomEfforts.slice(0, -1)
      }
      else if (action === 'fzoom-lanes') {
        const count = Math.max(2, Math.min(4, Number(el.count) || 2))
        while (st.zoomLanes.length < count) { st.zoomLanes.push(''); st.zoomEfforts.push('') }
        st.zoomLanes = st.zoomLanes.slice(0, count)
        st.zoomEfforts = st.zoomEfforts.slice(0, count)
      }
      else if (action === 'fzoom-joined' && typeof el.sids === 'string') {
        // 新开工创建根历史；从历史轮次派生则复制此前轮次前缀并追加一轮，原历史保持不变。
        const sids = el.sids.split(',').map((s) => s.trim()).filter((s) => /^[\w-]{1,80}$/.test(s))
        if (sids.length) {
          let meta = {}
          try { meta = el.meta ? JSON.parse(el.meta) : {} } catch (e) {}
          const now = Date.now()
          let base = typeof meta.baseHistoryId === 'string' ? st.zoomRuns.find((x) => x.id === meta.baseHistoryId) : null
          let baseAt = base && typeof meta.baseRoundId === 'string' ? base.rounds.findIndex((x) => x.id === meta.baseRoundId) : -1
          // 近观 1→N 的历史归属：Client 只带来源会话（linkSource），由 Host 解析它所属历史的
          // 最近成员/来源轮作为基线——命中最新轮且无子历史时延长同一历史，否则开派生分支，原历史不覆盖。
          if (!base && typeof meta.linkSource === 'string' && /^[\w-]{1,80}$/.test(meta.linkSource)) {
            const hit = latestZoomRunForSession(st.zoomRuns, meta.linkSource)
            if (hit) { base = hit.run; baseAt = hit.run.rounds.findIndex((x) => x.id === hit.round.id) }
          }
          const appendExisting = !!(base && baseAt === base.rounds.length - 1 && !st.zoomRuns.some((x) => x.parentId === base.id))
          const prefix = base ? base.rounds.slice(0, baseAt >= 0 ? baseAt + 1 : base.rounds.length).map((x) => ({ ...x, sids: x.sids.slice(), sourceSids: x.sourceSids.slice(), routes: x.routes.slice(), efforts: x.efforts.slice() })) : []
          const sourceSids = Array.isArray(meta.sourceSids) ? [...new Set(meta.sourceSids.map(String).filter((s) => /^[\w-]{1,80}$/.test(s)))].slice(0, 4) : []
          if (!base && sourceSids.length) prefix.push({ id: 'round-' + now.toString(36) + '-0-initial', kind: 'initial', at: now, prompt: '初始', sourceSids: [], sids: sourceSids, routes: sourceSids.map(() => ''), efforts: sourceSids.map(() => '') })
          const round = {
            id: 'round-' + now.toString(36) + '-' + prefix.length + '-' + hashText(sids.join(',')), kind: prefix.length ? 'round' : 'initial', at: now,
            prompt: typeof meta.prompt === 'string' ? meta.prompt.slice(0, 240) : '',
            sourceSids: sourceSids.length ? sourceSids : (prefix.length ? prefix[prefix.length - 1].sids.slice() : []),
            sids: [...new Set(sids)].slice(0, 4),
            routes: Array.isArray(meta.routes) ? meta.routes.map(String).slice(0, sids.length) : [],
            efforts: Array.isArray(meta.efforts) ? meta.efforts.map(String).slice(0, sids.length) : [],
          }
          prefix.push(round)
          const run = appendExisting ? base : {
            id: 'run-' + now.toString(36) + '-' + st.zoomRuns.length + '-' + hashText(sids.join(',')), at: now,
            prompt: typeof meta.prompt === 'string' ? meta.prompt.slice(0, 240) : '',
            name: '大流镜 ' + String.fromCharCode(65 + (st.zoomRuns.length % 26)),
            parentId: base ? base.id : '', forkRoundId: base && baseAt >= 0 ? base.rounds[baseAt].id : '', rounds: [],
            sids: [], routes: [], efforts: [],
          }
          run.rounds = prefix
          run.prompt = typeof meta.prompt === 'string' ? meta.prompt.slice(0, 240) : run.prompt
          run.sids = round.sids; run.routes = round.routes; run.efforts = round.efforts
          if (!appendExisting) st.zoomRuns = [...st.zoomRuns, run].slice(-20)
          st.zoomRunId = run.id
          st.zoomRoundId = round.id
          st.zoomScope = 'run'
          st.zoom = true
          st.zoomFocusSid = ''
        }
      }
      else if (action === 'fzoom-run') {
        const id = typeof el.run === 'string' ? el.run : (typeof fields.zoomRunId === 'string' ? fields.zoomRunId : '')
        if (st.zoomRuns.some((x) => x.id === id)) {
          st.zoomRunId = id
          const run = st.zoomRuns.find((x) => x.id === id)
          st.zoomRoundId = run.rounds[run.rounds.length - 1].id
          st.zoomScope = 'run'
          st.zoom = true
          st.zoomFocusSid = ''
          st.zoomHistoryOpen = false
        }
      }
      else if (action === 'fzoom-round') {
        const run = st.zoomRuns.find((x) => x.id === el.run)
        if (run && run.rounds.some((x) => x.id === el.round)) {
          st.zoomRunId = run.id; st.zoomRoundId = el.round; st.zoomScope = 'run'; st.zoom = true; st.zoomFocusSid = ''; st.zoomHistoryOpen = false
        }
      }
      else if (action === 'fzoom-run-add' && typeof el.sid === 'string' && /^[\w-]{1,100}$/.test(el.sid)) {
        const run = st.zoomRuns.find((x) => x.id === (el.run || st.zoomRunId))
        const round = run && (el.round ? run.rounds.find((x) => x.id === el.round) : run.rounds.find((x) => x.id === st.zoomRoundId) || run.rounds[run.rounds.length - 1])
        if ((el.run || el.round) && (!run || !round)) return { ok: false, error: '恢复目标轮次已不可用，请在任务历史中核对。', html: '', state: wireState() }
        if (run && round && !round.sids.includes(el.sid) && round.sids.length < 4) {
          round.sids.push(el.sid); round.routes.push(typeof el.route === 'string' ? el.route : ''); round.efforts.push(typeof el.effort === 'string' ? el.effort : '')
          if (round === run.rounds[run.rounds.length - 1]) { run.sids = round.sids; run.routes = round.routes; run.efforts = round.efforts }
        }
      }
      else if (action === 'fzoom-run-remove' && typeof el.sid === 'string') {
        const run = st.zoomRuns.find((x) => x.id === st.zoomRunId)
        const round = run && (run.rounds.find((x) => x.id === st.zoomRoundId) || run.rounds[run.rounds.length - 1])
        if (run && round && round.sids.length > 1) {
          const at = round.sids.indexOf(el.sid)
          if (at >= 0) {
            round.sids.splice(at, 1); round.routes.splice(at, 1); round.efforts.splice(at, 1)
            run.sids = round.sids; run.routes = round.routes; run.efforts = round.efforts
            if (st.zoomFocusSid === el.sid) st.zoomFocusSid = ''
          }
        }
      }
      else if (action === 'fzoom-relay' && typeof el.sid === 'string' && el.sid) {
        if (st.replaySeq != null) return { ok: false, error: '只读回放中不能带入实时结论，请先返回最新。', html: '', state: wireState() }
        // 会话互通：取源会话最近一条助手结论全文，交 Client 带入/发送到目标会话（沿用「带入会话」机制）
        const r = await readLog(el.sid)
        const items = parseItems(r.events || [])
        let lastAi = null
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i]
          if (it.kind === 'msg' && it.role === 'ai' && it.full && !it.streaming) { lastAi = it; break }
        }
        if (!lastAi) return { ok: false, error: '该会话还没有可带入的助手结论', html: '', state: wireState() }
        const text = String(lastAi.full)
        zoomRelay = {
          sourceSessionId: el.sid,
          text: '【来自会话 ' + el.sid.replace(/^session-/, '').slice(0, 8) + ' 的最新结论】\n' + (text.length > 12000 ? text.slice(0, 12000) + '\n…（截断，共 ' + text.length + ' 字符）' : text),
        }
      }
      else if (action === 'fzoom-open' && typeof el.sid === 'string' && el.sid) {
        // 从全景点入某个分支就是一次镜头放大，进入近观；已在近观时切换分支仍保持近观。
        // Harness 自己切换 Session 不走此动作，观察模式仍由 zoomMode 独立保持。
        const target = el.sid
        if (typeof el.run === 'string' && st.zoomRuns.some((x) => x.id === el.run)) {
          st.zoomRunId = el.run
          const run = st.zoomRuns.find((x) => x.id === el.run)
          if (run && typeof el.round === 'string' && run.rounds.some((x) => x.id === el.round)) st.zoomRoundId = el.round
          st.zoomScope = 'run'
        }
        st.zoom = true
        st.zoomMode = 'near'
        st.zoomFocusSid = target
        st.zoomLastFocusSid = target
        st.zoomMotion = 'focus'
        st.expanded = null
        if (target !== st.sid) {
          st.sid = target
          if (st.follow) {
            let hdr = null
            try { const ss = ctx.get('sessions'); const liveS = ss && typeof ss.get === 'function' ? ss.get(target) : null; if (liveS) hdr = liveS.header } catch (e) {}
            if (!hdr) { try { const rr = await readLog(target); hdr = rr.header || null } catch (e) {} }
            const parent = hdr && typeof hdr.parentSession === 'string' ? hdr.parentSession : ''
            navigateSession = hdr && hdr.origin === 'subagent' && parent
              ? { sessionId: target, parentSessionId: parent, kind: 'subagent' }
              : { sessionId: target, kind: 'session' }
          }
        }
      }
      else if (action === 'fsettings') {
        const opening = !st.settings
        st.settings = opening
        if (opening) st.freshSettings = true
        st.expanded = null
        st.ruleNotice = ''
      }
      else if (action === 'fsave-rule') {
        const index = Number(el.index)
        if (!Number.isInteger(index) || index < 0 || index >= st.presentationRules.length) throw new Error('要保存的显示规则不存在')
        const next = normalizePresentationRules([ruleFromFields(fields, 'flowRule.' + index)])[0]
        st.presentationRules = st.presentationRules.map((rule, at) => at === index ? next : rule)
        st.settings = true
        st.ruleNotice = '已保存规则 ' + (index + 1)
      }
      else if (action === 'fcreate-rule') {
        if (st.presentationRules.length >= MAX_PRESENTATION_RULES) throw new Error('显示规则最多 ' + MAX_PRESENTATION_RULES + ' 条')
        const next = normalizePresentationRules([ruleFromFields(fields, 'flowRule.new')])[0]
        st.presentationRules = [...st.presentationRules, next]
        st.settings = true
        st.ruleNotice = '已添加规则 ' + st.presentationRules.length
      }
      else if (action === 'fapply-rule-json') {
        st.presentationRules = normalizePresentationRules(fields.flowPresentationRules || '[]')
        st.settings = true
        st.ruleNotice = '已从 JSON 应用 ' + st.presentationRules.length + ' 条规则'
      }
      else if (action === 'ftoggle-rule') {
        const index = Number(el.index)
        if (!Number.isInteger(index) || index < 0 || index >= st.presentationRules.length) throw new Error('要切换的显示规则不存在')
        st.presentationRules = st.presentationRules.map((rule, at) => at === index ? { ...rule, enabled: !rule.enabled } : rule)
        st.settings = true
        st.ruleNotice = st.presentationRules[index].enabled ? '已启用规则 ' + (index + 1) : '已停用规则 ' + (index + 1)
      }
      else if (action === 'fdelete-rule') {
        const index = Number(el.index)
        if (!Number.isInteger(index) || index < 0 || index >= st.presentationRules.length) throw new Error('要删除的显示规则不存在')
        st.presentationRules = st.presentationRules.filter((_rule, at) => at !== index)
        st.settings = true
        st.ruleNotice = '已删除规则 ' + (index + 1)
      }
      else if (action === 'freset-rules') {
        st.presentationRules = []
        st.settings = true
        st.ruleNotice = '已清空显示规则'
      }
      else if (action === 'fmore') st.limit = Math.min(100000, Number(st.limit) + 60)
      else if (action === 'fcontext' && typeof el.seqs === 'string') {
        const seqs = el.seqs.split(',').map((v) => Number(v)).filter((v) => Number.isFinite(v))
        const r = await readLog(st.sid)
        const items = parseItems(replayEventsOf(r.events || [], st), st.replaySeq == null ? liveOverlay : null)
        if (el.requireCompleted === '1' && (seqs.length !== 1 || !items.some((it) => it.seq === seqs[0] && it.kind === 'msg' && it.role === 'ai' && !it.streaming && !it.failed && !it.interrupted && !it.abandoned))) {
          return { ok: false, error: '所选结论已不可用或尚未完成，请重新选择已完成的助手节点。', html: '', state: wireState() }
        }
        flowContext = flowContextOf(items, seqs, st.sid)
      }
      else if (action === 'fdetail' && el.seq != null) {
        const seq = Number(el.seq)
        st.expanded = st.expanded === seq ? null : seq
        st.freshSeq = st.expanded // 仅新展开的那次渲染播放滑入动画（null=收起不播；轮询不重播）
      } else if (action === 'fenter' && el.seq != null && st.replaySeq == null) {
        // 钻取：解析当前查看会话的日志，找到该子代理调用的子会话 id 后切入（当前会话压栈）
        const seq = Number(el.seq)
        const r = await readLog(st.sid)
        const call = parseItems(r.events || []).find((it) => it.kind === 'call' && it.seq === seq && it.cat === 'subagent')
        const cid = call ? childIdOf(call) : null
        if (cid && cid !== st.sid) {
          const parentSid = st.sid
          const firstUser = parseItems(r.events || []).find((it) => it.kind === 'msg' && it.role === 'user')
          st.crumbs.push({ sid: st.sid, label: oneLine((r.header && (r.header.title || r.header.name)) || (firstUser && firstUser.preview) || '上级会话', 32) })
          st.sid = cid
          st.expanded = null
          if (st.follow) navigateSession = { sessionId: cid, parentSessionId: parentSid, kind: 'subagent' }
        }
      } else if (action === 'fback' && st.replaySeq == null) {
        const depth = el.depth == null ? st.crumbs.length - 1 : Number(el.depth)
        const prev = Number.isInteger(depth) && depth >= 0 && depth < st.crumbs.length ? st.crumbs[depth] : !st.crumbs.length && st.home && st.home !== st.sid ? { sid: st.home } : null
        if (prev) st.crumbs = st.crumbs.slice(0, depth)
        if (prev && prev.sid) {
          st.sid = prev.sid
          st.expanded = null
          if (prev.zoom === true) st.zoom = true // 从总览点进来的：返回即回到大流镜总览
          if (st.follow) navigateSession = { sessionId: prev.sid, kind: 'session' }
        }
      }
      const sid = st.sid
      try {
        const html = await render(st, sid, liveOverlay)
        if (st.replaySeq != null) navigateSession = undefined
        return { ok: true, html, state: wireState(), navigateSession, flowContext, zoomRelay }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e), html: '', state: wireState() }
      }
    }

    tryRegisterTool(ctx, { id: 'flow', label: '流镜', order: 2, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M8 4.5v2.2M8 6.7L4 11M8 6.7l4 4.3"/></svg>' }, handler)
  },
}
