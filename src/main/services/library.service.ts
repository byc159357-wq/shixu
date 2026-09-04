import type { Db } from './db'
import type { FileRow } from './file-reference.service'
import type { OpenLogRow } from './open-log.service'
import { splitSessions } from './scenario.service'

export interface LibraryFile extends FileRow {
  projects: string[]
  /** Number of opens recorded in `open_log` for this file path. */
  openCount: number
  /** ISO time of the most recent open, null when never opened. */
  lastOpenedAt: string | null
  /** Parsed copy of `tags_json`. */
  tags: string[]
}

export interface LibraryQuery {
  type?: string
  query?: string
  sort?: 'mtime' | 'name' | 'size' | 'recent' | 'popular'
  order?: 'desc' | 'asc'
  /** Filter to files carrying exactly this tag. */
  tag?: string
  /** Filter to files whose Workspace 归属 is this project id, or 'unlinked'. */
  project?: string
  limit?: number
}

export interface RecommendQuery {
  /** Seed file path — surface items frequently opened together with it. */
  seedPath?: string
  /** Scope / boost recommendations to files belonging to this project. */
  projectId?: string
  /** Paths to exclude from the result (e.g. files already on screen). */
  excludePaths?: string[]
  limit?: number
}

/** A library file plus a human-readable "why we suggest this" label. */
export interface RecommendedFile extends LibraryFile {
  reason: string
  score: number
}

function sqlSort(q: LibraryQuery): { col: string; extra: string } {
  switch (q.sort) {
    case 'name':
      return { col: 'f.name', extra: ' COLLATE NOCASE' }
    case 'size':
      return { col: 'f.size', extra: '' }
    case 'recent':
      // Handled specially below (direction is fixed); col is unused.
      return { col: '', extra: '' }
    case 'popular':
      return { col: '_open_count', extra: '' }
    default:
      return { col: 'f.mtime', extra: '' }
  }
}

/** ORDER BY expression. "最近打开" always runs most-recent-first with never-opened
 *  files sinking to the bottom; the user's asc/desc toggle only affects the rest. */
function sqlOrder(q: LibraryQuery): string {
  if (q.sort === 'recent') {
    return 'ORDER BY (_last_opened) IS NULL ASC, _last_opened DESC'
  }
  const { col, extra } = sqlSort(q)
  const order = q.order === 'asc' ? 'ASC' : 'DESC'
  return `ORDER BY ${col} ${order}${extra}`
}

/** Unified local file library queries (type / search / tag / project filters, sorting). */
export class LibraryService {
  constructor(private db: Db) {}

  list(q: LibraryQuery = {}): LibraryFile[] {
    const where: string[] = []
    const params: unknown[] = []

    if (q.type && q.type !== 'all') {
      where.push(`f.type = ?`)
      params.push(q.type)
    }
    if (q.query) {
      where.push(`(f.name LIKE ? OR f.path LIKE ?)`)
      params.push(`%${q.query}%`, `%${q.query}%`)
    }
    if (q.tag) {
      where.push(
        `EXISTS (SELECT 1 FROM json_each(f.tags_json) t WHERE t.type = 'text' AND t.value = ?)`
      )
      params.push(q.tag)
    }
    if (q.project === 'unlinked') {
      where.push(`NOT EXISTS (SELECT 1 FROM project_files pf WHERE pf.file_id = f.id)`)
    } else if (q.project) {
      where.push(`EXISTS (SELECT 1 FROM project_files pf WHERE pf.file_id = f.id AND pf.project_id = ?)`)
      params.push(q.project)
    }

    const orderSql = sqlOrder(q)
    const limit = Math.min(q.limit ?? 500, 2000)
    return this.hydrateFileQuery(where, params, orderSql, limit)
  }

  /**
   * "为你推荐" — ranks library files by how they are used in practice:
   *   · co-occurrence (seedPath present): files opened in the same work
   *     bursts as the seed get a strong affinity boost;
   *   · project scope: files belonging to `projectId` are boosted, so a
   *     project filter surfaces "this project's常用素材";
   *   · recency + frequency always contribute.
   * Returns only files that still exist and are indexed (never stale paths
   * like apps / folders, which live outside the library).
   */
  recommend(q: RecommendQuery = {}): RecommendedFile[] {
    const exclude = new Set(q.excludePaths ?? [])
    const limit = Math.min(q.limit ?? 12, 50)
    const now = Date.now()

    const logRows = (this.db
      .prepare(`SELECT * FROM open_log ORDER BY opened_at DESC, id DESC LIMIT 800`)
      .all() as OpenLogRow[]).reverse() // oldest → newest for session splitting
    const sessions = splitSessions(logRows)

    // Frequency (distinct work bursts) + last-open recency per path.
    const freq = new Map<string, number>()
    const lastOpen = new Map<string, number>()
    // Affinity: how often each path appears alongside the seed in a burst.
    const affinity = new Map<string, number>()
    for (const session of sessions) {
      const distinct = distinctPaths(session)
      for (const p of distinct) {
        freq.set(p, (freq.get(p) ?? 0) + 1)
        const ts = maxOpenTs(session, p)
        lastOpen.set(p, Math.max(lastOpen.get(p) ?? 0, ts))
      }
      if (q.seedPath && distinct.includes(q.seedPath)) {
        const w = 1 / distinct.length
        for (const p of distinct) {
          if (p === q.seedPath) continue
          affinity.set(p, (affinity.get(p) ?? 0) + w)
        }
      }
    }

    // Every path belonging to the target project (for boost + as a floor).
    const projectPaths = new Set<string>()
    if (q.projectId) {
      const rows = this.db
        .prepare(
          `SELECT f.path FROM project_files pf JOIN files f ON f.id = pf.file_id WHERE pf.project_id = ?`
        )
        .all(q.projectId) as Array<{ path: string }>
      for (const r of rows) projectPaths.add(r.path)
    }

    // When a project is scoped, the funnel is that project's own files (it reads
    // as "this project's常用素材"); otherwise rank across everything we've seen.
    const candidates = q.projectId ? projectPaths : new Set(freq.keys())
    const scored: Array<{ path: string; score: number; inProject: boolean }> = []
    for (const p of candidates) {
      if (exclude.has(p)) continue
      const inProject = projectPaths.has(p)
      const days = ((now - (lastOpen.get(p) ?? 0)) / 86400000) || 0
      const recency = 1 / (1 + days * 0.25)
      const score =
        (affinity.get(p) ?? 0) * 5 +
        (freq.get(p) ?? 0) * 1.5 +
        recency * 2 +
        (inProject ? 1.5 : 0)
      scored.push({ path: p, score, inProject })
    }

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, limit)
    if (top.length === 0) return []

    const files = this.hydrateByPath(top.map((t) => t.path))
    const byPath = new Map(files.map((f) => [f.path, f]))
    const seedName = q.seedPath ? baseName(q.seedPath) : ''

    return top
      .filter((t) => byPath.has(t.path))
      .map((t, i) => {
        const f = byPath.get(t.path)!
        let reason: string
        if (q.seedPath && (affinity.get(t.path) ?? 0) > 0) {
          reason = `常与「${seedName}」一起用`
        } else if (q.projectId && t.inProject) {
          reason = '该项目的常用素材'
        } else if (i < 8 && (freq.get(t.path) ?? 0) >= 2) {
          reason = '常用素材'
        } else {
          reason = '最近打开'
        }
        return { ...f, reason, score: Number(t.score.toFixed(2)) }
      })
  }

  /** Full text projection for arbitrary WHERE on `files f`, shared by list() and byPath(). */
  private hydrateFileQuery(
    where: string[],
    params: unknown[],
    orderSql: string,
    limit: number
  ): LibraryFile[] {
    const sql = `
      SELECT f.*, (
        SELECT group_concat(p.name, ' | ')
        FROM project_files pf JOIN projects p ON p.id = pf.project_id
        WHERE pf.file_id = f.id
      ) AS _projects,
      (
        SELECT count(*) FROM open_log o WHERE o.path = f.path
      ) AS _open_count,
      (
        SELECT MAX(o.opened_at) FROM open_log o WHERE o.path = f.path
      ) AS _last_opened
      FROM files f
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ${orderSql}
      LIMIT ${limit}
    `
    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map((r) => {
      const { _projects, _open_count, _last_opened, tags_json, ...rest } = r
      return {
        ...(rest as unknown as FileRow),
        tags_json: String(tags_json ?? '[]'),
        projects: (_projects as string | null) ? String(_projects).split(' | ') : [],
        openCount: Number(_open_count ?? 0),
        lastOpenedAt: (_last_opened as string | null) ?? null,
        tags: parseTags(tags_json)
      }
    })
  }

  private hydrateByPath(paths: string[]): LibraryFile[] {
    if (paths.length === 0) return []
    const placeholders = paths.map(() => '?').join(',')
    return this.hydrateFileQuery(
      [`f.path IN (${placeholders})`],
      paths,
      'ORDER BY f.name COLLATE NOCASE',
      paths.length
    )
  }

  /** All distinct tags in use (case-insensitive), sorted — for the filter chips. */
  tags(): string[] {
    const rows = this.db
      .prepare(
        `SELECT t.value AS tag
         FROM files f, json_each(f.tags_json) t
         WHERE json_valid(f.tags_json) AND t.type = 'text'
         GROUP BY t.value COLLATE NOCASE
         ORDER BY t.value COLLATE NOCASE`
      )
      .all() as Array<{ tag: string }>
    return rows.map((r) => r.tag)
  }

  count(): number {
    return (this.db.prepare(`SELECT count(*) AS c FROM files`).get() as { c: number }).c
  }
}

function parseTags(v: unknown): string[] {
  try {
    const arr = JSON.parse(String(v ?? '[]')) as unknown
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Distinct paths in a session, preserving first-seen order. */
function distinctPaths(session: OpenLogRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of session) {
    if (seen.has(r.path)) continue
    seen.add(r.path)
    out.push(r.path)
  }
  return out
}

/** Latest open timestamp (ms) for a path within a session. */
function maxOpenTs(session: OpenLogRow[], target: string): number {
  let max = 0
  for (const r of session) {
    if (r.path !== target) continue
    const ts = new Date(r.opened_at).getTime()
    if (ts > max) max = ts
  }
  return max
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i >= 0 ? p.slice(i + 1) : p
}