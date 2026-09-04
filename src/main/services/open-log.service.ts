import type { Db } from './db'
import type { BoxKind } from '../../shared/types'

/** What got opened: one of the five boxes (`apps/images/docs/folders/videos`)
 *  or a plain data file (`file` — e.g. from the 文件库 / a project). */
export type OpenLogKind = BoxKind | 'file'
export type OpenLogSource = 'box' | 'library' | 'project' | 'search'

export interface OpenLogInput {
  kind: OpenLogKind
  name: string
  path: string
  source?: OpenLogSource
}

export interface OpenLogRow extends OpenLogInput {
  id: number
  opened_at: string
}

/**
 * Tracks every software / file open so later features (e.g. “帮我准备工作”)
 * can rank recently-used items by recency and frequency. Pure data layer —
 * inserts are fire-and-forget and must never break the open operation.
 */
export class OpenLogService {
  constructor(private db: Db) {}

  record(input: OpenLogInput): void {
    this.db
      .prepare(
        `INSERT INTO open_log (kind, name, path, source) VALUES (?, ?, ?, ?)`
      )
      .run(input.kind, input.name, input.path, input.source ?? 'box')
  }

  /** Most recent opens, newest first. `limit` caps the returned rows. */
  recent(limit = 30): OpenLogRow[] {
    return this.db
      .prepare(`SELECT * FROM open_log ORDER BY opened_at DESC, id DESC LIMIT ?`)
      .all(limit) as OpenLogRow[]
  }
}