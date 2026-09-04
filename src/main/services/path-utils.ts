import path from 'node:path'

export type FileType =
  | 'image'
  | 'design'
  | 'document'
  | 'video'
  | 'markdown'
  | 'archive'
  | 'screenshot'
  | 'ai'
  | 'audio'
  | 'other'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'tiff', 'avif', 'heic']
const DESIGN_EXTS = ['psd', 'ai', 'fig', 'sketch', 'xd', 'indd', 'affinity', 'psb']
const DOCUMENT_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv']
const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v']
const MARKDOWN_EXTS = ['md', 'markdown']
const ARCHIVE_EXTS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']

/** Normalize an absolute Windows path: forward slashes → backslashes, drive letter upper-cased, trailing separators trimmed. */
export function normalizePath(p: string): string {
  let normalized = p.replace(/\//g, '\\')
  if (/^[a-zA-Z]:\\/.test(normalized)) {
    normalized = normalized[0].toUpperCase() + normalized.slice(1)
  }
  while (normalized.length > 3 && normalized.endsWith('\\')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export function nameOf(p: string): string {
  return path.basename(p)
}

/** Installer/setup bundles are treated as files, not apps. A `.msi` always
 *  counts; other extensions only when the file name signals an installer. */
const INSTALLER_HINTS = ['setup', 'install', '安装', '安装包', '新安装', '卸载', 'uninstall', 'uninst']
export function isInstaller(p: string): boolean {
  if (path.extname(p).toLowerCase() === '.msi') return true
  const base = path.basename(p, path.extname(p)).toLowerCase()
  return INSTALLER_HINTS.some((h) => base.includes(h))
}

export function extOf(p: string): string {
  const ext = path.extname(p).toLowerCase()
  return ext.startsWith('.') ? ext.slice(1) : ext
}

function fileBaseName(p: string): string {
  return path.basename(p, path.extname(p)).toLowerCase()
}

/** Classify a file into a Workdeck category. screenshot/ai are semantic and win over extension. */
export function classifyType(p: string, ext: string): FileType {
  const base = fileBaseName(p)
  const lower = p.toLowerCase()

  // Semantic categories first: they are more specific than the extension.
  if (
    base.includes('screenshot') ||
    base.includes('screen capture') ||
    base.includes('截屏') ||
    base.includes('截图')
  ) {
    return 'screenshot'
  }
  if (
    lower.includes('comfyui') ||
    lower.includes('stable-diffusion') ||
    lower.includes('fooocus') ||
    lower.includes('midjourney')
  ) {
    return 'ai'
  }

  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (DESIGN_EXTS.includes(ext)) return 'design'
  if (DOCUMENT_EXTS.includes(ext)) return 'document'
  if (VIDEO_EXTS.includes(ext)) return 'video'
  if (MARKDOWN_EXTS.includes(ext)) return 'markdown'
  if (ARCHIVE_EXTS.includes(ext)) return 'archive'
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  return 'other'
}
