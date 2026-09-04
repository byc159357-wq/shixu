import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import { EVENTS } from '../ipc/channels'

/**
 * Auto-update bridge (electron-updater, generic provider).
 * - Starts silent check ~4s after app ready.
 * - Never downloads without user action (autoDownload=false) — settings UI
 *   offers 检查更新 / 下载 / 重启安装, and installs on quit once downloaded.
 * - In dev/smoke (unpacked) runs electron-updater is a no-op that logs a
 *   notice; all events are still forwarded so the UI logic is testable.
 */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export class UpdateService {
  private current: UpdateStatus = { state: 'idle' }

  constructor(private getWindow: () => BrowserWindow | null) {}

  init(): void {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = console

    autoUpdater.on('checking-for-update', () => this.emit({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.emit({ state: 'available', version: info.version })
    )
    autoUpdater.on('update-not-available', () => this.emit({ state: 'not-available' }))
    autoUpdater.on('download-progress', (p) =>
      this.emit({ state: 'downloading', percent: Math.round(p.percent) })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.emit({ state: 'downloaded', version: info.version })
    )
    autoUpdater.on('error', (err) =>
      this.emit({ state: 'error', message: String((err as Error)?.message ?? err) })
    )
  }

  /** Silent check after startup. */
  scheduleInitialCheck(delayMs = 4000): void {
    setTimeout(() => {
      try {
        void autoUpdater.checkForUpdates()
      } catch {
        /* unpacked / no update server: ignore */
      }
    }, delayMs)
  }

  checkNow(): void {
    try {
      void autoUpdater.checkForUpdates()
    } catch (err) {
      this.emit({ state: 'error', message: String(err) })
    }
  }

  download(): void {
    try {
      void autoUpdater.downloadUpdate()
    } catch (err) {
      this.emit({ state: 'error', message: String(err) })
    }
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall()
  }

  status(): UpdateStatus {
    return this.current
  }

  private emit(status: UpdateStatus): void {
    this.current = status
    this.getWindow()?.webContents.send(EVENTS.UPDATE_STATUS, status)
  }
}
