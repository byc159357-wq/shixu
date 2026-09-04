import type { AiIntent } from './ai.service'
import type { ProjectContextInput } from './ai-summary'
import type { AgentAdapter } from './agent-adapter'
import { RuleAgent } from './agent-adapter'
import { LLM_REQUIRED_HINT } from './ai-chat'

export type AgentSource = 'llm' | 'rules'

export interface AgentParseResult {
  intent: AiIntent | null
  source: AgentSource
}

export interface AgentTextResult {
  text: string
  source: AgentSource
}

/**
 * Facade over the agent adapters. It owns the rules fallback and routes each
 * call to a configured LLM adapter first, degrading to local rules when the
 * model is unavailable (off, unconfigured, or a request failure). The renderer
 * keeps calling the same named endpoints and simply reads `source` to know
 * which backend answered.
 */
export class AgentService {
  private rules = new RuleAgent()

  constructor(private getLlm: () => AgentAdapter | null) {}

  async parseIntent(text: string): Promise<AgentParseResult> {
    const llm = this.safeLlm()
    if (llm) {
      try {
        const intent = await llm.parseIntent(text)
        if (intent) return { intent, source: 'llm' }
      } catch (err) {
        console.error('[agent] LLM parse failed, falling back to rules:', String(err))
      }
    }
    return { intent: await this.rules.parseIntent(text), source: 'rules' }
  }

  async summarize(ctx: ProjectContextInput): Promise<AgentTextResult> {
    const llm = this.safeLlm()
    if (llm) {
      try {
        return { text: await llm.summarize(ctx), source: 'llm' }
      } catch (err) {
        console.error('[agent] LLM summarize failed, falling back:', String(err))
      }
    }
    return { text: await this.rules.summarize(ctx), source: 'rules' }
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    temperature = 0.5
  ): Promise<AgentTextResult> {
    const llm = this.safeLlm()
    if (!llm) return { text: LLM_REQUIRED_HINT, source: 'rules' }
    try {
      return { text: await llm.chat(messages, temperature), source: 'llm' }
    } catch (err) {
      console.error('[agent] chat failed:', String(err))
      return {
        text: `对话请求失败：${String(err)}（请检查 设置 → AI 智能解析 的连接配置）`,
        source: 'rules'
      }
    }
  }

  private safeLlm(): AgentAdapter | null {
    try {
      return this.getLlm()
    } catch {
      return null
    }
  }
}