import { useEffect, useRef, useState } from 'react'
import { Robot, X } from '@phosphor-icons/react'
import { useHermesStore } from '../hermes/HermesStore'
import { AgentCommandPalette } from './AgentCommandPalette'
import { AgentContext } from './AgentContext'
import { useAgentManager } from './AgentManager'
import { AgentExecutionRecord } from './AgentExecutionRecord'

export function AgentFloatingPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const draft = useAgentManager((state) => state.draft)
  const setDraft = useAgentManager((state) => state.setDraft)
  const runTask = useAgentManager((state) => state.runTask)
  const stopTask = useAgentManager((state) => state.stopTask)
  const selectedId = useAgentManager((state) => state.selectedId)
  const agents = useAgentManager((state) => state.agents)
  const conversation = useHermesStore((state) => state.conversation)
  const busyRunId = useHermesStore((state) => state.busyRunId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    requestAnimationFrame(() => inputRef.current?.focus())
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) onClose()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, onClose])

  if (!open) return null
  const selected = agents.find((agent) => agent.id === selectedId)
  const submit = async () => {
    const task = draft.trim()
    if (!task || busyRunId) return
    setError(null)
    try { await runTask(task); setDraft('') } catch (error) { setError(String((error as Error)?.message ?? error)) }
  }
  return <section className="agent-floating-panel" ref={panelRef} role="dialog" aria-modal="false" aria-label="Agent Assistant">
    <header className="agent-floating-head"><div><span className="agent-floating-icon" aria-hidden="true"><Robot size={17} /></span><div><strong>Agent Assistant</strong><small>{selected?.name ?? '选择 Agent'}</small></div></div><button type="button" className="agent-panel-close" onClick={onClose} aria-label="关闭 Agent Assistant"><X size={18} /></button></header>
    <div className="agent-floating-scroll"><AgentContext compact /><section><div className="agent-section-label">执行记录</div><AgentExecutionRecord messages={conversation} busyRunId={busyRunId} onStop={() => void stopTask()} /></section></div>
    <AgentCommandPalette compact value={draft} onChange={setDraft} onSubmit={() => void submit()} busy={!!busyRunId} inputRef={inputRef} error={error} />
  </section>
}
