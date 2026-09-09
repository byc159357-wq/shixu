import type { Db } from './db'
import { ProjectService } from './project.service'
import { TaskService } from './task.service'
import { ScenarioService } from './scenario.service'
import { WorkspaceContextService } from './workspace-context.service'
import { ProjectMemoryService } from './project-memory.service'
import { AgentService } from './agent.service'
import type {
  IntelligenceSnapshot,
  IntelligenceSuggestion,
  ProjectStatusInsight,
  WorkspaceContext,
  ProjectMemory,
  WorkMode
} from '../../shared/types'

const SNAPSHOT_PREFIX = 'intelligence.daily.'

interface IntelligenceContextPayload {
  workspaceContext: WorkspaceContext
  projectMemories: ProjectMemory[]
  workModes: WorkMode[]
  projectStatuses: ProjectStatusInsight[]
}

interface HermesReply {
  headline?: unknown
  body?: unknown
  suggestions?: unknown
}

/**
 * Hermes Intelligence is deliberately a bounded context layer rather than a
 * chat surface. Local rules always produce a useful snapshot; an optional
 * Hermes call can rewrite the wording using only the supplied local context.
 */
export class IntelligenceService {
  private projects: ProjectService
  private tasks: TaskService

  constructor(
    private db: Db,
    private workspace: WorkspaceContextService,
    private memory: ProjectMemoryService,
    private scenario: ScenarioService,
    private agent?: AgentService
  ) {
    this.projects = new ProjectService(db)
    this.tasks = new TaskService(db)
  }

  /** Build and persist today's deterministic local intelligence snapshot. */
  get(now = new Date()): IntelligenceSnapshot {
    const local = this.buildLocal(now)
    this.save(local)
    return local
  }

  /**
   * Ask the configured model to refine the daily wording. The prompt is a
   * fixed, non-conversational request and contains only WorkspaceContext,
   * ProjectMemory and WorkMode derived data. Invalid or unavailable replies
   * fall back to the local snapshot.
   */
  async refresh(now = new Date()): Promise<IntelligenceSnapshot> {
    const local = this.buildLocal(now)
    if (!this.agent) {
      this.save(local)
      return local
    }

    const payload = this.buildPayload(local)
    const result = await this.agent.chat([
      {
        role: 'system',
        content:
          '你是 Shixu Hermes Intelligence Layer。只根据提供的 WorkspaceContext、ProjectMemory、WorkMode 和项目状态生成每日工作摘要与最多 3 条主动建议。不要聊天、不要执行工具、不要补充外部事实。只输出 JSON：{"headline":"一句话","body":"不超过120字","suggestions":[{"id":"对应已有建议 id","title":"不超过20字","detail":"不超过80字"}]}。'
      },
      { role: 'user', content: JSON.stringify(payload) }
    ], 0.2)

    if (result.source !== 'llm') {
      this.save(local)
      return local
    }
    const parsed = parseHermesReply(result.text)
    if (!parsed) {
      this.save(local)
      return local
    }

    const suggestions = local.suggestions.map((suggestion) => {
      const replacement = parsed.suggestions?.find((item) => item.id === suggestion.id)
      return replacement
        ? { ...suggestion, title: replacement.title, detail: replacement.detail }
        : suggestion
    })
    const merged: IntelligenceSnapshot = {
      ...local,
      headline: parsed.headline || local.headline,
      body: parsed.body || local.body,
      suggestions,
      generatedAt: new Date().toISOString(),
      source: 'hermes'
    }
    this.save(merged)
    return merged
  }

  private buildLocal(now: Date): IntelligenceSnapshot {
    const payload = this.buildPayloadWithoutSnapshot()
    const activeProjects = this.projects.list().filter((p) => p.status === 'active')
    const currentProject = payload.workspaceContext.currentProject
    const focusTask = payload.workspaceContext.focusTask
    const currentMode = payload.workspaceContext.currentScene
    const projectCount = activeProjects.length
    const headline = `今天：你有 ${projectCount} 个项目进行中。`
    const contextBits = [
      currentProject ? `当前项目是「${currentProject.name}」` : '',
      focusTask ? `当前关注任务是「${focusTask.title}」` : '',
      currentMode ? `最近工作模式是「${currentMode.name}」` : ''
    ].filter(Boolean)
    const body = contextBits.length > 0
      ? `${contextBits.join('，')}。`
      : projectCount > 0
        ? '从最近的工作状态继续，选择一个项目开始。'
        : '还没有进行中的项目，可以先创建一个项目。'

    const suggestions = this.buildSuggestions(payload.workspaceContext, payload.projectStatuses, payload.workModes)
    return {
      date: dayKey(now),
      headline,
      body,
      projectStatuses: payload.projectStatuses,
      suggestions,
      generatedAt: now.toISOString(),
      source: 'local'
    }
  }

  private buildPayload(local: IntelligenceSnapshot): IntelligenceContextPayload {
    return {
      ...this.buildPayloadWithoutSnapshot(),
      projectStatuses: local.projectStatuses
    }
  }

  private buildPayloadWithoutSnapshot(): IntelligenceContextPayload {
    const workspaceContext = this.workspace.getContext()
    const workModes = this.scenario.list().sort((a, b) => toMs(b.lastUsed) - toMs(a.lastUsed))
    const projects = this.projects.list().filter((p) => p.status !== 'completed')
    const projectMemories = projects.map((project) => this.memory.get(project.id))
    const projectStatuses = projects.map((project, index) => {
      const rows = this.tasks.listByProject(project.id)
      const open = rows.filter((task) => task.status !== 'done')
      const overdue = open.filter((task) => Boolean(task.due_date && task.due_date < dayKey(new Date())))
      const done = rows.length - open.length
      const projectMemory = projectMemories[index]
      const memoryHighlights = [
        ...projectMemory.preferences,
        ...projectMemory.decisions,
        ...projectMemory.aiNotes,
        ...projectMemory.history.slice(0, 1).map((entry) => entry.detail)
      ].filter(Boolean).slice(0, 4)
      const risk: ProjectStatusInsight['risk'] = overdue.length > 0
        ? 'overdue'
        : project.status === 'active' && rows.length === 0
          ? 'stalled'
          : 'on_track'
      return {
        projectId: project.id,
        projectName: project.name,
        status: project.status,
        openTasks: open.length,
        overdueTasks: overdue.length,
        doneTasks: done,
        memoryHighlights,
        risk
      }
    })
    return { workspaceContext, projectMemories, workModes, projectStatuses }
  }

  private buildSuggestions(
    context: WorkspaceContext,
    statuses: ProjectStatusInsight[],
    modes: WorkMode[]
  ): IntelligenceSuggestion[] {
    const result: IntelligenceSuggestion[] = []
    if (context.focusTask) {
      result.push({
        id: 'focus-task',
        kind: 'focus_task',
        title: '继续当前关注任务',
        detail: `继续「${context.focusTask.title}」`,
        projectId: context.focusTask.project_id,
        taskId: context.focusTask.id
      })
    }
    const overdue = statuses.find((item) => item.overdueTasks > 0)
    if (overdue) {
      result.push({
        id: `continue-project-${overdue.projectId}`,
        kind: 'continue_project',
        title: '继续昨天未完成项目',
        detail: `「${overdue.projectName}」有 ${overdue.overdueTasks} 个逾期任务`,
        projectId: overdue.projectId
      })
    }
    const mode = context.currentScene ?? modes[0]
    if (mode) {
      result.push({
        id: `resume-mode-${mode.id}`,
        kind: 'resume_mode',
        title: '恢复最近工作模式',
        detail: `打开「${mode.name}」并恢复项目与任务`,
        projectId: mode.project,
        workModeId: mode.id,
        taskId: mode.tasks[0] ?? null
      })
    }
    if (result.length === 0) {
      const first = statuses[0]
      if (first) {
        result.push({
          id: `continue-project-${first.projectId}`,
          kind: 'continue_project',
          title: '开始一个项目',
          detail: `进入「${first.projectName}」查看工作状态`,
          projectId: first.projectId
        })
      }
    }
    return result.slice(0, 3)
  }

  private save(snapshot: IntelligenceSnapshot): void {
    this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(`${SNAPSHOT_PREFIX}${snapshot.date}`, JSON.stringify(snapshot))
  }
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toMs(value: string | null): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function parseHermesReply(text: string): {
  headline: string
  body: string
  suggestions: Array<{ id: string; title: string; detail: string }>
} | null {
  try {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as HermesReply
    const headline = typeof parsed.headline === 'string' ? parsed.headline.trim().slice(0, 120) : ''
    const body = typeof parsed.body === 'string' ? parsed.body.trim().slice(0, 240) : ''
    if (!headline && !body) return null
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const value = item as Record<string, unknown>
          const id = typeof value.id === 'string' ? value.id : ''
          const title = typeof value.title === 'string' ? value.title.trim().slice(0, 40) : ''
          const detail = typeof value.detail === 'string' ? value.detail.trim().slice(0, 120) : ''
          return id && title && detail ? [{ id, title, detail }] : []
        }).slice(0, 3)
      : []
    return { headline, body, suggestions }
  } catch {
    return null
  }
}
