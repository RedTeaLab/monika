import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'

interface AskUserBarProps {
  sessionId: string
}

function AskUserBar({ sessionId }: AskUserBarProps) {
  const pendingAskUser = useStore((s) => s.pendingAskUser)
  const respondAskUser = useStore((s) => s.respondAskUser)
  const [selected, setSelected] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [customActive, setCustomActive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset state when a new ask_user request arrives
  useEffect(() => {
    setSelected(null)
    setCustomText('')
    setCustomActive(false)
  }, [pendingAskUser?.requestId])

  if (!pendingAskUser || pendingAskUser.sessionId !== sessionId) return null

  const hasOptions = pendingAskUser.options && pendingAskUser.options.length > 0

  const submitAnswer = (text: string) => {
    respondAskUser({ requestId: pendingAskUser.requestId, answer: text })
    setSelected(null)
    setCustomText('')
    setCustomActive(false)
  }

  const handleSubmit = () => {
    if (customActive) {
      if (customText.trim()) submitAnswer(customText.trim())
    } else if (selected) {
      submitAnswer(selected)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      submitAnswer('')
    }
  }

  const canSubmit = customActive ? customText.trim().length > 0 : selected !== null

  // Auto-focus textarea when custom mode activates
  useEffect(() => {
    if (customActive && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.style.height = '0px'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [customActive])

  return (
    <div
      className="border-t px-4 py-2.5 flex flex-col gap-2"
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      role="alertdialog"
      aria-label="Agent is asking a question"
      onKeyDown={handleKeyDown}
    >
      <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
        {pendingAskUser.title || 'Question'}
      </span>

      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        {pendingAskUser.question}
      </p>

      {/* Free text mode when no options */}
      {!hasOptions && (
        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Type your answer..."
          className="w-full text-[12px] px-2 py-1.5 rounded-sm resize-none outline-none"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            minHeight: '60px',
          }}
          rows={2}
          autoFocus
        />
      )}

      {/* Options list */}
      {hasOptions && (
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Options">
          {pendingAskUser.options!.map((opt) => {
            const isActive = selected === opt && !customActive
            return (
              <button
                key={opt}
                role="radio"
                aria-checked={isActive}
                onClick={() => {
                  setSelected(opt)
                  setCustomActive(false)
                }}
                className="flex items-start gap-3 text-left px-2.5 py-1.5 rounded cursor-pointer outline-none transition-colors"
                style={{
                  background: isActive ? 'var(--accent-muted)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              >
                {/* Radio indicator */}
                <span
                  className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center"
                  style={{
                    borderColor: isActive ? 'var(--accent)' : 'var(--border-strong)',
                  }}
                >
                  {isActive && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                </span>
                <span className="text-[12px] leading-relaxed">{opt}</span>
              </button>
            )
          })}

          {/* Custom answer option */}
          <button
            role="radio"
            aria-checked={customActive}
            onClick={() => {
              setCustomActive(true)
              setSelected(null)
            }}
            className="flex items-start gap-3 text-left px-2.5 py-1.5 rounded cursor-pointer outline-none transition-colors"
            style={{
              background: customActive ? 'var(--accent-muted)' : 'transparent',
              border: `1px solid ${customActive ? 'var(--accent)' : 'var(--border)'}`,
              color: 'var(--text-dim)',
              fontFamily: 'inherit',
            }}
          >
            <span
              className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center"
              style={{
                borderColor: customActive ? 'var(--accent)' : 'var(--border-strong)',
              }}
            >
              {customActive && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </span>
            <span className="text-[12px] leading-relaxed">Type your own answer</span>
          </button>

          {/* Inline textarea when custom active */}
          {customActive && (
            <textarea
              ref={textareaRef}
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value)
                e.target.style.height = '0px'
                e.target.style.height = `${e.target.scrollHeight}px`
              }}
              placeholder="Type your answer..."
              className="w-full text-[12px] px-2 py-1.5 rounded-sm resize-none outline-none ml-5.5"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                minHeight: '40px',
              }}
              rows={1}
              autoFocus
            />
          )}
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex justify-end gap-1.5">
        <button
          onClick={() => submitAnswer('')}
          className="text-[11px] px-2.5 py-1 rounded-sm cursor-pointer outline-none"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            fontFamily: 'inherit',
          }}
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="text-[11px] px-2.5 py-1 rounded-sm cursor-pointer font-medium outline-none"
          style={{
            background: canSubmit ? 'var(--accent-muted)' : 'var(--border)',
            border: 'none',
            color: canSubmit ? 'var(--accent)' : 'var(--text-dim)',
            fontFamily: 'inherit',
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          Submit
        </button>
      </div>
    </div>
  )
}

export default AskUserBar
