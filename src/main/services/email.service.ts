import { safeStorage } from 'electron'
import { TextDecoder } from 'util'
import { ImapFlow } from 'imapflow'
import type {
  EmailAccountInfo,
  EmailConfigInfo,
  EmailInboxResult,
  EmailSaveInput,
  EmailTestResult,
  MailDetailResult,
  MailPreview
} from '../../shared/types'
import type { Db } from './db'

const EMAIL_KEY = 'email.accounts'
const ACTIVE_KEY = 'email.active'
const genId = (): string => 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

interface StoredEmailConfig {
  id: string
  email: string
  host: string
  port: number
  secure: boolean
  /** Encrypted auth code (safeStorage) or 'plain:<base64>' when unavailable. */
  enc?: string
}

function fromAddr(list: Array<{ name?: string; address: string }> | undefined): string {
  if (!list || !list.length) return '(未知发件人)'
  const first = list[0]
  const addr = first.address || ''
  const name = first.name && first.name.trim() ? first.name.trim() : ''
  if (!name) return addr
  return `${name} <${addr}>`
}

function toErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (/invalid credentials| authentication failed|login failed|authoriz|cannot authenticate|(^|\s)credentials/i.test(lower))
    return '登录失败：邮箱地址或授权码不正确，请核对（QQ/163 需用授权码，不是登录密码）'
  if (/econnrefused|econnreset|etimedout|timed out|timeout|getaddr|enotfound|network|connect/i.test(lower))
    return '无法连接到邮件服务器：请检查网络，以及主机地址/端口是否正确'
  if (/certificate|cert\.|self-signed|tls|ssl/i.test(lower))
    return '加密连接异常：SSL 证书有问题，或服务器需要新式加密连接'
  if (/command failed|protocol|unexpected|parsing|^command$/i.test(lower))
    return '连接被服务器拒绝：很可能是授权码无效，或该邮箱尚未开启 IMAP 服务（请到邮箱网页端开启）'
  return msg || '连接失败'
}

/**
 * Personal mailbox integration (IMAP). The auth code is a generated app
 * permission, stored encrypted via Electron safeStorage (DPAPI on Windows).
 * Connections are opened on demand and closed after each query — never kept
 * alive in the background.
 */
export class EmailService {
  constructor(private db: Db) {}

  getAccounts(): EmailAccountInfo[] {
    return this.readAccounts().map((a) => ({
      id: a.id,
      email: a.email,
      host: a.host,
      port: a.port,
      secure: a.secure,
      hasAuth: !!a.enc
    }))
  }

  getInfo(): EmailConfigInfo | null {
    const a = this.activeAccount()
    if (!a) return null
    return { email: a.email, host: a.host, port: a.port, secure: a.secure, hasAuth: !!a.enc }
  }

  activeId(): string | null {
    const id = this.readActive()
    return id || null
  }

  save(input: EmailSaveInput): void {
    const accounts = this.readAccounts()
    // Keep the existing encrypted auth code when the field is left empty.
    let enc: string
    if (input.authCode.trim()) {
      enc = this.encrypt(input.authCode)
    } else {
      const prev = input.id ? accounts.find((a) => a.id === input.id) : undefined
      enc = prev?.enc ?? this.encrypt('')
    }
    const id = input.id && accounts.some((a) => a.id === input.id) ? input.id : genId()
    const idx = accounts.findIndex((a) => a.id === id)
    const next = {
      id,
      email: input.email,
      host: input.host,
      port: Number(input.port) || 993,
      secure: input.secure !== false,
      enc
    }
    if (idx >= 0) accounts[idx] = next
    else accounts.push(next)
    this.writeAccounts(accounts)
    this.setActive(id)
  }

  select(id: string): void {
    if (this.readAccounts().some((a) => a.id === id)) this.setActive(id)
  }

  remove(id: string): void {
    this.writeAccounts(this.readAccounts().filter((a) => a.id !== id))
    if (this.readActive() === id) {
      const first = this.readAccounts()[0]
      this.setActive(first?.id ?? '')
    }
  }

  clear(): void {
    this.db.prepare(`DELETE FROM settings WHERE key = ?`).run(EMAIL_KEY)
    this.db.prepare(`DELETE FROM settings WHERE key = ?`).run(ACTIVE_KEY)
  }

  async test(input: EmailSaveInput): Promise<EmailTestResult> {
    // If no auth code was typed, fall back to the stored one so "测试连接"
    // works for an already-configured account.
    let authCode = input.authCode.trim()
    if (!authCode) {
      const stored = this.getSecret()
      if (stored && stored.email === input.email && stored.host === input.host) authCode = stored.authCode
    }
    if (!authCode) return { ok: false, error: '请先填写密码 / 授权码' }
    const client = this.newClient({ ...input, authCode })
    try {
      await client.connect()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) }
    } finally {
      this.cleanup(client)
    }
  }

  async inbox(): Promise<EmailInboxResult> {
    const cfg = this.getSecret()
    if (!cfg) return { count: 0, list: [], error: '未配置邮箱' }
    let client: ImapFlow | null = null
    let lock: { release: () => void } | null = null
    try {
      client = this.newClient(cfg)
      await client.connect()
      lock = await client.getMailboxLock('INBOX')
      const all = (await client.search({ all: true }, { uid: true })) || []
      let list: MailPreview[] = []
      if (all.length) {
        const fetched = await client.fetchAll(
          all,
          { envelope: true, flags: true, internalDate: true },
          { uid: true }
        )
        list = (fetched as FetchMsg[])
          .map((m) => ({
            uid: m.uid,
            subject: m.envelope?.subject?.trim() || '(无主题)',
            from: fromAddr(m.envelope?.from || m.envelope?.sender),
            date: m.internalDate ? m.internalDate.toISOString() : '',
            unread: !!m.flags && !new Set(m.flags).has('\\Seen')
          }))
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      }
      // Derive the unread count from the very same fetch as the list, so the
      // badge always matches what the user sees in the mailbox.
      return { count: list.filter((m) => m.unread).length, list }
    } catch (err) {
      return { count: 0, list: [], error: toErrorMessage(err) }
    } finally {
      try {
        lock?.release()
      } catch {
        /* ignore */
      }
      if (client) this.cleanup(client)
    }
  }

  async getMessage(uid: number): Promise<MailDetailResult> {
    const cfg = this.getSecret()
    if (!cfg) return { ok: false, error: '未配置邮箱' }
    let client: ImapFlow | null = null
    let lock: { release: () => void } | null = null
    try {
      client = this.newClient(cfg)
      await client.connect()
      lock = await client.getMailboxLock('INBOX')
      const fetched = (await client.fetchOne(uid, { envelope: true, internalDate: true, source: true }, { uid: true })) as
        | (FetchMsg & { source?: Buffer })
        | undefined
      if (!fetched) return { ok: false, error: '未找到该邮件' }
      const body = parseMimeBody(fetched.source ?? Buffer.from(''))
      return {
        ok: true,
        mail: {
          uid,
          subject: fetched.envelope?.subject?.trim() || '(无主题)',
          from: fromAddr(fetched.envelope?.from || fetched.envelope?.sender),
          date: fetched.internalDate ? fetched.internalDate.toISOString() : '',
          text: body.text || '',
          html: body.html || undefined
        }
      }
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) }
    } finally {
      try {
        lock?.release()
      } catch {
        /* ignore */
      }
      if (client) this.cleanup(client)
    }
  }

  private newClient(cfg: { email: string; host: string; port: number; secure: boolean; authCode: string }): ImapFlow {
    return new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.email, pass: cfg.authCode },
      // Keep noisy protocol logging out of dev/console.
      logger: false
    })
  }

  private cleanup(client: ImapFlow): void {
    void (async () => {
      try {
        await client.logout()
      } catch {
        /* ignore */
      }
      try {
        client.close()
      } catch {
        /* ignore */
      }
    })()
  }

  private getSecret(): { email: string; host: string; port: number; secure: boolean; authCode: string } | null {
    const a = this.activeAccount()
    if (!a || !a.enc) return null
    return { email: a.email, host: a.host, port: a.port, secure: a.secure, authCode: this.decrypt(a.enc) }
  }

  private activeAccount(): StoredEmailConfig | null {
    const accounts = this.readAccounts()
    if (!accounts.length) return null
    const id = this.readActive()
    return accounts.find((a) => a.id === id) ?? accounts[0]
  }

  private readAccounts(): StoredEmailConfig[] {
    try {
      const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(EMAIL_KEY) as
        | { value: string }
        | undefined
      if (!row?.value) return []
      const v = JSON.parse(row.value)
      const norm = (a: Partial<StoredEmailConfig>): StoredEmailConfig => ({
        id: a.id ?? genId(),
        email: a.email ?? '',
        host: a.host ?? '',
        port: Number(a.port) || 993,
        secure: a.secure !== false,
        enc: a.enc
      })
      if (Array.isArray(v)) return v.filter((x) => x && x.email && x.host).map(norm)
      // Legacy single-account object → migrate to a one-element list.
      if (v && v.email && v.host) return [norm(v)]
      return []
    } catch {
      return []
    }
  }

  private writeAccounts(list: StoredEmailConfig[]): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(EMAIL_KEY, JSON.stringify(list))
  }

  private readActive(): string {
    try {
      const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(ACTIVE_KEY) as
        | { value: string }
        | undefined
      return row?.value ?? ''
    } catch {
      return ''
    }
  }

  private setActive(id: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(ACTIVE_KEY, id)
  }

  private encrypt(plain: string): string {
    const fallback = 'plain:' + Buffer.from(plain || '').toString('base64')
    if (!plain) return fallback
    try {
      if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(plain).toString('base64')
      return fallback
    } catch {
      return fallback
    }
  }

  private decrypt(enc?: string): string {
    if (!enc) return ''
    try {
      if (enc.startsWith('plain:')) return Buffer.from(enc.slice(6), 'base64').toString('utf8')
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return ''
    }
  }
}

type FetchMsg = {
  uid: number
  envelope?: {
    subject?: string
    from?: Array<{ name?: string; address: string }>
    sender?: Array<{ name?: string; address: string }>
  }
  flags?: Set<string> | string[]
  internalDate?: Date
}

/** Best-effort MIME body extraction: prefers text/plain, falls back to text/html. */
function parseMimeBody(source: Buffer): { text?: string; html?: string } {
  const raw = source.toString('binary')
  const headerEnd = raw.indexOf('\r\n\r\n')
  const header = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw
  const body = (headerEnd >= 0 ? raw.slice(headerEnd + 4) : '') || ''
  const ct = getHeader(header, 'content-type')
  const cte = getHeader(header, 'content-transfer-encoding')

  if (/multipart/i.test(ct)) {
    const bm = /boundary="?([^";\s]+)"?/i.exec(ct)
    if (bm) {
      const boundary = bm[1]
      const parts = body.split('--' + boundary)
      let text: string | undefined
      let html: string | undefined
      for (const part of parts) {
        const trimmed = part.replace(/^[\r\n]+/, '')
        if (!trimmed || /^--/.test(trimmed)) continue
        const sub = parseMimeBody(Buffer.from(part, 'binary'))
        if (!text && sub.text) text = sub.text
        if (!html && sub.html) html = sub.html
        if (text && html) break
      }
      if (text || html) return { text, html }
    }
  }

  const decoded = transferDecode(body, cte)
  const charset = /charset="?([^";\s]+)"?/i.exec(ct)?.[1] || 'utf-8'
  const str = decodeCharset(decoded, charset)
  if (/text\/html/i.test(ct)) return { html: str }
  return { text: str }
}

function getHeader(header: string, name: string): string {
  const lowerName = name.toLowerCase()
  let value = ''
  for (const line of header.split('\r\n')) {
    if (/^[ \t]/.test(line)) {
      value += ' ' + line.trim()
      continue
    }
    const idx = line.indexOf(':')
    if (idx < 0) continue
    if (line.slice(0, idx).trim().toLowerCase() === lowerName) value = line.slice(idx + 1).trim()
  }
  return value
}

function transferDecode(content: string, encoding: string): Buffer {
  const enc = (encoding || '').toLowerCase()
  if (enc === 'base64') return Buffer.from(content.replace(/[\r\n\s]/g, ''), 'base64')
  if (enc === 'quoted-printable') return decodeQuotedPrintable(content)
  return Buffer.from(content, 'latin1')
}

function decodeQuotedPrintable(s: string): Buffer {
  const out = Buffer.alloc(s.length)
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 61 /* '=' */) {
      const hx = s.slice(i + 1, i + 3)
      if (/^[0-9a-fA-F]{2}$/.test(hx)) {
        out[n++] = parseInt(hx, 16)
        i += 2
        continue
      }
      // soft line break: '=\r\n' or '=\n'
      if (s[i + 1] === '\r' && s[i + 2] === '\n') {
        i += 2
        continue
      }
      if (s[i + 1] === '\n') {
        i += 1
        continue
      }
    }
    out[n++] = c & 0xff
  }
  return out.subarray(0, n)
}

function decodeCharset(buf: Buffer, charset: string): string {
  const enc = (charset || '').toLowerCase().replace(/["']/g, '')
  try {
    return new TextDecoder(enc === 'us-ascii' || enc === 'ascii' ? 'utf-8' : enc).decode(buf)
  } catch {
    return buf.toString('utf8')
  }
}