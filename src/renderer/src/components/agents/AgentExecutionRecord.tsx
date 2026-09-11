import { CheckCircle, Copy, SpinnerGap, Stop, WarningCircle, UserCircle, ShieldCheck } from '@phosphor-icons/react'
import { Button } from '../ui'
import { messageContent, type HermesMessage } from '../hermes/HermesStore'

export function AgentExecutionRecord({ messages, busyRunId, onStop }: { messages: HermesMessage[]; busyRunId: string | null; onStop: () => void }) {
  if (!messages.length) return <div className="agent-execution-empty"><span>选择一个 Agent，描述要完成的工作；对话和执行记录会保留在当前 Workspace 中。</span></div>
  return <div className="agent-execution-list" aria-live="polite">
    {messages.slice(-24).map((message) => {
      if (message.role === 'user') return <article className="agent-conversation-user" key={message.id}>
        <div className="agent-message-meta"><UserCircle size={16} /><span>你的任务</span><time>{formatTime(message.ts)}</time></div>
        <p>{message.text}</p>
      </article>
      const content = messageContent(message)
      const pendingPermissions = message.steps?.filter((step) => step.tag === 'permission' && step.requestId) ?? []
      const isBusy = message.id === busyRunId
      return <article className={`agent-execution-card ${isBusy ? 'is-streaming' : ''}`} key={message.id}>
        <div className="agent-execution-head">
          <span>{isBusy ? <SpinnerGap size={15} className="agent-spin" /> : message.status === '出错了' ? <WarningCircle size={15} /> : <CheckCircle size={15} />}</span>
          <strong>{message.status || '执行结果'}</strong>
          <time>{formatTime(message.ts)}</time>
          {isBusy && <Button size="sm" variant="secondary" onClick={onStop}><Stop size={13} /> 停止</Button>}
        </div>
        {message.steps?.filter((step) => step.tag !== 'text').map((step) => <div className={`agent-step ${step.tag === 'error' ? 'is-error' : ''} ${step.tag === 'permission' ? 'is-permission' : ''}`} key={step.id}><span>{step.tag === 'permission' ? <ShieldCheck size={14} /> : null}</span><span>{step.text}</span>{step.tag === 'permission' && step.requestId && <span className="agent-permission-actions"><button type="button" onClick={() => void window.workdeck.hermes.respondPermission(step.requestId!, true)}>允许</button><button type="button" onClick={() => void window.workdeck.hermes.respondPermission(step.requestId!, false)}>拒绝</button></span>}</div>)}
        {pendingPermissions.length > 0 && <div className="agent-permission-note">需要你的确认后才能继续执行。</div>}
        {content && <div className="agent-execution-content">{content}</div>}
        {content && <button type="button" className="agent-copy" onClick={() => void navigator.clipboard?.writeText(content)}><Copy size={13} /> 复制结果</button>}
      </article>
    })}
  </div>
}

function formatTime(timestamp: number) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}
