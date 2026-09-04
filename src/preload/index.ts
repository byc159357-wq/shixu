import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, EVENTS } from '../main/ipc/channels'
import type { UpdateStatus, WorkdeckApi } from '../shared/types'

/**
 * The only surface the renderer can touch. Whitelist-only:
 * every method maps 1:1 to a channel declared in channels.ts.
 */
const api: WorkdeckApi = {
  project: {
    list: () => ipcRenderer.invoke(IPC.PROJECT_LIST),
    create: (input) => ipcRenderer.invoke(IPC.PROJECT_CREATE, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.PROJECT_UPDATE, { id, patch }),
    archive: (id) => ipcRenderer.invoke(IPC.PROJECT_ARCHIVE, { id })
  },
  file: {
    listByProject: (projectId) => ipcRenderer.invoke(IPC.FILE_LIST_BY_PROJECT, { projectId }),
    refreshProject: (projectId) => ipcRenderer.invoke(IPC.FILE_REFRESH_PROJECT, { projectId }),
    addReference: (projectId, filePath) =>
      ipcRenderer.invoke(IPC.FILE_ADD_REFERENCE, { projectId, filePath }),
    pickAndAdd: (projectId) => ipcRenderer.invoke(IPC.FILE_PICK_AND_ADD, { projectId }),
    removeFromProject: (projectId, fileId) =>
      ipcRenderer.invoke(IPC.FILE_REMOVE_FROM_PROJECT, { projectId, fileId }),
    relocate: (fileId, newPath) => ipcRenderer.invoke(IPC.FILE_RELOCATE, { fileId, newPath }),
    updateTags: (fileId, tags) => ipcRenderer.invoke(IPC.FILE_UPDATE_TAGS, { fileId, tags }),
    moveToProjectFolder: (fileId, targetFolder) =>
      ipcRenderer.invoke(IPC.FILE_MOVE_TO_PROJECT, { fileId, targetFolder }),
    thumbnail: (fileId, size) => ipcRenderer.invoke(IPC.FILE_THUMBNAIL, { fileId, size }),
    pickFile: () => ipcRenderer.invoke(IPC.FILE_PICK_FILE),
    pickFolder: () => ipcRenderer.invoke(IPC.FILE_PICK_FOLDER),
    open: (fileId) => ipcRenderer.invoke(IPC.FILE_OPEN, { fileId }),
    openPath: (path) => ipcRenderer.invoke(IPC.FILE_OPEN_PATH, { path }),
    reveal: (fileId) => ipcRenderer.invoke(IPC.FILE_REVEAL, { fileId })
  },
  library: {
    list: (q) => ipcRenderer.invoke(IPC.LIBRARY_LIST, q),
    count: () => ipcRenderer.invoke(IPC.LIBRARY_COUNT),
    tags: () => ipcRenderer.invoke(IPC.LIBRARY_TAGS),
    recommend: (q) => ipcRenderer.invoke(IPC.LIBRARY_RECOMMEND, q)
  },
  task: {
    listByProject: (projectId) => ipcRenderer.invoke(IPC.TASK_LIST_BY_PROJECT, { projectId }),
    listToday: () => ipcRenderer.invoke(IPC.TASK_LIST_TODAY),
    create: (input) => ipcRenderer.invoke(IPC.TASK_CREATE, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.TASK_UPDATE, { id, patch }),
    complete: (id) => ipcRenderer.invoke(IPC.TASK_COMPLETE, { id }),
    reopen: (id) => ipcRenderer.invoke(IPC.TASK_REOPEN, { id }),
    remove: (id) => ipcRenderer.invoke(IPC.TASK_REMOVE, { id }),
    addFile: (taskId, fileId) => ipcRenderer.invoke(IPC.TASK_ADD_FILE, { taskId, fileId }),
    removeFile: (taskId, fileId) => ipcRenderer.invoke(IPC.TASK_REMOVE_FILE, { taskId, fileId })
  },
  note: {
    listByProject: (projectId) => ipcRenderer.invoke(IPC.NOTE_LIST_BY_PROJECT, { projectId }),
    add: (path, projectId) => ipcRenderer.invoke(IPC.NOTE_ADD, { path, projectId }),
    create: (projectId) => ipcRenderer.invoke(IPC.NOTE_CREATE, { projectId }),
    get: (id) => ipcRenderer.invoke(IPC.NOTE_GET, { id }),
    save: (id, content) => ipcRenderer.invoke(IPC.NOTE_SAVE, { id, content }),
    remove: (id) => ipcRenderer.invoke(IPC.NOTE_REMOVE, { id }),
    backlinks: (id) => ipcRenderer.invoke(IPC.NOTE_BACKLINKS, { id })
  },
  search: {
    query: (query) => ipcRenderer.invoke(IPC.SEARCH_QUERY, { query }),
    sync: () => ipcRenderer.invoke(IPC.SEARCH_SYNC)
  },
  calendar: {
    listRange: (from, to) => ipcRenderer.invoke(IPC.EVENT_LIST_RANGE, { from, to }),
    create: (input) => ipcRenderer.invoke(IPC.EVENT_CREATE, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.EVENT_UPDATE, { id, patch }),
    remove: (id) => ipcRenderer.invoke(IPC.EVENT_REMOVE, { id }),
    exportIcs: () => ipcRenderer.invoke(IPC.EVENT_EXPORT_ICS),
    importIcs: () => ipcRenderer.invoke(IPC.EVENT_IMPORT_ICS)
  },
  ai: {
    parse: (text) => ipcRenderer.invoke(IPC.AI_PARSE, { text }),
    query: (text) => ipcRenderer.invoke(IPC.AI_QUERY, { text }),
    summarize: (projectId) => ipcRenderer.invoke(IPC.AI_SUMMARIZE, { projectId }),
    chat: (input) => ipcRenderer.invoke(IPC.AI_CHAT, input),
    prepare: () => ipcRenderer.invoke(IPC.AI_PREPARE),
    prepareOpen: (item) => ipcRenderer.invoke(IPC.AI_PREPARE_OPEN, item),
    habit: () => ipcRenderer.invoke(IPC.AI_HABIT),
    configGet: () => ipcRenderer.invoke(IPC.AI_CONFIG_GET),
    configSave: (input) => ipcRenderer.invoke(IPC.AI_CONFIG_SAVE, input),
    test: (input) => ipcRenderer.invoke(IPC.AI_TEST, { config: input })
  },
  scenario: {
    list: () => ipcRenderer.invoke(IPC.SCENARIO_LIST),
    create: (input) => ipcRenderer.invoke(IPC.SCENARIO_CREATE, input),
    update: (id, patch) => ipcRenderer.invoke(IPC.SCENARIO_UPDATE, { id, patch }),
    remove: (id) => ipcRenderer.invoke(IPC.SCENARIO_REMOVE, { id }),
    renameWithAi: (id) => ipcRenderer.invoke(IPC.SCENARIO_RENAME_AI, { id }),
    learn: () => ipcRenderer.invoke(IPC.SCENARIO_LEARN),
    candidates: () => ipcRenderer.invoke(IPC.SCENARIO_CANDIDATES),
    reviewDaily: () => ipcRenderer.invoke(IPC.SCENARIO_REVIEW_DAILY),
    acceptCandidate: (id) => ipcRenderer.invoke(IPC.SCENARIO_ACCEPT_CANDIDATE, { id }),
    dismissCandidate: (id, permanent) => ipcRenderer.invoke(IPC.SCENARIO_DISMISS_CANDIDATE, { id, permanent }),
    apply: (id) => ipcRenderer.invoke(IPC.SCENARIO_APPLY, { id }),
    applyItems: (items) => ipcRenderer.invoke(IPC.SCENARIO_APPLY_ITEMS, { items }),
    complete: (path) => ipcRenderer.invoke(IPC.SCENARIO_COMPLETE, { path })
  },
  inbox: {
    list: () => ipcRenderer.invoke(IPC.INBOX_LIST),
    count: () => ipcRenderer.invoke(IPC.INBOX_COUNT),
    markHandled: (fileId) => ipcRenderer.invoke(IPC.INBOX_MARK_HANDLED, { fileId }),
    markAll: () => ipcRenderer.invoke(IPC.INBOX_MARK_ALL)
  },
  email: {
    list: () => ipcRenderer.invoke(IPC.EMAIL_LIST),
    activeId: () => ipcRenderer.invoke(IPC.EMAIL_ACTIVE_ID),
    info: () => ipcRenderer.invoke(IPC.EMAIL_INFO),
    save: (input) => ipcRenderer.invoke(IPC.EMAIL_SAVE, input),
    select: (id) => ipcRenderer.invoke(IPC.EMAIL_SELECT, id),
    remove: (id) => ipcRenderer.invoke(IPC.EMAIL_REMOVE, id),
    clear: () => ipcRenderer.invoke(IPC.EMAIL_CLEAR),
    test: (input) => ipcRenderer.invoke(IPC.EMAIL_TEST, input),
    inbox: () => ipcRenderer.invoke(IPC.EMAIL_INBOX),
    get: (uid) => ipcRenderer.invoke(IPC.EMAIL_GET, uid)
  },
  watched: {
    list: () => ipcRenderer.invoke(IPC.WATCHED_LIST),
    add: (path, kind) => ipcRenderer.invoke(IPC.WATCHED_ADD, { path, kind }),
    update: (id, patch) => ipcRenderer.invoke(IPC.WATCHED_UPDATE, { id, patch }),
    remove: (id) => ipcRenderer.invoke(IPC.WATCHED_REMOVE, { id }),
    scan: (folder) => ipcRenderer.invoke(IPC.WATCHED_SCAN, { folder })
  },
  audit: {
    list: (limit) => ipcRenderer.invoke(IPC.AUDIT_LIST, { limit })
  },
  settings: {
    getAll: () => ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
    set: (key, value) => ipcRenderer.invoke(IPC.SETTINGS_SET, { key, value } as never)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
    unmaximize: () => ipcRenderer.invoke(IPC.WINDOW_UNMAXIMIZE),
    isMaximized: () => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED),
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE)
  },
  app: {
    version: () => ipcRenderer.invoke(IPC.APP_VERSION)
  },
  update: {
    check: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    download: () => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
    install: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    status: () => ipcRenderer.invoke(IPC.UPDATE_STATUS)
  },
  home: {
    getLayout: () => ipcRenderer.invoke(IPC.HOME_LAYOUT_GET),
    saveLayout: (layout) => ipcRenderer.invoke(IPC.HOME_LAYOUT_SET, layout)
  },
  boxes: {
    list: (kind) => ipcRenderer.invoke(IPC.BOXES_LIST, { kind }),
    launch: (path, kind, name) =>
      ipcRenderer.invoke(IPC.BOXES_LAUNCH, { path, kind, name }),
    addPaths: (paths, kind) => ipcRenderer.invoke(IPC.BOXES_ADD_PATHS, { paths, kind }),
    remove: (id) => ipcRenderer.invoke(IPC.BOXES_REMOVE, { id }),
    createFolder: () => ipcRenderer.invoke(IPC.BOXES_CREATE_FOLDER),
    pickAdd: (kind) => ipcRenderer.invoke(IPC.BOXES_PICK_ADD, { kind }),
    showInFolder: (path) => ipcRenderer.invoke(IPC.BOXES_SHOW_IN_FOLDER, { path }),
    trash: (path) => ipcRenderer.invoke(IPC.BOXES_TRASH, { path }),
    resolvePath: (file) => webUtils.getPathForFile(file as never)
  },
  clipboard: {
    list: () => ipcRenderer.invoke(IPC.CLIPBOARD_LIST),
    copy: (text) => ipcRenderer.invoke(IPC.CLIPBOARD_COPY, { text })
  },
  system: {
    stats: () => ipcRenderer.invoke(IPC.SYSTEM_STATS)
  },
  weather: {
    get: (city) => ipcRenderer.invoke(IPC.WEATHER_GET, { city })
  },
  backup: {
    createManual: () => ipcRenderer.invoke(IPC.BACKUP_CREATE_MANUAL),
    createAuto: () => ipcRenderer.invoke(IPC.BACKUP_CREATE_AUTO)
  },
  onUpdateStatus: (cb) => {
    const listener = (_e: unknown, status: UpdateStatus) => cb(status)
    ipcRenderer.on(EVENTS.UPDATE_STATUS, listener)
    return () => {
      ipcRenderer.removeListener(EVENTS.UPDATE_STATUS, listener)
    }
  },
  onFilesChanged: (cb) => {
    const listener = () => cb()
    ipcRenderer.on(EVENTS.FILE_CHANGED, listener)
    return () => {
      ipcRenderer.removeListener(EVENTS.FILE_CHANGED, listener)
    }
  },
  onClipboardChanged: (cb) => {
    const listener = (_e: unknown, entry: string) => cb(entry)
    ipcRenderer.on(EVENTS.CLIPBOARD_CHANGED, listener)
    return () => {
      ipcRenderer.removeListener(EVENTS.CLIPBOARD_CHANGED, listener)
    }
  },
  onWindowShown: (cb) => {
    const listener = () => cb()
    ipcRenderer.on(EVENTS.WINDOW_SHOWN, listener)
    return () => {
      ipcRenderer.removeListener(EVENTS.WINDOW_SHOWN, listener)
    }
  },
  agent: {
    listProviders: () => ipcRenderer.invoke(IPC.AGENT_LIST_PROVIDERS),
    modelList: (opts) => ipcRenderer.invoke(IPC.AGENT_MODEL_LIST, opts ?? {}),
    send: (text, opts) =>
      ipcRenderer.invoke(IPC.AGENT_SEND, { text, ...opts }),
    stop: (opts) => ipcRenderer.invoke(IPC.AGENT_STOP, opts ?? {}),
    profileList: () => ipcRenderer.invoke(IPC.AGENT_PROFILE_LIST),
    profileSave: (input) => ipcRenderer.invoke(IPC.AGENT_PROFILE_SAVE, input),
    profileRemove: (id) => ipcRenderer.invoke(IPC.AGENT_PROFILE_REMOVE, { id }),
    onEvent: (cb) => {
      const listener = (_e: unknown, ev: unknown) => cb(ev as never)
      ipcRenderer.on(EVENTS.HERMES_EVENT, listener)
      return () => {
        ipcRenderer.removeListener(EVENTS.HERMES_EVENT, listener)
      }
    }
  },
  hermes: {
    check: () => ipcRenderer.invoke(IPC.HERMES_CHECK),
    send: (text, opts) => ipcRenderer.invoke(IPC.HERMES_SEND, { text, ...opts }),
    stop: () => ipcRenderer.invoke(IPC.HERMES_STOP),
    respondPermission: (requestId, allow) =>
      ipcRenderer.invoke(IPC.HERMES_RESPOND_PERMISSION, { requestId, allow }),
    openLogin: () => ipcRenderer.invoke(IPC.HERMES_OPEN_LOGIN),
    onEvent: (cb) => {
      const listener = (_e: unknown, ev: unknown) => cb(ev as never)
      ipcRenderer.on(EVENTS.HERMES_EVENT, listener)
      return () => {
        ipcRenderer.removeListener(EVENTS.HERMES_EVENT, listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('workdeck', api)
