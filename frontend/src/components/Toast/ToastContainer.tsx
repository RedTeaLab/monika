import { useNotificationStore } from '../../store/notificationStore'
import { ToastItem } from './ToastItem'

export function ToastContainer() {
  const items = useNotificationStore((s) => s.items)
  const dismiss = useNotificationStore((s) => s.dismiss)

  if (items.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 40,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem item={item} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}
