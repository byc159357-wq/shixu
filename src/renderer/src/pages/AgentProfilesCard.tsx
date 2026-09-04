import { useEffect, useState } from 'react'
import type { AgentProfile } from '../../../shared/types'
import { useAppStore } from '../store'
import { Button } from '../components/ui'
import { Plus, Trash, PencilLine, X, Check, PlugsConnected, Key, Robot } from '@phosphor-icons/react'

/**
 * 已接入的 AI 软件：让用户注册多个 OpenAI 兼容端点（GLM / DeepSeek / Ollama
 * 本地 / Qwen 等），每个都成为 AI 面板切换器里的一个独立可选项。
 */
export function AgentProfilesCard() {
  const pushToast = useAppStore((s) => s.pushToast)
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [saving, setSaving] = useState(false)

  // add/edit form state. editingId !== null → editing that profile.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  const reload = () => {
    void window.workdeck.agent.profileList().then((l: AgentProfile[]) => setProfiles(l ?? []))
  }
  useEffect(reload, [])

  const startAdd = () => {
    setEditingId(null)
    setName('')
    setBaseUrl('https://api.openai.com/v1')
    setModel('')
    setApiKey('')
  }

  const startEdit = (p: AgentProfile) => {
    setEditingId(p.id)
    setName(p.name)
    setBaseUrl(p.baseUrl)
    setModel(p.model)
    setApiKey('') // never prefill secrets
  }

  const save = async () => {
    if (!name.trim()) {
      pushToast('info', '请填写名称')
      return
    }
    setSaving(true)
    try {
      await window.workdeck.agent.profileSave({
        id: editingId,
        name: name.trim(),
        baseUrl,
        model,
        apiKey: apiKey.trim() || undefined
      })
      pushToast('success', editingId ? '已更新' : '已添加')
      startAdd()
      reload()
    } catch (err) {
      pushToast('error', `保存失败：${String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string, nm: string) => {
    await window.workdeck.agent.profileRemove(id)
    pushToast('info', `已移除「${nm}」`)
    reload()
  }

  return (
    <div className="card" style={{ marginTop: 'var(--space-3)' }}>
      <div className="card-head">
        <h3>
          <PlugsConnected size={15} style={{ marginRight: 4, verticalAlign: -2 }} />
          已接入的 AI 软件
        </h3>
        <span className="file-meta">多个可切换的 OpenAI 兼容软件 · 在 AI 面板底部自由切换</span>
      </div>

      <div className="field">
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: '1 1 110px', minWidth: 0 }}
            placeholder="名称（如 DeepSeek、Ollama 本地）"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            style={{ flex: '2 1 240px', minWidth: 0 }}
            placeholder="Base URL，如 https://api.deepseek.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <input
            className="input"
            style={{ flex: '1 1 130px', minWidth: 0 }}
            placeholder="模型（如 deepseek-chat / llama3.1）"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <input
            className="input"
            type="password"
            style={{ flex: '1 1 140px', minWidth: 0 }}
            placeholder="API Key（留空则不换）"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
            <Check size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            {editingId ? '保存修改' : '添加'}
          </Button>
          {!editingId ? (
            <Button variant="secondary" size="sm" onClick={startAdd} title="清空表单">
              <X size={13} />
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={startAdd}>
              <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> 新增
            </Button>
          )}
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="file-meta" style={{ padding: '6px 2px' }}>
          还没有已接入的 AI 软件。在上方添加一个之后，它就会出现在 AI 面板的切换器里。
        </div>
      ) : (
        <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {profiles.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-m)'
              }}
            >
              <Robot size={15} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <Key size={11} color={p.hasApiKey ? 'var(--success)' : 'var(--danger)'} />
                </div>
                <div className="file-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.baseUrl} · {p.model || '默认模型'}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => startEdit(p)}>
                <PencilLine size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> 编辑
              </Button>
              <Button
                variant="secondary"
                size="sm"
                style={{ color: 'var(--danger)' }}
                onClick={() => void remove(p.id, p.name)}
              >
                <Trash size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}