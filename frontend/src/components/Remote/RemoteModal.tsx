import { useState, useEffect } from 'react'
import { useStore } from '../../store'

function RemoteModal() {
    const remoteModalOpen = useStore((s) => s.remoteModalOpen)
    const toggleRemoteModal = useStore((s) => s.toggleRemoteModal)
    const remoteMode = useStore((s) => s.remoteMode)

    // B-side state
    const serveCode = useStore((s) => s.serveCode)
    const serveClients = useStore((s) => s.serveClients)
    const serveLog = useStore((s) => s.serveLog)
    const remoteServe = useStore((s) => s.remoteServe)
    const remoteStop = useStore((s) => s.remoteStop)
    const remoteRefreshCode = useStore((s) => s.remoteRefreshCode)
    const remoteKick = useStore((s) => s.remoteKick)

    // A-side state
    const remoteFingerprint = useStore((s) => s.remoteFingerprint)
    const remoteEndpoint = useStore((s) => s.remoteEndpoint)
    const remoteConnect = useStore((s) => s.remoteConnect)
    const remoteDisconnect = useStore((s) => s.remoteDisconnect)

    const [view, setView] = useState<'menu' | 'client' | 'server'>('menu')
    const [codeInput, setCodeInput] = useState('')
    const [connectError, setConnectError] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (remoteModalOpen) {
            setView('menu')
            setConnectError('')
        }
    }, [remoteModalOpen])

    if (!remoteModalOpen) return null

    const handleCopy = () => {
        navigator.clipboard.writeText(serveCode)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleConnect = async () => {
        setConnectError('')
        try {
            await remoteConnect(codeInput)
        } catch (e: any) {
            setConnectError(e?.message || String(e))
        }
    }

    const closeModal = () => {
        toggleRemoteModal()
        setView('menu')
    }

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
            <div className="bg-[var(--bg-elevated)] rounded-lg shadow-2xl w-[520px] max-h-[80vh] overflow-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        {view === 'menu' && '远程连接'}
                        {view === 'client' && (remoteMode === 'connected' ? '已连接' : '连接到远程')}
                        {view === 'server' && (remoteMode === 'serving' ? '服务运行中' : '提供服务')}
                    </h2>
                    <button
                        onClick={closeModal}
                        className="text-[var(--text-dim)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-lg leading-none"
                    >×</button>
                </div>

                {/* Menu view */}
                {view === 'menu' && remoteMode === 'idle' && (
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => setView('client')}
                            className="p-4 border border-[var(--border)] rounded-lg bg-transparent cursor-pointer hover:bg-[var(--bg-hover)] text-left transition-colors"
                        >
                            <div className="text-[var(--text-primary)] font-medium text-sm">🔗 连接到远程</div>
                            <div className="text-[var(--text-dim)] text-xs mt-1">作为客户端连接到另一台 Monika 实例</div>
                        </button>
                        <button
                            onClick={() => setView('server')}
                            className="p-4 border border-[var(--border)] rounded-lg bg-transparent cursor-pointer hover:bg-[var(--bg-hover)] text-left transition-colors"
                        >
                            <div className="text-[var(--text-primary)] font-medium text-sm">📡 提供服务</div>
                            <div className="text-[var(--text-dim)] text-xs mt-1">允许他人连接到此 Monika 实例</div>
                        </button>
                    </div>
                )}

                {/* Jump to active mode if not idle */}
                {view === 'menu' && remoteMode !== 'idle' && (
                    <div className="flex flex-col gap-3">
                        <div className="text-[var(--text-secondary)] text-sm">
                            当前状态: <span className="font-medium">{remoteMode}</span>
                        </div>
                        {(remoteMode === 'connected' || remoteMode === 'connecting') && (
                            <button
                                onClick={() => setView('client')}
                                className="p-3 border border-[var(--border)] rounded-lg bg-transparent cursor-pointer hover:bg-[var(--bg-hover)] text-left text-sm text-[var(--text-primary)]"
                            >查看客户端连接 →</button>
                        )}
                        {remoteMode === 'serving' && (
                            <button
                                onClick={() => setView('server')}
                                className="p-3 border border-[var(--border)] rounded-lg bg-transparent cursor-pointer hover:bg-[var(--bg-hover)] text-left text-sm text-[var(--text-primary)]"
                            >查看服务端面板 →</button>
                        )}
                    </div>
                )}

                {/* Client view */}
                {view === 'client' && (
                    <div className="flex flex-col gap-4">
                        {/* Back button */}
                        {remoteMode === 'idle' && (
                            <button
                                onClick={() => setView('menu')}
                                className="text-[var(--text-dim)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-xs text-left"
                            >← 返回</button>
                        )}

                        {remoteMode !== 'connected' && (
                            <>
                                <div>
                                    <label className="text-[var(--text-secondary)] text-xs mb-1.5 block">连接码</label>
                                    <textarea
                                        value={codeInput}
                                        onChange={(e) => setCodeInput(e.target.value)}
                                        placeholder="粘贴 MONIKA-XXXX-XXXX-... 连接码"
                                        className="w-full bg-[var(--bg-root)] border border-[var(--border)] rounded-md p-2.5 text-[var(--text-primary)] text-sm font-mono resize-none focus:outline-none focus:border-[var(--blue)]"
                                        rows={3}
                                        spellCheck={false}
                                    />
                                </div>
                                {connectError && (
                                    <div className="text-[var(--red)] text-xs">{connectError}</div>
                                )}
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => setView('menu')}
                                        className="px-4 py-1.5 text-[var(--text-dim)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-sm"
                                    >取消</button>
                                    <button
                                        onClick={handleConnect}
                                        disabled={!codeInput.trim() || remoteMode === 'connecting'}
                                        className="px-4 py-1.5 bg-[var(--blue)] text-white rounded-md border-none cursor-pointer text-sm hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >{remoteMode === 'connecting' ? '连接中...' : '连接'}</button>
                                </div>
                            </>
                        )}

                        {remoteMode === 'connected' && (
                            <>
                                <div className="bg-[var(--bg-root)] rounded-md p-3 border border-[var(--border)]">
                                    <div className="text-[var(--text-secondary)] text-xs mb-1">B 端公钥指纹</div>
                                    <div className="text-[var(--text-primary)] text-sm font-mono">{remoteFingerprint}</div>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-[var(--text-dim)]">
                                    <span>● 已连接</span>
                                    <span>端点: {remoteEndpoint}</span>
                                </div>
                                <button
                                    onClick={() => remoteDisconnect()}
                                    className="px-4 py-1.5 bg-[var(--red)] text-white rounded-md border-none cursor-pointer text-sm hover:opacity-80"
                                >断开连接</button>
                            </>
                        )}
                    </div>
                )}

                {/* Server view */}
                {view === 'server' && (
                    <div className="flex flex-col gap-4">
                        {/* Back button */}
                        {remoteMode === 'idle' && (
                            <button
                                onClick={() => setView('menu')}
                                className="text-[var(--text-dim)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-xs text-left"
                            >← 返回</button>
                        )}

                        {/* Start serve */}
                        {remoteMode === 'idle' && (
                            <button
                                onClick={() => remoteServe()}
                                className="px-4 py-2 bg-[var(--blue)] text-white rounded-md border-none cursor-pointer text-sm hover:opacity-80"
                            >启动服务</button>
                        )}

                        {/* Serving panel */}
                        {remoteMode === 'serving' && serveCode && (
                            <>
                                <div>
                                    <label className="text-[var(--text-secondary)] text-xs mb-1.5 block">连接码</label>
                                    <div className="flex gap-2">
                                        <input
                                            readOnly
                                            value={serveCode}
                                            className="flex-1 bg-[var(--bg-root)] border border-[var(--border)] rounded-md p-2 text-[var(--text-primary)] text-xs font-mono focus:outline-none"
                                        />
                                        <button
                                            onClick={handleCopy}
                                            className="px-3 bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-md border border-[var(--border)] cursor-pointer text-xs hover:opacity-80"
                                        >{copied ? '已复制' : '复制'}</button>
                                        <button
                                            onClick={() => remoteRefreshCode()}
                                            className="px-3 bg-[var(--bg-hover)] text-[var(--text-primary)] rounded-md border border-[var(--border)] cursor-pointer text-xs hover:opacity-80"
                                        >刷新</button>
                                    </div>
                                </div>

                                {/* Connected clients */}
                                <div>
                                    <div className="text-[var(--text-secondary)] text-xs mb-1.5">当前连接 ({serveClients.length})</div>
                                    {serveClients.length === 0 ? (
                                        <div className="text-[var(--text-dim)] text-xs">暂无客户端连接</div>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            {serveClients.map((c) => (
                                                <div key={c.id} className="flex items-center justify-between bg-[var(--bg-root)] border border-[var(--border)] rounded-md p-2 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="block rounded-full bg-[var(--green)]" style={{ width: 6, height: 6 }} />
                                                        <span className="text-[var(--text-secondary)] font-mono">{c.remote_addr}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => remoteKick(c.id)}
                                                        className="text-[var(--red)] bg-transparent border-none cursor-pointer text-xs hover:underline"
                                                    >断开</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Operation log */}
                                {serveLog.length > 0 && (
                                    <div>
                                        <div className="text-[var(--text-secondary)] text-xs mb-1.5">操作日志</div>
                                        <div className="bg-[var(--bg-root)] border border-[var(--border)] rounded-md p-2 max-h-[150px] overflow-auto text-xs font-mono">
                                            {serveLog.slice(-20).reverse().map((entry, i) => (
                                                <div key={i} className="text-[var(--text-dim)] py-0.5">
                                                    <span className="text-[var(--text-secondary)]">{entry.time?.substring(11, 19)}</span>
                                                    {' '}
                                                    <span className="text-[var(--text-primary)]">{entry.method || entry.event}</span>
                                                    {entry.detail && <span className="text-[var(--text-dim)]"> {entry.detail}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => remoteStop()}
                                    className="px-4 py-1.5 bg-[var(--red)] text-white rounded-md border-none cursor-pointer text-sm hover:opacity-80"
                                >停止服务</button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default RemoteModal
