import { useEffect, useState } from 'react'
import { ArrowSquareOut, Brain, FolderSimple } from '@phosphor-icons/react'
import { Button, EmptyState } from '../components/ui'
import { useAppStore } from '../store'
import type { ProjectMemory } from '../../../shared/types'

export function AgentMemoryPage() {
  const project = useAppStore((state) => state.workspaceContext?.currentProject)
  const setModule = useAppStore((state) => state.setModule)
  const setProjectTab = useAppStore((state) => state.setProjectTab)
  const [memory, setMemory] = useState<ProjectMemory | null>(null)
  useEffect(() => { if (project) void window.workdeck.memory.get(project.id).then(setMemory) }, [project])
  if (!project) return <main className="workspace agents-page"><header className="agents-page-head"><div><span className="page-kicker">INTELLIGENCE</span><h1>Memory</h1><p>项目的长期上下文会保存在本地。</p></div></header><div className="card"><EmptyState icon={<Brain size={38} />} title="选择一个项目后查看记忆" hint="项目偏好、决策、历史和重要文件会在这里汇总。" /></div></main>
  const groups = [{ title: '项目偏好', items: memory?.preferences ?? [] }, { title: '历史决策', items: memory?.decisions ?? [] }, { title: 'AI 备注', items: memory?.aiNotes ?? [] }]
  return <main className="workspace agents-page"><header className="agents-page-head"><div><span className="page-kicker">INTELLIGENCE</span><h1>Memory</h1><p>{project.name} 的长期工作上下文，保存在本地 SQLite。</p></div><Button variant="secondary" onClick={() => { setProjectTab('memory'); setModule('projects') }}><FolderSimple size={15} /> 在项目空间编辑 <ArrowSquareOut size={14} /></Button></header><div className="agent-memory-grid">{groups.map((group) => <section className="agent-memory-card" key={group.title}><h2>{group.title}</h2>{group.items.length ? <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>尚未记录</p>}</section>)}<section className="agent-memory-card"><h2>重要文件</h2><strong>{memory?.importantFiles.length ?? 0} 个</strong><p>项目空间中标记的重要文件将随 Agent 上下文一起使用。</p></section></div></main>
}
