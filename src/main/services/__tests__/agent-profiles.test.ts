import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { AgentProfilesService } from '../agent-profiles.service'

/**
 * AgentProfilesService: user-registered switchable OpenAI-compatible AI software.
 * Uses an injectable reversible encryptor so it runs headless without safeStorage.
 */
const enc = {
  isEncryptionAvailable: () => true,
  encrypt: (s: string) => Buffer.from(`enc(${s})`, 'utf-8'),
  decrypt: (buf: Buffer) => (buf.toString('utf-8').startsWith('enc(') ? buf.toString('utf-8').slice(4, -1) : buf.toString('utf-8'))
}

describe('AgentProfilesService', () => {
  let dir: string
  let db: Db
  let svc: AgentProfilesService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-agents-'))
    db = openDb(join(dir, 'agents.db'))
    svc = new AgentProfilesService(db, enc)
  })

  it('starts empty and lists saved profiles without exposing keys', () => {
    expect(svc.list()).toEqual([])
    svc.save({ name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'sk-abc' })
    const list = svc.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('DeepSeek')
    expect(list[0].hasApiKey).toBe(true)
    expect('apiKey' in list[0]).toBe(false)
  })

  it('builds a usable client only when a key is stored', () => {
    expect(svc.buildClient('missing')).toBeNull()
    const p = svc.save({ name: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4', apiKey: 'key1' })
    expect(svc.buildClient(p.id)).toBeTruthy()
  })

  it('updates in place when id is provided and keeps the key unless replaced', async () => {
    const p = svc.save({ name: 'A', baseUrl: 'https://a/v1', model: 'm1', apiKey: 'k1' })
    // partial update (no apiKey) keeps key + updates fields
    const updated = svc.save({ id: p.id, name: 'A-renamed', baseUrl: 'https://a/v1', model: 'm2' })
    expect(updated.id).toBe(p.id)
    expect(updated.name).toBe('A-renamed')
    expect(updated.model).toBe('m2')
    expect(svc.list()).toHaveLength(1)

    // key rotation
    svc.save({ id: p.id, name: 'A', baseUrl: 'https://a/v1', model: 'm1', apiKey: 'k2' })
    expect(svc.buildClient(p.id)).toBeTruthy()
  })

  it('removes a profile', () => {
    const a = svc.save({ name: 'A', baseUrl: 'https://a/v1', model: 'm', apiKey: 'k' })
    const b = svc.save({ name: 'B', baseUrl: 'https://b/v1', model: 'm', apiKey: 'k' })
    svc.remove(a.id)
    const ids = svc.list().map((x) => x.id)
    expect(ids).toContain(b.id)
    expect(ids).not.toContain(a.id)
  })
})