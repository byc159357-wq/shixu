import { describe, it, expect } from 'vitest'
import { AgentHub, type AgentHubProvider } from '../agent-hub.service'

/** A fake live provider — lets us test the hub without a Hermes binary. */
function fakeExternal(overrides: { available?: boolean; throwing?: boolean } = {}): AgentHubProvider {
  return {
    id: 'fake',
    name: 'FakeAgent',
    kind: 'external',
    detail: '测试用外部 AI',
    check: async () => {
      if (overrides.throwing) throw new Error('boom')
      return overrides.available ?? true
    },
    send: async () => 'ok'
  }
}

const pending = (): AgentHubProvider => ({
  id: 'pending-x',
  name: 'PendingX',
  kind: 'pending',
  detail: '待接入',
  check: async () => false
})

describe('AgentHub', () => {
  it('lists registered providers in registration order with availability', async () => {
    const hub = new AgentHub()
    hub.register(fakeExternal({ available: true }))
    hub.register(pending())

    const list = await hub.list()
    expect(list.map((p) => p.id)).toEqual(['fake', 'pending-x'])
    expect(list[0]).toMatchObject({ id: 'fake', kind: 'external', available: true })
    expect(list[1]).toMatchObject({ id: 'pending-x', kind: 'pending', available: false, note: '待接入' })
  })

  it('reports an external provider with a failing check as unavailable with a note', async () => {
    const hub = new AgentHub()
    hub.register(fakeExternal({ available: false }))
    const [info] = await hub.list()
    expect(info.available).toBe(false)
    expect(info.note).toContain('FakeAgent')
  })

  it('treats a throwing check as unavailable, without crashing', async () => {
    const hub = new AgentHub()
    hub.register(fakeExternal({ throwing: true }))
    const [info] = await hub.list()
    expect(info.available).toBe(false)
    expect(info.note).toContain('FakeAgent')
  })

  it('get/has return the provider for routing by id', () => {
    const hub = new AgentHub()
    hub.register(fakeExternal())
    expect(hub.has('fake')).toBe(true)
    expect(hub.get('fake')?.id).toBe('fake')
    expect(hub.has('nope')).toBe(false)
  })
})