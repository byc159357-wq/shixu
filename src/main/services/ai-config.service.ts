import { safeStorage } from 'electron'
import type { Db } from './db'
import { OpenAiCompatClient } from './ai-provider'

export type AiProviderKind = 'openai-compat' | 'ollama' | 'off'

export interface AiConfig {
  provider: AiProviderKind
  baseUrl: string
  model: string
  hasApiKey: boolean
  /** live decrypted key (only returned on explicit get-with-secret calls) */
  apiKey: string | null
}

const KEY_BASE_URL = 'ai.baseUrl'
const KEY_MODEL = 'ai.model'
const KEY_PROVIDER = 'ai.provider'
const KEY_API_KEY_ENC = 'ai.apiKey.enc'

const DEFAULTS: Record<string, string> = {
  [KEY_PROVIDER]: 'off',
  [KEY_BASE_URL]: 'https://api.openai.com/v1',
  [KEY_MODEL]: 'gpt-4o-mini'
}

/**
 * AI configuration stored in settings, with the API key encrypted via
 * Electron safeStorage (DPAPI on Windows). In headless/test environments
 * safeStorage may be unavailable; the encryptor is injectable.
 */
export class AiConfigService {
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

  getConfig(withSecret = false): AiConfig {
    const provider = (this.get(KEY_PROVIDER) as AiProviderKind) || 'off'
    const enc = this.get(KEY_API_KEY_ENC)
    let apiKey: string | null = null
    if (withSecret && enc) {
      try {
        apiKey = this.enc.decrypt(Buffer.from(enc, 'base64'))
      } catch {
        apiKey = null
      }
    }
    return {
      provider,
      baseUrl: this.get(KEY_BASE_URL) || DEFAULTS[KEY_BASE_URL],
      model: this.get(KEY_MODEL) || DEFAULTS[KEY_MODEL],
      hasApiKey: !!enc,
      apiKey
    }
  }

  /** Save config; apiKey is only re-encrypted when provided (otherwise kept). */
  save(input: { provider: AiProviderKind; baseUrl: string; model: string; apiKey?: string | null }): void {
    const existingEnc = this.get(KEY_API_KEY_ENC)
    const stmt = this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    stmt.run(KEY_PROVIDER, input.provider)
    stmt.run(KEY_BASE_URL, input.baseUrl.trim() || DEFAULTS[KEY_BASE_URL])
    stmt.run(KEY_MODEL, input.model.trim() || DEFAULTS[KEY_MODEL])
    if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey.trim()) {
      if (this.enc.isEncryptionAvailable()) {
        const enc = this.enc.encrypt(input.apiKey.trim()).toString('base64')
        stmt.run(KEY_API_KEY_ENC, enc)
      } else {
        // safeStorage unavailable (rare) — still store so the flow is testable
        stmt.run(KEY_API_KEY_ENC, Buffer.from(input.apiKey.trim(), 'utf-8').toString('base64'))
      }
    } else if (input.apiKey === null && existingEnc) {
      // explicit null clears the key
      this.db.prepare(`DELETE FROM settings WHERE key = ?`).run(KEY_API_KEY_ENC)
    }
  }

  /** Build a usable LLM client from the current config, or null if AI is off. */
  buildClient(): OpenAiCompatClient | null {
    const cfg = this.getConfig(true)
    if (cfg.provider === 'off') return null
    const baseUrl = cfg.baseUrl.replace(/\/$/, '')
    if (cfg.provider === 'ollama') {
      return new OpenAiCompatClient({
        baseUrl: cfg.baseUrl,
        apiKey: null,
        model: cfg.model || 'llama3.1'
      })
    }
    if (!cfg.apiKey) return null // openai-compat requires a key
    return new OpenAiCompatClient({ baseUrl, apiKey: cfg.apiKey, model: cfg.model })
  }

  private get(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }
}
