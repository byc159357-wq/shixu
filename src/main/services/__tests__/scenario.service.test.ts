import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ScenarioService, splitSessions, distinctSessionItems, suggestedName, parseNamerReply } from '../scenario.service'
import type { OpenLogRow } from '../open-log.service'

describe('ScenarioService', () => {
  let dir: string
  let db: Db
  let svc: ScenarioService
  const opened: string[] = []
  const open = async (p: string): Promise<string> => {
    opened.push(p)
    return ''
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-scenario-'))
    db = openDb(join(dir, 'test.db'))
    svc = new ScenarioService(db, open)
    opened.length = 0
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const put = (p: string, name: string, kind: string, iso: string) =>
    db.prepare(`INSERT INTO open_log (opened_at, kind, name, path) VALUES (?, ?, ?, ?)`).run(iso, kind, name, p)

  it('renameWithAi renames one preset and persists it', async () => {
    const p = svc.create({
      name: '杂乱名',
      items: [
        { kind: 'apps', name: 'Photoshop.exe', path: '/ps.exe' },
        { kind: 'folders', name: '素材', path: '/materials' }
      ]
    })
    const withNamer = new ScenarioService(
      db,
      open,
      async () => ['海报设计']
    )
    const name = await withNamer.renameWithAi(p.id)
    expect(name).toBe('海报设计')
    const updated = withNamer.list().find((x) => x.id === p.id)
    expect(updated?.name).toBe('海报设计')
  })

  it('renameWithAi falls back to a derived name when no renamer is wired', async () => {
    const p = svc.create({
      name: 'x',
      items: [
        { kind: 'apps', name: 'PS.exe', path: '/ps.exe' },
        { kind: 'apps', name: '素材', path: '/materials' }
      ]
    })
    const name = await svc.renameWithAi(p.id)
    expect(name).toBe('PS.exe、素材')
    expect(svc.list().find((x) => x.id === p.id)?.name).toBe('PS.exe、素材')
  })

  it('creates, lists, updates and removes presets', async () => {
    const p = svc.create({
      name: '做海报',
      items: [
        { kind: 'apps', name: 'Photoshop.exe', path: '/ps.exe' },
        { kind: 'folders', name: '素材', path: '/materials' }
      ]
    })
    expect(p.id).toBeTruthy()
    expect(p.items).toHaveLength(2)
    expect(svc.list()).toHaveLength(1)

    const updated = svc.update(p.id, { name: '做海报 v2', items: [{ kind: 'file', name: 'a.psd', path: '/a.psd' }] })
    expect(updated.name).toBe('做海报 v2')
    expect(updated.items).toHaveLength(1)

    svc.remove(p.id)
    expect(svc.list()).toHaveLength(0)
  })

  it('applies a preset by opening each item and records open_log', async () => {
    const p = svc.create({
      name: '工作台',
      items: [
        { kind: 'apps', name: 'Code.exe', path: '/code.exe' },
        { kind: 'file', name: 'plan.md', path: '/plan.md' }
      ]
    })
    const r = await svc.apply(p.id)
    expect(r.ok).toBe(true)
    expect(opened).toEqual(['/code.exe', '/plan.md'])
    // every open got logged so applying again can be learned / prepared.
    expect(db.prepare(`SELECT count(*) AS n FROM open_log`).get() as { n: number }).toMatchObject({ n: 2 })
  })

  it('reports per-item errors from apply without stopping the batch', async () => {
    const bad = new ScenarioService(db, async (p) => (p === '/gone.exe' ? 'ENOENT' : ''))
    const p = bad.create({
      name: '残局',
      items: [
        { kind: 'apps', name: 'gone.exe', path: '/gone.exe' },
        { kind: 'file', name: 'ok.md', path: '/ok.md' }
      ]
    })
    const r = await bad.apply(p.id)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toContain('gone.exe')
  })

  it('learns a recurring item set and reports its session count', async () => {
    const base = Date.now()
    const t = (minsAgo: number) => new Date(base - minsAgo * 60000).toISOString()
    // Session 1: PS + 素材 + report
    put('/ps.exe', 'Photoshop.exe', 'apps', t(120))
    put('/mat', '素材', 'folders', t(119))
    put('/r.pdf', 'report.pdf', 'docs', t(118))
    // 28 min gap → session 2, the exact same set repeats → pattern fires
    put('/ps.exe', 'Photoshop.exe', 'apps', t(90))
    put('/mat', '素材', 'folders', t(89))
    put('/r.pdf', 'report.pdf', 'docs', t(88))
    // 58 min later → a distinct one-off set, single occurrence, not a pattern
    put('/calc.exe', 'Calc.exe', 'apps', t(30))
    put('/menu.xlsx', 'menu.xlsx', 'docs', t(29))

    const s = await svc.learn()
    expect(s.length).toBeGreaterThan(0)
    const top = s[0]
    const names = new Set(top.items.map((i) => i.name))
    expect(names).toHaveLength(3)
    expect(names).toContain('Photoshop.exe')
    expect(names).toContain('素材')
    expect(names).toContain('report.pdf')
    expect(top.count).toBe(2)
    // no renamer wired → name derives from the top items
    expect(top.name).toBe('Photoshop.exe、素材、report.pdf')
  })

  it('learns nothing useful from single-item-only history', async () => {
    const base = Date.now()
    const t = (minsAgo: number) => new Date(base - minsAgo * 60000).toISOString()
    // Three separate sessions, each containing only one distinct item.
    put('/a.exe', 'A.exe', 'apps', t(180))
    put('/a.exe', 'A.exe', 'apps', t(90))
    put('/b.png', 'b.png', 'images', t(10))
    expect(await svc.learn()).toEqual([])
  })

  it('uses the LLM renamer when one is provided and keeps its name', async () => {
    const base = Date.now()
    const t = (minsAgo: number) => new Date(base - minsAgo * 60000).toISOString()
    put('/ps.exe', 'Photoshop.exe', 'apps', t(120))
    put('/mat', '素材', 'folders', t(119))
    put('/r.pdf', 'report.pdf', 'docs', t(118))
    put('/ps.exe', 'Photoshop.exe', 'apps', t(90))
    put('/mat', '素材', 'folders', t(89))
    put('/r.pdf', 'report.pdf', 'docs', t(88))

    const named = new ScenarioService(
      db,
      open,
      async (groups) => groups.map((g) => `场景：${g[0].name}`)
    )
    const s = await named.learn()
    expect(s[0].name).toBe('场景：Photoshop.exe')
  })

  it('falls back to derived names when the renamer throws', async () => {
    const base = Date.now()
    const t = (minsAgo: number) => new Date(base - minsAgo * 60000).toISOString()
    put('/ps.exe', 'Photoshop.exe', 'apps', t(120))
    put('/mat', '素材', 'folders', t(119))
    put('/ps.exe', 'Photoshop.exe', 'apps', t(90))
    put('/mat', '素材', 'folders', t(89))

    const failing = new ScenarioService(db, open, async () => {
      throw new Error('net down')
    })
    const s = await failing.learn()
    expect(s[0].name).toBe('Photoshop.exe、素材')
  })

  it('creates only a reviewed daily candidate for a repeated multi-day work pattern', async () => {
    put('/ps.exe', 'Photoshop.exe', 'apps', '2026-09-01T09:00:00.000Z')
    put('/mat', '素材', 'folders', '2026-09-01T09:02:00.000Z')
    put('/ps.exe', 'Photoshop.exe', 'apps', '2026-09-02T09:00:00.000Z')
    put('/mat', '素材', 'folders', '2026-09-02T09:02:00.000Z')
    // A one-off pair in the same period must not become another candidate.
    put('/temp.txt', '临时.txt', 'docs', '2026-09-02T11:00:00.000Z')
    put('/other.txt', '其他.txt', 'docs', '2026-09-02T11:02:00.000Z')
    put('/ps.exe', 'Photoshop.exe', 'apps', '2026-09-02T12:00:00.000Z')
    put('/mat', '素材', 'folders', '2026-09-02T12:02:00.000Z')

    svc.setReviewer(async () => ({ name: '海报制作', summary: '稳定的设计工作组合。' }))
    const candidates = await svc.reviewDaily(new Date('2026-09-03T09:00:00.000Z'))
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ name: '海报制作', occurrences: 3, status: 'pending' })

    const preset = svc.acceptCandidate(candidates[0].id)
    expect(preset.name).toBe('海报制作')
    expect(svc.listCandidates()).toEqual([])
  })

  it('does not turn a one-off or noisy session into a daily candidate', async () => {
    put('/tmp/a.txt', 'a.txt', 'docs', '2026-09-02T09:00:00.000Z')
    put('/tmp/b.txt', 'b.txt', 'docs', '2026-09-02T09:02:00.000Z')
    put('C:\\Users\\a\\AppData\\Local\\Temp\\x.tmp', 'x.tmp', 'docs', '2026-09-03T09:00:00.000Z')
    put('/c.txt', 'c.txt', 'docs', '2026-09-03T09:02:00.000Z')
    expect(await svc.reviewDaily(new Date('2026-09-04T09:00:00.000Z'))).toEqual([])
  })

  it('suggestedName joins up to three items and summarizes longer sets', () => {
    expect(
      suggestedName([
        { kind: 'apps', name: 'A', path: '/a' },
        { kind: 'file', name: 'B', path: '/b' }
      ])
    ).toBe('A、B')
    expect(
      suggestedName([
        { kind: 'apps', name: 'A', path: '/a' },
        { kind: 'file', name: 'B', path: '/b' },
        { kind: 'file', name: 'C', path: '/c' },
        { kind: 'file', name: 'D', path: '/d' }
      ])
    ).toBe('A、B、C 等 4 项')
  })

  it('parseNamerReply extracts aligned names in any object/string shape', () => {
    const groups = [
      [{ kind: 'apps', name: 'A', path: '/a' }],
      [{ kind: 'file', name: 'B', path: '/b' }]
    ]
    expect(parseNamerReply('```json\n[{"name":"海报"},{"name":"周报"}]\n```', groups)).toEqual([
      '海报',
      '周报'
    ])
    expect(parseNamerReply('["海报","周报"]', groups)).toEqual(['海报', '周报'])
    // missing / malformed → null so the caller falls back
    expect(parseNamerReply('[{"name":"海报"}]', groups)).toBeNull()
    expect(parseNamerReply('not json at all', groups)).toBeNull()
  })
})

describe('splitSessions / distinctSessionItems', () => {
  const row = (name: string, iso: string): OpenLogRow => ({
    id: 1,
    kind: 'apps',
    name,
    path: `/p/${name}`,
    opened_at: iso,
    source: 'box'
  })

  it('splits bursts separated by a long pause', () => {
    const rows = [
      row('a', '2026-08-21T09:00:00'),
      row('b', '2026-08-21T09:05:00'),
      row('c', '2026-08-21T10:30:00')
    ]
    expect(splitSessions(rows, 25 * 60 * 1000)).toHaveLength(2)
  })

  it('caps the duration of a single session', () => {
    const rows = [
      row('a', '2026-08-21T09:00:00'),
      row('b', '2026-08-21T15:00:00')
    ]
    expect(splitSessions(rows, 25 * 60 * 1000, 4 * 60 * 60 * 1000)).toHaveLength(2)
  })

  it('collapses duplicate paths within a session', () => {
    const rows = [
      row('a', '2026-08-21T09:00:00'),
      row('b', '2026-08-21T09:01:00'),
      row('a', '2026-08-21T09:02:00')
    ]
    const items = distinctSessionItems(rows)
    expect(items).toHaveLength(2)
  })
})
