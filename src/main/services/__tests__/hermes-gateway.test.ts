import { describe, expect, it } from 'vitest'
import {
  extractGatewayText,
  normalizeGatewayEvent,
  parseDashboardToken,
  parseGatewayModels,
  pickGatewayPort
} from '../hermes-gateway.service'

describe('Hermes native gateway helpers', () => {
  it('extracts the loopback dashboard token without persisting it', () => {
    expect(parseDashboardToken('<script>window.__HERMES_SESSION_TOKEN__="a/b+c";</script>')).toBe('a/b+c')
    expect(parseDashboardToken('<html>missing</html>')).toBeNull()
  })

  it('selects the newest serve gateway from the spawn ledger', () => {
    expect(pickGatewayPort([
      { purpose: 'serve', port: 41000 },
      { purpose: 'worker', port: 42000 },
      { purpose: 'serve', port: 43000 }
    ])).toBe(43000)
  })

  it('flattens native model.options providers for the Workdeck picker', () => {
    expect(parseGatewayModels({
      provider: 'nous',
      model: 'hy3:free',
      providers: [
        { slug: 'nous', models: ['hy3:free', 'hermes-4'] },
        { slug: 'custom', models: [{ id: 'local', name: 'Local Fast' }] }
      ]
    })).toEqual({
      currentModelId: 'hy3:free',
      models: [
        { id: 'hy3:free', name: 'hy3:free' },
        { id: 'hermes-4', name: 'hermes-4' },
        { id: 'local', name: 'Local Fast' }
      ]
    })
  })

  it('filters unavailable models and replaces an unavailable current model', () => {
    expect(parseGatewayModels({
      provider: 'nous',
      model: 'hy3:free',
      providers: [
        {
          slug: 'nous',
          name: 'Nous Portal',
          models: ['hy3:free', 'longcat:free'],
          unavailable_models: ['hy3:free']
        },
        {
          slug: 'opencode-free',
          name: 'OpenCode Free',
          models: ['deepseek-free']
        }
      ]
    })).toEqual({
      currentModelId: 'longcat:free',
      models: [
        { id: 'longcat:free', name: 'Nous Portal · longcat:free' },
        { id: 'deepseek-free', name: 'OpenCode Free · deepseek-free' }
      ]
    })
  })

  it('accepts flat model payloads returned by newer gateways', () => {
    expect(parseGatewayModels({
      availableModels: [
        { id: 'gateway-fast', name: 'Gateway Fast' },
        'gateway-safe'
      ],
      currentModelId: 'gateway-fast'
    })).toEqual({
      currentModelId: 'gateway-fast',
      models: [
        { id: 'gateway-fast', name: 'Gateway Fast' },
        { id: 'gateway-safe', name: 'gateway-safe' }
      ]
    })
  })

  it('normalizes live, method-shaped, and replayed event frames', () => {
    expect(normalizeGatewayEvent({
      jsonrpc: '2.0',
      method: 'event',
      params: { type: 'message.delta', session_id: 'runtime-1', seq: 7, payload: { text: '你好' } }
    })).toEqual({
      type: 'message.delta',
      session_id: 'runtime-1',
      seq: 7,
      payload: { text: '你好' }
    })
    expect(normalizeGatewayEvent({
      method: 'message_completed',
      params: { sessionId: 'runtime-1', data: { rendered: '完成' } }
    })).toEqual({
      type: 'message.complete',
      session_id: 'runtime-1',
      payload: { rendered: '完成' }
    })
    expect(normalizeGatewayEvent({ type: 'message.delta', sessionId: 'runtime-2', text: '兼容' })).toEqual({
      type: 'message.delta',
      session_id: 'runtime-2',
      payload: { type: 'message.delta', sessionId: 'runtime-2', text: '兼容' }
    })
  })

  it('extracts text from nested Gateway content and history messages', () => {
    expect(extractGatewayText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('ab')
    expect(extractGatewayText({ response: { rendered: '已完成' } })).toBe('已完成')
  })
})
