import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { HabitService } from '../habit.service'

function put(db: Db, p: string, name: string, kind: string, iso: string) {
  db.prepare(`INSERT INTO open_log (opened_at, kind, name, path) VALUES (?, ?, ?, ?)`).run(
    iso,
    kind,
    name,
    p
  )
}

describe('HabitService', () => {
  let dir: string
  let db: Db
  let svc: HabitService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-habit-'))
    db = openDb(join(dir, 'test.db'))
    svc = new HabitService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty suggestions when nothing has been opened', () => {
    const r = svc.suggest(new Date('2026-08-21T09:00:00'))
    expect(r.items).toEqual([])
    expect(r.hourLabel).toBeTruthy()
  })

  it('predicts the "next-after" follower of the most recent item', () => {
    const t = (m: number) => new Date(Date.now() - m).toISOString()
    // two earlier bursts: 浏览器 → 素材文件夹 → PS
    put(db, 'C:/apps/chrome.exe', '浏览器.exe', 'apps', t(130 * 60e3)) // 130 min ago
    put(db, 'C:/materials', '素材库', 'folders', t(129 * 60e3))
    put(db, 'C:/exe/PS.exe', 'PS.exe', 'apps', t(128 * 60e3))
    put(db, 'C:/apps/chrome.exe', '浏览器.exe', 'apps', t(90 * 60e3))
    put(db, 'C:/materials', '素材库', 'folders', t(89 * 60e3))
    put(db, 'C:/exe/PS.exe', 'PS.exe', 'apps', t(88 * 60e3))
    // most recent burst only opened 浏览器 (context = [浏览器])
    put(db, 'C:/apps/chrome.exe', '浏览器.exe', 'apps', t(1 * 60e3))

    const r = svc.suggest()
    // the already-open item itself must not be re-suggested
    expect(r.items.find((i) => i.path === 'C:/apps/chrome.exe')).toBeUndefined()
    // follower of 浏览器 that recurred (素材库) is the top proactive pick
    expect(r.items[0].path).toBe('C:/materials')
    expect(r.items[0].reason).toBe('打开「浏览器.exe」后常用')
    // the second follower PS appears too
    expect(r.items.map((i) => i.path)).toContain('C:/exe/PS.exe')
  })

  it('spots time-of-day habits for the current hour', () => {
    const now = new Date('2026-08-21T09:20:00') // 9 点上下
    // a morning ritual: 邮箱 opened at ~9am across several days (not today)
    put(db, 'C:/apps/outlook.exe', '邮箱.exe', 'apps', '2026-08-17T09:05:00')
    put(db, 'C:/apps/outlook.exe', '邮箱.exe', 'apps', '2026-08-18T09:10:00')
    put(db, 'C:/apps/outlook.exe', '邮箱.exe', 'apps', '2026-08-19T09:00:00')
    put(db, 'C:/apps/outlook.exe', '邮箱.exe', 'apps', '2026-08-20T09:02:00')
    // most recent open is something else — 邮箱 must not be treated as "the past"
    put(db, 'C:/apps/ide.exe', 'IDE.exe', 'apps', '2026-08-21T09:00:00')

    const r = svc.suggest(now)
    const outlook = r.items.find((i) => i.path === 'C:/apps/outlook.exe')
    expect(outlook).toBeTruthy()
    expect(outlook?.reason).toBe('这个点常打开')
  })

  it('recommends things used across the last few bursts via recent momentum', () => {
    const t = (m: number) => new Date(Date.now() - m).toISOString()
    // req.md in two recent bursts (spaced >25min so they are distinct sessions),
    // no day-spanning hour ritual, and not the currently-open item.
    put(db, 'C:/w/req.md', '需求.md', 'file', t(70 * 60e3))
    put(db, 'C:/w/req.md', '需求.md', 'file', t(69 * 60e3))
    put(db, 'C:/w/req.md', '需求.md', 'file', t(30 * 60e3))
    put(db, 'C:/w/req.md', '需求.md', 'file', t(29 * 60e3))
    put(db, 'C:/now/cur.txt', '当前.txt', 'file', t(60e3)) // current context
    const r = svc.suggest()
    const req = r.items.find((i) => i.path === 'C:/w/req.md')
    expect(req).toBeTruthy()
    // single-day, recurring, no strong time/transition signal → momentum label
    expect(req?.reason).toBe('最近在用的东西')
  })

  it('excludes the items from the current context (the past)', () => {
    const t = (m: number) => new Date(Date.now() - m).toISOString()
    put(db, 'C:/a.exe', 'A.exe', 'apps', t(60000))
    const r = svc.suggest()
    expect(r.items.find((i) => i.path === 'C:/a.exe')).toBeUndefined()
  })
})