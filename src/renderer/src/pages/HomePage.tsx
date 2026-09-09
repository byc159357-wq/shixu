import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react'
import type * as React from 'react'
import { Plus, X, CaretRight, CaretLeft, MagnifyingGlass, TrendUp, ArrowUpRight, FolderOpen, Play, Clock, CheckCircle, Sparkle } from '@phosphor-icons/react'
import { useAppStore } from '../store'
import type { LayoutItem, WidgetKind, HabitItem, HabitSuggestResult, IntelligenceSuggestion, WorkMode, WorkspaceAction } from '../../../shared/types'
import { findFreePosition, newId } from '../lib/grid-layout'
import { clampCols } from '../hooks/useGridDragResize'
import { DashboardCanvas } from '../components/DashboardCanvas'
import { WIDGETS, WIDGET_PICKER, ContinueWidget, TodayWidget } from '../components/DashboardWidgets'
import { ConfirmModal } from '../components/ui'

const ROWS = 64

const HABIT_KIND: Record<string, string> = { apps: '软件', images: '图片', docs: '文件', folders: '文件夹', videos: '视频', file: '文件' }

function TodayCenter({ onCustomLayout }: { onCustomLayout: () => void }) {
  const projects = useAppStore((s) => s.projects)
  const currentProjectId = useAppStore((s) => s.currentProjectId)
  const libraryFiles = useAppStore((s) => s.libraryFiles)
  const workspaceContext = useAppStore((s) => s.workspaceContext)
  const openFile = useAppStore((s) => s.openFile)
  const setModule = useAppStore((s) => s.setModule)
  const selectProject = useAppStore((s) => s.selectProject)
  const pushToast = useAppStore((s) => s.pushToast)
  const intelligence = useAppStore((s) => s.intelligence)
  const refreshIntelligence = useAppStore((s) => s.refreshIntelligence)
  const [scenes, setScenes] = useState<WorkMode[]>([])
  const currentProject = workspaceContext?.currentProject ?? projects.find((p) => p.id === currentProjectId) ?? null

  useEffect(() => {
    let alive = true
    void window.workdeck.scenario.list().then((nextScenes: WorkMode[]) => {
      if (!alive) return
      setScenes((nextScenes as WorkMode[]).slice().sort((a, b) => {
        const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0
        const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0
        return bTime - aTime || b.usageCount - a.usageCount
      }).slice(0, 4))
    }).catch(() => { /* empty state remains useful when services are offline */ })
    return () => { alive = false }
  }, [])

  // A loaded but empty context means this is a first run (or there is no
  // recoverable session). Keep the default Today state instead of presenting
  // unrelated library files as if they were the previous workspace.
  const recent = workspaceContext
    ? workspaceContext.recentFiles
    : [...libraryFiles]
      .sort((a, b) => new Date(b.lastOpenedAt ?? b.last_seen_at).getTime() - new Date(a.lastOpenedAt ?? a.last_seen_at).getTime())
      .slice(0, 5)
  const timeline = workspaceContext?.recentActions ?? []
  const actionIcon = (action: WorkspaceAction) => {
    if (action.type === 'project_opened') return FolderOpen
    if (action.type === 'file_opened') return CheckCircle
    if (action.type === 'scene_started') return Play
    return CheckCircle
  }
  const continueWork = () => {
    if (currentProject) {
      void selectProject(currentProject.id)
      return
    }
    const recentFile = recent[0]
    if (recentFile) void openFile(recentFile.id)
    else setModule('projects')
  }

  const runScene = async (scene: WorkMode) => {
    const result = await window.workdeck.scenario.apply(scene.id)
    if (!result.ok) pushToast('error', `部分未打开：${result.errors.join('；')}`)
    else pushToast('success', `已启动「${scene.name}」`)
    const latest = await window.workdeck.scenario.list() as WorkMode[]
    setScenes(latest.slice().sort((a, b) => {
      const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0
      const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0
      return bTime - aTime || b.usageCount - a.usageCount
    }).slice(0, 4))
  }

  const runSuggestion = async (suggestion: IntelligenceSuggestion) => {
    if (suggestion.workModeId) {
      const result = await window.workdeck.scenario.apply(suggestion.workModeId)
      if (!result.ok) pushToast('error', `部分未打开：${result.errors.join('；')}`)
      else pushToast('success', '已恢复最近工作模式')
      return
    }
    if (suggestion.projectId) await selectProject(suggestion.projectId)
    if (suggestion.taskId) await useAppStore.getState().setFocusTask(suggestion.taskId)
  }

  return (
    <main className="workspace today-workspace">
      <header className="today-header">
        <div>
          <div className="today-kicker">TODAY · {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</div>
          <h1>今天，继续向前</h1>
          <p className="today-subtitle">把注意力留给正在发生的工作。</p>
        </div>
        <div className="today-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCustomLayout}>自定义布局</button>
          <button className="btn btn-primary btn-sm" onClick={() => setModule('calendar')}><Clock size={14} /> 打开计划</button>
        </div>
      </header>

      <div className="today-grid">
        <section className="today-panel today-current-project">
          <div className="today-panel-head"><span>继续工作</span><button className="today-link" onClick={() => setModule('projects')}>全部项目 <ArrowUpRight size={14} /></button></div>
          {currentProject || workspaceContext?.focusTask || recent.length > 0 ? (
            <>
              {currentProject && (
                <button className="today-project-card" onClick={() => void selectProject(currentProject.id)}>
                  <span className="today-project-dot" style={{ background: currentProject.color }} />
                  <span><small>正在进行</small><strong>{currentProject.name}</strong><small>{currentProject.description || '继续处理这个项目里的下一件事'}</small></span>
                  <ArrowUpRight size={17} />
                </button>
              )}
              <div className="today-focus-card">
                <span className="file-meta">当前关注</span>
                <strong>{workspaceContext?.focusTask?.title ?? (timeline[0]?.label ?? '还没有指定任务')}</strong>
                {workspaceContext?.focusTask?.due_date && <small>截止 {workspaceContext.focusTask.due_date}</small>}
                {workspaceContext?.currentScene && <small>工作模式：{workspaceContext.currentScene.name}</small>}
                {workspaceContext?.lastActiveTime && <small>上次活动：{new Date(workspaceContext.lastActiveTime).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>}
              </div>
              {recent.length > 0 && (
                <div className="today-context-files">
                  <span className="file-meta">最近文件</span>
                  {recent.slice(0, 3).map((file) => (
                    <button key={file.id} className="today-context-file" onClick={() => void openFile(file.id)}>
                      <span>{file.name}</span><ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              )}
              <button className="btn btn-primary btn-sm today-continue-button" onClick={continueWork}>继续工作 <ArrowUpRight size={14} /></button>
            </>
          ) : <div className="today-empty">还没有上次工作记录，先建立一个项目开始工作。</div>}
        </section>

        <section className="today-panel today-task-panel">
          <div className="today-panel-head"><span>今日进度</span><span className="today-count">待办与逾期</span></div>
          <TodayWidget />
        </section>

        <section className="today-panel today-recent-panel">
          <div className="today-panel-head"><span>最近工作</span><button className="today-link" onClick={() => setModule('library')}>打开文件库 <ArrowUpRight size={14} /></button></div>
          <ContinueWidget />
        </section>

        <section className="today-panel today-scene-panel">
          <div className="today-panel-head"><span>最近工作模式</span><button className="today-link" onClick={() => setModule('scenarios')}>管理模式 <ArrowUpRight size={14} /></button></div>
          {scenes.length ? <div className="today-scene-list">{scenes.map((scene) => <button key={scene.id} className="today-scene-row" onClick={() => void runScene(scene)}><span className="today-scene-icon"><Play size={14} weight="fill" /></span><span><strong>{scene.name}</strong><small>{scene.project ? '含项目恢复' : '未绑定项目'} · 使用 {scene.usageCount} 次{scene.lastUsed ? ` · 最近 ${new Date(scene.lastUsed).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}` : ''}</small></span><ArrowUpRight size={14} /></button>)}</div> : <div className="today-empty">保存一个工作模式后，可以恢复软件、文件、项目和任务。</div>}
        </section>

        <section className="today-panel today-timeline-panel">
          <div className="today-panel-head"><span>Timeline</span><span className="today-count">最近活动</span></div>
          {timeline.length ? <div className="today-timeline">{timeline.map((item) => { const Icon = actionIcon(item); return <div className="today-timeline-row" key={item.id}><span className="today-timeline-line"><Icon size={14} /></span><span><strong>{item.label}</strong><small>{item.detail} · {new Date(item.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span></div> })}</div> : <div className="today-empty">你的工作轨迹会显示在这里。</div>}
        </section>

        <section className="today-panel today-hermes-panel">
          <div className="today-panel-head"><span><Sparkle size={15} /> Hermes Intelligence</span><button className="today-link" onClick={() => void refreshIntelligence()}>刷新分析</button></div>
          {intelligence ? <>
            <p className="today-hermes-copy"><strong>{intelligence.headline}</strong><br />{intelligence.body}</p>
            {intelligence.projectStatuses.length > 0 && <div className="today-intelligence-statuses">{intelligence.projectStatuses.slice(0, 3).map((status) => <div className="today-intelligence-status" key={status.projectId}><span>{status.projectName}</span><small>{status.overdueTasks > 0 ? `${status.overdueTasks} 个逾期` : `${status.openTasks} 个待办`} · {status.risk === 'stalled' ? '需要启动' : status.risk === 'overdue' ? '需优先处理' : '进行中'}</small></div>)}</div>}
            {intelligence.suggestions.length > 0 && <div className="today-hermes-list">{intelligence.suggestions.map((suggestion) => <button key={suggestion.id} className="today-hermes-row" onClick={() => void runSuggestion(suggestion)}><span><strong>{suggestion.title}</strong><small>{suggestion.detail}</small></span><ArrowUpRight size={14} /></button>)}</div>}
          </> : <p className="today-hermes-copy">正在读取当前工作状态…</p>}
        </section>
      </div>
    </main>
  )
}

function defaultLayout(): LayoutItem[] {
  return [
    { id: newId(), kind: 'ai', x: 6, y: 6, w: 3, h: 3 },
    { id: newId(), kind: 'today', x: 0, y: 0, w: 4, h: 3 },
    { id: newId(), kind: 'clock', x: 4, y: 0, w: 2, h: 2 },
    { id: newId(), kind: 'tasks', x: 6, y: 0, w: 6, h: 2 },
    { id: newId(), kind: 'inbox', x: 0, y: 3, w: 4, h: 2 },
    { id: newId(), kind: 'continue', x: 4, y: 3, w: 6, h: 3 },
    { id: newId(), kind: 'recent-files', x: 0, y: 6, w: 6, h: 2 }
  ]
}

export function HomePage() {
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<LayoutItem | null>(null)
  const [habit, setHabit] = useState<HabitSuggestResult | null>(null)
  const homeLayout = useAppStore((s) => s.homeLayout)
  const homeLayoutMode = useAppStore((s) => s.homeLayoutMode)
  const homeLayoutLoaded = useAppStore((s) => s.homeLayoutLoaded)
  const loadHomeLayout = useAppStore((s) => s.loadHomeLayout)
  const setHomeLayoutMode = useAppStore((s) => s.setHomeLayoutMode)
  const setHomeLayoutItems = useAppStore((s) => s.setHomeLayoutItems)
  const saveHomeLayout = useAppStore((s) => s.saveHomeLayout)
  const resetHomeLayout = useAppStore((s) => s.resetHomeLayout)
  const items = homeLayout?.items ?? []
  const loading = !homeLayoutLoaded || !homeLayout
  const fallbackLayout = useMemo(() => defaultLayout(), [])
  const loadProjects = useAppStore((s) => s.loadProjects)
  const refresh = useAppStore((s) => s.refreshAfterFilesChange)
  const pushToast = useAppStore((s) => s.pushToast)

  // Proactive habit prediction on the home landing — loads on its own and
  // re-runs after each open so suggestions track the user's moving context.
  const loadHabit = async () => {
    try {
      setHabit(await window.workdeck.ai.habit())
    } catch {
      setHabit(null)
    }
  }
  useEffect(() => {
    void loadHabit()
  }, [])
  const openHabit = (it: HabitItem) => {
    void window.workdeck.ai.prepareOpen(it).then((err: string) => {
      if (err) pushToast('error', err)
      else {
        pushToast('success', `已打开「${it.name}」`)
        void loadHabit()
      }
    })
  }

  // Horizontal edge hints: show arrows only when cards are actually off-screen.
  // The canvas hugs its content (width = rightmost card extent), so overflow
  // only exists when real cards sit beyond the visible columns — comparing
  // the cards' true rightmost extent (x + w) against how many columns fit in
  // the viewport shows the arrow only when content truly extends past the edge.
  const wsRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const hintState = useRef({ left: false, right: false })
  useEffect(() => {
    const el = wsRef.current
    if (!el) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Columns that actually fit in the visible scroll region.
        const visibleCols = el.clientWidth / 90
        // Real rightmost card extent (x starts at 0, width `w` in columns).
        const contentRight = items.reduce((m, it) => Math.max(m, it.x + it.w), 0)
        const maxLeft = el.scrollWidth - el.clientWidth
        const left = el.scrollLeft
        const next = {
          left: left > 4,
          right: contentRight > visibleCols && maxLeft - left > 4
        }
        const prev = hintState.current
        if (next.left !== prev.left || next.right !== prev.right) {
          hintState.current = next
          setCanScrollLeft(next.left)
          setCanScrollRight(next.right)
        }
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [items])

  useEffect(() => {
    void loadHomeLayout(fallbackLayout)
    // Ensure dashboard widgets have data
    void loadProjects()
    void refresh()
  }, [fallbackLayout, loadHomeLayout, loadProjects, refresh])

  const handleChange = useCallback(
    (next: LayoutItem) => {
      setHomeLayoutItems(items.map((it) => (it.id === next.id ? next : it)))
    },
    [items, setHomeLayoutItems]
  )

  const handleRemove = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id)
      if (item) setRemoving(item)
    },
    [items]
  )

  const confirmRemove = useCallback(() => {
    if (!removing) return
    const id = removing.id
    setHomeLayoutItems(items.filter((it) => it.id !== id))
    setRemoving(null)
  }, [items, removing, setHomeLayoutItems])

  const handleAdd = useCallback(
    (kind: WidgetKind) => {
      const size = WIDGETS[kind]?.defaultSize ?? { w: 4, h: 2 }
      const cols = clampCols(window.innerWidth)
      const pos = findFreePosition(items, size.w, size.h, { cols, rows: ROWS })
      if (!pos) return
      const next: LayoutItem[] = [
        ...items,
        { id: newId(), kind, x: pos.x, y: pos.y, w: size.w, h: size.h }
      ]
      setHomeLayoutItems(next)
      setAdding(false)
    },
    [items, setHomeLayoutItems]
  )

  if (homeLayoutMode === 'view') return <TodayCenter onCustomLayout={() => setHomeLayoutMode('edit')} />

  return (
    <main className="workspace" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Subtitle + add action on one line. The section title now lives in the
          top-left corner (SectionCorner), so the hero no longer draws a <h1>.
          .sub keeps its default bottom margin here so the dock (measured at the
          subtitle's bottom + gap) sticks to the cards at the same Y as everywhere
          else — and the roomier workspace is the whole point. */}
      <div className="home-hero" style={{ flexShrink: 0, position: 'relative' }}>
        <div className="sub" style={{ paddingRight: '9rem' }}>
          自由布局 · 拖动卡片调整位置，右下角调整大小
        </div>
        <div className="home-edit-actions" style={{ position: 'absolute', top: 0, right: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => void resetHomeLayout(fallbackLayout)}>恢复默认</button>
          <button className="btn btn-secondary btn-sm" onClick={() => void saveHomeLayout()}>保存布局</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            添加卡片
          </button>
          <button className="btn btn-primary btn-sm" onClick={async () => { await saveHomeLayout(); setHomeLayoutMode('view') }}>完成编辑</button>
        </div>
      </div>

      {habit && habit.items.length > 0 && (
        <div
          className="habit-strip"
          style={{
            flexShrink: 0,
            marginBottom: 'var(--space-4)',
            padding: '0.5rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-soft)',
            border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap'
          }}
        >
          <span
            className="file-name"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            <TrendUp size={14} weight="fill" style={{ color: 'var(--accent)' }} />
            此刻习惯 · {habit.hourLabel}
          </span>
          {habit.items.map((it) => (
            <button
              key={it.path}
              className="chip"
              title={`${it.reason} · ${HABIT_KIND[it.kind] ?? it.kind}`}
              onClick={() => openHabit(it)}
              style={{ cursor: 'pointer' }}
            >
              {it.name}
            </button>
          ))}
        </div>
      )}

      {/* Scroll region — only the cards scroll (v + h). Dragging the empty
          canvas background (not a card) pans the workspace. */}
      <DraggableScroll
        ref={wsRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'grab'
        }}
      >
        {loading ? (
          <div className="skeleton" style={{ height: 400 }} />
        ) : (
          <DashboardCanvas items={items} onChange={handleChange} onRemove={handleRemove} />
        )}
      </DraggableScroll>

      {/* Edge hints — fixed to the viewport, OUTSIDE the scroll region so a
          CSS transform on an ancestor (scroll / motion) can never re-anchor
          them and make them jump or linger. Faded for a smooth transition. */}
      <button
        className={`scroll-hint scroll-hint-left${canScrollLeft ? '' : ' scroll-hint-fade'}`}
        onClick={() => wsRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
        aria-label="滚动到左侧"
        aria-hidden={!canScrollLeft}
      >
        <CaretLeft size={18} weight="bold" />
      </button>
      <button
        className={`scroll-hint scroll-hint-right${canScrollRight ? '' : ' scroll-hint-fade'}`}
        onClick={() => wsRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
        aria-label="滚动到右侧"
        aria-hidden={!canScrollRight}
      >
        <CaretRight size={18} weight="bold" />
      </button>

      {adding && <AddCardModal onPick={handleAdd} onClose={() => setAdding(false)} />}

      {removing && (
        <ConfirmModal
          title="删除卡片"
          message={`确定要删除「${WIDGETS[removing.kind]?.title ?? removing.kind}」卡片吗？删除后卡片上的内容不再显示。`}
          confirmLabel="删除"
          danger
          onConfirm={confirmRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </main>
  )
}

/**
 * Scroll region whose empty background can be panned with the mouse. Pointer
 * presses on a card (or its header / handles) are left alone so card drag and
 * resize keep working; only presses that land on free canvas scroll the view.
 * Uses Pointer Events + setPointerCapture so the drag never drops when the
 * cursor leaves the element and works with touch too.
 */
const DraggableScroll = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, onPointerDown, ...rest }, ref) => {
    const state = useRef({ active: false, startX: 0, startY: 0, l: 0, t: 0 })

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      // Let card drag/resize own the gesture: only the bare canvas pans.
      if (e.button !== 0 || e.target instanceof Element && e.target.closest('[data-card]')) return
      const el = e.currentTarget
      state.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        l: el.scrollLeft,
        t: el.scrollTop
      }
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
      onPointerDown?.(e)
    }

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const s = state.current
      if (!s.active) return
      const el = e.currentTarget
      el.scrollLeft = s.l - (e.clientX - s.startX)
      el.scrollTop = s.t - (e.clientY - s.startY)
    }

    const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!state.current.active) return
      state.current.active = false
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      }
      e.currentTarget.style.cursor = 'grab'
    }

    return (
      <div
        ref={ref}
        {...rest}
        style={{ touchAction: 'none', ...rest.style }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {children}
      </div>
    )
  }
)
DraggableScroll.displayName = 'DraggableScroll'

function AddCardModal({
  onPick,
  onClose
}: {
  onPick: (kind: WidgetKind) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim()
  const groups = WIDGET_PICKER.filter(
    (g) => !query || g.items.some((it) => WIDGETS[it.kind].title.includes(query))
  )
  return (
    <div
      className="modal-overlay motion-backdrop-enter"
      onClick={onClose}
      style={{ alignItems: 'flex-start', paddingTop: '10vh' }}
    >
      <div
        className="card motion-modal-enter"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxHeight: '72vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--space-4)'
        }}
      >
        <div className="card-head" style={{ marginBottom: 'var(--space-3)' }}>
          <h3>添加卡片</h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: 'var(--space-3)' }}>
          <MagnifyingGlass
            size={15}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
          />
          <input
            className="input"
            placeholder="搜索卡片…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 30, width: '100%' }}
          />
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)'
          }}
        >
          {groups.map((g) => (
            <div key={g.category}>
              <div
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--text-3)',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                  paddingLeft: 2
                }}
              >
                {g.category}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {g.items.map((it) => {
                  const info = WIDGETS[it.kind]
                  const IconC = it.icon
                  return (
                    <button
                      key={it.kind}
                      className="file-row"
                      onClick={() => onPick(it.kind)}
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', padding: '0.4rem 0.6rem' }}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          flexShrink: 0,
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--surface-2)',
                          color: 'var(--text-2)'
                        }}
                      >
                        <IconC size={15} />
                      </span>
                      <span className="file-name">{info.title}</span>
                      <span className="file-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {info.defaultSize.w} × {info.defaultSize.h}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="file-meta" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              没有匹配的卡片
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
