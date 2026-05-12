import { useState, KeyboardEvent, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { formatTokens } from '../../lib/format'
import ModelPicker from './ModelPicker'
import PermissionModePicker from './PermissionModePicker'
import AutocompleteDropdown, { AcItem, AcState } from './AutocompleteDropdown'
import { App } from '../../../bindings/monika'

const INIT_TEMPLATE = `Please analyze this project and create an \`agent.md\` file in the project root. The file should contain:

1. Build, test, and run commands specific to this project
2. Project structure overview (key directories and their purposes)
3. Coding conventions and patterns used
4. Framework and library specifics

First, explore the codebase to understand the project, then create the agent.md file with compact, actionable information. Every line should answer "would an agent likely miss this without help?"`

function loadHistory(): string[] {
  try {
    const stored = localStorage.getItem('monika-cmd-history')
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch { return [] }
}

const INITIAL_HISTORY = loadHistory()

function ChatInput({ onSend, onStop, onRunShell, disabled, compacting }: {
  onSend: (text: string) => void
  onStop: () => void
  onRunShell: (command: string) => void
  disabled: boolean
  compacting: boolean
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionTokens = useStore((s) => s.sessionTokens)
  const tokens = sessionTokens[activeSessionId] || { count: 0, max: 0 }
  const tokenCount = tokens.count
  const tokenMax = tokens.max

  const [ac, setAc] = useState<AcState>({ open: false, items: [], selectedIdx: 0, prefix: '' })
  const acDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectPath = useStore((s) => s.projectPath)
  const historyRef = useRef<string[]>(INITIAL_HISTORY)

  // Stable ref for onStop to avoid re-registering ESC listener every render
  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  // ESC key to stop generation
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

  // Auto-resize textarea after value changes
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
  }

  const COMMANDS: AcItem[] = [
    { name: 'init', detail: 'Create agent.md from project analysis', icon: '/', insert: '/init ' },
  ]

  const getQueryAtCursor = (): { prefix: string; query: string } | null => {
    const el = textareaRef.current
    if (!el) return null
    const cursor = el.selectionStart
    const text = value.slice(0, cursor)

    // $ at line start or after space
    const dollarMatch = text.match(/(?:^|\s)(\$)([^\s]*)$/)
    if (dollarMatch) return { prefix: '$', query: dollarMatch[2] }

    // @ anywhere
    const atMatch = text.match(/@([^\s]*)$/)
    if (atMatch) return { prefix: '@', query: atMatch[1] }

    // / at line start
    const slashMatch = text.match(/^\/([^\s]*)$/)
    if (slashMatch) return { prefix: '/', query: slashMatch[1] }

    return null
  }

  const fetchAutocomplete = useCallback(async (prefix: string, query: string) => {
    let items: AcItem[] = []
    const lq = query.toLowerCase()

    if (prefix === '/') {
      items = COMMANDS.filter(c => c.name.toLowerCase().startsWith(lq))
    } else if (prefix === '$') {
      const [commands, files] = await Promise.all([
        App.ListSystemCommands(query).catch(() => [] as string[]),
        projectPath ? App.ListFileTree(projectPath).catch(() => [] as { name: string; path: string; is_dir: boolean }[]) : Promise.resolve([]),
      ])

      const histItems: AcItem[] = historyRef.current
        .filter(h => h.toLowerCase().startsWith(lq))
        .slice(0, 5)
        .map(h => ({ name: h, detail: 'history', icon: '⏎', insert: `$${h} ` }))

      const cmdItems: AcItem[] = (commands || [])
        .filter(c => c.toLowerCase().startsWith(lq))
        .map(c => ({ name: c, detail: 'command', icon: '>', insert: `$${c} ` }))

      const fileItems: AcItem[] = (files || [])
        .filter(f => f.name.toLowerCase().startsWith(lq))
        .slice(0, 15)
        .map(f => ({
          name: f.name,
          detail: f.is_dir ? 'directory' : 'file',
          icon: f.is_dir ? '▸' : '▹',
          insert: `$${f.path} `,
        }))

      const seen = new Set(histItems.map(h => h.name))
      items = [...histItems, ...cmdItems.filter(c => !seen.has(c.name)), ...fileItems]
    } else if (prefix === '@') {
      const files = projectPath
        ? await App.ListFileTree(projectPath).catch(() => [] as { name: string; path: string; is_dir: boolean }[])
        : []
      items = (files || [])
        .filter(f => f.path.toLowerCase().includes(lq) || f.name.toLowerCase().includes(lq))
        .slice(0, 15)
        .map(f => ({
          name: f.path,
          detail: f.is_dir ? 'directory' : 'file',
          icon: f.is_dir ? '▸' : '▹',
          insert: f.is_dir ? `@${f.path}/` : f.path,
        }))
    }

    setAc({ open: true, items, selectedIdx: 0, prefix })
  }, [projectPath])

  const updateAutocomplete = useCallback(() => {
    const match = getQueryAtCursor()
    if (!match) {
      setAc(s => s.open ? { ...s, open: false } : s)
      return
    }
    if (acDebounceRef.current) clearTimeout(acDebounceRef.current)
    acDebounceRef.current = setTimeout(() => {
      fetchAutocomplete(match.prefix, match.query)
    }, 300)
  }, [value, fetchAutocomplete])

  useEffect(() => {
    updateAutocomplete()
  }, [value, updateAutocomplete])

  const selectAcItem = (item: AcItem) => {
    const match = getQueryAtCursor()
    if (!match) return

    const el = textareaRef.current!
    const cursor = el.selectionStart
    const replaceStart = cursor - match.prefix.length - match.query.length
    const newText = value.slice(0, replaceStart) + item.insert + value.slice(cursor)
    setValue(newText)
    // For @ directory drill-down: keep autocomplete open to browse deeper
    if (match.prefix === '@' && item.detail === 'directory') {
      requestAnimationFrame(() => {
        const pos = replaceStart + item.insert.length
        el.setSelectionRange(pos, pos)
        el.focus()
      })
      return
    }
    setAc({ open: false, items: [], selectedIdx: 0, prefix: '' })
    requestAnimationFrame(() => {
      const pos = replaceStart + item.insert.length
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }

  const closeAutocomplete = useCallback(() => {
    setAc(s => ({ ...s, open: false }))
  }, [])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled || compacting) return

    // $ shell command
    if (trimmed.startsWith('$')) {
      const command = trimmed.slice(1).trim()
      if (!command) { onSend(trimmed); setValue(''); return }
      // Record in history (deduped, keep last 50, persist)
      const h = historyRef.current.filter(c => c !== command)
      const updated = [command, ...h].slice(0, 50)
      historyRef.current = updated
      try { localStorage.setItem('monika-cmd-history', JSON.stringify(updated)) } catch { /* ignore */ }
      onRunShell(command)
      setValue('')
      return
    }

    // /init command
    if (trimmed === '/init') {
      onSend(INIT_TEMPLATE)
      setValue('')
      return
    }

    // Normal message
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (ac.open && ac.items.length > 0) {
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const item = ac.items[ac.selectedIdx]
        if (item) { selectAcItem(item) }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAc(s => ({ ...s, selectedIdx: Math.min(s.selectedIdx + 1, s.items.length - 1) }))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAc(s => ({ ...s, selectedIdx: Math.max(s.selectedIdx - 1, 0) }))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAutocomplete()
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSendClick = () => {
    handleSubmit()
  }

  const tokenText = tokenMax > 0
    ? `${formatTokens(tokenCount)} / ${formatTokens(tokenMax)}`
    : formatTokens(tokenCount)

  return (
    <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: 'var(--bg-sidebar)' }}>
      <div
        className="rounded-md border transition-colors relative"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <AutocompleteDropdown
          state={ac}
          onSelect={selectAcItem}
          onClose={closeAutocomplete}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || compacting}
          placeholder={
            compacting ? 'Compacting...'
            : disabled ? 'Generating...'
            : 'Send a message... (Enter to submit, Shift+Enter for newline)'
          }
          className="text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none px-[14px] pt-[10px] pb-[2px] resize-none w-full bg-transparent"
          rows={2}
        />

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
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="1" y="1" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSendClick}
              disabled={!value.trim()}
              title="Send message (Enter)"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: 'none',
                color: value.trim() ? 'var(--accent)' : 'var(--text-dim)',
                cursor: value.trim() ? 'pointer' : 'default',
                opacity: value.trim() ? 1 : 0.4,
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
