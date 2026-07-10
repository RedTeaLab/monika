import { useState } from 'react'
import { useStore } from '../../store'
import { App } from '../../../bindings/monika'
import { QueueItem } from './QueueItem'
import { IconListOrdered, IconPlay, IconPause, IconChevronDown, IconChevronRight, IconXCircle } from '../Icons'

const MAX_VISIBLE = 5

export function QueuePanel() {
    const projectPath = useStore((s) => s.projectPath)
    const activeSessionId = useStore((s) => s.activeSessionId)
    const sessionQueues = useStore((s) => s.sessionQueues)
    const queuePaused = useStore((s) => s.queuePaused)
    const reorderQueue = useStore((s) => s.reorderQueue)
    const toggleQueuePause = useStore((s) => s.toggleQueuePause)

    const [expanded, setExpanded] = useState(true)
    const [showAll, setShowAll] = useState(false)
    const [dragIndex, setDragIndex] = useState<number | null>(null)

    const queue = sessionQueues[activeSessionId] || []
    const manualMode = queuePaused[activeSessionId] || false

    const headerBtnClass = 'flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--bg-hover)] transition-colors'

    if (queue.length === 0) return null

    const hasError = queue.some((q) => q.status === 'error')
    const visibleItems = showAll ? queue : queue.slice(0, MAX_VISIBLE)

    const handleModeToggle = async () => {
        try {
            if (manualMode) {
                await App.ResumeQueue(projectPath, activeSessionId)
                toggleQueuePause(activeSessionId, false)
            } else {
                await App.PauseQueue(projectPath, activeSessionId)
                toggleQueuePause(activeSessionId, true)
            }
        } catch (err) {
            console.error('Failed to toggle mode:', err)
        }
    }

    const handleDragStart = (index: number) => (e: React.DragEvent) => {
        setDragIndex(index)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = (index: number) => (e: React.DragEvent) => {
        e.preventDefault()
        if (dragIndex === null || dragIndex === index) return
        const execIndex = queue.findIndex((q) => q.status === 'executing')
        if (execIndex >= 0 && index <= execIndex) return
        const newOrder = [...queue]
        const [moved] = newOrder.splice(dragIndex, 1)
        newOrder.splice(index, 0, moved)
        const itemIds = newOrder.map((item) => item.id)

        reorderQueue(activeSessionId, itemIds)
        setDragIndex(null)

        App.ReorderQueue(projectPath, activeSessionId, itemIds).catch(console.error)
    }

    return (
        <div
            className="rounded-md border mb-2 overflow-hidden"
            style={{
                borderColor: hasError ? 'var(--red)' : 'var(--border)',
                background: 'var(--bg-card)',
            }}
        >
            <div
                className="flex items-center gap-2 px-3 py-1.5 select-none"
                style={{ background: 'var(--bg-sidebar)' }}
            >
                <span className="flex items-center" style={{ color: hasError ? 'var(--red)' : 'var(--text-dim)' }}>
                    {hasError ? <IconXCircle size={13} /> : <IconListOrdered size={13} />}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
                    Queue ({queue.length})
                </span>
                {hasError && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--red)', color: '#fff' }}>
                        Error
                    </span>
                )}
                <div className="flex-1" />
                <button
                    className={headerBtnClass}
                    style={{ color: manualMode ? 'var(--text-primary)' : 'var(--text-dim)' }}
                    onClick={(e) => {
                        e.stopPropagation()
                        handleModeToggle()
                    }}
                    title={manualMode ? 'Manual mode — click to resume auto execution' : 'Auto mode — click to pause'}
                >
                    {manualMode ? <IconPlay size={13} /> : <IconPause size={13} />}
                </button>
                {queue.length > 0 && (
                    <button
                        className={headerBtnClass}
                        style={{ color: 'var(--text-dim)' }}
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                        title={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                    </button>
                )}
            </div>
            {expanded && queue.length > 0 && (
                <div className="p-2 space-y-1.5 max-h-[200px] overflow-y-auto">
                    {visibleItems.map((item, index) => (
                        <QueueItem
                            key={item.id}
                            item={item}
                            sessionId={activeSessionId}
                            projectPath={projectPath}
                            manualMode={manualMode}
                            onDragStart={handleDragStart(index)}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop(index)}
                        />
                    ))}
                    {queue.length > MAX_VISIBLE && (
                        <button
                            className="text-[11px] hover:underline w-full text-center"
                            style={{ color: 'var(--accent)' }}
                            onClick={(e) => {
                                e.stopPropagation()
                                setShowAll(!showAll)
                            }}
                        >
                            {showAll ? 'Collapse' : `Show All (${queue.length})`}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
