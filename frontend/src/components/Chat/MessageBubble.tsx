import { useState, useMemo } from 'react'
import MarkdownBlock from './MarkdownBlock'

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
  background,
  children,
}: {
  borderColor: string
  header?: React.ReactNode
  background?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="border-l-[3px] px-3 py-2 transition-colors rounded-[6px]"
      style={{ borderColor, background: background || 'var(--bg-sidebar)' }}
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
      <MarkdownBlock content={content} muted />
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

const DATA_TOOLS: Record<string, { color: string; bg: string }> = {
  bash:   { color: 'var(--yellow)',  bg: 'rgba(204,167,0,0.10)' },
  file:   { color: 'var(--blue)',    bg: 'rgba(86,156,214,0.10)' },
  grep:   { color: 'var(--green)',   bg: 'rgba(78,201,176,0.10)' },
  glob:   { color: 'var(--purple)',  bg: 'rgba(197,134,192,0.10)' },
  write:  { color: 'var(--orange)',  bg: 'rgba(206,145,120,0.10)' },
  edit:   { color: 'var(--orange)',  bg: 'rgba(206,145,120,0.10)' },
  default:{ color: 'var(--green)',   bg: 'rgba(78,201,176,0.10)' },
}

function toolBadge(name: string) {
  return DATA_TOOLS[name] || DATA_TOOLS.default
}

function formatToolInput(name: string, input: string): { label: string; detail: string } {
  if (!input) return { label: name, detail: '' }
  try {
    const obj = JSON.parse(input)
    const keys = Object.keys(obj).filter(k => k !== 'description')
    if (keys.length === 0) return { label: name, detail: '' }
    if (keys.length === 1) return { label: name, detail: String(obj[keys[0]]) }
    // Two keys: show "key1: val1, key2: val2"
    const firstTwo = keys.slice(0, 2).map(k => `${k}: ${String(obj[k]).slice(0, 40)}`).join(', ')
    return { label: name, detail: firstTwo }
  } catch {
    return { label: name, detail: input.length > 120 ? input.slice(0, 120) + '...' : input }
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
  const [copied, setCopied] = useState(false)

  const isJson = useMemo(() => {
    if (!tool.output) return false
    try { JSON.parse(tool.output); return true } catch { return false }
  }, [tool.output])

  const formattedOutput = useMemo(() => {
    if (!tool.output) return ''
    return isJson ? JSON.stringify(JSON.parse(tool.output), null, 2) : tool.output
  }, [tool.output, isJson])

  const lines = formattedOutput.split('\n')
  const hasOutput = lines.length > 1 || (lines.length === 1 && lines[0])
  const MAX_PREVIEW = 12
  const overflow = lines.length > MAX_PREVIEW
  const displayLines = expanded || !overflow ? lines : lines.slice(0, MAX_PREVIEW)
  const inputInfo = formatToolInput(tool.name, tool.input)
  const badge = toolBadge(tool.name)
  const s = statusColors(tool.status)

  const handleCopy = () => {
    if (tool.output) {
      navigator.clipboard.writeText(tool.output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const header = (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="text-[11px] font-semibold shrink-0 rounded-[3px] px-[5px] py-px leading-[18px]"
        style={{ color: badge.color, background: badge.bg, fontFamily: 'var(--font-mono)' }}
      >
        {tool.name}
      </span>
      {inputInfo.detail && (
        <span
          className="text-[12px] text-[var(--text-dim)] truncate min-w-0"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {inputInfo.detail}
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
    <MsgBlock borderColor="var(--border)" header={header} background="color-mix(in srgb, var(--bg-main) 95%, var(--blue))">
      {hasOutput && (
        <div className="relative group/output">
          <button
            className="absolute top-0 right-0 opacity-0 group-hover/output:opacity-100 transition-opacity z-10
                       text-[10px] font-semibold uppercase tracking-[0.04em] rounded-[3px] px-[5px] py-px leading-[16px]
                       hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{ color: 'var(--text-dim)' }}
            onClick={handleCopy}
            aria-label="Copy output"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <div
            className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap overflow-x-auto mt-[2px]"
            style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.55 }}
          >
            {displayLines.map((line, i) => (
              <span key={i} className="block min-h-[1.55em]">
                <span
                  className="inline-block w-[2.8em] mr-[1.2em] text-right select-none shrink-0"
                  style={{ color: 'var(--text-dim)', opacity: 0.4 }}
                >
                  {i + 1}
                </span>
                <span>{isJson ? formatJsonLine(line) : line}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {overflow && (
        <button
          className="text-[12px] text-[var(--text-dim)] hover:text-[var(--text-primary)] mt-[6px] transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? `\u25B2 Collapse`
            : `\u25BC Show all ${lines.length} lines`}
        </button>
      )}
    </MsgBlock>
  )
}

const JSON_KEY_RE = /^(\s*)"([^"]+)"(\s*:\s*)/
function formatJsonLine(line: string): React.ReactNode {
  const m = line.match(JSON_KEY_RE)
  if (!m) return line
  return (
    <>
      {m[1]}<span style={{ color: 'var(--text-link)' }}>&quot;{m[2]}&quot;</span>{m[3]}{line.slice(m[0].length)}
    </>
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
        <MsgBlock borderColor="var(--accent)">
          <MarkdownBlock content={content} />
        </MsgBlock>
      ) : role === 'error' ? (
        <TextBlock content={content} borderColor="var(--red)" />
      ) : (
        <>
          {thinking && <ThinkingBlock content={thinking} />}
          {tools?.map((tool, i) => <ToolBlock key={i} tool={tool} />)}
          {content && (
            <MsgBlock borderColor="var(--border)">
              <MarkdownBlock content={content} />
            </MsgBlock>
          )}
        </>
      )}
    </div>
  )
}

export default MessageBubble
