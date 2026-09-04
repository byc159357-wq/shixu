import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import {
  Plus, MagnifyingGlass, PushPin, ChatDots, CircleNotch,
  PaperPlaneTilt, X, CheckCircle, Wrench, ArrowRight, ChatCircleDots,
  Package, Clock, Gear, Play, GitBranch, Globe, Files, Stop, Copy, Trash, ShieldCheck,
  Code, FileText, Image, VideoCamera, ChartLine, Cloud, PencilRuler, Browser,
  PenNib, PresentationChart, Table, Money, Newspaper, HardDrives, CaretRight,
  ArrowClockwise, FolderSimple
} from '@phosphor-icons/react'
import type { HermesStreamEvent, AgentProviderInfo } from '../../../shared/types'
import { Select, type SelectOption } from '../components/ui'
import { useAppStore } from '../store'

const SESSION_KEY = 'wd_agent_sessions_v1'
const MODEL_KEY = 'wd_agent_model'
const TOOL_KEY = 'wd_agent_tool'
const RELOAD_HINT = '未检测到 Hermes，请确认已安装本地 Agent.'

/** 兜底模型清单：未连上所选 AI 软件/离线时用，避免下拉为空。真正可选
 *  模型以主进程 agent.modelList() 返回的实时清单为准并覆盖之。 */
const FALLBACK_MODELS: SelectOption[] = [
  { value: 'longcat-2.0-free', label: 'Longcat 2.0 Free' },
  { value: 'longcat-2.0-ultra', label: 'Longcat 2.0 Ultra' },
  { value: 'default', label: '默认模型' }
]

/** 可接入的外部 AI 软件。真正的清单由主进程 agent.listProviders 提供；
 *  这里仅作兜底（未拿到后端前/离线时），避免切换器空白。 */
const FALLBACK_TOOLS: AgentProviderInfo[] = [
  { id: 'hermes', name: 'Hermes', kind: 'external', detail: '本地自主 Agent · 多步执行 / 工具调用 / 权限确认', available: true },
  { id: 'trae', name: 'Trae', kind: 'pending', detail: 'AI 编程 / UI 生成', available: false, note: '待接入' },
  { id: 'workbuddy', name: 'WorkBuddy', kind: 'pending', detail: 'AI 助手', available: false, note: '待接入' }
]
const toolName = (id: string, list: AgentProviderInfo[]) =>
  (list.find((t) => t.id === id) ?? FALLBACK_TOOLS.find((t) => t.id === id))?.name ?? 'Hermes'

type SkillCategory = 'all' | 'dev' | 'design' | 'content' | 'data' | 'media' | 'deploy'

interface SkillItem {
  id: string
  icon: ReactNode
  name: string
  desc: string
  prompt: string
  category: Exclude<SkillCategory, 'all'>
}

const SKILL_CATS: { id: SkillCategory; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'dev', label: '开发' },
  { id: 'design', label: '设计' },
  { id: 'content', label: '文档' },
  { id: 'data', label: '数据' },
  { id: 'media', label: '媒体' },
  { id: 'deploy', label: '部署' }
]

/** 本地技能项：与当前 Agent 可用能力对齐，点按即把目标发到问答框。 */
const SKILLS: SkillItem[] = [
  // 开发
  { id: 'multi-edit', icon: <Files size={14} />, name: '多文件编辑', desc: '同时修改项目中的多个文件', prompt: '请对当前项目做多文件编辑：', category: 'dev' },
  { id: 'run-tests', icon: <Play size={14} />, name: '测试运行', desc: '在项目内运行测试并汇总结果', prompt: '请在当前项目运行测试：', category: 'dev' },
  { id: 'git-ops', icon: <GitBranch size={14} />, name: 'Git 操作', desc: '执行提交、分支、日志等 Git 命令', prompt: '请在当前项目执行 Git 操作：', category: 'dev' },
  { id: 'code-review', icon: <Code size={14} />, name: '代码审查', desc: '审查代码并给出改进建议', prompt: '请审查以下代码并给出改进建议：', category: 'dev' },
  { id: 'refactor', icon: <HardDrives size={14} />, name: '重构代码', desc: '安全重构并保留原有行为', prompt: '请对当前代码进行安全重构：', category: 'dev' },
  // 设计
  { id: 'frontend-dev', icon: <Browser size={14} />, name: '前端开发', desc: '生成或修改前端页面与组件', prompt: '请帮我开发这个前端需求：', category: 'design' },
  { id: 'ui-design', icon: <PencilRuler size={14} />, name: 'UI/UX 设计', desc: '按主题与规范设计界面', prompt: '请为以下需求设计 UI/UX 方案：', category: 'design' },
  { id: 'redesign', icon: <PenNib size={14} />, name: '网页重设计', desc: '提升现有界面的设计感与转化率', prompt: '请对以下网页/应用进行重设计：', category: 'design' },
  { id: 'brandkit', icon: <Image size={14} />, name: '品牌视觉', desc: '生成品牌指南与视觉系统', prompt: '请为这个品牌生成视觉识别系统：', category: 'design' },
  // 文档
  { id: 'web-fetch', icon: <Globe size={14} />, name: 'Web 抓取', desc: '抓取网页并提炼要点', prompt: '请抓取并总结这个网页的内容：', category: 'content' },
  { id: 'gzh-typeset', icon: <Newspaper size={14} />, name: '公众号排版', desc: '把 Markdown 转成公众号 HTML', prompt: '请将以下内容排版为微信公众号文章 HTML：', category: 'content' },
  { id: 'doc-convert', icon: <FileText size={14} />, name: '文档转换', desc: 'HTML / Word / Markdown 互转', prompt: '请帮我转换/生成这份文档：', category: 'content' },
  { id: 'pptx-create', icon: <PresentationChart size={14} />, name: 'PPT 生成', desc: '根据大纲生成专业演示文稿', prompt: '请根据以下大纲生成 PPT：', category: 'content' },
  { id: 'sheet-handle', icon: <Table size={14} />, name: '表格处理', desc: '分析、清洗与整理 Excel/CSV', prompt: '请帮我处理这个表格：', category: 'content' },
  { id: 'humanize', icon: <ChatDots size={14} />, name: '文本人性化', desc: '去除 AI 味，让文本更自然', prompt: '请把以下文本改得更自然、更像人写的：', category: 'content' },
  // 数据
  { id: 'finance-search', icon: <Money size={14} />, name: '金融数据搜索', desc: '查询股票、基金、宏观等数据', prompt: '请查询以下金融数据：', category: 'data' },
  { id: 'stock-analysis', icon: <ChartLine size={14} />, name: '股票分析', desc: '行情、财报与估值分析', prompt: '请分析以下股票/板块：', category: 'data' },
  // 媒体
  { id: 'image-gen', icon: <Image size={14} />, name: '图像生成', desc: '为前端/设计生成参考图', prompt: '请生成一张符合以下描述的图像：', category: 'media' },
  { id: 'image-to-code', icon: <Code size={14} />, name: '图片转代码', desc: '根据设计稿生成前端代码', prompt: '请根据这张设计图生成前端代码：', category: 'media' },
  { id: 'media-fx', icon: <VideoCamera size={14} />, name: '3D/视频特效', desc: '生成 3D 模型或应用视频模板', prompt: '请帮我生成这个 3D 模型/视频特效：', category: 'media' },
  // 部署
  { id: 'cloud-deploy', icon: <Cloud size={14} />, name: 'CloudStudio 部署', desc: '部署静态站点到云端', prompt: '请帮我部署这个静态站点：', category: 'deploy' },
  { id: 'github-ops', icon: <GitBranch size={14} />, name: 'GitHub 操作', desc: 'PR、Issue、仓库管理', prompt: '请帮我处理这个 GitHub 操作：', category: 'deploy' }
]

type StepTag = 'tool' | 'text' | 'error' | 'permission'
interface Step {
  id: string
  tag: StepTag
  text: string
  requestId?: string
}
interface Msg {
  id: string
  role: 'user' | 'agent'
  text?: string
  status?: string
  steps?: Step[]
  ts: number
}
interface Session {
  id: string
  title: string
  kind?: SessionKind
  pinned?: boolean
  msgs: Msg[]
  ts: number
}

type SessionKind = 'project' | 'chat'

let uid = 0
const nid = () => `m${Date.now().toString(36)}_${++uid}`
const snid = () => `s${Date.now().toString(36)}_${++uid}`

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const arr = raw ? (JSON.parse(raw) as Session[]) : []
    return Array.isArray(arr)
      ? arr.map((s) => ({ ...s, kind: s.kind ?? inferSessionKind(s.msgs?.[0]?.text ?? s.title) }))
      : []
  } catch {
    return []
  }
}
function saveSessions(list: Session[]) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(list))
  } catch {
    /* ignore quota errors */
  }
}
function loadModel(): string {
  try {
    // Keep whatever was stored — real model ids come from the connected
    // software (e.g. "nous:meituan/longcat-2.0:free") and must survive reloads;
    // the roster effect re-aligns if the id no longer exists.
    return localStorage.getItem(MODEL_KEY) || FALLBACK_MODELS[0].value
  } catch {
    return FALLBACK_MODELS[0].value
  }
}
function loadTool(): string {
  try {
    const v = localStorage.getItem(TOOL_KEY)
    // Keep whatever was selected (built-in ids or user-registered agent-* ids).
    return v && v !== 'undefined' ? v : 'hermes'
  } catch {
    return 'hermes'
  }
}
function saveTool(v: string) {
  try {
    localStorage.setItem(TOOL_KEY, v)
  } catch {
    /* ignore quota errors */
  }
}

function sessionTitle(first: string): string {
  const t = first.trim()
  return t.length > 22 ? t.slice(0, 22) + '…' : t
}
function inferSessionKind(text: string): SessionKind {
  const value = text.trim().toLowerCase()
  if (!value) return 'chat'
  const looksLikePath = /(?:[a-z]:\\|\/(?:src|app|packages?|components?|public|tests?)\/|\.(?:tsx?|jsx?|vue|py|java|go|rs|json|ya?ml|md)\b)/i.test(value)
  const projectIntent = /项目|代码|仓库|文件|目录|组件|页面|界面|ui|ux|前端|后端|接口|数据库|脚本|测试|构建|部署|重构|修复|优化|实现|开发|设计稿|git|github|commit|pull request|package\.json/i.test(value)
  return looksLikePath || projectIntent ? 'project' : 'chat'
}
function messageContent(msg: Msg): string {
  return (
    msg.steps?.filter((s) => s.tag === 'text').map((s) => s.text).join('\n').trim() ||
    (msg.text === '（Hermes 未返回文本）' ? '' : msg.text?.trim()) ||
    ''
  )
}
const modelLabel = (id: string, opts: SelectOption[]) => {
  const m = opts.find((o) => o.value === id)
  return (m?.shortLabel ?? m?.label) ?? id
}

export function AIPage() {
  const setModule = useAppStore((s) => s.setModule)

  const [sessions, setSessions] = useState<Session[]>(loadSessions)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [hermesOk, setHermesOk] = useState<boolean | null>(null)
  const [hermesReason, setHermesReason] = useState<string | null>(null)
  const [reauthMode, setReauthMode] = useState(false)
  const [reauthMsg, setReauthMsg] = useState<string | null>(null)
  const [reauthFeedback, setReauthFeedback] = useState<string | null>(null)
  const [tab, setTab] = useState<'sessions' | 'skills'>('sessions')
  const [modelId, setModelId] = useState<string>(loadModel)
  const [modelOptions, setModelOptions] = useState<SelectOption[]>(FALLBACK_MODELS)
  const [toolId, setToolId] = useState<string>(loadTool)
  const [tools, setTools] = useState<AgentProviderInfo[]>(FALLBACK_TOOLS)
  const [dragId, setDragId] = useState<string | null>(null)
  const [busyRunId, setBusyRunId] = useState<string | null>(null)

  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId
  // Always-current view of sessions so async handlers never read a stale closure.
  const sessionsRef = useRef<Session[]>(sessions)
  sessionsRef.current = sessions
  const runIdRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const stoppedRef = useRef(false)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const newSessionKindRef = useRef<SessionKind | null>(null)

  // Start a fresh (or prefilled) session and focus the composer.
  const startNew = useCallback((t = '', kind?: SessionKind) => {
    newSessionKindRef.current = kind ?? (t.trim() ? inferSessionKind(t) : null)
    setActiveId(null)
    setInput(t)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // commit: mutate sessions via a functional updater and persist atomically.
  const commit = useCallback((fn: (prev: Session[]) => Session[]) => {
    setSessions((prev) => {
      const next = fn(prev)
      saveSessions(next)
      return next
    })
  }, [])

  const mutateActive = useCallback(
    (fn: (s: Session) => Session) => {
      commit((prev) => prev.map((s) => (s.id === activeIdRef.current ? fn(s) : s)))
    },
    [commit]
  )
  const mutateRun = useCallback(
    (runId: string, fn: (m: Msg) => Msg) => {
      // A streamed run belongs to the session where it started. Do not route
      // through the currently open session: the user may switch threads while
      // the provider is still producing events.
      commit((prev) => prev.map((s) => ({
        ...s,
        msgs: s.msgs.map((m) => (m.id === runId ? fn(m) : m))
      })))
    },
    [commit]
  )

  // Open the Hermes desktop app so the user can refresh expired credentials.
  const handleOpenLogin = useCallback(async () => {
    try {
      const r = await window.workdeck?.hermes?.openLogin()
      if (r) setReauthFeedback((r.ok ? '✓ ' : '✗ ') + r.message)
    } catch (e) {
      setReauthFeedback('打开失败：' + String((e as Error)?.message ?? e))
    }
  }, [])

  // Hermes availability + streaming bridge.
  useEffect(() => {
    let alive = true
    const agent = window.workdeck?.agent
    const hermes = window.workdeck?.hermes
    if (!agent) {
      setHermesOk(false)
      setReauthMode(true)
      return () => { alive = false }
    }
    ;(async () => {
      try {
        const r = await hermes?.check?.()
        if (alive) {
          setHermesOk(r?.available ?? true)
          setHermesReason(r?.available ? null : (r?.message ?? '本地 Agent 不可用'))
          if (!r?.available) setReauthMode(true)
        }
      } catch (err) {
        if (alive) {
          setHermesOk(false)
          setHermesReason(String((err as Error)?.message ?? err))
          setReauthMode(true)
        }
      }
    })()
    const off = (agent?.onEvent ?? hermes?.onEvent)?.((ev: HermesStreamEvent) => {
      if (!alive) return
      const runId = runIdRef.current
      if (!runId) return
      mutateRun(runId, (m) => {
        const steps = [...(m.steps ?? [])]
        let status: string | undefined = m.status
        switch (ev.type) {
          case 'status':
            status = ev.status
            break
          case 'tool_call':
            steps.push({ id: nid(), tag: 'tool', text: `正在调用 ${ev.name}…` })
            break
          case 'tool_result':
            steps.push({ id: nid(), tag: 'tool', text: `完成 ${ev.name}` })
            break
          case 'permission':
            steps.push({ id: nid(), tag: 'permission', text: ev.message, requestId: ev.requestId })
            break
          case 'text':
            if (ev.text) {
              const last = steps[steps.length - 1]
              if (last?.tag === 'text') {
                steps[steps.length - 1] = { ...last, text: last.text + ev.text }
              } else {
                steps.push({ id: nid(), tag: 'text', text: ev.text })
              }
            }
            break
          case 'error':
            status = '出错了'
            steps.push({ id: nid(), tag: 'error', text: ev.message })
            break
          case 'done':
            status = '完成'
            if (ev.finalText?.trim() && !steps.some((s) => s.tag === 'text' && s.text.trim())) {
              steps.push({ id: nid(), tag: 'text', text: ev.finalText })
            }
            break
          default:
            break
        }
        return { ...m, status, steps }
      })
    })
    return () => {
      alive = false
      off?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the connectable AI-software roster from the main process.
  useEffect(() => {
    let alive = true
    const list = window.workdeck?.agent?.listProviders
    if (list) {
      list()
        .then((l: AgentProviderInfo[]) => { if (alive && l?.length) setTools(l) })
        .catch(() => { /* keep fallback roster */ })
    }
    return () => { alive = false }
  }, [])

  // Pull the real model roster from the currently selected software (e.g.
  // Hermes ACP) and surface it in the picker, replacing the static fallback.
  useEffect(() => {
    let alive = true
    const ml = window.workdeck?.agent?.modelList
    if (!ml) return () => { alive = false }
    ml({ provider: toolId })
      .then((r: { models?: { id: string; name?: string }[]; currentModelId?: string | null }) => {
        if (!alive) return
        const items: SelectOption[] = (r?.models ?? [])
          .map((m) => {
            const name = m.name || m.id
            // "Nous Portal · anthropic/claude-fable-5" → menu keeps the full
            // name, trigger shows the model part after the separator.
            const sep = name.indexOf(' · ')
            return {
              value: m.id,
              label: name,
              shortLabel: sep > 0 ? name.slice(sep + 3) : name
            }
          })
        if (!items.length) return // keep fallback models
        setModelOptions(items)
        // The selection must always be one of the real options — align it
        // with the software's current model (or the first available one).
        const cur = r?.currentModelId ? String(r.currentModelId) : ''
        setModelId((prev) => {
          if (items.some((o) => o.value === prev)) return prev
          if (cur && items.some((o) => o.value === cur)) return cur
          return items[0].value
        })
      })
      .catch(() => { /* keep fallback models */ })
    return () => { alive = false }
  }, [toolId])

  // Persist the selection whenever it changes (manual pick or roster alignment).
  useEffect(() => {
    try {
      localStorage.setItem(MODEL_KEY, modelId)
    } catch {
      /* ignore */
    }
  }, [modelId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        startNew()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startNew])

  // Auto-scroll the thread to the latest message as it streams in.
  const threadDigest = sessions.find((s) => s.id === activeId)?.msgs.reduce(
    (n, m) => n + (m.text?.length ?? 0) +
      (m.steps?.reduce((total, step) => total + step.text.length, 0) ?? 0),
    0
  ) ?? 0
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [threadDigest, activeId])

  const send = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text || busyRef.current) return

    const agent = window.workdeck?.agent
    if (!agent) {
      setHermesReason('Agent API 未暴露')
      return
    }

    // Decide the target session from the CURRENT state (no stale closure).
    const hasActive =
      !!activeIdRef.current &&
      sessionsRef.current.some((s) => s.id === activeIdRef.current)
    const sid = hasActive ? activeIdRef.current! : snid()
    const sessionKind = hasActive ? undefined : (newSessionKindRef.current ?? inferSessionKind(text))
    const previous = sessionsRef.current.find((s) => s.id === sid)?.msgs ?? []
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = previous
      .map((m) => ({
        role: m.role === 'agent' ? 'assistant' as const : 'user' as const,
        content: messageContent(m)
      }))
      .filter((m) => m.content)
    messages.push({ role: 'user', content: text })

    const userMsg: Msg = { id: nid(), role: 'user', text, ts: Date.now() }
    const runId = nid()
    const agentMsg: Msg = {
      id: runId,
      role: 'agent',
      status: '思考中…',
      steps: [],
      ts: Date.now()
    }

    commit((prev) => {
      const target = prev.find((s) => s.id === sid)
      if (target) {
        return prev.map((s) =>
          s.id === sid
            ? {
                ...s,
                title: s.msgs.length ? s.title : sessionTitle(text),
                ts: Date.now(),
                msgs: [...s.msgs, userMsg, agentMsg]
              }
            : s
        )
      }
      return [
        ...prev,
        { id: sid, title: sessionTitle(text), kind: sessionKind, msgs: [userMsg, agentMsg], ts: Date.now() }
      ]
    })
    if (!hasActive) setActiveId(sid)

    runIdRef.current = runId
    setBusyRunId(runId)
    busyRef.current = true
    stoppedRef.current = false
    setInput('')

    // Hermes free models can queue for a minute or more. Show elapsed time so
    // a healthy but slow request is not mistaken for a dead UI. Sending itself
    // now owns connection validation, avoiding an extra session warm-up.
    const startedAt = Date.now()
    elapsedTimerRef.current = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      mutateRun(runId, (m) => ({
        ...m,
        status: seconds >= 30
          ? `免费模型排队中… 已等待 ${seconds} 秒`
          : `等待模型响应… ${seconds} 秒`
      }))
    }, 5_000)

    try {
      const finalText = await agent.send(text, {
        provider: toolId,
        model: modelId,
        sessionKey: sid,
        messages
      })
      if (stoppedRef.current) return
      // The reply usually arrives earlier through the stream events (text/done).
      // Only write the promise return value if the stream left nothing usable.
      mutateRun(runId, (m) => {
        const hasText = (m.steps ?? []).some((s) => s.tag === 'text' && s.text?.trim()) || m.text?.trim()
        if (hasText || !finalText?.trim()) return { ...m, status: '完成' }
        return { ...m, status: '完成', text: finalText }
      })
    } catch (err) {
      if (stoppedRef.current || !busyRef.current) return
      // Strip Electron's "Error invoking remote method" boilerplate so the
      // bubble shows the actionable message, not the IPC plumbing.
      const clean = String(err).replace(
        /^Error:\s*Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
        ''
      )
      if (/超时|模型后端|凭证|登录|未授权|401|断开|connection/i.test(clean)) {
        setReauthMode(true)
        setReauthMsg(clean)
      }
      mutateRun(runId, (m) => ({
        ...m,
        status: '出错了',
        steps: [...(m.steps ?? []), { id: nid(), tag: 'error', text: clean || String(err) }]
      }))
    } finally {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      elapsedTimerRef.current = null
      busyRef.current = false
      runIdRef.current = null
      setBusyRunId(null)
    }
  }

  const stopRun = async (runId: string | null) => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    elapsedTimerRef.current = null
    stoppedRef.current = true
    busyRef.current = false
    setBusyRunId(null)
    if (runId) mutateRun(runId, (m) => ({ ...m, status: '已停止' }))
    try {
      const agent = window.workdeck?.agent
      if (agent?.stop) await agent.stop({ provider: toolId })
      else await window.workdeck?.hermes?.stop()
    } catch {
      /* ignore */
    }
    runIdRef.current = null
  }

  const removeSession = (id: string) => {
    commit((prev) => prev.filter((s) => s.id !== id))
    if (id === activeId) setActiveId(null)
  }
  const deleteMsg = (msgId: string) => {
    mutateActive((s) => ({ ...s, msgs: s.msgs.filter((m) => m.id !== msgId) }))
  }
  const copyText = async (text?: string) => {
    const t = (text ?? '').trim()
    if (!t) return
    try {
      await navigator.clipboard.writeText(t)
    } catch {
      /* ignore */
    }
  }
  const togglePin = (id: string) => {
    commit((prev) => prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)))
  }
  const moveSession = (id: string, kind: SessionKind) => {
    commit((prev) => prev.map((s) => (s.id === id ? { ...s, kind } : s)))
  }
  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    commit((prev) => {
      const from = prev.findIndex((s) => s.id === dragId)
      const to = prev.findIndex((s) => s.id === targetId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDragId(null)
  }
  const pickModel = (v: string) => setModelId(v)
  const pickTool = (v: string) => {
    setToolId(v)
    saveTool(v)
  }

  const active = sessions.find((s) => s.id === activeId) ?? null
  const q = query.trim().toLowerCase()
  const shown = sessions.filter(
    (s) => !q || s.title.toLowerCase().includes(q) || s.msgs.some((m) => m.text?.toLowerCase().includes(q))
  )
  const orderGroup = (items: Session[]) => [
    ...items.filter((s) => s.pinned),
    ...items.filter((s) => !s.pinned)
  ]
  const projects = orderGroup(shown.filter((s) => (s.kind ?? inferSessionKind(s.title)) === 'project'))
  const chats = orderGroup(shown.filter((s) => (s.kind ?? inferSessionKind(s.title)) === 'chat'))

  const toolOptions: SelectOption[] = tools.map((t) => ({
    value: t.id,
    label: t.kind === 'external' ? t.name : `${t.name} · 待接入`,
    disabled: t.kind !== 'external'
  }))
  const activeTool = tools.find((t) => t.id === toolId) ?? FALLBACK_TOOLS.find((t) => t.id === toolId)
  const activeToolNote = activeTool?.kind === 'external' && !activeTool?.available ? activeTool.note : null
  const selectedReady = toolId === 'hermes' ? hermesOk : (activeTool?.available ?? null)
  const selectedReason = toolId === 'hermes' ? hermesReason : (activeToolNote ?? null)

  return (
    <main className="workspace ai-page">
      <div className="sub">选择模型与技能，开始对话</div>
      <div className="ai-shell">
        {/* ---------- 左：会话 / 技能 ---------- */}
        <aside className="ai-side">
          <div className="ai-side-head">
            <div className="ai-seg">
              <button className={`ai-seg-btn ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>
                <ChatDots size={14} /> 会话
              </button>
              <button className={`ai-seg-btn ${tab === 'skills' ? 'active' : ''}`} onClick={() => setTab('skills')}>
                <Wrench size={14} /> 技能
              </button>
            </div>
            <button className="btn btn-primary ai-new" onClick={() => startNew()}>
              <Plus size={14} /> 新建
            </button>
          </div>

          {tab === 'sessions' ? (
            <>
              <div className="ai-quick">
                <button className="ai-quick-item" onClick={() => setModule('aiMessages')}>
                  <ChatCircleDots size={14} /><span>消息平台</span>
                </button>
                <button className="ai-quick-item" onClick={() => setModule('aiArtifacts')}>
                  <Package size={14} /><span>产物</span>
                </button>
                <button className="ai-quick-item" onClick={() => setModule('aiTasks')}>
                  <Clock size={14} /><span>定时任务</span>
                </button>
              </div>

              <div className="ai-search">
                <MagnifyingGlass size={13} className="ai-search-ico" />
                <input
                  className="palette-input"
                  placeholder="搜索会话…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="ai-list">
                <div className="ai-list-group">
                  <div className="ai-list-cap">
                    <span>项目</span>
                    <button className="ai-list-add" title="新建项目对话" onClick={() => startNew('', 'project')}>
                      <Plus size={12} />
                    </button>
                  </div>
                  {projects.length === 0 && (
                    <div className="ai-empty-list">{q ? '无匹配项目' : '暂无项目'}</div>
                  )}
                  {projects.map((s) => (
                    <SessionRow
                      key={s.id} s={s} active={s.id === activeId}
                      onOpen={() => setActiveId(s.id)} onPin={() => togglePin(s.id)}
                      onMove={() => moveSession(s.id, 'chat')} moveTitle="移到聊天"
                      onDel={() => removeSession(s.id)} onDragStart={() => setDragId(s.id)} onDrop={reorder}
                    />
                  ))}
                </div>
                <div className="ai-list-group">
                  <div className="ai-list-cap"><span>聊天</span></div>
                  {chats.length === 0 && (
                    <div className="ai-empty-list">
                      {q ? '无匹配聊天' : '还没有聊天，新建一个开始吧'}
                    </div>
                  )}
                  {chats.map((s) => (
                    <SessionRow
                      key={s.id} s={s} active={s.id === activeId}
                      onOpen={() => setActiveId(s.id)} onPin={() => togglePin(s.id)}
                      onMove={() => moveSession(s.id, 'project')} moveTitle="移到项目"
                      onDel={() => removeSession(s.id)} onDragStart={() => setDragId(s.id)} onDrop={reorder}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <SkillsPanel hermesOk={hermesOk} reason={hermesReason} onUse={(p) => startNew(p)} />
          )}
        </aside>

        {/* ---------- 中：对话线程 + 输入 ---------- */}
        <section className="ai-main">
          {!active ? (
            <EmptyState ok={selectedReady} reason={selectedReason} tool={toolName(toolId, tools)} onPick={startNew} onReauth={handleOpenLogin} />
          ) : (
            <div className="ai-thread">
              <div className="ai-thread-head">
                <div className="ai-thread-title">{active.title}</div>
                <div className="ai-thread-meta">
                  {active.msgs.length} 条消息 · {modelLabel(modelId, modelOptions)}
                </div>
              </div>
              <div className="ai-scroll" ref={scrollRef}>
                <div className="ai-conversation">
                  {active.msgs.map((m, index) =>
                    m.role === 'user' ? (
                      <MessageRow key={m.id} msg={m} onCopy={copyText} onDelete={deleteMsg} />
                    ) : (
                      <AgentRun
                        key={m.id}
                        msg={m}
                        busy={m.id === busyRunId}
                        onCopy={copyText}
                        onDelete={deleteMsg}
                        onStop={() => void stopRun(m.id)}
                        onRetry={() => {
                          const prior = [...active.msgs.slice(0, index)].reverse().find((x) => x.role === 'user')
                          if (prior?.text) void send(prior.text)
                        }}
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="ai-composer">
            <div className="ai-composer-input">
              <textarea
                ref={inputRef}
                className="palette-input"
                rows={2}
                placeholder="描述你的目标，或继续补充要求…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              {busyRunId ? (
                <button className="ai-send ai-send-stop" onClick={() => void stopRun(runIdRef.current)} aria-label="停止生成">
                  <Stop size={16} weight="fill" />
                </button>
              ) : (
                <button className="ai-send" disabled={!input.trim()} onClick={() => void send()} aria-label="发送">
                  <PaperPlaneTilt size={16} />
                </button>
              )}
            </div>
            <div className="ai-composer-foot">
              <Select value={toolId} onChange={pickTool} options={toolOptions} className="ai-select" />
              <Select value={modelId} onChange={pickModel} options={modelOptions} className="ai-select ai-select-model" menuMinWidth={300} />
              {reauthMode && toolId === 'hermes' ? (
                <span className="ai-reauth">
                  <span className="ai-reauth-warn">
                    {reauthMsg ?? hermesReason ?? 'Hermes 凭证可能已失效，模型后端无响应'} ·
                  </span>
                  <button className="ai-reauth-btn" onClick={handleOpenLogin}>
                    <ShieldCheck size={13} /> 打开 Hermes 重新登录
                  </button>
                </span>
              ) : (activeToolNote ?? (hermesOk === false ? (hermesReason ?? RELOAD_HINT) : null)) && (
                <span className="ai-status-warn">{activeToolNote ?? hermesReason ?? RELOAD_HINT}</span>
              )}
              {reauthFeedback && <span className="ai-reauth-feed">{reauthFeedback}</span>}
              <span className="ai-composer-actions">
                <button className="ai-icon-btn" title="技能" onClick={() => setTab('skills')}>
                  <Wrench size={15} />
                </button>
                <button className="ai-icon-btn" title="设置" onClick={() => setModule('settings')}>
                  <Gear size={15} />
                </button>
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function SessionRow({ s, active, onOpen, onPin, onMove, moveTitle, onDel, onDragStart, onDrop }: {
  s: Session; active: boolean
  onOpen: () => void; onPin: () => void; onMove: () => void; moveTitle: string; onDel: () => void
  onDragStart: () => void; onDrop: (id: string) => void
}) {
  return (
    <button
      className={`ai-sess ${active ? 'active' : ''} ${s.pinned ? 'pinned' : ''}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(s.id) }}
      onClick={(e) => {
        // Shift+单击：置顶/取消，其余正常打开
        if (e.shiftKey) { e.preventDefault(); onPin() } else onOpen()
      }}
    >
      <span className="ai-sess-main">
        <span className="ai-sess-title">{s.pinned && <PushPin className="ai-sess-pin" size={10} weight="fill" />}{s.title}</span>
      </span>
      <span className="ai-sess-acts">
        <span
          className="ai-sess-act"
          title={moveTitle}
          onClick={(e) => { e.stopPropagation(); onMove() }}
        >
          {s.kind === 'project' ? <ChatDots size={12} /> : <FolderSimple size={12} />}
        </span>
        <span
          className={`ai-sess-act ${s.pinned ? 'on' : ''}`}
          title={s.pinned ? '取消置顶 (Shift+单击)' : '置顶 (Shift+单击)'}
          onClick={(e) => { e.stopPropagation(); onPin() }}
        >
          <PushPin size={12} weight={s.pinned ? 'fill' : 'regular'} />
        </span>
        <span
          className="ai-sess-act"
          title="删除"
          onClick={(e) => { e.stopPropagation(); onDel() }}
        >
          <X size={12} />
        </span>
      </span>
    </button>
  )
}

function SkillsPanel({ hermesOk, reason, onUse }: { hermesOk: boolean | null; reason: string | null; onUse: (p: string) => void }) {
  const catIds = SKILL_CATS.filter((c) => c.id !== 'all').map((c) => c.id as Exclude<SkillCategory, 'all'>)
  const [openCats, setOpenCats] = useState<Set<Exclude<SkillCategory, 'all'>>>(new Set(['dev']))
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const match = (sk: SkillItem) =>
    !needle ||
    sk.name.toLowerCase().includes(needle) ||
    sk.desc.toLowerCase().includes(needle) ||
    sk.prompt.toLowerCase().includes(needle)

  const toggleCat = (id: Exclude<SkillCategory, 'all'>) => {
    setOpenCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const expandAll = () => setOpenCats(new Set(catIds))
  const collapseAll = () => setOpenCats(new Set())

  return (
    <div className="ai-skills">
      <div className="ai-skills-hint">
        本地技能项与当前 Agent 能力对齐，点按即把目标发到问答框。
        {hermesOk === false && (
          <span style={{ color: 'var(--danger)' }}>（{reason ?? '未检测到本地 Agent'}）</span>
        )}
      </div>

      <div className="ai-search">
        <MagnifyingGlass size={13} className="ai-search-ico" />
        <input
          className="palette-input"
          placeholder="搜索技能…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {!needle && (
        <div className="ai-skill-menu-acts">
          <button type="button" className="ai-skill-menu-act" onClick={expandAll}>全部展开</button>
          <button type="button" className="ai-skill-menu-act" onClick={collapseAll}>全部收起</button>
        </div>
      )}

      <div className="ai-skills-menu">
        {SKILL_CATS.filter((c) => c.id !== 'all').map((c) => {
          const catId = c.id as Exclude<SkillCategory, 'all'>
          const items = SKILLS.filter((sk) => sk.category === catId && match(sk))
          if (needle && items.length === 0) return null
          const open = !needle && openCats.has(catId)
          return (
            <div key={c.id} className="ai-skill-menu">
              <button
                type="button"
                className={`ai-skill-menu-head ${open ? 'is-open' : ''}`}
                onClick={() => toggleCat(catId)}
              >
                <CaretRight size={13} className={`ai-skill-caret ${open ? 'open' : ''}`} />
                <span className="ai-skill-menu-label">{c.label}</span>
                <span className="ai-skill-menu-count">{items.length}</span>
              </button>
              {(open || needle) && (
                <div className="ai-skill-menu-body">
                  {items.map((sk) => (
                    <SkillRow key={sk.id} skill={sk} onUse={onUse} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {needle && SKILLS.filter(match).length === 0 && (
          <div className="ai-empty-list">无匹配技能</div>
        )}
      </div>
    </div>
  )
}

function SkillRow({ skill, onUse }: { skill: SkillItem; onUse: (p: string) => void }) {
  return (
    <button type="button" className="ai-skill" onClick={() => onUse(skill.prompt)}>
      <span className="ai-skill-ico">{skill.icon}</span>
      <span className="ai-skill-main">
        <span className="ai-skill-name">{skill.name}</span>
        <span className="file-meta">{skill.desc}</span>
      </span>
      <ArrowRight size={14} className="ai-skill-arrow" />
    </button>
  )
}

function MessageRow({ msg, onCopy, onDelete }: {
  msg: Msg; onCopy: (t?: string) => void; onDelete: (id: string) => void
}) {
  return (
    <article className="ai-msg ai-msg-user">
      <div className="ai-msg-head">
        <span className="ai-msg-name">你</span>
        <time className="ai-msg-time">{clockTime(msg.ts)}</time>
      </div>
      <div className="ai-msg-body">
        <div className="ai-msg-content">{msg.text}</div>
      </div>
      <div className="ai-msg-actions">
        <button className="ai-msg-act" title="复制" onClick={() => onCopy(msg.text)}>
          <Copy size={14} /><span>复制</span>
        </button>
        <button className="ai-msg-act" title="删除" onClick={() => onDelete(msg.id)}>
          <Trash size={14} /><span>删除</span>
        </button>
      </div>
    </article>
  )
}

function AgentRun({ msg, busy, onCopy, onDelete, onStop, onRetry }: {
  msg: Msg; busy: boolean
  onCopy: (t?: string) => void; onDelete: (id: string) => void; onStop: () => void; onRetry: () => void
}) {
  const status = msg.status ?? '执行中…'
  const text =
    msg.steps?.filter((s) => s.tag === 'text').map((s) => s.text).join('\n') ||
    (msg.text === '（Hermes 未返回文本）' ? '' : msg.text?.trim()) ||
    ''
  const empty = !busy && !text
  const detailSteps = msg.steps?.filter((st) => st.tag !== 'text') ?? []
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  const answer = async (requestId: string, allow: boolean) => {
    setAnswered((prev) => ({ ...prev, [requestId]: true }))
    try {
      await window.workdeck?.hermes?.respondPermission(requestId, allow)
    } catch {
      /* ignore */
    }
  }
  return (
    <article className={`ai-msg ai-msg-agent ${busy ? 'is-busy' : ''} ${empty ? 'is-empty' : ''}`}>
      <div className="ai-msg-head">
        <span className="ai-msg-name">Hermes</span>
        <time className="ai-msg-time">{clockTime(msg.ts)}</time>
        {(busy || empty) && <span className={`ai-run-status ${empty ? 'is-warning' : ''}`}>
            {busy && <CircleNotch size={13} className="spin" />}
            {empty ? '未收到回复' : status}
        </span>}
      </div>
      <div className="ai-msg-body">
        {detailSteps.length > 0 && (
          <div className="ai-run-steps">
            {detailSteps.map((st) => (
                <div
                  key={st.id}
                  className={`ai-run-step${st.tag === 'error' ? ' is-error' : ''}`}
                  role={st.tag === 'error' ? 'alert' : undefined}
                >
                  {st.tag === 'tool' && <CheckCircle size={13} color="var(--success)" />}
                  {st.tag === 'error' && <X size={13} color="var(--danger)" />}
                  {st.tag === 'permission' && <ShieldCheck size={13} color="var(--accent)" />}
                  {st.tag === 'permission' && st.requestId && !answered[st.requestId] ? (
                    <span className="ai-perm-wrap">
                      <span className="ai-perm-msg">{st.text}</span>
                      <span className="ai-perm-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => void answer(st.requestId!, false)}>拒绝</button>
                        <button className="btn btn-primary btn-sm" onClick={() => void answer(st.requestId!, true)}>允许</button>
                      </span>
                    </span>
                  ) : (
                    <span>{st.text}</span>
                  )}
                </div>
              ))}
          </div>
        )}
        {text ? (
          <div className="ai-run-reply">{renderRichText(text)}</div>
        ) : empty ? (
          <div className="ai-run-empty">
            <div className="ai-run-empty-title">暂未收到回复</div>
            <div className="ai-run-empty-desc">Hermes 已完成本次运行，但没有返回可显示的文本。你可以重新获取。</div>
            <button className="ai-run-empty-retry" onClick={onRetry}>
              <ArrowClockwise size={14} />重新获取
            </button>
          </div>
        ) : (
          <div className="ai-run-waiting">正在等待 Hermes 返回内容…</div>
        )}
        <div className="ai-msg-actions">
            {busy && (
              <button className="ai-msg-act" title="停止生成" onClick={onStop}>
                <Stop size={14} weight="fill" /><span>停止</span>
              </button>
            )}
            {!busy && (
              <button className="ai-msg-act" title="重新生成" onClick={onRetry}>
                <ArrowClockwise size={14} /><span>重新生成</span>
              </button>
            )}
            <button className="ai-msg-act" title="复制" onClick={() => onCopy(text || `（${status}）`)}>
              <Copy size={14} /><span>复制</span>
            </button>
            <button className="ai-msg-act" title="删除" onClick={() => onDelete(msg.id)}>
              <Trash size={14} /><span>删除</span>
            </button>
        </div>
      </div>
    </article>
  )
}

function EmptyState({ ok, reason, tool, onPick, onReauth }: { ok: boolean | null; reason: string | null; tool: string; onPick: (t: string) => void; onReauth: () => void }) {
  const samples = [
    '读取项目说明，并总结成三点',
    '把这个项目的标题改成渔文化馆',
    '调研竞品并生成一份对比报告',
    '检查未提交改动并给出提交建议'
  ]
  return (
    <div className="ai-empty">
      <div className="ai-empty-glow" />
      <div className="ai-brand">拾序 <span className="ai-brand-accent">AI</span></div>
      <div className="ai-brand-sub">
        当前接入「{tool}」。描述一个目标，我会拆解任务、调用工具并校验收成，执行过程实时展示。
      </div>
      <div className="ai-empty-status">
        <span className={`ai-dot ${ok === false ? 'off' : 'on'}`} />
        {ok === false
          ? (reason ?? '未检测到本地 Agent，请确认已安装并启动')
          : `已接入 ${tool} · 支持工具调用与权限确认`}
      </div>
      {ok === false && tool === 'Hermes' && (
        <button className="ai-empty-reauth" onClick={onReauth}>
          <ShieldCheck size={14} /> 打开 Hermes 重新登录
        </button>
      )}
      <button className="ai-empty-cta" onClick={() => onPick('')}>
        <Plus size={15} weight="bold" /> 开始新对话
      </button>
      <div className="ai-sample-box">
        <div className="ai-sample-cap">例如，你可以让我</div>
        <div className="ai-sample-grid">
          {samples.map((t) => (
            <button key={t} className="ai-sample-card" onClick={() => onPick(t)}>
              <span>{t}</span>
              <ArrowRight size={14} className="ai-sample-arrow" />
            </button>
          ))}
        </div>
      </div>
      <div className="ai-caps">
        {SKILLS.map((sk) => (
          <span key={sk.id} className="ai-cap-chip" onClick={() => onPick(sk.prompt)}>
            {sk.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function clockTime(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(ts)
}

/**
 * 零依赖的轻量 Markdown 渲染：把 Agent 纯文本回复转成带结构的正经输出
 * （标题 / 加粗 / 行内代码 / 代码块 / 列表）。只生成 React 节点，绝不用
 * dangerouslySetInnerHTML，避免任何 HTML 注入。
 */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, idx) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={idx}>{p.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(p)) return <code key={idx} className="ai-md-code">{p.slice(1, -1)}</code>
    return <span key={idx}>{p}</span>
  })
}

function renderRichText(src: string): ReactNode {
  if (!src) return null
  const lines = src.split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    // 代码块 ```...```
    if (trimmed.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++ // 跳过结束围栏
      out.push(
        <pre key={key++} className="ai-md-pre">
          <code>{buf.join('\n')}</code>
        </pre>
      )
      continue
    }
    // 无序列表 - / *
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      out.push(
        <ul key={key++} className="ai-md-ul">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>
      )
      continue
    }
    // 标题 # ~ ####
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      out.push(
        <div key={key++} className={`ai-md-h ai-md-h${h[1].length}`}>
          {renderInline(h[2])}
        </div>
      )
      i++
      continue
    }
    if (trimmed === '') {
      i++
      continue
    }
    // 段落（聚合连续普通行）
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^(#{1,4})\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    out.push(
      <p key={key++} className="ai-md-p">
        {para.map((pl, idx) => (
          <span key={idx}>
            {idx > 0 ? <br /> : null}
            {renderInline(pl)}
          </span>
        ))}
      </p>
    )
  }
  return out
}
