import type {
  Project,
  SceneItem,
  Task,
  WorkspaceAction,
  WorkspaceActionType,
  WorkspaceContext,
  WorkspaceRecentFile,
  WorkMode
} from '../../shared/types'
import type { Db } from './db'

const CONTEXT_KEY = 'workspace.context'
const MAX_RECENT_FILES = 12
const MAX_ACTIONS = 40

interface PersistedContext {
  currentProjectId: string | null
  currentSceneId: string | null
  recentFileIds: string[]
  focusTaskId: string | null
  lastActiveTime: string | null
}

interface ProjectRow extends Project {}

interface ScenarioRow {
  id: string
  name: string
  description: string
  items_json: string
  auto: number
  created_at: string
  updated_at: string
}

interface FileRow {
  id: string
  name: string
  path: string
  type: string
  status: 'available' | 'missing'
}

interface TaskRow extends Task {}

interface ActionDetail {
  type: WorkspaceActionType
  label: string
  detail: string
  projectId?: string | null
  fileId?: string | null
  sceneId?: string | null
  taskId?: string | null
  path?: string | null
}

function defaultContext(): PersistedContext {
  return {
    currentProjectId: null,
    currentSceneId: null,
    recentFileIds: [],
    focusTaskId: null,
    lastActiveTime: null
  }
}

function parseContext(value: string | undefined): PersistedContext {
  if (!value) return defaultContext()
  try {
    const parsed = JSON.parse(value) as Partial<PersistedContext>
    return {
      currentProjectId: typeof parsed.currentProjectId === 'string' ? parsed.currentProjectId : null,
      currentSceneId: typeof parsed.currentSceneId === 'string' ? parsed.currentSceneId : null,
      recentFileIds: Array.isArray(parsed.recentFileIds)
        ? parsed.recentFileIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT_FILES)
        : [],
      focusTaskId: typeof parsed.focusTaskId === 'string' ? parsed.focusTaskId : null,
      lastActiveTime: typeof parsed.lastActiveTime === 'string' ? parsed.lastActiveTime : null
    }
  } catch {
    return defaultContext()
  }
}

function deserializeScene(row: ScenarioRow, db: Db): WorkMode {
  let items: SceneItem[] = []
  try {
    const parsed = JSON.parse(row.items_json) as unknown
    if (Array.isArray(parsed)) items = parsed as SceneItem[]
  } catch {
    items = []
  }
  let meta: { project?: unknown; tasks?: unknown; lastUsed?: unknown; usageCount?: unknown } = {}
  const metaRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(`workmode.meta.${row.id}`) as { value: string } | undefined
  if (metaRow) {
    try { meta = JSON.parse(metaRow.value) as typeof meta } catch { /* use defaults */ }
  }
  const tasks = Array.isArray(meta.tasks) ? meta.tasks.filter((id): id is string => typeof id === 'string') : []
  const base = {
    id: row.id,
    name: row.name,
    description: row.description,
    items,
    auto: row.auto,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
  return {
    ...base,
    apps: items.filter((item) => ['app', 'apps', 'box', 'application'].includes(item.kind.toLowerCase())),
    folders: items.filter((item) => ['folder', 'folders', 'directory'].includes(item.kind.toLowerCase())),
    project: typeof meta.project === 'string' ? meta.project : null,
    tasks,
    lastUsed: typeof meta.lastUsed === 'string' ? meta.lastUsed : null,
    usageCount: typeof meta.usageCount === 'number' && Number.isFinite(meta.usageCount) ? Math.max(0, Math.floor(meta.usageCount)) : 0
  }
}

/**
 * Keeps the small amount of state needed to restore the user's working
 * position. It intentionally uses the existing settings and audit_log tables
 * so the v0.4 database schema remains unchanged.
 */
export class WorkspaceContextService {
  constructor(private db: Db) {}

  getContext(): WorkspaceContext {
    const persisted = this.readPersisted()
    const currentProject = persisted.currentProjectId
      ? (this.db.prepare(`SELECT * FROM projects WHERE id = ? AND status != 'archived'`).get(persisted.currentProjectId) as ProjectRow | undefined) ?? null
      : null
    const currentScene = persisted.currentSceneId
      ? this.getScene(persisted.currentSceneId)
      : null
    const focusTask = persisted.focusTaskId
      ? (this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(persisted.focusTaskId) as TaskRow | undefined) ?? null
      : null

    const recentFiles = persisted.recentFileIds
      .map((id) => this.getRecentFile(id))
      .filter((file): file is WorkspaceRecentFile => file !== null)

    const recentActions = (this.db
      .prepare(
        `SELECT id, ts, action, detail
         FROM audit_log
         WHERE action IN (?, ?, ?, ?)
         ORDER BY ts DESC, id DESC
         LIMIT ?`
      )
      .all(
        'workspace.project.open',
        'workspace.file.open',
        'workspace.scene.start',
        'workspace.task.complete',
        MAX_ACTIONS
      ) as Array<{ id: number; ts: string; action: string; detail: string | null }>)
      .map((row) => this.toAction(row))
      .filter((action): action is WorkspaceAction => action !== null)

    return {
      currentProject,
      currentScene,
      recentFiles,
      recentActions,
      lastActiveTime: persisted.lastActiveTime ?? recentActions[0]?.at ?? null,
      focusTask
    }
  }

  setCurrentProject(projectId: string | null): WorkspaceContext {
    if (projectId === null) {
      this.updatePersisted({ currentProjectId: null })
      return this.getContext()
    }
    const project = this.db
      .prepare(`SELECT * FROM projects WHERE id = ? AND status != 'archived'`)
      .get(projectId) as ProjectRow | undefined
    if (!project) throw new Error(`项目不存在：${projectId}`)
    return this.record('workspace.project.open', {
      type: 'project_opened',
      label: project.name,
      detail: '打开项目',
      projectId: project.id
    }, { currentProjectId: project.id })
  }

  setCurrentScene(sceneId: string | null): WorkspaceContext {
    if (sceneId === null) {
      this.updatePersisted({ currentSceneId: null })
      return this.getContext()
    }
    const scene = this.getScene(sceneId)
    if (!scene) throw new Error(`场景不存在：${sceneId}`)
    return this.record('workspace.scene.start', {
      type: 'scene_started',
      label: scene.name,
      detail: '启动场景',
      sceneId: scene.id
    }, { currentSceneId: scene.id })
  }

  setFocusTask(taskId: string | null): WorkspaceContext {
    if (taskId !== null) {
      const task = this.db.prepare(`SELECT id FROM tasks WHERE id = ?`).get(taskId)
      if (!task) throw new Error(`任务不存在：${taskId}`)
    }
    this.updatePersisted({ focusTaskId: taskId })
    return this.getContext()
  }

  recordFileOpened(fileId: string): WorkspaceContext {
    const file = this.db.prepare(`SELECT id, name, path, type, status FROM files WHERE id = ?`).get(fileId) as FileRow | undefined
    if (!file) return this.getContext()
    const projectId = (this.db
      .prepare(`SELECT project_id FROM project_files WHERE file_id = ? ORDER BY added_at DESC LIMIT 1`)
      .get(file.id) as { project_id: string } | undefined)?.project_id ?? null
    const persisted = this.readPersisted()
    const recentFileIds = [file.id, ...persisted.recentFileIds.filter((id) => id !== file.id)].slice(0, MAX_RECENT_FILES)
    return this.record('workspace.file.open', {
      type: 'file_opened',
      label: file.name,
      detail: '打开文件',
      fileId: file.id,
      projectId,
      path: file.path
    }, { recentFileIds })
  }

  recordFileOpenedByPath(filePath: string): WorkspaceContext {
    const file = this.db.prepare(`SELECT id FROM files WHERE path = ?`).get(filePath) as { id: string } | undefined
    return file ? this.recordFileOpened(file.id) : this.getContext()
  }

  recordSceneStarted(sceneId: string): WorkspaceContext {
    return this.setCurrentScene(sceneId)
  }

  recordTaskCompleted(taskId: string): WorkspaceContext {
    const task = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(taskId) as TaskRow | undefined
    if (!task) return this.getContext()
    const persisted = this.readPersisted()
    return this.record('workspace.task.complete', {
      type: 'task_completed',
      label: task.title,
      detail: '完成任务',
      taskId: task.id,
      projectId: task.project_id
    }, { focusTaskId: persisted.focusTaskId === task.id ? null : persisted.focusTaskId })
  }

  private readPersisted(): PersistedContext {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(CONTEXT_KEY) as { value: string } | undefined
    return parseContext(row?.value)
  }

  private updatePersisted(patch: Partial<PersistedContext>): void {
    const next = { ...this.readPersisted(), ...patch }
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(CONTEXT_KEY, JSON.stringify(next))
  }

  private record(action: string, detail: ActionDetail, patch: Partial<PersistedContext>): WorkspaceContext {
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO audit_log (action, ts, detail) VALUES (?, ?, ?)`).run(action, now, JSON.stringify(detail))
    this.updatePersisted({ ...patch, lastActiveTime: now })
    return this.getContext()
  }

  private getScene(id: string): WorkMode | null {
    const row = this.db.prepare(`SELECT * FROM scenario_presets WHERE id = ?`).get(id) as ScenarioRow | undefined
    return row ? deserializeScene(row, this.db) : null
  }

  private getRecentFile(id: string): WorkspaceRecentFile | null {
    const file = this.db.prepare(`SELECT id, name, path, type, status FROM files WHERE id = ?`).get(id) as FileRow | undefined
    if (!file) return null
    const projectIds = (this.db
      .prepare(`SELECT project_id FROM project_files WHERE file_id = ? ORDER BY added_at`)
      .all(id) as Array<{ project_id: string }>).map((row) => row.project_id)
    const lastOpenedAt = (this.db
      .prepare(`SELECT opened_at FROM open_log WHERE path = ? ORDER BY opened_at DESC, id DESC LIMIT 1`)
      .get(file.path) as { opened_at: string } | undefined)?.opened_at ?? null
    return { ...file, projectIds, lastOpenedAt }
  }

  private toAction(row: { id: number; ts: string; action: string; detail: string | null }): WorkspaceAction | null {
    if (!row.detail) return null
    try {
      const detail = JSON.parse(row.detail) as Partial<ActionDetail>
      if (
        detail.type !== 'project_opened' &&
        detail.type !== 'file_opened' &&
        detail.type !== 'scene_started' &&
        detail.type !== 'task_completed'
      ) return null
      if (typeof detail.label !== 'string' || typeof detail.detail !== 'string') return null
      return {
        id: row.id,
        type: detail.type,
        label: detail.label,
        detail: detail.detail,
        at: row.ts,
        projectId: detail.projectId ?? null,
        fileId: detail.fileId ?? null,
        sceneId: detail.sceneId ?? null,
        taskId: detail.taskId ?? null,
        path: detail.path ?? null
      }
    } catch {
      return null
    }
  }
}
