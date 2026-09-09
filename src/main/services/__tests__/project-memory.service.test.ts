import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { FileReferenceService } from '../file-reference.service'
import { ProjectService } from '../project.service'
import { ProjectMemoryService } from '../project-memory.service'
import { buildPromptContext } from '../ai-summary'

describe('ProjectMemoryService', () => {
  let dir: string
  let db: Db
  let memory: ProjectMemoryService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-project-memory-'))
    db = openDb(join(dir, 'test.db'))
    memory = new ProjectMemoryService(db)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps project memory isolated and restores it from SQLite', () => {
    const projects = new ProjectService(db)
    const files = new FileReferenceService(db)
    const project = projects.create({ name: '松兰山活动' })
    const other = projects.create({ name: '另一个项目' })
    const filePath = join(dir, 'poster-v2.png')
    writeFileSync(filePath, 'image')
    const file = files.addReference(project.id, filePath).file

    memory.update(project.id, {
      preferences: ['喜欢高级留白风格'],
      decisions: ['标题优先突出景区'],
      aiNotes: ['优先沿用第二版海报的版式'],
      importantFiles: [file.id]
    })
    memory.record(project.id, { action: '确定方向', detail: '采用高级留白风格' })

    expect(memory.get(project.id)).toMatchObject({
      projectId: project.id,
      preferences: ['喜欢高级留白风格'],
      decisions: ['标题优先突出景区'],
      aiNotes: ['优先沿用第二版海报的版式'],
      importantFiles: [file.id]
    })
    expect(memory.get(other.id).preferences).toEqual([])

    const prompt = buildPromptContext({
      name: project.name,
      status: project.status,
      openTasks: 0,
      overdueTasks: 0,
      doneTasks: 0,
      notes: 0,
      files: 1,
      dueSoon: [],
      memory: memory.get(project.id)
    })
    expect(prompt).toContain('项目偏好：喜欢高级留白风格')
    expect(prompt).toContain('历史决策：标题优先突出景区')

    db.close()
    db = openDb(join(dir, 'test.db'))
    memory = new ProjectMemoryService(db)
    expect(memory.get(project.id).history[0]?.detail).toBe('采用高级留白风格')
  })

  it('does not change the existing SQLite schema', () => {
    const before = db.pragma('user_version', { simple: true })
    const project = new ProjectService(db).create({ name: '兼容性测试' })
    expect(memory.get(project.id)).toMatchObject({ projectId: project.id, history: [] })
    expect(db.pragma('user_version', { simple: true })).toBe(before)
  })
})
