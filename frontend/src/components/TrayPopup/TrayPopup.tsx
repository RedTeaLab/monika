import { useEffect, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { App } from '../../../bindings/monika'

interface TrayNotification {
  id: string
  session_id: string
  session_title: string
  type: string
  message: string
  timestamp: number
}

export function TrayPopup() {
  const [notifications, setNotifications] = useState<TrayNotification[]>([])

  useEffect(() => {
    App.GetTrayNotifications().then((data: TrayNotification[]) => {
      setNotifications(data || [])
    }).catch(() => {})

    const unsub = Events.On('tray-notifications-changed', (ev: any) => {
      setNotifications(ev.data || [])
    })
    return () => { if (unsub) unsub() }
  }, [])

  const handleClearAll = () => {
    App.ClearTrayNotifications().then(() => {
      setNotifications([])
    }).catch(() => {})
  }

  const handleView = (notifID: string) => {
    App.ActivateSession(notifID).catch(() => {})
  }

  const handleDismiss = (e: React.MouseEvent, notifID: string) => {
    e.stopPropagation()
    App.DismissNotification(notifID).catch(() => {})
  }

  if (notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[12px] text-[var(--text-dim)] p-4">
        No unread messages
      </div>
    )
  }

  const typeLabel = (type: string) => {
    if (type === 'reply-complete') return 'Reply complete'
    if (type === 'permission-request') return 'Permission required'
    return type
  }

  return (
    <div
      className="flex flex-col h-full select-none bg-[var(--bg-elevated)]"
      onMouseEnter={() => App.CancelPopupHide().catch(() => {})}
      onMouseLeave={() => App.SchedulePopupHide().catch(() => {})}
    >
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ fontSize: 12 }}>
        {notifications.map((item) => (
          <div
            key={item.id}
            className="group py-1.5 border-b border-[var(--border)] last:border-b-0 rounded px-1 -mx-1 transition-colors hover:bg-[var(--bg-hover)]"
          >
            <div className="text-[var(--text-primary)] truncate">{item.session_title}</div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[var(--text-dim)] text-[11px]">{typeLabel(item.type)}</span>
              <span className="text-[var(--text-dim)] text-[11px]">
                {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="hidden group-hover:flex gap-2 mt-1">
              <button
                onClick={(e) => { e.stopPropagation(); handleView(item.id) }}
                className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                View
              </button>
              <button
                onClick={(e) => handleDismiss(e, item.id)}
                className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)]"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleClearAll}
        className="mx-3 my-2 py-1.5 text-[12px] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition-colors border-t border-[var(--border)]"
      >
        Dismiss all
      </button>
    </div>
  )
}
