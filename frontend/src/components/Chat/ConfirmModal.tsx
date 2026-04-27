import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmModalProps {
  title: string
  message: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus Cancel button on mount
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      onCancel()
      return
    }
    if (e.key === 'Tab') {
      const cancel = cancelRef.current
      const confirm = confirmRef.current
      if (e.shiftKey) {
        if (document.activeElement === cancel) {
          e.preventDefault()
          confirm?.focus()
        }
      } else {
        if (document.activeElement === confirm) {
          e.preventDefault()
          cancel?.focus()
        }
      }
    }
  }, [isLoading, onCancel])

  const handleConfirm = async () => {
    setError('')
    setIsLoading(true)
    try {
      await onConfirm()
    } catch (err: any) {
      setError(err?.message || 'Deletion failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        className="bg-[var(--bg-titlebar)] rounded-[6px] max-w-[360px] p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="confirm-modal-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p id="confirm-modal-desc" className="text-[13px] text-[var(--text-secondary)] mt-2">
          {message}
        </p>
        {error && (
          <p className="text-[12px] text-[var(--red)] mt-2">{error}</p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={isLoading}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-[var(--red)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmModal
