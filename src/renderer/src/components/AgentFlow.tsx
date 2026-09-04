import { useEffect, useState } from 'react'
import { Sparkle, CheckCircle, ShieldCheck } from '@phosphor-icons/react'
import { Button, Modal } from './ui'

export interface ThinkingStage {
  chip: string
  note: string
}

/**
 * Beautiful-UI-style "expandable trace": the agent's parsing pipeline, played
 * out as a live step list while the work is happening. Each stage lights up in
 * sequence (running dot) then resolves to a check, so "I'm parsing" becomes a
 * legible, deterministic process rather than a blank spinner.
 */
export function ThinkingTrace({ stages }: { stages: ThinkingStage[] }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    setIdx(0)
    if (stages.length === 0) return
    const timer = setInterval(() => {
      setIdx((i) => {
        if (i + 1 >= stages.length) {
          clearInterval(timer)
          return i
        }
        return i + 1
      })
    }, 620)
    return () => clearInterval(timer)
  }, [stages])

  return (
    <div className="card think-panel">
      <div className="think-head">
        <Sparkle size={14} color="var(--accent)" />
        <span className="file-meta">正在理解你的指令…</span>
      </div>
      <div className="think-list">
        {stages.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? 'active' : 'idle'
          return (
            <div key={s.chip} className="think-row">
              <span className={`think-chip ${state}`}>{s.chip}</span>
              <span className={`think-note ${state}`}>{s.note}</span>
              <span className={`think-dot ${state}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface ApprovalStep {
  label: string
  value: string
}

/**
 * Beautiful-UI-style "human-in-the-loop" approval: the agent asks, lists the
 * exact steps it will take, and only proceeds on explicit approval. Replaces
 * the bare confirm modal with the agent-facing "did you really mean this?" card.
 */
export function ApprovalCard({
  ask,
  steps,
  confirmLabel = '确认执行',
  cancelLabel = '再想想',
  danger = false,
  onConfirm,
  onClose
}: {
  ask: string
  steps: ApprovalStep[]
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title="操作确认" onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              try {
                onConfirm()
              } finally {
                onClose()
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="approval-ask">
        <span className="approval-avatar">
          <Sparkle size={14} color="var(--accent)" weight="fill" />
        </span>
        <div className="approval-bubble">
          <div className="approval-ask-text">这像是要做的事</div>
          <div className="approval-ask-ref">{ask}</div>
        </div>
      </div>
      <div className="approval-steps">
        <div className="approval-steps-cap">
          <ShieldCheck size={13} color="var(--success)" />
          执行清单 · 仅在批准后生效
        </div>
        {steps.map((s, i) => (
          <div key={i} className="approval-step">
            <CheckCircle size={13} color="var(--text-3)" />
            <span className="approval-step-label">{s.label}</span>
            <span className="approval-step-value">{s.value}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}