import { clipboard } from 'electron'

const MAX = 30

/**
 * Rolling in-memory clipboard history. Polls the OS clipboard in the
 * background and pushes new text entries to the dashboard card. Copy-from-card
 * is mirrored so it lands on top. History is not persisted (session only).
 */
export class ClipboardService {
  private history: string[] = []
  private last = ''
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private onChange: (entry: string) => void) {}

  start(): this {
    this.stop()
    this.timer = setInterval(() => this.poll(), 800)
    this.poll()
    return this
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  list(): string[] {
    return this.history
  }

  /** Copy text to the OS clipboard and also surface it through the history. */
  copy(text: string): void {
    if (!text) return
    this.last = text
    clipboard.writeText(text)
    this.push(text)
  }

  private poll(): void {
    const text = clipboard.readText()
    if (text && text !== this.last) {
      this.last = text
      this.push(text)
    } else if (!text) {
      this.last = ''
    }
  }

  private push(text: string): void {
    const content = text.replace(/\r\n/g, '\n').trim()
    if (!content || content.length > 5000) return
    this.history = [content, ...this.history.filter((h) => h !== content)].slice(0, MAX)
    this.onChange(content)
  }
}