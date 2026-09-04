import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { FileReferenceService } from '../file-reference.service'
import { SettingsService } from '../settings.service'

describe('SettingsService', () => {
  let dir: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-settings-'))
    db = openDb(join(dir, 'test.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns defaults when unset', () => {
    const s = new SettingsService(db)
    expect(s.get('ui.density')).toBe('default')
    expect(s.get('app.theme')).toBe('dark')
  })

  it('persists and reads back a value', () => {
    const s = new SettingsService(db)
    s.set('ui.density', 'compact')
    expect(s.get('ui.density')).toBe('compact')
    // survives reopen
    db.close()
    db = openDb(join(dir, 'test.db'))
    expect(new SettingsService(db).get('ui.density')).toBe('compact')
  })

  it('updates existing values', () => {
    const s = new SettingsService(db)
    s.set('ui.density', 'compact')
    s.set('ui.density', 'comfortable')
    expect(s.get('ui.density')).toBe('comfortable')
  })
})

describe('removeFromProject (data-model 3.0 semantics)', () => {
  let dir: string
  let db: Db
  let projects: ProjectService
  let files: FileReferenceService
  let projectId: string
  let fixturePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-remove-'))
    db = openDb(join(dir, 'test.db'))
    projects = new ProjectService(db)
    files = new FileReferenceService(db)
    projectId = projects.create({ name: 'P' }).id
    fixturePath = join(dir, 'asset.png')
    writeFileSync(fixturePath, 'x')
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('removes ONLY the relation row; FileReference and disk file survive', () => {
    const { file } = files.addReference(projectId, fixturePath)
    files.removeFromProject(projectId, file.id)

    expect(files.listByProject(projectId)).toHaveLength(0)
    // FileReference row still exists
    expect(files.get(file.id)?.status).toBe('available')
    // physical file untouched
    expect(join(dir, 'asset.png')).toBeTruthy()
  })

  it('throws for a non-existing relation', () => {
    expect(() => files.removeFromProject(projectId, 'nope')).toThrow('Relation not found')
  })
})

describe('refreshProjectFiles (Missing surfacing)', () => {
  let dir: string
  let db: Db
  let projects: ProjectService
  let files: FileReferenceService
  let projectId: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-refresh-'))
    db = openDb(join(dir, 'test.db'))
    projects = new ProjectService(db)
    files = new FileReferenceService(db)
    projectId = projects.create({ name: 'P' }).id
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('marks vanished files missing and returns the latest list', () => {
    const p1 = join(dir, 'a.png')
    const p2 = join(dir, 'b.md')
    writeFileSync(p1, 'a')
    writeFileSync(p2, 'b')
    files.addReference(projectId, p1)
    files.addReference(projectId, p2)

    rmSync(p1) // a.png vanishes

    const list = files.refreshProjectFiles(projectId)
    const a = list.find((f) => f.name === 'a.png')
    const b = list.find((f) => f.name === 'b.md')
    expect(a?.status).toBe('missing')
    expect(b?.status).toBe('available')
  })
})

describe('ProjectService.update', () => {
  let dir: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-update-'))
    db = openDb(join(dir, 'test.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('updates name and color', () => {
    const projects = new ProjectService(db)
    const p = projects.create({ name: 'A' })
    const updated = projects.update(p.id, { name: 'A2', color: '#5B8DEF' })
    expect(updated.name).toBe('A2')
    expect(updated.color).toBe('#5B8DEF')
    expect(projects.get(p.id)?.name).toBe('A2')
  })
})
