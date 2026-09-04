import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, migrate, type Db } from '../db'

describe('db', () => {
  let dir: string
  let dbPath: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-db-'))
    dbPath = join(dir, 'test.db')
  })

  afterEach(() => {
    if (db) db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates schema v1 and applies migrations on open', () => {
    db = openDb(dbPath)
    expect(db.pragma('user_version', { simple: true })).toBe(9)

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toContain('projects')
    expect(tables).toContain('files')
    expect(tables).toContain('project_files')
    expect(tables).toContain('settings')
    expect(tables).toContain('tasks')
    expect(tables).toContain('task_files')
    expect(tables).toContain('notes')
    expect(tables).toContain('note_links')
    expect(tables).toContain('calendar_events')
    expect(tables).toContain('watched_folders')
    expect(tables).toContain('audit_log')
    expect(tables).toContain('open_log')
    expect(tables).toContain('scenario_presets')
    // v9 added the friendly display_name column to watched_folders
    const wfCols = db
      .prepare(`PRAGMA table_info(watched_folders)`)
      .all()
      .map((r) => (r as { name: string }).name)
    expect(wfCols).toContain('display_name')
  })

  it('is idempotent: re-opening the same db does not fail', () => {
    db = openDb(dbPath)
    db.close()
    db = openDb(dbPath)
    expect(db.pragma('user_version', { simple: true })).toBe(9)
  })

  it('migrate() on an already-migrated db is a no-op', () => {
    db = openDb(dbPath)
    expect(() => migrate(db)).not.toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(9)
  })

  it('uses WAL journal mode', () => {
    db = openDb(dbPath)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
  })
})
