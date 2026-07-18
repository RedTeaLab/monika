import { type ReactNode } from 'react'
import { cn } from './cn'

/* ───────────────────────────── Card ────────────────────────────── */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Hover lift effect — shadow grows and border brightens. */
  interactive?: boolean
  /** Tighter padding for dense layouts. */
  compact?: boolean
  children: ReactNode
}

export function Card({
  interactive = false,
  compact = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--surface-card)] border border-[var(--border-subtle)]',
        'rounded-[var(--radius-lg)]',
        'shadow-[var(--inner-highlight)]',
        compact ? 'p-3' : 'p-4',
        'transition-all duration-[var(--duration-fast)] [transition-timing-function:var(--ease-out)]',
        interactive && 'hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:shadow-[var(--shadow-md),var(--inner-highlight-strong)] hover:-translate-y-px cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between mb-3', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold text-[var(--text-primary)]', className)}
      {...rest}
    >
      {children}
    </h3>
  )
}

export function CardBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-sm text-[var(--text-secondary)]', className)} {...rest}>
      {children}
    </div>
  )
}

/* ────────────────────────── EmptyState ─────────────────────────── */

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-8 px-4',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 text-[var(--text-dim)]" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      {description && (
        <p className="text-xs text-[var(--text-dim)] mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ──────────────────────────── Divider ──────────────────────────── */

export function Divider({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('h-px bg-[var(--border-subtle)] my-2', className)}
    />
  )
}
