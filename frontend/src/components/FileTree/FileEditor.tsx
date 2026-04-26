import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { go } from '@codemirror/lang-go'

function getLangExtension(filePath: string) {
  if (filePath.endsWith('.go')) return go()
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) return javascript()
  if (filePath.endsWith('.py')) return python()
  if (filePath.endsWith('.json')) return json()
  return []
}

interface FileEditorProps {
  filePath: string
  content?: string
  readOnly?: boolean
  onClose: () => void
}

function FileEditor({ filePath, content, readOnly = true, onClose }: FileEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView>()

  useEffect(() => {
    if (!editorRef.current) return

    viewRef.current?.destroy()

    const state = EditorState.create({
      doc: content || '',
      extensions: [
        oneDark,
        keymap.of(defaultKeymap),
        getLangExtension(filePath),
        EditorView.editable.of(!readOnly),
      ],
    })

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    })

    return () => { viewRef.current?.destroy() }
  }, [filePath, content, readOnly])

  return (
    <div className="border-t border-[var(--border)] h-64 flex flex-col">
      <div className="flex items-center justify-between px-3 py-[4px] bg-[var(--bg-sidebar)] border-b border-[var(--border)]">
        <span className="text-[12px] truncate text-[var(--text-primary)]">{filePath.split('/').pop() || filePath.split('\\').pop()}</span>
        <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] w-5 h-5 flex items-center justify-center rounded-[3px]">&times;</button>
      </div>
      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  )
}

export default FileEditor
