import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { HomeLayoutService } from '../home-layout.service'
import type { HomeLayout } from '../../../shared/types'

describe('HomeLayoutService', () => {
  let dir: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-layout-'))
    db = openDb(join(dir, 'test.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('stores the free layout under the Workspace key', () => {
    const service = new HomeLayoutService(db)
    const layout: HomeLayout = { version: 1, items: [] }
    service.save(layout)
    expect(db.prepare(`SELECT value FROM settings WHERE key = 'workspace.layout'`).get()).toBeTruthy()
    expect(db.prepare(`SELECT value FROM settings WHERE key = 'home.layout'`).get()).toBeUndefined()
  })

  it('migrates an existing home layout without changing its contents', () => {
    const layout: HomeLayout = { version: 1, items: [{ id: 'clock', kind: 'clock', x: 0, y: 0, w: 2, h: 2 }] }
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run('home.layout', JSON.stringify(layout))
    const restored = new HomeLayoutService(db).get()
    expect(restored).toEqual(layout)
    expect(db.prepare(`SELECT value FROM settings WHERE key = 'workspace.layout'`).get()).toBeTruthy()
  })
})

