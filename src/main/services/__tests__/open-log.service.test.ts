import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { OpenLogService } from '../open-log.service'

describe('OpenLogService', () => {
  let dir: string
  let db: Db
  let svc: OpenLogService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-openlog-'))
    db = openDb(join(dir, 'test.db'))
    svc = new OpenLogService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('records an open with defaults (source = box)', () => {
    svc.record({ kind: 'apps', name: '微信.exe', path: 'C:/WeChat/wechat.exe' })
    const rows = svc.recent()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'apps',
      name: '微信.exe',
      path: 'C:/WeChat/wechat.exe',
      source: 'box'
    })
    expect(new Date(rows[0].opened_at).getTime()).not.toBeNaN()
  })

  it('returns most recent opens first', () => {
    svc.record({ kind: 'apps', name: 'A', path: '/a' })
    svc.record({ kind: 'file', name: 'B', path: '/b', source: 'library' })
    const rows = svc.recent()
    expect(rows.map((r) => r.name)).toEqual(['B', 'A'])
  })

  it('respects the limit argument', () => {
    for (let i = 0; i < 5; i++) svc.record({ kind: 'docs', name: `f${i}`, path: `/f${i}` })
    expect(svc.recent(3)).toHaveLength(3)
  })

  it('keeps recording across a db reopen (persisted)', () => {
    svc.record({ kind: 'apps', name: 'App', path: '/app' })
    db.close()
    db = openDb(join(dir, 'test.db'))
    svc = new OpenLogService(db)
    expect(svc.recent().map((r) => r.name)).toEqual(['App'])
  })
})