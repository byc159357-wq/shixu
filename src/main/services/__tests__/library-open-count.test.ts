import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { LibraryService } from '../library.service'

describe('LibraryService open usage aggregation', () => {
  let dir: string
  let db: Db
  let svc: LibraryService

  const addFile = (id: string, path: string, name: string, ext: string, type: string) => {
    db.prepare(
      `INSERT INTO files (id, path, name, ext, type, size, mtime) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, path, name, ext, type, 100, 1)
  }
  const addOpen = (path: string, openedAt: string) => {
    db.prepare(`INSERT INTO open_log (opened_at, kind, name, path) VALUES (?,?,?,?)`).run(
      openedAt, 'file', 'x', path
    )
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-libcount-'))
    db = openDb(join(dir, 'test.db'))
    svc = new LibraryService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports 0 opens for a file that was never opened', () => {
    addFile('f1', 'C:/a/never.txt', 'never.txt', 'txt', 'other')
    const row = svc.list({ query: 'never' })[0]
    expect(row.openCount).toBe(0)
    expect(row.lastOpenedAt).toBeNull()
  })

  it('aggregates open count and reports the most recent open time by path', () => {
    addFile('f1', 'C:/x/report.pdf', 'report.pdf', 'pdf', 'document')
    addOpen('C:/x/report.pdf', '2026-08-20T10:00:00')
    addOpen('C:/x/report.pdf', '2026-08-21T09:00:00')
    addOpen('C:/unrelated.txt', '2026-08-21T11:00:00')

    const row = svc.list({ query: 'report' })[0]
    expect(row.openCount).toBe(2)
    expect(row.lastOpenedAt).toBe('2026-08-21T09:00:00')
  })

  it('keeps projects aggregation alongside open counts', () => {
    addFile('f1', 'C:/x/a.png', 'a.png', 'png', 'image')
    db.prepare(`INSERT INTO projects (id, name) VALUES ('p1','Brand')`).run()
    db.prepare(`INSERT INTO project_files (project_id, file_id) VALUES ('p1','f1')`).run()
    addOpen('C:/x/a.png', '2026-08-21T08:00:00')

    const row = svc.list({ query: 'a.png' })[0]
    expect(row.projects).toEqual(['Brand'])
    expect(row.openCount).toBe(1)
  })
})