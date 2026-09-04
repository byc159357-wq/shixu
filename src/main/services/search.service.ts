import { readFileSync, existsSync, statSync } from 'node:fs'
import type { Db } from './db'

export type SearchKind = 'file' | 'note' | 'task' | 'project'

export interface SearchResult {
  kind: SearchKind
  rowId: string
  title: string
  content: string
  path: string | null
}

const MAX_NOTE_BYTES = 512 * 1024 // read up to 512KB of note content for indexing

export function extractWikiLinks(content: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]\n]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const t = m[1].trim()
    if (t) out.push(t)
  }
  return out
}

/**
 * Local full-text search (FTS5 + trigram tokenizer, offline).
 * - trigram gives Chinese substring matching (unicode61 cannot).
 * - The index is a plain virtual table; we rebuild it wholesale on sync()
 *   (a few thousand rows build in <1s), triggered by file-change events,
 *   the 30-minute fallback rescan and before palette queries.
 * - Queries shorter than 3 chars fall back to LIKE (trigram needs >= 3).
 */
export class SearchService {
  constructor(private db: Db) {}

  /** Rebuild the whole search index + refresh wiki [[note]] links. */
  sync(): { indexed: number } {
    this.db.prepare(`DELETE FROM search_fts`).run()
    const insert = this.db.prepare(
      `INSERT INTO search_fts (kind, row_id, title, content, path) VALUES (?, ?, ?, ?, ?)`
    )
    let indexed = 0

    // files
    const files = this.db
      .prepare(`SELECT id, name, path FROM files WHERE status='available'`)
      .all() as Array<{ id: string; name: string; path: string }>
    for (const f of files) {
      insert.run('file', f.id, f.name, f.path, f.path)
      indexed++
    }

    // tasks (path column carries project_id so the UI can jump to the project)
    const tasks = this.db
      .prepare(`SELECT id, title, description, project_id FROM tasks WHERE status != 'done'`)
      .all() as Array<{ id: string; title: string; description: string; project_id: string | null }>
    for (const t of tasks) {
      insert.run('task', t.id, t.title, t.description || '', t.project_id)
      indexed++
    }

    // projects
    const projects = this.db
      .prepare(`SELECT id, name, description FROM projects WHERE status != 'archived'`)
      .all() as Array<{ id: string; name: string; description: string }>
    for (const p of projects) {
      insert.run('project', p.id, p.name, p.description || '', null)
      indexed++
    }

    // notes (read real files; fall back to title when unreadable)
    const notes = this.db
      .prepare(`SELECT id, path, title FROM notes`)
      .all() as Array<{ id: string; path: string; title: string | null }>
    const titles = new Map(notes.filter((n) => n.title).map((n) => [n.title as string, n.id]))
    const linkUpsert = this.db.prepare(
      `INSERT OR IGNORE INTO note_links (source_note_id, target_note_id) VALUES (?, ?)`
    )
    for (const n of notes) {
      let content = n.title ?? ''
      if (existsSync(n.path) && statSync(n.path).size <= MAX_NOTE_BYTES) {
        try {
          content = readFileSync(n.path, 'utf-8').slice(0, MAX_NOTE_BYTES)
        } catch {
          /* unreadable → title only */
        }
      }
      insert.run('note', n.id, n.title ?? n.path, content, n.path)
      indexed++
      // wiki links: [[title]] → note_links edge
      this.db.prepare(`DELETE FROM note_links WHERE source_note_id = ?`).run(n.id)
      for (const targetTitle of extractWikiLinks(content)) {
        const targetId = titles.get(targetTitle)
        if (targetId && targetId !== n.id) {
          linkUpsert.run(n.id, targetId)
        }
      }
    }

    return { indexed }
  }

  search(query: string, limit = 50): SearchResult[] {
    const q = query.trim()
    if (!q) return []

    if (q.length < 3) {
      // LIKE fallback (trigram requires >= 3 chars)
      const like = `%${q}%`
      const out: SearchResult[] = []
      const files = this.db
        .prepare(`SELECT id, name, path FROM files WHERE name LIKE ? OR path LIKE ? LIMIT 20`)
        .all(like, like) as Array<{ id: string; name: string; path: string }>
      for (const f of files) out.push({ kind: 'file', rowId: f.id, title: f.name, content: f.path, path: f.path })
      const tasks = this.db
        .prepare(`SELECT id, title, description, project_id FROM tasks WHERE status != 'done' AND title LIKE ? LIMIT 20`)
        .all(like) as Array<{ id: string; title: string; description: string; project_id: string | null }>
      for (const t of tasks) out.push({ kind: 'task', rowId: t.id, title: t.title, content: t.description || '', path: t.project_id })
      const projects = this.db
        .prepare(`SELECT id, name FROM projects WHERE status != 'archived' AND name LIKE ? LIMIT 20`)
        .all(like) as Array<{ id: string; name: string }>
      for (const p of projects) out.push({ kind: 'project', rowId: p.id, title: p.name, content: '', path: null })
      return out.slice(0, limit)
    }

    // FTS5 trigram phrase match
    const safe = q.replace(/"/g, '""')
    const rows = this.db
      .prepare(
        `SELECT kind, row_id, title, content, path
         FROM search_fts WHERE search_fts MATCH ?
         ORDER BY rank LIMIT ?`
      )
      .all(`"${safe}"`, limit) as Array<{
      kind: string
      row_id: string
      title: string
      content: string
      path: string | null
    }>

    return rows.map((r) => {
      const idx = r.content.indexOf(q)
      const snippet =
        idx >= 0
          ? (idx > 25 ? '…' : '') +
            r.content.slice(Math.max(0, idx - 25), idx + q.length + 25) +
            (idx + q.length + 25 < r.content.length ? '…' : '')
          : r.content.slice(0, 60)
      return {
        kind: r.kind as SearchKind,
        rowId: r.row_id,
        title: r.title,
        content: snippet,
        path: r.path
      }
    })
  }
}
