import type { ReactNode } from 'react'
import { ArrowRight, Lightning, Sparkle, Target } from '@phosphor-icons/react'

export interface HermesQuickAction {
  id: string
  label: string
  prompt: string
  icon?: ReactNode
}

export const FLOATING_HERMES_ACTIONS: HermesQuickAction[] = [
  { id: 'optimize-page', label: '优化当前页面', prompt: '优化当前页面', icon: <Sparkle size={15} weight="fill" /> },
  { id: 'analyze-project', label: '分析项目状态', prompt: '分析项目状态', icon: <Lightning size={15} weight="fill" /> },
  { id: 'continue-task', label: '继续最近任务', prompt: '继续最近任务', icon: <Target size={15} weight="fill" /> }
]

export const FULL_HERMES_ACTIONS: HermesQuickAction[] = [
  { id: 'read-brief', label: '读取项目说明', prompt: '读取当前项目说明，并总结关键约束。', icon: <Sparkle size={15} /> },
  { id: 'summarize', label: '生成总结', prompt: '根据当前项目上下文生成一份工作总结。', icon: <Lightning size={15} /> },
  { id: 'check-code', label: '检查代码', prompt: '检查当前项目的未完成改动并列出风险。', icon: <Target size={15} /> },
  { id: 'continue', label: '继续任务', prompt: '继续最近一次未完成的 Hermes 任务。', icon: <ArrowRight size={15} /> }
]

export function HermesQuickActions({
  actions,
  onSelect,
  compact = false
}: {
  actions: HermesQuickAction[]
  onSelect: (action: HermesQuickAction) => void
  compact?: boolean
}) {
  return (
    <div className={`hermes-quick-actions ${compact ? 'is-compact' : ''}`}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="hermes-quick-action"
          onClick={() => onSelect(action)}
        >
          <span className="hermes-quick-action-icon">{action.icon}</span>
          <span>{action.label}</span>
          <ArrowRight size={13} className="hermes-quick-action-arrow" />
        </button>
      ))}
    </div>
  )
}
