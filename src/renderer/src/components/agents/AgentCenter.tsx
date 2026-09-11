import { useEffect, useState } from 'react'
import { ArrowSquareOut, Brain, Plus, Robot } from '@phosphor-icons/react'
import { Button } from '../ui'
import { useAppStore } from '../../store'
import { useHermesStore } from '../hermes/HermesStore'
import { AgentCard } from './AgentCard'
import { AgentCommandPalette } from './AgentCommandPalette'
import { AgentContext } from './AgentContext'
import { AgentExecutionRecord } from './AgentExecutionRecord'
import { AgentSelector } from './AgentSelector'
import { useAgentManager } from './AgentManager'

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
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void loadAgents() }, [loadAgents])
  const recommended = recommendation ? agents.find((agent) => agent.id === recommendation.agentId) : null
  const submit = async () => {
    const task = draft.trim()
    if (!task || busyRunId) return
    setError(null)
    try { await runTask(task); setDraft('') } catch (error) { setError(String((error as Error)?.message ?? error)) }
  }
  return <main className="workspace agents-page">
    <header className="agents-page-head"><div><span className="page-kicker">INTELLIGENCE</span><h1>Agents</h1><p>在拾序中选择、组织并调用你的工作 Agent。</p></div><Button variant="secondary" onClick={() => { setDraft(''); useHermesStore.getState().setActiveSession(null) }}><Plus size={15} /> 新任务</Button></header>
    <div className="agents-layout">
      <aside className="agents-roster" aria-label="可用 Agent"><div className="agent-roster-heading"><span>当前 Agent</span><AgentSelector /></div><div className="agent-card-list">{agents.map((agent) => <AgentCard key={agent.id} agent={agent} selected={agent.id === selectedId} onSelect={() => void selectAgent(agent.id)} />)}</div></aside>
      <section className="agents-workspace"><div className="agent-workspace-heading"><div><span className="agent-section-label">任务</span><h2>{agents.find((agent) => agent.id === selectedId)?.name ?? '选择 Agent'}</h2></div>{history.length > 0 && <span className="agent-history-count">{history.length} 条执行记录</span>}</div>
        {recommended && recommended.id !== selectedId && <button type="button" className="agent-recommendation" onClick={() => void selectAgent(recommended.id)}><Brain size={16} /><span><strong>推荐使用 {recommended.name}</strong><small>{recommendation?.reason}</small></span><ArrowSquareOut size={14} /></button>}
        <AgentCommandPalette value={draft} onChange={setDraft} onSubmit={() => void submit()} busy={!!busyRunId} error={error} />
        <section className="agent-execution-section"><div className="agent-section-heading"><span className="agent-section-label">执行记录</span><span>共享会话与上下文</span></div><AgentExecutionRecord messages={conversation} busyRunId={busyRunId} onStop={() => void stopTask()} /></section>
      </section>
      <aside className="agents-context"><AgentContext /><button type="button" className="agent-memory-link" onClick={() => setModule('agentMemory')}><Robot size={16} /><span>打开项目记忆</span><ArrowSquareOut size={14} /></button><div className="agent-context-note">Agent 会读取当前项目、文件、页面、工作模式和关注任务。</div></aside>
    </div>
  </main>
}
