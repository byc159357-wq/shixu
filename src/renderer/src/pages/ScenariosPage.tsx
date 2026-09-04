import { useEffect, useState } from 'react'
import { Trash, Play, FloppyDisk, Sparkle, Plus, X, Images, FolderOpen, Lightning } from '@phosphor-icons/react'
import { useAppStore } from '../store'
import { Badge, Button, EmptyState } from '../components/ui'
import type { ScenarioPreset, ScenarioSuggestion, SceneItem } from '../../../shared/types'

/** Infer a lightweight SceneItem.kind for open_log records from a picked path. */
function kindOfPath(p: string, isFolder: boolean): string {
  if (isFolder) return 'folder'
  const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'lnk' || ext === 'exe') return 'box'
  if (ext === 'psd' || ext === 'ai' || ext === 'sketch' || ext === 'fig') return 'file'
  return 'file'
}

function baseName(p: string): string {
  const i = p.lastIndexOf('\\')
  return i >= 0 ? p.slice(i + 1) : p
}

const KIND_LABEL: Record<string, string> = {
  apps: '软件',
  images: '图片',
  docs: '文件',
  folders: '文件夹',
  videos: '视频',
  file: '文件'
}

export function ScenariosPage() {
  const pushToast = useAppStore((s) => s.pushToast)
  const [presets, setPresets] = useState<ScenarioPreset[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<ScenarioSuggestion[] | null>(null)
  const [learning, setLearning] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [newName, setNewName] = useState('')

  const refresh = async () => {
    const list = await window.workdeck.scenario.list()
    setPresets(list)
    setDraft((d) => {
      const nd: Record<string, string> = {}
      for (const p of list) nd[p.id] = d[p.id] ?? p.name
      return nd
    })
  }

  useEffect(() => {
    void refresh()
  }, [])

  const saveName = async (id: string) => {
    const name = draft[id]?.trim()
    if (!name) return
    await window.workdeck.scenario.update(id, { name })
    pushToast('success', `已保存「${name}」`)
    await refresh()
  }

  const aiRename = async (id: string) => {
    setAiBusy(id)
    try {
      const name = await window.workdeck.scenario.renameWithAi(id)
      setDraft((d) => ({ ...d, [id]: name }))
      pushToast('success', `AI 已命名：${name}`)
      await refresh()
    } catch (err) {
      pushToast('error', `命名失败：${String(err)}`)
    } finally {
      setAiBusy(null)
    }
  }

  const apply = async (p: ScenarioPreset) => {
    const r = await window.workdeck.scenario.apply(p.id)
    if (!r.ok) pushToast('error', `部分未打开：${r.errors.join('；')}`)
    else pushToast('success', `已打开场景「${p.name}」`)
  }

  const runLearn = async () => {
    setLearning(true)
    try {
      setSuggestions(await window.workdeck.scenario.learn())
    } finally {
      setLearning(false)
    }
  }

  const saveSuggestion = async (s: ScenarioSuggestion) => {
    await window.workdeck.scenario.create({ name: s.name, items: s.items })
    pushToast('success', `已保存场景「${s.name}」`)
    await refresh()
  }

  const saveAll = async () => {
    if (!suggestions || suggestions.length === 0) return
    setSavingAll(true)
    try {
      for (const s of suggestions) {
        await window.workdeck.scenario.create({ name: s.name, items: s.items })
      }
      pushToast('success', `已一键保存 ${suggestions.length} 个场景`)
      await refresh()
      setSuggestions(null)
    } catch (err) {
      pushToast('error', `批量保存出错：${String(err)}`)
    } finally {
      setSavingAll(false)
    }
  }

  const createBlank = async () => {
    const name = newName.trim() || '新场景'
    await window.workdeck.scenario.create({ name, items: [] })
    setNewName('')
    pushToast('success', `已新建场景「${name}」，可向其中添加文件 / 文件夹`)
    await refresh()
  }

  const removeItem = async (p: ScenarioPreset, path: string) => {
    const items = p.items.filter((it) => it.path !== path)
    await window.workdeck.scenario.update(p.id, { items })
    await refresh()
  }

  const addItem = async (p: ScenarioPreset, which: 'file' | 'folder') => {
    const path =
      which === 'folder'
        ? await window.workdeck.file.pickFolder()
        : await window.workdeck.file.pickFile()
    if (!path) return
    const already = p.items.some((it) => it.path === path)
    if (already) {
      pushToast('info', '该项目已在场景中')
      return
    }
    const item: SceneItem = { kind: kindOfPath(path, which === 'folder'), name: baseName(path), path }
    const items = [...p.items, item]
    await window.workdeck.scenario.update(p.id, { items })
    pushToast('success', `已加入「${item.name}」`)
    await refresh()
  }

  const remove = async (p: ScenarioPreset) => {
    if (!confirm(`删除场景「${p.name}」？只会删除此预设，不会删除或移动任何文件。`)) return
    await window.workdeck.scenario.remove(p.id)
    pushToast('info', `已删除场景「${p.name}」`)
    await refresh()
  }

  return (
    <main className="workspace">
      <div className="sub">管理已保存的「场景预设」· 新建 / AI 命名 / 增删成员 / 一键整套打开</div>

      {/* 沉淀 & 新建：从使用习惯学习成组模式，或手空白建一个场景 */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-head">
          <h3>沉淀 & 新建</h3>
          <span className="badge badge-neutral">把使用习惯变成一句话可打开的「场景」</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <input
            className="input"
            style={{ width: 200, height: 32 }}
            placeholder="新场景名称，如：做海报"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createBlank()
            }}
          />
          <Button size="sm" variant="primary" onClick={() => void createBlank()}>
            <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            新建场景
          </Button>
          <span style={{ flex: 1 }} />
          <Button size="sm" onClick={() => void runLearn()} disabled={learning}>
            <Lightning size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            {learning ? '分析中…' : '从打开记录学习行为模式'}
          </Button>
        </div>
        {suggestions !== null && (
          <>
            {suggestions.length === 0 ? (
              <div className="file-meta">
                暂未发现成组的打开模式。多通过软件盒 / 文件库打开同批软件与文件，这里会沉淀出可保存的场景。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {suggestions.map((s, idx) => (
                  <div key={idx} className="file-row" style={{ alignItems: 'flex-start', minHeight: 0 }}>
                    <span className="file-main">
                      <div className="file-name" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {s.name}
                        <span className="badge badge-available">{s.count > 1 ? `重复 ${s.count} 次` : '单次会话'}</span>
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
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="primary" onClick={() => void saveAll()} disabled={savingAll}>
                    <FloppyDisk size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                    {savingAll ? '保存中…' : `一键保存全部（${suggestions.length}）`}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setSuggestions(null)}>收起建议</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {presets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Sparkle size={40} weight="thin" />}
            title="还没有场景预设"
            hint="还没有保存的场景。用上方「新建场景」手动建一个，或在 AI 里说「帮我准备工作」再存成场景——它会由你的使用习惯沉淀而来"
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {presets.map((p) => (
            <div key={p.id} className="card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 160, height: 34, fontWeight: 600 }}
                  value={draft[p.id] ?? p.name}
                  onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveName(p.id)
                  }}
                />
                {p.auto === 1 && <Badge kind="accent">自动学习</Badge>}
                <Button size="sm" variant="secondary" onClick={() => void saveName(p.id)}>
                  <FloppyDisk size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  保存名
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void aiRename(p.id)} disabled={aiBusy === p.id}>
                  <Sparkle size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  {aiBusy === p.id ? '命名中…' : 'AI 命名'}
                </Button>
                <Button size="sm" variant="primary" onClick={() => void apply(p)}>
                  <Play size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  打开整套
                </Button>
                <button className="icon-btn danger" title="删除场景" onClick={() => void remove(p)}>
                  <Trash size={14} />
                </button>
              </div>

              <div className="file-meta" style={{ margin: 'var(--space-2) 0' }}>
                {p.items.length} 项 · 最近更新 {p.updatedAt.slice(0, 16).replace('T', ' ')}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.items.map((it) => (
                  <span
                    key={it.path}
                    className="badge badge-neutral"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.5rem' }}
                  >
                    {it.kind === 'folder' ? <FolderOpen size={12} /> : <Images size={12} />}
                    {it.name}
                    <button
                      className="icon-btn"
                      style={{ width: 16, height: 16, padding: 0, fontSize: 0 }}
                      title={`移除 ${it.name}`}
                      onClick={() => void removeItem(p, it.path)}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}

                <span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
                  <Button size="sm" variant="secondary" onClick={() => void addItem(p, 'file')}>
                    <Plus size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
                    文件 / 软件
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void addItem(p, 'folder')}>
                    <FolderOpen size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
                    文件夹
                  </Button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}