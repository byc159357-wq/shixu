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
}

type ActiveRun = {
  chunks: string[]
  resolve: (text: string) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
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
  const providers = Array.isArray(payload?.providers) ? payload.providers : []
  for (const provider of providers) {
    const unavailable = new Set(
      Array.isArray(provider?.unavailable_models)
        ? provider.unavailable_models.map(String)
        : []
    )
    for (const raw of Array.isArray(provider?.models) ? provider.models : []) {
      const id = typeof raw === 'string' ? raw : String(raw?.id ?? raw?.model ?? '')
      if (!id || seen.has(id) || unavailable.has(id)) continue
      seen.add(id)
      const rawName = typeof raw === 'string' ? raw : String(raw?.name ?? id)
      const providerName = typeof provider?.name === 'string' ? provider.name.trim() : ''
      models.push({ id, name: providerName ? `${providerName} · ${rawName}` : rawName })
    }
  }
  const current = payload?.model ? String(payload.model) : null
  // Hermes may leave an expired model as `model` while also listing it under
  // `unavailable_models`. Never reinsert that stale model into the picker.
  return { models, currentModelId: current && seen.has(current) ? current : models[0]?.id ?? null }
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
  private activeRuns = new Map<string, ActiveRun>()
  private approvals = new Map<string, string>()
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
    } catch {
      return this.fallback.listModels()
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
      const sid = String(created?.session_id ?? '')
      if (!sid) throw new Error('Hermes Gateway 未返回会话 id')
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

    void this.rpc('prompt.submit', { session_id: sid, text }, 600_000).catch((error) => {
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
      if (!call) return
      clearTimeout(call.timer)
      this.pending.delete(frame.id)
      if (frame.error) call.reject(new Error(frame.error.message || 'Hermes Gateway RPC 失败'))
      else call.resolve(frame.result)
      return
    }
    if (frame?.method === 'event') this.handleEvent(frame.params as GatewayEvent)
  }

  private handleEvent(event: GatewayEvent): void {
    const type = event?.type || ''
    const sid = event?.session_id || ''
    const payload = event?.payload ?? {}
    const run = sid ? this.activeRuns.get(sid) : undefined

    if (type === 'message.start' && run) {
      this.push({ type: 'status', status: 'Hermes 正在生成…' })
    } else if (type === 'message.delta' && run) {
      const text = String(payload.text ?? '')
      if (text) {
        run.chunks.push(text)
        this.push({ type: 'text', text })
      }
    } else if (type === 'status.update' && run) {
      const status = String(payload.text ?? '')
      if (status) this.push({ type: 'status', status })
    } else if ((type === 'tool.start' || type === 'tool.progress') && run) {
      this.push({ type: 'tool_call', name: String(payload.name ?? payload.tool ?? '工具'), args: payload })
    } else if (type === 'tool.complete' && run) {
      this.push({ type: 'tool_result', name: String(payload.name ?? payload.tool ?? '工具') })
    } else if (type === 'approval.request' && sid) {
      const requestId = String(payload.request_id ?? '')
      if (!requestId) return
      this.approvals.set(requestId, sid)
      const choices = Array.isArray(payload.choices) ? payload.choices.map(String) : ['once', 'deny']
      this.push({
        type: 'permission',
        requestId,
        message: String(payload.description ?? payload.command ?? 'Hermes 请求执行操作'),
        options: choices
      })
    } else if (type === 'message.complete' && run) {
      clearTimeout(run.timer)
      this.activeRuns.delete(sid)
      const streamed = run.chunks.join('').trim()
      const finalText = String(payload.text ?? payload.rendered ?? '').trim()
      const answer = finalText || streamed
      this.push({ type: 'done', finalText: streamed ? '' : finalText })
      run.resolve(answer)
    } else if (type === 'error' && run) {
      clearTimeout(run.timer)
      this.activeRuns.delete(sid)
      const error = new Error(String(payload.message ?? payload.error ?? 'Hermes Gateway 运行失败'))
      this.push({ type: 'error', message: error.message })
      run.reject(error)
    }
  }

  private closeSocket(error: Error): void {
    const socket = this.socket
    this.socket = null
    this.socketUrl = null
    this.direct = false
    this.sessions.clear()
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
  return process.env.WORKDECK_WORKSPACE || process.cwd()
}
