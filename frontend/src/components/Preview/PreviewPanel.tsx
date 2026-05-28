import { useEffect, useRef, useState, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { syntaxHighlighting } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { go } from '@codemirror/lang-go'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'

const previewTheme = EditorView.theme({
  '&': {
    fontFamily: 'var(--font-mono)',
    backgroundColor: '#08090d',
    height: '100%',
    color: '#abb2bf',
  },
  '.cm-scroller': { backgroundColor: '#08090d' },
  '.cm-gutters': {
    fontFamily: 'var(--font-mono)',
    backgroundColor: '#0a0b10',
    color: '#495162',
    border: 'none',
    paddingLeft: 8,
    paddingRight: 16,
  },
  '.cm-gutterElement': { color: 'inherit' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8b8fa0' },
  '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'transparent', paddingLeft: 4 },
  '.cm-line': { fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '22px' },
  '.cm-cursor': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground': { backgroundColor: 'rgba(75,125,219,0.15)' },
  '.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(75,125,219,0.15)' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(75,125,219,0.25)', outline: '1px solid rgba(75,125,219,0.4)' },
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

function getLangExtension(filePath: string) {
  if (filePath.endsWith('.go')) return go()
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) return javascript()
  if (filePath.endsWith('.py')) return python()
  if (filePath.endsWith('.json')) return json()
  return []
}

// Simple unified diff generator with hunk grouping (avoids npm dependency)
function simpleDiff(oldText: string, newText: string): string[] {
  const a = oldText.replace(/\r\n?/g, '\n').split('\n')
  const b = newText.replace(/\r\n?/g, '\n').split('\n')
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  // Backtrack to produce ops: ' ' = context, '+' = add, '-' = remove
  type Op = { type: ' ' | '+' | '-'; line: string }
  const ops: Op[] = []
  let i = m, j = n
  const buf: Op[] = []
  const flush = () => { if (buf.length) { ops.push(...buf.reverse()); buf.length = 0 } }

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      flush()
      ops.push({ type: ' ', line: a[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      buf.push({ type: '+', line: b[j - 1] })
      j--
    } else {
      buf.push({ type: '-', line: a[i - 1] })
      i--
    }
  }
  flush()
  ops.reverse()

  if (ops.length === 0) return []

  // Group into hunks with context lines
  const contextLines = 3
  const result: string[] = []

  // Find change positions
  const changePositions: number[] = []
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].type !== ' ') changePositions.push(k)
  }
  if (changePositions.length === 0) return []

  // Group changes into hunks (merge if gap < contextLines * 2)
  const hunkRanges: [number, number][] = []
  let hunkStart = Math.max(0, changePositions[0] - contextLines)
  let hunkEnd = Math.min(ops.length - 1, changePositions[0] + contextLines)
  for (let c = 1; c < changePositions.length; c++) {
    const cs = Math.max(0, changePositions[c] - contextLines)
    const ce = Math.min(ops.length - 1, changePositions[c] + contextLines)
    if (cs <= hunkEnd + 1) {
      hunkEnd = ce
    } else {
      hunkRanges.push([hunkStart, hunkEnd])
      hunkStart = cs
      hunkEnd = ce
    }
  }
  hunkRanges.push([hunkStart, hunkEnd])

  for (const [start, end] of hunkRanges) {
    // Count old/new lines in this hunk
    let oldCount = 0, newCount = 0
    for (let k = start; k <= end; k++) {
      if (ops[k].type !== '+') oldCount++
      if (ops[k].type !== '-') newCount++
    }
    // Find old line number at start
    let oldLine = 1
    for (let k = 0; k < start; k++) {
      if (ops[k].type !== '+') oldLine++
    }
    let newLine = 1
    for (let k = 0; k < start; k++) {
      if (ops[k].type !== '-') newLine++
    }
    result.push(`@@ -${oldLine},${oldCount} +${newLine},${newCount} @@`)
    for (let k = start; k <= end; k++) {
      result.push(ops[k].type + ops[k].line)
    }
  }

  return result
}

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

function DiffView({ lines, fileName }: { lines: string[]; fileName: string }) {
  const { hunks, added, removed } = parseDiffLines(lines)

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
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5 }}>
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
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
      </div>

      {/* Diff body */}
      <div
        className="flex-1 overflow-auto"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '22px' }}
      >
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {hunks.map((h, i) => {
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
                <tr key={i} style={{ background: bg }}>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilePreviewHeader({ fileName, filePath, lineCount }: {
  fileName: string
  filePath: string
  lineCount: number
}) {
  const lang = getLangLabel(filePath)
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 shrink-0"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.45 }}>
        <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {fileName}
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
        {lineCount} lines
      </span>
    </div>
  )
}

function PreviewPanel(props: IDockviewPanelProps) {
  const preview = useStore((s) => s.preview)
  const lastEditedFile = useStore((s) => s.lastEditedFile)
  const lastEditedOldContent = useStore((s) => s.lastEditedOldContent)
  const lastEditVersion = useStore((s) => s.lastEditVersion)
  const projectPath = useStore((s) => s.projectPath)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [maximized, setMaximized] = useState(false)

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
  }, [lastEditedFile, projectPath, lastEditedOldContent, lastEditVersion])

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
        previewTheme,
        syntaxHighlighting(oneDarkHighlightStyle),
        lineNumbers(),
        keymap.of(defaultKeymap),
        getLangExtension(preview.filePath || ''),
        EditorView.editable.of(false),
      ],
    })
    editorRef.current = new EditorView({ state, parent: containerRef.current })
  }, [preview.mode, preview.fileContent, preview.filePath])

  const showFile = preview.mode === 'file' && preview.fileContent
  const showDiff = preview.mode === 'diff' && preview.diffLines
  const showEmpty = preview.mode === null

  const lineCount = preview.fileContent ? preview.fileContent.split('\n').length : 0

  return (
    <div className="flex flex-col h-full" style={{ background: '#08090d' }}>
      <div ref={headerRef} style={{ display: 'none' }} />
      <div
        className="flex items-center gap-1.5 select-none shrink-0"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 12, padding: '5px 6px 5px 10px', background: 'var(--bg-sidebar)' }}
      >
        <span className="truncate min-w-0">PREVIEW</span>
        <div className="flex-1" />
        <div
          onClick={toggleMaximize}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s, background 0.15s' }}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="4.5" y="4.5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" opacity="0.5" /><rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" /></svg>
          )}
        </div>
      </div>
      {/* File preview — wrapper always mounted for CodeMirror DOM safety */}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ display: showFile ? 'flex' : 'none' }}
      >
        <FilePreviewHeader
          fileName={preview.fileName || ''}
          filePath={preview.filePath || ''}
          lineCount={lineCount}
        />
        <div ref={containerRef} className="flex-1 overflow-hidden" />
      </div>
      {showDiff && (
        <DiffView lines={preview.diffLines!} fileName={preview.fileName || ''} />
      )}
      {showEmpty && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[13px] text-[var(--text-dim)] select-none">Select a file to preview</div>
        </div>
      )}
    </div>
  )
}

export default PreviewPanel