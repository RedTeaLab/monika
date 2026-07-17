import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { IDockviewPanelProps } from 'dockview'
import { App, FileNode } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconChevronRight, IconChevronDown, IconFile, IconEye, IconSearch, IconFilePlus, IconFolderPlus, IconPencilLine, IconTrash, IconRestore, IconClipboardPaste, IconFiles, IconExternalLink } from '../Icons'
import { Link, MessageSquare, FileMinus } from 'lucide-react'
import DebugPanel from '../debug/DebugPanel'

type HeaderAction = 'none' | 'new-file' | 'new-folder' | 'search'

interface ContextMenuState {
    x: number
    y: number
    /**/
    node: FileNode
}

interface Clipboard {
    path: string
    isDir: boolean
}

function FileTree({ hideTasks, ..._props }: IDockviewPanelProps & { hideTasks?: boolean }) {
    const activeTab = useStore((s) => s.fileTreeActiveTab)
    const setActiveTab = useStore((s) => s.setFileTreeActiveTab)
    const [tree, setTree] = useState<FileNode[]>([])
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [showHidden, setShowHidden] = useState(false)
    const [selectedDir, setSelectedDir] = useState<string>('')
    const [headerAction, setHeaderAction] = useState<HeaderAction>('none')
    const [inputValue, setInputValue] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
    const [contextHighlight, setContextHighlight] = useState<string>('')
    const [renaming, setRenaming] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [clipboard, setClipboard] = useState<Clipboard | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const renameRef = useRef<HTMLInputElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const contextMenuJustOpened = useRef(false)
    const projectPath = useStore((s) => s.projectPath)
    const fileTreeVersion = useStore((s) => s.fileTreeVersion)
    const bumpFileTreeVersion = useStore((s) => s.bumpFileTreeVersion)
    const setPreviewFile = useStore((s) => s.setPreviewFile)
    const previewFilePath = useStore((s) => s.preview.filePath)
    const revealFilePath = useStore((s) => s.revealFilePath)
    const setRevealFilePath = useStore((s) => s.setRevealFilePath)
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
    const toggleGroup = (label: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev)
            if (next.has(label)) next.delete(label)
            else next.add(label)
            return next
        })
    }

    // When maximized, force task tab hidden
    useEffect(() => {
        if (hideTasks && activeTab === 'tasks') {
            setActiveTab('files')
        }
    }, [hideTasks, activeTab, setActiveTab])

    useEffect(() => {

        if (!projectPath) return
        let cancelled = false
        App.ListFileTree(projectPath, true)
            .then((result) => {
                if (!cancelled) setTree(Array.isArray(result) ? result : [])
            })
            .catch(() => {
                if (!cancelled) setTree([])
            })
        return () => { cancelled = true }
    }, [projectPath, fileTreeVersion])

    // Refresh on window focus (catches external git / file changes)
    useEffect(() => {
        const onFocus = () => useStore.getState().bumpFileTreeVersion()
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
    }, [])

    // Reveal a file path (from CHANGES "View Source File") — search + expand + select
    useEffect(() => {
        if (!revealFilePath) return
        const fileName = revealFilePath.split('/').pop() || revealFilePath
        const parts = revealFilePath.split('/')
        const dirsToExpand: string[] = []
        for (let i = 1; i < parts.length; i++) {
            dirsToExpand.push(parts.slice(0, i).join('/'))
        }
        setExpanded((prev) => {
            const next = new Set(prev)
            for (const d of dirsToExpand) next.add(d)
            return next
        })
        setHeaderAction('search')
        setSearchQuery(fileName)
        setSelectedDir('')
        setRevealFilePath(null)
    }, [revealFilePath])

    // Auto-focus input when action changes
    useEffect(() => {
        if (headerAction !== 'none') {
            inputRef.current?.focus()
        }
    }, [headerAction])

    // Auto-focus rename input
    useEffect(() => {
        if (renaming) {
            renameRef.current?.focus()
            renameRef.current?.select()
        }
    }, [renaming])

    // Close context menu on click outside (skip the first click that trails the right-click)
    useEffect(() => {
        if (!contextMenu) return
        contextMenuJustOpened.current = true
        const onClick = () => {
            if (contextMenuJustOpened.current) {
                contextMenuJustOpened.current = false
                return
            }
            setContextMenu(null)
            setContextHighlight('')
        }
        const onScroll = () => { setContextMenu(null); setContextHighlight('') }
        window.addEventListener('click', onClick)
        window.addEventListener('scroll', onScroll, true)
        return () => {
            window.removeEventListener('click', onClick)
            window.removeEventListener('scroll', onScroll, true)
        }
    }, [contextMenu])

    // Adjust menu position on next frame after DOM paint
    useEffect(() => {
        if (!contextMenu || !menuRef.current) return
        const el = menuRef.current
        requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect()
            let x = contextMenu.x
            let y = contextMenu.y
            let changed = false
            if (rect.right > window.innerWidth) { x = window.innerWidth - rect.width - 4; changed = true }
            if (rect.bottom > window.innerHeight) { y = window.innerHeight - rect.height - 4; changed = true }
            if (changed) {
                el.style.left = x + 'px'
                el.style.top = y + 'px'
            }
        })
    }, [contextMenu])

    const handleFileClick = async (node: FileNode) => {
        setContextHighlight('')
        if (node.is_dir) {
            const next = new Set(expanded)
            next.has(node.path) ? next.delete(node.path) : next.add(node.path)
            setExpanded(next)
            setSelectedDir(node.path)
        } else {
            setSelectedDir('')
            try {
                const result = await App.ReadFile(projectPath, node.path)
                setPreviewFile(node.path, node.name, result?.content || '')
            } catch {
                setPreviewFile(node.path, node.name, '')
            }
        }
    }

    const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
        e.preventDefault()
        e.stopPropagation()
        setContextHighlight(node.path)
        setSelectedDir('')
        setContextMenu({ x: e.clientX, y: e.clientY, node })
    }

    const getParentDir = useCallback(() => {
        if (selectedDir) return selectedDir
        const expandedDirs = Array.from(expanded)
        if (expandedDirs.length === 0) return ''
        return expandedDirs[expandedDirs.length - 1]
    }, [selectedDir, expanded])

    const handleInputSubmit = async () => {
        const name = inputValue.trim()
        if (!name || !projectPath) return

        const parentDir = getParentDir()
        const fullPath = parentDir ? `${parentDir}/${name}` : name

        try {
            if (headerAction === 'new-file') {
                await App.WriteFile(projectPath, fullPath, '')
                setPreviewFile(fullPath, name, '')
            } else if (headerAction === 'new-folder') {
                await App.CreateDir(projectPath, fullPath)
                const next = new Set(expanded)
                next.add(parentDir)
                setExpanded(next)
            }
            bumpFileTreeVersion()
        } catch {
            // Silently handle errors
        }

        setInputValue('')
        setHeaderAction('none')
    }

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); handleInputSubmit() }
        else if (e.key === 'Escape') { setInputValue(''); setHeaderAction('none') }
    }

    const toggleAction = (action: HeaderAction) => {
        if (headerAction === action) { setHeaderAction('none'); setInputValue(''); setSearchQuery('') }
        else {
            if (action === 'search') setSearchQuery(''); else setInputValue('')
            setHeaderAction(action)
        }
    }

    // ── Context menu actions ──
    const handleRenameSubmit = async () => {
        if (!renaming || !projectPath) return
        const newName = renameValue.trim()
        if (!newName) { setRenaming(null); return }

        const dir = renaming.includes('/') ? renaming.substring(0, renaming.lastIndexOf('/')) : ''
        const newPath = dir ? `${dir}/${newName}` : newName

        try {
            await App.Rename(projectPath, renaming, newPath)
            bumpFileTreeVersion()
        } catch { /* Silently handle */ }
        setRenaming(null)
    }

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit() }
        else if (e.key === 'Escape') setRenaming(null)
    }

    const handleDelete = async (node: FileNode) => {
        if (!projectPath) return
        try {
            await App.DeleteItem(projectPath, node.path)
            bumpFileTreeVersion()
        } catch { /* Silently handle */ }
    }

    const handleDuplicate = async (node: FileNode) => {
        if (!projectPath) return
        try {
            await App.DuplicateItem(projectPath, node.path)
            bumpFileTreeVersion()
        } catch { /* Silently handle */ }
    }

    const handleCopy = (node: FileNode) => {
        setClipboard({ path: node.path, isDir: node.is_dir })
    }

    const handlePaste = async (destDir: string) => {
        if (!clipboard || !projectPath) return
        try {
            await App.CopyItem(projectPath, clipboard.path, destDir)
            bumpFileTreeVersion()
        } catch {
            // Silently handle
        }
    }

    const handleOpenInExplorer = async (node: FileNode) => {
        if (!projectPath) return
        try {
            await App.OpenInExplorer(projectPath, node.path)
        } catch {
            // Silently handle
        }
    }

    const handleAddToGitignore = async (node: FileNode) => {
        if (!projectPath) return
        const entry = node.is_dir ? node.path + '/' : node.path
        try {
            let existing = ''
            try {
                const result = await App.ReadFile(projectPath, '.gitignore')
                existing = result?.content || ''
            } catch { /* .gitignore may not exist yet */ }
            const needsNewline = existing.length > 0 && !existing.endsWith('\n')
            const newContent = existing + (needsNewline ? '\n' : '') + entry + '\n'
            await App.WriteFile(projectPath, '.gitignore', newContent)
            bumpFileTreeVersion()
        } catch { /* Silently handle */ }
    }

    const handleNewFileInDir = async (parentPath: string) => {
        if (!projectPath) return
        // Ensure the directory is expanded
        const next = new Set(expanded)
        next.add(parentPath)
        setExpanded(next)
        // Prompt inline by switching to header action
        setSelectedDir(parentPath)
        setHeaderAction('new-file')
        setInputValue('')
    }

    const handleNewFolderInDir = async (parentPath: string) => {
        if (!projectPath) return
        const next = new Set(expanded)
        next.add(parentPath)
        setExpanded(next)
        setSelectedDir(parentPath)
        setHeaderAction('new-folder')
        setInputValue('')
    }

    const gitColor = (status?: string) => {
        if (!status) return undefined
        if (status.includes('D')) return 'var(--red)'
        if (status.includes('A')) return 'var(--green)'
        if (status.includes('M')) return 'var(--yellow)'
        if (status.includes('R')) return 'var(--purple)'
        if (status === '??') return 'var(--text-dim)'
        return undefined
    }
    const gitLabel = (status?: string) => {
        if (!status) return undefined
        if (status === '??') return '?'
        const s = status.trim()
        if (s.length === 2) return s[1] !== ' ' ? s[1] : s[0]
        return s
    }

    // Filter tree by search query
    const filterTree = (nodes: FileNode[], query: string): FileNode[] => {
        if (!query) return nodes
        const lower = query.toLowerCase()
        const result: FileNode[] = []
        for (const node of nodes) {
            if (node.is_dir) {
                const filteredChildren = filterTree(node.children || [], query)
                if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
                    result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children })
                }
            } else {
                if (node.name.toLowerCase().includes(lower)) {
                    result.push(node)
                }
            }
        }
        return result
    }

    const visibleTree = useMemo(() => {
        if (showHidden) return tree
        const filter = (nodes: FileNode[]): FileNode[] => {
            const result: FileNode[] = []
            for (const node of nodes) {
                if (node.name.startsWith('.')) continue
                if (node.children) {
                    result.push({ ...node, children: filter(node.children) })
                } else {
                    result.push(node)
                }
            }
            return result
        }
        return filter(tree)
    }, [tree, showHidden])

    const displayTree = searchQuery ? filterTree(visibleTree, searchQuery) : visibleTree

    const renderNode = (node: FileNode, depth = 0) => {
        const isExpanded = expanded.has(node.path)
        const isDirSelected = node.is_dir && selectedDir === node.path
        const isFileSelected = !node.is_dir && previewFilePath === node.path
        const isContexted = contextHighlight === node.path && !isDirSelected && !isFileSelected
        const gColor = gitColor(node.status)
        const isRenaming = renaming === node.path

        const isSelected = isDirSelected || isFileSelected || isContexted

        return (
            <div key={node.path}>
                <div
                    className={`flex items-center gap-1 cursor-pointer text-[13px] leading-[26px] rounded-md transition-colors duration-100 mx-1`}
                    style={{
                        paddingLeft: `${depth * 14 + 6}px`,
                        paddingRight: '6px',
                        color: gColor || (node.ignored ? 'var(--text-dim)' : isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'),
                        opacity: node.ignored ? 0.5 : 1,
                        background: isSelected ? 'var(--bg-active)' : 'transparent',
                    }}
                    onClick={() => handleFileClick(node)}
                    onContextMenu={(e) => handleContextMenu(e, node)}
                >
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 text-[var(--text-dim)]">
                        {node.is_dir
                            ? (isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />)
                            : <IconFile size={13} />
                        }
                    </span>
                    {isRenaming ? (
                        <input
                            ref={renameRef}
                            className="flex-1 bg-transparent text-[13px] outline-none min-w-0"
                            style={{
                                color: 'var(--text-primary)',
                                fontFamily: 'var(--font-mono)',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--accent)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0 4px',
                                lineHeight: '22px',
                            }}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={handleRenameKeyDown}
                            onBlur={handleRenameSubmit}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="truncate">{node.name}</span>
                    )}
                    {!isRenaming && gitLabel(node.status) && (
                        <span className="text-[10px] font-semibold ml-auto opacity-60">{gitLabel(node.status)}</span>
                    )}
                </div>
                {node.is_dir && isExpanded && node.children?.map(ch => renderNode(ch, depth + 1))}
            </div>
        )
    }

    const headerBtnClass = 'flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--bg-hover)] transition-colors'

    const renderContextMenu = () => {
        if (!contextMenu) return null
        const { x, y, node } = contextMenu

        const menuItems: { label: string; icon: React.ReactNode; action: () => void; separator?: boolean; danger?: boolean }[] = []

        if (node.is_dir) {
            menuItems.push({ label: 'New File', icon: <IconFilePlus size={14} />, action: () => handleNewFileInDir(node.path) })
            menuItems.push({ label: 'New Folder', icon: <IconFolderPlus size={14} />, action: () => handleNewFolderInDir(node.path) })
            menuItems.push({ label: 'Paste', icon: <IconClipboardPaste size={14} />, action: () => handlePaste(node.path), separator: true, danger: false })
        }

        menuItems.push({ label: 'Rename', icon: <IconPencilLine size={14} />, action: () => { setRenaming(node.path); setRenameValue(node.name) }, separator: true })
        menuItems.push({ label: 'Duplicate', icon: <IconFiles size={14} />, action: () => handleDuplicate(node) })
        menuItems.push({ label: 'Copy', icon: <IconRestore size={14} />, action: () => handleCopy(node) })
        menuItems.push({ label: 'Copy Absolute Path', icon: <Link size={14} />, action: () => navigator.clipboard.writeText(projectPath ? `${projectPath}/${node.path}` : node.path) })
        menuItems.push({ label: 'Copy Relative Path', icon: <Link size={14} />, action: () => navigator.clipboard.writeText(node.path) })
        if (!node.is_dir) {
            menuItems.push({ label: 'Add to Chat', icon: <MessageSquare size={14} />, action: () => useStore.getState().appendPathToInput(node.path), separator: true })
        }
        menuItems.push({ label: 'Delete', icon: <IconTrash size={14} />, action: () => handleDelete(node), danger: true })
        menuItems.push({ label: 'Open in Explorer', icon: <IconExternalLink size={14} />, action: () => handleOpenInExplorer(node), separator: true })
        menuItems.push({ label: 'Add to .gitignore', icon: <FileMinus size={14} />, action: () => handleAddToGitignore(node) })

        return createPortal(
            <div
                ref={menuRef}
                className="fixed"
                style={{
                    left: x,
                    top: y,
                    zIndex: 2000,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '4px 0',
                    minWidth: '200px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-sans)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {menuItems.map((item, i) => (
                    <div key={i}>
                        {item.separator && <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />}
                        <div
                            className="flex items-center gap-2.5 px-3 py-[5px] cursor-pointer transition-colors rounded-sm mx-1"
                            style={{ color: item.danger ? 'var(--red)' : 'var(--text-secondary)' }}
                            onMouseEnter={(e) => { const t = e.currentTarget; t.style.background = 'var(--bg-hover)'; t.style.color = item.danger ? 'var(--red)' : 'var(--text-primary)' }}
                            onMouseLeave={(e) => { const t = e.currentTarget; t.style.background = 'transparent'; t.style.color = item.danger ? 'var(--red)' : 'var(--text-secondary)' }}
                            onClick={() => { setContextMenu(null); setContextHighlight(''); item.action() }}
                        >
                            <span className="flex-shrink-0 flex items-center" style={{ opacity: 0.7, width: 14 }}>{item.icon}</span>
                            <span>{item.label}</span>
                        </div>
                    </div>
                ))}
            </div>,
            document.body
        )
    }

    const bgTasks = useStore((s) => s.bgTasks)
    const selectedBgTaskId = useStore((s) => s.selectedBgTaskId)
    const selectBgTask = useStore((s) => s.selectBgTask)
    const startBgTask = useStore((s) => s.startBgTask)

    return (
        <div className="flex flex-col h-full" style={{ background: 'var(--bg-root)' }}>
            {/* Tab bar */}
            <div
                className="flex items-center gap-1 px-2 border-b border-[var(--border)] shrink-0 select-none"
                style={{ background: 'var(--bg-sidebar)', height: '30px' }}
            >
                <button
                    className="text-[11px] px-2 py-1 cursor-pointer transition-colors rounded"
                    style={{
                        fontFamily: 'var(--font-sans)',
                        color: activeTab === 'files' ? 'var(--text-primary)' : 'var(--text-dim)',
                        background: activeTab === 'files' ? 'var(--bg-active)' : 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'files' ? '2px solid var(--accent)' : '2px solid transparent',
                        fontWeight: 500,
                    }}
                    onMouseEnter={(e) => { if (activeTab !== 'files') { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                    onMouseLeave={(e) => { if (activeTab !== 'files') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' } }}
                    onClick={() => setActiveTab('files')}
                >
                    FILES
                </button>
                {!hideTasks && (
                    <button
                        className="text-[11px] px-2 py-1 cursor-pointer transition-colors rounded"
                        style={{
                            fontFamily: 'var(--font-sans)',
                            color: activeTab === 'tasks' ? 'var(--text-primary)' : 'var(--text-dim)',
                            background: activeTab === 'tasks' ? 'var(--bg-active)' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'tasks' ? '2px solid var(--accent)' : '2px solid transparent',
                            fontWeight: 500,
                        }}
                        onMouseEnter={(e) => { if (activeTab !== 'tasks') { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                        onMouseLeave={(e) => { if (activeTab !== 'tasks') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' } }}
                        onClick={() => setActiveTab('tasks')}
                    >
                        TASKS
                    </button>
                )}
                <button
                    className="text-[11px] px-2 py-1 cursor-pointer transition-colors rounded"
                    style={{
                        fontFamily: 'var(--font-sans)',
                        color: activeTab === 'debug' ? 'var(--text-primary)' : 'var(--text-dim)',
                        background: activeTab === 'debug' ? 'var(--bg-active)' : 'transparent',
                        border: 'none',
                        borderBottom: activeTab === 'debug' ? '2px solid var(--accent)' : '2px solid transparent',
                        fontWeight: 500,
                    }}
                    onMouseEnter={(e) => { if (activeTab !== 'debug') { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                    onMouseLeave={(e) => { if (activeTab !== 'debug') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' } }}
                    onClick={() => setActiveTab('debug')}
                >
                    DEBUG
                </button>
            </div>

            {/* FILES tab content */}
            <div style={{ display: activeTab === 'files' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
                <div
                    className="flex items-center gap-1.5 text-[12px] select-none shrink-0"
                    style={{ fontFamily: 'var(--font-sans)', padding: '6px 10px', background: 'var(--bg-sidebar)' }}
                >
                    <div className="flex items-center gap-0.5">
                        <button
                            className={headerBtnClass}
                            style={{ color: headerAction === 'new-file' ? 'var(--text-primary)' : 'var(--text-dim)' }}
                            title="New file"
                            onClick={() => toggleAction('new-file')}
                        >
                            <IconFilePlus size={13} />
                        </button>
                        <button
                            className={headerBtnClass}
                            style={{ color: headerAction === 'new-folder' ? 'var(--text-primary)' : 'var(--text-dim)' }}
                            title="New folder"
                            onClick={() => toggleAction('new-folder')}
                        >
                            <IconFolderPlus size={13} />
                        </button>
                        <button
                            className={headerBtnClass}
                            style={{ color: headerAction === 'search' ? 'var(--text-primary)' : 'var(--text-dim)' }}
                            title="Search files"
                            onClick={() => toggleAction('search')}
                        >
                            <IconSearch size={13} />
                        </button>
                        <button
                            className={headerBtnClass}
                            style={{ color: showHidden ? 'var(--text-primary)' : 'var(--text-dim)' }}
                            title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
                            onClick={() => setShowHidden(!showHidden)}
                        >
                            <IconEye size={13} />
                        </button>
                    </div>
                </div>
                <div>
                    {/* Inline input for new file / new folder / search */}
                    {headerAction !== 'none' && (
                        <div className="px-2 pb-1.5 shrink-0">
                            <div className="flex items-center gap-1.5 rounded-md px-2 py-1" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                                {headerAction === 'search' && (
                                    <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}><IconSearch size={12} /></span>
                                )}
                                <input
                                    ref={inputRef}
                                    className="flex-1 bg-transparent text-[12px] outline-none"
                                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                                    placeholder={
                                        headerAction === 'new-file' ? 'File name...'
                                            : headerAction === 'new-folder' ? 'Folder name...'
                                                : 'Search...'
                                    }
                                    value={headerAction === 'search' ? searchQuery : inputValue}
                                    onChange={(e) => {
                                        if (headerAction === 'search') setSearchQuery(e.target.value)
                                        else setInputValue(e.target.value)
                                    }}
                                    onKeyDown={handleInputKeyDown}
                                    onBlur={() => {
                                        setTimeout(() => {
                                            setHeaderAction('none')
                                            setInputValue('')
                                            setSearchQuery('')
                                        }, 200)
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px' }}>
                    {!tree || tree.length === 0 ? (
                        <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No project opened</div>
                    ) : displayTree.length === 0 && searchQuery ? (
                        <div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No files found</div>
                    ) : (
                        displayTree.map(node => renderNode(node))
                    )}
                </div>
                {renderContextMenu()}
            </div>

            {/* TASKS tab content */}
            <div style={{ display: (activeTab === 'tasks' && !hideTasks) ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
                <input
                    className="mx-2 mt-2 bg-[var(--bg-input)] text-[var(--text)] text-xs px-2 py-1 rounded outline-none border border-[var(--border)] placeholder:text-[var(--text-muted)]"
                    placeholder="Run command..."
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            startBgTask(e.currentTarget.value.trim())
                            e.currentTarget.value = ''
                        }
                    }}
                />
                <div className="flex-1 overflow-auto">
                    {bgTasks.length === 0 && (
                        <div className="px-3 py-8 text-xs text-center text-[var(--text-muted)]">No background tasks</div>
                    )}
                    {(() => {
                        const groups: { label: string; tasks: typeof bgTasks }[] = [
                            { label: 'Running', tasks: bgTasks.filter(t => t.status === 'running') },
                            { label: 'Completed', tasks: bgTasks.filter(t => t.status === 'exited' && t.exit_code === 0) },
                            { label: 'Stopped', tasks: bgTasks.filter(t => t.status === 'stopped' || (t.status === 'exited' && t.exit_code > 0)) },
                        ].filter(g => g.tasks.length > 0)
                        return groups.map(group => (
                            <div key={group.label}>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleGroup(group.label)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleGroup(group.label) }}
                                    className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] px-2 pt-2.5 pb-1 select-none font-medium uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] transition-colors sticky top-0 z-10"
                                    style={{ background: 'var(--bg-root)' }}
                                >
                                    <span className={`transition-transform duration-150 ${collapsedGroups.has(group.label) ? '' : 'rotate-90'}`}>
                                        <IconChevronRight size={12} />
                                    </span>
                                    <span>{group.label}</span>
                                    <span className="ml-auto text-[var(--text-dim)]">{group.tasks.length}</span>
                                </div>
                                {!collapsedGroups.has(group.label) && group.tasks.map((task) => (
                                    <div
                                        key={task.id}
                                        onClick={() => selectBgTask(task.id)}
                                        className={`flex items-center gap-2.5 px-2 py-1 ml-3 cursor-pointer rounded-md transition-colors duration-100 ${selectedBgTaskId === task.id
                                            ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                                            : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                                            }`}
                                    >
                                        {task.status === 'running' ? (
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
                                        ) : task.status === 'stopped' ? (
                                            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                                        ) : (
                                            <span className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" />
                                        )}
                                        <span className="text-sm font-mono text-[var(--text)] truncate">{task.command}</span>
                                    </div>
                                ))}
                            </div>
                        ))
                    })()}
                </div>
            </div>

            {/* DEBUG tab content */}
            <div style={{ display: activeTab === 'debug' ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
                <DebugPanel />
            </div>
        </div>
    )
}

export default FileTree
