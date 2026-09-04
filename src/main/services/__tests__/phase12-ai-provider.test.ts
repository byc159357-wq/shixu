import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { extractJson, OpenAiCompatClient } from '../ai-provider'
import { AiConfigService } from '../ai-config.service'

function mockFetch(handler: (url: string, init: RequestInit) => unknown) {
  return (async (url: string, init: RequestInit) => {
    const data = await handler(url, init)
    return {
      ok: true,
      status: 200,
      json: async () => data
    } as unknown as Response
  }) as typeof fetch
}

describe('extractJson', () => {
  it('parses plain JSON', () => {
    const r = extractJson('{"action":"search","params":{"query":"x"},"confidence":0.9,"explanation":"搜"}')
    expect(r?.action).toBe('search')
    expect(r?.params.query).toBe('x')
  })

  it('strips markdown code fences', () => {
    const r = extractJson('```json\n{"action":"create_task","params":{"title":"a","date":"2026-08-17"},"confidence":1,"explanation":"e"}\n```')
    expect(r?.action).toBe('create_task')
    expect(r?.params.date).toBe('2026-08-17')
  })

  it('handles surrounding prose', () => {
    const r = extractJson('好的，这是结果：{"action":"summarize","params":{},"confidence":0.8,"explanation":"总结"} 完成')
    expect(r?.action).toBe('summarize')
  })

  it('returns null on garbage', () => {
    expect(extractJson('抱歉我无法理解')).toBeNull()
    expect(extractJson('{}')).toBeNull()
  })
})

describe('OpenAiCompatClient', () => {
  it('sends a chat request and parses the intent', async () => {
    const client = new OpenAiCompatClient(
      { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-x' },
      mockFetch((url, init) => {
        expect(url).toBe('https://api.example.com/v1/chat/completions')
        const body = JSON.parse(String(init.body)) as { model: string; messages: unknown[] }
        expect(body.model).toBe('gpt-x')
        expect(body.messages).toHaveLength(2)
        expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test')
        return {
          choices: [
            {
              message: {
                content:
                  '{"action":"create_task","params":{"title":"交报告","date":"2026-08-17"},"confidence":0.97,"explanation":"创建任务「交报告」"}'
              }
            }
          ]
        }
      })
    )
    const intent = await client.parseIntent('明天交报告')
    expect(intent.action).toBe('create_task')
    expect(intent.params.title).toBe('交报告')
    expect(intent.confidence).toBe(0.97)
  })

  it('works without an api key (ollama) and no auth header', async () => {
    const client = new OpenAiCompatClient(
      { baseUrl: 'http://localhost:11434/v1/', apiKey: null, model: 'llama3.1' },
      mockFetch((url, init) => {
        expect(url).toBe('http://localhost:11434/v1/chat/completions')
        expect(init.headers).not.toHaveProperty('Authorization')
        return { choices: [{ message: { content: '{"action":"search","params":{"query":"t"},"confidence":0.5,"explanation":"s"}' } }] }
      })
    )
    const intent = await client.parseIntent('随便搜')
    expect(intent.action).toBe('search')
  })

  it('throws on non-ok responses', async () => {
    const client = new OpenAiCompatClient(
      { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
      (async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response) as typeof fetch
    )
    await expect(client.parseIntent('a')).rejects.toThrow('HTTP 401')
  })

  it('falls back to search for invalid actions and clamps confidence', async () => {
    const client = new OpenAiCompatClient(
      { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
      mockFetch(() => ({
        choices: [{ message: { content: '{"action":"fly","params":{},"confidence":99,"explanation":"?"}' } }]
      }))
    )
    const intent = await client.parseIntent('a')
    expect(intent.action).toBe('search')
    expect(intent.confidence).toBe(1)
  })

  it('summarize returns the model text', async () => {
    const client = new OpenAiCompatClient(
      { baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
      mockFetch(() => ({ choices: [{ message: { content: '项目进展顺利' } }] }))
    )
    expect(await client.summarize('context')).toContain('进展顺利')
  })
})

describe('AiConfigService', () => {
  let dir: string
  let db: Db
  const enc = {
    isEncryptionAvailable: () => true,
    encrypt: (s: string) => Buffer.from(`ENC(${s})`, 'utf-8'),
    decrypt: (b: Buffer) => b.toString('utf-8').replace(/^ENC\(/, '').replace(/\)$/, '')
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-aicfg-'))
    db = openDb(join(dir, 'test.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('defaults to off with sensible base', () => {
    const svc = new AiConfigService(db, enc)
    const cfg = svc.getConfig()
    expect(cfg.provider).toBe('off')
    expect(cfg.baseUrl).toContain('openai')
    expect(cfg.hasApiKey).toBe(false)
  })

  it('round-trips config with an encrypted key', () => {
    const svc = new AiConfigService(db, enc)
    svc.save({ provider: 'openai-compat', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'sk-secret' })

    const cfg = svc.getConfig(false)
    expect(cfg.provider).toBe('openai-compat')
    expect(cfg.hasApiKey).toBe(true)
    expect(cfg.apiKey).toBeNull() // no secret without explicit flag

    const withSecret = svc.getConfig(true)
    expect(withSecret.apiKey).toBe('sk-secret')
    // key is not stored in plaintext (base64 of the "encrypted" blob)
    const row = db.prepare(`SELECT value FROM settings WHERE key='ai.apiKey.enc'`).get() as { value: string }
    expect(row.value).not.toContain('sk-secret')
    expect(row.value).toBe(Buffer.from('ENC(sk-secret)', 'utf-8').toString('base64'))
  })

  it('clears the key when apiKey is null', () => {
    const svc = new AiConfigService(db, enc)
    svc.save({ provider: 'openai-compat', baseUrl: 'https://x/v1', model: 'm', apiKey: 'sk-1' })
    expect(svc.getConfig().hasApiKey).toBe(true)
    svc.save({ provider: 'openai-compat', baseUrl: 'https://x/v1', model: 'm', apiKey: null })
    expect(svc.getConfig().hasApiKey).toBe(false)
  })

  it('buildClient: off → null, openai without key → null, ollama → client', () => {
    const svc = new AiConfigService(db, enc)
    expect(svc.buildClient()).toBeNull()

    svc.save({ provider: 'openai-compat', baseUrl: 'https://x/v1', model: 'm' })
    expect(svc.buildClient()).toBeNull() // no key

    svc.save({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' })
    expect(svc.buildClient()).not.toBeNull()

    svc.save({ provider: 'openai-compat', baseUrl: 'https://x/v1', model: 'm', apiKey: 'sk-2' })
    expect(svc.buildClient()).not.toBeNull()
  })
})
