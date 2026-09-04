/**
 * Minimal RFC 5545 (iCalendar) subset for Workdeck events.
 * Enough for round-trip with our own events and common tools (Google/Outlook):
 * VEVENT with SUMMARY, DTSTART, DTEND, DTSTAMP, UID, DESCRIPTION, ALL-DAY flag.
 */

export interface IcsEvent {
  uid: string
  summary: string
  description?: string
  startAt: string // ISO 8601 local
  endAt: string
  allDay: boolean
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function unescapeText(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function fmtIso(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace(/\.\d{3}$/, '')
}

/** Generate an .ics document for the given events. */
export function generateIcs(events: IcsEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ATELIER//ATELIER Calendar//ZH'
  ]
  const now = fmtIso(new Date().toISOString())
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.uid}`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`SUMMARY:${escapeText(e.summary)}`)
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${e.startAt.slice(0, 10).replace(/-/g, '')}`)
      lines.push(`DTEND;VALUE=DATE:${e.endAt.slice(0, 10).replace(/-/g, '')}`)
    } else {
      lines.push(`DTSTART:${fmtIso(e.startAt)}`)
      lines.push(`DTEND:${fmtIso(e.endAt)}`)
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/** Parse a single VEVENT's property lines into a record. */
function parseVevent(lines: string[]): Record<string, string> {
  const props: Record<string, string> = {}
  let currentKey = ''
  for (const raw of lines) {
    // unfold continuation lines (RFC 5545: start with space/tab)
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && currentKey) {
      props[currentKey] += raw.slice(1)
      continue
    }
    const colon = raw.indexOf(':')
    if (colon < 0) continue
    const namePart = raw.slice(0, colon)
    const value = raw.slice(colon + 1)
    const key = namePart.split(';')[0].toUpperCase()
    currentKey = key
    props[key] = value
  }
  return props
}

/** Parse an .ics document into events. Unknown/empty VEVENTs are skipped. */
export function parseIcs(content: string): IcsEvent[] {
  const unfolded = content.split(/\r?\n/)
  const events: IcsEvent[] = []
  let inVevent = false
  let buf: string[] = []

  for (const line of unfolded) {
    const t = line.trim()
    if (t === 'BEGIN:VEVENT') {
      inVevent = true
      buf = []
      continue
    }
    if (t === 'END:VEVENT') {
      inVevent = false
      const p = parseVevent(buf)
      if (p['SUMMARY'] && p['DTSTART']) {
        const allDay = /DTSTART;VALUE=DATE/.test(buf.find((l) => l.toUpperCase().startsWith('DTSTART')) ?? '')
        events.push({
          uid: p['UID'] ?? `imported-${events.length}-${Date.now()}`,
          summary: unescapeText(p['SUMMARY']),
          description: p['DESCRIPTION'] ? unescapeText(p['DESCRIPTION']) : undefined,
          startAt: toIso(p['DTSTART']),
          endAt: toIso(p['DTEND'] ?? p['DTSTART']),
          allDay
        })
      }
      continue
    }
    if (inVevent) buf.push(line)
  }
  return events
}

/** Normalize ICS datetime (YYYYMMDDTHHMMSSZ / YYYYMMDD) to ISO 8601. */
function toIso(v: string): string {
  const s = v.trim()
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00`
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?/)
  if (!m) return s
  const hms = m[6] ? `${m[4]}:${m[5]}:${m[6]}` : `${m[4]}:${m[5]}:00`
  return `${m[1]}-${m[2]}-${m[3]}T${hms}`
}
