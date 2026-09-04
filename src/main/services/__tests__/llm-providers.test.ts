import { describe, it, expect } from 'vitest'
import {
  LLM_PROVIDERS,
  findProvider,
  matchProviderByBaseUrl
} from '../../../shared/llm-providers'

describe('llm-providers presets', () => {
  it('includes the roadmap OpenAI-compatible providers (GLM + Hermes)', () => {
    const ids = LLM_PROVIDERS.map((p) => p.id)
    expect(ids).toContain('glm')
    expect(ids).toContain('hermes')
    expect(ids).toContain('ollama')
    expect(ids).toContain('custom')
  })

  it('GLM preset points at the OpenAI-compatible BigModel v4 endpoint', () => {
    const glm = findProvider('glm')
    expect(glm?.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
    expect(glm?.requiresApiKey).toBe(true)
    expect(glm?.models.length).toBeGreaterThan(0)
  })

  it('Hermes preset points at the OpenAI-compatible OpenRouter endpoint', () => {
    const h = findProvider('hermes')
    expect(h?.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(h?.requiresApiKey).toBe(true)
    expect(h?.models.some((m) => /hermes-3/i.test(m))).toBe(true)
  })

  it('matches a saved Base URL back to its preset (trailing slash tolerant)', () => {
    expect(matchProviderByBaseUrl('https://open.bigmodel.cn/api/paas/v4/')?.id).toBe('glm')
    expect(matchProviderByBaseUrl('https://openrouter.ai/api/v1')?.id).toBe('hermes')
    expect(matchProviderByBaseUrl('http://localhost:11434/v1')?.id).toBe('ollama')
  })

  it('returns null for an unknown endpoint (UI defaults to custom)', () => {
    expect(matchProviderByBaseUrl('https://api.myproxy.example/v1')).toBeNull()
  })
})