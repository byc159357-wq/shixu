import { ArrowClockwise, ArrowUp, Stop } from '@phosphor-icons/react'
import type { RefObject } from 'react'
import { Select, type SelectOption } from '../ui'
import type { HermesModelState } from './HermesStore'

export function HermesModelPicker({
  model,
  onChange,
  onRefresh,
  compact = false
}: {
  model: HermesModelState
  onChange: (id: string) => void
  onRefresh: () => void
  compact?: boolean
}) {
  const options: SelectOption[] = model.models.map((item) => {
    const name = item.name || item.id
    const separator = name.indexOf(' · ')
    return { value: item.id, label: name, shortLabel: separator > 0 ? name.slice(separator + 3) : name }
  })
  const placeholder = model.status === 'loading'
    ? '正在加载模型...'
    : model.status === 'error'
      ? '模型加载失败，点击重试'
      : '请先配置 AI 服务'
  return (
    <div className={`hermes-model-picker ${compact ? 'is-compact' : ''}`}>
      <Select
        value={model.status === 'success' ? model.selectedId : ''}
        onChange={onChange}
        options={options.length ? options : [{ value: '', label: placeholder, disabled: true }]}
        placeholder={placeholder}
        disabled={model.status !== 'success'}
        className="hermes-model-select"
        menuMinWidth={compact ? 230 : 300}
      />
      <button
        type="button"
        className="hermes-icon-button"
        title={model.status === 'error' ? '重试模型加载' : '刷新模型'}
        aria-label={model.status === 'error' ? '重试模型加载' : '刷新模型'}
        onClick={onRefresh}
        disabled={model.status === 'loading'}
      >
        <ArrowClockwise size={14} className={model.status === 'loading' ? 'hermes-spin' : undefined} />
      </button>
      {model.status === 'loading' && <span className="hermes-model-status">正在加载模型...</span>}
      {model.status === 'error' && <button type="button" className="hermes-model-status is-error" onClick={onRefresh}>模型加载失败，点击重试</button>}
      {model.status === 'empty' && <span className="hermes-model-status">请先配置 AI 服务</span>}
    </div>
  )
}

export function HermesComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  model,
  onModelChange,
  onRefreshModels,
  showModelPicker = false,
  inputRef,
  placeholder = 'Ask Hermes...'
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  model?: HermesModelState
  onModelChange?: (id: string) => void
  onRefreshModels?: () => void
  showModelPicker?: boolean
  inputRef?: RefObject<HTMLTextAreaElement | null>
  placeholder?: string
}) {
  return (
    <div className="hermes-composer-wrap">
      <div className="hermes-composer">
        <textarea
          ref={inputRef}
          value={value}
          rows={2}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              onSend()
            }
          }}
        />
        {busy ? (
          <button type="button" className="hermes-composer-send is-stop" onClick={onStop} aria-label="停止 Hermes">
            <Stop size={15} weight="fill" />
          </button>
        ) : (
          <button type="button" className="hermes-composer-send" onClick={onSend} disabled={!value.trim()} aria-label="发送">
            <ArrowUp size={16} weight="bold" />
          </button>
        )}
      </div>
      <div className="hermes-composer-foot">
        {showModelPicker && model && onModelChange && onRefreshModels && (
          <HermesModelPicker model={model} onChange={onModelChange} onRefresh={onRefreshModels} />
        )}
        <span className="hermes-composer-hint">Ctrl + Enter 发送 · Shift + Enter 换行</span>
      </div>
    </div>
  )
}
