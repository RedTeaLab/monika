import { forwardRef } from 'react'
import { cn } from './cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Optional accessible label. If not set, pass aria-label separately. */
  label?: string
  size?: 'sm' | 'md'
  className?: string
  id?: string
  'aria-label'?: string
}

const SIZE_MAP = {
  sm: { track: 'w-7 h-4', thumb: 'w-3 h-3', translate: 'translate-x-3' },
  md: { track: 'w-9 h-5', thumb: 'w-4 h-4', translate: 'translate-x-4' },
} as const

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onChange, disabled = false, size = 'md', className, id, label, ...rest },
  ref,
) {
  const s = SIZE_MAP[size]
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? rest['aria-label']}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex items-center flex-shrink-0',
        'rounded-full transition-colors duration-200 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-root)]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        s.track,
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]',
        className,
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 inline-block rounded-full bg-white shadow-sm transition-transform duration-200',
          s.thumb,
          checked && s.translate,
        )}
      />
    </button>
  )
})

/* ──────────────────────────── Checkbox ─────────────────────────── */

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  indeterminate?: boolean
  label?: string
  className?: string
  id?: string
  'aria-label'?: string
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, onChange, disabled = false, indeterminate = false, label, className, id, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label ?? rest['aria-label']}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'inline-flex items-center justify-center flex-shrink-0',
        'w-4 h-4 rounded border transition-colors duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked || indeterminate
          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--text-inverse)]'
          : 'bg-[var(--surface-card)] border-[var(--border-default)] hover:border-[var(--border-strong)]',
        className,
      )}
    >
      {indeterminate ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : checked ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path
            d="M2.5 5L4 6.5L7.5 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  )
})
