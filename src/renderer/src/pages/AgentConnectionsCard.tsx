import { useEffect } from 'react'
import { ArrowClockwise, CheckCircle, GearSix, Robot, WarningCircle } from '@phosphor-icons/react'
import { useAgentManager, type WorkspaceAgent } from '../components/agents/AgentManager'
import { useHermesStore } from '../components/hermes/HermesStore'
import { Button, Select, type SelectOption } from '../components/ui'

/**
 * The single place where Agent selection, connection state and model choice
 * are managed. Agent pages only show the active provider; they never own a
 * second selector or a second connection state.
 */
export function AgentConnectionsCard() {
  const agents = useAgentManager((state) => state.agents)
  const selectedId = useAgentManager((state) => state.selectedId)
  const selectAgent = useAgentManager((state) => state.selectAgent)
  const loadAgents = useAgentManager((state) => state.loadAgents)
  const loading = useAgentManager((state) => state.loading)
  const model = useHermesStore((state) => state.model)
  const setModel = useHermesStore((state) => state.setModel)
  const refreshModels = useHermesStore((state) => state.refreshModels)

  useEffect(() => { void loadAgents() }, [loadAgents])
  useEffect(() => {
    if (model.status === 'idle') void refreshModels(model.provider)
  }, [model.provider, model.status, refreshModels])

  const selected = agents.find((agent) => agent.id === selectedId)
  const options: SelectOption[] = model.models.map((item) => ({ value: item.id, label: item.name || item.id }))
  const modelPlaceholder = model.status === 'loading'
    ? '正在加载模型…'
    : model.status === 'error'
      ? '模型加载失败，点击重试'
      : model.status === 'empty'
        ? '当前 Agent 没有可用模型'
        : '请先配置 AI 服务'

  return <div className="card agent-connections-card">
    <div className="card-head">
      <div>
        <h3><Robot size={15} style={{ marginRight: 4, verticalAlign: -2 }} />Agent 连接与模型</h3>
        <div className="file-meta">在这里连接 Agent、切换当前 Agent，并管理它使用的模型。</div>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void loadAgents()} disabled={loading}>
        <ArrowClockwise size={13} style={{ marginRight: 4, verticalAlign: -2 }} />刷新连接
      </Button>
    </div>

    <div className="settings-agent-list" aria-label="Agent 连接列表">
      {agents.map((agent) => <AgentConnectionRow key={`${agent.id}:${agent.providerId ?? ''}`} agent={agent} selected={agent.id === selectedId} onSelect={() => void selectAgent(agent.id)} />)}
    </div>

    <div className="agent-connection-model field">
      <div className="label">当前模型 · {selected?.name ?? '未选择 Agent'}</div>
      <div className="agent-model-row">
        <Select
          value={model.status === 'success' ? model.selectedId : ''}
          onChange={setModel}
          options={options.length ? options : [{ value: '', label: modelPlaceholder, disabled: true }]}
          placeholder={modelPlaceholder}
          disabled={model.status !== 'success'}
          menuMinWidth={280}
        />
        <Button variant="secondary" size="sm" onClick={() => void refreshModels(selected?.providerId ?? model.provider)} disabled={model.status === 'loading'} aria-label="刷新模型">
          <ArrowClockwise size={14} />
        </Button>
      </div>
      {model.status === 'error' && <div className="file-meta agent-settings-error">{model.error ?? modelPlaceholder}</div>}
      {model.status === 'empty' && <div className="file-meta">请先在下方添加一个兼容的 Agent 连接，或在本机启动对应服务。</div>}
    </div>
  </div>
}

function AgentConnectionRow({ agent, selected, onSelect }: { agent: WorkspaceAgent; selected: boolean; onSelect: () => void }) {
  const status = agent.status === 'connected'
    ? <span className="agent-connection-status is-connected"><CheckCircle size={13} /> 已连接</span>
    : agent.status === 'not-configured'
      ? <span className="agent-connection-status"><GearSix size={13} /> 待配置</span>
      : <span className="agent-connection-status is-missing"><WarningCircle size={13} /> 不可用</span>
  return <button type="button" className={`settings-agent-row ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <span className="settings-agent-row-icon"><Robot size={16} /></span>
    <span className="settings-agent-row-main"><strong>{agent.name}</strong><small>{agent.type} · {agent.capabilities.slice(0, 2).join('、')}</small></span>
    {selected && <span className="agent-connection-current">当前</span>}
    {status}
  </button>
}
