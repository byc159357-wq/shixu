/**
 * AI intent parsing — Phase 8 MVP.
 *
 * Local-first constraint: no network, no API keys. A rules-based Chinese
 * intent parser turns natural-language commands into structured actions.
 * The provider abstraction leaves room for an LLM backend later without
 * changing the Suggest→Confirm flow.
 *
 * Write actions NEVER execute directly: the renderer always shows a preview
 * (ConfirmModal) and the user confirms before any IPC write call.
 */

export type AiAction =
  | 'create_task'
  | 'create_event'
  | 'create_note'
  | 'move_file'
  | 'summarize'
  | 'search'
  | 'open_scenario'

export interface AiIntent {
  action: AiAction
  params: Record<string, string | null>
  confidence: number // 0..1
  explanation: string
}

export interface AiParseResult {
  intent: AiIntent | null
  matches: AiIntent[] // all candidates, best first
}

const DAY_ALIASES: Record<string, number> = {
  今天: 0,
  今日: 0,
  明天: 1,
  明日: 1,
  后天: 2,
  大后天: 3
}

const WEEKDAY_ALIASES: Record<string, number> = {
  周一: 1,
  星期二: 2,
  周二: 2,
  周三: 3,
  星期四: 4,
  周四: 4,
  周五: 5,
  星期五: 5,
  周六: 6,
  星期六: 6,
  周日: 0,
  周日天: 0,
  星期天: 0
}

function parseDate(text: string): string | null {
  // explicit date YYYY-MM-DD / YYYY/MM/DD
  const explicit = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (explicit) {
    return `${explicit[1]}-${explicit[2].padStart(2, '0')}-${explicit[3].padStart(2, '0')}`
  }
  // relative: 今天/明天/后天/大后天
  for (const [alias, days] of Object.entries(DAY_ALIASES)) {
    if (text.includes(alias)) return dateDaysFromNow(days)
  }
  // weekday: 周X → next occurrence
  for (const [alias, target] of Object.entries(WEEKDAY_ALIASES)) {
    if (text.includes(alias)) {
      const now = new Date()
      const current = (now.getDay() + 6) % 7 // Monday=0
      let delta = (target - current + 7) % 7
      if (delta === 0) delta = 7 // next week, not today
      return dateDaysFromNow(delta)
    }
  }
  return null
}

function dateDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function stripDateWords(text: string): string {
  return text
    .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g, ' ')
    .replace(/(大后天|后天|明天|明天早上|明天下午|今天|今日|明日|周[一二三四五六日天]|星期[一二三四五六日天])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Rules-based Chinese intent parser. Pure function, fully unit-testable. */
export function parseIntent(text: string): AiParseResult {
  const t = text.trim()
  const candidates: AiIntent[] = []
  const push = (i: AiIntent) => candidates.push(i)

  if (!t) return { intent: null, matches: [] }

  // ---------- move_file: 移动 <file> 到/去 <project> ----------
  if (t.includes('移动') || t.includes('移入') || t.includes('移动到')) {
    const m2 = t.match(/移动\s*(.+?)\s*(?:到|去|进)\s*(.+)$/)
    if (m2) {
      push({
        action: 'move_file',
        params: { fileName: m2[1].trim(), projectName: m2[2].trim() },
        confidence: 0.9,
        explanation: `把文件「${m2[1].trim()}」移动到项目「${m2[2].trim()}」`
      })
    }
  }

  // ---------- create_note: 新建/记笔记 ----------
  if (/^(新建|创建|写|记)\s*(一个)?笔记/.test(t) || t.includes('记一下')) {
    const title = stripDateWords(t.replace(/^(新建|创建|写|记)\s*(一个)?笔记\s*/g, ''))
    push({
      action: 'create_note',
      params: { title: title || '未命名笔记' },
      confidence: 0.95,
      explanation: `新建笔记「${title || '未命名笔记'}」`
    })
  }

  // ---------- create_event: 事件/日程 ----------
  if (/^(新建|创建|加|安排)\s*(一个)?(事件|日程|会议|提醒)/.test(t) || /(事件|会议|日程)(：|:)/.test(t)) {
    const body = t.replace(/^(新建|创建|加|安排)\s*(一个)?(事件|日程|会议|提醒)\s*/g, '')
    const date = parseDate(t)
    const title = stripDateWords(body.replace(/(事件|会议|日程)(：|:)\s*/, '')) || '未命名事件'
    push({
      action: 'create_event',
      params: { title, date },
      confidence: 0.9,
      explanation: `新建事件「${title}」${date ? `（${date}）` : ''}`
    })
  }

  // ---------- create_task: 任务/待办 ----------
  if (/(新建|创建|加|记)?\s*(任务|待办|todo)/i.test(t) || /^(新建|创建)\s*(一个)?任务/.test(t)) {
    const body = t.replace(/(新建|创建|加|记)\s*(一个)?(任务|待办)/g, '')
    const date = parseDate(t)
    const title = stripDateWords(body) || '未命名任务'
    push({
      action: 'create_task',
      params: { title, date },
      confidence: 0.92,
      explanation: `创建任务「${title}」${date ? `（截止 ${date}）` : ''}`
    })
  }

  // ---------- natural-language task fallback: 明天交报告 / 周五前写完方案 ----------
  if (candidates.length === 0 && (/(今天|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天])/.test(t))) {
    const date = parseDate(t)
    const verbMatch = t.match(/(完成|交|写|做|改|看|整理|发布|提交|准备)\s*(.+)$/)
    if (verbMatch) {
      const title = stripDateWords(t)
      push({
        action: 'create_task',
        params: { title, date },
        confidence: 0.7,
        explanation: `创建任务「${title}」${date ? `（截止 ${date}）` : ''}`
      })
    }
  }

  // ---------- summarize: 总结/摘要 [项目] ----------
  const sum = t.match(/^(总结|摘要|概括|汇总)\s*(.+?)$/)
  if (sum) {
    push({
      action: 'summarize',
      params: { target: sum[2]?.trim() ?? null },
      confidence: 0.9,
      explanation: `总结${sum[2] ? `「${sum[2].trim()}」` : '当前上下文'}`
    })
  }

  // ---------- open_scenario: 做个/开始做/继续做 <场景> ----------
  // Intent signal only — the renderer resolves the name against saved scenario
  // presets (fuzzy match) and opens the whole batch after a preview.
  if (
    candidates.length === 0 &&
    /(做一个|做个|制作|来做|去做|开始做|继续做|接着做|开做|打开场景|开始场景|来个|来一个)/.test(t)
  ) {
    const m = t.match(
      /(?:做一个|做个|制作|来做|去做|开始做|继续做|接着做|开做|打开场景|开始场景|来个|来一个)(.+)/i
    )
    const name = stripDateWords((m?.[1] ?? t).trim()) || t
    push({
      action: 'open_scenario',
      params: { scenario: name },
      confidence: 0.7,
      explanation: `开启场景「${name}」`
    })
  }

  // ---------- search fallback ----------
  if (candidates.length === 0) {
    push({
      action: 'search',
      params: { query: t },
      confidence: 0.5,
      explanation: `搜索「${t}」`
    })
  }

  candidates.sort((a, b) => b.confidence - a.confidence)
  return { intent: candidates[0], matches: candidates }
}
