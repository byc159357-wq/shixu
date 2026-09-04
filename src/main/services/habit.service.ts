import type { Db } from './db'
import type { OpenLogRow } from './open-log.service'
import { splitSessions } from './scenario.service'

/**
 * 习惯预测 — actively guesses, from your actual open history, what you are
 * most likely to reach for next (regardless of kind: software / file / folder).
 *
 * Unlike "帮我准备工作" (reactive: you click, it fetches recent+frequency),
 * this engine runs proactively at page open and re-ranks as your context
 * moves, blending three signals:
 *   · time-of-day habit — items you tend to open at this hour;
 *   · next-after sequence — what tends to follow the items you just opened;
 *   · recent momentum — items you've been using in the last few work bursts.
 * It is pure local rules (no LLM) so it is instant and deterministic.
 */

export interface HabitItem {
  path: string
  name: string
  kind: string
  score: number
  reason: string
}

export interface HabitSuggestResult {
  /** e.g. "周四 上午" — describes the current time context. */
  hourLabel: string
  items: HabitItem[]
}

interface Meta {
  name: string
  kind: string
}

const LOG_LIMIT = 900
const HOURS = ['凌晨', '凌晨', '凌晨', '凌晨', '凌晨', '凌晨', '清晨', '清晨', '上午', '上午', '上午', '中午', '中午', '下午', '下午', '下午', '下午', '傍晚', '傍晚', '晚上', '晚上', '晚上', '深夜', '深夜']
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function distinctPaths(session: OpenLogRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of session) {
    if (seen.has(r.path)) continue
    seen.add(r.path)
    out.push(r.path)
  }
  return out
}

export class HabitService {
  constructor(private db: Db) {}

  suggest(now: Date = new Date()): HabitSuggestResult {
    const rows = (this.db
      .prepare(`SELECT * FROM open_log ORDER BY opened_at DESC, id DESC LIMIT ${LOG_LIMIT}`)
      .all() as OpenLogRow[]).reverse() // oldest → newest for session splitting
    if (rows.length === 0) {
      return { hourLabel: this.hourLabel(now), items: [] }
    }

    const sessions = splitSessions(rows)
    // meta + timestamps per path
    const meta = new Map<string, Meta>()
    const times = new Map<string, number[]>()
    for (const r of rows) {
      meta.set(r.path, { name: r.name, kind: r.kind })
      const ts = new Date(r.opened_at).getTime()
      const arr = times.get(r.path)
      if (arr) arr.push(ts)
      else times.set(r.path, [ts])
    }

    // A→B transition counts across every session's distinct order.
    const trans = new Map<string, Map<string, number>>()
    for (const session of sessions) {
      const order = distinctPaths(session)
      for (let i = 1; i < order.length; i++) {
        const bucket = trans.get(order[i - 1])
        if (bucket) bucket.set(order[i], (bucket.get(order[i]) ?? 0) + 1)
        else trans.set(order[i - 1], new Map([[order[i], 1]]))
      }
    }

    // Current context = distinct order of the most recent work burst.
    const lastSession = sessions[sessions.length - 1]
    const context = lastSession ? distinctPaths(lastSession) : []
    const contextSet = new Set(context)
    // Recent momentum = count of the last 3 bursts each path appeared in.
    const recent3 = sessions.slice(-3)
    const burstFreq = new Map<string, number>()
    for (const s of recent3) {
      for (const p of distinctPaths(s)) burstFreq.set(p, (burstFreq.get(p) ?? 0) + 1)
    }

    const nowMs = now.getTime()
    const hour = now.getHours()

    const scored = new Map<string, number>()
    const transVal = new Map<string, number>()
    const timeVal = new Map<string, number>()
    const momVal = new Map<string, number>()
    const trigger = new Map<string, string>()

    const candidates = new Set<string>([...times.keys(), ...trans.keys()])
    for (const p of candidates) {
      const ts = times.get(p) ?? []
      if (ts.length === 0) continue

      // 1) time-of-day habit: share of this item's opens landing in the ±1h
      // window AND spanning multiple distinct days. The "multiple days" guard
      // keeps a just-used-this-hour item from being mislabeled as a ritual.
      const winLo = (hour - 1 + 24) % 24
      const winHi = (hour + 1) % 24
      let inWindow = 0
      const inWindowDays = new Set<string>()
      for (const t of ts) {
        const d = new Date(t)
        const h = d.getHours()
        if (h === hour || h === winLo || h === winHi) {
          inWindow++
          inWindowDays.add(d.toDateString())
        }
      }
      const tV = inWindow >= 2 && inWindowDays.size >= 2 ? 10 * (inWindow / ts.length) : 0

      // 2) next-after sequence from the current context.
      let trV = 0
      let trig = ''
      for (let j = 0; j < context.length; j++) {
        const c = context[j]
        const wc = j === context.length - 1 ? 1.5 : 1
        const ctr = trans.get(c)
        if (!ctr) continue
        const n = ctr.get(p)
        if (n) {
          trV += wc * n
          trig = meta.get(c)?.name ?? c
        }
      }

      // 3) recent momentum over the last few bursts.
      const freq3 = burstFreq.get(p) ?? 0
      const lastTs = ts[ts.length - 1]
      const hoursLib = Math.max(0, (nowMs - lastTs) / 3600e3)
      const mVal = Math.log1p(freq3) / Math.log1p(4) + Math.exp(-hoursLib / 120)

      // The item we just opened is the past, not the "next" — skip it.
      if (contextSet.has(p)) continue

      transVal.set(p, trV)
      timeVal.set(p, tV)
      momVal.set(p, mVal)
      trigger.set(p, trig)
      scored.set(p, 1.8 * trV + 1.6 * tV + 1.0 * mVal)
    }

    const items: HabitItem[] = [...scored.entries()]
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([p, s]) => {
        const tv = transVal.get(p) ?? 0
        const tV = timeVal.get(p) ?? 0
        const mv = momVal.get(p) ?? 0
        let reason: string
        if (tv >= 1.5) reason = `打开「${trigger.get(p) ?? '它'}」后常用`
        else if (tV >= 4) reason = '这个点常打开'
        else if (mv >= 0.8) reason = '最近在用的东西'
        else reason = '常用'
        const m = meta.get(p)!
        return { path: p, name: m.name, kind: m.kind, score: Number(s.toFixed(2)), reason }
      })

    return { hourLabel: this.hourLabel(now), items }
  }

  private hourLabel(now: Date): string {
    const wd = WEEKDAYS[now.getDay()]
    const slot = HOURS[now.getHours()] ?? '其他'
    return `${wd} ${slot}`
  }
}