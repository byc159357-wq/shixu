import { nativeImage } from 'electron'
import { existsSync } from 'node:fs'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic'])
const MAX_CACHE = 400
const cache = new Map<string, string>()

/**
 * Renderer-safe thumbnail as data URL. Only real image files; other types
 * get type icons in the UI. Cache lives in memory and is rebuildable
 * (design-system: never a source of truth).
 */
export function getThumbnailDataUrl(filePath: string, size = 96): string | null {
  const key = `${filePath}@${size}`
  const hit = cache.get(key)
  if (hit) return hit

  const dot = filePath.lastIndexOf('.')
  const ext = dot >= 0 ? filePath.slice(dot + 1).toLowerCase() : ''
  if (!IMAGE_EXTS.has(ext)) return null
  if (!existsSync(filePath)) return null

  const img = nativeImage.createFromPath(filePath)
  if (img.isEmpty()) return null

  const resized = img.resize({ width: size, height: size, quality: 'good' })
  const url = resized.toDataURL()
  cache.set(key, url)
  if (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return url
}
