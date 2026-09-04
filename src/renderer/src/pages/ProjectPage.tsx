import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  ArrowSquareOut,
  FolderSimple,
  Trash,
  PencilSimple,
  WarningCircle,
  CheckCircle,
  Circle,
  CalendarBlank,
  List
} from '@phosphor-icons/react'
import { useAppStore, type FileEntry, type Project, type ProjectTab } from '../store'
import { Badge, Button, EmptyState, Modal } from '../components/ui'
import { projectStatusLabel, typeLabel } from '../lib/labels'
import { renderMarkdown } from '../lib/markdown'
import { extractOutline } from '../lib/outline'
import type { Note, NoteContent, TaskPriority, TaskWithFiles } from '../../../shared/types'

const PROJECT_COLORS = ['#7C6FF0', '#5B8DEF', '#38A3A5', '#30A46C', '#F5A524', '#E5484D', '#E26D9D', '#8B9BB4']

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: '高',
  medium: '中',
  low: '低'
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high: 'var(--danger)',
  medium: 'var(--warning)',
  low: 'var(--text-3)'
}

export function ProjectPage() {
  const projects = useAppStore((s) => s.projects)
  const currentProjectId = useAppStore((s) => s.currentProjectId)
  const project = projects.find((p) => p.id === currentProjectId)
  const openProjectSwitcher = useAppStore((s) => s.openProjectSwitcher)

  if (!project) {
    return (
      <main className="workspace">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              openProjectSwitcher({
                left: Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 322),
                top: 52
              })
            }
          >
            <List size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            打开项目列表
          </Button>
        </div>
        <div className="card" style={{ marginTop: 'var(--space-3)' }}>
          <EmptyState
            icon={<FolderSimple size={40} weight="thin" />}
            title="选择一个项目"
            hint="点击右上「打开项目列表」，或新建一个项目开始"
          />
        </div>
      </main>
    )
  }
  return <ProjectDetail key={project.id} project={project} />
}

function ProjectDetail({ project }: { project: Project }) {
  const tab = useAppStore((s) => s.projectTab)
  const setTab = useAppStore((s) => s.setProjectTab)
  const openProjectSwitcher = useAppStore((s) => s.openProjectSwitcher)

  return (
    <main className="workspace">
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            openProjectSwitcher({ left: 80, top: 56 })
          }
        >
          <List size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          项目
        </Button>
        <span className="project-dot" style={{ background: project.color, width: 14, height: 14 }} />
        <h1 style={{ margin: 0 }}>{project.name}</h1>
        <EditProjectButton project={project} />
      </div>
      <div className="sub">
        {projectStatusLabel(project.status)} · 创建于 {project.created_at.slice(0, 10)}
        {project.deadline ? ` · 截止 ${project.deadline}` : ''}
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['overview', '概览'],
            ['tasks', '任务'],
            ['files', '文件'],
            ['notes', '笔记'],
            ['timeline', '时间线']
          ] as Array<[ProjectTab, string]>
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'files' && <FilesTab project={project} />}
      {tab === 'overview' && <OverviewTab project={project} />}
      {tab === 'tasks' && <TasksTab project={project} />}
      {tab === 'notes' && <NotesTab project={project} />}
      {tab === 'timeline' && (
        <PlaceholderCard title="时间线" hint="项目活动时间线将在后续 Phase 接入" />
      )}
    </main>
  )
}

function OverviewTab({ project }: { project: Project }) {
  const files = useAppStore((s) => s.files)
  const setTab = useAppStore((s) => s.setProjectTab)
  return (
    <div className="card">
      <div className="card-head">
        <h3>项目概览</h3>
      </div>
      <div style={{ color: 'var(--text-2)', fontSize: 'var(--fs-body-sm)', marginBottom: 'var(--space-4)' }}>
        {project.description || '暂无描述'}
      </div>
      <div className="home-grid">
        <div className="card">
          <div className="file-name" style={{ fontWeight: 600 }}>{files.length}</div>
          <div className="file-meta">已引用文件</div>
        </div>
        <div className="card">
          <div className="file-name" style={{ fontWeight: 600 }}>
            {files.filter((f) => f.status === 'missing').length}
          </div>
          <div className="file-meta">缺失文件</div>
        </div>
      </div>
      {files.length > 0 && (
        <Button size="sm" onClick={() => setTab('files')} style={{ marginTop: 'var(--space-2)' }}>
          查看文件列表
        </Button>
      )}
    </div>
  )
}

function FilesTab({ project }: { project: Project }) {
  const files = useAppStore((s) => s.files)
  const addFileToCurrentProject = useAppStore((s) => s.addFileToCurrentProject)
  const selectFile = useAppStore((s) => s.selectFile)
  const openFile = useAppStore((s) => s.openFile)
  const revealFile = useAppStore((s) => s.revealFile)
  const removeFileFromProject = useAppStore((s) => s.removeFileFromProject)
  const showContextMenu = useAppStore((s) => s.showContextMenu)
  const pushToast = useAppStore((s) => s.pushToast)

  return (
    <div className="card">
      <div className="card-head">
        <h3>文件（{files.length}）</h3>
        <Button size="sm" variant="primary" onClick={() => void addFileToCurrentProject()}>
          <Plus size={13} weight="bold" style={{ marginRight: 4, verticalAlign: -2 }} />
          添加文件
        </Button>
      </div>
      {files.length === 0 ? (
        <EmptyState
          icon={<FolderSimple size={40} weight="thin" />}
          title="项目还没有文件引用"
          hint="点击「添加文件」。文件不会被移动或复制，只创建引用。"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              onSelect={() => selectFile(f.id)}
              onOpen={() => void openFile(f.id)}
              onReveal={() => void revealFile(f.id)}
              onContextMenu={(x, y) =>
                showContextMenu(x, y, [
                  {
                    label: '打开',
                    icon: <ArrowSquareOut size={15} />,
                    onClick: () => void openFile(f.id),
                    separatorBefore: false
                  },
                  {
                    label: '在资源管理器中定位',
                    icon: <FolderSimple size={15} />,
                    onClick: () => void revealFile(f.id)
                  },
                  {
                    label: '复制路径',
                    icon: <PencilSimple size={15} />,
                    onClick: () => {
                      void navigator.clipboard.writeText(f.path).then(() =>
                        pushToast('success', '路径已复制')
                      )
                    }
                  },
                  {
                    label: '从项目移除（文件不动）',
                    icon: <Trash size={15} />,
                    danger: true,
                    separatorBefore: true,
                    onClick: () => {
                      if (confirm(`将「${f.name}」从项目 ${project.name} 移除？只删除关联，文件本身不变。`)) {
                        void removeFileFromProject(f.id)
                      }
                    }
                  }
                ])
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileRow({
  file,
  onSelect,
  onOpen,
  onReveal,
  onContextMenu
}: {
  file: FileEntry
  onSelect: () => void
  onOpen: () => void
  onReveal: () => void
  onContextMenu: (x: number, y: number) => void
}) {
  const selectedFileId = useAppStore((s) => s.selectedFileId)
  const missing = file.status === 'missing'
  return (
    <div
      className={`file-row ${file.id === selectedFileId ? 'selected' : ''} ${missing ? 'missing' : ''}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e.clientX, e.clientY)
      }}
    >
      <span className="file-icon">
        {missing ? <WarningCircle size={16} /> : file.ext.toUpperCase().slice(0, 3)}
      </span>
      <span className="file-main">
        <div className="file-name">{file.name}</div>
        <div className="file-meta">
          {file.path} · {formatSize(file.size)}
        </div>
      </span>
      <Badge kind={missing ? 'missing' : 'available'}>
        {missing ? '缺失' : typeLabel(file.type)}
      </Badge>
      <span className="file-actions" onClick={(e) => e.stopPropagation()}>
        {!missing && (
          <button className="mini-btn" title="用默认程序打开" onClick={onOpen}>
            <ArrowSquareOut size={13} />
          </button>
        )}
        <button className="mini-btn" title="在资源管理器中定位" onClick={onReveal}>
          <FolderSimple size={13} />
        </button>
      </span>
    </div>
  )
}

function EditProjectButton({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(project.name)
  const [color, setColor] = useState(project.color)

  const save = async () => {
    if (!name.trim()) return
    await updateProject(project.id, { name: name.trim(), color })
    setOpen(false)
  }

  return (
    <>
      <button className="icon-btn" title="编辑项目" onClick={() => setOpen(true)}>
        <PencilSimple size={14} />
      </button>
      {open && (
        <Modal
          title="编辑项目"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>取消</Button>
              <Button variant="primary" onClick={() => void save()}>保存</Button>
            </>
          }
        >
          <div className="field">
            <span className="label">名称</span>
            <input
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
            />
          </div>
          <div className="field">
            <span className="label">标记色</span>
            <div className="color-row">
              {PROJECT_COLORS.map((c) => (
                <span
                  key={c}
                  className={`color-swatch ${color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function PlaceholderCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card">
      <EmptyState icon={<FolderSimple size={40} weight="thin" />} title={`${title}（占位）`} hint={hint} />
    </div>
  )
}

/* ============ Tasks tab ============ */
function TasksTab({ project }: { project: Project }) {
  const projectTasks = useAppStore((s) => s.projectTasks)
  const loadProjectTasks = useAppStore((s) => s.loadProjectTasks)
  const completeTask = useAppStore((s) => s.completeTask)
  const reopenTask = useAppStore((s) => s.reopenTask)
  const removeTask = useAppStore((s) => s.removeTask)
  const [showNew, setShowNew] = useState(false)
  const [editTask, setEditTask] = useState<TaskWithFiles | null>(null)

  useEffect(() => {
    void loadProjectTasks(project.id)
  }, [project.id, loadProjectTasks])

  const open = projectTasks.filter((t) => t.status !== 'done')
  const done = projectTasks.filter((t) => t.status === 'done')

  return (
    <div className="card">
      <div className="card-head">
        <h3>任务（{open.length} 进行中 · {done.length} 已完成）</h3>
        <Button size="sm" variant="primary" onClick={() => setShowNew(true)}>
          <Plus size={13} weight="bold" style={{ marginRight: 4, verticalAlign: -2 }} />
          新建任务
        </Button>
      </div>

      {projectTasks.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={40} weight="thin" />}
          title="项目还没有任务"
          hint="把要做的事拆成任务，设置截止日期，它会出现在首页「今日」"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {open.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onComplete={() => void completeTask(t.id)}
              onEdit={() => setEditTask(t)}
              onDelete={() => {
                if (confirm(`删除任务「${t.title}」？`)) void removeTask(t.id)
              }}
            />
          ))}
          {done.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              done
              onReopen={() => void reopenTask(t.id)}
              onEdit={() => setEditTask(t)}
              onDelete={() => {
                if (confirm(`删除任务「${t.title}」？`)) void removeTask(t.id)
              }}
            />
          ))}
        </div>
      )}

      {showNew && <NewTaskModal projectId={project.id} onClose={() => setShowNew(false)} />}
      {editTask && (
        <EditTaskModal task={editTask} onClose={() => setEditTask(null)} />
      )}
    </div>
  )
}

function TaskRow({
  task,
  done,
  onComplete,
  onReopen,
  onEdit,
  onDelete
}: {
  task: TaskWithFiles
  done?: boolean
  onComplete?: () => void
  onReopen?: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={`file-row ${done ? '' : ''}`} style={{ opacity: done ? 0.55 : 1 }}>
      <button
        className="icon-btn"
        title={done ? '重新打开' : '标记完成'}
        style={done ? { color: 'var(--success)' } : {}}
        onClick={done ? onReopen : onComplete}
      >
        {done ? <CheckCircle size={18} weight="fill" /> : <Circle size={18} />}
      </button>
      <span className="file-main">
        <div className="file-name" style={{ textDecoration: done ? 'line-through' : 'none' }}>
          {task.title}
        </div>
        <div className="file-meta">
          <span style={{ color: PRIORITY_COLORS[task.priority] }}>优先级 {PRIORITY_LABELS[task.priority]}</span>
          {task.due_date && (
            <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CalendarBlank size={12} /> 截止 {task.due_date}
              {task.due_date < new Date().toISOString().slice(0, 10) && !done && (
                <span className="badge badge-missing" style={{ marginLeft: 6 }}>已逾期</span>
              )}
            </span>
          )}
          {task.fileIds.length > 0 && (
            <span style={{ marginLeft: 8 }}>{task.fileIds.length} 个关联文件</span>
          )}
        </div>
      </span>
      <span className="file-actions">
        <button className="mini-btn" title="编辑任务" onClick={onEdit}>
          <PencilSimple size={13} />
        </button>
        <button className="mini-btn danger" title="删除任务" onClick={onDelete}>
          <Trash size={13} />
        </button>
      </span>
    </div>
  )
}

function NewTaskModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const createTask = useAppStore((s) => s.createTask)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')

  const submit = async () => {
    if (!title.trim()) return
    await createTask({
      projectId,
      title,
      priority,
      dueDate: dueDate || null,
      scheduledDate: scheduledDate || null
    })
    onClose()
  }

  return (
    <Modal
      title="新建任务"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!title.trim()}>
            创建
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="label">标题</span>
        <input
          className="input"
          autoFocus
          placeholder="要做什么？"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </div>
      <div className="field">
        <span className="label">优先级</span>
        <div className="color-row">
          {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => (
            <button
              key={p}
              className={`tab ${priority === p ? 'active' : ''}`}
              style={{ borderBottom: 'none', borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
              onClick={() => setPriority(p)}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">截止日期</span>
        <input
          className="input"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="label">排期日期（出现在日历）</span>
        <input
          className="input"
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
        />
      </div>
    </Modal>
  )
}

/* ============ Edit task: fields + linked files ============ */
function EditTaskModal({
  task,
  onClose
}: {
  task: TaskWithFiles
  onClose: () => void
}) {
  const files = useAppStore((s) => s.files)
  const updateTask = useAppStore((s) => s.updateTask)
  const addTaskFile = useAppStore((s) => s.addTaskFile)
  const removeTaskFile = useAppStore((s) => s.removeTaskFile)
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [scheduledDate, setScheduledDate] = useState(task.scheduled_date ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(task.fileIds))
  const [saving, setSaving] = useState(false)

  const toggle = (fileId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  const save = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    await updateTask(task.id, {
      title: title.trim(),
      priority,
      due_date: dueDate || null,
      scheduled_date: scheduledDate || null
    })
    // file diffs
    for (const id of task.fileIds) {
      if (!selected.has(id)) await removeTaskFile(task.id, id)
    }
    for (const id of selected) {
      if (!task.fileIds.includes(id)) await addTaskFile(task.id, id)
    }
    onClose()
  }

  return (
    <Modal
      title="编辑任务"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!title.trim()}>
            保存
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="label">标题</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">优先级</span>
        <div className="color-row">
          {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => (
            <button
              key={p}
              className={`tab ${priority === p ? 'active' : ''}`}
              style={{ borderBottom: 'none', borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
              onClick={() => setPriority(p)}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">截止日期</span>
        <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">排期日期（出现在日历）</span>
        <input className="input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">关联文件（勾选 = 关联到本任务）</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
          {files.length === 0 && <div className="file-meta">项目还没有文件，先在「文件」页签添加</div>}
          {files.map((f) => (
            <div
              key={f.id}
              className={`file-row ${selected.has(f.id) ? 'selected' : ''}`}
              style={{ minHeight: 0, padding: '0.5rem 0.5rem' }}
              onClick={() => toggle(f.id)}
            >
              <span className="file-main">
                <div className="file-name" style={{ fontSize: 'var(--fs-body-sm)' }}>{f.name}</div>
              </span>
              <span className={`badge ${selected.has(f.id) ? 'badge-available' : 'badge-neutral'}`}>
                {selected.has(f.id) ? '已关联' : '未关联'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

/* ============ Notes tab ============ */
function NotesTab({ project }: { project: Project }) {
  const projectNotes = useAppStore((s) => s.projectNotes)
  const loadProjectNotes = useAppStore((s) => s.loadProjectNotes)
  const addNote = useAppStore((s) => s.addNote)
  const removeNote = useAppStore((s) => s.removeNote)
  const setCurrentNoteId = useAppStore((s) => s.setCurrentNoteId)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  useEffect(() => {
    void loadProjectNotes(project.id)
    setActiveNoteId(null)
  }, [project.id, loadProjectNotes])

  // keep the AI "current document" context in sync
  useEffect(() => {
    setCurrentNoteId(activeNoteId)
    return () => setCurrentNoteId(null)
  }, [activeNoteId, setCurrentNoteId])

  const addExisting = async () => {
    const picked = await window.workdeck.file.pickFile()
    if (!picked) return
    const note = await addNote(picked)
    if (note) setActiveNoteId(note.id)
  }

  const createNew = async () => {
    const note = await window.workdeck.note.create(project.id)
    if (note) {
      await loadProjectNotes(project.id)
      setActiveNoteId(note.id)
    }
  }

  const activeNote = projectNotes.find((n) => n.id === activeNoteId) ?? null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '18rem 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
      <div className="card" style={{ margin: 0 }}>
        <div className="card-head">
          <h3>笔记（{projectNotes.length}）</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-3)' }}>
          {projectNotes.length === 0 && (
            <div className="file-meta">还没有笔记</div>
          )}
          {projectNotes.map((n) => (
            <div
              key={n.id}
              className={`file-row ${n.id === activeNoteId ? 'selected' : ''}`}
              style={{ minHeight: 0, padding: '0.5rem' }}
              onClick={() => setActiveNoteId(n.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (confirm(`移除笔记「${n.title}」引用？只删除引用，.md 文件本身不变。`)) {
                  if (n.id === activeNoteId) setActiveNoteId(null)
                  void removeNote(n.id)
                }
              }}
            >
              <span className="file-main">
                <div className="file-name" style={{ fontSize: 'var(--fs-body-sm)' }}>{n.title}</div>
                <div className="file-meta">{n.updated_at.slice(0, 10)}</div>
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" onClick={() => void addExisting()}>添加已有</Button>
          <Button size="sm" variant="primary" onClick={() => void createNew()}>新建</Button>
        </div>
      </div>

      {activeNote ? (
        <NoteEditor
          key={activeNote.id}
          noteId={activeNote.id}
          onSaved={() => void loadProjectNotes(project.id)}
          onNavigate={setActiveNoteId}
        />
      ) : (
        <div className="card" style={{ margin: 0 }}>
          <EmptyState icon={<FolderSimple size={40} weight="thin" />} title="选择或新建一篇笔记" hint="笔记是真实 .md 文件的引用，内容以文件为准" />
        </div>
      )}
    </div>
  )
}

function NoteEditor({
  noteId,
  onSaved,
  onNavigate
}: {
  noteId: string
  onSaved: () => void
  onNavigate?: (noteId: string) => void
}) {
  const saveNote = useAppStore((s) => s.saveNote)
  const projectNotes = useAppStore((s) => s.projectNotes)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [loading, setLoading] = useState(true)
  const [external, setExternal] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [backlinks, setBacklinks] = useState<Array<{ id: string; title: string | null }>>([])
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const mdRef = useRef<HTMLDivElement | null>(null)

  const outline = useMemo(() => extractOutline(content), [content])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setBacklinks([])
    void window.workdeck.note.get(noteId).then((r: NoteContent) => {
      if (!alive) return
      setContent(r.content)
      setTitle(r.note.title ?? '')
      setExternal(r.externallyModified)
      setLoading(false)
      setDirty(false)
    })
    void window.workdeck.note.backlinks(noteId).then((bl: Note[]) => {
      if (alive) setBacklinks(bl.map((n: Note) => ({ id: n.id, title: n.title })))
    })
    return () => {
      alive = false
    }
  }, [noteId])

  const save = async () => {
    if (saving) return
    setSaving(true)
    await saveNote(noteId, content)
    setSaving(false)
    setDirty(false)
    onSaved()
  }

  const scrollToLine = (line: number) => {
    if (mode === 'edit' && taRef.current) {
      // textarea line height ≈ 15px * 1.6
      taRef.current.scrollTop = line * 24 - 24
      return
    }
    if (mdRef.current) {
      const headings = mdRef.current.querySelectorAll('h1,h2,h3,h4,h5,h6')
      const idx = outline.findIndex((o) => o.line === line)
      const el = idx >= 0 ? headings[idx] : null
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-4)', alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="card-head">
            <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {external && <Badge kind="warning">外部已修改，已刷新缓存</Badge>}
              {dirty && <Badge kind="warning">未保存</Badge>}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`tab ${mode === 'edit' ? 'active' : ''}`}
                  style={{ borderBottom: 'none', borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
                  onClick={() => setMode('edit')}
                >
                  编辑
                </button>
                <button
                  className={`tab ${mode === 'preview' ? 'active' : ''}`}
                  style={{ borderBottom: 'none', borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
                  onClick={() => setMode('preview')}
                >
                  预览
                </button>
              </div>
              <Button size="sm" variant="primary" onClick={() => void save()} disabled={!dirty || saving}>
                保存
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="skeleton" />
          ) : mode === 'edit' ? (
            <textarea
              ref={taRef}
              className="input"
              style={{ height: 420, padding: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-body-sm)', resize: 'none', lineHeight: 1.6 }}
              value={content}
              spellCheck={false}
              onChange={(e) => {
                setContent(e.target.value)
                setDirty(true)
              }}
            />
          ) : (
            <div
              ref={mdRef}
              className="markdown-body"
              style={{ minHeight: 420, padding: 'var(--space-3)', fontSize: 'var(--fs-body-sm)', lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              onClick={(e) => {
                const el = (e.target as HTMLElement).closest('.wiki-link') as HTMLElement | null
                if (el?.dataset.title && onNavigate) {
                  const target = projectNotes.find((n) => n.title === el.dataset.title)
                  if (target) onNavigate(target.id)
                }
              }}
            />
          )}

          {backlinks.length > 0 && (
            <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
              <div className="file-meta" style={{ marginBottom: 6 }}>
                被 {backlinks.length} 篇笔记引用（反向链接）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {backlinks.map((b) => (
                  <button key={b.id} className="context-menu-item" style={{ width: '100%' }} onClick={() => onNavigate?.(b.id)}>
                    <span className="file-main">{b.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {outline.length >= 2 && (
          <div
            className="note-outline"
            style={{
              width: 176,
              maxHeight: 420,
              overflowY: 'auto',
              borderLeft: '1px solid var(--border)',
              paddingLeft: 'var(--space-3)'
            }}
          >
            <div className="file-meta" style={{ marginBottom: 6 }}>大纲（{outline.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {outline.map((o, i) => (
                <button
                  key={`${o.line}-${i}`}
                  className="outline-item"
                  style={{
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-2)',
                    fontSize: 'var(--fs-caption)',
                    lineHeight: 1.5,
                    padding: '4px',
                    borderRadius: 4,
                    paddingLeft: 4 + (o.level - 1) * 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => scrollToLine(o.line)}
                >
                  {o.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
