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
  const [focusIdx, setFocusIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setFocusIdx(0)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx((prev) => Math.min(prev + 1, MODES.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(MODES[focusIdx].id)
    }
  }

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
            minWidth: '100%',
            maxHeight: '240px',
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '4px',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
          onKeyDown={handleKeyDown}
        >
          {MODES.map((mode, idx) => {
            const isSelected = mode.id === permissionMode
            return (
              <button
                key={mode.id}
                onClick={() => handleSelect(mode.id)}
                onMouseEnter={() => setFocusIdx(idx)}
                className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer"
                style={{
                  background:
                    idx === focusIdx
                      ? 'var(--bg-hover)'
                      : isSelected
                        ? 'var(--accent-muted)'
                        : 'transparent',
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

export default PermissionModePicker
