import { type ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem {
  id: string
  label: ReactNode
  /** Optional leading icon. */
  icon?: ReactNode
  disabled?: boolean
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  /** Visual variant — underline (default) or pills. */
  variant?: 'underline' | 'pills'
  className?: string
}

export function Tabs({
  items,
  value,
  onChange,
  variant = 'underline',
  className,
}: TabsProps) {
  if (variant === 'pills') {
    return (
      <div
        role="tablist"
        className={cn('inline-flex items-center gap-1 p-1 bg-[var(--surface-card)] rounded-[var(--radius-md)]', className)}
      >
        {items.map((item) => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-[var(--radius-sm)]',
                'transition-colors duration-150 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                active
                  ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      className={cn('flex items-center gap-1 border-b border-[var(--border-subtle)]', className)}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-3 py-2 text-sm',
              '-mb-px cursor-pointer',
              'transition-colors duration-[var(--duration-fast)] [transition-timing-function:var(--ease-out)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              active
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            {item.icon}
            {item.label}
            <span
              className={cn(
                'absolute bottom-0 left-2 right-2 h-0.5 rounded-full',
                'transition-all duration-[var(--duration-normal)] [transition-timing-function:var(--ease-out)]',
                active
                  ? 'bg-[var(--accent)] opacity-100 shadow-[0_0_8px_var(--accent-glow)]'
                  : 'bg-transparent opacity-0',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
