import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { go } from '@codemirror/lang-go'
import { useStore } from '../../store'
import { IconClose } from '../Icons'

function getLangExtension(filePath: string) {
  if (filePath.endsWith('.go')) return go()
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) return javascript()
  if (filePath.endsWith('.py')) return python()
  if (filePath.endsWith('.json')) return json()
  return []
}

function FileEditor() {
  const filePath = useStore((s) => s.selectedFilePath)
  const content = useStore((s) => s.selectedFileContent)
  const clearSelectedFile = useStore((s) => s.clearSelectedFile)
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView>()

  useEffect(() => {
    if (!filePath || !editorRef.current) return

    viewRef.current?.destroy()

    const state = EditorState.create({
      doc: content || '',
      extensions: [
        oneDark,
        keymap.of(defaultKeymap),
        getLangExtension(filePath),
        EditorView.editable.of(false),
      ],
    })

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    })

    return () => { viewRef.current?.destroy() }
  }, [filePath, content])

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="flex items-center justify-between px-3 py-1 border-b border-[var(--border)] flex-shrink-0"
          style={{ background: 'var(--glass-strong)' }}
        >
          <span className="text-[12px] text-[var(--text-secondary)]">Preview</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-[var(--bg-main)]">
          <span className="text-[13px] text-[var(--text-dim)]">Select a file to preview</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div
        className="flex items-center justify-between px-3 py-1 border-b border-[var(--border)] flex-shrink-0"
        style={{ background: 'var(--glass-strong)' }}
      >
        <span className="text-[12px] truncate text-[var(--text-secondary)]">
          {filePath.split('/').pop() || filePath.split('\\').pop()}
        </span>
        <button
          onClick={clearSelectedFile}
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] w-6 h-6 flex items-center justify-center rounded transition-colors"
          aria-label="Close editor"
        >
          <IconClose size={12} />
        </button>
      </div>
      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  )
}

export default FileEditor
