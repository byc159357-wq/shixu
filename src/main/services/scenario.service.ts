import { randomUUID } from 'node:crypto'
import type { Db } from './db'
import { OpenLogService, type OpenLogKind, type OpenLogRow } from './open-log.service'
import type { SceneItem, ScenarioPreset, ScenarioSuggestion } from '../../shared/types'

/**
 * Scenario presets (场景预设) — V2 of the “帮我准备工作” story.
 *
 * A preset is a named batch of software / files / folders that get opened
 * together, so the user can restore a whole working context with one word
 * (“我要做个海报”). Presets are either saved manually, or **learned** by
 * mining `open_log` for behavior patterns: opens are bucketed into sessions
 * (a burst separated from the next by a long pause), and the item sets that
 * recur across sessions become suggestions the user can approve and save.
 *
 * Everything is deterministic and fully local — the same local-first rule as
 * the rest of Workdeck; no open_log data ever leaves the machine.
 */

const SESSION_GAP_MS = 25 * 60 * 1000 // a new session starts after this pause
const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000 // a single session never spans past this
const LEARN_ROWS = 1500 // how much open_log history we mine

interface PresetRow {
  id: string
  name: string
  description: string
  items_json: string
  auto: number
  created_at: string
  updated_at: string
}

export interface ScenarioInput {
  name: string
  description?: string
  items: SceneItem[]
}

export interface ScenePatch {
  name?: string
  description?: string
  items?: SceneItem[]
}

/** Batch-renamer: given one list of items per candidate, return a short name
 *  per candidate, or `null` to fall back to the derived name for all. */
export type SceneNamer = (groups: SceneItem[][]) => Promise<string[] | null>

/** Fallback name: the top few item names joined (also used by the renderer). */
export function suggestedName(items: SceneItem[]): string {
  const head = items.slice(0, 3).map((i) => i.name).join('、')
  return items.length > 3 ? `${head} 等 ${items.length} 项` : head
}

/** Holds per-scenario naming logic (prompt + parser) shared with the IPC layer. */
export const SCENE_NAMER_SYSTEM = `你是 ATELIER（Windows 本地优先工作台）的「场景命名」助手。下面是几组“常常一起打开过的软件／文件”（一个数组代表一组）。给每组起一个简短、可读的中文场景名（不超过 8 个字），让人一看就知道这是干什么的（例：Photoshop + 素材 + 项目.psd → “海报设计”）。

只输出一个 JSON 数组，元素与输入顺序一一对应，每个元素形如 {"name":"场景名"}。只命名，不要输出解释或 Markdown 代码块。`

/** Parse a batch naming reply into per-group names; `null` on any problem. */
export function parseNamerReply(content: string, groups: SceneItem[][]): string[] | null {
  try {
    const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start < 0 || end <= start) return null
    const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    if (!Array.isArray(arr)) return null
    const names = groups.map((_g, i) => {
      const el = arr[i] as string | { name?: unknown } | undefined
      const raw = typeof el === 'string' ? el : (el as { name?: unknown } | null)?.name
      const nm = typeof raw === 'string' && raw.trim() ? raw.trim() : ''
      return nm.slice(0, 20)
    })
    if (names.some((n) => !n)) return null
    return names
  } catch {
    return null
  }
}

/** Group consecutive opens into sessions; each session is a cohesive work burst. */
export function splitSessions(
  rows: OpenLogRow[],
  gapMs = SESSION_GAP_MS,
  windowMs = SESSION_WINDOW_MS
): OpenLogRow[][] {
  const sessions: OpenLogRow[][] = []
  let cur: OpenLogRow[] = []
  let startTs = 0
  let prevTs = 0
  for (const r of rows) {
    if (r.opened_at == null) continue
    const ts = new Date(r.opened_at).getTime()
    if (Number.isNaN(ts)) continue
    if (cur.length === 0) {
      startTs = ts
    } else if (ts - prevTs > gapMs || ts - startTs > windowMs) {
      sessions.push(cur)
      cur = []
      startTs = ts
    }
    cur.push(r)
    prevTs = ts
  }
  if (cur.length > 0) sessions.push(cur)
  return sessions
}

/** Collapse a session to distinct items (by path), preserving first-seen order. */
export function distinctSessionItems(session: OpenLogRow[]): SceneItem[] {
  const seen = new Map<string, SceneItem>()
  for (const r of session) {
    if (seen.has(r.path)) continue
    seen.set(r.path, { kind: r.kind, name: r.name, path: r.path })
  }
  return [...seen.values()]
}

function toMs(iso: string): number {
  const ts = new Date(iso).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function signature(items: SceneItem[]): string {
  return items
    .map((i) => i.path)
    .sort()
    .join('\u0000')
}

export class ScenarioService {
  private openLog: OpenLogService

  constructor(
    private db: Db,
    /** Opens one path (shell.openPath shape: resolves '' on success). */
    private open: (path: string) => Promise<string>,
    /** Optional batch renamer used by learn(); falls back to `suggestedName`. */
    private namer?: SceneNamer
  ) {
    // Assign after `db` is set — field-initializer order across compilers is unreliable.
    this.openLog = new OpenLogService(this.db)
  }

  list(): ScenarioPreset[] {
    const rows = this.db
      .prepare(`SELECT * FROM scenario_presets ORDER BY updated_at DESC`)
      .all() as PresetRow[]
    return rows.map(deserialize)
  }

  create(input: ScenarioInput): ScenarioPreset {
    const name = input.name.trim() || '未命名场景'
    const now = new Date().toISOString()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO scenario_presets (id, name, description, items_json, auto, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, name, input.description ?? '', JSON.stringify(input.items), now, now)
    return { id, name, description: input.description ?? '', items: input.items, auto: 0, createdAt: now, updatedAt: now }
  }

  private get(id: string): PresetRow | null {
    return (this.db.prepare(`SELECT * FROM scenario_presets WHERE id = ?`).get(id) as
      | PresetRow
      | undefined) ?? null
  }

  update(id: string, patch: ScenePatch): ScenarioPreset {
    const existing = this.get(id)
    if (!existing) throw new Error(`场景不存在：${id}`)
    const name = patch.name !== undefined ? patch.name.trim() || '未命名场景' : existing.name
    const description = patch.description !== undefined ? patch.description : existing.description
    const items = patch.items !== undefined ? patch.items : JSON.parse(existing.items_json) as SceneItem[]
    this.db
      .prepare(
        `UPDATE scenario_presets SET name = ?, description = ?, items_json = ?, updated_at = ? WHERE id = ?`
      )
      .run(name, description, JSON.stringify(items), new Date().toISOString(), id)
    return this.list().find((p) => p.id === id)!
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM scenario_presets WHERE id = ?`).run(id)
  }

  /** Give one preset a better name: LLM-named when a renamer is wired, else
   *  derived from its top items. Persists and returns the new name. */
  async renameWithAi(id: string): Promise<string> {
    const preset = this.list().find((p) => p.id === id)
    if (!preset) throw new Error(`场景不存在：${id}`)
    let name = suggestedName(preset.items)
    if (this.namer && preset.items.length > 0) {
      try {
        const got = await this.namer([preset.items])
        const v = Array.isArray(got) && got[0] ? got[0].trim() : ''
        if (v) name = v.slice(0, 40)
      } catch (err) {
        console.error('[scenario] AI rename failed, using derived name:', String(err))
      }
    }
    this.update(id, { name })
    return name
  }

  /** Mine open_log for recurring item sets and offer them as saveable presets.
   *  Each suggestion gets a concise name — LLM-named when a renamer is wired,
   *  otherwise derived from the top items. */
  async learn(limit = 12): Promise<ScenarioSuggestion[]> {
    const rows = this.openLog.recent(LEARN_ROWS).reverse() // oldest → newest
    const sessions = splitSessions(rows)
    const bySig = new Map<string, { items: SceneItem[]; count: number; lastTs: number }>()
    for (const session of sessions) {
      const items = distinctSessionItems(session)
      if (items.length < 2) continue // single-item bursts are noise, not a scene
      const sig = signature(items)
      const lastTs = Math.max(...items.map((i) => toMs(session.find((s) => s.path === i.path)!.opened_at)))
      const cur = bySig.get(sig)
      if (cur) {
        cur.count++
        if (lastTs > cur.lastTs) {
          cur.lastTs = lastTs
          cur.items = items
        }
      } else {
        bySig.set(sig, { items, count: 1, lastTs })
      }
    }
    const out = [...bySig.values()]
    out.sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)
    const top = out.slice(0, Math.max(1, limit))

    // Optional batch LLM naming; any failure falls back to derived names.
    const groups = top.map((s) => s.items)
    const names: (string | null)[] = groups.map(() => null)
    if (this.namer && groups.length > 0) {
      try {
        const got = await this.namer(groups)
        if (Array.isArray(got)) {
          for (let i = 0; i < groups.length; i++) {
            const v = got[i]?.trim()
            if (v) names[i] = v.slice(0, 40)
          }
        }
      } catch (err) {
        console.error('[scenario] LLM naming failed, using derived names:', String(err))
      }
    }

    return top.map((s, i) => ({
      name: names[i] ?? suggestedName(s.items),
      items: s.items,
      count: s.count,
      lastAt: new Date(s.lastTs).toISOString()
    }))
  }

  /** Open every item in a preset (with an open_log record per item). */
  async apply(id: string): Promise<{ ok: boolean; errors: string[] }> {
    const preset = this.list().find((p) => p.id === id)
    if (!preset) return { ok: false, errors: ['场景不存在'] }
    return this.applyItems(preset.items)
  }

  /** Open an arbitrary batch of items (records each open). Shared by apply() and
   *  the renderer's "补齐剩余项" flow. */
  async applyItems(items: SceneItem[]): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = []
    for (const it of items) {
      try {
        this.openLog.record({
          kind: it.kind as OpenLogKind,
          name: it.name,
          path: it.path,
          source: 'box'
        })
      } catch (err) {
        console.error('[open_log] record scenario open failed:', String(err))
      }
      try {
        const err = await this.open(it.path)
        if (err) errors.push(`${it.name}: ${err}`)
      } catch (err) {
        errors.push(`${it.name}: ${String(err)}`)
      }
    }
    return { ok: errors.length === 0, errors }
  }

  /** After the user opens `path`, check whether they are mid-way into a saved
   *  scenario (≥2 of its items opened in the last few minutes). If so, offer the
   *  missing items to complete the batch — this is what turns “稍打开几项” into
   *  “整套上下文就位”。Returns null when nothing worth offering. */
  complete(path: string, windowMs = 20 * 60 * 1000): {
    presetName: string
    missing: SceneItem[]
  } | null {
    const presets = this.list().filter(
      (p) => p.items.length >= 2 && p.items.some((it) => it.path === path)
    )
    if (presets.length === 0) return null

    const cutoff = Date.now() - windowMs
    const recentPaths = new Set<string>()
    for (const r of this.openLog.recent(500)) {
      const ts = new Date(r.opened_at).getTime()
      if (!Number.isNaN(ts) && ts >= cutoff) recentPaths.add(r.path)
    }

    let best: ScenarioPreset | null = null
    let bestOverlap = 0
    for (const p of presets) {
      const overlap = p.items.filter((it) => recentPaths.has(it.path)).length
      if (overlap >= 2 && overlap > bestOverlap) {
        best = p
        bestOverlap = overlap
      }
    }
    if (!best) return null
    const missing = best.items.filter((it) => !recentPaths.has(it.path))
    if (missing.length === 0) return null
    return { presetName: best.name, missing }
  }
}

function deserialize(row: PresetRow): ScenarioPreset {
  let items: SceneItem[] = []
  try {
    items = JSON.parse(row.items_json) as SceneItem[]
  } catch {
    items = []
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    items,
    auto: row.auto,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}