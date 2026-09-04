import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AppWindow,
  Images,
  File,
  FolderOpen,
  FolderSimplePlus,
  FolderSimple,
  FolderPlus,
  Folders,
  ArrowLeft,
  PencilSimple,
  VideoCamera,
  Plus,
  ArrowsClockwise,
  ArrowSquareOut,
  EyeSlash,
  Trash
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useAppStore, type ContextMenuItem } from '../store'
import { Button, ConfirmModal } from './ui'
import type { AppEntry, BoxKind } from '../../../shared/types'

const TYPE_COLOR: Record<string, string> = {
  pdf: '#e5484d',
  doc: '#3b82f6',
  docx: '#3b82f6',
  ppt: '#f97316',
  pptx: '#f97316',
  xls: '#16a34a',
  xlsx: '#16a34a',
  csv: '#16a34a',
  txt: '#64748b',
  md: '#8b5cf6',
  rtf: '#0ea5e9',
  psd: '#1e3a8a',
  ai: '#9333ea',
  zip: '#b45309',
  rar: '#b45309',
  '7z': '#b45309',
  apk: '#7c5cff'
}
const DEFAULT_TINT = '#64748b'

function extOf(p: string): string {
  const dot = p.lastIndexOf('.')
  if (dot <= 0 || dot === p.length - 1) return ''
  return p.slice(dot + 1).toLowerCase()
}
function extBadge(app: AppEntry): string {
  const e = extOf(app.path)
  return (e || 'file').toUpperCase().slice(0, 4)
}
function displayName(app: AppEntry): string {
  return app.isDir ? app.name : app.name.replace(/\.[^.]+$/, '')
}

interface BoxConfig {
  kind: BoxKind
  title: string
  icon: Icon
  createFolder?: boolean
  hint: string
  /** Optional sub-category tabs shown above the grid (used by the 文件 box). */
  categories?: CatDef[]
  /** iOS-style folder grouping — user-managed only (no auto-classification):
   *  items start loose, users create folders and drag items into / onto each
   *  other to classify them (used by the 软件启动台 and 图片 box). */
  folderMode?: boolean
}

interface CatDef {
  id: string
  label: string
  exts: string[]
}
const DOC_CATS: CatDef[] = [
  { id: 'psd', label: 'PSD/设计', exts: ['psd', 'ai', 'psb', 'sketch', 'fig', 'xd', 'indd'] },
  { id: 'mp3', label: 'MP3/音频', exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] },
  { id: 'pdf', label: 'PDF', exts: ['pdf'] },
  { id: 'office', label: 'Office', exts: ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv'] },
  { id: 'txt', label: '文本', exts: ['txt', 'md', 'rtf'] },
  { id: 'zip', label: '压缩包', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'] }
]

/* ============================================================
 *  iOS-style folder mode, user-managed only:
 *  Item are NOT auto-classified — they start loose in the grid. The user
 *  creates folders anytime and drags an item onto another item (or onto a
 *  folder) to bundle/assign them. Membership persists to localStorage, so the
 *  grouping survives restarts, mirroring how phone home screens work.
 * ============================================================ */

/** Display name for a custom folder id (strips the 'custom:' prefix). */
function groupLabel(id: string): string {
  return id.replace(/^custom:/, '')
}

interface FolderPersist {
  /** app path -> custom group id (overrides inference). Absence = auto. */
  map: Record<string, string>
  /** metadata for user-created folders. */
  folders: Array<{ id: string; name: string }>
  /** user-defined order of folder tiles in the grid, by folder id. */
  folderOrder?: string[]
  /** user-defined order of loose (not-yet-filed) apps, by path. */
  looseOrder?: string[]
  /** per-folder order of members, by path. */
  folderOrders?: Record<string, string[]>
}
function folderKey(kind: BoxKind): string {
  return `workdeck.box.folders.${kind}`
}
function loadFolders(kind: BoxKind): FolderPersist {
  try {
    const raw = localStorage.getItem(folderKey(kind))
    if (raw) {
      const d = JSON.parse(raw) as FolderPersist
      // Dedup by folder id: older builds could write two folders sharing the
      // same `custom:<name>` id (via rename), which breaks React's list keys and
      // freezes the UI. Keep the first entry; membership map already points at
      // the shared id, so nothing is lost.
      const seen = new Set<string>()
      const folders: FolderPersist['folders'] = []
      for (const f of d.folders ?? []) {
        if (seen.has(f.id)) continue
        seen.add(f.id)
        folders.push(f)
      }
      return { map: d.map ?? {}, folders, folderOrder: d.folderOrder, looseOrder: d.looseOrder, folderOrders: d.folderOrders }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { map: {}, folders: [] }
}
function saveFolders(kind: BoxKind, d: FolderPersist): void {
  try {
    localStorage.setItem(folderKey(kind), JSON.stringify(d))
  } catch {
    /* ignore quota errors */
  }
}
function newCustomId(name: string): string {
  return `custom:${name.trim()}`
}

/** Keep only paths that still exist among items, ordered by `order`, with
 *  any unordered items appended in their original relative order. */
function sortWithOrder(list: AppEntry[], order: string[] | undefined): AppEntry[] {
  if (!order?.length) return list
  const keep = new Set<string>()
  const ordered: AppEntry[] = []
  for (const p of order) {
    if (keep.has(p)) continue
    const it = list.find((i) => i.path === p)
    if (!it) continue
    keep.add(p)
    ordered.push(it)
  }
  return ordered.concat(list.filter((i) => !keep.has(i.path)))
}

/** Left edge width (px) of a tile treated as the "gap" drop zone where a
 *  dragged app inserts before the target instead of bundling a folder. */
const INSERT_EDGE = 14

/* ============================================================
 *  5 个自动同步的桌面空间插件：软件 / 图片 / 文件 / 文件夹 / 视频
 *  图片与文件来自「桌面 + 下载」目录自动扫描，软件来自桌面快捷方式，
 *  新增内容无需手动添加，自动出现在对应插件里。
 * ============================================================ */
export function SoftwareWidget() {
  return <BoxWidget config={{ kind: 'apps', title: '软件', icon: AppWindow, hint: '自动同步桌面的软件快捷方式', folderMode: true }} />
}
export function ImagesWidget() {
  return <BoxWidget config={{ kind: 'images', title: '图片', icon: Images, hint: '自动同步桌面与下载里的图片', folderMode: true }} />
}
export function DocsWidget() {
  return <BoxWidget config={{ kind: 'docs', title: '文件', icon: File, categories: DOC_CATS, hint: '自动同步桌面与下载里的文档文件' }} />
}
export function VideosWidget() {
  return <BoxWidget config={{ kind: 'videos', title: '视频', icon: VideoCamera, hint: '自动同步桌面与下载里的视频' }} />
}
export function FoldersBoxWidget() {
  return (
    <BoxWidget config={{ kind: 'folders', title: '文件夹', icon: FolderOpen, createFolder: true, hint: '自动同步桌面与下载里的文件夹' }} />
  )
}

function BoxWidget({ config }: { config: BoxConfig }) {
  const { kind, title, icon: HeadIcon, createFolder } = config
  const [items, setItems] = useState<AppEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [cat, setCat] = useState('all')
  const dragDepth = useRef(0)
  const pushToast = useAppStore((s) => s.pushToast)
  const showContextMenu = useAppStore((s) => s.showContextMenu)
  const hideContextMenu = useAppStore((s) => s.hideContextMenu)
  const checkScenarioCompletion = useAppStore((s) => s.checkScenarioCompletion)

  const cats = config.categories
  const visible = cats && cat !== 'all' ? items.filter((it) => cats.find((c) => c.id === cat)?.exts.includes(extOf(it.path))) : items

  /* ---- iOS-style folder mode (软件启动台) ---- */
  const folderCapable = config.folderMode ?? false
  const [folderOn, setFolderOn] = useState(folderCapable)
  const [persist, setPersist] = useState<FolderPersist>(() => loadFolders(kind))
  const [expanded, setExpanded] = useState<string | null>(null)
  const [nameDlg, setNameDlg] = useState<FolderNameTarget | null>(null)
  const [delDlg, setDelDlg] = useState<string | null>(null)
  const [dissolveDlg, setDissolveDlg] = useState(false)
  const writePersist = (d: FolderPersist) => {
    saveFolders(kind, d)
    setPersist(d)
  }
  /** Order folder tiles by the user's saved `folderOrder` (prunes stale ids). */
  const orderFolders = (folders: FolderPersist['folders'], order: string[] | undefined) => {
    if (!order?.length) return folders
    const keep = new Set<string>()
    const out: typeof folders = []
    for (const id of order) {
      if (keep.has(id)) continue
      const f = folders.find((x) => x.id === id)
      if (!f) continue
      keep.add(id)
      out.push(f)
    }
    return out.concat(folders.filter((f) => !keep.has(f.id)))
  }
  const groups = useMemo(() => {
    if (!folderCapable || !folderOn) return []
    return orderFolders(persist.folders, persist.folderOrder).map((f) => ({
      id: f.id,
      name: f.name,
      members: sortWithOrder(
        items.filter((it) => persist.map[it.path] === f.id),
        persist.folderOrders?.[f.id]
      )
    }))
  }, [items, folderOn, folderCapable, persist])
  /** Items not yet put into any folder — shown loose in the grid, in user order. */
  const loose = useMemo(() => {
    if (!folderCapable || !folderOn) return visible
    return sortWithOrder(items.filter((it) => !persist.map[it.path]), persist.looseOrder)
  }, [items, folderOn, folderCapable, persist, visible])
  /** Insert a dragged app at a position. `before` null = append to the end.
   *  With `groupId` it orders inside that folder, else in the loose area. */
  const insertApp = (moved: string, before: string | null, groupId?: string | null) => {
    if (!moved || moved === before) return
    const prune = (arr: string[]) => arr.filter((p) => p && p !== moved && items.some((i) => i.path === p))
    if (groupId) {
      const folderOrders = { ...(persist.folderOrders ?? {}) }
      const cur = prune(folderOrders[groupId] ?? [])
      const idx = before ? cur.indexOf(before) : -1
      if (idx < 0) cur.push(moved)
      else cur.splice(idx, 0, moved)
      folderOrders[groupId] = cur
      writePersist({ ...persist, folderOrders })
    } else {
      const cur = prune(persist.looseOrder ?? [])
      const idx = before ? cur.indexOf(before) : -1
      if (idx < 0) cur.push(moved)
      else cur.splice(idx, 0, moved)
      writePersist({ ...persist, looseOrder: cur })
    }
  }
  const appendLoose = () => {
    if (draggingApp) insertApp(draggingApp, null)
  }
  const appendMember = (groupId: string | null) => {
    if (draggingApp) insertApp(draggingApp, null, groupId)
  }
  const assignApp = (path: string, groupId: string | null) => {
    const map = { ...persist.map }
    if (groupId) map[path] = groupId
    else delete map[path]
    writePersist({ ...persist, map })
  }
  const createFolderAround = (path: string | null) => {
    setNameDlg({ mode: 'create', path })
  }
  const renameFolder = (id: string) => {
    setNameDlg({ mode: 'rename', id })
  }
  const commitCreate = (name: string) => {
    const path = nameDlg?.mode === 'create' ? nameDlg.path : null
    const id = newCustomId(name)
    const folders = persist.folders.some((f) => f.id === id) ? persist.folders : [...persist.folders, { id, name }]
    const map = { ...persist.map }
    if (path) map[path] = id
    writePersist({ map, folders })
    setExpanded(id)
    pushToast('success', `已创建文件夹「${name}」`)
  }
  const commitRename = (name: string) => {
    if (nameDlg?.mode !== 'rename') return
    const id = nameDlg.id
    const newId = newCustomId(name)
    // Folder ids derive from their name (`custom:<name>`) at creation, so a
    // rename onto a name whose id is already taken by ANOTHER folder would
    // produce two entries with the same React key and crash the render (a
    // stuck, un-dismissable UI). When that happens, keep this folder's stable
    // id and only change the displayed name.
    const collision = newId !== id && persist.folders.some((f) => f.id === newId)
    const finalId = collision ? id : newId
    const folders = persist.folders.map((f) => (f.id === id ? { ...f, name, id: finalId } : f))
    writePersist({ ...persist, folders })
  }
  const deleteFolder = (id: string) => {
    setDelDlg(id)
  }
  const commitDelete = (id: string) => {
    const map: Record<string, string> = {}
    for (const [p, g] of Object.entries(persist.map)) if (g !== id) map[p] = g
    const next: FolderPersist = { ...persist, map, folders: persist.folders.filter((f) => f.id !== id) }
    if (next.folderOrder) next.folderOrder = next.folderOrder.filter((x) => x !== id)
    if (next.folderOrders) delete next.folderOrders[id]
    writePersist(next)
    if (expanded === id) setExpanded(null)
    pushToast('success', '已删除文件夹，其中的软件已放回统一区')
  }
  /** Move every member of a folder back to the loose (un-filed) area. */
  const emptyFolder = (id: string) => {
    const map: Record<string, string> = {}
    for (const [p, g] of Object.entries(persist.map)) if (g !== id) map[p] = g
    writePersist({ ...persist, map })
    pushToast('success', '已把里面的软件全部放回统一区')
  }
  /** Rescue guard: dissolve every folder at once (all software back to loose). */
  const commitDissolveAll = () => {
    writePersist({ map: {}, folders: [], folderOrder: undefined, looseOrder: undefined, folderOrders: undefined })
    setExpanded(null)
    pushToast('success', '已打散全部文件夹')
  }
  const reorderFolder = (movedId: string, beforeId: string | null) => {
    if (!movedId || movedId === beforeId) return
    const prune = (arr: string[]) => arr.filter((x) => x && x !== movedId && persist.folders.some((f) => f.id === x))
    const cur = prune(persist.folderOrder ?? [])
    const idx = beforeId ? cur.indexOf(beforeId) : -1
    if (idx < 0) cur.push(movedId)
    else cur.splice(idx, 0, movedId)
    writePersist({ ...persist, folderOrder: cur })
  }
  const openFolderMenu = (e: ReactMouseEvent, group: NonNullable<typeof groups>[number]) => {
    e.preventDefault()
    e.stopPropagation()
    hideContextMenu()
    const items: ContextMenuItem[] = [
      {
        label: '展开',
        icon: <FolderOpen size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => setExpanded(group.id)
      }
    ]
    if (group.id.startsWith('custom:')) {
      items.push(
        {
          separatorBefore: true,
          label: '重命名',
          icon: <PencilSimple size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
          onClick: () => renameFolder(group.id)
        },
        {
          separatorBefore: true,
          label: `拿出全部（${group.members.length} 项）`,
          icon: <ArrowsClockwise size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
          onClick: () => emptyFolder(group.id)
        },
        {
          separatorBefore: true,
          label: '删除文件夹',
          danger: true,
          icon: <Trash size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
          onClick: () => deleteFolder(group.id)
        }
      )
    }
    showContextMenu(e.clientX, e.clientY, items)
  }
  const appendMoveMenu = (actions: ContextMenuItem[], app: AppEntry) => {
    if (!folderCapable || !folderOn) return
    const current = persist.map[app.path] || null
    const targets = groups.filter((g) => g.id !== current)
    for (const g of targets) {
      actions.push({
        label: `移入「${g.name}」`,
        icon: <FolderSimple size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => assignApp(app.path, g.id)
      })
    }
    if (current) {
      actions.push({
        separatorBefore: true,
        label: '拿出文件夹',
        icon: <ArrowsClockwise size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => assignApp(app.path, null)
      })
    }
    actions.push({
      separatorBefore: true,
      label: '新建文件夹收纳…',
      icon: <FolderPlus size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
      onClick: () => createFolderAround(app.path)
    })
  }

  const [draggingApp, setDraggingApp] = useState<string | null>(null)
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null)
  const onAppDragStart = (app: AppEntry) => {
    setDraggingApp(app.path)
  }
  const onAppDragEnd = () => {
    setDraggingApp(null)
  }
  // Folder tiles are draggable to reorder; clear the session on any drag-close
  // event (drop elsewhere, Esc, lost pointer) so no insert marker is left over.
  useEffect(() => {
    if (!draggingFolder) return
    const clear = () => setDraggingFolder(null)
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('drop', clear)
    window.addEventListener('dragend', clear)
    window.addEventListener('mouseup', clear)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('drop', clear)
      window.removeEventListener('dragend', clear)
      window.removeEventListener('mouseup', clear)
      window.removeEventListener('keydown', onEsc)
    }
  }, [draggingFolder])
  const acceptDropOnFolder = (e: ReactDragEvent) => {
    if (!draggingApp) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const dropOnFolder = (e: ReactDragEvent, groupId: string) => {
    if (!draggingApp) return
    e.preventDefault()
    e.stopPropagation()
    assignApp(draggingApp, groupId)
    setDraggingApp(null)
  }
  /** Dropping a dragged item onto a loose tile bundles both into a new folder,
   *  mirroring how you group phone icons by dropping one app onto another. The
   *  folder is created instantly (iOS-style 收纳夹) with an auto name derived
   *  from the target, both apps are added, and it expands — no naming dialog.
   *  Rename later from the folder header or context menu. */
  const bundleIntoFolder = (e: ReactDragEvent, target: AppEntry) => {
    e.preventDefault()
    e.stopPropagation()
    const src = draggingApp
    if (!src || src === target.path) return
    const name = displayName(target)
    const id = newCustomId(name)
    const folders = persist.folders.some((f) => f.id === id) ? persist.folders : [...persist.folders, { id, name }]
    const map = { ...persist.map, [src]: id, [target.path]: id }
    writePersist({ map, folders })
    setDraggingApp(null)
    setExpanded(id)
    pushToast('success', `已整理进「${name}」，可右键重命名`)
  }
  const showFolders = folderCapable && folderOn
  const expandedGroup = showFolders && expanded ? groups.find((g) => g.id === expanded) ?? null : null
  const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))', gap: 8, alignContent: 'start' } as const

  // Esc always collapses an expanded folder, mirroring the mail reader.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true)
      void window.workdeck.boxes
        .list(kind)
        .then((next: AppEntry[]) => {
          setItems((prev) => (entryListEqual(prev, next) ? prev : next))
        })
        .finally(() => setLoading(false))
    },
    [kind]
  )
  useEffect(() => {
    load()
    const id = window.setInterval(() => load(true), 6000)
    const onFocus = () => load(true)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const launch = async (a: AppEntry) => {
    const r = await window.workdeck.boxes.launch(a.path, kind, a.name)
    if (r.ok) void checkScenarioCompletion(a.path)
    else if (r.error) pushToast('error', r.error ?? '打开失败')
  }
  const onCreateFolder = async () => {
    const f = await window.workdeck.boxes.createFolder()
    if (f) {
      pushToast('success', `已在桌面创建「${f.name}」`)
      load(true)
    } else {
      pushToast('error', '创建失败')
    }
  }
  const pickAndPin = async () => {
    const r = await window.workdeck.boxes.pickAdd(kind)
    if (r?.ok) {
      pushToast('success', `已加入「${title}」`)
      load(true)
    }
  }
  const openBlankMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    hideContextMenu()
    const items: ContextMenuItem[] = [
      {
        label: kind === 'apps' ? '添加软件…' : '添加文件 / 文件夹…',
        icon: <Plus size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => void pickAndPin()
      }
    ]
    if (createFolder) {
      items.push({
        separatorBefore: true,
        label: '新建文件夹',
        icon: <FolderSimplePlus size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => void onCreateFolder()
      })
    }
    if (folderOn) {
      items.push({
        separatorBefore: true,
        label: `打散全部文件夹（${groups.length} 个）`,
        icon: <ArrowsClockwise size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => setDissolveDlg(true)
      })
    }
    items.push({
      separatorBefore: true,
      label: '立即重新扫描',
      icon: <ArrowsClockwise size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
      onClick: () => load(true)
    })
    showContextMenu(e.clientX, e.clientY, items)
  }
  const removeById = async (app: AppEntry) => {
    try {
      await window.workdeck.boxes.remove(app.id)
      pushToast('success', app.source === 'custom' ? '已取消固定' : '已隐藏该条目')
      load(true)
    } catch {
      pushToast('error', '操作失败，请重启应用后重试')
    }
  }
  const deleteItem = async (app: AppEntry) => {
    const r = await window.workdeck.boxes.trash(app.path)
    if (!r.ok) {
      pushToast('error', r.error ?? '删除失败')
      return
    }
    await window.workdeck.boxes.remove(app.id)
    pushToast('success', '已移至回收站')
    load(true)
  }
  const openTileMenu = (e: ReactMouseEvent, app: AppEntry) => {
    e.preventDefault()
    e.stopPropagation()
    hideContextMenu()
    const items: ContextMenuItem[] = [
      {
        label: '打开',
        icon: <ArrowSquareOut size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => void launch(app)
      },
      {
        label: '到文件所在文件夹',
        icon: <FolderSimple size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => void window.workdeck.boxes.showInFolder(app.path)
      },
      {
        separatorBefore: true,
        label: app.source === 'custom' ? '取消固定' : '隐藏' + (app.isDir ? '该文件夹' : ''),
        icon: <EyeSlash size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => void removeById(app)
      },
      {
        separatorBefore: true,
        label: '删除',
        danger: true,
        icon: <Trash size={12} style={{ marginRight: 6, verticalAlign: -2 }} />,
        onClick: () => void deleteItem(app)
      }
    ]
    appendMoveMenu(items, app)
    showContextMenu(e.clientX, e.clientY, items)
  }

  const hasFiles = (e: ReactDragEvent) => Array.from(e.dataTransfer.types ?? []).includes('Files')
  const onDragEnter = (e: ReactDragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current++
    setDragging(true)
  }
  const onDragOver = (e: ReactDragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (e: ReactDragEvent) => {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  // Safety net: a native OS drag can end without firing dragleave on this box
  // (e.g. dropped elsewhere, cancelled with Esc, or released off-window), which
  // would otherwise leave the dashed drop-outline stuck on. Clearing on any
  // drop/dragend/mouseup/escape once the highlight is active guarantees cleanup.
  useEffect(() => {
    if (!dragging) return
    const clear = () => {
      dragDepth.current = 0
      setDragging(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('drop', clear)
    window.addEventListener('dragend', clear)
    window.addEventListener('mouseup', clear)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('drop', clear)
      window.removeEventListener('dragend', clear)
      window.removeEventListener('mouseup', clear)
      window.removeEventListener('keydown', onEsc)
    }
  }, [dragging])
  // Same safety net for an app-tile drag session: draggingApp drives the drop
  // highlights on loose tiles / folders, and an app drag can end without a
  // dragleave on its last hover target (dropped on blank space, escaped, or the
  // window loses the pointer). Clearing the session on any drag-close event
  // guarantees no highlight is left behind once the pointer is up.
  useEffect(() => {
    if (!draggingApp) return
    const clear = () => setDraggingApp(null)
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('drop', clear)
    window.addEventListener('dragend', clear)
    window.addEventListener('mouseup', clear)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('drop', clear)
      window.removeEventListener('dragend', clear)
      window.removeEventListener('mouseup', clear)
      window.removeEventListener('keydown', onEsc)
    }
  }, [draggingApp])
  const onDrop = async (e: ReactDragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const paths: string[] = []
    for (const f of Array.from(e.dataTransfer.files) as File[]) {
      const p = window.workdeck.boxes.resolvePath(f)
      if (p) paths.push(p)
    }
    if (paths.length === 0) {
      pushToast('error', '无法读取拖入的内容，请拖入文件或软件快捷方式')
      return
    }
    await window.workdeck.boxes.addPaths(paths, kind)
    pushToast('success', `已加入「${title}」${paths.length} 项`)
    load(true)
  }

  return (
    <>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          height: '100%',
          borderRadius: 'var(--radius-md)',
          boxShadow: dragging
            ? `inset 0 0 0 1.5px color-mix(in srgb, var(--accent, #6c8cff) 78%, transparent), 0 0 0 3px color-mix(in srgb, var(--accent, #6c8cff) 12%, transparent)`
            : 'none',
          transition: 'box-shadow .18s ease'
        }}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
        onContextMenu={openBlankMenu}
      >
        {dragging && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none'
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: '999px',
                background: 'color-mix(in srgb, var(--surface-2) 78%, transparent)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: '1px solid color-mix(in srgb, var(--accent, #6c8cff) 45%, transparent)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                color: 'var(--text-1)',
                fontSize: 'var(--fs-body-sm)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                letterSpacing: 'var(--tr-body)'
              }}
            >
              <ArrowSquareOut size={16} weight="fill" color="var(--accent, #6c8cff)" />
              松开以固定到此空间
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px' }}>
          <HeadIcon size={14} weight="fill" color="var(--accent, #6c8cff)" />
          <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, letterSpacing: 'var(--tr-body)' }}>
            {title}
          </span>
          <span className="badge badge-available" style={{ fontSize: 'var(--fs-micro)', fontVariantNumeric: 'tabular-nums' }}>
            {items.length}
          </span>
          <span title={config.hint} style={{ color: 'var(--text-3)', display: 'inline-flex', marginLeft: 2 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--accent, #6c8cff)',
                opacity: 0.85,
                alignSelf: 'center'
              }}
            />
          </span>
          <span style={{ flex: 1 }} />
          {folderCapable && (
            <>
              <button
                className={`btn btn-sm ${folderOn ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 'var(--fs-micro)' }}
                onClick={() => setFolderOn((v) => !v)}
                title={folderOn ? '切换为列表网格' : '文件夹模式：像手机一样把软件收纳进文件夹'}
              >
                {folderOn ? (
                  <Folders size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
                ) : (
                  <FolderSimple weight="fill" size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
                )}
                {folderOn ? '网格' : '文件夹'}
              </button>
              {folderOn && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 'var(--fs-micro)' }}
                  onClick={() => createFolderAround(null)}
                  title="新建一个文件夹收纳软件"
                >
                  <FolderPlus size={12} style={{ marginRight: 3, verticalAlign: -2 }} />新建
                </button>
              )}
            </>
          )}
          {createFolder && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 'var(--fs-micro)' }}
              onClick={() => void onCreateFolder()}
              title="在桌面新建一个文件夹"
            >
              <FolderSimplePlus size={12} style={{ marginRight: 3, verticalAlign: -2 }} />新建文件夹
            </button>
          )}
          <button className="btn btn-secondary btn-sm" style={{ fontSize: 'var(--fs-micro)' }} onClick={() => load(true)} title="立即重新扫描">
            <ArrowsClockwise size={12} style={{ verticalAlign: -2 }} />
          </button>
        </div>

        {cats && cats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button
              className={`chip ${cat === 'all' ? 'chip-active' : ''}`}
              onClick={() => setCat('all')}
            >
              全部
            </button>
            {cats.map((c) => {
              const n = items.filter((it) => c.exts.includes(extOf(it.path))).length
              return (
                <button
                  key={c.id}
                  className={`chip ${cat === c.id ? 'chip-active' : ''}`}
                  onClick={() => setCat(c.id)}
                >
                  {c.label}
                  {n > 0 && <span className="chip-count">{n}</span>}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {showFolders && expandedGroup
            ? createPortal(
                <div
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
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) setExpanded(null)
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: 'min(720px, 94vw)',
                      height: 'min(600px, 88vh)',
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '1rem',
                      boxShadow:
                        '0 24px 64px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))', background: 'inherit', position: 'relative', zIndex: 2 }}>
                      <button className="btn btn-secondary btn-sm" style={{ fontSize: 'var(--fs-micro)' }} onPointerDown={() => setExpanded(null)} title="返回文件夹视图（Esc）">
                        <ArrowLeft size={12} style={{ marginRight: 3, verticalAlign: -2 }} />全部
                      </button>
                      <span style={{ fontSize: 'var(--fs-title)', fontWeight: 600 }}>{expandedGroup.name}</span>
                      <span className="badge badge-available" style={{ fontSize: 'var(--fs-micro)' }}>
                        {expandedGroup.members.length}
                      </span>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--fs-micro)', marginLeft: 2 }} title="重命名" onClick={() => renameFolder(expandedGroup.id)}>
                        <PencilSimple size={11} style={{ verticalAlign: -2 }} />重命名
                      </button>
                      <button
                        onPointerDown={() => setExpanded(null)}
                        title="关闭"
                        style={{ marginLeft: 'auto', width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit', fontSize: 16 }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative', zIndex: 1, isolation: 'isolate', padding: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          <span className="chip" style={{ opacity: 0.6 }}>拖到目标处以移动：</span>
                          {groups.filter((g) => g.id !== expanded).map((g) => (
                            <span
                              key={g.id}
                              className={`chip chip-droptarget ${draggingApp ? 'chip-lift' : ''}`}
                              title={`移入「${g.name}」`}
                              onDragOver={acceptDropOnFolder}
                              onDrop={(e) => dropOnFolder(e, g.id)}
                            >
                              {g.name}
                            </span>
                          ))}
                          <span
                            className={`chip chip-droptarget ${draggingApp ? 'chip-lift' : ''}`}
                            title="移出到桌面统一区（不删除）"
                            onDragOver={acceptDropOnFolder}
                            onDrop={(e) => {
                              if (draggingApp) {
                                e.preventDefault()
                                e.stopPropagation()
                                assignApp(draggingApp, null)
                                setDraggingApp(null)
                              }
                            }}
                          >
                            <ArrowsClockwise size={11} style={{ marginRight: 4, verticalAlign: -2 }} />
                            移出到统一区
                          </span>
                        </div>
                        <div style={GRID}>
                          {expandedGroup.members.map((a) => (
                            <BoxTile
                              key={a.id}
                              app={a}
                              kind={kind}
                              draggable
                              dropActive={!!draggingApp}
                              onInsertBefore={(_, target) => {
                                if (draggingApp) insertApp(draggingApp, target.path, expanded)
                              }}
                              onDragStart={() => onAppDragStart(a)}
                              onDragEnd={onAppDragEnd}
                              onLaunch={() => void launch(a)}
                              onOpenMenu={(e, app) => openTileMenu(e, app)}
                            />
                          ))}
                          <AppendSlotGroup
                            id={`append-${expanded}`}
                            dragging={!!draggingApp}
                            hint="拖到这里排到文件夹末尾"
                            onDrop={() => appendMember(expanded)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )
            : showFolders ? (
            /* ---- Folder view: user folders + loose items in one grid ----
               Loose tiles act as drop targets: dropping another item onto one
               bundles both into a brand-new folder (phone-style grouping). */
            <div style={GRID}>
              {loading && items.length === 0 ? (
                <div className="skeleton" style={{ gridColumn: '1 / -1', height: 120 }} />
              ) : (
                <>
                  {groups.map((g) => (
                    <FolderTile
                      key={g.id}
                      group={g}
                      dragSession={!!draggingApp}
                      folderDragSession={!!draggingFolder}
                      isSelf={draggingFolder === g.id}
                      onOpen={() => setExpanded(g.id)}
                      onMenu={(e) => openFolderMenu(e, g)}
                      onMoveAppIn={(e) => dropOnFolder(e, g.id)}
                      onReorderBefore={() => {
                        if (draggingFolder && draggingFolder !== g.id) reorderFolder(draggingFolder, g.id)
                      }}
                      onFolderDragStart={() => setDraggingFolder(g.id)}
                      onFolderDragEnd={() => setDraggingFolder(null)}
                    />
                  ))}
                  {loose.map((a) => (
                    <BoxTile
                      key={a.id}
                      app={a}
                      kind={kind}
                      draggable
                      dropActive={!!draggingApp}
                      onDropToTile={bundleIntoFolder}
                      onInsertBefore={(_, target) => {
                      if (draggingApp) insertApp(draggingApp, target.path)
                    }}
                      onDragStart={() => onAppDragStart(a)}
                      onDragEnd={onAppDragEnd}
                      onLaunch={() => void launch(a)}
                      onOpenMenu={(e, app) => openTileMenu(e, app)}
                    />
                  ))}
                  <AppendSlotGroup
                    id="append-loose"
                    dragging={!!draggingApp || !!draggingFolder}
                    hint={draggingFolder ? '拖到这里排到文件夹末尾' : '拖到这里排到网格末尾'}
                    onDrop={() => {
                      if (draggingFolder) reorderFolder(draggingFolder, null)
                      else appendLoose()
                    }}
                  />
                </>
              )}
              {!loading && items.length === 0 && (
                <div className="file-meta" style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: 26, lineHeight: 1.6, padding: '0 8px' }}>
                  {config.hint}。空白处右键可添加，也可用「新建」建文件夹；把软件拖到另一个软件上即可收纳成一个文件夹。
                </div>
              )}
            </div>
          ) : (
            <div style={GRID}>
              {loading && items.length === 0 ? (
                <div className="skeleton" style={{ gridColumn: '1 / -1', height: 120 }} />
              ) : (
                visible.map((a) => (
                  <BoxTile
                    key={a.id}
                    app={a}
                    kind={kind}
                    draggable={showFolders}
                    onDragStart={() => onAppDragStart(a)}
                    onDragEnd={onAppDragEnd}
                    onLaunch={() => void launch(a)}
                    onOpenMenu={(e, app) => openTileMenu(e, app)}
                  />
                ))
              )}
            </div>
          )}
          {!showFolders && !loading && visible.length === 0 && (
            <div
              className="file-meta"
              style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: 26, lineHeight: 1.6, padding: '0 8px' }}
            >
              {items.length === 0
                ? `${config.hint}。\n在空白处右键即可添加，也可以直接把文件拖进来。`
                : '该分类下暂无内容。'}
            </div>
          )}
        </div>
      </div>

      {nameDlg && (
        <FolderNameModal
          target={nameDlg}
          confirmLabel={nameDlg.mode === 'rename' ? '保存' : '创建'}
          onConfirm={(name) => {
            try {
              if (nameDlg.mode === 'create') commitCreate(name)
              else commitRename(name)
            } catch (err) {
              console.error('folder dialog action failed', err)
              pushToast('error', '操作失败，请重试')
            } finally {
              // Always dismiss, even if the action threw, so the dialog can
              // never get stuck open.
              setNameDlg(null)
            }
          }}
          onClose={() => setNameDlg(null)}
        />
      )}
      {delDlg && (
        <PortalConfirm
          title="删除文件夹"
          message={`确定删除文件夹「${groupLabel(delDlg)}」？里面的软件会放回桌面统一区，不会被删除。`}
          confirmLabel="删除"
          danger
          onConfirm={() => {
            commitDelete(delDlg)
            setDelDlg(null)
          }}
          onClose={() => setDelDlg(null)}
        />
      )}
      {dissolveDlg && (
        <PortalConfirm
          title="打散全部文件夹"
          message="确定把所有文件夹全部散开？所有软件都会回到统一区，文件夹将被全部删除（软件本身不会被删除）。"
          confirmLabel="打散"
          danger
          onConfirm={() => {
            commitDissolveAll()
            setDissolveDlg(false)
          }}
          onClose={() => setDissolveDlg(false)}
        />
      )}
    </>
  )
}

function BoxTile({
  app,
  kind,
  onLaunch,
  onOpenMenu,
  draggable,
  onDragStart,
  onDragEnd,
  dropActive,
  onDropToTile,
  onInsertBefore
}: {
  app: AppEntry
  kind: BoxKind
  onLaunch: () => void
  onOpenMenu: (e: ReactMouseEvent, app: AppEntry) => void
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  /** When true this tile accepts a dropped item to bundle into a new folder. */
  dropActive?: boolean
  onDropToTile?: (e: ReactDragEvent, app: AppEntry) => void
  /** Dropping on the left edge inserts the dragged app BEFORE this tile. */
  onInsertBefore?: (e: ReactDragEvent, app: AppEntry) => void
}) {
  const tint = TYPE_COLOR[extOf(app.path)] ?? DEFAULT_TINT
  // True while the pointer hugs the left edge of this tile, showing the
  // vertical insertion marker between this tile and its left neighbour.
  const [insert, setInsert] = useState(false)
  // Whether this specific tile is currently hovered as a drop target (only
  // meaningful once a drag session is active) — drives the folder-highlight.
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!dropActive) {
      setInsert(false)
      setOver(false)
    }
  }, [dropActive])

  const edgeX = (e: ReactDragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX - rect.left
  }

  return (
    <button
      type="button"
      className={`app-tile ${over && dropActive && !insert ? 'folder-over' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragEnter={(e) => {
        if (!dropActive) return
        e.preventDefault()
        setOver(true)
      }}
      onDragOver={
        dropActive
          ? (e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setInsert(edgeX(e) <= INSERT_EDGE)
            }
          : undefined
      }
      onDragLeave={() => {
        setInsert(false)
        setOver(false)
      }}
      onDrop={
        dropActive
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              setInsert(false)
              // Left edge = insert before; anywhere else = bundle a folder.
              if (edgeX(e) <= INSERT_EDGE) {
                if (onInsertBefore) onInsertBefore(e, app)
              } else if (onDropToTile) {
                onDropToTile(e, app)
              }
            }
          : undefined
      }
      onClick={onLaunch}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpenMenu(e, app)
      }}
      title={app.name}
      style={{
        position: 'relative',
        minHeight: 84,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '8px 2px',
        borderRadius: 'var(--radius-md)'
      }}
    >
      {insert && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 4,
            bottom: 4,
            width: 3,
            borderRadius: 2,
            background: 'var(--accent, #6c8cff)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent, #6c8cff) 40%, transparent)',
            pointerEvents: 'none'
          }}
        />
      )}
      {app.isDir ? (
        <span
          style={{
            width: 46,
            height: 46,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent, #6c8cff)'
          }}
        >
          <FolderOpen size={40} weight="fill" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }} />
        </span>
      ) : kind === 'images' && app.icon ? (
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)'
          }}
        >
          <img src={app.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </span>
      ) : kind === 'videos' || kind === 'docs' ? (
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: `color-mix(in srgb, ${tint} 22%, transparent)`,
            border: `1px solid color-mix(in srgb, ${tint} 40%, transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tint
          }}
        >
          {kind === 'videos' ? (
            <VideoCamera size={22} weight="fill" />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1, color: tint }}>
              {extBadge(app)}
            </span>
          )}
        </span>
      ) : app.icon ? (
        <img
          src={app.icon}
          alt=""
          style={{ width: 40, height: 40, objectFit: 'contain', imageRendering: ('-webkit-optimize-contrast' as never) }}
        />
      ) : (
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--fs-body-sm)',
            fontWeight: 600,
            background: 'var(--surface-2)',
            color: 'var(--text-2)'
          }}
        >
          {app.name.slice(0, 1)}
        </span>
      )}

      <span
        className="file-meta"
        style={{ fontSize: 'var(--fs-micro)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2, color: 'var(--text-1)' }}
      >
        {displayName(app)}
      </span>
    </button>
  )
}

/** iOS-style folder tile: a 2×2 stack of member icons in a rounded face, with a
 *  count badge and label — click to open, drag a software tile onto its body to
 *  move into it, or drag the folder itself to reorder it in the grid (drop on
 *  a sibling's left edge to insert before that folder). */
function FolderTile({
  group,
  dragSession,
  folderDragSession,
  isSelf,
  onOpen,
  onMenu,
  onMoveAppIn,
  onReorderBefore,
  onFolderDragStart,
  onFolderDragEnd
}: {
  group: { id: string; name: string; members: AppEntry[] }
  /** An app drag is in progress → this folder is a move-in target. */
  dragSession: boolean
  /** A folder drag is in progress → this folder is a reorder target. */
  folderDragSession: boolean
  /** This folder is the one currently being dragged (hide self as a target). */
  isSelf: boolean
  onOpen: () => void
  onMenu: (e: ReactMouseEvent) => void
  onMoveAppIn: (e: ReactDragEvent) => void
  onReorderBefore: (e: ReactDragEvent) => void
  onFolderDragStart: () => void
  onFolderDragEnd: () => void
}) {
  const tiles = group.members.slice(0, 4)
  const [over, setOver] = useState(false)
  const [insert, setInsert] = useState(false)
  const edgeX = (e: ReactDragEvent) => e.clientX - e.currentTarget.getBoundingClientRect().left
  // Highlight only matters during an active drag; when the session ends (drop
  // elsewhere, Esc, lost pointer) we can't rely on a dragleave reaching this
  // tile, so reset it whenever either session closes.
  useEffect(() => {
    if (!dragSession) setOver(false)
  }, [dragSession])
  useEffect(() => {
    if (!folderDragSession) setInsert(false)
  }, [folderDragSession])
  const inInsert = folderDragSession && insert && !isSelf
  const inAppDrop = dragSession && over && !inInsert
  const active = folderDragSession || dragSession
  return (
    <button
      type="button"
      className={`app-tile ${inAppDrop ? 'folder-over' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onFolderDragStart()
      }}
      onDragEnd={onFolderDragEnd}
      onDragEnter={(e) => {
        if (!active) return
        e.preventDefault()
        if (dragSession) setOver(true)
      }}
      onDragOver={(e) => {
        if (!active) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const x = edgeX(e)
        if (folderDragSession) {
          setInsert(x <= INSERT_EDGE)
          setOver(false)
        } else if (dragSession) {
          setInsert(false)
          setOver(true)
        }
      }}
      onDragLeave={() => {
        setOver(false)
        setInsert(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        setInsert(false)
        if (inInsert) onReorderBefore(e)
        else if (dragSession) onMoveAppIn(e)
      }}
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onMenu(e)
      }}
      title={`${group.name}（${group.members.length} 项）`}
      style={{ position: 'relative', minHeight: 84, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 2px', borderRadius: 'var(--radius-md)' }}
    >
      {inInsert && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 4,
            bottom: 4,
            width: 3,
            borderRadius: 2,
            background: 'var(--accent, #6c8cff)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent, #6c8cff) 40%, transparent)',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />
      )}
      <span
        className="folder-face"
        style={{
          width: 50,
          height: 50,
          borderRadius: 13,
          background: 'color-mix(in srgb, var(--text-1) 6%, var(--surface-3))',
          border: '1px solid var(--border)',
          boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-1) 8%, transparent), 0 1px 2px rgba(0,0,0,0.12)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 3,
          padding: 5,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {tiles.map((a) => (
          <span key={a.id} className="folder-mini" style={{ borderRadius: 5, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {a.icon && !a.isDir ? (
              <img src={a.icon} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: ('-webkit-optimize-contrast' as never) }} />
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>{displayName(a).slice(0, 1)}</span>
            )}
          </span>
        ))}
      </span>
      <span className="file-meta" style={{ fontSize: 'var(--fs-micro)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2, color: 'var(--text-1)' }}>
        {group.name}
      </span>
    </button>
  )
}

/** A trailing grid slot where a dragged app is dropped to append it to the end
 *  of the loose area (or a folder's member grid). Only becomes an active target
 *  while an app drag session is in progress. */
function AppendSlotGroup({
  id,
  dragging,
  hint,
  onDrop
}: {
  id: string
  dragging: boolean
  hint: string
  onDrop: () => void
}) {
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!dragging) setOver(false)
  }, [dragging])
  return (
    <span
      id={id}
      className="append-slot"
      onDragOver={
        dragging
          ? (e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setOver(true)
            }
          : undefined
      }
      onDragLeave={() => setOver(false)}
      onDragEnd={() => setOver(false)}
      onDrop={
        dragging
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              setOver(false)
              onDrop()
            }
          : undefined
      }
      style={{
        minHeight: 84,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-md)',
        border: `1.5px ${over ? 'solid' : 'dashed'} ${over ? 'var(--accent, #6c8cff)' : 'var(--border)'}`,
        color: 'var(--text-3)',
        fontSize: 'var(--fs-micro)',
        lineHeight: 1.4,
        opacity: dragging ? 1 : 0.4,
        textAlign: 'center',
        padding: '0 4px',
        transition: 'border-color .15s, background .15s',
        background: over ? 'color-mix(in srgb, var(--accent, #6c8cff) 10%, transparent)' : 'transparent'
      }}
    >
      {dragging ? hint : '+'}
    </span>
  )
}

/** Modal overlay attached to the React root (not to the card), so an ancestor
 *  `transform` on the dashboard card never skews a centered dialog. */
function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, (document.getElementById('root') as HTMLElement | null) ?? document.body)
}

type FolderNameTarget =
  | { mode: 'create'; path: string | null }
  | { mode: 'rename'; id: string }

/** A small polished text-input dialog for creating / renaming folders,
 *  replacing the native `window.prompt`. */
function FolderNameModal({
  target,
  confirmLabel,
  onConfirm,
  onClose
}: {
  target: FolderNameTarget
  confirmLabel: string
  onConfirm: (name: string) => void
  onClose: () => void
}) {
  const title = target.mode === 'rename' ? '重命名文件夹' : '新建文件夹'
  const [val, setVal] = useState(target.mode === 'rename' ? groupLabel(target.id) : '新文件夹')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const submit = () => {
    if (val.trim()) onConfirm(val.trim())
  }
  return (
    <Portal>
      <div className="modal-overlay motion-backdrop-enter" onClick={onClose}>
        <div className="modal motion-modal-enter" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
          <h3>{title}</h3>
          <input
            ref={ref}
            className="folder-name-input"
            value={val}
            placeholder="文件夹名称"
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') onClose()
            }}
          />
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" onClick={submit} disabled={!val.trim()}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

/** Wraps the shared ConfirmModal in a portal so it stays centered above the card. */
function PortalConfirm({
  ...props
}: React.ComponentProps<typeof ConfirmModal>) {
  return <Portal>{<ConfirmModal {...props} />}</Portal>
}

export { BoxTile }

/** Content equality so a 6s-scan refresh doesn't just swap in a fresh array
 *  and force every tile to re-render / re-decode its icon. */
function entryListEqual(a: AppEntry[], b: AppEntry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.path !== y.path || x.name !== y.name || x.source !== y.source || x.isDir !== y.isDir || x.icon !== y.icon) {
      return false
    }
  }
  return true
}