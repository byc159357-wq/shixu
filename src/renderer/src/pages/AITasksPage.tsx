import { useEffect, useMemo, useState } from 'react'
import {
  Clock,
  Plus,
  Trash,
  ArrowLeft,
  Play,
  Pause,
  CalendarBlank
} from '@phosphor-icons/react'
import { useAppStore } from '../store'

export type ScheduleFreq = 'once' | 'hourly' | 'daily' | 'weekly'

export interface AITask {
  id: string
  name: string
  prompt: string
  freq: ScheduleFreq
  enabled: boolean
  lastRun?: number
  nextRun?: number
}

const STORAGE_KEY = 'workdeck-ai-tasks-v1'

function loadTasks(): AITask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AITask[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveTasks(list: AITask[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function freqLabel(f: ScheduleFreq) {
  switch (f) {
    case 'once': return '仅一次'
    case 'hourly': return '每小时'
    case 'daily': return '每天'
    case 'weekly': return '每周'
  }
}

function computeNextRun(freq: ScheduleFreq, base: number): number {
  switch (freq) {
    case 'once': return base
    case 'hourly': return base + 60 * 60 * 1000
    case 'daily': return base + 24 * 60 * 60 * 1000
    case 'weekly': return base + 7 * 24 * 60 * 60 * 1000
  }
}

export function AITasksPage() {
  const setModule = useAppStore((s) => s.setModule)
  const [tasks, setTasks] = useState<AITask[]>(loadTasks)
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftFreq, setDraftFreq] = useState<ScheduleFreq>('daily')

  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => (b.nextRun ?? 0) - (a.nextRun ?? 0))
  }, [tasks])

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const enabled = !t.enabled
        const nextRun = enabled ? computeNextRun(t.freq, Date.now()) : undefined
        return { ...t, enabled, nextRun }
      })
    )
  }

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const addTask = () => {
    if (!draftName.trim() || !draftPrompt.trim()) return
    const id = `task_${Date.now()}`
    const now = Date.now()
    setTasks((prev) => [
      {
        id,
        name: draftName.trim(),
        prompt: draftPrompt.trim(),
        freq: draftFreq,
        enabled: true,
        nextRun: computeNextRun(draftFreq, now)
      },
      ...prev
    ])
    setDraftName('')
    setDraftPrompt('')
    setDraftFreq('daily')
    setAdding(false)
  }

  const runNow = (t: AITask) => {
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, lastRun: Date.now(), nextRun: computeNextRun(x.freq, Date.now()) } : x))
    )
    setModule('ai')
  }

  return (
    <main className="workspace">
      <div className="page-header">
        <button className="icon-btn" onClick={() => setModule('ai')} title="返回 AI 助手">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>AI 定时任务</h1>
          <div className="sub">让 AI 按固定周期自动执行提示词，结果汇总到产物库</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={13} style={{ marginRight: 4 }} />
          新建任务
        </button>
      </div>

      {adding && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="ai-task-form-row">
            <label>任务名称</label>
            <input
              className="palette-input"
              placeholder="例如：每日代码审查"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </div>
          <div className="ai-task-form-row">
            <label>提示词</label>
            <textarea
              className="palette-input"
              rows={3}
              placeholder="让 AI 执行什么？"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
            />
          </div>
          <div className="ai-task-form-row">
            <label>周期</label>
            <select className="palette-input ai-select" value={draftFreq} onChange={(e) => setDraftFreq(e.target.value as ScheduleFreq)}>
              <option value="once">仅一次</option>
              <option value="hourly">每小时</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
            </select>
          </div>
          <div className="ai-task-form-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={addTask}>保存</button>
          </div>
        </div>
      )}

      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {sorted.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <Clock size={40} color="var(--text-3)" />
            <div className="empty-state-title">暂无定时任务</div>
            <div className="empty-state-sub">创建周期性提示词任务，AI 会自动运行并把结果保存到产物库。</div>
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <Plus size={13} style={{ marginRight: 4 }} />
              新建任务
            </button>
          </div>
        ) : (
          <div className="ai-task-list">
            {sorted.map((t) => (
              <div key={t.id} className={`ai-task-row ${!t.enabled ? 'disabled' : ''}`}>
                <div className="ai-task-row-main">
                  <div className="ai-task-row-ico">
                    {t.enabled ? <Clock size={18} /> : <Pause size={18} />}
                  </div>
                  <div className="ai-task-row-body">
                    <div className="ai-task-row-top">
                      <span className="ai-task-row-name">{t.name}</span>
                      <span className="badge badge-neutral">{freqLabel(t.freq)}</span>
                    </div>
                    <div className="ai-task-row-prompt">{t.prompt}</div>
                    <div className="ai-task-row-meta">
                      {t.lastRun && <span><CalendarBlank size={11} style={{ verticalAlign: -1, marginRight: 3 }} />上次：{new Date(t.lastRun).toLocaleString('zh-CN')}</span>}
                      {t.nextRun && t.enabled && <span><Clock size={11} style={{ verticalAlign: -1, marginRight: 3 }} />下次：{new Date(t.nextRun).toLocaleString('zh-CN')}</span>}
                    </div>
                  </div>
                </div>
                <div className="ai-task-row-acts">
                  <button className="ai-icon-btn" onClick={() => runNow(t)} title="立即执行并跳转 AI 助手">
                    <Play size={16} />
                  </button>
                  <button className="ai-icon-btn" onClick={() => toggleTask(t.id)} title={t.enabled ? '暂停' : '启用'}>
                    {t.enabled ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button className="ai-icon-btn" onClick={() => removeTask(t.id)} title="删除">
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
