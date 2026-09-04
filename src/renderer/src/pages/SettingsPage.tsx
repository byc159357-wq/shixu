import { useEffect, useState } from 'react'
import type { AiConfig, AiProviderKind, BackupResult, Density, EmailSaveInput, Settings, UpdateStatus, WatchedFolder } from '../../../shared/types'
import { LLM_PROVIDERS, findProvider, matchProviderByBaseUrl } from '../../../shared/llm-providers'
import { useAppStore } from '../store'
import { Button, EmptyState, Select } from '../components/ui'
import { AgentProfilesCard } from './AgentProfilesCard'
import { Plus, Trash, FileArrowUp, ArrowClockwise, DownloadSimple, Play, Sparkle, FloppyDisk, SignIn, XCircle, ShieldCheck, Envelope, CaretDown, Palette, FolderOpen, TestTube } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

const DENSITIES: Array<{ id: Density; label: string; desc: string }> = [
  { id: 'comfortable', label: '宽松（Comfortable）', desc: '宽敞：首页欢迎区、首次引导' },
  { id: 'default', label: '默认（Default）', desc: '标准：项目 / 首页 / Markdown' },
  { id: 'compact', label: '紧凑（Compact）', desc: '密集：文件库 / 日历 / 命令面板' }
]

const KIND_LABELS: Record<string, string> = {
  desktop: '桌面',
  downloads: '下载',
  screenshots: '截图',
  custom: '自定义'
}

const SETTINGS_SECTION_IDS = ['appearance', 'files', 'email', 'ai', 'data'] as const
type SettingsSection = (typeof SETTINGS_SECTION_IDS)[number]

/** 设置页「二级菜单」：每项对应一组功能，点选后在右侧独立一屏展示。 */
const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string; hint: string; icon: Icon }> = [
  { id: 'appearance', label: '外观', hint: '主题与显示密度', icon: Palette },
  { id: 'files', label: '文件与监控', hint: '监控目录与操作审计', icon: FolderOpen },
  { id: 'email', label: '邮箱', hint: '接入并管理收件箱账号', icon: Envelope },
  { id: 'ai', label: 'AI 智能', hint: '解析引擎、模型与 API', icon: Sparkle },
  { id: 'data', label: '数据与更新', hint: '备份、自启、版本更新', icon: ShieldCheck }
]

/** 主流邮箱服务商的 IMAP 预设，让用户只填账号密码即可自动匹配。 */
const IMAP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  'qq.com': { host: 'imap.qq.com', port: 993, secure: true },
  'vip.qq.com': { host: 'imap.exmail.qq.com', port: 993, secure: true },
  'foxmail.com': { host: 'imap.qq.com', port: 993, secure: true },
  '163.com': { host: 'imap.163.com', port: 993, secure: true },
  '126.com': { host: 'imap.126.com', port: 993, secure: true },
  'yeah.net': { host: 'imap.yeah.net', port: 993, secure: true },
  'gmail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'outlook.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'hotmail.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'live.cn': { host: 'outlook.office365.com', port: 993, secure: true },
  'live.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'office365.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'icloud.com': { host: 'imap.mail.me.com', port: 993, secure: true },
  'me.com': { host: 'imap.mail.me.com', port: 993, secure: true },
  '139.com': { host: 'imap.139.com', port: 993, secure: true },
  'sina.com': { host: 'imap.sina.com.cn', port: 993, secure: true },
  'sina.cn': { host: 'imap.sina.cn', port: 993, secure: true },
  'sohu.com': { host: 'imap.sohu.com', port: 993, secure: true },
  'aliyun.com': { host: 'imap.aliyun.com', port: 993, secure: true },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  'yahoo.com.cn': { host: 'imap.mail.yahoo.com.cn', port: 993, secure: true }
}

function inferImap(email: string): { host: string; port: number; secure: boolean } | null {
  const m = /@([^@ ]+)\s*$/.exec(email.trim())
  const preset = m ? IMAP_PRESETS[m[1].toLowerCase()] : undefined
  return preset ?? null
}

export function SettingsPage() {
  const density = useAppStore((s) => s.density)
  const setDensity = useAppStore((s) => s.setDensity)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const watchedFolders = useAppStore((s) => s.watchedFolders)
  const auditRows = useAppStore((s) => s.auditRows)
  const loadWatched = useAppStore((s) => s.loadWatched)
  const addWatched = useAppStore((s) => s.addWatched)
  const removeWatched = useAppStore((s) => s.removeWatched)
  const scanWatched = useAppStore((s) => s.scanWatched)
  const loadAudit = useAppStore((s) => s.loadAudit)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const checkForUpdates = useAppStore((s) => s.checkForUpdates)
  const downloadUpdate = useAppStore((s) => s.downloadUpdate)
  const installUpdate = useAppStore((s) => s.installUpdate)
  const [version, setVersion] = useState('')
  const [section, setSection] = useState<SettingsSection>('appearance')

  useEffect(() => {
    void window.workdeck.app.version().then(setVersion)
    void loadWatched()
    void loadAudit()
  }, [loadWatched, loadAudit])

  const addFolder = async () => {
    const folder = await window.workdeck.file.pickFolder()
    if (!folder) return
    await addWatched(folder, 'custom')
  }

  return (
    <main className="workspace">
      <div className="sub">{SETTINGS_SECTIONS.find((s) => s.id === section)?.hint}</div>

      <div className="settings-layout">
        {/* 二级菜单：按功能分组，点选后在右侧独立一屏展示 */}
        <nav className="settings-nav" aria-label="设置分组">
          {SETTINGS_SECTIONS.map((s) => {
            const Active = s.icon
            return (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-item ${section === s.id ? 'active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                <Active size={16} weight={section === s.id ? 'fill' : 'regular'} />
                <span>{s.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="settings-content">
          {/* —— 外观：主题 + 显示密度 —— */}
          {section === 'appearance' && (
            <>
              <div className="card">
                <div className="card-head">
                  <h3>主题</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(
                    [
                      { id: 'dark', label: '深色', desc: '默认玻璃深色，低光环境舒适' },
                      { id: 'hermes', label: 'Hermes · 张扬蓝', desc: '纯白画布 · 张狂电光蓝 · Hermes Agent' },
                      { id: 'light', label: '浅色', desc: '明亮浅色，适合日间' }
                    ] as const
                  ).map((t) => (
                    <div
                      key={t.id}
                      className={`file-row ${theme === t.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => void setTheme(t.id)}
                    >
                      <span className="file-main">
                        <div className="file-name">{t.label}</div>
                        <div className="file-meta">{t.desc}</div>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>显示密度</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {DENSITIES.map((d) => (
                    <div
                      key={d.id}
                      className={`file-row ${density === d.id ? 'selected' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => void setDensity(d.id)}
                    >
                      <span className="file-main">
                        <div className="file-name">{d.label}</div>
                        <div className="file-meta">{d.desc}</div>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* —— 文件与监控：监控目录 + 审计 —— */}
          {section === 'files' && (
            <>
              <div className="card">
                <div className="card-head">
                  <h3>监控目录</h3>
                  <button className="btn btn-secondary btn-sm" onClick={() => void addFolder()}>
                    <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                    添加目录
                  </button>
                </div>
                {watchedFolders.length === 0 ? (
                  <EmptyState
                    icon={<FileArrowUp size={40} weight="thin" />}
                    title="还没有监控目录"
                    hint="添加后，目录里的新文件会自动进入收件箱"
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {watchedFolders.map((w: WatchedFolder) => (
                      <div key={w.id} className="file-row">
                        <span className="file-icon">
                          {w.kind === 'desktop' ? '桌' : w.kind === 'downloads' ? '载' : w.kind === 'screenshots' ? '截' : '自'}
                        </span>
                        <span className="file-main">
                          <div className="file-name">{w.path}</div>
                          <div className="file-meta">{KIND_LABELS[w.kind]}</div>
                        </span>
                        <span className="file-actions">
                          <button className="mini-btn" onClick={() => void scanWatched(w.path)}>
                            重新扫描
                          </button>
                          <button
                            className="mini-btn danger"
                            title="移除监控（不删除文件）"
                            onClick={() => {
                              if (confirm(`移除监控目录「${w.path}」？只停止监控，不删除任何文件。`)) {
                                void removeWatched(w.id)
                              }
                            }}
                          >
                            <Trash size={13} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>操作审计（最近 50 条）</h3>
                </div>
                {auditRows.length === 0 ? (
                  <div className="file-meta" style={{ padding: 'var(--space-2) 0' }}>
                    暂无记录。移动文件等写操作会自动记录到这里。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {auditRows.map((a) => (
                      <div key={a.id} className="file-row" style={{ minHeight: 0, padding: 'var(--space-1) var(--space-2)' }}>
                        <span className="file-meta" style={{ minWidth: 130 }}>{a.ts}</span>
                        <span className="file-name" style={{ minWidth: 90 }}>{a.action}</span>
                        <span className="file-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* —— 邮箱 —— */}
          {section === 'email' && <EmailSettingsCard />}

          {/* —— AI 智能 —— */}
      {section === 'ai' && (
        <>
          <AiSettingsCard />
          <AgentProfilesCard />
        </>
      )}

          {/* —— 数据与更新：备份自启 + 关于版本 —— */}
          {section === 'data' && (
            <>
              <DataSafetyCard />
              <div className="card">
                <div className="card-head">
                  <h3>关于与更新</h3>
                  <button className="btn btn-secondary btn-sm" onClick={() => void checkForUpdates()}>
                    <ArrowClockwise size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                    检查更新
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="file-meta">拾序 v{version} · Windows 本地优先个人工作台 · MVP 0.2</div>
                  <div className="file-row" style={{ minHeight: 0, padding: '0.5rem 0.5rem' }}>
                    <span className="file-main">
                      <div className="file-name">{updateLabel(updateStatus)}</div>
                      <div className="file-meta">{updateHint(updateStatus)}</div>
                    </span>
                    <span className="file-actions">
                      {updateStatus.state === 'available' && (
                        <button className="mini-btn" onClick={() => void downloadUpdate()}>
                          <DownloadSimple size={13} style={{ marginRight: 2, verticalAlign: -2 }} />
                          下载
                        </button>
                      )}
                      {updateStatus.state === 'downloaded' && (
                        <button className="mini-btn" onClick={() => void installUpdate()}>
                          <Play size={13} style={{ marginRight: 2, verticalAlign: -2 }} />
                          重启安装
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function updateLabel(s: UpdateStatus): string {
  switch (s.state) {
    case 'idle':
      return '更新：未检查'
    case 'checking':
      return '正在检查更新…'
    case 'available':
      return `发现新版本 v${s.version}`
    case 'not-available':
      return '已是最新版本'
    case 'downloading':
      return `正在下载更新… ${s.percent}%`
    case 'downloaded':
      return `更新已就绪（v${s.version}）`
    case 'error':
      return '检查更新失败'
  }
}

function updateHint(s: UpdateStatus): string {
  switch (s.state) {
    case 'idle':
    case 'not-available':
      return '发布源未配置时检查会静默失败，不影响使用'
    case 'error':
      return s.message
    case 'available':
      return '下载后将在退出时自动安装'
    default:
      return '自动更新（electron-updater）'
  }
}

/* ============ 邮箱（收件箱接入 IMAP） ============ */
/**
 * 「登录式」极简配置：只填邮箱 + 密码/授权码，域名自动识别匹配 IMAP 服务器。
 * 高级参数（服务器 / 端口 / SSL）收进折叠区，识别失败或企业邮箱时才需要手动改。
 */
function EmailSettingsCard() {
  const emailConfig = useAppStore((s) => s.emailConfig)
  const emailAccounts = useAppStore((s) => s.emailAccounts)
  const emailActiveId = useAppStore((s) => s.emailActiveId)
  const loadEmailInfo = useAppStore((s) => s.loadEmailInfo)
  const saveEmailConfig = useAppStore((s) => s.saveEmailConfig)
  const selectEmail = useAppStore((s) => s.selectEmail)
  const removeEmail = useAppStore((s) => s.removeEmail)
  const pushToast = useAppStore((s) => s.pushToast)

  // editId === '' means "添加新邮箱"; otherwise the id of the account being edited.
  const [editId, setEditId] = useState<string>('')
  const [email, setEmail] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('993')
  const [secure, setSecure] = useState(true)
  const [authCode, setAuthCode] = useState('')
  const [autoMatched, setAutoMatched] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    void loadEmailInfo()
  }, [loadEmailInfo])

  const editingAccount = emailAccounts.find((a) => a.id === editId) ?? null

  // Fresh state for the add/edit form.
  const resetForm = (id: string, account?: { email: string; host: string; port: number; secure: boolean }) => {
    setEditId(id)
    setEmail(account?.email ?? '')
    setHost(account?.host ?? '')
    setPort(account ? String(account.port) : '993')
    setSecure(account?.secure ?? true)
    setAuthCode('')
    setAutoMatched(false)
    setShowAdvanced(false)
    setTestResult(null)
  }

  // Auto-fill server settings from the email's domain as the user types/leaves the field.
  const applyAutoMatch = (address: string) => {
    const preset = inferImap(address)
    if (preset) {
      setHost(preset.host)
      setPort(String(preset.port))
      setSecure(preset.secure)
      setAutoMatched(true)
    } else {
      setAutoMatched(false)
    }
  }

  // Resolve the final server config; when the user left 服务器/host empty,
  // auto-match from the email's domain (synchronously, so保存用的值是最新的).
  const resolveInput = (): EmailSaveInput => {
    const preset = host.trim() ? null : inferImap(email)
    return {
      id: editId || undefined,
      email: email.trim(),
      host: host.trim() || preset?.host || '',
      port: preset ? preset.port : parseInt(port, 10) || 993,
      secure: preset ? preset.secure : secure,
      authCode: authCode.trim()
    }
  }

  const login = async () => {
    const input = resolveInput()
    if (!input.email || !input.host) {
      pushToast('error', '请先填写邮箱账号，或展开高级设置填写 IMAP 服务器')
      return
    }
    // 已连接过的账号：密码留空则沿用已保存的授权码（后端自动回退）。
    if (!input.authCode && !editingAccount?.hasAuth) {
      pushToast('error', '请填写密码 / 授权码')
      return
    }
    // Mirror the resolved server settings back into the form for feedback.
    setHost(input.host)
    setPort(String(input.port))
    setSecure(input.secure)
    setAutoMatched(inferImap(input.email) != null)
    await saveEmailConfig(input)
    setAuthCode('')
    setTestResult(null)
    resetForm('')
  }

  const test = async () => {
    const input = resolveInput()
    if (!input.email || !input.host) {
      setTestResult('请先填写邮箱账号，或展开高级设置填写 IMAP 服务器')
      return
    }
    if (!input.authCode && !emailConfig?.hasAuth) {
      setTestResult('请先填写密码 / 授权码再测试')
      return
    }
    setHost(input.host)
    setPort(String(input.port))
    setTesting(true)
    setTestResult(null)
    try {
      const r = await window.workdeck.email.test(input)
      setTestResult(r.ok ? '连接成功，账号密码有效' : `连接失败：${r.error ?? '未知错误'}`)
    } catch (err) {
      setTestResult(`连接失败：${String(err)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <Envelope size={15} style={{ marginRight: 4, verticalAlign: -2 }} />
          邮箱（收件箱）
        </h3>
        <span className="file-meta">
          {emailConfig?.hasAuth
            ? `当前 ${emailConfig.email} · 共 ${emailAccounts.length} 个`
            : '可添加多个邮箱，收件箱里切换查看各自未读'}
        </span>
      </div>

      {/* 已接入的邮箱：始终显示，用于切换 / 编辑 / 移除 */}
      {emailAccounts.length === 0 ? (
        <div className="file-meta" style={{ marginBottom: 'var(--space-2)' }}>
          还没有接入邮箱，填写下方信息即可添加第一个。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-2)' }}>
          {emailAccounts.map((a) => (
            <div key={a.id} className="file-row" style={{ minHeight: 0, padding: '0.35rem 0.5rem', gap: 8 }}>
              <span className="file-main" style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => void selectEmail(a.id)}>
                <div className="file-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.email}
                  {a.id === emailActiveId && (
                    <span className="badge badge-primary" style={{ marginLeft: 8, fontSize: 'var(--fs-micro)' }}>
                      当前
                    </span>
                  )}
                </div>
                <div className="file-meta">{a.host}:{a.port}</div>
              </span>
              <span className="file-actions" style={{ flexShrink: 0 }}>
                {a.id !== emailActiveId && (
                  <button className="mini-btn" onClick={() => void selectEmail(a.id)}>
                    设为当前
                  </button>
                )}
                <button className="mini-btn" onClick={() => resetForm(a.id, a)}>
                  编辑
                </button>
                <button className="mini-btn" onClick={() => void removeEmail(a.id)}>
                  移除
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {editId === '' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 var(--space-1)' }}>
          <Plus size={13} style={{ color: 'var(--accent)' }} />
          <span className="file-meta">再添加一个邮箱</span>
        </div>
      )}
      {editId !== '' && (
        <div className="file-meta" style={{ marginBottom: 'var(--space-1)' }}>
          正在编辑：{editingAccount?.email ?? '…'}（密码留空则沿用已保存的授权码）
        </div>
      )}

      <div className="field">
        <span className="label">邮箱账号</span>
        <input
          className="input"
          placeholder="you@qq.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => applyAutoMatch(email)}
          spellCheck={false}
        />
      </div>

      <div className="field">
        <span className="label">密码 / 授权码</span>
        <input
          className="input"
          type="password"
          placeholder="邮箱密码，部分邮箱用「授权码」"
          value={authCode}
          onChange={(e) => setAuthCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void login()
          }}
          spellCheck={false}
        />
        <div className="file-meta" style={{ marginTop: '0.25rem' }}>
          {email && !inferImap(email) && host.trim() ? (
            <span style={{ color: 'var(--accent)' }}>未识别的邮箱域名 —— 需在下方高级设置里确认 IMAP 服务器。</span>
          ) : (
            <>
              QQ / 163 / Gmail 等会自动识别服务器。部分邮箱需先在网页开启 IMAP 服务、获取「授权码」再用。
              密码仅本机加密存储。
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--space-1)' }}>
        <button className="btn btn-primary" onClick={() => void login()}>
          <SignIn size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
          {editId ? '保存修改' : emailConfig?.hasAuth ? '添加并设为当前' : '接入邮箱'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto', color: 'var(--text-2)' }}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <CaretDown size={13} style={{ marginRight: 4, verticalAlign: -2, transform: showAdvanced ? 'rotate(180deg)' : 'none' }} />
          高级设置
        </button>
      </div>

      {showAdvanced && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 2 }}>
              <span className="label">IMAP 服务器</span>
              <input
                className="input"
                placeholder="imap.qq.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <span className="label">端口</span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="993"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label className="file-row" style={{ cursor: 'pointer', padding: '0.25rem 0.5rem', gap: 8 }}>
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 'var(--fs-caption)' }}>SSL / TLS 加密</span>
            </label>
            <button className="btn btn-secondary btn-sm" onClick={() => void test()} disabled={testing}>
              <TestTube size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              {testing ? '测试中…' : '测试连接'}
            </button>
            <span className="file-meta" style={{ marginLeft: 'auto' }}>
              {autoMatched ? '已按域名自动匹配，可手动覆盖' : '未自动匹配，请手动填写'}
            </span>
          </div>

          {testResult && (
            <div className="file-meta" style={{ whiteSpace: 'pre-line' }}>
              <ShieldCheck size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              {testResult}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ============ 数据与常驻（backup + 开机自启 + 系统托盘） ============ */
function DataSafetyCard() {
  const pushToast = useAppStore((s) => s.pushToast)
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [latest, setLatest] = useState<BackupResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.workdeck.settings.getAll().then((s: Settings) => setOpenAtLogin(s['app.openAtLogin']))
  }, [])

  const run = async (fn: () => Promise<BackupResult | null>) => {
    setBusy(true)
    try {
      const r = await fn()
      if (!r) {
        pushToast('info', '已取消备份')
        return
      }
      setLatest(r)
      pushToast(r.integrity === 'ok' ? 'success' : 'error', `备份完成：${fmtSize(r.size)}，完整性校验${r.integrity === 'ok' ? '通过' : '异常'}`)
    } catch (err) {
      pushToast('error', `备份失败：${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleAutostart = async () => {
    const next = !openAtLogin
    setOpenAtLogin(next)
    await window.workdeck.settings.set('app.openAtLogin', next)
    pushToast('success', next ? '已开启开机自启' : '已关闭开机自启')
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <ShieldCheck size={15} style={{ marginRight: 4, verticalAlign: -2 }} />
          数据与常驻
        </h3>
        <span className="file-meta">数据备份 · 开机自启 · 系统托盘</span>
      </div>

      <div className="file-row">
        <span className="file-main">
          <div className="file-name">开机自启</div>
          <div className="file-meta">登录系统后自动启动拾序</div>
        </span>
        <span className="file-actions">
          <button
            className="mini-btn"
            style={{
              minWidth: 58,
              justifyContent: 'center',
              background: openAtLogin ? 'var(--accent)' : 'transparent',
              color: openAtLogin ? '#fff' : 'var(--text)',
              outline: '1px solid var(--border)'
            }}
            onClick={() => void toggleAutostart()}
          >
            {openAtLogin ? '开启' : '关闭'}
          </button>
        </span>
      </div>

      <div className="file-row">
        <span className="file-main">
          <div className="file-name">数据库备份</div>
          <div className="file-meta">
            每 6 小时自动备份一次（保留最近 5 份）。手动备份可自选保存位置。
          </div>
        </span>
        <span className="file-actions">
          <button className="mini-btn" onClick={() => void run(() => window.workdeck.backup.createAuto())} disabled={busy}>
            <FloppyDisk size={13} style={{ marginRight: 2, verticalAlign: -2 }} />
            立即自动备份
          </button>
          <button className="mini-btn" onClick={() => void run(() => window.workdeck.backup.createManual())} disabled={busy}>
            <DownloadSimple size={13} style={{ marginRight: 2, verticalAlign: -2 }} />
            手动备份…
          </button>
        </span>
      </div>

      {latest && (
        <div className="file-row" style={{ background: 'var(--card-2, rgba(255,255,255,0.03))', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
          <div className="file-main">
            <div className="file-name" style={{ wordBreak: 'break-all' }}>{latest.file}</div>
            <div className="file-meta" style={{ whiteSpace: 'pre-wrap' }}>
              {fmtSize(latest.size)} · {latest.tables} 张表 · 完整性 {latest.integrity === 'ok' ? '通过 ✓' : '校验失败'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ============ AI provider configuration ============ */
const PROVIDER_OPTIONS: Array<{ id: AiProviderKind; label: string; hint: string }> = [
  { id: 'off', label: '关闭（规则解析，离线）', hint: '本地规则引擎，无需网络' },
  { id: 'openai-compat', label: 'OpenAI 兼容 API', hint: 'OpenAI / DeepSeek / 各类中转，需 API Key' },
  { id: 'ollama', label: '本地 Ollama', hint: 'http://localhost:11434/v1，无需 Key' }
]

function AiSettingsCard() {
  const pushToast = useAppStore((s) => s.pushToast)
  const [provider, setProvider] = useState<AiProviderKind>('off')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  /** Provider preset id (glm / deepseek / openai / moonshot / qwen / siliconflow / ollama / custom).
   *  Drives Base URL + model dropdown. Not persisted — a fresh match is derived
   *  from the saved Base URL on load. */
  const [providerId, setProviderId] = useState<string>('custom')

  useEffect(() => {
    void window.workdeck.ai.configGet().then((cfg: AiConfig) => {
      setProvider(cfg.provider)
      setBaseUrl(cfg.baseUrl)
      setModel(cfg.model)
      // Derive provider preset from saved baseUrl so the UI re-matches on load.
      const matched =
        cfg.provider === 'ollama'
          ? 'ollama'
          : matchProviderByBaseUrl(cfg.baseUrl)?.id ?? 'custom'
      setProviderId(matched)
      setHasKey(cfg.hasApiKey)
    })
  }, [])

  const save = async () => {
    await window.workdeck.ai.configSave({
      provider,
      baseUrl,
      model,
      apiKey: apiKey.trim() ? apiKey.trim() : undefined
    })
    setApiKey('')
    setHasKey(true)
    pushToast('success', 'AI 配置已保存')
  }

  const clearKey = async () => {
    await window.workdeck.ai.configSave({ provider, baseUrl, model, apiKey: null })
    setHasKey(false)
    pushToast('info', 'API Key 已清除')
  }

  const test = async () => {
    // Pre-check: OpenAI-compatible providers must have a key (saved or just typed)
    if (provider === 'openai-compat' && !apiKey.trim() && !hasKey) {
      setTestResult('请先填入 API Key，再测试连接')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const r = await window.workdeck.ai.test({
        provider,
        baseUrl,
        model,
        apiKey: apiKey.trim() || undefined
      })
      if (r.ok) setTestResult(`连接成功：${r.reply}`)
      else {
        // HTTP 401 = auth failed. Add an actionable hint about provider/key mismatch.
        const errText = r.error ?? '未知错误'
        const is401 = /401/.test(errText)
        setTestResult(
          is401
            ? `${errText}\n\n排查：① Base URL 与 API Key 必须属于同一平台；② Key 是否复制完整（前后无空格/换行）；③ Key 是否已过期或被禁用`
            : errText
        )
      }
    } catch (err) {
      setTestResult(`连接失败：${String(err)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <Sparkle size={15} style={{ marginRight: 4, verticalAlign: -2 }} />
          AI 智能解析（LLM）
        </h3>
        <span className="file-meta">未配置时自动使用本地规则引擎</span>
      </div>

      <div className="field">
        <span className="label">解析引擎</span>
        <div className="color-row">
          {PROVIDER_OPTIONS.map((o) => (
            <button
              key={o.id}
              className={`tab ${provider === o.id ? 'active' : ''}`}
              style={{ borderBottom: 'none', borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
              onClick={() => setProvider(o.id)}
              title={o.hint}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {provider !== 'off' && (
        <>
          <div className="field">
            <span className="label">提供商</span>
            <Select
              value={providerId}
              onChange={(id) => {
                setProviderId(id)
                const p = findProvider(id)
                if (p) {
                  if (p.id === 'ollama') {
                    setProvider('ollama')
                    if (p.baseUrl) setBaseUrl(p.baseUrl)
                  } else {
                    setProvider('openai-compat')
                    if (p.baseUrl) setBaseUrl(p.baseUrl)
                  }
                  if (p.models.length && !p.models.includes(model)) {
                    setModel(p.models[0])
                  }
                }
              }}
              options={LLM_PROVIDERS.map((p) => ({ label: p.label, value: p.id }))}
            />
            {(() => {
              const p = findProvider(providerId)
              return p?.note ? (
                <div className="file-meta" style={{ marginTop: 4 }}>{p.note}</div>
              ) : null
            })()}
          </div>

          <div className="field">
            <span className="label">Base URL</span>
            <input
              className="input"
              value={baseUrl}
              placeholder="https://api.openai.com/v1 或 http://localhost:11434/v1"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="field">
            <span className="label">模型</span>
            {(() => {
              const p = findProvider(providerId)
              const hasList = !!p && p.models.length > 0
              if (!hasList) {
                return (
                  <input
                    className="input"
                    value={model}
                    placeholder={provider === 'ollama' ? 'llama3.1' : 'gpt-4o-mini'}
                    onChange={(e) => setModel(e.target.value)}
                  />
                )
              }
              const known = p!.models.includes(model)
              return (
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Select
                    style={{ flex: 1, minWidth: 0 }}
                    value={known ? model : '__custom'}
                    onChange={(v) => {
                      if (v !== '__custom') setModel(v)
                    }}
                    options={[
                      ...p!.models.map((m) => ({ label: m, value: m })),
                      { label: '自定义…', value: '__custom' }
                    ]}
                  />
                  {!known && (
                    <input
                      className="input"
                      style={{ flex: 1, minWidth: 0 }}
                      value={model}
                      placeholder="输入自定义模型名"
                      onChange={(e) => setModel(e.target.value)}
                    />
                  )}
                </div>
              )
            })()}
          </div>
          {provider === 'openai-compat' && (
            <div className="field">
              <span className="label">API Key（safeStorage 加密存储）</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  className="input"
                  type="password"
                  style={{ flex: 1, minWidth: 0 }}
                  value={apiKey}
                  placeholder={hasKey ? '••••••••（已保存，留空则不修改）' : '粘贴 API Key（不限格式）'}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                {hasKey && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void clearKey()}
                    style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    <XCircle size={13} style={{ marginRight: 2, verticalAlign: -2 }} />
                    清除
                  </Button>
                )}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-2)' }}>
            <Button variant="primary" size="sm" onClick={() => void save()}>
              <FloppyDisk size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              保存配置
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void test()} disabled={testing}>
              <TestTube size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              {testing ? '测试中…' : '测试连接'}
            </Button>
          </div>
          {testResult && (
            <div className="file-meta" style={{ marginTop: 8 }}>{testResult}</div>
          )}
        </>
      )}
    </div>
  )
}
