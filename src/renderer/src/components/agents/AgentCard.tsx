import { CheckCircle, GearSix, Robot, WarningCircle } from '@phosphor-icons/react'
import { Badge } from '../ui'
import type { WorkspaceAgent } from './AgentManager'

export function AgentCard({ agent, selected, onSelect, compact = false }: { agent: WorkspaceAgent; selected: boolean; onSelect: () => void; compact?: boolean }) {
  const status = agent.status === 'connected' ? <Badge kind="available"><CheckCircle size={12} /> 已连接</Badge>
    : agent.status === 'not-configured' ? <Badge kind="neutral"><GearSix size={12} /> 待配置</Badge>
      : <Badge kind="missing"><WarningCircle size={12} /> 不可用</Badge>
  return <button type="button" className={`agent-card ${compact ? 'is-compact' : ''} ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <div className="agent-card-head"><div className="agent-card-identity"><span className="agent-card-icon" aria-hidden="true"><Robot size={compact ? 15 : 16} /></span><div><strong>{agent.name}</strong><span>{agent.type}</span></div></div>{status}</div>
    {!compact && <><p>{agent.detail}</p><div className="agent-capabilities">{agent.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></>}
  </button>
}
