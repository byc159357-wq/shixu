import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Brain, File, GearSix, Plus } from '@phosphor-icons/react'
import { Button } from '../ui'
import { useAppStore } from '../../store'
import { useHermesStore } from '../hermes/HermesStore'
import { AgentCard } from './AgentCard'
import { AgentCommandPalette } from './AgentCommandPalette'
import { AgentContext } from './AgentContext'
import { AgentExecutionRecord } from './AgentExecutionRecord'
import { AgentSelector } from './AgentSelector'
import { useAgentManager } from './AgentManager'

function AgentDock() {
  const agents = useAgentManager((state) => state.agents)
  const selectedId = useAgentManager((state) => state.selectedId)
  const selectAgent = useAgentManager((state) => state.selectAgent)
  return <section className="agent-dock" aria-label="可用 Agent">
    <div className="agent-dock-heading"><span className="agent-section-label">可用 Agent</span><span>{agents.filter((agent) => agent.runnable).length} 个已连接</span></div>
    <div className="agent-dock-list">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} compact selected={agent.id === selectedId} onSelect={() => void selectAgent(agent.id)} />)}</div>
  </section>
}

export function AgentCenter() {
  const agents = useAgentManager((state) => state.agents)
  const selectedId = useAgentManager((state) => state.selectedId)
  const selectAgent = useAgentManager((state) => state.selectAgent)
  const loadAgents = useAgentManager((state) => state.loadAgents)
  const draft = useAgentManager((state) => state.draft)
  const setDraft = useAgentManager((state) => state.setDraft)
  const recommendation = useAgentManager((state) => state.recommendation)
  const runTask = useAgentManager((state) => state.runTask)
  const stopTask = useAgentManager((state) => state.stopTask)
  const setModule = useAppStore((state) => state.setModule)
  const conversation = useHermesStore((state) => state.conversation)
  const history = useHermesStore((state) => state.history)
  const busyRunId = useHermesStore((state) => state.busyRunId)
  const setActiveSession = useHermesStore((state) => state.setActiveSession)
  const [error, setError] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => { void loadAgents() }, [loadAgents])

  const selected = agents.find((agent) => agent.id === selectedId)
  const recommended = recommendation ? agents.find((agent) => agent.id === recommendation.agentId) : null

  const submit = async () => {
    const task = draft.trim()
    if (!task || busyRunId) return
    setError(null)
    try { await runTask(task); setDraft('') } catch (reason) { setError(String((reason as Error)?.message ?? reason)) }
  }

  const startNew = () => {
    setActiveSession(null)
    setDraft('')
    setError(null)
    requestAnimationFrame(() => mainRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus())
  }

  return <main className="workspace agents-page" ref={mainRef}>
    <header className="agents-page-head">
      <div><span className="page-kicker">INTELLIGENCE</span><h1>Agents</h1><p>统一管理和调用你的 AI Agent</p></div>
      <div className="agents-page-actions"><Button variant="secondary" onClick={() => setModule('settings')}><GearSix size={15} /> 接入 Agent</Button><Button variant="primary" onClick={startNew}><Plus size={15} /> 新任务</Button></div>
    </header>

    <AgentDock />

    <div className="agent-layout">
      <section className="agent-main-workspace" aria-label="Agent 工作区">
        <div className="agent-main-head"><div><span className="agent-section-label">当前 Agent</span><h2>{selected?.name ?? '选择 Agent'}</h2></div><AgentSelector /></div>
        {recommended && recommended.id !== selectedId && <button type="button" className="agent-recommendation" onClick={() => void selectAgent(recommended.id)}><Brain size={16} /><span><strong>推荐使用 {recommended.name}</strong><small>{recommendation?.reason}</small></span><ArrowSquareOut size={14} /></button>}
        <div className="agent-task-heading"><span className="agent-section-label">当前任务</span><span>{busyRunId ? '正在执行' : selected?.status === 'connected' ? '准备开始' : '等待配置'}</span></div>
        <AgentCommandPalette value={draft} onChange={setDraft} onSubmit={() => void submit()} busy={!!busyRunId} error={error} />
        <section className="agent-execution-section"><div className="agent-section-heading"><span className="agent-section-label">执行记录</span>{history.length > 0 && <span>{history.length} 条记录</span>}</div><AgentExecutionRecord messages={conversation} busyRunId={busyRunId} onStop={() => void stopTask()} /></section>
      </section>

      <aside className="agent-context-panel" aria-label="工作上下文"><AgentContext /><div className="agent-context-actions"><div className="agent-section-label">快捷操作</div><button type="button" onClick={() => setModule('agentMemory')}><Brain size={15} /><span>打开项目记忆</span><ArrowSquareOut size={13} /></button><button type="button" onClick={() => setModule('library')}><File size={15} /><span>附加文件</span><ArrowSquareOut size={13} /></button><button type="button" onClick={() => setModule('agentWorkflows')}><Plus size={15} /><span>切换工作流</span><ArrowSquareOut size={13} /></button></div><div className="agent-provider-summary"><div className="agent-section-label">Agent 信息</div><strong>{selected?.name ?? '未选择'}</strong><span>{selected?.type ?? '选择一个 Agent'}</span><small>{selected?.capabilities.join(' · ') ?? '暂无能力信息'}</small><small>上下文权限：当前 Workspace</small></div></aside>
    </div>
  </main>
}
