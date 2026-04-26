import { useState, useEffect } from 'react'
import { App, FileNode } from '../../../bindings/monika'
import { useStore } from '../../store'
import FileEditor from './FileEditor'

function FileTree() {
  const [tree, setTree] = useState<FileNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedFile, setSelectedFile] = useState<string>()
  const [fileContent, setFileContent] = useState<string>()
  const projectPath = useStore((s) => s.projectPath)

  useEffect(() => {
    if (!projectPath) return
    App.ListFileTree(projectPath).then(setTree).catch(() => {})
  }, [projectPath])

  const handleFileClick = async (node: FileNode) => {
    if (node.is_dir) {
      const next = new Set(expanded)
      next.has(node.path) ? next.delete(node.path) : next.add(node.path)
      setExpanded(next)
    } else {
      setSelectedFile(node.path)
      try {
        const content = await App.ReadFile(projectPath, node.path)
        setFileContent(content?.content || '')
      } catch {
        setFileContent('')
      }
    }
  }

  const statusColor = (status?: string) => {
    switch (status) { case 'M': return 'var(--yellow)'; case 'A': return 'var(--green)'; case 'D': return 'var(--red)'; default: return undefined; }
  }

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = expanded.has(node.path); const isSelected = selectedFile === node.path
    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 cursor-pointer text-[13px] leading-[22px] hover:bg-[var(--bg-hover)] ${isSelected ? 'bg-[var(--bg-active)]' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px`, color: statusColor(node.status) || 'var(--text-primary)' }}
          onClick={() => handleFileClick(node)} >
          <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4">{node.is_dir ? (isExpanded ? '\u25BC' : '\u25B6') : ''}</span>
          <span>{node.name}</span>
          {node.status && <span className="text-[11px] ml-auto">{node.status}</span>}
        </div>
        {node.is_dir && isExpanded && node.children?.map(ch => renderNode(ch, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-sidebar)]" style={{ padding: '0 10px' }}>
      <div className="pt-4 pb-1">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-[0.05em] uppercase">Files</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)]">No project opened</div>
        ) : tree.map(node => renderNode(node))}
      </div>
      {selectedFile && (
        <FileEditor filePath={selectedFile} content={fileContent} onClose={() => { setSelectedFile(undefined); setFileContent(undefined) }} />
      )}
    </div>
  )
}

export default FileTree
