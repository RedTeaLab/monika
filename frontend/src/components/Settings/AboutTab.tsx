import { useState, useEffect, useCallback } from 'react'
import { Call, Events } from '@wailsio/runtime'
import { IconRefresh } from '../Icons'
import { Button } from '../ui'
import { SettingsTabHeader } from './shared'

type VersionInfo = {
  version: string
  commitSha: string
  buildTime: string
}

type UpdateInfo = {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseURL: string
  downloadURL: string
  releaseNotes: string
  assetSize: number
}

type UpdateStatus = {
  state: string
  progress: number
  message: string
}

export default function AboutTab() {
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', progress: 0, message: '' })
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    Call.ByName('monika/internal/api.App.GetAppVersion').then(setVersion)

    // Listen for auto-check events from startup.
    const cancel = Events.On('update-available', (ev: any) => {
      const info = ev.data as UpdateInfo
      setUpdateInfo(info)
      setStatus({ state: 'available', progress: 0, message: `New version ${info.latestVersion} available` })
    })

    return () => cancel()
  }, [])

  const handleCheck = useCallback(async () => {
    setChecking(true)
    setStatus({ state: 'checking', progress: 0, message: 'Checking for updates...' })
    try {
      const info = await Call.ByName('monika/internal/api.App.CheckForUpdate')
      setUpdateInfo(info)
      if (info.hasUpdate) {
        setStatus({ state: 'available', progress: 0, message: `New version ${info.latestVersion} available` })
      } else {
        setStatus({ state: 'idle', progress: 0, message: 'Up to date' })
      }
    } catch (err: any) {
      setStatus({ state: 'error', progress: 0, message: err?.message || 'Check failed' })
    } finally {
      setChecking(false)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    if (!updateInfo?.downloadURL) return
    setDownloading(true)
    setStatus({ state: 'downloading', progress: 0, message: 'Downloading...' })

    // Poll for progress during download.
    const poll = setInterval(async () => {
      const s = await Call.ByName('monika/internal/api.App.GetUpdateStatus')
      if (s.state === 'downloading') {
        setStatus(s)
      }
    }, 500)

    try {
      await Call.ByName('monika/internal/api.App.DownloadUpdate', { url: updateInfo.downloadURL })
      clearInterval(poll)
      setDownloading(false)
      setStatus({ state: 'downloaded', progress: 100, message: 'Update downloaded and ready to install' })
    } catch (err: any) {
      clearInterval(poll)
      setDownloading(false)
      setStatus({ state: 'error', progress: 0, message: err?.message || 'Download failed' })
    }
  }, [updateInfo])

  const handleInstall = useCallback(async () => {
    setStatus({ state: 'installing', progress: 0, message: 'Installing and restarting...' })
    try {
      await Call.ByName('monika/internal/api.App.InstallUpdate')
    } catch (err: any) {
      setStatus({ state: 'error', progress: 0, message: err?.message || 'Install failed' })
    }
  }, [])

  return (
    <div>
      <SettingsTabHeader
        title="About Monika"
        description="Version info and updates"
      />

      {/* App info */}
      <div className="mb-6 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
        <div className="mb-3">
          <div>
            <h3 className="text-[14px] font-semibold">Monika</h3>
            <p className="text-[12px] text-[var(--text-secondary)]">Agentic coding editor</p>
          </div>
        </div>
        {version && (
          <div className="space-y-1 text-[12px] text-[var(--text-secondary)]">
            <div className="flex gap-2">
              <span className="w-20 shrink-0 text-[var(--text-dim)]">Version</span>
              <span className="font-mono">{version.version}</span>
            </div>
            {version.commitSha !== 'unknown' && (
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-[var(--text-dim)]">Build</span>
                <span className="font-mono">{version.commitSha.slice(0, 7)}</span>
              </div>
            )}
            {version.buildTime !== 'unknown' && (
              <div className="flex gap-2">
                <span className="w-20 shrink-0 text-[var(--text-dim)]">Built</span>
                <span className="font-mono">{version.buildTime}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Update section */}
      <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
        <h3 className="text-[13px] font-semibold mb-3">Updates</h3>

        {/* Status message */}
        {status.message && (
          <div className={`text-[12px] mb-3 px-2 py-1 rounded ${
            status.state === 'error'
              ? 'bg-[rgba(255,71,87,0.1)] text-[var(--color-error)]'
              : status.state === 'available'
                ? 'bg-[rgba(234,179,8,0.1)] text-[var(--color-warning)]'
                : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
          }`}>
            {status.message}
          </div>
        )}

        {/* Progress bar */}
        {status.state === 'downloading' && (
          <div className="mb-3 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        )}

        {/* Update info */}
        {updateInfo?.hasUpdate && (
          <div className="mb-3 text-[12px] space-y-1">
            <div className="flex gap-2">
              <span className="text-[var(--text-dim)]">Latest:</span>
              <span className="font-mono">{updateInfo.latestVersion}</span>
            </div>
            {updateInfo.assetSize > 0 && (
              <div className="flex gap-2">
                <span className="text-[var(--text-dim)]">Size:</span>
                <span>{formatSize(updateInfo.assetSize)}</span>
              </div>
            )}
          </div>
        )}

        {/* Release notes */}
        {updateInfo?.releaseNotes && (
          <details className="mb-3 text-[12px]">
            <summary className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Release Notes
            </summary>
            <div className="mt-2 p-2 rounded bg-[var(--bg-root)] text-[var(--text-secondary)] whitespace-pre-wrap max-h-40 overflow-y-auto">
              {updateInfo.releaseNotes}
            </div>
          </details>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheck}
            disabled={checking}
          >
            <span className={checking ? 'animate-spin inline-block' : ''}>
              <IconRefresh size={12} />
            </span>
            {checking ? 'Checking...' : 'Check for Updates'}
          </Button>

          {status.state === 'available' && updateInfo?.downloadURL && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? `Downloading ${status.progress}%` : 'Download Update'}
            </Button>
          )}

          {status.state === 'downloaded' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleInstall}
            >
              Install & Restart
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
