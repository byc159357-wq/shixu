import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { TaskService } from '../task.service'
import { CalendarService } from '../calendar.service'
import { generateIcs, parseIcs } from '../ics'

describe('CalendarService', () => {
  let dir: string
  let db: Db
  let cal: CalendarService
  let projects: ProjectService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-cal-'))
    db = openDb(join(dir, 'test.db'))
    cal = new CalendarService(db)
    projects = new ProjectService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates, lists and removes events', () => {
    const e = cal.create({
      title: '评审会',
      startAt: '2026-08-20T10:00:00',
      endAt: '2026-08-20T11:00:00',
      projectId: projects.create({ name: 'P' }).id
    })
    expect(e.all_day).toBe(0)
    expect(cal.listRange('2026-08-01T00:00:00', '2026-09-01T00:00:00')).toHaveLength(1)
    cal.remove(e.id)
    expect(cal.listRange('2026-08-01T00:00:00', '2026-09-01T00:00:00')).toHaveLength(0)
  })

  it('validates input', () => {
    expect(() => cal.create({ title: '  ', startAt: 'x', endAt: 'y' })).toThrow('标题')
    expect(() => cal.create({ title: 'a', startAt: '', endAt: 'y' })).toThrow('开始')
    expect(() => cal.create({ title: 'a', startAt: '2026-08-20T10:00:00', endAt: '2026-08-20T09:00:00' })).toThrow('结束')
  })

  it('range query returns overlapping events only', () => {
    cal.create({ title: '内部', startAt: '2026-08-10T09:00:00', endAt: '2026-08-10T10:00:00' })
    cal.create({ title: '外部', startAt: '2026-09-10T09:00:00', endAt: '2026-09-10T10:00:00' })
    const inRange = cal.listRange('2026-08-01T00:00:00', '2026-08-31T23:59:59')
    expect(inRange.map((e) => e.title)).toEqual(['内部'])
  })

  it('updates fields', () => {
    const e = cal.create({ title: 'A', startAt: '2026-08-20T10:00:00', endAt: '2026-08-20T11:00:00' })
    const updated = cal.update(e.id, { title: 'A2', allDay: true })
    expect(updated.title).toBe('A2')
    expect(updated.all_day).toBe(1)
  })

  it('merges scheduled tasks into the range', () => {
    const tasks = new TaskService(db)
    const projectId = projects.create({ name: 'P' }).id
    tasks.create({ projectId, title: '排期任务', scheduledDate: '2026-08-15' })
    const scheduled = cal.listScheduledTasks('2026-08-01T00:00:00', '2026-09-01T00:00:00')
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].kind).toBe('task')
    expect(scheduled[0].start_at.slice(0, 10)).toBe('2026-08-15')
  })
})

describe('ICS round-trip', () => {
  it('generates then parses back the same events', () => {
    const ics = generateIcs([
      { uid: 'u1', summary: '评审会', description: '带上稿子', startAt: '2026-08-20T10:00:00', endAt: '2026-08-20T11:00:00', allDay: false },
      { uid: 'u2', summary: '全天休假', startAt: '2026-08-21T00:00:00', endAt: '2026-08-21T23:59:59', allDay: true }
    ])
    const parsed = parseIcs(ics)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].summary).toBe('评审会')
    expect(parsed[0].description).toBe('带上稿子')
    expect(parsed[0].startAt).toBe('2026-08-20T10:00:00')
    expect(parsed[0].allDay).toBe(false)
    expect(parsed[1].allDay).toBe(true)
    expect(parsed[1].startAt.slice(0, 10)).toBe('2026-08-21')
  })

  it('escapes and unescapes special characters', () => {
    const ics = generateIcs([
      { uid: 'u', summary: 'a;b,c\\d', description: 'line1\nline2', startAt: '2026-08-20T10:00:00', endAt: '2026-08-20T11:00:00', allDay: false }
    ])
    const parsed = parseIcs(ics)
    expect(parsed[0].summary).toBe('a;b,c\\d')
    expect(parsed[0].description).toBe('line1\nline2')
  })

  it('parses a common external ICS sample (folded lines)', () => {
    const sample = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'BEGIN:VEVENT',
      'DTSTART:20260901T090000Z',
      'DTEND:20260901T100000Z',
      'SUMMARY:Standup Meeting',
      'DESCRIPTION:Daily',
      'UID:abc-123@google.com',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    const parsed = parseIcs(sample)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].summary).toBe('Standup Meeting')
    expect(parsed[0].startAt.slice(0, 16)).toBe('2026-09-01T09:00')
  })
})
