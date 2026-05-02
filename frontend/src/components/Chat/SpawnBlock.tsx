import { useMemo } from 'react'
import { useStore } from '../../store'

interface ToolCall {
  name: string
  input: string
  output?: string
  status: 'running' | 'done' | 'error'
}

function parseSpawnInput(input: string): {
  description: string
  subagent_type: string
} {
  try {
    const obj = JSON.parse(input)
    return {
      description: obj.description || 'Untitled task',
      subagent_type: obj.subagent_type || 'general',
    }
  } catch {
    return { description: input.slice(0, 60), subagent_type: 'general' }
  }
}

const AGENT_COLORS: Record<string, string> = {
  explore: '#7e70a8',
  general: '#6b8cff',
  compaction: '#c6902f',
}

interface SpawnBlockProps {
  tool: ToolCall
}

export default function SpawnBlock({ tool }: SpawnBlockProps) {
  const openSessionTab = useStore((s) => s.openSessionTab)
  const info = useMemo(() => parseSpawnInput(tool.input), [tool.input])
  const agentColor = AGENT_COLORS[info.subagent_type] || '#7e70a8'
  const isRunning = tool.status === 'running'

  const handleClick = () => {
    if (tool.output) {
      const m = tool.output.match(/task_id:\s*(\S+)/)
      if (m) {
        openSessionTab(m[1], `${info.subagent_type} · ${info.description}`)
      }
    }
  }

  return (
    <div
      className="rounded-lg border cursor-pointer"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2.5 px-[14px] py-[8px]">
        <span
          className="text-[10px] font-semibold font-mono shrink-0 rounded px-1.5 py-0.5"
          style={{ color: agentColor, background: `${agentColor}1a` }}
        >
          {info.subagent_type}
        </span>
        <span className="text-[12px] font-semibold truncate">{info.description}</span>
        {isRunning && tool.output && (
          <span className="text-[10px] text-[var(--text-dim)] truncate font-mono">
            {tool.output}
          </span>
        )}
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.03em] shrink-0 ml-auto flex items-center gap-1.5"
          style={{ color: isRunning ? 'var(--yellow)' : tool.status === 'error' ? 'var(--red)' : 'var(--green)' }}
        >
          {isRunning ? (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--yellow)] motion-safe:animate-pulse" />
              running
            </>
          ) : tool.status === 'error' ? (
            'error'
          ) : (
            'done'
          )}
        </span>
      </div>
    </div>
  )
}
