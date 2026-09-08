import { forwardRef, useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react'
import type * as React from 'react'
import { Plus, X, CaretRight, CaretLeft, MagnifyingGlass, TrendUp, ArrowUpRight, FolderOpen, Play, Clock, CheckCircle, Sparkle } from '@phosphor-icons/react'
import { useAppStore } from '../store'
import type { HomeLayout, LayoutItem, WidgetKind, HabitItem, HabitSuggestResult, ScenarioPreset } from '../../../shared/types'
import { findFreePosition, newId, resolveOverlaps } from '../lib/grid-layout'
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
  const setModule = useAppStore((s) => s.setModule)
  const selectProject = useAppStore((s) => s.selectProject)
  const pushToast = useAppStore((s) => s.pushToast)
  const [scenes, setScenes] = useState<ScenarioPreset[]>([])
  const [habit, setHabit] = useState<HabitSuggestResult | null>(null)
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? projects[0]

  useEffect(() => {
    let alive = true
    void Promise.all([
      window.workdeck.scenario.list(),
      window.workdeck.ai.habit()
    ]).then(([nextScenes, nextHabit]) => {
      if (!alive) return
      setScenes((nextScenes as ScenarioPreset[]).slice(0, 4))
      setHabit(nextHabit as HabitSuggestResult)
    }).catch(() => { /* empty state remains useful when services are offline */ })
    return () => { alive = false }
  }, [])

  const recent = [...libraryFiles]
    .sort((a, b) => new Date(b.lastOpenedAt ?? b.last_seen_at).getTime() - new Date(a.lastOpenedAt ?? a.last_seen_at).getTime())
    .slice(0, 5)
  const timeline = [
    ...projects.slice(0, 3).map((project) => ({ id: `project-${project.id}`, label: project.name, detail: '项目更新', at: project.updated_at, icon: FolderOpen })),
    ...recent.slice(0, 3).map((file) => ({ id: `file-${file.id}`, label: file.name, detail: '最近打开', at: file.lastOpenedAt ?? file.last_seen_at, icon: CheckCircle }))
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5)

  const runScene = async (scene: ScenarioPreset) => {
    const result = await window.workdeck.scenario.apply(scene.id)
    if (!result.ok) pushToast('error', `部分未打开：${result.errors.join('；')}`)
    else pushToast('success', `已启动「${scene.name}」`)
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
          <div className="today-panel-head"><span>当前项目</span><button className="today-link" onClick={() => setModule('projects')}>全部项目 <ArrowUpRight size={14} /></button></div>
          {currentProject ? (
            <button className="today-project-card" onClick={() => void selectProject(currentProject.id)}>
              <span className="today-project-dot" style={{ background: currentProject.color }} />
              <span><strong>{currentProject.name}</strong><small>{currentProject.description || '继续处理这个项目里的下一件事'}</small></span>
              <ArrowUpRight size={17} />
            </button>
          ) : <div className="today-empty">还没有项目，先建立一个工作空间。</div>}
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
          <div className="today-panel-head"><span>启动场景</span><button className="today-link" onClick={() => setModule('scenarios')}>管理场景 <ArrowUpRight size={14} /></button></div>
          {scenes.length ? <div className="today-scene-list">{scenes.map((scene) => <button key={scene.id} className="today-scene-row" onClick={() => void runScene(scene)}><span className="today-scene-icon"><Play size={14} weight="fill" /></span><span><strong>{scene.name}</strong><small>{scene.items.length} 个项目 · {scene.auto ? 'AI 学习' : '手动保存'}</small></span><ArrowUpRight size={14} /></button>)}</div> : <div className="today-empty">保存常用组合后，可以一键启动工作模式。</div>}
        </section>

        <section className="today-panel today-timeline-panel">
          <div className="today-panel-head"><span>Timeline</span><span className="today-count">最近活动</span></div>
          {timeline.length ? <div className="today-timeline">{timeline.map((item) => { const Icon = item.icon; return <div className="today-timeline-row" key={item.id}><span className="today-timeline-line"><Icon size={14} /></span><span><strong>{item.label}</strong><small>{item.detail} · {new Date(item.at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</small></span></div> })}</div> : <div className="today-empty">你的工作轨迹会显示在这里。</div>}
        </section>

        <section className="today-panel today-hermes-panel">
          <div className="today-panel-head"><span><Sparkle size={15} /> Hermes 建议</span><span className="today-status-dot">在线</span></div>
          {habit?.items?.length ? <><p className="today-hermes-copy">根据你最近的工作节奏，下一步可以继续：</p><div className="today-hermes-list">{habit.items.slice(0, 3).map((item) => <button key={item.path} className="today-hermes-row" onClick={() => void window.workdeck.ai.prepareOpen(item).then((err: string) => { if (err) pushToast('error', err) })}><span>{item.name}</span><ArrowUpRight size={14} /></button>)}</div></> : <p className="today-hermes-copy">今天还没有足够的上下文。继续工作后，Hermes 会在这里给出更具体的建议。</p>}
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
  const [items, setItems] = useState<LayoutItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<LayoutItem | null>(null)
  const [customLayout, setCustomLayout] = useState(false)
  const [habit, setHabit] = useState<HabitSuggestResult | null>(null)
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
    void window.workdeck.home.getLayout().then((layout: HomeLayout | null) => {
      const saved = layout?.items ?? defaultLayout()
      let migrated = false
      let raw = saved.map((it) => {
        if (it.kind !== 'ai' || (it.w >= 3 && it.h >= 3)) return it
        migrated = true
        return { ...it, w: Math.max(3, it.w), h: Math.max(3, it.h) }
      })
      // Existing users keep their layout; add the new 3×3 AI card to the
      // nearest free slot once, then persist the migrated layout. Older 2×2
      // instances are enlarged and collision-repaired in the same migration.
      if (!saved.some((it) => it.kind === 'ai')) {
        const extent = saved.reduce((m, it) => Math.max(m, it.x + it.w), 12)
        const pos = findFreePosition(saved, 3, 3, { cols: extent + 3, rows: ROWS })
        if (pos) {
          raw = [...raw, { id: newId(), kind: 'ai', x: pos.x, y: pos.y, w: 3, h: 3 }]
          migrated = true
        }
      }
      // Repair layouts whose cards overlap (e.g. saved under a different
      // column count). Cards beyond the visible width stay put — the canvas
      // widens to fit them; only genuinely intersecting cards are moved.
      const extent = raw.reduce((m, it) => Math.max(m, it.x + it.w), 0)
      const resolved = resolveOverlaps(raw, { cols: Math.max(12, extent), rows: ROWS })
      setItems(resolved)
      if (migrated) void window.workdeck.home.saveLayout({ version: 1, items: resolved })
      setLoading(false)
    })
    // Ensure dashboard widgets have data
    void loadProjects()
    void refresh()
  }, [loadProjects, refresh])

  const saveTimer = useRef<number | null>(null)
  const scheduleSave = useCallback((next: LayoutItem[]) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const payload: HomeLayout = {
        version: 1,
        items: next.map((it) => ({
          id: it.id,
          kind: it.kind,
          x: it.x,
          y: it.y,
          w: it.w,
          h: it.h,
          title: it.title,
          meta: it.meta
        }))
      }
      void window.workdeck.home.saveLayout(payload)
    }, 500)
  }, [])

  const handleChange = useCallback(
    (next: LayoutItem) => {
      setItems((prev) => {
        const arr = prev.map((it) => (it.id === next.id ? next : it))
        scheduleSave(arr)
        return arr
      })
    },
    [scheduleSave]
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
    setItems((prev) => {
      const arr = prev.filter((it) => it.id !== id)
      scheduleSave(arr)
      return arr
    })
    setRemoving(null)
  }, [removing, scheduleSave])

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
      setItems(next)
      scheduleSave(next)
      setAdding(false)
    },
    [items, scheduleSave]
  )

  if (!customLayout) return <TodayCenter onCustomLayout={() => setCustomLayout(true)} />

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
        <button
          className="btn btn-primary btn-sm"
          style={{ position: 'absolute', top: 0, right: 0 }}
          onClick={() => setAdding(true)}
        >
          <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          添加卡片
        </button>
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
