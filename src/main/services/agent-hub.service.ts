import type { AgentModelList, AgentProviderInfo, HermesStreamEvent } from '../../shared/types'
import { HermesGatewayService } from './hermes-gateway.service'
import type { OpenAiCompatClient } from './ai-provider'

/**
 * Agent hub: the pluggable "接入中心" behind the AI panel's software switcher.
 *
 * Every connectable external AI software implements {@link AgentHubProvider}.
 * `'external'` providers are live — they expose the send/stop/permission
 * surface the panel routes to. `'pending'` providers are reserved seats
 * (Trae / WorkBuddy …) that carry a descriptor but no runtime yet; wiring one
 * up is: implement the same surface and register it here. The renderer only
 * ever talks to a stable list of `AgentProviderInfo`.
 */
export interface AgentHubProvider {
  id: string
  name: string
  /** `'external'` = live; `'pending'` = future connector seat. */
  kind: 'external' | 'pending'
  detail: string
  note?: string
  check(): Promise<boolean>
  send?: (text: string, opts?: AgentSendOptions) => Promise<string>
  stop?: () => void | Promise<void>
  respondPermission?: (requestId: string, allow: boolean) => void | Promise<void>
  /** Real model roster the panel's picker shows; omit when the software has none. */
  listModels?: () => Promise<AgentModelList>
}

export interface AgentSendOptions {
  cwd?: string
  reset?: boolean
  model?: string
  sessionKey?: string
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
}

/** Live Hermes connector built on top of the native desktop gateway. */
export class HermesHubProvider implements AgentHubProvider {
  readonly kind = 'external' as const
  readonly id = 'hermes'
  readonly name = 'Hermes'
  readonly detail = '本地自主 Agent · 多步执行 / 工具调用 / 权限确认'

  constructor(private svc: HermesGatewayService) {}

  async check(): Promise<boolean> {
    try {
      return (await this.svc.check()).available
    } catch {
      return false
    }
  }
  send = (text: string, opts?: AgentSendOptions) => this.svc.send(text, opts)
  listModels = () => this.svc.listModels()
  stop = () => this.svc.stop()
  respondPermission = (requestId: string, allow: boolean) => this.svc.respondPermission(requestId, allow)
}

/**
 * Generic OpenAI-compatible connector: makes the hub's switcher support any
 * local/remote /v1 endpoint (GLM, DeepSeek, Ollama, Qwen, …) as an actual,
 * switchable agent. The client is rebuilt on demand so availability tracks the
 * current AI config (a provider behind `off` / with no key shows unavailable).
 */
export class CompatibleHubProvider implements AgentHubProvider {
  readonly kind = 'external' as const
  readonly id: string
  readonly name: string
  readonly detail: string

  constructor(
    private getClient: () => OpenAiCompatClient | null,
    private push: (ev: HermesStreamEvent) => void,
    meta: { id?: string; name?: string; detail?: string } = {}
  ) {
    this.id = meta.id ?? 'compatible'
    this.name = meta.name ?? 'OpenAI 兼容'
    this.detail = meta.detail ?? '任意 OpenAI 兼容端点 · GLM / DeepSeek / Ollama 本地等'
  }

  async check(): Promise<boolean> {
    return !!this.getClient()
  }

  async send(text: string, opts?: AgentSendOptions): Promise<string> {
    const client = this.getClient()
    if (!client) throw new Error('未配置 OpenAI 兼容端点，请在 设置→AI 里填写')
    this.push({ type: 'status', status: '生成中…' })
    const messages = opts?.messages?.length
      ? opts.messages
      : [{ role: 'user' as const, content: text }]
    const out = (await client.chatRaw(messages)).trim()
    this.push({ type: 'done', finalText: out })
    return out || '（未返回文本）'
  }

  /** The configured endpoint serves exactly one model — surface it so the
   *  panel's model picker stays consistent across software. */
  listModels = async (): Promise<AgentModelList> => {
    const client = this.getClient()
    if (!client?.model) return { models: [], currentModelId: null }
    return { models: [{ id: client.model, name: client.model }], currentModelId: client.model }
  }
}

/** Registry + roster provider for the agent hub. */
export class AgentHub {
  private providers = new Map<string, AgentHubProvider>()

  register(p: AgentHubProvider): void {
    this.providers.set(p.id, p)
  }

  unregister(id: string): void {
    this.providers.delete(id)
  }

  get(id: string): AgentHubProvider | undefined {
    return this.providers.get(id)
  }

  has(id: string): boolean {
    return this.providers.has(id)
  }

  /** Roster the renderer's switcher consumes. Availability is re-checked each call. */
  async list(): Promise<AgentProviderInfo[]> {
    const out: AgentProviderInfo[] = []
    for (const p of this.providers.values()) {
      if (p.kind === 'pending') {
        out.push({ id: p.id, name: p.name, kind: 'pending', detail: p.detail, available: false, note: p.note ?? '待接入' })
        continue
      }
      let available = false
      let note = p.note
      try {
        available = await p.check()
      } catch {
        available = false
      }
      if (!available && !note) note = `未检测到 ${p.name} 运行时，或尚未配置`
      out.push({ id: p.id, name: p.name, kind: 'external', detail: p.detail, available, note })
    }
    return out
  }
}
