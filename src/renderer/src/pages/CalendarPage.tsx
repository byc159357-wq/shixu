import { useEffect, useMemo, useState } from 'react'
import {
  CaretLeft,
  CaretRight,
  Plus,
  Export,
  UploadSimple,
  Trash,
  CalendarDots,
  Hourglass
} from '@phosphor-icons/react'
import { useAppStore } from '../store'
import { Button, EmptyState, Modal, Select } from '../components/ui'
import type { CalendarEvent, CalendarRange, EventInput } from '../../../shared/types'

type ViewMode = 'month' | 'week' | 'agenda'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toLocalInput(d: Date): string {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function CalendarPage() {
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [data, setData] = useState<CalendarRange>({ events: [], scheduledTasks: [] })
  const [showNew, setShowNew] = useState(false)
  const [newEventDate, setNewEventDate] = useState<Date | null>(null)
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const projects = useAppStore((s) => s.projects)
  const pushToast = useAppStore((s) => s.pushToast)

  const range = useMemo(() => {
    const from = startOfDay(cursor)
    const to = new Date(from)
    to.setDate(from.getDate() + 62) // month view needs up to 6 weeks ahead
    return { from: from.toISOString(), to: to.toISOString() }
  }, [cursor])

  const load = () => {
    void window.workdeck.calendar.listRange(range.from, range.to).then(setData)
  }
  useEffect(load, [range.from, range.to])

  const projectColor = (pid: string | null) =>
    projects.find((p) => p.id === pid)?.color ?? 'var(--accent)'

  const monthGrid = useMemo(() => {
    // Monday-first grid of 6 weeks covering the cursor month
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7 // Monday=0
    const start = startOfDay(first)
    start.setDate(first.getDate() - offset)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }, [cursor])

  const eventsOn = (d: Date) => {
    const key = dateKey(d)
    const evs = data.events.filter((e) => e.all_day === 1 ? e.start_at.slice(0, 10) === key : e.start_at.slice(0, 10) === key)
    const tasks = data.scheduledTasks.filter((t) => t.start_at.slice(0, 10) === key)
    return { evs, tasks }
  }

  const moveMonth = (delta: number) => {
    const d = new Date(cursor)
    d.setMonth(d.getMonth() + delta)
    setCursor(startOfDay(d))
  }

  const moveWeek = (delta: number) => {
    const d = new Date(cursor)
    d.setDate(d.getDate() + 7 * delta)
    setCursor(startOfDay(d))
  }

  const openNewEvent = (date?: Date) => {
    setNewEventDate(date ? startOfDay(date) : startOfDay(cursor))
    setShowNew(true)
  }

  const navLabel =
    view === 'month'
      ? `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`
      : `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月 ${cursor.getDate()} 日`

  return (
    <main className="workspace">
      <div className="sub">事件 + 排期任务（Phase 7）· 支持 ICS 导入导出</div>

      <div className="card calendar-workbench">
        <div className="card-head calendar-toolbar">
          <div className="calendar-nav">
            <button className="icon-btn" onClick={() => (view === 'month' ? moveMonth(-1) : moveWeek(-1))}>
              <CaretLeft size={15} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setCursor(startOfDay(new Date()))}>
              今天
            </button>
            <button className="icon-btn" onClick={() => (view === 'month' ? moveMonth(1) : moveWeek(1))}>
              <CaretRight size={15} />
            </button>
            <span style={{ fontSize: 'var(--fs-title)', fontWeight: 600, marginLeft: 8 }}>{navLabel}</span>
          </div>
          <div className="calendar-actions">
            <button className="btn btn-secondary btn-sm" title="导出 ICS" onClick={() => void window.workdeck.calendar.exportIcs().then((p: string | null) => p && pushToast('success', `已导出：${p}`))}>
              <Export size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              导出
            </button>
            <button className="btn btn-secondary btn-sm" title="导入 ICS" onClick={() => void window.workdeck.calendar.importIcs().then((n: number | null) => n !== null && (pushToast('success', `已导入 ${n} 个事件`), load()))}>
              <UploadSimple size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              导入
            </button>
            <Button size="sm" variant="primary" onClick={() => openNewEvent()}>
              <Plus size={13} weight="bold" style={{ marginRight: 4, verticalAlign: -2 }} />
              新建事件
            </Button>
          </div>
        </div>

        <div className="tabs calendar-mode-tabs" role="tablist">
          {(
            [
              ['month', '月'],
              ['week', '周'],
              ['agenda', '议程']
            ] as Array<[ViewMode, string]>
          ).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} className={`tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>

        {view === 'month' && (
          <div className="calendar-month-view">
            <div className="calendar-month-hint">点击任意日期即可新建事件</div>
            <div className="calendar-weekdays">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="calendar-days-grid">
              {monthGrid.map((d) => {
                const { evs, tasks } = eventsOn(d)
                const inMonth = d.getMonth() === cursor.getMonth()
                const isToday = dateKey(d) === dateKey(new Date())
                return (
                  <div
                    key={d.toISOString()}
                    onClick={() => openNewEvent(d)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openNewEvent(d)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`新建 ${dateKey(d)} 的事件`}
                    className={`calendar-day-cell ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`}
                  >
                    <div className="calendar-day-number">
                      {d.getDate()}
                    </div>
                    <Plus className="calendar-day-add" size={13} weight="bold" aria-hidden="true" />
                    {evs.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        title={e.title}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setEditing(e)
                        }}
                        className="calendar-event-chip"
                        style={{ background: projectColor(e.project_id) }}
                      >
                        {e.all_day === 0 && `${e.start_at.slice(11, 16)} `}
                        {e.title}
                      </div>
                    ))}
                    {tasks.slice(0, 2).map((t) => (
                      <div
                        key={t.id}
                        title={`任务：${t.title}`}
                        className="calendar-task-chip"
                      >
                        ⬤ {t.title}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'week' && <WeekView data={data} cursor={cursor} onEdit={setEditing} projectColor={projectColor} />}
        {view === 'agenda' && <AgendaView data={data} cursor={cursor} onEdit={setEditing} projectColor={projectColor} />}
      </div>

      <CalendarCountdown />

      {showNew && <EventModal initialDate={newEventDate ?? undefined} onClose={() => setShowNew(false)} onSaved={load} />}
      {editing && <EventModal event={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </main>
  )
}

function WeekView({
  data,
  cursor,
  onEdit,
  projectColor
}: {
  data: CalendarRange
  cursor: Date
  onEdit: (e: CalendarEvent) => void
  projectColor: (pid: string | null) => string
}) {
  const HOUR_H = 26
  const week = useMemo(() => {
    const monday = startOfDay(cursor)
    monday.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
  }, [cursor])

  const onDay = (d: Date) => {
    const key = dateKey(d)
    return {
      evs: data.events.filter((e) => e.start_at.slice(0, 10) === key),
      tasks: data.scheduledTasks.filter((t) => t.start_at.slice(0, 10) === key)
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
      {/* time gutter */}
      <div style={{ width: 44, flexShrink: 0 }}>
        <div style={{ height: 22 }} />
        {hours.map((h) => (
          <div
            key={h}
            className="file-meta"
            style={{ height: HOUR_H, fontSize: 'var(--fs-micro)', textAlign: 'right', paddingRight: 6, transform: 'translateY(-9px)' }}
          >
            {`${pad(h)}:00`}
          </div>
        ))}
      </div>
      {week.map((d) => {
        const { evs, tasks } = onDay(d)
        const isToday = dateKey(d) === dateKey(new Date())
        return (
          <div
            key={d.toISOString()}
            style={{
              flex: 1,
              minWidth: 96,
              position: 'relative',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              height: HOUR_H * 24,
              outline: isToday ? '1px solid var(--accent)' : undefined,
              overflow: 'hidden'
            }}
          >
            {/* day header */}
            <div
              className="file-meta"
              style={{
                position: 'absolute',
                top: 2,
                left: 0,
                right: 0,
                textAlign: 'center',
                zIndex: 2,
                fontSize: 'var(--fs-micro)',
                background: 'var(--surface-1)'
              }}
            >
              {WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]} {d.getDate()}
            </div>
            {/* hour gridlines */}
            {hours.map((h) => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: h * HOUR_H + 22,
                  borderTop: h % 3 === 0 ? '1px solid var(--border)' : '1px solid rgba(255,255,255,0.05)'
                }}
              />
            ))}
            {/* all-day tasks pinned at top */}
            {tasks.map((t) => (
              <div
                key={t.id}
                title={`任务：${t.title}`}
                style={{
                  position: 'absolute',
                  left: 4,
                  right: 4,
                  top: 22,
                  zIndex: 1,
                  fontSize: 'var(--fs-micro)',
                  borderRadius: 4,
                  padding: '4px',
                  background: 'rgba(245,165,36,0.25)',
                  color: 'var(--warning)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                ⬤ {t.title}
              </div>
            ))}
            {/* timed events positioned on the 24h axis */}
            {evs.map((e) => {
              const startMin = Number(e.start_at.slice(11, 13)) * 60 + Number(e.start_at.slice(14, 16))
              const endMin =
                (e.all_day === 1 ? 24 * 60 : Number(e.end_at.slice(11, 13)) * 60 + Number(e.end_at.slice(14, 16)))
              const top = (e.all_day === 1 ? 22 : (startMin / 60) * HOUR_H + 22)
              const height = e.all_day === 1 ? 22 : Math.max(20, ((endMin - startMin) / 60) * HOUR_H)
              return (
                <div
                  key={e.id}
                  onClick={() => onEdit(e)}
                  style={{
                    position: 'absolute',
                    left: 4,
                    right: 4,
                    top,
                    height,
                    zIndex: 1,
                    fontSize: 'var(--fs-micro)',
                    borderRadius: 4,
                    padding: '4px',
                    background: projectColor(e.project_id),
                    color: '#fff',
                    cursor: 'pointer',
                    overflow: 'hidden'
                  }}
                >
                  {e.all_day === 0 && `${e.start_at.slice(11, 16)} `}
                  {e.title}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function AgendaView({
  data,
  cursor,
  onEdit,
  projectColor
}: {
  data: CalendarRange
  cursor: Date
  onEdit: (e: CalendarEvent) => void
  projectColor: (pid: string | null) => string
}) {
  const days = useMemo(() => {
    const start = startOfDay(cursor)
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const items = days
    .map((d) => {
      const key = dateKey(d)
      const evs = data.events
        .filter((e) => e.start_at.slice(0, 10) === key)
        .map((e) => ({ ...e, isTask: false }))
      const tasks = data.scheduledTasks
        .filter((t) => t.start_at.slice(0, 10) === key)
        .map((t) => ({ ...t, isTask: true }))
      return { date: d, items: [...evs, ...tasks].sort((a, b) => a.start_at.localeCompare(b.start_at)) }
    })
    .filter((d) => d.items.length > 0)

  if (items.length === 0) {
    return <EmptyState icon={<CalendarDots size={40} weight="thin" />} title="未来 30 天没有安排" hint="新建事件或给任务设置排期日期" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(({ date, items: dayItems }) => (
        <div key={dateKey(date)}>
          <div className="file-meta" style={{ marginBottom: 4 }}>
            {date.getMonth() + 1} 月 {date.getDate()} 日{dateKey(date) === dateKey(new Date()) ? '（今天）' : ''}
          </div>
          {dayItems.map((it) => (
            <div
              key={`${it.isTask ? 'task' : 'evt'}-${it.id}`}
              className="file-row"
              style={{ minHeight: 0, padding: '0.5rem 0.5rem' }}
              onClick={() => !it.isTask && onEdit(it as CalendarEvent)}
            >
              <span
                className="badge badge-neutral"
                style={{ background: it.isTask ? 'rgba(245,165,36,0.25)' : projectColor(it.project_id), color: it.isTask ? 'var(--warning)' : '#fff', minWidth: 44, textAlign: 'center' }}
              >
                {it.isTask ? '任务' : it.all_day === 0 ? it.start_at.slice(11, 16) : '全天'}
              </span>
              <span className="file-main">
                <div className="file-name">{it.title}</div>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function initialEventTimes(date?: Date): { start: Date; end: Date } {
  const start = date ? startOfDay(date) : new Date()
  if (date) start.setHours(9, 0, 0, 0)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return { start, end }
}

type CountdownTarget = {
  id: string
  title: string
  target: string
}

const COUNTDOWN_STORAGE_KEY = 'workdeck.calendar.countdowns'

function CalendarCountdown() {
  const [now, setNow] = useState(() => new Date())
  const [items, setItems] = useState<CountdownTarget[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(COUNTDOWN_STORAGE_KEY) ?? '[]')
      return Array.isArray(stored) ? stored.filter((item): item is CountdownTarget => typeof item?.id === 'string' && typeof item?.title === 'string' && typeof item?.target === 'string') : []
    } catch {
      return []
    }
  })
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { localStorage.setItem(COUNTDOWN_STORAGE_KEY, JSON.stringify(items)) }, [items])

  const targets = items
    .map((item) => ({ ...item, date: new Date(`${item.target}T23:59:59`) }))
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  const add = () => {
    if (!title.trim() || !target) return
    setItems((current) => [...current, { id: `${Date.now()}-${Math.random()}`, title: title.trim(), target }])
    setTitle('')
    setTarget('')
  }

  return (
    <section className="card calendar-countdown-panel" aria-label="倒计时">
      <div className="calendar-countdown-head">
        <Hourglass size={16} weight="duotone" aria-hidden="true" />
        <h3>倒计时</h3>
        <span>在此直接设置重要日期</span>
      </div>
      <div className="calendar-countdown-form">
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：旅行出发" aria-label="倒计时名称" onKeyDown={(event) => event.key === 'Enter' && add()} />
        <input className="input" type="date" value={target} onChange={(event) => setTarget(event.target.value)} aria-label="倒计时日期" />
        <Button variant="primary" onClick={add} disabled={!title.trim() || !target}><Plus size={14} aria-hidden="true" /> 添加倒计时</Button>
      </div>
      {targets.length === 0 ? (
        <div className="calendar-countdown-empty">还没有倒计时。输入名称与目标日期即可创建。</div>
      ) : (
        <div className="calendar-countdown-grid">
          {targets.map((item) => (
            <div className="calendar-countdown-item" key={item.id}>
              <div className="calendar-countdown-copy">
                <strong title={item.title}>{item.title}</strong>
                <small>{item.date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', year: 'numeric' })}</small>
              </div>
              <time className="calendar-countdown-time" dateTime={item.date.toISOString()}>{countdownLabel(item.date, now)}</time>
              <button className="mini-btn danger" aria-label={`删除倒计时：${item.title}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash size={13} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function countdownLabel(target: Date, now: Date): string {
  const totalMinutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分`
}

function EventModal({ event, initialDate, onClose, onSaved }: { event?: CalendarEvent; initialDate?: Date; onClose: () => void; onSaved: () => void }) {
  const projects = useAppStore((s) => s.projects)
  const pushToast = useAppStore((s) => s.pushToast)
  const initial = initialEventTimes(initialDate)
  const [title, setTitle] = useState(event?.title ?? '')
  const [startAt, setStartAt] = useState(event ? event.start_at.slice(0, 16) : toLocalInput(initial.start))
  const [endAt, setEndAt] = useState(event ? event.end_at.slice(0, 16) : toLocalInput(initial.end))
  const [allDay, setAllDay] = useState(event ? event.all_day === 1 : false)
  const [projectId, setProjectId] = useState(event?.project_id ?? '')

  const save = async () => {
    const input: EventInput = {
      title,
      startAt: allDay ? startAt.slice(0, 10) + 'T00:00:00' : startAt + ':00',
      endAt: allDay ? endAt.slice(0, 10) + 'T23:59:59' : endAt + ':00',
      allDay,
      projectId: projectId || null
    }
    try {
      if (event) await window.workdeck.calendar.update(event.id, input)
      else await window.workdeck.calendar.create(input)
      pushToast('success', event ? '事件已更新' : '事件已创建')
      onSaved()
      onClose()
    } catch (err) {
      pushToast('error', String(err))
    }
  }

  const remove = async () => {
    if (!event) return
    if (confirm(`删除事件「${event.title}」？`)) {
      await window.workdeck.calendar.remove(event.id)
      pushToast('info', '事件已删除')
      onSaved()
      onClose()
    }
  }

  return (
    <Modal
      title={event ? '编辑事件' : '新建事件'}
      onClose={onClose}
      footer={
        <>
          {event && (
            <Button variant="danger" onClick={() => void remove()} style={{ marginRight: 'auto' }}>
              <Trash size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              删除
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!title.trim()}>
            保存
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="label">标题</span>
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
      </div>
      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-body-sm)', color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          全天
        </label>
      </div>
      <div className="field">
        <span className="label">开始</span>
        <input className="input" type={allDay ? 'date' : 'datetime-local'} value={allDay ? startAt.slice(0, 10) : startAt} onChange={(e) => setStartAt(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">结束</span>
        <input className="input" type={allDay ? 'date' : 'datetime-local'} value={allDay ? endAt.slice(0, 10) : endAt} onChange={(e) => setEndAt(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">关联项目</span>
        <Select
          value={projectId}
          onChange={(v) => setProjectId(v)}
          options={[
            { label: '（无）', value: '' },
            ...projects.map((p) => ({ label: p.name, value: p.id }))
          ]}
        />
      </div>
    </Modal>
  )
}
