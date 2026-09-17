// ===== flow-tool.js：实时流镜（Host-only，经工具箱 RPC 注册）=====
// 当前 session 在干什么 → 自上而下不断加载的流程图（与「轨迹」工具互补：轨迹是过滤时间线，流程图是形态视图）。
// 形态约定（用户定制）：
//   · 主 session：自上而下箭头串联 用户消息 → 助手 → 工具组 → 助手 …（最新在底部，滚动条贴底跟随）
//   · 子代理（subagent/workflow/ralph）：git 树形式——从主干 ├─ 分出支线，支线内实时展示子会话事件流，╰─ 合并回主干
//   · 插件/技能/MCP/命令/文件 等普通工具调用：同一步骤内的多个调用 → 平行卡片并排（调用并返回成组）
//   · 大流镜 Zoom（st.zoom）：血缘树或“单次并发批次”两档；每会话一卡（状态点 + 标题 + 统计 + 触发链），
//     并发日志可切回历史批次；点卡切换 Harness 会话但保持大流镜与当前批次不消失。
// 实时：面板根带 data-autorefresh="2000"，框架抽屉每 2s 静默重拉（live 开关可暂停）。
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
      try { return await readers[sid](sid) } catch (e) { return { events: [], count: 0 } }
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
          // 遍历 content 找第一个带 toolCallId 的块（首块非 tool-result 时也能配上对）
          let callId = null
          let text = ''
          if (Array.isArray(m.content)) {
            for (const block of m.content) {
              if (callId == null && block && block.toolCallId != null) callId = String(block.toolCallId)
              if (!text && block) { const t = textOf(block.content); if (t) text = t }
            }
          }
          const failed = !!(d.error || (Array.isArray(m.content) && m.content[0] && m.content[0].isError))
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
      if (s === 'ok') return '<span class="fl-status" style="color:var(--tb-done-text,#81c784)">✓ ' + fmtDur(dur) + '</span>'
      if (s === 'error') return '<span class="fl-status" style="color:var(--tb-danger-text,#f28b82)">✗ ' + fmtDur(dur) + '</span>'
      return '<span class="fl-spin"></span>'
    }

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
    const renderCallWire = (c, expandedSeq, presentationRules) => {
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
          '<div class="fl-iocard' + (pending ? ' fl-live' : '') + (isExp ? ' fl-on' : '') + (o && o.err ? ' fl-err' : '') + '" data-action="fdetail" data-seq="' + c.seq + '" data-flow-select-seq="' + c.seq + '" title="点击在右侧查看完整传入/返回">' +
            '<div class="fl-iohead">' + (km.label ? '<span class="fl-tag" style="color:' + km.color + ';background:' + km.bg + '">' + esc(km.label) + '</span>' : '') +
            '<span class="fl-name">' + esc(identity.name) + '</span>' +
            (pending ? '<span class="fl-spin"></span><span class="fl-time" data-flow-timer="' + c.time + '" data-flow-timer-prefix="⏱ ">⏱ 0ms</span>' : statusGlyph(c.status, c.dur)) + '</div>' +
          '</div>' +
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
    const renderPar = (node, expandedSeq, presentationRules) => {
      const units = node.calls.map((c) => renderCallWire(c, expandedSeq, presentationRules)).join('')
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

    const msgCardInner = (it, expandedSeq, live) => {
      const isUser = it.role === 'user'
      const isAi = it.role === 'ai'
      const aiRunning = isAi && it.streaming
      const color = isUser ? 'var(--tb-done-text,#81c784)' : isAi ? 'var(--tb-active-text,#7fa7f0)' : 'var(--tb-text-3,#777884)'
      const label = isUser ? '用户' : isAi ? '助手' : '注入'
      // 卡片统一面片底色（fl-node），角色色只落在左侧色条 + 几何符号/tag 上，避免整卡彩色半透明的杂乱感
      // 用户/助手/注入卡均可点开右侧详情浮层看完整内容（与工具卡同一交互）；live=进行中 → 与工具卡同款流光脉冲
      // data-flow-state 暴露折叠器终态（streaming/settled/failed/abandoned）；data-flow-attempt 带实时 attempt 身份
      const branchSeq = it.finalSeq != null ? it.finalSeq : it.seq
      const flowState = it.streaming ? 'streaming' : (it.abandoned ? 'abandoned' : (it.failed || (it.interrupted && it.failCode) ? 'failed' : 'settled'))
      const branch = isAi && !it.streaming
        ? '<button type="button" class="fl-branch-btn" data-flow-branch data-seq="' + branchSeq + '" title="从这条助手消息在 Harness 中创建新分支" aria-label="在新对话中分支">' +
          '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v5a3 3 0 0 0 3 3h4"/><path d="M8 5l3-3 3 3"/><path d="M11 2v4"/><path d="M9 9l2 2-2 2"/></svg></button>'
        : ''
      return '<div class="fl-node' + (expandedSeq === it.seq ? ' fl-on' : '') + (live ? ' fl-live' : '') + '" style="border-left-color:' + color + '" data-flow-main-card="' + it.seq + '" data-flow-role="' + it.role + '" data-flow-state="' + flowState + '"' + (isAi && it.attemptId ? ' data-flow-attempt="' + esc(it.attemptId) + '"' : '') + ' data-flow-select-seq="' + it.seq + '" data-action="fdetail" data-seq="' + it.seq + '" title="点击查看完整消息">' +
        '<div class="fl-node-head"><span class="fl-glyph" style="color:' + color + '">' + (isUser ? '▲' : isAi ? '◆' : '■') + '</span><span class="fl-tag" style="color:' + color + '">' + label + '</span>' +
        (isAi && it.route ? '<span class="fl-model">' + esc(it.route) + '</span>' : '') +
        (fmtTime(it.time) ? '<span class="fl-time">' + fmtTime(it.time) + '</span>' : '') +
        (aiRunning && it.runStart ? '<span class="fl-time" data-flow-timer="' + it.runStart + '" data-flow-timer-prefix="⏱ ">⏱ 0ms</span>' : (isAi && it.runDur != null ? '<span class="fl-time">⏱ ' + fmtDur(it.runDur) + '</span>' : '')) +
        (it.tok ? '<span class="fl-time">+' + it.tok + ' tok</span>' : '') + (isAi ? retryBadgeHtml(it) : '') + branch + '</div>' +
        '<div class="fl-preview"' + (it.interrupted ? ' style="color:var(--tb-danger-text,#f28b82)"' : '') + '>' + esc(it.preview || '（空）') + '</div>' +
      '</div>'
    }

    const renderMsg = (it, expandedSeq, withConn, live) => '<div class="fl-lane"><div></div><div class="fl-lane-main">' + connMain(msgCardInner(it, expandedSeq, live), withConn) + '</div><div></div></div>'

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

    const skillDetailRail = (c, anim) => {
      const skill = skillDetailOf(c)
      if (!skill) return null
      const cap = 16000
      const instructions = skill.instructions.length > cap ? skill.instructions.slice(0, cap) + '\n…（截断，共 ' + skill.instructions.length + ' 字符）' : skill.instructions
      const raw = skill.raw.length > cap ? skill.raw.slice(0, cap) + '\n…（截断，共 ' + skill.raw.length + ' 字符）' : skill.raw
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '" data-flow-markdown-detail="1"><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head"><span class="fl-rail-title">技能 · ' + esc(skill.name) + '</span>' +
        '<button type="button" class="fl-rail-x" data-action="fdetail" data-seq="' + c.seq + '" title="关闭详情">✕</button></div>' +
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
    const detailRail = (c, anim, presentationRules) => {
      const skill = skillDetailRail(c, anim)
      if (skill) return skill
      const identity = displayIdentity(c, presentationRules)
      let input = c.argsRaw || ''
      try { input = JSON.stringify(JSON.parse(c.argsRaw || '{}'), null, 2) } catch (e) {}
      const cap = 8000
      const inShown = input.length > cap ? input.slice(0, cap) + '\n…（截断，共 ' + input.length + ' 字符）' : input
      const out = c.status === 'pending' ? '（进行中，尚无返回）' : (c.resultText || '（空返回）')
      const outShown = out.length > cap ? out.slice(0, cap) + '\n…（截断，共 ' + out.length + ' 字符）' : out
      // anim=是否新展开（轮询重渲染不重播滑入动画，防闪烁）
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '"><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head"><span class="fl-rail-title">' + esc(identity.name) + ' · 详情</span>' +
        '<button type="button" class="fl-rail-x" data-action="fdetail" data-seq="' + c.seq + '" title="关闭详情">✕</button></div>' +
        '<div class="fl-rail-body">' +
          '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">入 · 完整传入' + (input.length > cap ? '（截断）' : '') + '</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(inShown) + '</pre></div>' +
          '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">出 · 完整返回' + (c.outLen ? '（' + fmtSize(c.outLen) + '）' : '') + '</span>' + copyButtonHtml + '</div><pre class="fl-pre">' + esc(outShown) + '</pre></div>' +
        '</div>' +
      '</div>'
    }

    // 消息详情浮层（用户/助手/注入卡点击）：角色 + 时间/模型/tokens 元信息 + 完整内容（截断标注）
    const msgRail = (it, anim) => {
      const label = it.role === 'user' ? '用户消息' : it.role === 'ai' ? '助手消息' : '注入消息'
      const cap = 8000
      const full = String(it.full || it.preview || '')
      const shown = full.length > cap ? full.slice(0, cap) + '\n…（截断，共 ' + full.length + ' 字符）' : full
      const meta = []
      if (fmtTime(it.time)) meta.push('时间 ' + fmtTime(it.time))
      if (it.route) meta.push('模型 ' + it.route)
      if (it.attemptId) meta.push('attempt ' + String(it.attemptId).slice(0, 12))
      if (it.tok) meta.push('输出 +' + it.tok + ' tok')
      if (it.finishKind && it.finishKind !== 'stop') meta.push('结束 ' + it.finishKind)
      if (it.failCode) meta.push('错误 ' + it.failCode + (it.failMsg ? '：' + oneLine(it.failMsg, 80) : ''))
      if (it.retries && it.retries.length) meta.push('重试 ' + it.retries.length + ' 次（' + it.retries.map((r) => r.code || '?').join(' → ') + '）')
      // 与外层助手卡同款分支按钮：详情头部可直接从这条消息创建新分支（复用 data-flow-branch 委托）
      const branch = it.role === 'ai' && !it.streaming
        ? '<button type="button" class="fl-branch-btn" data-flow-branch data-seq="' + (it.finalSeq != null ? it.finalSeq : it.seq) + '" title="从这条助手消息在 Harness 中创建新分支" aria-label="在新对话中分支">' +
          '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v5a3 3 0 0 0 3 3h4"/><path d="M8 5l3-3 3 3"/><path d="M11 2v4"/><path d="M9 9l2 2-2 2"/></svg></button>'
        : ''
      const markdown = it.role === 'ai'
      return '<div class="fl-rail' + (anim ? ' fl-rail-anim' : '') + '"' + (markdown ? ' data-flow-markdown-detail="1"' : '') + '><div class="fl-rail-resize" title="拖拽调宽（自动记忆）"></div>' +
        '<div class="fl-rail-head"><span class="fl-rail-title">' + label + ' · 详情</span>' + branch +
        '<button type="button" class="fl-rail-x" data-action="fdetail" data-seq="' + it.seq + '" title="关闭详情">✕</button></div>' +
        '<div class="fl-rail-body"' + (markdown ? ' data-flow-markdown-body="1" data-flow-markdown-key="' + it.seq + '" data-flow-markdown-streaming="' + (it.streaming ? '1' : '0') + '"' : '') + '>' +
          (meta.length ? '<div class="fl-sec"><span class="fl-sec-label">' + esc(meta.join(' · ')) + '</span></div>' : '') +
          '<div class="fl-sec"><div class="fl-sec-head"><span class="fl-sec-label">完整内容' + (full.length > cap ? '（截断）' : '') + '</span>' + (markdown ? markdownPreviewButtonHtml(it.seq) : '') + copyButtonHtml + '</div><pre class="fl-pre"' + (markdown ? ' data-flow-markdown-source="1"' : '') + '>' + esc(shown || '（空）') + '</pre></div>' +
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
    const subBranchHtml = async (c) => {
      const cid = childIdOf(c)
      let subLive = c.status === 'pending'
      let sub2 = null
      if (cid) {
        try { sub2 = await childRows(cid, 10); if (sub2.live) subLive = true } catch (e) {}
      }

      // 有子会话 id 后，整张入口卡就是“进入子流镜”的主点击面；
      // 子代理尚在启动时仍保留详情行为，避免点击无效。
      let sub = '<div class="fl-sub-card fl-sub-open' + (subLive ? ' fl-live' : '') + '" data-action="' + (cid ? 'fenter' : 'fdetail') + '" data-seq="' + c.seq + '" data-flow-select-seq="' + c.seq + '" title="' + (cid ? '进入该子代理的实时流镜' : '点击查看完整任务传入/返回') + '">' +
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
        sub += '<div class="fl-sub-card fl-sub-close" data-action="fdetail" data-seq="' + c.seq + '" title="点击查看完整任务传入/返回">' +
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
    const subGroupHtml = async (node) => {
      const branches = await Promise.all(node.calls.map(subBranchHtml))
      return (node.calls.length > 1 ? '<span class="fl-subgrp-tag">并行子代理 ×' + node.calls.length + '</span>' : '') +
        branches.map((html) => '<div class="fl-subbranch">' + html + '</div>').join('')
    }

    const subColHtml = (node, html) => '<div class="fl-subcol' + (node.calls.length > 1 ? ' fl-subgrp' : '') + '">' + html + '</div>'

    // 普通流镜与大流镜详细对比共用同一泳道渲染器：返回视觉顺序（旧→新）的行。
    const renderFlowNodeRows = async (nodes, st, liveAiSeq) => {
      const subHtmls = {}
      await Promise.all(nodes.map(async (n, i) => { if (n.t === 'subs') subHtmls[i] = await subGroupHtml(n) }))
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
          let main = msgCardInner(n.it, st.expanded, aiLive)
          let lastI = next - 1
          const allSettled = subCalls.length > 0 && subCalls.every((c) => c.resSeq != null)
          const resultSeq = allSettled ? Math.max(...subCalls.map((c) => c.resSeq)) : null
          if (resultSeq != null) {
            for (let j = next; j < nodes.length; j++) {
              const m = nodes[j]
              if (m.t !== 'msg') break
              if (subN.turn != null && m.it.turn != null && m.it.turn !== subN.turn) break
              main += '<span class="fl-arrow">▼</span>' + msgCardInner(m.it, st.expanded, m.it.seq === liveAiSeq)
              lastI = j
              if (m.it.seq > resultSeq) break
            }
          }
          h = '<div class="fl-lane">' +
            (subN ? subColHtml(subN, subHtmls[subIdx] || '') : '<div></div>') +
            '<div class="fl-lane-main">' + connMain(main, withConn) + '</div>' +
            (parN ? grpSide(parN, parN.calls.map((c) => renderCallWire(c, st.expanded, st.presentationRules)).join('')) : '<div></div>') +
          '</div>'
          i = lastI
        } else if (n.t === 'msg') h = renderMsg(n.it, st.expanded, withConn, n.it.seq === liveAiSeq)
        else if (n.t === 'par') h = renderPar(n, st.expanded, st.presentationRules)
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
      const strip = []
      for (const it of items) {
        if (typeof it.time === 'number' && it.time > lastTime) lastTime = it.time
        if (it.kind === 'msg') {
          if (it.role === 'user') { if (!title && it.preview) title = it.preview; strip.push({ g: 'user', txt: it.preview }) }
          else if (it.role === 'ai') { if (it.tok) tok += it.tok; if (it.route) route = it.route; strip.push({ g: 'ai', txt: it.preview }) }
          else strip.push({ g: 'sys', txt: it.preview })
        } else {
          tools++
          if (it.cat === 'subagent') hasSubagent = true
          if (it.status === 'error') toolErr++
          const identity = displayIdentity(it, rules)
          strip.push({ g: 'tool', name: identity.name, status: it.status, color: identity.meta.color, bg: identity.meta.bg, txt: inSummary(it) })
        }
      }
      const data = { sid, nodes: items.length, tools, toolErr, tok, lastTime, title, route, hasSubagent, strip: strip.slice(-ZOOM_STRIP), stripTotal: strip.length }
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
          for (const it of parseItems(r.events || [])) {
            if (!Number.isFinite(Number(it.turn))) continue
            const turn = Number(it.turn)
            let row = grouped.get(turn)
            if (!row) { row = { input: [], tools: [], files: [], result: [], items: [] }; grouped.set(turn, row) }
            row.items.push(it)
            if (it.kind === 'call') {
              row.tools.push(it.name + ':' + it.status)
              row.files.push(...fileRefs(it.argsRaw || ''))
            }
            else if (it.role === 'user') row.input.push(oneLine(it.full || it.preview || '', 160))
            else if (it.role === 'ai') row.result.push(oneLine(it.full || it.preview || '', 200))
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
        // 回答文本天然会不同；整体是否“流程一致”只看输入、调用结构和涉及文件。
        return { turn, values, dims, same: !values.some((v) => !v) && dims.input === '同' && dims.flow === '同' && dims.files === '同' }
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
        const items = parseItems((nearLog && nearLog.events) || [], nearLive)
        const nodes = buildNodes(items)
        const limit = Number.isFinite(Number(st.limit)) ? Math.max(60, Math.floor(Number(st.limit) / 60) * 60) : 60
        st.limit = limit
        const shown = nodes.slice(-limit)
        nearFlow = { items, nodes, shown, hasOlder: nodes.length > shown.length }
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
      const headOf = (c, isRoot) => {
        const rec = c.rec
        const sum = c.sum
        const short = rec.sid.replace(/^session-/, '').slice(0, 8)
        const title = sum && sum.title ? sum.title : '会话 ' + short
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
            '<span class="fl-zoom-id">' + esc(short) + '</span>' +
            '<button type="button" class="fl-zoom-relay" data-action="fzoom-relay" data-sid="' + esc(rec.sid) + '" title="把该会话的最新助手结论带入其他会话（点选目标分支后带入草稿或直接发送）">⇪</button>' +
          '</div>' +
          (badges.length ? '<div class="fl-zoom-badges">' + badges.join('') + '</div>' : '') +
          '<div class="fl-zoom-stats">' + esc(stats) + '</div>'
      }
      const openTip = st.follow ? '进入该会话的流镜视角，并切换 Harness' : '进入该会话的流镜视角'
      const zoomHelp = [
        '• 大流镜是并发任务的容器：全景并排查看/对比全部分支，近观用完整流镜铺满画布。',
        '• 进入时按内容选默认尺度：多分支（并发组/血缘树）默认全景；单会话（新会话）默认近观。',
        '• 全景支持 精简 / 详细 / 导图 三种视图；点分支卡自然放大到近观，点「全景」返回。',
        '• 全景发送是 N→N 续跑当前组；近观发送是从当前会话发起 1→N。',
        '• 「大流镜历史」按轮次保存并发拓扑，从旧轮继续会开新历史分支，原历史不覆盖。',
        '• 分支头卡 ⇪ 把该会话最新结论带入其他会话（带入草稿或直接发送）。',
        '• 「显示规则」与普通流镜共用同一份配置，按工具名/命令/子命令改写卡片标题与徽章。',
      ].join('\n')
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root tb-pane' + (zoomMotion ? ' fl-zoom-motion-' + zoomMotion : '') + '" data-flow' + (!nearMode ? ' data-flow-board="1"' : '') + ' data-flow-view="' + esc(zoomView) + '" data-flow-scope="' + esc(sid) + '" data-zoom-active-sids="' + esc(continueBranches.map((c) => c.rec.sid).join(',')) + '" data-zoom-run-id="' + esc(activeRun ? activeRun.id : '') + '" data-zoom-round-id="' + esc(activeRound ? activeRound.id : '') + '" data-flow-has-older="' + (nearFlow && nearFlow.hasOlder ? '1' : '0') + '" data-flow-visible="' + (nearFlow ? nearFlow.shown.length : shownCards.length) + '" data-flow-total="' + (nearFlow ? nearFlow.nodes.length : total) + '" data-autorefresh="' + (st.live && !st.settings ? '2000' : '') + '" data-tab-badge="' + (st.live && runningCount ? String(runningCount) + '活' : '') + '">')
      parts.push('<div class="tb-pane-head">')
      parts.push('<div class="tb-row">' +
        '<span class="tb-sec-label">大流镜</span>' +
        '<span class="fl-zoom-count" aria-label="大流镜尺度">' +
          '<button type="button" class="tb-chip' + (!nearMode ? ' tb-chip-on' : '') + '" data-action="fzoom-focus-back" title="查看所选并发的全部分支">全景</button>' +
          '<button type="button" class="tb-chip' + (nearMode ? ' tb-chip-on' : '') + '" data-action="fzoom-focus-current" title="用完整流镜查看当前选中分支"' + (!selectedCard ? ' disabled' : '') + '>近观</button>' +
        '</span>' +
        '<span class="tb-note">' + total + ' 会话 · ' + runningCount + ' 运行中</span>' +
        '<button type="button" class="tb-chip' + (st.zoomComposerOpen ? ' tb-chip-on' : '') + '" data-action="fzoom-composer" aria-expanded="' + (st.zoomComposerOpen ? 'true' : 'false') + '">' + (st.zoomComposerOpen ? '▾' : '▸') + ' 发消息' + (continueCurrentGroup ? ' · 当前 ' + continueBranches.length + ' 个会话' : nearMode && selectedCard ? ' · 1→' + targetBranchCount : '') + '</button>' +
        '<button type="button" class="tb-chip' + (st.live ? ' tb-chip-on' : '') + '" data-action="toggle-live">' + (st.live ? '● 实时同步中' : '⏸ 已暂停') + '</button>' +
        '<button type="button" class="tb-chip' + (st.follow ? ' tb-chip-on' : '') + '" data-action="toggle-follow" title="开启后，从总览进入会话会同时切换 DeepSeek Harness 主会话">' + (st.follow ? '● 子代理跟随' : '○ 子代理跟随') + '</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="refresh">刷新</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="fsettings" title="配置工具卡片的声明式显示规则">⚙ 显示规则</button>' +
        '<span class="fl-info" tabindex="0" aria-label="大流镜使用说明">' +
          '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4"/><circle cx="8" cy="4.7" r=".7" fill="currentColor" stroke="none"/></svg>' +
          '<span class="fl-info-pop">' + esc(zoomHelp) + '</span>' +
        '</span>' +
      '</div>')
      // 开工台（客户端行为，不经 Host RPC：输入/启动按钮由 Client 面板委托读写）：
      // 同一任务 ⚡ 同时开始 —— 旧会话从当前完成轮次分叉，新会话在同一工作区新建；每条
      // 分支可在同一紧凑控件内选模型与思考强度。输入非空时 Client 暂停自动刷新；选择经
      // data-action-onchange 回写 state（重渲染不丢）。
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
        parts.push('<div class="fl-zoom-composer">' +
          (continueCurrentGroup && activeRun && activeRound ? '<div class="fl-zoom-composer-context"><strong>发送到当前 ' + activeRound.sids.length + ' 个会话</strong><span>' + esc(oneLine(activeRun.prompt || '并发任务', 28)) + ' · ' + esc(zoomTopology(activeRun)) + '</span><div class="fl-zoom-composer-targets" data-zoom-add-drop="1">' + currentConversationItems + addSessionMenu + '</div></div>' : nearMode && selectedCard ? '<div class="fl-zoom-composer-context"><strong>从当前单会话发起 1→' + targetBranchCount + '</strong><span>来源 Session：' + esc(selectedCard.rec.sid.replace(/^session-/, '').slice(0, 8)) + '</span></div>' : '<div class="fl-zoom-composer-context"><strong>新建并发会话</strong><span>输入一次，创建并发送到 ' + targetBranchCount + ' 个 Session</span></div>') +
          '<textarea class="tb-input fl-zoom-prompt" data-zoom-prompt="1" rows="2" placeholder="' + (continueCurrentGroup ? '这条消息将同时发送到上面列出的 Session' : nearMode && selectedCard ? '这条消息将从当前 Session 派生并发送到新分支' : '输入第一个任务，创建新的并发 Session') + '"></textarea>' +
          '<div class="fl-zoom-composer-controls">' + laneSelects +
            '<span class="fl-zoom-target-label">目标分支数</span>' +
            '<span class="fl-zoom-count" title="新并发将生成的目标分支数">' + [2, 3, 4].map((n) => '<button type="button" class="tb-chip' + (st.zoomLanes.length === n ? ' tb-chip-on' : '') + '" data-action="fzoom-lanes" data-count="' + n + '">' + n + '</button>').join('') + '</span>' +
            '<span class="fl-zoom-composer-spacer"></span>' +
            '<button type="button" class="tb-btn tb-btn-sm tb-btn-primary" data-zoom-launch="1">⚡ ' + (continueCurrentGroup ? '发送到当前 ' + continueBranches.length + ' 个会话' : nearMode && selectedCard ? '从当前会话发起 1→' + targetBranchCount : '新建 ' + st.zoomLanes.length + ' 个会话并发送') + '</button>' +
          '</div></div>')
      }
      // 显示方式与历史保留为轻量工具行；并发路径、目标 Session 与发送输入统一收进上方发送区。
      parts.push('<div class="tb-row fl-zoom-logbar"><span class="tb-note fl-zoom-log-spacer"></span>' +
        '<span class="tb-sec-label">显示</span>' +
        (nearMode ? '<span class="tb-note">完整流镜 · ' + esc(selectedCard ? oneLine((selectedCard.sum && selectedCard.sum.title) || selectedCard.rec.sid, 24) : '未选中分支') + '</span>' :
          '<button type="button" class="tb-chip' + (st.zoomView === 'compact' ? ' tb-chip-on' : '') + '" data-action="fzoom-view" data-view="compact">精简</button>' +
          '<button type="button" class="tb-chip' + (st.zoomView === 'detail' ? ' tb-chip-on' : '') + '" data-action="fzoom-view" data-view="detail">详细</button>' +
          '<button type="button" class="tb-chip' + (st.zoomView === 'map' ? ' tb-chip-on' : '') + '" data-action="fzoom-view" data-view="map">导图</button>') +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="fzoom-history">大流镜历史 · ' + st.zoomRuns.length + '</button>' +
      '</div>')
      parts.push('</div>')
      if (st.zoomHistoryOpen) {
        parts.push('<aside class="fl-zoom-history-drawer"><div class="fl-zoom-history-drawer-head"><strong>大流镜历史</strong><button type="button" data-action="fzoom-history">×</button></div><div class="fl-zoom-history-tree">' +
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
      parts.push('<div class="tb-pane-body">')
      if (!shownCards.length) {
        parts.push('<div class="tb-notice">' + (st.zoomScope === 'run' ? '还没有并发记录——输入任务后点「⚡ 同时开始」' : '没有可显示的会话') + '</div>')
      } else if (nearFlow && selectedCard) {
        // 近观不是单列 diff：直接复用原单会话流镜节点，铺满大流镜画布。
        const nearRows = await renderFlowNodeRows(nearFlow.shown, st, null)
        if (nearFlow.hasOlder) nearRows.push('<div class="tb-notice fl-older" data-flow-older-hint>已显示最近 ' + nearFlow.shown.length + ' 个节点 · 继续向上滚动会自动加载更早 ' + Math.min(60, nearFlow.nodes.length - nearFlow.shown.length) + ' 条</div>')
        // 普通流镜把 rows.reverse() 作为 tb-pane-body 的直接子项，再由 column-reverse 还原视觉时间序。
        // 近观多了一层 wrapper，不能再 reverse，否则视觉顺序会变成“助手在上、用户在下”。
        parts.push('<div class="fl-zoom-near-flow" data-flow-near-session="' + esc(selectedCard.rec.sid) + '">' + (nearRows.length ? nearRows.join('') : '<div class="tb-notice">当前会话还没有事件</div>') + '</div>')
      } else {
        if ((st.zoomScope === 'run' || inferredFleet) && branches.length) {
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
            const rows = comparison.rows
            const laneWidth = branches.length * nodeW + Math.max(0, branches.length - 1) * colGap
            const canvasW = Math.max(760, laneWidth + 220)
            const laneStartX = Math.round((canvasW - laneWidth) / 2)
            const rootX = Math.round((canvasW - rootW) / 2)
            const rootY = 24
            const firstRowY = 156
            const canvasH = Math.max(520, firstRowY + rows.length * nodeH + Math.max(0, rows.length - 1) * rowGap + 44)
            const nodePos = new Map()
            const nodeHtml = []
            const turnHtml = []
            const edges = []
            nodePos.set('root', { x: rootX, y: rootY, w: rootW, h: 84 })
            nodeHtml.push('<article class="fl-map-node fl-map-root" data-map-node="root" data-map-default-x="' + rootX + '" data-map-default-y="' + rootY + '" style="left:' + rootX + 'px;top:' + rootY + 'px;width:' + rootW + 'px"><strong>⚡ ' + esc(oneLine((activeRun && activeRun.prompt) || '当前并发', 28)) + '</strong><span>' + esc(zoomTopology(activeRun)) + ' · ' + branches.length + ' 个会话</span></article>')
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
                  '<header><strong>会话 ' + (i + 1) + '</strong><span>第 ' + displayTurn + ' 轮</span></header>' +
                  '<p>' + esc(result) + '</p>' +
                  (branchSeq == null || !activeRun || !activeRound ? '' : '<button type="button" class="fl-map-branch" data-flow-branch data-history="' + esc(activeRun.id) + '" data-round="' + esc(activeRound.id) + '" data-turn="' + displayTurn + '" data-seq="' + branchSeq + '" title="以会话 ' + (i + 1) + ' 的第 ' + displayTurn + ' 轮回答为唯一来源，创建 ' + targetBranchCount + ' 个新 Session">从这里发起 1→' + targetBranchCount + '</button>') +
                '</article>')
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
            parts.push('<div class="fl-mindmap-wrap"><div class="fl-mindmap-help"><strong>导图操作</strong><span>拖动节点整理 · 拖动画布平移 · 在任意回答上发起新的 1→' + targetBranchCount + '</span><button type="button" data-map-reset="1">重置布局</button></div>' +
              '<div class="fl-mindmap-viewport" data-flow-mindmap="1" data-map-scope="' + esc((activeRun && activeRun.id) || 'current') + '"><div class="fl-mindmap-canvas" style="width:' + canvasW + 'px;height:' + canvasH + 'px"><svg class="fl-mindmap-edges" width="' + canvasW + '" height="' + canvasH + '">' + lineHtml + '</svg>' + turnHtml.join('') + nodeHtml.join('') + '</div></div></div>')
          } else {
          parts.push('<div class="fl-zoom-diff-scroll"><div class="fl-zoom-diff-board" style="grid-template-columns:92px ' + widths.join(' ') + '">')
          parts.push('<div class="fl-diff-corner">轮次</div>')
          for (const c of branches) {
            const branchIndex = branches.indexOf(c) + 1
            parts.push('<div class="fl-diff-session-head" data-action="fzoom-open" data-sid="' + esc(c.rec.sid) + '" role="button" tabindex="0" title="' + openTip + '"><div class="fl-diff-session-label">会话 ' + branchIndex + '</div>' + headOf(c, false) + '</div>')
          }
          for (const row of comparison.rows) {
            const displayTurn = row.turn === 0 ? 1 : row.turn
            const label = row.same ? '流程一致' : row.values.some((v) => !v) ? '流程缺失' : '流程有差异'
            const gutterCls = row.same ? ' fl-diff-same' : row.values.some((v) => !v) ? ' fl-diff-missing' : ' fl-diff-change'
            const dim = (name, value) => '<span class="fl-diff-dim fl-diff-dim-' + (value === '同' ? 'same' : value === '异' ? 'change' : 'missing') + '">' + name + ' ' + value + '</span>'
            const roundFork = []
            for (let i = 0; i < branches.length; i++) {
              const value = row.values[i]
              const lastAi = value && value.items.filter((it) => it.kind === 'msg' && it.role === 'ai' && !it.streaming).slice(-1)[0]
              if (lastAi) roundFork.push({ sid: branches[i].rec.sid, seq: lastAi.finalSeq != null ? lastAi.finalSeq : lastAi.seq })
            }
            parts.push('<div class="fl-diff-gutter' + gutterCls + '"><strong>第 ' + displayTurn + ' 轮</strong><span>' + label + '</span>' +
              '<small>' + dim('输入', row.dims.input) + dim('流程', row.dims.flow) + dim('文件', row.dims.files) + dim('结果', row.dims.result) + '</small>' +
              (roundFork.length < 2 || !activeRun || !activeRound ? '' : '<button type="button" class="fl-diff-round-fork" data-zoom-round-fork="1" data-history="' + esc(activeRun.id) + '" data-round="' + esc(activeRound.id) + '" data-turn="' + displayTurn + '" data-spec="' + esc(JSON.stringify(roundFork)) + '" title="以本轮全部 ' + roundFork.length + ' 个会话为来源，创建 ' + targetBranchCount + ' 个新 Session">本轮全部：' + roundFork.length + '→' + targetBranchCount + '</button>') +
              '</div>')
            const baseline = row.values.find((v) => v) || null
            const baselineSig = baseline ? baseline.input + '\n' + baseline.tools + '\n' + baseline.files : ''
            for (let i = 0; i < branches.length; i++) {
              const c = branches[i]
              const value = row.values[i]
              if (!value) {
                parts.push('<div class="fl-diff-cell fl-diff-cell-missing"><span>− 此对话缺少本轮</span></div>')
                continue
              }
              const sig = value.input + '\n' + value.tools + '\n' + value.files
              const changed = !row.same && sig !== baselineSig
              const hasSubagent = value.items.some((it) => it.kind === 'call' && it.cat === 'subagent')
              const lastAi = value.items.filter((it) => it.kind === 'msg' && it.role === 'ai' && !it.streaming).slice(-1)[0]
              const branchSeq = lastAi ? (lastAi.finalSeq != null ? lastAi.finalSeq : lastAi.seq) : null
              let flowHtml
              if (zoomView === 'detail') {
                const detailState = { ...st, zoom: false, sid: c.rec.sid, home: c.rec.sid, crumbs: [], settings: false, expanded: null }
                const nodeRows = await renderFlowNodeRows(buildNodes(value.items), detailState, null)
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
              parts.push('<div class="fl-diff-cell' + (row.same ? ' fl-diff-cell-same' : changed ? ' fl-diff-cell-change' : ' fl-diff-cell-base') + '" data-flow-detail-session="' + esc(c.rec.sid) + '">' +
                '<div class="fl-diff-cell-head"><span class="fl-diff-mark">' + (row.same ? ' ' : changed ? '+' : '±') + '</span>' +
                  '<span>' + (row.same ? '本轮一致' : changed ? '与基准不同' : '对比基准') + '</span>' +
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
        if (target) parts.push(target.kind === 'call' ? detailRail(target, st.freshSeq === target.seq, st.presentationRules) : msgRail(target, st.freshSeq === target.seq))
      }
      // 大流镜内同样支持显示规则侧栏（与普通流镜共用配置；打开时自动刷新已由根 div 暂停）
      if (st.settings) parts.push(presentationRulesRail(st, st.freshSettings === true))
      delete st.freshSeq
      delete st.freshSettings
      parts.push('</div>')
      return parts.join('')
    }

    const render = async (st, sid, live) => {
      if (st.zoom) return renderZoom(st, sid, live)
      const r = await readLog(sid)
      // 活跃度：日志条数较上轮渲染增长 = 会话正在工作（用于助手卡流光；静止会话/他人会话不误亮）
      const prevCount = growth[sid]
      const active = prevCount != null && (r.count || 0) > prevCount
      growth[sid] = r.count || 0
      await loadManifestTools()
      // 事件窗在途 attempt（live 叠加层）= 会话正在生成的最直接信号
      const overlayLive = Boolean(live && Array.isArray(live.attempts) && live.attempts.some((a) => a && a.attemptId != null))
      const items = parseItems(r.events || [], live)
      const nodes = buildNodes(items)
      // 会话仍在运行且最新事件是一条助手消息 → 该助手卡持续流光；日志增长作为 sessions 服务缺失时的兜底。
      const lastIt = items.length ? items[items.length - 1] : null
      let sessionLive = false
      let hasAgentStatus = false
      try {
        const agentsSvc = ctx.get('agents')
        if (agentsSvc) {
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
      const liveAiSeq = (overlayLive || (hasAgentStatus ? sessionLive : active)) && lastIt && lastIt.kind === 'msg' && lastIt.role === 'ai' && !lastIt.interrupted ? lastIt.seq : null
      const PAGE = 60
      const limit = Number.isFinite(Number(st.limit)) ? Math.max(PAGE, Math.floor(Number(st.limit) / PAGE) * PAGE) : PAGE
      st.limit = limit
      const shown = nodes.slice(-limit)
      const hasOlder = nodes.length > shown.length
      const parts = []
      parts.push('<div class="jr-tabpanel tb-root tb-pane" data-flow data-flow-scope="' + esc(sid) + '" data-flow-has-older="' + (hasOlder ? '1' : '0') + '" data-flow-visible="' + shown.length + '" data-flow-total="' + nodes.length + '" data-autorefresh="' + (st.live && !st.settings ? '2000' : '') + '" data-tab-badge="' + (st.live ? String(nodes.length) : '') + '">')
      // 固定头
      parts.push('<div class="tb-pane-head">')
      // 钻取态：查看的不是面板所属会话 → 头部给「← 返回」+ 层级标注（crumbs 栈深度）
      const drilled = !!((st.home && sid !== st.home) || (Array.isArray(st.crumbs) && st.crumbs.length))
      const depth = drilled && Array.isArray(st.crumbs) ? st.crumbs.length : 0
      const help = [
        '• 中列是用户/助手主线，右列是工具调用（输入 ▶ / 输出 ◀），左列是子代理分支。',
        '• 点击卡片查看完整内容。',
        '• 悬停助手卡可从该节点创建 Harness 分支。',
        '• 画布默认可拖动框选，点击空白处取消框选并收起详情；左下可新建仅所选内容的会话草稿或带入已有会话。',
        '• Zoom 支持缩放与 Zen 原生全屏。',
        '• 点击子代理卡进入实时子流镜，“子代理跟随”开启时 Harness 同步切换。',
        '• 滚到顶部会每次自动加载更早 60 个节点。',
      ].join('\n')
      parts.push('<div class="tb-row">' +
        (drilled ? '<button type="button" class="tb-btn tb-btn-sm" data-action="fback" title="返回上一级流程图">← 返回</button>' : '') +
        '<span class="tb-sec-label">' + (drilled ? '子代理流镜' : '实时流镜') + '</span>' +
        '<span class="tb-note">' + esc(sid.replace(/^session-/, '').slice(0, 8)) + ' · ' + items.length + ' 条事件 · ' + nodes.length + ' 节点' + (drilled ? ' · 第 ' + (depth + 1) + ' 层' : '') + '</span>' +
        '<button type="button" class="tb-chip' + (st.live ? ' tb-chip-on' : '') + '" data-action="toggle-live">' + (st.live ? '● 实时同步中' : '⏸ 已暂停') + '</button>' +
        '<button type="button" class="tb-chip' + (st.follow ? ' tb-chip-on' : '') + '" data-action="toggle-follow" title="开启后，点击子代理会同时切换 DeepSeek Harness 主会话">' + (st.follow ? '● 子代理跟随' : '○ 子代理跟随') + '</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="refresh">刷新</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="fzoom" title="大流镜 Zoom：多会话并发总览，并排对比各会话的流程触发差异，点卡直接进入对应会话">⛶ 大流镜</button>' +
        '<button type="button" class="tb-btn tb-btn-sm" data-action="fsettings" title="配置工具卡片的声明式显示规则">⚙ 显示规则</button>' +
        '<span class="fl-info" tabindex="0" aria-label="流镜使用说明">' +
          '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4"/><circle cx="8" cy="4.7" r=".7" fill="currentColor" stroke="none"/></svg>' +
          '<span class="fl-info-pop">' + esc(help) + '</span>' +
        '</span>' +
      '</div>')
      parts.push('</div>')
      // 流程体：tb-pane-body 为 column-reverse——这里以「视觉最新在底」渲染：DOM 先放最新节点，滚动条默认贴底
      parts.push('<div class="tb-pane-body">')
      if (!shown.length) {
        parts.push('<div class="tb-notice">当前会话还没有事件</div>')
      } else {
        const rows = await renderFlowNodeRows(shown, st, liveAiSeq)
        if (hasOlder) rows.push('<div class="tb-notice fl-older" data-flow-older-hint>' +
          '已显示最近 ' + shown.length + ' 个节点 · 继续向上滚动会自动加载更早 ' + Math.min(PAGE, nodes.length - shown.length) + ' 条' +
        '</div>')
        parts.push(rows.reverse().join(''))
      }
      parts.push('</div>')
      // 详情右侧浮层：展开状态且目标仍在可视事件集内时渲染（工具调用→传入/返回；消息→完整内容）
      if (st.expanded != null) {
        const target = items.find((it) => it.seq === st.expanded && (it.kind === 'call' || it.kind === 'msg'))
        if (target) parts.push(target.kind === 'call' ? detailRail(target, st.freshSeq === target.seq, st.presentationRules) : msgRail(target, st.freshSeq === target.seq))
      }
      if (st.settings) parts.push(presentationRulesRail(st, st.freshSettings === true))
      delete st.freshSeq // 一次性动画标记，不残留进 state
      delete st.freshSettings
      parts.push('</div>')
      return parts.join('')
    }

    const handler = async ({ action, fields, state, session, live }) => {
      if (!sq) return { ok: false, error: 'sessionQuery 服务不可用', html: '' }
      const st = (state && typeof state === 'object' && state) ? state : { live: true, follow: true, limit: 60, sid: null, home: null, expanded: null, crumbs: [] }
      if (typeof st.follow !== 'boolean') st.follow = true
      if (!Number.isFinite(Number(st.limit)) || Number(st.limit) < 60) st.limit = 60
      if (typeof st.expanded !== 'number' && st.expanded != null) st.expanded = null
      if (!Array.isArray(st.crumbs)) st.crumbs = []
      if (typeof st.zoom !== 'boolean') st.zoom = false
      if (st.zoomScope !== 'tree' && st.zoomScope !== 'run') st.zoomScope = 'tree'
      if (st.zoomView !== 'compact' && st.zoomView !== 'detail' && st.zoomView !== 'map') st.zoomView = 'compact'
      if (typeof st.zoomFocusSid !== 'string') st.zoomFocusSid = ''
      if (typeof st.zoomLastFocusSid !== 'string') st.zoomLastFocusSid = ''
      if (st.zoomMode !== 'panorama' && st.zoomMode !== 'near') st.zoomMode = st.zoomFocusSid ? 'near' : 'panorama'
      if (typeof st.zoomComposerOpen !== 'boolean') st.zoomComposerOpen = false
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
          if (saved && (saved.view === 'compact' || saved.view === 'detail' || saved.view === 'map')) st.zoomView = saved.view
          if (saved && typeof saved.focusSid === 'string') st.zoomFocusSid = saved.focusSid
          if (saved && typeof saved.lastFocusSid === 'string') st.zoomLastFocusSid = saved.lastFocusSid
          if (saved && (saved.mode === 'panorama' || saved.mode === 'near')) st.zoomMode = saved.mode
        } catch (e) {}
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
      if (!Array.isArray(st.zoomLanes) || st.zoomLanes.length < 2) st.zoomLanes = ['', '']
      st.zoomLanes = st.zoomLanes.slice(0, 4).map((v) => (typeof v === 'string' ? v : ''))
      if (!Array.isArray(st.zoomEfforts)) st.zoomEfforts = []
      st.zoomEfforts = st.zoomLanes.map((_, i) => (typeof st.zoomEfforts[i] === 'string' ? st.zoomEfforts[i] : ''))
      if (fields && Object.prototype.hasOwnProperty.call(fields, '__flowPresentationRules')) {
        st.presentationRules = normalizePresentationRules(fields.__flowPresentationRules)
      } else if (!Array.isArray(st.presentationRules)) st.presentationRules = []
      const el = fields && fields.__el ? fields.__el : {}
      // home=面板所属会话（钻取不改变归属）；sid=当前查看的会话（默认=home）。
      // 跟随模式下 Harness 已经把当前 session 切到 st.sid，但 crumbs 表明这仍是
      // 从父流镜钻取进来的链；此时必须保留原 home，才能继续渲染“← 返回”。
      const carriedFollow = st.follow === true && st.home && session && st.sid === session
        && (st.crumbs.length > 0 || (st.zoom && st.zoomFocusSid === session))
      const home = carriedFollow ? st.home : (session || st.home || st.sid)
      if (!home) return { ok: true, html: '<div class="jr-tabpanel tb-root"><div class="tb-notice">未找到当前会话</div></div>', state: st }
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
      if (action === 'toggle-live') st.live = !st.live
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
      else if (action === 'fzoom-composer') st.zoomComposerOpen = !st.zoomComposerOpen
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
          const base = typeof meta.baseHistoryId === 'string' ? st.zoomRuns.find((x) => x.id === meta.baseHistoryId) : null
          const baseAt = base && typeof meta.baseRoundId === 'string' ? base.rounds.findIndex((x) => x.id === meta.baseRoundId) : -1
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
        const run = st.zoomRuns.find((x) => x.id === st.zoomRunId)
        const round = run && (run.rounds.find((x) => x.id === st.zoomRoundId) || run.rounds[run.rounds.length - 1])
        if (run && round && !round.sids.includes(el.sid) && round.sids.length < 4) {
          round.sids.push(el.sid); round.routes.push(''); round.efforts.push('')
          run.sids = round.sids; run.routes = round.routes; run.efforts = round.efforts
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
        // 会话互通：取源会话最近一条助手结论全文，交 Client 带入/发送到目标会话（沿用「带入会话」机制）
        const r = await readLog(el.sid)
        const items = parseItems(r.events || [])
        let lastAi = null
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i]
          if (it.kind === 'msg' && it.role === 'ai' && it.full && !it.streaming) { lastAi = it; break }
        }
        if (!lastAi) return { ok: false, error: '该会话还没有可带入的助手结论', html: '', state: st }
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
        flowContext = flowContextOf(parseItems(r.events || [], liveOverlay), seqs, st.sid)
      }
      else if (action === 'fdetail' && el.seq != null) {
        const seq = Number(el.seq)
        st.expanded = st.expanded === seq ? null : seq
        st.freshSeq = st.expanded // 仅新展开的那次渲染播放滑入动画（null=收起不播；轮询不重播）
      } else if (action === 'fenter' && el.seq != null) {
        // 钻取：解析当前查看会话的日志，找到该子代理调用的子会话 id 后切入（当前会话压栈）
        const seq = Number(el.seq)
        const r = await readLog(st.sid)
        const call = parseItems(r.events || []).find((it) => it.kind === 'call' && it.seq === seq && it.cat === 'subagent')
        const cid = call ? childIdOf(call) : null
        if (cid && cid !== st.sid) {
          const parentSid = st.sid
          st.crumbs.push({ sid: st.sid, label: call.name + ' ' + cid.slice(0, 8) })
          st.sid = cid
          st.expanded = null
          if (st.follow) navigateSession = { sessionId: cid, parentSessionId: parentSid, kind: 'subagent' }
        }
      } else if (action === 'fback') {
        const prev = st.crumbs.pop()
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
        try { delete st.__zoomSessionIndex } catch (e) {}
        try { delete st.__archivedSessionIds } catch (e) {}
        return { ok: true, html, state: st, navigateSession, flowContext, zoomRelay }
      } catch (e) {
        try { delete st.__zoomSessionIndex } catch (err) {}
        try { delete st.__archivedSessionIds } catch (err) {}
        return { ok: false, error: String((e && e.message) || e), html: '', state: st }
      }
    }

    tryRegisterTool(ctx, { id: 'flow', label: '流镜', order: 2, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M8 4.5v2.2M8 6.7L4 11M8 6.7l4 4.3"/></svg>' }, handler)
  },
}
