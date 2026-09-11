import { File, FolderSimple, Target, Waveform } from '@phosphor-icons/react'
import { useHermesStore } from '../hermes/HermesStore'

export function AgentContext({ compact = false }: { compact?: boolean }) {
  const context = useHermesStore((state) => state.context)
  const values = [
    { label: '当前项目', value: context.currentProject?.name ?? '未选择项目', icon: <FolderSimple size={15} /> },
    { label: '当前页面', value: context.currentPage, icon: <Waveform size={15} /> },
    { label: '最近文件', value: `${context.fileCount || context.recentFiles.length} 个文件`, icon: <File size={15} /> },
    { label: '工作模式', value: context.currentMode, icon: <Waveform size={15} /> },
    { label: '关注任务', value: context.focusTask?.title ?? '暂无', icon: <Target size={15} /> }
  ]
  return <section className={`agent-context ${compact ? 'is-compact' : ''}`} aria-label="当前工作上下文">
    {!compact && <div className="agent-section-label">上下文</div>}
    <div className="agent-context-grid">
      {values.map((item) => <div className="agent-context-item" key={item.label}>
        <span aria-hidden="true">{item.icon}</span><div><small>{item.label}</small><strong title={item.value}>{item.value}</strong></div>
      </div>)}
    </div>
  </section>
}
