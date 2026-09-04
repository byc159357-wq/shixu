import { create } from 'zustand'
import type { ReactNode } from 'react'
import type {
  Project,
  FileWithProject,
  FileRow,
  Density,
  Wallpaper,
  LibraryFile,
  RecommendedFile,
  WatchedFolder,
  AuditRow,
  TaskWithFiles,
  TodayTasks,
  TaskInput,
  TaskPatch,
  Note,
  UpdateStatus,
  SceneItem,
  EmailAccountInfo,
  EmailConfigInfo,
  EmailInboxResult,
  EmailSaveInput
} from '../../shared/types'

export type { Project }
export type FileEntry = FileWithProject

export type Module =
  | 'home'
  | 'projects'
  | 'library'
  | 'calendar'
  | 'ai'
  | 'aiMessages'
  | 'aiArtifacts'
  | 'aiTasks'
  | 'scenarios'
  | 'settings'
export type ProjectTab = 'overview' | 'tasks' | 'files' | 'notes' | 'timeline'

export type DetailKind = 'project' | 'file' | 'note'

export interface SelectedDetail {
  kind: DetailKind
  id: string
}

export interface ProjectSwitcherState {
  open: boolean
  // Where the popover should attach (top-left of the page anchor).
  // NaN means "centered-fixed" (no anchor).
  anchor: { left: number; top: number } | null
  // When 'new', the switch opens and immediately focuses the "create project" input.
  intent?: 'new' | null
}

export interface LibraryFilter {
  type: string
  query: string
  sort: 'mtime' | 'name' | 'size' | 'recent' | 'popular'
  view: 'grid' | 'list'
  /** Active tag filter; '' = all. */
  tag: string
  /** Active Workspace 归属 filter; '' = all, 'unlinked' = 未关联. */
  project: string
}

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  onClick: () => void
  separatorBefore?: boolean
}

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

/** "补齐剩余项" banner payload: which scenario the user is mid-way into. */
export interface ScenarioHint {
  presetName: string
  missing: SceneItem[]
}

interface AppState {
  module: Module
  projects: Project[]
  currentProjectId: string | null
  projectTab: ProjectTab
  files: FileEntry[]
  selectedFileId: string | null
  selectedDetail: SelectedDetail | null
  projectSwitcher: ProjectSwitcherState
  density: Density
  wallpaper: Wallpaper
  theme: 'dark' | 'light' | 'hermes'
  uiRadius: 'sharp' | 'default' | 'round'
  uiAlpha: 'crisp' | 'standard' | 'soft'
  uiAccent: string
  paletteOpen: boolean
  palettePrefill: string
  currentNoteId: string | null
  contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null
  toasts: Toast[]
  scenarioHint: ScenarioHint | null
  loading: boolean
  error: string | null

  libraryFiles: LibraryFile[]
  libraryFilter: LibraryFilter
  libraryTags: string[]
  recommendations: RecommendedFile[]
  inboxFiles: FileRow[]
  watchedFolders: WatchedFolder[]
  emailConfig: EmailConfigInfo | null
  emailAccounts: EmailAccountInfo[]
  emailActiveId: string | null
  emailInbox: EmailInboxResult | null
  auditRows: AuditRow[]
  projectTasks: TaskWithFiles[]
  todayTasks: TodayTasks
  projectNotes: Note[]
  updateStatus: UpdateStatus

  setModule: (m: Module) => void
  setProjectTab: (t: ProjectTab) => void
  loadLibrary: () => Promise<void>
  setLibraryFilter: (patch: Partial<LibraryFilter>) => void
  loadLibraryTags: () => Promise<void>
  loadRecommendations: () => Promise<void>
  loadInbox: () => Promise<void>
  handleInbox: (fileId: string) => Promise<void>
  loadEmailInfo: () => Promise<void>
  loadEmailInbox: () => Promise<void>
  saveEmailConfig: (input: EmailSaveInput) => Promise<void>
  selectEmail: (id: string) => Promise<void>
  removeEmail: (id: string) => Promise<void>
  clearEmailConfig: () => Promise<void>
  loadWatched: () => Promise<void>
  addWatched: (path: string, kind: WatchedFolder['kind']) => Promise<void>
  removeWatched: (id: string) => Promise<void>
  scanWatched: (folder: string) => Promise<void>
  loadAudit: () => Promise<void>
  addTagToFile: (fileId: string, tag: string) => Promise<void>
  relocateFile: (fileId: string, newPath: string) => Promise<void>
  moveFileToProjectFolder: (fileId: string, targetFolder: string) => Promise<void>
  refreshAfterFilesChange: () => Promise<void>
  loadProjectTasks: (projectId: string) => Promise<void>
  loadTodayTasks: () => Promise<void>
  createTask: (input: TaskInput) => Promise<void>
  updateTask: (id: string, patch: TaskPatch) => Promise<void>
  completeTask: (id: string) => Promise<void>
  reopenTask: (id: string) => Promise<void>
  removeTask: (id: string) => Promise<void>
  addTaskFile: (taskId: string, fileId: string) => Promise<void>
  removeTaskFile: (taskId: string, fileId: string) => Promise<void>
  loadProjectNotes: (projectId: string) => Promise<void>
  addNote: (path: string) => Promise<Note | null>
  saveNote: (id: string, content: string) => Promise<void>
  removeNote: (id: string) => Promise<void>
  setUpdateStatus: (s: UpdateStatus) => void
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  loadProjects: () => Promise<void>
  createProject: (name: string) => Promise<void>
  updateProject: (
    id: string,
    patch: { name?: string; color?: string; status?: string; deadline?: string | null }
  ) => Promise<void>
  archiveProject: (id: string) => Promise<void>
  selectProject: (id: string) => Promise<void>
  addFileToCurrentProject: () => Promise<void>
  removeFileFromProject: (fileId: string) => Promise<void>
  selectFile: (id: string | null) => void
  openFile: (id: string) => Promise<void>
  revealFile: (id: string) => Promise<void>
  setDensity: (d: Density) => Promise<void>
  setWallpaper: (w: Wallpaper) => Promise<void>
  setTheme: (t: 'dark' | 'light' | 'hermes') => Promise<void>
  setUiRadius: (v: 'sharp' | 'default' | 'round') => Promise<void>
  setUiAlpha: (v: 'crisp' | 'standard' | 'soft') => Promise<void>
  setUiAccent: (v: string) => Promise<void>
  openDetail: (detail: SelectedDetail) => void
  closeDetail: () => void
  openProjectSwitcher: (anchor?: { left: number; top: number } | null, intent?: 'new' | null) => void
  closeProjectSwitcher: () => void
  openPalette: (prefill?: string) => void
  closePalette: () => void
  setCurrentNoteId: (id: string | null) => void
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  hideContextMenu: () => void
  pushToast: (type: Toast['type'], message: string) => void
  checkScenarioCompletion: (path: string) => Promise<void>
  dismissScenarioHint: () => void
  applyScenarioMissing: () => Promise<void>
  clearError: () => void
}

let toastId = 0

export const useAppStore = create<AppState>((set, get) => ({
  module: 'home',
  projects: [],
  currentProjectId: null,
  projectTab: 'overview',
  files: [],
  selectedFileId: null,
  density: 'default',
  wallpaper: 'none',
  theme: 'dark',
  uiRadius: 'default',
  uiAlpha: 'standard',
  uiAccent: 'silver',
  paletteOpen: false,
  palettePrefill: '',
  selectedDetail: null,
  projectSwitcher: { open: false, anchor: null, intent: null },
  currentNoteId: null,
  contextMenu: null,
  toasts: [],
  scenarioHint: null,
  loading: false,
  error: null,
  libraryFiles: [],
  libraryFilter: { type: 'all', query: '', sort: 'recent', view: 'grid', tag: '', project: '' },
  libraryTags: [],
  recommendations: [],
  inboxFiles: [],
  watchedFolders: [],
  emailConfig: null,
  emailAccounts: [],
  emailActiveId: null,
  emailInbox: null,
  auditRows: [],
  projectTasks: [],
  todayTasks: { overdue: [], today: [] },
  projectNotes: [],
  updateStatus: { state: 'idle' },

  setModule: (module) => set({ module }),
  setProjectTab: (projectTab) => set({ projectTab }),

  loadProjects: async () => {
    try {
      const [projects, settings] = await Promise.all([
        window.workdeck.project.list(),
        window.workdeck.settings.getAll()
      ])
      set({
        projects,
        density: settings['ui.density'],
        wallpaper: settings['app.wallpaper'],
        theme: settings['app.theme'],
        uiRadius: settings['ui.radius'] ?? 'default',
        uiAlpha: settings['ui.alpha'] ?? 'standard',
        uiAccent: settings['ui.accent'] ?? 'silver'
      })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  createProject: async (name) => {
    try {
      const project = await window.workdeck.project.create({ name })
      set((s) => ({ projects: [project, ...s.projects], module: 'projects' }))
      await get().selectProject(project.id)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  updateProject: async (id, patch) => {
    try {
      const updated = await window.workdeck.project.update(id, patch)
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }))
    } catch (err) {
      set({ error: String(err) })
    }
  },

  archiveProject: async (id) => {
    try {
      await window.workdeck.project.archive(id)
      set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
      if (get().currentProjectId === id) {
        set({ currentProjectId: null, files: [], selectedFileId: null })
      }
      get().pushToast('info', '项目已归档（数据保留）')
    } catch (err) {
      set({ error: String(err) })
    }
  },

  selectProject: async (id) => {
    set({ currentProjectId: id, selectedFileId: null, module: 'projects' })
    try {
      // refreshProject surfaces Missing states immediately
      const files = await window.workdeck.file.refreshProject(id)
      set({ files })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  addFileToCurrentProject: async () => {
    const { currentProjectId } = get()
    if (!currentProjectId) return
    try {
      const result = await window.workdeck.file.pickAndAdd(currentProjectId)
      if (result) {
        get().pushToast('success', `已添加引用：${result.file.name}`)
        const files = await window.workdeck.file.refreshProject(currentProjectId)
        set({ files })
      }
    } catch (err) {
      set({ error: String(err) })
    }
  },

  removeFileFromProject: async (fileId) => {
    const { currentProjectId } = get()
    if (!currentProjectId) return
    try {
      await window.workdeck.file.removeFromProject(currentProjectId, fileId)
      const files = await window.workdeck.file.refreshProject(currentProjectId)
      set({ files })
      if (get().selectedFileId === fileId) set({ selectedFileId: null })
      get().pushToast('info', '已从项目移除（文件本身未动）')
    } catch (err) {
      set({ error: String(err) })
    }
  },

  selectFile: (id) => set({ selectedFileId: id }),

  openFile: async (id) => {
    try {
      await window.workdeck.file.open(id)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  revealFile: async (id) => {
    try {
      await window.workdeck.file.reveal(id)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  setDensity: async (density) => {
    set({ density })
    try {
      await window.workdeck.settings.set('ui.density', density)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  setWallpaper: async (wallpaper) => {
    set({ wallpaper })
    try {
      await window.workdeck.settings.set('app.wallpaper', wallpaper)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  setTheme: async (theme) => {
    set({ theme })
    try {
      await window.workdeck.settings.set('app.theme', theme)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  setUiRadius: async (uiRadius) => {
    set({ uiRadius })
    try {
      await window.workdeck.settings.set('ui.radius', uiRadius)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  setUiAlpha: async (uiAlpha) => {
    set({ uiAlpha })
    try {
      await window.workdeck.settings.set('ui.alpha', uiAlpha)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  setUiAccent: async (uiAccent) => {
    set({ uiAccent })
    try {
      await window.workdeck.settings.set('ui.accent', uiAccent)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  openPalette: (prefill) => set({ paletteOpen: true, palettePrefill: prefill ?? '' }),
  closePalette: () => set({ paletteOpen: false }),
  openDetail: (selectedDetail) => set({ selectedDetail }),
  closeDetail: () => set({ selectedDetail: null }),
  openProjectSwitcher: (anchor = null, intent = null) => set({ projectSwitcher: { open: true, anchor, intent } }),
  closeProjectSwitcher: () => set({ projectSwitcher: { open: false, anchor: null, intent: null } }),
  setCurrentNoteId: (currentNoteId) => set({ currentNoteId }),

  showContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  hideContextMenu: () => set({ contextMenu: null }),

  pushToast: (type, message) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, type === 'error' ? 6000 : 4000)
  },

  // ---------- Scenario completion (自动按场景补齐) ----------
  checkScenarioCompletion: async (path) => {
    try {
      const hint = await window.workdeck.scenario.complete(path)
      if (!hint) return
      set((s) => {
        // Keep the current hint if the user still hasn't acted on the same scenario.
        if (s.scenarioHint && s.scenarioHint.presetName === hint.presetName) return {}
        return { scenarioHint: hint }
      })
    } catch {
      /* silent — completion hints are best-effort */
    }
  },

  dismissScenarioHint: () => set({ scenarioHint: null }),

  applyScenarioMissing: async () => {
    const hint = get().scenarioHint
    set({ scenarioHint: null })
    if (!hint) return
    try {
      const r = await window.workdeck.scenario.applyItems(hint.missing)
      if (r.ok) get().pushToast('success', `已补齐「${hint.presetName}」剩余 ${hint.missing.length} 项`)
      else get().pushToast('error', `部分未打开：${r.errors.join('；')}`)
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  clearError: () => set({ error: null }),

  // ---------- Library ----------
  loadLibrary: async () => {
    const { libraryFilter } = get()
    try {
      const files = await window.workdeck.library.list({
        type: libraryFilter.type === 'all' ? undefined : libraryFilter.type,
        query: libraryFilter.query || undefined,
        sort: libraryFilter.sort,
        order: 'desc',
        tag: libraryFilter.tag || undefined,
        project: libraryFilter.project || undefined,
        limit: 1000
      })
      set({ libraryFiles: files })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  setLibraryFilter: (patch) => {
    set((s) => ({ libraryFilter: { ...s.libraryFilter, ...patch } }))
    void get()
      .loadLibrary()
      .then(() => void get().loadRecommendations())
  },

  loadLibraryTags: async () => {
    try {
      const libraryTags = await window.workdeck.library.tags()
      set({ libraryTags })
    } catch {
      /* silent — tags are derived and best-effort */
    }
  },

  loadRecommendations: async () => {
    const { libraryFilter, libraryFiles } = get()
    // Exclude files already on screen so suggestions stay fresh, and scope the
    // context to the active Workspace when one is selected.
    const recommended = await window.workdeck.library.recommend({
      projectId: libraryFilter.project || undefined,
      excludePaths: libraryFiles.map((f) => f.path),
      limit: 8
    })
    set({ recommendations: recommended })
  },

  // ---------- Inbox ----------
  loadInbox: async () => {
    try {
      const inboxFiles = await window.workdeck.inbox.list()
      set({ inboxFiles })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  handleInbox: async (fileId) => {
    try {
      await window.workdeck.inbox.markHandled(fileId)
      await get().loadInbox()
    } catch (err) {
      set({ error: String(err) })
    }
  },

  // ---------- Email inbox ----------
  loadEmailInfo: async () => {
    try {
      const [emailConfig, emailAccounts, emailActiveId] = await Promise.all([
        window.workdeck.email.info(),
        window.workdeck.email.list(),
        window.workdeck.email.activeId()
      ])
      set({ emailConfig, emailAccounts, emailActiveId })
      if (emailConfig?.hasAuth) await get().loadEmailInbox()
      else set({ emailInbox: null })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  loadEmailInbox: async () => {
    try {
      const emailInbox = await window.workdeck.email.inbox()
      set({ emailInbox })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  saveEmailConfig: async (input) => {
    try {
      await window.workdeck.email.save(input)
      get().pushToast('success', `已连接邮箱：${input.email}`)
      await get().loadEmailInfo()
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  selectEmail: async (id) => {
    try {
      await window.workdeck.email.select(id)
      await get().loadEmailInfo()
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  removeEmail: async (id) => {
    try {
      const acc = get().emailAccounts.find((a) => a.id === id)
      await window.workdeck.email.remove(id)
      await get().loadEmailInfo()
      get().pushToast('info', `已移除邮箱：${acc?.email ?? ''}`)
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  clearEmailConfig: async () => {
    try {
      await window.workdeck.email.clear()
      set({ emailConfig: null, emailAccounts: [], emailActiveId: null, emailInbox: null })
      get().pushToast('info', '已断开邮箱')
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  // ---------- Watched folders ----------
  loadWatched: async () => {
    try {
      const watchedFolders = await window.workdeck.watched.list()
      set({ watchedFolders })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  addWatched: async (path, kind) => {
    try {
      await window.workdeck.watched.add(path, kind)
      await get().loadWatched()
      await get().refreshAfterFilesChange()
      get().pushToast('success', `已添加监控目录：${path}`)
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  removeWatched: async (id) => {
    try {
      await window.workdeck.watched.remove(id)
      await get().loadWatched()
    } catch (err) {
      set({ error: String(err) })
    }
  },

  scanWatched: async (folder) => {
    try {
      await window.workdeck.watched.scan(folder)
      await get().refreshAfterFilesChange()
      get().pushToast('success', '重新扫描完成')
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  // ---------- Audit ----------
  loadAudit: async () => {
    try {
      const auditRows = await window.workdeck.audit.list(50)
      set({ auditRows })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  // ---------- File ops ----------
  addTagToFile: async (fileId, tag) => {
    try {
      const { currentProjectId } = get()
      await window.workdeck.file.updateTags(fileId, [tag])
      get().pushToast('success', `已添加标签：${tag}`)
      await get().refreshAfterFilesChange()
      if (currentProjectId) await get().selectProject(currentProjectId)
    } catch (err) {
      set({ error: String(err) })
    }
  },

  relocateFile: async (fileId, newPath) => {
    try {
      const result = await window.workdeck.file.relocate(fileId, newPath)
      get().pushToast('success', `已重定位：${result.name}`)
      await get().refreshAfterFilesChange()
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  moveFileToProjectFolder: async (fileId, targetFolder) => {
    try {
      const result = await window.workdeck.file.moveToProjectFolder(fileId, targetFolder)
      get().pushToast('success', `已移动到：${result.to}`)
      await get().refreshAfterFilesChange()
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  refreshAfterFilesChange: async () => {
    await Promise.all([get().loadLibrary(), get().loadInbox(), get().loadTodayTasks()])
  },

  // ---------- Tasks ----------
  loadProjectTasks: async (projectId) => {
    try {
      const projectTasks = await window.workdeck.task.listByProject(projectId)
      set({ projectTasks })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  loadTodayTasks: async () => {
    try {
      const todayTasks = await window.workdeck.task.listToday()
      set({ todayTasks })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  createTask: async (input) => {
    try {
      await window.workdeck.task.create(input)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectTasks(currentProjectId)
      await get().loadTodayTasks()
      get().pushToast('success', '任务已创建')
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  updateTask: async (id, patch) => {
    try {
      await window.workdeck.task.update(id, patch)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectTasks(currentProjectId)
      await get().loadTodayTasks()
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  completeTask: async (id) => {
    try {
      await window.workdeck.task.complete(id)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectTasks(currentProjectId)
      await get().loadTodayTasks()
      get().pushToast('success', '任务已完成 🎉')
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  reopenTask: async (id) => {
    try {
      await window.workdeck.task.reopen(id)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectTasks(currentProjectId)
      await get().loadTodayTasks()
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  removeTask: async (id) => {
    try {
      await window.workdeck.task.remove(id)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectTasks(currentProjectId)
      await get().loadTodayTasks()
      get().pushToast('info', '任务已删除')
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  addTaskFile: async (taskId, fileId) => {
    try {
      await window.workdeck.task.addFile(taskId, fileId)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectTasks(currentProjectId)
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  removeTaskFile: async (taskId, fileId) => {
    try {
      await window.workdeck.task.removeFile(taskId, fileId)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectTasks(currentProjectId)
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  // ---------- Notes ----------
  loadProjectNotes: async (projectId) => {
    try {
      const projectNotes = await window.workdeck.note.listByProject(projectId)
      set({ projectNotes })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  addNote: async (path) => {
    const { currentProjectId } = get()
    try {
      const note = await window.workdeck.note.add(path, currentProjectId)
      if (currentProjectId) await get().loadProjectNotes(currentProjectId)
      get().pushToast('success', `已添加笔记：${note.title}`)
      return note
    } catch (err) {
      get().pushToast('error', String(err))
      return null
    }
  },

  saveNote: async (id, content) => {
    try {
      await window.workdeck.note.save(id, content)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectNotes(currentProjectId)
      get().pushToast('success', '笔记已保存（写回真实文件）')
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  removeNote: async (id) => {
    try {
      await window.workdeck.note.remove(id)
      const { currentProjectId } = get()
      if (currentProjectId) await get().loadProjectNotes(currentProjectId)
      get().pushToast('info', '已移除笔记引用（文件本身未动）')
    } catch (err) {
      get().pushToast('error', String(err))
    }
  },

  // ---------- Updates ----------
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
  checkForUpdates: async () => {
    try {
      await window.workdeck.update.check()
    } catch (err) {
      set({ updateStatus: { state: 'error', message: String(err) } })
    }
  },
  downloadUpdate: async () => {
    try {
      await window.workdeck.update.download()
    } catch (err) {
      set({ updateStatus: { state: 'error', message: String(err) } })
    }
  },
  installUpdate: async () => {
    try {
      await window.workdeck.update.install()
    } catch (err) {
      set({ updateStatus: { state: 'error', message: String(err) } })
    }
  }
}))
