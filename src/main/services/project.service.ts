import { randomUUID } from 'node:crypto'
import type { Db } from './db'

export type ProjectStatus = 'active' | 'paused' | 'archived' | 'completed'

export interface ProjectRow {
  id: string
  name: string
  description: string
  status: ProjectStatus
  color: string
  deadline: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface ProjectInput {
  name: string
  description?: string
  color?: string
  deadline?: string | null
}

export type ProjectPatch = Partial<
  Pick<ProjectRow, 'name' | 'description' | 'status' | 'color' | 'deadline'>
>

export class ProjectService {
  constructor(private db: Db) {}

  list(): ProjectRow[] {
    return this.db
      .prepare(`SELECT * FROM projects WHERE status != 'archived' ORDER BY updated_at DESC`)
      .all() as ProjectRow[]
  }

  get(id: string): ProjectRow | undefined {
    return this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
      | ProjectRow
      | undefined
  }

  create(input: ProjectInput): ProjectRow {
    const name = input.name.trim()
    if (!name) throw new Error('Project name is required')
    const now = new Date().toISOString()
    const row: ProjectRow = {
      id: randomUUID(),
      name,
      description: input.description ?? '',
      status: 'active',
      color: input.color ?? '#7C6FF0',
      deadline: input.deadline ?? null,
      created_at: now,
      updated_at: now,
      archived_at: null
    }
    this.db
      .prepare(
        `INSERT INTO projects (id, name, description, status, color, deadline, created_at, updated_at, archived_at)
         VALUES (@id, @name, @description, @status, @color, @deadline, @created_at, @updated_at, @archived_at)`
      )
      .run(row)
    return row
  }

  update(id: string, patch: ProjectPatch): ProjectRow {
    const existing = this.get(id)
    if (!existing) throw new Error(`Project not found: ${id}`)
    const next: ProjectRow = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString()
    }
    this.db
      .prepare(
        `UPDATE projects SET name=@name, description=@description, status=@status, color=@color, deadline=@deadline, updated_at=@updated_at WHERE id=@id`
      )
      .run(next)
    return next
  }

  /** Soft delete: archived projects disappear from list() but rows remain. */
  archive(id: string): void {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(`UPDATE projects SET status='archived', archived_at=?, updated_at=? WHERE id=?`)
      .run(now, now, id)
    if (result.changes === 0) throw new Error(`Project not found: ${id}`)
  }
}
