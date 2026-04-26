import ToolCard from './ToolCard'

interface Message {
  id: string; role: 'user' | 'assistant' | 'system' | 'error'; content: string
  tools?: { name: string; input: string; output?: string; status: 'running' | 'done' | 'error' }[]
}

const labels: Record<string, { label: string; color: string }> = {
  user: { label: 'You', color: 'var(--accent)' },
  assistant: { label: 'Assistant', color: 'var(--green)' },
  system: { label: 'System', color: 'var(--text-dim)' },
  error: { label: 'Error', color: 'var(--red)' },
}

function MessageBubble({ message }: { message: Message }) {
  const { label, color } = labels[message.role] || labels.system
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[12px] font-semibold uppercase tracking-[0.03em]" style={{ color }}>{label}</span>
      </div>
      {message.content && (
        <div
          className="text-[13px] whitespace-pre-wrap leading-[1.6]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >{message.content}</div>
      )}
      {message.tools?.map((tool, i) => (<ToolCard key={i} tool={tool} />))}
    </div>
  )
}

export default MessageBubble
