import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

/**
 * Native <select> styled to match Input.
 * Use this for short, fixed option lists.
 * For searchable / async lists, use `Combobox` instead.
 */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, disabled, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative inline-flex items-center w-full', className)}>
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          'w-full appearance-none bg-[var(--surface-card)] text-[var(--text-primary)]',
          'border border-[var(--border-default)] rounded-[var(--radius-md)]',
          'h-9 text-sm pl-3 pr-8',
          'placeholder:text-[var(--text-dim)]',
          'transition-colors duration-150',
          'hover:border-[var(--border-strong)]',
          'focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'cursor-pointer',
          invalid && 'border-[var(--color-error)]',
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2.5 pointer-events-none text-[var(--text-dim)]"
        aria-hidden="true"
      />
    </div>
  )
})
