import { useState, useEffect, useCallback } from 'react'
import { Call, Events } from '@wailsio/runtime'
import { IconRefresh } from '../Icons'

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

  const pollStatus = useCallback(async () => {
    const s = await Call.ByName('monika/internal/api.App.GetUpdateStatus')
    setStatus(s)
    return s
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

    // Start polling before the await so we get progress updates.
    const poll = setInterval(async () => {
      const s = await pollStatus()
      setStatus(s)
      if (s.state === 'downloaded' || s.state === 'error') {
        clearInterval(poll)
        setDownloading(false)
      }
    }, 500)

    try {
      await Call.ByName('monika/internal/api.App.DownloadUpdate', { url: updateInfo.downloadURL })
    } catch (err: any) {
      setStatus({ state: 'error', progress: 0, message: err?.message || 'Download failed' })
      setDownloading(false)
    } finally {
      clearInterval(poll)
    }
  }, [updateInfo, pollStatus])

  const handleInstall = useCallback(async () => {
    setStatus({ state: 'installing', progress: 0, message: 'Installing and restarting...' })
    try {
      await Call.ByName('monika/internal/api.App.InstallUpdate')
    } catch (err: any) {
      setStatus({ state: 'error', progress: 0, message: err?.message || 'Install failed' })
    }
  }, [])

  return (
    <div className="max-w-xl">
      <h2 className="text-[15px] font-semibold mb-4">About Monika</h2>

      {/* App info */}
      <div className="mb-6 p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-lg">
            M
          </div>
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
      <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
        <h3 className="text-[13px] font-semibold mb-3">Updates</h3>

        {/* Status message */}
        {status.message && (
          <div className={`text-[12px] mb-3 px-2 py-1 rounded ${
            status.state === 'error'
              ? 'bg-red-500/10 text-red-500'
              : status.state === 'available'
                ? 'bg-yellow-500/10 text-yellow-600'
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
          <button
            onClick={handleCheck}
            disabled={checking}
            className="px-3 py-1.5 text-[12px] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 flex items-center gap-1.5"
          >
            <span className={checking ? 'animate-spin inline-block' : ''}>
              <IconRefresh size={12} />
            </span>
            {checking ? 'Checking...' : 'Check for Updates'}
          </button>

          {status.state === 'available' && updateInfo?.downloadURL && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-3 py-1.5 text-[12px] rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {downloading ? `Downloading ${status.progress}%` : 'Download Update'}
            </button>
          )}

          {status.state === 'downloaded' && (
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 text-[12px] rounded-md bg-[var(--accent)] text-white hover:opacity-90"
            >
              Install & Restart
            </button>
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
