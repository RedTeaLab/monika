import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

/* ───────────────────────────── Input ───────────────────────────── */

export type InputSize = 'sm' | 'md' | 'lg'

const INPUT_SIZE: Record<InputSize, string> = {
  sm: 'h-7 text-xs px-2',
  md: 'h-9 text-sm px-3',
  lg: 'h-11 text-base px-4',
}

const INPUT_BASE =
  'w-full bg-[var(--surface-card)] text-[var(--text-primary)] ' +
  'border border-[var(--border-default)] rounded-[var(--radius-md)] ' +
  'placeholder:text-[var(--text-dim)] ' +
  'shadow-[var(--inner-highlight)] ' +
  'transition-all duration-[var(--duration-fast)] [transition-timing-function:var(--ease-out)] ' +
  'hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] ' +
  'focus:outline-none focus:border-[var(--accent)] ' +
  'focus:ring-2 focus:ring-[var(--accent-muted)] focus:bg-[var(--surface-card)] ' +
  'focus:shadow-[0_0_0_1px_var(--accent),0_0_0_4px_var(--accent-muted)] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'cursor-text'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize
  /** Render an icon/prefix at the left side of the input. */
  leading?: React.ReactNode
  /** Render an icon/suffix at the right side of the input. */
  trailing?: React.ReactNode
  /** Mark the field as invalid (shows error border). */
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', leading, trailing, invalid, className, disabled, ...rest },
  ref,
) {
  if (!leading && !trailing) {
    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          INPUT_BASE,
          INPUT_SIZE[inputSize],
          invalid && 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[rgba(255,71,87,0.15)]',
          className,
        )}
        {...rest}
      />
    )
  }

  return (
    <div className={cn('relative flex items-center w-full', className)}>
      {leading && (
        <span
          className={cn(
            'absolute left-0 inset-y-0 flex items-center pl-2.5 pointer-events-none',
            'text-[var(--text-dim)]',
          )}
        >
          {leading}
        </span>
      )}
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          INPUT_BASE,
          INPUT_SIZE[inputSize],
          leading && 'pl-8',
          trailing && 'pr-8',
          invalid && 'border-[var(--color-error)] focus:border-[var(--color-error)]',
        )}
        {...rest}
      />
      {trailing && (
        <span className="absolute right-0 inset-y-0 flex items-center pr-2.5 text-[var(--text-dim)]">
          {trailing}
        </span>
      )}
    </div>
  )
})

/* ──────────────────────────── SearchInput ──────────────────────── */

import { Search, X } from 'lucide-react'
import { IconButton } from './Button'

export interface SearchInputProps extends Omit<InputProps, 'leading' | 'trailing' | 'type'> {
  /** Controlled value — when set and non-empty, shows a clear button. */
  value?: string
  /** Called when the clear (X) button is clicked. */
  onClear?: () => void
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onClear, className, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="search"
      leading={<Search size={14} />}
      trailing={
        value && onClear ? (
          <IconButton
            label="Clear search"
            size="sm"
            onClick={onClear}
            className="pointer-events-auto h-5 w-5"
          >
            <X size={12} />
          </IconButton>
        ) : undefined
      }
      value={value}
      className={className}
      {...rest}
    />
  )
})

/* ──────────────────────────── Textarea ─────────────────────────── */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, disabled, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      rows={rows}
      className={cn(
        INPUT_BASE,
        'py-2 resize-y min-h-[2.5rem]',
        invalid && 'border-[var(--color-error)] focus:border-[var(--color-error)]',
        className,
      )}
      {...rest}
    />
  )
})
