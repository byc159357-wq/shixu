import { randomUUID } from 'node:crypto'
import { safeStorage } from 'electron'
import type { Db } from './db'
import type { AgentProfile } from '../../shared/types'
import { OpenAiCompatClient } from './ai-provider'

/**
 * Multi-agent registry behind the AI panel's software switcher.
 *
 * Unlike the single `设置→AI` 解析引擎, this lets the user register several
 * named OpenAI-compatible software (GLM / DeepSeek / Ollama 本地 / Qwen …) and
 * switch among them freely in the agent hub. Profiles are stored in the
 * existing `settings` table as one JSON blob under `agent.profiles` — no schema
 * migration needed — with each API key encrypted via Electron safeStorage.
 */

const STORE_KEY = 'agent.profiles'

export type ProfileStore = {
  id: string
  name: string
  baseUrl: string
  model: string
  keyEnc?: string | null
  updatedAt: number
}

export interface AgentProfileSaveInput {
  id?: string | null
  name: string
  baseUrl: string
  model: string
  /** Provide to set/rotate the key; `null` keeps the current one. */
  apiKey?: string | null
}

export class AgentProfilesService {
  constructor(
    private db: Db,
    private enc: {
      isEncryptionAvailable: () => boolean
      encrypt: (s: string) => Buffer
      decrypt: (buf: Buffer) => string
    } = {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (s) => safeStorage.encryptString(s),
      decrypt: (buf) => safeStorage.decryptString(buf)
    }
  ) {}

  /** Public profiles (keys never exposed). */
  list(): AgentProfile[] {
    return this.raw().map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      hasApiKey: !!p.keyEnc,
      updatedAt: p.updatedAt
    }))
  }

  /** Build a live client for a profile, or null when it has no key. */
  buildClient(id: string): OpenAiCompatClient | null {
    const p = this.raw().find((x) => x.id === id)
    if (!p || !p.keyEnc) return null
    let apiKey: string | null = null
    try {
      apiKey = this.enc.decrypt(Buffer.from(p.keyEnc, 'base64'))
    } catch {
      apiKey = null
    }
    return new OpenAiCompatClient({
      baseUrl: p.baseUrl.replace(/\/$/, ''),
      apiKey,
      model: p.model
    })
  }

  /** Upsert a profile; `id` empty → create, otherwise update (key kept when apiKey is undefined). */
  save(input: AgentProfileSaveInput): AgentProfile {
    const list = this.raw()
    const baseUrl = input.baseUrl.trim() || 'https://api.openai.com/v1'
    const model = input.model.trim() || 'gpt-4o-mini'
    const name = input.name.trim() || '未命名 AI'

    if (input.id) {
      const existing = list.find((p) => p.id === input.id)
      if (existing) {
        existing.name = name
        existing.baseUrl = baseUrl
        existing.model = model
        existing.updatedAt = Date.now()
        if (input.apiKey && input.apiKey.trim()) existing.keyEnc = this.encrypt(input.apiKey)
        this.write(list)
        return this.list().find((p) => p.id === input.id)!
      }
    }

    const id = randomUUID()
    const entry: ProfileStore = {
      id,
      name,
      baseUrl,
      model,
      keyEnc: input.apiKey && input.apiKey.trim() ? this.encrypt(input.apiKey) : null,
      updatedAt: Date.now()
    }
    list.push(entry)
    this.write(list)
    return this.list().find((p) => p.id === id)!
  }

  remove(id: string): void {
    this.write(this.raw().filter((p) => p.id !== id))
  }

  private encrypt(key: string): string | null {
    if (this.enc.isEncryptionAvailable()) {
      return this.enc.encrypt(key).toString('base64')
    }
    // safeStorage unavailable — fall back to reversible base64 (matches AiConfigService).
    return Buffer.from(key, 'utf-8').toString('base64')
  }

  private raw(): ProfileStore[] {
    const row = this.db
      .prepare(`SELECT value FROM settings WHERE key = ?`)
      .get(STORE_KEY) as { value: string } | undefined
    if (!row) return []
    try {
      const arr = JSON.parse(row.value)
      return Array.isArray(arr) ? (arr as ProfileStore[]) : []
    } catch {
      return []
    }
  }

  private write(list: ProfileStore[]): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(STORE_KEY, JSON.stringify(list))
  }
}