import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import { openDb, type Db } from './services/db'
import { registerIpc, type IpcServices } from './ipc/register'
import { FileWatchService } from './services/file-watch.service'
import { SettingsService } from './services/settings.service'
import { BackupService } from './services/backup.service'
import { isSmokeRun } from './lib/smoke'
import { resolveUserDataDirectory } from './services/user-data-migration'
import { EVENTS } from './ipc/channels'

let mainWindow: BrowserWindow | null = null
let db: Db | null = null
let services: IpcServices | null = null
let watcher: FileWatchService | null = null
let tray: Tray | null = null
let autoBackupTimer: ReturnType<typeof setInterval> | null = null
let quitting = false

// A local dev preview needs an independent profile and lock so it can run
// alongside the installed app without touching the user's real workspace.
const isDevPreview = process.env['SHIXU_DEV_PREVIEW'] === '1'
if (isDevPreview) app.setName('拾序开发预览')

// Keep the on-disk product identity aligned with the user-facing brand. On the
// first branded launch, copy the legacy Workdeck profile so existing projects,
// settings and AI sessions remain available. The legacy directory is retained
// as a rollback copy and can be removed manually after the migration is checked.
app.setPath(
  'userData',
  isDevPreview
    ? path.join(app.getPath('appData'), '拾序开发预览')
    : resolveUserDataDirectory(app.getPath('appData'))
)

// One desktop instance owns the database, tray and Hermes ACP connection.
// Starting Workdeck again should focus that instance instead of leaving an old
// renderer connected to a stale dev bundle in the background.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) createWindow()
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    frame: false,
    // macOS: hide the system traffic-light buttons so the title bar
    // content (ATELIER name + custom min/max/close) truly starts at x=0.
    titleBarStyle: 'hidden',
    backgroundColor: '#14151A',
    show: false,
    title: '拾序',
    icon: nativeImage.createFromPath(path.join(__dirname, '../../build/icon-app.png')),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Closing keeps the renderer resident in the tray. Signal it whenever the
  // window is restored so the opening transition is not skipped on re-open.
  mainWindow.on('show', () => {
    const window = mainWindow
    if (window && !window.isDestroyed()) window.webContents.send(EVENTS.WINDOW_SHOWN)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  // 常驻: closing the window hides to the system tray instead of quitting.
  // A real quit only happens via the tray "退出" item (which sets `quitting`).
  mainWindow.on('close', (e) => {
    if (quitting || !tray) return
    e.preventDefault()
    mainWindow?.hide()
  })

  // Open external links in the default browser, never inside Workdeck.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function toggleMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function setupTray(): void {
  if (tray || isSmokeRun()) return
  let icon: Electron.NativeImage
  try {
    icon = nativeImage
      .createFromPath(path.join(__dirname, '../../build/icon-app.png'))
      .resize({ width: 16, height: 16 })
  } catch {
    icon = nativeImage.createEmpty()
  }
  tray = new Tray(icon)
  tray.setToolTip('拾序')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 / 隐藏 拾序', click: () => toggleMainWindow() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => toggleMainWindow())
}

// Smoke/CI and GPU-less environments (headless sandbox, RDP with no GPU, etc.)
// cannot spawn a usable GPU process and Chromium aborts with
// "GPU process isn't usable. Goodbye." Force software rendering + no-sandbox so
// the app still boots. Gated behind an explicit flag so real desktop users with
// a GPU are never affected.
const noGpu = isSmokeRun() || process.env['ATELIER_NO_GPU'] === '1'
if (noGpu) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'workdeck.db')
  db = openDb(dbPath)
  services = registerIpc(db, { getWindow: () => mainWindow })
  createWindow()

  // 常驻与数据安全: apply saved 开机自启, create the system tray, and keep an
  // auto-backup cadence so the DB is snapshotted even if the user never opens
  // the settings page.
  if (!isSmokeRun()) {
    app.setLoginItemSettings({ openAtLogin: new SettingsService(db).get('app.openAtLogin') })
    setupTray()
    const backupSvc = new BackupService(db, path.join(app.getPath('userData'), 'workdeck-backups'))
    setTimeout(() => {
      try {
        backupSvc.createAuto()
      } catch (err) {
        console.error('[backup] initial auto-backup failed:', String(err))
      }
    }, 60_000)
    autoBackupTimer = setInterval(() => {
      try {
        backupSvc.createAuto()
      } catch (err) {
        console.error('[backup] auto-backup failed:', String(err))
      }
    }, 6 * 60 * 60 * 1000)
  }

  // Start incremental watchers + initial scan for every watched folder.
  // Runs async after the window is up; never blocks first paint.
  const scanAll = async (mode: 'initial' | 'rescan'): Promise<void> => {
    if (!services) return
    const folders = services.watchedFolders.list()
    await Promise.all(
      folders.map((f) =>
        services?.indexer.scanFolder(f.path, mode).then(() => services?.notifyFilesChanged())
      )
    )
  }

  const startIndexing = async (): Promise<void> => {
    if (!services) return
    const folders = services.watchedFolders.list()
    watcher = new FileWatchService((folder) => {
      void services?.indexer
        .scanFolder(folder, 'rescan')
        .then(() => services?.notifyFilesChanged())
        .then(() => services?.search.sync())
    })
    for (const f of folders) {
      watcher.watchFolder(f.path)
    }
    await scanAll('initial')
    console.log(`[workdeck] indexed ${folders.length} watched folder(s)`)
  }
  void startIndexing()

  // Silent update check shortly after startup (packed builds only).
  services.updater.scheduleInitialCheck(4000)

  // Fallback rescan (architecture §6.3 promise): focus-triggered + every 30 min.
  // fs.watch can drop events; these sweeps guarantee eventual consistency.
  let focusTimer: ReturnType<typeof setTimeout> | null = null
  app.on('browser-window-focus', () => {
    if (focusTimer) clearTimeout(focusTimer)
    focusTimer = setTimeout(() => {
      void scanAll('rescan')
      void services?.search.sync()
    }, 5000)
  })
  const fallbackTimer = setInterval(() => {
    void scanAll('rescan')
    void services?.search.sync()
  }, 30 * 60 * 1000)
  app.on('before-quit', () => clearInterval(fallbackTimer))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Automated smoke check: `electron . --smoke`
  // Verifies: app ready → window created → renderer loaded. Exits 0 on success.
  if (isSmokeRun()) {
    mainWindow?.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        console.log('[WORKDECK-SMOKE] OK')
        app.exit(0)
      }, 1500)
    })
    mainWindow?.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error(`[WORKDECK-SMOKE] FAIL renderer load: ${code} ${desc}`)
      app.exit(1)
    })
  }
})

app.on('before-quit', () => {
  quitting = true
  watcher?.unwatchAll()
  if (autoBackupTimer) clearInterval(autoBackupTimer)
})

app.on('window-all-closed', () => {
  // 常驻: keep running in the tray so the user can bring the window back.
  if (!tray && process.platform !== 'darwin') app.quit()
})
