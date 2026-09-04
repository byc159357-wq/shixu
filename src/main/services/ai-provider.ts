import type { AiIntent } from './ai.service'

/**
 * OpenAI-compatible chat client for Workdeck AI (also covers local Ollama via
 * its /v1 endpoint). Pure fetch-based, injectable for tests. The prompt asks
 * the model to answer with strict JSON, which we parse defensively.
 */
export interface LlmConfig {
  baseUrl: string // e.g. https://api.openai.com/v1 or http://localhost:11434/v1
  apiKey: string | null // null for local Ollama
  model: string
}

const SYSTEM_PROMPT = `你是拾序（Windows 本地优先个人工作台）的 AI 助手。把用户的中文指令解析为结构化动作 JSON。

可用动作（只输出其中一个）：
- create_task: 创建任务/待办（params: title 任务标题, date 可选截止日期）
- create_event: 新建事件/日程/会议（params: title, date 可选）
- create_note: 新建笔记（params: title）
- move_file: 把文件归入项目（params: fileName, projectName）
- summarize: 总结项目或当前上下文（params: target 可选项目名）
- search: 本地搜索（params: query 搜索词）
- open_scenario: 用一句话开启一个已保存的工作场景，一键打开整套软件/文件（params: scenario 场景名，如“海报设计”）

日期规则：今天/今天=今天，明天=明天，后天=后天，周X=本周内最近的那个 X（周一为起始，若今天就是周X则顺延到下周），YYYY-MM-DD 原样输出。日期一律输出 YYYY-MM-DD 格式。

要求：只输出一个 JSON 对象，不要任何解释文字或 Markdown 代码块。格式：
{"action":"create_task","params":{"title":"...","date":"2026-08-17"},"confidence":0.95,"explanation":"创建任务「...」截止 2026-08-17"}`

export interface LlmJsonResponse {
  action: AiIntent['action']
  params: Record<string, string | null>
  confidence: number
  explanation: string
}

/** Strip code fences / surrounding text and parse the first JSON object. */
export function extractJson(text: string): LlmJsonResponse | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Partial<LlmJsonResponse>
    if (typeof obj.action !== 'string' || !obj.action) return null
    return {
      action: obj.action as AiIntent['action'],
      params: typeof obj.params === 'object' && obj.params !== null ? obj.params : {},
      confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
      explanation: typeof obj.explanation === 'string' ? obj.explanation : ''
    }
  } catch {
    return null
  }
}

export class OpenAiCompatClient {
  constructor(
    private cfg: LlmConfig,
    private fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch
  ) {}

  /** Configured model id — surfaced so the agent hub can list it. */
  get model(): string {
    return this.cfg.model
  }

  /** Raw chat completion for arbitrary message sequences (multi-turn). */
  async chatRaw(messages: Array<{ role: string; content: string }>, temperature = 0.2): Promise<string> {
    return this.chat(messages, temperature)
  }

  private async chat(messages: Array<{ role: string; content: string }>, temperature = 0.2): Promise<string> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.cfg.apiKey) headers['Authorization'] = `Bearer ${this.cfg.apiKey}`
    const res = await this.fetcher(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        temperature,
        max_tokens: 300
      })
    })
    if (!res.ok) {
      // Try to parse provider's error message (OpenAI-compatible shape: { error: { message } })
      let body = ''
      try {
        body = typeof res.text === 'function' ? await res.text() : ''
      } catch {
        body = ''
      }
      let detail = ''
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } }
        detail = parsed?.error?.message ?? parsed?.error?.code ?? ''
      } catch {
        // body wasn't JSON — fall back to raw text (truncated)
        detail = body.slice(0, 140)
      }
      const hint = this.cfg.apiKey ? '' : '（未填 API Key）'
      throw new Error(
        `LLM 请求失败（HTTP ${res.status}）${hint}${detail ? '：' + detail : ''}`
      )
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('LLM 返回为空')
    return content
  }

  /** Parse a natural-language command into a structured intent. */
  async parseIntent(text: string): Promise<AiIntent> {
    const content = await this.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text }
    ])
    const parsed = extractJson(content)
    if (!parsed) throw new Error('LLM 返回无法解析：' + content.slice(0, 80))
    const validActions: AiIntent['action'][] = [
      'create_task',
      'create_event',
      'create_note',
      'move_file',
      'summarize',
      'search',
      'open_scenario'
    ]
    const action = validActions.includes(parsed.action) ? parsed.action : 'search'
    return {
      action,
      params: parsed.params,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      explanation: parsed.explanation || `执行动作 ${action}`
    }
  }

  /** Summarize a project from a structured context blob. */
  async summarize(context: string): Promise<string> {
    return this.chat(
      [
        {
          role: 'system',
          content:
            '你是拾序的助手。根据给定的事实数据，用中文生成一段简洁的项目概览（3-6 句话），突出进行中的工作、逾期风险和下一步建议。不要编造数据。'
        },
        { role: 'user', content: context }
      ],
      0.3
    )
  }
}
