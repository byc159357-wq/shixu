import type { Db } from './db'

export type Density = 'comfortable' | 'default' | 'compact'

export type Wallpaper = 'none' | 'aurora' | 'dusk' | 'midnight' | 'porcelain' | 'dawn' | 'spring'

export interface SettingsMap {
  'ui.density': Density
  'app.accentColor': string
  'app.theme': 'dark' | 'light'
  'app.wallpaper': Wallpaper
  'app.openAtLogin': boolean
  'app.closeBehavior': 'ask' | 'quit' | 'tray'
}

const DEFAULTS: SettingsMap = {
  'ui.density': 'default',
  'app.accentColor': '#7C6FF0',
  'app.theme': 'dark',
  'app.wallpaper': 'none',
  'app.openAtLogin': false,
  'app.closeBehavior': 'ask'
}

export class SettingsService {
  constructor(private db: Db) {}

  get<K extends keyof SettingsMap>(key: K): SettingsMap[K] {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined
    if (!row) return DEFAULTS[key]
    try {
      return JSON.parse(row.value) as SettingsMap[K]
    } catch {
      return DEFAULTS[key]
    }
  }

  set<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, JSON.stringify(value))
  }

  getAll(): SettingsMap {
    return {
      'ui.density': this.get('ui.density'),
      'app.accentColor': this.get('app.accentColor'),
      'app.theme': this.get('app.theme'),
      'app.wallpaper': this.get('app.wallpaper'),
      'app.openAtLogin': this.get('app.openAtLogin'),
      'app.closeBehavior': this.get('app.closeBehavior')
    }
  }
}
