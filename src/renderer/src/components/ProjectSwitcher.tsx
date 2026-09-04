import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { X, Folder, Plus, FolderSimple } from '@phosphor-icons/react'
import { projectStatusLabel } from '../lib/labels'

/**
 * Floating project switcher (top-left pill). Replaces the previous fixed sidebar.
 * Anchored to the Open button when available; otherwise pinned to dock-right/top.
 */
export function ProjectSwitcher() {
  const state = useAppStore((s) => s.projectSwitcher)
  const close = useAppStore((s) => s.closeProjectSwitcher)
  const projects = useAppStore((s) => s.projects)
  const currentProjectId = useAppStore((s) => s.currentProjectId)
  const selectProject = useAppStore((s) => s.selectProject)
  const createProject = useAppStore((s) => s.createProject)
  const archiveProject = useAppStore((s) => s.archiveProject)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    // Auto-focus "new project" when the user just hit + or opened via「新建项目」
    if (creating || state.intent === 'new') requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.removeEventListener('keydown', onKey)
  }, [state.open, creating, close, state.intent])

  if (!state.open) return null

  const submit = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      await createProject(name)
      setNewName('')
      setCreating(false)
      close()
    } finally {
      setCreating(false)
    }
  }

  const anchorLeft = state.anchor?.left ?? 80
  const anchorTop = state.anchor?.top ?? 56

  const active = projects.find((p) => p.id === currentProjectId)

  return (
    <>
      {/* outside-click guard */}
      <div
        aria-hidden
        onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'transparent' }}
      />
      <aside
        className="lg-card motion-modal-enter"
        role="dialog"
        aria-label="项目列表"
        style={{
          position: 'fixed',
          top: anchorTop,
          left: anchorLeft,
          width: 280,
          padding: 'var(--space-3) var(--space-4)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          maxHeight: 'min(560px, 80vh)'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 'var(--space-2)',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderSimple size={14} color="var(--accent)" />
            <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, letterSpacing: '0.02em' }}>项目</span>
          </div>
          <button
            aria-label="关闭"
            onClick={close}
            className="close-rotate"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 2,
              borderRadius: 4,
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)'
            }}
          >
            <X size={14} />
          </button>
        </header>

        {/* New project input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            className="input"
            placeholder="+ 新建项目名称…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') {
                setNewName('')
                e.stopPropagation()
              }
            }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            className="btn btn-glass"
            disabled={!newName.trim() || creating}
            onClick={() => void submit()}
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            <Plus size={13} weight="bold" style={{ marginRight: 4, verticalAlign: -2 }} />
            创建
          </button>
        </div>

        {active && (
          <div className="file-meta" style={{ paddingTop: 'var(--space-1)' }}>
            当前：<strong style={{ color: 'var(--text-1)' }}>{active.name}</strong>
          </div>
        )}

        {/* Project list */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflowY: 'auto',
            minHeight: 0
          }}
        >
          {projects.length === 0 && (
            <div className="file-meta" style={{ padding: 'var(--space-3) 0' }}>
              还没有项目，输入名称 + 创建第一个
            </div>
          )}
          {projects.map((p) => {
            const isActive = p.id === currentProjectId
            return (
              <button
                key={p.id}
                className={`file-row ${isActive ? 'selected' : ''}`}
                onClick={() => {
                  void selectProject(p.id)
                  close()
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <span className="file-icon">
                  <Folder size={14} color="var(--accent)" weight="duotone" />
                </span>
                <span className="file-main">
                  <div className="file-name">{p.name}</div>
                  <div className="file-meta">{projectStatusLabel(p.status)}</div>
                </span>
              </button>
            )
          })}
        </div>

        <footer
          style={{
            marginTop: 'auto',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span className="file-meta">{projects.length} 个项目</span>
          {active && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--danger)' }}
              onClick={() => {
                if (confirm(`归档「${active.name}」？归档后不再出现在列表，数据保留。`)) {
                  void archiveProject(active.id)
                  close()
                }
              }}
            >
              归档当前
            </button>
          )}
        </footer>
      </aside>
    </>
  )
}