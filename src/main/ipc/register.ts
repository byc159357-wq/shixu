import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { totalmem, freemem, networkInterfaces } from 'node:os'
import type { Db } from '../services/db'
import { ProjectService, type ProjectPatch } from '../services/project.service'
import { FileReferenceService } from '../services/file-reference.service'
import { SettingsService, type SettingsMap } from '../services/settings.service'
import { TaskService, type TaskInput, type TaskPatch } from '../services/task.service'
import { NoteService } from '../services/note.service'
import { SearchService } from '../services/search.service'
import { CalendarService, type EventInput } from '../services/calendar.service'
import { generateIcs, parseIcs } from '../services/ics'
import { parseIntent } from '../services/ai.service'
import { AiConfigService, type AiProviderKind } from '../services/ai-config.service'
import { OpenAiCompatClient } from '../services/ai-provider'
import { AgentService } from '../services/agent.service'
import { LlmAgent, type AgentAdapter } from '../services/agent-adapter'
import { PrepareService } from '../services/prepare.service'
import { HabitService } from '../services/habit.service'
import { ScenarioService, SCENE_NAMER_SYSTEM, parseNamerReply } from '../services/scenario.service'
import type { PreparedItem, SceneItem, EmailSaveInput } from '../../shared/types'
import { HomeLayoutService } from '../services/home-layout.service'
import { buildPromptContext, type ProjectContextInput } from '../services/ai-summary'
import {
  buildChatSystem,
  buildChatMessages,
  type ChatMsg
} from '../services/ai-chat'

interface AiConfigSaveInput {
  provider: AiProviderKind
  baseUrl: string
  model: string
  apiKey?: string | null
}
import { FileIndexService } from '../services/file-index.service'
import { LibraryService, type LibraryQuery, type RecommendQuery } from '../services/library.service'
import { InboxService } from '../services/inbox.service'
import { EmailService } from '../services/email.service'
import {
  AuditLogService,
  FsMutationService,
  WatchedFolderService
} from '../services/fs-mutation.service'
import { getThumbnailDataUrl } from '../services/thumbnails'
import { UpdateService, type UpdateStatus } from '../services/update.service'
import { IPC, EVENTS } from './channels'
import { BoxesService } from '../services/boxes.service'
import type { BoxKind } from '../../shared/types'
import { OpenLogService, type OpenLogKind } from '../services/open-log.service'
import { WeatherService } from '../services/weather.service'
import { ClipboardService } from '../services/clipboard.service'
import { BackupService } from '../services/backup.service'
import {
  HermesAcpService
} from '../services/hermes-acp.service'
import { HermesGatewayService } from '../services/hermes-gateway.service'
import { AgentHub, CompatibleHubProvider, HermesHubProvider } from '../services/agent-hub.service'
import { AgentProfilesService, type AgentProfileSaveInput } from '../services/agent-profiles.service'
import type { HermesStreamEvent } from '../../shared/types'

export interface IpcServices {
  indexer: FileIndexService
  watchedFolders: WatchedFolderService
  search: SearchService
  updater: UpdateService
  notifyFilesChanged: () => void
}

export function registerIpc(
  db: Db,
  opts: { getWindow: () => BrowserWindow | null }
): IpcServices {
  const projects = new ProjectService(db)
  const files = new FileReferenceService(db, {
    open: (filePath) => {
      void shell.openPath(filePath)
    },
    reveal: (filePath) => {
      shell.showItemInFolder(filePath)
    }
  })
  const settings = new SettingsService(db)
  const indexer = new FileIndexService(db)
  const library = new LibraryService(db)
  const inbox = new InboxService(db)
  const email = new EmailService(db)
  const audit = new AuditLogService(db)
  const tasks = new TaskService(db)
  const notes = new NoteService(db, audit)
  const search = new SearchService(db)
  const calendar = new CalendarService(db)
  const updater = new UpdateService(opts.getWindow)
  updater.init()
  const aiConfig = new AiConfigService(db)
  const getLlmAgent = (): AgentAdapter | null => {
    const client = aiConfig.buildClient()
    if (!client) return null
    return new LlmAgent(client, aiConfig.getConfig(false).provider)
  }
  const agent = new AgentService(getLlmAgent)
  const prepare = new PrepareService(db, getLlmAgent)
  const habit = new HabitService(db)
  const scenario = new ScenarioService(
    db,
    (p) => shell.openPath(p),
    async (groups) => {
      let llm: AgentAdapter | null = null
      try {
        llm = getLlmAgent()
      } catch {
        return null
      }
      if (!llm) return null
      try {
        const reply = await llm.chat([
          { role: 'system', content: SCENE_NAMER_SYSTEM },
          { role: 'user', content: JSON.stringify(groups) }
        ])
        return parseNamerReply(reply, groups)
      } catch {
        return null
      }
    }
  )
  const homeLayout = new HomeLayoutService(db)
  const watchedFolders = new WatchedFolderService(db)
  const fsMutation = new FsMutationService(db, audit)

  const boxes = new BoxesService(db)
  const openLog = new OpenLogService(db)
  const weather = new WeatherService()
  const backup = new BackupService(db, path.join(app.getPath('userData'), 'workdeck-backups'))
  const clipboardSvc = new ClipboardService((entry) => {
    const w = opts.getWindow()
    if (w && !w.isDestroyed()) w.webContents.send(EVENTS.CLIPBOARD_CHANGED, entry)
  }).start()

  const notifyFilesChanged = () => opts.getWindow()?.webContents.send(EVENTS.FILE_CHANGED)

  const pushHermesEvent = (ev: HermesStreamEvent) => {
    const w = opts.getWindow()
    if (w && !w.isDestroyed()) w.webContents.send(EVENTS.HERMES_EVENT, ev)
  }
  const hermesAcp = new HermesAcpService(pushHermesEvent)
  const hermes = new HermesGatewayService(pushHermesEvent, hermesAcp)
  // Prefer the already-running Hermes Desktop gateway. ACP is only a fallback
  // when that gateway is unavailable.
  hermes.warmup()

  // Daily scenario review is deliberately conservative: Hermes only receives a
  // locally-filtered metadata summary after the repetition threshold passed.
  scenario.setReviewer(async (candidate) => {
    const prompt = [
      '你是拾序的场景策展人。仅根据下面的本地打开记录摘要，给稳定工作组合起名并写一句说明。',
      '不要执行工具、不要建议打开任何内容、不要猜测文件内容。只输出 JSON：{"name":"不超过8字","summary":"不超过60字"}。',
      JSON.stringify(candidate)
    ].join('\n')
    const reply = await hermes.send(prompt, { sessionKey: 'shixu-scenario-daily-review', reset: true })
    try {
      const cleaned = reply.replace(/```json/gi, '').replace(/```/g, '').trim()
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start < 0 || end <= start) return null
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { name?: unknown; summary?: unknown }
      return {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        summary: typeof parsed.summary === 'string' ? parsed.summary : undefined
      }
    } catch {
      return null
    }
  })
  void scenario.reviewDaily().catch((error) => console.warn('[scenario] daily review failed:', String(error)))

  // Agent hub: pluggable external AI software. Hermes + the Settings→AI quick
  // OpenAI-compat connector are live; user-registered profiles (重）plus
  // reserved Trae/WorkBuddy seats round out the roster.
  const hub = new AgentHub()
  const embedPush = (ev: HermesStreamEvent) => {
    const w = opts.getWindow()
    if (w && !w.isDestroyed()) w.webContents.send(EVENTS.HERMES_EVENT, ev)
  }
  hub.register(new HermesHubProvider(hermes))
  hub.register(new CompatibleHubProvider(() => aiConfig.buildClient(), embedPush))

  // User-registered OpenAI-compatible software (each an independent switcher entry).
  const agentProfiles = new AgentProfilesService(db)
  const PROFILE_PREFIX = 'agent-'
  const registeredProfileIds = new Set<string>()
  const syncProfileProviders = () => {
    // Drop previously-registered dynamic providers, then rebuild from the DB so
    // availability / roster always reflect the current profile list.
    for (const id of registeredProfileIds) hub.unregister(id)
    registeredProfileIds.clear()
    for (const p of agentProfiles.list()) {
      const providerId = PROFILE_PREFIX + p.id
      registeredProfileIds.add(providerId)
      hub.register(
        new CompatibleHubProvider(
          () => agentProfiles.buildClient(p.id),
          embedPush,
          { id: providerId, name: p.name, detail: `${p.baseUrl} · ${p.model || '默认模型'}` }
        )
      )
    }
  }

  hub.register({ id: 'trae', name: 'Trae', kind: 'pending', detail: 'AI 编程 / UI 生成', note: '待接入', check: async () => false })
  hub.register({ id: 'workbuddy', name: 'WorkBuddy', kind: 'pending', detail: 'AI 助手', note: '待接入', check: async () => false })

  // ---------- Hermes (local agent) ----------
  ipcMain.handle(IPC.HERMES_CHECK, () => hermes.check())
  ipcMain.handle(
    IPC.HERMES_SEND,
    (_e, payload: { text: string; cwd?: string; reset?: boolean }) =>
      hermes.send(payload.text, { cwd: payload.cwd, reset: payload.reset })
  )
  ipcMain.handle(IPC.HERMES_STOP, () => hermes.stop())
  ipcMain.handle(
    IPC.HERMES_RESPOND_PERMISSION,
    (_e, p: { requestId: string; allow: boolean }) =>
      p && hermes.respondPermission(p.requestId, Boolean(p.allow))
  )
  ipcMain.handle(IPC.HERMES_OPEN_LOGIN, () => hermes.openLogin())

  // ---------- Agent hub: connectable external AI software ----------
  syncProfileProviders()
  ipcMain.handle(IPC.AGENT_LIST_PROVIDERS, () => { syncProfileProviders(); return hub.list() })

  // Real model picker from the selected (live) software — Hermes returns its
  // full roster; OpenAI-compatible software returns its configured model.
  ipcMain.handle(IPC.AGENT_MODEL_LIST, async (_e, payload: { provider?: string }) => {
    const p = hub.get(payload?.provider ?? 'hermes')
    return p?.listModels?.() ?? { models: [], currentModelId: null }
  })

  // Unified send/stop that routes to whichever provider the panel selected, so
  // the switcher is real — each provider exposes the same send/stop surface.
  ipcMain.handle(
    IPC.AGENT_SEND,
    (_e, payload: {
      text: string
      provider?: string
      cwd?: string
      reset?: boolean
      model?: string
      sessionKey?: string
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    }) => {
      syncProfileProviders()
      const p = hub.get(payload?.provider ?? 'hermes')
      if (!p?.send) throw new Error('该 AI 软件尚未接入')
      return p.send(payload.text, {
        cwd: payload.cwd,
        reset: payload.reset,
        model: payload.model,
        sessionKey: payload.sessionKey,
        messages: payload.messages
      })
    }
  )
  ipcMain.handle(
    IPC.AGENT_STOP,
    (_e, payload: { provider?: string }) => {
      const p = hub.get(payload?.provider ?? 'hermes')
      return p?.stop?.() ?? undefined
    }
  )

  // Manage user-registered OpenAI-compatible software profiles.
  ipcMain.handle(IPC.AGENT_PROFILE_LIST, () => agentProfiles.list())
  ipcMain.handle(IPC.AGENT_PROFILE_SAVE, (_e, input: AgentProfileSaveInput) => {
    const saved = agentProfiles.save(input)
    syncProfileProviders()
    return saved
  })
  ipcMain.handle(IPC.AGENT_PROFILE_REMOVE, (_e, payload: { id: string }) => {
    agentProfiles.remove(payload.id)
    syncProfileProviders()
    return agentProfiles.list()
  })

  // ---------- Projects ----------
  ipcMain.handle(IPC.PROJECT_LIST, () => projects.list())
  ipcMain.handle(IPC.PROJECT_CREATE, (_e, input: { name: string }) => projects.create(input))
  ipcMain.handle(IPC.PROJECT_UPDATE, (_e, payload: { id: string; patch: ProjectPatch }) =>
    projects.update(payload.id, payload.patch)
  )
  ipcMain.handle(IPC.PROJECT_ARCHIVE, (_e, payload: { id: string }) => projects.archive(payload.id))

  // ---------- File references ----------
  ipcMain.handle(IPC.FILE_LIST_BY_PROJECT, (_e, payload: { projectId: string }) =>
    files.listByProject(payload.projectId)
  )
  ipcMain.handle(IPC.FILE_REFRESH_PROJECT, (_e, payload: { projectId: string }) =>
    files.refreshProjectFiles(payload.projectId)
  )
  ipcMain.handle(IPC.FILE_ADD_REFERENCE, (_e, payload: { projectId: string; filePath: string }) =>
    files.addReference(payload.projectId, payload.filePath)
  )
  ipcMain.handle(IPC.FILE_REMOVE_FROM_PROJECT, (_e, payload: { projectId: string; fileId: string }) =>
    files.removeFromProject(payload.projectId, payload.fileId)
  )
  ipcMain.handle(IPC.FILE_RELOCATE, (_e, payload: { fileId: string; newPath: string }) =>
    files.relocate(payload.fileId, payload.newPath)
  )
  ipcMain.handle(IPC.FILE_UPDATE_TAGS, (_e, payload: { fileId: string; tags: string[] }) =>
    files.updateTags(payload.fileId, payload.tags)
  )
  ipcMain.handle(
    IPC.FILE_MOVE_TO_PROJECT,
    (_e, payload: { fileId: string; targetFolder: string }) => {
      const file = files.get(payload.fileId)
      if (!file) throw new Error(`文件引用不存在：${payload.fileId}`)
      return fsMutation.moveToProjectFolder(file, payload.targetFolder)
    }
  )
  ipcMain.handle(IPC.FILE_THUMBNAIL, (_e, payload: { fileId: string; size?: number }) => {
    const file = files.get(payload.fileId)
    if (!file) return null
    return getThumbnailDataUrl(file.path, payload.size ?? 96)
  })
  ipcMain.handle(IPC.FILE_PICK_AND_ADD, async (_e, payload: { projectId: string }) => {
    const win = opts.getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择要加入项目的文件',
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return files.addReference(payload.projectId, result.filePaths[0])
  })
  ipcMain.handle(IPC.FILE_OPEN, async (_e, payload: { fileId: string }) => {
    await files.open(payload.fileId)
    const f = files.get(payload.fileId)
    if (f) {
      try {
        openLog.record({ kind: 'file', name: f.name, path: f.path, source: 'library' })
      } catch (err) {
        console.error('[open_log] record file open failed:', String(err))
      }
    }
  })
  ipcMain.handle(IPC.FILE_OPEN_PATH, (_e, payload: { path: string }) =>
    shell.openPath(payload.path)
  )
  ipcMain.handle(IPC.FILE_REVEAL, (_e, payload: { fileId: string }) => files.reveal(payload.fileId))
  ipcMain.handle(IPC.FILE_PICK_FILE, async () => {
    const win = opts.getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择文件',
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle(IPC.FILE_PICK_FOLDER, async () => {
    const win = opts.getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '选择文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ---------- Library ----------
  ipcMain.handle(IPC.LIBRARY_LIST, (_e, q: LibraryQuery) => library.list(q))
  ipcMain.handle(IPC.LIBRARY_COUNT, () => library.count())
  ipcMain.handle(IPC.LIBRARY_TAGS, () => library.tags())
  ipcMain.handle(IPC.LIBRARY_RECOMMEND, (_e, q: RecommendQuery) => library.recommend(q))

  // ---------- Tasks ----------
  ipcMain.handle(IPC.TASK_LIST_BY_PROJECT, (_e, payload: { projectId: string }) =>
    tasks.listWithFiles(payload.projectId)
  )
  ipcMain.handle(IPC.TASK_LIST_TODAY, () => tasks.listForToday())
  ipcMain.handle(IPC.TASK_CREATE, (_e, input: TaskInput) => tasks.create(input))
  ipcMain.handle(IPC.TASK_UPDATE, (_e, payload: { id: string; patch: TaskPatch }) =>
    tasks.update(payload.id, payload.patch)
  )
  ipcMain.handle(IPC.TASK_COMPLETE, (_e, payload: { id: string }) => tasks.complete(payload.id))
  ipcMain.handle(IPC.TASK_REOPEN, (_e, payload: { id: string }) => tasks.reopen(payload.id))
  ipcMain.handle(IPC.TASK_REMOVE, (_e, payload: { id: string }) => tasks.remove(payload.id))
  ipcMain.handle(IPC.TASK_ADD_FILE, (_e, payload: { taskId: string; fileId: string }) =>
    tasks.addFile(payload.taskId, payload.fileId)
  )
  ipcMain.handle(IPC.TASK_REMOVE_FILE, (_e, payload: { taskId: string; fileId: string }) =>
    tasks.removeFile(payload.taskId, payload.fileId)
  )

  // ---------- Notes ----------
  ipcMain.handle(IPC.NOTE_LIST_BY_PROJECT, (_e, payload: { projectId: string }) =>
    notes.listByProject(payload.projectId)
  )
  ipcMain.handle(IPC.NOTE_ADD, (_e, payload: { path: string; projectId?: string | null }) =>
    notes.add(payload.path, payload.projectId)
  )
  ipcMain.handle(IPC.NOTE_CREATE, async (_e, payload: { projectId?: string | null }) => {
    const win = opts.getWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: '新建 Markdown 笔记',
      defaultPath: 'note.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, '# 新笔记\n\n', 'utf-8')
    return notes.add(result.filePath, payload.projectId)
  })
  ipcMain.handle(IPC.NOTE_GET, (_e, payload: { id: string }) => notes.getWithContent(payload.id))
  ipcMain.handle(IPC.NOTE_SAVE, (_e, payload: { id: string; content: string }) =>
    notes.save(payload.id, payload.content)
  )
  ipcMain.handle(IPC.NOTE_REMOVE, (_e, payload: { id: string }) => notes.remove(payload.id))
  ipcMain.handle(IPC.NOTE_BACKLINKS, (_e, payload: { id: string }) => notes.backlinks(payload.id))

  // ---------- Search ----------
  ipcMain.handle(IPC.SEARCH_QUERY, (_e, payload: { query: string }) =>
    search.search(payload.query)
  )
  ipcMain.handle(IPC.SEARCH_SYNC, () => search.sync())

  // ---------- Calendar ----------
  ipcMain.handle(IPC.EVENT_LIST_RANGE, (_e, payload: { from: string; to: string }) => ({
    events: calendar.listRange(payload.from, payload.to),
    scheduledTasks: calendar.listScheduledTasks(payload.from, payload.to)
  }))
  ipcMain.handle(IPC.EVENT_CREATE, (_e, input: EventInput) => calendar.create(input))
  ipcMain.handle(IPC.EVENT_UPDATE, (_e, payload: { id: string; patch: unknown }) =>
    calendar.update(payload.id, payload.patch as never)
  )
  ipcMain.handle(IPC.EVENT_REMOVE, (_e, payload: { id: string }) => calendar.remove(payload.id))
  ipcMain.handle(IPC.EVENT_EXPORT_ICS, async () => {
    const win = opts.getWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: '导出日历',
      defaultPath: 'workdeck-calendar.ics',
      filters: [{ name: 'iCalendar', extensions: ['ics'] }]
    })
    if (result.canceled || !result.filePath) return null
    const events = calendar.listRange('1970-01-01T00:00:00', '2999-12-31T23:59:59').map((e) => ({
      uid: e.id,
      summary: e.title,
      description: e.description || undefined,
      startAt: e.start_at,
      endAt: e.end_at,
      allDay: e.all_day === 1
    }))
    writeFileSync(result.filePath, generateIcs(events), 'utf-8')
    audit.record('calendar.export', { path: result.filePath, count: events.length })
    return result.filePath
  })
  ipcMain.handle(IPC.EVENT_IMPORT_ICS, async () => {
    const win = opts.getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '导入日历',
      properties: ['openFile'],
      filters: [{ name: 'iCalendar', extensions: ['ics'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const content = readFileSync(result.filePaths[0], 'utf-8')
    const parsed = parseIcs(content)
    let imported = 0
    for (const e of parsed) {
      try {
        calendar.create({
          title: e.summary,
          description: e.description,
          startAt: e.startAt,
          endAt: e.endAt,
          allDay: e.allDay
        })
        imported++
      } catch {
        /* skip invalid entries */
      }
    }
    audit.record('calendar.import', { path: result.filePaths[0], imported })
    return imported
  })

  // ---------- AI ----------
  ipcMain.handle(IPC.AI_PARSE, (_e, payload: { text: string }) => parseIntent(payload.text))
  ipcMain.handle(IPC.AI_CONFIG_GET, () => aiConfig.getConfig(false))
  ipcMain.handle(IPC.AI_CONFIG_SAVE, (_e, payload: AiConfigSaveInput) => {
    aiConfig.save(payload)
    return aiConfig.getConfig(false)
  })
  ipcMain.handle(IPC.AI_QUERY, (_e, payload: { text: string }) =>
    agent.parseIntent(payload.text)
  )
  ipcMain.handle(IPC.AI_TEST, async (_e, payload: { config: AiConfigSaveInput }) => {
    const cfg = payload.config
    const incoming = (cfg.apiKey ?? '').trim()
    // Fallback to the saved key when the user left the input blank
    // ("已保存，留空则不修改" — tests should still reflect what's persisted).
    const saved = aiConfig.getConfig(true).apiKey ?? ''
    const apiKey = incoming || saved
    // OpenAI-compatible providers need a key; Ollama doesn't.
    if (cfg.provider === 'openai-compat' && !apiKey) {
      return { ok: false, error: '未配置 API Key：请填入后重试' }
    }
    if (!cfg.baseUrl.trim() || !cfg.model.trim()) {
      return { ok: false, error: 'Base URL 和 模型 不能为空' }
    }
    const client = new OpenAiCompatClient({
      baseUrl: cfg.baseUrl,
      apiKey: apiKey || null,
      model: cfg.model
    })
    try {
      // Use a lightweight chat completion (not parseIntent, which falls back
      // to local rules) so we test the actual connection + model.
      const reply = await client.chatRaw([{ role: 'user', content: 'reply with the word ok' }])
      return { ok: true, reply: reply.slice(0, 120) }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })
  const buildProjectContextInput = (projectId: string): ProjectContextInput | null => {
    const project = projects.list().find((p) => p.id === projectId)
    if (!project) return null
    const projectTasks = tasks.listWithFiles(projectId)
    const today = new Date().toISOString().slice(0, 10)
    const in3Days = new Date()
    in3Days.setDate(in3Days.getDate() + 3)
    const in3DaysIso = in3Days.toISOString().slice(0, 10)
    const open = projectTasks.filter((t) => t.status !== 'done')
    const overdue = open.filter((t) => t.due_date && t.due_date < today)
    const dueSoon = open
      .filter((t) => t.due_date && t.due_date >= today && t.due_date <= in3DaysIso)
      .map((t) => t.title)
      .slice(0, 5)
    const noteRows = notes.listByProject(projectId)
    const fileRows = files.listByProject(projectId)
    return {
      name: project.name,
      status: project.status,
      openTasks: open.length,
      overdueTasks: overdue.length,
      doneTasks: projectTasks.length - open.length,
      notes: noteRows.length,
      files: fileRows.length,
      dueSoon
    }
  }

  ipcMain.handle(IPC.AI_SUMMARIZE, async (_e, payload: { projectId: string }) => {
    const ctx = buildProjectContextInput(payload.projectId)
    if (!ctx) return { text: '项目不存在', source: 'rules' as const }
    return agent.summarize(ctx)
  })
  ipcMain.handle(IPC.AI_PREPARE, async () => prepare.prepare())
  ipcMain.handle(IPC.AI_HABIT, () => habit.suggest())
  ipcMain.handle(IPC.AI_PREPARE_OPEN, async (_e, item: PreparedItem) => {
    try {
      openLog.record({ kind: item.kind as OpenLogKind, name: item.name, path: item.path, source: 'box' })
    } catch (err) {
      console.error('[open_log] record prepare open failed:', String(err))
    }
    const err = await shell.openPath(item.path)
    return err
  })
  ipcMain.handle(
    IPC.AI_CHAT,
    async (
      _e,
      payload: {
        messages: ChatMsg[]
        text: string
        projectId?: string | null
        noteId?: string | null
      }
    ) => {
      const projectCtx = payload.projectId ? buildProjectContextInput(payload.projectId) : null
      let noteTitle: string | null = null
      if (payload.noteId) {
        try {
          noteTitle = notes.getWithContent(payload.noteId).note.title
        } catch {
          noteTitle = null
        }
      }
      const system = buildChatSystem(
        projectCtx ? buildPromptContext(projectCtx) : null,
        noteTitle
      )
      return agent.chat(buildChatMessages(system, payload.messages, payload.text), 0.5)
    }
  )

  // ---------- Scenario presets (场景预设) ----------
  ipcMain.handle(IPC.SCENARIO_LIST, () => scenario.list())
  ipcMain.handle(
    IPC.SCENARIO_CREATE,
    (_e, input: { name: string; description?: string; items: SceneItem[] }) =>
      scenario.create(input)
  )
  ipcMain.handle(
    IPC.SCENARIO_UPDATE,
    (
      _e,
      payload: { id: string; patch: { name?: string; description?: string; items?: SceneItem[] } }
    ) => scenario.update(payload.id, payload.patch)
  )
  ipcMain.handle(IPC.SCENARIO_REMOVE, (_e, payload: { id: string }) => scenario.remove(payload.id))
  ipcMain.handle(IPC.SCENARIO_RENAME_AI, (_e, payload: { id: string }) => scenario.renameWithAi(payload.id))
  ipcMain.handle(IPC.SCENARIO_LEARN, () => scenario.learn())
  ipcMain.handle(IPC.SCENARIO_CANDIDATES, () => scenario.listCandidates())
  ipcMain.handle(IPC.SCENARIO_REVIEW_DAILY, () => scenario.reviewDaily())
  ipcMain.handle(IPC.SCENARIO_ACCEPT_CANDIDATE, (_e, payload: { id: string }) => scenario.acceptCandidate(payload.id))
  ipcMain.handle(IPC.SCENARIO_DISMISS_CANDIDATE, (_e, payload: { id: string; permanent?: boolean }) =>
    scenario.dismissCandidate(payload.id, payload.permanent)
  )
  ipcMain.handle(IPC.SCENARIO_APPLY, (_e, payload: { id: string }) => scenario.apply(payload.id))
  ipcMain.handle(IPC.SCENARIO_APPLY_ITEMS, (_e, payload: { items: SceneItem[] }) =>
    scenario.applyItems(payload.items)
  )
  ipcMain.handle(IPC.SCENARIO_COMPLETE, (_e, payload: { path: string }) => scenario.complete(payload.path))

  // ---------- Inbox ----------
  ipcMain.handle(IPC.INBOX_LIST, () => inbox.list())
  ipcMain.handle(IPC.INBOX_COUNT, () => inbox.count())
  ipcMain.handle(IPC.INBOX_MARK_HANDLED, (_e, payload: { fileId: string }) =>
    inbox.markHandled(payload.fileId)
  )
  ipcMain.handle(IPC.INBOX_MARK_ALL, () => inbox.markAllHandled())

  // ---------- Email (personal mailbox via IMAP) ----------
  ipcMain.handle(IPC.EMAIL_INFO, () => email.getInfo())
  ipcMain.handle(IPC.EMAIL_LIST, () => email.getAccounts())
  ipcMain.handle(IPC.EMAIL_ACTIVE_ID, () => email.activeId())
  ipcMain.handle(IPC.EMAIL_SAVE, (_e, input: EmailSaveInput) => email.save(input))
  ipcMain.handle(IPC.EMAIL_SELECT, (_e, id: string) => email.select(id))
  ipcMain.handle(IPC.EMAIL_REMOVE, (_e, id: string) => email.remove(id))
  ipcMain.handle(IPC.EMAIL_CLEAR, () => email.clear())
  ipcMain.handle(IPC.EMAIL_TEST, (_e, input: EmailSaveInput) => email.test(input))
  ipcMain.handle(IPC.EMAIL_INBOX, () => email.inbox())
  ipcMain.handle(IPC.EMAIL_GET, (_e, uid: number) => email.getMessage(uid))

  // ---------- Watched folders ----------
  ipcMain.handle(IPC.WATCHED_LIST, () => watchedFolders.list())
  ipcMain.handle(IPC.WATCHED_ADD, async (_e, payload: { path: string; kind: string }) => {
    watchedFolders.add(payload.path, payload.kind as never)
    // User-chosen folders get an immediate full scan so coded refs show up.
    if (payload.kind === 'custom') {
      try {
        await indexer.scanFolder(payload.path, 'initial')
        notifyFilesChanged()
      } catch {
        // scan error is surfaced via the per-folder rescan button
      }
    }
  })
  ipcMain.handle(IPC.WATCHED_REMOVE, (_e, payload: { id: string }) =>
    watchedFolders.remove(payload.id)
  )
  ipcMain.handle(IPC.WATCHED_UPDATE, (_e, payload: { id: string; patch: { displayName?: string } }) =>
    watchedFolders.updateName(payload.id, payload.patch.displayName ?? '')
  )
  ipcMain.handle(IPC.WATCHED_SCAN, async (_e, payload: { folder: string }) => {
    const stats = await indexer.scanFolder(payload.folder, 'rescan')
    notifyFilesChanged()
    return stats
  })

  // ---------- Audit ----------
  ipcMain.handle(IPC.AUDIT_LIST, (_e, payload?: { limit?: number }) =>
    audit.list(payload?.limit ?? 100)
  )

  // ---------- Settings ----------
  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: keyof SettingsMap) => settings.get(key))
  ipcMain.handle(IPC.SETTINGS_SET, (_e, payload: { key: keyof SettingsMap; value: unknown }) => {
    settings.set(payload.key, payload.value as never)
    // Apply 开机自启 immediately at the OS level, not just in the DB.
    if (payload.key === 'app.openAtLogin') {
      app.setLoginItemSettings({ openAtLogin: Boolean(payload.value) })
    }
  })
  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => settings.getAll())

  // ---------- Window ----------
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () => opts.getWindow()?.minimize())
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () => {
    try {
      const w = opts.getWindow()
      if (!w) return false
      const active = w.isFullScreen() || w.isMaximized()
      if (active) {
        // Restore: prefer unmaximize, fall back to fullscreen-off.
        if (w.isMaximized()) w.unmaximize()
        else w.setFullScreen(false)
        return false
      }
      // Maximize. We use plain OS maximize (not fullscreen) on this frameless
      // window so the native `-webkit-app-region: drag` title bar keeps its
      // "drag a maximized window down → it restores and follows the cursor"
      // behavior, exactly like a native Windows title bar. (Chrome/flash
      // previously used setFullScreen, which defeats that gesture.)
      w.maximize()
      return true
    } catch (err) {
      console.error('[WINDOW_MAXIMIZE]', err)
      return false
    }
  })
  ipcMain.handle(IPC.WINDOW_UNMAXIMIZE, () => {
    try {
      const w = opts.getWindow()
      if (!w) return
      if (w.isMaximized()) w.unmaximize()
      else w.setFullScreen(false)
    } catch (err) {
      console.error('[WINDOW_UNMAXIMIZE]', err)
    }
  })
  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, () => {
    const w = opts.getWindow()
    return w?.isFullScreen() || w?.isMaximized() || false
  })
  ipcMain.handle(IPC.WINDOW_CLOSE, () => opts.getWindow()?.close())

  // ---------- App ----------
  ipcMain.handle(IPC.APP_VERSION, () => app.getVersion())

  // ---------- Updates ----------
  ipcMain.handle(IPC.UPDATE_CHECK, () => updater.checkNow())
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, () => updater.download())
  ipcMain.handle(IPC.UPDATE_INSTALL, () => updater.quitAndInstall())
  ipcMain.handle(IPC.UPDATE_STATUS, () => updater.status() as UpdateStatus)

  // ---------- Home dashboard layout ----------
  ipcMain.handle(IPC.HOME_LAYOUT_GET, () => homeLayout.get())
  ipcMain.handle(IPC.HOME_LAYOUT_SET, (_e, payload) => {
    homeLayout.save(payload)
  })

  // ---------- Five auto-syncing boxes (软件/图片/文件/文件夹/视频) ----------
  ipcMain.handle(IPC.BOXES_LIST, (_e, payload: { kind: BoxKind }) => boxes.list(payload.kind))
  ipcMain.handle(
    IPC.BOXES_LAUNCH,
    async (_e, payload: { path: string; kind?: BoxKind; name?: string }) => {
      const result = await boxes.launch(payload.path)
      if (result.ok) {
        try {
          openLog.record({
            kind: payload.kind ?? 'docs',
            name: payload.name || path.basename(payload.path),
            path: payload.path,
            source: 'box'
          })
        } catch (err) {
          console.error('[open_log] record box open failed:', String(err))
        }
      }
      return result
    }
  )
  ipcMain.handle(IPC.BOXES_ADD_PATHS, (_e, payload: { paths: string[]; kind: BoxKind }) => {
    boxes.addPaths(payload.paths, payload.kind)
    return { ok: true }
  })
  ipcMain.handle(IPC.BOXES_REMOVE, (_e, payload: { id: string }) => boxes.remove(payload.id))
  ipcMain.handle(IPC.BOXES_CREATE_FOLDER, () => boxes.createFolder())
  ipcMain.handle(IPC.BOXES_SHOW_IN_FOLDER, (_e, payload: { path: string }) => boxes.showInFolder(payload.path))
  ipcMain.handle(IPC.BOXES_TRASH, (_e, payload: { path: string }) => boxes.trash(payload.path))
  ipcMain.handle(IPC.BOXES_PICK_ADD, async (_e, payload: { kind: BoxKind }) => {
    const win = opts.getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: '固定到空间：选择文件、软件或文件夹',
      properties: ['openFile', 'openDirectory', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    boxes.addPaths(result.filePaths, payload.kind)
    return { ok: true }
  })

  // ---------- Clipboard history ----------
  ipcMain.handle(IPC.CLIPBOARD_LIST, () => clipboardSvc.list())
  ipcMain.handle(IPC.CLIPBOARD_COPY, (_e, payload: { text: string }) => {
    clipboardSvc.copy(payload.text)
    return true
  })

  // ---------- System stats ----------
  ipcMain.handle(IPC.SYSTEM_STATS, () => {
    const total = totalmem()
    const free = freemem()
    return {
      cpu: process.getCPUUsage().percentCPUUsage,
      memUsed: total - free,
      memTotal: total,
      memPercent: total > 0 ? Math.round(((total - free) / total) * 100) : 0,
      ip: localIp(),
      platform: process.platform
    }
  })

  // ---------- Weather ----------
  ipcMain.handle(IPC.WEATHER_GET, (_e, payload: { city: string }) => weather.get(payload.city))

  // ---------- Backup (数据安全) ----------
  ipcMain.handle(IPC.BACKUP_CREATE_AUTO, () => backup.createAuto())
  ipcMain.handle(IPC.BACKUP_CREATE_MANUAL, async () => {
    const win = opts.getWindow()
    const options = {
      title: '选择备份保存位置',
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    // Manual backups land in the user's chosen folder (never auto-pruned).
    return new BackupService(db, result.filePaths[0]).createManual()
  })

  return { indexer, watchedFolders, search, updater, notifyFilesChanged }
}

function localIp(): string {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const addr of ifaces[name] ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return '—'
}
