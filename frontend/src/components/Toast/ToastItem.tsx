import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import type { NotificationItem } from '../../store/notificationStore'

interface ToastItemProps {
  item: NotificationItem
  onDismiss: (id: string) => void
}

export function ToastItem({ item, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const switchSessionTab = useStore((s) => s.switchSessionTab)
  const openSessionTab = useStore((s) => s.openSessionTab)

  const startDismissTimer = () => {
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(item.id), 300)
    }, 5000)
  }

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    startDismissTimer()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleMouseEnter = () => {
    setIsHovered(true)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    if (!timerRef.current) {
      startDismissTimer()
    }
  }

  const handleView = () => {
    const state = useStore.getState()
    const existing = state.openSessions.find((s) => s.id === item.sessionId)
    if (existing) {
      switchSessionTab(item.sessionId)
    } else {
      openSessionTab(item.sessionId, item.sessionTitle)
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    onDismiss(item.id)
  }

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    onDismiss(item.id)
  }

  const typeLabel = item.type === 'reply-complete' ? '回复完成' : '需要确认'

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        flex flex-col gap-0.5 px-3 py-2
        bg-[var(--bg-elevated)] border border-[var(--border)]
        rounded-md shadow-lg
        transition-all duration-300 ease-out
        min-w-[260px] max-w-[360px]
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}
      `}
    >
      <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
        {item.sessionTitle}
      </div>
      <div className="text-[11px] text-[var(--text-dim)]">{typeLabel}</div>
      {isHovered && (
        <div className="flex gap-2 mt-0.5">
          <button
            onClick={handleView}
            className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            View
          </button>
          <button
            onClick={handleDismiss}
            className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)]"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
