import { useEffect, useRef, useState } from 'react'
import { SquaresFour, List, MagnifyingGlass, Tag, Sparkle, Plus, FolderOpen, Trash, ArrowsClockwise, CaretLeft } from '@phosphor-icons/react'
import { useAppStore } from '../store'
import { Button, EmptyState, Select } from '../components/ui'
import { typeLabel } from '../lib/labels'
import type { LibraryFile, RecommendedFile, WatchedFolder } from '../../../shared/types'

const TYPE_FILTERS: Array<[string, string]> = [
  ['all', '全部'],
  ['image', '图片'],
  ['design', '设计'],
  ['document', '文档'],
  ['video', '视频'],
  ['markdown', 'Markdown'],
  ['archive', '压缩包'],
  ['screenshot', '截图'],
  ['ai', 'AI'],
  ['audio', '音频'],
  ['other', '其他']
] as const

const KIND_NAME: Record<string, string> = {
  desktop: '桌面',
  downloads: '下载',
  screenshots: '截图',
  custom: '自定义文件夹'
}

function base(p: string): string {
  const i = p.lastIndexOf('\\')
  return i >= 0 ? p.slice(i + 1) : p
}

type LibraryFolderTreeNode = {
  key: string
  label: string
  path: string
  depth: number
  files: LibraryFile[]
  fileCount: number
  children: LibraryFolderTreeNode[]
}

/**
 * The index is flat in storage, while the library retains its complete folder
 * tree. The column browser decides which three consecutive levels to display.
 */
function buildLibraryFolderTree(files: LibraryFile[], watchedFolders: WatchedFolder[]): LibraryFolderTreeNode[] {
  const roots = watchedFolders
    .map((folder) => ({ ...folder, path: folder.path.replace(/[\\/]+$/, '') }))
    .sort((a, b) => b.path.length - a.path.length)
  type MutableNode = Omit<LibraryFolderTreeNode, 'children' | 'fileCount'> & { children: Map<string, MutableNode> }
  const rootNodes = new Map<string, MutableNode>()
  const makeNode = (key: string, label: string, path: string, depth: number): MutableNode => ({
    key, label, path, depth, files: [], children: new Map()
  })

  for (const file of files) {
    const parent = file.path.slice(0, Math.max(0, file.path.lastIndexOf('\\')))
    const comparableParent = parent.toLocaleLowerCase()
    const root = roots.find((candidate) => {
      const comparableRoot = candidate.path.toLocaleLowerCase()
      return comparableParent === comparableRoot || comparableParent.startsWith(`${comparableRoot}\\`)
    })
    const rootPath = root?.path || parent || 'unclassified'
    const rootKey = rootPath.toLocaleLowerCase()
    const rootLabel = root ? (root.displayName || base(root.path)) : (base(parent) || '未归类目录')
    let node = rootNodes.get(rootKey)
    if (!node) {
      node = makeNode(rootKey, rootLabel, rootPath, 1)
      rootNodes.set(rootKey, node)
    }

    const relative = root ? parent.slice(root.path.length).replace(/^\\+/, '') : ''
    const segments = relative.split('\\').filter(Boolean)
    const levels = segments
    let current = node
    for (const [index, label] of levels.entries()) {
      const depth = index + 2
      const key = `${current.key}\\${label}`.toLocaleLowerCase()
      let child = current.children.get(key)
      if (!child) {
        const childPath = `${current.path}\\${label}`
        child = makeNode(key, label, childPath, depth)
        current.children.set(key, child)
      }
      current = child
    }
    current.files.push(file)
  }

  const finish = (node: MutableNode): LibraryFolderTreeNode => {
    const children = [...node.children.values()]
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
      .map(finish)
    return {
      key: node.key,
      label: node.label,
      path: node.path,
      depth: node.depth,
      files: node.files,
      children,
      fileCount: node.files.length + children.reduce((total, child) => total + child.fileCount, 0)
    }
  }
  return [...rootNodes.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')).map(finish)
}

export function LibraryPage() {
  const libraryFiles = useAppStore((s) => s.libraryFiles)
  const filter = useAppStore((s) => s.libraryFilter)
  const setFilter = useAppStore((s) => s.setLibraryFilter)
  const loadLibrary = useAppStore((s) => s.loadLibrary)
  const loadLibraryTags = useAppStore((s) => s.loadLibraryTags)
  const libraryTags = useAppStore((s) => s.libraryTags)
  const projects = useAppStore((s) => s.projects)
  const recommendations = useAppStore((s) => s.recommendations)
  const loadRecommendations = useAppStore((s) => s.loadRecommendations)
  const watchedFolders = useAppStore((s) => s.watchedFolders)
  const loadWatched = useAppStore((s) => s.loadWatched)
  const pushToast = useAppStore((s) => s.pushToast)
  const [searchText, setSearchText] = useState('')

  const addFolder = async () => {
    const picked = await window.workdeck.file.pickFolder()
    if (!picked) return
    try {
      await window.workdeck.watched.add(picked, 'custom')
      await loadWatched()
      await loadLibrary()
      pushToast('success', `已把「${base(picked)}」加入文件库并扫描`)
    } catch (err) {
      pushToast('error', String(err))
    }
  }

  const rescanFolder = async (w: WatchedFolder) => {
    const s = await window.workdeck.watched.scan(w.path)
    await loadLibrary()
    pushToast('success', `扫描完成：新增 ${s?.added ?? 0} · 更新 ${s?.updated ?? 0}`)
  }

  const removeFolder = async (w: WatchedFolder) => {
    if (!confirm(`移除收录「${w.path}」？只停止收录，不删除文件。`)) return
    await window.workdeck.watched.remove(w.id)
    await loadWatched()
    pushToast('success', `已停用「${base(w.path)}」的收录`)
  }

  const labelOf = (w: WatchedFolder) => w.displayName || base(w.path)

  const renameFolder = async (w: WatchedFolder) => {
    const name = window.prompt('给这个目录起个备注（可留空 = 用文件夹名）', w.displayName ?? '')
    if (name === null) return
    await window.workdeck.watched.update(w.id, { displayName: name.trim() || undefined })
    await loadWatched()
    pushToast('success', name.trim() ? `已更新备注「${name.trim()}」` : '已清除备注')
  }

  useEffect(() => {
    void loadLibrary().then(() => void loadRecommendations())
    void loadLibraryTags()
    void loadWatched()
  }, [loadLibrary, loadLibraryTags, loadRecommendations, loadWatched])

  const folderTree = buildLibraryFolderTree(libraryFiles, watchedFolders)

  // debounce search input → filter
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSearch = (v: string) => {
    setSearchText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFilter({ query: v }), 300)
  }

  return (
    <main className="workspace">
      <div className="sub">本地文件索引 · {libraryFiles.length} 个已索引文件（P2：标签 / 缩略图 / 使用次数 / 归属筛选）</div>

      {/* 搜集来源：选择「哪个盘 → 哪个文件夹」收录，并记录位置，下次一键打开 */}
      <div className="card library-sources-card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-head">
          <h3>搜集来源</h3>
          <div className="library-sources-actions">
            <span className="badge badge-neutral library-sources-badge">选定的盘 / 文件夹</span>
            <Button size="sm" variant="primary" onClick={() => void addFolder()}>
              <Plus size={14} aria-hidden="true" />
              添加文件夹
            </Button>
          </div>
        </div>
        <div className="file-meta" style={{ marginBottom: 'var(--space-3)' }}>
          从你选的目录收录文件（会自动同步新文件）；记录后下次点「打开文件夹」直达。
        </div>
        {watchedFolders.length === 0 ? (
          <div className="file-meta">还没有收录目录。点「添加文件夹」选一个盘里的文件夹开始。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {watchedFolders.map((w) => (
              <div key={w.id} className="file-row" style={{ minHeight: 0, padding: '6px 10px' }}>
                <span className="file-icon">{KIND_NAME[w.kind]?.charAt(0) ?? '夹'}</span>
                <span className="file-main">
                  <div className="file-name" title={w.path}>
                    {labelOf(w)}
                    {w.displayName && <span className="badge badge-neutral" style={{ marginLeft: 6, fontWeight: 400 }}>{w.path}</span>}
                  </div>
                  <div className="file-meta">{KIND_NAME[w.kind] ?? w.kind}</div>
                </span>
                <span className="file-actions" style={{ gap: 6 }}>
                  <button className="mini-btn" onClick={() => void window.workdeck.file.openPath(w.path)}>
                    <FolderOpen size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                    打开文件夹
                  </button>
                  {w.kind === 'custom' && (
                    <>
                      <button className="mini-btn" title="改备注" onClick={() => void renameFolder(w)}>
                        <Tag size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                        备注
                      </button>
                      <button className="mini-btn" onClick={() => void rescanFolder(w)}>
                        <ArrowsClockwise size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                        重新扫描
                      </button>
                      <button className="mini-btn danger" title="停用收录（不删除文件）" onClick={() => void removeFolder(w)}>
                        <Trash size={13} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
            <div className="palette-input-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.375rem 0.625rem', flex: 1, maxWidth: 320 }}>
              <MagnifyingGlass size={14} />
              <input
                className="palette-input"
                placeholder="按文件名 / 路径搜索…"
                value={searchText}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
            <Select
              style={{ width: 126 }}
              value={filter.sort}
              onChange={(v) => setFilter({ sort: v as never })}
              options={[
                { label: '最近打开', value: 'recent' },
                { label: '使用次数', value: 'popular' },
                { label: '修改时间', value: 'mtime' },
                { label: '名称', value: 'name' },
                { label: '大小', value: 'size' }
              ]}
            />
            <Select
              style={{ width: 148 }}
              value={filter.project}
              onChange={(v) => setFilter({ project: v })}
              options={[
                { label: '全部项目', value: '' },
                { label: '未关联项目', value: 'unlinked' },
                ...projects.map((p) => ({ label: p.name, value: p.id }))
              ]}
            />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button
                className={`icon-btn ${filter.view === 'grid' ? 'active' : ''}`}
                title="网格视图"
                style={filter.view === 'grid' ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : {}}
                onClick={() => setFilter({ view: 'grid' })}
              >
                <SquaresFour size={16} />
              </button>
              <button
                className={`icon-btn ${filter.view === 'list' ? 'active' : ''}`}
                title="列表视图"
                style={filter.view === 'list' ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : {}}
                onClick={() => setFilter({ view: 'list' })}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
          {TYPE_FILTERS.map(([id, label]) => (
            <button
              key={id}
              className={`tab ${filter.type === id ? 'active' : ''}`}
              style={{ borderBottom: 'none', borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem', fontSize: 'var(--fs-caption)' }}
              onClick={() => setFilter({ type: id })}
            >
              {label}
            </button>
          ))}
        </div>

        {libraryTags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
            <Tag size={13} style={{ fontSize: 0, marginRight: 2, color: 'var(--text-3)' }} />
            {['', ...libraryTags].map((t) => (
              <button
                key={t || '__all__'}
                className={`tab ${filter.tag === t ? 'active' : ''}`}
                style={{
                  borderBottom: 'none',
                  borderRadius: 'var(--radius-pill)',
                  padding: '0.2rem 0.65rem',
                  fontSize: 'var(--fs-micro)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
                onClick={() => setFilter({ tag: t })}
              >
                {t ? <>#{t}</> : '全部标签'}
              </button>
            ))}
          </div>
        )}

        {recommendations.length > 0 && (
          <RecommendSection
            items={recommendations}
            contextName={
              filter.project
                ? projects.find((p) => p.id === filter.project)?.name ?? '该项目'
                : '全库'
            }
          />
        )}

        {libraryFiles.length === 0 ? (
          <EmptyState
            icon={<MagnifyingGlass size={40} weight="thin" />}
            title="没有匹配的文件"
            hint="去设置里添加监控目录，或调整过滤条件"
          />
        ) : filter.view === 'grid' ? (
          <LibraryColumnBrowser nodes={folderTree} view="grid" />
        ) : (
          <LibraryColumnBrowser nodes={folderTree} view="list" />
        )}
      </div>
    </main>
  )
}

function LibraryColumnBrowser({ nodes, view }: { nodes: LibraryFolderTreeNode[]; view: 'grid' | 'list' }) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const levels: Array<{ nodes: LibraryFolderTreeNode[]; selected: LibraryFolderTreeNode; depth: number }> = []
  let choices = nodes
  let depth = 1
  for (;;) {
    if (choices.length === 0) break
    const selected = choices.find((node) => node.key === selectedKeys[depth - 1]) ?? choices[0]
    levels.push({ nodes: choices, selected, depth })
    choices = selected.children
    depth += 1
  }
  const activeKeys = levels.map((level) => level.selected.key)
  const visibleLevels = levels.slice(-3)
  const current = levels[levels.length - 1]?.selected

  return (
    <div className={`library-column-browser library-column-browser-${visibleLevels.length}`}>
      {visibleLevels.map((level) => (
        <LibraryFolderColumn
          key={level.depth}
          title={`第 ${level.depth} 级文件夹`}
          nodes={level.nodes}
          selectedKey={level.selected.key}
          onSelect={(key) => setSelectedKeys([...activeKeys.slice(0, level.depth - 1), key])}
        />
      ))}
      <section className="library-column-files">
        <div className="library-column-title" title={current?.path}>
          {activeKeys.length > 1 && (
            <button className="icon-btn library-folder-back" aria-label="返回上一级文件夹" title="返回上一级" onClick={() => setSelectedKeys(activeKeys.slice(0, -1))}>
              <CaretLeft size={15} aria-hidden="true" />
            </button>
          )}
          <FolderOpen size={15} weight="duotone" aria-hidden="true" />
          <span>{current?.label ?? '文件'}</span>
          <span className="badge badge-neutral">{current?.files.length ?? 0} 个文件</span>
        </div>
        {current && (view === 'grid' ? (
          <div className="library-folder-grid">{current.files.map((file) => <LibraryGridItem key={file.id} fileId={file.id} />)}</div>
        ) : (
          <div className="library-folder-list">{current.files.map((file) => <LibraryListRow key={file.id} fileId={file.id} />)}</div>
        ))}
      </section>
    </div>
  )
}

function LibraryFolderColumn({ title, nodes, selectedKey, onSelect }: { title: string; nodes: LibraryFolderTreeNode[]; selectedKey: string; onSelect: (key: string) => void }) {
  return (
    <section className="library-folder-column">
      <div className="library-folder-column-title">{title}</div>
      {nodes.length === 0 ? <div className="library-folder-column-empty">没有子文件夹</div> : nodes.map((node) => (
        <button type="button" key={node.key} className={`library-folder-option ${node.key === selectedKey ? 'active' : ''}`} onClick={() => onSelect(node.key)} title={node.path}>
          <FolderOpen size={14} weight={node.key === selectedKey ? 'fill' : 'duotone'} aria-hidden="true" />
          <span>{node.label}</span>
          <small>{node.fileCount}</small>
        </button>
      ))}
    </section>
  )
}

function LibraryGridItem({ fileId }: { fileId: string }) {
  const files = useAppStore((s) => s.libraryFiles)
  const checkScenarioCompletion = useAppStore((s) => s.checkScenarioCompletion)
  const f = files.find((x) => x.id === fileId)
  const [thumb, setThumb] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.workdeck.file.thumbnail(fileId, 128).then((t: string | null) => alive && setThumb(t))
    return () => {
      alive = false
    }
  }, [fileId])

  if (!f) return null
  const isMissing = f.status === 'missing'
  const handleOpen = () => {
    if (isMissing) return
    void window.workdeck.file.open(f.id).catch(() => undefined)
    void checkScenarioCompletion(f.path)
  }
  const shownTags = f.tags.slice(0, 2)
  return (
    <div
      className="card"
      style={{
        padding: 8,
        margin: 0,
        cursor: isMissing ? 'not-allowed' : 'pointer',
        opacity: isMissing ? 0.55 : 1
      }}
      onClick={handleOpen}
      title={isMissing ? '文件已缺失，无法打开' : '点击打开（系统默认程序）'}
    >
      <div
        style={{
          height: 'var(--thumb)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: 6
        }}
      >
        {thumb ? (
          <img src={thumb} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{f.ext.toUpperCase().slice(0, 3) || 'FILE'}</span>
        )}
      </div>
      <div className="file-name" style={{ fontSize: 'var(--fs-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {f.name}
      </div>
      <div className="file-meta" style={{ fontSize: 'var(--fs-micro)' }}>
        {typeLabel(f.type)} · {f.status === 'missing' ? '缺失' : formatSize(f.size)}
        {f.openCount > 0 ? ` · 打开 ${f.openCount}` : ''}
      </div>
      {shownTags.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
          {shownTags.map((t) => (
            <span key={t} className="badge badge-neutral" style={{ fontSize: 'var(--fs-micro)', padding: '0 0.35rem' }}>
              #{t}
            </span>
          ))}
          {f.tags.length > 2 && (
            <span className="badge badge-neutral" style={{ fontSize: 'var(--fs-micro)', padding: '0 0.35rem' }}>
              +{f.tags.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function LibraryListRow({ fileId }: { fileId: string }) {
  const files = useAppStore((s) => s.libraryFiles)
  const openDetail = useAppStore((s) => s.openDetail)
  const f = files.find((x) => x.id === fileId)
  if (!f) return null
  const isMissing = f.status === 'missing'
  return (
    <div
      className={`file-row ${isMissing ? 'missing' : ''}`}
      onClick={() => openDetail({ kind: 'file', id: f.id })}
      style={{ cursor: 'pointer' }}
      title="点击查看详情"
    >
      <span className="file-icon">{f.ext.toUpperCase().slice(0, 3) || 'FILE'}</span>
      <span className="file-main">
        <div className="file-name">{f.name}</div>
        <div className="file-meta">
          {f.openCount > 0
            ? `打开 ${f.openCount} 次${f.lastOpenedAt ? ` · 最近 ${relTime(f.lastOpenedAt)}` : ''} · `
            : '尚未打开过 · '}
          {f.projects.length > 0 ? f.projects.join(' / ') : '未关联项目'}
        </div>
        {f.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
            {f.tags.map((t) => (
              <span key={t} className="badge badge-neutral" style={{ fontSize: 'var(--fs-micro)', padding: '0 0.35rem' }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </span>
      <span className={`badge ${f.status === 'missing' ? 'badge-missing' : 'badge-neutral'}`}>
        {f.status === 'missing' ? '缺失' : typeLabel(f.type)}
      </span>
      <span className="file-meta" style={{ minWidth: 70, textAlign: 'right' }}>
        {formatSize(f.size)}
      </span>
    </div>
  )
}

function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/* "为你推荐" — files surfaced from how you actually work: co-use, project
   context, recency & frequency (computed in LibraryService.recommend). */
function RecommendSection({ items, contextName }: { items: RecommendedFile[]; contextName: string }) {
  const checkScenarioCompletion = useAppStore((s) => s.checkScenarioCompletion)
  const open = (f: RecommendedFile) => {
    if (f.status === 'missing') return
    void window.workdeck.file.open(f.id).catch(() => undefined)
    void checkScenarioCompletion(f.path)
  }
  return (
    <div style={{ marginBottom: 'var(--space-4)', padding: '0.75rem 0.875rem', borderRadius: 'var(--radius-md)', background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Sparkle size={14} weight="fill" style={{ color: 'var(--accent)' }} />
        <span className="file-name" style={{ fontWeight: 600 }}>为你推荐</span>
        <span className="file-meta" style={{ fontSize: 'var(--fs-micro)' }}>
          · 基于打开习惯 · 当前上下文：{contextName}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((f) => (
          <div
            key={f.id}
            className="file-row"
            style={{ minHeight: 0, padding: '0.25rem 0.375rem', cursor: f.status === 'missing' ? 'not-allowed' : 'pointer', opacity: f.status === 'missing' ? 0.55 : 1 }}
            onClick={() => open(f)}
            title={f.status === 'missing' ? '文件已缺失' : '点击打开'}
          >
            <span className="file-icon">{f.ext.toUpperCase().slice(0, 3) || 'FILE'}</span>
            <span className="file-main">
              <div className="file-name">{f.name}</div>
              <div className="file-meta">
                {typeLabel(f.type)} · {f.reason}
                {f.openCount > 0 ? ` · 打开 ${f.openCount}` : ''}
              </div>
            </span>
            <span className="file-meta" style={{ minWidth: 54, textAlign: 'right' }}>{formatSize(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
