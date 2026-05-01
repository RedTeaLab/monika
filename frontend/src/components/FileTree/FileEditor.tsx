import { useEffect, useRef, useCallback, useState } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
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
  const setFileMode = useStore((s) => s.setFileMode)
  const setFileDirty = useStore((s) => s.setFileDirty)
  const projectPath = useStore((s) => s.projectPath)

  const editorCache = useRef<Map<string, EditorView>>(new Map())
  const lruOrder = useRef<string[]>([])
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [dirtyClosePath, setDirtyClosePath] = useState<string | null>(null)
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
          .catch(() => {
            // Write failed — keep dirty state
          })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentMode, activeFilePath, projectPath])

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
        <div className="flex-1 flex items-center justify-center bg-[var(--bg-main)]">
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
        {activeFilePath && (
          <div role="radiogroup" aria-label="Editor mode"
            className="absolute top-2 right-3 z-10 flex rounded-md overflow-hidden shadow-lg"
            style={{ background: 'var(--glass-strong)', border: '1px solid var(--border)' }}>
            <button
              type="button"
              role="radio"
              aria-checked={currentMode === 'edit'}
              aria-label="Edit mode"
              onClick={() => setFileMode(activeFilePath, 'edit')}
              className="px-3 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: currentMode === 'edit' ? 'var(--accent)' : 'transparent',
                color: currentMode === 'edit' ? '#fff' : 'var(--text-dim)',
              }}
            >Edit</button>
            <button
              type="button"
              role="radio"
              aria-checked={currentMode === 'diff'}
              aria-label="Diff mode"
              onClick={() => setFileMode(activeFilePath, 'diff')}
              className="px-3 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: currentMode === 'diff' ? 'var(--accent)' : 'transparent',
                color: currentMode === 'diff' ? '#fff' : 'var(--text-dim)',
              }}
            >Diff</button>
          </div>
        )}
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
