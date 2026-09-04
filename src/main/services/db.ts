import Database from 'better-sqlite3'

export type Db = Database.Database

interface Migration {
  version: number
  up: (db: Db) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          description   TEXT DEFAULT '',
          status        TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','archived','completed')),
          color         TEXT DEFAULT '#7C6FF0',
          deadline      TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
          archived_at   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
        CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

        CREATE TABLE IF NOT EXISTS files (
          id            TEXT PRIMARY KEY,
          path          TEXT NOT NULL UNIQUE,
          name          TEXT NOT NULL,
          ext           TEXT NOT NULL DEFAULT '',
          type          TEXT NOT NULL DEFAULT 'other'
                        CHECK (type IN ('image','design','document','video',
                                        'markdown','archive','screenshot',
                                        'ai','audio','other')),
          size          INTEGER DEFAULT 0,
          mtime         INTEGER NOT NULL,
          status        TEXT NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available','missing')),
          file_identity TEXT,
          previous_path TEXT,
          relocation_candidate_path TEXT,
          relocated_at  TEXT,
          hash          TEXT,
          first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
          tags_json     TEXT DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
        CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);
        CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);

        CREATE TABLE IF NOT EXISTS project_files (
          project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          file_id     TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          added_at    TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (project_id, file_id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_files_file ON project_files(file_id);

        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
    }
  },
  {
    version: 2,
    up: (db) => {
      db.exec(`
        ALTER TABLE files ADD COLUMN is_inbox_new INTEGER DEFAULT 0;

        CREATE TABLE IF NOT EXISTS watched_folders (
          id         TEXT PRIMARY KEY,
          path       TEXT NOT NULL UNIQUE,
          kind       TEXT DEFAULT 'custom'
                     CHECK (kind IN ('desktop','downloads','screenshots','custom')),
          enabled    INTEGER DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          ts     TEXT NOT NULL DEFAULT (datetime('now')),
          action TEXT NOT NULL,
          detail TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
      `)
    }
  },
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id             TEXT PRIMARY KEY,
          project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
          title          TEXT NOT NULL,
          description    TEXT DEFAULT '',
          status         TEXT NOT NULL DEFAULT 'todo'
                         CHECK (status IN ('todo','doing','done')),
          priority       TEXT NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low','medium','high')),
          due_date       TEXT,
          scheduled_date TEXT,
          completed_at   TEXT,
          sort_order     INTEGER DEFAULT 0,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

        CREATE TABLE IF NOT EXISTS task_files (
          task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          file_id  TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          added_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (task_id, file_id)
        );
        CREATE INDEX IF NOT EXISTS idx_task_files_file ON task_files(file_id);
      `)
    }
  },
  {
    version: 4,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id           TEXT PRIMARY KEY,
          path         TEXT NOT NULL UNIQUE,
          title        TEXT,
          project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
          content_hash TEXT,
          outline_json TEXT DEFAULT '[]',
          tags_json    TEXT DEFAULT '[]',
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS note_links (
          source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          PRIMARY KEY (source_note_id, target_note_id)
        );
        CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);
      `)
    }
  },
  {
    version: 5,
    up: (db) => {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
          kind,
          row_id,
          title,
          content,
          path,
          tokenize='trigram'
        );
      `)
    }
  },
  {
    version: 6,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT DEFAULT '',
          start_at    TEXT NOT NULL,
          end_at      TEXT NOT NULL,
          all_day     INTEGER DEFAULT 0,
          project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_events_range ON calendar_events(start_at, end_at);
        CREATE INDEX IF NOT EXISTS idx_events_project ON calendar_events(project_id);
      `)
    }
  },
  {
    version: 7,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS open_log (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          opened_at  TEXT NOT NULL DEFAULT (datetime('now')),
          kind       TEXT NOT NULL
                     CHECK (kind IN ('apps','images','docs','folders','videos','file')),
          name       TEXT NOT NULL,
          path       TEXT NOT NULL,
          source     TEXT NOT NULL DEFAULT 'box'
                     CHECK (source IN ('box','library','project','search'))
        );
        CREATE INDEX IF NOT EXISTS idx_open_log_opened_at ON open_log(opened_at DESC);
        CREATE INDEX IF NOT EXISTS idx_open_log_identity ON open_log(kind, name);
      `)
    }
  },
  {
    version: 8,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scenario_presets (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          description TEXT DEFAULT '',
          items_json  TEXT DEFAULT '[]',
          auto        INTEGER DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_scenario_updated ON scenario_presets(updated_at DESC);
      `)
    }
  },
  {
    version: 9,
    up: (db) => {
      db.exec(`ALTER TABLE watched_folders ADD COLUMN display_name TEXT DEFAULT NULL`)
    }
  },
  {
    version: 10,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scenario_candidates (
          id          TEXT PRIMARY KEY,
          source_key  TEXT NOT NULL UNIQUE,
          name        TEXT NOT NULL,
          summary     TEXT NOT NULL DEFAULT '',
          evidence    TEXT NOT NULL DEFAULT '',
          items_json  TEXT NOT NULL DEFAULT '[]',
          confidence  INTEGER NOT NULL DEFAULT 0,
          occurrences INTEGER NOT NULL DEFAULT 0,
          last_at     TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','saved','dismissed','blocked')),
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_scenario_candidate_status
          ON scenario_candidates(status, updated_at DESC);
      `)
    }
  }
]

/** Open (or create) the Workdeck database at the given path, applying migrations. */
export function openDb(filePath: string): Db {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      db.transaction(() => {
        m.up(db)
        db.pragma(`user_version = ${m.version}`)
      })()
    }
  }
}
