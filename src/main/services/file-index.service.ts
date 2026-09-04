import { promises as fsp } from 'node:fs'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Db } from './db'
import { normalizePath, nameOf, extOf, classifyType } from './path-utils'

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '$RECYCLE.BIN',
  'System Volume Information',
  'AppData'
])

export interface ScanStats {
  added: number
  updated: number
  missing: number
}

export type ScanMode = 'initial' | 'rescan'

/**
 * Initial scan / manual rescan. Independent from FileWatchService:
 * watchers only do incremental updates, this service owns full traversals.
 */
export class FileIndexService {
  constructor(
    private db: Db,
    private onProgress?: (done: number) => void
  ) {}

  private isExcluded(name: string): boolean {
    return EXCLUDED_DIRS.has(name) || (name.startsWith('.') && name !== '.')
  }

  /** Walk a folder and index every file. `rescan` also marks vanished files missing. */
  async scanFolder(folderPath: string, mode: ScanMode = 'initial'): Promise<ScanStats> {
    const root = normalizePath(folderPath)
    if (!existsSync(root)) throw new Error(`Folder not found: ${root}`)
    const stats: ScanStats = { added: 0, updated: 0, missing: 0 }

    // Snapshot of currently indexed files under this folder for rescan diffing
    const known = new Map<string, string>()
    if (mode === 'rescan') {
      const rows = this.db
        .prepare(`SELECT id, path FROM files WHERE path LIKE ?`)
        .all(`${root}\\%`) as Array<{ id: string; path: string }>
      for (const r of rows) known.set(r.path, r.id)
    }

    await this.walk(root, stats)

    if (mode === 'rescan') {
      for (const [path, id] of known) {
        if (!existsSync(path)) {
          this.db
            .prepare(`UPDATE files SET status='missing', last_seen_at=? WHERE id=?`)
            .run(new Date().toISOString(), id)
          stats.missing++
        }
      }
    }
    return stats
  }

  private async walk(current: string, stats: ScanStats): Promise<void> {
    let entries
    try {
      entries = await fsp.readdir(current, { withFileTypes: true })
    } catch {
      return // permission / vanished folder: skip silently
    }
    for (const entry of entries) {
      if (this.isExcluded(entry.name)) continue
      const full = normalizePath(join(current, entry.name))
      if (entry.isDirectory()) {
        await this.walk(full, stats)
      } else if (entry.isFile()) {
        this.upsertFile(full, stats)
        this.onProgress?.(stats.added + stats.updated)
      }
    }
  }

  /** Insert or refresh a files row. mtime/size compare keeps repeated scans idempotent. */
  private upsertFile(path: string, stats: ScanStats): void {
    let st
    try {
      st = statSync(path)
    } catch {
      return
    }
    const now = new Date().toISOString()
    const existing = this.db.prepare(`SELECT * FROM files WHERE path = ?`).get(path) as
      | { id: string; size: number; mtime: number; status: string }
      | undefined

    if (existing) {
      // unchanged → skip; changed → refresh metadata
      if (existing.size === st.size && existing.mtime === st.mtimeMs && existing.status === 'available') {
        return
      }
      this.db
        .prepare(
          `UPDATE files SET size=?, mtime=?, status='available', last_seen_at=? WHERE id=?`
        )
        .run(st.size, st.mtimeMs, now, existing.id)
      stats.updated++
      return
    }

    this.db
      .prepare(
        `INSERT INTO files (id, path, name, ext, type, size, mtime, status, file_identity, previous_path, relocation_candidate_path, relocated_at, hash, first_seen_at, last_seen_at, tags_json, is_inbox_new)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'available', NULL, NULL, NULL, NULL, NULL, ?, ?, '[]', 1)`
      )
      .run(
        randomUUID(),
        path,
        nameOf(path),
        extOf(path),
        classifyType(path, extOf(path)),
        st.size,
        st.mtimeMs,
        now,
        now
      )
    stats.added++
  }
}
