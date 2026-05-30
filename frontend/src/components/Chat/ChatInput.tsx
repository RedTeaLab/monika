import { useState, useEffect, useRef, useCallback } from 'react'
import { MentionsInput, Mention, SuggestionDataItem } from 'react-mentions'
import { useStore } from '../../store'
import { formatTokens } from '../../lib/format'
import ModelPicker from './ModelPicker'
import PermissionModePicker from './PermissionModePicker'
import { App } from '../../../bindings/monika'
import { Call } from '@wailsio/runtime'

const INIT_TEMPLATE = `Please analyze this project and create an \`agent.md\` file in the project root. The file should contain:

1. Build, test, and run commands specific to this project
2. Project structure overview (key directories and their purposes)
3. Coding conventions and patterns used
4. Framework and library specifics

First, explore the codebase to understand the project, then create the agent.md file with compact, actionable information. Every line should answer "would an agent likely miss this without help?"`

interface FileEntry { name: string; path: string; is_dir: boolean; children?: FileEntry[] }

function flattenFiles(nodes: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = []
  for (const n of nodes) {
    result.push(n)
    if (n.is_dir && n.children) result.push(...flattenFiles(n.children))
  }
  return result
}

function loadHistory(): string[] {
  try {
    const stored = localStorage.getItem('monika-cmd-history')
    return stored ? (JSON.parse(stored as string) as string[]) : []
  } catch { return [] }
}

const INITIAL_HISTORY = loadHistory()

interface PasteChip {
  id: string
  display: string
  text: string
  type: 'paste-path' | 'paste-text'
}

/** Convert react-mentions markup value to plain text for submission. */
function markupToPlainText(value: string): string {
  return value
    // /[display](id) → /id
    .replace(/\/\[([^\]]*)\]\(([^)]*)\)/g, (_m, _d, id) => '/' + id)
    // @[display](id) → @id
    .replace(/@\[([^\]]*)\]\(([^)]*)\)/g, (_m, _d, id) => '@' + id)
    // $[display](id) → $id
    .replace(/\$\[([^\]]*)\]\(([^)]*)\)/g, (_m, _d, id) => '$' + id)
}

// ── Extended suggestion items (extra props for custom rendering) ──

interface ExtSuggestion extends SuggestionDataItem {
  detail?: string
  icon?: string
}

function SuggestionRenderer(
  suggestion: SuggestionDataItem,
  _search: string,
  highlightedDisplay: React.ReactNode,
  _index: number,
  focused: boolean,
) {
  const item = suggestion as ExtSuggestion
  return (
    <div
      className="flex items-start gap-2 w-full"
      style={{
        padding: '6px 12px',
        background: focused ? 'var(--bg-active)' : 'transparent',
        minHeight: 36,
      }}
    >
      {item.icon && (
        <span className="shrink-0 w-4 text-center text-[11px] mt-px" style={{ color: 'var(--text-dim)' }}>
          {item.icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="truncate text-[13px]" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {highlightedDisplay}
        </div>
        {item.detail && (
          <div className="truncate text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {item.detail}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Mirror div helpers for cursor line tracking ──

let mirrorCache: HTMLDivElement | null = null

function getCursorLineInfo(textarea: HTMLTextAreaElement, value: string): { currentLine: number; totalLines: number } {
  if (!value) return { currentLine: 1, totalLines: 1 }

  const cursor = textarea.selectionStart
  let mirror = mirrorCache
  if (!mirror || mirror.parentNode !== document.body) {
    mirror = document.createElement('div')
    mirrorCache = mirror
    const cs = getComputedStyle(textarea)
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = 'break-word'
    mirror.style.wordWrap = 'break-word'
    mirror.style.width = cs.width
    mirror.style.boxSizing = cs.boxSizing
    mirror.style.paddingTop = cs.paddingTop
    mirror.style.paddingBottom = cs.paddingBottom
    mirror.style.paddingLeft = cs.paddingLeft
    mirror.style.paddingRight = cs.paddingRight
    mirror.style.fontFamily = cs.fontFamily
    mirror.style.fontSize = cs.fontSize
    mirror.style.fontWeight = cs.fontWeight
    mirror.style.lineHeight = cs.lineHeight
    mirror.style.letterSpacing = cs.letterSpacing
    mirror.style.wordSpacing = cs.wordSpacing
    mirror.style.tabSize = cs.tabSize
    document.body.appendChild(mirror)
  }

  const lh = parseFloat(mirror.style.lineHeight) || parseFloat(mirror.style.fontSize) * 1.2
  const padV = parseFloat(mirror.style.paddingTop) + parseFloat(mirror.style.paddingBottom)
  const marker = '\u200b'

  mirror.textContent = value + marker
  const totalContent = mirror.clientHeight - padV

  mirror.textContent = value.slice(0, cursor) + marker
  const cursorContent = mirror.clientHeight - padV

  return {
    currentLine: Math.max(1, Math.round(cursorContent / lh)),
    totalLines: Math.max(1, Math.round(totalContent / lh)),
  }
}

// ── Component ──

function ChatInput({ onSend, onStop, onRunShell, disabled }: {
  onSend: (text: string) => void
  onStop: () => void
  onRunShell: (command: string) => void
  disabled: boolean
}) {
  // value = markup string (e.g. "hello @[file.ts](/path/to/file.ts) world")
  const [value, setValue] = useState('')
  const [plainText, setPlainText] = useState('')
  const [pasteChips, setPasteChips] = useState<PasteChip[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionTokens = useStore((s) => s.sessionTokens)
  const tokens = sessionTokens[activeSessionId] || { count: 0, max: 0 }
  const tokenCount = tokens.count
  const tokenMax = tokens.max

  const projectPath = useStore((s) => s.projectPath)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const selectedModel = useStore((s) => s.selectedModel)
  const historyRef = useRef<string[]>(INITIAL_HISTORY)
  const historyIndexRef = useRef(-1)
  const navigatingHistoryRef = useRef(false)
  const sessionIdRef = useRef(activeSessionId)
  sessionIdRef.current = activeSessionId

  // Reset history index when user types manually
  useEffect(() => {
    if (!navigatingHistoryRef.current) {
      historyIndexRef.current = -1
    }
    navigatingHistoryRef.current = false
  }, [value])

  // Reset history index when switching sessions
  useEffect(() => {
    historyIndexRef.current = -1
  }, [activeSessionId])

  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  const prevDisabledRef = useRef(disabled)

  // ESC to stop generation
  useEffect(() => {
    if (!disabled) return
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onStopRef.current()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [disabled])

  // Auto-focus when generation completes
  useEffect(() => {
    const wasDisabled = prevDisabledRef.current
    prevDisabledRef.current = disabled
    if (wasDisabled && !disabled) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [disabled])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = el.scrollHeight
    if (h > 0) el.style.height = `${Math.min(h, 300)}px`
  }, [value])

  // Focus on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.style.height = 'auto'
      const h = el.scrollHeight
      el.style.height = h > 0 ? `${Math.min(h, 300)}px` : ''
      if (!disabled) el.focus()
    })
    return () => cancelAnimationFrame(timer)
  }, [])

  // ── Data loaders for each mention trigger ──

  const loadCommands = useCallback(async (query: string, callback: (items: SuggestionDataItem[]) => void) => {
    const lq = query.toLowerCase()
    let skills: any[] = []
    try {
      skills = await Call.ByName('monika/internal/api.App.ListSkills') || []
    } catch { /* ignore */ }

    const allItems: ExtSuggestion[] = [
      { id: 'init', display: 'init', detail: 'Create agent.md from project analysis', icon: '/' },
      { id: 'compact', display: 'compact', detail: 'Manually trigger context compaction', icon: '/' },
      ...skills.filter((sk: any) => sk.enabled !== false).map((sk: any) => ({
        id: sk.name || sk.Name || '',
        display: sk.name || sk.Name || '',
        detail: sk.description || sk.Description || '',
        icon: '/',
      })),
    ]
    callback(allItems.filter(c => String(c.id).toLowerCase().startsWith(lq)))
  }, [])

  const loadFiles = useCallback(async (query: string, callback: (items: SuggestionDataItem[]) => void) => {
    if (!projectPath) { callback([]); return }
    const lq = query.toLowerCase()
    const files = await App.ListFileTree(projectPath, false)
      .then(r => flattenFiles(r as FileEntry[]))
      .catch(() => [] as FileEntry[])

    const items: ExtSuggestion[] = (files || [])
      .filter(f => f.path.toLowerCase().includes(lq) || f.name.toLowerCase().includes(lq))
      .slice(0, 15)
      .map(f => ({
        id: f.path,
        display: f.name,
        detail: f.is_dir ? 'directory' : 'file',
        icon: f.is_dir ? '▸' : '▹',
      }))
    callback(items)
  }, [projectPath])

  const loadShell = useCallback(async (query: string, callback: (items: SuggestionDataItem[]) => void) => {
    const lq = query.toLowerCase()

    const histItems: ExtSuggestion[] = historyRef.current
      .filter(h => h.toLowerCase().startsWith(lq))
      .slice(0, 5)
      .map(h => ({ id: h, display: h, detail: 'history', icon: '⏎' }))

    const files = projectPath
      ? await App.ListFileTree(projectPath, false)
          .then(r => flattenFiles(r as FileEntry[]))
          .catch(() => [] as FileEntry[])
      : []

    const fileItems: ExtSuggestion[] = (files || [])
      .filter(f => f.name.toLowerCase().startsWith(lq))
      .slice(0, 15)
      .map(f => ({
        id: f.path,
        display: f.name,
        detail: f.is_dir ? 'directory' : 'file',
        icon: f.is_dir ? '▸' : '▹',
      }))

    const seen = new Set(histItems.map(h => h.id))
    callback([...histItems, ...fileItems.filter(f => !seen.has(f.id))])
  }, [projectPath])

  // ── Paste handling ──

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text/plain')
    if (!pasted) return

    const looksLikePath = (/\.\w{1,10}$/.test(pasted) || /^[/\\]/.test(pasted) || /^[A-Za-z]:[\\/]/.test(pasted))
      && !pasted.includes('\n')
      && pasted.length < 500

    if (looksLikePath) {
      e.preventDefault()
      const filename = pasted.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || pasted
      setPasteChips(prev => [...prev, {
        id: crypto.randomUUID(),
        display: filename,
        text: pasted,
        type: 'paste-path',
      }])
      return
    }

    if (pasted.length > 100) {
      e.preventDefault()
      setPasteChips(prev => [...prev, {
        id: crypto.randomUUID(),
        display: `Paste ${pasted.length}`,
        text: pasted,
        type: 'paste-text',
      }])
    }
  }

  // ── Submit logic ──

  const handleSubmit = useCallback(() => {
    const pt = plainText.trim()
    if ((!pt && pasteChips.length === 0) || disabled) return
    historyIndexRef.current = -1

    // Convert markup to plain text and combine with paste chips
    const converted = markupToPlainText(value)
    const chipsText = pasteChips.map(c => c.text).join(' ')
    const fullText = (chipsText + ' ' + converted).trim()
    const clearInput = () => { setValue(''); setPlainText(''); setPasteChips([]) }

    // $ shell command
    if (fullText.startsWith('$')) {
      const command = fullText.slice(1).trim()
      if (!command) { onSend(fullText); clearInput(); return }
      const h = historyRef.current.filter(c => c !== command)
      const updated = [command, ...h].slice(0, 50)
      historyRef.current = updated
      try { localStorage.setItem('monika-cmd-history', JSON.stringify(updated)) } catch { /* ignore */ }
      onRunShell(command)
      clearInput()
      return
    }

    // /init command
    if (fullText === '/init') {
      onSend(INIT_TEMPLATE)
      clearInput()
      return
    }

    // /compact command
    if (fullText === '/compact') {
      if (!projectPath || !activeSessionId || !selectedProvider || !selectedModel) return
      clearInput()
      const store = useStore.getState()
      store.addGeneratingSession(activeSessionId)
      store.setSessionStatus(activeSessionId, 'compacting')
      store.appendToSession(activeSessionId, [{ id: crypto.randomUUID(), role: 'compaction', content: '' }])
      App.TriggerCompact(projectPath, activeSessionId, selectedProvider, selectedModel).catch((err: unknown) => {
        const s = useStore.getState()
        s.fillCompactionCard(activeSessionId, { summary: String(err), beforeTokens: 0, afterTokens: 0, compactionNum: 0 })
        s.removeGeneratingSession(activeSessionId)
        s.setSessionStatus(activeSessionId, 'pending')
      })
      return
    }

    // /skill-name command
    if (fullText.startsWith('/') && fullText.length > 1 && !fullText.includes(' ')) {
      const skillName = fullText.slice(1)
      const skill = useStore.getState().skills.find((s: any) => (s.name || s.Name) === skillName)
      if (skill) {
        onSend(`Use the skill tool to load the "${skillName}" skill, then follow its instructions.`)
        clearInput()
        return
      }
    }

    // Normal message
    onSend(fullText)
    clearInput()
  }, [value, plainText, pasteChips, disabled, projectPath, activeSessionId, selectedProvider, selectedModel, onSend, onRunShell])

  // ── Keyboard handling ──

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    // If suggestions are open, let react-mentions handle Tab/Enter/Escape/Arrow
    const suggestionsEl = document.querySelector('.chat-mentions__suggestions')
    const suggestionsOpen = suggestionsEl ? suggestionsEl.childElementCount > 0 : false

    if (suggestionsOpen) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
      return
    }

    // History navigation
    if (!disabled && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const el = inputRef.current
      if (!el) return
      const { currentLine, totalLines } = getCursorLineInfo(el, plainText)

      const userMsgs = useStore.getState().sessionMessages[sessionIdRef.current]?.filter(m => m.role === 'user').map(m => m.content) || []

      if (e.key === 'ArrowUp' && currentLine === 1 && userMsgs.length > 0) {
        e.preventDefault()
        const nextIdx = historyIndexRef.current === -1
          ? userMsgs.length - 1
          : Math.max(historyIndexRef.current - 1, 0)
        if (nextIdx !== historyIndexRef.current) {
          historyIndexRef.current = nextIdx
          navigatingHistoryRef.current = true
          const msg = userMsgs[nextIdx]
          setValue(msg)
          setPlainText(msg)
          requestAnimationFrame(() => {
            const len = msg.length
            inputRef.current?.setSelectionRange(len, len)
          })
        }
      }
      if (e.key === 'ArrowDown' && currentLine === totalLines && historyIndexRef.current !== -1) {
        e.preventDefault()
        if (historyIndexRef.current < userMsgs.length - 1) {
          historyIndexRef.current += 1
          navigatingHistoryRef.current = true
          const msg = userMsgs[historyIndexRef.current]
          setValue(msg)
          setPlainText(msg)
          requestAnimationFrame(() => {
            const len = userMsgs[historyIndexRef.current].length
            inputRef.current?.setSelectionRange(len, len)
          })
        } else if (historyIndexRef.current === userMsgs.length - 1) {
          historyIndexRef.current = -1
          navigatingHistoryRef.current = true
          setValue('')
          setPlainText('')
        }
      }
    }
  }

  // ── Render ──

  const tokenText = tokenMax > 0
    ? `${formatTokens(tokenCount)} / ${formatTokens(tokenMax)}`
    : formatTokens(tokenCount)

  const canSend = plainText.trim().length > 0 || pasteChips.length > 0

  return (
    <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: 'var(--bg-sidebar)' }}>
      <div
        className="rounded-md border transition-colors relative"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Paste chips */}
        {pasteChips.length > 0 && (
          <div className="flex flex-wrap gap-[5px] px-[12px] pt-[8px]">
            {pasteChips.map(chip => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-[3px] text-[11px] rounded-[4px] px-[6px] py-[1px] select-none group"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
                  <path d="M5 1a1 1 0 00-1 1v1H3a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-1V2a1 1 0 00-1-1H5zm4 8V7H7v2H5l3 3 3-3H9z"/>
                </svg>
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chip.display}</span>
                <button
                  onClick={() => setPasteChips(prev => prev.filter(c => c.id !== chip.id))}
                  style={{
                    background: 'none', border: 'none', color: 'inherit',
                    cursor: 'pointer', padding: '0 1px', lineHeight: 1,
                    opacity: 0.4, fontSize: '10px',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* MentionsInput */}
        <MentionsInput
          className="chat-mentions"
          value={value}
          onChange={(_e, newValue, newPlainText) => {
            setValue(newValue)
            setPlainText(newPlainText)
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={
            disabled ? 'Generating...'
            : 'Send a message... (/ commands, @ files, $ shell, Enter to submit)'
          }
          inputRef={inputRef}
          allowSpaceInQuery
          forceSuggestionsAboveCursor
          rows={4}
        >
          <Mention
            trigger="/"
            data={loadCommands}
            markup="/[__display__](__id__)"
            displayTransform={(_id, display) => '/' + display}
            renderSuggestion={SuggestionRenderer}
            appendSpaceOnAdd
            className="chat-mentions__mention"
          />
          <Mention
            trigger="@"
            data={loadFiles}
            markup="@[__display__](__id__)"
            displayTransform={(_id, display) => '@' + display}
            renderSuggestion={SuggestionRenderer}
            appendSpaceOnAdd
            className="chat-mentions__mention"
          />
          <Mention
            trigger="$"
            data={loadShell}
            markup="$[__display__](__id__)"
            displayTransform={(_id, display) => '$' + display}
            renderSuggestion={SuggestionRenderer}
            appendSpaceOnAdd
            className="chat-mentions__mention"
          />
        </MentionsInput>

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-[10px] pb-[8px]"
          style={{ background: 'transparent' }}
        >
          <PermissionModePicker />
          <ModelPicker />

          <span className="text-[11px] text-[var(--text-dim)] select-none" style={{ fontFeatureSettings: '"tnum"' }}>
            tok: {tokenText}
          </span>

          <div className="flex-1" />

          {disabled ? (
            <button
              onClick={onStop}
              title="Stop generating (Esc)"
              style={{
                width: '28px', height: '28px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px', border: 'none', background: 'none',
                color: 'var(--accent)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="1" y="1" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSend}
              title="Send message (Enter)"
              style={{
                width: '28px', height: '28px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px', border: 'none', background: 'none',
                color: canSend ? 'var(--accent)' : 'var(--text-dim)',
                cursor: canSend ? 'pointer' : 'default',
                opacity: canSend ? 1 : 0.4,
                transition: 'color 0.15s, opacity 0.15s',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8l12-6-5 12-2-6z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInput
