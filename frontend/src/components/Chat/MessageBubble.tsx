import { useState } from 'react'

interface ToolCall {
  name: string
  input: string
  output?: string
  status: 'running' | 'done' | 'error'
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  thinking?: string
  tools?: ToolCall[]
}

/* ---- shared card shell ---- */

function MsgBlock({
  borderColor,
  header,
  children,
}: {
  borderColor: string
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className="bg-[var(--bg-sidebar)] border-l-[3px] px-3 py-2 transition-colors"
      style={{ borderColor }}
    >
      {header && <div className="mb-[6px]">{header}</div>}
      {children}
    </div>
  )
}

/* ---- thinking block ---- */

function ThinkingBlock({ content }: { content: string }) {
  return (
    <MsgBlock
      borderColor="var(--border)"
      header={
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.04em]"
          style={{ color: 'var(--yellow)' }}
        >
          Thinking
        </span>
      }
    >
      <div
        className="text-[13px] text-[var(--text-dim)] whitespace-pre-wrap leading-[1.6]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {content}
      </div>
    </MsgBlock>
  )
}

/* ---- text block (user / assistant / error) ---- */

function TextBlock({ content, borderColor }: { content: string; borderColor: string }) {
  return (
    <MsgBlock borderColor={borderColor}>
      <div
        className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap leading-[1.6]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {content}
      </div>
    </MsgBlock>
  )
}

/* ---- tool block ---- */

function formatToolInput(name: string, input: string): string {
  if (!input) return ''
  try {
    const obj = JSON.parse(input)
    const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (entries.length === 0) return ''
    const first = entries[0]
    return String(first[1])
  } catch {
    return input.length > 120 ? input.slice(0, 120) + '...' : input
  }
}

function statusColors(status: string): { fg: string; bg: string } {
  switch (status) {
    case 'running': return { fg: 'var(--yellow)', bg: 'rgba(204,167,0,0.12)' }
    case 'error':   return { fg: 'var(--red)', bg: 'rgba(241,76,76,0.12)' }
    default:        return { fg: 'var(--text-dim)', bg: 'rgba(133,133,133,0.10)' }
  }
}

function ToolBlock({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const lines = tool.output?.split('\n') || []
  const hasOutput = lines.length > 1 || (lines.length === 1 && lines[0])
  const overflow = lines.length > 10
  const displayLines = expanded || !overflow ? lines : [...lines.slice(0, 10), `... +${lines.length - 10} more lines`]
  const inputText = formatToolInput(tool.name, tool.input)
  const s = statusColors(tool.status)

  const header = (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="text-[11px] font-semibold shrink-0 rounded-[3px] px-[5px] py-px leading-[18px]"
        style={{ color: 'var(--green)', background: 'rgba(78,201,176,0.10)', fontFamily: 'var(--font-mono)' }}
      >
        {tool.name}
      </span>
      {inputText && (
        <span
          className="text-[13px] text-[var(--text-dim)] truncate min-w-0"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {inputText}
        </span>
      )}
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.04em] shrink-0 ml-auto rounded-[3px] px-[4px] leading-[16px]"
        style={{ color: s.fg, background: s.bg }}
      >
        {tool.status}
      </span>
    </div>
  )

  return (
    <MsgBlock borderColor="var(--border)" header={header}>
      {hasOutput && (
        <div
          className="text-[var(--text-dim)] whitespace-pre-wrap text-[13px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {displayLines.join('\n')}
        </div>
      )}
      {overflow && (
        <button
          className="text-[12px] text-[var(--text-dim)] hover:text-[var(--text-primary)] mt-[6px] transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '\u25B2 Collapse' : `\u25BC Expand (${lines.length} lines)`}
        </button>
      )}
    </MsgBlock>
  )
}

/* ---- message bubble (router) ---- */

function MessageBubble({ message }: { message: Message }) {
  const { role, content, thinking, tools } = message

  if (role === 'system') {
    return (
      <div className="text-center text-[var(--text-dim)] text-[13px] py-1">{content}</div>
    )
  }

  return (
    <div className="flex flex-col gap-[4px] mb-[4px]">
      {role === 'user' ? (
        <TextBlock content={content} borderColor="var(--accent)" />
      ) : role === 'error' ? (
        <TextBlock content={content} borderColor="var(--red)" />
      ) : (
        <>
          {thinking && <ThinkingBlock content={thinking} />}
          {tools?.map((tool, i) => <ToolBlock key={i} tool={tool} />)}
          {content && <TextBlock content={content} borderColor="var(--border)" />}
        </>
      )}
    </div>
  )
}

export default MessageBubble
