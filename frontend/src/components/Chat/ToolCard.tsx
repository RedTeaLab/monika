interface ToolCall { name: string; input: string; output?: string; status: 'running' | 'done' | 'error' }

const statusColors = { running: 'var(--yellow)', done: 'var(--green)', error: 'var(--red)' }

function ToolCard({ tool }: { tool: ToolCall }) {
  const lines = tool.output?.split('\n') || []
  const truncated = lines.length > 8 ? [...lines.slice(0, 6), `... +${lines.length - 6} more lines`] : lines
  return (
    <div className="ml-0 my-1 pl-3 border-l-[3px] text-[13px]" style={{ borderColor: statusColors[tool.status], fontFamily: 'var(--font-mono)' }}>
      <div className="flex items-center gap-2 py-[2px]">
        <span className="text-[var(--text-primary)]">{tool.name}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.03em]" style={{ color: statusColors[tool.status] }}>{tool.status}</span>
      </div>
      {tool.output && <div className="mt-[2px] text-[var(--text-dim)] whitespace-pre-wrap">{truncated.join('\n')}</div>}
    </div>
  )
}

export default ToolCard
