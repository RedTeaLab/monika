import { useState, useRef } from 'react'
import Modal, { ModalActions, ModalButton } from '../ui/Modal'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function ConfirmModal({ title, message, confirmLabel, variant = 'danger', onConfirm, onCancel }: ConfirmModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)

  const handleConfirm = async () => {
    setError('')
    setIsLoading(true)
    try {
      await onConfirm()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed. Please try again.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal onClose={onCancel} loading={isLoading} width={360}>
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)] m-0">
        {title}
      </h2>
      <p className="text-[13px] text-[var(--text-secondary)] mt-2 mb-0">
        {message}
      </p>
      {error && (
        <p className="text-[12px] text-[var(--red)] mt-2 mb-0">{error}</p>
      )}
      <ModalActions>
        <ModalButton ref={cancelRef} onClick={onCancel} disabled={isLoading}>
          Cancel
        </ModalButton>
        <ModalButton
          variant={variant === 'primary' ? 'primary' : 'danger'}
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? (confirmLabel ? `${confirmLabel}ing...` : 'Deleting...') : (confirmLabel || 'Delete')}
        </ModalButton>
      </ModalActions>
    </Modal>
  )
}

export default ConfirmModal
