import { describe, it, expect } from 'vitest'
import {
  clampBounds,
  collides,
  findFreePosition,
  findNearestFree,
  layoutExtent,
  newId,
  resolveOverlaps,
  type LayoutItem
} from '../grid-layout'

const grid = { cols: 12, rows: 64 }
const item = (overrides: Partial<LayoutItem> = {}): LayoutItem => ({
  id: newId(),
  kind: 'today',
  x: 0,
  y: 0,
  w: 2,
  h: 2,
  ...overrides
})

describe('clampBounds', () => {
  it('clamps x to [0, cols - w]', () => {
    expect(clampBounds(item({ x: -5, w: 4 }), grid)).toMatchObject({ x: 0 })
    expect(clampBounds(item({ x: 999, w: 4 }), grid)).toMatchObject({ x: 8 })
  })

  it('clamps item that overflows bottom to fit inside rows', () => {
    const r = clampBounds(item({ y: 999, h: 2 }), grid)
    expect(r.y + r.h).toBeLessThanOrEqual(grid.rows)
    expect(r.y).toBe(grid.rows - r.h)
  })

  it('clamps width to [MIN_DIM, cols]', () => {
    expect(clampBounds(item({ w: 0 }), grid)).toMatchObject({ w: 2 })
    expect(clampBounds(item({ w: 999 }), grid)).toMatchObject({ w: 12 })
  })

  it('clamps height to at least MIN_DIM', () => {
    expect(clampBounds(item({ h: 0 }), grid)).toMatchObject({ h: 2 })
  })
})

describe('findFreePosition', () => {
  it('returns (0, 0) when grid is empty', () => {
    expect(findFreePosition([], 2, 2, grid)).toEqual({ x: 0, y: 0 })
  })

  it('skips cells overlapped by existing items', () => {
    const items: LayoutItem[] = [item({ x: 0, y: 0, w: 4, h: 2 })]
    expect(findFreePosition(items, 2, 2, grid)).toEqual({ x: 4, y: 0 })
  })

  it('finds row below when column is fully occupied', () => {
    const items: LayoutItem[] = [item({ x: 0, y: 0, w: 12, h: 2 })]
    expect(findFreePosition(items, 2, 2, grid)).toEqual({ x: 0, y: 2 })
  })

  it('returns null when no fit exists', () => {
    const huge: LayoutItem[] = [item({ x: 0, y: 0, w: 12, h: 64 })]
    expect(findFreePosition(huge, 2, 2, grid)).toBeNull()
  })
})

describe('layoutExtent', () => {
  it('returns max y+h across items', () => {
    expect(
      layoutExtent([item({ y: 0, h: 2 }), item({ y: 5, h: 3 })])
    ).toEqual({ rows: 8 })
  })

  it('returns 0 for empty layout', () => {
    expect(layoutExtent([])).toEqual({ rows: 0 })
  })
})

describe('newId', () => {
  it('produces a string starting with c_', () => {
    expect(newId()).toMatch(/^c_/)
  })
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, newId))
    expect(ids.size).toBe(50)
  })
})

describe('collides', () => {
  it('detects intersecting rects', () => {
    const others = [item({ x: 2, y: 2, w: 4, h: 4 })]
    expect(collides(1, 1, { w: 2, h: 2 }, others)).toBe(true)
    expect(collides(6, 2, { w: 2, h: 2 }, others)).toBe(false)
    expect(collides(0, 0, { w: 2, h: 2 }, others)).toBe(false)
  })

  it('touching edges do not collide', () => {
    const others = [item({ x: 2, y: 0, w: 2, h: 2 })]
    expect(collides(0, 0, { w: 2, h: 2 }, others)).toBe(false)
  })
})

describe('findNearestFree', () => {
  it('returns the start cell when free', () => {
    expect(findNearestFree(3, 3, { w: 2, h: 2 }, [], grid)).toEqual({ x: 3, y: 3 })
  })

  it('finds the nearest free cell around an obstacle', () => {
    const others = [item({ x: 2, y: 2, w: 4, h: 4 })]
    expect(findNearestFree(2, 2, { w: 2, h: 2 }, others, grid)).toEqual({ x: 0, y: 2 })
  })

  it('respects grid bounds', () => {
    const full = [item({ x: 0, y: 0, w: 12, h: 64 })]
    expect(findNearestFree(0, 0, { w: 2, h: 2 }, full, grid)).toBeNull()
  })
})

describe('resolveOverlaps', () => {
  it('keeps a clean layout untouched', () => {
    const items = [
      item({ x: 0, y: 0, w: 4, h: 2 }),
      item({ x: 4, y: 0, w: 4, h: 2 }),
      item({ x: 0, y: 2, w: 6, h: 2 })
    ]
    expect(resolveOverlaps(items, grid)).toEqual(items)
  })

  it('moves the later card out of an overlap', () => {
    const a = item({ x: 0, y: 0, w: 4, h: 2 })
    const b = item({ x: 2, y: 0, w: 4, h: 2 }) // overlaps a
    const out = resolveOverlaps([a, b], grid)
    expect(out[0]).toEqual(a)
    expect(collides(out[1].x, out[1].y, out[1], [out[0]])).toBe(false)
  })

  it('repairs a layout squeezed by a narrower column count', () => {
    // Saved at 20 cols, two cards far right; clamped display piled them up.
    const a = item({ x: 0, y: 0, w: 4, h: 2 })
    const b = item({ x: 12, y: 0, w: 4, h: 2 }) // beyond 12-col grid
    const c = item({ x: 12, y: 0, w: 4, h: 2 }) // exact duplicate slot
    const out = resolveOverlaps([a, b, c], { cols: 20, rows: 64 })
    expect(collides(out[1].x, out[1].y, out[1], [out[0]])).toBe(false)
    expect(collides(out[2].x, out[2].y, out[2], [out[0], out[1]])).toBe(false)
    // the non-overlapping far-right card keeps its position
    expect(out[1]).toMatchObject({ x: 12, y: 0 })
  })

  it('result has no overlapping pairs', () => {
    const items = [
      item({ x: 0, y: 0, w: 4, h: 2 }),
      item({ x: 1, y: 1, w: 4, h: 2 }),
      item({ x: 2, y: 0, w: 4, h: 3 }),
      item({ x: 3, y: 1, w: 4, h: 2 })
    ]
    const out = resolveOverlaps(items, grid)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(collides(out[i].x, out[i].y, out[i], [out[j]])).toBe(false)
      }
    }
  })
})