import fs from 'node:fs'
import path from 'node:path'
import WebSocket from 'ws'
import type { AgentModelInfo, AgentModelList, HermesStreamEvent } from '../../shared/types'
import { HermesAcpService, type HermesCheckResult } from './hermes-acp.service'

type RpcPending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

type GatewayEvent = {
  type?: string
  session_id?: string
  payload?: Record<string, unknown>
  seq?: number
}

type ActiveRun = {
  chunks: string[]
  resolve: (text: string) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  recovering?: boolean
}

type GatewaySession = { id: string; model?: string }

export function parseDashboardToken(html: string): string | null {
  const match = /window\.__HERMES_SESSION_TOKEN__\s*=\s*("(?:\\.|[^"\\])*")/.exec(html)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

export function pickGatewayPort(ledger: unknown): number | null {
  if (!Array.isArray(ledger)) return null
  for (let i = ledger.length - 1; i >= 0; i -= 1) {
    const row = ledger[i] as { purpose?: unknown; port?: unknown }
    const port = Number(row?.port)
    if (row?.purpose === 'serve' && Number.isInteger(port) && port > 0 && port < 65536) return port
  }
  return null
}

export function parseGatewayModels(payload: any): AgentModelList {
  const models: AgentModelInfo[] = []
  const seen = new Set<string>()
  const root = payload?.result && typeof payload.result === 'object' ? payload.result : payload
  const providerValue = root?.providers ?? root?.data?.providers
  const providers = Array.isArray(providerValue)
    ? providerValue
    : providerValue && typeof providerValue === 'object'
      ? Object.entries(providerValue).map(([slug, value]) => ({ ...(value as object), slug }))
      : []
  const unavailableGlobal = new Set(
    Array.isArray(root?.unavailable_models)
      ? root.unavailable_models.map(String)
      : Array.isArray(root?.unavailableModels)
        ? root.unavailableModels.map(String)
        : []
  )
  const append = (raw: unknown, providerName = '', unavailable = unavailableGlobal) => {
    const id = typeof raw === 'string'
      ? raw
      : String((raw as { id?: unknown; model?: unknown; modelId?: unknown; model_id?: unknown } | null)?.id
        ?? (raw as { model?: unknown } | null)?.model
        ?? (raw as { modelId?: unknown } | null)?.modelId
        ?? (raw as { model_id?: unknown } | null)?.model_id
        ?? (raw as { slug?: unknown } | null)?.slug
        ?? '')
    if (!id || seen.has(id) || unavailable.has(id)) return
    seen.add(id)
    const rawName = typeof raw === 'string'
      ? raw
      : String((raw as { name?: unknown } | null)?.name ?? id)
    models.push({ id, name: providerName ? `${providerName} · ${rawName}` : rawName })
  }
  for (const provider of providers) {
    const unavailable = new Set(
      Array.isArray(provider?.unavailable_models)
        ? provider.unavailable_models.map(String)
        : Array.isArray(provider?.unavailableModels)
          ? provider.unavailableModels.map(String)
          : unavailableGlobal
    )
    const providerName = typeof provider?.name === 'string'
      ? provider.name.trim()
      : typeof provider?.label === 'string' ? provider.label.trim() : ''
    const list = Array.isArray(provider?.models)
      ? provider.models
      : Array.isArray(provider?.available_models)
        ? provider.available_models
        : Array.isArray(provider?.availableModels) ? provider.availableModels : []
    for (const raw of list) append(raw, providerName, unavailable)
  }
  // Some gateway versions return a flat `models`/`availableModels` array and
  // newer ones wrap it under `options`; accept both so the picker does not
  // silently become empty when the protocol shape changes.
  const directRoot = root?.data && typeof root.data === 'object' ? root.data : root
  const direct = Array.isArray(directRoot?.models)
    ? directRoot.models
    : Array.isArray(directRoot?.available_models)
      ? directRoot.available_models
      : Array.isArray(directRoot?.availableModels)
        ? directRoot.availableModels
        : Array.isArray(directRoot?.options) ? directRoot.options : []
  for (const raw of direct) append(raw)
  const currentRaw = root?.model
    ?? root?.currentModelId
    ?? root?.current_model_id
    ?? root?.currentModel?.id
    ?? root?.current_model?.id
    ?? directRoot?.model
    ?? directRoot?.currentModelId
    ?? directRoot?.current_model_id
  const current = currentRaw ? String(currentRaw) : null
  // Hermes may leave an expired model as `model` while also listing it under
  // `unavailable_models`. Never reinsert that stale model into the picker.
  return { models, currentModelId: current && seen.has(current) ? current : models[0]?.id ?? null }
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Extract text from Gateway payloads across Hermes protocol versions. */
export function extractGatewayText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(extractGatewayText).join('')
  if (!isRecord(value)) return ''

  for (const key of ['text', 'rendered', 'delta', 'content', 'message', 'error', 'response', 'answer', 'reply', 'chunk']) {
    if (value[key] === undefined) continue
    const text = extractGatewayText(value[key])
    if (text) return text
  }
  return ''
}

const GATEWAY_EVENT_METHODS = new Set([
  'approval.request',
  'error',
  'message.complete',
  'message.delta',
  'message.start',
  'session.info',
  'status.update',
  'tool.complete',
  'tool.progress',
  'tool.start'
])

const GATEWAY_EVENT_TYPES = new Set([...GATEWAY_EVENT_METHODS, 'gateway.ready'])

function normalizeGatewayType(raw: unknown): string {
  const input = String(raw ?? '').trim()
  if (!input) return ''
  const compact = input.toLowerCase().replace(/[_/]/g, '.')
  if (compact === 'message.completed' || compact === 'message.done' || compact === 'message.final') return 'message.complete'
  if (compact === 'text.delta' || compact === 'assistant.message.delta') return 'message.delta'
  if (compact === 'assistant.message.complete') return 'message.complete'
  if (compact === 'status' || compact === 'run.status') return 'status.update'
  if (compact === 'tool.started' || compact === 'tool.generating') return 'tool.start'
  if (compact === 'tool.finished') return 'tool.complete'
  return compact
}

function sessionIdFrom(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (!isRecord(value)) continue
    for (const key of ['session_id', 'sessionId', 'sid', 'conversation_id', 'conversationId']) {
      const candidate = value[key]
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  }
  return undefined
}

/** Normalize live, method-shaped, and replayed Gateway notifications. */
export function normalizeGatewayEvent(frame: unknown): GatewayEvent | null {
  if (!isRecord(frame)) return null
  const method = typeof frame.method === 'string' ? frame.method : ''
  const params = isRecord(frame.params) ? frame.params : {}
  const nested = method === 'event'
    ? params
    : isRecord(params.event)
      ? params.event
      : isRecord(params.data)
        ? params.data
        : isRecord(params.update)
          ? params.update
          : isRecord(frame.event)
            ? frame.event
            : frame
  const normalizedMethod = normalizeGatewayType(method)
  const methodType = GATEWAY_EVENT_TYPES.has(normalizedMethod) ? normalizedMethod : ''
  const type = normalizeGatewayType(nested.type ?? nested.event_type ?? nested.eventType ?? methodType)
  if (!type) return null

  const rawPayload = nested.payload ?? nested.data ?? nested.update
  const payload = isRecord(rawPayload) ? rawPayload : nested
  const sid = sessionIdFrom(nested, params, payload)
  const rawSeq = nested.seq ?? frame.seq
  const seq = typeof rawSeq === 'number' && Number.isFinite(rawSeq) ? rawSeq : undefined
  return { type, session_id: sid, payload, ...(seq === undefined ? {} : { seq }) }
}

function latestAssistantText(value: unknown): string {
  const root = isRecord(value) && value.result !== undefined ? value.result : value
  if (isRecord(root) && Array.isArray(root.messages)) {
    for (let i = root.messages.length - 1; i >= 0; i -= 1) {
      const message = root.messages[i]
      if (!isRecord(message)) continue
      const role = String(message.role ?? message.author ?? message.type ?? '').toLowerCase()
      if (!/assistant|agent|model|hermes/.test(role)) continue
      const text = extractGatewayText(message.content ?? message)
      if (text.trim()) return text.trim()
    }
  }
  return ''
}

/**
 * Connects to the already-running Hermes Desktop gateway over its native
 * WebSocket JSON-RPC protocol. This is the same session.create/prompt.submit
 * path used by Hermes Desktop itself, so messages appear in Hermes immediately
 * and streamed output is delivered to Workdeck without a second ACP process.
 * ACP remains a compatibility fallback when Hermes Desktop is not running.
 */
export class HermesGatewayService {
  private socket: WebSocket | null = null
  private socketUrl: string | null = null
  private connectPromise: Promise<void> | null = null
  private nextId = 0
  private pending = new Map<number, RpcPending>()
  private sessions = new Map<string, GatewaySession>()
  /** Hermes exposes both a short runtime id and a durable stored id on some versions. */
  private sessionAliases = new Map<string, string>()
  private activeRuns = new Map<string, ActiveRun>()
  private approvals = new Map<string, string>()
  private lastSeenSeq = new Map<string, number>()
  private replayEpoch: string | null = null
  private direct = false

  constructor(
    private push: (event: HermesStreamEvent) => void,
    private fallback: HermesAcpService
  ) {}

  warmup(): void {
    console.log('[workdeck] connecting native Hermes Gateway…')
    void this.ensureDirect().catch((error) => {
      console.warn('[workdeck] Hermes Gateway direct connection unavailable:', String((error as Error)?.message ?? error))
      this.fallback.warmup()
    }).then(() => {
      if (this.direct) console.log('[workdeck] native Hermes Gateway connected')
    })
  }

  async check(): Promise<HermesCheckResult> {
    try {
      await this.ensureDirect()
      return {
        available: true,
        exe: null,
        agentInfo: 'hermes-gateway',
        message: '已直连 Hermes Gateway（无需 ACP 中转）'
      }
    } catch {
      const result = await this.fallback.check()
      return result.available
        ? { ...result, message: 'Hermes Gateway 未运行，已自动使用 ACP 兼容连接' }
        : result
    }
  }

  async listModels(): Promise<AgentModelList> {
    try {
      await this.ensureDirect()
      const payload = await this.rpc<any>('model.options', { explicit_only: true }, 60_000)
      return parseGatewayModels(payload)
    } catch (gatewayError) {
      try {
        return await this.fallback.listModels()
      } catch (fallbackError) {
        const detail = String((fallbackError as Error)?.message ?? fallbackError)
        if (/未找到|未配置|ENOENT|not found/i.test(detail)) {
          return { models: [], currentModelId: null }
        }
        const gatewayDetail = String((gatewayError as Error)?.message ?? gatewayError)
        throw new Error(`Hermes 模型服务不可用：${gatewayDetail}；ACP：${detail}`)
      }
    }
  }

  async send(text: string, opts?: {
    cwd?: string
    reset?: boolean
    model?: string
    sessionKey?: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  }): Promise<string> {
    try {
      await this.ensureDirect()
    } catch {
      this.direct = false
      return this.fallback.send(text, opts)
    }

    const key = opts?.sessionKey?.trim() || '__default__'
    const requestedModel = opts?.model?.trim() && opts.model !== 'default' ? opts.model.trim() : undefined
    const existing = this.sessions.get(key)
    if (opts?.reset || (requestedModel && existing?.model !== requestedModel)) this.sessions.delete(key)

    let session = this.sessions.get(key)
    if (!session) {
      const previousMessages = opts?.messages?.slice(0, -1).slice(-20) ?? []
      const created = await this.rpc<any>('session.create', {
        cwd: opts?.cwd || workspacePath(),
        title: 'Workdeck',
        close_on_disconnect: false,
        ...(requestedModel ? { model: requestedModel } : {}),
        ...(previousMessages.length ? { messages: previousMessages } : {})
      }, 60_000)
      const sid = String(created?.session_id ?? created?.sessionId ?? created?.id ?? '')
      if (!sid) throw new Error('Hermes Gateway 未返回会话 id')
      for (const alias of [created?.stored_session_id, created?.storedSessionId, created?.sessionId]) {
        if (alias && String(alias) !== sid) this.sessionAliases.set(String(alias), sid)
      }
      session = { id: sid, model: requestedModel ?? created?.info?.model }
      this.sessions.set(key, session)
      this.push({ type: 'session', sessionId: sid })
    }

    const sid = session.id
    this.push({ type: 'status', status: '已直达 Hermes Gateway · 等待模型响应…' })

    const result = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.activeRuns.delete(sid)
        reject(new Error('Hermes Gateway 响应超时，请在 Hermes 中检查模型状态'))
      }, 600_000)
      this.activeRuns.set(sid, { chunks: [], resolve, reject, timer })
    })

    void this.rpc<any>('prompt.submit', { session_id: sid, text }, 600_000).then((response) => {
      // prompt.submit normally returns only {status:"streaming"}. A few
      // Gateway builds include the completed answer in the RPC response, so
      // consume it when present instead of waiting forever for an event.
      const finalText = extractGatewayText(response).trim()
      if (finalText) this.finishRun(sid, finalText)
    }).catch((error) => {
      const run = this.activeRuns.get(sid)
      if (!run) return
      clearTimeout(run.timer)
      this.activeRuns.delete(sid)
      run.reject(error)
    })
    return result
  }

  async stop(): Promise<void> {
    if (!this.direct) return this.fallback.stop()
    await Promise.allSettled(
      [...this.activeRuns.keys()].map((session_id) => this.rpc('session.interrupt', { session_id }, 15_000))
    )
  }

  async respondPermission(requestId: string, allow: boolean): Promise<void> {
    if (!this.direct) return this.fallback.respondPermission(requestId, allow)
    const session_id = this.approvals.get(requestId)
    if (!session_id) return
    await this.rpc('approval.respond', {
      session_id,
      request_id: requestId,
      choice: allow ? 'once' : 'deny'
    }, 30_000)
    this.approvals.delete(requestId)
  }

  openLogin(): Promise<{ ok: boolean; message: string }> {
    return this.fallback.openLogin()
  }

  private async ensureDirect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.direct = true
      return
    }
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async connect(): Promise<void> {
    const wsUrl = await discoverGatewayUrl()
    if (this.socket && this.socketUrl !== wsUrl) this.closeSocket(new Error('Hermes Gateway 地址已更新'))

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      this.socket = socket
      this.socketUrl = wsUrl
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error('连接 Hermes Gateway 超时'))
      }, 10_000)

      socket.once('open', () => {
        clearTimeout(timer)
        this.direct = true
        void this.replayMissedEvents()
        resolve()
      })
      socket.on('message', (data) => this.handleFrame(String(data)))
      socket.once('error', (error) => {
        clearTimeout(timer)
        if (this.socket === socket) this.closeSocket(error)
        reject(error)
      })
      socket.once('close', () => {
        if (this.socket === socket) this.closeSocket(new Error('Hermes Gateway 已断开'))
      })
    })
  }

  private rpc<T = unknown>(method: string, params: Record<string, unknown>, timeout = 120_000): Promise<T> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Hermes Gateway 未连接'))
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Hermes Gateway ${method} 超时`))
      }, timeout)
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  private handleFrame(raw: string): void {
    let frame: any
    try {
      frame = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof frame?.id === 'number') {
      const call = this.pending.get(frame.id)
      if (call) {
        clearTimeout(call.timer)
        this.pending.delete(frame.id)
        if (frame.error) call.reject(new Error(frame.error.message || 'Hermes Gateway RPC 失败'))
        else call.resolve(frame.result)
      }
      // A few proxy versions attach an id to a notification. Continue below
      // so the event is not discarded after settling an unrelated RPC.
    }
    const event = normalizeGatewayEvent(frame)
    if (!event) return
    if (event.type === 'gateway.ready') {
      const epoch = isRecord(event.payload) ? event.payload.replay_epoch : undefined
      if (typeof epoch === 'string' && epoch) this.adoptReplayEpoch(epoch)
    }
    this.recordEventSeq(event)
    this.handleEvent(event)
  }

  private handleEvent(event: GatewayEvent): void {
    const type = normalizeGatewayType(event?.type)
    const payload = event?.payload ?? {}
    const explicitSid = event?.session_id?.trim() || ''
    const canonicalSid = explicitSid ? (this.sessionAliases.get(explicitSid) ?? explicitSid) : ''
    const resolved = this.resolveActiveRun(canonicalSid, explicitSid)
    const sid = resolved?.sid ?? canonicalSid
    const run = resolved?.run

    // Runtime/stored id aliases are also advertised in session.info payloads.
    if (explicitSid && isRecord(payload)) {
      const stored = payload.stored_session_id ?? payload.storedSessionId
      if (stored && String(stored) !== explicitSid) this.sessionAliases.set(String(stored), explicitSid)
    }

    if (type === 'session.info' && run && payload.running === false) {
      // A lost message.complete must not leave the renderer waiting forever.
      // Hermes persists the turn before emitting running=false, so recover the
      // final assistant message from the authoritative session history.
      void this.recoverRun(sid)
      return
    }

    if (type === 'message.start' && run) {
      this.push({ type: 'status', status: 'Hermes 正在生成…' })
    } else if (type === 'message.delta' && run) {
      const text = extractGatewayText(payload)
      if (text) {
        run.chunks.push(text)
        this.push({ type: 'text', text })
      }
    } else if (type === 'status.update' && run) {
      const status = extractGatewayText(payload)
      if (status) this.push({ type: 'status', status })
    } else if ((type === 'tool.start' || type === 'tool.progress') && run) {
      this.push({ type: 'tool_call', name: String(payload.name ?? payload.tool ?? payload.title ?? '工具'), args: payload })
    } else if (type === 'tool.complete' && run) {
      this.push({ type: 'tool_result', name: String(payload.name ?? payload.tool ?? payload.title ?? '工具') })
    } else if (type === 'approval.request' && sid) {
      const requestId = String(payload.request_id ?? payload.requestId ?? '')
      if (!requestId) return
      this.approvals.set(requestId, sid)
      const choices = Array.isArray(payload.choices) ? payload.choices.map(String) : ['once', 'deny']
      this.push({
        type: 'permission',
        requestId,
        message: String(payload.description ?? payload.command ?? payload.message ?? 'Hermes 请求执行操作'),
        options: choices
      })
    } else if (type === 'message.complete' && run) {
      this.finishRun(sid, extractGatewayText(payload).trim())
    } else if (type === 'error' && run) {
      clearTimeout(run.timer)
      this.activeRuns.delete(sid)
      const error = new Error(extractGatewayText(payload) || 'Hermes Gateway 运行失败')
      this.push({ type: 'error', message: error.message })
      run.reject(error)
    }
  }

  private resolveActiveRun(canonicalSid: string, explicitSid: string): { sid: string; run: ActiveRun } | null {
    if (canonicalSid) {
      const run = this.activeRuns.get(canonicalSid)
      if (run) return { sid: canonicalSid, run }
      // Do not attach a named event from another Hermes session to the only
      // Shixu run. The event may belong to the user's separate Hermes window.
      if (explicitSid) return null
    }
    if (this.activeRuns.size !== 1) return null
    const entry = this.activeRuns.entries().next().value as [string, ActiveRun] | undefined
    return entry ? { sid: entry[0], run: entry[1] } : null
  }

  private finishRun(sid: string, finalText = ''): void {
    const run = this.activeRuns.get(sid)
    if (!run) return
    clearTimeout(run.timer)
    this.activeRuns.delete(sid)
    const streamed = run.chunks.join('').trim()
    const answer = finalText.trim() || streamed
    this.push({ type: 'done', finalText: streamed ? '' : finalText.trim() })
    run.resolve(answer)
  }

  private async recoverRun(sid: string): Promise<void> {
    const run = this.activeRuns.get(sid)
    if (!run || run.recovering) return
    run.recovering = true
    try {
      // The history write and the running=false notification are normally
      // ordered, but a busy provider can make the write visible a little later.
      for (const delay of [0, 150, 500]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
        if (!this.activeRuns.has(sid)) return
        try {
          const history = await this.rpc<any>('session.history', { session_id: sid }, 15_000)
          const text = latestAssistantText(history)
          if (text) {
            this.finishRun(sid, text)
            return
          }
        } catch {
          // Older Gateway builds may not expose session.history; let the next
          // attempt or the regular completion event decide the outcome.
        }
      }
      // If streaming text did arrive but only the terminal event was lost,
      // resolve with that text rather than leaving the panel stuck forever.
      if (this.activeRuns.has(sid) && run.chunks.length) this.finishRun(sid)
    } finally {
      const current = this.activeRuns.get(sid)
      if (current) current.recovering = false
    }
  }

  private recordEventSeq(event: GatewayEvent): void {
    const sid = event.session_id
    const seq = event.seq
    if (!sid || typeof seq !== 'number' || !Number.isFinite(seq)) return
    const previous = this.lastSeenSeq.get(sid) ?? 0
    if (seq > previous) this.lastSeenSeq.set(sid, seq)
  }

  private adoptReplayEpoch(epoch: string): void {
    if (this.replayEpoch && this.replayEpoch !== epoch) this.lastSeenSeq.clear()
    this.replayEpoch = epoch
  }

  private async replayMissedEvents(): Promise<void> {
    if (!this.lastSeenSeq.size || !this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const entries = [...this.lastSeenSeq.entries()]
    const results = await Promise.allSettled(
      entries.map(async ([sid, lastSeen]) => {
        const result = await this.rpc<any>('session.events.since', { session_id: sid, last_seen: lastSeen }, 15_000)
        const epoch = typeof result?.epoch === 'string' ? result.epoch : ''
        if (epoch && this.replayEpoch && epoch !== this.replayEpoch) {
          this.adoptReplayEpoch(epoch)
          return []
        }
        return Array.isArray(result?.events) ? result.events : []
      })
    )
    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      for (const raw of result.value) {
        const event = normalizeGatewayEvent(raw)
        if (!event) continue
        const previous = event.session_id ? (this.lastSeenSeq.get(event.session_id) ?? 0) : 0
        if (event.seq !== undefined && event.seq <= previous) continue
        this.recordEventSeq(event)
        this.handleEvent(event)
      }
    }
  }

  private closeSocket(error: Error): void {
    const socket = this.socket
    this.socket = null
    this.socketUrl = null
    this.direct = false
    this.sessions.clear()
    this.sessionAliases.clear()
    if (socket && socket.readyState === WebSocket.OPEN) socket.close()
    for (const call of this.pending.values()) {
      clearTimeout(call.timer)
      call.reject(error)
    }
    this.pending.clear()
    for (const run of this.activeRuns.values()) {
      clearTimeout(run.timer)
      run.reject(error)
    }
    this.activeRuns.clear()
  }
}

async function discoverGatewayUrl(): Promise<string> {
  const configured = process.env.HERMES_GATEWAY_URL?.trim()
  if (configured) return configured
  const local = process.env.LOCALAPPDATA || ''
  const ledgerPath = path.join(local, 'hermes', 'spawn-ledger.json')
  let ledger: unknown
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  } catch {
    throw new Error('Hermes Gateway 未运行，请先打开 Hermes 桌面程序')
  }
  const port = pickGatewayPort(ledger)
  if (!port) throw new Error('未找到 Hermes Gateway 端口')
  const response = await fetch(`http://127.0.0.1:${port}/`)
  if (!response.ok) throw new Error('Hermes Gateway 本机鉴权页不可用')
  const token = parseDashboardToken(await response.text())
  if (!token) throw new Error('无法获取 Hermes Gateway 本机会话凭证')
  return `ws://127.0.0.1:${port}/api/ws?token=${encodeURIComponent(token)}`
}

function workspacePath(): string {
  const candidate = process.env.WORKDECK_WORKSPACE?.trim() || process.cwd()
  try {
    if (!/\.asar(?:[\\/]|$)/i.test(candidate) && fs.statSync(candidate).isDirectory()) return candidate
    return process.cwd()
  } catch {
    return process.cwd()
  }
}
