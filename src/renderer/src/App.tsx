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
  CalendarDots,
  Sparkle,
  Images,
  Play
} from '@phosphor-icons/react'
import { useAppStore, type Module } from './store'
import type { SearchResult, ScenarioPreset, AppEntry, BoxKind } from '../../shared/types'
import { Button, ContextMenuOverlay, ToastStack } from './components/ui'
import { DetailPopover } from './components/DetailPopover'
import { Logo } from './components/Logo'
import { ProjectSwitcher } from './components/ProjectSwitcher'
import { HomePage } from './pages/HomePage'
import { ProjectPage } from './pages/ProjectPage'
import { SettingsPage } from './pages/SettingsPage'
import { LibraryPage } from './pages/LibraryPage'
import { CalendarPage } from './pages/CalendarPage'
import { AIPage } from './pages/AIPage'
import { AIMessagesPage } from './pages/AIMessagesPage'
import { AIArtifactsPage } from './pages/AIArtifactsPage'
import { AITasksPage } from './pages/AITasksPage'
import { ScenariosPage } from './pages/ScenariosPage'

/* ============ TitleBar ============ */
function TitleBar() {
  return (
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
            onClick={() => window.workdeck.window.close()}
            aria-label="关闭"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* The active section's name lives at the true window corner — fixed, outside the
   titlebar so the dock-reservation padding can't push it right. It doubles as the
   global title for every page, so no section re-renders a duplicate <h1> in the
   workspace and the content area stays larger. */
const MODULE_NAME: Record<Module, string> = {
  home: '主页',
  projects: '项目',
  library: '文件库',
  calendar: '日历',
  ai: 'AI',
  aiMessages: 'AI 消息平台',
  aiArtifacts: 'AI 产物',
  aiTasks: 'AI 定时任务',
  scenarios: '场景',
  settings: '设置'
}

function SectionCorner() {
  const module = useAppStore((s) => s.module)
  return (
    <div className="section-corner">
      <div className="section-corner-brand">
        <Logo size={40} />
        <span>拾序</span>
      </div>
      <div className="section-corner-row">
        <span className="section-corner-bar" />
        <span className="section-corner-title">{MODULE_NAME[module]}</span>
      </div>
    </div>
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

const WORKSPACE_NAV: NavItem[] = [
  { id: 'home', icon: <House size={21} />, title: '首页', label: '首页' },
  { id: 'projects', icon: <FolderOpen size={21} />, title: '项目', label: '项目' },
  { id: 'library', icon: <Images size={21} />, title: '文件库', label: '文件库' },
  { id: 'calendar', icon: <CalendarDots size={21} />, title: '日历', label: '日历' },
  { id: 'ai', icon: <Sparkle size={21} />, title: 'AI', label: 'AI' },
  { id: 'scenarios', icon: <Play size={21} />, title: '场景', label: '场景' }
]

const SYSTEM_NAV: NavItem[] = [
  { id: 'search', icon: <MagnifyingGlass size={21} />, title: '全局搜索 (Ctrl+K)', label: '搜索' },
  { id: 'settings', icon: <GearSix size={21} />, title: '设置', label: '设置' }
]

function Dock() {
  const module = useAppStore((s) => s.module)
  const setModule = useAppStore((s) => s.setModule)
  const openPalette = useAppStore((s) => s.openPalette)

  // Lock the dock to the Home page's card position and keep it there for every
  // other module. The measurement runs only while module === 'home' (the default
  // entry) and its value stays applied, so the nav rail never jumps screens.
  useLayoutEffect(() => {
    if (module !== 'home') return
    let raf = 0
    const measure = () => {
      raf = requestAnimationFrame(() => {
        const sub = document.querySelector<HTMLElement>('.workspace .sub')
        if (!sub) return
        const gap = parseFloat(getComputedStyle(sub).marginBottom) || 0
        const bottom = sub.getBoundingClientRect().bottom
        document.documentElement.style.setProperty('--dock-top-px', `${Math.round(bottom + gap)}px`)
      })
    }
    measure()
    window.addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
  }, [module])

  const renderItem = (n: NavItem) => (
    <button
      key={n.id}
      className={`dock-item ${module === n.id ? 'active' : ''}`}
      title={n.title}
      onClick={() => (n.id === 'search' ? openPalette() : setModule(n.id as Module))}
    >
      {n.icon}
      <span className="dock-item-label">{n.label}</span>
    </button>
  )

  return (
    <nav className="dock">
      <span className="dock-group-cap">工作区</span>
      {WORKSPACE_NAV.map(renderItem)}
      <div className="dock-divider" />
      <span className="dock-group-cap">系统</span>
      {SYSTEM_NAV.map(renderItem)}
    </nav>
  )
}

/* ============ Workspace router ============ */
function Workspace() {
  const module = useAppStore((s) => s.module)
  // key={module} forces a remount on module switch so motion-page-enter replays
  const page = (() => {
    switch (module) {
      case 'home':
        return <HomePage />
      case 'projects':
        return <ProjectPage />
      case 'settings':
        return <SettingsPage />
      case 'library':
        return <LibraryPage />
      case 'calendar':
        return <CalendarPage />
      case 'ai':
        return <AIPage />
      case 'aiMessages':
        return <AIMessagesPage />
      case 'aiArtifacts':
        return <AIArtifactsPage />
      case 'aiTasks':
        return <AITasksPage />
      case 'scenarios':
        return <ScenariosPage />
    }
  })()
  return (
    <div key={module} className="motion-page-enter" style={{ display: 'contents' }}>
      {page}
    </div>
  )
}

/* ============ Command Palette: global quick launch (Phase 6) ============ */
const PAL_KIND_LABEL: Record<string, string> = {
  file: '文件',
  note: '笔记',
  task: '任务',
  project: '项目',
  app: '软件',
  folder: '文件夹',
  scenario: '场景'
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
  const [scenarios, setScenarios] = useState<ScenarioPreset[]>([])
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
      void window.workdeck.scenario.list().then((s: ScenarioPreset[]) => setScenarios(s))
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
  const openPalette = useAppStore((s) => s.openPalette)
  const closePalette = useAppStore((s) => s.closePalette)
  const refreshAfterFilesChange = useAppStore((s) => s.refreshAfterFilesChange)

  // Motion preferences: OS-level reduced motion + low-power device detection.
  // Both write to body[data-*] so CSS can downgrade durations in one place.
  useReducedMotion()
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
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus)
  useEffect(() => {
    return window.workdeck.onUpdateStatus(setUpdateStatus)
  }, [setUpdateStatus])

  // Global Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
      }
      if (e.key === 'Escape') {
        closePalette()
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
  // All modules are full-width: no sidebar / context-panel anywhere.
  // DetailDrawer (popover) replaces the right-side context panel.
  const FULL_WIDTH_MODULES = ['home', 'library', 'calendar', 'ai', 'aiMessages', 'aiArtifacts', 'aiTasks', 'projects', 'scenarios', 'settings'] as const
  const isFullWidth = (FULL_WIDTH_MODULES as readonly string[]).includes(module)

  const shellClass = [
    'app-shell',
    isFullWidth ? 'full-width-mode' : '',
    noContext ? 'no-context' : '',
    noSidebar ? 'no-sidebar' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      <SectionCorner />
      <TitleBar />
      <Dock />
      <ScenarioCompletionBanner />
      <Workspace />
      <DetailPopover />
      <ProjectSwitcher />
        <CommandPalette />
        <ContextMenuOverlay />
        <ToastStack />
      </div>
  )
}
