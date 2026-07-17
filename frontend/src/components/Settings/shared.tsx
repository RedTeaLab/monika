/**
 * Shared Settings layout components.
 *
 * Unified contract for all Settings tabs:
 *   <SettingsTabHeader title="" description="" actions={<scope-toggle/> <add-button/>} />
 *   <SettingsCardList>  (or custom content for non-list tabs)
 *     <SettingsCard>...</SettingsCard>
 *     <SettingsCard>...</SettingsCard>
 *     {empty && <SettingsEmptyState icon={} title="" action={} />}
 *   </SettingsCardList>
 *
 * Scope: any tab that supports project/global uses <SettingsScopeToggle/>
 *   in the header's actions slot. It persists to store.settingsScope.
 *   Per-item scope badges can still be shown, but selection happens at
 *   the header level — not inside individual modals.
 */

import { type ReactNode } from 'react'
import { cn } from '../ui/cn'
import { useStore } from '../../store'
import { EmptyState } from '../ui/Card'

/* ──────────────────────── SettingsTabHeader ──────────────────────── */

export interface SettingsTabHeaderProps {
  /** Tab title, rendered as h3. */
  title: string
  /** Optional one-line description below the title. */
  description?: string
  /** Right-aligned slot for action buttons, scope toggle, etc. */
  actions?: ReactNode
  className?: string
}

export function SettingsTabHeader({
  title,
  description,
  actions,
  className,
}: SettingsTabHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-4', className)}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {description && (
          <p className="text-[11px] text-[var(--text-dim)] mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  )
}

/* ──────────────────────── SettingsScopeToggle ────────────────────── */

export type SettingsScope = 'project' | 'global'

export interface SettingsScopeToggleProps {
  /** Controlled scope value. If omitted, reads from the store. */
  value?: SettingsScope
  onChange?: (scope: SettingsScope) => void
  className?: string
}

/**
 * Standard project/global scope selector for Settings tabs.
 *
 * By default binds to the store's settingsScope/settingsScopeSet so that
 * scope persists across tab switches. Pass value/onChange for local
 * override (not recommended — breaks the unified model).
 */
export function SettingsScopeToggle({
  value,
  onChange,
  className,
}: SettingsScopeToggleProps) {
  const storeValue = useStore((s) => s.settingsScope)
  const setStoreScope = useStore((s) => s.setSettingsScope)
  const current = value ?? storeValue
  const handle = onChange ?? setStoreScope

  const pills: { id: SettingsScope; label: string }[] = [
    { id: 'project', label: 'Project' },
    { id: 'global', label: 'Global' },
  ]

  return (
    <div
      role="tablist"
      aria-label="Settings scope"
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-[var(--radius-md)]',
        'bg-[var(--surface-card)] border border-[var(--border-subtle)]',
        className,
      )}
    >
      {pills.map((pill) => {
        const active = pill.id === current
        return (
          <button
            key={pill.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => handle(pill.id)}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium rounded-[var(--radius-sm)]',
              'transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              active
                ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
            )}
          >
            {pill.label}
          </button>
        )
      })}
    </div>
  )
}

/* ───────────────────────── SettingsCardList ─────────────────────── */

export interface SettingsCardListProps {
  children: ReactNode
  className?: string
}

export function SettingsCardList({ children, className }: SettingsCardListProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {children}
    </div>
  )
}

/* ────────────────────────── SettingsCard ────────────────────────── */

export interface SettingsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render hover-revealed actions inside the card. */
  hoverActions?: ReactNode
  /** Make the whole card clickable (for expandable cards). */
  interactive?: boolean
  children: ReactNode
}

export function SettingsCard({
  hoverActions,
  interactive = false,
  className,
  children,
  ...rest
}: SettingsCardProps) {
  return (
    <div
      className={cn(
        'group/card relative bg-[var(--surface-card)] rounded-[var(--radius-lg)]',
        'p-3.5 transition-colors duration-150',
        interactive && 'cursor-pointer hover:bg-[var(--surface-hover)]',
        className,
      )}
      {...rest}
    >
      {children}
      {hoverActions && (
        <div
          className={cn(
            'absolute top-2 right-2 flex items-center gap-1',
            'opacity-0 group-hover/card:opacity-100 transition-opacity duration-150',
          )}
        >
          {hoverActions}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── SettingsEmptyState ─────────────────────── */

export interface SettingsEmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  /** Optional CTA button rendered below the description. */
  action?: ReactNode
  className?: string
}

export function SettingsEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: SettingsEmptyStateProps) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={cn('py-12', className)}
    />
  )
}

/* ─────────────────────────- Section header ──────────────────────── */
/** For tabs that need a sub-section between sections (e.g. LSP subtab headers). */

export interface SettingsSectionHeaderProps {
  title: string
  count?: number
  actions?: ReactNode
  className?: string
}

export function SettingsSectionHeader({
  title,
  count,
  actions,
  className,
}: SettingsSectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-2', className)}>
      <div className="flex items-center gap-2">
        <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h4>
        {count !== undefined && (
          <span className="text-[11px] text-[var(--text-dim)]">({count})</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
