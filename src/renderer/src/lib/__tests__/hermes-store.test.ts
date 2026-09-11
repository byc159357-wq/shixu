import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
const modelList = vi.fn()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) }
})
vi.stubGlobal('window', {
  workdeck: { agent: { modelList } }
})

let hermes: typeof import('../../components/hermes/HermesStore')

beforeAll(async () => {
  hermes = await import('../../components/hermes/HermesStore')
})

beforeEach(() => {
  storage.clear()
  modelList.mockReset()
  hermes.useHermesStore.setState({
    activeId: null,
    history: [],
    sessions: [],
    conversation: [],
    model: { provider: 'hermes', models: [], selectedId: '', status: 'idle', error: null },
    busyRunId: null
  })
})

describe('HermesStore', () => {
  it('classifies project work and keeps message text from streamed steps', () => {
    expect(hermes.inferSessionKind('检查 src/App.tsx 的路由')).toBe('project')
    expect(hermes.inferSessionKind('你好')).toBe('chat')
    expect(hermes.messageContent({
      id: 'reply',
      role: 'agent',
      ts: 1,
      steps: [
        { id: 'a', tag: 'tool', text: '读取项目' },
        { id: 'b', tag: 'text', text: '第一段' },
        { id: 'c', tag: 'text', text: '第二段' }
      ]
    })).toBe('第一段\n第二段')
  })

  it('loads models and selects the saved model before Gateway current model', async () => {
    storage.set(hermes.HERMES_MODEL_KEY, 'saved-model')
    modelList.mockResolvedValue({
      currentModelId: 'gateway-model',
      models: [
        { id: 'gateway-model', name: 'Gateway' },
        { id: 'saved-model', name: 'Saved' }
      ]
    })

    await hermes.useHermesStore.getState().refreshModels('hermes')

    const state = hermes.useHermesStore.getState()
    expect(state.model.status).toBe('success')
    expect(state.model.selectedId).toBe('saved-model')
    expect(state.model.models).toHaveLength(2)
    expect(modelList).toHaveBeenCalledWith({ provider: 'hermes' })
  })

  it('exposes empty and error model states for the shared UI', async () => {
    modelList.mockResolvedValueOnce({ models: [] })
    await hermes.useHermesStore.getState().refreshModels('hermes')
    expect(hermes.useHermesStore.getState().model.status).toBe('empty')

    modelList.mockRejectedValueOnce(new Error('gateway unavailable'))
    await hermes.useHermesStore.getState().refreshModels('hermes')
    const state = hermes.useHermesStore.getState()
    expect(state.model.status).toBe('error')
    expect(state.model.error).toContain('gateway unavailable')
  })

  it('persists one history source and keeps the active conversation shared', () => {
    hermes.useHermesStore.getState().updateHistory(() => [{
      id: 'session-1',
      title: '共享任务',
      kind: 'project',
      ts: 1,
      msgs: [{ id: 'message-1', role: 'user', text: '继续', ts: 1, steps: [] }]
    }])
    hermes.useHermesStore.getState().setActiveSession('session-1')

    const state = hermes.useHermesStore.getState()
    expect(state.activeId).toBe('session-1')
    expect(state.conversation[0]?.text).toBe('继续')
    expect(JSON.parse(storage.get(hermes.HERMES_SESSION_KEY) ?? '[]')[0].id).toBe('session-1')
  })
})
