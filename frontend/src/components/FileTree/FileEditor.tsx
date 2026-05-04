import { useEffect, useRef, useCallback, useState } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { go } from '@codemirror/lang-go'
import { App } from '../../../bindings/monika'
import { logger } from '../../lib/logger'
import { useStore } from '../../store'

const monoFont = "'Maple Mono NF', 'LXGW WenKai', 'Cascadia Code', 'Fira Code', monospace"

const monoTheme = EditorView.theme({
  '&': { fontFamily: monoFont, backgroundColor: '#08090d' },
  '.cm-scroller': { backgroundColor: '#08090d' },
  '.cm-gutters': { fontFamily: monoFont, backgroundColor: '#08090d', color: 'var(--text-dim)', borderRight: '1px solid var(--border)' },
  '.cm-gutter': { backgroundColor: '#08090d' },
  '.cm-lineNumbers .cm-gutterElement': { backgroundColor: '#08090d' },
  '.cm-content': { fontFamily: monoFont },
  '.cm-cursor': { fontFamily: monoFont },
  '.cm-activeLine': { fontFamily: monoFont },
  '.cm-selectionBackground': { fontFamily: monoFont },
  '.cm-line': { fontFamily: monoFont },
  '.cm-selectionMatch': { fontFamily: monoFont },
}, { dark: true })

const MAX_CACHED_EDITORS = 10

function getLangExtension(filePath: string) {
  if (filePath.endsWith('.go')) return go()
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) return javascript()
  if (filePath.endsWith('.py')) return python()
  if (filePath.endsWith('.json')) return json()
  return []
}

function FileEditor(props: IDockviewPanelProps) {
  const openFiles = useStore((s) => s.openFiles)
  const updateFileContent = useStore((s) => s.updateFileContent)
  const setFileMode = useStore((s) => s.setFileMode)
  const setFileDirty = useStore((s) => s.setFileDirty)
  const projectPath = useStore((s) => s.projectPath)

  const storeActiveFilePath = useStore((s) => s.activeFilePath)
  const paramsPath = (props.params as { filePath?: string } | undefined)?.filePath
  const activeFilePath = paramsPath || (props.api.id !== 'editor' ? props.api.id : storeActiveFilePath)

  const editorCache = useRef<Map<string, EditorView>>(new Map())
  const lruOrder = useRef<string[]>([])
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [diffLines, setDiffLines] = useState<string[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
  const editableCompartment = useRef(new Compartment())

  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const currentMode = activeFile?.mode || 'edit'

  const registerContainer = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) containerRefs.current.set(path, el)
    else containerRefs.current.delete(path)
  }, [])

  // Create or show EditorView when active file changes
  useEffect(() => {
    if (!activeFilePath) return
    const container = containerRefs.current.get(activeFilePath)
    if (!container) return

    const filePath = activeFilePath
    let view = editorCache.current.get(activeFilePath)
    if (!view) {
      const file = openFiles.find((f) => f.path === activeFilePath)
      const content = file?.content || ''
      const state = EditorState.create({
        doc: content,
        extensions: [
          oneDark,
          monoTheme,
          lineNumbers(),
          keymap.of(defaultKeymap),
          getLangExtension(activeFilePath),
          editableCompartment.current.of(EditorView.editable.of(file?.mode === 'edit')),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const currentFile = useStore.getState().openFiles.find((f) => f.path === filePath)
              if (currentFile?.mode === 'edit') {
                setFileDirty(filePath, true)
              }
            }
          }),
        ],
      })
      view = new EditorView({ state, parent: container })

      // LRU management
      if (editorCache.current.size >= MAX_CACHED_EDITORS) {
        const oldest = lruOrder.current.shift()
        if (oldest) {
          editorCache.current.get(oldest)?.destroy()
          editorCache.current.delete(oldest)
        }
      }
      editorCache.current.set(activeFilePath, view)
    } else {
      // Re-attach DOM, sync content, and remeasure
      if (view.dom.parentElement !== container) {
        container.appendChild(view.dom)
      }
      const file = openFiles.find((f) => f.path === activeFilePath)
      if (file && view.state.doc.toString() !== file.content) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: file.content }
        })
      }
      view.requestMeasure()
    }

    // Update LRU
    lruOrder.current = lruOrder.current.filter((p) => p !== activeFilePath)
    lruOrder.current.push(activeFilePath)
  }, [activeFilePath, openFiles])

  // Toggle editable when mode changes
  useEffect(() => {
    if (!activeFilePath) return
    const view = editorCache.current.get(activeFilePath)
    if (!view) return
    view.dispatch({
      effects: editableCompartment.current.reconfigure(
        EditorView.editable.of(currentMode === 'edit')
      )
    })
  }, [currentMode, activeFilePath])

  // Ctrl+S save handler
  useEffect(() => {
    if (currentMode !== 'edit') return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const file = useStore.getState().openFiles.find((f) => f.path === activeFilePath)
        if (!file?.isDirty) return
        const view = editorCache.current.get(activeFilePath)
        if (!view) return
        const content = view.state.doc.toString()
        App.WriteFile(projectPath, activeFilePath, content)
          .then(() => {
            updateFileContent(activeFilePath, content)
            setFileDirty(activeFilePath, false)
          })
          .catch((err) => {
            logger.error('WriteFile failed:', activeFilePath, err)
          })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentMode, activeFilePath, projectPath])

  // Ctrl+/ toggle edit/diff mode
  useEffect(() => {
    if (!activeFilePath) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        const file = useStore.getState().openFiles.find((f) => f.path === activeFilePath)
        if (!file) return
        setFileMode(activeFilePath, file.mode === 'edit' ? 'diff' : 'edit')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFilePath, setFileMode])

  // Fetch diff when switching to Diff mode
  useEffect(() => {
    if (currentMode !== 'diff' || !activeFilePath) return
    let cancelled = false
    setDiffLines([])
    setDiffLoading(true)
    App.GetFileDiff(projectPath, activeFilePath)
      .then((result) => {
        if (!cancelled) {
          setDiffLines(result?.lines || [])
          setDiffLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to fetch diff:', err)
          setDiffLines([])
          setDiffLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [currentMode, activeFilePath, projectPath])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      editorCache.current.forEach((view) => view.destroy())
      editorCache.current.clear()
      lruOrder.current = []
    }
  }, [])


  if (openFiles.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center bg-[var(--bg-root)]">
          <span className="text-[13px] text-[var(--text-dim)]">Select a file to preview</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative" style={{ background: 'var(--bg-root)' }}>
        {currentMode === 'diff' ? (
          <div className="absolute inset-0 overflow-auto font-mono text-[13px] leading-relaxed"
            style={{ background: 'var(--bg-root)' }}>
            {diffLoading ? (
              <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[12px]">
                Loading diff...
              </div>
            ) : diffLines.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[12px]">
                No changes
              </div>
            ) : (
              <div className="py-2">
                {diffLines.map((line, i) => {
                  let bg = 'transparent'
                  let fg = 'var(--text-primary)'
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    bg = 'rgba(74, 222, 128, 0.08)'
                    fg = 'var(--green)'
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    bg = 'rgba(248, 113, 113, 0.10)'
                    fg = 'var(--red)'
                  } else if (line.startsWith('@@')) {
                    fg = 'var(--text-dim)'
                  } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                    fg = 'var(--text-dim)'
                  }
                  return (
                    <div key={i} style={{ background: bg, color: fg, paddingLeft: '16px', paddingRight: '16px', minHeight: '22px', whiteSpace: 'pre' }}>
                      {line}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          openFiles.map((f) => (
            <div
              key={f.path}
              ref={(el) => registerContainer(f.path, el)}
              style={{ display: f.path === activeFilePath ? 'block' : 'none', height: '100%' }}
              className="absolute inset-0"
            />
          ))
        )}
      </div>
    </div>
  )
}

export default FileEditor
