import { openSync, readSync, closeSync, statSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const MZ = 0x5a4d
const RT_ICON = 3
const RT_GROUP_ICON = 14

/**
 * Extract the PNG payload of the largest (up to 256x256) icon embedded in a
 * Win32 PE image (exe/dll). Modern Windows icons carry a PNG-encoded 256px
 * frame inside RT_ICON — that's what the desktop shell uses — while
 * Electron's getFileIcon is capped at ~32-48px and can't reach it. Returns
 * the PNG bytes, or null when the file has no usable high-res PNG icon.
 */
export function extractHighResIcon(filePath: string): Buffer | null {
  let fd = -1
  try {
    const sz = statSync(filePath).size
    fd = openSync(filePath, 'r')
    return parsePe(fd, sz)
  } catch {
    return null
  } finally {
    if (fd >= 0) closeSync(fd)
  }
}

/** Extract the largest usable frame (PNG or BMP) from a standalone .ico file
 *  — many apps ship a custom .ico next to the exe that Windows uses directly. */
export function extractHighResIconFromIco(filePath: string): Buffer | null {
  let fd = -1
  try {
    const sz = statSync(filePath).size
    fd = openSync(filePath, 'r')
    const head = readAt(fd, 0, 6)
    if (head.readUInt16LE(0) !== 0 || head.readUInt16LE(2) !== 1) return null
    const count = head.readUInt16LE(4)
    if (count === 0 || count > 64) return null
    const ents = readAt(fd, 6, count * 16)
    let best: Buffer | null = null
    let bestDim = 0
    for (let i = 0; i < count; i++) {
      const e = i * 16
      const bytesInRes = ents.readUInt32LE(e + 8)
      const off = ents.readUInt32LE(e + 12)
      if (off + bytesInRes > sz || bytesInRes <= 0) continue
      const data = readAt(fd, off, bytesInRes)
      const png = isPng(data) ? data : bmpToPng(data)
      if (!png || png.length < 24) continue
      const dim = png.readUInt32BE(16) * png.readUInt32BE(20)
      if (dim > bestDim) {
        bestDim = dim
        best = png
      }
    }
    return best
  } catch {
    return null
  } finally {
    if (fd >= 0) closeSync(fd)
  }
}

function parsePe(fd: number, size: number): Buffer | null {
  const r = readIconFrames(fd, size)
  if (!r) return null

  // Windows shows an .exe's icon from the icon GROUP with the LOWEST resource
  // ID (its "default" group); the other groups are secondary icons (file-type
  // association, in-app feature glyphs). Picking the largest frame ACROSS ALL
  // groups can surface one of those secondary icons instead of the app's real
  // logo — e.g. Quark embeds a 768px "PDF" glyph and Windows still shows the
  // blue brand logo. So restrict selection to the default (lowest-ID) group,
  // then within it return the HIGHEST-RESOLUTION usable frame (PNG or BMP).
  let minId = Number.POSITIVE_INFINITY
  for (const id of r.groups.keys()) if (id < minId) minId = id
  const grp = r.groups.get(minId)
  if (!grp) return null

  let best: Buffer | null = null
  let bestDim = 0
  for (const f of parseIconDir(grp)) {
    const data = r.icons.get(f.id)
    if (!data) continue
    const png = isPng(data) ? data : bmpToPng(data)
    if (!png || png.length < 24) continue
    const dim = png.readUInt32BE(16) * png.readUInt32BE(20)
    if (dim > bestDim) {
      bestDim = dim
      best = png
    }
  }
  return best
}

/** Return DISTINCT usable icon frames (largest first, up to 24) as PNG buffers —
 *  used to inspect every candidate embedded in an exe and pick a better one.
 *  Dedupes by content hash so two same-size but differently drawn frames both
 *  appear (common when a launcher also embeds the real app icon). */
export function collectHighResIconFrames(filePath: string): Buffer[] {
  let fd = -1
  try {
    const sz = statSync(filePath).size
    fd = openSync(filePath, 'r')
    const r = readIconFrames(fd, sz)
    if (!r) return []
    const seen = new Set<string>()
    const out: Buffer[] = []
    for (const f of [...r.frames].sort((a, b) => b.w * b.h - a.w * a.h)) {
      const data = r.icons.get(f.id)
      if (!data) continue
      const png = isPng(data) ? data : bmpToPng(data)
      if (!png || png.length < 24) continue
      const h = frameHash(png)
      if (seen.has(h)) continue
      seen.add(h)
      out.push(png)
      if (out.length >= 24) break
    }
    return out
  } catch {
    return []
  } finally {
    if (fd >= 0) closeSync(fd)
  }
}

function frameHash(png: Buffer): string {
  let h1 = 2166136261
  let h2 = 2166136261
  const step = Math.max(1, Math.floor(png.length / 512))
  for (let i = 0; i < png.length; i += step) {
    h1 = Math.imul(h1 ^ png[i], 16777619)
    h2 = Math.imul(h2 ^ png[png.length - 1 - i], 16777619)
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)
}

/** Extract the highest-res frame for a specific icon GROUP id (the nID used by
 *  Windows for RT_GROUP_ICON, e.g. "imageres.dll,-109" → id 109). This lets us
 *  pull exactly the shell icon the desktop uses for a CLSID (回收站/此电脑/网络). */
export function extractHighResIconById(filePath: string, id: number): Buffer | null {
  let fd = -1
  try {
    const sz = statSync(filePath).size
    fd = openSync(filePath, 'r')
    const r = readIconFrames(fd, sz)
    if (!r) return null
    const grp = r.groups.get(id)
    if (!grp) return null
    const entries = parseIconDir(grp)
    let best: Buffer | null = null
    let bestDim = 0
    for (const f of entries) {
      const data = r.icons.get(f.id)
      if (!data) continue
      const png = isPng(data) ? data : bmpToPng(data)
      if (!png || png.length < 24) continue
      const dim = png.readUInt32BE(16) * png.readUInt32BE(20)
      if (dim > bestDim) {
        bestDim = dim
        best = png
      }
    }
    return best
  } catch {
    return null
  } finally {
    if (fd >= 0) closeSync(fd)
  }
}

/** Shared PE resource parsing: locate the resource directory, slice its data,
 *  and enumerate every icon group + payload. */
function readIconFrames(
  fd: number,
  size: number
): {
  icons: Map<number, Buffer>
  groups: Map<number, Buffer>
  frames: Array<{ w: number; h: number; id: number }>
} | null {
  const dos = readAt(fd, 0, 0x40)
  if (dos.readUInt16LE(0) !== MZ) return null
  const peOff = dos.readUInt32LE(0x3c)
  const sig = readAt(fd, peOff, 24) // "PE\0\0" + COFF header (20B)
  if (sig.toString('latin1', 0, 4) !== 'PE\u0000\u0000') return null
  const numSecs = sig.readUInt16LE(6)
  const sizeOfOptHdr = sig.readUInt16LE(20)

  const optOff = peOff + 24
  const magic = readUInt16(fd, optOff)
  const is64 = magic === 0x20b
  const dirsStart = optOff + (is64 ? 112 : 96)
  const resRVA = readUInt32(fd, dirsStart + 16)
  const resSize = readUInt32(fd, dirsStart + 20)
  if (!resRVA || resSize === 0 || resSize > 64 * 1024 * 1024) return null

  // Locate the section that holds the resource directory.
  let secVA = 0
  let rawOff = 0
  let secRawSize = 0
  let found = false
  for (let i = 0; i < numSecs; i++) {
    const s = optOff + sizeOfOptHdr + i * 40
    if (s + 24 > size) break
    const vs = readUInt32(fd, s + 8)
    const va = readUInt32(fd, s + 12)
    const rawSz = readUInt32(fd, s + 16)
    const raw = readUInt32(fd, s + 20)
    if (resRVA >= va && resRVA < va + vs) {
      secVA = va
      rawOff = raw
      secRawSize = rawSz
      found = true
      break
    }
  }
  if (!found) return null

  // We slice the resource section from the directory's own file offset, so a
  // buffer index *i* maps to an absolute RVA of resRVA + i.
  const dirFileOff = rawOff + (resRVA - secVA)
  const resLen = Math.min(resSize, Math.max(secRawSize + rawOff - dirFileOff, 0))
  const res = readAt(fd, dirFileOff, resLen)

  const icons = mapType(res, true, resRVA) // id -> bitmap bytes
  const groups = mapType(res, false, resRVA)
  if (icons.size === 0) return null

  const frames: Array<{ w: number; h: number; id: number }> = []
  groups.forEach((g) => frames.push(...parseIconDir(g)))
  return { icons, groups, frames }
}

/**
 * Because our buffer starts at the resource directory's RVA (resRVA), every
 * offset field (relative to the resource section start... but the directory
 * lives at resRVA) needs translation. In practice the resource directory is
 * the first thing in its section, so dirStartDelta is nearly always 0 and the
 * low 31-bit offsets index directly into our buffer. We nonetheless compute it
 * to stay correct for the unusual layouts where the section begins earlier.
 */
function mapType(res: Buffer, iconOrGroup: boolean, resRVA: number): Map<number, Buffer> {
  const typeId = iconOrGroup ? RT_ICON : RT_GROUP_ICON
  const out = new Map<number, Buffer>()
  const typeDir = findChildDir(res, 0, typeId)
  if (typeDir < 0) return out
  const typeCount = childCount(res, typeDir)
  for (let i = 0; i < typeCount; i++) {
    const ce = childEntry(res, typeDir, i)
    if (!ce.isDir) continue
    const langCount = childCount(res, ce.target)
    for (let j = 0; j < langCount; j++) {
      const le = childEntry(res, ce.target, j)
      if (le.isDir) continue
      const bytes = leafBytes(res, le.target, resRVA)
      if (bytes) out.set((ce.nameId & 0xffff) as number, bytes)
    }
  }
  return out
}

function findChildDir(res: Buffer, dirOff: number, idLo: number): number {
  const count = childCount(res, dirOff)
  for (let i = 0; i < count; i++) {
    const ce = childEntry(res, dirOff, i)
    if (ce.isDir && (ce.nameId & 0xffff) === idLo) return ce.target
  }
  return -1
}

function childCount(res: Buffer, dirOff: number): number {
  return res.readUInt16LE(dirOff + 12) + res.readUInt16LE(dirOff + 14)
}

function childEntry(
  res: Buffer,
  dirOff: number,
  i: number
): { nameId: number; isDir: boolean; target: number } {
  const e = dirOff + 16 + i * 8
  const nameId = res.readUInt32LE(e)
  const off = res.readUInt32LE(e + 4)
  return { nameId, isDir: (off & 0x80000000) !== 0, target: off & 0x7fffffff }
}

/** Resolve a resource data entry. The entry's OffsetToData is an absolute RVA,
 *  so subtract the resource directory RVA (our buffer's index zero) to index it. */
function leafBytes(res: Buffer, entryPos: number, resRVA: number): Buffer | null {
  if (entryPos < 0 || entryPos + 16 > res.length) return null
  const dataRva = res.readUInt32LE(entryPos)
  const len = res.readUInt32LE(entryPos + 4)
  if (len <= 0 || len > 32 * 1024 * 1024) return null
  const idx = dataRva - resRVA
  if (idx < 0 || idx + len > res.length) return null
  return res.subarray(idx, idx + len)
}

function parseIconDir(data: Buffer): Array<{ w: number; h: number; id: number }> {
  if (data.length < 6) return []
  const count = data.readUInt16LE(4)
  const out: Array<{ w: number; h: number; id: number }> = []
  // GRPICONDIRENTRY is 14 bytes: 4 color/plane bytes + dwBytesInRes + nID.
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 14
    if (e + 14 > data.length) break
    const b = data.readUInt8(e) // 0 means 256
    const bb = data.readUInt8(e + 1)
    out.push({ w: b === 0 ? 256 : b, h: bb === 0 ? 256 : bb, id: data.readUInt16LE(e + 12) })
  }
  return out
}

function isPng(b: Buffer): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
}

/** Convert a raw 24/32bpp BMP icon frame (DIB, bottom-up by default) to PNG, so
 *  icons that have no PNG payload can still be served at their native size. */
function bmpToPng(buf: Buffer): Buffer | null {
  try {
    let off = buf[0] === 0x42 && buf[1] === 0x4d ? buf.readUInt32LE(10) : 0 // skip "BM"
    if (buf.length - off < 40) return null
    const biSize = buf.readUInt32LE(off)
    if (biSize < 40) return null
    const w = buf.readInt32LE(off + 4)
    const rawH = buf.readInt32LE(off + 8)
    const bpp = buf.readUInt16LE(off + 14)
    const comp = buf.readUInt32LE(off + 16)
    if (w <= 0 || rawH === 0 || (comp !== 0 && comp !== 3) || (bpp !== 32 && bpp !== 24)) return null
    const topDown = rawH < 0
    const height = Math.floor(Math.abs(rawH) / 2) // icon frames carry an AND-mask half
    if (height <= 0) return null
    const bytes = bpp / 8
    const rowSize = Math.ceil((w * bytes) / 4) * 4
    const dataStart = off + biSize + (comp === 3 ? 12 : 0)
    const px = Buffer.alloc(w * height * 4)
    for (let y = 0; y < height; y++) {
      const row = Math.min(topDown ? y : height - 1 - y, height - 1)
      const s = dataStart + row * rowSize
      const d = y * w * 4
      for (let x = 0; x < w; x++) {
        const p = s + x * bytes
        if (bpp === 32) {
          px[d + x * 4] = buf[p + 2]
          px[d + x * 4 + 1] = buf[p + 1]
          px[d + x * 4 + 2] = buf[p]
          px[d + x * 4 + 3] = buf[p + 3]
        } else {
          px[d + x * 4] = buf[p + 2]
          px[d + x * 4 + 1] = buf[p + 1]
          px[d + x * 4 + 2] = buf[p]
          px[d + x * 4 + 3] = 255
        }
      }
    }
    return encodePng(w, height, px)
  } catch {
    return null
  }
}

let crcTable: Uint32Array | null = null
function makeCrcTable(): Uint32Array {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
}
function crc32(buf: Buffer): number {
  const t = crcTable ?? (crcTable = makeCrcTable())
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'latin1')
  const head = Buffer.concat([t, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(head))
  return Buffer.concat([len, head, crc])
}
function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
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

function readUInt32(fd: number, pos: number): number {
  return readAt(fd, pos, 4).readUInt32LE(0)
}

function readUInt16(fd: number, pos: number): number {
  return readAt(fd, pos, 2).readUInt16LE(0)
}