import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../db'
import { PrepareService } from '../prepare.service'
import type { AgentAdapter } from '../agent-adapter'

describe('PrepareService', () => {
  let dir: string
  let db: Db
  let svc: PrepareService

  const seed = () => {
    // Add distinct timestamps so ordering is deterministic (ISO sorts by "now").
    const base = Date.now()
    const put = (p: string, name: string, kind: string, minsAgo: number, times = 1) => {
      for (let i = 0; i < times; i++) {
        const iso = new Date(base - (minsAgo + i) * 60000).toISOString()
        db.prepare(`INSERT INTO open_log (opened_at, kind, name, path) VALUES (?, ?, ?, ?)`).run(
          iso, kind, name, p
        )
      }
    }
    put('/apps/code.exe', 'Code.exe', 'apps', 10, 5)
    put('/apps/browser.exe', 'Browser.exe', 'apps', 60, 2)
    put('/docs/report.docx', 'report.docx', 'docs', 30, 3)
    put('/img/shot.png', 'shot.png', 'images', 240, 1)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'workdeck-prepare-'))
    db = openDb(join(dir, 'test.db'))
    seed()
    svc = new PrepareService(db, () => null)
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns a rules-backed list when no LLM is configured', async () => {
    const r = await svc.prepare(5)
    expect(r.source).toBe('rules')
    expect(r.items.length).toBe(4)
    // Most-frequent + recent bubble to the top.
    expect(r.items[0].name).toBe('Code.exe')
    expect(r.items.some((i) => i.name === 'report.docx')).toBe(true)
    expect(r.note.length).toBeGreaterThan(0)
  })

  it('respects the limit', async () => {
    const r = await svc.prepare(2)
    expect(r.items.length).toBe(2)
  })

  it('returns an empty, guiding result when there is no history', async () => {
    db.prepare(`DELETE FROM open_log`).run()
    const r = await svc.prepare()
    expect(r.items).toEqual([])
    expect(r.source).toBe('rules')
    expect(r.note).toContain('打开记录')
  })

  it('uses the LLM order + note when a provider responds', async () => {
    const llm: AgentAdapter = {
      kind: 'llm',
      id: 'fake',
      parseIntent: async () => null,
      summarize: async () => '',
      chat: async () => JSON.stringify({ note: '先处理文档', order: ['report.docx', 'Code.exe'] })
    }
    svc = new PrepareService(db, () => llm)
    const r = await svc.prepare(5)
    expect(r.source).toBe('llm')
    expect(r.note).toBe('先处理文档')
    expect(r.items[0].name).toBe('report.docx')
  })

  it('falls back to the heuristic when the LLM reply is unparseable', async () => {
    const llm: AgentAdapter = {
      kind: 'llm',
      id: 'fake',
      parseIntent: async () => null,
      summarize: async () => '',
      chat: async () => '抱歉，无法解析'
    }
    svc = new PrepareService(db, () => llm)
    const r = await svc.prepare(5)
    expect(r.source).toBe('rules')
    expect(r.items[0].name).toBe('Code.exe')
  })

  it('falls back when the LLM throws', async () => {
    const llm: AgentAdapter = {
      kind: 'llm',
      id: 'fake',
      parseIntent: async () => null,
      summarize: async () => '',
      chat: async () => { throw new Error('net') }
    }
    svc = new PrepareService(db, () => llm)
    const r = await svc.prepare(5)
    expect(r.source).toBe('rules')
    expect(r.items[0].name).toBe('Code.exe')
  })
})