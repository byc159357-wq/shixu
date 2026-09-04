import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { BackupService, type BackupResult } from '../backup.service'

describe('BackupService', () => {
  let dir: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-backup-'))
    db = openDb(join(dir, 'source.db'))
    db.prepare(`INSERT INTO settings (key, value) VALUES ('probe', '1')`).run()
  })

  function svc(backupDir = join(dir, 'backups')): BackupService {
    return new BackupService(db, backupDir)
  }

  it('creates a verified manual snapshot with integrity ok', () => {
    const service = svc()
    const r = service.createManual()

    expect(r.integrity).toBe('ok')
    expect(r.tables).toBeGreaterThan(0)
    expect(r.size).toBeGreaterThan(0)
    expect(existsSync(r.file)).toBe(true)
  })

  it('creates an auto snapshot in the auto subfolder', () => {
    const service = svc()
    const r = service.createAuto()

    expect(r.file).toContain('workdeck-auto')
    expect(r.file).toContain(join(join(dir, 'backups'), 'auto'))
    expect(r.integrity).toBe('ok')
  })

  it('captures rows written after the service was created', () => {
    const service = svc()
    service.createAuto()
    db.prepare(`INSERT INTO settings (key, value) VALUES ('later', 'x')`).run()

    const r2 = service.createAuto()
    const check = openDb(r2.file)
    const row = check.prepare(`SELECT value FROM settings WHERE key = 'later'`).get() as
      | { value: string }
      | undefined
    check.close()

    expect(row?.value).toBe('x')
  })

  it('prunes auto backups down to the retention cap', () => {
    const backupDir = join(dir, 'backups')
    const service = svc(backupDir)
    // Seed 8 auto-named backup files (prune only scans the filename pattern).
    const autoDir = join(backupDir, 'auto')
    mkdirSync(autoDir, { recursive: true })
    for (let i = 0; i < 8; i++) {
      writeFileSync(join(autoDir, `workdeck-auto-${String(i).padStart(4, '0')}.db`), 'x')
    }

    // createAuto triggers pruneAuto, which keeps only the newest 5.
    const r = service.createAuto()
    expect(r.integrity).toBe('ok')

    const files = readdirSync(autoDir).filter((f) => f.startsWith('workdeck-auto'))
    expect(files.length).toBeLessThanOrEqual(5)
  })

  type BackupResultOr = BackupResult
  it('returns a structural result the renderer can rely on', () => {
    const r: BackupResultOr = svc().createAuto()
    expect(['file', 'size', 'tables', 'integrity']).toEqual(Object.keys(r).filter((k) => k in r))
  })
})