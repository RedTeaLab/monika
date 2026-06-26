import { useEffect } from 'react'
import { useStore } from '../../store'

function StatusBar() {
    const generating = useStore((s) => s.generatingSessionIds.length > 0)
    const retryInfo = useStore((s) => s.retryInfo)
    const toggleSettings = useStore((s) => s.toggleSettings)
    const lspServers = useStore((s) => s.lspServers)
    const loadLSPStatus = useStore((s) => s.loadLSPStatus)
    const memoryStatus = useStore((s) => s.memoryStatus)

    // remote state
    const remoteMode = useStore((s) => s.remoteMode)
    const toggleRemoteModal = useStore((s) => s.toggleRemoteModal)

    const hasServers = lspServers.length > 0

    useEffect(() => {
        loadLSPStatus()
        const id = setInterval(loadLSPStatus, 10_000)
        return () => clearInterval(id)
    }, [loadLSPStatus])

    const remoteColors: Record<string, string> = {
        idle: 'var(--text-dim)',
        connecting: 'var(--blue)',
        connected: 'var(--green)',
        serving: 'var(--red)',
    }
    const remoteTitles: Record<string, string> = {
        idle: '远程连接',
        connecting: '正在连接...',
        connected: '已连接到远程',
        serving: '远程服务运行中',
    }

    return (
        <div
            className="flex items-center h-[28px] text-[11px] select-none border-t border-[var(--border)]"
            style={{ background: 'var(--bg-elevated)', padding: '0 14px' }}
        >
            {/* Remote indicator */}
            <button
                onClick={toggleRemoteModal}
                title={remoteTitles[remoteMode] || '远程连接'}
                className="flex items-center bg-transparent border-none cursor-pointer p-0 mr-2"
            >
                <span
                    className="block rounded-full"
                    style={{
                        width: 7, height: 7,
                        background: remoteColors[remoteMode] || 'var(--text-dim)',
                        animation: remoteMode === 'connecting' ? 'pulse 1.2s ease-in-out infinite' : undefined,
                    }}
                />
            </button>

            <div className="flex items-center gap-2">
                <span
                    className="block rounded-full"
                    style={{
                        width: 7, height: 7,
                        background: generating ? 'var(--yellow)' : 'var(--green)',
                        boxShadow: generating ? '0 0 6px rgba(212,168,67,0.5)' : '0 0 6px rgba(84,192,138,0.5)',
                        animation: generating ? 'pulse 1.2s ease-in-out infinite' : undefined,
                    }}
                />
                <span className="text-[var(--text-secondary)]">
                    {retryInfo ? retryInfo.message : generating ? 'generating...' : 'ready'}
                </span>
            </div>

            {hasServers && (
                <div className="flex items-center gap-2 ml-3" style={{ paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
                    {lspServers.map((s) => (
                        <div key={s.name} className="flex items-center gap-1">
                            <span
                                className="block rounded-full"
                                style={{
                                    width: 6, height: 6,
                                    background: s.running ? 'var(--green)' : 'var(--text-dim)',
                                    boxShadow: s.running ? '0 0 4px rgba(84,192,138,0.4)' : undefined,
                                }}
                            />
                            <span className="text-[var(--text-dim)]">{s.name}</span>
                        </div>
                    ))}
                </div>
            )}

            {memoryStatus && (
                <div className="flex items-center gap-1 ml-3" style={{ paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
                    <span className="text-[var(--text-dim)]">{memoryStatus}</span>
                </div>
            )}

            <div className="flex-1" />
            <div className="flex items-center gap-2">
                <button
                    onClick={toggleSettings}
                    title="Settings"
                    className="flex items-center justify-center bg-transparent border-none cursor-pointer p-[2px] rounded-[var(--radius-sm)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                    <span className="text-[13px] leading-none">⚙</span>
                </button>
            </div>
        </div>
    )
}

export default StatusBar
