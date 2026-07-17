import { useState, KeyboardEvent, useEffect, useRef, useCallback, useMemo } from 'react'
import { useStore } from '../../store'
import { formatTokens } from '../../lib/format'
import { stripTransientBlocks } from '../../lib/stripTransientBlocks'
import ModelPicker from './ModelPicker'
import WorktreeChip from './WorktreeChip'
import WorktreeManager from './WorktreeManager'
import PermissionModePicker from './PermissionModePicker'
import InputModePicker from './InputModePicker'
import AutocompleteDropdown, { AcItem, AcState } from './AutocompleteDropdown'
import { findLabels, LabelRegion, renderChipHTML } from './LabelChip'
import { App } from '../../../bindings/monika'
import { Call, Events } from '@wailsio/runtime'
import { IconSend, IconPaperclip, IconCornerDownLeft, IconChevronRight } from '../Icons'
import { QueuePanel } from '../QueuePanel/QueuePanel'

const INIT_TEMPLATE = `Please analyze this project and check if an \`AGENTS.md\` file exists in the project root.

- If AGENTS.md does NOT exist, create one with compact, actionable information. Every line should answer: "would an agent likely miss this without help?"
- If AGENTS.md already EXISTS, read it first, then update/improve it based on your analysis.

The file should contain:
1. Build, test, and run commands specific to this project
2. Project structure overview (key directories and their purposes)
3. Coding conventions and patterns used
4. Framework and library specifics

First, explore the codebase to understand the project, then create or update the AGENTS.md file accordingly.`

// Fallback: allow all media input types. Proper per-model lookup comes later
// once the store carries supported-inputs data.
const SUPPORTED_MEDIA_INPUTS = ['image', 'video', 'pdf', 'audio']

interface FileEntry { name: string; path: string; is_dir: boolean; children?: FileEntry[] }

function flattenFiles(nodes: FileEntry[]): FileEntry[] {
    const result: FileEntry[] = []
    for (const n of nodes) {
        result.push(n)
        if (n.is_dir && n.children) result.push(...flattenFiles(n.children))
    }
    return result
}

function loadHistory(sessionId: string): string[] {
    try {
        const key = `monika-cmd-history-${sessionId}`
        const stored = localStorage.getItem(key)
        if (stored) return JSON.parse(stored) as string[]
        // Fallback: migrate from global key on first use per session
        const global = localStorage.getItem('monika-cmd-history')
        if (global) {
            const parsed = JSON.parse(global) as string[]
            localStorage.setItem(key, global)
            return parsed
        }
        return []
    } catch { return [] }
}

function saveHistory(sessionId: string, history: string[]) {
    try { localStorage.setItem(`monika-cmd-history-${sessionId}`, JSON.stringify(history)) } catch { /* ignore */ }
}

// ── Cursor helpers for contentEditable ──

/** Get character offset in the plain text content of root element */
function getTextOffset(root: HTMLElement): number {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return 0
    const range = document.createRange()
    range.setStart(root, 0)
    range.setEnd(sel.anchorNode!, sel.anchorOffset)
    return getRangeText(range).length
}

function getRangeText(range: Range): string {
    let text = ''
    const contents = range.cloneContents()
    const tw = document.createTreeWalker(contents, NodeFilter.SHOW_ALL)
    let n: Node | null
    while ((n = tw.nextNode())) {
        if (n.nodeType === Node.TEXT_NODE) {
            const parent = n.parentElement
            if (parent && parent.closest('[contenteditable="false"]')) continue
            text += n.textContent || ''
        } else if (n.nodeType === Node.ELEMENT_NODE) {
            const el = n as HTMLElement
            if (el.getAttribute('contenteditable') === 'false') {
                text += el.textContent || ''
            }
        }
    }
    return text
}

/** Set caret at a given plain text offset within root */
function setCaretAtOffset(root: HTMLElement, offset: number): void {
    const sel = window.getSelection()
    if (!sel) return
    const pos = findPosition(root, offset)
    if (pos) {
        sel.removeAllRanges()
        const range = document.createRange()
        range.setStart(pos.node, pos.offset)
        range.collapse(true)
        sel.addRange(range)
    }
}

function findPosition(root: Node, offset: number): { node: Node; offset: number } | null {
    let remaining = offset
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
    walker.currentNode = root
    let node: Node | null = walker.firstChild()

    while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const len = (node.textContent || '').length
            if (remaining <= len) {
                return { node, offset: remaining }
            }
            remaining -= len
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (el.getAttribute('contenteditable') === 'false') {
                const len = (el.textContent || '').length
                if (remaining <= len) {
                    // Can't put cursor inside contentEditable=false — put before or after
                    if (remaining <= 0) return { node, offset: 0 }
                    // After this element
                    remaining -= len
                } else {
                    remaining -= len
                }
            } else {
                // Recurse into children
                const result = findPosition(node, remaining)
                if (result) return result
                // If not found in children, move past this node
                remaining -= (node.textContent || '').length
            }
        }
        node = walker.nextSibling() || walker.parentNode() || null
        // Skip the parent
        if (node === root) node = walker.nextSibling()
    }
    // Fallback: end of root
    return { node: root, offset: root.childNodes.length }
}

/** Check if selection is on the first visual line of the editor */
function isCursorOnFirstLine(root: HTMLElement): boolean {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return true
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return false
    const rects = range.getClientRects()
    if (rects.length === 0) return true
    const cursorTop = rects[0].top
    const editorTop = root.getBoundingClientRect().top
    const lh = parseFloat(getComputedStyle(root).lineHeight) || 20
    return (cursorTop - editorTop) < lh * 1.5
}


// ── Render content as HTML with chips ──

function renderContentHTML(value: string, labels: LabelRegion[]): string {
    if (!value) return ''
    const parts: string[] = []
    let lastEnd = 0
    for (const label of labels) {
        parts.push(escapeHTML(value.slice(lastEnd, label.start)))
        parts.push(renderChipHTML(label.type, value.slice(label.start, label.end)))
        lastEnd = label.end
    }
    parts.push(escapeHTML(value.slice(lastEnd)))
    const html = parts.join('')
    // Ensure a text insertion point exists when content ends with a chip
    if (labels.length > 0 && labels[labels.length - 1].end === value.length) {
        return html + '<br>'
    }
    return html
}

function escapeHTML(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Extract plain text from editable DOM ──

function extractText(root: HTMLElement): string {
    let text = ''
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
    let node: Node | null = walker.firstChild()
    while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent || ''
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (el.getAttribute('contenteditable') === 'false') {
                text += el.textContent || ''
                // Skip this element's subtree
                const next = walker.nextSibling()
                if (next) { node = next; continue }
                node = walker.parentNode()
                if (!node || node === root) break
                continue
            }
        }
        node = walker.nextNode()
        if (node === root) break
    }
    return text
}

// ── Component ──

function ChatInput({ onSend, onStop, onRunShell, disabled, isGenerating, quotedMessages, onQuotesConsumed }: {
    onSend: (text: string) => void
    onStop: () => void
    onRunShell: (command: string) => void
    disabled: boolean
    isGenerating: boolean
    quotedMessages?: { id: string; role: string; content: string }[]
    onQuotesConsumed?: () => void
}) {
    const [value, setValue] = useState('')
    const editorRef = useRef<HTMLDivElement>(null)
    const pasteStoreRef = useRef<Map<string, string>>(new Map())
    const isComposingRef = useRef(false)
    const pendingCursorRef = useRef<number | null>(null)
    const lastCursorRef = useRef(0)
    const fromUserInputRef = useRef(false)

    const skills = useStore((s) => s.skills)
    const skillNames = useMemo(() => new Set(skills.map((s) => s.name)), [skills])
    const labels = useMemo(() => findLabels(value, skillNames), [value, skillNames])
    const labelsKey = useMemo(() => JSON.stringify(labels), [labels])

    const activeSessionId = useStore((s) => s.activeSessionId)
    const inputMode = useStore((s) => s.inputModes[activeSessionId] || 'normal')
    const shellExecutingSessionIds = useStore((s) => s.shellExecutingSessionIds)
    const isShellExecuting = shellExecutingSessionIds.includes(activeSessionId)
    const sessionTokens = useStore((s) => s.sessionTokens)
    const tokens = sessionTokens[activeSessionId] || { count: 0, max: 0 }
    const tokenCount = tokens.count
    const tokenMax = tokens.max

    const [ac, setAc] = useState<AcState>({ open: false, items: [], selectedIdx: 0, prefix: '' })
    const [worktreeManagerOpen, setWorktreeManagerOpen] = useState(false)
    const acDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const projectPath = useStore((s) => s.projectPath)
    const selectedProvider = useStore((s) => s.selectedProvider)
    const selectedModel = useStore((s) => s.selectedModel)
    const historyRef = useRef<string[]>(loadHistory(activeSessionId))
    const historyIndexRef = useRef(-1)
    const navigatingHistoryRef = useRef(false)
    const sessionIdRef = useRef(activeSessionId)
    sessionIdRef.current = activeSessionId
    const tabCycleRef = useRef<{ wordStart: number; matches: string[]; index: number } | null>(null)
    const tabCompletingRef = useRef(false)
    const valueRef = useRef(value)
    valueRef.current = value

    // Reload shell history when switching sessions
    useEffect(() => {
        historyRef.current = loadHistory(activeSessionId)
    }, [activeSessionId])

    // Sync DOM when value or chip structure changes.
    // Skip innerHTML rewrite when change came from user typing AND no chip change (browser already updated DOM).
    const isRenderingRef = useRef(false)
    const prevLabelsKeyRef = useRef(labelsKey)
    useEffect(() => {
        if (isRenderingRef.current) return
        const el = editorRef.current
        if (!el) return
        const chipsChanged = prevLabelsKeyRef.current !== labelsKey
        prevLabelsKeyRef.current = labelsKey
        if (fromUserInputRef.current && !chipsChanged) {
            fromUserInputRef.current = false
            return
        }
        fromUserInputRef.current = false
        const hadFocus = document.activeElement === el
        const cursor = pendingCursorRef.current ?? (hadFocus ? getTextOffset(el) : null)
        isRenderingRef.current = true
        el.innerHTML = renderContentHTML(value, labels)
        isRenderingRef.current = false
        el.contentEditable = 'false'
        el.contentEditable = 'true'
        if (cursor !== null && hadFocus) {
            pendingCursorRef.current = null
            setCaretAtOffset(el, Math.min(cursor, value.length))
            el.focus()
        }
    }, [value, labelsKey])

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

    // Reset tab cycle state when user edits text
    useEffect(() => {
        if (!tabCompletingRef.current) {
            tabCycleRef.current = null
        }
        tabCompletingRef.current = false
    }, [value])

    const onStopRef = useRef(onStop)

    onStopRef.current = onStop

    const acOpenRef = useRef(false)
    acOpenRef.current = ac.open

    const prevDisabledRef = useRef(disabled)

    // ESC key to stop generation / cancel shell
    useEffect(() => {
        if (!disabled && !isGenerating && !isShellExecuting) return
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (acOpenRef.current) return
                e.preventDefault()
                onStopRef.current()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [disabled, isGenerating, isShellExecuting])

    // Auto-focus when generation completes
    useEffect(() => {
        const wasDisabled = prevDisabledRef.current
        prevDisabledRef.current = disabled
        if (wasDisabled && !disabled) {
            requestAnimationFrame(() => {
                editorRef.current?.focus()
            })
        }
    }, [disabled])

    // Auto-resize
    useEffect(() => {
        const el = editorRef.current
        if (!el) return
        el.style.height = 'auto'
        const h = el.scrollHeight
        if (h > 0) el.style.height = `${Math.min(h, 600)}px`
    }, [value])

    // Clean up paste markers
    useEffect(() => {
        const store = pasteStoreRef.current
        for (const marker of store.keys()) {
            if (!value.includes(marker)) store.delete(marker)
        }
    }, [value])

    // File path append from FileTree context menu
    const appendPath = useStore((s) => s.chatInputAppendPath)
    const appendPathToInput = useStore((s) => s.appendPathToInput)
    useEffect(() => {
        if (!appendPath || !projectPath) return
        const el = editorRef.current
        if (!el) return
        // If editor no longer has selection (user clicked FileTree), use last known cursor position
        const sel = window.getSelection()
        const cursor = (sel && sel.rangeCount && el.contains(sel.anchorNode))
            ? getTextOffset(el)
            : lastCursorRef.current
        const prefix = value.slice(0, cursor).endsWith('@') ? '' : '@'
        const insertion = `${prefix}${appendPath} `
        const newValue = value.slice(0, cursor) + insertion + value.slice(cursor)
        setValue(newValue)
        appendPathToInput('')
        pendingCursorRef.current = cursor + insertion.length
        lastCursorRef.current = cursor + insertion.length
    }, [appendPath])

    // Initial focus
    useEffect(() => {
        const timer = requestAnimationFrame(() => {
            const el = editorRef.current
            if (!el) return
            el.style.height = 'auto'
            const h = el.scrollHeight
            el.style.height = h > 0 ? `${Math.min(h, 600)}px` : ''
            if (!disabled) el.focus()
        })
        return () => cancelAnimationFrame(timer)
    }, [])

    const handleInput = useCallback(() => {
        if (isComposingRef.current) return
        const el = editorRef.current
        if (!el) return
        const text = extractText(el)
        if (text === valueRef.current) return
        fromUserInputRef.current = true
        setValue(text)
        // getTextOffset can return bogus values when chips contain SVG (e.g. <br> adds '\n')
        const cursor = Math.min(getTextOffset(el), text.length)
        pendingCursorRef.current = cursor
        lastCursorRef.current = cursor
    }, [])

    const handleCompositionStart = useCallback(() => {
        isComposingRef.current = true
    }, [])

    const handleCompositionEnd = useCallback(() => {
        isComposingRef.current = false
        const el = editorRef.current
        if (!el) return
        const text = extractText(el)
        if (text === valueRef.current) return
        fromUserInputRef.current = true
        setValue(text)
        const cursor = Math.min(getTextOffset(el), text.length)
        pendingCursorRef.current = cursor
        lastCursorRef.current = cursor
    }, [])

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const pastedText = e.clipboardData.getData('text/plain')
        if (!pastedText) return

        const el = editorRef.current
        if (!el) return
        const cursor = getTextOffset(el)

        // Detect code reference copy from Preview panel
        const refMatch = pastedText.match(/^\[ref:([^\]]+)\]\n/)
        if (refMatch) {
            e.preventDefault()
            const rawRef = refMatch[1]
            const code = pastedText.slice(refMatch[0].length)
            const spaceIdx = rawRef.lastIndexOf(' ')
            const fullPath = spaceIdx > 0 ? rawRef.slice(0, spaceIdx) : rawRef
            const lineRange = spaceIdx > 0 ? rawRef.slice(spaceIdx + 1) : ''
            const fileName = fullPath.replace(/^.*[/\\]/, '')
            const displayLabel = lineRange ? `[${fileName} ${lineRange}]` : `[${fileName}]`
            const resolvedLabel = lineRange ? `[${fullPath} ${lineRange}]` : `[${fullPath}]`
            const resolvedContent = `${resolvedLabel}\n\n${code}`
            pasteStoreRef.current.set(displayLabel, resolvedContent)
            const replacement = `${displayLabel} `
            const newValue = valueRef.current.slice(0, cursor) + replacement + valueRef.current.slice(cursor)
            setValue(newValue)
            pendingCursorRef.current = cursor + replacement.length
            return
        }

        // Detect file path paste
        const trimmed = pastedText.trim()
        const isFilePath = /^[a-zA-Z]:[/\\]/.test(trimmed) ||
            /^\.\.?[/\\]/.test(trimmed) ||
            (trimmed.length < 260 && (trimmed.includes('/') || trimmed.includes('\\')) && /\.[a-zA-Z0-9]{1,8}$/.test(trimmed))

        if (isFilePath) {
            e.preventDefault()
            const filename = trimmed.replace(/^.*[/\\]/, '')
            const replacement = `[${filename}] `
            pasteStoreRef.current.set(`[${filename}]`, trimmed)
            const newValue = valueRef.current.slice(0, cursor) + replacement + valueRef.current.slice(cursor)
            setValue(newValue)
            pendingCursorRef.current = cursor + replacement.length
            return
        }

        if (pastedText.length > 200) {
            e.preventDefault()
            const replacement = `[Paste ${pastedText.length}] `
            pasteStoreRef.current.set(`[Paste ${pastedText.length}]`, pastedText)
            const newValue = valueRef.current.slice(0, cursor) + replacement + valueRef.current.slice(cursor)
            setValue(newValue)
            pendingCursorRef.current = cursor + replacement.length
            return
        }
        // 纯文本粘贴：阻止浏览器默认的富文本插入
        e.preventDefault()
        const newValue = valueRef.current.slice(0, cursor) + pastedText + valueRef.current.slice(cursor)
        setValue(newValue)
        pendingCursorRef.current = cursor + pastedText.length
    }, [])

    const insertMediaChips = useCallback((paths: string[]) => {
        if (paths.length === 0) return
        const el = editorRef.current
        if (!el) return
        const cursor = getTextOffset(el)
        const usedLabels = new Set<string>()
        const chips: { label: string; path: string }[] = paths.map(p => {
            let name = p.replace(/^.*[/\\]/, '')
            // Disambiguate if basename collides
            if (usedLabels.has(name)) {
                const ext = name.lastIndexOf('.')
                const base = ext > 0 ? name.slice(0, ext) : name
                const suffix = ext > 0 ? name.slice(ext) : ''
                let i = 2
                while (usedLabels.has(`${base}-${i}${suffix}`)) i++
                name = `${base}-${i}${suffix}`
            }
            usedLabels.add(name)
            return { label: name, path: p }
        })
        const joined = chips.map(c => `[${c.label}] `).join('')
        const newValue = valueRef.current.slice(0, cursor) + joined + valueRef.current.slice(cursor)
        // Stash each path under its visible label so the submit resolver
        // expands the chip back to the actual project-relative path.
        for (const c of chips) {
            pasteStoreRef.current.set(`[${c.label}]`, c.path)
        }
        setValue(newValue)
        pendingCursorRef.current = cursor + joined.length
    }, [])

    const handlePickMedia = useCallback(async () => {
        try {
            const paths = await Call.ByName('monika/internal/api.App.PickMediaFiles', SUPPORTED_MEDIA_INPUTS)
            if (Array.isArray(paths) && paths.length > 0) {
                insertMediaChips(paths as string[])
            }
        } catch (err: any) {
            console.error('media pick failed:', err)
        }
    }, [insertMediaChips])

    // Native drag-drop is delivered by the Wails runtime (EnableFileDrop).
    // The Go side emits a `media-drop` event carrying the dropped file paths.
    useEffect(() => {
        const off = Events.On('media-drop', (ev: any) => {
            const paths = ev?.data
            if (Array.isArray(paths) && paths.length > 0) {
                insertMediaChips(paths as string[])
            }
        })
        return () => { if (off) off() }
    }, [insertMediaChips])

    const COMMANDS: AcItem[] = [
        { name: 'init', detail: 'Create/update AGENTS.md from project analysis', icon: '/', insert: '/init ' },
        { name: 'compact', detail: 'Manually trigger context compaction', icon: '/', insert: '/compact ' },
    ]

    const getQueryAtCursor = (): { prefix: string; query: string; cursor: number } | null => {
        const el = editorRef.current
        if (!el) return null
        const cursor = Math.min(getTextOffset(el), value.length)
        const text = value.slice(0, cursor)

        const dollarMatch = text.match(/(?:^|\s)(\$)([^\s]*)$/)
        if (dollarMatch) return { prefix: '$', query: dollarMatch[2], cursor }

        const atMatch = text.match(/@([^\s]*)$/)
        if (atMatch) return { prefix: '@', query: atMatch[1], cursor }

        const slashMatch = text.match(/^\/([^\s]*)$/)
        if (slashMatch) return { prefix: '/', query: slashMatch[1], cursor }

        // Shell mode: trigger candidate menu from history for direct command typing
        if (inputMode === 'shell' && text.trim()) {
            return { prefix: '', query: text, cursor }
        }

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
                .map(h => ({ name: h, detail: 'history', icon: <IconCornerDownLeft size={12} />, insert: `$${h} ` }))

            const files = projectPath
                ? await App.ListFileTree(projectPath, false).then(r => flattenFiles(r as FileEntry[])).catch(() => [] as FileEntry[])
                : []

            const fileItems: AcItem[] = (files || [])
                .filter(f => f.name.toLowerCase().startsWith(lq))
                .slice(0, 15)
                .map(f => ({
                    name: f.name,
                    detail: f.is_dir ? 'directory' : 'file',
                    icon: <IconChevronRight size={12} />,
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
                    icon: <IconChevronRight size={12} />,
                    insert: f.is_dir ? `@${f.path}/` : `@${f.path} `,
                }))
        } else if (prefix === '') {
            // Shell mode direct typing: show matching command history
            const histItems: AcItem[] = historyRef.current
                .filter(h => h.toLowerCase().startsWith(lq))
                .slice(0, 10)
                .map(h => ({ name: h, detail: 'history', icon: <IconCornerDownLeft size={12} />, insert: h }))

            items = histItems
        }
        setAc({ open: true, items, selectedIdx: 0, prefix, query })
    }, [projectPath])

    const updateAutocomplete = useCallback(() => {
        const match = getQueryAtCursor()
        if (!match) {
            setAc(s => s.open ? { ...s, open: false } : s)
            return
        }
        // In shell mode, skip / command autocomplete
        if (inputMode === 'shell' && match.prefix === '/') {
            setAc(s => s.open ? { ...s, open: false } : s)
            return
        }
        if (acDebounceRef.current) clearTimeout(acDebounceRef.current)
        acDebounceRef.current = setTimeout(() => {
            fetchAutocomplete(match.prefix, match.query)
        }, 300)
    }, [value, fetchAutocomplete, inputMode])

    useEffect(() => {
        updateAutocomplete()
    }, [value, updateAutocomplete])

    const selectAcItem = (item: AcItem) => {
        const match = getQueryAtCursor()
        if (!match) return

        let replaceStart: number
        if (match.prefix === '/') {
            // / commands always at line start (regex: ^/(...)$)
            replaceStart = 0
        } else {
            const matched = match.prefix + match.query
            const idx = value.lastIndexOf(matched)
            replaceStart = idx >= 0 ? idx : 0
        }
        const replaceEnd = replaceStart + match.prefix.length + match.query.length
        const newText = value.slice(0, replaceStart) + item.insert + value.slice(replaceEnd)
        setValue(newText)
        setAc({ open: false, items: [], selectedIdx: 0, prefix: '' })
        pendingCursorRef.current = replaceStart + item.insert.length
    }

    const closeAutocomplete = useCallback(() => {
        setAc(s => ({ ...s, open: false }))
    }, [])

    const handleSubmit = () => {
        const trimmed = value.trim()
        if (!trimmed || disabled) return
        historyIndexRef.current = -1

        let resolved = trimmed
        for (const [marker, original] of pasteStoreRef.current) {
            resolved = resolved.split(marker).join(original)
        }

        // Shell mode: submit directly as shell command
        if (inputMode === 'shell') {
            let cmd = resolved
            if (cmd.startsWith('$')) {
                cmd = cmd.slice(1).trim()
            }
            if (!cmd) { onSend(resolved); setValue(''); return }
            const h = historyRef.current.filter(c => c !== cmd)
            const updated = [cmd, ...h].slice(0, 50)
            historyRef.current = updated
            saveHistory(sessionIdRef.current, updated)
            onRunShell(cmd)
            setValue('')
            return
        }
        if (resolved.startsWith('$')) {
            const command = resolved.slice(1).trim()
            if (!command) { onSend(resolved); setValue(''); return }
            const h = historyRef.current.filter(c => c !== command)
            const updated = [command, ...h].slice(0, 50)
            historyRef.current = updated
            saveHistory(sessionIdRef.current, updated)
            onRunShell(command)
            setValue('')
            return
        }

        if (resolved === '/init') {
            onSend(INIT_TEMPLATE)
            setValue('')
            return
        }

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

        if (resolved.startsWith('/') && resolved.length > 1 && !resolved.includes(' ')) {
            const skillName = resolved.slice(1)
            const skill = useStore.getState().skills.find((s: any) => (s.name || s.Name) === skillName)
            if (skill) {
                onSend(`Use the skill tool to load the "${skillName}" skill, then follow its instructions.`)
                setValue('')
                return
            }
        }

        if (quotedMessages && quotedMessages.length > 0) {
            const quoteBlock = quotedMessages
                .map(qm => `> **${qm.role}**: ${qm.content.slice(0, 500)}`)
                .join('\n')
            resolved = `${quoteBlock}\n\n---\n${resolved}`
            onQuotesConsumed?.()
        }

        onSend(resolved)
        setValue('')
    }

    const handleTabComplete = useCallback(() => {
        if (!projectPath) return
        const el = editorRef.current
        if (!el) return
        const v = valueRef.current
        const cursor = getTextOffset(el)
        const textBefore = v.slice(0, cursor)
        // Find last whitespace before cursor to extract current word
        const lastSpace = Math.max(textBefore.lastIndexOf(' '), textBefore.lastIndexOf('\n'), textBefore.lastIndexOf('\t'))
        const wordStart = lastSpace + 1
        const fragment = textBefore.slice(wordStart)
        if (!fragment) return

        // If cycling through existing matches at the same position
        const cycle = tabCycleRef.current
        if (cycle && cycle.wordStart === wordStart && cycle.matches.length > 0) {
            const nextIdx = (cycle.index + 1) % cycle.matches.length
            tabCycleRef.current = { ...cycle, index: nextIdx }
            const replaceText = cycle.matches[nextIdx]
            const newValue = v.slice(0, wordStart) + replaceText + v.slice(cursor)
            tabCompletingRef.current = true
            setValue(newValue)
            pendingCursorRef.current = wordStart + replaceText.length
            return
        }

        // Fetch file list for matching (non-recursive, top level only for performance)
        App.ListFileTree(projectPath, false)
            .then((r: FileEntry[]) => {
                const files = flattenFiles(r as FileEntry[])
                const matches = files
                    .filter(f => f.path.startsWith(fragment))
                    .map(f => f.is_dir ? f.path + '/' : f.path)
                    .slice(0, 20)
                if (matches.length === 0) return
                tabCycleRef.current = { wordStart, matches, index: 0 }
                // Use ref to avoid stale closure if user edited while fetching
                const curr = valueRef.current
                const newValue = curr.slice(0, wordStart) + matches[0] + curr.slice(cursor)
                tabCompletingRef.current = true
                setValue(newValue)
                pendingCursorRef.current = wordStart + matches[0].length
            })
            .catch(() => { /* ignore */ })
    }, [projectPath])

    const handleKeyDown = (e: KeyboardEvent) => {
        const el = editorRef.current
        if (!el) return

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

        // Shell mode: Tab for inline path completion
        if (inputMode === 'shell' && e.key === 'Tab' && !ac.open) {
            e.preventDefault()
            handleTabComplete()
            return
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }

        // History navigation
        if (!disabled && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            const isShellMode = inputMode === 'shell'
            const histSrc = isShellMode
                ? historyRef.current
                : useStore.getState().sessionMessages[sessionIdRef.current]?.filter(m => m.role === 'user').map(m => stripTransientBlocks(m.content)) || []

            if (e.key === 'ArrowUp' && historyIndexRef.current <= histSrc.length - 1 && (isShellMode || historyIndexRef.current !== -1 || isCursorOnFirstLine(el!))) {
                e.preventDefault()
                const nextIdx = historyIndexRef.current === -1
                    ? histSrc.length - 1
                    : Math.max(historyIndexRef.current - 1, 0)
                if (nextIdx !== historyIndexRef.current) {
                    historyIndexRef.current = nextIdx
                    navigatingHistoryRef.current = true
                    setValue(histSrc[nextIdx])
                    pendingCursorRef.current = histSrc[nextIdx].length
                }
            }
            if (e.key === 'ArrowDown' && historyIndexRef.current !== -1) {
                e.preventDefault()
                if (historyIndexRef.current < histSrc.length - 1) {
                    historyIndexRef.current += 1
                    navigatingHistoryRef.current = true
                    setValue(histSrc[historyIndexRef.current])
                    pendingCursorRef.current = histSrc[historyIndexRef.current].length
                } else {
                    historyIndexRef.current = -1
                    navigatingHistoryRef.current = true
                    setValue('')
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

    return (
        <div className="border-t border-[var(--border)] px-4 py-3" style={{ background: 'var(--bg-sidebar)' }}>
            <QueuePanel />
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

                <div
                    ref={editorRef}
                    contentEditable={!disabled}
                    suppressContentEditableWarning
                    onInput={handleInput}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    data-file-drop-target="true"
                    className="text-[13px] text-[var(--text-primary)] outline-none px-[14px] pt-[12px] pb-[6px] resize-none w-full bg-transparent overflow-hidden whitespace-pre-wrap break-words border-0 min-h-[160px]"
                    style={{
                        fontFamily: 'inherit',
                        letterSpacing: 'inherit',
                    }}
                    data-placeholder={
                        disabled
                            ? 'Generating...'
                            : isGenerating
                                ? 'Send a message... (will be queued)'
                                : inputMode === 'shell'
                                    ? 'Run a shell command... (each command runs independently)'
                                    : 'Send a message... (Enter to submit, Shift+Enter for newline)'
                    }
                />

                <div
                    className="flex items-center gap-2 px-[10px] pb-[8px]"
                    style={{ background: 'transparent' }}
                >
                    <InputModePicker />
                    <PermissionModePicker />
                    <ModelPicker />
                    <WorktreeChip
                        sessionId={activeSessionId}
                        onClick={() => setWorktreeManagerOpen(true)}
                    />
                    {worktreeManagerOpen && (
                        <WorktreeManager
                            sessionId={activeSessionId}
                            onClose={() => setWorktreeManagerOpen(false)}
                        />
                    )}

                    {/* Native file picker (also covers keyboard / screen-reader
                        access). Drag-drop is handled by the Wails runtime. */}
                    <button
                        type="button"
                        title="Attach media file"
                        aria-label="Attach media file"
                        disabled={disabled}
                        onClick={handlePickMedia}
                        className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: 'var(--text-dim)' }}
                    >
                        <IconPaperclip size={16} />
                    </button>

                    <span className="text-[11px] text-[var(--text-dim)] select-none" style={{ fontFeatureSettings: '"tnum"' }}>
                        tok: {tokenText}
                    </span>

                    <div className="flex-1" />

                    {isGenerating && !value.trim() ? (
                        <button
                            onClick={onStop}
                            title="Stop generating"
                            className="flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-hover)]"
                            style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }}
                        >
                            <span className="inline-block w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSendClick}
                            disabled={!value.trim() || disabled || isShellExecuting}
                            title={isGenerating ? 'Queue message (Enter) · Esc to stop' : 'Send message (Enter)'}
                            className="flex items-center justify-center rounded transition-colors"
                            style={{
                                width: '28px',
                                height: '28px',
                                border: 'none',
                                background: 'none',
                                color: !value.trim() || disabled || isShellExecuting
                                    ? 'var(--text-dim)'
                                    : isGenerating ? 'var(--yellow)' : 'var(--accent)',
                                cursor: (!value.trim() || disabled || isShellExecuting) ? 'default' : 'pointer',
                                opacity: (!value.trim() || disabled || isShellExecuting) ? 0.4 : 1,
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
