import { create } from 'zustand'
import type { AgentProviderInfo } from '../../../../shared/types'
import { useHermesStore, type HermesPromptResult } from '../hermes/HermesStore'

export type AgentStatus = 'connected' | 'not-configured' | 'unavailable'

export interface WorkspaceAgent {
  id: string
  name: string
  type: string
  detail: string
  capabilities: string[]
  status: AgentStatus
  runnable: boolean
}

export interface AgentRecommendation {
  agentId: string
  reason: string
}

interface AgentManagerState {
  agents: WorkspaceAgent[]
  selectedId: string
  loading: boolean
  error: string | null
  draft: string
  recommendation: AgentRecommendation | null
  loadAgents: () => Promise<void>
  selectAgent: (id: string) => Promise<void>
  setDraft: (value: string) => void
  runTask: (text: string) => Promise<HermesPromptResult>
  stopTask: () => Promise<void>
}

const SELECTED_AGENT_KEY = 'wd_selected_agent'

const catalog: WorkspaceAgent[] = [
  {
    id: 'hermes', name: 'Hermes', type: '系统 Agent', detail: '任务规划、上下文理解与 Agent 调度',
    capabilities: ['任务规划', '上下文理解', 'Agent 调度'], status: 'unavailable', runnable: false
  },
  {
    id: 'claude', name: 'Claude', type: '视觉设计 Agent', detail: '适合视觉理解、设计建议与方案生成',
    capabilities: ['图片理解', '设计建议', '方案生成'], status: 'not-configured', runnable: false
  },
  {
    id: 'codex', name: 'Codex', type: '代码 Agent', detail: '适合代码分析、实现与审查',
    capabilities: ['代码分析', '实现', '审查'], status: 'not-configured', runnable: false
  },
  {
    id: 'gemini', name: 'Gemini', type: '研究 Agent', detail: '适合资料整理、比较与研究任务',
    capabilities: ['研究', '整理', '比较'], status: 'not-configured', runnable: false
  },
  {
    id: 'custom', name: 'Custom Agent', type: '自定义 Agent', detail: '连接已配置的兼容 Agent Provider',
    capabilities: ['自定义能力', '兼容 API', '本地接入'], status: 'not-configured', runnable: false
  }
]

function savedAgentId() {
  try { return localStorage.getItem(SELECTED_AGENT_KEY) || 'hermes' } catch { return 'hermes' }
}

function remember(id: string) {
  try { localStorage.setItem(SELECTED_AGENT_KEY, id) } catch { /* in-memory selection remains usable */ }
}

function fromProvider(provider: AgentProviderInfo): WorkspaceAgent {
  const existing = catalog.find((agent) => agent.id === provider.id)
  return {
    id: provider.id,
    name: existing?.name ?? provider.name,
    type: existing?.type ?? '已连接 Agent',
    detail: existing?.detail ?? provider.detail,
    capabilities: existing?.capabilities ?? ['任务执行', '上下文接入'],
    status: provider.available && provider.kind === 'external'
      ? 'connected'
      : provider.kind === 'pending' ? 'not-configured' : 'unavailable',
    runnable: provider.available && provider.kind === 'external'
  }
}

function recommend(text: string, agents: WorkspaceAgent[]): AgentRecommendation | null {
  const value = text.trim()
  if (!value) return null
  const candidate = (id: string, reason: string) => agents.some((agent) => agent.id === id)
    ? { agentId: id, reason }
    : null
  if (/视觉|设计|图片|海报|作品集|界面|ui|ux/i.test(value)) return candidate('claude', '任务包含视觉或设计内容')
  if (/代码|开发|测试|构建|重构|修复|接口|数据库/i.test(value)) return candidate('codex', '任务包含代码或工程内容')
  if (/研究|调研|比较|资料|总结|检索/i.test(value)) return candidate('gemini', '任务需要资料整理或比较')
  return candidate('hermes', '适合从当前 Workspace 上下文开始')
}

export const useAgentManager = create<AgentManagerState>((set, get) => ({
  agents: catalog,
  selectedId: savedAgentId(),
  loading: false,
  error: null,
  draft: '',
  recommendation: null,
  loadAgents: async () => {
    set({ loading: true, error: null })
    try {
      const providers: AgentProviderInfo[] = await window.workdeck.agent.listProviders()
      const discovered: WorkspaceAgent[] = providers.map(fromProvider)
      const ids = new Set(discovered.map((agent) => agent.id))
      const agents: WorkspaceAgent[] = [...discovered, ...catalog.filter((agent: WorkspaceAgent) => !ids.has(agent.id))]
      const selectedId = agents.some((agent) => agent.id === get().selectedId) ? get().selectedId : 'hermes'
      set({ agents, selectedId, loading: false, recommendation: recommend(get().draft, agents) })
      await get().selectAgent(selectedId)
    } catch (error) {
      set({ loading: false, error: String((error as Error)?.message ?? error), agents: catalog })
    }
  },
  selectAgent: async (selectedId) => {
    const selected = get().agents.find((agent) => agent.id === selectedId)
    if (!selected) return
    remember(selectedId)
    set({ selectedId, error: null })
    if (!selected.runnable) return
    await useHermesStore.getState().refreshModels(selectedId)
  },
  setDraft: (draft) => set((state) => ({ draft, recommendation: recommend(draft, state.agents) })),
  runTask: async (text) => {
    const selected = get().agents.find((agent) => agent.id === get().selectedId)
    if (!selected?.runnable) throw new Error(`请先在设置中配置 ${selected?.name ?? '当前 Agent'} 服务`)
    const hermes = useHermesStore.getState()
    return hermes.sendPrompt({
      text,
      provider: selected.id,
      model: hermes.model.provider === selected.id ? hermes.model.selectedId || undefined : undefined,
      sessionId: hermes.activeId
    })
  },
  stopTask: async () => useHermesStore.getState().stopPrompt()
}))
