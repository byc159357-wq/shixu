import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import {
  Play,
  Pause,
  Stop,
  MapPin,
  CalendarCheck,
  Clock,
  CheckCircle,
  Tray,
  FolderOpen,
  SquaresFour,
  ClipboardText,
  Gauge,
  Quotes,
  CloudSun,
  Timer,
  Alarm,
  Note,
  Images,
  VideoCamera,
  FileText,
  Sparkle,
  PaperPlaneTilt
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useAppStore } from '../store'
import type { AgentModelList, HermesStreamEvent, LayoutItem, LibraryFile, MailDetailResult, MailPreview, SystemStats, WeatherNow, WidgetKind } from '../../../shared/types'
import {
  SoftwareWidget,
  ImagesWidget,
  DocsWidget,
  FoldersBoxWidget,
  VideosWidget
} from './BoxWidgets'
import { Select, type SelectOption } from './ui'

const SHORT_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function useTick(ms: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

export function ClockWidget() {
  const now = useTick(1000)
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const wd = SHORT_WEEKDAYS[now.getDay()]
  const date = `${now.getMonth() + 1}月${now.getDate()}日 周${wd}`
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        height: '100%',
        textAlign: 'left'
      }}
    >
      <div style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {hh}
        <span style={{ opacity: 0.5 }}>:</span>
        {mm}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, color: 'var(--text-2)', marginTop: '0.25rem' }}>
        <span style={{ fontSize: 'var(--fs-body-sm)' }}>{date}</span>
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{ss}</span>
      </div>
    </div>
  )
}

export function TodayWidget() {
  const todayTasks = useAppStore((s) => s.todayTasks)
  const completeTask = useAppStore((s) => s.completeTask)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="file-meta">
        逾期 {todayTasks.overdue.length} · 今日 {todayTasks.today.length}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {todayTasks.overdue.map((t) => (
          <div key={t.id} className="file-row" style={{ minHeight: 0, padding: '0.25rem 0.5rem' }}>
            <span className="file-name" style={{ fontSize: 'var(--fs-caption)' }}>{t.title}</span>
            <span className="badge badge-warn" style={{ fontSize: 'var(--fs-micro)' }}>逾期</span>
          </div>
        ))}
        {todayTasks.today.map((t) => (
          <div key={t.id} className="file-row" style={{ minHeight: 0, padding: '0.25rem 0.5rem' }}>
            <button
              onClick={() => void completeTask(t.id)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 'var(--fs-caption)' }}
            >
              {t.title}
            </button>
          </div>
        ))}
        {todayTasks.overdue.length === 0 && todayTasks.today.length === 0 && (
          <div className="file-meta">今天没有待办 🎉</div>
        )}
      </div>
    </div>
  )
}

export function TasksWidget() {
  const projects = useAppStore((s) => s.projects)
  const createTask = useAppStore((s) => s.createTask)
  const currentProject = projects[0]
  const [text, setText] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div className="file-meta">
        {currentProject ? `新任务归属：${currentProject.name}` : '未选项目（任务将不带归属）'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder="输入任务标题…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              void createTask({
                projectId: currentProject?.id ?? null,
                title: text.trim(),
                dueDate: null,
                priority: 'medium'
              })
              setText('')
            }
          }}
        />
      </div>
      <div className="file-meta" style={{ marginTop: 'auto' }}>提示：按 Enter 快速创建</div>
    </div>
  )
}

export function ContinueWidget() {
  const projects = useAppStore((s) => s.projects)
  const libraryFiles = useAppStore((s) => s.libraryFiles)
  const openDetail = useAppStore((s) => s.openDetail)
  const top = projects[0]
  const recent = libraryFiles.slice(0, 4)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {top ? (
        <button
          className="file-row"
          onClick={() => openDetail({ kind: 'project', id: top.id })}
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }}
        >
          <span className="file-icon" />
          <span className="file-main">
            <div className="file-name">{top.name}</div>
            <div className="file-meta">最近更新 {top.updated_at?.slice(0, 10) ?? '—'}</div>
          </span>
        </button>
      ) : (
        <div className="file-meta">还没有项目，去左侧新建一个吧</div>
      )}
      {recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="file-meta">最近文件</div>
          {recent.map((f) => (
            <div key={f.id} className="file-row" style={{ minHeight: 0, padding: '0.25rem 0.5rem' }}>
              <span className="file-name" style={{ fontSize: 'var(--fs-caption)' }}>{f.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function relTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 1) return `${hr} 小时前`
  if (day < 7) return `${day} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function InboxWidget() {
  const emailAccounts = useAppStore((s) => s.emailAccounts)
  const emailActiveId = useAppStore((s) => s.emailActiveId)
  const emailInbox = useAppStore((s) => s.emailInbox)
  const loadEmailInbox = useAppStore((s) => s.loadEmailInbox)
  const selectEmail = useAppStore((s) => s.selectEmail)
  const setModule = useAppStore((s) => s.setModule)
  const [reading, setReading] = useState<{ m: MailPreview; result: MailDetailResult | null } | null>(null)
  // Guards against a late-arriving email fetch re-opening the modal after the
  // user already closed it (which made ✕ / backdrop look "broken").
  const openSeq = useRef(0)
  const closeMail = useCallback(() => {
    openSeq.current += 1
    setReading(null)
  }, [])

  // Not configured yet → guidance card so the user knows where to connect.
  if (emailAccounts.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          height: '100%',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          padding: 'var(--space-3)'
        }}
      >
        <Tray size={34} color="var(--text-3)" />
        <div style={{ color: 'var(--text-1)', fontWeight: 600 }}>收件箱连接邮箱</div>
        <div className="file-meta" style={{ maxWidth: 220 }}>
          配置你的邮箱（IMAP），未读邮件与最近来信会实时显示在这里
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-1)' }} onClick={() => setModule('settings')}>
          去设置
        </button>
      </div>
    )
  }

  const unread = emailInbox?.count ?? 0
  const mails = emailInbox?.list ?? []

  const openMail = (m: MailPreview) => {
    const seq = openSeq.current + 1
    openSeq.current = seq
    setReading({ m, result: null })
    window.workdeck.email
      .get(m.uid)
      .then((result: MailDetailResult) => {
        if (seq === openSeq.current) setReading({ m, result })
      })
      .catch(() => {
        if (seq === openSeq.current) setReading({ m, result: { ok: false, error: '读取邮件失败' } })
      })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        height: '100%',
        minHeight: 0
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Select
          style={{ maxWidth: '62%' }}
          value={emailActiveId ?? emailAccounts[0]?.id ?? ''}
          onChange={(v) => void selectEmail(v)}
          options={emailAccounts.map((a) => ({ label: a.email, value: a.id }))}
          placeholder="选择邮箱"
        />
        <span className="file-meta" style={{ marginLeft: 'auto' }}>
          {unread} 封未读
        </span>
      </div>

      {emailInbox?.error ? (
        <div className="file-meta" style={{ color: 'var(--danger, #e55a5a)', padding: '0.25rem 0' }}>
          连接失败：{emailInbox.error}
        </div>
      ) : mails.length === 0 ? (
        <div className="file-meta" style={{ padding: '0.25rem 0' }}>
          {unread === 0 ? '收件箱空空如也，没有新邮件' : '暂无邮件列表'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto', minHeight: 0, flex: 1 }}>
          {mails.map((m) => (
            <div
              key={m.uid}
              className="file-row"
              style={{ padding: '0.3rem 0.5rem', cursor: 'pointer' }}
              title="点击阅读邮件"
              onClick={() => openMail(m)}
            >
              <span className="file-name" style={{ gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 99,
                    background: m.unread ? 'var(--accent)' : 'transparent',
                    flexShrink: 0,
                    boxShadow: m.unread ? '0 0 0 3px var(--accent-soft, transparent)' : 'none'
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.subject}
                </span>
              </span>
              <span className="file-meta">
                {m.from} · {relTime(m.date)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => void loadEmailInbox()}>
          刷新
        </button>
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => setModule('settings')}
        >
          邮箱设置
        </button>
      </div>

      {reading && createPortal(<MailReaderModal reading={reading} onClose={closeMail} />, document.body)}
    </div>
  )
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    // Email HTML often ships fixed/absolute overlays that swallow clicks on the
    // modal chrome (close button). Strip positioning so mail content can never
    // float over the close control or Escape still wins.
    .replace(/(?:position|z-index)\s*:\s*[^;"']+;?\s*/gi, '')
}

function MailReaderModal({
  reading,
  onClose
}: {
  reading: { m: MailPreview; result: MailDetailResult | null }
  onClose: () => void
}) {
  const { m, result } = reading
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Escape always closes, even if some mail element intercepts the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Capture-phase backdrop close: runs before any overlay can swallow the
  // click, so clicking ANYWHERE outside the panel always closes.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Element | null
      // The ✕ button: close on pointerdown so it still works even if a
      // synthetic `click` never fires (mismatched down/up).
      if (t && t.closest?.('[data-mail-close]')) {
        onClose()
        return
      }
      // Clicking any backdrop area closes too.
      if (panelRef.current && e.target && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointer, true)
    return () => document.removeEventListener('pointerdown', onPointer, true)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(20, 22, 30, 0.32)',
        backdropFilter: 'blur(18px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(680px, 94vw)',
          height: 'min(560px, 86vh)',
          background: 'var(--surface-1)',
          border: '1px solid var(--border-strong)',
          borderRadius: '1rem',
          boxShadow:
            '0 24px 64px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))',
            background: 'inherit'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-title)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.subject}
            </div>
            <button
              className="mini-btn"
              data-mail-close="1"
              style={{
                position: 'relative',
                zIndex: 5,
                marginLeft: 'auto',
                flexShrink: 0,
                width: 28,
                height: 28,
                padding: 0,
                justifyContent: 'center',
                borderRadius: 8,
                cursor: 'pointer'
              }}
              onClick={onClose}
              title="关闭"
            >
              ✕
            </button>
          </div>
          <div className="file-meta" style={{ marginTop: 2 }}>
            {m.from} · {new Date(m.date).toLocaleString()}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, position: 'relative', zIndex: 1, isolation: 'isolate' }}>
          {!result ? (
            <div className="file-meta" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
              正在读取邮件正文…
            </div>
          ) : !result.ok ? (
            <div className="file-meta" style={{ padding: 'var(--space-4)', color: 'var(--danger, #e55a5a)' }}>
              {result.error || '读取失败'}
            </div>
          ) : result.mail?.html ? (
            <iframe
              title="邮件正文"
              sandbox="allow-popups"
              srcDoc={sanitizeHtml(result.mail.html)}
              style={{ width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent' }}
            />
          ) : (
            <pre
              style={{
                padding: 'var(--space-4)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                lineHeight: 1.7,
                margin: 0
              }}
            >
              {result.mail?.text || '(此邮件无正文内容)'}
            </pre>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '6px var(--space-4)',
            borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text-3)'
          }}
        >
          按 Esc 或点击空白处可关闭
        </div>
      </div>
    </div>
  )
}

export function RecentFilesWidget() {
  const libraryFiles = useAppStore((s) => s.libraryFiles)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', overflow: 'auto' }}>
      {libraryFiles.length === 0 ? (
        <div className="file-meta">文件库为空</div>
      ) : (
        libraryFiles.slice(0, 8).map((f) => (
          <div key={f.id} className="file-row" style={{ minHeight: 0, padding: '0.25rem 0.5rem' }}>
            <span className="file-name" style={{ fontSize: 'var(--fs-caption)' }}>{f.name}</span>
            <span className="file-meta">{f.type}</span>
          </div>
        ))
      )}
    </div>
  )
}

/* ============================================================
 *  Clipboard —— 剪贴板历史
 * ============================================================ */
export function ClipboardWidget() {
  const [entries, setEntries] = useState<string[]>([])
  const pushToast = useAppStore((s) => s.pushToast)

  useEffect(() => {
    void window.workdeck.clipboard.list().then(setEntries)
    const off = window.workdeck.onClipboardChanged((entry: string) =>
      setEntries((prev) => [entry, ...prev.filter((e) => e !== entry)].slice(0, 30))
    )
    return off
  }, [])

  const copy = async (t: string) => {
    await window.workdeck.clipboard.copy(t)
    pushToast('success', '已复制到剪贴板')
  }

  if (entries.length === 0)
    return <div className="file-meta">暂无历史 · 复制点文字后会自动出现在这里</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', overflow: 'auto' }}>
      {entries.map((t, i) => (
        <button
          key={`${i}-${t}`}
          className="file-row"
          onClick={() => void copy(t)}
          style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', padding: '0.35rem 0.5rem' }}
        >
          <span className="file-name" style={{ fontSize: 'var(--fs-caption)' }}>{t}</span>
          {i === 0 && <span className="badge badge-available">最新</span>}
        </button>
      ))}
    </div>
  )
}

/* ============================================================
 *  Sysmon —— 系统监控
 * ============================================================ */
export function SysmonWidget() {
  const [s, setS] = useState<SystemStats | null>(null)
  useEffect(() => {
    let alive = true
    const tick = () =>
      window.workdeck.system.stats().then((v: SystemStats) => {
        if (alive) setS(v)
      })
    void tick()
    const id = window.setInterval(tick, 2000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  if (!s)
    return <div className="file-meta">读取系统信息…</div>

  const cpu = unit(s.cpu, '%')
  const mem = useFraction(s.memUsed, s.memTotal)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <Meter label="CPU" value={cpu} pct={Math.round(s.cpu)} />
      <Meter label="内存" value={mem} pct={s.memPercent} />
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="file-meta">本机 IP {s.ip || '—'} · {platformName(s.platform)}</div>
        <div className="file-meta">进程核心 {navigator.hardwareConcurrency ?? '—'}</div>
      </div>
    </div>
  )
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-caption)', marginBottom: 4 }}>
        <span className="file-meta">{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

function platformName(p: string): string {
  switch (p) {
    case 'win32':
      return 'Windows'
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return p || '未知'
  }
}

function unit(v: number, suffix: string): string {
  return `${v.toFixed(0)}${suffix}`
}

/** Human-readable size of used / total bytes. */
function useFraction(used: number, total: number): string {
  return `${formatBytes(used)} / ${formatBytes(total)}`
}

function formatBytes(b: number): string {
  if (!b) return '0 B'
  const n = Math.floor(b / 1024 / 1024)
  if (n >= 1024 * 2) return `${(n / 1024).toFixed(1)} GB`
  return `${n} MB`
}

/* ============================================================
 *  Quote —— 一言 / 格言
 * ============================================================ */
const QUOTES: Array<{ text: string; author: string }> = [
  { text: '种一棵树最好的时间是十年前，其次是现在。', author: '谚语' },
  { text: '用功不求太猛，但求有恒。', author: '曾国藩' },
  { text: '怕什么真理无穷，进一寸有一寸的欢喜。', author: '胡适' },
  { text: '天下事有难易乎？为之，则难者亦易矣。', author: '彭端淑' },
  { text: '博观而约取，厚积而薄发。', author: '苏轼' },
  { text: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子' },
  { text: '欲速则不达，见小利则大事不成。', author: '孔子' },
  { text: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈' },
  { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游' },
  { text: '千里之行，始于足下。', author: '老子' },
  { text: '不驰于空想，不骛于虚声。', author: '李大钊' },
  { text: '千淘万漉虽辛苦，吹尽狂沙始到金。', author: '刘禹锡' },
  { text: '长风破浪会有时，直挂云帆济沧海。', author: '李白' },
  { text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
  { text: '凡事预则立，不预则废。', author: '《礼记》' }
]

export function QuoteWidget() {
  const [q, setQ] = useState(() => QUOTES[dayOfYear() % QUOTES.length])
  const next = useCallback(() => setQ(QUOTES[Math.floor(Math.random() * QUOTES.length)]), [])
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '100%',
        textAlign: 'left'
      }}
    >
      <div style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 1.7, color: 'var(--text-1)' }}>「{q.text}」</div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="file-meta">—— {q.author}</span>
        <button className="btn btn-secondary btn-sm" onClick={next} style={{ fontSize: 'var(--fs-micro)' }}>
          换一条
        </button>
      </div>
    </div>
  )
}

function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.floor((now.getTime() - start.getTime()) / 86400000)
}

/* ============================================================
 *  Weather —— 天气
 * ============================================================ */
export function WeatherWidget({ item, onMeta }: WidgetProps) {
  const city = (item.meta?.city as string) || ''
  // First-time (no city saved) opens directly into edit mode; switching back via
  // 改城市 re-enters the same inline form — no need to delete the card.
  const [editing, setEditing] = useState(() => !city)
  const [input, setInput] = useState(city)
  const [w, setW] = useState<WeatherNow | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    (c: string) => {
      if (!c) return
      setBusy(true)
      void window.workdeck.weather.get(c).then((v: WeatherNow | null) => {
        setW(v)
        setBusy(false)
      })
    },
    []
  )
  useEffect(() => {
    if (city) load(city)
  }, [city, load])

  const saveCity = () => {
    const c = input.trim()
    if (!c) return
    onMeta({ city: c })
    setEditing(false)
  }

  // Inline edit form (first setup + every later "改城市"). Keeps the label on
  // one line and stays flexible, so the save label never wraps to a column.
  if (editing)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', justifyContent: 'center' }}>
        <div className="file-meta">城市或区县，如 北京 / 朝阳区（可精确到县）</div>
        <div style={{ display: 'flex', gap: 8, whiteSpace: 'nowrap' }}>
          <input className="input" placeholder="城市或区县" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCity()} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={saveCity}>保存</button>
          {city ? (
            <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setEditing(false)}>收起</button>
          ) : null}
        </div>
      </div>
    )

  // Read state: styled content + an always-available 改城市 entry, including in
  // the loading and failure states so a wrong name never strands the card.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {w ? (
          <>
            <MapPin size={14} color="var(--text-3)" />
            <span className="file-meta">{w.city}</span>
            <span className="badge badge-available">{w.text}</span>
          </>
        ) : (
          <span className="file-meta">{city}</span>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setEditing(true)}
          style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)', whiteSpace: 'nowrap' }}
        >
          改城市
        </button>
      </div>

      {busy && !w && <div className="file-meta">加载天气…</div>}
      {!w && !busy && <div className="file-meta">没找到这座城市，点「改城市」换一个试试</div>}

      {w && (
        <>
          <div style={{ fontSize: '2.75rem', fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(w.temp)}°
          </div>
          <div className="file-meta" style={{ display: 'flex', gap: 12 }}>
            <span>湿度 {w.humidity}%</span>
            <span>风速 {w.windSpeed.toFixed(1)} km/h</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto', overflow: 'auto' }}>
            {w.daily.slice(0, 4).map((d) => (
              <div key={d.date} className="file-row" style={{ flexDirection: 'column', alignItems: 'center', padding: '0.35rem 0.5rem', gap: 2 }}>
                <span className="file-meta" style={{ fontSize: 'var(--fs-micro)' }}>{d.date.slice(5)}</span>
                <span className="file-meta" style={{ fontSize: 'var(--fs-micro)' }}>{d.text}</span>
                <span style={{ fontSize: 'var(--fs-caption)', fontVariantNumeric: 'tabular-nums' }}>
                  {d.tmax}°/{d.tmin}°
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ============================================================
 *  Pomodoro —— 番茄专注
 * ============================================================ */
const WORK_SEC = 25 * 60
const BREAK_SEC = 5 * 60

export function PomodoroWidget() {
  const [left, setLeft] = useState(WORK_SEC)
  const [running, setRunning] = useState(false)
  const [onBreak, setOnBreak] = useState(false)
  const pushToast = useAppStore((s) => s.pushToast)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          // phase complete
          if (onBreak) {
            setOnBreak(false)
            setLeft(WORK_SEC)
            pushToast('success', '休息结束，开始专注吧 💪')
          } else {
            setOnBreak(true)
            setLeft(BREAK_SEC)
            pushToast('success', '专注完成，休息一下 🎉')
          }
          setRunning(false)
          return 0
        }
        return v - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [running, onBreak, pushToast])

  const reset = () => {
    setRunning(false)
    setOnBreak(false)
    setLeft(WORK_SEC)
  }

  const pct = onBreak ? (BREAK_SEC - left) / BREAK_SEC : (WORK_SEC - left) / WORK_SEC

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '100%', textAlign: 'center' }}>
      <span className="badge" style={{ fontSize: 'var(--fs-micro)' }}>
        {onBreak ? '休息中' : '专注中'}
      </span>
      <div style={{ fontSize: '3rem', fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
        {fmt(left)}
      </div>
      <div className="meter-track" style={{ width: '80%' }}>
        <div className="meter-fill" style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {running ? (
          <button className="btn btn-secondary btn-sm" onClick={() => setRunning(false)}>
            <Pause size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> 暂停
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setRunning(true)}>
            <Play size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> {left === (onBreak ? BREAK_SEC : WORK_SEC) ? '开始' : '继续'}
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={reset}>
          <Stop size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> 重置
        </button>
      </div>
      <div className="file-meta">{onBreak ? '25 分钟专注后，放松 5 分钟' : '保持专注，25 分钟后休息'}</div>
    </div>
  )
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ============================================================
 *  Countdown —— 倒计时
 * ============================================================ */
export function CountdownWidget({ item, onMeta }: WidgetProps) {
  const target = (item.meta?.target as string) || ''
  const [input, setInput] = useState(target)
  const label = (item.meta?.label as string) || '目标日'

  const save = () => {
    const d = input.trim()
    if (!d) return
    onMeta({ target: d })
  }

  if (!target)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', justifyContent: 'center' }}>
        <div className="file-meta">设置一个倒计时目标</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="date" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn btn-secondary btn-sm" onClick={save}>保存</button>
        </div>
      </div>
    )

  const days = daysUntil(target)
  const past = days < 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 6 }}>
      <div className="file-meta">{label}{past ? '（已过）' : ''}</div>
      <div style={{ fontSize: '2.6rem', fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {past ? '已过 ' : ''}{Math.abs(days)}<span style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 400, color: 'var(--text-3)' }}> 天</span>
      </div>
      <div className="file-meta">{target}{past ? '，往前看' : '，继续加油'}</div>
      <button className="btn btn-secondary btn-sm" onClick={() => onMeta({ target: '' })} style={{ alignSelf: 'flex-start', fontSize: 'var(--fs-micro)' }}>
        重设
      </button>
    </div>
  )
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime()
  if (Number.isNaN(ms)) return 0
  const start = new Date(new Date().toDateString()).getTime()
  return Math.round((ms - start) / 86400000)
}

/* ============================================================
 *  Sticky —— 速记布告
 * ============================================================ */
export function StickyWidget({ item, onMeta }: WidgetProps) {
  const text = (item.meta?.text as string) || ''
  const [draft, setDraft] = useState(text)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setDraft((item.meta?.text as string) || '')
  }, [item.meta?.text])

  const change = (v: string) => {
    setDraft(v)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onMeta({ text: v }), 600)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div className="file-meta">随手记，自动保存到卡片</div>
      <textarea
        className="input"
        style={{ flex: 1, resize: 'none', minHeight: 0, lineHeight: 1.6 }}
        placeholder="写点什么……"
        value={draft}
        onChange={(e) => change(e.target.value)}
      />
    </div>
  )
}

/* ============================================================
 *  Album —— 最近截图相册
 * ============================================================ */
export function AlbumWidget() {
  const [shots, setShots] = useState<Array<{ id: string; name: string; thumb: string | null }>>([])
  const pushToast = useAppStore((s) => s.pushToast)

  useEffect(() => {
    let alive = true
    void (async () => {
      const files = await window.workdeck.library.list({ type: 'screenshot', sort: 'mtime', order: 'desc', limit: 12 })
      const rows = await Promise.all(
        files.map(async (f: LibraryFile) => ({ id: f.id, name: f.name, thumb: await window.workdeck.file.thumbnail(f.id, 160) }))
      )
      if (alive) setShots(rows)
    })()
    return () => {
      alive = false
    }
  }, [])

  const open = async (id: string) => {
    try {
      await window.workdeck.file.open(id)
    } catch {
      pushToast('error', '无法打开该文件')
    }
  }

  if (shots.length === 0)
    return <div className="file-meta">还没有截图 · 截图会自动进入文件库</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', gap: 8, height: '100%', overflow: 'auto', alignContent: 'start' }}>
      {shots.map((s) => (
        <button
          key={s.id}
          onClick={() => void open(s.id)}
          title={s.name}
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: s.thumb ? undefined : 'var(--surface-2)',
            cursor: 'pointer',
            padding: 0
          }}
        >
          {s.thumb ? (
            <img src={s.thumb} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <span className="file-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              {s.name.slice(0, 1)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ============================================================ */

export function AIWidget() {
  const [input, setInput] = useState('')
  const [reply, setReply] = useState('在这里直接向 Hermes 提问。')
  const [busy, setBusy] = useState(false)
  const [modelOptions, setModelOptions] = useState<SelectOption[]>([])
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('wd_agent_model') || '')
  const busyRef = useRef(false)
  const streamTextRef = useRef(false)

  useEffect(() => {
    let alive = true
    const agent = window.workdeck?.agent
    const provider = localStorage.getItem('wd_agent_tool') || 'hermes'
    if (!agent) return () => { alive = false }
    agent.modelList({ provider })
      .then((roster: AgentModelList) => {
        if (!alive) return
        const options = (roster.models ?? []).map((m) => {
          const label = m.name || m.id
          const separator = label.indexOf(' · ')
          return {
            value: m.id,
            label,
            shortLabel: separator >= 0 ? label.slice(separator + 3) : label
          }
        })
        setModelOptions(options)
        setSelectedModel((saved) => {
          const next = options.some((o) => o.value === saved)
            ? saved
            : roster.currentModelId && options.some((o) => o.value === roster.currentModelId)
              ? roster.currentModelId
              : options[0]?.value ?? saved
          if (next) localStorage.setItem('wd_agent_model', next)
          return next
        })
      })
      .catch(() => { /* keep the saved model as a send fallback */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const off = window.workdeck?.agent?.onEvent?.((ev: HermesStreamEvent) => {
      if (!busyRef.current) return
      if (ev.type === 'text' && ev.text) {
        const firstChunk = !streamTextRef.current
        streamTextRef.current = true
        setReply((prev) => (firstChunk ? ev.text : prev + ev.text))
      } else if (ev.type === 'status' && ev.status) {
        if (!streamTextRef.current) setReply(ev.status)
      } else if (ev.type === 'error') {
        setReply(ev.message || 'Hermes 暂时无法回复')
      } else if (ev.type === 'done' && ev.finalText?.trim() && !streamTextRef.current) {
        setReply(ev.finalText.trim())
      }
    })
    return () => off?.()
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || busyRef.current) return
    const agent = window.workdeck?.agent
    if (!agent) {
      setReply('未检测到 Hermes，请先启动本地 Agent。')
      return
    }

    setInput('')
    setReply('正在思考…')
    setBusy(true)
    busyRef.current = true
    streamTextRef.current = false
    const provider = localStorage.getItem('wd_agent_tool') || 'hermes'
    let model = selectedModel || localStorage.getItem('wd_agent_model') || undefined
    let availableModels: string[] = []
    try {
      // The saved picker value can outlive a provider's free-model window.
      // Resolve Hermes's live current model before every compact-card request.
      try {
        const roster: AgentModelList = await agent.modelList({ provider })
        availableModels = (roster.models ?? []).map((m) => m.id).filter(Boolean)
        const current = roster.currentModelId?.trim()
        if (!model || !availableModels.includes(model)) {
          model = current && availableModels.includes(current) ? current : availableModels[0]
        }
        if (model) {
          localStorage.setItem('wd_agent_model', model)
          setSelectedModel(model)
        }
      } catch {
        // Sending can still succeed with Hermes's current session model.
      }

      const run = (modelId?: string) => agent.send(text, {
        provider,
        model: modelId,
        sessionKey: 'home-ai-widget'
      })

      let finalText: string
      try {
        finalText = await run(model)
      } catch (firstError) {
        const message = String(firstError)
        const expired = /free period has ended|select a different model|HTTP 404/i.test(message)
        const alternatives = availableModels
          .filter((id) => id !== model)
          .sort((a, b) => Number(/free/i.test(a)) - Number(/free/i.test(b)))
        if (!expired || alternatives.length === 0) throw firstError

        model = alternatives[0]
        localStorage.setItem('wd_agent_model', model)
        setSelectedModel(model)
        streamTextRef.current = false
        setReply('当前模型已失效，正在自动切换模型…')
        finalText = await run(model)
      }

      if (finalText?.trim()) {
        if (!streamTextRef.current) setReply(finalText.trim())
      } else {
        setReply((prev) => (!streamTextRef.current ? 'Hermes 已完成，但没有返回文本。' : prev))
      }
    } catch (err) {
      const clean = String(err).replace(
        /^Error:\s*Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
        ''
      )
      setReply(
        /free period has ended|select a different model|HTTP 404/i.test(clean)
          ? '当前模型的免费使用期已结束。请在 AI 页面切换一个可用模型后重试。'
          : clean || '发送失败，请稍后重试。'
      )
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="home-ai-widget">
      <div className="home-ai-model-row">
        <select
          className="input home-ai-model-select"
          aria-label="选择 AI 模型"
          value={selectedModel}
          disabled={busy || modelOptions.length === 0}
          onChange={(event) => {
            const value = event.target.value
            setSelectedModel(value)
            localStorage.setItem('wd_agent_model', value)
          }}
        >
          {modelOptions.length === 0 && <option value="">暂无可用模型</option>}
          {modelOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.shortLabel ?? option.label}</option>
          ))}
        </select>
      </div>
      <div className={`home-ai-reply ${busy ? 'is-busy' : ''}`} aria-live="polite">
        {reply}
      </div>
      <div className="home-ai-composer">
        <input
          className="input"
          value={input}
          placeholder="问 AI…"
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send()
          }}
          aria-label="向 AI 提问"
        />
        <button
          className="home-ai-send"
          disabled={busy || !input.trim()}
          onClick={() => void send()}
          aria-label={busy ? 'AI 正在回复' : '发送'}
        >
          <PaperPlaneTilt size={15} weight="fill" />
        </button>
      </div>
    </div>
  )
}

interface WidgetProps {
  item: LayoutItem
  onMeta: (patch: Record<string, unknown>) => void
}

export const WIDGETS: Record<WidgetKind, { title: string; defaultSize: { w: number; h: number } }> = {
  ai: { title: 'AI 助手', defaultSize: { w: 3, h: 3 } },
  today: { title: '今日', defaultSize: { w: 4, h: 3 } },
  clock: { title: '时钟', defaultSize: { w: 2, h: 2 } },
  tasks: { title: '任务速览', defaultSize: { w: 4, h: 2 } },
  continue: { title: '继续上次', defaultSize: { w: 6, h: 2 } },
  inbox: { title: '收件箱', defaultSize: { w: 4, h: 2 } },
  'recent-files': { title: '最近文件', defaultSize: { w: 6, h: 2 } },
  apps: { title: '软件', defaultSize: { w: 4, h: 3 } },
  images: { title: '图片', defaultSize: { w: 4, h: 3 } },
  docs: { title: '文件', defaultSize: { w: 4, h: 3 } },
  folders: { title: '文件夹', defaultSize: { w: 4, h: 3 } },
  videos: { title: '视频', defaultSize: { w: 4, h: 3 } },
  clipboard: { title: '剪贴板历史', defaultSize: { w: 4, h: 3 } },
  sysmon: { title: '系统监控', defaultSize: { w: 3, h: 3 } },
  quote: { title: '一言格言', defaultSize: { w: 4, h: 2 } },
  weather: { title: '天气', defaultSize: { w: 4, h: 3 } },
  pomodoro: { title: '番茄专注', defaultSize: { w: 3, h: 3 } },
  countdown: { title: '倒计时', defaultSize: { w: 3, h: 3 } },
  sticky: { title: '速记布告', defaultSize: { w: 4, h: 3 } },
  album: { title: '截图相册', defaultSize: { w: 5, h: 3 } },
  digest: { title: '信息聚合', defaultSize: { w: 6, h: 3 } },
  flow: { title: '任务流转看板', defaultSize: { w: 4, h: 3 } }
}

/** Ordering / grouping / icon for the "add card" picker. Titles & sizes come
 *  from WIDGETS so the two never drift. */
export interface WidgetPickerEntry {
  kind: WidgetKind
  icon: Icon
}

export const WIDGET_PICKER: Array<{ category: string; items: WidgetPickerEntry[] }> = [
  {
    category: '桌面空间',
    items: [
      { kind: 'apps', icon: SquaresFour },
      { kind: 'images', icon: Images },
      { kind: 'folders', icon: FolderOpen },
      { kind: 'videos', icon: VideoCamera },
      { kind: 'docs', icon: FileText }
    ]
  },
  {
    category: '常用',
    items: [
      { kind: 'ai', icon: Sparkle },
      { kind: 'today', icon: CalendarCheck },
      { kind: 'clock', icon: Clock },
      { kind: 'tasks', icon: CheckCircle },
      { kind: 'inbox', icon: Tray },
      { kind: 'digest', icon: ClipboardText },
      { kind: 'flow', icon: Gauge },
      { kind: 'recent-files', icon: FolderOpen },
      { kind: 'continue', icon: Play }
    ]
  },
  {
    category: '效率工具',
    items: [
      { kind: 'clipboard', icon: ClipboardText },
      { kind: 'pomodoro', icon: Timer },
      { kind: 'sticky', icon: Note },
      { kind: 'countdown', icon: Alarm }
    ]
  },
  {
    category: '信息生活',
    items: [
      { kind: 'weather', icon: CloudSun },
      { kind: 'sysmon', icon: Gauge },
      { kind: 'quote', icon: Quotes },
      { kind: 'album', icon: Images }
    ]
  }
]

/**
 * 信息聚合卡：把散在外面的待办、收件箱、项目动态收进一栏，避免"切来切去".
 * 数据全部来自本地已有状态（任务 / 收件箱 / 项目），无需联网。
 * 三栏横向布局：待办提醒 · 待审批 · 在办项目。
 */
export function DigestWidget() {
  const todayTasks = useAppStore((s) => s.todayTasks)
  const inboxFiles = useAppStore((s) => s.inboxFiles)
  const projects = useAppStore((s) => s.projects)
  const activeProjects = projects.filter((p) => p.status !== '完结' && p.status !== 'done').slice(0, 3)
  const overdue = todayTasks.overdue.slice(0, 3)
  const today = todayTasks.today.slice(0, 4)
  const inbox = inboxFiles.slice(0, 3)

  const col = (title: string, hint: string, children: ReactNode) => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ marginBottom: 2 }}>
        <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--text-1)' }}>{title}</span>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)', marginLeft: 6 }}>{hint}</span>
      </div>
      {children}
    </div>
  )

  const empty = (text: string) => (
    <div className="file-meta" style={{ fontSize: 'var(--fs-caption)' }}>{text}</div>
  )

  const line = (primary: string, secondary: string) => (
    <div className="file-row" style={{ minHeight: 0, padding: '0.2rem 0.35rem' }}>
      <span className="file-name" style={{ fontSize: 'var(--fs-caption)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{primary}</span>
      {secondary && <span className="badge badge-neutral" style={{ fontSize: 'var(--fs-micro)', flexShrink: 0, marginLeft: 4 }}>{secondary}</span>}
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', height: '100%', minHeight: 0 }}>
      {col('待办提醒', '今日', overdue.length + today.length > 0
        ? (overdue.length > 0 ? `${overdue.length} 逾期` : '')
        : '无')}
      {overdue.length > 0
        ? overdue.map((t) => line(t.title, '逾期'))
        : today.length > 0
          ? today.map((t) => line(t.title, '今日'))
          : empty('今天没有待办')}
      {col('收件文件', '本地', `${inboxFiles.length} 项`)}
      {inboxFiles.length > 0
        ? inbox.map((f) => line(f.name, '处理'))
        : empty('收件箱已清空')}
      {col('在办项目', '进度', `${activeProjects.length} 个`)}
      {activeProjects.length > 0
        ? activeProjects.map((p) => line(p.name, p.status))
        : empty('暂无在办项目')}
    </div>
  )
}

/**
 * Agent 任务流转看板：四宫格 KPI，呼应视频里"每天只做审核、把关"的理念——
 * 数字来自本地真实状态，点击「待审批」可跳到项目/收件箱。
 */
export function FlowWidget() {
  const todayTasks = useAppStore((s) => s.todayTasks)
  const inboxFiles = useAppStore((s) => s.inboxFiles)
  const projects = useAppStore((s) => s.projects)
  const setModule = useAppStore((s) => s.setModule)

  const cards = [
    { label: '待处理', value: todayTasks.today.length, accent: '--success', hint: '今日待办' },
    { label: '已逾期', value: todayTasks.overdue.length, accent: '--danger', hint: '需优先' },
    { label: '收件文件', value: inboxFiles.length, accent: '--accent', hint: '本地收件' },
    { label: '在办项目', value: projects.filter((p) => p.status !== '完结' && p.status !== 'done').length, accent: '--warning', hint: '进行中' }
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 'var(--space-2)',
        height: '100%',
        minHeight: 0
      }}
    >
      {cards.map((c) => (
        <button
          key={c.label}
          onClick={() => setModule(c.label === '收件文件' ? 'projects' : 'home')}
          title={`${c.label} · ${c.hint}，点击前往`}
          style={{
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 2,
            padding: '0.4rem 0.7rem',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text-1)'
          }}
        >
          <span style={{ fontSize: '1.6rem', fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: `var(${c.accent})` }}>
            {c.value}
          </span>
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-2)' }}>{c.label}</span>
          <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>{c.hint}</span>
        </button>
      ))}
    </div>
  )
}

export function renderWidget(kind: WidgetKind, item: LayoutItem, onMeta: (patch: Record<string, unknown>) => void): ReactNode {
  switch (kind) {
    case 'ai':
      return <AIWidget />
    case 'today':
      return <TodayWidget />
    case 'clock':
      return <ClockWidget />
    case 'tasks':
      return <TasksWidget />
    case 'continue':
      return <ContinueWidget />
    case 'inbox':
      return <InboxWidget />
    case 'recent-files':
      return <RecentFilesWidget />
    case 'apps':
      return <SoftwareWidget />
    case 'images':
      return <ImagesWidget />
    case 'docs':
      return <DocsWidget />
    case 'folders':
      return <FoldersBoxWidget />
    case 'videos':
      return <VideosWidget />
    case 'clipboard':
      return <ClipboardWidget />
    case 'sysmon':
      return <SysmonWidget />
    case 'quote':
      return <QuoteWidget />
    case 'weather':
      return <WeatherWidget item={item} onMeta={onMeta} />
    case 'pomodoro':
      return <PomodoroWidget />
    case 'countdown':
      return <CountdownWidget item={item} onMeta={onMeta} />
    case 'sticky':
      return <StickyWidget item={item} onMeta={onMeta} />
    case 'album':
      return <AlbumWidget />
    case 'digest':
      return <DigestWidget />
    case 'flow':
      return <FlowWidget />
    default:
      return <div className="file-meta">未知组件</div>
  }
}
