import { Brain, Files, FolderOpen, Lightning, Target } from '@phosphor-icons/react'
import type { HermesContextSnapshot } from './HermesStore'
import { HermesQuickActions, type HermesQuickAction } from './HermesQuickActions'

export function HermesContextPanel({
  context,
  actions,
  compact = false,
  onAction,
  onOpenProject,
  onOpenMemory
}: {
  context: HermesContextSnapshot
  actions?: HermesQuickAction[]
  compact?: boolean
  onAction?: (action: HermesQuickAction) => void
  onOpenProject?: () => void
  onOpenMemory?: () => void
}) {
  const project = context.currentProject?.name ?? '未选择项目'
  return (
    <aside className={`hermes-context-panel ${compact ? 'is-compact' : ''}`} aria-label="当前 Hermes 上下文">
      <div className="hermes-context-head">
        <span className="hermes-context-eyebrow">当前上下文</span>
        <span className="hermes-context-live"><span /> LIVE</span>
      </div>
      <div className="hermes-context-list">
        <button type="button" className="hermes-context-item" onClick={onOpenProject} disabled={!onOpenProject}>
          <span className="hermes-context-icon"><FolderOpen size={15} /></span>
          <span><small>项目</small><strong>{project}</strong></span>
        </button>
        <div className="hermes-context-item">
          <span className="hermes-context-icon"><Files size={15} /></span>
          <span><small>文件</small><strong>{context.fileCount || context.recentFiles.length} 个最近文件</strong></span>
        </div>
        <div className="hermes-context-item">
          <span className="hermes-context-icon"><Lightning size={15} /></span>
          <span><small>当前页面</small><strong>{context.currentPage}</strong></span>
        </div>
        <div className="hermes-context-item">
          <span className="hermes-context-icon"><Brain size={15} /></span>
          <span><small>工作模式</small><strong>{context.currentMode}</strong></span>
        </div>
        <div className="hermes-context-item">
          <span className="hermes-context-icon"><Target size={15} /></span>
          <span><small>关注任务</small><strong>{context.focusTask?.title ?? '暂无'}</strong></span>
        </div>
      </div>
      {onOpenMemory && (
        <button type="button" className="hermes-context-link" onClick={onOpenMemory}>
          <Brain size={14} />
          <span>打开项目记忆</span>
        </button>
      )}
      {actions && onAction && (
        <>
          <div className="hermes-context-divider" />
          <div className="hermes-context-section-title">快捷操作</div>
          <HermesQuickActions actions={actions} onSelect={onAction} compact />
        </>
      )}
    </aside>
  )
}
