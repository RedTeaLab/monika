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
    <div className="border-t border-[var(--color-border)] px-4 py-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'Generating...' : 'Send a message... (Enter to submit)'}
        className="w-full bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-dim)] resize-none outline-none"
        rows={2}
      />
    </div>
  )
}

export default ChatInput
