/**
 * Shared types across main / preload / renderer.
 * Pure types only: no runtime imports, safe for both tsconfig projects.
 */

/** Streaming updates pushed from the local Hermes agent to the renderer. */
export type HermesStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'status'; status: string }
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string }
  | { type: 'permission'; requestId: string; message: string; options: string[] }
  | { type: 'done'; finalText: string }
  | { type: 'error'; message: string }

export interface Project {
  id: string
  name: string
  description: string
  status: string
  color: string
  deadline: string | null
  created_at: string
  updated_at: string
}

export interface FileRow {
  id: string
  path: string
  name: string
  ext: string
  type: string
  size: number
  mtime: number
  status: 'available' | 'missing'
  file_identity: string | null
  previous_path: string | null
  relocation_candidate_path: string | null
  relocated_at: string | null
  hash: string | null
  first_seen_at: string
  last_seen_at: string
  tags_json: string
}

export interface FileWithProject extends FileRow {
  project_id: string
  added_at: string
}

export interface AddReferenceResult {
  file: FileRow
  linked: boolean
}

export type Density = 'comfortable' | 'default' | 'compact'

export type Wallpaper = 'none' | 'aurora' | 'dusk' | 'midnight' | 'porcelain' | 'dawn' | 'spring'

export type WidgetKind =
  | 'ai'
  | 'today'
  | 'clock'
  | 'tasks'
  | 'continue'
  | 'inbox'
  | 'recent-files'
  | 'apps'
  | 'images'
  | 'docs'
  | 'folders'
  | 'videos'
  | 'clipboard'
  | 'sysmon'
  | 'quote'
  | 'weather'
  | 'pomodoro'
  | 'countdown'
  | 'sticky'
  | 'album'
  | 'digest'
  | 'flow'

export interface LayoutItem {
  id: string
  kind: WidgetKind
  x: number
  y: number
  w: number
  h: number
  title?: string
  /** Free-form per-card config (e.g. weather city, countdown target date,
      pomodoro state, sticky note text). Kept out of the strict geometry
      contract so layout logic ignores it while persistence round-trips it. */
  meta?: Record<string, unknown>
}

export interface HomeLayout {
  version: 1
  items: LayoutItem[]
}

export interface AppEntry {
  id: string
  name: string
  path: string
  icon?: string | null
  source: 'system' | 'custom'
  /** True when the entry is a folder (rendered with a folder glyph, click
   *  opens it in Explorer). */
  isDir?: boolean
  /** For pinned entries, the box the user explicitly placed them in — they
   *  always show there regardless of extension-based auto-classification. */
  box?: BoxKind
  /** `group` = a virtual folder (mobile-home-screen style) that holds other
   *  entries; otherwise the entry is a launchable app/file/folder. */
  kind?: 'app' | 'group'
  /** Id of the `group` entry this item is kept inside. */
  groupId?: string
}

/** The five auto-syncing desktop boxes (软件 / 图片 / 文件 / 文件夹 / 视频). */
export type BoxKind = 'apps' | 'images' | 'docs' | 'folders' | 'videos'

export interface SystemStats {
  cpu: number
  memUsed: number
  memTotal: number
  memPercent: number
  ip: string
  platform: string
}

export interface WeatherNow {
  city: string
  temp: number
  humidity: number
  windSpeed: number
  code: number
  text: string
  daily: Array<{
    date: string
    code: number
    text: string
    tmax: number
    tmin: number
  }>
}

export interface Settings {
  'ui.density': Density
  'app.accentColor': string
  'app.theme': 'dark' | 'light'
  'app.wallpaper': Wallpaper
  'app.openAtLogin': boolean
  'app.closeBehavior': 'ask' | 'quit' | 'tray'
}

/** Result of creating a database backup snapshot. */
export interface BackupResult {
  file: string
  size: number
  tables: number
  integrity: 'ok' | 'error'
}

export type ProjectPatch = Partial<
  Pick<Project, 'name' | 'description' | 'status' | 'color' | 'deadline'>
>

export interface WatchedFolder {
  id: string
  path: string
  kind: 'desktop' | 'downloads' | 'screenshots' | 'custom'
  enabled: number
  /** Optional friendly label for the folder, else derived from path basename. */
  displayName?: string
}

export interface LibraryQueryInput {
  type?: string
  query?: string
  sort?: 'mtime' | 'name' | 'size' | 'recent' | 'popular'
  order?: 'desc' | 'asc'
  /** Filter to files carrying exactly this tag. */
  tag?: string
  /** Filter to files whose Workspace 归属 is this project id, or 'unlinked'. */
  project?: string
  limit?: number
}

export interface LibraryFile extends FileRow {
  projects: string[]
  /** Times this file was opened (aggregated from open_log). */
  openCount: number
  /** ISO time of the most recent open, null when never opened. */
  lastOpenedAt: string | null
  /** Parsed copy of `tags_json`. */
  tags: string[]
}

export interface RecommendQueryInput {
  /** Seed file path — surface items frequently opened together with it. */
  seedPath?: string
  /** Scope / boost recommendations to files belonging to this project. */
  projectId?: string
  /** Paths to exclude from the result (e.g. files already on screen). */
  excludePaths?: string[]
  limit?: number
}

export interface RecommendedFile extends LibraryFile {
  /** Human-readable "why we suggest this" label. */
  reason: string
  score: number
}

export interface MoveResult {
  from: string
  to: string
}

export interface AuditRow {
  id: number
  ts: string
  action: string
  detail: string
}

export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  project_id: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  scheduled_date: string | null
  completed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TaskWithFiles extends Task {
  fileIds: string[]
}

export interface TaskInput {
  projectId?: string | null
  title: string
  description?: string
  priority?: TaskPriority
  dueDate?: string | null
  scheduledDate?: string | null
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'due_date' | 'scheduled_date'>
>

export interface TodayTasks {
  overdue: Task[]
  today: Task[]
}

export interface Note {
  id: string
  path: string
  title: string | null
  project_id: string | null
  content_hash: string | null
  outline_json: string
  tags_json: string
  created_at: string
  updated_at: string
}

export interface NoteContent {
  note: Note
  content: string
  externallyModified: boolean
}

export type SearchKind = 'file' | 'note' | 'task' | 'project'

export interface SearchResult {
  kind: SearchKind
  rowId: string
  title: string
  content: string
  path: string | null
}

export interface CalendarEvent {
  id: string
  title: string
  description: string
  start_at: string
  end_at: string
  all_day: number
  project_id: string | null
  created_at: string
  updated_at: string
}

export interface ScheduledTaskEntry {
  kind: 'task'
  id: string
  title: string
  start_at: string
  end_at: string
  all_day: number
  project_id: string | null
}

export interface EventInput {
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay?: boolean
  projectId?: string | null
}

export interface CalendarRange {
  events: CalendarEvent[]
  scheduledTasks: ScheduledTaskEntry[]
}

export type AiAction =
  | 'create_task'
  | 'create_event'
  | 'create_note'
  | 'move_file'
  | 'summarize'
  | 'search'
  | 'open_scenario'

export interface AiIntent {
  action: AiAction
  params: Record<string, string | null>
  confidence: number
  explanation: string
}

export interface AiParseResult {
  intent: AiIntent | null
  matches: AiIntent[]
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export type AiProviderKind = 'openai-compat' | 'ollama' | 'off'

export interface AiConfig {
  provider: AiProviderKind
  baseUrl: string
  model: string
  hasApiKey: boolean
  apiKey: string | null
}

/**
 * One connectable external AI software in the agent hub.
 * `'external'` = a live provider the panel can route to; `'pending'` = a
 * future connector seat (Trae / WorkBuddy …) not yet wired.
 */
export interface AgentProviderInfo {
  id: string
  name: string
  /** `'external'` 已接入可用；`'pending'` 待接入（占位席位）。 */
  kind: 'external' | 'pending'
  detail: string
  /** For external providers: whether the backend is actually reachable/installed. */
  available: boolean
  note?: string
}

/** A user-registered, switchable OpenAI-compatible AI software profile. */
export interface AgentProfile {
  id: string
  name: string
  baseUrl: string
  model: string
  hasApiKey: boolean
  updatedAt: number
}

/** A real model exposed by the connected AI software (e.g. Hermes ACP). */
export interface AgentModelInfo {
  id: string
  name: string
  description?: string
}

/** Model picker surfaced by the selected software, plus its current model. */
export interface AgentModelList {
  models: AgentModelInfo[]
  currentModelId?: string | null
}

export interface AiQueryResult {
  intent: AiIntent | null
  source: 'llm' | 'rules'
}

export interface AiSummaryResult {
  text: string
  source: 'llm' | 'rules'
}

/** One entry in the “帮我准备工作” panel. */
export interface PreparedItem {
  path: string
  name: string
  kind: string
  times: number
  lastOpenedAt: string
}

export interface PrepareResult {
  note: string
  items: PreparedItem[]
  source: 'llm' | 'rules'
}

/** One entry in the “习惯推荐” (proactive) panel. */
export interface HabitItem {
  path: string
  name: string
  kind: string
  score: number
  reason: string
}

export interface HabitSuggestResult {
  /** e.g. "周四 上午" — describes the current time context. */
  hourLabel: string
  items: HabitItem[]
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

/** One launchable entry inside a scenario preset (软件/图片/文件/文件夹/视频/数据文件). */
export interface SceneItem {
  kind: string
  name: string
  path: string
}

/** A saved scenario preset — a named batch of items to open together. */
export interface ScenarioPreset {
  id: string
  name: string
  description: string
  items: SceneItem[]
  /** 1 when the preset was auto-learned from open_log rather than user-saved. */
  auto: number
  createdAt: string
  updatedAt: string
}

/** A behavior pattern mined from open_log, offered as a saveable preset. */
export interface ScenarioSuggestion {
  /** Concise human name (LLM-named, or derived from the top items as a fallback). */
  name: string
  items: SceneItem[]
  /** Number of open sessions that produced this exact set. */
  count: number
  /** ISO time of the most recent session that produced it. */
  lastAt: string
}

/** A reviewed, non-destructive scenario proposal. It never launches or saves
 * anything until the user explicitly accepts it. */
export interface ScenarioCandidate {
  id: string
  name: string
  summary: string
  evidence: string
  items: SceneItem[]
  confidence: number
  occurrences: number
  lastAt: string
  status: 'pending' | 'saved' | 'dismissed' | 'blocked'
  createdAt: string
}

export interface EmailConfigInfo {
  email: string
  host: string
  port: number
  secure: boolean
  hasAuth: boolean
}

export interface EmailAccountInfo extends EmailConfigInfo {
  id: string
}

export interface EmailSaveInput {
  /** When set and matching an existing account, updates it; otherwise creates a new account. */
  id?: string
  email: string
  host: string
  port: number
  secure: boolean
  authCode: string
}

export interface EmailTestResult {
  ok: boolean
  error?: string
}

export interface MailPreview {
  uid: number
  subject: string
  from: string
  date: string
  unread: boolean
}

export interface MailDetailData {
  uid: number
  subject: string
  from: string
  date: string
  text: string
  html?: string
}

export interface MailDetailResult {
  ok: boolean
  mail?: MailDetailData
  error?: string
}

export interface EmailInboxResult {
  count: number
  list: MailPreview[]
  error?: string
}

/** The whitelisted surface exposed to the renderer via window.workdeck. */
export interface WorkdeckApi {
  project: {
    list: () => Promise<Project[]>
    create: (input: { name: string }) => Promise<Project>
    update: (id: string, patch: ProjectPatch) => Promise<Project>
    archive: (id: string) => Promise<void>
  }
  file: {
    listByProject: (projectId: string) => Promise<FileWithProject[]>
    refreshProject: (projectId: string) => Promise<FileWithProject[]>
    addReference: (projectId: string, filePath: string) => Promise<AddReferenceResult>
    pickAndAdd: (projectId: string) => Promise<AddReferenceResult | null>
    removeFromProject: (projectId: string, fileId: string) => Promise<void>
    relocate: (fileId: string, newPath: string) => Promise<FileRow>
    updateTags: (fileId: string, tags: string[]) => Promise<FileRow>
    moveToProjectFolder: (fileId: string, targetFolder: string) => Promise<MoveResult>
    thumbnail: (fileId: string, size?: number) => Promise<string | null>
    pickFile: () => Promise<string | null>
    pickFolder: () => Promise<string | null>
    open: (fileId: string) => Promise<void>
    openPath: (path: string) => Promise<string>
    reveal: (fileId: string) => Promise<void>
  }
  library: {
    list: (q?: LibraryQueryInput) => Promise<LibraryFile[]>
    count: () => Promise<number>
    tags: () => Promise<string[]>
    recommend: (q?: RecommendQueryInput) => Promise<RecommendedFile[]>
  }
  task: {
    listByProject: (projectId: string) => Promise<TaskWithFiles[]>
    listToday: () => Promise<TodayTasks>
    create: (input: TaskInput) => Promise<Task>
    update: (id: string, patch: TaskPatch) => Promise<Task>
    complete: (id: string) => Promise<Task>
    reopen: (id: string) => Promise<Task>
    remove: (id: string) => Promise<void>
    addFile: (taskId: string, fileId: string) => Promise<void>
    removeFile: (taskId: string, fileId: string) => Promise<void>
  }
  note: {
    listByProject: (projectId: string) => Promise<Note[]>
    add: (path: string, projectId?: string | null) => Promise<Note>
    create: (projectId?: string | null) => Promise<Note | null>
    get: (id: string) => Promise<NoteContent>
    save: (id: string, content: string) => Promise<Note>
    remove: (id: string) => Promise<void>
    backlinks: (id: string) => Promise<Note[]>
  }
  search: {
    query: (query: string) => Promise<SearchResult[]>
    sync: () => Promise<{ indexed: number }>
  }
  calendar: {
    listRange: (from: string, to: string) => Promise<CalendarRange>
    create: (input: EventInput) => Promise<CalendarEvent>
    update: (id: string, patch: Partial<EventInput>) => Promise<CalendarEvent>
    remove: (id: string) => Promise<void>
    exportIcs: () => Promise<string | null>
    importIcs: () => Promise<number | null>
  }
  ai: {
    parse: (text: string) => Promise<AiParseResult>
    query: (text: string) => Promise<AiQueryResult>
    summarize: (projectId: string) => Promise<AiSummaryResult>
    chat: (input: {
      messages: ChatMsg[]
      text: string
      projectId?: string | null
      noteId?: string | null
    }) => Promise<AiSummaryResult>
    prepare: () => Promise<PrepareResult>
    prepareOpen: (item: PreparedItem) => Promise<string>
    habit: () => Promise<HabitSuggestResult>
    configGet: () => Promise<AiConfig>
    configSave: (input: {
      provider: AiProviderKind
      baseUrl: string
      model: string
      apiKey?: string | null
    }) => Promise<AiConfig>
    test: (input: {
      provider: AiProviderKind
      baseUrl: string
      model: string
      apiKey?: string | null
    }) => Promise<{ ok: boolean; reply: string }>
  }
  scenario: {
    list: () => Promise<ScenarioPreset[]>
    create: (input: {
      name: string
      description?: string
      items: SceneItem[]
    }) => Promise<ScenarioPreset>
    update: (
      id: string,
      patch: { name?: string; description?: string; items?: SceneItem[] }
    ) => Promise<ScenarioPreset>
    remove: (id: string) => Promise<void>
    renameWithAi: (id: string) => Promise<string>
    learn: () => Promise<ScenarioSuggestion[]>
    candidates: () => Promise<ScenarioCandidate[]>
    reviewDaily: () => Promise<ScenarioCandidate[]>
    acceptCandidate: (id: string) => Promise<ScenarioPreset>
    dismissCandidate: (id: string, permanent?: boolean) => Promise<void>
    apply: (id: string) => Promise<{ ok: boolean; errors: string[] }>
    /** Open a raw batch of items (used by the “补齐剩余项” flow). */
    applyItems: (items: SceneItem[]) => Promise<{ ok: boolean; errors: string[] }>
    /** After opening one scenario item, ask whether the rest of a saved scenario
     *  is missing and worth offering. */
    complete: (
      path: string
    ) => Promise<{ presetName: string; missing: SceneItem[] } | null>
  }
  home: {
    getLayout: () => Promise<HomeLayout | null>
    saveLayout: (layout: HomeLayout) => Promise<void>
  }
  boxes: {
    list: (kind: BoxKind) => Promise<AppEntry[]>
    launch: (path: string, kind: BoxKind, name: string) => Promise<{ ok: boolean; error?: string }>
    addPaths: (paths: string[], kind: BoxKind) => Promise<void>
    remove: (id: string) => Promise<boolean>
    createFolder: () => Promise<AppEntry | null>
    pickAdd: (kind: BoxKind) => Promise<{ ok: boolean; error?: string } | null>
    showInFolder: (path: string) => Promise<void>
    trash: (path: string) => Promise<{ ok: boolean; error?: string }>
    resolvePath: (file: unknown) => string
  }
  clipboard: {
    list: () => Promise<string[]>
    copy: (text: string) => Promise<void>
  }
  system: {
    stats: () => Promise<SystemStats>
  }
  weather: {
    get: (city: string) => Promise<WeatherNow | null>
  }
  update: {
    check: () => Promise<void>
    download: () => Promise<void>
    install: () => Promise<void>
    status: () => Promise<UpdateStatus>
  }
  backup: {
    /** Manual backup: pick a destination folder, write a snapshot there. */
    createManual: () => Promise<BackupResult | null>
    /** Auto backup: write a snapshot into the app's default backup dir. */
    createAuto: () => Promise<BackupResult>
  }
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  onFilesChanged: (cb: () => void) => () => void
  onClipboardChanged: (cb: (entry: string) => void) => () => void
  agent: {
    /** List connectable external AI software for the agent hub switcher. */
    listProviders: () => Promise<AgentProviderInfo[]>
    /** Real model roster + current model reported by the selected software. */
    modelList: (opts?: { provider?: string }) => Promise<AgentModelList>
    /** Send a prompt to the selected provider (defaults to hermes). */
    send: (text: string, opts?: {
      provider?: string
      cwd?: string
      reset?: boolean
      model?: string
      sessionKey?: string
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    }) => Promise<string>
    /** Stop the selected provider's current run. */
    stop: (opts?: { provider?: string }) => Promise<unknown>
    /** Streamed status / text / tool / permission events for the active run. */
    onEvent: (cb: (ev: HermesStreamEvent) => void) => () => void
    /** List registered OpenAI-compatible software profiles. */
    profileList: () => Promise<AgentProfile[]>
    /** Create/update a profile; returns the saved profile. */
    profileSave: (input: { id?: string | null; name: string; baseUrl: string; model: string; apiKey?: string | null }) => Promise<AgentProfile>
    /** Remove a profile and return the remaining list. */
    profileRemove: (id: string) => Promise<AgentProfile[]>
  }
  hermes: {
    check: () => Promise<{ available: boolean; exe: string | null; agentInfo?: string | null; reason?: string; message?: string }>
    send: (text: string, opts?: { cwd?: string; reset?: boolean }) => Promise<string>
    stop: () => Promise<void>
    respondPermission: (requestId: string, allow: boolean) => Promise<void>
    openLogin: () => Promise<{ ok: boolean; message: string }>
    onEvent: (cb: (ev: HermesStreamEvent) => void) => () => void
  }
  inbox: {
    list: () => Promise<FileRow[]>
    count: () => Promise<number>
    markHandled: (fileId: string) => Promise<void>
    markAll: () => Promise<void>
  }
  email: {
    list: () => Promise<EmailAccountInfo[]>
    activeId: () => Promise<string | null>
    info: () => Promise<EmailConfigInfo | null>
    save: (input: EmailSaveInput) => Promise<void>
    select: (id: string) => Promise<void>
    remove: (id: string) => Promise<void>
    clear: () => Promise<void>
    test: (input: EmailSaveInput) => Promise<EmailTestResult>
    inbox: () => Promise<EmailInboxResult>
    get: (uid: number) => Promise<MailDetailResult>
  }
  watched: {
    list: () => Promise<WatchedFolder[]>
    add: (path: string, kind: WatchedFolder['kind']) => Promise<void>
    update: (id: string, patch: { displayName?: string }) => Promise<void>
    remove: (id: string) => Promise<void>
    scan: (folder: string) => Promise<unknown>
  }
  audit: {
    list: (limit?: number) => Promise<AuditRow[]>
  }
  settings: {
    getAll: () => Promise<Settings>
    set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    unmaximize: () => Promise<void>
    isMaximized: () => Promise<boolean>
    close: () => Promise<void>
    quit: () => Promise<void>
  }
  app: {
    version: () => Promise<string>
  }
}
