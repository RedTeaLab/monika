import { useStore } from '../../store'

function RemoteModal() {
    const remoteModalOpen = useStore((s) => s.remoteModalOpen)
    const toggleRemoteModal = useStore((s) => s.toggleRemoteModal)
    const remoteMode = useStore((s) => s.remoteMode)

    if (!remoteModalOpen) return null

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={(e) => { if (e.target === e.currentTarget) toggleRemoteModal() }}
        >
            <div className="bg-[var(--bg-elevated)] rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-auto p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">远程连接</h2>
                    <button
                        onClick={toggleRemoteModal}
                        className="text-[var(--text-dim)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer text-lg"
                    >×</button>
                </div>

                {remoteMode === 'idle' && (
                    <div className="flex flex-col gap-4">
                        <button className="p-4 border border-[var(--border)] rounded-lg bg-transparent cursor-pointer hover:bg-[var(--bg-hover)] text-left">
                            <div className="text-[var(--text-primary)] font-medium">🔗 连接到远程</div>
                            <div className="text-[var(--text-dim)] text-sm mt-1">作为客户端连接到另一台 Monika 实例</div>
                        </button>
                        <button className="p-4 border border-[var(--border)] rounded-lg bg-transparent cursor-pointer hover:bg-[var(--bg-hover)] text-left">
                            <div className="text-[var(--text-primary)] font-medium">📡 提供服务</div>
                            <div className="text-[var(--text-dim)] text-sm mt-1">允许他人连接到此 Monika 实例</div>
                        </button>
                    </div>
                )}

                {remoteMode !== 'idle' && (
                    <div className="text-[var(--text-secondary)] text-sm">
                        {remoteMode === 'serving' && '远程服务运行中...'}
                        {remoteMode === 'connecting' && '正在连接...'}
                        {remoteMode === 'connected' && '已连接到远程实例'}
                    </div>
                )}

                <div className="mt-4 text-[var(--text-dim)] text-xs">
                    当前状态: {remoteMode}
                </div>
            </div>
        </div>
    )
}

export default RemoteModal
