import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { AuditLogService } from '../fs-mutation.service'
import { NoteService } from '../note.service'
import { SearchService } from '../search.service'
import { parseIntent } from '../ai.service'

describe('parseIntent (rules-based Chinese)', () => {
  it('parses explicit create_task with date', () => {
    const r = parseIntent('新建任务 整理素材 周五')
    expect(r.intent?.action).toBe('create_task')
    expect(r.intent?.params.title).toBe('整理素材')
    expect(r.intent?.params.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('parses natural-language task: 明天交报告', () => {
    const r = parseIntent('明天交报告')
    expect(r.intent?.action).toBe('create_task')
    expect(r.intent?.params.title).toBe('交报告')
    expect(r.intent?.params.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('parses relative dates: 今天 / 明天 / 后天', () => {
    const today = new Date()
    const toIso = (d: Date) => d.toISOString().slice(0, 10)
    const tomorrow = new Date()
    tomorrow.setDate(today.getDate() + 1)
    const dayAfter = new Date()
    dayAfter.setDate(today.getDate() + 2)

    expect(parseIntent('今天交报告').intent?.params.date).toBe(toIso(today))
    expect(parseIntent('明天交报告').intent?.params.date).toBe(toIso(tomorrow))
    expect(parseIntent('后天交报告').intent?.params.date).toBe(toIso(dayAfter))
  })

  it('parses explicit dates', () => {
    const r = parseIntent('新建任务 发布 2026-09-01')
    expect(r.intent?.params.date).toBe('2026-09-01')
  })

  it('parses create_event', () => {
    const r = parseIntent('新建会议 周会 明天')
    expect(r.intent?.action).toBe('create_event')
    expect(r.intent?.params.title).toBe('周会')
    expect(r.intent?.params.date).toBeTruthy()
  })

  it('parses create_note', () => {
    const r = parseIntent('新建笔记 项目复盘')
    expect(r.intent?.action).toBe('create_note')
    expect(r.intent?.params.title).toBe('项目复盘')
  })

  it('parses move_file', () => {
    const r = parseIntent('移动 logo.png 到 Brand')
    expect(r.intent?.action).toBe('move_file')
    expect(r.intent?.params.fileName).toBe('logo.png')
    expect(r.intent?.params.projectName).toBe('Brand')
  })

  it('parses summarize', () => {
    const r = parseIntent('总结 Brand 项目')
    expect(r.intent?.action).toBe('summarize')
    expect(r.intent?.params.target).toBe('Brand 项目')
  })

  it('parses open_scenario from 做个/开始做', () => {
    const r1 = parseIntent('我要做个海报')
    expect(r1.intent?.action).toBe('open_scenario')
    expect(r1.intent?.params.scenario).toBe('海报')

    const r2 = parseIntent('继续做象山海报')
    expect(r2.intent?.action).toBe('open_scenario')
    expect(r2.intent?.params.scenario).toBe('象山海报')

    const r3 = parseIntent('打开场景 月报')
    expect(r3.intent?.action).toBe('open_scenario')
    expect(r3.intent?.params.scenario).toBe('月报')
  })

  it('does not treat bare 做X or task-ish phrases as a scenario', () => {
    expect(parseIntent('做海报').intent?.action).toBe('search')
    expect(parseIntent('明天交报告').intent?.action).toBe('create_task')
    expect(parseIntent('帮我准备工作').intent?.action).not.toBe('open_scenario')
  })

  it('falls back to search for plain text', () => {
    const r = parseIntent('品牌视觉规范')
    expect(r.intent?.action).toBe('search')
    expect(r.intent?.params.query).toBe('品牌视觉规范')
  })

  it('returns empty for blank input', () => {
    expect(parseIntent('   ').intent).toBeNull()
  })
})

describe('note backlinks', () => {
  let dir: string
  let db: Db
  let notes: NoteService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-backlink-'))
    db = openDb(join(dir, 'test.db'))
    notes = new NoteService(db, new AuditLogService(db))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('finds notes that [[link]] to a note', () => {
    const a = join(dir, 'a.md')
    const b = join(dir, 'b.md')
    writeFileSync(a, '# A 笔记')
    writeFileSync(b, '# B 笔记\n\n参见 [[A 笔记]]')
    const noteA = notes.add(a)
    notes.add(b)

    // backlinks are maintained by SearchService.sync (wiki link extraction)
    new SearchService(db).sync()

    const bl = notes.backlinks(noteA.id)
    expect(bl).toHaveLength(1)
    expect(bl[0].title).toBe('B 笔记')
  })
})
