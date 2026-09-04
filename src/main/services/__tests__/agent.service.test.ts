import { describe, it, expect } from 'vitest'
import { AgentService } from '../agent.service'
import { RuleAgent, type AgentAdapter } from '../agent-adapter'

const CTX = {
  name: 'Alpha',
  status: 'active',
  openTasks: 3,
  overdueTasks: 1,
  doneTasks: 2,
  notes: 2,
  files: 5,
  dueSoon: ['方案']
}

function fakeLlm(opts: {
  parse?: (text: string) => Promise<unknown> | unknown
  summarize?: () => unknown
  chat?: () => unknown
} = {}): AgentAdapter {
  return {
    kind: 'llm',
    id: 'fake',
    parseIntent: async (text) => opts.parse!.call(null, text) as never,
    summarize: async () => opts.summarize!.call(null) as never,
    chat: async () => opts.chat!.call(null) as never
  }
}

describe('AgentService', () => {
  it('falls back to local rules when no LLM is configured', async () => {
    const svc = new AgentService(() => null)
    const r = await svc.parseIntent('明天交报告')
    expect(r.source).toBe('rules')
    expect(r.intent?.action).toBe('create_task')

    const s = await svc.summarize(CTX)
    expect(s.source).toBe('rules')
    expect(s.text).toContain('「Alpha」概览')
  })

  it('uses the LLM adapter when configured and it responds', async () => {
    const llm = fakeLlm({
      parse: () => ({ action: 'create_task', params: { title: 'x' }, confidence: 0.9, explanation: 'e' })
    })
    const svc = new AgentService(() => llm)
    const r = await svc.parseIntent('创建任务 上午开会')
    expect(r.source).toBe('llm')
    expect(r.intent?.action).toBe('create_task')
  })

  it('drops back to rules when the LLM throws (parse + summarize)', async () => {
    const llm = fakeLlm({ parse: () => { throw new Error('net down') }, summarize: () => { throw new Error('net down') } })
    const svc = new AgentService(() => llm)

    const parseRes = await svc.parseIntent('明天交报告')
    expect(parseRes.source).toBe('rules')
    expect(parseRes.intent?.action).toBe('create_task')

    const sumRes = await svc.summarize(CTX)
    expect(sumRes.source).toBe('rules')
    expect(sumRes.text).toContain('「Alpha」概览')
  })

  it('keeps the local RuleAgent working even when getLlm throws', async () => {
    const svc = new AgentService(() => { throw new Error('boom') })
    const r = await svc.parseIntent('新建笔记 灵感')
    expect(r.source).toBe('rules')
    expect(r.intent?.action).toBe('create_note')
  })

  it('chat returns the offline hint when no LLM is configured', async () => {
    const svc = new AgentService(() => null)
    const r = await svc.chat([{ role: 'user', content: 'hi' }])
    expect(r.source).toBe('rules')
    expect(r.text.length).toBeGreaterThan(0)
  })

  it('chat passes through the LLM reply when configured', async () => {
    const llm = fakeLlm({ chat: () => '你好，我可以帮忙' })
    const svc = new AgentService(() => llm)
    const r = await svc.chat([{ role: 'user', content: 'hello' }])
    expect(r.source).toBe('llm')
    expect(r.text).toContain('你好')
  })

  it('drops back to an error hint when chat fails', async () => {
    const llm = fakeLlm({ chat: () => { throw new Error('401') } })
    const svc = new AgentService(() => llm)
    const r = await svc.chat([{ role: 'user', content: 'hello' }])
    expect(r.source).toBe('rules')
    expect(r.text).toContain('对话请求失败')
  })
})

describe('RuleAgent', () => {
  it('implements the full adapter contract', async () => {
    const a = new RuleAgent()
    expect(a.kind).toBe('rules')
    expect(a.id).toBe('rules')
    expect((await a.parseIntent('创建任务 整理周报'))?.action).toBe('create_task')
    expect(await a.summarize(CTX)).toContain('「Alpha」概览')
  })
})