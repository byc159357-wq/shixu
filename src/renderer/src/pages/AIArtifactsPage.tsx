import { useEffect, useMemo, useState } from 'react'
import {
  Package,
  Plus,
  Trash,
  ArrowLeft,
  FileText,
  Code,
  Image,
  File,
  DownloadSimple,
  Copy
} from '@phosphor-icons/react'
import { useAppStore } from '../store'

export type ArtifactKind = 'text' | 'code' | 'image' | 'file'

export interface Artifact {
  id: string
  title: string
  kind: ArtifactKind
  content: string
  createdAt: number
}

const STORAGE_KEY = 'workdeck-ai-artifacts-v1'

const SAMPLE: Artifact[] = [
  {
    id: 'a_demo_1',
    title: '项目总结.md',
    kind: 'text',
    content: '## 项目总结\n\n1. 完成首页自由布局与响应式优化。\n2. AI 助手接入 Hermes，支持工具调用。\n3. 打包 v0.1.0 安装包已就绪。',
    createdAt: Date.now() - 1000 * 60 * 60 * 2
  },
  {
    id: 'a_demo_2',
    title: '示例 React 组件',
    kind: 'code',
    content: "export function Greeting({ name }: { name: string }) {\n  return <h1>Hello, {name}</h1>\n}",
    createdAt: Date.now() - 1000 * 60 * 60 * 5
  }
]

function loadArtifacts(): Artifact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return SAMPLE
    const parsed = JSON.parse(raw) as Artifact[]
    return Array.isArray(parsed) && parsed.length ? parsed : SAMPLE
  } catch {
    return SAMPLE
  }
}

function saveArtifacts(list: Artifact[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

function kindIcon(kind: ArtifactKind) {
  switch (kind) {
    case 'text': return <FileText size={18} />
    case 'code': return <Code size={18} />
    case 'image': return <Image size={18} />
    default: return <File size={18} />
  }
}

function kindLabel(kind: ArtifactKind) {
  switch (kind) {
    case 'text': return '文本'
    case 'code': return '代码'
    case 'image': return '图片'
    default: return '文件'
  }
}

export function AIArtifactsPage() {
  const setModule = useAppStore((s) => s.setModule)
  const [artifacts, setArtifacts] = useState<Artifact[]>(loadArtifacts)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ArtifactKind>('all')

  useEffect(() => {
    saveArtifacts(artifacts)
  }, [artifacts])

  const filtered = useMemo(() => {
    return artifacts
      .filter((a) => filter === 'all' || a.kind === filter)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [artifacts, filter])

  const selected = useMemo(
    () => artifacts.find((a) => a.id === selectedId) ?? filtered[0] ?? null,
    [artifacts, selectedId, filtered]
  )

  const removeArtifact = (id: string) => {
    setArtifacts((prev) => prev.filter((a) => a.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const copyContent = (text?: string) => {
    if (!text) return
    void navigator.clipboard.writeText(text)
  }

  return (
    <main className="workspace">
      <div className="page-header">
        <button className="icon-btn" onClick={() => setModule('ai')} title="返回 AI 助手">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>AI 产物</h1>
          <div className="sub">集中查看、复制与管理 AI 生成的文本、代码与文件</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModule('ai')}>
          <Plus size={13} style={{ marginRight: 4 }} />
          去 AI 助手生成
        </button>
      </div>

      <div className="ai-artifact-shell">
        <div className="card ai-artifact-side">
          <div className="ai-artifact-filters">
            {(['all', 'text', 'code', 'image', 'file'] as const).map((k) => (
              <button
                key={k}
                className={`ai-artifact-filter ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}
              >
                {k === 'all' ? '全部' : kindLabel(k)}
              </button>
            ))}
          </div>
          <div className="ai-artifact-list">
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6) var(--space-3)' }}>
                <Package size={32} color="var(--text-3)" />
                <div className="empty-state-title">没有产物</div>
                <div className="empty-state-sub">在 AI 助手生成的内容会同步出现在这里。</div>
              </div>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  className={`ai-artifact-item ${selected?.id === a.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(a.id)}
                >
                  <span className="ai-artifact-item-ico">{kindIcon(a.kind)}</span>
                  <span className="ai-artifact-item-title">{a.title}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card ai-artifact-view">
          {selected ? (
            <>
              <div className="ai-artifact-view-head">
                <div className="ai-artifact-view-title">
                  <span className="badge badge-neutral">{kindLabel(selected.kind)}</span>
                  <span>{selected.title}</span>
                </div>
                <div className="ai-artifact-view-acts">
                  <button className="ai-icon-btn" onClick={() => copyContent(selected.content)} title="复制内容">
                    <Copy size={16} />
                  </button>
                  <button className="ai-icon-btn" title="下载">
                    <DownloadSimple size={16} />
                  </button>
                  <button className="ai-icon-btn" onClick={() => removeArtifact(selected.id)} title="删除">
                    <Trash size={16} />
                  </button>
                </div>
              </div>
              <div className="ai-artifact-view-body">
                {selected.kind === 'code' ? (
                  <pre className="ai-md-pre"><code>{selected.content}</code></pre>
                ) : (
                  <div className="ai-md-p" style={{ whiteSpace: 'pre-wrap' }}>{selected.content}</div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ flex: 1 }}>
              <Package size={40} color="var(--text-3)" />
              <div className="empty-state-title">选择一个产物</div>
              <div className="empty-state-sub">左侧列表点击任意产物即可在此预览与复制。</div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
