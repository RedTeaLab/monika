import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'ghost'
  | 'outline'
  | 'link'

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--text-inverse)] hover:bg-[var(--accent-hover)] ' +
    'shadow-[0_1px_2px_rgba(0,0,0,0.4)]',
  secondary:
    'bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] ' +
    'hover:bg-[var(--surface-hover)]',
  destructive:
    'bg-[var(--color-error)] text-white hover:bg-[var(--pr-red-300)] ' +
    'shadow-[0_1px_2px_rgba(0,0,0,0.4)]',
  ghost:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
  outline:
    'bg-transparent text-[var(--text-primary)] border border-[var(--border-default)] ' +
    'hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)]',
  link:
    'bg-transparent text-[var(--accent)] underline-offset-4 hover:underline ' +
    'p-0 h-auto',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs gap-1 rounded-[var(--radius-sm)]',
  sm: 'h-7 px-3 text-sm gap-1.5 rounded-[var(--radius-md)]',
  md: 'h-9 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-6 text-base gap-2 rounded-[var(--radius-lg)]',
  icon: 'h-8 w-8 p-0 rounded-[var(--radius-md)] inline-flex items-center justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to parent's inline-axis width. */
  fullWidth?: boolean
  /** Show loading spinner and disable interaction. */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-medium',
        'transition-colors duration-150 cursor-pointer select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-root)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 -ml-1"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
})

/** Icon-only button — square, no padding, designed for SVG icon children. */
export type IconButtonProps = Omit<ButtonProps, 'size' | 'children'> & {
  size?: 'sm' | 'md' | 'lg'
  label: string  // accessible label for icon-only button
  children: React.ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', className, children, ...rest },
  ref,
) {
  const sizeCls =
    size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'
  return (
    <Button
      ref={ref}
      size="icon"
      variant="ghost"
      aria-label={label}
      className={cn(sizeCls, className)}
      {...rest}
    >
      {children}
    </Button>
  )
})
