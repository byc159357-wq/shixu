/** Extract the ATX heading tree from Markdown source (for the outline sidebar). */
export interface OutlineEntry {
  level: number
  title: string
  line: number // 0-based line number in source
}

export function extractOutline(content: string): OutlineEntry[] {
  const out: OutlineEntry[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/)
    if (m) {
      out.push({ level: m[1].length, title: m[2].trim(), line: i })
    }
  }
  return out
}
