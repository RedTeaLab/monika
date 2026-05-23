import { useEffect, useRef } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { go } from '@codemirror/lang-go'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'

const monoFont = "'Maple Mono NF', 'LXGW WenKai', 'Cascadia Code', 'Fira Code', monospace"

const monoTheme = EditorView.theme({
  '&': { fontFamily: monoFont, backgroundColor: '#08090d' },
  '.cm-scroller': { backgroundColor: '#08090d' },
  '.cm-gutters': { fontFamily: monoFont, backgroundColor: '#08090d', color: 'var(--text-dim)', borderRight: '1px solid var(--border)' },
  '.cm-content': { fontFamily: monoFont },
  '.cm-line': { fontFamily: monoFont },
}, { dark: true })

function getLangExtension(filePath: string) {
  if (filePath.endsWith('.go')) return go()
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) return javascript()
  if (filePath.endsWith('.py')) return python()
  if (filePath.endsWith('.json')) return json()
  return []
}

// Simple unified diff generator (avoids npm dependency)
function simpleDiff(oldText: string, newText: string): string[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result: string[] = []
  let i = m, j = n, oldLine = m, newLine = n
  const buf: string[] = []
  const flush = () => { if (buf.length) { result.push(...buf.reverse()); buf.length = 0 } }

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      flush()
      result.push(' ' + a[i - 1])
      i--; j--; oldLine--; newLine--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      buf.push('+' + b[j - 1])
      j--
    } else {
      buf.push('-' + a[i - 1])
      i--
    }
  }
  flush()
  return result
}

function PreviewPanel(props: IDockviewPanelProps) {
  const preview = useStore((s) => s.preview)
  const lastEditedFile = useStore((s) => s.lastEditedFile)
  const lastEditedOldContent = useStore((s) => s.lastEditedOldContent)
  const projectPath = useStore((s) => s.projectPath)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = headerRef.current?.closest('.dv-panel') as HTMLElement | null
    const tabs = panel?.querySelector('.dv-tabs-and-actions-container') as HTMLElement | null
    if (tabs) {
      tabs.style.display = 'none'
      return () => { tabs.style.display = '' }
    }
  }, [])

  useEffect(() => {
    if (!lastEditedFile || !projectPath) return
    const normProject = projectPath.replace(/\\/g, '/')
    const normFile = lastEditedFile.replace(/\\/g, '/')
    let relPath = normFile
    if (normFile.startsWith(normProject)) {
      relPath = normFile.slice(normProject.length).replace(/^\/+/, '')
    }
    const name = lastEditedFile.split('/').pop() || lastEditedFile.split('\\').pop() || lastEditedFile

    if (lastEditedOldContent) {
      // Show only the diff from this edit (snapshot before → current)
      App.ReadFile(projectPath, relPath).then((fc) => {
        const lines = simpleDiff(lastEditedOldContent, fc?.content || '')
        if (lines.length > 0) {
          useStore.getState().setPreviewDiff(lastEditedFile, name, [
            `--- a/${relPath}`,
            `+++ b/${relPath}`,
            ...lines,
          ])
        }
      }).catch(() => {})
    } else {
      App.GetFileDiff(projectPath, relPath).then((result) => {
        if (result && result.lines && result.lines.length > 0) {
          useStore.getState().setPreviewDiff(lastEditedFile, name, result.lines)
        }
      }).catch(() => {})
    }
  }, [lastEditedFile, projectPath, lastEditedOldContent])

  useEffect(() => {
    if (!containerRef.current || preview.mode !== 'file' || !preview.fileContent) {
      if (editorRef.current) {
        editorRef.current.destroy()
        editorRef.current = null
      }
      return
    }
    if (editorRef.current) {
      editorRef.current.dispatch({
        changes: { from: 0, to: editorRef.current.state.doc.length, insert: preview.fileContent },
      })
      return
    }
    const state = EditorState.create({
      doc: preview.fileContent,
      extensions: [
        oneDark,
        monoTheme,
        lineNumbers(),
        keymap.of(defaultKeymap),
        getLangExtension(preview.filePath || ''),
        EditorView.editable.of(false),
      ],
    })
    editorRef.current = new EditorView({ state, parent: containerRef.current })
  }, [preview.mode, preview.fileContent, preview.filePath])

  return (
    <div className="flex flex-col h-full" style={{ background: '#11111a' }}>
      <div ref={headerRef} style={{ display: 'none' }} />
      {preview.mode === null ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[13px] text-[var(--text-dim)] select-none">Select a file to preview</div>
        </div>
      ) : preview.mode === 'file' ? (
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      ) : preview.diffLines ? (
        <div className="flex-1 overflow-auto" style={{ fontFamily: monoFont, fontSize: '12px', lineHeight: '20px' }}>
          {preview.diffLines.map((line, i) => {
            const bg = line.startsWith('+') ? 'rgba(100,255,100,0.08)'
              : line.startsWith('-') ? 'rgba(255,100,100,0.08)'
              : line.startsWith('@@') ? 'rgba(100,150,255,0.05)' : 'transparent'
            const c = line.startsWith('+') ? 'var(--green)'
              : line.startsWith('-') ? 'var(--red)'
              : line.startsWith('@@') ? 'var(--text-dim)' : 'var(--text-primary)'
            return <div key={i} style={{ backgroundColor: bg, color: c, paddingLeft: 8, whiteSpace: 'pre' }}>{line}</div>
          })}
        </div>
      ) : null}
    </div>
  )
}

export default PreviewPanel