import { useRef, useCallback, useEffect } from 'react'
import Editor, { loader, BeforeMount, OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { Call } from '@wailsio/runtime'
import { initMonacoProviders, updateDiagnostics } from '../../lib/monacoProviders'
import { lspService } from '../../lib/lspService'
import { useStore } from '../../store'
import { applyTreeSitterDecorations } from '../../lib/monacoTreeSitterDecorations'

const MONIKA_THEME = 'monika-dark'

function defineMonikaTheme(m: typeof monaco) {
    m.editor.defineTheme(MONIKA_THEME, {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: '', foreground: 'cdd6f4' },
            { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
            { token: 'string', foreground: 'a6e3a1' },
            { token: 'number', foreground: 'fab387' },
            { token: 'constant.numeric', foreground: 'fab387' },
            { token: 'constant.language', foreground: 'f38ba8' },
            { token: 'constant', foreground: 'fab387' },
            { token: 'regexp', foreground: 'f5c2e7' },
            { token: 'keyword', foreground: 'cba6f7' },
            { token: 'keyword.control', foreground: 'cba6f7' },
            { token: 'keyword.operator', foreground: '89dceb' },
            { token: 'operator', foreground: '89dceb' },
            { token: 'delimiter', foreground: '9399b2' },
            { token: 'punctuation', foreground: '9399b2' },
            { token: 'entity.name.function', foreground: '89b4fa' },
            { token: 'support.function', foreground: '89b4fa' },
            { token: 'entity.name.type', foreground: 'f9e2af' },
            { token: 'entity.name.class', foreground: 'f9e2af' },
            { token: 'entity.name.namespace', foreground: 'f9e2af' },
            { token: 'support.type', foreground: 'f9e2af' },
            { token: 'support.class', foreground: 'f9e2af' },
            { token: 'type', foreground: 'f9e2af' },
            { token: 'variable.language', foreground: 'f38ba8' },
            { token: 'support.constant', foreground: 'fab387' },
            { token: 'entity.name.tag', foreground: 'f38ba8' },
            { token: 'entity.other.attribute-name', foreground: 'fab387' },
            { token: 'attribute.value', foreground: 'a6e3a1' },
            { token: 'tag', foreground: 'f38ba8' },
            { token: 'attribute.name', foreground: 'fab387' },
        ],
        colors: {
            'editor.background': '#0d0e12',
            'editor.foreground': '#cdd6f4',
            'editorLineNumber.foreground': '#3e4451',
            'editorLineNumber.activeForeground': '#8b8b9e',
            'editor.lineHighlightBackground': '#12141c',
            'editor.lineHighlightBorder': '#00000000',
            'editor.selectionBackground': '#264f7855',
            'editor.inactiveSelectionBackground': '#264f7833',
            'editorCursor.foreground': '#528bff',
            'editorWhitespace.foreground': '#2b2d35',
            'editorIndentGuide.background1': '#1a1c24',
            'editorIndentGuide.activeBackground1': '#2b2d35',
            'editorGutter.background': '#121319',
            'editor.foldBackground': '#12141c',
            'editorBracketMatch.background': '#4b7ddb22',
            'editorBracketMatch.border': '#4b7ddb55',
            'editorOverviewRuler.border': '#0d0e12',
            'scrollbarSlider.background': '#ffffff11',
            'scrollbarSlider.hoverBackground': '#ffffff22',
            'scrollbarSlider.activeBackground': '#ffffff33',
            'minimap.background': '#121319',
        },
    })
}

// Init Monaco workers and register our LSP providers once
let providersInitialized = false
loader.config({ monaco })
if (!providersInitialized) {
    providersInitialized = true
    loader.init().then(m => {
        defineMonikaTheme(m)
        initMonacoProviders(m)
    })
}

interface MonacoPreviewProps {
    filePath: string
    projectPath: string
    content: string
    language?: string
    onContentChange?: (content: string) => void
    onCursorChange?: (line: number, col: number) => void
    onEditorMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void
    onSave?: (content: string) => void
}

function extToMonacoLang(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        mjs: 'javascript', py: 'python', go: 'go', rs: 'rust',
        json: 'json', css: 'css', scss: 'scss', less: 'less',
        html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
        md: 'markdown', mdx: 'markdown',
        yaml: 'yaml', yml: 'yaml', toml: 'plaintext',
        sh: 'shell', bash: 'shell', zsh: 'shell',
        sql: 'sql', graphql: 'graphql', gql: 'graphql',
        java: 'java', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
        kt: 'kotlin', swift: 'swift', dart: 'dart',
    }
    return map[ext] || 'plaintext'
}

function createMonikaUri(pp: string, fp: string) {
    return monaco.Uri.parse('monika://' + encodeURIComponent(pp) + '/' + encodeURIComponent(fp))
}

let diagTimer: ReturnType<typeof setTimeout> | null = null

let pendingNav: { path: string; line: number; column: number } | null = null

export default function MonacoPreview({ filePath, projectPath, content, language, onContentChange, onCursorChange, onEditorMount, onSave }: MonacoPreviewProps) {
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
    const modelRef = useRef<monaco.editor.ITextModel | null>(null)
    const contentRef = useRef(content)
    const decoIdsRef = useRef<string[]>([])
    const decoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const languageId = language || extToMonacoLang(filePath)
    const uri = createMonikaUri(projectPath, filePath)

    const scheduleDiagnostics = useCallback(() => {
        if (diagTimer) clearTimeout(diagTimer)
        diagTimer = setTimeout(async () => {
            const model = modelRef.current
            if (!model) return
            try {
                const diags = await lspService.diagnostics(projectPath, filePath)
                if (diags) updateDiagnostics(model, diags)
            } catch { /* ignore */ }
        }, 500)
    }, [projectPath, filePath])

    const handleEditorBeforeMount: BeforeMount = useCallback((monacoInstance) => {
        // Create or reuse model with monika:// URI so providers can extract project/file path
        const existing = monacoInstance.editor.getModel(uri)
        if (existing) {
            existing.setValue(content)
            modelRef.current = existing
        } else {
            const model = monacoInstance.editor.createModel(content, languageId, uri)
            modelRef.current = model
            // Sync content to LSP
            lspService.didChange(projectPath, filePath, content, Date.now()).catch(() => { })
        }
    }, [uri, content, languageId, projectPath, filePath])

    const handleEditorDidMount: OnMount = useCallback((editorInstance, monacoInstance) => {
        editorRef.current = editorInstance

        applyTreeSitterDecorations(editorInstance, content, filePath, decoIdsRef.current).then(ids => {
            decoIdsRef.current = ids
        }).catch(() => { })
        onEditorMount?.(editorInstance)

        // Cursor position tracking
        editorInstance.onDidChangeCursorPosition(e => {
            onCursorChange?.(e.position.lineNumber - 1, e.position.column - 1)
        })

        // Register editor opener with correct openCodeEditor method (monaco 0.55.x)
        monacoInstance.editor.registerEditorOpener({
            async openCodeEditor(_source, resource, selectionOrPosition) {
                const fp = decodeURIComponent(resource.path.replace(/^\//, ''))
                const store = useStore.getState()
                const currentModel = editorInstance.getModel()
                const currentUri = currentModel?.uri

                if (currentUri && currentUri.toString() === resource.toString()) {
                    if (selectionOrPosition) {
                        const pos = 'lineNumber' in selectionOrPosition && 'column' in selectionOrPosition
                            ? selectionOrPosition as monaco.IPosition
                            : { lineNumber: (selectionOrPosition as monaco.IRange).startLineNumber, column: (selectionOrPosition as monaco.IRange).startColumn }
                        editorInstance.setPosition(pos)
                        editorInstance.revealPositionInCenter(pos)
                    }
                    return true
                }
                // Cross-file: read content then navigate via store
                const pp = useStore.getState().projectPath
                if (pp) {
                    try {
                        const result: any = await Call.ByName('monika/internal/api.App.ReadFile', pp, fp)
                        if (selectionOrPosition) {
                            const pos = 'lineNumber' in selectionOrPosition && 'column' in selectionOrPosition
                                ? selectionOrPosition as monaco.IPosition
                                : { lineNumber: (selectionOrPosition as monaco.IRange).startLineNumber, column: (selectionOrPosition as monaco.IRange).startColumn }
                            pendingNav = { path: fp, line: pos.lineNumber, column: pos.column }
                        }
                        store.setPreviewFile(fp, fp.split(/[/\\]/).pop() || '', result.content)
                    } catch (e) {
                        console.error('[monaco] failed to open file:', fp, e)
                    }
                }
                return true
            },
        })

        // Ctrl+S / Cmd+S
        editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, async () => {
            const model = editorInstance.getModel()
            if (!model) return
            const value = model.getValue()
            contentRef.current = value
            onSave?.(value)
            useStore.getState().markFileClean(filePath)
        })


        // Trigger initial diagnostics
        scheduleDiagnostics()
    }, [projectPath, filePath, content, onSave, scheduleDiagnostics, onEditorMount, onCursorChange])

    // Apply pending cross-file navigation position after model swaps
    useEffect(() => {
        if (!pendingNav || pendingNav.path !== filePath) return
        const editor = editorRef.current
        if (!editor) return
        const pos = { lineNumber: pendingNav.line, column: pendingNav.column }
        editor.setPosition(pos)
        editor.revealPositionInCenter(pos)
        pendingNav = null
    }, [filePath, content])

    const handleChange = useCallback((value: string | undefined) => {
        if (value === undefined) return
        contentRef.current = value
        onContentChange?.(value)
        scheduleDiagnostics()
        if (decoTimerRef.current) clearTimeout(decoTimerRef.current)
        decoTimerRef.current = setTimeout(() => {
            const ed = editorRef.current
            if (!ed) return
            applyTreeSitterDecorations(ed, value, filePath, decoIdsRef.current).then(ids => {
                decoIdsRef.current = ids
            }).catch(() => { })
        }, 500)
    }, [scheduleDiagnostics, onContentChange, filePath])

    return (
        <Editor
            theme={MONIKA_THEME}
            language={languageId}
            value={content}
            path={uri.toString()}
            onChange={handleChange}
            beforeMount={handleEditorBeforeMount}
            onMount={handleEditorDidMount}
            options={{
                fontSize: 13,
                fontFamily: "'Maple Mono NF', 'LXGW WenKai', 'Cascadia Code', 'Fira Code', monospace",
                lineHeight: 22,
                minimap: { enabled: true, maxColumn: 80, renderCharacters: false },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                tabSize: 4,
                insertSpaces: true,
                autoIndent: 'full',
                formatOnPaste: true,
                bracketPairColorization: { enabled: true },
                automaticLayout: true,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderWhitespace: 'selection',
                renderControlCharacters: true,
                folding: true,
                foldingHighlight: true,
                foldingStrategy: 'indentation',
                links: true,
                colorDecorators: true,
                selectionHighlight: true,
                matchBrackets: 'always',
                occurrencesHighlight: 'singleFile',
                renderLineHighlight: 'all',
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                padding: { top: 8, bottom: 8 },
            }}
        />
    )
}
