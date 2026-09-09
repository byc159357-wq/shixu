import { useEffect, useState } from 'react'
import { FloppyDisk, Play, Trash, Lightning } from '@phosphor-icons/react'
import { Button, ConfirmModal } from './ui'
import { useAppStore } from '../store'
import type { PrepareResult, WorkMode, ScenarioSuggestion } from '../../../shared/types'

const KIND_LABEL: Record<string, string> = {
  apps: '软件',
  images: '图片',
  docs: '文件',
  folders: '文件夹',
  videos: '视频',
  file: '文件'
}

function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

export function ScenarioPanel({
  prep,
  toast
}: {
  prep: PrepareResult | null
  toast: (type: 'success' | 'error', msg: string) => void
}) {
  const workspaceContext = useAppStore((s) => s.workspaceContext)
  const [presets, setPresets] = useState<WorkMode[]>([])
  const [loaded, setLoaded] = useState(false)
  const [suggestions, setSuggestions] = useState<ScenarioSuggestion[] | null>(null)
  const [learning, setLearning] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<WorkMode | null>(null)
  const [prepName, setPrepName] = useState('')
  const currentModeContext = {
    project: workspaceContext?.currentProject?.id ?? null,
    tasks: workspaceContext?.focusTask ? [workspaceContext.focusTask.id] : []
  }

  const refresh = async () => {
    setPresets(await window.workdeck.scenario.list())
  }

  useEffect(() => {
    void refresh().then(() => setLoaded(true))
  }, [])

  const runLearn = async () => {
    setLearning(true)
    try {
      setSuggestions(await window.workdeck.scenario.learn())
    } finally {
      setLearning(false)
    }
  }

  const saveSuggestion = async (s: ScenarioSuggestion) => {
    await window.workdeck.scenario.create({ name: s.name, items: s.items, ...currentModeContext })
    toast('success', `已保存场景「${s.name}」`)
    await refresh()
  }

  /** One-click save every learned suggestion as a preset (LLM-named or derived). */
  const saveAll = async () => {
    if (!suggestions || suggestions.length === 0) return
    setSavingAll(true)
    try {
      for (const s of suggestions) {
        await window.workdeck.scenario.create({ name: s.name, items: s.items, ...currentModeContext })
      }
      toast('success', `已一键保存 ${suggestions.length} 个场景`)
      await refresh()
      setSuggestions(null)
    } catch (err) {
      toast('error', `批量保存出错：${String(err)}`)
    } finally {
      setSavingAll(false)
    }
  }

  const savePrep = async () => {
    if (!prep || prep.items.length === 0) return
    const name = prepName.trim() || '本次工作'
    const items = prep.items.map((it) => ({ kind: it.kind, name: it.name, path: it.path }))
    await window.workdeck.scenario.create({ name, items, ...currentModeContext })
    toast('success', `已保存场景「${name}」`)
    setPrepName('')
    await refresh()
  }

  const applyPreset = async (p: WorkMode) => {
    setApplyingId(p.id)
    try {
      const r = await window.workdeck.scenario.apply(p.id)
      if (!r.ok) toast('error', `部分未打开：${r.errors.join('；')}`)
      else toast('success', `已按「${p.name}」打开 ${p.items.length} 项`)
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>工作模式</h3>
        <span className="badge badge-neutral">保存软件、文件、项目和任务，一键恢复工作状态</span>
      </div>

      <div className="file-meta" style={{ marginBottom: 'var(--space-3)' }}>
        {prep && prep.items.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ width: 200, height: 32 }}
              placeholder="场景名称（如：做海报）"
              value={prepName}
              onChange={(e) => setPrepName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void savePrep()
              }}
            />
            <Button size="sm" variant="primary" onClick={() => void savePrep()}>
              <FloppyDisk size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              保存本次工作为模式
            </Button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <Button size="sm" onClick={() => void runLearn()} disabled={learning}>
          <Lightning size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          {learning ? '分析中…' : '从打开记录学习行为模式'}
        </Button>
        {suggestions !== null && suggestions.length > 0 && (
          <Button size="sm" variant="primary" onClick={() => void saveAll()} disabled={savingAll}>
            <FloppyDisk size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            {savingAll ? '保存中…' : `一键保存全部（${suggestions.length}）`}
          </Button>
        )}
        {(suggestions === null || suggestions.length > 0) && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSuggestions(null)}
            style={{ visibility: suggestions?.length ? 'visible' : 'hidden' }}
          >
            收起建议
          </Button>
        )}
      </div>

      {suggestions !== null && (
        <>
          {suggestions.length === 0 ? (
            <div className="file-meta" style={{ marginBottom: 'var(--space-3)' }}>
              暂未发现成组的打开模式。多通过软件盒 / 文件库打开同批软件与文件（中间停顿小于 25 分钟），ATELIER 会从这些会话中沉淀出可保存的场景。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              {suggestions.map((s, idx) => (
                <div key={idx} className="file-row" style={{ alignItems: 'flex-start', minHeight: 0 }}>
                  <span className="file-main">
                    <div className="file-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {s.name}
                      <span className="badge badge-available">
                        {s.count > 1 ? `重复 ${s.count} 次` : '单次会话'}
                      </span>
                      <span className="badge badge-neutral">最近 {relTime(s.lastAt)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {s.items.map((it) => (
                        <span key={it.path} className="badge badge-neutral" title={it.path}>
                          {KIND_LABEL[it.kind] ?? it.kind} · {it.name}
                        </span>
                      ))}
                    </div>
                  </span>
                  <Button size="sm" variant="primary" onClick={() => void saveSuggestion(s)} style={{ flexShrink: 0 }}>
                    <FloppyDisk size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                    保存
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {loaded && presets.length === 0 ? (
        <div className="file-meta" style={{ marginBottom: 'var(--space-2)' }}>
          还没有保存的场景。用右上按钮，或在「帮我准备工作」面板里把一批常用软件 / 文件保存成一个场景。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {presets.map((p) => (
            <div key={p.id} className="file-row" style={{ alignItems: 'flex-start', minHeight: 0 }}>
              <span className="file-main">
                <div className="file-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {p.name}
                  {p.auto === 1 && <span className="badge badge-neutral">自动</span>}
                  <span className="badge badge-neutral">{p.items.length} 项 · 使用 {p.usageCount} 次</span>
                  {p.project && <span className="badge badge-available">已绑定项目</span>}
                  {p.tasks.length > 0 && <span className="badge badge-neutral">{p.tasks.length} 个任务</span>}
                </div>
                {p.description && (
                  <div className="file-meta" style={{ marginTop: 2 }}>{p.description}</div>
                )}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {p.items.map((it) => (
                    <span key={it.path} className="badge badge-neutral" title={it.path}>
                      {KIND_LABEL[it.kind] ?? it.kind} · {it.name}
                    </span>
                  ))}
                </div>
              </span>
              <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Button size="sm" variant="primary" onClick={() => void applyPreset(p)} disabled={applyingId === p.id} title="一键打开该场景所有项目">
                  <Play size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  {applyingId === p.id ? '进入中…' : '进入模式'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(p)} aria-label="删除场景">
                  <Trash size={13} />
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="file-meta" style={{ marginTop: 'var(--space-3)' }}>
        提示：进入工作模式会打开保存的软件、文件和文件夹，并恢复绑定的项目与任务；只记录路径与名称，不读取文件内容。
      </div>

      {deleting && (
        <ConfirmModal
          title="删除场景"
          message={`删除「${deleting.name}」？场景只影响快捷批量打开，不会删除任何文件。`}
          confirmLabel="删除"
          danger
          onConfirm={async () => {
            await window.workdeck.scenario.remove(deleting.id)
            toast('success', `已删除「${deleting.name}」`)
            await refresh()
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
