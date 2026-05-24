import React, { useState, useMemo } from 'react'
import MarkdownBlock from './MarkdownBlock'
import { IconChevronDown } from '../Icons'
import SpawnBlock from './SpawnBlock'
import { formatTokens } from '../../lib/format'

interface ToolCall {
  id?: string
  name: string
  input: string
  output?: string
  status: 'running' | 'done' | 'error'
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'compaction' | 'subtask' | 'shell'
  content: string
  thinking?: string
  tools?: ToolCall[]
  model?: string
  duration?: number
  startedAt?: number
  compactionNum?: number
  beforeTokens?: number
  afterTokens?: number
  subtaskAgent?: string
}

/* ---- role label ---- */

const ROLE_LABEL: Record<string, { text: string; color: string }> = {
  user:      { text: 'You',       color: 'var(--text-dim)' },
  assistant: { text: 'Assistant', color: 'var(--text-dim)' },
  error:      { text: 'Error',     color: 'var(--red)' },
  compaction: { text: 'Compacted', color: 'var(--compaction)' },
  subtask:   { text: 'Subtask',   color: 'var(--subtask)' },
  shell:     { text: 'Shell',     color: 'var(--yellow)' },
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
  copyContent,
  children,
}: {
  accent?: string
  header?: React.ReactNode
  background?: string
  copyContent?: string
  children: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (copyContent) {
      navigator.clipboard.writeText(copyContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div
      className="rounded-lg px-[12px] py-[8px] w-full relative group/msg"
      style={{
        background: background || 'var(--bg-elevated)',
      }}
    >
      {copyContent && (
        <button
          className="absolute top-[3px] right-[3px] opacity-0 group-hover/msg:opacity-100 transition-opacity z-10
                     text-[10px] font-semibold uppercase tracking-[0.04em] rounded px-1.5 py-0.5
                     hover:bg-[var(--bg-hover)] cursor-pointer"
          style={{ color: 'var(--text-dim)' }}
          onClick={handleCopy}
          aria-label="Copy"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      )}
      {header && <div className={children ? 'mb-2' : ''}>{header}</div>}
      {children}
    </div>
  )
}

/* ---- thinking block ---- */

function ThinkingBlock({ content }: { content: string; isGenerating?: boolean }) {
  return (
    <MsgBlock
      background="var(--bg-card)"
      header={
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--yellow)' }}>
          Thinking
        </span>
      }
    >
      <MarkdownBlock content={content} muted />
    </MsgBlock>
  )
}

/* ---- text block (error) ---- */

function TextBlock({ content, borderColor }: { content: string; borderColor: string }) {
  return (
    <MsgBlock accent={borderColor} copyContent={content}>
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
  bash:   { color: 'var(--yellow)' },
  file:   { color: 'var(--blue)' },
  grep:   { color: 'var(--green)' },
  glob:   { color: 'var(--purple)' },
  write:  { color: 'var(--orange)' },
  edit:   { color: 'var(--orange)' },
  default:{ color: 'var(--green)' },
}

function toolStyle(name: string) {
  return TOOL_STYLES[name] || TOOL_STYLES.default
}

function statusStyle(status: string): { color: string; label: string } {
  switch (status) {
    case 'running': return { color: 'var(--yellow)', label: 'running' }
    case 'error':   return { color: 'var(--red)', label: 'error' }
    default:        return { color: 'var(--text-dim)', label: 'done' }
  }
}

function ToolBlock({ tool }: { tool: ToolCall }) {
  const [linesExpanded, setLinesExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [inputCopied, setInputCopied] = useState(false)

  const isRunning = tool.status === 'running'

  const isJson = useMemo(() => {
    if (!tool.output || isRunning) return false
    try { JSON.parse(tool.output); return true } catch { return false }
  }, [tool.output, isRunning])

  const formattedInput = useMemo(() => {
    if (!tool.input || isRunning) return tool.input || ''
    try { return JSON.stringify(JSON.parse(tool.input), null, 2) } catch { return tool.input }
  }, [tool.input, isRunning])

  const formattedOutput = useMemo(() => {
    if (!tool.output || isRunning) return tool.output || ''
    return isJson ? JSON.stringify(JSON.parse(tool.output), null, 2) : tool.output
  }, [tool.output, isJson, isRunning])

  const inputLines = formattedInput.split('\n')
  const outputLines = formattedOutput.split('\n')
  const hasInput = inputLines.length > 1 || (inputLines.length === 1 && inputLines[0])
  const hasOutput = outputLines.length > 1 || (outputLines.length === 1 && outputLines[0])
  const MAX_PREVIEW = 12
  const overflow = outputLines.length > MAX_PREVIEW
  const displayLines = linesExpanded || !overflow ? outputLines : outputLines.slice(-MAX_PREVIEW)
  const lineOffset = linesExpanded || !overflow ? 0 : Math.max(0, outputLines.length - MAX_PREVIEW)
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

  const handleInputCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (tool.input) {
      navigator.clipboard.writeText(tool.input)
      setInputCopied(true)
      setTimeout(() => setInputCopied(false), 1500)
    }
  }

  const header = (
    <div className="flex items-center gap-2 min-w-0 w-full text-left">
      <span
        className="text-[10px] font-semibold shrink-0 rounded px-1.5 py-0.5"
        style={{ color: ts.color, fontFamily: 'var(--font-mono)' }}
      >
        {tool.name}
      </span>
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.04em] shrink-0 ml-auto"
        style={{ color: ss.color }}
      >
        {ss.label}
      </span>
    </div>
  )

  return (
    <MsgBlock header={header} background="var(--bg-sidebar)">
      {hasInput && (
        <div className="mb-2 relative group/input">
          <button
            className="absolute top-0 right-0 opacity-0 group-hover/input:opacity-100 transition-opacity z-10
                       text-[10px] font-semibold uppercase tracking-[0.04em] rounded px-1.5 py-0.5
                       hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{ color: 'var(--text-dim)' }}
            onClick={handleInputCopy}
            aria-label="Copy input"
          >
            {inputCopied ? 'Copied' : 'Copy'}
          </button>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.04em] mb-1"
            style={{ color: 'var(--text-dim)' }}
          >
            Input
          </div>
          <div
            className="text-[13px] text-[var(--text-dim)] whitespace-pre overflow-x-auto"
            style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.55 }}
          >
            {inputLines.map((line, i) => (
              <span key={i} className="block min-h-[1.55em]">
                <span
                  className="inline-block w-[2.8em] mr-[1.2em] text-right select-none shrink-0"
                  style={{ color: 'var(--text-dim)', opacity: 0.35 }}
                >
                  {i + 1}
                </span>
                <span>{formatJsonLine(line)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {hasOutput && (
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
          {hasInput && (
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.04em] mb-1"
              style={{ color: 'var(--text-dim)' }}
            >
              Output
            </div>
          )}
          <div
            className="text-[13px] text-[var(--text-secondary)] whitespace-pre overflow-x-auto mt-1"
            style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.55 }}
          >
            {displayLines.map((line, i) => (
              <span key={i} className="block min-h-[1.55em]">
                <span
                  className="inline-block w-[2.8em] mr-[1.2em] text-right select-none shrink-0"
                  style={{ color: 'var(--text-dim)', opacity: 0.35 }}
                >
                  {i + 1 + lineOffset}
                </span>
                <span>{isJson ? formatJsonLine(line) : formatPlainLine(line, tool.name)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {overflow && (
        <button
          className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)] mt-2 transition-colors"
          onClick={() => setLinesExpanded(!linesExpanded)}
        >
          <IconChevronDown size={10} className={linesExpanded ? 'rotate-180' : ''} />
          {linesExpanded ? 'Collapse' : `Show all ${outputLines.length} lines`}
        </button>
      )}
    </MsgBlock>
  )
}

const JSON_KEY_RE = /^(\s*)\"([^\"]+)\"(\s*:\s*)(.*)$/
function formatJsonLine(line: string): React.ReactNode {
  const m = line.match(JSON_KEY_RE)
  if (!m) return <JsonValue line={line} />
  return (
    <>
      {m[1]}<span style={{ color: 'var(--blue)' }}>&quot;{m[2]}&quot;</span>{m[3]}<JsonValue value={m[4]} />
    </>
  )
}


function JsonValue({ value, line }: { value?: string; line?: string }) {
  const s = (value ?? line ?? '').trimEnd()
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < s.length) {
    if (s[i] === '"') {
      const end = findStrEnd(s, i + 1)
      nodes.push(<span key={i} style={{ color: 'var(--green)' }}>{s.slice(i, end + 1)}</span>)
      i = end + 1
      continue
    }
    const numMatch = s.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (numMatch && (s[i] === '-' || (s[i] >= '0' && s[i] <= '9'))) {
      nodes.push(<span key={i} style={{ color: 'var(--orange)' }}>{numMatch[0]}</span>)
      i += numMatch[0].length
      continue
    }
    const wordMatch = s.slice(i).match(/^(true|false|null)\b/)
    if (wordMatch) {
      nodes.push(<span key={i} style={{ color: 'var(--purple)' }}>{wordMatch[0]}</span>)
      i += wordMatch[0].length
      continue
    }
    if ('{}[]'.includes(s[i])) {
      nodes.push(<span key={i} style={{ color: 'var(--text-dim)' }}>{s[i]}</span>)
      i++
      continue
    }
    if (s[i] === ',') {
      nodes.push(<span key={i} style={{ color: 'var(--text-dim)' }}>,</span>)
      i++
      continue
    }
    nodes.push(s[i])
    i++
  }

  return <>{nodes}</>
}

function findStrEnd(s: string, start: number): number {
  for (let i = start; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue }
    if (s[i] === '"') return i
  }
  return s.length - 1
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function formatPlainLine(line: string, toolName: string): React.ReactNode {
  const clean = stripAnsi(line)

  if (toolName === 'grep') {
    const grepMatch = clean.match(/^([\w.\-/\\]+):(\d+):(.*)$/)
    if (grepMatch) {
      return (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>{grepMatch[1]}</span>
          <span style={{ color: 'var(--text-dim)', opacity: 0.6 }}>:{grepMatch[2]}:</span>
          <span style={{ color: 'var(--text-primary)' }}>{grepMatch[3]}</span>
        </>
      )
    }
  }

  return clean
}

/* ---- compaction card ---- */

function CompactionCard({ message }: { message: Message }) {
  const [open, setOpen] = useState(true)

  const beforeStr = message.beforeTokens ? formatTokens(message.beforeTokens) : ''
  const afterStr = message.afterTokens ? formatTokens(message.afterTokens) : ''
  const reduction = message.beforeTokens && message.afterTokens
    ? Math.round((1 - message.afterTokens / message.beforeTokens) * 100)
    : 0

  return (
    <MsgBlock
      accent="var(--compaction)"
      background="var(--bg-card)"
      header={
        <button
          className="flex items-center gap-1.5 cursor-pointer w-full text-left"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse compaction summary' : 'Expand compaction summary'}
        >
          <IconChevronDown
            size={10}
            className="transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(-90deg)', color: 'var(--compaction)' }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--compaction)' }}>
            Conversation Compacted
          </span>
          {message.compactionNum != null && message.compactionNum > 1 && (
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
              #{message.compactionNum}
            </span>
          )}
          <span className="text-[10px] ml-auto" style={{ color: 'var(--text-dim)' }}>
            {beforeStr} → {afterStr}
            {reduction > 0 && ` (-${reduction}%)`}
          </span>
        </button>
      }
    >
      {open && <MarkdownBlock content={message.content} muted />}
    </MsgBlock>
  )
}

/* ---- message bubble (router) ---- */

interface MessageBubbleProps {
  message: Message
  isGenerating?: boolean
}

function MessageBubble({ message, isGenerating }: MessageBubbleProps) {
  const { role, content, thinking, tools, model, duration, subtaskAgent } = message

  if (role === 'shell') {
    return (
      <div className="flex flex-col gap-1.5 mb-1.5">
        <RoleLabel role="shell" />
        <MsgBlock accent="var(--yellow)" copyContent={content}>
          <div
            className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap leading-[1.6]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {content}
          </div>
        </MsgBlock>
      </div>
    )
  }

  if (role === 'subtask') {
    return (
      <div className="flex flex-col gap-1.5 mb-1.5">
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1 select-none flex items-center gap-1.5"
          style={{ color: 'var(--subtask)' }}
        >
          <span>Subtask</span>
          {subtaskAgent && (
            <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              · {subtaskAgent} agent
            </span>
          )}
        </div>
        <MsgBlock accent="var(--subtask)" copyContent={content}>
          <div className="text-[13px] text-[var(--text-dim)]">{content}</div>
        </MsgBlock>
      </div>
    )
  }

  if (role === 'compaction') {
    return (
      <div className="flex flex-col gap-1.5 mb-1.5">
        <RoleLabel role="compaction" />
        <CompactionCard message={message} />
      </div>
    )
  }

  if (role === 'system') {
    return (
      <div className="text-center text-[var(--text-dim)] text-[12px] py-2">{content}</div>
    )
  }

  const hasSpawnAgent = tools?.some(t => t.name === 'spawn_agent')

  return (
    <div className="flex flex-col gap-1.5 mb-1.5">
      {role === 'user' ? (
        <div>
          <RoleLabel role="user" />
          <MsgBlock accent="var(--accent)" copyContent={content}>
            <div className="text-[14px] text-[var(--text-primary)] whitespace-pre-wrap leading-[1.7]" style={{ wordBreak: 'break-word' }}>
              {content}
            </div>
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

          {content && (
            <MsgBlock copyContent={content}>
              <MarkdownBlock content={content} streaming={isGenerating} />
            </MsgBlock>
          )}

          {tools?.map((tool, i) =>
            tool.name === 'spawn_agent' ? (
              <SpawnBlock key={i} tool={tool} model={model} duration={duration} />
            ) : (
              <ToolBlock key={i} tool={tool} />
            )
          )}

          {/* "view subagents" hint — matches preview HTML */}
          {hasSpawnAgent && (
            <div className="text-[10px] text-[var(--text-dim)] pl-3 flex items-center gap-1.5">
              <span
                className="text-[9px] font-mono px-1 py-0.5 rounded"
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}
              >
                click card →
              </span>
              view subagents
            </div>
          )}
          {isGenerating && !content && !thinking && (!tools || tools.length === 0) && (
            <MsgBlock>
              <span className="text-[13px] text-[var(--text-dim)]">Thinking...</span>
            </MsgBlock>
          )}
        </>
      )}
    </div>
  )
}

export default React.memo(MessageBubble)
