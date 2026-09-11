import { create } from 'zustand'
import type { HermesStreamEvent } from '../../shared/types'
import { useAppStore } from './store'

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
  msgs: HermesMessage[]
  ts: number
}

interface HermesCoreState {
  sessions: HermesSession[]
  activeId: string | null
  busyRunId: string | null
  setActiveId: (id: string | null) => void
  setBusyRunId: (id: string | null) => void
  updateSessions: (updater: (sessions: HermesSession[]) => HermesSession[]) => void
}

const SESSION_KEY = 'wd_agent_sessions_v1'
let sequence = 0

function nextId(prefix: string) {
  sequence += 1
  return `${prefix}${Date.now().toString(36)}_${sequence}`
}

export function inferSessionKind(text: string): HermesSessionKind {
  const value = text.trim().toLowerCase()
  if (!value) return 'chat'
  const looksLikePath = /(?:[a-z]:\\|\/(?:src|app|packages?|components?|public|tests?)\/|\.(?:tsx?|jsx?|vue|py|java|go|rs|json|ya?ml|md)\b)/i.test(value)
  const projectIntent = /项目|代码|仓库|文件|目录|组件|页面|界面|ui|ux|前端|后端|接口|数据库|脚本|测试|构建|部署|重构|修复|优化|实现|开发|设计稿|git|github|commit|pull request|package\.json/i.test(value)
  return looksLikePath || projectIntent ? 'project' : 'chat'
}

function loadSessions(): HermesSession[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const parsed = raw ? JSON.parse(raw) as HermesSession[] : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((session) => session && typeof session.id === 'string' && Array.isArray(session.msgs))
      .map((session) => ({
        ...session,
        kind: session.kind ?? inferSessionKind(session.title),
        msgs: session.msgs.map((message) => ({
          ...message,
          steps: Array.isArray(message.steps) ? message.steps : []
        }))
      }))
  } catch {
    return []
  }
}

function persistSessions(sessions: HermesSession[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessions))
  } catch {
    /* Keep the in-memory session when browser storage is unavailable. */
  }
}

export const useHermesStore = create<HermesCoreState>((set) => ({
  sessions: loadSessions(),
  activeId: null,
  busyRunId: null,
  setActiveId: (activeId) => set({ activeId }),
  setBusyRunId: (busyRunId) => set({ busyRunId }),
  updateSessions: (updater) => set((state) => {
    const sessions = updater(state.sessions)
    persistSessions(sessions)
    return { sessions }
  })
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
  useHermesStore.getState().updateSessions((sessions) => sessions.map((session) => ({
    ...session,
    msgs: session.msgs.map((message) => message.id === runId
      ? { ...message, steps: [...(message.steps ?? []), step] }
      : message)
  })))
}

function updateRun(runId: string, updater: (message: HermesMessage) => HermesMessage) {
  useHermesStore.getState().updateSessions((sessions) => sessions.map((session) => ({
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
  const { workspaceContext } = useAppStore.getState()
  if (!workspaceContext) return ''
  let memory: {
    preferences?: string[]
    decisions?: string[]
    aiNotes?: string[]
  } | null = null
  const projectId = workspaceContext.currentProject?.id
  if (projectId) {
    try {
      memory = await window.workdeck.memory.get(projectId)
    } catch {
      /* Context is still useful when a project has no memory record yet. */
    }
  }
  const lines = [
    `当前项目：${workspaceContext.currentProject?.name ?? '未选择项目'}`,
    `当前工作模式：${workspaceContext.currentScene?.name ?? '自由工作'}`,
    `当前关注任务：${workspaceContext.focusTask?.title ?? '暂无'}`,
    `最近文件：${workspaceContext.recentFiles.slice(0, 8).map((file) => file.name).join('、') || '暂无'}`,
    `项目偏好：${memory?.preferences?.slice(0, 5).join('；') || '暂无'}`,
    `历史决策：${memory?.decisions?.slice(0, 5).join('；') || '暂无'}`,
    `项目记忆：${memory?.aiNotes?.slice(0, 5).join('；') || '暂无'}`
  ]
  return `[Shixu Workspace Context]\n${lines.join('\n')}`
}

/**
 * Run one Hermes request against the shared session store. Both the full page
 * and Command Mode call this function, so streamed events and the final reply
 * are written to the same durable conversation.
 */
export async function runHermesPrompt(input: {
  text: string
  provider?: string
  model?: string
  sessionId?: string | null
  sessionKind?: HermesSessionKind
}): Promise<{ sessionId: string; runId: string; finalText: string }> {
  const text = input.text.trim()
  if (!text) throw new Error('请输入任务')
  if (useHermesStore.getState().busyRunId) throw new Error('Hermes 正在处理上一项任务')

  const state = useHermesStore.getState()
  const hasActive = !!input.sessionId && state.sessions.some((session) => session.id === input.sessionId)
  const sessionId = hasActive ? input.sessionId! : nextId('s')
  const runId = nextId('m')
  const previous = state.sessions.find((session) => session.id === sessionId)?.msgs ?? []
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
  state.updateSessions((sessions) => {
    const existing = sessions.find((session) => session.id === sessionId)
    if (existing) {
      return sessions.map((session) => session.id === sessionId
        ? {
            ...session,
            title: session.msgs.length ? session.title : sessionTitle(text),
            ts: Date.now(),
            msgs: [...session.msgs, userMessage, assistantMessage]
          }
        : session)
    }
    return [
      ...sessions,
      {
        id: sessionId,
        title: sessionTitle(text),
        kind: input.sessionKind ?? inferSessionKind(text),
        msgs: [userMessage, assistantMessage],
        ts: Date.now()
      }
    ]
  })
  state.setActiveId(sessionId)
  state.setBusyRunId(runId)

  let streamedText = ''
  let completed = false
  const agent = window.workdeck?.agent
  if (!agent) {
    state.setBusyRunId(null)
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
          useHermesStore.getState().updateSessions((sessions) => sessions.map((session) => ({
            ...session,
            msgs: session.msgs.map((message) => {
              if (message.id !== runId) return message
              const steps = [...(message.steps ?? [])]
              const last = steps[steps.length - 1]
              if (last?.tag === 'text') steps[steps.length - 1] = { ...last, text: last.text + event.text }
              else steps.push({ id: nextId('step'), tag: 'text', text: event.text })
              return { ...message, steps, status: '生成中…' }
            })
          })))
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

  try {
    const finalText = await agent.send(text, {
      provider: input.provider ?? 'hermes',
      model: input.model,
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
    await window.workdeck?.agent?.stop?.({ provider: localStorage.getItem('wd_agent_tool') || 'hermes' })
  } catch {
    /* Stopping is best effort. */
  }
}
