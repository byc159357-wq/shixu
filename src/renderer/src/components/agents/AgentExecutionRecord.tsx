import { CheckCircle, Copy, SpinnerGap, Stop, WarningCircle } from '@phosphor-icons/react'
import { Button } from '../ui'
import { messageContent, type HermesMessage } from '../hermes/HermesStore'

export function AgentExecutionRecord({ messages, busyRunId, onStop }: { messages: HermesMessage[]; busyRunId: string | null; onStop: () => void }) {
  if (!messages.length) return <div className="agent-execution-empty">选择一个 Agent，描述要完成的工作；执行记录会保留在当前 Workspace 中。</div>
  return <div className="agent-execution-list" aria-live="polite">
    {messages.slice(-12).map((message) => message.role === 'user' ? <div className="agent-task-line" key={message.id}>{message.text}</div> : (
      <article className="agent-execution-card" key={message.id}>
        <div className="agent-execution-head">
          <span>{message.id === busyRunId ? <SpinnerGap size={15} className="agent-spin" /> : message.status === '出错了' ? <WarningCircle size={15} /> : <CheckCircle size={15} />}</span>
          <strong>{message.status || '执行结果'}</strong>
          {message.id === busyRunId && <Button size="sm" variant="secondary" onClick={onStop}><Stop size={13} /> 停止</Button>}
        </div>
        {message.steps?.filter((step) => step.tag !== 'text').map((step) => <p className={step.tag === 'error' ? 'agent-step is-error' : 'agent-step'} key={step.id}>{step.text}</p>)}
        {messageContent(message) && <div className="agent-execution-content">{messageContent(message)}</div>}
        {messageContent(message) && <button type="button" className="agent-copy" onClick={() => void navigator.clipboard?.writeText(messageContent(message))}><Copy size={13} /> 复制结果</button>}
      </article>
    ))}
  </div>
}
