import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { FileReferenceService } from '../file-reference.service'
import { ScenarioService } from '../scenario.service'
import { TaskService } from '../task.service'
import { WorkspaceContextService } from '../workspace-context.service'

describe('WorkspaceContextService', () => {
  let dir: string
  let db: Db
  let workspace: WorkspaceContextService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-context-'))
    db = openDb(join(dir, 'test.db'))
    workspace = new WorkspaceContextService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('persists the active project, recent file, scene, focus task and timeline', async () => {
    const projects = new ProjectService(db)
    const files = new FileReferenceService(db)
    const tasks = new TaskService(db)
    const scenes = new ScenarioService(db, async () => '')
    const project = projects.create({ name: '松兰山活动' })
    const filePath = join(dir, 'poster-v2.png')
    writeFileSync(filePath, 'image')
    const file = files.addReference(project.id, filePath).file
    const task = tasks.create({ projectId: project.id, title: '制作第二版海报' })
    const scene = scenes.create({ name: '海报设计', items: [] })

    workspace.setCurrentProject(project.id)
    workspace.recordFileOpened(file.id)
    workspace.setFocusTask(task.id)
    workspace.recordSceneStarted(scene.id)
    tasks.complete(task.id)
    workspace.recordTaskCompleted(task.id)

    const context = workspace.getContext()
    expect(context.currentProject?.name).toBe('松兰山活动')
    expect(context.currentScene?.name).toBe('海报设计')
    expect(context.recentFiles[0]).toMatchObject({ id: file.id, name: 'poster-v2.png' })
    expect(context.focusTask).toBeNull()
    expect(context.recentActions.map((a) => a.type)).toEqual([
      'task_completed',
      'scene_started',
      'file_opened',
      'project_opened'
    ])
    expect(context.lastActiveTime).toBeTruthy()

    db.close()
    db = openDb(join(dir, 'test.db'))
    workspace = new WorkspaceContextService(db)
    const restored = workspace.getContext()
    expect(restored.currentProject?.id).toBe(project.id)
    expect(restored.currentScene?.id).toBe(scene.id)
    expect(restored.recentFiles[0]?.id).toBe(file.id)
    expect(restored.recentActions).toHaveLength(4)
  })

  it('drops stale entity ids without changing the database schema', () => {
    const before = db.pragma('user_version', { simple: true })
    expect(workspace.getContext()).toMatchObject({
      currentProject: null,
      currentScene: null,
      focusTask: null,
      recentFiles: [],
      recentActions: []
    })
    expect(db.pragma('user_version', { simple: true })).toBe(before)
  })
})
