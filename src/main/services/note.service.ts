import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import type { Db } from './db'
import type { AuditLogService } from './fs-mutation.service'
import { normalizePath } from './path-utils'

export interface NoteRow {
  id: string
  path: string
  title: string | null
  project_id: string | null
  content_hash: string | null
  outline_json: string
  tags_json: string
  created_at: string
  updated_at: string
}

export interface NoteContent {
  note: NoteRow
  content: string
  externallyModified: boolean
}

function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Extract title: front matter `title:` first, then first H1, then filename. */
export function extractTitle(content: string, fallback: string): string {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (fm) {
    const m = fm[1].match(/^title:\s*(.+)$/m)
    if (m) return m[1].trim().replace(/["']/g, '')
  }
  const h1 = content.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  return fallback
}

/**
 * Notes are Markdown file references (data-model 2.5): the .md file is the
 * source of truth; DB stores title/hash caches only. External edits are
 * detected via content_hash and refresh the cache on next read.
 */
export class NoteService {
  constructor(
    private db: Db,
    private audit: AuditLogService
  ) {}

  private get(id: string): NoteRow | undefined {
    return this.db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as NoteRow | undefined
  }

  /** Add (or refresh) a note reference for a real .md file. Does not touch the file. */
  add(path: string, projectId?: string | null): NoteRow {
    const normalized = normalizePath(path)
    if (extname(normalized).toLowerCase() !== '.md') {
      throw new Error(`只支持 Markdown 文件（.md）：${normalized}`)
    }
    if (!existsSync(normalized)) throw new Error(`文件不存在：${normalized}`)
    const content = readFileSync(normalized, 'utf-8')
    const hash = hashOf(content)
    const title = extractTitle(content, basename(normalized))
    const now = new Date().toISOString()

    const existing = this.db.prepare(`SELECT * FROM notes WHERE path = ?`).get(normalized) as
      | NoteRow
      | undefined
    if (existing) {
      this.db
        .prepare(
          `UPDATE notes SET project_id=COALESCE(?, project_id), title=?, content_hash=?, updated_at=? WHERE id=?`
        )
        .run(projectId ?? null, title, hash, now, existing.id)
      return this.get(existing.id) as NoteRow
    }

    const row: NoteRow = {
      id: randomUUID(),
      path: normalized,
      title,
      project_id: projectId ?? null,
      content_hash: hash,
      outline_json: '[]',
      tags_json: '[]',
      created_at: now,
      updated_at: now
    }
    this.db
      .prepare(
        `INSERT INTO notes (id, path, title, project_id, content_hash, outline_json, tags_json, created_at, updated_at)
         VALUES (@id, @path, @title, @project_id, @content_hash, @outline_json, @tags_json, @created_at, @updated_at)`
      )
      .run(row)
    return row
  }

  listByProject(projectId: string): NoteRow[] {
    return this.db
      .prepare(`SELECT * FROM notes WHERE project_id = ? ORDER BY updated_at DESC`)
      .all(projectId) as NoteRow[]
  }

  /** Read the real file. Detects external edits via hash and refreshes cache. */
  getWithContent(id: string): NoteContent {
    const note = this.get(id)
    if (!note) throw new Error(`笔记不存在：${id}`)
    if (!existsSync(note.path)) throw new Error(`笔记文件不存在（可能已被移动）：${note.path}`)
    const content = readFileSync(note.path, 'utf-8')
    const hash = hashOf(content)
    const externallyModified = hash !== note.content_hash
    if (externallyModified) {
      const title = extractTitle(content, basename(note.path))
      this.db
        .prepare(`UPDATE notes SET content_hash=?, title=?, updated_at=? WHERE id=?`)
        .run(hash, title, new Date().toISOString(), id)
    }
    return {
      note: { ...(this.get(id) as NoteRow) },
      content,
      externallyModified
    }
  }

  /** W-level: write content back to the real file, refresh hash, audit. */
  save(id: string, content: string): NoteRow {
    const note = this.get(id)
    if (!note) throw new Error(`笔记不存在：${id}`)
    writeFileSync(note.path, content, 'utf-8')
    const hash = hashOf(content)
    const title = extractTitle(content, basename(note.path))
    const now = new Date().toISOString()
    this.db
      .prepare(`UPDATE notes SET content_hash=?, title=?, updated_at=? WHERE id=?`)
      .run(hash, title, now, id)
    this.audit.record('note.save', { noteId: id, path: note.path })
    return this.get(id) as NoteRow
  }

  /** Remove the note reference only; the .md file is never deleted. */
  remove(id: string): void {
    this.db.prepare(`DELETE FROM notes WHERE id = ?`).run(id)
  }

  /** Backlinks: notes that [[link]] to this note (wiki graph). */
  backlinks(noteId: string): NoteRow[] {
    return this.db
      .prepare(
        `SELECT n.* FROM note_links nl JOIN notes n ON n.id = nl.source_note_id
         WHERE nl.target_note_id = ? ORDER BY n.updated_at DESC`
      )
      .all(noteId) as NoteRow[]
  }
}
