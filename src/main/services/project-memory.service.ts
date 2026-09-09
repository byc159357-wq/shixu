import { randomUUID } from 'node:crypto'
import type {
  ProjectMemory,
  ProjectMemoryHistoryInput,
  ProjectMemoryHistoryEntry,
  ProjectMemoryPatch,
  Project
} from '../../shared/types'
import type { Db } from './db'

const KEY_PREFIX = 'project.memory.'
const MAX_LIST_ITEMS = 100
const MAX_HISTORY_ITEMS = 100
const MAX_IMPORTANT_FILES = 50

function emptyMemory(projectId: string): ProjectMemory {
  return {
    projectId,
    preferences: [],
    decisions: [],
    history: [],
    aiNotes: [],
    importantFiles: []
  }
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= limit) break
  }
  return result
}

function parseHistory(value: unknown): ProjectMemoryHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Partial<ProjectMemoryHistoryEntry> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      id: typeof item.id === 'string' && item.id ? item.id : randomUUID(),
      action: typeof item.action === 'string' ? item.action.trim() : '',
      detail: typeof item.detail === 'string' ? item.detail.trim() : '',
      at: typeof item.at === 'string' ? item.at : new Date().toISOString()
    }))
    .filter((item) => item.action && item.detail)
    .slice(0, MAX_HISTORY_ITEMS)
}

/**
 * Stores explicit project memory as JSON values in the existing SQLite
 * settings table. This keeps the database schema compatible while giving each
 * project an isolated, durable context object.
 */
export class ProjectMemoryService {
  constructor(private db: Db) {}

  get(projectId: string): ProjectMemory {
    this.ensureProject(projectId)
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(this.key(projectId)) as
      | { value: string }
      | undefined
    if (!row) return emptyMemory(projectId)

    try {
      const parsed = JSON.parse(row.value) as Partial<ProjectMemory>
      const memory: ProjectMemory = {
        projectId,
        preferences: stringList(parsed.preferences, MAX_LIST_ITEMS),
        decisions: stringList(parsed.decisions, MAX_LIST_ITEMS),
        history: parseHistory(parsed.history),
        aiNotes: stringList(parsed.aiNotes, MAX_LIST_ITEMS),
        importantFiles: stringList(parsed.importantFiles, MAX_IMPORTANT_FILES)
      }
      return {
        ...memory,
        importantFiles: this.onlyProjectFiles(projectId, memory.importantFiles)
      }
    } catch {
      return emptyMemory(projectId)
    }
  }

  update(projectId: string, patch: ProjectMemoryPatch): ProjectMemory {
    const current = this.get(projectId)
    const next: ProjectMemory = {
      ...current,
      preferences: patch.preferences === undefined
        ? current.preferences
        : stringList(patch.preferences, MAX_LIST_ITEMS),
      decisions: patch.decisions === undefined
        ? current.decisions
        : stringList(patch.decisions, MAX_LIST_ITEMS),
      aiNotes: patch.aiNotes === undefined
        ? current.aiNotes
        : stringList(patch.aiNotes, MAX_LIST_ITEMS),
      importantFiles: patch.importantFiles === undefined
        ? current.importantFiles
        : this.onlyProjectFiles(projectId, stringList(patch.importantFiles, MAX_IMPORTANT_FILES))
    }
    this.save(next)
    return next
  }

  record(projectId: string, input: ProjectMemoryHistoryInput): ProjectMemory {
    const current = this.get(projectId)
    const action = input.action.trim()
    const detail = input.detail.trim()
    if (!action || !detail) return current
    const entry: ProjectMemoryHistoryEntry = {
      id: randomUUID(),
      action,
      detail,
      at: new Date().toISOString()
    }
    const next = {
      ...current,
      history: [entry, ...current.history].slice(0, MAX_HISTORY_ITEMS)
    }
    this.save(next)
    return next
  }

  recordFileOpened(fileId: string): ProjectMemory[] {
    const file = this.db.prepare(`SELECT name FROM files WHERE id = ?`).get(fileId) as { name: string } | undefined
    if (!file) return []
    const projects = this.db
      .prepare(`SELECT project_id FROM project_files WHERE file_id = ?`)
      .all(fileId) as Array<{ project_id: string }>
    return projects.map(({ project_id }) => this.record(project_id, {
      action: '打开文件',
      detail: file.name
    }))
  }

  recordFileOpenedByPath(filePath: string): ProjectMemory[] {
    const file = this.db.prepare(`SELECT id FROM files WHERE path = ?`).get(filePath) as { id: string } | undefined
    return file ? this.recordFileOpened(file.id) : []
  }

  private key(projectId: string): string {
    return `${KEY_PREFIX}${projectId}`
  }

  private ensureProject(projectId: string): Project {
    const project = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as Project | undefined
    if (!project) throw new Error(`项目不存在：${projectId}`)
    return project
  }

  private onlyProjectFiles(projectId: string, fileIds: string[]): string[] {
    if (fileIds.length === 0) return []
    const rows = this.db
      .prepare(`SELECT file_id FROM project_files WHERE project_id = ? AND file_id IN (${fileIds.map(() => '?').join(',')})`)
      .all(projectId, ...fileIds) as Array<{ file_id: string }>
    const allowed = new Set(rows.map((row) => row.file_id))
    return fileIds.filter((id) => allowed.has(id))
  }

  private save(memory: ProjectMemory): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(this.key(memory.projectId), JSON.stringify(memory))
  }
}
