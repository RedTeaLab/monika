import { useState, KeyboardEvent } from 'react'

function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('')

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) { onSend(value); setValue('') }
    }
  }

  return (
    <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: 'var(--bg-sidebar)' }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'Generating...' : 'Send a message... (Enter to submit)'}
        className="w-full text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] resize-none outline-none px-[14px] py-[10px] rounded-md border transition-colors"
        style={{
          background: 'var(--bg-card)',
        }}
        rows={2}
      />
    </div>
  )
}

export default ChatInput
