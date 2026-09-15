// ===== flow-tool.js：实时流镜（Host-only，经工具箱 RPC 注册）=====
// 当前 session 在干什么 → 自上而下不断加载的流程图（与「轨迹」工具互补：轨迹是过滤时间线，流程图是形态视图）。
// 形态约定（用户定制）：
//   · 主 session：自上而下箭头串联 用户消息 → 助手 → 工具组 → 助手 …（最新在底部，滚动条贴底跟随）
//   · 子代理（subagent/workflow/ralph）：git 树形式——从主干 ├─ 分出支线，支线内实时展示子会话事件流，╰─ 合并回主干
//   · 插件/技能/MCP/命令/文件 等普通工具调用：同一步骤内的多个调用 → 平行卡片并排（调用并返回成组）
// 实时：面板根带 data-autorefresh="2000"，框架抽屉每 2s 静默重拉（live 开关可暂停）。
// 钻取：点子代理分支「进入 →」切换到该子会话的流程图（当前会话压 crumbs 栈，「← 返回」逐级退回）。
// 数据源（DSH 0.1.5 统一折叠器，同一 parseItems 供两条来源）：
//   · 当前会话实时：Client 订阅 Session Controller 事件窗（ctx.sessions.binding(sid).eventSource），
//     把瞬时 assistant/live-chunk 折叠成 attempt 快照随面板 RPC 传入（live 叠加层）；结算由事件窗
//     settle-assistant 自动去重，Client 只附最近结算 attempt 的 firstSeq 供 UI 连续性。
//   · 冷会话/跨会话/子代理钻取：Host sessionQuery（makeSessionLogReader 缓存）读持久事件，
//     assistant/message 与 assistant/attempt 的内嵌 stream 记录被精确重放出同样的卡片。
//   · 旧 assistant/chunk 协议（0.1.2）不再被解析——0.1.5 日志不含该事件。
// 状态：{ live, follow, limit, sid, home, expanded, crumbs }（轻量标量；事件本体与流程模型每次动作重建，不进 state）

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
      if (s === 'ok') return '<span style="color:var(--tb-done-text,#81c784)">✓ ' + fmtDur(dur) + '</span>'
      if (s === 'error') return '<span style="color:var(--tb-danger-text,#f28b82)">✗ ' + fmtDur(dur) + '</span>'
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

    // 完整详情 → 右侧浮层（不插入流程流撑高内容：展开/收起零跳跃，滚动位置不动）：
    // 完整输入参数（美化 JSON）+ 完整返回结果（均截断标注，防大参数撑爆 HTML）；头部 ✕ 或再点卡片关闭
    const detailRail = (c, anim, presentationRules) => {
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

    const render = async (st, sid, live) => {
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
      const drilled = !!(st.home && sid !== st.home)
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
        // 子代理分支内容并行预取（串行 await 会让多个子代理分支的 readLog 延迟叠加）
        const subHtmls = {}
        await Promise.all(shown.map(async (n, i) => { if (n.t === 'subs') subHtmls[i] = await subGroupHtml(n) }))
        const rows = []
        for (let i = 0; i < shown.length; i++) {
          const n = shown[i]
          const withConn = rows.length > 0 // 可视首行（最老）不画连接符
          let h
          // 助手消息后紧跟的同步骤节点统一归并：普通调用组(par)与子代理(sub)任意顺序/兼有都并进同一行
          // —— 左=分支、中=助手卡、右=工具组（此前 par/sub 只认单一模式，混合步骤会把子代理落单到下一行导致分支错位）
          if (n.t === 'msg' && n.it.role === 'ai' && shown[i + 1] && (shown[i + 1].t === 'par' || shown[i + 1].t === 'subs')) {
            let parN = null, subN = null, subIdx = -1, next = i + 1
            if (shown[next] && shown[next].t === 'par') { parN = shown[next]; next++ }
            if (shown[next] && shown[next].t === 'subs') { subN = shown[next]; subIdx = next; next++ }
            if (!parN && shown[next] && shown[next].t === 'par') { parN = shown[next]; next++ }
            const subCalls = subN ? subN.calls : []
            // 进行中判定：工具组有 pending / 子代理还在跑 / 该助手消息正活跃
            const aiLive = (parN && parN.calls.some((c) => c.status === 'pending')) || subCalls.some((c) => c.status === 'pending') || n.it.seq === liveAiSeq
            let main = msgCardInner(n.it, st.expanded, aiLive)
            let lastI = next - 1
            // 并行分支全部返回后，出口对齐最后一个结果之后的主干消息。
            const allSettled = subCalls.length > 0 && subCalls.every((c) => c.resSeq != null)
            const resultSeq = allSettled ? Math.max(...subCalls.map((c) => c.resSeq)) : null
            if (resultSeq != null) {
              // 已完成：中列从卡A 起 ▼ 串到「结果之后的第一条消息」（出口卡贴底与其对齐）；
              // 合并边界按轮次（turn）——只吞同轮消息，下一轮的用户/助手消息回到独立行（对齐基准）
              for (let j = next; j < shown.length; j++) {
                const m = shown[j]
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
      if (fields && Object.prototype.hasOwnProperty.call(fields, '__flowPresentationRules')) {
        st.presentationRules = normalizePresentationRules(fields.__flowPresentationRules)
      } else if (!Array.isArray(st.presentationRules)) st.presentationRules = []
      const el = fields && fields.__el ? fields.__el : {}
      // home=面板所属会话（钻取不改变归属）；sid=当前查看的会话（默认=home）。
      // 跟随模式下 Harness 已经把当前 session 切到 st.sid，但 crumbs 表明这仍是
      // 从父流镜钻取进来的链；此时必须保留原 home，才能继续渲染“← 返回”。
      const carriedFollow = st.follow === true && st.home && session && st.sid === session && st.crumbs.length > 0
      const home = carriedFollow ? st.home : (session || st.home || st.sid)
      if (!home) return { ok: true, html: '<div class="jr-tabpanel tb-root"><div class="tb-notice">未找到当前会话</div></div>', state: st }
      st.home = home
      if (!st.sid) st.sid = home
      let navigateSession = null
      let flowContext = null
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
          if (st.follow) navigateSession = { sessionId: prev.sid, kind: 'session' }
        }
      }
      const sid = st.sid
      try {
        const html = await render(st, sid, liveOverlay)
        return { ok: true, html, state: st, navigateSession, flowContext }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e), html: '', state: st }
      }
    }

    tryRegisterTool(ctx, { id: 'flow', label: '流镜', order: 2, icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M8 4.5v2.2M8 6.7L4 11M8 6.7l4 4.3"/></svg>' }, handler)
  },
}
