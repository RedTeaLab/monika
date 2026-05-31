import { useNotificationStore } from '../../store/notificationStore'

export function TrayPopup() {
  const unreadHistory = useNotificationStore((s) => s.unreadHistory)
  const clearAll = useNotificationStore((s) => s.clearAll)

  if (unreadHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[12px] text-[var(--text-dim)] p-4">
        暂无未读消息
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full select-none" style={{ background: 'var(--bg-elevated)' }}>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ fontSize: 12 }}>
        {unreadHistory.map((item) => (
          <div
            key={item.id}
            className="py-1.5 border-b border-[var(--border)] last:border-b-0"
          >
            <div className="text-[var(--text-primary)] truncate">{item.sessionTitle}</div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[var(--text-dim)] text-[11px]">
                {item.type === 'reply-complete' ? '回复完成' : '请求权限'}
              </span>
              <span className="text-[var(--text-dim)] text-[11px]">
                {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={clearAll}
        className="mx-3 my-2 py-1.5 text-[12px] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition-colors border-t border-[var(--border)]"
      >
        忽略全部
      </button>
    </div>
  )
}
