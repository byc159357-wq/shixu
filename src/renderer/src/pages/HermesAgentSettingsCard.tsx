import { useEffect } from 'react'
import { ArrowClockwise, Robot } from '@phosphor-icons/react'
import { useHermesStore } from '../components/hermes/HermesStore'
import { Button, Select, type SelectOption } from '../components/ui'

/** Model controls live in Settings; Hermes surfaces only the task input. */
export function HermesAgentSettingsCard() {
  const model = useHermesStore((state) => state.model)
  const setModel = useHermesStore((state) => state.setModel)
  const refreshModels = useHermesStore((state) => state.refreshModels)

  useEffect(() => {
    if (model.status === 'idle') void refreshModels(model.provider)
  }, [model.provider, model.status, refreshModels])

  const options: SelectOption[] = model.models.map((item) => ({
    value: item.id,
    label: item.name || item.id
  }))
  const placeholder = model.status === 'loading'
    ? '正在加载模型...'
    : model.status === 'error'
      ? '模型加载失败，点击重试'
      : '请先配置 AI 服务'

  return (
    <div className="card hermes-agent-settings-card">
      <div className="card-head">
        <h3><Robot size={15} style={{ marginRight: 4, verticalAlign: -2 }} />Hermes Agent</h3>
        <Button variant="secondary" size="sm" onClick={() => void refreshModels(model.provider)} disabled={model.status === 'loading'}>
          <ArrowClockwise size={13} style={{ marginRight: 4, verticalAlign: -2 }} />刷新模型
        </Button>
      </div>
      <div className="file-meta">Hermes 使用的提供商与模型在这里管理，工作页面只保留任务输入。</div>
      <div className="field">
        <span className="label">提供商</span>
        <div className="file-row" style={{ minHeight: 0, padding: 'var(--space-2) var(--space-3)' }}>
          <span className="file-name">{model.provider || 'hermes'}</span>
        </div>
      </div>
      <div className="field">
        <span className="label">当前模型</span>
        <Select
          value={model.status === 'success' ? model.selectedId : ''}
          onChange={setModel}
          options={options.length ? options : [{ value: '', label: placeholder, disabled: true }]}
          placeholder={placeholder}
          disabled={model.status !== 'success'}
          menuMinWidth={280}
        />
        {model.status === 'error' && <div className="file-meta" style={{ color: 'var(--danger)', marginTop: 6 }}>{model.error ?? placeholder}</div>}
        {model.status === 'empty' && <div className="file-meta" style={{ marginTop: 6 }}>{placeholder}</div>}
      </div>
    </div>
  )
}
