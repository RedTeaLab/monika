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
    // Initial fetch
    App.GetTrayNotifications().then((data: TrayNotification[]) => {
      setNotifications(data || [])
    }).catch(() => {})

    // Listen for push updates instead of polling
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

  const handleItemClick = (notifID: string) => {
    App.ActivateSession(notifID).catch(() => {})
  }

  if (notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[12px] text-[var(--text-dim)] p-4">
        暂无未读消息
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full select-none" style={{ background: 'var(--bg-elevated)' }}>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ fontSize: 12 }}>
        {notifications.map((item) => (
          <div
            key={item.id}
            onClick={() => handleItemClick(item.id)}
            className="py-1.5 border-b border-[var(--border)] last:border-b-0 cursor-pointer hover:bg-[var(--bg-hover)] rounded px-1 -mx-1 transition-colors"
          >
            <div className="text-[var(--text-primary)] truncate">{item.session_title}</div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[var(--text-dim)] text-[11px]">
                {item.type === 'reply-complete' ? '回复完成' : item.type === 'permission-request' ? '请求权限' : item.message}
              </span>
              <span className="text-[var(--text-dim)] text-[11px]">
                {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleClearAll}
        className="mx-3 my-2 py-1.5 text-[12px] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition-colors border-t border-[var(--border)]"
      >
        忽略全部
      </button>
    </div>
  )
}
