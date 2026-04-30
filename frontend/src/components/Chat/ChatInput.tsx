import { useState, KeyboardEvent, useEffect } from 'react'

function ChatInput({ onSend, onStop, disabled }: {
  onSend: (text: string) => void
  onStop: () => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')

  // ESC key to stop generation
  useEffect(() => {
    if (!disabled) return
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onStop()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [disabled, onStop])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) { onSend(value); setValue('') }
    }
  }

  const handleSendClick = () => {
    if (value.trim() && !disabled) { onSend(value); setValue('') }
  }

  return (
    <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: 'var(--bg-sidebar)' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Generating...' : 'Send a message... (Enter to submit)'}
          className="flex-1 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] resize-none outline-none px-[14px] py-[10px] rounded-md border transition-colors"
          style={{ background: 'var(--bg-card)' }}
          rows={2}
        />
        {disabled ? (
          <button
            onClick={onStop}
            title="Stop generating (Esc)"
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              flexShrink: 0,
              alignSelf: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSendClick}
            disabled={!value.trim()}
            title="Send message (Enter)"
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: 'none',
              background: value.trim() ? 'var(--accent)' : 'var(--border)',
              color: value.trim() ? '#fff' : 'var(--text-dim)',
              cursor: value.trim() ? 'pointer' : 'default',
              flexShrink: 0,
              alignSelf: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="7" y1="2" x2="7" y2="12" />
              <polyline points="3,7 7,3 11,7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default ChatInput
