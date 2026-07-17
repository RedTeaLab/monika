import { useState } from 'react'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'

interface WorktreeBannerProps {
    sessionId: string
    deletedPath: string
    onClose: () => void
    onManageWorktree: () => void
}

export default function WorktreeBanner({ sessionId, deletedPath, onClose, onManageWorktree }: WorktreeBannerProps) {
    const [rebuilding, setRebuilding] = useState(false)
    const [error, setError] = useState('')
    const setSessionWorktree = useStore((s) => s.setSessionWorktree)

    const handleRebuild = async () => {
        setRebuilding(true)
        setError('')
        try {
            await App.RebuildWorktree(sessionId)
            setSessionWorktree(sessionId, deletedPath)
            onClose()
        } catch (e: any) {
            setError('Failed to rebuild: ' + (e?.message || 'unknown error') + '.')
        } finally {
            setRebuilding(false)
        }
    }

    const handleRevert = async () => {
        try {
            await App.DetachWorktree(sessionId)
            setSessionWorktree(sessionId, '')
            onClose()
        } catch (e: any) {
            setError(e?.message || 'Failed to detach worktree')
        }
    }

    return (
        <div
            className="flex items-center gap-2 px-4 py-2 text-[12px]"
            style={{ background: 'var(--bg-warning, #fff3cd)', color: 'var(--text-warning, #856404)' }}
        >
            <span>⚠️ Worktree "{deletedPath}" no longer exists.</span>
            <button
                onClick={handleRebuild}
                disabled={rebuilding}
                className="text-[11px] px-2 py-0.5 rounded border ml-2 cursor-pointer"
                style={{ borderColor: 'currentColor' }}
            >
                {rebuilding ? 'Rebuilding...' : 'Rebuild'}
            </button>
            <button
                onClick={handleRevert}
                className="text-[11px] px-2 py-0.5 rounded border cursor-pointer"
                style={{ borderColor: 'currentColor' }}
            >Revert to Project Root</button>
            {error && (
                <>
                    <button
                        onClick={onManageWorktree}
                        className="text-[11px] px-2 py-0.5 rounded border cursor-pointer"
                        style={{ borderColor: 'currentColor' }}
                    >Manage</button>
                    <span className="text-[11px]" style={{ color: 'var(--red)' }}>{error}</span>
                </>
            )}
            <button onClick={onClose} className="ml-auto text-[14px] opacity-60 hover:opacity-100 cursor-pointer">&times;</button>
        </div>
    )
}
