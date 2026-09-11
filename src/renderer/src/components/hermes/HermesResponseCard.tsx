import { useState, type ReactNode } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  Copy,
  ShieldCheck,
  Stop,
  Trash,
  X
} from '@phosphor-icons/react'
import type { HermesMessage } from './HermesStore'
import { messageContent } from './HermesStore'

function clockTime(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(ts)
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(part)) return <code key={index} className="hermes-markdown-code">{part.slice(1, -1)}</code>
    return <span key={index}>{part}</span>
  })
}

function renderRichText(source: string): ReactNode {
  if (!source) return null
  const lines = source.split('\n')
  const output: ReactNode[] = []
  let index = 0
  let key = 0
  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      const buffer: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        buffer.push(lines[index])
        index += 1
      }
      index += 1
      output.push(<pre key={key++} className="hermes-markdown-pre"><code>{buffer.join('\n')}</code></pre>)
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      output.push(<ul key={key++} className="hermes-markdown-list">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>)
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      output.push(<div key={key++} className={`hermes-markdown-heading hermes-markdown-heading-${heading[1].length}`}>{renderInline(heading[2])}</div>)
      index += 1
      continue
    }
    if (!trimmed) {
      index += 1
      continue
    }
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !lines[index].trim().startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^(#{1,4})\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    output.push(<p key={key++} className="hermes-markdown-paragraph">{paragraph.map((item, itemIndex) => <span key={itemIndex}>{itemIndex > 0 ? <br /> : null}{renderInline(item)}</span>)}</p>)
  }
  return output
}

export function HermesPromptRow({ message, onCopy, onDelete }: {
  message: HermesMessage
  onCopy?: (text: string) => void
  onDelete?: (id: string) => void
}) {
  const text = message.text?.trim() || messageContent(message)
  return (
    <article className="hermes-prompt-row">
      <div className="hermes-prompt-copy">{text}</div>
      <div className="hermes-prompt-meta">
        <time>{clockTime(message.ts)}</time>
        {onCopy && <button type="button" onClick={() => onCopy(text)}><Copy size={13} />复制</button>}
        {onDelete && <button type="button" onClick={() => onDelete(message.id)}><Trash size={13} />删除</button>}
      </div>
    </article>
  )
}

export function HermesResponseCard({
  message,
  busy,
  onCopy,
  onDelete,
  onStop,
  onRetry
}: {
  message: HermesMessage
  busy: boolean
  onCopy?: (text: string) => void
  onDelete?: (id: string) => void
  onStop?: () => void
  onRetry?: () => void
}) {
  const text = messageContent(message)
  const detailSteps = message.steps?.filter((step) => step.tag !== 'text') ?? []
  const empty = !busy && !text
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  const answer = async (requestId: string, allow: boolean) => {
    setAnswered((current) => ({ ...current, [requestId]: true }))
    try {
      await window.workdeck?.hermes?.respondPermission(requestId, allow)
    } catch {
      /* Permission response is best effort. */
    }
  }
  const heading = busy ? '正在处理' : empty ? '等待回复' : '分析完成'

  return (
    <article className={`hermes-response-card ${busy ? 'is-busy' : ''} ${empty ? 'is-empty' : ''}`}>
      <header className="hermes-response-head">
        <div>
          <strong>{heading}</strong>
          <time>{clockTime(message.ts)}</time>
        </div>
        {busy && <span className="hermes-response-status"><CircleNotch size={13} className="hermes-spin" />{message.status ?? '思考中…'}</span>}
      </header>
      {detailSteps.length > 0 && (
        <div className="hermes-response-steps">
          {detailSteps.map((step) => (
            <div key={step.id} className={`hermes-response-step ${step.tag === 'error' ? 'is-error' : ''}`} role={step.tag === 'error' ? 'alert' : undefined}>
              {step.tag === 'tool' && <CheckCircle size={13} />}
              {step.tag === 'error' && <X size={13} />}
              {step.tag === 'permission' && <ShieldCheck size={13} />}
              {step.tag === 'permission' && step.requestId && !answered[step.requestId] ? (
                <span className="hermes-permission-wrap">
                  <span>{step.text}</span>
                  <span className="hermes-permission-actions">
                    <button type="button" onClick={() => void answer(step.requestId!, false)}>拒绝</button>
                    <button type="button" onClick={() => void answer(step.requestId!, true)}>允许</button>
                  </span>
                </span>
              ) : <span>{step.text}</span>}
            </div>
          ))}
        </div>
      )}
      {text ? (
        <div className="hermes-response-body">{renderRichText(text)}</div>
      ) : empty ? (
        <div className="hermes-response-empty">
          Hermes 已完成运行，但没有返回可显示的文本。
          {onRetry && <button type="button" onClick={onRetry}><ArrowClockwise size={14} />重新获取</button>}
        </div>
      ) : (
        <div className="hermes-response-waiting">正在等待 Hermes 返回内容…</div>
      )}
      <footer className="hermes-response-actions">
        {busy && onStop && <button type="button" onClick={onStop}><Stop size={13} weight="fill" />停止</button>}
        {!busy && onRetry && <button type="button" onClick={onRetry}><ArrowClockwise size={13} />重新生成</button>}
        {onCopy && <button type="button" onClick={() => onCopy(text || `（${message.status ?? '无回复'}）`)}><Copy size={13} />复制</button>}
        {onDelete && <button type="button" onClick={() => onDelete(message.id)}><Trash size={13} />删除</button>}
      </footer>
    </article>
  )
}
