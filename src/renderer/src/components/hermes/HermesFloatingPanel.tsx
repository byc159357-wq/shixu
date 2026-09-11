import { useEffect, useRef, useState } from 'react'
import { Brain, FolderSimple, Sparkle, X } from '@phosphor-icons/react'
import { useAppStore } from '../../store'
import {
  useHermesStore
} from './HermesStore'
import { HermesComposer, HermesModelPicker } from './HermesComposer'
import { HermesQuickActions, FLOATING_HERMES_ACTIONS, type HermesQuickAction } from './HermesQuickActions'
import { HermesResponseCard, HermesPromptRow } from './HermesResponseCard'
import { HermesShell } from './HermesShell'

export function HermesFloatingPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const context = useHermesStore((state) => state.context)
  const conversation = useHermesStore((state) => state.conversation)
  const activeId = useHermesStore((state) => state.activeId)
  const busyRunId = useHermesStore((state) => state.busyRunId)
  const model = useHermesStore((state) => state.model)
  const setModel = useHermesStore((state) => state.setModel)
  const refreshModels = useHermesStore((state) => state.refreshModels)
  const sendPrompt = useHermesStore((state) => state.sendPrompt)
  const stopPrompt = useHermesStore((state) => state.stopPrompt)
  const workspaceContext = useAppStore((state) => state.workspaceContext)

  useEffect(() => {
    if (!open) return
    setError(null)
    requestAnimationFrame(() => inputRef.current?.focus())
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.dd-menu')) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const send = async () => {
    const text = input.trim()
    if (!text || busyRunId) return
    setInput('')
    setError(null)
    try {
      await sendPrompt({ text, sessionId: activeId })
    } catch (err) {
      setError(String((err as Error)?.message ?? err))
    }
  }

  const selectAction = (action: HermesQuickAction) => {
    setInput(action.prompt)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  const recent = conversation.slice(-5)
  const projectName = context.currentProject?.name ?? workspaceContext?.currentProject?.name ?? '当前工作区'

  return (
    <div className="hermes-floating-layer" role="presentation">
      <HermesShell variant="floating">
        <section
          ref={panelRef}
          className="hermes-floating-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Hermes Quick Assist"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="hermes-floating-head">
            <div className="hermes-floating-title">
              <span className="hermes-floating-mark"><Sparkle size={15} weight="fill" /></span>
              <div><strong>Hermes</strong><span>Quick Assist</span></div>
            </div>
            <div className="hermes-floating-head-actions">
              <span className="hermes-floating-project"><FolderSimple size={13} />{projectName}</span>
              <button type="button" className="hermes-floating-close" onClick={onClose} aria-label="关闭 Hermes"><X size={16} /></button>
            </div>
            <div className="hermes-floating-model hermes-floating-model-head">
              <HermesModelPicker model={model} onChange={setModel} onRefresh={() => void refreshModels(model.provider)} compact />
            </div>
          </header>
          <div className="hermes-floating-context-preview">
            <div className="hermes-context-preview-heading"><span>当前上下文</span><span>{context.currentPage}</span></div>
            <div className="hermes-context-preview-grid">
              <span><small>项目</small><strong>{projectName}</strong></span>
              <span><small>模式</small><strong>{context.currentMode}</strong></span>
              <span><small>文件</small><strong>{context.fileCount || context.recentFiles.length}</strong></span>
              <span><small>任务</small><strong>{context.focusTask?.title ?? '暂无'}</strong></span>
            </div>
          </div>
          <div className="hermes-floating-scroll">
            <section className="hermes-floating-section">
              <div className="hermes-floating-section-head"><span>快捷操作</span><span>选择后编辑</span></div>
              <HermesQuickActions actions={FLOATING_HERMES_ACTIONS} onSelect={selectAction} compact />
            </section>
            <section className="hermes-floating-section hermes-floating-conversation">
              <div className="hermes-floating-section-head"><span>最近响应</span>{busyRunId && <span className="hermes-floating-live">处理中</span>}</div>
              {recent.length > 0 ? recent.map((message) => message.role === 'user' ? (
                <HermesPromptRow key={message.id} message={message} />
              ) : (
                <HermesResponseCard key={message.id} message={message} busy={message.id === busyRunId} />
              )) : (
                <div className="hermes-conversation-empty"><Brain size={16} />从当前工作继续，或输入一个任务。</div>
              )}
            </section>
          </div>
          <HermesComposer
            value={input}
            onChange={setInput}
            onSend={() => void send()}
            onStop={() => void stopPrompt()}
            busy={!!busyRunId}
            inputRef={inputRef}
            placeholder="Ask Hermes..."
          />
          <footer className="hermes-floating-foot">
            {error ? <span className="hermes-floating-error">{error}</span> : <span>共享当前项目上下文</span>}
          </footer>
        </section>
      </HermesShell>
    </div>
  )
}
