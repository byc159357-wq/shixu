import { describe, it, expect } from 'vitest'
import { extractText } from '../hermes-acp.service'

/** Hermes / 各家 Agent 可能返回的形态，都要能被可靠提取成纯文本。 */
describe('extractText (prompt completion parsing)', () => {
  it('collects structured text blocks inside messages', () => {
    const res = {
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] }
      ]
    }
    expect(extractText(res)).toBe('第一段第二段')
  })

  it('collects multiple assistant messages joined by newline', () => {
    const res = {
      messages: [
        { role: 'assistant', content: '甲' },
        { role: 'assistant', content: '乙' }
      ]
    }
    expect(extractText(res)).toBe('甲\n乙')
  })

  it('handles plain-string content', () => {
    expect(extractText({ content: '你好，世界' })).toBe('你好，世界')
    expect(extractText({ messages: [{ content: '直接字符串' }] })).toBe('直接字符串')
  })

  it('handles nested array content and raw text field', () => {
    expect(extractText({ content: [['a'], { text: 'b' }, 'c'] })).toBe('abc')
    expect(extractText({ text: 'raw text' })).toBe('raw text')
  })

  it('falls back to message / output string fields', () => {
    expect(extractText({ message: '晚备文' })).toBe('晚备文')
    expect(extractText({ output: '落点' })).toBe('落点')
  })

  it('returns empty string for null / no text', () => {
    expect(extractText(null)).toBe('')
    expect(extractText({ messages: [{ content: [] }] })).toBe('')
    expect(extractText({})).toBe('')
  })
})