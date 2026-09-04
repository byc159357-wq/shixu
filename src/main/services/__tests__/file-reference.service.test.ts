import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { FileReferenceService } from '../file-reference.service'

function sha256(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

describe('FileReferenceService', () => {
  let dir: string
  let db: Db
  let projects: ProjectService
  let files: FileReferenceService
  let projectId: string
  let fixturePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-files-'))
    db = openDb(join(dir, 'test.db'))
    projects = new ProjectService(db)
    files = new FileReferenceService(db)
    projectId = projects.create({ name: 'P' }).id
    fixturePath = join(dir, 'concept.png')
    writeFileSync(fixturePath, 'fake-png-bytes-123')
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('adds a reference WITHOUT touching the physical file (hash unchanged)', () => {
    const hashBefore = sha256(fixturePath)
    const { file, linked } = files.addReference(projectId, fixturePath)
    expect(linked).toBe(true)
    expect(file.status).toBe('available')
    expect(file.path.endsWith('concept.png')).toBe(true)
    expect(sha256(fixturePath)).toBe(hashBefore)

    const rows = files.listByProject(projectId)
    expect(rows).toHaveLength(1)
    expect(rows[0].path).toBe(file.path)
  })

  it('is idempotent: adding the same file twice keeps one relation row', () => {
    files.addReference(projectId, fixturePath)
    const second = files.addReference(projectId, fixturePath)
    expect(second.linked).toBe(false)
    expect(files.listByProject(projectId)).toHaveLength(1)
  })

  it('normalizes drive letter and separators', () => {
    const { file } = files.addReference(projectId, fixturePath)
    const expected = fixturePath.replace(/\//g, '\\')
    expect(file.path).toBe(expected.charAt(0).toUpperCase() + expected.slice(1))
  })

  it('classifies type by extension', () => {
    const png = join(dir, 'shot.png')
    writeFileSync(png, 'x')
    expect(files.addReference(projectId, png).file.type).toBe('image')

    const psd = join(dir, 'design.psd')
    writeFileSync(psd, 'x')
    expect(files.addReference(projectId, psd).file.type).toBe('design')

    const md = join(dir, 'note.md')
    writeFileSync(md, '# hi')
    expect(files.addReference(projectId, md).file.type).toBe('markdown')
  })

  it('throws for nonexistent files', () => {
    expect(() => files.addReference(projectId, join(dir, 'ghost.pdf'))).toThrow('File not found')
  })

  it('throws for archived projects', () => {
    projects.archive(projectId)
    expect(() => files.addReference(projectId, fixturePath)).toThrow('Project not found or archived')
  })

  it('marks a reference missing when the file vanishes (does not crash)', () => {
    const { file } = files.addReference(projectId, fixturePath)
    rmSync(fixturePath)
    const refreshed = files.refreshStatus(file.id)
    expect(refreshed.status).toBe('missing')

    // relation + reference row are preserved
    expect(files.listByProject(projectId)).toHaveLength(1)
  })

  it('open throws for missing files and never touches the shell', async () => {
    const { file } = files.addReference(projectId, fixturePath)
    rmSync(fixturePath)
    expect(files.refreshStatus(file.id).status).toBe('missing')
    let shellCalled = false
    const svc = new FileReferenceService(db, {
      open: () => {
        shellCalled = true
      },
      reveal: () => {}
    })
    await expect(svc.open(file.id)).rejects.toThrow('File is missing on disk')
    expect(shellCalled).toBe(false)
  })

  it('injects shell ops: open uses the path, reveal uses the path', async () => {
    const opened: string[] = []
    const revealed: string[] = []
    const svc = new FileReferenceService(db, {
      open: (p) => {
        opened.push(p)
      },
      reveal: (p) => {
        revealed.push(p)
      }
    })
    const { file } = svc.addReference(projectId, fixturePath)
    await svc.open(file.id)
    svc.reveal(file.id)
    expect(opened).toEqual([file.path])
    expect(revealed).toEqual([file.path])
  })

  it('reports real size and mtime from disk', () => {
    const { file } = files.addReference(projectId, fixturePath)
    const st = statSync(fixturePath)
    expect(file.size).toBe(st.size)
    expect(file.mtime).toBe(st.mtimeMs)
  })
})
