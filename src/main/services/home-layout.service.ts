import type { Db } from './db'
import type { HomeLayout, LayoutItem } from '../../shared/types'

const KEY = 'workspace.layout'
const LEGACY_KEY = 'home.layout'

/**
 * Persists the user's Workspace layout (version 1). Today uses a fixed
 * template and never calls this service. The old home.layout key is migrated
 * on first read so existing custom layouts are not lost.
 */
export class HomeLayoutService {
  constructor(private db: Db) {}

  get(): HomeLayout | null {
    const row = this.db.prepare(
      `SELECT key, value FROM settings
       WHERE key IN (?, ?)
       ORDER BY CASE key WHEN ? THEN 0 ELSE 1 END
       LIMIT 1`
    ).get(KEY, LEGACY_KEY, KEY) as
      | { key: string; value: string }
      | undefined
    if (!row) return null
    try {
      const parsed = JSON.parse(row.value) as HomeLayout
      if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null
      const layout: HomeLayout = {
        version: 1,
        items: parsed.items.filter(isValidItem)
      }
      if (row.key === LEGACY_KEY) this.save(layout)
      return layout
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
