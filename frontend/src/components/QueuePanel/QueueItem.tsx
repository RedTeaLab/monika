import { useState } from 'react'
import { useStore } from '../../store'
import { App } from '../../../bindings/monika'
import { IconPencilLine, IconPlay, IconRefresh, IconSkipForward, IconClose, IconClock, IconXCircle } from '../Icons'
import { Button, IconButton } from '../ui'

interface QueueItemProps {
    item: {
        id: string
        text: string
        provider_id: string
        model: string
        status: string
        error?: string
        created_at: number
    }
    sessionId: string
    projectPath: string
    manualMode: boolean
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
}

export function QueueItem({ item, sessionId, projectPath, manualMode, onDragStart, onDragOver, onDrop }: QueueItemProps) {
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(item.text)
    const removeQueueItem = useStore((s) => s.removeQueueItem)

    const statusColor =
        item.status === 'executing' ? 'var(--accent)' :
            item.status === 'error' ? 'var(--red)' :
                'var(--yellow)'

    const statusIcon =
        item.status === 'executing'
            ? <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            : item.status === 'error'
                ? <IconXCircle size={13} />
                : <IconClock size={13} />
    const handleSaveEdit = async () => {
        try {
            await App.EditQueueItem(projectPath, sessionId, item.id, editText)
            setEditing(false)
        } catch (err) {
            console.error('Failed to edit queue item:', err)
        }
    }

    const handleCancel = async () => {
        try {
            await App.CancelQueueItem(projectPath, sessionId, item.id)
            if (item.status !== 'executing') {
                removeQueueItem(sessionId, item.id)
            }
        } catch (err) {
            console.error('Failed to cancel queue item:', err)
        }
    }

    const handleExecute = async () => {
        try {
            await App.ExecuteQueueItem(projectPath, sessionId, item.id)
        } catch (err) {
            console.error('Failed to execute queue item:', err)
        }
    }

    const handleRetry = async () => {
        try {
            await App.RetryQueueItem(projectPath, sessionId, item.id)
        } catch (err) {
            console.error('Failed to retry queue item:', err)
        }
    }

    const handleSkip = async () => {
        try {
            await App.SkipQueueItem(projectPath, sessionId, item.id)
            removeQueueItem(sessionId, item.id)
        } catch (err) {
            console.error('Failed to skip queue item:', err)
        }
    }

    const canEdit = item.status === 'queued' || item.status === 'error'
    const canDrag = item.status !== 'executing'

    return (
        <div
            className="group flex items-start gap-2 rounded border p-1.5 text-[12px]"
            style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-elevated)',
            }}
            draggable={canDrag}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {canDrag && <span className="cursor-grab select-none" style={{ color: 'var(--text-dim)' }}>⠿</span>}
            <span style={{ color: statusColor }}>{statusIcon}</span>
            <div className="flex-1 min-w-0">
                {editing ? (
                    <div className="flex flex-col gap-1">
                        <textarea
                            className="w-full rounded p-1 text-[12px] border outline-none"
                            style={{
                                background: 'var(--bg-sidebar)',
                                color: 'var(--text-primary)',
                                borderColor: 'var(--border)',
                            }}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                        />
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={handleSaveEdit}>Save</Button>
                            <Button variant="ghost" size="sm" onClick={() => { setEditText(item.text); setEditing(false) }}>Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="truncate" style={{ color: 'var(--text-primary)' }}>{item.text}</p>
                        {item.status === 'error' && item.error && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--red)' }}>{item.error}</p>
                        )}
                    </>
                )}
            </div>
            {!editing && (
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {manualMode && item.status === 'queued' && (
                        <IconButton
                            label="Run"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleExecute() }}
                        >
                            <IconPlay size={13} />
                        </IconButton>
                    )}
                    {canEdit && (
                        <IconButton
                            label="Edit"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                        >
                            <IconPencilLine size={13} />
                        </IconButton>
                    )}
                    {item.status === 'error' && (
                        <>
                            <IconButton
                                label="Retry"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleRetry() }}
                            >
                                <IconRefresh size={13} />
                            </IconButton>
                            <IconButton
                                label="Skip"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleSkip() }}
                            >
                                <IconSkipForward size={13} />
                            </IconButton>
                        </>
                    )}
                    <IconButton
                        label="Cancel"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleCancel() }}
                    >
                        <IconClose size={13} />
                    </IconButton>
                </div>
            )}
        </div>
    )
}
