import { Select } from '../ui'
import { useAgentManager } from './AgentManager'

export function AgentSelector({ compact = false }: { compact?: boolean }) {
  const agents = useAgentManager((state) => state.agents)
  const selectedId = useAgentManager((state) => state.selectedId)
  const selectAgent = useAgentManager((state) => state.selectAgent)
  return <Select
    value={selectedId}
    onChange={(id) => void selectAgent(id)}
    className={compact ? 'agent-selector-compact' : 'agent-selector'}
    options={agents.map((agent) => ({
      value: agent.id,
      label: `${agent.name}${agent.runnable ? '' : ' · 需配置'}`,
      shortLabel: agent.name
    }))}
    placeholder="选择 Agent"
  />
}
