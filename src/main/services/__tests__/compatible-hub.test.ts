import { describe, it, expect, vi } from 'vitest'
import type { HermesStreamEvent } from '../../../shared/types'
import { CompatibleHubProvider } from '../agent-hub.service'
import { OpenAiCompatClient } from '../ai-provider'

function fakeClient(reply = '  hi  '): OpenAiCompatClient {
  const client = new Proxy({} as any, {
    get: (_, prop) => {
      if (prop === 'chatRaw') return vi.fn(async () => reply)
      return undefined
    }
  })
  return client as OpenAiCompatClient
}

describe('CompatibleHubProvider', () => {
  it('is external and available only when a client is configured', async () => {
    const p = new CompatibleHubProvider(() => null, () => {})
    expect(p.kind).toBe('external')
    expect(p.id).toBe('compatible')
    expect(await p.check()).toBe(false)

    const p2 = new CompatibleHubProvider(() => fakeClient(), () => {})
    expect(await p2.check()).toBe(true)
  })

  it('send streams status + done and returns the trimmed answer', async () => {
    const evs: HermesStreamEvent[] = []
    const p = new CompatibleHubProvider(() => fakeClient('  好的  '), (ev) => evs.push(ev))
    const out = await p.send('写一段话')

    expect(out).toBe('好的')
    expect(evs.some((e) => e.type === 'status')).toBe(true)
    expect(evs.some((e) => e.type === 'done' && (e as any).finalText === '好的')).toBe(true)
  })

  it('forwards visible multi-turn history to stateless compatible providers', async () => {
    const chatRaw = vi.fn(async () => '继续回答')
    const client = { chatRaw } as unknown as OpenAiCompatClient
    const p = new CompatibleHubProvider(() => client, () => {})
    const messages = [
      { role: 'user' as const, content: '项目叫 ATELIER' },
      { role: 'assistant' as const, content: '知道了' },
      { role: 'user' as const, content: '它叫什么？' }
    ]

    await p.send('它叫什么？', { sessionKey: 'session-a', messages })

    expect(chatRaw).toHaveBeenCalledWith(messages)
  })

  it('throws a helpful error when no endpoint is configured', async () => {
    const p = new CompatibleHubProvider(() => null, () => {})
    await expect(p.send('hi')).rejects.toThrow(/设置→AI/)
  })
})
