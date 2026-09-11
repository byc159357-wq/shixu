import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Brain,
  ChatDots,
  ChatCircleDots,
  Files,
  FolderOpen,
  Gear,
  Lightning,
  Package,
  PushPin,
  Plus,
  Sparkle,
  Trash
} from '@phosphor-icons/react'
import type { AgentProviderInfo } from '../../../../shared/types'
import { Select, type SelectOption } from '../ui'
import { useAppStore } from '../../store'
import {
  inferSessionKind,
  messageContent,
  useHermesStore,
  type HermesSession,
  type HermesSessionKind
} from './HermesStore'
import { HermesComposer } from './HermesComposer'
import { HermesContextPanel } from './HermesContextPanel'
import { HermesQuickActions, FULL_HERMES_ACTIONS, type HermesQuickAction } from './HermesQuickActions'
import { HermesPromptRow, HermesResponseCard } from './HermesResponseCard'
import { HermesShell } from './HermesShell'

const TOOL_KEY = 'wd_agent_tool'
const RELOAD_HINT = '未检测到 Hermes，请确认已安装本地 Agent。'
const FALLBACK_TOOLS: AgentProviderInfo[] = [
  { id: 'hermes', name: 'Hermes', kind: 'external', detail: '本地自主 Agent · 多步执行 / 工具调用 / 权限确认', available: true },
  { id: 'trae', name: 'Trae', kind: 'pending', detail: 'AI 编程 / UI 生成', available: false, note: '待接入' },
  { id: 'workbuddy', name: 'WorkBuddy', kind: 'pending', detail: 'AI 助手', available: false, note: '待接入' }
]

function loadTool(): string {
  try {
    return localStorage.getItem(TOOL_KEY) || 'hermes'
  } catch {
    return 'hermes'
  }
}

function saveTool(value: string) {
  try {
    localStorage.setItem(TOOL_KEY, value)
  } catch {
    /* Ignore unavailable storage. */
  }
}

function sessionPreview(session: HermesSession): string {
  if (session.preview) return session.preview
  const message = [...session.msgs].reverse().find((item) => item.role === 'user')
  return message?.text || messageContent(session.msgs[session.msgs.length - 1] ?? { id: '', role: 'agent', ts: 0 }) || '继续这个任务'
}

export function HermesPage() {
  const setModule = useAppStore((state) => state.setModule)
  const setProjectTab = useAppStore((state) => state.setProjectTab)
  const context = useHermesStore((state) => state.context)
  const history = useHermesStore((state) => state.history)
  const activeId = useHermesStore((state) => state.activeId)
  const busyRunId = useHermesStore((state) => state.busyRunId)
  const model = useHermesStore((state) => state.model)
  const setActiveSession = useHermesStore((state) => state.setActiveSession)
  const updateHistory = useHermesStore((state) => state.updateHistory)
  const setModel = useHermesStore((state) => state.setModel)
  const refreshModels = useHermesStore((state) => state.refreshModels)
  const sendPrompt = useHermesStore((state) => state.sendPrompt)
  const stopPrompt = useHermesStore((state) => state.stopPrompt)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [toolId, setToolId] = useState(loadTool)
  const [tools, setTools] = useState<AgentProviderInfo[]>(FALLBACK_TOOLS)
  const [hermesOk, setHermesOk] = useState<boolean | null>(null)
  const [hermesReason, setHermesReason] = useState<string | null>(null)
  const [reauthMode, setReauthMode] = useState(false)
  const [reauthFeedback, setReauthFeedback] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
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
    let alive = true
    void window.workdeck?.agent?.listProviders?.().then((list: AgentProviderInfo[]) => {
      if (alive && list?.length) setTools(list)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])

  useEffect(() => {
    void refreshModels(toolId)
  }, [refreshModels, toolId])

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
  const visibleSessions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return history.filter((session) => !needle || session.title.toLowerCase().includes(needle) || sessionPreview(session).toLowerCase().includes(needle)).slice(0, 24)
  }, [history, query])

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [activeId, active?.msgs.length, active?.msgs[active.msgs.length - 1]?.steps?.length])

  const send = async () => {
    const text = input.trim()
    if (!text || busyRunId) return
    setInput('')
    try {
      await sendPrompt({
        text,
        provider: toolId,
        model: model.selectedId || undefined,
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

  const removeSession = (id: string) => {
    updateHistory((sessions) => sessions.filter((session) => session.id !== id))
    if (id === activeId) setActiveSession(null)
  }

  const deleteMessage = (id: string) => {
    updateHistory((sessions) => sessions.map((session) => session.id === activeId
      ? { ...session, msgs: session.msgs.filter((message) => message.id !== id) }
      : session))
  }

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* Ignore clipboard failures. */ }
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

  const togglePin = (id: string) => updateHistory((sessions) => sessions.map((session) => session.id === id ? { ...session, pinned: !session.pinned } : session))
  const moveSession = (id: string, kind: HermesSessionKind) => updateHistory((sessions) => sessions.map((session) => session.id === id ? { ...session, kind } : session))
  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    updateHistory((sessions) => {
      const from = sessions.findIndex((session) => session.id === dragId)
      const to = sessions.findIndex((session) => session.id === targetId)
      if (from < 0 || to < 0) return sessions
      const next = [...sessions]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDragId(null)
  }

  const selectTool = (value: string) => {
    setToolId(value)
    saveTool(value)
    void refreshModels(value)
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
    startNew(action.prompt)
  }

  const toolOptions: SelectOption[] = tools.map((tool) => ({
    value: tool.id,
    label: tool.kind === 'external' ? tool.name : `${tool.name} · 待接入`,
    disabled: tool.kind !== 'external'
  }))
  const activeTool = tools.find((tool) => tool.id === toolId) ?? FALLBACK_TOOLS.find((tool) => tool.id === toolId)

  return (
    <main className="workspace hermes-page">
      <header className="hermes-page-head">
        <div>
          <div className="hermes-page-eyebrow"><Sparkle size={13} weight="fill" /> HERMES WORKSPACE</div>
          <h1>Hermes</h1>
          <p>理解项目、文件与记忆，把下一步工作放在当前上下文里。</p>
        </div>
        <div className="hermes-page-state">
          <span className={`hermes-state-dot ${hermesOk === false ? 'is-off' : ''}`} />
          <span>{hermesOk === false ? '需要连接' : '本地 Agent 已连接'}</span>
          <span className="hermes-page-kbd">Ctrl + Space 唤醒</span>
        </div>
      </header>

      <HermesShell variant="full" className="hermes-full-shell">
        <aside className="hermes-side">
          <div className="hermes-side-brand">
            <div className="hermes-side-mark"><Sparkle size={16} weight="fill" /></div>
            <div><strong>Hermes</strong><span>Hermes 工作中心</span></div>
          </div>
          <button type="button" className="hermes-new-task" onClick={() => startNew()}><Plus size={14} />新建任务</button>

          <div className="hermes-side-section">
            <div className="hermes-side-label">最近任务</div>
            <div className="hermes-session-search">
              <ChatCircleDots size={13} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索最近任务" />
            </div>
            <div className="hermes-session-list">
              {visibleSessions.length ? visibleSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`hermes-session-row ${session.id === activeId ? 'is-active' : ''}`}
                  draggable
                  onDragStart={() => setDragId(session.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorder(session.id)}
                  onClick={(event) => event.shiftKey ? togglePin(session.id) : setActiveSession(session.id)}
                >
                  <span className="hermes-session-row-main"><span className="hermes-session-row-title">{session.pinned && <PushPin size={10} weight="fill" />}{session.title}</span><small>{sessionPreview(session)}</small></span>
                  <span className="hermes-session-row-actions">
                    <span title={session.kind === 'project' ? '移到聊天' : '移到项目'} onClick={(event) => { event.stopPropagation(); moveSession(session.id, session.kind === 'project' ? 'chat' : 'project') }}>{session.kind === 'project' ? <ChatDots size={12} /> : <FolderOpen size={12} />}</span>
                    <span title={session.pinned ? '取消置顶' : '置顶'} onClick={(event) => { event.stopPropagation(); togglePin(session.id) }}><PushPin size={12} weight={session.pinned ? 'fill' : 'regular'} /></span>
                    <span title="删除" onClick={(event) => { event.stopPropagation(); removeSession(session.id) }}><Trash size={12} /></span>
                  </span>
                </button>
              )) : <div className="hermes-session-empty">还没有 Hermes 任务</div>}
            </div>
          </div>

          <div className="hermes-side-section hermes-side-links">
            <div className="hermes-side-label">当前项目</div>
            <button type="button" onClick={() => { if (context.currentProject) { setModule('projects'); setProjectTab('overview') } }} disabled={!context.currentProject}>
              <FolderOpen size={14} /><span>{context.currentProject?.name ?? '未选择项目'}</span><ArrowRight size={12} />
            </button>
            <button type="button" onClick={() => { if (context.currentProject) { setModule('projects'); setProjectTab('files') } }} disabled={!context.currentProject}>
              <Files size={14} /><span>项目文件</span><ArrowRight size={12} />
            </button>
          </div>

          <div className="hermes-side-section hermes-side-links">
            <div className="hermes-side-label">知识上下文</div>
            <button type="button" onClick={() => { if (context.currentProject) { setModule('projects'); setProjectTab('memory') } }} disabled={!context.currentProject}>
              <Brain size={14} /><span>项目记忆</span><ArrowRight size={12} />
            </button>
            <button type="button" onClick={() => setModule('library')}><Package size={14} /><span>文件库</span><ArrowRight size={12} /></button>
          </div>
        </aside>

        <section className="hermes-conversation-column">
          <header className="hermes-conversation-head">
            <div>
              <span className="hermes-conversation-kicker">当前任务</span>
              <strong>{active?.title ?? '准备开始'}</strong>
            </div>
            <div className="hermes-conversation-tools">
              <Select value={toolId} onChange={selectTool} options={toolOptions} className="hermes-tool-select" />
              {activeTool?.kind === 'external' && !activeTool.available && <span className="hermes-tool-note">{activeTool.note ?? '暂不可用'}</span>}
              <button type="button" className="hermes-icon-button" title="设置" onClick={() => setModule('settings')}><Gear size={15} /></button>
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
              {reauthMode && toolId === 'hermes' && <button type="button" onClick={() => void openLogin}><Lightning size={13} />打开 Hermes 重新登录</button>}
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
            model={model}
            onModelChange={setModel}
            onRefreshModels={() => void refreshModels(toolId)}
            showModelPicker
            inputRef={inputRef}
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
