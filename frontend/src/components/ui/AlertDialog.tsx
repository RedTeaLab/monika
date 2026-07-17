import { type ReactNode, useEffect, useRef } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './Modal'
import { Button, type ButtonVariant } from './Button'

export interface AlertDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  /** Confirm button text. */
  confirmLabel?: string
  /** Cancel button text. Hide cancel button by setting to undefined. */
  cancelLabel?: string | null
  /** Variant controls confirm button styling. */
  variant?: Extract<ButtonVariant, 'primary' | 'destructive'>
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog — modal that blocks until user picks confirm or cancel.
 * Built on top of the shared Modal primitive. Replaces hand-rolled
 * Chat/ConfirmModal and other inline confirm dialogs.
 */
export function AlertDialog({
  open,
  title,
  description,
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: AlertDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      // Auto-focus the confirm button when the dialog opens
      const t = setTimeout(() => confirmRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!open) return null

  return (
    <Modal onClose={onCancel} loading={loading} width={420}>
      {icon && <ModalHeader icon={icon}>{title}</ModalHeader>}
      {!icon && (
        <div className="px-5 pt-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        </div>
      )}
      <ModalBody>
        {description && (
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {description}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {cancelLabel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
        )}
        <Button
          ref={confirmRef}
          variant={variant === 'destructive' ? 'destructive' : 'primary'}
          size="sm"
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
