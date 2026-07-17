import { forwardRef, type ReactNode } from 'react'
import { cn } from './cn'

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'outline'

export type BadgeSize = 'sm' | 'md'

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--surface-hover)] text-[var(--text-secondary)] border-transparent',
  success:
    'bg-[rgba(0,255,136,0.10)] text-[var(--color-success)] border-[rgba(0,255,136,0.20)]',
  warning:
    'bg-[rgba(255,179,71,0.10)] text-[var(--color-warning)] border-[rgba(255,179,71,0.20)]',
  error:
    'bg-[rgba(255,71,87,0.10)] text-[var(--color-error)] border-[rgba(255,71,87,0.20)]',
  info:
    'bg-[rgba(0,180,255,0.10)] text-[var(--accent)] border-[rgba(0,180,255,0.20)]',
  outline:
    'bg-transparent text-[var(--text-secondary)] border-[var(--border-default)]',
}

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'h-4 px-1.5 text-[10px] gap-1',
  md: 'h-5 px-2 text-[11px] gap-1',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  /** Optional leading dot (status indicator). Renders as small filled circle. */
  dot?: boolean
  children: ReactNode
}

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-medium rounded',
        'border uppercase tracking-wide whitespace-nowrap',
        'transition-colors duration-150',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full bg-current',
            size === 'sm' && 'w-1 h-1',
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

/* ─────────────── StatusDot — small color-only indicator ──────────────── */

export type StatusColor = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const STATUS_DOT_COLOR: Record<StatusColor, string> = {
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
  error: 'bg-[var(--color-error)]',
  info: 'bg-[var(--accent)]',
  neutral: 'bg-[var(--text-dim)]',
}

export interface StatusDotProps {
  color?: StatusColor
  /** Pulsing animation for "live"/"running" indicators. */
  pulse?: boolean
  className?: string
  'aria-label'?: string
}

export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(function StatusDot(
  { color = 'neutral', pulse = false, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('inline-block w-2 h-2 rounded-full', STATUS_DOT_COLOR[color], className)}
      role={rest['aria-label'] ? 'img' : undefined}
      {...rest}
    >
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            STATUS_DOT_COLOR[color],
          )}
        />
      )}
    </span>
  )
})
