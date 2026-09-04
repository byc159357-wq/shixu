import type { Db } from './db'
import type { HomeLayout, LayoutItem } from '../../shared/types'

const KEY = 'home.layout'

/**
 * Persists the user's dashboard layout (version 1). Stored as JSON in the
 * settings table — keeps the schema migration surface minimal.
 */
export class HomeLayoutService {
  constructor(private db: Db) {}

  get(): HomeLayout | null {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY) as
      | { value: string }
      | undefined
    if (!row) return null
    try {
      const parsed = JSON.parse(row.value) as HomeLayout
      if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null
      return {
        version: 1,
        items: parsed.items.filter(isValidItem)
      }
    } catch {
      return null
    }
  }

  save(layout: HomeLayout): void {
    if (layout.version !== 1 || !Array.isArray(layout.items)) return
    const items = layout.items.filter(isValidItem)
    const stmt = this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    stmt.run(KEY, JSON.stringify({ version: 1, items }))
  }
}

function isValidItem(it: unknown): it is LayoutItem {
  if (!it || typeof it !== 'object') return false
  const o = it as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.kind === 'string' &&
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.w === 'number' &&
    typeof o.h === 'number'
  )
}