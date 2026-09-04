import { watch, type FSWatcher } from 'node:fs'

/**
 * Incremental watcher only. Initial scans belong to FileIndexService.
 * Windows fs.watch supports recursive on Node 20+; events are debounced and
 * the folder is handed to the caller for an incremental refresh.
 */
export class FileWatchService {
  private watchers = new Map<string, { watcher: FSWatcher; timer: ReturnType<typeof setTimeout> | null }>()

  constructor(
    private onFolderChange: (folder: string) => void,
    private debounceMs = 500
  ) {}

  watchFolder(folder: string): void {
    if (this.watchers.has(folder)) return
    try {
      const watcher = watch(folder, { recursive: true }, () => this.schedule(folder))
      this.watchers.set(folder, { watcher, timer: null })
    } catch (err) {
      console.error(`[watch] failed to watch ${folder}:`, err)
    }
  }

  private schedule(folder: string): void {
    const entry = this.watchers.get(folder)
    if (!entry) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      this.onFolderChange(folder)
    }, this.debounceMs)
  }

  unwatchAll(): void {
    for (const { watcher } of this.watchers.values()) {
      try {
        watcher.close()
      } catch {
        /* already closed */
      }
    }
    this.watchers.clear()
  }
}
