import { useMemo } from 'react'
import { useStore } from '../../store'

interface ToolCall {
  id?: string
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

function extractTaskId(output: string): string | null {
  const m = output.match(/task_id:\s*(\S+)/)
  return m ? m[1] : null
}

function parseRunningDetail(output?: string): string | null {
  if (!output) return null
  // Running output is the current tool status, e.g. "grep · pattern: xxx"
  const trimmed = output.trim()
  return trimmed.length > 0 ? trimmed : null
}

const AGENT_COLORS: Record<string, string> = {
  explore: '#7e70a8',
  general: '#6b8cff',
  compaction: '#c6902f',
}

interface SpawnBlockProps {
  tool: ToolCall
  model?: string
  duration?: number
}

export default function SpawnBlock({ tool, model, duration }: SpawnBlockProps) {
  const openSessionTab = useStore((s) => s.openSessionTab)
  const info = useMemo(() => parseSpawnInput(tool.input), [tool.input])
  const taskId = useMemo(() => tool.output ? extractTaskId(tool.output) : null, [tool.output])
  const runningDetail = useMemo(() => parseRunningDetail(tool.output), [tool.output])
  const subagentType = info.subagent_type || 'general'
  const agentColor = AGENT_COLORS[subagentType] || '#7e70a8'
  const isRunning = tool.status === 'running'

  const formatDuration = (s: number) => {
    if (s >= 60) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
    return `${s.toFixed(1)}s`
  }

  const handleClick = () => {
    // Running: use tool call ID as session ID (backend uses it via tool context)
    // Done: use task_id from output
    const sessionId = isRunning ? tool.id : taskId
    if (sessionId) {
      openSessionTab(sessionId, `${subagentType} · ${info.description}`)
    }
  }

  return (
    <div
      className="rounded-lg border"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        cursor: (isRunning && !tool.id) ? 'default' : 'pointer',
      }}
      onClick={handleClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-card)' }}
    >
      <div className="flex items-center gap-2.5 px-[14px] py-[8px] min-w-0">
        {/* Agent badge */}
        <span
          className="text-[10px] font-semibold font-mono shrink-0 rounded px-1.5 py-0.5"
          style={{ color: agentColor, background: `${agentColor}1a` }}
        >
          {subagentType}
        </span>

        {/* Description + meta */}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[12px] font-semibold truncate">{info.description}</span>
          {!isRunning && (
            <span className="text-[10px] text-[var(--text-dim)] flex items-center gap-1.5">
              {model && <span>{model}</span>}
              {model && duration != null && duration > 0 && <span>·</span>}
              {duration != null && duration > 0 && <span>{formatDuration(duration)}</span>}
            </span>
          )}
          {isRunning && runningDetail && (
            <span className="text-[10px] text-[var(--text-dim)] truncate font-mono flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--yellow)] motion-safe:animate-pulse" />
              {runningDetail}
            </span>
          )}
        </div>

        {/* Status */}
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.03em] shrink-0 flex items-center gap-1.5"
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
