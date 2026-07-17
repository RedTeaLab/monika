import { type ReactNode, useState, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** Which side of the trigger to render the tip. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Delay before showing (ms). */
  delay?: number
  /** Disable the tooltip entirely (useful for conditional display). */
  disabled?: boolean
  className?: string
}

const SIDE_OFFSET = 8

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 200,
  disabled = false,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()
  const triggerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ x: 0, y: 0 })

  const show = () => {
    if (disabled || !content) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (r) {
        const x =
          side === 'left' ? r.left - SIDE_OFFSET
          : side === 'right' ? r.right + SIDE_OFFSET
          : r.left + r.width / 2
        const y =
          side === 'top' ? r.top - SIDE_OFFSET
          : side === 'bottom' ? r.bottom + SIDE_OFFSET
          : r.top + r.height / 2
        setCoords({ x, y })
      }
      setVisible(true)
    }, delay)
  }

  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setVisible(false)
  }

  const transform =
    side === 'top' ? 'translate(-50%, -100%)'
    : side === 'bottom' ? 'translate(-50%, 0)'
    : side === 'left' ? 'translate(-100%, -50%)'
    : 'translate(0, -50%)'

  return (
    <div
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="inline-flex"
      aria-describedby={visible ? id : undefined}
    >
      {children}
      {visible && createPortal(
        <div
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className={cn(
            'px-2 py-1 text-xs rounded-[var(--radius-sm)]',
            'bg-[var(--surface-elevated)] text-[var(--text-primary)]',
            'border border-[var(--border-default)]',
            'shadow-[var(--shadow-md)]',
            'max-w-xs whitespace-normal text-center',
            'animate-tooltip-in',
            className,
          )}
        >
          {content}
        </div>,
        document.body,
      )}
    </div>
  )
}
