import type { Db } from './db'
import type { AgentAdapter } from './agent-adapter'
import { OpenLogService, type OpenLogRow } from './open-log.service'

/**
 * “帮我准备工作” — gathers recently-used software/files from `open_log`,
 * ranks them (recency × frequency), then optionally asks a configured LLM to
 * pick the top items worth starting with. Degrades gracefully to the pure
 * local heuristic whenever no LLM is configured or the request fails.
 */

export interface PreparedItem {
  path: string
  name: string
  kind: string
  times: number
  lastOpenedAt: string
}

export interface PrepareResult {
  note: string
  items: PreparedItem[]
  source: 'llm' | 'rules'
}

interface TopItem extends PreparedItem {
  lastTs: number
  score: number
}

const PREPARE_PROMPT = `你是拾序（Windows 本地优先个人工作台）的「开工准备」助手。下面是一条“近期曾打开”的清单（软件／文件），用户说“帮我准备工作”，你要挑选其中最值得现在先打开的几项，并写一句简洁（20 字内）的准备说明。

数据格式（JSON 数组）：
[{"name":"示例.exe","kind":"apps","times":12,"last":"2小时前"}, ...]

请只输出一个 JSON 对象：
{"note":"准备说明","order":["名称1","名称2",...]}
- order 从清单里挑选 1-5 个你最建议先打开的（优先级由高到低），名称必须与清单里的 name 完全一致。
- 不要输出任何解释文字或 Markdown 代码块。`

/** Ranks aggregated logs by a blend of frequency (weight) and recency decay. */
function rankRecent(rows: OpenLogRow[]): TopItem[] {
  const map = new Map<string, TopItem>()
  const now = Date.now()
  for (const r of rows) {
    const ts = new Date(r.opened_at).getTime()
    const cur = map.get(r.path)
    if (!cur) {
      map.set(r.path, {
        path: r.path,
        name: r.name,
        kind: r.kind,
        times: 1,
        lastOpenedAt: r.opened_at,
        lastTs: ts,
        score: 0
      })
    } else {
      cur.times++
      if (ts > cur.lastTs) {
        cur.lastTs = ts
        cur.lastOpenedAt = r.opened_at
      }
    }
  }
  const items = [...map.values()]
  for (const it of items) {
    const hours = Math.max(0, (now - it.lastTs) / 3600e3)
    const recency = Math.exp(-hours / 120)
    const freq = Math.log1p(it.times) / Math.log1p(8)
    it.score = 0.6 * freq + 0.4 * recency
  }
  items.sort((a, b) => b.score - a.score)
  return items
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function fallbackNote(items: TopItem[]): string {
  const names = items.slice(0, 5).map((i) => i.name).join('、')
  return `基于近期使用，为你准备了这些：${names}`
}

/** Strip fences / text and parse {note, order}. Returns null on any problem. */
function parsePrepareReply(
  content: string,
  top: TopItem[]
): { note: string; order: string[] } | null {
  try {
    const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as { note?: unknown; order?: unknown }
    const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : ''
    const names = new Set(top.map((i) => i.name))
    const order = Array.isArray(obj.order)
      ? obj.order.filter((n): n is string => typeof n === 'string' && names.has(n))
      : []
    return { note, order }
  } catch {
    return null
  }
}

function reorderTop(top: TopItem[], order: string[]): TopItem[] {
  const byName = new Map(top.map((i) => [i.name, i]))
  const out: TopItem[] = []
  const picked = new Set<string>()
  for (const n of order) {
    const it = byName.get(n)
    if (it && !picked.has(n)) {
      out.push(it)
      picked.add(n)
    }
  }
  for (const it of top) {
    if (!picked.has(it.name)) {
      out.push(it)
      picked.add(it.name)
    }
  }
  return out
}

export class PrepareService {
  constructor(
    private db: Db,
    private getLlm: () => AgentAdapter | null
  ) {}

  async prepare(limit = 5): Promise<PrepareResult> {
    const rows = new OpenLogService(this.db).recent(300)
    if (rows.length === 0) {
      return {
        note: '还没有打开记录。去软件盒或文件库打开一些内容，这里就会为你准备开工清单。',
        items: [],
        source: 'rules'
      }
    }
    const ranked = rankRecent(rows)
    const top = ranked.slice(0, Math.max(limit, 5))

    const llm = this.safeLlm()
    if (llm) {
      try {
        const briefs = top.map((it) => ({
          name: it.name,
          kind: it.kind,
          times: it.times,
          last: relativeTime(it.lastOpenedAt)
        }))
        const reply = await llm.chat([
          { role: 'system', content: PREPARE_PROMPT },
          { role: 'user', content: JSON.stringify(briefs) }
        ])
        const parsed = parsePrepareReply(reply, top)
        if (parsed) {
          const items = reorderTop(top, parsed.order).slice(0, limit)
          return {
            note: parsed.note || fallbackNote(items),
            items: items.map(stripScore),
            source: 'llm'
          }
        }
      } catch (err) {
        console.error('[prepare] LLM rerank failed, using local ranking:', String(err))
      }
    }

    const items = top.slice(0, limit)
    return { note: fallbackNote(items), items: items.map(stripScore), source: 'rules' }
  }

  private safeLlm(): AgentAdapter | null {
    try {
      return this.getLlm()
    } catch {
      return null
    }
  }
}

function stripScore(it: TopItem): PreparedItem {
  return { path: it.path, name: it.name, kind: it.kind, times: it.times, lastOpenedAt: it.lastOpenedAt }
}
