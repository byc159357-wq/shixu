import type { Db } from './db'
import type { FileRow } from './file-reference.service'

/**
 * Desktop Inbox: files that appeared in scanned folders and are not handled yet.
 * Detection happens in FileIndexService (new rows get is_inbox_new=1).
 */
export class InboxService {
  constructor(private db: Db) {}

  list(limit = 200): FileRow[] {
    return this.db
      .prepare(
        `SELECT * FROM files WHERE is_inbox_new = 1 ORDER BY first_seen_at DESC LIMIT ?`
      )
      .all(limit) as FileRow[]
  }

  count(): number {
    return (
      this.db.prepare(`SELECT count(*) AS c FROM files WHERE is_inbox_new = 1`).get() as {
        c: number
      }
    ).c
  }

  markHandled(fileId: string): void {
    this.db.prepare(`UPDATE files SET is_inbox_new = 0 WHERE id = ?`).run(fileId)
  }

  markAllHandled(): void {
    this.db.prepare(`UPDATE files SET is_inbox_new = 0 WHERE is_inbox_new = 1`).run()
  }
}
