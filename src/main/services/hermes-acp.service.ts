import { spawn, type ChildProcess } from 'node:child_process'
import { shell } from 'electron'
import readline from 'node:readline'
import path from 'node:path'
import fs from 'node:fs'
import type { AgentModelInfo, AgentModelList, HermesStreamEvent } from '../../shared/types'

/**
 * Minimal ACP (Agent Client Protocol) client for the local Hermes agent.
 *
 * Hermes ships a stdio ACP server (`hermes-acp.exe`); we talk to it with
 * newline-delimited JSON-RPC over its stdin/stdout. This service owns the
 * spawned process, maps a request id to its pending promise, and forwards
 * async notifications (status / tool calls / text chunks / permission
 * requests) to the renderer through a push callback. Hermes sessions are
 * isolated by UI conversation id so switching threads never leaks context.
 */

export const DEFAULT_HERMES_ACP =
  'C:\\Users\\16001\\AppData\\Local\\hermes\\bin\\hermes-acp.exe'

/** Best-effort text extraction from one message (or whole result) of a prompt
 *  completion. Tolerates string content, arrays, structured `{type:'text'}`,
 *  nested arrays, plain `message`/`text` fields, top-level message lists, and
 *  JSON-RPC `result` wrappers. */
export function extractText(node: any): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (Array.isArray(node)) return pickValue(node)

  // JSON-RPC response shape: the actual payload is under `result`.
  if (node.result !== undefined) {
    const fromResult = extractText(node.result)
    if (fromResult) return fromResult
  }

  // Whole-result shape: messages/output hold an array of per-turn messages.
  for (const k of ['messages', 'output']) {
    if (Array.isArray(node[k])) {
      const joined = node[k].map(extractText).filter(Boolean).join('\n')
      if (joined) return joined
    }
  }

  // Single-message shape: prefer content; fall back to message/text fields.
  if (node.content !== undefined) {
    const s = pickValue(node.content)
    if (s) return s
  }
  for (const k of ['message', 'text', 'output', 'result', 'response', 'answer', 'reply']) {
    if (typeof node[k] === 'string' && node[k]) return node[k]
  }
  return ''
}

/** Recursively stringify the answer held by a content/text/value node. */
function pickValue(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(pickValue).join('')
  if (typeof v !== 'object') return ''
  if (typeof v.text === 'string') return v.text
  if (v.content !== undefined) return pickValue(v.content)
  return ''
}

/** Parse a session/new|load `models` payload into the picker payload shape.
 *  ACP serializes with camelCase aliases (availableModels / modelId) while
 *  older Hermes builds used snake_case — accept both. */
export function parseModelState(state: any): {
  models: AgentModelInfo[]
  currentModelId: string | null
} {
  const out: { models: AgentModelInfo[]; currentModelId: string | null } = {
    models: [],
    currentModelId: null
  }
  if (!state || typeof state !== 'object') return out
  const avail = state.availableModels ?? state.available_models ?? state.models
  if (Array.isArray(avail)) {
    for (const m of avail) {
      const id = typeof m === 'string' ? m : m?.modelId ?? m?.model_id
      if (!id) continue
      out.models.push({ id, name: m?.name ?? id, description: m?.description ?? undefined })
    }
  }
  const cur = state.currentModelId ?? state.current_model_id
  if (cur) out.currentModelId = String(cur)
  return out
}

/** Parse one ACP session/update notification into the renderer event shape. */
export function parseSessionUpdate(msg: any): {
  sessionId: string | null
  event: HermesStreamEvent | null
} {
  if (msg?.method !== 'session/update') return { sessionId: null, event: null }
  const params = msg.params ?? {}
  const update = params.update ?? params
  const kind = String(update.sessionUpdate ?? update.session_update ?? update.kind ?? '')
  const sessionId = params.sessionId ?? params.session_id ?? null
  const contentText = extractText(update.content)
  if (kind === 'agent_message_chunk' && contentText.trim()) {
    return { sessionId, event: { type: 'text', text: contentText } }
  }
  if (kind === 'tool_call' || kind === 'tool_call_update') {
    const name = String(update.title ?? update.name ?? '工具')
    return { sessionId, event: { type: 'tool_call', name, args: update } }
  }
  const status = update.title ?? update.status
  return {
    sessionId,
    event: typeof status === 'string' && status ? { type: 'status', status } : null
  }
}

export interface HermesCheckResult {
  available: boolean
  exe: string | null
  agentInfo?: string | null
  needAuth?: boolean
  reason?: 'not_installed' | 'spawn_failed' | 'handshake_failed' | 'timeout' | 'unknown'
  message?: string
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export class HermesAcpService {
  private child: ChildProcess | null = null
  private rl: readline.Interface | null = null
  private nextId = 0
  private pending = new Map<number, PendingRequest>()
  private started = false
  private startPromise: Promise<void> | null = null
  private warming = false

  /** One provider-side session per Workdeck conversation. */
  private sessionIds = new Map<string, string>()
  /** Text chunks collected while a prompt is active, keyed by ACP session. */
  private responseBuffers = new Map<string, string[]>()

  /** Real models surfaced by Hermes (fetched from session creation responses). */
  private models: AgentModelInfo[] = []
  private currentModelId: string | null = null

  constructor(private push: (ev: HermesStreamEvent) => void) {}

  /**
   * Verify Hermes can actually be reached: binary exists, process spawns,
   * and the ACP handshake completes. Returns a human-readable reason on failure.
   */
  async check(): Promise<HermesCheckResult> {
    const exe = this.resolveExe()
    if (!exe || !fs.existsSync(exe)) {
      return {
        available: false,
        exe,
        agentInfo: null,
        reason: 'not_installed',
        message: exe ? `未找到本地 Agent 可执行文件：${exe}` : '未配置本地 Agent 路径'
      }
    }

    try {
      // Validate the FULL session layer (handshake + session/new), not just that
      // the binary spawns — a process can come up yet hang on the model backend
      // later. The resulting session is cached and reused by send(), so this also
      // pre-warms the first prompt. Bounded so the UI never waits minutes.
      await Promise.race([
        this.ensureSession(),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('连接检测超时')), 15000)
        })
      ])
      return {
        available: true,
        exe,
        agentInfo: 'hermes-acp',
        message: this.currentModelId ? `已接入 Hermes · 当前模型 ${this.currentModelId}` : '已接入 Hermes'
      }
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      let reason: HermesCheckResult['reason'] = 'unknown'
      if (msg.includes('未找到') || msg.includes('ENOENT') || msg.includes('spawn')) {
        reason = 'spawn_failed'
      } else if (msg.includes('超时')) {
        reason = 'timeout'
      } else if (msg.includes('initialize') || msg.includes('handshake') || msg.includes('会话')) {
        reason = 'handshake_failed'
      }
      return { available: false, exe, agentInfo: null, reason, message: msg }
    }
  }

  private resolveExe(): string | null {
    const fromEnv = process.env.HERMES_ACP_EXE
    if (fromEnv) return fromEnv
    const bundled = path.join(appRoot(), 'bin', 'hermes-acp.exe')
    if (fs.existsSync(bundled)) return bundled
    return DEFAULT_HERMES_ACP
  }

  /**
   * Ensure the process is alive and the ACP handshake is done.
   * Lazy: the first call spawns Hermes and waits for initialize.
   */
  private async ensure(): Promise<void> {
    const child = this.child
    const connected =
      this.started &&
      child !== null &&
      !child.killed &&
      child.exitCode === null &&
      child.stdin !== null &&
      child.stdin.writable &&
      !child.stdin.destroyed
    if (connected) return
    if (this.startPromise) return this.startPromise

    // A reinstalled/restarted Hermes can leave the old stdio child alive but
    // unwritable. Drop that stale connection before spawning a fresh ACP peer.
    this.dropConnection(new Error('Hermes 连接已断开'), child)
    if (child && !child.killed) child.kill()
    this.startPromise = this.start().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private dropConnection(reason: Error, owner: ChildProcess | null = this.child): void {
    // Events from a previously replaced child must not tear down the new one.
    if (owner && this.child && owner !== this.child) return
    this.started = false
    this.child = null
    this.rl = null
    this.sessionIds.clear()
    this.responseBuffers.clear()
    for (const t of this.pendingInbound.values()) clearTimeout(t.timer)
    this.pendingInbound.clear()
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(reason)
    }
    this.pending.clear()
  }

  /**
   * Pre-warm the Hermes stdio connection and session so the first user prompt
   * does not pay the spawn + handshake cost. Safe to call multiple times.
   */
  warmup(): void {
    if (this.warming || (this.started && this.sessionIds.has('__warmup__'))) return
    this.warming = true
    void this.ensureSession(undefined, '__warmup__').catch(() => {
      /* warmup is best-effort; availability is reported separately */
    }).finally(() => {
      this.warming = false
    })
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const exe = this.resolveExe()
      if (!exe) {
        reject(new Error('未找到 hermes-acp.exe，请先安装 Hermes'))
        return
      }
      const child = spawn(exe, [], {
        stdio: ['pipe', 'pipe', 'inherit'],
        cwd: workspacePath(),
        windowsHide: true
      })
      this.child = child
      this.rl = readline.createInterface({ input: child.stdout })
      let settled = false

      this.rl.on('line', (line) => {
        if (!line.trim()) return
        let msg: any
        try {
          msg = JSON.parse(line)
        } catch {
          return
        }
        if (!msg || typeof msg !== 'object') return
        // ACP is bidirectional: messages with an id are either responses to
        // OUR requests (no method) or inbound REQUESTS from Hermes that we
        // must answer (method present). No-id messages are notifications.
        if (typeof msg.id === 'number') {
          if (typeof msg.method === 'string') {
            this.handleInboundRequest(msg)
          } else {
            this.settleRequest(msg)
          }
        } else if (msg.method) {
          this.handleNotification(msg)
        }
      })

      child.on('error', (err) => {
        this.dropConnection(err, child)
        if (!settled) {
          settled = true
          reject(err)
        }
      })
      child.on('exit', () => {
        this.dropConnection(new Error('hermes 进程已退出'), child)
      })

      child.stdin.on('error', (err) => {
        this.dropConnection(new Error(`Hermes 输入通道已断开：${err.message}`), child)
      })

      // Kick off the handshake; the first initialize settles `start()`.
      this.started = true
      this.rpc('initialize', {
        protocol_version: 1,
        client_capabilities: {},
        client_info: { name: 'workdeck', version: '1.0.0' }
      })
        .then(() => {
          if (!settled) {
            settled = true
            resolve()
          }
        })
        .catch((err) => {
          this.dropConnection(err instanceof Error ? err : new Error(String(err)), child)
          if (!child.killed) child.kill()
          if (!settled) {
            settled = true
            reject(err)
          }
        })
    })
  }

  private rpc<T = unknown>(method: string, params: Record<string, unknown>, timeout = 300000): Promise<T> {
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      const child = this.child
      if (!child || !child.stdin || !child.stdin.writable) {
        reject(new Error('hermes 未连接'))
        return
      }
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`hermes ${method} 超时`))
      }, timeout)
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer
      })
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
      )
    })
  }

  private settleRequest(msg: any): void {
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.result !== undefined) {
      p.resolve(msg.result)
    } else if (msg.error) {
      p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
    } else {
      p.resolve(undefined)
    }
  }

  /**
   * Inbound REQUESTs awaiting an explicit answer from the renderer.
   * Keyed by the permission_request_id we expose to the UI.
   */
  private pendingInbound = new Map<
    string,
    {
      id: number
      timer: NodeJS.Timeout
      options: { id: string; label: string }[]
      /** When set, this is a Workdeck-bridged sensitive tool: run only if allowed. */
      execute?: (allow: boolean) => void
    }
  >()

  /**
   * Route Hermes's inbound tool REQUESTs (bidirectional JSON-RPC).
   *
   * Read-only tools run immediately and return real data; sensitive tools
   * (file writes / delete / terminal) are deferred to the renderer and only run
   * after the user confirms in the UI — matching Workdeck's "写操作永远先确认" rule.
   */
  private handleInboundRequest(msg: any): void {
    const id = msg.id
    const method: string = msg.method || ''
    const params: any = msg.params ?? {}

    if (method === 'session/request_permission') {
      const permId = params.permission_request_id ?? params.permissionRequestId ?? id
      const key = String(permId)
      const options: { id: string; label: string }[] = Array.isArray(params.options)
        ? params.options.map((o: any) => ({
            id: String(o.option_id ?? o.optionId ?? o.name ?? ''),
            label: String(o.title ?? o.name ?? o.value ?? '')
          }))
        : []
      const toolTitle = params.tool_call?.title ?? params.title ?? ''
      // Hermes 自身的授权：放行一次（回应 outcome），不做真正动作。
      const timer = setTimeout(() => this.respondPermissionRequest(key, true), 60_000)
      this.pendingInbound.set(key, { id, timer, options })
      this.push({
        type: 'permission',
        requestId: key,
        message: toolTitle || 'Hermes 请求授权执行一个操作',
        options: options.map((o) => o.label)
      })
      return
    }

    // ---------- 只读工具：立即执行并回真实数据 ----------
    if (method === 'fs/read_text_file') {
      const p: unknown = params.path ?? params.file_path
      if (typeof p === 'string') {
        this.respond(id, { content: safeReadText(p) })
        this.push({ type: 'tool_result', name: '读取文件' })
      } else {
        this.respondError(id, -32602, 'path required')
      }
      return
    }

    if (method === 'fs/list_directory' || method === 'fs/list_dir' || method === 'fs/search_files') {
      const p = String(params.path ?? params.directory ?? params.dir ?? workspacePath())
      this.respond(id, { entries: safeReaddir(p) })
      this.push({ type: 'tool_result', name: '列出目录' })
      return
    }

    if (method === 'fs/info' || method === 'fs/file_info' || method === 'fs/stat') {
      const p = String(params.path ?? params.file_path ?? params.directory ?? workspacePath())
      this.respond(id, { stat: safeStat(p) })
      this.push({ type: 'tool_result', name: '读取信息' })
      return
    }

    // ---------- 敏感工具：写 / 删 / 移动 / 终端 —— 确认后才执行 ----------
    const toolLabel = toolLabelFor(method)
    if (toolLabel) {
      this.deferSensitive(id, method, params, toolLabel)
      return
    }

    this.respondError(id, -32601, `tool not bridged: ${method}`)
  }

  /**
   * Queue a sensitive tool behind the renderer's confirm card. The action only
   * runs on 允许; a timed-out decision is rejected so the agent never silently
   * modifies the workspace.
   */
  private deferSensitive(id: number, method: string, params: any, toolLabel: string): void {
    const key = `tool_${id}`
    const options = [
      { id: 'allow_once', label: '允许' },
      { id: 'deny', label: '拒绝' }
    ]
    // Sensitive ops reject on timeout instead of auto-allowing.
    const timer = setTimeout(() => this.respondPermissionRequest(key, false), 120_000)
    const execute = (allow: boolean) => {
      if (!allow) {
        this.respondError(id, -32000, '用户拒绝了该操作')
        this.push({ type: 'tool_result', name: toolLabel })
        return
      }
      this.push({ type: 'tool_call', name: toolLabel, args: params })
      void this.runSensitive(id, method, params, toolLabel).catch((err: Error) => {
        this.respondError(id, -32603, String(err?.message ?? err))
        this.push({ type: 'tool_result', name: toolLabel })
      })
    }
    this.pendingInbound.set(key, { id, timer, options, execute })
    this.push({
      type: 'permission',
      requestId: key,
      message: `${toolLabel} · ${describeParams(method, params)}`,
      options: options.map((o) => o.label)
    })
  }

  /** Execute a user-confirmed sensitive tool and reply with the outcome. */
  private async runSensitive(id: number, method: string, params: any, toolLabel: string): Promise<void> {
    // 终端 / bash：在 workspace 里执行命令，流式回显。
    if (method.startsWith('terminal/') || method.startsWith('bash')) {
      const cmd = String(params.command ?? params.cmd ?? params.input ?? '')
      if (!cmd.trim()) {
        this.respondError(id, -32602, 'command required')
        return
      }
      this.push({ type: 'status', status: `运行: ${cmd.slice(0, 40)}` })
      const r = await execTerminal(cmd, workspacePath(), (chunk) => this.push({ type: 'text', text: chunk }))
      this.respond(id, {
        stdout: r.stdout,
        stderr: r.stderr,
        exit_code: r.exitCode,
        timed_out: r.timedOut
      })
      this.push({ type: 'tool_result', name: toolLabel })
      return
    }

    // 文件类写操作。
    const p = resolvePath(params.path ?? params.file_path ?? params.directory ?? params.target ?? null)
    if (FS_WRITE.has(method)) {
      if (!p) {
        this.respondError(id, -32602, 'path required')
        return
      }
      const content = typeof params.content === 'string' ? params.content : ''
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, content, 'utf8')
      this.respond(id, { ok: true, path: p, bytes: Buffer.byteLength(content) })
      this.push({ type: 'tool_result', name: toolLabel })
      return
    }
    if (method === 'fs/create_directory' || method === 'fs/mkdir') {
      if (p) {
        fs.mkdirSync(p, { recursive: true })
        this.respond(id, { ok: true, path: p })
      } else this.respondError(id, -32602, 'path required')
      return
    }
    if (FS_DELETE.has(method)) {
      if (p) {
        fs.rmSync(p, { recursive: true, force: true })
        this.respond(id, { ok: true, removed: p })
      } else this.respondError(id, -32602, 'path required')
      return
    }
    if (method === 'fs/rename' || method === 'fs/move') {
      const to = resolvePath(params.to ?? params.dest ?? params.destination ?? null)
      if (p && to) {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.renameSync(p, to)
        this.respond(id, { ok: true, from: p, to })
      } else this.respondError(id, -32602, 'path + to required')
      return
    }
    if (method === 'fs/copy' || method === 'fs/copy_file') {
      const to = resolvePath(params.to ?? params.dest ?? params.destination ?? null)
      if (p && to) {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(p, to)
        this.respond(id, { ok: true, from: p, to })
      } else this.respondError(id, -32602, 'path + to required')
      return
    }
    this.respondError(id, -32601, `tool not bridged: ${method}`)
  }

  /**
   * Renderer decides whether a pending permission request is allowed or denied.
   * No-op if the request already timed out / was answered.
   */
  respondPermission(requestId: string, _allow: boolean): void {
    this.respondPermissionRequest(requestId, Boolean(_allow))
  }

  private respondPermissionRequest(requestId: string, allow: boolean): void {
    const entry = this.pendingInbound.get(requestId)
    if (!entry) return
    this.pendingInbound.delete(requestId)
    clearTimeout(entry.timer)
    // Workdeck-bridged sensitive tools carry an executor: run it with the
    // decision. Hermes's own permission requests just need an outcome reply.
    if (entry.execute) {
      entry.execute(allow)
      return
    }
    const chosen =
      entry.options.find((o) => {
        const n = o.label.toLowerCase()
        return allow
          ? /allow|permit/i.test(n)
          : /deny|reject|never/i.test(n)
      }) ??
      (allow
        ? entry.options[0]
        : entry.options[entry.options.length - 1])
    const optionId = chosen?.id ?? (allow ? 'allow_once' : 'allow_never')
    this.respond(entry.id, { outcome: { optionId, outcome: 'selected' } })
  }

  private respond(id: number, result: unknown): void {
    const child = this.child
    if (child && child.stdin && child.stdin.writable) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
    }
  }

  private respondError(id: number, code: number, message: string): void {
    const child = this.child
    if (child && child.stdin && child.stdin.writable) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
    }
  }

  /**
   * Streamed notifications (no id) pushed by the agent — surface the visible
   * phases so the UI can render progress rather than a blank wait.
   */
  private handleNotification(msg: any): void {
    const parsed = parseSessionUpdate(msg)
    if (!parsed.event) return
    // Ignore replayed history chunks emitted outside an active prompt.
    if (parsed.event.type === 'text') {
      let buffer = parsed.sessionId ? this.responseBuffers.get(parsed.sessionId) : undefined
      // Some ACP bridges omit or rewrite sessionId on notifications. There is
      // only one active prompt in Workdeck, so the sole buffer is unambiguous.
      if (!buffer && this.responseBuffers.size === 1) {
        buffer = this.responseBuffers.values().next().value
      }
      if (!buffer) return
      buffer.push(parsed.event.text)
    }
    this.push(parsed.event)
  }

  private async ensureSession(cwd?: string, sessionKey = '__default__'): Promise<string> {
    await this.ensure()
    const existing = this.sessionIds.get(sessionKey)
    if (existing) return existing
    const res = await this.rpc<any>('session/new', {
      cwd: cwd ?? workspacePath(),
      mcpServers: []
    })
    const sid = res?.sessionId ?? res?.session_id
    if (!sid) throw new Error('Hermes 未返回会话 id')
    this.sessionIds.set(sessionKey, sid)
    this.captureModels(res?.models)
    this.push({ type: 'session', sessionId: sid })
    this.push({ type: 'status', status: '会话就绪' })
    return sid
  }

  /** Map session model state into the lightweight picker payload. */
  private captureModels(state: any): void {
    const parsed = parseModelState(state)
    if (parsed.models.length) this.models = parsed.models
    if (parsed.currentModelId) this.currentModelId = parsed.currentModelId
  }

  /** Real models exposed by Hermes plus its current selection.
   *  Cached after the first session so later calls avoid an extra session/new round-trip. */
  async listModels(): Promise<AgentModelList> {
    if (this.models.length) {
      return { models: this.models, currentModelId: this.currentModelId }
    }
    await this.ensureSession()
    return { models: this.models, currentModelId: this.currentModelId }
  }

  /**
   * Send a prompt and wait for the final reply. Chunks / status / tool calls
   * arrive earlier through the push callback so the UI can render progress.
   */
  async send(text: string, opts?: {
    cwd?: string
    reset?: boolean
    model?: string
    sessionKey?: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  }): Promise<string> {
    const sessionKey = opts?.sessionKey?.trim() || '__default__'
    if (opts?.reset) this.sessionIds.delete(sessionKey)
    const isNewSession = !this.sessionIds.has(sessionKey)
    const sid = await this.ensureSession(opts?.cwd, sessionKey)
    this.push({ type: 'status', status: 'Hermes 思考中…' })

    // Make the panel's model dropdown real: ask Hermes to switch before prompting.
    // Best-effort — a bad/unavailable model id falls back to the current one.
    const modelId = opts?.model
    if (modelId && modelId.trim() && modelId !== 'default') {
      try {
        await this.rpc<any>('session/set_model', { sessionId: sid, modelId: modelId.trim() }, 20_000)
        this.currentModelId = modelId.trim()
      } catch {
        this.push({ type: 'status', status: '模型切换失败，沿用当前模型' })
      }
    }

    // Restore context after an app/agent restart. Existing live Hermes
    // sessions already own their history, so only seed a newly created one.
    let promptText = text
    if (isNewSession && opts?.messages && opts.messages.length > 1) {
      const history = opts.messages
        .slice(-20)
        .map((m) => `${m.role === 'assistant' ? '助手' : '用户'}：${m.content}`)
        .join('\n\n')
        .slice(-24000)
      promptText = `请继续以下对话。将最后一条用户消息作为当前任务，之前的内容只作为上下文：\n\n${history}`
    }

    this.responseBuffers.set(sid, [])
    let res: any
    try {
      // rpc() writes to Hermes stdin synchronously before returning its
      // promise. Announce delivery after that write, independently of the
      // Hermes desktop UI (which may not refresh until the turn finishes).
      const promptRequest = this.rpc<any>(
        'session/prompt',
        {
          sessionId: sid,
          prompt: [{ type: 'text', text: promptText }]
        },
        // Bounded so the UI never freezes for minutes when the model backend
        // hangs (free-tier queueing, expired credentials, unreachable provider).
        180_000
      )
      this.push({ type: 'status', status: '已送达 Hermes · 等待模型响应…' })
      res = await promptRequest
    } catch (e) {
      this.responseBuffers.delete(sid)
      const msg = String((e as Error)?.message ?? e)
      if (/超时/.test(msg)) {
        throw new Error(
          'Hermes 响应超时——模型后端无响应（当前默认模型 hy3-free / opencode-free）。' +
            '可能是免费额度排队、凭证失效或 provider 不可达。请在 Hermes 里切换可用模型 / 重新登录，' +
            '或在底部模型下拉切换更快的模型后重试。'
        )
      }
      throw e
    }

    // Hermes / 各家 Agent 的返回形态差异很大，统一用健壮提取器取纯文本。
    const streamedText = (this.responseBuffers.get(sid) ?? []).join('').trim()
    this.responseBuffers.delete(sid)
    const resultText = extractText(res).trim()
    const finalText = resultText || streamedText

    // When text already streamed, do not send it again in `done`.
    this.push({ type: 'done', finalText: streamedText ? '' : resultText })
    // Never return a placeholder as assistant content. IPC invoke completion
    // and pushed stream events are separate renderer queues; a placeholder can
    // arrive first and mask the real text chunk that follows milliseconds later.
    return finalText
  }

  async stop(): Promise<void> {
    const child = this.child
    if (child && !child.killed) {
      child.kill()
    }
    this.child = null
    this.rl = null
    this.started = false
    this.sessionIds.clear()
  }

  /**
   * Open the Hermes desktop app (or fall back to its CLI login flow) so the
   * user can refresh expired OAuth credentials. This is the only recovery path
   * from the "ACP connects but the model backend hangs" failure mode, which is
   * caused by stale provider tokens we cannot refresh headlessly.
   */
  async openLogin(): Promise<{ ok: boolean; message: string }> {
    const local = process.env.LOCALAPPDATA || ''
    const desktopExe = path.join(
      local,
      'hermes',
      'hermes-agent',
      'apps',
      'desktop',
      'release',
      'win-unpacked',
      'Hermes.exe'
    )
    try {
      if (fs.existsSync(desktopExe)) {
        const err = await shell.openPath(desktopExe)
        if (!err) {
          return { ok: true, message: '已打开 Hermes 桌面程序，请在其中重新登录以刷新凭证。' }
        }
      }
    } catch {
      /* fall through to CLI */
    }
    // Best-effort fallback: the CLI may trigger a browser OAuth flow.
    const cli = path.join(local, 'hermes', 'bin', 'hermes.exe')
    return new Promise((resolve) => {
      try {
        const child = spawn(cli, ['login'], { stdio: 'ignore', windowsHide: false, detached: true })
        child.on('error', (e) => resolve({ ok: false, message: `无法启动 Hermes：${(e as Error)?.message ?? e}` }))
        child.unref()
        resolve({ ok: true, message: '已尝试启动 Hermes 登录流程，请按提示在浏览器完成授权。' })
      } catch (e) {
        resolve({ ok: false, message: `无法启动 Hermes：${(e as Error)?.message ?? e}` })
      }
    })
  }
}

let cachedRoot: string | null = null
function appRoot(): string {
  return cachedRoot ?? (cachedRoot = __dirname.split('services')[0].replace(/[\\/]$/, ''))
}

function workspacePath(): string {
  const w = process.env.WORKDECK_WORKSPACE
  return w || appRoot()
}

/** Read a text file the agent asked for, returning '' on any failure. */
function safeReadText(p: string): string {
  try {
    const abs = path.isAbsolute(p) ? p : path.resolve(workspacePath(), p)
    return fs.readFileSync(abs, 'utf8')
  } catch {
    return `（无法读取：${p}）`
  }
}

/* ---------- 被桥接的 Hermes 工具（Workdeck 为其真实执行） ---------- */

/** 写类工具：会在 workspace 里改文件，必须先经用户确认。 */
const FS_WRITE = new Set([
  'fs/write_text_file',
  'fs/write_file',
  'fs/create_file',
  'fs/append_text_file',
  'fs/edit_text_file'
])
/** 删除类工具：破坏性操作，必须先经用户确认。 */
const FS_DELETE = new Set([
  'fs/delete',
  'fs/delete_file',
  'fs/delete_path',
  'fs/remove',
  'fs/unlink'
])

function toolLabelFor(method: string): string | null {
  if (FS_WRITE.has(method)) return '写入文件'
  if (FS_DELETE.has(method)) return '删除文件'
  if (method === 'fs/create_directory' || method === 'fs/mkdir') return '新建目录'
  if (method === 'fs/rename' || method === 'fs/move') return '移动/重命名'
  if (method === 'fs/copy' || method === 'fs/copy_file') return '复制文件'
  if (method.startsWith('terminal/') || method.startsWith('bash')) return '运行命令'
  return null
}

function describeParams(method: string, params: any): string {
  if (method.startsWith('terminal/') || method.startsWith('bash')) {
    return `命令：${String(params.command ?? params.cmd ?? params.input ?? '')}`
  }
  const p = String(params.path ?? params.file_path ?? params.directory ?? params.target ?? params.to ?? '')
  if (p) return `路径：${p}`
  return '(未提供路径)'
}

/** Resolve a possibly-relative path against the workspace; returns null on empty. */
function resolvePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  return path.isAbsolute(raw) ? raw : path.resolve(workspacePath(), raw)
}

/** Non-throwing directory listing for the agent. */
function safeReaddir(p: string): { name: string; path: string; type: string; size: number; mtime: number }[] {
  const abs = resolvePath(p) ?? workspacePath()
  try {
    return fs.readdirSync(abs, { withFileTypes: true }).map((d) => {
      const full = path.join(abs, d.name)
      let type = d.isDirectory() ? 'directory' : d.isFile() ? 'file' : 'other'
      let size = 0
      let mtime = 0
      try {
        const st = fs.statSync(full)
        type = st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other'
        size = st.size
        mtime = st.mtimeMs
      } catch {
        /* ignore stat errors */
      }
      return { name: d.name, path: full, type, size, mtime }
    })
  } catch {
    return []
  }
}

/** Non-throwing stat for the agent. */
function safeStat(p: string): { path: string; exists: boolean; type: string; size: number; mtime: number } {
  const abs = resolvePath(p) ?? workspacePath()
  try {
    const st = fs.statSync(abs)
    return {
      path: abs,
      exists: true,
      type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other',
      size: st.size,
      mtime: st.mtimeMs
    }
  } catch {
    return { path: abs, exists: false, type: 'other', size: 0, mtime: 0 }
  }
}

/** Run a shell command in the workspace, streaming output to the UI. */
function execTerminal(
  cmd: string,
  cwd: string,
  onData: (chunk: string) => void
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, 120_000)
    child.stdout?.on('data', (d: Buffer) => {
      const s = d.toString()
      stdout += s
      onData(s)
    })
    child.stderr?.on('data', (d: Buffer) => {
      const s = d.toString()
      stderr += s
      onData(s)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      const s = `（命令启动失败：${err.message}）`
      stderr += s
      onData(s)
      resolve({ stdout, stderr, exitCode: -1, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code, timedOut })
    })
  })
}
