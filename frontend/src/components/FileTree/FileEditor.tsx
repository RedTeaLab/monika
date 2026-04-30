import { useEffect, useRef, useCallback, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { go } from '@codemirror/lang-go'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import TabBar from '../TabBar/TabBar'
import ConfirmModal from '../Chat/ConfirmModal'

const monoFont = "'Maple Mono NF', 'LXGW WenKai', 'Cascadia Code', 'Fira Code', monospace"

const monoTheme = EditorView.theme({
  '&': { fontFamily: monoFont },
  '.cm-content': { fontFamily: monoFont },
  '.cm-gutters': { fontFamily: monoFont },
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

function FileEditor() {
  const openFiles = useStore((s) => s.openFiles)
  const activeFilePath = useStore((s) => s.activeFilePath)
  const closeFileTab = useStore((s) => s.closeFileTab)
  const switchFileTab = useStore((s) => s.switchFileTab)
  const updateFileContent = useStore((s) => s.updateFileContent)

  const editorCache = useRef<Map<string, EditorView>>(new Map())
  const lruOrder = useRef<string[]>([])
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [dirtyClosePath, setDirtyClosePath] = useState<string | null>(null)

  const registerContainer = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) containerRefs.current.set(path, el)
    else containerRefs.current.delete(path)
  }, [])

  // Create or show EditorView when active file changes
  useEffect(() => {
    if (!activeFilePath) return
    const container = containerRefs.current.get(activeFilePath)
    if (!container) return

    let view = editorCache.current.get(activeFilePath)
    if (!view) {
      const file = openFiles.find((f) => f.path === activeFilePath)
      const content = file?.content || ''
      const state = EditorState.create({
        doc: content,
        extensions: [
          oneDark,
          monoTheme,
          keymap.of(defaultKeymap),
          getLangExtension(activeFilePath),
          EditorView.editable.of(false),
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      editorCache.current.forEach((view) => view.destroy())
      editorCache.current.clear()
      lruOrder.current = []
    }
  }, [])

  const handleClose = useCallback((path: string) => {
    const file = openFiles.find((f) => f.path === path)
    if (file?.isDirty) {
      setDirtyClosePath(path)
      return
    }
    const view = editorCache.current.get(path)
    if (view) {
      view.destroy()
      editorCache.current.delete(path)
    }
    lruOrder.current = lruOrder.current.filter((p) => p !== path)
    containerRefs.current.delete(path)
    closeFileTab(path)
  }, [openFiles, closeFileTab])

  const handleSelect = useCallback(async (path: string) => {
    if (path === activeFilePath) return
    switchFileTab(path)
    try {
      const state = useStore.getState()
      const result = await App.ReadFile(state.projectPath, path)
      updateFileContent(path, result.content || '')
    } catch {
      // File may have been deleted — keep cached content
    }
  }, [activeFilePath, switchFileTab, updateFileContent])

  const fileTabs = openFiles.map((f) => ({
    key: f.path,
    label: f.path.split('/').pop() || f.path.split('\\').pop() || f.path,
    dirty: f.isDirty,
  }))

  if (openFiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar tabs={[]} activeKey="" onSelect={() => {}} onClose={() => {}} emptyLabel="Preview" />
        <div className="flex-1 flex items-center justify-center bg-[var(--bg-root)]">
          <span className="text-[13px] text-[var(--text-dim)]">Select a file to preview</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <TabBar
        tabs={fileTabs}
        activeKey={activeFilePath}
        onSelect={handleSelect}
        onClose={handleClose}
        emptyLabel="Preview"
      />
      <div className="flex-1 relative">
        {openFiles.map((f) => (
          <div
            key={f.path}
            ref={(el) => registerContainer(f.path, el)}
            style={{ display: f.path === activeFilePath ? 'block' : 'none', height: '100%' }}
            className="absolute inset-0"
          />
        ))}
      </div>
      {dirtyClosePath && (
        <ConfirmModal
          title="Unsaved Changes"
          message={`Close ${dirtyClosePath.split('/').pop() || dirtyClosePath.split('\\').pop()} without saving?`}
          confirmLabel="Discard"
          onConfirm={async () => {
            const view = editorCache.current.get(dirtyClosePath)
            if (view) { view.destroy(); editorCache.current.delete(dirtyClosePath) }
            lruOrder.current = lruOrder.current.filter((p) => p !== dirtyClosePath)
            containerRefs.current.delete(dirtyClosePath)
            closeFileTab(dirtyClosePath)
            setDirtyClosePath(null)
          }}
          onCancel={() => setDirtyClosePath(null)}
        />
      )}
    </div>
  )
}

export default FileEditor
