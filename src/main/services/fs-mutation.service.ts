import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import type { Db } from './db'
import type { FileRow } from './file-reference.service'
import { normalizePath } from './path-utils'

export interface AuditRow {
  id: number
  ts: string
  action: string
  detail: string
}

export class AuditLogService {
  constructor(private db: Db) {}

  record(action: string, detail: unknown): void {
    this.db
      .prepare(`INSERT INTO audit_log (action, detail) VALUES (?, ?)`)
      .run(action, JSON.stringify(detail))
  }

  list(limit = 100): AuditRow[] {
    return this.db
      .prepare(`SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?`)
      .all(limit) as AuditRow[]
  }
}

export class WatchedFolderService {
  constructor(private db: Db) {}

  list() {
    const rows = this.db
      .prepare(`SELECT * FROM watched_folders WHERE enabled = 1 ORDER BY created_at`)
      .all() as Array<{ id: string; path: string; kind: string; enabled: number; display_name: string | null }>
    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      kind: r.kind,
      enabled: r.enabled,
      ...(r.display_name ? { displayName: r.display_name } : {})
    }))
  }

  add(path: string, kind: 'desktop' | 'downloads' | 'screenshots' | 'custom'): void {
    const normalized = normalizePath(path)
    if (!existsSync(normalized)) throw new Error(`目录不存在：${normalized}`)
    this.db
      .prepare(`INSERT OR IGNORE INTO watched_folders (id, path, kind) VALUES (?, ?, ?)`)
      .run(randomUUID(), normalized, kind)
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM watched_folders WHERE id = ?`).run(id)
  }

  updateName(id: string, displayName: string): void {
    const value = displayName.trim()
    this.db
      .prepare(`UPDATE watched_folders SET display_name = ? WHERE id = ?`)
      .run(value ? value : null, id)
  }
}

/**
 * W-level filesystem operations. Every mutation here is a deliberate user
 * action, goes through a confirmation dialog in the UI, and is recorded in
 * audit_log. Nothing in this file may ever delete files.
 */
export class FsMutationService {
  constructor(
    private db: Db,
    private audit: AuditLogService
  ) {}

  /**
   * Move a physical file into a project folder. The user confirmed this in the UI.
   * Cross-volume moves fail with EXDEV → surfaced as an error, nothing is touched.
   */
  moveToProjectFolder(file: FileRow, targetFolder: string): { from: string; to: string } {
    const from = normalizePath(file.path)
    const toDir = normalizePath(targetFolder)
    const to = normalizePath(`${toDir}\\${basename(from)}`)

    if (!existsSync(from)) throw new Error(`源文件不存在：${from}`)
    if (from.toLowerCase() === to.toLowerCase()) throw new Error('目标与源相同')

    if (!existsSync(toDir)) {
      mkdirSync(toDir, { recursive: true })
    }
    if (existsSync(to)) throw new Error(`目标已存在同名文件：${to}`)

    try {
      renameSync(from, to)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        throw new Error(`无法跨磁盘移动（EXDEV）：${from} → ${to}`)
      }
      throw err
    }

    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE files SET path=?, name=?, status='available', last_seen_at=? WHERE id=?`
      )
      .run(to, basename(to), now, file.id)
    this.audit.record('file.move', { from, to, fileId: file.id, dir: dirname(from) })
    return { from, to }
  }
}
