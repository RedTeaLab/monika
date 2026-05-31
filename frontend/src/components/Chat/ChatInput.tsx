import { useState, KeyboardEvent, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { formatTokens } from '../../lib/format'
import ModelPicker from './ModelPicker'
import PermissionModePicker from './PermissionModePicker'
import AutocompleteDropdown, { AcItem, AcState } from './AutocompleteDropdown'
import LabelChip, { findLabels, segmentText } from './LabelChip'
import { App } from '../../../bindings/monika'
import { Call } from '@wailsio/runtime'
import { IconMaximize, IconSend } from '../Icons'

const INIT_TEMPLATE = `Please analyze this project and check if an \`AGENTS.md\` file exists in the project root.

- If AGENTS.md does NOT exist, create one with compact, actionable information. Every line should answer: "would an agent likely miss this without help?"
- If AGENTS.md already EXISTS, read it first, then update/improve it based on your analysis.

The file should contain:
1. Build, test, and run commands specific to this project
2. Project structure overview (key directories and their purposes)
3. Coding conventions and patterns used
4. Framework and library specifics

First, explore the codebase to understand the project, then create or update the AGENTS.md file accordingly.`

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
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch { return [] }
}

const INITIAL_HISTORY = loadHistory()

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

function ChatInput({ onSend, onStop, onRunShell, disabled, quotedMessages }: {
  onSend: (text: string) => void
  onStop: () => void
  onRunShell: (command: string) => void
  disabled: boolean
  quotedMessages?: { id: string; role: string; content: string }[]
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const pasteStoreRef = useRef<Map<string, string>>(new Map())
  const labels = findLabels(value)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionTokens = useStore((s) => s.sessionTokens)
  const tokens = sessionTokens[activeSessionId] || { count: 0, max: 0 }
  const tokenCount = tokens.count
  const tokenMax = tokens.max

  const [ac, setAc] = useState<AcState>({ open: false, items: [], selectedIdx: 0, prefix: '' })
  const acDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // Stable ref for onStop to avoid re-registering ESC listener every render
  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  const prevDisabledRef = useRef(disabled)

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

  // Auto-focus when generation completes
  useEffect(() => {
    const wasDisabled = prevDisabledRef.current
    prevDisabledRef.current = disabled
    if (wasDisabled && !disabled) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [disabled])

  // Auto-resize textarea after value changes
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = el.scrollHeight
    if (h > 0) {
      el.style.height = `${Math.min(h, 300)}px`
    }
  }, [value])

  // Clean up paste markers that are no longer in the value
  useEffect(() => {
    const store = pasteStoreRef.current
    for (const marker of store.keys()) {
      if (!value.includes(marker)) {
        store.delete(marker)
      }
    }
  }, [value])

  // Watch for file path append request from FileTree context menu
  const appendPath = useStore((s) => s.chatInputAppendPath)
  const appendPathToInput = useStore((s) => s.appendPathToInput)
  useEffect(() => {
    if (!appendPath || !projectPath) return
    const el = textareaRef.current
    if (!el) return

    const cursor = el.selectionStart
    const prefix = value.slice(0, cursor).endsWith('@') ? '' : '@'
    const insertion = `${prefix}${appendPath} `
    const newValue = value.slice(0, cursor) + insertion + value.slice(el.selectionEnd)
    setValue(newValue)

    // Clear the pending path
    appendPathToInput('')

    requestAnimationFrame(() => {
      const pos = cursor + insertion.length
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }, [appendPath])

  // Re-calc height after layout is ready (fixes squished input on reopened sessions)
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      const h = el.scrollHeight
      el.style.height = h > 0 ? `${Math.min(h, 300)}px` : ''
      if (!disabled) {
        el.focus()
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text/plain')
    if (!pastedText) return

    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart
    const selEnd = el.selectionEnd

    // Detect code reference copy from Preview panel: [ref:path/file.go 10~15]\n<code>
    const refMatch = pastedText.match(/^\[ref:([^\]]+)\]\n/)
    if (refMatch) {
      e.preventDefault()
      const rawRef = refMatch[1] // e.g., "src/handlers/example.go 10~15"
      const code = pastedText.slice(refMatch[0].length)
      const spaceIdx = rawRef.lastIndexOf(' ')
      const fullPath = spaceIdx > 0 ? rawRef.slice(0, spaceIdx) : rawRef
      const lineRange = spaceIdx > 0 ? rawRef.slice(spaceIdx + 1) : ''
      const fileName = fullPath.replace(/^.*[/\\]/, '')
      const displayLabel = lineRange ? `[${fileName} ${lineRange}]` : `[${fileName}]`
      const resolvedLabel = lineRange ? `[${fullPath} ${lineRange}]` : `[${fullPath}]`

      // Store mapping: display label resolves to full path reference + code
      const resolvedContent = `${resolvedLabel}\n\n${code}`
      pasteStoreRef.current.set(displayLabel, resolvedContent)

      const replacement = `${displayLabel} `

      const newValue = value.slice(0, cursor) + replacement + value.slice(selEnd)
      setValue(newValue)
      requestAnimationFrame(() => {
        const pos = cursor + replacement.length
        el.setSelectionRange(pos, pos)
        el.focus()
      })
      return
    }

    // Detect if pasted text is a file path
    const trimmed = pastedText.trim()
    const isFilePath = /^[a-zA-Z]:[/\\]/.test(trimmed) || // C:\...
      /^\.\.?[/\\]/.test(trimmed) || // ./../
      (trimmed.length < 260 && (trimmed.includes('/') || trimmed.includes('\\')) && /\.[a-zA-Z0-9]{1,8}$/.test(trimmed))

    if (isFilePath) {
      e.preventDefault()
      const filename = trimmed.replace(/^.*[/\\]/, '')
      const replacement = `[${filename}] `
      pasteStoreRef.current.set(`[${filename}]`, trimmed)
      const newValue = value.slice(0, cursor) + replacement + value.slice(selEnd)
      setValue(newValue)
      requestAnimationFrame(() => {
        const pos = cursor + replacement.length
        el.setSelectionRange(pos, pos)
        el.focus()
      })
      return
    }

    if (pastedText.length > 200) {
      e.preventDefault()
      const replacement = `[Paste ${pastedText.length}] `
      pasteStoreRef.current.set(`[Paste ${pastedText.length}]`, pastedText)
      const newValue = value.slice(0, cursor) + replacement + value.slice(selEnd)
      setValue(newValue)
      requestAnimationFrame(() => {
        const pos = cursor + replacement.length
        el.setSelectionRange(pos, pos)
        el.focus()
      })
      return
    }
    // Otherwise: default paste behavior (do nothing)
  }, [value])

  /** Sync overlay scroll position with textarea */
  const syncOverlayScroll = useCallback(() => {
    const el = textareaRef.current
    const ov = overlayRef.current
    if (el && ov) {
      ov.scrollTop = el.scrollTop
      ov.scrollLeft = el.scrollLeft
    }
  }, [])

  const COMMANDS: AcItem[] = [
    { name: 'init', detail: 'Create/update AGENTS.md from project analysis', icon: '/', insert: '/init ' },
    { name: 'compact', detail: 'Manually trigger context compaction', icon: '/', insert: '/compact ' },
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
      let currentSkills: any[] = []
      try {
        currentSkills = await Call.ByName('monika/internal/api.App.ListSkills') || []
      } catch { /* ignore */ }
      const allItems = [
        ...COMMANDS,
        ...currentSkills.filter((sk: any) => sk.enabled !== false).map((sk: any) => ({
          name: sk.name || sk.Name || '',
          detail: sk.description || sk.Description || '',
          icon: '/',
          insert: `/${sk.name || sk.Name || ''} `,
        })),
      ]
      items = allItems.filter(c => c.name.toLowerCase().startsWith(lq))
    } else if (prefix === '$') {
      const histItems: AcItem[] = historyRef.current
        .filter(h => h.toLowerCase().startsWith(lq))
        .slice(0, 5)
        .map(h => ({ name: h, detail: 'history', icon: '⏎', insert: `$${h} ` }))

      const files = projectPath
        ? await App.ListFileTree(projectPath, false).then(r => flattenFiles(r as FileEntry[])).catch(() => [] as FileEntry[])
        : []

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
      items = [...histItems, ...fileItems.filter(f => !seen.has(f.name))]
    } else if (prefix === '@') {
      const files = projectPath
        ? await App.ListFileTree(projectPath, false).then(r => flattenFiles(r as FileEntry[])).catch(() => [] as FileEntry[])
        : []
      items = (files || [])
        .filter(f => f.path.toLowerCase().includes(lq) || f.name.toLowerCase().includes(lq))
        .slice(0, 15)
        .map(f => ({
          name: f.path,
          detail: f.is_dir ? 'directory' : 'file',
          icon: f.is_dir ? '▸' : '▹',
          insert: f.is_dir ? `@${f.path}/` : `@${f.path} `,
        }))
    }

    setAc({ open: true, items, selectedIdx: 0, prefix, query })
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
    if (!trimmed || disabled) return
    historyIndexRef.current = -1

    // Resolve paste/file markers to original content before sending
    let resolved = trimmed
    for (const [marker, original] of pasteStoreRef.current) {
      resolved = resolved.split(marker).join(original)
    }

    // $ shell command
    if (resolved.startsWith('$')) {
      const command = resolved.slice(1).trim()
      if (!command) { onSend(resolved); setValue(''); return }
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
    if (resolved === '/init') {
      onSend(INIT_TEMPLATE)
      setValue('')
      return
    }

    // /compact command
    if (resolved === '/compact') {
      if (!projectPath || !activeSessionId || !selectedProvider || !selectedModel) return
      setValue('')
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
    if (resolved.startsWith('/') && resolved.length > 1 && !resolved.includes(' ')) {
      const skillName = resolved.slice(1)
      const skill = useStore.getState().skills.find((s: any) => (s.name || s.Name) === skillName)
      if (skill) {
        onSend(`Use the skill tool to load the "${skillName}" skill, then follow its instructions.`)
        setValue('')
        return
      }
    }

    // Prepend quoted messages as formatted context block
    if (quotedMessages && quotedMessages.length > 0) {
      const quoteBlock = quotedMessages
        .map(qm => `> **${qm.role}**: ${qm.content.slice(0, 500)}`)
        .join('\n')
      resolved = `${quoteBlock}\n\n---\n${resolved}`
    }

    // Normal message
    onSend(resolved)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const el = textareaRef.current
    const selStart = el?.selectionStart ?? -1
    const selEnd = el?.selectionEnd ?? -1

    // Backspace at the end of a label → delete the entire chip
    if (e.key === 'Backspace' && selStart === selEnd && selStart > 0) {
      const labelAtCursor = labels.find(l => l.end === selStart)
      if (labelAtCursor) {
        e.preventDefault()
        const newValue = value.slice(0, labelAtCursor.start) + value.slice(labelAtCursor.end)
        setValue(newValue)
        requestAnimationFrame(() => {
          const pos = labelAtCursor.start
          el?.setSelectionRange(pos, pos)
          el?.focus()
        })
        return
      }
    }

    // Delete at the start of a label → delete the entire chip
    if (e.key === 'Delete' && selStart === selEnd) {
      const labelAtCursor = labels.find(l => l.start === selStart)
      if (labelAtCursor) {
        e.preventDefault()
        const newValue = value.slice(0, labelAtCursor.start) + value.slice(labelAtCursor.end)
        setValue(newValue)
        requestAnimationFrame(() => {
          const pos = labelAtCursor.start
          el?.setSelectionRange(pos, pos)
          el?.focus()
        })
        return
      }
    }

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

    // History navigation with Up/Down at visual cursor boundaries
    if (!disabled && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const el = textareaRef.current
      if (el) {
        const { currentLine, totalLines } = getCursorLineInfo(el, value)

        const userMsgs = useStore.getState().sessionMessages[sessionIdRef.current]?.filter(m => m.role === 'user').map(m => m.content) || []

        if (e.key === 'ArrowUp' && currentLine === 1 && userMsgs.length > 0) {
          e.preventDefault()
          const nextIdx = historyIndexRef.current === -1
            ? userMsgs.length - 1
            : Math.max(historyIndexRef.current - 1, 0)
          if (nextIdx !== historyIndexRef.current) {
            historyIndexRef.current = nextIdx
            navigatingHistoryRef.current = true
            setValue(userMsgs[nextIdx])
            requestAnimationFrame(() => {
              const len = userMsgs[nextIdx].length
              textareaRef.current?.setSelectionRange(len, len)
            })
          }
        }
        if (e.key === 'ArrowDown' && currentLine === totalLines && historyIndexRef.current !== -1) {
          e.preventDefault()
          if (historyIndexRef.current < userMsgs.length - 1) {
            historyIndexRef.current += 1
            navigatingHistoryRef.current = true
            setValue(userMsgs[historyIndexRef.current])
            requestAnimationFrame(() => {
              const len = userMsgs[historyIndexRef.current].length
              textareaRef.current?.setSelectionRange(len, len)
            })
          } else if (historyIndexRef.current === userMsgs.length - 1) {
            historyIndexRef.current = -1
            navigatingHistoryRef.current = true
            setValue('')
          }
        }
      }
    }
  }

  const handleSendClick = () => {
    handleSubmit()
  }

  const tokenText = tokenMax > 0
    ? `${formatTokens(tokenCount)} / ${formatTokens(tokenMax)}`
    : formatTokens(tokenCount)

  const segments = segmentText(value, labels)

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

        {/* Textarea wrapper — keeps overlay scoped to the textarea area */}
        <div className="relative">
          {/* Decoration overlay: renders labels as chips */}
          <div
            ref={overlayRef}
            aria-hidden="true"
            className="text-[13px] text-[var(--text-primary)] outline-none px-[14px] pt-[10px] pb-[2px] resize-none w-full bg-transparent overflow-hidden whitespace-pre-wrap break-words"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {segments.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', userSelect: 'none' }}>
                {disabled ? 'Generating...' : 'Send a message... (Enter to submit, Shift+Enter for newline)'}
              </span>
            ) : null}
            {segments.map((seg, i) => {
              if (seg.type !== 'label' || !seg.labelRegion) {
                return <span key={`t-${i}`}>{seg.text}</span>
              }
              const raw = value.slice(seg.labelRegion.start, seg.labelRegion.end)
              const isAtPath = raw[0] === '@'
              let inner: string
              let firstHidden: string
              let lastHidden: string
              if (isAtPath) {
                // @path → hide only @, show the rest
                firstHidden = raw[0]
                inner = raw.slice(1)
                lastHidden = ''
              } else {
                // [filename.ext] or [Paste N] → hide both brackets
                firstHidden = raw[0] || ''
                inner = raw.length >= 2 ? raw.slice(1, -1) : raw
                lastHidden = raw.length >= 2 ? raw[raw.length - 1] : ''
              }
              return (
                <LabelChip key={`l-${i}`} type={seg.labelRegion.type}>
                  {firstHidden && <span aria-hidden="true" style={{ opacity: 0 }}>{firstHidden}</span>}
                  {inner}
                  {lastHidden && <span aria-hidden="true" style={{ opacity: 0 }}>{lastHidden}</span>}
                </LabelChip>
              )
            })}
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onScroll={syncOverlayScroll}
            disabled={disabled}
            placeholder=""
            className="text-[13px] outline-none px-[14px] pt-[10px] pb-[2px] resize-none w-full bg-transparent overflow-hidden whitespace-pre-wrap break-words border-0"
            style={{
              color: 'transparent',
              caretColor: 'var(--text-primary)',
              position: 'relative',
              zIndex: 2,
            }}
            rows={4}
          />
        </div>

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
              <IconMaximize size={14} />
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
              <IconSend size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInput
