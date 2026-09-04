import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { FileReferenceService } from '../file-reference.service'

/**
 * Acceptance #1 (product.md §10): data survives close & reopen.
 * The Vertical Slice: create project → reference a real file → close → reopen → both still exist.
 */
describe('persistence (close & reopen)', () => {
  let dir: string
  let dbPath: string
  let fixturePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-persist-'))
    dbPath = join(dir, 'workdeck.db')
    fixturePath = join(dir, 'logo-final.ai')
    writeFileSync(fixturePath, 'fake-ai-artboard')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('project + file reference survive full close & reopen', () => {
    // session 1: create project + add reference
    let db: Db = openDb(dbPath)
    let projects = new ProjectService(db)
    let files = new FileReferenceService(db)
    const p = projects.create({ name: 'Brand Design' })
    const ref = files.addReference(p.id, fixturePath)
    const projectId = p.id
    const fileId = ref.file.id
    db.close()

    // session 2: fresh connection (simulates app restart)
    db = openDb(dbPath)
    projects = new ProjectService(db)
    files = new FileReferenceService(db)

    expect(projects.list().map((x) => x.name)).toEqual(['Brand Design'])
    expect(projects.list()[0].id).toBe(projectId)

    const rows = files.listByProject(projectId)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(fileId)
    expect(rows[0].status).toBe('available')
    expect(rows[0].path).toContain('logo-final.ai')
    db.close()
  })

  it('repeated restarts are stable (3 cycles)', () => {
    let db: Db = openDb(dbPath)
    let projects = new ProjectService(db)
    let files = new FileReferenceService(db)
    const p = projects.create({ name: 'Cycle' })
    const ref = files.addReference(p.id, fixturePath)
    const id = ref.file.id
    db.close()

    for (let i = 0; i < 3; i++) {
      db = openDb(dbPath)
      projects = new ProjectService(db)
      files = new FileReferenceService(db)
      expect(projects.list()).toHaveLength(1)
      expect(files.listByProject(p.id)).toHaveLength(1)
      expect(files.get(id)?.status).toBe('available')
      db.close()
    }
  })
})
