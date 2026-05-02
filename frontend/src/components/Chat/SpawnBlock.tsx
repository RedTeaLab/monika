import { useState, useMemo } from 'react'
import { useStore } from '../../store'
import MarkdownBlock from './MarkdownBlock'

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

function extractTaskResult(output: string): { taskId: string; result: string } | null {
  const idMatch = output.match(/task_id:\s*(\S+)/)
  const resultMatch = output.match(/<task_result>\s*([\s\S]*?)\s*<\/task_result>/)
  if (idMatch) {
    return {
      taskId: idMatch[1],
      result: resultMatch ? resultMatch[1] : output,
    }
  }
  return null
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
  const [expanded, setExpanded] = useState(false)
  const info = useMemo(() => parseSpawnInput(tool.input), [tool.input])
  const taskResult = useMemo(() => tool.output ? extractTaskResult(tool.output) : null, [tool.output])
  const agentColor = AGENT_COLORS[info.subagent_type] || '#7e70a8'
  const isRunning = tool.status === 'running'
  const isDone = tool.status === 'done'

  const handleClick = () => {
    if (isRunning) return // can't open while running — session isn't saved yet
    if (taskResult) {
      // Toggle expanded content inline
      setExpanded(!expanded)
    }
  }

  const handleOpenTab = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (taskResult) {
      openSessionTab(taskResult.taskId, `${info.subagent_type} · ${info.description}`)
    }
  }

  return (
    <div
      className="rounded-lg border"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        cursor: isRunning ? 'default' : 'pointer',
      }}
    >
      <div
        className="flex items-center gap-2.5 px-[14px] py-[8px]"
        onClick={handleClick}
        onMouseEnter={(e) => { if (!isRunning) (e.currentTarget.parentElement as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
        onMouseLeave={(e) => { if (!isRunning) (e.currentTarget.parentElement as HTMLElement).style.background = 'var(--bg-card)' }}
      >
        <span
          className="text-[10px] font-semibold font-mono shrink-0 rounded px-1.5 py-0.5"
          style={{ color: agentColor, background: `${agentColor}1a` }}
        >
          {info.subagent_type}
        </span>
        <span className="text-[12px] font-semibold truncate">{info.description}</span>
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
        {isDone && (
          <button
            className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--bg-hover)] shrink-0"
            onClick={handleOpenTab}
            title="Open in new tab"
          >
            Open tab →
          </button>
        )}
      </div>

      {/* Inline expanded result (click the card body to toggle) */}
      {expanded && taskResult && (
        <div
          className="px-[14px] pb-[10px] text-[13px]"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <MarkdownBlock content={taskResult.result} muted />
        </div>
      )}
    </div>
  )
}
