interface ToolCall { name: string; input: string; output?: string; status: 'running' | 'done' | 'error' }

const statusColors = { running: 'var(--color-accent-yellow)', done: 'var(--color-accent-green)', error: 'var(--color-accent-red)' }

function ToolCard({ tool }: { tool: ToolCall }) {
  const lines = tool.output?.split('\n') || []
  const truncated = lines.length > 8 ? [...lines.slice(0, 6), `... +${lines.length - 6} more lines`] : lines
  return (
    <div className="ml-4 my-1 pl-2 border-l-2 text-xs" style={{ borderColor: statusColors[tool.status] }}>
      <div className="flex items-center gap-2">
        <span className="font-bold">{tool.name}</span>
        <span style={{ color: statusColors[tool.status] }}>{tool.status}</span>
      </div>
      {tool.output && <div className="mt-1 text-[var(--color-text-dim)] whitespace-pre-wrap">{truncated.join('\n')}</div>}
    </div>
  )
}

export default ToolCard
