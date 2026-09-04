import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { X, FileText, Folder, Sparkle, ArrowsOutSimple } from '@phosphor-icons/react'
import type { LibraryFile, Note } from '../../../shared/types'
import { projectStatusLabel } from '../lib/labels'

/**
 * Right-edge detail drawer. Replaces the previous fixed context-panel.
 * Opens when the store has a `selectedDetail`; closes on outside click or Esc.
 */
export function DetailPopover() {
  const selected = useAppStore((s) => s.selectedDetail)
  const closeDetail = useAppStore((s) => s.closeDetail)
  const archiveProject = useAppStore((s) => s.archiveProject)
  const projects = useAppStore((s) => s.projects)
  const libraryFiles = useAppStore((s) => s.libraryFiles)
  const selectProject = useAppStore((s) => s.selectProject)

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, closeDetail])

  if (!selected) return null

  return (
    <>
      {/* Click outside to dismiss */}
      <div
        aria-hidden
        onClick={closeDetail}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'transparent',
          zIndex: 90
        }}
      />
      <aside
        className="lg-card motion-modal-enter"
        role="dialog"
        aria-label="详情"
        style={{
          position: 'fixed',
          top: 56,
          right: 16,
          // Hug the content — no more huge empty area at the bottom.
          // Cap height so it stays on-screen on short viewports.
          maxHeight: 'calc(100vh - 72px)',
          width: 340,
          // Padding tuned for breathing room without large top/bottom voids:
          // • top/bottom kept compact so content sits centred in the card
          // • sides wide so labels and values sit clear of the card edge
          padding: 'var(--space-3) var(--space-6)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          overflow: 'auto'
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-1)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700 }}>
            {selected.kind === 'project' ? '项目详情' : selected.kind === 'file' ? '文件详情' : '笔记详情'}
          </div>
          <button
            onClick={closeDetail}
            aria-label="关闭"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 2
            }}
          >
            <X size={14} />
          </button>
        </header>

        {selected.kind === 'project' && (
          <ProjectDetail id={selected.id} projects={projects} libraryFiles={libraryFiles} />
        )}
        {selected.kind === 'file' && <FileDetail id={selected.id} libraryFiles={libraryFiles} />}
        {selected.kind === 'note' && <NoteDetail id={selected.id} />}

        <footer style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ flex: 1 }}
            onClick={() => {
              void selectProject(selected.id)
              closeDetail()
            }}
            disabled={selected.kind !== 'project'}
          >
            <ArrowsOutSimple size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            进入详情页
          </button>
          {selected.kind === 'project' && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                void archiveProject(selected.id)
                closeDetail()
              }}
            >
              归档
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={closeDetail}>
            关闭
          </button>
        </footer>
      </aside>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--text-3)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 4
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--fs-body-sm)',
          color: 'var(--text-1)',
          letterSpacing: 'var(--tr-body)',
          lineHeight: 1.4
        }}
      >
        {children}
      </div>
    </div>
  )
}

function ProjectDetail({
  id,
  projects,
  libraryFiles
}: {
  id: string
  projects: { id: string; name: string; status: string; deadline?: string | null; color?: string; description?: string; created_at?: string; updated_at?: string }[]
  libraryFiles: LibraryFile[]
}) {
  const updateProject = useAppStore((s) => s.updateProject)
  const openDetail = useAppStore((s) => s.openDetail)
  const p = projects.find((x) => x.id === id)
  if (!p) return <div style={{ color: 'var(--text-3)' }}>项目不存在或已删除</div>

  const fileCount = libraryFiles.filter((f) => f.projects.includes(p.id)).length
  const related = libraryFiles.filter((f) => f.projects.includes(p.id)).slice(0, 5)
  const dl = relativeDeadline(p.deadline)

  return (
    <>
      {/* Title group — colour dot + name (primary focus) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          className="project-dot"
          style={{
            background: p.color ?? 'var(--accent)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0
          }}
        />
        <h2
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: 'var(--tr-display)',
            lineHeight: 1.2,
            flex: 1,
            wordBreak: 'break-word'
          }}
        >
          {p.name}
        </h2>
      </div>
      {p.description && <Row label="描述">{p.description}</Row>}

      {/* Status switcher — one tap, no navigation */}
      <div>
        <div style={rowLabel}>状态</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {(['active', 'paused', 'completed'] as const).map((st) => (
            <button
              key={st}
              className={`btn btn-sm ${p.status === st ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => void updateProject(p.id, { status: st })}
            >
              {projectStatusLabel(st)}
            </button>
          ))}
        </div>
      </div>

      {/* Deadline with relative time */}
      <Row label="截止">
        {dl ? (
          <span
            className="badge"
            style={{
              color: dl.tone === 'danger' ? 'var(--danger)' : dl.tone === 'warn' ? 'var(--warning)' : 'var(--text-2)',
              background:
                dl.tone === 'danger' ? 'var(--danger-soft)' : dl.tone === 'warn' ? 'var(--warning-soft)' : 'var(--hover-bg)'
            }}
          >
            {new Date(p.deadline as string).toLocaleDateString('zh-CN')} · {dl.text}
          </span>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>未设置</span>
        )}
      </Row>

      {/* Meta timestamps */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <Row label="创建时间">
          {p.created_at ? new Date(p.created_at).toLocaleDateString('zh-CN') : '—'}
        </Row>
        <Row label="更新时间">
          {p.updated_at ? new Date(p.updated_at).toLocaleDateString('zh-CN') : '—'}
        </Row>
      </div>

      {/* Related files — mini list, click to open its detail */}
      <div style={{ marginTop: 'var(--space-1)' }}>
        <div style={{ ...rowLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>关联文件</span>
          <span style={{ textTransform: 'none', letterSpacing: 'var(--tr-caption)', color: 'var(--text-3)' }}>
            {fileCount} 个
          </span>
        </div>
        {related.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-caption)', marginTop: 8 }}>
            暂无关联文件
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {related.map((f) => (
              <button
                key={f.id}
                className="file-row"
                style={{ minHeight: 0, padding: '0.5rem 0.5rem' }}
                onClick={() => openDetail({ kind: 'file', id: f.id })}
              >
                <FileText size={13} style={{ flexShrink: 0 }} />
                <span className="file-name" style={{ fontSize: 'var(--fs-caption)' }}>
                  {f.name}
                </span>
              </button>
            ))}
            {fileCount > related.length && (
              <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-caption)', padding: '0.25rem 0.5rem' }}>
                +{fileCount - related.length} 更多…
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

const rowLabel: React.CSSProperties = {
  fontSize: 'var(--fs-micro)',
  color: 'var(--text-3)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase'
}

/** Relative deadline label — makes the due date immediately readable. */
function relativeDeadline(d?: string | null): { text: string; tone: 'danger' | 'warn' | 'ok' } | null {
  if (!d) return null
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { text: `已过期 ${-days} 天`, tone: 'danger' }
  if (days === 0) return { text: '今天截止', tone: 'warn' }
  if (days === 1) return { text: '明天截止', tone: 'warn' }
  if (days <= 7) return { text: `${days} 天后截止`, tone: 'warn' }
  return { text: `${days} 天后截止`, tone: 'ok' }
}

function FileDetail({ id, libraryFiles }: { id: string; libraryFiles: LibraryFile[] }) {
  const f = libraryFiles.find((x) => x.id === id)
  const loadLibrary = useAppStore((s) => s.loadLibrary)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    setTags(tagsOf(f?.tags_json))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!f) return <div style={{ color: 'var(--text-3)' }}>文件不存在或已移除</div>

  const persistTags = async (next: string[]) => {
    setTags(next)
    try {
      await window.workdeck.file.updateTags(f.id, next)
      await loadLibrary()
    } catch {
      /* ignore — keep local tags so the user can retry */
    }
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagInput('')
      return
    }
    setTagInput('')
    void persistTags([...tags, t])
  }

  const removeTag = (t: string) => void persistTags(tags.filter((x) => x !== t))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileText size={18} weight="duotone" />
        <h2 style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 600, wordBreak: 'break-all', flex: 1 }}>{f.name}</h2>
      </div>
      <Row label="使用情况">
        {f.openCount > 0
          ? `打开 ${f.openCount} 次${f.lastOpenedAt ? ` · 最近 ${relTime(f.lastOpenedAt)}` : ''}`
          : '尚未打开过'}
      </Row>
      <Row label="类型">{f.type}</Row>
      <Row label="路径">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', wordBreak: 'break-all' }}>{f.path}</span>
      </Row>
      <Row label="大小">{formatSize(f.size)}</Row>
      {f.projects.length > 0 && (
        <Row label="所属项目">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {f.projects.map((p) => (
              <span key={p} className="badge badge-neutral">
                <Folder size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                {p}
              </span>
            ))}
          </div>
        </Row>
      )}
      <Row label="标签">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {tags.map((t) => (
            <span key={t} className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {t}
              <button
                className="icon-btn"
                title="移除标签"
                style={{ padding: 0, width: 14, height: 14, fontSize: 10, lineHeight: 1 }}
                onClick={() => removeTag(t)}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            className="input"
            style={{ flex: 1, minWidth: 88, height: 22, padding: '0 6px', fontSize: 'var(--fs-caption)' }}
            placeholder={tags.length ? '回车添加' : '添加标签…'}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag()
            }}
          />
        </div>
      </Row>
      <Row label="状态">
        {f.status === 'missing' ? <span className="badge badge-missing">已缺失</span> : <span className="badge badge-available">就绪</span>}
      </Row>
    </>
  )
}

function NoteDetail({ id }: { id: string }) {
  const [note, setNote] = useState<Note | null>(null)
  useEffect(() => {
    let alive = true
    void window.workdeck.note
      .get(id)
      .then((nc: Note | null) => alive && setNote(nc))
      .catch(() => alive && setNote(null))
    return () => {
      alive = false
    }
  }, [id])
  if (!note) return <div style={{ color: 'var(--text-3)' }}>加载中…</div>
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkle size={18} weight="duotone" />
        <h2 style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 600 }}>{note.title}</h2>
      </div>
      <Row label="更新时间">{new Date(note.updated_at).toLocaleString('zh-CN')}</Row>
      {note.path && (
        <Row label="路径">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', wordBreak: 'break-all' }}>{note.path}</span>
        </Row>
      )}
    </>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function tagsOf(tagsJson: string | null | undefined): string[] {
  try {
    const v = JSON.parse(tagsJson ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}