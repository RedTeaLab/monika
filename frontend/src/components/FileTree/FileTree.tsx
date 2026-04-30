import { useState, useEffect } from 'react'
import { App, FileNode } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconChevronRight, IconChevronDown, IconFile } from '../Icons'

function FileTree() {
  const [tree, setTree] = useState<FileNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const projectPath = useStore((s) => s.projectPath)
  const fileTreeVersion = useStore((s) => s.fileTreeVersion)
  const openFileTab = useStore((s) => s.openFileTab)
  const activeFilePath = useStore((s) => s.activeFilePath)

  useEffect(() => {
    if (!projectPath) return
    App.ListFileTree(projectPath).then(setTree).catch(() => {})
  }, [projectPath, fileTreeVersion])

  const handleFileClick = async (node: FileNode) => {
    if (node.is_dir) {
      const next = new Set(expanded)
      next.has(node.path) ? next.delete(node.path) : next.add(node.path)
      setExpanded(next)
    } else {
      try {
        const result = await App.ReadFile(projectPath, node.path)
        openFileTab(node.path, result?.content || '')
      } catch {
        openFileTab(node.path, '')
      }
    }
  }

  const gitColor = (status?: string) => {
    switch (status) { case 'M': return 'var(--yellow)'; case 'A': return 'var(--green)'; case 'D': return 'var(--red)'; default: return undefined; }
  }

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = expanded.has(node.path)
    const isSelected = activeFilePath === node.path
    const gColor = gitColor(node.status)

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 cursor-pointer text-[12px] leading-[26px] rounded-md transition-colors mx-1`}
          style={{
            paddingLeft: `${depth * 14 + 6}px`,
            paddingRight: '6px',
            color: gColor || (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'),
            background: isSelected ? 'var(--bg-active)' : 'transparent',
          }}
          onClick={() => handleFileClick(node)}
        >
          <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 text-[var(--text-dim)]">
            {node.is_dir
              ? (isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />)
              : <IconFile size={13} />
            }
          </span>
          <span className="truncate">{node.name}</span>
          {node.status && (
            <span className="text-[10px] font-semibold ml-auto opacity-60">{node.status}</span>
          )}
        </div>
        {node.is_dir && isExpanded && node.children?.map(ch => renderNode(ch, depth + 1))}
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-sidebar)', padding: '0 14px' }}
    >
      <div className="pt-5 pb-2 px-1">
        <span className="text-[10px] font-semibold text-[var(--text-dim)] tracking-[0.06em] uppercase">Files</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No project opened</div>
        ) : (
          tree.map(node => renderNode(node))
        )}
      </div>
    </div>
  )
}

export default FileTree
