import { useState, useEffect } from 'react'
import { App, FileNode } from '../../../bindings/monika'
import FileEditor from './FileEditor'

function FileTree() {
  const [tree, setTree] = useState<FileNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedFile, setSelectedFile] = useState<string>()
  const [fileContent, setFileContent] = useState<string>()

  useEffect(() => {
    App.ListFileTree('').then(setTree).catch(() => {})
  }, [])

  const handleFileClick = async (node: FileNode) => {
    if (node.is_dir) {
      const next = new Set(expanded)
      next.has(node.path) ? next.delete(node.path) : next.add(node.path)
      setExpanded(next)
    } else {
      setSelectedFile(node.path)
      try {
        const content = await App.ReadFile('', node.path)
        setFileContent(content?.content || '')
      } catch {
        setFileContent('')
      }
    }
  }

  const statusColor = (status?: string) => {
    switch (status) { case 'M': return 'var(--color-accent-yellow)'; case 'A': return 'var(--color-accent-green)'; case 'D': return 'var(--color-accent-red)'; default: return undefined; }
  }

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = expanded.has(node.path); const isSelected = selectedFile === node.path
    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs hover:bg-[var(--color-bg-tertiary)] ${isSelected ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-accent)]' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px`, color: statusColor(node.status) }}
          onClick={() => handleFileClick(node)} >
          <span className="w-4 text-center">{node.is_dir ? (isExpanded ? 'v' : '>') : '·'}</span>
          <span>{node.name}</span>
          {node.status && <span className="text-[10px] ml-auto">{node.status}</span>}
        </div>
        {node.is_dir && isExpanded && node.children?.map(ch => renderNode(ch, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-semibold text-[var(--color-text-dim)]">FILES</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--color-text-dim)] text-center">No project opened</div>
        ) : tree.map(node => renderNode(node))}
      </div>
      {selectedFile && (
        <FileEditor filePath={selectedFile} content={fileContent} onClose={() => { setSelectedFile(undefined); setFileContent(undefined) }} />
      )}
    </div>
  )
}

export default FileTree
