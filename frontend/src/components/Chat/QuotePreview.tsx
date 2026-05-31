import { QuotedMessage } from '../../store'

interface QuotePreviewProps {
  messages: QuotedMessage[]
  onRemove: (id: string) => void
  onClear: () => void
}

export default function QuotePreview({ messages, onRemove, onClear }: QuotePreviewProps) {
  if (messages.length === 0) return null

  return (
    <div
      className="mx-4 mb-1 rounded-md px-3 py-2"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--text-dim)' }}>
          Quoting {messages.length} message{messages.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={onClear}
          className="text-[10px] font-semibold uppercase tracking-[0.04em] hover:underline cursor-pointer"
          style={{ color: 'var(--text-dim)' }}
        >
          Clear
        </button>
      </div>
      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
        {messages.map((qm) => (
          <div
            key={qm.id}
            className="flex items-center gap-1.5 text-[12px] py-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span
              className="text-[10px] font-semibold uppercase shrink-0"
              style={{ color: qm.role === 'user' ? 'var(--accent)' : 'var(--text-dim)' }}
            >
              {qm.role === 'user' ? 'You' : qm.role === 'assistant' ? 'Assistant' : qm.role}
            </span>
            <span className="truncate">{qm.content.slice(0, 150)}</span>
            <button
              onClick={() => onRemove(qm.id)}
              className="shrink-0 ml-auto text-[14px] leading-none hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              style={{ color: 'var(--text-dim)' }}
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
