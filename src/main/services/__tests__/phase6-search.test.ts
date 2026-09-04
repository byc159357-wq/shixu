import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { TaskService } from '../task.service'
import { NoteService } from '../note.service'
import { FileReferenceService } from '../file-reference.service'
import { SearchService, extractWikiLinks } from '../search.service'
import { AuditLogService } from '../fs-mutation.service'

describe('extractWikiLinks', () => {
  it('finds [[note]] references', () => {
    expect(extractWikiLinks('看 [[设计规范]] 和 [[周报]] 这两篇')).toEqual(['设计规范', '周报'])
  })

  it('ignores malformed brackets', () => {
    expect(extractWikiLinks('[[未闭合')).toEqual([])
    expect(extractWikiLinks('纯文本')).toEqual([])
  })
})

describe('SearchService (FTS5 + trigram)', () => {
  let dir: string
  let db: Db
  let search: SearchService
  let root: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-search-'))
    root = join(dir, 'scan')
    mkdirSync(root)
    db = openDb(join(dir, 'test.db'))
    search = new SearchService(db)

    // fixtures: a file, a task, a project, a note
    writeFileSync(join(root, '品牌视觉规范.md'), '# 品牌视觉规范\n\n配色与字体标准')
    writeFileSync(join(root, 'logo.png'), 'png')
    const projects = new ProjectService(db)
    const files = new FileReferenceService(db)
    const tasks = new TaskService(db)
    const audit = new AuditLogService(db)
    const notes = new NoteService(db, audit)
    const p = projects.create({ name: 'Brand Refresh' })
    files.addReference(p.id, join(root, 'logo.png'))
    tasks.create({ projectId: p.id, title: '确认主色', description: '从规范里挑出主色' })
    notes.add(join(root, '品牌视觉规范.md'), p.id)
    search.sync()
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds Chinese substring via trigram', () => {
    const r = search.search('品牌视觉')
    expect(r.some((x) => x.kind === 'note' && x.title.includes('品牌视觉规范'))).toBe(true)
    const r2 = search.search('视觉规范')
    expect(r2.some((x) => x.title === '品牌视觉规范')).toBe(true)
  })

  it('finds tasks, projects and files', () => {
    const t = search.search('主色')
    expect(t.some((x) => x.kind === 'task' && x.title === '确认主色')).toBe(true)

    const pr = search.search('Brand Refresh')
    expect(pr.some((x) => x.kind === 'project')).toBe(true)

    const f = search.search('logo')
    expect(f.some((x) => x.kind === 'file' && x.title === 'logo.png')).toBe(true)
  })

  it('falls back to LIKE for short queries (< 3 chars)', () => {
    const r = search.search('logo')
    expect(r.some((x) => x.title === 'logo.png')).toBe(true)
    const r2 = search.search('主')
    expect(r2.length).toBeGreaterThan(0)
  })

  it('skips done tasks and archived projects', () => {
    const tasks = new TaskService(db)
    const projects = new ProjectService(db)
    const doneTask = tasks.listAll().find((t) => t.title === '确认主色')
    tasks.complete(doneTask!.id)
    const p = projects.list()[0]
    projects.archive(p.id)
    search.sync()

    expect(search.search('主色')).toHaveLength(0)
    expect(search.search('Brand Refresh')).toHaveLength(0)
  })

  it('records wiki links between notes on sync', () => {
    // note A links to note B by title
    const bPath = join(root, '设计规范.md')
    writeFileSync(bPath, '# 设计规范\n\n内容')
    const notes = new NoteService(db, new AuditLogService(db))
    notes.add(bPath)
    const aPath = join(root, '索引.md')
    writeFileSync(aPath, '# 索引\n\n参见 [[设计规范]]')
    notes.add(aPath)
    search.sync()

    const link = db
      .prepare(
        `SELECT source_note_id FROM note_links WHERE target_note_id = (
           SELECT id FROM notes WHERE title = '设计规范'
         )`
      )
      .all() as Array<{ source_note_id: string }>
    expect(link).toHaveLength(1)
  })

  it('is idempotent across repeated syncs', () => {
    const first = search.sync()
    const second = search.sync()
    expect(second.indexed).toBe(first.indexed)
    expect(search.search('logo').length).toBeGreaterThan(0)
  })
})
