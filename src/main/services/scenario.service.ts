import { randomUUID } from 'node:crypto'
import type { Db } from './db'
import { OpenLogService, type OpenLogKind, type OpenLogRow } from './open-log.service'
import type { SceneItem, ScenarioCandidate, ScenarioPreset, ScenarioSuggestion } from '../../shared/types'

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
const DAILY_REVIEW_KEY = 'scenario.dailyReviewDate'
const CANDIDATE_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

interface PresetRow {
  id: string
  name: string
  description: string
  items_json: string
  auto: number
  created_at: string
  updated_at: string
}

interface CandidateRow {
  id: string
  source_key: string
  name: string
  summary: string
  evidence: string
  items_json: string
  confidence: number
  occurrences: number
  last_at: string
  status: ScenarioCandidate['status']
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

export type SceneReviewer = (input: {
  items: SceneItem[]
  occurrences: number
  distinctDays: number
  lastAt: string
}) => Promise<{ name?: string; summary?: string } | null>

function localDay(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function isNoise(item: SceneItem): boolean {
  const path = item.path.toLowerCase()
  const name = item.name.toLowerCase()
  return (
    path.includes('\\appdata\\local\\temp\\') ||
    path.includes('\\windows\\') ||
    /^(explorer|settings|taskmgr|cmd|powershell)(\.exe)?$/.test(name) ||
    /^screenshot|^微信截图/.test(item.name)
  )
}

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
  private reviewer: SceneReviewer | null = null

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

  setReviewer(reviewer: SceneReviewer | null): void {
    this.reviewer = reviewer
  }

  listCandidates(): ScenarioCandidate[] {
    const rows = this.db
      .prepare(`SELECT * FROM scenario_candidates WHERE status = 'pending' ORDER BY confidence DESC, updated_at DESC`)
      .all() as CandidateRow[]
    return rows.map(deserializeCandidate)
  }

  /**
   * Runs once per local calendar day when the app starts. The last completed
   * work burst is first filtered locally; only a repeated, multi-day pattern
   * is eligible for an optional Hermes review. No candidate is auto-saved.
   */
  async reviewDaily(now = new Date()): Promise<ScenarioCandidate[]> {
    const today = localDay(now.toISOString())
    const reviewed = this.setting(DAILY_REVIEW_KEY)
    if (reviewed === today) return this.listCandidates()

    const rows = this.openLog.recent(LEARN_ROWS).reverse()
    const sessions = splitSessions(rows)
    const last = sessions.at(-1)
    if (!last) {
      this.setSetting(DAILY_REVIEW_KEY, today)
      return this.listCandidates()
    }

    const items = distinctSessionItems(last).filter((item) => !isNoise(item))
    const lastAt = last[last.length - 1]?.opened_at ?? now.toISOString()
    const sourceKey = signature(items)
    if (items.length < 2 || !sourceKey) {
      this.setSetting(DAILY_REVIEW_KEY, today)
      return this.listCandidates()
    }

    const matching = sessions
      .map((session) => ({ session, items: distinctSessionItems(session).filter((item) => !isNoise(item)) }))
      .filter((entry) => signature(entry.items) === sourceKey)
    const days = new Set(matching.map((entry) => localDay(entry.session[0]?.opened_at ?? '')))
    if (matching.length < 2 || days.size < 2) {
      this.setSetting(DAILY_REVIEW_KEY, today)
      return this.listCandidates()
    }

    const existing = this.db.prepare(`SELECT * FROM scenario_candidates WHERE source_key = ?`).get(sourceKey) as CandidateRow | undefined
    if (existing?.status === 'blocked' || existing?.status === 'saved') {
      this.setSetting(DAILY_REVIEW_KEY, today)
      return this.listCandidates()
    }
    if (existing?.status === 'dismissed' && now.getTime() - new Date(existing.updated_at).getTime() < CANDIDATE_SNOOZE_MS) {
      this.setSetting(DAILY_REVIEW_KEY, today)
      return this.listCandidates()
    }

    let name = suggestedName(items)
    let summary = `上一次工作中，你连续使用了这 ${items.length} 项内容。`
    if (this.reviewer) {
      try {
        const reviewedCandidate = await this.reviewer({ items, occurrences: matching.length, distinctDays: days.size, lastAt })
        if (reviewedCandidate?.name?.trim()) name = reviewedCandidate.name.trim().slice(0, 40)
        if (reviewedCandidate?.summary?.trim()) summary = reviewedCandidate.summary.trim().slice(0, 160)
      } catch (error) {
        console.warn('[scenario] Hermes review failed; keeping local candidate:', String(error))
      }
    }

    const confidence = Math.min(98, 50 + Math.min(20, matching.length * 8) + Math.min(18, days.size * 6) + 10)
    const evidence = `近 30 天出现 ${matching.length} 次，跨 ${days.size} 天；最近一次为 ${new Date(lastAt).toLocaleString('zh-CN')}。`
    const id = existing?.id ?? randomUUID()
    this.db.prepare(
      `INSERT INTO scenario_candidates (id, source_key, name, summary, evidence, items_json, confidence, occurrences, last_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
       ON CONFLICT(source_key) DO UPDATE SET name = excluded.name, summary = excluded.summary, evidence = excluded.evidence,
         items_json = excluded.items_json, confidence = excluded.confidence, occurrences = excluded.occurrences,
         last_at = excluded.last_at, status = 'pending', updated_at = datetime('now')`
    ).run(id, sourceKey, name, summary, evidence, JSON.stringify(items), confidence, matching.length, lastAt)
    this.setSetting(DAILY_REVIEW_KEY, today)
    return this.listCandidates()
  }

  acceptCandidate(id: string): ScenarioPreset {
    const row = this.db.prepare(`SELECT * FROM scenario_candidates WHERE id = ? AND status = 'pending'`).get(id) as CandidateRow | undefined
    if (!row) throw new Error('场景建议不存在或已处理')
    const candidate = deserializeCandidate(row)
    const created = this.create({ name: candidate.name, description: candidate.summary, items: candidate.items })
    this.db.prepare(`UPDATE scenario_candidates SET status = 'saved', updated_at = datetime('now') WHERE id = ?`).run(id)
    return created
  }

  dismissCandidate(id: string, permanent = false): void {
    this.db.prepare(`UPDATE scenario_candidates SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(permanent ? 'blocked' : 'dismissed', id)
  }

  private setting(key: string): string | null {
    return (this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined)?.value ?? null
  }

  private setSetting(key: string, value: string): void {
    this.db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value)
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

function deserializeCandidate(row: CandidateRow): ScenarioCandidate {
  let items: SceneItem[] = []
  try {
    items = JSON.parse(row.items_json) as SceneItem[]
  } catch {
    items = []
  }
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    evidence: row.evidence,
    items,
    confidence: row.confidence,
    occurrences: row.occurrences,
    lastAt: row.last_at,
    status: row.status,
    createdAt: row.created_at
  }
}
