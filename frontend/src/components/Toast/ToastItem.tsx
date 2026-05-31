import { useEffect, useState } from 'react'
import type { NotificationItem } from '../../store/notificationStore'

interface ToastItemProps {
  item: NotificationItem
  onDismiss: (id: string) => void
}

export function ToastItem({ item, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger slide-in animation on next frame
    requestAnimationFrame(() => setVisible(true))

    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(item.id), 300) // wait for fade-out
    }, 4700) // slightly before the 5s auto-dismiss in store
    return () => clearTimeout(timer)
  }, [])

  const typeLabel = item.type === 'reply-complete' ? '回复完成' : '请求权限'

  return (
    <div
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
      <div className="text-[11px] text-[var(--text-dim)]">
        {typeLabel}
      </div>
    </div>
  )
}
