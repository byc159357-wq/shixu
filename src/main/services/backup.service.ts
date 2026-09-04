import { statSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { openDb, type Db } from './db'
import type { BackupResult } from '../../shared/types'

/**
 * Data safety: creates a portable, self-consistent SQLite snapshot of the
 * Workdeck database via `VACUUM INTO` (safe even while the app is running,
 * since WAL checkpoints are folded in) and verifies it with a real open +
 * `PRAGMA integrity_check`. Optionally prunes old auto-backups to keep a cap.
 */

export type { BackupResult }

const AUTO_PREFIX = 'workdeck-auto'

/** Keep this many auto-backups (manual backups are never auto-pruned). */
const RETAIN_AUTO = 5

export class BackupService {
  constructor(
    private db: Db,
    /** Directory where a manual backup is written. */
    private backupDir: string
  ) {}

  /** May be null when the app provides no autostart path — treated as disabled. */
  autoBackupsDir(): string {
    return join(this.backupDir, 'auto')
  }

  createManual(): BackupResult {
    return this.snapshot(join(this.backupDir, stamp('workdeck-backup')))
  }

  /** Write a timestamped snapshot into <backupDir>/auto and prune to the cap. */
  createAuto(): BackupResult {
    const dir = this.autoBackupsDir()
    mkdirSync(dir, { recursive: true })
    const result = this.snapshot(join(dir, stamp(AUTO_PREFIX)))
    this.pruneAuto(dir)
    return result
  }

  private snapshot(destFile: string): BackupResult {
    mkdirSync(this.backupDir, { recursive: true })
    // VACUUM INTO fails if the output file already exists; deduplicate the path.
    let uniq = destFile
    let n = 1
    while (existsSync(uniq)) {
      uniq = destFile.replace(/\.db$/, `-${n++}.db`)
    }
    // VACUUM INTO writes a compact, transactionally consistent database file.
    // The path is embedded as a SQLite string literal (single quotes doubled).
    const lit = `'${uniq.replace(/'/g, "''")}'`
    this.db.exec(`VACUUM INTO ${lit}`)
    const size = statSync(uniq).size
    const integrity = this.verify(uniq)
    const tables = this.tableCount(uniq)
    return { file: uniq, size, tables, integrity }
  }

  private verify(file: string): 'ok' | 'error' {
    try {
      const check = openDb(file)
      const row = check.pragma('integrity_check', { simple: true }) as string
      check.close()
      return row === 'ok' ? 'ok' : 'error'
    } catch {
      return 'error'
    }
  }

  private tableCount(file: string): number {
    try {
      const check = openDb(file)
      const row = check
        .prepare(
          `SELECT count(*) AS n FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'`
        )
        .get() as { n: number }
      check.close()
      return row.n
    } catch {
      return 0
    }
  }

  private pruneAuto(dir: string): void {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(AUTO_PREFIX) && f.endsWith('.db'))
      .sort()
    for (const f of files.slice(0, files.length - RETAIN_AUTO)) {
      try {
        unlinkSync(join(dir, f))
      } catch {
        /* best-effort prune */
      }
    }
  }
}

function stamp(prefix: string): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const now = [
    d.getFullYear(),
    p(d.getMonth() + 1),
    p(d.getDate()),
    '-',
    p(d.getHours()),
    p(d.getMinutes()),
    p(d.getSeconds())
  ].join('')
  return `${prefix}-${now}.db`
}