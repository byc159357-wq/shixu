import { app, nativeImage, shell } from 'electron'
import path from 'node:path'
import { readdirSync, readFileSync, statSync, mkdirSync, existsSync } from 'node:fs'
import type { AppEntry, BoxKind } from '../../shared/types'
import type { Db } from './db'
import { normalizePath, isInstaller } from './path-utils'
import { extractHighResIcon, extractHighResIconFromIco, extractHighResIconById } from './high-res-icon'
import { shellClsidFromLink, clsidIconSource, shellClsidIcon } from './shell-clsid'
import { PREMIERE_OFFICIAL_PNG_B64 } from './premiere-icon'

const APP_EXTS = new Set(['lnk', 'exe', 'bat', 'cmd', 'com', 'app'])
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg', 'ico', 'tif', 'tiff', 'heic', 'heif', 'avif', 'jfif'])
const VIDEO_EXTS = new Set(['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'rmvb'])

const PINNED_KEY = 'boxes.pinned'
const HIDDEN_KEY = 'boxes.hidden'

/** Per-kind caps so huge folders don't hammer icon extraction. */
const CAPS: Record<BoxKind, number> = {
  apps: 64,
  images: 72,
  folders: 96,
  videos: 48,
  docs: 96
}

const SCAN_TTL_MS = 2500

interface RawItem {
  path: string
  name: string
  isDir: boolean
  mtime: number
}

/** Batch-fill the transparent margin of an icon PNG onto a solid white rounded
 *  tile (like OS app-icon tiles). Frameless, alpha-backed logos (e.g. Quark's
 *  floating blue circle) otherwise visually merge into the frosted-glass card
 *  background; a tile gives the glyph a defined, always-visible backing. */
function tileDataUrl(png: Buffer): string {
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  const s = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 ? Math.max(w, h) : 256
  const img = `<image href="data:image/png;base64,${png.toString('base64')}" width="${s}" height="${s}"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<rect width="${s}" height="${s}" rx="${Math.round(s * 0.2)}" fill="#ffffff"/>` +
    `<rect width="${s}" height="${s}" rx="${Math.round(s * 0.2)}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="${Math.max(1, Math.round(s * 0.004))}"/>` +
    img +
    `</svg>`
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

/**
 * The five auto-syncing desktop boxes (软件 / 图片 / 文件 / 文件夹 / 视频).
 * Content is scanned from the Desktop + Downloads folders (software comes from
 * desktop shortcuts), news items appear automatically. Users can pin extra
 * paths or hide scanned ones, and create folders that appear on the desktop.
 */
export class BoxesService {
  private scanCache: { at: number; items: RawItem[] } = { at: 0, items: [] }
  private iconCache = new Map<string, string>()
  private lnkKindCache = new Map<string, BoxKind>()

  /** Classification used when displaying a scanned entry. A `.lnk` shortcut is
   *  normally treated as an app, but when it points at a data file (.fig/.pdf…)
   *  or a folder the shortcut should live in that box instead. */
  private effKind(it: RawItem | AppEntry): BoxKind {
    const base = kindOf(it)
    if (base !== 'apps' || !it.path.toLowerCase().endsWith('.lnk')) return base
    const key = normalizePath(it.path)
    const cached = this.lnkKindCache.get(key)
    if (cached) return cached
    const g = lnkDisplayKind(it.path)
    this.lnkKindCache.set(key, g)
    return g
  }

  constructor(private db: Db) {}

  async list(kind: BoxKind): Promise<AppEntry[]> {
    const items = this.scanItems()
    const hidden = new Set(this.readStrings(HIDDEN_KEY))
    const pinned = this.pinned()
    const hiddenByPath = new Set<string>()
    for (const h of hidden) hiddenByPath.add(normalizePath(h))

    const out: AppEntry[] = []
    const scanned: AppEntry[] = []
    const seen = new Set<string>()
    // Pinned entries ignore the hidden list (dropping/add an item always brings
    // it back); the hidden list only suppresses auto-scanned entries.
    const pushPinned = (a: AppEntry) => {
      const key = normalizePath(a.path)
      if (seen.has(key)) return
      seen.add(key)
      out.push(a)
    }
    const pushScanned = (a: AppEntry) => {
      const key = normalizePath(a.path)
      if (seen.has(key) || hiddenByPath.has(key)) return
      seen.add(key)
      scanned.push(a)
    }

    // Pinned items first (manually added items are prioritized in display),
    // then scanned items (newest first) filling the rest up to the cap — so a
    // pinned entry is never sliced away by the per-kind cap. A pinned entry
    // shows in the box it was dropped into (`box`), falling back to extension
    // classification for older pins that predate the `box` field.
    for (const a of pinned) {
      if ((a.box ?? kindOf(a)) === kind) pushPinned({ ...a, id: `pin:${a.path}` })
    }
    for (const it of items.slice().sort((a, b) => b.mtime - a.mtime)) {
      if (this.effKind(it) === kind) pushScanned({ ...it, id: `scan:${it.path}`, source: 'system' as const })
    }
    const remaining = Math.max(0, CAPS[kind] - out.length)
    const capped = out.concat(scanned.slice(0, remaining))
    for (const a of capped) await this.resolveIcon(a)
    return capped
  }

  /** Pin extra file/folder paths (e.g. picked manually or dropped in). The
   *  `kind` is the box the user explicitly placed them in — the item always
   *  shows there, regardless of extension-based auto-classification. */
  addPaths(paths: string[], kind: BoxKind): void {
    const pinned = this.pinned()
    const byPath = new Map(pinned.map((p) => [normalizePath(p.path), p]))
    for (const fp of paths) {
      const p = normalizePath(fp)
      if (!p) continue
      let isDir = false
      try {
        isDir = statSync(p).isDirectory()
      } catch {
        continue
      }
      byPath.set(p, {
        id: '',
        name: isDir ? path.basename(p) : path.basename(p),
        path: p,
        source: 'custom',
        isDir,
        box: kind
      })
    }
    this.saveJson(PINNED_KEY, [...byPath.values()].map(stripId))
  }

  /** Remove a visible entry: scanned → hidden; pinned → unpin. */
  remove(id: string): boolean {
    const p = id.slice(id.indexOf(':') + 1)
    if (id.startsWith('pin:')) {
      // Remove this path from pinned while still allowing it to be scanned.
      const norm = normalizePath(p)
      const rest = this.pinned().filter((a) => normalizePath(a.path) !== norm)
      this.saveJson(PINNED_KEY, rest.map(stripId))
      return true
    }
    if (id.startsWith('scan:')) {
      const hidden = this.readStrings(HIDDEN_KEY)
      if (!hidden.includes(p)) hidden.push(p)
      this.db
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(HIDDEN_KEY, JSON.stringify(hidden))
      this.invalidate()
      return true
    }
    return false
  }

  /** Create a real folder on the Desktop so it appears in the 文件夹 box. */
  createFolder(): AppEntry | null {
    const dir = app.getPath('desktop')
    try {
      if (!existsSync(dir)) return null
      let name = '新建文件夹'
      let target = path.join(dir, name)
      let i = 1
      while (existsSync(target)) {
        target = path.join(dir, `${name} (${i++})`)
      }
      mkdirSync(target)
      this.invalidate()
      return {
        id: `scan:${target}`,
        name: path.basename(target),
        path: target,
        source: 'system' as const,
        isDir: true
      }
    } catch {
      return null
    }
  }

  /** Launch / open a boxed item in its default app. */
  async launch(p: string): Promise<{ ok: boolean; error?: string }> {
    const err = await shell.openPath(p)
    return err ? { ok: false, error: err } : { ok: true }
  }

  /** Reveal an item in the OS file manager. */
  showInFolder(p: string): void {
    shell.showItemInFolder(p)
  }

  /** Move an item to the OS recycle bin, returning the OS error string on failure. */
  async trash(p: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await shell.trashItem(p)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ---------------- internals ----------------

  private scanItems(): RawItem[] {
    const now = Date.now()
    if (now - this.scanCache.at < SCAN_TTL_MS && this.scanCache.items.length > 0) {
      return this.scanCache.items
    }
    const items: RawItem[] = []
    const dirs = [
      app.getPath('desktop'),
      app.getPath('downloads'),
      path.join(app.getPath('home'), 'Desktop'),
      path.join(app.getPath('home'), '下载')
    ]
    const seen = new Set<string>()
    for (const dir of dirs) {
      let names: string[] = []
      try {
        names = readdirSync(dir)
      } catch {
        continue
      }
      for (const n of names) {
        const full = path.join(dir, n)
        const key = normalizePath(full)
        if (seen.has(key)) continue
        seen.add(key)
        let isDir = false
        let mtime = 0
        try {
          const st = statSync(full)
          isDir = st.isDirectory()
          mtime = (st.mtimeMs ?? 0) / 1000
        } catch {
          continue
        }
        items.push({ path: full, name: n, isDir, mtime })
      }
    }
    this.scanCache = { at: now, items }
    return items
  }

  private invalidate(): void {
    this.scanCache = { at: 0, items: [] }
  }

  private pinned(): AppEntry[] {
    const raw = this.readJson<AppEntry[]>(PINNED_KEY)
    if (!Array.isArray(raw)) return []
    return raw.filter(isAppEntry)
  }

  private readJson<T>(key: string): T | null {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(key) as { value: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  private readStrings(key: string): string[] {
    const raw = this.readJson<unknown>(key)
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  }

  private saveJson(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, JSON.stringify(value))
  }

  /** For apps/images, resolve a display icon (shortcut target / real thumbnail). */
  private async resolveIcon(a: AppEntry): Promise<void> {
    if (a.kind === 'group') return
    const cached = this.iconCache.get(a.path)
    if (cached) {
      a.icon = cached
      return
    }
    if (a.isDir) return
    const ext = extOf(a.path)
    if (IMAGE_EXTS.has(ext)) {
      const t = await this.imageThumb(a.path)
      a.icon = t
      if (t) this.iconCache.set(a.path, t)
      return
    }
    if (APP_EXTS.has(ext)) {
      const t = await this.appIcon(a.path)
      a.icon = t
      if (t) this.iconCache.set(a.path, t)
      return
    }
    a.icon = null
  }

  private async imageThumb(p: string): Promise<string | null> {
    try {
      const img = await nativeImage.createThumbnailFromPath(p, { width: 128, height: 128 })
      return img.isEmpty() ? null : img.toDataURL()
    } catch {
      return null
    }
  }

  private async appIcon(p: string): Promise<string | null> {
    // Some repackaged Premiere builds embed a prominent "Pr LAUNCH" document glyph
    // as their largest icon frame; always show the official Premiere icon instead.
    if (this.isPremierePro(p)) return `data:image/png;base64,${PREMIERE_OFFICIAL_PNG_B64}`

    // A .lnk's own data: its file target and custom icon. Used both to tell a
    // real program shortcut from a shell namespace link and as extraction
    // candidates. The CLSID byte pattern for 此电脑 (20D04FE0-…) appears inside
    // ordinary shortcuts too, so we ONLY follow the CLSID icon path for links
    // with no real file target — otherwise every app would show the PC/disk icon.
    const link = p.toLowerCase().endsWith('.lnk') ? this.readLnk(p) : null
    const linkTarget = link?.target?.trim() || ''
    const isNamespace = link != null && (linkTarget.length === 0 || linkTarget.startsWith('::'))

    // Some apps don't embed their brand icon in the exe's icon resources — Quark
    // ships the desktop icon only as a PNG asset (`desktop_shortcut_logo.png`) in
    // its install dir, and its exe carries nothing but secondary feature glyphs.
    // Prefer that bundled official logo when one is present.
    const logo = this.bundledLogoAsset(p, link?.target)
    if (logo) return logo

    // Shell-namespace item (回收站/此电脑/网络): its .lnk has no file target, so
    // resolve the CLSID icon. Prefer the registry's high-res icon
    // (imageres.dll,-NN) when extractable — on healthy installs; trimmed systems
    // shave imageres.dll to a stub, so fall back to a bundled flat glyph rather
    // than Electron's getFileIcon, which returns one generic server icon for
    // every CLSID on those systems.
    if (isNamespace) {
      const clsid = shellClsidFromLink(p)
      if (clsid) {
        const src = await clsidIconSource(clsid)
        if (src && src.path && src.index > 0) {
          try {
            const hi =
              src.path.toLowerCase().endsWith('.ico')
                ? extractHighResIconFromIco(src.path)
                : extractHighResIconById(src.path, src.index)
            if (hi) return `data:image/png;base64,${hi.toString('base64')}`
          } catch {
            /* try bundled icon below */
          }
        }
        const baked = shellClsidIcon(clsid)
        if (baked) return baked
      }
    }

    const candidates: string[] = []
    if (p.toLowerCase().endsWith('.lnk')) {
      try {
        const sc = link ?? shell.readShortcutLink(p)
        if (sc?.icon) candidates.push(sc.icon.replace(/,\d+$/, ''))
        if (sc?.target) candidates.push(expandEnv(sc.target))
      } catch {
        /* ignore */
      }
    }
    candidates.push(p)
    for (const c of candidates) {
      if (!c) continue
      try {
        const hi = c.toLowerCase().endsWith('.ico') ? extractHighResIconFromIco(c) : extractHighResIcon(c)
        if (hi) return `data:image/png;base64,${hi.toString('base64')}`
      } catch {
        /* try next */
      }
      // Fallback for shell items (回收站/此电脑) and any exe with no parseable
      // resource: the OS shell icon, at the largest valid Electron size.
      try {
        const ic = await app.getFileIcon(c, { size: 'large' })
        if (!ic.isEmpty()) {
          const url = ic.toDataURL()
          if (url) return url
        }
      } catch {
        /* try next */
      }
    }
    return null
  }

  /** Safely read a `.lnk`; returns `null` on any parse/IO error. */
  private readLnk(p: string): ReturnType<typeof shell.readShortcutLink> | null {
    try {
      return shell.readShortcutLink(p)
    } catch {
      return null
    }
  }

  /** Return the bundled official desktop logo as a data URL for apps that keep
   *  their brand icon in a PNG asset instead of the exe's icon resources. Quark
   *  (夸克浏览器) ships only secondary feature glyphs in its exe; its real icon
   *  lives in each version folder. Prefer the native app tile
   *  (`VisualElements\Logo.png`, 600px) over the "shortcut logo" variant
   *  (`desktop_shortcut_logo.png`) which carries an external-link ↗ badge and is
   *  the web-clip icon, not the app icon. Gated to known apps and checked via
   *  fixed relative paths so this never scans a huge install tree per app. */
  private bundledLogoAsset(p: string, target?: string): string | null {
    const exe = (p.toLowerCase().endsWith('.lnk') ? (target?.trim() || '') : p).trim()
    const bn = path.basename(exe).toLowerCase()
    if (bn !== 'quark.exe') return null
    const root = path.dirname(exe)
    let names: string[] = []
    try {
      names = readdirSync(root)
    } catch {
      return null
    }
    // Preferred native app icon first, then the shortcut/web-clip logo as fallback.
    const rels = [
      path.join('VisualElements', 'Logo.png'),
      path.join(
        'Resources', 'assets', 'flutter', 'data', 'flutter_assets',
        'assets', 'images', 'video_player', 'desktop_shortcut_logo.png'
      )
    ]
    for (const v of names) {
      for (const rel of rels) {
        const cand = path.join(root, v, rel)
        try {
          if (statSync(cand).isFile()) {
            const buf = readFileSync(cand)
            if (buf.length > 8) return tileDataUrl(buf)
          }
        } catch {
          /* try next candidate */
        }
      }
    }
    return null
  }

  /** True when `p` (or the program a `.lnk` shortcut points at) is Adobe Premiere Pro. */
  private isPremierePro(p: string): boolean {
    let t = p
    try {
      if (p.toLowerCase().endsWith('.lnk')) {
        const sc = shell.readShortcutLink(p)
        if (sc?.target) t = sc.target
      }
    } catch {
      /* keep p */
    }
    return /Adobe Premiere Pro/i.test(path.basename(t))
  }
}

function kindOf(it: RawItem | AppEntry): BoxKind {
  if (it.isDir) return 'folders'
  const ext = extOf(it.path)
  if (APP_EXTS.has(ext)) return isInstaller(it.path) ? 'docs' : 'apps'
  if (IMAGE_EXTS.has(ext)) return 'images'
  if (VIDEO_EXTS.has(ext)) return 'videos'
  return 'docs'
}

/** Follow a `.lnk` to its target to decide its box: a shortcut to a program or
 *  a shell item stays an app; a shortcut to a data file (.fig/.pdf/…) or a
 *  folder belongs to that box instead. */
function lnkDisplayKind(p: string): BoxKind {
  let target = ''
  try {
    target = shell.readShortcutLink(p)?.target ?? ''
  } catch {
    /* ignore */
  }
  const t = (target || '').trim()
  if (!t) return 'apps' // unresolvable shortcut → keep it in software
  if (t.startsWith('::')) return 'apps' // shell namespace (回收站/此电脑)
  const expanded = expandEnv(t)
  try {
    if (statSync(expanded).isDirectory()) return 'folders'
  } catch {
    /* target missing on disk */
  }
  const e = extOf(expanded)
  if (APP_EXTS.has(e)) return 'apps'
  if (IMAGE_EXTS.has(e)) return 'images'
  if (VIDEO_EXTS.has(e)) return 'videos'
  return 'docs'
}

function extOf(p: string): string {
  const e = path.extname(p).toLowerCase()
  return e.startsWith('.') ? e.slice(1) : e
}

/** Expand `%VAR%` in a shortcut icon/target path (e.g. %windir%\explorer.exe). */
function expandEnv(p: string): string {
  return p.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, k: string) => process.env[k] ?? `%${k}%`)
}

function stripId(a: AppEntry): Omit<AppEntry, 'id'> {
  const { id: _id, ...rest } = a
  return rest
}

function isAppEntry(v: unknown): v is AppEntry {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.name === 'string' && typeof o.path === 'string'
}