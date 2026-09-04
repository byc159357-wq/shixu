/* UI label mappings — internal enum values stay English, display text is Chinese. */

const TYPE_LABELS: Record<string, string> = {
  image: '图片',
  design: '设计',
  document: '文档',
  video: '视频',
  markdown: 'Markdown',
  archive: '压缩包',
  screenshot: '截图',
  ai: 'AI',
  audio: '音频',
  other: '其他'
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  paused: '已暂停',
  archived: '已归档',
  completed: '已完成'
}

export function projectStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

const DENSITY_LABELS: Record<string, string> = {
  comfortable: '宽松',
  default: '默认',
  compact: '紧凑'
}

export function densityLabel(d: string): string {
  return DENSITY_LABELS[d] ?? d
}
