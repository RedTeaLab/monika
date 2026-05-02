import { useState, KeyboardEvent, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { formatTokens } from '../../lib/format'

function ModelSelect() {
  const availableModels = useStore((s) => s.availableModels)
  const selectedModel = useStore((s) => s.selectedModel)
  const setSelectedModel = useStore((s) => s.setSelectedModel)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = availableModels.find((m) => m.ID === selectedModel) || availableModels[0]

  if (availableModels.length === 0) {
    return (
      <span className="text-[11px] text-[var(--text-dim)]">No models</span>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
        }}
      >
        <span>{current?.DisplayName || 'Select'}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="2,3 4,5 6,3" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            minWidth: '140px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '4px',
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {availableModels.map((m) => (
            <button
              key={m.ID}
              onClick={() => { setSelectedModel(m.ID); setOpen(false) }}
              className="text-[11px] w-full text-left px-2 py-1 rounded cursor-pointer block"
              style={{
                background: m.ID === selectedModel ? 'var(--bg-hover)' : 'transparent',
                color: m.ID === selectedModel ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = m.ID === selectedModel ? 'var(--bg-hover)' : 'transparent' }}
            >
              {m.DisplayName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ChatInput({ onSend, onStop, disabled, compacting }: {
  onSend: (text: string) => void
  onStop: () => void
  disabled: boolean
  compacting: boolean
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionTokens = useStore((s) => s.sessionTokens)
  const tokens = sessionTokens[activeSessionId] || { count: 0, max: 0 }
  const tokenCount = tokens.count
  const tokenMax = tokens.max

  // Stable ref for onStop to avoid re-registering ESC listener every render
  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  // ESC key to stop generation
  useEffect(() => {
    if (!disabled) return
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onStopRef.current()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [disabled])

  // Auto-resize textarea after value changes
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled && !compacting) { onSend(value); setValue('') }
    }
  }

  const handleSendClick = () => {
    if (value.trim() && !disabled && !compacting) { onSend(value); setValue('') }
  }

  const tokenText = tokenMax > 0
    ? `${formatTokens(tokenCount)} / ${formatTokens(tokenMax)}`
    : formatTokens(tokenCount)

  return (
    <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: 'var(--bg-sidebar)' }}>
      <div
        className="rounded-md border transition-colors"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || compacting}
          placeholder={
            compacting ? 'Compacting...'
            : disabled ? 'Generating...'
            : 'Send a message... (Enter to submit, Shift+Enter for newline)'
          }
          className="text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none px-[14px] pt-[10px] pb-[2px] resize-none w-full bg-transparent"
          rows={2}
        />

        <div
          className="flex items-center gap-2 px-[10px] pb-[8px]"
          style={{ background: 'transparent' }}
        >
          <ModelSelect />

          <span className="text-[11px] text-[var(--text-dim)] select-none" style={{ fontFeatureSettings: '"tnum"' }}>
            tok: {tokenText}
          </span>

          <div className="flex-1" />

          {disabled ? (
            <button
              onClick={onStop}
              title="Stop generating (Esc)"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                flexShrink: 0,
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
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: 'none',
                color: value.trim() ? 'var(--accent)' : 'var(--text-dim)',
                cursor: value.trim() ? 'pointer' : 'default',
                opacity: value.trim() ? 1 : 0.4,
                transition: 'color 0.15s, opacity 0.15s',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8l12-6-5 12-2-6z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInput
