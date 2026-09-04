import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { ProjectService } from '../project.service'
import { FileReferenceService } from '../file-reference.service'
import { TaskService } from '../task.service'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysAhead(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

describe('TaskService', () => {
  let dir: string
  let db: Db
  let tasks: TaskService
  let projects: ProjectService
  let projectId: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-task-'))
    db = openDb(join(dir, 'test.db'))
    tasks = new TaskService(db)
    projects = new ProjectService(db)
    projectId = projects.create({ name: 'P' }).id
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates and lists tasks for a project', () => {
    const t = tasks.create({ projectId, title: '设计首页', priority: 'high', dueDate: today() })
    expect(t.status).toBe('todo')
    expect(t.priority).toBe('high')
    const list = tasks.listByProject(projectId)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('设计首页')
  })

  it('rejects empty titles', () => {
    expect(() => tasks.create({ projectId, title: '   ' })).toThrow('任务标题不能为空')
  })

  it('sorts open tasks by priority and due date, done tasks sink to bottom', () => {
    tasks.create({ projectId, title: 'low-task', priority: 'low', dueDate: today() })
    const high = tasks.create({ projectId, title: 'high-task', priority: 'high', dueDate: daysAhead(3) })
    tasks.create({ projectId, title: 'done-task', priority: 'high' })
    const done = tasks.listByProject(projectId).find((t) => t.title === 'done-task')
    tasks.complete(done!.id)

    const list = tasks.listByProject(projectId)
    expect(list[0].title).toBe('high-task') // high priority first
    expect(list[list.length - 1].title).toBe('done-task') // done last
    expect(high.status).toBe('todo')
  })

  it('listForToday: today + overdue, done excluded', () => {
    tasks.create({ projectId, title: 'due-today', dueDate: today() })
    tasks.create({ projectId, title: 'overdue-1', dueDate: daysAgo(2) })
    tasks.create({ projectId, title: 'overdue-2', dueDate: daysAgo(5) })
    const doneTask = tasks.create({ projectId, title: 'overdue-done', dueDate: daysAgo(1) })
    tasks.complete(doneTask.id)
    tasks.create({ projectId, title: 'future', dueDate: daysAhead(2) })

    const { overdue, today: todayList } = tasks.listForToday()
    expect(todayList.map((t) => t.title)).toEqual(['due-today'])
    expect(overdue.map((t) => t.title).sort()).toEqual(['overdue-1', 'overdue-2'])
    // done + future tasks never appear
    const all = [...overdue, ...todayList]
    expect(all.some((t) => t.title === 'overdue-done')).toBe(false)
    expect(all.some((t) => t.title === 'future')).toBe(false)
  })

  it('completes and reopens', () => {
    const t = tasks.create({ projectId, title: 'x' })
    const done = tasks.complete(t.id)
    expect(done.status).toBe('done')
    expect(done.completed_at).toBeTruthy()
    const reopened = tasks.reopen(t.id)
    expect(reopened.status).toBe('todo')
    expect(reopened.completed_at).toBeNull()
  })

  it('removes a task', () => {
    const t = tasks.create({ projectId, title: 'x' })
    tasks.remove(t.id)
    expect(tasks.listByProject(projectId)).toHaveLength(0)
  })

  it('links task to files and cascades on task delete', () => {
    const files = new FileReferenceService(db)
    const t = tasks.create({ projectId, title: '用素材' })
    const fixture = join(dir, 'asset.png')
    writeFileSync(fixture, 'x')
    const file = files.addReference(projectId, fixture).file

    tasks.addFile(t.id, file.id)
    const refs = tasks.listFiles(t.id)
    expect(refs).toHaveLength(1)
    expect(refs[0].name).toBe('asset.png')

    const withFiles = tasks.listWithFiles(projectId)
    expect(withFiles[0].fileIds).toContain(file.id)

    tasks.removeFile(t.id, file.id)
    expect(tasks.listFiles(t.id)).toHaveLength(0)

    // re-link then delete task → task_files cascade
    tasks.addFile(t.id, file.id)
    tasks.remove(t.id)
    expect(tasks.listFiles(t.id)).toHaveLength(0)
  })
})
