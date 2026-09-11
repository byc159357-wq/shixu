import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion, useMotionLevel } from './hooks/useReducedMotion'
import {
  FolderOpen,
  GearSix,
  Minus,
  X,
  Square,
  MagnifyingGlass,
  House,
  Brain,
  Sparkle,
  Images,
  SquaresFour,
  Play
} from '@phosphor-icons/react'
import { useAppStore, type Module } from './store'
import type { IntelligenceSnapshot, SearchResult, WorkMode, AppEntry, BoxKind, WorkspaceContext, UpdateStatus } from '../../shared/types'
import { Button, ContextMenuOverlay, Modal, ToastStack } from './components/ui'
import { DetailPopover } from './components/DetailPopover'
import { Logo } from './components/Logo'
import { StartupIntro } from './components/StartupIntro'
import { RouteTransition } from './components/RouteTransition'
import { ProjectSwitcher } from './components/ProjectSwitcher'
import { UpdateBanner } from './components/UpdateBanner'
import { HomePage, WorkspacePage } from './pages/HomePage'
import { ProjectPage } from './pages/ProjectPage'
import { SettingsPage } from './pages/SettingsPage'
import { LibraryPage } from './pages/LibraryPage'
import { CalendarPage } from './pages/CalendarPage'
import { AgentCenter } from './components/agents/AgentCenter'
import { AgentFloatingPanel } from './components/agents/AgentFloatingPanel'
import { useAgentManager } from './components/agents/AgentManager'
import { AgentMemoryPage } from './pages/AgentMemoryPage'
import { AgentWorkflowsPage } from './pages/AgentWorkflowsPage'
import { HermesMessagesPage } from './pages/HermesMessagesPage'
import { HermesArtifactsPage } from './pages/HermesArtifactsPage'
import { HermesTasksPage } from './pages/HermesTasksPage'
import { ScenariosPage } from './pages/ScenariosPage'
import { useHermesStore } from './components/hermes/HermesStore'

/* ============ TitleBar ============ */
function TitleBar() {
  const [showCloseChoice, setShowCloseChoice] = useState(false)

  const requestClose = async () => {
    const settings = await window.workdeck.settings.getAll()
    const behavior = settings['app.closeBehavior']
    if (behavior === 'quit') {
      await window.workdeck.window.quit()
    } else if (behavior === 'tray') {
      await window.workdeck.window.close()
    } else {
      setShowCloseChoice(true)
    }
  }

  const chooseClose = async (behavior: 'quit' | 'tray', remember: boolean) => {
    if (remember) await window.workdeck.settings.set('app.closeBehavior', behavior)
    if (behavior === 'quit') await window.workdeck.window.quit()
    else await window.workdeck.window.close()
  }

  return (
    <>
      <div className="titlebar">
        <div className="titlebar-right">
          <div className="titlebar-actions">
          <button
            className="titlebar-btn"
            onClick={() => window.workdeck.window.minimize()}
            aria-label="最小化"
          >
            <Minus size={14} weight="bold" />
          </button>
          <button
            className="titlebar-btn"
            onClick={() => window.workdeck.window.maximize()}
            aria-label="最大化"
          >
            <Square size={11} weight="bold" />
          </button>
          <button
            className="titlebar-btn close"
            onClick={() => void requestClose()}
            aria-label="关闭"
          >
            <X size={14} weight="bold" />
          </button>
          </div>
        </div>
      </div>
      {showCloseChoice && (
        <CloseChoiceDialog
          onClose={() => setShowCloseChoice(false)}
          onChoose={(behavior, remember) => void chooseClose(behavior, remember)}
        />
      )}
    </>
  )
}

function CloseChoiceDialog({
  onClose,
  onChoose
}: {
  onClose: () => void
  onChoose: (behavior: 'quit' | 'tray', remember: boolean) => void
}) {
  const [remember, setRemember] = useState(false)

  return (
    <Modal
      title="关闭拾序"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="secondary" onClick={() => onChoose('tray', remember)}>后台运行</Button>
          <Button variant="primary" onClick={() => onChoose('quit', remember)}>退出软件</Button>
        </>
      }
    >
      <p className="close-choice-copy">要直接退出拾序，还是让它留在后台继续运行？</p>
      <label className="close-choice-remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        <span>下次不再询问，记住本次选择</span>
      </label>
      <p className="close-choice-hint">可随时在「设置 → 数据与常驻」中修改。</p>
    </Modal>
  )
}

/* ============ Dock ============ */
/* Two visually separated groups:
     WORKSPACE — the six core work modules.
     SYSTEM   — 全局搜索 + 设置 (a peer destination, pulled out of the main
                stack so the rail reads as "work" up top and "system" below a
                thin divider). Each item carries a micro label under its icon. */
interface NavItem {
  id: Module | 'search'
  icon: ReactNode
  title: string // tooltip
  label: string // micro label under the icon
}

const NAV_GROUPS: Array<{ id: string; label: string; items: NavItem[] }> = [
  { id: 'today', label: 'Today', items: [{ id: 'home', icon: <House size={18} />, title: '今日工作台', label: '今日' }] },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'workspace', icon: <SquaresFour size={18} />, title: '自由工作台', label: '工作台' },
      { id: 'projects', icon: <FolderOpen size={18} />, title: '项目空间', label: '项目' },
      { id: 'library', icon: <Images size={18} />, title: '文件库', label: '文件库' }
    ]
  },
  { id: 'intelligence', label: 'Intelligence', items: [
    { id: 'agents', icon: <Sparkle size={18} />, title: 'Agent Center', label: 'Agents' },
    { id: 'agentMemory', icon: <Brain size={18} />, title: '项目长期记忆', label: 'Memory' },
    { id: 'agentWorkflows', icon: <Play size={18} />, title: '工作流程', label: 'Workflows' }
  ] },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'search', icon: <MagnifyingGlass size={18} />, title: '全局搜索 (Ctrl+K)', label: '搜索' },
      { id: 'settings', icon: <GearSix size={18} />, title: '设置', label: '设置' }
    ]
  }
]

function Dock({ onOpenAgent }: { onOpenAgent: () => void }) {
  const module = useAppStore((s) => s.module)
  const setModule = useAppStore((s) => s.setModule)
  const openPalette = useAppStore((s) => s.openPalette)

  const renderItem = (n: NavItem) => (
    <button
      key={n.id}
      className={`dock-item sidebar-nav-item ${module === n.id ? 'active' : ''} ${n.id === 'agents' ? 'agents-nav-item' : ''}`}
      title={n.title}
      onClick={() => {
        if (n.id === 'search') openPalette()
        else if (n.id === 'agents') setModule('agents')
        else setModule(n.id as Module)
      }}
    >
      {n.icon}
      <span className="dock-item-label">{n.label}</span>
    </button>
  )

  return (
    <nav className="dock sidebar-nav">
      <div className="sidebar-brand" aria-label="拾序">
        <Logo size={28} />
        <div>
          <strong>拾序</strong>
          <span>SHIXU WORKSPACE</span>
        </div>
      </div>
      <div className="sidebar-nav-scroll">
        {NAV_GROUPS.map((group) => (
          <div className="sidebar-nav-group" key={group.id}>
            <div className="sidebar-nav-group-label">{group.label}</div>
            {group.items.map(renderItem)}
          </div>
        ))}
      </div>
      <button className="sidebar-agent-launch" onClick={onOpenAgent}>
        <Sparkle size={16} weight="fill" />
        <span>调用 Agent</span>
        <span className="sidebar-agent-kbd">Ctrl Space</span>
      </button>
    </nav>
  )
}

/* ============ Workspace router ============ */
function Workspace() {
  const module = useAppStore((s) => s.module)
  // Page roots are grid children themselves, so an animated wrapper cannot be
  // used here: `display: contents` does not paint or animate. Apply motion to
  // the real workspace node after every route commit instead.
  useLayoutEffect(() => {
    const pageRoot = document.querySelector<HTMLElement>('.workspace')
    if (!pageRoot) return

    // Home owns viewport-fixed scroll hints. A transform on its ancestor would
    // temporarily re-anchor them, so it gets the same quiet entrance as a fade.
    const motionClass = pageRoot.querySelector('.scroll-hint')
      ? 'motion-page-fade'
      : 'motion-page-enter'
    pageRoot.classList.remove('motion-page-enter', 'motion-page-fade')
    // Restart the keyframe when returning to a previously visited module.
    void pageRoot.offsetWidth
    pageRoot.classList.add(motionClass)
    return () => pageRoot.classList.remove(motionClass)
  }, [module])

  const page = (() => {
    switch (module) {
      case 'home':
        return <HomePage />
      case 'workspace':
        return <WorkspacePage />
      case 'projects':
        return <ProjectPage />
      case 'settings':
        return <SettingsPage />
      case 'library':
        return <LibraryPage />
      case 'calendar':
        return <CalendarPage />
      case 'agents':
        return <AgentCenter />
      case 'agentMemory':
        return <AgentMemoryPage />
      case 'agentWorkflows':
        return <AgentWorkflowsPage />
      case 'hermesMessages':
        return <HermesMessagesPage />
      case 'hermesArtifacts':
        return <HermesArtifactsPage />
      case 'hermesTasks':
        return <HermesTasksPage />
      case 'scenarios':
        return <ScenariosPage />
    }
  })()
  return page
}

/* ============ Command Palette: global quick launch (Phase 6) ============ */
const PAL_KIND_LABEL: Record<string, string> = {
  file: '文件',
  note: '笔记',
  task: '任务',
  project: '项目',
  app: '软件',
  folder: '文件夹',
  scenario: '工作模式'
}

/* A single launcher row: whatever source it came from (FTS / software boxes /
   folders / scenarios), it carries its own open action so Enter always works. */
interface PalItem {
  key: string
  kind: string
  title: string
  sub: string
  badge: string
  run: () => void
}

function CommandPalette() {
  const paletteOpen = useAppStore((s) => s.paletteOpen)
  const closePalette = useAppStore((s) => s.closePalette)
  const selectProject = useAppStore((s) => s.selectProject)
  const setProjectTab = useAppStore((s) => s.setProjectTab)
  const pushToast = useAppStore((s) => s.pushToast)
  const palettePrefill = useAppStore((s) => s.palettePrefill)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [scenarios, setScenarios] = useState<WorkMode[]>([])
  const [apps, setApps] = useState<AppEntry[]>([])
  const [folders, setFolders] = useState<AppEntry[]>([])
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const launcherLoaded = useRef(false)

  // On open: apply prefill, and load cross-entity launcher sources once.
  useEffect(() => {
    if (!paletteOpen) return
    setQuery(palettePrefill)
    setSearchResults([])
    setActive(0)
    void window.workdeck.search.sync()
    if (!launcherLoaded.current) {
      launcherLoaded.current = true
      void window.workdeck.scenario.list().then((s: WorkMode[]) => setScenarios(s))
      void window.workdeck.boxes.list('apps').then((a: AppEntry[]) => setApps(a))
      void window.workdeck.boxes.list('folders').then((f: AppEntry[]) => setFolders(f))
    }
  }, [paletteOpen, palettePrefill])

  useEffect(() => {
    if (!paletteOpen) return
    if (timer.current) clearTimeout(timer.current)
    const q = query.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    setBusy(true)
    timer.current = setTimeout(() => {
      void window.workdeck.search.query(q).then((r: SearchResult[]) => {
        setSearchResults(r)
        setActive(0)
        setBusy(false)
      })
    }, 250)
  }, [query, paletteOpen])

  const q = query.trim().toLowerCase()

  const runSearch = (r: SearchResult) => {
    closePalette()
    if (r.kind === 'file') {
      void window.workdeck.file.open(r.rowId)
    } else if (r.kind === 'note') {
      if (r.path) void window.workdeck.file.openPath(r.path)
    } else if (r.kind === 'project') {
      void selectProject(r.rowId)
    } else if (r.kind === 'task') {
      if (r.path) void selectProject(r.path).then(() => setProjectTab('tasks'))
      else void selectProject('')
    }
  }

  // Compose every row; FTS when querying, launcher sources always (and alone on empty query).
  const items: PalItem[] = []
  if (q) {
    for (const r of searchResults) {
      items.push({
        key: `${r.kind}-${r.rowId}`,
        kind: r.kind,
        title: r.title,
        sub: r.content || '',
        badge: PAL_KIND_LABEL[r.kind] ?? r.kind,
        run: () => runSearch(r)
      })
    }
    const match = (name: string) => name.toLowerCase().includes(q)
    for (const s of scenarios) {
      if (!match(s.name)) continue
      items.push({
        key: `scenario-${s.id}`,
        kind: 'scenario',
        title: s.name,
        sub: `一键打开 ${s.items.length} 项`,
        badge: '场景',
        run: () => {
          closePalette()
          void window.workdeck.scenario.apply(s.id).then((r: { ok: boolean; errors: string[] }) => {
            if (!r.ok) pushToast('error', `部分未打开：${r.errors.join('；')}`)
            else pushToast('success', `已打开场景「${s.name}」`)
          })
        }
      })
    }
    for (const a of apps) {
      if (!match(a.name)) continue
      items.push({
        key: `app-${a.name}-${a.path}`,
        kind: 'app',
        title: a.name,
        sub: a.path,
        badge: '软件',
        run: () => {
          closePalette()
          void window.workdeck.boxes.launch(a.path, (a.box ?? 'apps') as BoxKind, a.name)
        }
      })
    }
    for (const fld of folders) {
      if (!match(fld.name)) continue
      items.push({
        key: `folder-${fld.path}`,
        kind: 'folder',
        title: fld.name,
        sub: fld.path,
        badge: '文件夹',
        run: () => {
          closePalette()
          void window.workdeck.boxes.launch(fld.path, 'folders', fld.name)
        }
      })
    }
  } else {
    // Empty query → quick launcher: scenarios then apps then folders (capped).
    for (const s of scenarios.slice(0, 6)) {
      items.push({
        key: `scenario-${s.id}`,
        kind: 'scenario',
        title: s.name,
        sub: `一键打开 ${s.items.length} 项`,
        badge: '场景',
        run: () => {
          closePalette()
          void window.workdeck.scenario.apply(s.id)
        }
      })
    }
    for (const a of apps.slice(0, 8)) {
      items.push({
        key: `app-${a.name}-${a.path}`,
        kind: 'app',
        title: a.name,
        sub: a.path,
        badge: '软件',
        run: () => {
          closePalette()
          void window.workdeck.boxes.launch(a.path, (a.box ?? 'apps') as BoxKind, a.name)
        }
      })
    }
    for (const fld of folders.slice(0, 6)) {
      items.push({
        key: `folder-${fld.path}`,
        kind: 'folder',
        title: fld.name,
        sub: fld.path,
        badge: '文件夹',
        run: () => {
          closePalette()
          void window.workdeck.boxes.launch(fld.path, 'folders', fld.name)
        }
      })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePalette()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[active]
      if (it) it.run()
    }
  }

  if (!paletteOpen) return null

  return (
    <div className="palette-overlay" onClick={closePalette}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-wrap">
          <MagnifyingGlass size={16} />
          <input
            className="palette-input"
            autoFocus
            placeholder="打开软件 / 文件夹 / 场景、搜索文件笔记…（Ctrl+K）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        {busy && q !== '' && (
          <div className="palette-empty">搜索中…</div>
        )}
        {!busy && q !== '' && items.length === 0 && (
          <div className="palette-empty">没有匹配结果</div>
        )}
        {items.length > 0 && (
          <div style={{ maxHeight: 420, overflowY: 'auto', padding: '0.25rem' }}>
            {items.map((it, i) => (
              <button
                key={it.key}
                className={`context-menu-item ${i === active ? 'active' : ''}`}
                style={i === active ? { background: 'var(--accent-soft)' } : {}}
                onMouseEnter={() => setActive(i)}
                onClick={it.run}
              >
                <span className="badge badge-neutral" style={{ minWidth: 34, textAlign: 'center' }}>
                  {it.badge}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.title}
                  </span>
                  {it.sub && (
                    <span className="file-meta" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.sub}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        {q === '' && (
          <div className="palette-empty">输入关键词搜索；空状态直接展示常用场景 / 软件快速启动</div>
        )}
      </div>
    </div>
  )
}

/* ============ Scenario completion banner ============ */
function ScenarioCompletionBanner() {
  const scenarioHint = useAppStore((s) => s.scenarioHint)
  const dismiss = useAppStore((s) => s.dismissScenarioHint)
  const apply = useAppStore((s) => s.applyScenarioMissing)

  if (!scenarioHint) return null

  return (
    <div className="scenario-banner motion-banner-enter" role="status">
      <div className="scenario-banner-body">
        <Sparkle size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
        <span className="scenario-banner-text">
          检测到您正在使用场景「{scenarioHint.presetName}」，还差{' '}
          {scenarioHint.missing.length} 项即可整套就位：
          <span className="scenario-banner-missing">
            {scenarioHint.missing.map((it) => it.name).join('、')}
          </span>
        </span>
        <Button size="sm" variant="primary" onClick={() => void apply()}>
          补齐剩余 {scenarioHint.missing.length} 项
        </Button>
        <button className="icon-btn" onClick={dismiss} aria-label="关闭补齐提示" title="关闭">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

/* ============ App root ============ */
export default function App() {
  const loadProjects = useAppStore((s) => s.loadProjects)
  const density = useAppStore((s) => s.density)
  const wallpaper = useAppStore((s) => s.wallpaper)
  const theme = useAppStore((s) => s.theme)
  const uiRadius = useAppStore((s) => s.uiRadius)
  const uiAlpha = useAppStore((s) => s.uiAlpha)
  const uiAccent = useAppStore((s) => s.uiAccent)
  const module = useAppStore((s) => s.module)
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus)
  const openPalette = useAppStore((s) => s.openPalette)
  const closePalette = useAppStore((s) => s.closePalette)
  const refreshAfterFilesChange = useAppStore((s) => s.refreshAfterFilesChange)
  const loadWorkspaceContext = useAppStore((s) => s.loadWorkspaceContext)
  const loadIntelligence = useAppStore((s) => s.loadIntelligence)
  const refreshHermesModels = useHermesStore((s) => s.refreshModels)
  const setHermesContext = useHermesStore((s) => s.setContext)
  const workspaceContext = useAppStore((s) => s.workspaceContext)
  const currentFiles = useAppStore((s) => s.files)
  const appShellRef = useRef<HTMLDivElement>(null)
  const [showStartup, setShowStartup] = useState(true)
  const [agentOpen, setAgentOpen] = useState(false)
  const loadAgents = useAgentManager((s) => s.loadAgents)
  const setAgentDraft = useAgentManager((s) => s.setDraft)

  useEffect(() => {
    const openAgent = () => setAgentOpen(true)
    const openWithTask = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail) setAgentDraft(detail)
      setAgentOpen(true)
    }
    window.addEventListener('workdeck:open-agent', openAgent)
    window.addEventListener('workdeck:open-hermes', openAgent)
    window.addEventListener('workdeck:agent-task', openWithTask)
    return () => {
      window.removeEventListener('workdeck:open-agent', openAgent)
      window.removeEventListener('workdeck:open-hermes', openAgent)
      window.removeEventListener('workdeck:agent-task', openWithTask)
    }
  }, [setAgentDraft])

  // Motion preferences: OS-level reduced motion + low-power device detection.
  // Both write to body[data-*] so CSS can downgrade durations in one place.
  const reducedMotion = useReducedMotion()
  useMotionLevel()

  // Theme on <body> (dark/light token switching)
  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  // Density on <body> for CSS variable switching
  useEffect(() => {
    document.body.dataset.density = density
  }, [density])

  // Wallpaper layer on <body>
  useEffect(() => {
    document.body.dataset.wallpaper = wallpaper
  }, [wallpaper])

  // Appearance: rounded corner, glass alpha, accent color on <body>
  useEffect(() => {
    document.body.dataset.uiRadius = uiRadius
  }, [uiRadius])
  useEffect(() => {
    document.body.dataset.uiAlpha = uiAlpha
  }, [uiAlpha])
  useEffect(() => {
    document.body.dataset.uiAccent = uiAccent
  }, [uiAccent])

  // Initial load
  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => { void loadAgents() }, [loadAgents])

  // Keep the live Zustand context in sync with actions recorded by the main
  // process (file opens, scene launches and completed tasks).
  useEffect(() => {
    return window.workdeck.onWorkspaceChanged((workspaceContext: WorkspaceContext) => {
      useAppStore.setState({
        workspaceContext,
        currentProjectId: workspaceContext.currentProject?.id ?? null
      })
    })
  }, [])

  useEffect(() => {
    void loadWorkspaceContext()
  }, [loadWorkspaceContext])

  useEffect(() => {
    return window.workdeck.onIntelligenceChanged((intelligence: IntelligenceSnapshot) => {
      useAppStore.setState({ intelligence })
    })
  }, [])

  useEffect(() => {
    void loadIntelligence()
  }, [loadIntelligence])

  // Warm the shared Agent model roster once at shell startup. The Agent Center,
  // assistant panel and the legacy workspace widget all consume this state.
  useEffect(() => {
    void refreshHermesModels()
  }, [refreshHermesModels])

  // The Agent layer receives a live snapshot of the user's current work without
  // replacing the durable WorkspaceContext source in the main process.
  useEffect(() => {
    const pageLabels: Partial<Record<Module, string>> = {
      home: 'Today',
      workspace: 'Workspace',
      projects: 'Project Space',
      library: 'Library',
      calendar: 'Calendar',
      scenarios: 'Work Modes',
      settings: 'Settings'
    }
    const page = pageLabels[module]
    const context = workspaceContext
    setHermesContext({
      ...(page ? { currentPage: page } : {}),
      currentProject: context?.currentProject ?? null,
      currentMode: context?.currentScene?.name ?? '自由工作',
      recentFiles: context?.recentFiles ?? [],
      focusTask: context?.focusTask ?? null,
      fileCount: currentFiles.length || context?.recentFiles.length || 0
    })
  }, [module, workspaceContext, currentFiles.length, setHermesContext])

  // Load email config (then inbox count/list) on startup
  const loadEmailInfo = useAppStore((s) => s.loadEmailInfo)
  useEffect(() => {
    void loadEmailInfo()
  }, [loadEmailInfo])

  // Subscribe to index/watcher changes pushed from the main process
  useEffect(() => {
    return window.workdeck.onFilesChanged(() => {
      void refreshAfterFilesChange()
    })
  }, [refreshAfterFilesChange])

  // Subscribe to updater status pushes
  useEffect(() => {
    return window.workdeck.onUpdateStatus(setUpdateStatus)
  }, [setUpdateStatus])

  // Hydrate the status in case the main process completed a check before the
  // renderer subscribed to its event stream (for example after a fast reload).
  useEffect(() => {
    let alive = true
    void window.workdeck.update.status().then((status: UpdateStatus) => {
      if (alive) setUpdateStatus(status)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [setUpdateStatus])

  // Global Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
      }
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        setAgentOpen((open) => !open)
      }
      if (e.key === 'Escape') {
        closePalette()
        setAgentOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPalette, closePalette])

  // Collapse rules: <1080 hide context, <800 hide sidebar
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const noContext = width < 1080
  const noSidebar = width < 800
  // v0.4 keeps the navigation rail persistent so the workspace always has a
  // stable spatial anchor. The old full-width mode is left in the class list
  // for compatibility with any persisted shell styles, but is no longer used.
  const isFullWidth = false

  const shellClass = [
    'app-shell',
    'v04-shell',
    isFullWidth ? 'full-width-mode' : '',
    noContext ? 'no-context' : '',
    noSidebar ? 'no-sidebar' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div ref={appShellRef} className={shellClass}>
        <TitleBar />
        <UpdateBanner />
        <Dock onOpenAgent={() => setAgentOpen(true)} />
        <ScenarioCompletionBanner />
        <Workspace />
        <DetailPopover />
        <ProjectSwitcher />
        <CommandPalette />
        <ContextMenuOverlay />
        <ToastStack />
        <AgentFloatingPanel open={agentOpen} onClose={() => setAgentOpen(false)} />
      </div>
      {showStartup && (
        <StartupIntro
          appRoot={appShellRef}
          theme={theme}
          reducedMotion={reducedMotion}
          onComplete={() => setShowStartup(false)}
        />
      )}
      <RouteTransition route={module} reducedMotion={reducedMotion} />
    </>
  )
}
