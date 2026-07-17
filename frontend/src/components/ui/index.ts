/**
 * Monika UI Component Library
 *
 * Unified design-system primitives. Every component across the app should
 * source its inputs, buttons, dropdowns, etc. from here — not roll its own.
 *
 * Conventions:
 * - All components use CSS variables from tokens.css (no hardcoded colors)
 * - forwardRef where the component maps to a DOM node
 * - Variants/sizes via string-union props (no theme object)
 * - className is always last-resort escape hatch and merges cleanly
 *
 * See MASTER.md for the canonical design system.
 */

export { cn } from './cn'

export { Button, IconButton } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize, IconButtonProps } from './Button'

export { Input, SearchInput, Textarea } from './Input'
export type { InputProps, InputSize, SearchInputProps, TextareaProps } from './Input'

export { Select } from './Select'
export type { SelectProps } from './Select'

export { Combobox } from './Combobox'
export type { ComboboxOption, ComboboxProps } from './Combobox'

export { Switch, Checkbox } from './Switch'
export type { SwitchProps, CheckboxProps } from './Switch'

export { Badge, StatusDot } from './Badge'
export type { BadgeProps, BadgeVariant, BadgeSize, StatusDotProps, StatusColor } from './Badge'

export { Card, CardHeader, CardTitle, CardBody, EmptyState, Divider } from './Card'
export type { CardProps, EmptyStateProps } from './Card'

export { default as Modal, ModalHeader, ModalBody, ModalFooter, ModalActions } from './Modal'
export { Tabs } from './Tabs'
export type { TabsProps, TabItem } from './Tabs'

export { Tooltip } from './Tooltip'
export type { TooltipProps } from './Tooltip'

export { AlertDialog } from './AlertDialog'
export type { AlertDialogProps } from './AlertDialog'
