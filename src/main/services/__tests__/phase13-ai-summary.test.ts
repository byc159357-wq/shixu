import { describe, it, expect } from 'vitest'
import { buildLocalSummary, buildPromptContext, type ProjectContextInput } from '../ai-summary'

const base: ProjectContextInput = {
  name: 'Brand',
  status: 'active',
  openTasks: 5,
  overdueTasks: 2,
  doneTasks: 10,
  notes: 3,
  files: 7,
  dueSoon: ['发布主视觉', '整理素材']
}

describe('buildLocalSummary (rules fallback)', () => {
  it('includes stats and overdue warning', () => {
    const s = buildLocalSummary(base)
    expect(s).toContain('Brand')
    expect(s).toContain('5 个进行中任务')
    expect(s).toContain('2 个逾期')
    expect(s).toContain('3 篇笔记')
    expect(s).toContain('7 个文件引用')
    expect(s).toContain('已完成 10')
  })

  it('mentions due-soon tasks', () => {
    expect(buildLocalSummary(base)).toContain('发布主视觉、整理素材')
  })

  it('handles zero overdue gracefully', () => {
    const s = buildLocalSummary({ ...base, overdueTasks: 0, dueSoon: [] })
    expect(s).toContain('无逾期')
    expect(s).not.toContain('近期截止')
  })
})

describe('buildPromptContext (LLM input)', () => {
  it('produces one structured fact per line', () => {
    const c = buildPromptContext(base)
    expect(c).toContain('项目：Brand（状态：active）')
    expect(c).toContain('任务：进行中 5，逾期 2，已完成 10')
    expect(c).toContain('3 天内截止：发布主视觉、整理素材')
    expect(c).toContain('笔记：3 篇')
    expect(c).toContain('文件引用：7 个')
  })

  it('omits the due-soon line when empty', () => {
    const c = buildPromptContext({ ...base, dueSoon: [] })
    expect(c).toContain('3 天内无截止任务')
    expect(c).not.toContain('3 天内截止：')
  })
})
