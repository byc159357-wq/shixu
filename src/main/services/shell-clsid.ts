import { openSync, readSync, closeSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

/** Fixed Windows shell-namespace items that appear on the desktop as link files
 *  but whose shortcut has an empty target (their identity lives in the IDList as
 *  a CLSID byte-signed GUID). */
const SYS_CLSIDS: ReadonlyArray<{ guid: string; name: string }> = [
  { guid: '20D04FE0-3AEA-1069-A2D8-08002B30309D', name: '此电脑' },
  { guid: '645FF040-5081-101B-9F08-00AA002F954E', name: '回收站' },
  { guid: '208D2C60-3AEA-1069-A2D7-08002B30309D', name: '网络' },
  { guid: '5399E694-6CE5-4D6C-8FCE-1D8BF70F4B9B', name: '控制面板' }
]

/** Win32 in-memory GUID encoding: Data1/Data2/Data3 little-endian, Data4 as-is. */
function guidBytesHex(guid: string): string {
  const g = guid.replace(/-/g, '').toLowerCase()
  const b1 = Buffer.from(g.slice(0, 8), 'hex')
  const b2 = Buffer.from(g.slice(8, 12), 'hex')
  const b3 = Buffer.from(g.slice(12, 16), 'hex')
  b1.reverse()
  b2.reverse()
  b3.reverse()
  return Buffer.concat([b1, b2, b3, Buffer.from(g.slice(16, 32), 'hex')]).toString('hex')
}

/**
 * If `linkPath` is a Windows shell-namespace shortcut (回收站/此电脑/网络/控制面板),
 * return its CLSID GUID string; otherwise null. The GUID lives in the link's raw
 * bytes (LinkTargetIDList) so we search directly rather than parsing the format.
 */
export function shellClsidFromLink(linkPath: string): string | null {
  let fd = -1
  try {
    const sz = statSync(linkPath).size
    if (sz < 77) return null
    fd = openSync(linkPath, 'r')
    const head = readAt(fd, 0, 0x4c)
    if (head.readUInt16LE(0) !== 0x4c) return null // not a shell link
    // Read the whole body as hex once and scan for each known GUID encoding.
    const body = readAt(fd, 76, sz - 76)
    const hex = body.toString('hex')
    for (const it of SYS_CLSIDS) {
      if (hex.includes(guidBytesHex(it.guid))) return it.guid
    }
    return null
  } catch {
    return null
  } finally {
    if (fd >= 0) closeSync(fd)
  }
}

/**
 * Bundled, system-independent icons for shell-namespace desktop items. Some
 * trimmed Windows images shave imageres.dll down to a ~12KB stub (no icon
 * resources), and Electron's getFileIcon then returns the SAME generic server
 * icon for every CLSID. Shipping our own flat glyphs keeps 此电脑 / 回收站 /
 * 网络 / 控制面板 recognizable on every install.
 */
const MAIN = '#6c8cff'
const LIGHT = '#eef3ff'
const SILVER = '#aab6c8'
const SILVER_LO = '#7d8aa0'
const GREEN = '#3f9e57'

/** Rounded translucent tile backing so the glyph reads on glass/mica surfaces. */
function svgTile(inner: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<rect x="1.5" y="1.5" width="61" height="61" rx="16" fill="rgba(160,172,198,0.12)" stroke="rgba(128,140,163,0.4)" stroke-width="1.5"/>` +
    inner +
    `</svg>`
  )
}

const SHELL_GUID_SVGS: Record<string, string> = {
  // 此电脑 — monitor with a drive slot on a stand
  '20D04FE0-3AEA-1069-A2D8-08002B30309D': svgTile(
    `<rect x="9" y="11" width="46" height="31" rx="5" fill="${MAIN}"/>` +
      `<rect x="14" y="16" width="36" height="21" rx="2.5" fill="${LIGHT}"/>` +
      `<rect x="17" y="19" width="13" height="7" rx="1.5" fill="${MAIN}" opacity="0.72"/>` +
      `<rect x="17" y="29" width="19" height="3.6" rx="1.8" fill="#8ba3f0"/>` +
      `<rect x="28" y="42" width="8" height="5" rx="1.5" fill="${MAIN}"/>` +
      `<rect x="23" y="47" width="18" height="5" rx="2.5" fill="${MAIN}"/>`
  ),
  // 回收站 — tapered metal bin with a green handle
  '645FF040-5081-101B-9F08-00AA002F954E': svgTile(
    `<path d="M20 26 L24.5 51 Q25 56 29.5 56 L34.5 56 Q39 56 39.5 51 L44 26 Z" fill="${SILVER}"/>` +
      `<path d="M20 26 L44 26 L43 31 L21 31 Z" fill="${SILVER_LO}"/>` +
      `<rect x="16" y="19" width="32" height="7" rx="2.5" fill="${SILVER_LO}"/>` +
      `<path d="M27 19 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke="${GREEN}" stroke-width="4.5"/>` +
      `<rect x="24" y="36" width="16" height="3.2" rx="1.6" fill="#8b97ab" opacity="0.9"/>`
  ),
  // 网络 — globe with two meridian ellipses and an equator
  '208D2C60-3AEA-1069-A2D7-08002B30309D': svgTile(
    `<circle cx="32" cy="32" r="21" fill="${LIGHT}"/>` +
      `<circle cx="32" cy="32" r="21" fill="none" stroke="${MAIN}" stroke-width="3"/>` +
      `<ellipse cx="32" cy="32" rx="9.5" ry="21" fill="none" stroke="${MAIN}" stroke-width="2.6"/>` +
      `<ellipse cx="32" cy="32" rx="21" ry="9.5" fill="none" stroke="${MAIN}" stroke-width="2.6"/>`
  ),
  // 控制面板 — notched gear
  '5399E694-6CE5-4D6C-8FCE-1D8BF70F4B9B': svgTile(
    `<circle cx="32" cy="32" r="21" fill="none" stroke="${MAIN}" stroke-width="6.5" stroke-dasharray="4.4 4.6"/>` +
      `<circle cx="32" cy="32" r="18.2" fill="${MAIN}"/>` +
      `<circle cx="32" cy="32" r="11" fill="${LIGHT}"/>` +
      `<circle cx="32" cy="32" r="4.5" fill="${MAIN}"/>`
  )
}

/** A bundled data-URL icon for a known shell-namespace CLSID, else null. */
export function shellClsidIcon(guid: string): string | null {
  const svg = SHELL_GUID_SVGS[guid.replace(/-/g, '').toUpperCase()] ?? SHELL_GUID_SVGS[guid.toUpperCase()]
  if (!svg) return null
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

export interface IconSource {
  path: string
  index: number
}

const sourceCache = new Map<string, IconSource | null>()

/**
 * Resolve the icon location registered for a CLSID, e.g.
 *   HKCR\CLSID\{645FF040-…}\DefaultIcon = %SystemRoot%\System32\imageres.dll,-55
 * Returns the expanded dll path + the (positive) icon group id as `index`.
 */
export async function clsidIconSource(guid: string): Promise<IconSource | null> {
  if (sourceCache.has(guid)) return sourceCache.get(guid)!
  const key = `HKCR\\CLSID\\{${guid}}\\DefaultIcon`
  try {
    const { stdout } = await execFileP('reg', ['query', key, '/ve'])
    const m = /\(Default\)\s+REG_\w+\s+(.+)/i.exec(stdout)
    if (!m) {
      sourceCache.set(guid, null)
      return null
    }
    const val = m[1].trim()
    const comma = val.lastIndexOf(',')
    if (comma <= 0 || comma === val.length - 1) {
      sourceCache.set(guid, { path: expandEnv(val), index: 0 })
      return sourceCache.get(guid)!
    }
    const rawIndex = Number(val.slice(comma + 1))
    const src: IconSource = {
      path: expandEnv(val.slice(0, comma)),
      index: Number.isFinite(rawIndex) ? Math.abs(rawIndex) : 0
    }
    sourceCache.set(guid, src)
    return src
  } catch {
    sourceCache.set(guid, null)
    return null
  }
}

/** Expand `%VAR%` (for REG_EXPAND_SZ values like %SystemRoot%). */
function expandEnv(p: string): string {
  return p.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, k: string) => process.env[k] ?? `%${k}%`)
}

function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len)
  let off = 0
  while (off < len) {
    const n = readSync(fd, buf, off, len - off, pos + off)
    if (n <= 0) break
    off += n
  }
  return buf
}