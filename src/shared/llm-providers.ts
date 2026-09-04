/**
 * Preset LLM providers — all openai-compatible chat completion endpoints.
 * Selecting a provider auto-fills the Base URL and surfaces its common models.
 * Use `custom` for any other openai-compatible endpoint (newapi / openrouter / local proxy).
 */
export interface LlmProvider {
  /** Stable id persisted in settings. */
  id: string
  label: string
  /** Default base URL — auto-fills the input; user can still edit. */
  baseUrl: string
  /** Latest popular models for this provider (May 2026 snapshot). */
  models: string[]
  /** Whether this provider requires an API key in production. */
  requiresApiKey: boolean
  /** Short help text/comments. */
  note?: string
}

export const LLM_PROVIDERS: LlmProvider[] = [
  {
    id: 'glm',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'GLM-4.7-Flash',
      'GLM-4.6',
      'GLM-4.5',
      'GLM-4.5-Air',
      'GLM-4.5-Flash',
      'GLM-4-Plus',
      'GLM-4-Flash',
      'GLM-4-Air',
      'GLM-Z1-Flash'
    ],
    requiresApiKey: true,
    note: '智谱开放平台，响应稳定，国内访问快'
  },
  {
    id: 'hermes',
    label: 'Hermes（OpenRouter）',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'nousresearch/hermes-3-llama-3.1-405b',
      'nousresearch/hermes-3-llama-3.1-70b',
      'nousresearch/hermes-3-llama-3.1-8b'
    ],
    requiresApiKey: true,
    note: 'Nous Research Hermes 3，经 OpenRouter 路由，需含 OpenRouter 的 API Key'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'],
    requiresApiKey: true,
    note: '推理版 deepseek-reasoner 适合复杂任务'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
    requiresApiKey: true,
    note: '海外访问，需要合规网络'
  },
  {
    id: 'moonshot',
    label: 'Moonshot（Kimi）',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'moonshot-v1-auto'],
    requiresApiKey: true,
    note: '长上下文（128k）擅长整本笔记总结'
  },
  {
    id: 'qwen',
    label: '通义千问（Qwen）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-coder-plus', 'qwen-vl-max'],
    requiresApiKey: true,
    note: '阿里云 DashScope，OpenAI 兼容入口'
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow（硅基流动）',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'THUDM/glm-4-9b-chat'],
    requiresApiKey: true,
    note: '聚合多家开源模型，速度稳定'
  },
  {
    id: 'ollama',
    label: '本地 Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'qwen2.5', 'mistral-nemo', 'gemma2', 'deepseek-r1', 'llava', 'qwen2.5-coder'],
    requiresApiKey: false,
    note: '本地推理，无需 API Key；需先 ollama pull 模型'
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
    note: '任何 OpenAI 格式端点（newapi / openrouter / 自建 proxy…）'
  }
]

export function findProvider(id: string | null | undefined): LlmProvider | null {
  if (!id) return null
  return LLM_PROVIDERS.find((p) => p.id === id) ?? null
}

/** Match provider by the saved Base URL — useful when restoring settings. */
export function matchProviderByBaseUrl(baseUrl: string): LlmProvider | null {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  if (!normalized) return null
  return (
    LLM_PROVIDERS.find(
      (p) => p.baseUrl && p.baseUrl.replace(/\/+$/, '').toLowerCase() === normalized
    ) ?? null
  )
}