import React, { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { IDockviewPanelProps } from 'dockview'
import { EditorState } from '@codemirror/state'
import { EditorView, hoverTooltip, keymap, lineNumbers, highlightSpecialChars, drawSelection, dropCursor } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { syntaxHighlighting, bracketMatching, indentOnInput, foldGutter, foldService } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap, CompletionContext } from '@codemirror/autocomplete'
import { search, searchKeymap } from '@codemirror/search'
import { useStore } from '../../store'
import { getLanguageForFile, getLanguage, treeSitterInitPromise, computeFoldableRanges, FoldRange } from '../../lib/treeSitter'
import { treeSitterHighlightExtension } from '../../lib/treeSitterHighlight'
import { Call } from '@wailsio/runtime'
import { lspService, LspSymbol, LspDiagnostic } from '../../lib/lspService'
import { LspSymbolSidebar } from './LspSymbolSidebar'

import { IconSidebar, IconFolder, IconMaximize, IconRestore, IconSearch, IconClose, IconEye, IconEdit, IconVideo, IconImage, IconFileText, IconMusic } from '../Icons'
import { CodeMinimap } from './CodeMinimap'
import MarkdownPreview from './MarkdownPreview'
import { AnsiText } from '../../lib/ansi'
import FileTree from '../FileTree/FileTree'
import MonacoPreview from './MonacoPreview'
import type * as monacoType from 'monaco-editor'
const ANSI_STRIP_RE = /\x1b\][^\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b./g
function stripAnsi(s: string): string { return s.replace(ANSI_STRIP_RE, '') }
const MAX_FILE_LINES = 5000
function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const BOM_PATTERNS = ['\uFEFF', '\uFFFE', '\u0000FEFF', '\u0000FFFE\u0000']
function isBinaryContent(content: string): boolean {
    // Treat files with BOM as text
    for (const bom of BOM_PATTERNS) {
        if (content.startsWith(bom)) return false
    }
    // Check for null bytes in the first 8KB
    const slice = content.slice(0, 8192)
    return slice.indexOf('\x00') >= 0
}
const previewTheme = EditorView.theme({
    '&': {
        fontFamily: 'var(--font-mono)',
        backgroundColor: '#0d0e12',
        height: '100%',
        color: '#abb2bf',
    },
    '.cm-scroller': { backgroundColor: '#0d0e12' },
    '.cm-gutters': {
        fontFamily: 'var(--font-mono)',
        backgroundColor: '#121319',
        color: '#495162',
        border: 'none',
        paddingLeft: 8,
        paddingRight: 16,
    },
    '.cm-gutterElement': { color: 'inherit' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8b8fa0' },
    '.cm-content': { fontFamily: 'var(--font-mono)', paddingLeft: 4, color: '#abb2bf' },
    '.cm-line': { fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '22px', color: '#abb2bf' },

    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(75,125,219,0.15)' },
    '.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(75,125,219,0.15)' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(75,125,219,0.25)', outline: '1px solid rgba(75,125,219,0.4)' },

    // Search panel — dark theme match
    '.cm-panel.cm-search': {
        backgroundColor: '#101218',
        color: '#abb2bf',
        padding: '6px 8px',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        borderBottom: '1px solid #1e2130',
        '& input, & button, & label': { margin: '.2em .6em .2em 0' },
        '& input[type=checkbox]': { marginRight: '.3em', accentColor: '#528bff' },
        '& input.cm-textfield': {
            backgroundColor: '#1a1d2e',
            border: '1px solid #2c3040',
            color: '#abb2bf',
            borderRadius: 4,
            padding: '2px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
        },
        '& input.cm-textfield:focus': {
            outline: 'none',
            borderColor: '#528bff',
        },
        '& button.cm-button': {
            backgroundColor: '#1e2130',
            border: '1px solid #2c3040',
            color: '#abb2bf',
            borderRadius: 4,
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
        },
        '& button.cm-button:hover': {
            backgroundColor: '#2c3040',
        },
        '& label': {
            fontSize: '11px',
            color: '#8b8fa0',
            whiteSpace: 'pre',
            display: 'inline-flex',
            alignItems: 'center',
        },
        '& [name=close]': {
            position: 'absolute',
            top: '6px',
            right: '8px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#8b8fa0',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
        },
        '& [name=close]:hover': {
            color: '#abb2bf',
        },
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(82,139,255,0.25)' },
    '.cm-searchMatch-selected': { backgroundColor: 'rgba(82,139,255,0.45)' },
    // Autocomplete tooltip — dark theme
    '.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
    },
    '.cm-tooltip-autocomplete > ul > li': {
        padding: '2px 8px 2px 18px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'rgba(82,139,255,0.2)',
        color: '#d7dae0',
    },
    '.cm-tooltip': {
        backgroundColor: '#1a1d2e',
        border: '1px solid #2c3040',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    },
    '.cm-tooltip-autocomplete .cm-completionDetail': {
        color: '#6b7280',
        fontSize: '11px',
    },
    '.cm-completionIcon': {
        fontSize: '11px',
        opacity: 0.7,
    },
}, { dark: true })

function getLangLabel(filePath: string): string | null {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const map: Record<string, string> = {
        ts: 'TS', tsx: 'TSX', js: 'JS', jsx: 'JSX', mjs: 'JS',
        py: 'PY', go: 'GO', json: 'JSON',
        css: 'CSS', scss: 'SCSS', less: 'LESS',
        html: 'HTML', htm: 'HTML', xml: 'XML', svg: 'SVG',
        md: 'MD', mdx: 'MDX',
        rs: 'RS', toml: 'TOML', yaml: 'YML', yml: 'YML',
        sh: 'SH', bash: 'SH', zsh: 'SH',
        sql: 'SQL', graphql: 'GQL', gql: 'GQL',
        dockerfile: 'DOCKER',
    }
    if (ext === '') {
        const name = filePath.split('/').pop()?.toLowerCase() || ''
        if (name === 'dockerfile') return 'DOCKER'
        if (name === 'makefile') return 'MAKE'
    }
    return map[ext] || null
}


const lspCompletionSource = async (context: CompletionContext) => {
    const state = useStore.getState()
    const fp = state.preview.filePath
    const pp = state.projectPath
    if (!fp || !pp) return null

    const word = context.matchBefore(/[\w$]+(\.[\w$]*)?/)
    if (!word && !context.explicit) return null
    if (word && word.from === word.to && !context.explicit) return null

    const view = context.view
    if (!view) return null
    const line = view.state.doc.lineAt(context.pos)
    const col = context.pos - line.from

    try {
        // Sync current document content to LSP before requesting completions.
        const content = context.state.doc.toString()
        lspDocVersion++
        await lspService.didChange(pp, fp, content, lspDocVersion)

        const result = await lspService.completion(pp, fp, line.number - 1, col)
        if (!result || !result.items || result.items.length === 0) return null

        // After a dot, position 'from' after the dot so only the member name is replaced.
        const dotIdx = word ? word.text.lastIndexOf('.') : -1
        const replaceFrom = dotIdx >= 0
            ? word!.from + dotIdx + 1
            : (word ? word.from : context.pos)

        return {
            from: replaceFrom,
            options: result.items.map((item) => ({
                label: item.label,
                detail: item.detail,
                type: getCompletionType(item.kind),
                apply: item.insertText || item.label,
            })),
            validFor: /^[\w$]*$/,
        }
    } catch {
        return null
    }
}

// Helper to map LSP CompletionItemKind to CM6 completion type string
function getCompletionType(kind: number | undefined): string {
    const types: Record<number, string> = {
        1: 'text', 2: 'method', 3: 'function', 4: 'constructor',
        5: 'field', 6: 'variable', 7: 'class', 8: 'interface',
        9: 'module', 10: 'property', 11: 'unit', 12: 'value',
        13: 'enum', 14: 'keyword', 15: 'snippet', 16: 'color',
        17: 'file', 18: 'reference', 19: 'folder', 20: 'enumMember',
        21: 'constant', 22: 'struct', 23: 'event', 24: 'operator',
        25: 'typeParameter',
    }
    return types[kind ?? 0] || 'text'
}

// Shared LSP document version counter — used by both the completion source and the component.
let lspDocVersion = 0

// Fold state — populated after tree-sitter init parses the document.
let foldRanges: FoldRange[] = []

const treeSitterFoldService = foldService.of((state: EditorState, lineStart: number, _lineEnd: number) => {
    for (const r of foldRanges) {
        if (r.from === lineStart) return r
    }
    return null
})


interface HunkLine {
    type: 'context' | 'add' | 'remove' | 'hunk-header' | 'file-header'
    content: string
    oldLine?: number
    newLine?: number
}

function parseDiffLines(lines: string[]): { hunks: HunkLine[]; added: number; removed: number } {
    const hunks: HunkLine[] = []
    let added = 0
    let removed = 0
    let oldLine = 0
    let newLine = 0

    for (const line of lines) {
        if (line.startsWith('--- ') || line.startsWith('+++ ')) {
            hunks.push({ type: 'file-header', content: line })
            continue
        }
        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
            if (match) {
                oldLine = parseInt(match[1], 10)
                newLine = parseInt(match[2], 10)
            }
            hunks.push({ type: 'hunk-header', content: line })
            continue
        }
        if (line.startsWith('+')) {
            hunks.push({ type: 'add', content: line.slice(1), newLine })
            newLine++
            added++
        } else if (line.startsWith('-')) {
            hunks.push({ type: 'remove', content: line.slice(1), oldLine })
            oldLine++
            removed++
        } else {
            hunks.push({ type: 'context', content: line.slice(1), oldLine, newLine })
            oldLine++
            newLine++
        }
    }
    return { hunks, added, removed }
}

function DiffView({ lines, fileName, conflictActive = false, conflictAiContent = null }: {
    lines: string[];
    fileName: string;
    conflictActive?: boolean;
    conflictAiContent?: string | null;
}) {
    const { hunks, added, removed } = parseDiffLines(lines)
    const scrollRef = useRef<HTMLDivElement>(null)
    const firstChangeRef = useRef<HTMLTableRowElement>(null)
    useEffect(() => {
        if (firstChangeRef.current && scrollRef.current) {
            const container = scrollRef.current
            const row = firstChangeRef.current
            const containerRect = container.getBoundingClientRect()
            const rowRect = row.getBoundingClientRect()
            const offset = rowRect.top - containerRect.top + container.scrollTop - container.clientHeight / 3
            container.scrollTo({ top: Math.max(0, offset) })
        }
    }, [lines])

    return (
        <div className="flex flex-col h-full">
            {/* File header */}
            <div
                className="flex items-center gap-2 px-3 py-1.5 shrink-0"
                style={{
                    borderBottom: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                    }}
                >
                    <IconFolder size={13} style={{ opacity: 0.5 }} />
                    {fileName}
                </span>
                <div className="flex-1" />
                <span
                    style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        display: 'inline-flex',
                        gap: 8,
                    }}
                >
                    {added > 0 && (
                        <span style={{ color: 'var(--green)' }}>+{added}</span>
                    )}
                    {removed > 0 && (
                        <span style={{ color: 'var(--red)' }}>-{removed}</span>
                    )}
                </span>
                {/* Mini diff bar */}
                <svg width={48} height={10} style={{ flexShrink: 0 }}>
                    {(() => {
                        const total = added + removed
                        if (total === 0) return null
                        const addW = (added / total) * 48
                        return (
                            <>
                                <rect x={0} y={0} width={addW} height={10} rx={2} fill="var(--green)" opacity={0.5} />
                                <rect x={addW} y={0} width={48 - addW} height={10} rx={2} fill="var(--red)" opacity={0.5} />
                            </>
                        )
                    })()}
                </svg>
                {/* Conflict resolution buttons */}
                {conflictActive && (
                    <>
                        <button
                            style={{
                                padding: '3px 12px',
                                background: 'var(--green)',
                                color: '#000',
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                marginLeft: 8,
                            }}
                            onClick={async () => {
                                const state = useStore.getState()
                                if (state.preview.filePath && conflictAiContent) {
                                    await Call.ByName('monika/internal/api.App.WriteFile', state.projectPath, state.preview.filePath, conflictAiContent)
                                    useStore.getState().markFileClean(state.preview.filePath!)
                                    useStore.setState({
                                        preview: {
                                            ...useStore.getState().preview,
                                            conflictActive: false,
                                            conflictAiContent: null,
                                        },
                                    })
                                }
                            }}
                        >
                            Accept AI
                        </button>
                        <button
                            style={{
                                padding: '3px 12px',
                                background: 'var(--red)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                            }}
                            onClick={() => {
                                const state = useStore.getState()
                                useStore.setState({
                                    preview: {
                                        ...state.preview,
                                        conflictActive: false,
                                        conflictAiContent: null,
                                    },
                                })
                                if (state.preview.filePath) {
                                    useStore.getState().markFileDirty(state.preview.filePath)
                                }
                            }}
                        >
                            Keep Mine
                        </button>
                    </>
                )}
            </div>

            {/* Diff body */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-auto"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '22px' }}
            >
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                        {(() => {
                            const firstChangeIdx = hunks.findIndex(h => h.type === 'add' || h.type === 'remove')
                            return hunks.map((h, i) => {
                                if (h.type === 'file-header') {
                                    return (
                                        <tr key={i}>
                                            <td colSpan={3} style={{
                                                color: h.content.startsWith('---') ? 'var(--red)' : 'var(--green)',
                                                opacity: 0.6,
                                                padding: '2px 0',
                                                fontSize: 11,
                                                whiteSpace: 'pre',
                                                background: 'rgba(255,255,255,0.01)',
                                            }}>
                                                <span style={{ paddingLeft: 12 }}>{h.content}</span>
                                            </td>
                                        </tr>
                                    )
                                }
                                if (h.type === 'hunk-header') {
                                    const display = h.content.replace(/@@.*@@/, (m) => {
                                        const inner = m.slice(2, -2).trim()
                                        return `@@ ${inner} @@`
                                    })
                                    return (
                                        <tr key={i}>
                                            <td colSpan={3} style={{
                                                color: 'var(--accent)',
                                                opacity: 0.5,
                                                padding: '4px 0 2px',
                                                fontSize: 11,
                                                whiteSpace: 'pre',
                                            }}>
                                                <span style={{ paddingLeft: 12 }}>{display}</span>
                                            </td>
                                        </tr>
                                    )
                                }
                                const isAdd = h.type === 'add'
                                const isRemove = h.type === 'remove'
                                const bg = isAdd ? 'rgba(68,165,115,0.10)'
                                    : isRemove ? 'rgba(205,84,84,0.10)'
                                        : 'transparent'
                                const fg = isAdd ? 'var(--green)'
                                    : isRemove ? 'var(--red)'
                                        : 'var(--text-primary)'
                                const gutterBg = isAdd ? 'rgba(68,165,115,0.18)'
                                    : isRemove ? 'rgba(205,84,84,0.18)'
                                        : 'transparent'
                                const gutterColor = isAdd ? 'rgba(68,165,115,0.5)'
                                    : isRemove ? 'rgba(205,84,84,0.5)'
                                        : 'var(--text-dim)'
                                const prefix = isAdd ? '+' : isRemove ? '-' : ' '

                                return (
                                    <tr key={i} ref={i === firstChangeIdx ? firstChangeRef : undefined} style={{ background: bg }}>
                                        <td style={{
                                            width: 1,
                                            minWidth: 44,
                                            textAlign: 'right',
                                            padding: '0 6px',
                                            color: gutterColor,
                                            background: gutterBg,
                                            userSelect: 'none',
                                            fontSize: 11,
                                            lineHeight: '22px',
                                            verticalAlign: 'top',
                                        }}>
                                            {h.oldLine != null ? h.oldLine : ''}
                                        </td>
                                        <td style={{
                                            width: 1,
                                            minWidth: 44,
                                            textAlign: 'right',
                                            padding: '0 6px',
                                            color: gutterColor,
                                            background: gutterBg,
                                            userSelect: 'none',
                                            fontSize: 11,
                                            lineHeight: '22px',
                                            verticalAlign: 'top',
                                            borderRight: '1px solid var(--border)',
                                        }}>
                                            {h.newLine != null ? h.newLine : ''}
                                        </td>
                                        <td style={{
                                            padding: '0 0 0 8px',
                                            color: fg,
                                            whiteSpace: 'pre',
                                            lineHeight: '22px',
                                        }}>
                                            <span style={{ opacity: 0.5, userSelect: 'none' }}>{prefix}</span>
                                            {h.content}
                                        </td>
                                    </tr>
                                )
                            })
                        })()}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function FilePreviewHeader({ fileName, filePath, lineCount, truncated }: {
    fileName: string
    filePath: string
    lineCount: number
    truncated?: boolean
}) {
    const lang = getLangLabel(filePath)
    const isDirty = useStore((s) => s.dirtyFiles.has(filePath))
    return (
        <div
            className="flex items-center gap-2 px-3 py-1.5 shrink-0"
            style={{
                borderBottom: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.02)',
            }}
        >
            <IconFolder size={13} style={{ opacity: 0.45 }} />
            {isDirty && (
                <span style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#e5c07b',
                    flexShrink: 0,
                }} title="Unsaved changes" />
            )}
            <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
            }}>
                {filePath || fileName}
            </span>
            {lang && (
                <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    color: 'var(--text-dim)',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    lineHeight: '14px',
                }}>
                    {lang}
                </span>
            )}
            <div className="flex-1" />
            <span style={{
                fontSize: 10,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
            }}>
                {lineCount} lines{truncated ? ` (truncated to ${MAX_FILE_LINES})` : ''}
            </span>
        </div>
    )
}

function PreviewPanel(props: IDockviewPanelProps) {
    const preview = useStore((s) => s.preview)
    const commitDetail = useStore((s) => s.preview.commitDetail)
    const commitFiles = useStore((s) => s.preview.commitFiles)
    const commitHash = useStore((s) => s.preview.commitHash)
    const setCommitFileDiff = useStore((s) => s.setCommitFileDiff)
    const dirtyFiles = useStore((s) => s.dirtyFiles)
    const isDirtyPanel = !!(preview.filePath && dirtyFiles.has(preview.filePath))


    const selectedBgTaskId = useStore((s) => s.selectedBgTaskId)
    const bgTasks = useStore((s) => s.bgTasks)
    const bgTaskLineCounts = useStore((s) => s.bgTaskLineCounts)
    const bgTaskLogCache = useStore((s) => s.bgTaskLogCache)
    const bgTaskDisplayCount = useStore((s) => s.bgTaskDisplayCount)
    const stopBgTask = useStore((s) => s.stopBgTask)
    const containerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<EditorView | null>(null)
    const monacoEditorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)
    const headerRef = useRef<HTMLDivElement>(null)
    const [maximized, setMaximized] = useState(false)
    const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
    const prevFilePathRef = useRef<string | null>(null)
    const diagTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
    const bgLogRef = useRef<HTMLDivElement>(null)
    const bgSentinelRef = useRef<HTMLDivElement>(null)
    const bgPrevScrollHeightRef = useRef(0)
    const bgStickToBottomRef = useRef(true)
    const [bgSearchOpen, setBgSearchOpen] = useState(false)
    const [bgSearchQuery, setBgSearchQuery] = useState('')
    const [lspEnabled, setLspEnabled] = useState(true)
    const [peekPanel, setPeekPanel] = useState<{
        title: string
        items: { path: string; line: number; col: number }[]
    } | null>(null)
    const [contextMenu, setContextMenu] = useState<{
        x: number
        y: number
        line: number
        col: number
    } | null>(null)
    const [symbols, setSymbols] = useState<LspSymbol[]>([])
    const [diagnostics, setDiagnostics] = useState<LspDiagnostic[]>([])
    const [currentLine, setCurrentLine] = useState<number | null>(null)
    const [cursorPos, setCursorPos] = useState({ line: 0, col: 0 })
    const [breadcrumbMenu, setBreadcrumbMenu] = useState<{
        x: number
        y: number
        siblings: LspSymbol[]
    } | null>(null)
    const [refreshBanner, setRefreshBanner] = useState(false)

    const previewNeedsRefresh = useStore(s => s.previewNeedsRefresh)
    useEffect(() => {
        if (previewNeedsRefresh && preview.filePath && previewNeedsRefresh === preview.filePath) {
            setRefreshBanner(true)
        } else {
            setRefreshBanner(false)
        }
    }, [previewNeedsRefresh, preview.filePath])
    const [showSymbols, setShowSymbols] = useState(false)
    const [mdPreviewMode, setMdPreviewMode] = useState(true)

    useEffect(() => {
        if (!contextMenu) return
        const close = () => setContextMenu(null)
        window.addEventListener('click', close)
        return () => window.removeEventListener('click', close)
    }, [contextMenu])

    useEffect(() => {
        setMaximized(props.api.isMaximized())
    }, [props.api])

    useEffect(() => {
        const dockviewApi = useStore.getState().dockviewApi
        if (!dockviewApi) return
        const disposable = dockviewApi.onDidMaximizedGroupChange((e) => {
            if (e.group === props.api.group) {
                setMaximized(e.isMaximized)
            }
        })
        return () => { disposable.dispose() }
    }, [props.api])

    const toggleMaximize = useCallback(() => {
        if (props.api.isMaximized()) {
            props.api.exitMaximized()
        } else {
            props.api.maximize()
        }
    }, [props.api])

    useEffect(() => {
        const panel = headerRef.current?.closest('.dv-panel') as HTMLElement | null
        const tabs = panel?.querySelector('.dv-tabs-and-actions-container') as HTMLElement | null
        if (tabs) {
            tabs.style.display = 'none'
            return () => { tabs.style.display = '' }
        }
    }, [])

    const copyHandler = EditorView.domEventHandlers({
        copy: (event, view) => {
            const selection = view.state.selection.main
            if (selection.empty) return
            const store = useStore.getState()
            const fp = store.preview.filePath || ''
            if (!fp) return
            const fromLine = view.state.doc.lineAt(selection.from).number
            const toLine = view.state.doc.lineAt(selection.to).number
            const selectedText = view.state.sliceDoc(selection.from, selection.to)
            const metadata = `[ref:${fp} ${fromLine}~${toLine}]\n`
            event.clipboardData?.setData('text/plain', metadata + selectedText)
            event.preventDefault()
        },
    })

    // Content processing — defined before the editor useEffect (used inside it)
    const rawContent = preview.fileContent || ''
    const showBinary = preview.mode === 'file' && preview.fileContent !== null && isBinaryContent(rawContent)
    const totalLines = rawContent ? rawContent.split('\n').length : 0
    const truncated = totalLines > MAX_FILE_LINES
    const displayContent = !showBinary && rawContent
        ? (truncated ? rawContent.split('\n').slice(0, MAX_FILE_LINES).join('\n') : rawContent)
        : ''
    const lineCount = totalLines
    const minimapLines = displayContent ? displayContent.split('\n').length : 0
    const showFile = preview.mode === 'file' && preview.fileContent && !showBinary
    const showDiff = preview.mode === 'diff' && preview.diffLines
    const showEmpty = preview.mode === null
    const showCommit = preview.mode === 'commit' && !!commitFiles
    const showMedia = preview.mode === 'media' && !!preview.filePath
    const isMarkdown = /\.(md|mdx|markdown)$/i.test(preview.filePath || '')
    const showMarkdownPreview = showFile && isMarkdown && mdPreviewMode

    const bgTask = selectedBgTaskId ? bgTasks.find(t => t.id === selectedBgTaskId) : null
    const bgLineCount = selectedBgTaskId ? (bgTaskLineCounts[selectedBgTaskId] || 0) : 0
    const bgCache = selectedBgTaskId ? bgTaskLogCache[selectedBgTaskId] : undefined
    const bgDisplayCount = selectedBgTaskId ? (bgTaskDisplayCount[selectedBgTaskId] || 50) : 50

    const bgLogs = useMemo(() => {
        if (!bgCache) return []
        return bgCache.lines.slice(Math.max(0, bgCache.lines.length - bgDisplayCount))
    }, [bgCache, bgDisplayCount])

    const bgHasMore = bgCache ? (bgCache.offset > 0 || bgDisplayCount < bgCache.lines.length) : false
    const showTask = preview.mode === 'task' && !maximized

    const saveContent = useCallback(async (content: string) => {
        const store = useStore.getState()
        const fp = store.preview.filePath
        const pp = store.projectPath
        if (!fp || !pp) return

        lspDocVersion++

        try {
            await Call.ByName('monika/internal/api.App.WriteFile', pp, fp, content)
            useStore.getState().markFileClean(fp)
            if (lspEnabledRef.current) {
                lspService.didChange(pp, fp, content, lspDocVersion).catch(() => { })
            }
            clearTimeout(diagTimeoutRef.current)
            diagTimeoutRef.current = setTimeout(async () => {
                const store = useStore.getState()
                const fp2 = store.preview.filePath
                const pp2 = store.projectPath
                if (!fp2 || !pp2) return
                try {
                    const diags = await lspService.diagnostics(pp2, fp2)
                    setDiagnostics(diags)
                } catch { }
            }, 500)
        } catch (e) {
            console.error('[preview] save failed:', e)
        }
    }, [lspEnabled])

    const navHistoryRef = useRef<{ path: string; line: number; col: number }[]>([])
    const navIndexRef = useRef(-1)

    const pushNavHistory = useCallback((loc: { path: string; line: number; col: number }) => {
        navHistoryRef.current = navHistoryRef.current.slice(0, navIndexRef.current + 1)
        navHistoryRef.current.push(loc)
        if (navHistoryRef.current.length > 50) navHistoryRef.current.shift()
        navIndexRef.current = navHistoryRef.current.length - 1
    }, [])

    const goBack = useCallback(() => {
        if (navIndexRef.current <= 0) return
        navIndexRef.current--
        const loc = navHistoryRef.current[navIndexRef.current]
        navigateToLocation(loc)
    }, [])

    const goForward = useCallback(() => {
        if (navIndexRef.current >= navHistoryRef.current.length - 1) return
        navIndexRef.current++
        const loc = navHistoryRef.current[navIndexRef.current]
        navigateToLocation(loc)
    }, [])

    const navKeymap = [
        { key: 'Alt-ArrowLeft', run: () => { goBack(); return true } },
        { key: 'Alt-ArrowRight', run: () => { goForward(); return true } },
    ]

    const navigateToLocation = useCallback(async (loc: { path: string; line: number; col: number }) => {
        const store = useStore.getState()
        const curPath = store.preview.filePath

        if (loc.path === curPath) {
            pushNavHistory(loc)
            return
        }

        try {
            const decodedPath = decodeURIComponent(loc.path)
            const result: any = await Call.ByName(
                'monika/internal/api.App.ReadFile',
                store.projectPath,
                decodedPath,
            )
            store.setPreviewFile(decodedPath, decodedPath.split(/[/\\]/).pop() || '', result.content)
        } catch (e) {
            console.error('[lsp] failed to open file:', loc.path, e)
        }
    }, [pushNavHistory])

    const handleSymbolClick = useCallback((sym: LspSymbol) => {
        const mEditor = monacoEditorRef.current
        if (mEditor) {
            const pos = { lineNumber: sym.startLine + 1, column: sym.startCol + 1 }
            mEditor.setPosition(pos)
            mEditor.revealPositionInCenter(pos)
            mEditor.focus()
            return
        }
        const view = editorRef.current
        if (!view) return
        const line = view.state.doc.line(sym.startLine + 1)
        const from = line.from + sym.startCol
        view.dispatch({
            selection: { anchor: from },
            effects: EditorView.scrollIntoView(from, { y: 'center' }),
        })
    }, [])

    const goToDefinitionHandler = EditorView.domEventHandlers({
        mousedown: (event, view) => {
            if (!event.ctrlKey && !event.metaKey) return
            if (!lspEnabledRef.current) return

            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
            if (pos === null) return
            const line = view.state.doc.lineAt(pos)
            const lineNum = line.number - 1
            const col = pos - line.from

            const store = useStore.getState()
            const fp = store.preview.filePath
            const pp = store.projectPath
            if (!fp || !pp) return

            event.preventDefault()

            lspService.goToDefinition(pp, fp, lineNum, col).then((locs) => {
                if (!locs || locs.length === 0) return
                if (locs.length === 1) {
                    navigateToLocation(locs[0])
                } else {
                    setPeekPanel({
                        title: 'Go to Definition',
                        items: locs,
                    })
                }
            }).catch(() => { })
        },
    })

    const contextmenuHandler = EditorView.domEventHandlers({
        contextmenu: (event, view) => {
            if (!lspEnabledRef.current) return

            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
            if (pos === null) return
            const line = view.state.doc.lineAt(pos)
            const lineNum = line.number - 1
            const col = pos - line.from

            event.preventDefault()
            showContextMenu(event.clientX, event.clientY, view, lineNum, col)
        },
    })

    const lspEnabledRef = useRef(lspEnabled)
    lspEnabledRef.current = lspEnabled

    // Initial load when task is selected
    useEffect(() => {
        if (!selectedBgTaskId || !showTask) return
        const store = useStore.getState()
        store.loadBgTaskLogs(selectedBgTaskId, -200, 200)
        bgStickToBottomRef.current = true
        const timer = setTimeout(() => {
            const el = bgLogRef.current
            if (el) el.scrollTop = el.scrollHeight
        }, 100)
        return () => clearTimeout(timer)
    }, [selectedBgTaskId, showTask])

    // Debounced refresh when line count changes
    const bgLineCountRef = useRef(bgLineCount)
    const bgDebounceRef = useRef<ReturnType<typeof setTimeout>>()
    useEffect(() => {
        if (!showTask || !selectedBgTaskId) return
        if (bgLineCount === bgLineCountRef.current) return
        bgLineCountRef.current = bgLineCount

        clearTimeout(bgDebounceRef.current)
        bgDebounceRef.current = setTimeout(() => {
            const store = useStore.getState()
            store.loadBgTaskLogs(selectedBgTaskId, -200, 200)
            if (bgStickToBottomRef.current) {
                requestAnimationFrame(() => {
                    const el = bgLogRef.current
                    if (el) el.scrollTop = el.scrollHeight
                })
            }
        }, 300)

        return () => clearTimeout(bgDebounceRef.current)
    }, [bgLineCount, showTask, selectedBgTaskId])

    // IntersectionObserver for lazy loading older lines on scroll to top
    useEffect(() => {
        const el = bgSentinelRef.current
        const scrollEl = bgLogRef.current
        if (!el || !scrollEl || !bgHasMore || !selectedBgTaskId) return

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    bgPrevScrollHeightRef.current = scrollEl.scrollHeight
                    useStore.getState().loadMoreBgTaskLines(selectedBgTaskId)
                }
            },
            { root: scrollEl, threshold: 0 }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [bgHasMore, selectedBgTaskId])

    // Restore scroll position after prepending older messages
    useLayoutEffect(() => {
        if (bgPrevScrollHeightRef.current > 0) {
            const scrollEl = bgLogRef.current
            if (scrollEl) {
                const delta = scrollEl.scrollHeight - bgPrevScrollHeightRef.current
                if (delta > 0) {
                    scrollEl.scrollTop += delta
                }
            }
            bgPrevScrollHeightRef.current = 0
        }
    }, [bgDisplayCount, bgCache?.lines.length])

    // Track stick-to-bottom state
    useEffect(() => {
        const el = bgLogRef.current
        if (!el) return
        const onScroll = () => {
            const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
            bgStickToBottomRef.current = nearBottom
        }
        el.addEventListener('scroll', onScroll)
        return () => el.removeEventListener('scroll', onScroll)
    }, [showTask, selectedBgTaskId])
    // Ctrl+F toggles search in task mode
    useEffect(() => {
        if (!showTask) return
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault()
                setBgSearchOpen(true)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [showTask])

    const hoverProvider = hoverTooltip(async (view, pos) => {
        if (!lspEnabledRef.current) { console.log('[preview] hover skipped: lspEnabled=false'); return null }
        const store = useStore.getState()
        const fp = store.preview.filePath
        const pp = store.projectPath
        if (!fp || !pp) { console.log('[preview] hover skipped: no fp/pp'); return null }
        const line = view.state.doc.lineAt(pos)
        const lineNum = line.number - 1
        const col = pos - line.from
        console.log('[preview] hover query:', fp, lineNum, col)
        try {
            const result = await lspService.hover(pp, fp, lineNum, col)
            if (!result || !result.contents) return null
            return {
                pos, end: pos, above: true,
                create() {
                    const dom = document.createElement('div')
                    dom.style.cssText = `
                        max-width: 500px; max-height: 300px; overflow-y: auto;
                        padding: 8px 12px; font-size: 12px; font-family: var(--font-mono);
                        line-height: 1.5; color: #abb2bf; background: #1e1e1e;
                        border: 1px solid #333; border-radius: 4px;
                        white-space: pre-wrap; word-break: break-word;
                    `
                    dom.innerHTML = escapeHtml(result.contents)
                        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
                            `<pre style="background:#2d2d2d;padding:6px 8px;border-radius:3px;overflow-x:auto;margin:4px 0">${code}</pre>`)
                        .replace(/\n/g, '<br>')
                    return { dom }
                },
            }
        } catch { return null }
    }, { hoverTime: 500 })

    // Auto-save + dirty tracking for Monaco
    const handleMonacoChange = useCallback((val: string) => {
        const st = useStore.getState()
        if (st.preview.filePath) st.markFileDirty(st.preview.filePath)
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => saveContent(val), 300)
    }, [saveContent])

    const saveUpdateListener = EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        const state = useStore.getState()
        if (state.preview.filePath) {
            state.markFileDirty(state.preview.filePath)
        }
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(saveContent, 300)
    })

    const cursorUpdateListener = EditorView.updateListener.of((update) => {
        if (!update.view.composing && update.selectionSet) {
            const sel = update.state.selection.main
            const line = update.state.doc.lineAt(sel.from)
            setCurrentLine(line.number - 1)
            setCursorPos({ line: line.number - 1, col: sel.from - line.from })
        }
    })

    const sharedEditorExtensions = [
        previewTheme, syntaxHighlighting(oneDarkHighlightStyle), lineNumbers(),
        highlightSpecialChars(), drawSelection(), dropCursor(),
        keymap.of(defaultKeymap), keymap.of(navKeymap),
        history(),
        foldGutter(), treeSitterFoldService,
        bracketMatching(),
        indentOnInput(),
        closeBrackets(),
        autocompletion({ override: [lspCompletionSource] }),
        search({ top: true }),
        keymap.of([
            ...closeBracketsKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...completionKeymap,
            indentWithTab,
        ]),
        keymap.of([{
            key: 'Mod-s',
            run: (view) => {
                const content = view.state.doc.toString()
                const state = useStore.getState()
                const filePath = state.preview.filePath
                const projectPath = state.projectPath
                if (filePath && projectPath) {
                    Call.ByName('monika/internal/api.App.WriteFile', projectPath, filePath, content).then(() => {
                        useStore.getState().markFileClean(filePath)
                        lspService.didChange(projectPath, filePath, content, lspDocVersion).catch(() => { })
                    }).catch((err: any) => {
                        console.error('Save failed:', err)
                    })
                }
                return true
            },
            preventDefault: true,
        }]),
        keymap.of([{
            key: 'F12',
            run: (view) => {
                const state = useStore.getState()
                if (!state.preview.filePath || !state.projectPath) return false
                const pos = view.state.selection.main.head
                const line = view.state.doc.lineAt(pos)
                const char = pos - line.from
                lspService.goToDefinition(state.projectPath, state.preview.filePath, line.number - 1, char)
                    .then((locs) => {
                        if (locs && locs.length > 0) {
                            const loc = locs[0]
                            if (loc.path === state.preview.filePath) {
                                view.dispatch({
                                    selection: { anchor: view.state.doc.line(loc.line + 1).from + loc.col },
                                    scrollIntoView: true,
                                })
                            }
                        }
                    }).catch(() => { })
                return true
            },
        }]),
        copyHandler, goToDefinitionHandler, contextmenuHandler,
        saveUpdateListener, cursorUpdateListener, hoverProvider,
    ]

    useEffect(() => {
        setLspEnabled(true)
        lspEnabledRef.current = true
    }, [preview.filePath])

    // Fetch document symbols for Monaco editor (CM6 path is disabled)
    // Backend blocks until LSP server is ready (up to ~2s), so single call is enough
    useEffect(() => {
        if (preview.mode !== 'file' || !preview.filePath) {
            setSymbols([])
            return
        }
        const pp = useStore.getState().projectPath
        if (!pp) return
        let cancelled = false
        console.log('[symbols] useEffect fired: file=%s mode=%s showSymbols=%s project=%s', preview.filePath, preview.mode, showSymbols, pp)
        lspService.openFile(pp, preview.filePath).then(() => {
            console.log('[symbols] openFile OK, calling documentSymbols...')
            if (cancelled) return
            return lspService.documentSymbols(pp, preview.filePath!)
        }).then(syms => {
            console.log('[symbols] documentSymbols returned:', syms ? `${syms.length} items` : 'null', syms)
            if (cancelled || !syms) return
            setSymbols(syms)
        }).catch((e) => { console.error('[symbols] error:', e) })
        return () => { cancelled = true }
    }, [preview.filePath, preview.mode, showSymbols])

    useEffect(() => {
        if (true) return; // CM6 disabled — using Monaco instead
        if (!containerRef.current || preview.mode !== 'file' || !preview.fileContent || showBinary) {
            if (editorRef.current) {
                editorRef.current!.destroy()
                editorRef.current = null
            }
            return
        }
        if (editorRef.current) {
            editorRef.current!.destroy()
            editorRef.current = null
        }
        if (prevFilePathRef.current && lspEnabledRef.current) {
            const store = useStore.getState()
            lspService.closeFile(store.projectPath, prevFilePathRef.current!).catch(() => { })
        }
        prevFilePathRef.current = null

        console.log('[preview] creating editor, lspEnabled:', lspEnabled, 'file:', preview.filePath, 'extensions count:', sharedEditorExtensions.length)

        const state = EditorState.create({
            doc: displayContent,
            extensions: sharedEditorExtensions,
        })
        editorRef.current = new EditorView({ state, parent: containerRef.current! })

        if (!truncated) {
            (async () => {
                try {
                    await treeSitterInitPromise
                    console.log('[preview] tree-sitter init complete')
                    const langName = getLanguageForFile(preview.filePath || '')
                    console.log('[preview] langName for', preview.filePath, ':', langName)
                    if (!langName) return
                    const lang = await getLanguage(langName)
                    console.log('[preview] lang loaded:', !!lang)
                    if (!lang || !containerRef.current) return
                    const cur = useStore.getState().preview
                    if (cur.mode !== 'file' || cur.filePath !== preview.filePath) return
                    if (!displayContent) return
                    foldRanges = computeFoldableRanges(displayContent, lang)
                    const hlState = EditorState.create({
                        doc: displayContent,
                        extensions: [
                            ...sharedEditorExtensions,
                            treeSitterHighlightExtension(lang),
                        ],
                    })
                    editorRef.current?.destroy()
                    editorRef.current = new EditorView({ state: hlState, parent: containerRef.current })
                    // Open current file's LSP session (tree-sitter editor ready)
                    if (preview.filePath && lspEnabledRef.current) {
                        const store = useStore.getState()
                        const pp = store.projectPath
                        console.log('[preview] opening LSP for (ts):', preview.filePath, 'project:', pp)
                        if (pp) {
                            lspService.openFile(pp, preview.filePath).then(() => {
                                console.log('[preview] LSP openFile OK (ts), fetching symbols...')
                                setLspEnabled(true)
                                lspService.documentSymbols(pp!, preview.filePath!).then(syms => {
                                    console.log('[preview] symbols fetched (ts):', syms ? syms.length : 0)
                                    if (syms) setSymbols(syms)
                                }).catch((e) => { console.log('[preview] symbols fetch failed (ts):', e) })
                            }).catch((e) => {
                                console.log('[preview] LSP openFile failed (ts):', e)
                                setLspEnabled(false)
                            })
                            prevFilePathRef.current = preview.filePath
                        }
                    }
                } catch {
                    // Tree-sitter unavailable — plain editor is already shown
                    // Open LSP with plain editor instead
                    if (preview.filePath && lspEnabledRef.current) {
                        const store = useStore.getState()
                        const pp = store.projectPath
                        if (pp) {
                            lspService.openFile(pp, preview.filePath).then(() => {
                                setLspEnabled(true)
                                lspService.documentSymbols(pp!, preview.filePath!).then(syms => {
                                    if (syms) setSymbols(syms)
                                }).catch(() => { })
                            }).catch(() => {
                                setLspEnabled(false)
                            })
                            prevFilePathRef.current = preview.filePath
                        }
                    }
                }
            })()
        } else if (preview.filePath && lspEnabledRef.current) {
            // Truncated file — no tree-sitter upgrade, open LSP with plain editor
            const store = useStore.getState()
            const pp = store.projectPath
            if (pp) {
                lspService.openFile(pp, preview.filePath!).then(() => {
                    setLspEnabled(true)
                    lspService.documentSymbols(pp!, preview.filePath!).then(syms => {
                        if (syms) setSymbols(syms)
                    }).catch(() => { })
                }).catch(() => {
                    setLspEnabled(false)
                })
                prevFilePathRef.current = preview.filePath
            }
        }

        return () => {
            clearTimeout(saveTimeoutRef.current)
            clearTimeout(diagTimeoutRef.current)
            if (prevFilePathRef.current && lspEnabled) {
                const store = useStore.getState()
                lspService.closeFile(store.projectPath, prevFilePathRef.current).catch(() => { })
            }
        }
    }, [preview.mode, preview.fileContent, preview.filePath])


    const showContextMenu = useCallback((x: number, y: number, _view: any, line: number, col: number) => {
        setContextMenu({ x, y, line, col })
    }, [])

    const applyWorkspaceEdit = useCallback(async (edit: any, _view: EditorView, projectPath: string) => {
        for (const fileEdit of edit.changes) {
            const curPath = useStore.getState().preview.filePath
            if (fileEdit.path === curPath) {
                const view = editorRef.current
                if (!view) continue
                const sorted = [...fileEdit.edits].sort((a: any, b: any) => b.startLine - a.startLine || b.startCol - a.startCol)
                const tr = view.state.update({
                    changes: sorted.map((e: any) => ({
                        from: view.state.doc.line(e.startLine + 1).from + e.startCol,
                        to: view.state.doc.line(e.endLine + 1).from + e.endCol,
                        insert: e.newText,
                    })),
                })
                view.dispatch(tr)
            } else {
                try {
                    const result: any = await Call.ByName(
                        'monika/internal/api.App.ReadFile', projectPath, fileEdit.path,
                    )
                    let content = result.content
                    const lines = content.split('\n')
                    const sorted = [...fileEdit.edits].sort((a: any, b: any) => b.startLine - a.startLine || b.startCol - a.startCol)
                    for (const e of sorted) {
                        if (lines[e.startLine] === undefined) continue
                        const before = lines[e.startLine].slice(0, e.startCol)
                        const after = (lines[e.endLine] || '').slice(e.endCol)
                        const newLines = e.newText.split('\n')
                        lines.splice(e.startLine, e.endLine - e.startLine + 1, before + newLines[0])
                        for (let i = 1; i < newLines.length; i++) {
                            lines.splice(e.startLine + i, 0, newLines[i])
                        }
                        lines[e.startLine + newLines.length - 1] += after
                    }
                    content = lines.join('\n')
                    await Call.ByName('monika/internal/api.App.WriteFile', projectPath, fileEdit.path, content)
                } catch (e) {
                    console.error('[lsp] failed to apply edit to:', fileEdit.path, e)
                }
            }
        }
    }, [])

    const breadcrumbs = useMemo(() => {
        if (!symbols.length || currentLine === null) return [] as { name: string; sym: LspSymbol }[]
        const path: { name: string; sym: LspSymbol }[] = []
        const walk = (syms: LspSymbol[]): boolean => {
            for (const s of syms) {
                if (currentLine >= s.startLine && currentLine <= s.endLine) {
                    path.push({ name: s.name, sym: s })
                    if (s.children && s.children.length > 0 && walk(s.children)) return true
                    return true
                }
            }
            return false
        }
        walk(symbols)
        return path
    }, [symbols, currentLine])

    const showBreadcrumbMenu = useCallback((e: React.MouseEvent, sym: LspSymbol) => {
        const idx = breadcrumbs.findIndex(bc => bc.sym === sym)
        const siblings = idx <= 0 ? symbols : (breadcrumbs[idx - 1].sym.children || [])
        setBreadcrumbMenu({
            x: e.currentTarget.getBoundingClientRect().left,
            y: e.currentTarget.getBoundingClientRect().bottom,
            siblings,
        })
    }, [breadcrumbs, symbols])

    const handleBreadcrumbClick = useCallback((sym: LspSymbol) => {
        const mEditor = monacoEditorRef.current
        if (mEditor) {
            const pos = { lineNumber: sym.startLine + 1, column: sym.startCol + 1 }
            mEditor.setPosition(pos)
            mEditor.revealPositionInCenter(pos)
            return
        }
        const view = editorRef.current
        if (!view) return
        const line = view.state.doc.line(sym.startLine + 1)
        const from = line.from + sym.startCol
        view.dispatch({
            selection: { anchor: from },
            effects: EditorView.scrollIntoView(from, { y: 'center' }),
        })
    }, [])

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--bg-root)' }}>
            <div ref={headerRef} style={{ display: 'none' }} />
            <div
                className="flex items-center gap-1.5 select-none shrink-0"
                style={{ fontFamily: 'var(--font-sans)', fontSize: 12, padding: '5px 6px 5px 10px', background: 'var(--bg-sidebar)' }}
            >
                <span className="truncate min-w-0">{showTask ? 'TASK' : (maximized && showFile) ? 'EDITOR' : 'PREVIEW'}</span>
                <div className="flex-1" />
                {!showTask && (
                    <>
                        <div
                            onClick={() => setShowSymbols(!showSymbols)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 22, height: 22, borderRadius: 4,
                                color: showSymbols ? 'var(--accent)' : 'var(--text-dim)',
                                cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s, background 0.15s',
                            }}
                            title="Toggle symbol sidebar"
                        >
                            <IconSidebar size={12} />
                        </div>
                        {showFile && isMarkdown && (
                            <div
                                onClick={() => setMdPreviewMode(!mdPreviewMode)}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = mdPreviewMode ? 'var(--accent)' : 'var(--text-dim)' }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 22, height: 22, borderRadius: 4,
                                    color: mdPreviewMode ? 'var(--accent)' : 'var(--text-dim)',
                                    cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s, background 0.15s',
                                }}
                                title={mdPreviewMode ? 'Switch to Edit mode' : 'Switch to Preview mode'}
                            >
                                {mdPreviewMode ? <IconEye size={12} /> : <IconEdit size={12} />}
                            </div>
                        )}
                    </>
                )}
                <div
                    onClick={toggleMaximize}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s, background 0.15s' }}
                    title={maximized ? 'Restore' : 'Maximize'}
                >
                    {maximized ? (
                        <IconRestore size={12} />
                    ) : (
                        <IconMaximize size={12} />
                    )}
                </div>
            </div>

            {/* Background task detail */}
            <div style={{ display: showTask ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
                {/* Unified header: command + inline metadata */}
                <div className="px-4 py-2.5 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                        {bgTask?.status === 'running' ? (
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
                        ) : bgTask?.status === 'stopped' ? (
                            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        ) : (
                            <span className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" />
                        )}
                        <div className="text-sm font-mono font-semibold text-[var(--text)] break-all flex-1 min-w-0">{bgTask?.command}</div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {/* PID */}
                            <span className="text-[11px] text-[var(--text-muted)] font-mono">PID {bgTask?.pid}</span>
                            <span className="text-[11px] text-[var(--text-muted)] font-mono">
                                {bgTask ? (() => {
                                    const elapsed = Date.now() - new Date(bgTask.started_at).getTime()
                                    const sec = Math.floor(elapsed / 1000)
                                    if (sec < 60) return `${sec}s`
                                    const min = Math.floor(sec / 60)
                                    const hrs = Math.floor(min / 60)
                                    if (hrs > 0) return `${hrs}h ${min % 60}m`
                                    return `${min}m ${sec % 60}s`
                                })() : ''}
                            </span>
                            {bgTask && bgTask.exit_code > 0 && (
                                <span className="text-[11px] text-red-400 font-mono">exit {bgTask.exit_code}</span>
                            )}
                            {bgTask?.status === 'running' && (
                                <button
                                    onClick={() => stopBgTask(bgTask!.id)}
                                    className="text-[11px] px-2 py-0.5 rounded bg-red-600/80 text-white hover:bg-red-600 transition-colors duration-100"
                                >Stop</button>
                            )}
                            <button
                                onClick={() => { setBgSearchOpen(v => !v); if (bgSearchOpen) setBgSearchQuery('') }}
                                className="flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                                style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0 }}
                                title="Search (Ctrl+F)"
                            ><IconSearch size={13} /></button>
                        </div>
                    </div>
                </div>
                {/* Search bar */}
                {bgSearchOpen && (
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-sidebar)]">
                        <IconSearch size={12} />
                        <input
                            autoFocus
                            value={bgSearchQuery}
                            onChange={e => setBgSearchQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { setBgSearchOpen(false); setBgSearchQuery('') } }}
                            placeholder="Filter logs..."
                            className="flex-1 bg-transparent text-xs text-[var(--text)] outline-none font-mono placeholder:text-[var(--text-dim)]"
                        />
                        {bgSearchQuery && (
                            <span className="text-[11px] text-[var(--text-muted)] font-mono flex-shrink-0">
                                {bgLogs.filter(l => stripAnsi(l).toLowerCase().includes(bgSearchQuery.toLowerCase())).length} / {bgLogs.length}
                            </span>
                        )}
                        <button
                            onClick={() => { setBgSearchOpen(false); setBgSearchQuery('') }}
                            className="text-[var(--text-muted)] hover:text-[var(--text)] flex-shrink-0"
                            style={{ flexShrink: 0 }}
                        ><IconClose size={12} /></button>
                    </div>
                )}
                {/* Log output — terminal area */}
                <div ref={bgLogRef} className="flex-1 overflow-auto" style={{ background: '#080a0e' }}>
                    {bgHasMore && <div ref={bgSentinelRef} style={{ height: 1 }} />}
                    <pre className="p-4 text-xs font-mono text-[#abb2bf] whitespace-pre-wrap leading-relaxed"><AnsiText text={(bgSearchQuery ? bgLogs.filter(l => stripAnsi(l).toLowerCase().includes(bgSearchQuery.toLowerCase())) : bgLogs).join('\n')} /></pre>
                </div>
                {/* Bottom status bar */}
                <div className="px-4 py-1.5 border-t border-[var(--border)] text-[11px] text-[var(--text-dim)] bg-[var(--bg-sidebar)] flex items-center gap-3">
                    <span>Started: {bgTask ? new Date(bgTask.started_at).toLocaleString() : ''}</span>
                    {bgTask && bgTask.exit_code > 0 && (
                        <span className="text-red-400">Exit code: {bgTask.exit_code}</span>
                    )}
                </div>
            </div>

            {/* File preview — wrapper always mounted for CodeMirror DOM safety    */}
            <div
                className={`flex flex-1 min-h-0 ${maximized ? 'flex-row' : 'flex-col'}`}
                style={{ display: showFile ? 'flex' : 'none' }}
            >
                {maximized && (
                    <div style={{ width: 260, flexShrink: 0, height: '100%', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
                        <FileTree hideTasks={true} {...({} as any)} />
                    </div>
                )}
                {showFile ? (<div className="flex flex-col flex-1 min-h-0" style={{ position: 'relative' }}>

                    <FilePreviewHeader
                        fileName={preview.fileName || ''}
                        filePath={preview.filePath || ''}
                        lineCount={lineCount}
                        truncated={truncated}
                    />
                    {refreshBanner && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '4px 10px',
                                fontSize: 11,
                                background: 'rgba(229,192,123,0.1)',
                                borderBottom: '1px solid rgba(229,192,123,0.2)',
                                color: '#e5c07b',
                            }}
                        >
                            <span style={{ flex: 1 }}>File was modified by AI assistant</span>
                            <button
                                onClick={async () => {
                                    const store = useStore.getState()
                                    const fp = store.preview.filePath
                                    const pp = store.projectPath
                                    if (!fp || !pp) return
                                    try {
                                        const result: any = await Call.ByName('monika/internal/api.App.ReadFile', pp, fp)
                                        store.setPreviewFile(fp, fp.split(/[/\\]/).pop() || '', result.content)
                                    } catch { }
                                    useStore.setState({ previewNeedsRefresh: null })
                                    setRefreshBanner(false)
                                }}
                                style={{
                                    padding: '2px 8px',
                                    borderRadius: 3,
                                    border: '1px solid rgba(229,192,123,0.3)',
                                    background: 'transparent',
                                    color: '#e5c07b',
                                    cursor: 'pointer',
                                    fontSize: 10,
                                }}
                            >
                                Reload
                            </button>
                        </div>
                    )}
                    <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
                        {showMarkdownPreview ? (
                            <MarkdownPreview
                                content={rawContent}
                                filePath={preview.filePath || ''}
                            />
                        ) : (
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                <MonacoPreview
                                    filePath={preview.filePath || ''}
                                    projectPath={useStore.getState().projectPath}
                                    content={displayContent}
                                    onSave={saveContent}
                                    onContentChange={handleMonacoChange}
                                    onCursorChange={(line, col) => {
                                        setCurrentLine(line)
                                        setCursorPos({ line, col })
                                    }}
                                    onEditorMount={(editor) => {
                                        monacoEditorRef.current = editor
                                    }}
                                />
                            </div>
                        )}
                        {showSymbols && (
                            <LspSymbolSidebar
                                symbols={symbols}
                                onSymbolClick={handleSymbolClick}
                                currentLine={currentLine}
                            />
                        )}

                        {editorRef.current && !isMarkdown && (
                            <CodeMinimap
                                content={displayContent}
                                totalLines={minimapLines}
                                editorView={editorRef.current}
                                width={50}
                                diagnostics={diagnostics}
                            />
                        )}
                    </div>
                    {/* Bottom status bar with breadcrumbs + cursor */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 10px',
                            height: 22,
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: '#5c6370',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            background: '#0a0b10',
                            flexShrink: 0,
                            gap: 6,
                        }}
                    >
                        {/* Breadcrumbs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
                            {breadcrumbs.length === 0 && (
                                <span style={{ color: '#3e4451', fontStyle: 'italic' }}>no symbols</span>
                            )}
                            {breadcrumbs.map((bc, i) => (
                                <React.Fragment key={bc.name + i}>
                                    {i > 0 && <span style={{ color: '#3e4451', flexShrink: 0 }}>&gt;</span>}
                                    <span
                                        onClick={(e) => showBreadcrumbMenu(e, bc.sym)}
                                        style={{
                                            cursor: 'pointer',
                                            color: '#8b8fa0',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: 120,
                                        }}
                                        title={bc.name}
                                    >
                                        {bc.name}
                                    </span>
                                </React.Fragment>
                            ))}
                        </div>
                        {/* Cursor position + language */}
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0, color: '#3e4451' }}>
                            <span>Ln {cursorPos.line + 1}, Col {cursorPos.col + 1}</span>
                            {isDirtyPanel && <span style={{ color: '#e5c07b' }}>● Unsaved</span>}
                            <span>{getLangLabel(preview.filePath || '') || ''}</span>
                        </div>
                    </div>
                    {breadcrumbMenu && (
                        <>
                            <div
                                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                                onClick={() => setBreadcrumbMenu(null)}
                            />
                            <div
                                style={{
                                    position: 'fixed',
                                    left: breadcrumbMenu.x,
                                    top: breadcrumbMenu.y,
                                    zIndex: 1000,
                                    background: '#1e1e1e',
                                    border: '1px solid #333',
                                    borderRadius: 6,
                                    padding: '4px 0',
                                    minWidth: 150,
                                    fontSize: 11,
                                    fontFamily: 'var(--font-mono)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                                }}
                            >
                                {breadcrumbMenu.siblings.map((s, i) => (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            setBreadcrumbMenu(null)
                                            handleBreadcrumbClick(s)
                                        }}
                                        style={{
                                            padding: '4px 12px',
                                            cursor: 'pointer',
                                            color: s.startLine === currentLine ? '#61afef' : '#abb2bf',
                                            background: s.startLine === currentLine ? 'rgba(97,175,239,0.08)' : 'transparent',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = s.startLine === currentLine ? 'rgba(97,175,239,0.08)' : 'transparent' }}
                                    >
                                        {s.name}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {peekPanel && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 100,
                                background: 'rgba(0,0,0,0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onClick={() => setPeekPanel(null)}
                        >
                            <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    background: '#1e1e2e',
                                    border: '1px solid #333',
                                    borderRadius: 8,
                                    padding: 12,
                                    minWidth: 360,
                                    maxHeight: '60%',
                                    overflow: 'auto',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                }}
                            >
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>
                                    {peekPanel.title}
                                </div>
                                {peekPanel.items.map((item, i) => (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            navigateToLocation(item)
                                            setPeekPanel(null)
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '4px 8px',
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            fontFamily: 'var(--font-mono)',
                                            color: '#a6adc8',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                                    >
                                        <span style={{ color: '#89b4fa' }}>{item.path}:{item.line + 1}:{item.col}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>) : (
                    <div className="flex flex-1 items-center justify-center" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                        Select a file to edit
                    </div>
                )}
            </div>
            {contextMenu && createPortal(
                <>
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                        onClick={() => setContextMenu(null)}
                    />
                    <div
                        style={{
                            position: 'fixed',
                            left: contextMenu.x,
                            top: contextMenu.y,
                            zIndex: 1000,
                            background: '#1e1e1e',
                            border: '1px solid #333',
                            borderRadius: 6,
                            padding: '4px 0',
                            minWidth: 180,
                            fontSize: 12,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        }}
                    >
                        {[
                            {
                                label: 'Go to Definition', shortcut: 'Ctrl+Click', action: async () => {
                                    try {
                                        const store = useStore.getState()
                                        const fp = store.preview.filePath
                                        const pp = store.projectPath
                                        if (!fp || !pp) return
                                        const locs = await lspService.goToDefinition(pp, fp, contextMenu.line, contextMenu.col)
                                        if (locs && locs.length > 0) navigateToLocation(locs[0])
                                    } catch (e) { console.warn('[lsp] go to definition error:', e) }
                                }
                            },
                            {
                                label: 'Go to Type Definition', action: async () => {
                                    try {
                                        const store = useStore.getState()
                                        const fp = store.preview.filePath
                                        const pp = store.projectPath
                                        if (!fp || !pp) return
                                        const locs = await lspService.typeDefinition(pp, fp, contextMenu.line, contextMenu.col)
                                        if (locs && locs.length > 0) navigateToLocation(locs[0])
                                    } catch (e) { console.warn('[lsp] type definition error:', e) }
                                }
                            },
                            {
                                label: 'Find Implementations', action: async () => {
                                    try {
                                        const store = useStore.getState()
                                        const fp = store.preview.filePath
                                        const pp = store.projectPath
                                        if (!fp || !pp) return
                                        const locs = await lspService.implementation(pp, fp, contextMenu.line, contextMenu.col)
                                        if (locs && locs.length > 0) navigateToLocation(locs[0])
                                    } catch (e) { console.warn('[lsp] implementation error:', e) }
                                }
                            },
                            {
                                label: 'Find All References', action: async () => {
                                    try {
                                        const store = useStore.getState()
                                        const fp = store.preview.filePath
                                        const pp = store.projectPath
                                        if (!fp || !pp) return
                                        const refs = await lspService.references(pp, fp, contextMenu.line, contextMenu.col)
                                        if (refs && refs.length > 0) {
                                            setPeekPanel({ title: 'References', items: refs })
                                        }
                                    } catch (e) { console.warn('[lsp] references error:', e) }
                                }
                            },
                            { type: 'separator' },
                            {
                                label: 'Rename Symbol...', action: async () => {
                                    try {
                                        if (!editorRef.current) return
                                        const store = useStore.getState()
                                        const fp = store.preview.filePath
                                        const pp = store.projectPath
                                        if (!fp || !pp) return
                                        const lineText = editorRef.current.state.doc.line(contextMenu.line + 1).text
                                        const word = lineText.slice(contextMenu.col).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/)
                                        const word2 = lineText.slice(0, contextMenu.col).match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/)
                                        const token = (word2 ? word2[0] : '') + (word ? word[0] : '')
                                        const newName = window.prompt('Rename symbol:', token)
                                        if (!newName || newName === token) return
                                        const edit = await lspService.rename(pp, fp, contextMenu.line, contextMenu.col, newName)
                                        if (edit) {
                                            await applyWorkspaceEdit(edit, editorRef.current, pp)
                                        }
                                    } catch (e) { console.warn('[lsp] rename error:', e) }
                                }
                            },
                            {
                                label: 'Code Actions...', action: async () => {
                                    try {
                                        const store = useStore.getState()
                                        const fp = store.preview.filePath
                                        const pp = store.projectPath
                                        if (!fp || !pp) return
                                        const actions = await lspService.codeActions(pp, fp, contextMenu.line, contextMenu.col)
                                        if (actions && actions.length > 0) {
                                            const titles = actions.map((a, i) => `${i + 1}. ${a.title}`)
                                            const choice = window.prompt(`Available code actions:\n${titles.join('\n')}\n\nEnter number (1-${actions.length}):`)
                                            if (choice) {
                                                const idx = parseInt(choice) - 1
                                                if (idx >= 0 && idx < actions.length) {
                                                    const result = await lspService.executeCodeAction(pp, actions[idx])
                                                    if (result && editorRef.current) {
                                                        await applyWorkspaceEdit(result, editorRef.current, pp)
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) { console.warn('[lsp] code actions error:', e) }
                                }
                            },
                        ].map((item, idx) => {
                            if ('type' in item && item.type === 'separator') {
                                return <div key={idx} style={{ height: 1, background: '#333', margin: '4px 8px' }} />
                            }
                            const i = item as { label: string; shortcut?: string; action: () => void }
                            return (
                                <div
                                    key={idx}
                                    onClick={() => { setContextMenu(null); i.action() }}
                                    style={{
                                        padding: '6px 16px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 24,
                                        color: '#abb2bf',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                >
                                    <span>{i.label}</span>
                                    {i.shortcut && (
                                        <span style={{ color: '#5c6370', fontSize: 11 }}>{i.shortcut}</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </>,
                document.body
            )}
            {
                showBinary && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-[13px] text-[var(--text-dim)] select-none">[Binary file — preview not available]</div>
                    </div>
                )
            }
            {
                showDiff && (
                    <DiffView lines={preview.diffLines!} fileName={preview.fileName || ''} conflictActive={preview.conflictActive} conflictAiContent={preview.conflictAiContent} />
                )
            }
            {
                showCommit && commitFiles && commitDetail && (
                    <div className="flex flex-col flex-1 overflow-hidden">
                        <div
                            className="flex items-center gap-2 px-3 py-2 shrink-0 border-b border-[var(--border)]"
                            style={{ background: 'var(--bg-sidebar)' }}
                        >
                            <span className="font-mono text-[12px]" style={{ color: 'var(--accent)' }}>
                                {commitHash?.slice(0, 7)}
                            </span>
                            <span className="flex-1 text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {commitDetail.message}
                            </span>
                            <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                                {commitDetail.author} · {commitDetail.date}
                            </span>
                        </div>
                        <div className="flex-1 flex overflow-hidden">
                            <div
                                className="flex-shrink-0 overflow-y-auto border-r border-[var(--border)]"
                                style={{ width: '200px', background: 'var(--bg-sidebar)' }}
                            >
                                <div className="px-2 pt-2 pb-1 text-[11px] text-[var(--text-dim)]" style={{ fontFamily: 'var(--font-sans)' }}>
                                    {commitFiles.length} file{commitFiles.length !== 1 ? 's' : ''} changed
                                </div>
                                {commitFiles.map((f: any) => (
                                    <div
                                        key={f.path}
                                        className="flex items-center gap-1 px-2 py-1 cursor-pointer text-[12px] leading-[20px] truncate"
                                        style={{
                                            color: selectedCommitFile === f.path ? 'var(--text-primary)' : 'var(--text-secondary)',
                                            background: selectedCommitFile === f.path ? 'var(--bg-active)' : 'transparent',
                                        }}
                                        onMouseEnter={(e) => { if (selectedCommitFile !== f.path) e.currentTarget.style.background = 'var(--bg-hover)' }}
                                        onMouseLeave={(e) => { if (selectedCommitFile !== f.path) e.currentTarget.style.background = 'transparent' }}
                                        onClick={() => {
                                            setSelectedCommitFile(f.path)
                                            setCommitFileDiff(f.path)
                                        }}
                                    >
                                        <span className="truncate flex-1">{f.path.split('/').pop()}</span>
                                        {f.added > 0 && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--green)' }}>+{f.added}</span>}
                                        {f.deleted > 0 && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--red)' }}>-{f.deleted}</span>}
                                    </div>
                                ))}
                            </div>
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {preview.diffLines ? (
                                    <DiffView lines={preview.diffLines} fileName={preview.fileName || ''} conflictActive={false} />
                                ) : (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="text-[13px] text-[var(--text-dim)] select-none">Select a file to view diff</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {
                showEmpty && (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-[13px] text-[var(--text-dim)] select-none">Select a file to preview</div>
                    </div>
                )
            }
            {
                showMedia && (
                    <MediaViewer
                        filePath={preview.filePath!}
                        fileName={preview.fileName || ''}
                        mime={preview.mediaMime || ''}
                    />
                )
            }
        </div >
    )
}
export default PreviewPanel

function MediaViewer({ filePath, fileName, mime }: { filePath: string; fileName: string; mime: string }) {
    const mediaUrl = `/__media__?path=${encodeURIComponent(filePath)}`
    const isVideo = mime.startsWith('video/')
    const isImage = mime.startsWith('image/')
    const isPdf = mime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
    const isAudio = mime.startsWith('audio/')

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div
                className="flex items-center gap-2 px-3 py-2 shrink-0 border-b"
                style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
            >
                {isVideo ? <IconVideo size={14} style={{ color: '#c084fc' }} /> : isImage ? <IconImage size={14} style={{ color: '#22d3ee' }} /> : isPdf ? <IconFileText size={14} style={{ color: '#f59e0b' }} /> : isAudio ? <IconMusic size={14} style={{ color: '#10b981' }} /> : null}
                <span className="text-[12px] truncate flex-1" style={{ color: 'var(--text)' }}>{fileName}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{mime}</span>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.2)' }}>
                {isImage && (
                    <img src={mediaUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                )}
                {isVideo && (
                    <video src={mediaUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />
                )}
                {isPdf && (
                    <iframe src={mediaUrl} style={{ width: '100%', height: '100%', border: 'none' }} title={fileName} />
                )}
                {isAudio && (
                    <audio controls src={mediaUrl} style={{ width: '100%' }} />
                )}
                {!isImage && !isVideo && !isPdf && !isAudio && (
                    <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>Unsupported media type: {mime}</span>
                )}
            </div>
        </div>
    )
}
