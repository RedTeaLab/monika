import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
    children: ReactNode
    onClose: () => void
    loading?: boolean
    width?: number
    animate?: boolean
}

export default function Modal({ children, onClose, loading, width = 440, animate = true }: ModalProps) {
    const triggerRef = useRef<Element | null>(null)

    useEffect(() => {
        triggerRef.current = document.activeElement
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
                ; (triggerRef.current as HTMLElement)?.focus()
        }
    }, [])

    return createPortal(
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center${animate ? ' modal-backdrop-enter' : ''}`}
            style={{ background: 'var(--surface-overlay)', backdropFilter: 'blur(6px)' }}
            onClick={loading ? undefined : onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={`${animate ? 'modal-panel-enter ' : ''}flex flex-col bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] overflow-hidden`}
                style={{ width, maxWidth: '90vw', maxHeight: '85vh', boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)' }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === 'Escape' && !loading) onClose() }}
            >
                {children}
            </div>
        </div>,
        document.body
    )
}

export function ModalHeader({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
    return (
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
            {icon && (
                <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'var(--accent-muted)' }}>
                    <span style={{ color: 'var(--accent)' }}>{icon}</span>
                </div>
            )}
            <div className="flex-1 min-w-0">{children}</div>
        </div>
    )
}

export function ModalBody({ children }: { children: ReactNode }) {
    return (
        <div className="flex-1 overflow-y-auto px-5 py-4">
            {children}
        </div>
    )
}

export function ModalFooter({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)]" style={{ background: 'rgba(0,0,0,0.15)' }}>
            {children}
        </div>
    )
}

export const ModalActions = ModalFooter

