import { useEffect, useMemo, useState } from 'react'
import {
  ChatCircleDots,
  MagnifyingGlass,
  Plus,
  Trash,
  ArrowLeft,
  Clock
} from '@phosphor-icons/react'
import { useAppStore } from '../store'

interface ChatSession {
  id: string
  title: string
  preview: string
  updatedAt: number
  unread: number
}

const STORAGE_KEY = 'workdeck-ai-sessions-v1'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSessions(list: ChatSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore quota errors */
  }
}

function relTime(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

export function AIMessagesPage() {
  const setModule = useAppStore((s) => s.setModule)
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions)

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => !q || s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessions, query])

  const addSession = () => {
    const id = `s_${Date.now()}`
    const now = Date.now()
    setSessions((prev) => [
      { id, title: '新会话', preview: '点击前往 AI 助手继续对话…', updatedAt: now, unread: 0 },
      ...prev
    ])
    setModule('ai')
  }

  const removeSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <main className="workspace">
      <div className="page-header">
        <button className="icon-btn" onClick={() => setModule('ai')} title="返回 AI 助手">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>AI 消息平台</h1>
          <div className="sub">集中管理所有 AI 对话会话</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={addSession}>
          <Plus size={13} style={{ marginRight: 4 }} />
          新建会话
        </button>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1, minHeight: 0 }}>
        <div className="palette-input-wrap" style={{ maxWidth: 360 }}>
          <MagnifyingGlass size={16} />
          <input
            className="palette-input"
            placeholder="搜索会话标题或内容…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <ChatCircleDots size={40} color="var(--text-3)" />
            <div className="empty-state-title">暂无会话</div>
            <div className="empty-state-sub">所有在 AI 助手中的对话都会在这里列出，方便集中查找和继续。</div>
            <button className="btn btn-primary btn-sm" onClick={addSession}>
              <Plus size={13} style={{ marginRight: 4 }} />
              新建会话
            </button>
          </div>
        ) : (
          <div className="ai-msg-list">
            {filtered.map((s) => (
              <div key={s.id} className="ai-msg-row">
                <div className="ai-msg-row-main" onClick={() => setModule('ai')}>
                  <ChatCircleDots size={18} className="ai-msg-row-ico" />
                  <div className="ai-msg-row-body">
                    <div className="ai-msg-row-top">
                      <span className="ai-msg-row-title">{s.title}</span>
                      <span className="file-meta"><Clock size={11} style={{ verticalAlign: -1, marginRight: 3 }} />{relTime(s.updatedAt)}</span>
                    </div>
                    <div className="ai-msg-row-preview">{s.preview}</div>
                  </div>
                </div>
                <button className="ai-msg-row-del" onClick={() => removeSession(s.id)} title="删除会话">
                  <Trash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
