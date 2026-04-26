import ToolCard from './ToolCard'

interface Message {
  id: string; role: 'user' | 'assistant' | 'system' | 'error'; content: string
  tools?: { name: string; input: string; output?: string; status: 'running' | 'done' | 'error' }[]
}

const labels: Record<string, { label: string; color: string }> = {
  user: { label: 'you', color: 'var(--color-accent)' },
  assistant: { label: 'assistant', color: 'var(--color-accent-green)' },
  system: { label: 'system', color: 'var(--color-text-dim)' },
  error: { label: 'error', color: 'var(--color-accent-red)' },
}

function MessageBubble({ message }: { message: Message }) {
  const { label, color } = labels[message.role] || labels.system
  return (
    <div className="mb-3">
      <div className="text-xs font-bold mb-1" style={{ color }}>{label}</div>
      {message.content && <div className="text-xs whitespace-pre-wrap pl-4">{message.content}</div>}
      {message.tools?.map((tool, i) => (<ToolCard key={i} tool={tool} />))}
    </div>
  )
}

export default MessageBubble
