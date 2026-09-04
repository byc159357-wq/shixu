import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'

describe('ProjectService', () => {
  let dir: string
  let db: Db
  let projects: ProjectService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-project-'))
    db = openDb(join(dir, 'test.db'))
    projects = new ProjectService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates and lists a project', () => {
    const p = projects.create({ name: 'Brand Refresh' })
    expect(p.id).toBeTruthy()
    expect(p.name).toBe('Brand Refresh')
    expect(p.status).toBe('active')

    const list = projects.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(p.id)
  })

  it('rejects empty names', () => {
    expect(() => projects.create({ name: '   ' })).toThrow('Project name is required')
  })

  it('updates fields and bumps updated_at', () => {
    const p = projects.create({ name: 'A' })
    const before = p.updated_at
    const updated = projects.update(p.id, { name: 'A2', description: 'desc' })
    expect(updated.name).toBe('A2')
    expect(updated.description).toBe('desc')
    expect(updated.updated_at >= before).toBe(true)
  })

  it('archives soft-delete: disappears from list but row remains', () => {
    const p = projects.create({ name: 'ToArchive' })
    projects.archive(p.id)
    expect(projects.list()).toHaveLength(0)
    expect(projects.get(p.id)?.status).toBe('archived')
  })

  it('throws when updating/archiving unknown ids', () => {
    expect(() => projects.update('nope', { name: 'x' })).toThrow('Project not found')
    expect(() => projects.archive('nope')).toThrow('Project not found')
  })
})
