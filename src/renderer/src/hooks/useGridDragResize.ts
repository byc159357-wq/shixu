import { useCallback, useEffect, useRef } from 'react'
import type { LayoutItem } from '../lib/grid-layout'
import { findNearestFree, MIN_DIM } from '../lib/grid-layout'

interface GridPx {
  /** Width of a single column in px (canvas width / cols). */
  colW: number
  /** Height of a single row in px. */
  rowH: number
  /** Total columns in the grid. */
  cols: number
  /** Total rows; used to clamp items inside the canvas. */
  rows: number
  /** Optional pixel width of the visible scroll region. */
  width?: number
}
export type { GridPx }

/**
 * Drag & resize for a grid-based dashboard.
 *
 * - onDragStart: mousedown on a drag handle — drag the card by mouse delta.
 * - onResizeStart: mousedown on the resize handle — change w/h by mouse delta.
 * - Both snap to integer column/row positions on mouseup.
 *
 * All listeners attach to `window` so dragging continues even when the cursor
 * leaves the card / canvas. We disable text selection while a drag is in flight.
 */
export function useGridDragResize(opts: {
  containerRef: React.RefObject<HTMLElement | null>
  onChange: (next: LayoutItem) => void
  rows?: number
  /** All layout items — used for snap-to-free-cell on mouseup. */
  items: LayoutItem[]
}) {
  const { containerRef, onChange, rows = 64, items } = opts
  const stateRef = useRef<
    | {
        mode: 'drag' | 'resize'
        item: LayoutItem
        startMouse: { x: number; y: number }
        /** Pixel position of the card when the drag started (free-pixel drag). */
        startPx: { left: number; top: number }
        /** Last collision-free pixel position (per axis) — fallback on hit. */
        lastPx: { left: number; top: number }
        /** DOM surface that follows the pointer on the compositor thread. */
        element: HTMLElement | null
        /** Current visual delta, flushed to `transform` at most once per frame. */
        dragOffset: { x: number; y: number }
        grid: GridPx
      }
    | null
  >(null)
  // rAF-throttled pending update: coalesces mousemove bursts into one render
  // per frame so free dragging stays smooth (no per-event React re-renders).
  const pendingRef = useRef<LayoutItem | null>(null)
  const rafRef = useRef<number | null>(null)
  const dragRafRef = useRef<number | null>(null)

  const gridFromContainer = useCallback((): GridPx | null => {
    const el = containerRef.current
    if (!el) return null
    // Measure the outer scroll region, not the canvas itself: the canvas
    // shrinks to hug its content, so its own width would cap how far a card
    // can be dragged to the right.
    const width = scrollHostWidth(el)
    if (width === 0) return null
    // Fixed cell size (90px); columns track the visible width up to 20 cols
    // (1800px max canvas). Wider windows leave the canvas centered.
    const cols = Math.min(20, Math.max(12, Math.ceil(width / MIN_CELL)))
    return { colW: MIN_CELL, rowH: MIN_CELL, cols, rows }
  }, [containerRef, rows])

  const cleanup = useCallback(() => {
    stateRef.current = null
    pendingRef.current = null
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    document.body.classList.remove('is-interacting')
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  // Flush one pending update per animation frame.
  const flush = useCallback(() => {
    rafRef.current = null
    if (pendingRef.current) {
      const next = pendingRef.current
      pendingRef.current = null
      onChange(next)
    }
  }, [onChange])

  const onMouseMove = useCallback((e: MouseEvent) => {
    const s = stateRef.current
    if (!s) return
    const dx = e.clientX - s.startMouse.x
    const dy = e.clientY - s.startMouse.y
    if (s.mode === 'drag') {
      // Free-pixel drag with no collision blocking: the card may glide over
      // other cards while moving. On mouseup it snaps to the nearest FREE
      // cell (BFS), so it never settles inside another card's slot.
      const wPx = s.item.w * s.grid.colW
      const hPx = s.item.h * s.grid.rowH
      const left = clamp(s.startPx.left + dx, 0, s.grid.cols * s.grid.colW - wPx)
      const top = clamp(s.startPx.top + dy, 0, s.grid.rows * s.grid.rowH - hPx)
      s.lastPx.left = left
      s.lastPx.top = top
      // Do not update React state while the cursor is moving. The old path
      // rebuilt the entire dashboard every frame and animated `left/top`,
      // which is why a busy workspace could feel sticky. This one style write
      // per frame stays on the compositor; React receives the final layout
      // only once on release.
      s.dragOffset.x = left - s.startPx.left
      s.dragOffset.y = top - s.startPx.top
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null
          const active = stateRef.current
          if (!active || active.mode !== 'drag' || !active.element) return
          active.element.style.transform = `translate3d(${active.dragOffset.x}px, ${active.dragOffset.y}px, 0)`
        })
      }
    } else {
      // Resize must stay clear of neighbours in real time (unlike drag, which
      // is corrected on mouseup): shrink back if either axis would intrude.
      const dCols = Math.round(dx / s.grid.colW)
      const dRows = Math.round(dy / s.grid.rowH)
      const others = items.filter((it) => it.id !== s.item.id)
      const curLeft = s.item.x * s.grid.colW
      const curTop = s.item.y * s.grid.rowH
      const minDim = s.item.kind === 'ai' ? 3 : MIN_DIM
      let w = clamp(s.item.w + dCols, minDim, s.grid.cols - s.item.x)
      if (
        pxCollides(
          curLeft,
          curTop,
          w * s.grid.colW,
          s.item.h * s.grid.rowH,
          others,
          s.grid
        )
      ) {
        w = s.item.w
      }
      let h = clamp(s.item.h + dRows, minDim, s.grid.rows - s.item.y)
      if (
        pxCollides(
          curLeft,
          curTop,
          w * s.grid.colW,
          h * s.grid.rowH,
          others,
          s.grid
        )
      ) {
        h = s.item.h
      }
      pendingRef.current = { ...s.item, w, h }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush)
      }
    }
  }, [onChange, items, flush])

  const onMouseUp = useCallback(() => {
    const s = stateRef.current
    if (s && s.mode === 'drag') {
      // Snap from the last known legal pixel position (more reliable than the
      // async React items, which may lag the final mousemove).
      const px = { left: s.lastPx.left, top: s.lastPx.top }
      const x0 = clamp(Math.round(px.left / s.grid.colW), 0, s.grid.cols - s.item.w)
      const y0 = clamp(Math.round(px.top / s.grid.rowH), 0, s.grid.rows - s.item.h)
      const others = items.filter((it) => it.id !== s.item.id)
      // BFS outward from the drop point — the card always settles in the
      // NEAREST free cell (never inside another card's slot).
      const best = findNearestFree(x0, y0, s.item, others, s.grid)
      const target = best ?? { x: s.item.x, y: s.item.y }
      // Keep the element visually where the pointer released it while React
      // commits the snapped grid coordinates, then settle it with one short
      // compositor-only transform. This prevents the old one-frame jump.
      if (s.element) {
        const currentLeft = s.item.x * s.grid.colW + 6 + s.dragOffset.x
        const currentTop = s.item.y * s.grid.rowH + 6 + s.dragOffset.y
        const targetLeft = target.x * s.grid.colW + 6
        const targetTop = target.y * s.grid.rowH + 6
        s.element.style.transition = 'none'
        s.element.style.transform = `translate3d(${currentLeft - targetLeft}px, ${currentTop - targetTop}px, 0)`
        requestAnimationFrame(() => {
          const el = s.element
          if (!el) return
          el.style.transition = 'transform var(--dur-slow) var(--ease-spring)'
          el.style.transform = 'translate3d(0, 0, 0)'
          window.setTimeout(() => {
            el.style.removeProperty('transform')
            el.style.removeProperty('transition')
            el.style.removeProperty('will-change')
          }, 360)
        })
      }
      onChange({
        ...s.item,
        x: target.x,
        y: target.y,
        px: undefined
      })
    }
    cleanup()
  }, [onChange, items, cleanup])

  const start = useCallback(
    (mode: 'drag' | 'resize', item: LayoutItem, e: React.MouseEvent) => {
      const grid = gridFromContainer()
      if (!grid) return
      e.preventDefault()
      e.stopPropagation()
      const element = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-card]')
      // Clear any prior release-transition before starting another drag.
      element?.style.removeProperty('transform')
      element?.style.removeProperty('transition')
      element?.style.setProperty('will-change', mode === 'drag' ? 'transform' : 'width, height')
      stateRef.current = {
        mode,
        item,
        startMouse: { x: e.clientX, y: e.clientY },
        startPx: item.px ?? { left: item.x * grid.colW, top: item.y * grid.rowH },
        lastPx: item.px ?? { left: item.x * grid.colW, top: item.y * grid.rowH },
        element,
        dragOffset: { x: 0, y: 0 },
        grid
      }
      document.body.style.userSelect = 'none'
      document.body.classList.add('is-interacting')
      // Native OS cursors — no custom SVG (keeps the OS look & feel).
      document.body.style.cursor = mode === 'drag' ? 'grabbing' : 'se-resize'
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp, { once: true })
    },
    [gridFromContainer, onMouseMove, onMouseUp]
  )

  return {
    onDragStart: (item: LayoutItem, e: React.MouseEvent) => start('drag', item, e),
    onResizeStart: (item: LayoutItem, e: React.MouseEvent) => start('resize', item, e)
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Pixel-space collision check against every other card. */
function pxCollides(
  left: number,
  top: number,
  wPx: number,
  hPx: number,
  others: LayoutItem[],
  grid: GridPx
): boolean {
  return others.some((o) => {
    const oL = o.x * grid.colW
    const oT = o.y * grid.rowH
    const oW = o.w * grid.colW
    const oH = o.h * grid.rowH
    return !(left >= oL + oW || left + wPx <= oL || top >= oT + oH || top + hPx <= oT)
  })
}

/**
 * Walk up the DOM from `el` to the nearest horizontally-scrollable ancestor
 * (the workspace region). Returns null when none exists.
 */
export function findScrollHost(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const ox = getComputedStyle(node).overflowX
    if (ox === 'auto' || ox === 'scroll') return node
    node = node.parentElement
  }
  return null
}

/**
 * Width of the visible scroll region around `el`. Falls back to the element
 * itself and then the window, so it never reports 0 in a real browser.
 */
export function scrollHostWidth(el: HTMLElement): number {
  const host = findScrollHost(el)
  const w = host?.clientWidth || el.clientWidth
  if (w > 0) return w
  return typeof window === 'undefined' ? 0 : window.innerWidth
}

/** Column count by container width — keeps cards readable.
 *  Minimum 6 columns so the default dashboard layout (max card width 6)
 *  never forces cards to overlap when the window narrows. */
export function clampCols(width: number): number {
  if (width < 560) return 6
  if (width < 820) return 8
  if (width < 1120) return 10
  return 12
}

/** Minimum cell width — cards keep this exact size regardless of window
 *  size; below the total grid width the workspace scrolls. */
const MIN_CELL = 90
