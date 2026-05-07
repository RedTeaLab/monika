import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'

const MODES: { id: 'auto' | 'manual'; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'manual', label: 'Manual' },
]

function PermissionModePicker() {
  const permissionMode = useStore((s) => s.permissionMode)
  const setPermissionMode = useStore((s) => s.setPermissionMode)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = MODES.find((m) => m.id === permissionMode) || MODES[0]

  const handleSelect = (id: 'auto' | 'manual') => {
    setPermissionMode(id)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
        }}
      >
        <span>{current.label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="2,3 4,5 6,3" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            minWidth: '200px',
            maxHeight: '320px',
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '4px',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {MODES.map((mode) => {
            const isSelected = mode.id === permissionMode
            return (
              <button
                key={mode.id}
                onClick={() => handleSelect(mode.id)}
                className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer"
                style={{
                  background: isSelected ? isSelectedBg : 'transparent',
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  border: 'none',
                  fontFamily: 'inherit',
                }}
              >
                {mode.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const isSelectedBg = 'var(--accent-muted, var(--bg-hover))'

export default PermissionModePicker
