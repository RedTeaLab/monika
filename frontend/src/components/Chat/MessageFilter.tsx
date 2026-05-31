import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { IconChevronDown } from '../Icons'

export type MsgFilterKey = 'all' | 'chat' | 'user' | 'assistant'

const OPTIONS: { key: MsgFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'chat', label: 'Chat' },
  { key: 'user', label: 'User' },
  { key: 'assistant', label: 'Assistant' },
]

function MessageFilter({ value, onChange, disabled }: { value: MsgFilterKey; onChange: (v: MsgFilterKey) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const updatePos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    window.addEventListener('resize', updatePos)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('resize', updatePos)
    }
  }, [open, updatePos])

  const current = OPTIONS.find((o) => o.key === value) || OPTIONS[0]

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => { if (!disabled) { updatePos(); setOpen((v) => !v) } }}
        className="text-[11px] px-2 py-0.5 rounded flex items-center gap-1"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: disabled ? 'var(--text-dim)' : 'var(--text-primary)',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span>{current.label}</span>
        <IconChevronDown size={8} />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            minWidth: '120px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '4px',
            zIndex: 2000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                onChange(opt.key)
                setOpen(false)
              }}
              className="w-full text-left text-[11px] px-2 py-1 rounded cursor-pointer"
              style={{
                color: opt.key === value ? 'var(--text-primary)' : 'var(--text-dim)',
                background: opt.key === value ? 'var(--bg-hover)' : 'transparent',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

export default MessageFilter
