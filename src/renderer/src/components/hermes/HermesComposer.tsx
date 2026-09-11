import { ArrowUp, Stop } from '@phosphor-icons/react'
import type { RefObject } from 'react'

/** Shared Workspace task input used by Full Hermes and the floating assistant. */
export function HermesComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  inputRef,
  placeholder = '输入任务...'
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  inputRef?: RefObject<HTMLTextAreaElement | null>
  placeholder?: string
}) {
  return (
    <div className="hermes-composer-wrap">
      <div className="hermes-composer" role="group" aria-label="Workspace 任务输入">
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
          <button type="button" className="hermes-composer-send is-stop" onClick={onStop} aria-label="停止任务">
            <Stop size={15} weight="fill" />
          </button>
        ) : (
          <button type="button" className="hermes-composer-send" onClick={onSend} disabled={!value.trim()} aria-label="发送任务">
            <ArrowUp size={16} weight="bold" />
          </button>
        )}
      </div>
      <div className="hermes-composer-foot">
        <span className="hermes-composer-hint">Ctrl + Enter 发送 · Shift + Enter 换行</span>
      </div>
    </div>
  )
}
