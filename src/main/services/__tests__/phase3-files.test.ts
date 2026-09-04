import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { FileReferenceService } from '../file-reference.service'
import { FileIndexService } from '../file-index.service'
import { InboxService } from '../inbox.service'
import { LibraryService } from '../library.service'
import { AuditLogService, FsMutationService, WatchedFolderService } from '../fs-mutation.service'

describe('FileIndexService', () => {
  let dir: string
  let scanRoot: string
  let db: Db
  let indexer: FileIndexService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-index-'))
    scanRoot = join(dir, 'scanned')
    mkdirSync(scanRoot)
    db = openDb(join(dir, 'test.db'))
    indexer = new FileIndexService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('indexes files and marks them as inbox-new', async () => {
    writeFileSync(join(scanRoot, 'a.png'), 'x')
    writeFileSync(join(scanRoot, 'b.psd'), 'y')
    const stats = await indexer.scanFolder(scanRoot, 'initial')
    expect(stats.added).toBe(2)

    const inbox = new InboxService(db)
    expect(inbox.count()).toBe(2)
  })

  it('is idempotent: second scan adds nothing', async () => {
    writeFileSync(join(scanRoot, 'a.png'), 'x')
    await indexer.scanFolder(scanRoot, 'initial')
    const second = await indexer.scanFolder(scanRoot, 'rescan')
    expect(second.added).toBe(0)
    expect(second.updated).toBe(0)
  })

  it('skips excluded directories', async () => {
    mkdirSync(join(scanRoot, 'node_modules'))
    writeFileSync(join(scanRoot, 'node_modules', 'dep.js'), 'x')
    writeFileSync(join(scanRoot, 'real.png'), 'x')
    const stats = await indexer.scanFolder(scanRoot, 'initial')
    expect(stats.added).toBe(1)
  })

  it('rescan marks vanished files missing', async () => {
    const p = join(scanRoot, 'gone.png')
    writeFileSync(p, 'x')
    await indexer.scanFolder(scanRoot, 'initial')
    rmSync(p)
    const stats = await indexer.scanFolder(scanRoot, 'rescan')
    expect(stats.missing).toBe(1)
    const row = db.prepare(`SELECT status FROM files`).get() as { status: string }
    expect(row.status).toBe('missing')
  })
})

describe('LibraryService', () => {
  let dir: string
  let db: Db
  let indexer: FileIndexService
  let root: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-lib-'))
    root = join(dir, 'scan')
    mkdirSync(root)
    db = openDb(join(dir, 'test.db'))
    indexer = new FileIndexService(db)
    writeFileSync(join(root, 'logo-final.psd'), 'psd')
    writeFileSync(join(root, 'concept.png'), 'png')
    writeFileSync(join(root, 'notes.md'), 'md')
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('filters by type', async () => {
    await indexer.scanFolder(root, 'initial')
    const lib = new LibraryService(db)
    const design = lib.list({ type: 'design' })
    expect(design.map((f) => f.name)).toEqual(['logo-final.psd'])
    const images = lib.list({ type: 'image' })
    expect(images).toHaveLength(1)
  })

  it('searches by name with LIKE', async () => {
    await indexer.scanFolder(root, 'initial')
    const lib = new LibraryService(db)
    const hits = lib.list({ query: 'logo' })
    expect(hits.map((f) => f.name)).toEqual(['logo-final.psd'])
  })

  it('aggregates project names per file', async () => {
    await indexer.scanFolder(root, 'initial')
    const projects = new ProjectService(db)
    const files = new FileReferenceService(db)
    const p1 = projects.create({ name: 'Brand' })
    const p2 = projects.create({ name: 'Archive' })
    files.addReference(p1.id, join(root, 'logo-final.psd'))
    files.addReference(p2.id, join(root, 'logo-final.psd'))

    const lib = new LibraryService(db)
    const row = lib.list({ query: 'logo' })[0]
    expect(row.projects).toEqual(expect.arrayContaining(['Brand', 'Archive']))
  })
})

describe('relocate', () => {
  let dir: string
  let db: Db
  let projects: ProjectService
  let files: FileReferenceService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-reloc-'))
    db = openDb(join(dir, 'test.db'))
    projects = new ProjectService(db)
    files = new FileReferenceService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('updates path and records previous_path / relocated_at', () => {
    const projectId = projects.create({ name: 'P' }).id
    const orig = join(dir, 'a.png')
    const moved = join(dir, 'sub', 'a.png')
    writeFileSync(orig, 'x')
    mkdirSync(join(dir, 'sub'))
    const ref = files.addReference(projectId, orig).file
    renameSync(orig, moved)
    files.markMissing(ref.id)

    const relocated = files.relocate(ref.id, moved)
    expect(relocated.status).toBe('available')
    expect(relocated.path).toBe(moved)
    expect(relocated.previous_path).toBe(orig)
    expect(relocated.relocated_at).toBeTruthy()
    // relations kept
    expect(files.listByProject(projectId)).toHaveLength(1)
  })

  it('refuses when target path already has another reference', () => {
    const projectId = projects.create({ name: 'P' }).id
    const a = join(dir, 'a.png')
    const b = join(dir, 'b.png')
    writeFileSync(a, 'x')
    writeFileSync(b, 'y')
    const refA = files.addReference(projectId, a).file
    files.addReference(projectId, b)
    expect(() => files.relocate(refA.id, b)).toThrow('已存在其他引用')
  })
})

describe('moveToProjectFolder (W-level, audited)', () => {
  let dir: string
  let db: Db
  let projects: ProjectService
  let files: FileReferenceService
  let audit: AuditLogService
  let fsMutation: FsMutationService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-move-'))
    db = openDb(join(dir, 'test.db'))
    projects = new ProjectService(db)
    files = new FileReferenceService(db)
    audit = new AuditLogService(db)
    fsMutation = new FsMutationService(db, audit)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('moves the physical file, updates the reference and writes an audit row', () => {
    const projectId = projects.create({ name: 'P' }).id
    const src = join(dir, 'src', 'asset.png')
    const targetFolder = join(dir, 'project-folder')
    mkdirSync(join(dir, 'src'))
    writeFileSync(src, 'bytes')
    const ref = files.addReference(projectId, src).file

    const result = fsMutation.moveToProjectFolder(ref, targetFolder)
    expect(existsSync(src)).toBe(false)
    expect(existsSync(result.to)).toBe(true)
    expect(files.get(ref.id)?.path).toBe(result.to)

    const rows = audit.list()
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('file.move')
    expect(JSON.parse(rows[0].detail).from).toBe(src)
  })

  it('refuses when target has same-name file', () => {
    const projectId = projects.create({ name: 'P' }).id
    const src = join(dir, 'a.png')
    const targetFolder = join(dir, 'folder')
    writeFileSync(src, 'x')
    mkdirSync(targetFolder)
    writeFileSync(join(targetFolder, 'a.png'), 'other')
    const ref = files.addReference(projectId, src).file
    expect(() => fsMutation.moveToProjectFolder(ref, targetFolder)).toThrow('目标已存在同名文件')
    expect(existsSync(src)).toBe(true)
  })
})

describe('WatchedFolderService', () => {
  let dir: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-watch-'))
    db = openDb(join(dir, 'test.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('adds, lists and removes', () => {
    const s = new WatchedFolderService(db)
    s.add(dir, 'custom')
    expect(s.list()).toHaveLength(1)
    const id = s.list()[0].id
    s.remove(id)
    expect(s.list()).toHaveLength(0)
  })

  it('is idempotent on duplicates', () => {
    const s = new WatchedFolderService(db)
    s.add(dir, 'custom')
    s.add(dir, 'custom')
    expect(s.list()).toHaveLength(1)
  })

  it('rejects nonexistent folders', () => {
    const s = new WatchedFolderService(db)
    expect(() => s.add(join(dir, 'ghost'), 'custom')).toThrow('目录不存在')
  })

  it('sets and clears a display name, surviving a fresh service instance', () => {
    const s = new WatchedFolderService(db)
    s.add(dir, 'custom')
    const id = s.list()[0].id
    s.updateName(id, '设计素材')
    expect(s.list()[0].displayName).toBe('设计素材')
    // persists via DB, not in-memory
    const again = new WatchedFolderService(db)
    expect(again.list()[0].displayName).toBe('设计素材')
    again.updateName(id, '')
    expect(again.list()[0].displayName).toBeUndefined()
  })
})
