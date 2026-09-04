import type { AiIntent } from './ai.service'
import { parseIntent } from './ai.service'
import type { ProjectContextInput } from './ai-summary'
import { buildLocalSummary, buildPromptContext } from './ai-summary'
import { OpenAiCompatClient } from './ai-provider'

/**
 * Agent adapter layer.
 *
 * Every AI backend implements {@link AgentAdapter}: a capability contract that
 * the renderer-facing `AgentService` routes through. There are two concrete
 * kinds:
 *  - `RuleAgent` (kind `'rules'`) — the built-in local rules parser/summarizer.
 *    Always available, no network, no keys. Acts as the fallback when no LLM is
 *    configured or the configured one fails.
 *  - `LlmAgent` (kind `'llm'`) — wraps an OpenAI-compatible client so it speaks
 *    the same contract. Covers OpenAI, Ollama, Hermes, GLM etc. through the
 *    shared /v1 shape; the front-end never sees which backend handled a call.
 */
export interface AgentAdapter {
  /** `'rules'` = local; `'llm'` = an external model. */
  readonly kind: 'rules' | 'llm'
  /** Stable label, e.g. `rules` | `openai-compat` | `ollama`. */
  readonly id: string

  /** Parse one command into a structured intent; `null` when unrecognized.
   *  LLM adapters throw on request failure — the caller falls back to rules. */
  parseIntent(text: string): Promise<AiIntent | null>

  /** Summarize a project from structured facts into a short Chinese overview. */
  summarize(ctx: ProjectContextInput): Promise<string>

  /** Multi-turn chat. Only LLM adapters support it; callers must not invoke
   *  chat on a rules adapter. */
  chat(messages: Array<{ role: string; content: string }>, temperature?: number): Promise<string>
}

/** Built-in local implementation: rules parser + statistics summary. */
export class RuleAgent implements AgentAdapter {
  readonly kind = 'rules' as const
  readonly id = 'rules'

  async parseIntent(text: string): Promise<AiIntent | null> {
    return parseIntent(text).intent
  }

  async summarize(ctx: ProjectContextInput): Promise<string> {
    return buildLocalSummary(ctx)
  }

  chat(): Promise<string> {
    throw new Error('本地规则适配器不支持多轮对话')
  }
}

/** External-model implementation backed by an OpenAI-compatible client. */
export class LlmAgent implements AgentAdapter {
  readonly kind = 'llm' as const

  constructor(
    private client: OpenAiCompatClient,
    readonly id: string
  ) {}

  async parseIntent(text: string): Promise<AiIntent> {
    return this.client.parseIntent(text)
  }

  async summarize(ctx: ProjectContextInput): Promise<string> {
    return this.client.summarize(buildPromptContext(ctx))
  }

  async chat(messages: Array<{ role: string; content: string }>, temperature?: number): Promise<string> {
    return this.client.chatRaw(messages, temperature ?? 0.2)
  }
}