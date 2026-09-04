import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { LibraryService } from '../library.service'

describe('LibraryService material enhancements (tags / project / sort)', () => {
  let dir: string
  let db: Db
  let svc: LibraryService

  const addFile = (id: string, path: string, name: string, type: string, tagsJson = '[]') => {
    db.prepare(
      `INSERT INTO files (id, path, name, ext, type, size, mtime, tags_json) VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, path, name, '', type, 100, 1, tagsJson)
  }
  const addOpen = (path: string, openedAt: string) => {
    db.prepare(`INSERT INTO open_log (opened_at, kind, name, path) VALUES (?,?,?,?)`).run(
      openedAt, 'file', 'x', path
    )
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-libmat-'))
    db = openDb(join(dir, 'test.db'))
    svc = new LibraryService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('projects the parsed tags array alongside tags_json', () => {
    addFile('f1', 'C:/a/psd.png', 'psd.png', 'image', '["海报","设计"]')
    const row = svc.list({ query: 'psd' })[0]
    expect(row.tags).toEqual(['海报', '设计'])
    // original raw field stays usable
    expect(JSON.parse(row.tags_json)).toEqual(['海报', '设计'])
  })

  it('tolerates an empty / invalid tags payload', () => {
    addFile('f1', 'C:/a/a.txt', 'a.txt', 'other')
    addFile('f2', 'C:/b/b.png', 'b.png', 'image', '{not json')
    const a = svc.list({ query: 'a.txt' })[0]
    const b = svc.list({ query: 'b.png' })[0]
    expect(a.tags).toEqual([])
    expect(b.tags).toEqual([])
  })

  it('filters by an exact tag', () => {
    addFile('f1', 'C:/a/psd.png', 'psd.png', 'image', '["海报","设计"]')
    addFile('f2', 'C:/b/icon.png', 'icon.png', 'image', '["图标"]')
    addFile('f3', 'C:/c/poster.svg', 'poster.svg', 'design', '["海报"]')

    const tags = svc.list({ tag: '海报' })
    expect(tags.map((t) => t.id).sort()).toEqual(['f1', 'f3'])

    const none = svc.list({ tag: '不存在的标签' })
    expect(none).toHaveLength(0)
  })

  it('returns distinct tags sorted case-insensitively', () => {
    addFile('f1', 'C:/a/a.png', 'a.png', 'image', '["Logo","海报"]')
    addFile('f2', 'C:/b/b.png', 'b.png', 'image', '["logo"]')
    addFile('f3', 'C:/c/c.png', 'c.png', 'image', '[]')
    expect(svc.tags()).toEqual(['Logo', '海报'])
  })

  it('filters by Workspace 归属 (specific project / unlinked)', () => {
    addFile('f1', 'C:/a/a.txt', 'a.txt', 'other')
    addFile('f2', 'C:/b/b.psd', 'b.psd', 'design')
    db.prepare(`INSERT INTO projects (id, name) VALUES ('p1','Brand')`).run()
    db.prepare(`INSERT INTO project_files (project_id, file_id) VALUES ('p1','f2')`).run()

    const inBrand = svc.list({ project: 'p1' })
    expect(inBrand.map((x) => x.id)).toEqual(['f2'])

    const unlinked = svc.list({ project: 'unlinked' })
    expect(unlinked.map((x) => x.id)).toEqual(['f1'])
  })

  it('sorts by 最近打开 with never-opened files sinking to the bottom', () => {
    addFile('f1', 'C:/a/old.txt', 'old.txt', 'other')
    addFile('f2', 'C:/b/new.txt', 'new.txt', 'other')
    addFile('f3', 'C:/c/never.txt', 'never.txt', 'other')
    addOpen('C:/a/old.txt', '2026-08-19T10:00:00')
    addOpen('C:/b/new.txt', '2026-08-21T10:00:00')

    const rows = svc.list({ sort: 'recent' })
    expect(rows[0].id).toBe('f2')
    expect(rows[1].id).toBe('f1')
    // never opened is always last regardless of how many opens exist
    expect(rows[rows.length - 1].id).toBe('f3')
  })

  it('sorts by 使用次数 (open count, descending)', () => {
    addFile('f1', 'C:/a/one.txt', 'one.txt', 'other')
    addFile('f2', 'C:/b/three.txt', 'three.txt', 'other')
    addFile('f3', 'C:/c/two.txt', 'two.txt', 'other')
    for (let i = 0; i < 3; i++) addOpen('C:/b/three.txt', `2026-08-20T0${i}:00:00`)
    for (let i = 0; i < 2; i++) addOpen('C:/c/two.txt', `2026-08-20T0${i}:00:00`)

    const rows = svc.list({ sort: 'popular' })
    expect(rows[0].id).toBe('f2')
    expect(rows[1].id).toBe('f3')
    expect(rows[2].id).toBe('f1')
  })

  it('recommends files opened together with a seed, labeling the co-use', () => {
    addFile('seed', 'C:/w/poster.psd', 'poster.psd', 'design')
    addFile('logo', 'C:/w/logo.png', 'logo.png', 'image')
    addFile('font', 'C:/w/font.ttf', 'font.ttf', 'other')
    addFile('other', 'C:/x/unrelated.txt', 'unrelated.txt', 'other')
    // burst A: poster + logo + font within minutes
    addOpen('C:/w/poster.psd', '2026-08-21T09:00:00')
    addOpen('C:/w/logo.png', '2026-08-21T09:01:00')
    addOpen('C:/w/font.ttf', '2026-08-21T09:02:00')
    // burst B: unrelated later that day, alone in its own session
    addOpen('C:/x/unrelated.txt', '2026-08-21T20:00:00')

    const rec = svc.recommend({ seedPath: 'C:/w/poster.psd', limit: 3 })
    expect(rec.map((r) => r.id)).toEqual(expect.arrayContaining(['logo', 'font']))
    // co-used files lead with the co-use label, ahead of the orphan "recent" open
    expect(rec[0].reason).toBe('常与「poster.psd」一起用')
    expect(rec[1].reason).toBe('常与「poster.psd」一起用')
    expect(rec[0].id).not.toBe('other')
    expect(rec[1].id).not.toBe('other')
  })

  it('scopes recommendations to the chosen project and labels them accordingly', () => {
    addFile('a', 'C:/p/a.psd', 'a.psd', 'design')
    addFile('b', 'C:/p/b.png', 'b.png', 'image')
    addFile('c', 'C:/q/c.txt', 'c.txt', 'other')
    db.prepare(`INSERT INTO projects (id, name) VALUES ('p1','Brand')`).run()
    db.prepare(`INSERT INTO project_files (project_id, file_id) VALUES ('p1','a'),('p1','b')`).run()
    // another project's file is heavily used — it must stay out of the funnel
    for (let i = 0; i < 5; i++) addOpen('C:/q/c.txt', `2026-08-20T0${i}:00:00`)
    addOpen('C:/p/a.psd', '2026-08-20T12:00:00')

    const rec = svc.recommend({ projectId: 'p1', limit: 3 })
    const ids = rec.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']))
    expect(ids).not.toContain('c')
    for (const r of rec) expect(r.reason).toBe('该项目的常用素材')
    // the more-recently used project file ranks first
    expect(ids[0]).toBe('a')
  })

  it('never recommends paths that are not indexed files (apps / folders)', () => {
    addOpen('C:/Apps/Premiere.exe', '2026-08-21T09:00:00')
    addOpen('C:/Apps/Premiere.exe', '2026-08-21T09:01:00')
    addOpen('C:/Apps/Premiere.exe', '2026-08-21T09:02:00')
    addFile('real', 'C:/w/real.png', 'real.png', 'image')
    addOpen('C:/w/real.png', '2026-08-21T09:03:00')

    const rec = svc.recommend({ limit: 10 })
    const ids = rec.map((r) => r.id)
    expect(ids).toContain('real')
    expect(ids).not.toContainEqual(expect.stringContaining('Premiere.exe'))
  })

  it('honours excludePaths so on-screen files are not re-suggested', () => {
    addFile('f1', 'C:/w/a.png', 'a.png', 'image')
    addFile('f2', 'C:/w/b.png', 'b.png', 'image')
    addOpen('C:/w/a.png', '2026-08-21T09:00:00')
    addOpen('C:/w/b.png', '2026-08-21T09:01:00')

    const rec = svc.recommend({ excludePaths: ['C:/w/a.png'], limit: 10 })
    const ids = rec.map((r) => r.id)
    expect(ids).not.toContain('f1')
    expect(ids).toContain('f2')
  })
})