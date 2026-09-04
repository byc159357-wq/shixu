/**
 * Pure grid-layout helpers used by the dashboard drag/resize system.
 * Coordinate system: columns (x, w) and rows (y, h); both integers.
 * Cell size is decided by CSS — these helpers only deal with grid coordinates.
 */

import type { WidgetKind } from '../../../shared/types'

export type { WidgetKind }

export interface LayoutItem {
  id: string
  kind: WidgetKind
  x: number
  y: number
  w: number
  h: number
  title?: string
  /**
   * Free-pixel position while a drag is in flight (left/top in canvas px).
   * When set, the card renders at this exact position; on mouseup the drag
   * snaps back to grid coordinates (x/y) and this is cleared.
   */
  px?: { left: number; top: number }
  /** Free-form per-card config; layout logic ignores it, persistence keeps it. */
  meta?: Record<string, unknown>
}

export interface GridSize {
  cols: number
  rows: number
}

export const MIN_DIM = 2

/** Clamp an item inside the grid, return a new object. */
export function clampBounds(item: LayoutItem, grid: GridSize): LayoutItem {
  const w = Math.max(MIN_DIM, Math.min(grid.cols, item.w))
  const h = Math.max(MIN_DIM, Math.min(grid.rows - item.y, item.h))
  const x = Math.max(0, Math.min(grid.cols - w, item.x))
  const y = Math.max(0, Math.min(grid.rows - h, item.y))
  return { ...item, x, y, w, h }
}

/** Find the first free (x, y) that fits a w×h item (top-left scan). */
export function findFreePosition(
  items: LayoutItem[],
  w: number,
  h: number,
  grid: GridSize
): { x: number; y: number } | null {
  const occupied = (x: number, y: number) =>
    items.some((it) => x < it.x + it.w && x + w > it.x && y < it.y + it.h && y + h > it.y)
  for (let y = 0; y <= grid.rows - h; y++) {
    for (let x = 0; x <= grid.cols - w; x++) {
      if (!occupied(x, y)) return { x, y }
    }
  }
  return null
}

/** Stable UUID-ish id (no crypto dependency). */
export function newId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Compute the bounding box (right/bottom) of the current layout. */
export function layoutExtent(items: LayoutItem[]): { rows: number } {
  const rows = items.reduce((max, it) => Math.max(max, it.y + it.h), 0)
  return { rows }
}

/** True if a w×h item at (x, y) would overlap any of `others`. */
export function collides(
  x: number,
  y: number,
  self: Pick<LayoutItem, 'w' | 'h'>,
  others: LayoutItem[]
): boolean {
  return others.some(
    (o) => !(x >= o.x + o.w || x + self.w <= o.x || y >= o.y + o.h || y + self.h <= o.y)
  )
}

/**
 * Breadth-first search for the nearest cell that can host `self` without
 * overlapping any other card. Expands one grid step per ring, so the result
 * is the closest free slot to the drop point.
 */
export function findNearestFree(
  x0: number,
  y0: number,
  self: Pick<LayoutItem, 'w' | 'h'>,
  others: LayoutItem[],
  grid: GridSize
): { x: number; y: number } | null {
  const queue: Array<{ x: number; y: number }> = [{ x: x0, y: y0 }]
  const visited = new Set<string>()
  let guard = 0
  while (queue.length > 0 && guard < 4096) {
    guard++
    const c = queue.shift()!
    const key = `${c.x},${c.y}`
    if (visited.has(key)) continue
    visited.add(key)
    if (c.x < 0 || c.y < 0 || c.x > grid.cols - self.w || c.y > grid.rows - self.h) continue
    if (!collides(c.x, c.y, self, others)) return c
    queue.push({ x: c.x + 1, y: c.y })
    queue.push({ x: c.x - 1, y: c.y })
    queue.push({ x: c.x, y: c.y + 1 })
    queue.push({ x: c.x, y: c.y - 1 })
  }
  return null
}

/**
 * Repair a layout whose cards overlap each other (e.g. saved under a wider
 * column count and then squeezed). Each overlapping card is moved to the
 * nearest free cell; cards that don't overlap anything keep their position,
 * even when they sit beyond `grid.cols` — the canvas widens to fit them.
 */
export function resolveOverlaps(items: LayoutItem[], grid: GridSize): LayoutItem[] {
  const placed: LayoutItem[] = []
  const out: LayoutItem[] = []
  for (const it of items) {
    let next = it
    if (placed.length > 0 && collides(it.x, it.y, it, placed)) {
      const spot = findNearestFree(it.x, it.y, it, placed, grid)
      if (spot) next = { ...it, x: spot.x, y: spot.y }
    }
    placed.push(next)
    out.push(next)
  }
  return out
}