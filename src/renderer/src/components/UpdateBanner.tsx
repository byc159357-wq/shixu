import { DownloadSimple, Play, RocketLaunch, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from './ui'
import { useAppStore } from '../store'

/**
 * A small startup notification for releases discovered by electron-updater.
 * The updater remains opt-in: this banner offers download and a single
 * restart-update action; electron-updater installs the downloaded package
 * automatically while the app restarts.
 */
export function UpdateBanner() {
  const status = useAppStore((state) => state.updateStatus)
  const downloadUpdate = useAppStore((state) => state.downloadUpdate)
  const installUpdate = useAppStore((state) => state.installUpdate)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  const key = status.state === 'available' || status.state === 'downloaded'
    ? `${status.state}:${status.version}`
    : status.state

  useEffect(() => {
    if (dismissedKey && dismissedKey !== key) setDismissedKey(null)
  }, [dismissedKey, key])

  if (
    dismissedKey === key ||
    (status.state !== 'available' && status.state !== 'downloading' && status.state !== 'downloaded')
  ) {
    return null
  }

  const isAvailable = status.state === 'available'
  const isDownloading = status.state === 'downloading'
  const isDownloaded = status.state === 'downloaded'

  return (
    <div className="update-banner motion-banner-enter" role="status" aria-live="polite">
      <span className="update-banner-icon" aria-hidden="true">
        {isDownloaded ? <Play size={16} weight="fill" /> : <RocketLaunch size={17} weight="fill" />}
      </span>
      <div className="update-banner-copy">
        <strong>{isAvailable ? `发现新版本 v${status.version}` : isDownloaded ? `更新已下载 v${status.version}` : '正在下载更新'}</strong>
        <span>{isAvailable ? '新版本已准备好，下载后点击重启更新即可自动安装。' : isDownloaded ? '点击重启更新，拾序会自动完成安装。' : `下载进度 ${status.percent}%`}</span>
      </div>
      <div className="update-banner-actions">
        {isAvailable && (
          <Button size="sm" variant="primary" onClick={() => void downloadUpdate()}>
            <DownloadSimple size={14} />下载更新
          </Button>
        )}
        {isDownloaded && (
          <Button size="sm" variant="primary" onClick={() => void installUpdate()}>
            <Play size={14} weight="fill" />重启更新
          </Button>
        )}
        {isDownloading && <span className="update-banner-progress">{status.percent}%</span>}
        <button
          type="button"
          className="update-banner-dismiss"
          onClick={() => setDismissedKey(key)}
          aria-label="稍后处理更新"
          title="稍后处理"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
