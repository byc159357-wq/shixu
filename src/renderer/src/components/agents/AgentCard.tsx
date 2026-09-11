import { CheckCircle, GearSix, WarningCircle } from '@phosphor-icons/react'
import { Badge } from '../ui'
import type { WorkspaceAgent } from './AgentManager'

export function AgentCard({ agent, selected, onSelect }: { agent: WorkspaceAgent; selected: boolean; onSelect: () => void }) {
  const status = agent.status === 'connected' ? <Badge kind="available"><CheckCircle size={12} /> 已连接</Badge>
    : agent.status === 'not-configured' ? <Badge kind="neutral"><GearSix size={12} /> 待配置</Badge>
      : <Badge kind="missing"><WarningCircle size={12} /> 不可用</Badge>
  return <button type="button" className={`agent-card ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <div className="agent-card-head"><div><strong>{agent.name}</strong><span>{agent.type}</span></div>{status}</div>
    <p>{agent.detail}</p>
    <div className="agent-capabilities">{agent.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
  </button>
}
