import { randomUUID } from 'node:crypto'
import type { Db } from './db'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface TaskRow {
  id: string
  project_id: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  scheduled_date: string | null
  completed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TaskInput {
  projectId?: string | null
  title: string
  description?: string
  priority?: TaskPriority
  dueDate?: string | null
  scheduledDate?: string | null
}

export type TaskPatch = Partial<
  Pick<TaskRow, 'title' | 'description' | 'status' | 'priority' | 'due_date' | 'scheduled_date'>
>

export interface TaskWithFiles extends TaskRow {
  fileIds: string[]
}

export class TaskService {
  constructor(private db: Db) {}

  private get(id: string): TaskRow | undefined {
    return this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined
  }

  create(input: TaskInput): TaskRow {
    const title = input.title.trim()
    if (!title) throw new Error('任务标题不能为空')
    const now = new Date().toISOString()
    const row: TaskRow = {
      id: randomUUID(),
      project_id: input.projectId ?? null,
      title,
      description: input.description ?? '',
      status: 'todo',
      priority: input.priority ?? 'medium',
      due_date: input.dueDate ?? null,
      scheduled_date: input.scheduledDate ?? null,
      completed_at: null,
      sort_order: 0,
      created_at: now,
      updated_at: now
    }
    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, scheduled_date, completed_at, sort_order, created_at, updated_at)
         VALUES (@id, @project_id, @title, @description, @status, @priority, @due_date, @scheduled_date, @completed_at, @sort_order, @created_at, @updated_at)`
      )
      .run(row)
    return row
  }

  listByProject(projectId: string): TaskRow[] {
    return this.db
      .prepare(
        `SELECT * FROM tasks WHERE project_id = ? ORDER BY
         CASE status WHEN 'done' THEN 1 ELSE 0 END,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         due_date IS NULL, due_date`
      )
      .all(projectId) as TaskRow[]
  }

  listAll(): TaskRow[] {
    return this.db.prepare(`SELECT * FROM tasks ORDER BY updated_at DESC`).all() as TaskRow[]
  }

  /**
   * Today view (product Flow B): tasks due today + overdue tasks.
   * Overdue = status != done AND due_date < today (computed at runtime, not stored).
   * Returns { overdue, today }.
   */
  listForToday(): { overdue: TaskRow[]; today: TaskRow[] } {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const all = this.listAll()
    const overdue: TaskRow[] = []
    const todayTasks: TaskRow[] = []
    for (const t of all) {
      if (t.status === 'done') continue
      if (t.due_date && t.due_date < today) overdue.push(t)
      else if (t.due_date === today) todayTasks.push(t)
    }
    const sortBy = (a: TaskRow, b: TaskRow) => {
      const p = { high: 0, medium: 1, low: 2 }
      return p[a.priority] - p[b.priority]
    }
    overdue.sort(sortBy)
    todayTasks.sort(sortBy)
    return { overdue, today: todayTasks }
  }

  update(id: string, patch: TaskPatch): TaskRow {
    const existing = this.get(id)
    if (!existing) throw new Error(`任务不存在：${id}`)
    const next: TaskRow = { ...existing, ...patch, updated_at: new Date().toISOString() }
    this.db
      .prepare(
        `UPDATE tasks SET title=@title, description=@description, status=@status, priority=@priority,
         due_date=@due_date, scheduled_date=@scheduled_date, updated_at=@updated_at WHERE id=@id`
      )
      .run(next)
    return next
  }

  complete(id: string): TaskRow {
    const existing = this.get(id)
    if (!existing) throw new Error(`任务不存在：${id}`)
    const now = new Date().toISOString()
    this.db
      .prepare(`UPDATE tasks SET status='done', completed_at=?, updated_at=? WHERE id=?`)
      .run(now, now, id)
    return this.get(id) as TaskRow
  }

  reopen(id: string): TaskRow {
    const existing = this.get(id)
    if (!existing) throw new Error(`任务不存在：${id}`)
    const now = new Date().toISOString()
    this.db
      .prepare(`UPDATE tasks SET status='todo', completed_at=NULL, updated_at=? WHERE id=?`)
      .run(now, id)
    return this.get(id) as TaskRow
  }

  /** Tasks are lightweight: physical delete, task_files cascade (data-model 3.2). */
  remove(id: string): void {
    this.db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
  }

  addFile(taskId: string, fileId: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO task_files (task_id, file_id) VALUES (?, ?)`)
      .run(taskId, fileId)
  }

  removeFile(taskId: string, fileId: string): void {
    this.db.prepare(`DELETE FROM task_files WHERE task_id = ? AND file_id = ?`).run(taskId, fileId)
  }

  listFiles(taskId: string): Array<{ file_id: string; name: string; path: string }> {
    return this.db
      .prepare(
        `SELECT tf.file_id, f.name, f.path
         FROM task_files tf JOIN files f ON f.id = tf.file_id
         WHERE tf.task_id = ?`
      )
      .all(taskId) as Array<{ file_id: string; name: string; path: string }>
  }

  listWithFiles(projectId: string): TaskWithFiles[] {
    const tasks = this.listByProject(projectId)
    return tasks.map((t) => ({
      ...t,
      fileIds: (this.db
        .prepare(`SELECT file_id FROM task_files WHERE task_id = ?`)
        .all(t.id) as Array<{ file_id: string }>).map((r) => r.file_id)
    }))
  }
}
