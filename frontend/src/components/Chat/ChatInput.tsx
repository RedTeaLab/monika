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
    <div className="border-t border-[var(--border)] px-3 py-2 bg-[var(--bg-main)]">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'Generating...' : 'Send a message... (Enter to submit)'}
        className="w-full bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] resize-none outline-none px-3 py-[6px] rounded-[2px] border border-transparent focus:border-[var(--border-active)]"
        rows={2}
      />
    </div>
  )

}

export default ChatInput
