import { useLayoutEffect, useRef, useState } from 'react'
import type { LayoutItem } from '../lib/grid-layout'
import { clampBounds, layoutExtent } from '../lib/grid-layout'
import { findScrollHost, useGridDragResize, type GridPx } from '../hooks/useGridDragResize'
import { DashboardCard } from './DashboardCard'
import { renderWidget } from './DashboardWidgets'

interface Props {
  items: LayoutItem[]
  onChange: (next: LayoutItem) => void
  onRemove: (id: string) => void
}

const ROWS = 64
const CELL = 90

/**
 * Free-form dashboard grid. The canvas hugs its content: its width is the
 * rightmost card extent (never a full viewport grid), so a sparse layout
 * leaves no large empty area on the right. Cards can still be dragged across
 * the whole visible width — the canvas grows elastically on drop.
 */
export function DashboardCanvas({ items, onChange, onRemove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridPx = useGridPx(containerRef)
  const { onDragStart, onResizeStart } = useGridDragResize({
    containerRef,
    onChange,
    rows: ROWS,
    items
  })

  // Rightmost column actually occupied by a card.
  const contentCols = Math.max(
    4,
    items.reduce((m, it) => Math.max(m, it.x + it.w), 0)
  )
  // Cards are NEVER squeezed horizontally for display: if a card sits beyond
  // the visible column count, the canvas widens and the workspace scrolls.
  // This keeps saved layouts (from a wider window) pixel-stable and prevents
  // clamped cards from piling up on top of each other.
  const renderGrid: GridPx = {
    colW: CELL,
    rowH: CELL,
    cols: Math.max(gridPx?.cols ?? 12, contentCols),
    rows: ROWS
  }
  const safeItems = items.map((it) => clampBounds(it, renderGrid))
  // The canvas background always fills the entire visible scroll region (no
  // bare whitespace on the right), and widens further only when a real card
  // sits beyond the viewport edge — then the workspace scrolls horizontally.
  const visibleW = gridPx?.width ?? 0
  const canvasW = Math.max(visibleW, contentCols * CELL + 8)

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        minWidth: canvasW,
        // No maxWidth cap: the canvas is exactly as wide as the content needs
        // it (or the visible workspace, whichever is larger).
        // Center the canvas when the workspace is wider than the content.
        marginInline: 'auto',
        // Height = actual content rows, not the (huge) grid max. Avoids a
        // scroll area full of empty grid that feels "scroll the wrong way".
        minHeight: Math.max(layoutExtent(items).rows, 4) * CELL + 8,
        padding: 4
      }}
    >
      <GridBackground grid={renderGrid} />
      {safeItems.map((item) => (
        <DashboardCard
            key={item.id}
            item={item}
            grid={renderGrid}
            onDragStart={onDragStart}
            onResizeStart={onResizeStart}
            onRemove={onRemove}
            onRename={(t) => onChange({ ...item, title: t })}
            title={item.title}
          >
            {renderWidget(item.kind, item, (patch) =>
              onChange({ ...item, meta: { ...item.meta, ...patch } })
            )}
          </DashboardCard>
      ))}
    </div>
  )
}

function GridBackground({ grid }: { grid: { colW: number; rowH: number; cols: number; rows: number } }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 4,
        pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
        backgroundSize: `${grid.colW}px ${grid.rowH}px`,
        opacity: 0.35,
        // The dashboard grid is a quiet alignment aid, not a hard-edged
        // panel. Fade it before the canvas bounds so dark and blue themes do
        // not produce bright seams where the grid meets the outer backdrop.
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%), linear-gradient(to bottom, transparent 0, black 10%, black 90%, transparent 100%)',
        maskImage:
          'linear-gradient(to right, transparent 0, black 8%, black 92%, transparent 100%), linear-gradient(to bottom, transparent 0, black 10%, black 90%, transparent 100%)',
        WebkitMaskComposite: 'source-in',
        maskComposite: 'intersect'
      }}
      data-cols={grid.cols}
      data-rows={grid.rows}
    />
  )
}

const MAX_COLS = 20 // canvas stops growing past 20 cols (1800px) — wider windows leave the canvas centered
/**
 * Visible size of the outer scroll region — px width + derived column count.
 * Measured in a layout effect and kept in state so the grid (and the "fill the
 * workspace" canvas width) are real from the first committed paint and track
 * window resizes. Never measures during render.
 */
function useGridPx(ref: React.RefObject<HTMLElement | null>): GridPx | null {
  const [px, setPx] = useState<{ width: number; cols: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const host = findScrollHost(el)
    const measure = () => {
      const w = host?.clientWidth || el.clientWidth || window.innerWidth
      if (w > 0) {
        setPx({ width: w, cols: Math.min(MAX_COLS, Math.max(12, Math.ceil(w / CELL))) })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host ?? el)
    return () => ro.disconnect()
  }, [ref])
  if (!px) return null
  return { colW: CELL, rowH: CELL, cols: px.cols, rows: ROWS, width: px.width }
}
