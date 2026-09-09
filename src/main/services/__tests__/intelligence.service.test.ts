import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { TaskService } from '../task.service'
import { ScenarioService } from '../scenario.service'
import { WorkspaceContextService } from '../workspace-context.service'
import { ProjectMemoryService } from '../project-memory.service'
import { IntelligenceService } from '../intelligence.service'

describe('IntelligenceService', () => {
  let dir: string
  let db: Db

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-intelligence-'))
    db = openDb(join(dir, 'test.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('summarizes project status and suggests continuing the contextual work', () => {
    const projects = new ProjectService(db)
    const tasks = new TaskService(db)
    const scenarios = new ScenarioService(db, async () => '')
    const workspace = new WorkspaceContextService(db)
    const memory = new ProjectMemoryService(db)
    const intelligence = new IntelligenceService(db, workspace, memory, scenarios)
    const project = projects.create({ name: '松兰山活动' })
    const overdue = tasks.create({ projectId: project.id, title: '制作第二版海报', dueDate: '2000-01-01' })
    memory.update(project.id, {
      preferences: ['喜欢高级留白风格'],
      decisions: ['标题优先突出景区']
    })
    const mode = scenarios.create({
      name: '海报设计',
      items: [],
      project: project.id,
      tasks: [overdue.id]
    })
    workspace.setCurrentProject(project.id)
    workspace.setCurrentScene(mode.id)
    workspace.setFocusTask(overdue.id)

    const snapshot = intelligence.get(new Date('2026-09-09T08:00:00.000Z'))
    expect(snapshot.headline).toBe('今天：你有 1 个项目进行中。')
    expect(snapshot.projectStatuses[0]).toMatchObject({
      projectId: project.id,
      openTasks: 1,
      overdueTasks: 1,
      risk: 'overdue',
      memoryHighlights: ['喜欢高级留白风格', '标题优先突出景区']
    })
    expect(snapshot.suggestions.map((item) => item.kind)).toEqual([
      'focus_task',
      'continue_project',
      'resume_mode'
    ])
    expect(snapshot.suggestions[0]?.taskId).toBe(overdue.id)
    expect(snapshot.suggestions[2]?.workModeId).toBe(mode.id)
    expect(db.prepare(`SELECT value FROM settings WHERE key = ?`).get('intelligence.daily.2026-09-09')).toBeTruthy()
  })

  it('keeps a useful default when there are no projects', () => {
    const workspace = new WorkspaceContextService(db)
    const memory = new ProjectMemoryService(db)
    const scenarios = new ScenarioService(db, async () => '')
    const intelligence = new IntelligenceService(db, workspace, memory, scenarios)
    const snapshot = intelligence.get(new Date('2026-09-09T08:00:00.000Z'))
    expect(snapshot).toMatchObject({
      headline: '今天：你有 0 个项目进行中。',
      source: 'local',
      projectStatuses: [],
      suggestions: []
    })
  })
})

