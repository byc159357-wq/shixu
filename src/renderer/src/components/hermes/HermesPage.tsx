import { useCallback, useEffect, useRef, useState } from 'react'
import { Gear, Lightning, Sparkle } from '@phosphor-icons/react'
import { useAppStore } from '../../store'
import {
  inferSessionKind,
  useHermesStore,
  type HermesSessionKind
} from './HermesStore'
import { HermesComposer } from './HermesComposer'
import { HermesContextPanel } from './HermesContextPanel'
import { HermesQuickActions, FULL_HERMES_ACTIONS, type HermesQuickAction } from './HermesQuickActions'
import { HermesPromptRow, HermesResponseCard } from './HermesResponseCard'
import { HermesShell } from './HermesShell'

const RELOAD_HINT = '未检测到 Hermes，请确认已安装本地 Agent。'

/** Hermes is a Workspace module: conversation in the middle, live context on the right. */
export function HermesPage() {
  const setModule = useAppStore((state) => state.setModule)
  const setProjectTab = useAppStore((state) => state.setProjectTab)
  const context = useHermesStore((state) => state.context)
  const history = useHermesStore((state) => state.history)
  const activeId = useHermesStore((state) => state.activeId)
  const busyRunId = useHermesStore((state) => state.busyRunId)
  const setActiveSession = useHermesStore((state) => state.setActiveSession)
  const updateHistory = useHermesStore((state) => state.updateHistory)
  const sendPrompt = useHermesStore((state) => state.sendPrompt)
  const stopPrompt = useHermesStore((state) => state.stopPrompt)
  const [input, setInput] = useState('')
  const [hermesOk, setHermesOk] = useState<boolean | null>(null)
  const [hermesReason, setHermesReason] = useState<string | null>(null)
  const [reauthMode, setReauthMode] = useState(false)
  const [reauthFeedback, setReauthFeedback] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const newSessionKindRef = useRef<HermesSessionKind | null>(null)

  const startNew = useCallback((text = '', kind?: HermesSessionKind) => {
    newSessionKindRef.current = kind ?? (text.trim() ? inferSessionKind(text) : null)
    setActiveSession(null)
    setInput(text)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [setActiveSession])

  useEffect(() => {
    let alive = true
    const agent = window.workdeck?.agent
    const hermes = window.workdeck?.hermes
    if (!agent) {
      setHermesOk(false)
      setReauthMode(true)
      return () => { alive = false }
    }
    void hermes?.check?.().then((result: { available?: boolean; message?: string } | undefined) => {
      if (!alive) return
      setHermesOk(result?.available ?? true)
      setHermesReason(result?.available ? null : (result?.message ?? RELOAD_HINT))
      setReauthMode(!result?.available)
    }).catch((error: unknown) => {
      if (!alive) return
      setHermesOk(false)
      setHermesReason(String((error as Error)?.message ?? error))
      setReauthMode(true)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        startNew()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [startNew])

  const active = history.find((session) => session.id === activeId) ?? null

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [activeId, active?.msgs.length, active?.msgs[active.msgs.length - 1]?.steps?.length])

  const send = async () => {
    const text = input.trim()
    if (!text || busyRunId) return
    setInput('')
    setHermesReason(null)
    try {
      // HermesStore resolves the current provider/model. Provider settings stay
      // in Settings so this Workspace surface remains focused on the task.
      await sendPrompt({
        text,
        sessionId: activeId,
        sessionKind: newSessionKindRef.current ?? inferSessionKind(text)
      })
      newSessionKindRef.current = null
    } catch (error) {
      const clean = String((error as Error)?.message ?? error)
      setHermesReason(clean)
      if (/超时|模型后端|凭证|登录|未授权|401|断开|connection/i.test(clean)) setReauthMode(true)
    }
  }

  const deleteMessage = (id: string) => {
    updateHistory((sessions) => sessions.map((session) => session.id === activeId
      ? { ...session, msgs: session.msgs.filter((message) => message.id !== id) }
      : session))
  }

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* Clipboard is optional. */ }
  }

  const retryMessage = (messageId: string) => {
    if (!active) return
    const index = active.msgs.findIndex((message) => message.id === messageId)
    const previous = active.msgs.slice(0, index).reverse().find((message) => message.role === 'user')
    if (previous?.text) {
      setInput(previous.text)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const openLogin = async () => {
    try {
      const result = await window.workdeck?.hermes?.openLogin?.()
      if (result) setReauthFeedback(`${result.ok ? '✓ ' : '✗ '}${result.message}`)
    } catch (error) {
      setReauthFeedback(`打开失败：${String((error as Error)?.message ?? error)}`)
    }
  }

  const selectAction = (action: HermesQuickAction) => {
    setActiveSession(null)
    setInput(action.prompt)
    newSessionKindRef.current = inferSessionKind(action.prompt)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <main className="workspace hermes-page">
      <header className="hermes-page-head">
        <div>
          <div className="hermes-page-eyebrow"><Sparkle size={13} weight="fill" /> Hermes</div>
          <h1>AI助手</h1>
          <p>理解项目、文件与记忆，帮助完成下一步工作。</p>
        </div>
        <div className="hermes-page-state">
          <span className={`hermes-state-dot ${hermesOk === false ? 'is-off' : ''}`} />
          <span>{hermesOk === false ? '需要连接' : '本地 Agent 已连接'}</span>
          <span className="hermes-page-kbd">Ctrl + Space 唤醒</span>
        </div>
      </header>

      <HermesShell variant="full" className="hermes-full-shell">
        <section className="hermes-conversation-column">
          <header className="hermes-conversation-head">
            <div>
              <span className="hermes-conversation-kicker">当前任务</span>
              <strong>{active?.title ?? '准备开始'}</strong>
            </div>
            <div className="hermes-conversation-tools">
              {hermesOk === false && <span className="hermes-tool-note">{hermesReason ?? '连接 Hermes 以继续'}</span>}
              <button type="button" className="hermes-icon-button" title="Agent 设置" onClick={() => setModule('settings')}>
                <Gear size={15} />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="hermes-conversation-scroll">
            {active?.msgs.length ? (
              <div className="hermes-conversation-list">
                {active.msgs.map((message) => message.role === 'user' ? (
                  <HermesPromptRow key={message.id} message={message} onCopy={copyText} onDelete={deleteMessage} />
                ) : (
                  <HermesResponseCard
                    key={message.id}
                    message={message}
                    busy={message.id === busyRunId}
                    onCopy={copyText}
                    onDelete={deleteMessage}
                    onStop={() => void stopPrompt()}
                    onRetry={() => retryMessage(message.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="hermes-action-start">
                <div className="hermes-action-start-icon"><Sparkle size={18} weight="fill" /></div>
                <strong>从当前工作开始</strong>
                <p>选择一个动作，或者直接描述你要完成的结果。</p>
                <HermesQuickActions actions={FULL_HERMES_ACTIONS} onSelect={selectAction} />
              </div>
            )}
          </div>

          {(reauthMode || hermesReason || reauthFeedback) && (
            <div className="hermes-inline-status">
              {reauthMode && <button type="button" onClick={() => void openLogin}><Lightning size={13} />打开 Hermes 重新登录</button>}
              {hermesReason && <span>{hermesReason}</span>}
              {reauthFeedback && <span>{reauthFeedback}</span>}
            </div>
          )}

          <HermesComposer
            value={input}
            onChange={setInput}
            onSend={() => void send()}
            onStop={() => void stopPrompt()}
            busy={!!busyRunId}
            inputRef={inputRef}
            placeholder="输入任务..."
          />
        </section>

        <HermesContextPanel
          context={context}
          actions={FULL_HERMES_ACTIONS}
          onAction={selectAction}
          onOpenProject={() => { if (context.currentProject) { setModule('projects'); setProjectTab('overview') } }}
          onOpenMemory={() => { if (context.currentProject) { setModule('projects'); setProjectTab('memory') } }}
        />
      </HermesShell>
    </main>
  )
}
