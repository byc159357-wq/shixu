/**
 * Project summary: structured context assembly + local-statistics fallback.
 * The renderer may call this with AI off (rules mode) or the main process may
 * feed the same context to an LLM (llm mode). Pure functions → unit-testable.
 */

export interface ProjectContextInput {
  name: string
  status: string
  openTasks: number
  overdueTasks: number
  doneTasks: number
  notes: number
  files: number
  dueSoon: string[] // titles of tasks due within 3 days
}

/** Human-readable fallback summary (no LLM configured). */
export function buildLocalSummary(ctx: ProjectContextInput): string {
  const overduePart = ctx.overdueTasks > 0 ? `其中 ${ctx.overdueTasks} 个逾期` : '无逾期'
  const dueSoonPart =
    ctx.dueSoon.length > 0 ? `；近期截止：${ctx.dueSoon.slice(0, 3).join('、')}` : ''
  return (
    `「${ctx.name}」概览（${ctx.status}）：${ctx.openTasks} 个进行中任务（${overduePart}${dueSoonPart}），` +
    `${ctx.notes} 篇笔记，${ctx.files} 个文件引用，已完成 ${ctx.doneTasks} 个任务。`
  )
}

/** Structured fact blob for the LLM summarizer. */
export function buildPromptContext(ctx: ProjectContextInput): string {
  return [
    `项目：${ctx.name}（状态：${ctx.status}）`,
    `任务：进行中 ${ctx.openTasks}，逾期 ${ctx.overdueTasks}，已完成 ${ctx.doneTasks}`,
    ctx.dueSoon.length > 0 ? `3 天内截止：${ctx.dueSoon.join('、')}` : '3 天内无截止任务',
    `笔记：${ctx.notes} 篇`,
    `文件引用：${ctx.files} 个`
  ].join('\n')
}
