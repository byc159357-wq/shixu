import { ArrowUp, Lightning, MagicWand, PencilSimple, SpinnerGap } from '@phosphor-icons/react'
import type { KeyboardEvent, RefObject } from 'react'
import { AgentSelector } from './AgentSelector'

const actions = [
  ['分析', '分析当前项目和页面状态，列出下一步。', <MagicWand size={14} />],
  ['创建', '基于当前上下文创建一个可执行方案。', <Lightning size={14} />],
  ['修改', '根据当前上下文提出具体修改建议。', <PencilSimple size={14} />],
  ['执行', '继续最近一项未完成任务。', <ArrowUp size={14} />]
] as const

export function AgentCommandPalette({
  value, onChange, onSubmit, busy, inputRef, error, compact = false
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
  inputRef?: RefObject<HTMLTextAreaElement | null>
  error?: string | null
  compact?: boolean
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }
  return <section className={`agent-command ${compact ? 'is-compact' : ''}`} aria-label="Agent 任务输入">
    {!compact && <div className="agent-command-top"><span className="agent-section-label">任务</span><AgentSelector compact /></div>}
    {compact && <div className="agent-command-top"><span className="agent-section-label">当前 Agent</span><AgentSelector compact /></div>}
    <label className="sr-only" htmlFor={compact ? 'agent-floating-input' : 'agent-center-input'}>输入想完成的工作</label>
    <div className="agent-composer">
      <textarea
        id={compact ? 'agent-floating-input' : 'agent-center-input'}
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="输入你想完成的工作"
        rows={compact ? 3 : 4}
      />
      <button type="button" className="agent-send" onClick={onSubmit} disabled={busy || !value.trim()} aria-label={busy ? 'Agent 正在执行' : '执行任务'}>
        {busy ? <SpinnerGap size={17} className="agent-spin" /> : <ArrowUp size={17} weight="bold" />}
      </button>
    </div>
    <div className="agent-action-row" aria-label="快捷动作">
      {actions.map(([label, prompt, icon]) => <button key={label} type="button" onClick={() => onChange(prompt)}>{icon}<span>{label}</span></button>)}
      <span>Ctrl + Enter 执行</span>
    </div>
    {error && <p className="agent-inline-error" role="alert">{error}</p>}
  </section>
}
