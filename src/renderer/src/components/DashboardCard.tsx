import { useEffect, useState, type ReactNode } from 'react'
import type { LayoutItem } from '../lib/grid-layout'
import type { GridPx } from '../hooks/useGridDragResize'
import { X, DotsSix, PencilSimple } from '@phosphor-icons/react'

interface Props {
  item: LayoutItem
  grid: GridPx
  onDragStart: (item: LayoutItem, e: React.MouseEvent) => void
  onResizeStart: (item: LayoutItem, e: React.MouseEvent) => void
  onRemove: (id: string) => void
  onRename: (title: string) => void
  title?: string
  children: ReactNode
}

/**
 * One dashboard card. Position and size are derived from grid coordinates; the
 * parent supplies the pixel grid. Drag/resize handles wire to the hook.
 */
export function DashboardCard(props: Props) {
  const { item, grid, onDragStart, onResizeStart, onRemove, onRename, title, children } = props
  const [hover, setHover] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const currentTitle = title ?? defaultTitle(item.kind)
  const startEdit = () => {
    setDraft(currentTitle)
    setEditing(true)
  }
  const commitEdit = () => {
    setEditing(false)
    const t = draft.trim()
    if (t && t !== currentTitle) onRename(t)
  }
  const left = item.px?.left ?? item.x * grid.colW + 6 // 6px gutter (12px card gap)
  const top = item.px?.top ?? item.y * grid.rowH + 6
  const width = item.w * grid.colW - 12
  const height = item.h * grid.rowH - 12

  // Release-tracking: while dragging/resizing, suppress the transition so the
  // card follows the cursor 1:1; release re-enables spring easing for the
  // snap-to-cell motion that follows.
  useEffect(() => {
    if (!dragging && !resizing) return
    const onUp = () => {
      // small delay so the final onChange lands before the transition kicks in
      window.setTimeout(() => {
        setDragging(false)
        setResizing(false)
      }, 30)
    }
    window.addEventListener('mouseup', onUp, { once: true })
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragging, resizing])

  const motion = dragging
    ? 'none'
    : 'left var(--dur-slow) var(--ease-spring), top var(--dur-slow) var(--ease-spring), width var(--dur-slow) var(--ease-spring), height var(--dur-slow) var(--ease-spring)'

  return (
    <div
      data-card
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        // Hovered, dragged, or resized cards lift to the top so users can
        // always see / interact with the focused card, never getting hidden
        // behind a neighbour.
        zIndex: dragging || resizing ? 20 : hover ? 10 : undefined,
        transition: motion,
        willChange: dragging || resizing ? 'left, top, width, height' : 'auto'
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={`card lg-card ${dragging || resizing ? 'lg-card-locked' : ''}`}
        onPointerMove={(e) => {
          // Offset-based pointer tracking — updates CSS vars without re-layout,
          // driving the ::before radial glow (Liquid Glass effect).
          const el = e.currentTarget
          el.style.setProperty('--mg-x', `${e.nativeEvent.offsetX}px`)
          el.style.setProperty('--mg-y', `${e.nativeEvent.offsetY}px`)
        }}
        style={{
          margin: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--space-3) var(--space-4)',
          overflow: 'hidden',
          // Collision nudge travels exactly 1/6 of a cell — set from live grid.
          ['--collide-px' as string]: `${grid.colW / 6}px`
        }}
      >
        <div
          onMouseDown={(e) => {
            setDragging(true)
            onDragStart(item, e)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-2)',
            cursor: 'grab',
            opacity: hover ? 1 : 0.6,
            transition: 'opacity var(--dur-fast) var(--ease-out)'
          }}
          title="按住拖动"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <DotsSix size={14} color="var(--text-3)" />
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  else if (e.key === 'Escape') {
                    setDraft(currentTitle)
                    setEditing(false)
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  fontSize: 'var(--fs-body-sm)',
                  fontWeight: 600,
                  width: 'min(220px, 100%)',
                  padding: '1px 6px',
                  border: '1px solid var(--accent, #6c8cff)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-1)',
                  outline: 'none'
                }}
              />
            ) : (
              <span
                className="card-title"
                title="点击重命名"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={startEdit}
                style={{
                  fontSize: 'var(--fs-body-sm)',
                  fontWeight: 600,
                  cursor: 'text',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {currentTitle}
                <PencilSimple
                  size={11}
                  style={{
                    flexShrink: 0,
                    opacity: hover ? 1 : 0,
                    transition: 'opacity var(--dur-fast) var(--ease-out)'
                  }}
                />
              </span>
            )}
          </span>
          <button
            className="icon-btn"
            aria-label="移除卡片"
            aria-hidden={!hover}
            tabIndex={hover ? 0 : -1}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onRemove(item.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              /* Always rendered so the flex layout never shifts on hover.
                 Fades + disables interaction when idle. */
              opacity: hover ? 1 : 0,
              pointerEvents: hover ? 'auto' : 'none',
              transition: 'opacity var(--dur-fast) var(--ease-out)'
            }}
          >
            <X size={14} />
          </button>
        </div>
        {/* Card body is a CSS container: each widget can adapt its layout to
            the card's live size (narrow/wide, short/tall) via @container rules —
            this is what makes every card "scale down into an appropriate style". */}
        <div
          className="card-content"
          style={{ flex: 1, minHeight: 0, overflow: 'auto', containerType: 'size', containerName: 'card' }}
        >
          {children}
        </div>
      </div>
      {/* Resize handle: bottom-right corner — soft light-gray arc hinting resize. */}
      <div
        onMouseDown={(e) => {
          setResizing(true)
          onResizeStart(item, e)
        }}
        title="拖动调整大小"
        style={{
          position: 'absolute',
          right: 5,
          bottom: 5,
          width: 20,
          height: 20,
          cursor: 'se-resize',
          opacity: hover ? 1 : 0,
          transition: 'opacity var(--dur-fast) var(--ease-out)',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path d='M 17 5 A 12 12 0 0 1 5 17' stroke='rgba(20,22,30,0.06)' stroke-width='4' fill='none'/><path d='M 17 5 A 12 12 0 0 1 5 17' stroke='rgba(148,152,162,0.45)' stroke-width='3' fill='none' stroke-linecap='round'/></svg>\")",
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat'
        }}
      />
    </div>
  )
}

function defaultTitle(kind: LayoutItem['kind']): string {
  switch (kind) {
    case 'ai':
      return 'AI 助手'
    case 'today':
      return '今日'
    case 'clock':
      return '时钟'
    case 'tasks':
      return '任务速览'
    case 'continue':
      return '继续上次'
    case 'inbox':
      return '收件箱'
    case 'recent-files':
      return '最近文件'
    case 'apps':
      return '软件启动台'
    case 'images':
      return '图片'
    case 'docs':
      return '文件'
    case 'folders':
      return '文件夹'
    case 'videos':
      return '视频'
    case 'clipboard':
      return '剪贴板历史'
    case 'sysmon':
      return '系统监控'
    case 'quote':
      return '一言格言'
    case 'weather':
      return '天气'
    case 'pomodoro':
      return '番茄专注'
    case 'countdown':
      return '倒计时'
    case 'sticky':
      return '速记布告'
    case 'album':
      return '截图相册'
    case 'digest':
      return '信息聚合'
    case 'flow':
      return '任务流转看板'
  }
}
