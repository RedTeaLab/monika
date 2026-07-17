import { useState } from 'react'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import { Button, IconButton } from '../ui'
import { X } from 'lucide-react'

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
            <Button variant="primary" size="sm" onClick={handleRebuild} disabled={rebuilding} className="ml-2">
                {rebuilding ? 'Rebuilding...' : 'Rebuild'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleRevert}>
                Revert to Project Root
            </Button>
            {error && (
                <>
                    <Button variant="ghost" size="sm" onClick={onManageWorktree}>Manage</Button>
                    <span className="text-[11px]" style={{ color: 'var(--red)' }}>{error}</span>
                </>
            )}
            <IconButton label="Close" size="sm" onClick={onClose} className="ml-auto"><X size={14} /></IconButton>
        </div>
    )
}
