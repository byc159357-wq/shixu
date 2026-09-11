import { useMemo, useState } from 'react'
import { ChatCircleDots, Clock, Plus, Trash, ArrowLeft } from '@phosphor-icons/react'
import { useAppStore } from '../store'
import { useHermesStore } from '../components/hermes/HermesStore'

function relTime(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

export function HermesMessagesPage() {
  const setModule = useAppStore((state) => state.setModule)
  const history = useHermesStore((state) => state.history)
  const updateHistory = useHermesStore((state) => state.updateHistory)
  const setActiveSession = useHermesStore((state) => state.setActiveSession)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return history.filter((session) => !needle || session.title.toLowerCase().includes(needle) || (session.preview ?? '').toLowerCase().includes(needle))
  }, [history, query])

  const addSession = () => {
    setActiveSession(null)
    setModule('hermes')
  }

  const removeSession = (id: string) => {
    updateHistory((sessions) => sessions.filter((session) => session.id !== id))
  }

  return (
    <main className="workspace hermes-aux-page">
      <div className="page-header">
        <button className="icon-btn" onClick={() => setModule('hermes')} title="返回 Hermes 工作中心"><ArrowLeft size={18} /></button>
        <div>
          <h1>Hermes 消息</h1>
          <div className="sub">所有 Hermes 工作任务都会在这里保留，方便继续处理。</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={addSession}><Plus size={13} style={{ marginRight: 4 }} />新建任务</button>
      </div>
      <div className="card hermes-aux-card">
        <div className="palette-input-wrap hermes-aux-search" style={{ maxWidth: 360 }}>
          <ChatCircleDots size={16} />
          <input className="palette-input" placeholder="搜索任务标题或内容…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state hermes-aux-empty"><ChatCircleDots size={40} color="var(--text-3)" /><div className="empty-state-title">暂无任务</div><div className="empty-state-sub">在 Hermes 工作中心开始一个任务后，它会自动出现在这里。</div><button className="btn btn-primary btn-sm" onClick={addSession}><Plus size={13} style={{ marginRight: 4 }} />新建任务</button></div>
        ) : (
          <div className="hermes-history-list">
            {filtered.map((session) => (
              <div key={session.id} className="hermes-history-row">
                <button type="button" className="hermes-history-main" onClick={() => { setActiveSession(session.id); setModule('hermes') }}>
                  <ChatCircleDots size={18} />
                  <span><strong>{session.title}</strong><small>{session.preview || '继续这个任务'}</small></span>
                  <time><Clock size={11} />{relTime(session.ts)}</time>
                </button>
                <button type="button" className="hermes-history-delete" onClick={() => removeSession(session.id)} title="删除任务"><Trash size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
