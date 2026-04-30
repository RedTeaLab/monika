import { useState, useMemo, useEffect } from 'react'
import MarkdownBlock from './MarkdownBlock'
import { IconChevronDown } from '../Icons'

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
  model?: string
  duration?: number
  startedAt?: number
}

/* ---- role label ---- */

const ROLE_LABEL: Record<string, { text: string; color: string }> = {
  user:      { text: 'You',       color: 'var(--text-dim)' },
  assistant: { text: 'Assistant', color: 'var(--text-dim)' },
  error:     { text: 'Error',     color: 'var(--red)' },
}

function RoleLabel({ role, isGenerating, model, duration }: {
  role: string
  isGenerating?: boolean
  model?: string
  duration?: number
}) {
  const info = ROLE_LABEL[role]
  if (!info) return null

  const metaParts: string[] = []
  if (model) metaParts.push(formatModel(model))
  if (duration != null && duration > 0) metaParts.push(formatDuration(duration))

  if (isGenerating) {
    return (
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1 select-none flex items-center gap-1.5"
        style={{ color: 'var(--accent)' }}
      >
        <span className="motion-safe:animate-label-blink" style={{ animation: 'label-blink 1.4s ease-in-out infinite' }}>
          {info.text}
        </span>
        {model && <span style={{ color: 'var(--text-dim)' }}>· {formatModel(model)}</span>}
      </div>
    )
  }

  return (
    <div
      className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1 select-none flex items-center gap-1.5"
      style={{ color: info.color }}
    >
      <span>{info.text}</span>
      {metaParts.length > 0 && (
        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
          · {metaParts.join(' · ')}
        </span>
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return `${m}m ${s}s`
  }
  return `${seconds.toFixed(1)}s`
}

function formatModel(model: string): string {
  return model
    .replace(/^(claude-|deepseek-|openai-|gpt-)/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-preview$/, '')
}

/* ---- shared glass card shell ---- */

function MsgBlock({
  accent,
  header,
  background,
  children,
}: {
  accent?: string
  header?: React.ReactNode
  background?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-lg border px-[14px] py-[10px] w-full"
      style={{
        background: background || 'var(--bg-card)',
        borderColor: 'var(--border)',
        ...(accent ? { borderLeftColor: accent, borderLeftWidth: '2px' } : {}),
      }}
    >
      {header && <div className={children ? 'mb-2' : ''}>{header}</div>}
      {children}
    </div>
  )
}

/* ---- thinking block ---- */

function ThinkingBlock({ content, isGenerating }: { content: string; isGenerating?: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(!!isGenerating)
  }, [isGenerating])

  return (
    <MsgBlock
      accent="#a68432"
      background="var(--bg-sidebar)"
      header={
        <button
          className="flex items-center gap-1.5 cursor-pointer w-full text-left"
          onClick={() => setOpen(!open)}
        >
          <IconChevronDown
            size={10}
            className="transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(-90deg)', color: '#a68432' }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: '#a68432' }}>
            Thinking
          </span>
        </button>
      }
    >
      {open && <MarkdownBlock content={content} muted />}
    </MsgBlock>
  )
}

/* ---- text block (error) ---- */

function TextBlock({ content, borderColor }: { content: string; borderColor: string }) {
  return (
    <MsgBlock accent={borderColor}>
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

const TOOL_STYLES: Record<string, { color: string }> = {
  bash:   { color: '#a68432' },
  file:   { color: '#5a82b8' },
  grep:   { color: '#449970' },
  glob:   { color: '#7e70a8' },
  write:  { color: '#a86e3a' },
  edit:   { color: '#a86e3a' },
  default:{ color: '#449970' },
}

function toolStyle(name: string) {
  return TOOL_STYLES[name] || TOOL_STYLES.default
}

function formatToolInput(name: string, input: string): { label: string; detail: string } {
  if (!input) return { label: name, detail: '' }
  try {
    const obj = JSON.parse(input)
    const keys = Object.keys(obj).filter(k => k !== 'description')
    if (keys.length === 0) return { label: name, detail: '' }
    if (keys.length === 1) return { label: name, detail: String(obj[keys[0]]) }
    const firstTwo = keys.slice(0, 2).map(k => `${k}: ${String(obj[k]).slice(0, 40)}`).join(', ')
    return { label: name, detail: firstTwo }
  } catch {
    return { label: name, detail: input.length > 120 ? input.slice(0, 120) + '...' : input }
  }
}

function statusStyle(status: string): { color: string; label: string } {
  switch (status) {
    case 'running': return { color: 'var(--yellow)', label: 'running' }
    case 'error':   return { color: 'var(--red)', label: 'error' }
    default:        return { color: 'var(--text-dim)', label: 'done' }
  }
}

function ToolBlock({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const [linesExpanded, setLinesExpanded] = useState(false)
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
  const displayLines = linesExpanded || !overflow ? lines : lines.slice(0, MAX_PREVIEW)
  const inputInfo = formatToolInput(tool.name, tool.input)
  const ts = toolStyle(tool.name)
  const ss = statusStyle(tool.status)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (tool.output) {
      navigator.clipboard.writeText(tool.output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const header = (
    <button
      className="flex items-center gap-2 min-w-0 w-full cursor-pointer text-left"
      onClick={() => setOpen(!open)}
    >
      <IconChevronDown
        size={10}
        className="transition-transform duration-200"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(-90deg)' }}
      />
      <span
        className="text-[10px] font-semibold shrink-0 rounded px-1.5 py-0.5 border"
        style={{ color: ts.color, borderColor: ts.color, fontFamily: 'var(--font-mono)' }}
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
        className="text-[10px] font-semibold uppercase tracking-[0.04em] shrink-0 ml-auto"
        style={{ color: ss.color }}
      >
        {ss.label}
      </span>
    </button>
  )

  return (
    <MsgBlock header={header} background="var(--bg-sidebar)">
      {open && hasOutput && (
        <div className="relative group/output">
          <button
            className="absolute top-0 right-0 opacity-0 group-hover/output:opacity-100 transition-opacity z-10
                       text-[10px] font-semibold uppercase tracking-[0.04em] rounded px-1.5 py-0.5
                       hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{ color: 'var(--text-dim)' }}
            onClick={handleCopy}
            aria-label="Copy output"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <div
            className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap overflow-x-auto mt-1"
            style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.55 }}
          >
            {displayLines.map((line, i) => (
              <span key={i} className="block min-h-[1.55em]">
                <span
                  className="inline-block w-[2.8em] mr-[1.2em] text-right select-none shrink-0"
                  style={{ color: 'var(--text-dim)', opacity: 0.35 }}
                >
                  {i + 1}
                </span>
                <span>{isJson ? formatJsonLine(line) : line}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {open && overflow && (
        <button
          className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)] mt-2 transition-colors"
          onClick={() => setLinesExpanded(!linesExpanded)}
        >
          <IconChevronDown size={10} className={linesExpanded ? 'rotate-180' : ''} />
          {linesExpanded ? 'Collapse' : `Show all ${lines.length} lines`}
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
      {m[1]}<span style={{ color: 'var(--accent)' }}>&quot;{m[2]}&quot;</span>{m[3]}{line.slice(m[0].length)}
    </>
  )
}

/* ---- message bubble (router) ---- */

interface MessageBubbleProps {
  message: Message
  isGenerating?: boolean
}

function MessageBubble({ message, isGenerating }: MessageBubbleProps) {
  const { role, content, thinking, tools, model, duration } = message

  if (role === 'system') {
    return (
      <div className="text-center text-[var(--text-dim)] text-[12px] py-2">{content}</div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 mb-1.5">
      {role === 'user' ? (
        <div>
          <RoleLabel role="user" />
          <MsgBlock accent="var(--accent)">
            <MarkdownBlock content={content} />
          </MsgBlock>
        </div>
      ) : role === 'error' ? (
        <div>
          <RoleLabel role="error" />
          <TextBlock content={content} borderColor="var(--red)" />
        </div>
      ) : (
        <>
          <RoleLabel role="assistant" isGenerating={isGenerating} model={model} duration={duration} />
          {thinking && <ThinkingBlock content={thinking} isGenerating={isGenerating} />}
          {tools?.map((tool, i) => <ToolBlock key={i} tool={tool} />)}
          {(content || isGenerating) && (
            <MsgBlock>
              <MarkdownBlock content={content} />
            </MsgBlock>
          )}
        </>
      )}
    </div>
  )
}

export default MessageBubble
