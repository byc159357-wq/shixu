import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { AuditLogService } from '../fs-mutation.service'
import { NoteService, extractTitle } from '../note.service'

describe('extractTitle', () => {
  it('prefers front matter title', () => {
    const md = '---\ntitle: "我的笔记"\n---\n\n# 旧标题\n\n正文'
    expect(extractTitle(md, 'fallback.md')).toBe('我的笔记')
  })

  it('falls back to first H1', () => {
    expect(extractTitle('# 首行标题\n\n正文', 'fallback.md')).toBe('首行标题')
  })

  it('falls back to filename', () => {
    expect(extractTitle('没有标题的正文', 'fallback.md')).toBe('fallback.md')
  })
})

describe('NoteService', () => {
  let dir: string
  let db: Db
  let notes: NoteService
  let audit: AuditLogService
  let projects: ProjectService
  let mdPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-note-'))
    db = openDb(join(dir, 'test.db'))
    audit = new AuditLogService(db)
    notes = new NoteService(db, audit)
    projects = new ProjectService(db)
    mdPath = join(dir, 'note-a.md')
    writeFileSync(mdPath, '# 首行标题\n\n正文内容')
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects non-markdown paths', () => {
    expect(() => notes.add(join(dir, 'x.png'))).toThrow('只支持 Markdown')
  })

  it('adds a note reference and extracts the title', () => {
    const note = notes.add(mdPath)
    expect(note.title).toBe('首行标题')
    expect(note.path).toBe(mdPath)
    expect(note.content_hash).toBeTruthy()
    expect(notes.listByProject('nope')).toHaveLength(0)
  })

  it('associates with a project', () => {
    const p = projects.create({ name: 'P' }).id
    const note = notes.add(mdPath, p)
    expect(notes.listByProject(p)).toHaveLength(1)
    expect(notes.listByProject(p)[0].id).toBe(note.id)
  })

  it('detects external edits via content hash and refreshes the cache', () => {
    const note = notes.add(mdPath)
    // external edit (e.g. VS Code)
    writeFileSync(mdPath, '# 新标题\n\n外部修改的内容')

    const r = notes.getWithContent(note.id)
    expect(r.externallyModified).toBe(true)
    expect(r.content).toContain('外部修改')
    // cache refreshed
    expect(notes.getWithContent(note.id).externallyModified).toBe(false)
    expect(notes.getWithContent(note.id).note.title).toBe('新标题')
  })

  it('save writes back to the real file and audits', () => {
    const note = notes.add(mdPath)
    notes.save(note.id, '# 保存后的标题\n\n新内容')
    expect(readFileSync(mdPath, 'utf-8')).toContain('新内容')
    const updated = notes.getWithContent(note.id)
    expect(updated.note.title).toBe('保存后的标题')
    expect(updated.externallyModified).toBe(false)
    const rows = audit.list()
    expect(rows.some((r) => r.action === 'note.save')).toBe(true)
  })

  it('remove deletes only the reference, the file survives', () => {
    const note = notes.add(mdPath)
    notes.remove(note.id)
    expect(existsSync(mdPath)).toBe(true)
    expect(notes.listByProject('')).toHaveLength(0)
  })

  it('getWithContent throws when the md file is gone', () => {
    const note = notes.add(mdPath)
    rmSync(mdPath)
    expect(() => notes.getWithContent(note.id)).toThrow('笔记文件不存在')
  })
})
