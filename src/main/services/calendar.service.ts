import { randomUUID } from 'node:crypto'
import type { Db } from './db'

export interface CalendarEvent {
  id: string
  title: string
  description: string
  start_at: string // ISO 8601
  end_at: string
  all_day: number
  project_id: string | null
  created_at: string
  updated_at: string
}

export interface ScheduledTask {
  kind: 'task'
  id: string
  title: string
  start_at: string
  end_at: string
  all_day: number
  project_id: string | null
}

export interface EventInput {
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay?: boolean
  projectId?: string | null
}

export class CalendarService {
  constructor(private db: Db) {}

  private get(id: string): CalendarEvent | undefined {
    return this.db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(id) as
      | CalendarEvent
      | undefined
  }

  create(input: EventInput): CalendarEvent {
    if (!input.title.trim()) throw new Error('事件标题不能为空')
    if (!input.startAt || !input.endAt) throw new Error('开始与结束时间必填')
    if (input.endAt <= input.startAt) throw new Error('结束时间必须晚于开始时间')
    const now = new Date().toISOString()
    const row: CalendarEvent = {
      id: randomUUID(),
      title: input.title.trim(),
      description: input.description ?? '',
      start_at: input.startAt,
      end_at: input.endAt,
      all_day: input.allDay ? 1 : 0,
      project_id: input.projectId ?? null,
      created_at: now,
      updated_at: now
    }
    this.db
      .prepare(
        `INSERT INTO calendar_events (id, title, description, start_at, end_at, all_day, project_id, created_at, updated_at)
         VALUES (@id, @title, @description, @start_at, @end_at, @all_day, @project_id, @created_at, @updated_at)`
      )
      .run(row)
    return row
  }

  update(id: string, patch: Partial<Pick<EventInput, 'title' | 'description' | 'startAt' | 'endAt' | 'allDay' | 'projectId'>>): CalendarEvent {
    const existing = this.get(id)
    if (!existing) throw new Error(`事件不存在：${id}`)
    const next: CalendarEvent = {
      ...existing,
      title: patch.title?.trim() ?? existing.title,
      description: patch.description ?? existing.description,
      start_at: patch.startAt ?? existing.start_at,
      end_at: patch.endAt ?? existing.end_at,
      all_day: patch.allDay !== undefined ? (patch.allDay ? 1 : 0) : existing.all_day,
      project_id: patch.projectId !== undefined ? patch.projectId : existing.project_id,
      updated_at: new Date().toISOString()
    }
    this.db
      .prepare(
        `UPDATE calendar_events SET title=?, description=?, start_at=?, end_at=?, all_day=?, project_id=?, updated_at=? WHERE id=?`
      )
      .run(next.title, next.description, next.start_at, next.end_at, next.all_day, next.project_id, next.updated_at, id)
    return next
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id)
  }

  /** Events overlapping [from, to]. */
  listRange(from: string, to: string): CalendarEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM calendar_events
         WHERE start_at < ? AND end_at > ?
         ORDER BY start_at`
      )
      .all(to, from) as CalendarEvent[]
  }

  /**
   * Tasks with a scheduled_date also appear on the calendar (agenda merging).
   * scheduled_date is stored as date; we render it as a day-long entry.
   */
  listScheduledTasks(from: string, to: string): ScheduledTask[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, project_id, scheduled_date FROM tasks
         WHERE scheduled_date IS NOT NULL AND status != 'done'
           AND scheduled_date >= ? AND scheduled_date < ?`
      )
      .all(from.slice(0, 10), to.slice(0, 10)) as Array<{
      id: string
      title: string
      project_id: string | null
      scheduled_date: string
    }>
    return rows.map((r) => ({
      kind: 'task' as const,
      id: r.id,
      title: r.title,
      start_at: `${r.scheduled_date}T00:00:00`,
      end_at: `${r.scheduled_date}T23:59:59`,
      all_day: 1,
      project_id: r.project_id
    }))
  }
}
