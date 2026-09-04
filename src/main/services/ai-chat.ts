/**
 * Multi-turn chat: context assembly + history management for the AI panel.
 * Pure functions → unit-testable; the main process feeds current project /
 * document context so the LLM answers grounded in local facts.
 */

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

/** System prompt grounding the assistant in the two-level local context. */
export function buildChatSystem(projectCtx: string | null, noteTitle: string | null): string {
  const ctxParts = []
  if (projectCtx) ctxParts.push(`项目：\n${projectCtx}`)
  if (noteTitle) ctxParts.push(`当前文档：${noteTitle}`)
  const ctx = ctxParts.length > 0 ? ctxParts.join('\n') : '未选择项目或文档'
  return (
    '你是拾序（Windows 本地优先个人工作台）的 AI 助手。只基于下方提供的本地上下文回答，用中文、简洁（通常 3-6 句）。' +
    '你可以建议创建任务/事件/笔记等操作，但绝不要声称已执行——拾序的所有写操作都必须由用户确认。' +
    '如果问题超出上下文范围，如实说明你只能看到当前项目的任务/文件/笔记概况。\n\n' +
    `当前上下文：\n${ctx}`
  )
}

/** Assemble the request: system + trimmed history + current user message. */
export function buildChatMessages(
  system: string,
  history: ChatMsg[],
  userText: string
): Array<{ role: string; content: string }> {
  const trimmed = history.slice(-8)
  return [
    { role: 'system', content: system },
    ...trimmed,
    { role: 'user', content: userText }
  ]
}

/** Local guidance when no LLM is configured (keeps the panel useful offline). */
export const LLM_REQUIRED_HINT =
  '尚未配置 LLM 引擎。到 设置 → AI 智能解析 填入 Base URL / API Key 后即可对话；' +
  '也可以继续使用下方的「意图解析」执行本地动作（规则引擎，离线可用）。'
