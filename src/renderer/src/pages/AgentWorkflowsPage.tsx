import { ArrowSquareOut, Play, Sparkle, Timer } from '@phosphor-icons/react'
import { useAppStore } from '../store'

const workflows = [
  { title: '分析项目状态', detail: '读取项目、任务和记忆，生成下一步工作建议。', prompt: '分析当前项目状态，并给出下一步建议。', icon: <Sparkle size={18} /> },
  { title: '继续最近任务', detail: '从当前 Workspace Context 恢复上一次未完成的工作。', prompt: '继续最近一项未完成任务。', icon: <Play size={18} /> },
  { title: '工作模式', detail: '进入已保存的工作模式，恢复关联的软件、文件和任务。', prompt: '', icon: <Timer size={18} /> }
]

export function AgentWorkflowsPage() {
  const setModule = useAppStore((state) => state.setModule)
  return <main className="workspace agents-page"><header className="agents-page-head"><div><span className="page-kicker">INTELLIGENCE</span><h1>Workflows</h1><p>把重复的工作过程组织为可以重新调用的流程。</p></div></header><div className="agent-workflows">{workflows.map((workflow) => <article className="agent-workflow-card" key={workflow.title}><span aria-hidden="true">{workflow.icon}</span><h2>{workflow.title}</h2><p>{workflow.detail}</p><button type="button" onClick={() => { if (workflow.prompt) { window.dispatchEvent(new CustomEvent('workdeck:agent-task', { detail: workflow.prompt })); setModule('agents') } else setModule('scenarios') }}>打开流程 <ArrowSquareOut size={14} /></button></article>)}</div></main>
}
