import { describe, it, expect } from 'vitest'
import { parseModelState, parseSessionUpdate } from '../hermes-acp.service'

/** Hermes ACP 序列化用 camelCase alias（by_alias=True），旧版本是 snake_case，
 *  两种形态都必须能解析，否则模型下拉会变成"请选择"。 */
describe('parseModelState (model roster parsing)', () => {
  it('parses the camelCase shape ACP actually serializes', () => {
    const state = {
      availableModels: [
        { modelId: 'nous:meituan/longcat-2.0:free', name: 'Nous · longcat-2.0:free' },
        { modelId: 'nous:meituan/longcat-2.0:ultra', name: 'Nous · longcat-2.0:ultra' }
      ],
      currentModelId: 'nous:meituan/longcat-2.0:free'
    }
    const r = parseModelState(state)
    expect(r.models).toHaveLength(2)
    expect(r.models[0]).toMatchObject({ id: 'nous:meituan/longcat-2.0:free', name: 'Nous · longcat-2.0:free' })
    expect(r.currentModelId).toBe('nous:meituan/longcat-2.0:free')
  })

  it('parses the legacy snake_case shape', () => {
    const state = {
      available_models: [{ model_id: 'a:b', name: 'A B', description: 'Provider: A' }],
      current_model_id: 'a:b'
    }
    const r = parseModelState(state)
    expect(r.models).toEqual([{ id: 'a:b', name: 'A B', description: 'Provider: A' }])
    expect(r.currentModelId).toBe('a:b')
  })

  it('tolerates string model entries and missing fields', () => {
    const r = parseModelState({ availableModels: ['raw-id'] })
    expect(r.models).toEqual([{ id: 'raw-id', name: 'raw-id', description: undefined }])
    expect(r.currentModelId).toBeNull()
  })

  it('returns empty roster for null / malformed payloads', () => {
    expect(parseModelState(null)).toEqual({ models: [], currentModelId: null })
    expect(parseModelState({ availableModels: 'nope' })).toEqual({ models: [], currentModelId: null })
    expect(parseModelState({ availableModels: [{ nope: true }] })).toEqual({ models: [], currentModelId: null })
  })
})

describe('parseSessionUpdate', () => {
  it('extracts streamed assistant text from the current ACP camelCase shape', () => {
    expect(parseSessionUpdate({
      method: 'session/update',
      params: {
        sessionId: 's1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: '正常' }
        }
      }
    })).toEqual({ sessionId: 's1', event: { type: 'text', text: '正常' } })
  })

  it('ignores user/history text and unknown notifications', () => {
    expect(parseSessionUpdate({
      method: 'session/update',
      params: { update: { sessionUpdate: 'user_message_chunk', content: { text: '你好' } } }
    }).event).toBeNull()
  })
})
