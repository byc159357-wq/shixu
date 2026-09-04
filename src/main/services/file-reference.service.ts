import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import type { Db } from './db'
import { normalizePath, nameOf, extOf, classifyType, type FileType } from './path-utils'
export type FileStatus = 'available' | 'missing'

export interface FileRow {
  id: string
  path: string
  name: string
  ext: string
  type: FileType
  size: number
  mtime: number
  status: FileStatus
  file_identity: string | null
  previous_path: string | null
  relocation_candidate_path: string | null
  relocated_at: string | null
  hash: string | null
  first_seen_at: string
  last_seen_at: string
  tags_json: string
}

export interface FileWithProject extends FileRow {
  project_id: string
  added_at: string
}

export interface AddReferenceResult {
  file: FileRow
  linked: boolean
}

/** Shell side-effects are injected so this service stays unit-testable in plain Node. */
export interface FileOps {
  open: (filePath: string) => void | Promise<void>
  reveal: (filePath: string) => void
}

export class FileReferenceService {
  constructor(
    private db: Db,
    private ops?: FileOps
  ) {}

  get(fileId: string): FileRow | undefined {
    return this.db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRow | undefined
  }

  private upsertFile(filePath: string): FileRow {
    const normalized = normalizePath(filePath)
    if (!existsSync(normalized)) {
      throw new Error(`File not found: ${normalized}`)
    }
    const st = statSync(normalized)
    const now = new Date().toISOString()
    const existing = this.db
      .prepare(`SELECT * FROM files WHERE path = ?`)
      .get(normalized) as FileRow | undefined

    if (existing) {
      const next: FileRow = { ...existing, size: st.size, mtime: st.mtimeMs, status: 'available', last_seen_at: now }
      this.db
        .prepare(`UPDATE files SET size=@size, mtime=@mtime, status=@status, last_seen_at=@last_seen_at WHERE id=@id`)
        .run(next)
      return next
    }

    const row: FileRow = {
      id: randomUUID(),
      path: normalized,
      name: nameOf(normalized),
      ext: extOf(normalized),
      type: classifyType(normalized, extOf(normalized)),
      size: st.size,
      mtime: st.mtimeMs,
      status: 'available',
      file_identity: null,
      previous_path: null,
      relocation_candidate_path: null,
      relocated_at: null,
      hash: null,
      first_seen_at: now,
      last_seen_at: now,
      tags_json: '[]'
    }
    this.db
      .prepare(
        `INSERT INTO files (id, path, name, ext, type, size, mtime, status, file_identity, previous_path, relocation_candidate_path, relocated_at, hash, first_seen_at, last_seen_at, tags_json)
         VALUES (@id, @path, @name, @ext, @type, @size, @mtime, @status, @file_identity, @previous_path, @relocation_candidate_path, @relocated_at, @hash, @first_seen_at, @last_seen_at, @tags_json)`
      )
      .run(row)
    return row
  }

  /**
   * Link a real file to a project. The physical file is NEVER touched:
   * only a FileReference (files row) + a project_files relation row are created.
   */
  addReference(projectId: string, filePath: string): AddReferenceResult {
    const project = this.db
      .prepare(`SELECT id FROM projects WHERE id = ? AND status != 'archived'`)
      .get(projectId)
    if (!project) throw new Error(`Project not found or archived: ${projectId}`)

    const file = this.upsertFile(filePath)
    const info = this.db
      .prepare(`INSERT OR IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`)
      .run(projectId, file.id)
    return { file, linked: info.changes > 0 }
  }

  listByProject(projectId: string): FileWithProject[] {
    return this.db
      .prepare(
        `SELECT f.*, pf.project_id, pf.added_at
         FROM files f JOIN project_files pf ON pf.file_id = f.id
         WHERE pf.project_id = ?
         ORDER BY f.mtime DESC`
      )
      .all(projectId) as FileWithProject[]
  }

  markMissing(fileId: string): FileRow {
    const existing = this.get(fileId)
    if (!existing) throw new Error(`File not found: ${fileId}`)
    this.db
      .prepare(`UPDATE files SET status='missing', last_seen_at=? WHERE id=?`)
      .run(new Date().toISOString(), fileId)
    return this.get(fileId) as FileRow
  }

  /** Refresh a single reference against the disk: available → missing when the file vanished. */
  refreshStatus(fileId: string): FileRow {
    const file = this.get(fileId)
    if (!file) throw new Error(`File not found: ${fileId}`)
    if (file.status === 'available' && !existsSync(file.path)) {
      return this.markMissing(fileId)
    }
    return file
  }

  /**
   * Refresh all references of a project against the disk and return the latest list.
   * Used when opening a project so Missing states surface immediately.
   */
  refreshProjectFiles(projectId: string): FileWithProject[] {
    const rows = this.listByProject(projectId)
    for (const row of rows) {
      if (row.status === 'available' && !existsSync(row.path)) {
        this.markMissing(row.id)
      }
    }
    return this.listByProject(projectId)
  }

  /**
   * Remove a file's relation to a project (data-model.md 3.0 rule):
   * deletes ONLY the project_files relation row. The FileReference and the
   * physical file are untouched.
   */
  removeFromProject(projectId: string, fileId: string): void {
    const result = this.db
      .prepare(`DELETE FROM project_files WHERE project_id = ? AND file_id = ?`)
      .run(projectId, fileId)
    if (result.changes === 0) {
      throw new Error(`Relation not found: project=${projectId} file=${fileId}`)
    }
  }

  /**
   * Relocation (data-model 4.2/4.3): the user picked a new path for a missing
   * file. Updates path + metadata, records previous_path / relocated_at, keeps
   * all relations. Refuses when the target path already belongs to another reference.
   */
  relocate(fileId: string, newPath: string): FileRow {
    const file = this.get(fileId)
    if (!file) throw new Error(`File not found: ${fileId}`)
    const normalized = normalizePath(newPath)
    if (!existsSync(normalized)) throw new Error(`File not found: ${normalized}`)
    const conflict = this.db
      .prepare(`SELECT id FROM files WHERE path = ? AND id != ?`)
      .get(normalized, fileId)
    if (conflict) throw new Error(`该路径已存在其他引用：${normalized}`)

    const st = statSync(normalized)
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE files SET path=?, name=?, ext=?, type=?, size=?, mtime=?, status='available',
         previous_path=?, relocated_at=?, relocation_candidate_path=NULL, last_seen_at=?
         WHERE id=?`
      )
      .run(
        normalized,
        nameOf(normalized),
        extOf(normalized),
        classifyType(normalized, extOf(normalized)),
        st.size,
        st.mtimeMs,
        file.path,
        now,
        now,
        fileId
      )
    return this.get(fileId) as FileRow
  }

  /** Tags live in tags_json (JSON array). Phase 3 keeps them simple, no tag table yet. */
  updateTags(fileId: string, tags: string[]): FileRow {
    const file = this.get(fileId)
    if (!file) throw new Error(`File not found: ${fileId}`)
    this.db
      .prepare(`UPDATE files SET tags_json = ? WHERE id = ?`)
      .run(JSON.stringify([...new Set(tags.map((t) => t.trim()).filter(Boolean))]), fileId)
    return this.get(fileId) as FileRow
  }

  async open(fileId: string): Promise<void> {
    const file = this.get(fileId)
    if (!file) throw new Error(`File not found: ${fileId}`)
    if (file.status === 'missing') throw new Error(`File is missing on disk: ${file.path}`)
    if (!this.ops) throw new Error('File open shell not injected')
    await this.ops.open(file.path)
  }

  reveal(fileId: string): void {
    const file = this.get(fileId)
    if (!file) throw new Error(`File not found: ${fileId}`)
    if (!this.ops) throw new Error('File reveal shell not injected')
    this.ops.reveal(file.path)
  }
}
