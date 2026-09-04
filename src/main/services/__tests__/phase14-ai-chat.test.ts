import { describe, it, expect } from 'vitest'
import {
  buildChatSystem,
  buildChatMessages,
  LLM_REQUIRED_HINT,
  type ChatMsg
} from '../ai-chat'

describe('buildChatSystem', () => {
  it('embeds project context and document title', () => {
    const sys = buildChatSystem('项目：Brand\n任务：进行中 5', '复盘笔记')
    expect(sys).toContain('项目：\n项目：Brand')
    expect(sys).toContain('当前文档：复盘笔记')
    expect(sys).toContain('写操作都必须由用户确认')
  })

  it('handles empty context', () => {
    const sys = buildChatSystem(null, null)
    expect(sys).toContain('未选择项目或文档')
  })
})

describe('buildChatMessages', () => {
  it('prepends system and appends the user message', () => {
    const history: ChatMsg[] = [{ role: 'user', content: 'hi' }]
    const msgs = buildChatMessages('sys', history, '帮我总结')
    expect(msgs[0]).toEqual({ role: 'system', content: 'sys' })
    expect(msgs[1]).toEqual({ role: 'user', content: 'hi' })
    expect(msgs[2]).toEqual({ role: 'user', content: '帮我总结' })
  })

  it('trims history to the last 8 turns', () => {
    const history: ChatMsg[] = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as ChatMsg['role'],
      content: `m${i}`
    }))
    const msgs = buildChatMessages('sys', history, 'q')
    // system + 8 history + 1 current = 10
    expect(msgs).toHaveLength(10)
    expect(msgs[1].content).toBe('m4')
    expect(msgs[8].content).toBe('m11')
  })

  it('works with empty history', () => {
    const msgs = buildChatMessages('sys', [], 'first')
    expect(msgs).toHaveLength(2)
  })
})

describe('LLM_REQUIRED_HINT', () => {
  it('guides the user to settings', () => {
    expect(LLM_REQUIRED_HINT).toContain('设置')
    expect(LLM_REQUIRED_HINT).toContain('意图解析')
  })
})
