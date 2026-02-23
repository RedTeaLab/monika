import { useEffect, useRef, useCallback, ReactNode } from 'react'

export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive) return

    previousFocusRef.current = document.activeElement as HTMLElement

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const container = containerRef.current
      if (!container) return

      const focusableElements = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement?.focus()
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    const focusableElements = containerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusableElements?.[0]?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [isActive])

  return containerRef
}

export function useAnnounce() {
  const announcerRef = useRef<HTMLDivElement>(null)

  const announce = useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = ''
      setTimeout(() => {
        if (announcerRef.current) {
          announcerRef.current.textContent = message
        }
      }, 100)
    }
  }, [])

  const Announcer = useCallback(({ message, priority = 'polite' }: { message: string; priority?: 'polite' | 'assertive' }) => {
    return (
      <div
        ref={announcerRef}
        role="status"
        aria-live={priority}
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
    )
  }, [])

  return { announce, Announcer }
}

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const matchesKey = e.key.toLowerCase() === key.toLowerCase()
      const matchesCtrl = !modifiers.ctrl || e.ctrlKey || e.metaKey
      const matchesShift = !modifiers.shift || e.shiftKey
      const matchesAlt = !modifiers.alt || e.altKey

      if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
        e.preventDefault()
        callback()
      }
    },
    [key, callback, modifiers]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

export function getAriaLabel(
  fallback: string,
  label?: string
): string {
  return label || fallback
}
