import { useEffect, useRef, forwardRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  children: ReactNode
  onClose: () => void
  loading?: boolean
  width?: number
}

export default function Modal({ children, onClose, loading, width = 420 }: ModalProps) {
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    triggerRef.current = document.activeElement
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      ;(triggerRef.current as HTMLElement)?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={loading ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape' && !loading) onClose() }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 mt-5">{children}</div>
}

export const ModalButton = forwardRef<HTMLButtonElement, {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'primary' | 'danger'
  type?: 'button' | 'submit'
}>(({ children, onClick, disabled, variant = 'default', type = 'button' }, ref) => {
  const base = 'px-3 py-1.5 text-[13px] rounded-md transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
  const styles: Record<string, string> = {
    default: `${base} text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`,
    primary: `${base} bg-[var(--accent)] text-white hover:opacity-90`,
    danger: `${base} bg-[var(--red)] text-white hover:opacity-90`,
  }
  return (
    <button ref={ref} type={type} onClick={onClick} disabled={disabled} className={styles[variant]}>
      {children}
    </button>
  )
})
