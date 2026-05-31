interface MultiSelectBarProps {
  count: number
  mode: 'quote' | 'forward'
  onConfirm: () => void
  onCancel: () => void
}

export default function MultiSelectBar({ count, mode, onConfirm, onCancel }: MultiSelectBarProps) {
  const label = mode === 'quote' ? 'Confirm Quote' : 'Confirm Forward'

  return (
    <div
      className="border-t px-4 py-2 flex items-center gap-3"
      style={{
        background: 'var(--bg-sidebar)',
        borderColor: 'var(--border)',
      }}
    >
      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
        {count} selected
      </span>
      <div className="flex-1" />
      <button
        onClick={onCancel}
        className="text-[12px] font-semibold uppercase tracking-[0.04em] px-3 py-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"
        style={{ color: 'var(--text-dim)' }}
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={count === 0}
        className="text-[12px] font-semibold uppercase tracking-[0.04em] px-3 py-1 rounded cursor-pointer"
        style={{
          background: count > 0 ? 'var(--accent)' : 'var(--border)',
          color: count > 0 ? '#fff' : 'var(--text-dim)',
          opacity: count > 0 ? 1 : 0.5,
        }}
      >
        {label}
      </button>
    </div>
  )
}
