import { create } from 'zustand'
import type {
  AgentModelInfo,
  AgentModelList,
  AgentModelLoadStatus,
  HermesStreamEvent,
  Project,
  Task,
  WorkspaceRecentFile
} from '../../../../shared/types'
import { useAppStore } from '../../store'

export type HermesStepTag = 'tool' | 'text' | 'error' | 'permission'

export interface HermesStep {
  id: string
  tag: HermesStepTag
  text: string
  requestId?: string
}

export interface HermesMessage {
  id: string
  role: 'user' | 'agent'
  text?: string
  status?: string
  steps?: HermesStep[]
  ts: number
}

export type HermesSessionKind = 'project' | 'chat'

export interface HermesSession {
  id: string
  title: string
  kind?: HermesSessionKind
  pinned?: boolean
  preview?: string
  msgs: HermesMessage[]
  ts: number
}

export interface HermesPromptInput {
  text: string
  provider?: string
  model?: string
  sessionId?: string | null
  sessionKind?: HermesSessionKind
}

export interface HermesPromptResult {
  sessionId: string
  runId: string
  finalText: string
}

export interface HermesContextSnapshot {
  currentProject: Project | null
  currentPage: string
  currentMode: string
  recentFiles: WorkspaceRecentFile[]
  focusTask: Task | null
  fileCount: number
}

export interface HermesModelState {
  provider: string
  models: AgentModelInfo[]
  selectedId: string
  status: AgentModelLoadStatus
  error: string | null
}

export interface HermesStoreState {
  history: HermesSession[]
  /** Compatibility alias while older consumers migrate to `history`. */
  sessions: HermesSession[]
  activeId: string | null
  conversation: HermesMessage[]
  currentProject: Project | null
  currentPage: string
  context: HermesContextSnapshot
  model: HermesModelState
  busyRunId: string | null
  setActiveSession: (id: string | null) => void
  setActiveId: (id: string | null) => void
  setBusyRunId: (id: string | null) => void
  setContext: (context: Partial<HermesContextSnapshot>) => void
  updateHistory: (updater: (history: HermesSession[]) => HermesSession[]) => void
  updateSessions: (updater: (sessions: HermesSession[]) => HermesSession[]) => void
  refreshModels: (provider?: string) => Promise<void>
  loadHermesModels: (provider?: string) => Promise<void>
  setModel: (modelId: string) => void
  setHermesModel: (modelId: string) => void
  sendPrompt: (input: HermesPromptInput) => Promise<HermesPromptResult>
  stopPrompt: () => Promise<void>
}

export const HERMES_SESSION_KEY = 'wd_agent_sessions_v1'
export const LEGACY_HERMES_SESSION_KEY = 'workdeck-ai-sessions-v1'
export const HERMES_MODEL_KEY = 'wd_agent_model'
export const HERMES_PROVIDER_KEY = 'wd_agent_tool'

let sequence = 0
let modelRequest = 0

function nextId(prefix: string) {
  sequence += 1
  return `${prefix}${Date.now().toString(36)}_${sequence}`
}

function safeStorageGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeStorageSet(key: string, value: string) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Keep the in-memory state when browser storage is unavailable. */
  }
}

export function inferSessionKind(text: string): HermesSessionKind {
  const value = text.trim().toLowerCase()
  if (!value) return 'chat'
  const looksLikePath = /(?:[a-z]:\\|\/(?:src|app|packages?|components?|public|tests?)\/|\.(?:tsx?|jsx?|vue|py|java|go|rs|json|ya?ml|md)\b)/i.test(value)
  const projectIntent = /项目|代码|仓库|文件|目录|组件|页面|界面|ui|ux|前端|后端|接口|数据库|脚本|测试|构建|部署|重构|修复|优化|实现|开发|设计稿|git|github|commit|pull request|package\.json/i.test(value)
  return looksLikePath || projectIntent ? 'project' : 'chat'
}

function loadHistory(): HermesSession[] {
  const raw = safeStorageGet(HERMES_SESSION_KEY)
  let history: HermesSession[] = []
  try {
    const parsed = raw ? JSON.parse(raw) as HermesSession[] : []
    if (Array.isArray(parsed)) {
      history = parsed
      .filter((session) => session && typeof session.id === 'string' && Array.isArray(session.msgs))
      .map((session) => ({
        ...session,
        kind: session.kind ?? inferSessionKind(session.title),
        msgs: session.msgs.map((message) => ({
          ...message,
          steps: Array.isArray(message.steps) ? message.steps : []
        }))
      }))
    }
  } catch {
    history = []
  }

  // The pre-v0.8 messages page kept lightweight metadata under this key.
  // Merge it on first store construction so opening Floating Hermes is enough
  // to migrate existing work; the old key remains untouched for rollback safety.
  const legacyRaw = safeStorageGet(LEGACY_HERMES_SESSION_KEY)
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw) as Array<{ id?: string; title?: string; preview?: string; updatedAt?: number }>
      const existing = new Set(history.map((session) => session.id))
      if (Array.isArray(parsed)) {
        const legacy = parsed.flatMap((item) => {
          if (!item?.id || existing.has(item.id)) return []
          existing.add(item.id)
          return [{
            id: item.id,
            title: item.title || '历史任务',
            kind: 'chat' as const,
            preview: item.preview || '',
            ts: item.updatedAt || Date.now(),
            msgs: []
          }]
        })
        if (legacy.length) {
          history = [...history, ...legacy]
          persistHistory(history)
        }
      }
    } catch {
      /* Keep the current Hermes history when legacy data is malformed. */
    }
  }
  return history.sort((a, b) => b.ts - a.ts)
}

function persistHistory(history: HermesSession[]) {
  safeStorageSet(HERMES_SESSION_KEY, JSON.stringify(history))
}

function normalizeAgentModels(roster: AgentModelList | null | undefined): AgentModelInfo[] {
  if (!Array.isArray(roster?.models)) return []
  const seen = new Set<string>()
  return roster.models.flatMap((model) => {
    const id = String(model?.id ?? '').trim()
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{ id, name: String(model.name || id), description: model.description }]
  })
}

const initialHistory = loadHistory()
const initialActiveId = initialHistory[0]?.id ?? null

const defaultContext: HermesContextSnapshot = {
  currentProject: null,
  currentPage: 'Today',
  currentMode: '自由工作',
  recentFiles: [],
  focusTask: null,
  fileCount: 0
}

const initialModel: HermesModelState = {
  provider: safeStorageGet(HERMES_PROVIDER_KEY) || 'hermes',
  models: [],
  selectedId: safeStorageGet(HERMES_MODEL_KEY) || '',
  status: 'idle',
  error: null
}

function syncSessionState(history: HermesSession[], activeId: string | null) {
  const active = history.find((session) => session.id === activeId)
  return {
    history,
    sessions: history,
    conversation: active?.msgs ?? []
  }
}

export const useHermesStore = create<HermesStoreState>((set, get) => ({
  ...syncSessionState(initialHistory, initialActiveId),
  activeId: initialActiveId,
  currentProject: null,
  currentPage: defaultContext.currentPage,
  context: defaultContext,
  model: initialModel,
  busyRunId: null,
  setActiveSession: (activeId) => set((state) => ({
    activeId,
    ...syncSessionState(state.history, activeId)
  })),
  setActiveId: (activeId) => get().setActiveSession(activeId),
  setBusyRunId: (busyRunId) => set({ busyRunId }),
  setContext: (patch) => set((state) => {
    const context = { ...state.context, ...patch }
    return {
      context,
      currentProject: context.currentProject,
      currentPage: context.currentPage
    }
  }),
  updateHistory: (updater) => set((state) => {
    const history = updater(state.history)
    persistHistory(history)
    return syncSessionState(history, state.activeId)
  }),
  updateSessions: (updater) => get().updateHistory(updater),
  refreshModels: async (provider) => {
    const selectedProvider = provider?.trim() || get().model.provider || safeStorageGet(HERMES_PROVIDER_KEY) || 'hermes'
    const request = ++modelRequest
    set((state) => ({
      model: { ...state.model, provider: selectedProvider, status: 'loading', error: null }
    }))
    safeStorageSet(HERMES_PROVIDER_KEY, selectedProvider)
    try {
      const roster = await window.workdeck.agent.modelList({ provider: selectedProvider })
      if (request !== modelRequest) return
      const models = normalizeAgentModels(roster)
      const saved = safeStorageGet(HERMES_MODEL_KEY) || ''
      const current = typeof roster?.currentModelId === 'string' ? roster.currentModelId.trim() : ''
      const selected = models.find((model) => model.id === saved)?.id
        ?? models.find((model) => model.id === current)?.id
        ?? models[0]?.id
        ?? ''
      if (selected) safeStorageSet(HERMES_MODEL_KEY, selected)
      set((state) => ({
        model: {
          ...state.model,
          provider: selectedProvider,
          models,
          selectedId: selected,
          status: models.length ? 'success' : 'empty',
          error: null
        }
      }))
    } catch (error) {
      if (request !== modelRequest) return
      const raw = String((error as Error)?.message ?? error)
      const message = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim()
      set((state) => ({
        model: { ...state.model, provider: selectedProvider, models: [], status: 'error', error: message || '模型服务不可用' }
      }))
    }
  },
  loadHermesModels: async (provider) => get().refreshModels(provider),
  setModel: (modelId) => {
    const id = modelId.trim()
    if (!id || !get().model.models.some((model) => model.id === id)) return
    safeStorageSet(HERMES_MODEL_KEY, id)
    set((state) => ({ model: { ...state.model, selectedId: id } }))
  },
  setHermesModel: (modelId) => get().setModel(modelId),
  sendPrompt: async (input) => runHermesPrompt(input),
  stopPrompt: async () => stopHermesPrompt()
}))

export function messageContent(message: HermesMessage): string {
  return (
    message.steps?.filter((step) => step.tag === 'text').map((step) => step.text).join('\n').trim() ||
    (message.text === '（Hermes 未返回文本）' ? '' : message.text?.trim()) ||
    ''
  )
}

function sessionTitle(first: string): string {
  const text = first.trim()
  return text.length > 22 ? `${text.slice(0, 22)}…` : text
}

function appendStep(runId: string, step: HermesStep) {
  useHermesStore.getState().updateHistory((history) => history.map((session) => ({
    ...session,
    msgs: session.msgs.map((message) => message.id === runId
      ? { ...message, steps: [...(message.steps ?? []), step] }
      : message)
  })))
}

function updateRun(runId: string, updater: (message: HermesMessage) => HermesMessage) {
  useHermesStore.getState().updateHistory((history) => history.map((session) => ({
    ...session,
    msgs: session.msgs.map((message) => message.id === runId ? updater(message) : message)
  })))
}

interface ActiveRun {
  runId: string
  stopped: boolean
  unsubscribe: (() => void) | undefined
}

let activeRun: ActiveRun | null = null

function cleanAgentError(error: unknown): string {
  return String(error).replace(
    /^Error(?: invoking remote method '[^']+')?:\s*(?:Error:\s*)?/i,
    ''
  ).trim()
}

async function workspaceContextMessage(): Promise<string> {
  const state = useHermesStore.getState()
  const appContext = useAppStore.getState().workspaceContext
  const context = state.context
  const projectId = context.currentProject?.id ?? appContext?.currentProject?.id
  let memory: { preferences?: string[]; decisions?: string[]; aiNotes?: string[] } | null = null
  if (projectId) {
    try {
      memory = await window.workdeck.memory.get(projectId)
    } catch {
      /* Context is still useful when a project has no memory record yet. */
    }
  }
  const lines = [
    `当前项目：${context.currentProject?.name ?? appContext?.currentProject?.name ?? '未选择项目'}`,
    `当前页面：${context.currentPage}`,
    `当前工作模式：${context.currentMode}`,
    `当前关注任务：${context.focusTask?.title ?? appContext?.focusTask?.title ?? '暂无'}`,
    `最近文件：${context.recentFiles.slice(0, 8).map((file) => file.name).join('、') || '暂无'}`,
    `项目偏好：${memory?.preferences?.slice(0, 5).join('；') || '暂无'}`,
    `历史决策：${memory?.decisions?.slice(0, 5).join('；') || '暂无'}`,
    `项目记忆：${memory?.aiNotes?.slice(0, 5).join('；') || '暂无'}`
  ]
  return `[Shixu Workspace Context]\n${lines.join('\n')}`
}

export async function runHermesPrompt(input: HermesPromptInput): Promise<HermesPromptResult> {
  const text = input.text.trim()
  if (!text) throw new Error('请输入任务')
  if (useHermesStore.getState().busyRunId) throw new Error('Hermes 正在处理上一项任务')

  const state = useHermesStore.getState()
  const hasActive = !!input.sessionId && state.history.some((session) => session.id === input.sessionId)
  const sessionId = hasActive ? input.sessionId! : nextId('s')
  const runId = nextId('m')
  const previous = state.history.find((session) => session.id === sessionId)?.msgs ?? []
  const messages = previous
    .map((message) => ({
      role: message.role === 'agent' ? 'assistant' as const : 'user' as const,
      content: messageContent(message)
    }))
    .filter((message) => message.content)
  const contextMessage = await workspaceContextMessage()
  if (contextMessage) messages.unshift({ role: 'assistant', content: contextMessage })
  messages.push({ role: 'user', content: text })

  const userMessage: HermesMessage = { id: nextId('m'), role: 'user', text, ts: Date.now() }
  const assistantMessage: HermesMessage = {
    id: runId,
    role: 'agent',
    status: '思考中…',
    steps: [],
    ts: Date.now()
  }
  state.updateHistory((history) => {
    const existing = history.find((session) => session.id === sessionId)
    if (existing) {
      return history.map((session) => session.id === sessionId
        ? {
            ...session,
            title: session.msgs.length ? session.title : sessionTitle(text),
            preview: text,
            ts: Date.now(),
            msgs: [...session.msgs, userMessage, assistantMessage]
          }
        : session)
    }
    return [
      {
        id: sessionId,
        title: sessionTitle(text),
        kind: input.sessionKind ?? inferSessionKind(text),
        preview: text,
        msgs: [userMessage, assistantMessage],
        ts: Date.now()
      },
      ...history
    ]
  })
  useHermesStore.getState().setActiveSession(sessionId)
  useHermesStore.getState().setBusyRunId(runId)

  let streamedText = ''
  let completed = false
  const agent = window.workdeck?.agent
  if (!agent) {
    useHermesStore.getState().setBusyRunId(null)
    throw new Error('未检测到 Hermes，请确认本地 Agent 已安装并启动')
  }

  const unsubscribe = agent.onEvent?.((event: HermesStreamEvent) => {
    if (!activeRun || activeRun.runId !== runId || activeRun.stopped) return
    switch (event.type) {
      case 'status':
        updateRun(runId, (message) => ({ ...message, status: event.status }))
        break
      case 'tool_call':
        appendStep(runId, { id: nextId('step'), tag: 'tool', text: `正在调用 ${event.name}…` })
        break
      case 'tool_result':
        appendStep(runId, { id: nextId('step'), tag: 'tool', text: `完成 ${event.name}` })
        break
      case 'permission':
        appendStep(runId, { id: nextId('step'), tag: 'permission', text: event.message, requestId: event.requestId })
        break
      case 'text':
        if (event.text) {
          streamedText += event.text
          updateRun(runId, (message) => {
            const steps = [...(message.steps ?? [])]
            const last = steps[steps.length - 1]
            if (last?.tag === 'text') steps[steps.length - 1] = { ...last, text: last.text + event.text }
            else steps.push({ id: nextId('step'), tag: 'text', text: event.text })
            return { ...message, steps, status: '生成中…' }
          })
        }
        break
      case 'error':
        updateRun(runId, (message) => ({
          ...message,
          status: '出错了',
          steps: [...(message.steps ?? []), { id: nextId('step'), tag: 'error', text: event.message }]
        }))
        break
      case 'done':
        completed = true
        if (event.finalText?.trim() && !streamedText.trim()) {
          streamedText = event.finalText.trim()
          appendStep(runId, { id: nextId('step'), tag: 'text', text: streamedText })
        }
        updateRun(runId, (message) => ({ ...message, status: '完成' }))
        break
      default:
        break
    }
  })
  activeRun = { runId, stopped: false, unsubscribe }
  const runState = activeRun
  const provider = input.provider ?? state.model.provider ?? safeStorageGet(HERMES_PROVIDER_KEY) ?? 'hermes'
  const model = (input.model ?? state.model.selectedId) || undefined

  try {
    const finalText = await agent.send(text, {
      provider,
      model,
      sessionKey: sessionId,
      messages
    })
    if (runState.stopped) return { sessionId, runId, finalText: streamedText }
    if (!streamedText.trim() && finalText?.trim()) {
      streamedText = finalText.trim()
      appendStep(runId, { id: nextId('step'), tag: 'text', text: streamedText })
    }
    updateRun(runId, (message) => ({
      ...message,
      status: completed || streamedText.trim() ? '完成' : '未收到回复',
      text: streamedText.trim() ? undefined : (finalText?.trim() || undefined)
    }))
    return { sessionId, runId, finalText: streamedText || finalText || '' }
  } catch (error) {
    const clean = cleanAgentError(error)
    if (!runState.stopped) {
      updateRun(runId, (message) => ({
        ...message,
        status: '出错了',
        steps: [...(message.steps ?? []), { id: nextId('step'), tag: 'error', text: clean || '发送失败，请稍后重试。' }]
      }))
    }
    throw new Error(clean || '发送失败，请稍后重试。')
  } finally {
    if (activeRun?.runId === runId) {
      activeRun.unsubscribe?.()
      activeRun = null
      useHermesStore.getState().setBusyRunId(null)
    }
  }
}

export async function stopHermesPrompt() {
  if (!activeRun) return
  const run = activeRun
  run.stopped = true
  updateRun(run.runId, (message) => ({ ...message, status: '已停止' }))
  useHermesStore.getState().setBusyRunId(null)
  run.unsubscribe?.()
  activeRun = null
  try {
    await window.workdeck?.agent?.stop?.({ provider: useHermesStore.getState().model.provider || safeStorageGet(HERMES_PROVIDER_KEY) || 'hermes' })
  } catch {
    /* Stopping is best effort. */
  }
}
