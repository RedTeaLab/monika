import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNotificationStore } from '../../store/notificationStore'
import { IDockviewPanelProps } from 'dockview'
import { App as MonikaApp } from '../../../bindings/monika'
import type { ChangeStat, CommitInfo } from '../../../bindings/monika'
import { useStore } from '../../store'
import { GitBranch, GitCommitHorizontal, Copy, Clipboard, Tag, GitPullRequestArrow, RotateCcw, UndoDot, Pencil, Eye, Circle, CircleCheck, Upload, Download } from 'lucide-react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import { Button, AlertDialog } from '../ui'

function useEffectiveChangesPath() {
    const projectPath = useStore((s) => s.projectPath)
    const activeSessionId = useStore((s) => s.activeSessionId)
    const sessionWorktrees = useStore((s) => s.sessionWorktrees)
    return useMemo(() => {
        const wt = activeSessionId ? sessionWorktrees[activeSessionId] : undefined
        return wt || projectPath
    }, [activeSessionId, sessionWorktrees, projectPath])
}

function ChangesList(_props: IDockviewPanelProps) {
    const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes')
    const effectivePath = useEffectiveChangesPath()
    const projectPath = useStore((s) => s.projectPath)
    const isWorktree = effectivePath !== projectPath

    const gitFetch = useStore((s) => s.gitFetch)
    const gitPull = useStore((s) => s.gitPull)
    const [fetching, setFetching] = useState(false)
    const [pulling, setPulling] = useState(false)

    const handleFetch = async () => {
        setFetching(true)
        try {
            await gitFetch(effectivePath)
        } finally {
            setFetching(false)
        }
    }

    const handlePull = async () => {
        setPulling(true)
        try {
            await gitPull(effectivePath)
        } finally {
            setPulling(false)
        }
    }

    // Extract branch name from worktree path
    const branchDisplay = useMemo(() => {
        if (!isWorktree) return null
        const parts = effectivePath.replace(/\\/g, '/').split('/')
        return parts[parts.length - 1]
    }, [effectivePath, isWorktree])

    return (
        <div
            className="flex flex-col h-full"
            style={{ background: 'var(--bg-root)' }}
        >
            {/* Tab bar */}
            <div
                className="flex items-center gap-1 px-2 border-b border-[var(--border)] shrink-0 select-none"
                style={{ background: 'var(--bg-root)', height: '30px' }}
            >
                <TabButton
                    label="CHANGES"
                    active={activeTab === 'changes'}
                    onClick={() => setActiveTab('changes')}
                />
                <TabButton
                    label="HISTORY"
                    active={activeTab === 'history'}
                    onClick={() => setActiveTab('history')}
                />
            </div>

            {/* Worktree path bar */}
            <div
                className="flex items-center gap-1.5 text-[12px] select-none shrink-0 border-b border-[var(--border)]"
                style={{ fontFamily: 'var(--font-sans)', padding: '4px 10px', background: 'var(--bg-sidebar)' }}
            >
                <GitBranch size={12} style={{ flexShrink: 0, color: isWorktree ? 'var(--accent)' : 'var(--text-dim)' }} />
                <span
                    className="truncate"
                    style={{ color: isWorktree ? 'var(--text-primary)' : 'var(--text-dim)', fontSize: '11px' }}
                    title={isWorktree ? effectivePath : projectPath}
                >
                    {isWorktree ? branchDisplay : 'Main'}
                </span>
                {activeTab === 'history' && (
                    <div className="ml-auto flex items-center gap-0.5">
                        <button
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--bg-hover)] transition-colors"
                            style={{
                                color: 'var(--text-dim)',
                                opacity: fetching ? 0.5 : 1,
                                cursor: fetching ? 'wait' : 'pointer',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                            onClick={handleFetch}
                            disabled={fetching || pulling}
                            title="Fetch"
                        >
                            <Download size={13} strokeWidth={1.5} />
                        </button>
                        <button
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--bg-hover)] transition-colors"
                            style={{
                                color: 'var(--text-dim)',
                                opacity: pulling ? 0.5 : 1,
                                cursor: pulling ? 'wait' : 'pointer',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
                            onClick={handlePull}
                            disabled={fetching || pulling}
                            title="Pull"
                        >
                            <GitPullRequestArrow size={13} strokeWidth={1.5} />
                        </button>
                    </div>
                )}
            </div>

            {/* Tab content */}
            {/* Tab content — always mount both so background tab stays alive */}
            <div style={{ display: activeTab === 'changes' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
                <ChangesTab effectivePath={effectivePath} />
            </div>
            <div style={{ display: activeTab === 'history' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
                <HistoryTab active={activeTab === 'history'} effectivePath={effectivePath} />
            </div>
        </div>
    )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            className="text-[11px] px-2 py-1 cursor-pointer transition-colors rounded"
            style={{
                fontFamily: 'var(--font-sans)',
                color: active ? 'var(--text-primary)' : 'var(--text-dim)',
                background: active ? 'var(--bg-active)' : 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                fontWeight: 500,
            }}
            onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' } }}
            onClick={onClick}
        >
            {label}
        </button>
    )
}

function ChangesTab({ effectivePath }: { effectivePath: string }) {
    const changes = useStore((s) => s.changeStats)
    const setPreviewDiff = useStore((s) => s.setPreviewDiff)
    const stageFiles = useStore((s) => s.stageFiles)
    const unstageFiles = useStore((s) => s.unstageFiles)
    const commitChanges = useStore((s) => s.commitChanges)
    const feedback = useStore((s) => s.feedback)
    const clearFeedback = useStore((s) => s.clearFeedback)
    const [selectedUnstaged, setSelectedUnstaged] = useState<Set<string>>(new Set())
    const [selectedStaged, setSelectedStaged] = useState<Set<string>>(new Set())
    const [commitMsg, setCommitMsg] = useState('')
    const [committing, setCommitting] = useState(false)

    useEffect(() => {
        if (!feedback.message) return
        useNotificationStore.getState().pushToast(feedback.message, feedback.type)
        clearFeedback()
    }, [feedback.message])

    const unstaged = changes.stats.filter(s => !s.staged)
    const staged = changes.stats.filter(s => s.staged)
    const canCommit = staged.length > 0 && commitMsg.trim() !== ''

    const toggleUnstaged = (path: string) => {
        setSelectedUnstaged(prev => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path); else next.add(path)
            return next
        })
    }

    const toggleStaged = (path: string) => {
        setSelectedStaged(prev => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path); else next.add(path)
            return next
        })
    }

    const handleStage = async () => {
        if (selectedUnstaged.size === 0) return
        const paths = Array.from(selectedUnstaged)
        await stageFiles(paths)
        setSelectedUnstaged(new Set())
    }

    const handleUnstage = async () => {
        if (selectedStaged.size === 0) return
        await unstageFiles(Array.from(selectedStaged))
        setSelectedStaged(new Set())
    }

    const handleCommit = async (push: boolean) => {
        if (!commitMsg.trim() || staged.length === 0) return
        setCommitting(true)
        await commitChanges(commitMsg, push)
        setCommitting(false)
        setCommitMsg('')
    }

    const handleFileClick = async (stat: ChangeStat) => {
        try {
            const fileName = stat.path.split('/').pop() || stat.path
            if (stat.staged) {
                const result = await MonikaApp.GetStagedFileDiff(effectivePath, stat.path)
                if (result && result.lines) {
                    setPreviewDiff(stat.path, fileName, result.lines)
                }
            } else {
                const result = await MonikaApp.GetFileDiff(effectivePath, stat.path)
                if (result && result.lines) {
                    setPreviewDiff(stat.path, fileName, result.lines)
                }
            }
        } catch {
            // ignore
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey && e.shiftKey) {
            e.preventDefault()
            handleCommit(true)
        } else if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault()
            handleCommit(false)
        }
    }

    const basenameFn = (p: string) => p.split('/').pop() || p

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] text-[var(--text-dim)] sticky top-0" style={{ background: 'var(--bg-sidebar)' }}>
                    <span>Unstaged ({unstaged.length})</span>
                    {selectedUnstaged.size > 0 && (
                        <button
                            className="px-2 py-0.5 rounded text-[11px] cursor-pointer"
                            style={{ background: 'var(--bg-active)', color: 'var(--accent)', border: 'none' }}
                            onClick={handleStage}
                        >Stage ▶</button>
                    )}
                </div>
                {unstaged.length === 0 ? (
                    <div className="py-2 text-[11px] text-[var(--text-dim)] px-2">
                        {changes.loading ? 'Loading...' : 'No unstaged changes'}
                    </div>
                ) : (
                    unstaged.map((stat) => {
                        const selected = selectedUnstaged.has(stat.path)
                        return (
                            <div
                                key={'un-' + stat.path}
                                className="flex items-center gap-1 cursor-pointer text-[12px] leading-[24px] rounded-md transition-colors mx-1 px-[6px]"
                                style={{ color: 'var(--text-secondary)', background: selected ? 'var(--bg-active)' : 'transparent' }}
                                onDoubleClick={() => { stageFiles([stat.path]); }}
                            >
                                <span
                                    onClick={(e) => { e.stopPropagation(); toggleUnstaged(stat.path) }}
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                >
                                    {selected
                                        ? <CircleCheck size={14} style={{ color: 'var(--accent)' }} strokeWidth={1.5} />
                                        : <Circle size={14} style={{ color: 'var(--text-dim)' }} strokeWidth={1.5} />}
                                </span>
                                <span className="truncate flex-1" onClick={() => handleFileClick(stat)} title={stat.path}>
                                    {basenameFn(stat.path)}
                                </span>
                                {stat.added > 0 && <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--green)' }}>+{stat.added}</span>}
                                {stat.deleted > 0 && <span className="text-[11px] flex-shrink-0 ml-0.5" style={{ color: 'var(--red)' }}>-{stat.deleted}</span>}
                            </div>
                        )
                    })
                )}

                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />

                <div className="flex items-center justify-between px-2 py-1 text-[11px] text-[var(--text-dim)] sticky top-0" style={{ background: 'var(--bg-sidebar)', zIndex: 1 }}>
                    <span>Staged ({staged.length})</span>
                    {selectedStaged.size > 0 && (
                        <button
                            className="px-2 py-0.5 rounded text-[11px] cursor-pointer"
                            style={{ background: 'var(--bg-active)', color: 'var(--accent)', border: 'none' }}
                            onClick={handleUnstage}
                        >◀ Unstage</button>
                    )}
                </div>
                {staged.length === 0 ? (
                    <div className="py-2 text-[11px] text-[var(--text-dim)] px-2">No staged changes</div>
                ) : (
                    staged.map((stat) => {
                        const selected = selectedStaged.has(stat.path)
                        return (
                            <div
                                key={'st-' + stat.path}
                                className="flex items-center gap-1 cursor-pointer text-[12px] leading-[24px] rounded-md transition-colors mx-1 px-[6px]"
                                style={{ color: 'var(--text-secondary)', background: selected ? 'var(--bg-active)' : 'transparent' }}
                                onDoubleClick={() => { unstageFiles([stat.path]); }}
                            >
                                <span
                                    onClick={(e) => { e.stopPropagation(); toggleStaged(stat.path) }}
                                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                >
                                    {selected
                                        ? <CircleCheck size={14} style={{ color: 'var(--accent)' }} strokeWidth={1.5} />
                                        : <Circle size={14} style={{ color: 'var(--text-dim)' }} strokeWidth={1.5} />}
                                </span>
                                <span className="truncate flex-1" onClick={() => handleFileClick(stat)} title={stat.path}>
                                    {basenameFn(stat.path)}
                                </span>
                                {stat.added > 0 && <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--green)' }}>+{stat.added}</span>}
                                {stat.deleted > 0 && <span className="text-[11px] flex-shrink-0 ml-0.5" style={{ color: 'var(--red)' }}>-{stat.deleted}</span>}
                            </div>
                        )
                    })
                )}
            </div>

            <div className="shrink-0 border-t border-[var(--border)] flex flex-col" style={{ background: 'var(--bg-root)' }}>
                <textarea
                    className="w-full text-[12px] outline-none border-0 resize-none bg-transparent"
                    style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-sans)',
                        padding: '8px 12px',
                        height: '48px',
                    }}
                    placeholder="Commit message..."
                    value={commitMsg}
                    onChange={(e) => setCommitMsg(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={committing}
                />
                <div className="flex items-center gap-2 px-3 pb-2">
                    {staged.length > 0 && (
                        <span className="text-[11px] text-[var(--text-dim)] select-none">
                            {staged.length} staged
                        </span>
                    )}
                    <div className="flex-1" />
                    <button
                        className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 transition-colors"
                        style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: canCommit ? 'var(--text-secondary)' : 'var(--text-dim)',
                            fontFamily: 'inherit',
                            opacity: canCommit ? 1 : 0.5,
                            cursor: canCommit ? 'pointer' : 'not-allowed',
                        }}
                        onMouseEnter={(e) => { if (canCommit) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                        onClick={() => handleCommit(false)}
                        disabled={committing || !canCommit}
                    >
                        <GitCommitHorizontal size={12} strokeWidth={1.5} />
                        {committing ? 'Committing...' : 'Commit'}
                    </button>
                    <button
                        className="text-[11px] px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 transition-colors"
                        style={{
                            background: canCommit ? 'var(--accent)' : 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: canCommit ? '#fff' : 'var(--text-dim)',
                            fontFamily: 'inherit',
                            opacity: canCommit ? 1 : 0.5,
                            cursor: canCommit ? 'pointer' : 'not-allowed',
                        }}
                        onMouseEnter={(e) => { if (canCommit) e.currentTarget.style.background = 'var(--accent-hover)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = canCommit ? 'var(--accent)' : 'var(--bg-elevated)' }}
                        onClick={() => handleCommit(true)}
                        disabled={committing || !canCommit}
                    >
                        <Upload size={12} strokeWidth={1.5} />
                        {committing ? 'Pushing...' : 'Commit & Push'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function HistoryTab({ active, effectivePath }: { active: boolean; effectivePath: string }) {
    const commitHistory = useStore((s) => s.commitHistory)
    const loadCommitHistory = useStore((s) => s.loadCommitHistory)
    const setPreviewCommit = useStore((s) => s.setPreviewCommit)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commit: CommitInfo } | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const menuJustOpened = useRef(false)
    const [pendingConfirm, setPendingConfirm] = useState<{
        title: string; message: string; confirmLabel: string; variant: 'danger' | 'primary';
        onConfirm: () => Promise<void>;
    } | null>(null)
    const [confirmLoading, setConfirmLoading] = useState(false)
    const [confirmError, setConfirmError] = useState('')
    const [inputModal, setInputModal] = useState<{
        title: string; label: string; defaultValue: string; confirmLabel: string;
        onConfirm: (value: string) => Promise<void>;
    } | null>(null)

    useEffect(() => {
        if (!active) return
        loadCommitHistory(effectivePath)
    }, [active, effectivePath]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!contextMenu) return
        menuJustOpened.current = true
        const onClick = () => {
            if (menuJustOpened.current) { menuJustOpened.current = false; return }
            setContextMenu(null)
        }
        window.addEventListener('click', onClick)
        return () => window.removeEventListener('click', onClick)
    }, [contextMenu])

    const handleClick = (commit: CommitInfo) => {
        setPreviewCommit(commit.hash)
    }

    const handleContextMenu = (e: React.MouseEvent, commit: CommitInfo) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, commit })
    }

    const handleCopyHash = (commit: CommitInfo) => {
        navigator.clipboard.writeText(commit.hash)
        setContextMenu(null)
    }

    const handleCopyMessage = (commit: CommitInfo) => {
        navigator.clipboard.writeText(commit.message)
        setContextMenu(null)
    }

    const handleCheckoutCommit = async (c: CommitInfo) => {
        setContextMenu(null)
        try {
            await MonikaApp.CheckoutCommit(effectivePath, c.hash)
            loadCommitHistory()
        } catch { /* feedback handled by store */ }
    }

    const handleCreateTag = async (c: CommitInfo) => {
        setContextMenu(null)
        setInputModal({
            title: 'Create Tag',
            label: 'Tag name',
            defaultValue: '',
            confirmLabel: 'Create',
            onConfirm: async (name) => {
                await MonikaApp.CreateTag(effectivePath, c.hash, name)
                loadCommitHistory()
                setInputModal(null)
            },
        })
    }

    const handleCreateBranch = async (c: CommitInfo) => {
        setContextMenu(null)
        setInputModal({
            title: 'Create Branch at Commit',
            label: 'Branch name',
            defaultValue: '',
            confirmLabel: 'Create',
            onConfirm: async (name) => {
                await MonikaApp.CreateBranchAt(effectivePath, c.hash, name)
                loadCommitHistory()
                setInputModal(null)
            },
        })
    }

    const handleRevertCommit = (c: CommitInfo) => {
        setContextMenu(null)
        setPendingConfirm({
            title: `Revert ${c.hash.slice(0, 7)}?`,
            message: `This will create a new commit that reverses "${c.message}".`,
            confirmLabel: 'Revert',
            variant: 'danger',
            onConfirm: async () => {
                await MonikaApp.RevertCommit(effectivePath, c.hash)
                loadCommitHistory()
                setPendingConfirm(null)
            },
        })
    }

    const handleCherryPick = (c: CommitInfo) => {
        setContextMenu(null)
        setPendingConfirm({
            title: 'Cherry-pick Commit?',
            message: `Apply "${c.hash.slice(0, 7)}: ${c.message}" to the current branch.`,
            confirmLabel: 'Cherry-pick',
            variant: 'primary',
            onConfirm: async () => {
                await MonikaApp.CherryPickCommit(effectivePath, c.hash)
                loadCommitHistory()
                setPendingConfirm(null)
            },
        })
    }

    const handleReset = (c: CommitInfo, mode: 'soft' | 'mixed' | 'hard') => {
        setContextMenu(null)
        const descriptions: Record<string, string> = {
            soft: 'HEAD only — staged changes are kept.',
            mixed: 'HEAD + index — unstaged changes are kept (default).',
            hard: 'ALL changes will be permanently discarded.',
        }
        setPendingConfirm({
            title: `Reset to ${c.hash.slice(0, 7)} (${mode})?`,
            message: descriptions[mode] + (mode === 'hard' ? ' This cannot be undone.' : ''),
            confirmLabel: `Reset ${mode}`,
            variant: mode === 'hard' ? 'danger' : 'primary',
            onConfirm: async () => {
                await MonikaApp.ResetToCommit(effectivePath, c.hash, mode)
                loadCommitHistory()
                setPendingConfirm(null)
            },
        })
    }

    const handleAmendMessage = async (c: CommitInfo) => {
        setContextMenu(null)
        setInputModal({
            title: 'Amend Commit Message',
            label: 'New message',
            defaultValue: c.message,
            confirmLabel: 'Amend',
            onConfirm: async (newMsg) => {
                await MonikaApp.AmendMessage(effectivePath, newMsg)
                loadCommitHistory()
                setInputModal(null)
            },
        })
    }

    const renderContextMenu = () => {
        if (!contextMenu) return null
        const c = contextMenu.commit
        const menuItems: { label: string; icon: React.ReactNode; action: () => void; separator?: boolean; danger?: boolean }[] = [
            { label: 'View Details', icon: <Eye size={14} />, action: () => { setContextMenu(null); handleClick(c) } },
            { label: 'Copy Hash', icon: <Copy size={14} />, action: () => handleCopyHash(c), separator: true },
            { label: 'Copy Message', icon: <Clipboard size={14} />, action: () => handleCopyMessage(c) },
            { label: 'Checkout Commit...', icon: <GitCommitHorizontal size={14} />, action: () => handleCheckoutCommit(c), separator: true },
            { label: 'Create Tag...', icon: <Tag size={14} />, action: () => handleCreateTag(c) },
            { label: 'Create Branch at Commit...', icon: <GitBranch size={14} />, action: () => handleCreateBranch(c) },
            { label: 'Revert Commit', icon: <RotateCcw size={14} />, action: () => handleRevertCommit(c), separator: true },
            { label: 'Cherry-pick Commit', icon: <GitPullRequestArrow size={14} />, action: () => handleCherryPick(c) },
            { label: 'Reset to Commit (Soft)', icon: <UndoDot size={14} />, action: () => handleReset(c, 'soft'), separator: true },
            { label: 'Reset to Commit (Mixed)', icon: <UndoDot size={14} />, action: () => handleReset(c, 'mixed') },
            { label: 'Reset to Commit (Hard)', icon: <UndoDot size={14} />, action: () => handleReset(c, 'hard'), danger: true },
        ]
        if (c.hash === commitHistory.commits[0]?.hash) {
            menuItems.push({ label: 'Amend Message...', icon: <Pencil size={14} />, action: () => handleAmendMessage(c), separator: true })
        }
        return createPortal(
            <div
                ref={menuRef}
                className="fixed"
                style={{
                    left: contextMenu.x, top: contextMenu.y, zIndex: 2000,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', padding: '4px 0', minWidth: '220px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontSize: '12px', fontFamily: 'var(--font-sans)',
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
                            onClick={() => { setContextMenu(null); item.action() }}
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

    const graph = useMemo(() => computeGraph(commitHistory.commits), [commitHistory.commits])
    const graphWidth = Math.max(graph.numLanes, 1) * LANE_W + 12

    if (commitHistory.loading && commitHistory.commits.length === 0) {
        return <div className="flex-1 overflow-y-auto" style={{ padding: '8px' }}><div className="py-4 text-[12px] text-[var(--text-dim)] px-1">Loading...</div></div>
    }
    if (commitHistory.error && commitHistory.commits.length === 0) {
        return <div className="flex-1 overflow-y-auto" style={{ padding: '8px' }}><div className="py-4 text-[12px] text-[var(--red)] px-1">{commitHistory.error}</div></div>
    }
    if (commitHistory.commits.length === 0) {
        return <div className="flex-1 overflow-y-auto" style={{ padding: '8px' }}><div className="py-4 text-[12px] text-[var(--text-dim)] px-1">No commits</div></div>
    }

    return (
        <>
            <div className="flex-1 overflow-y-auto" style={{ position: 'relative', padding: '0 8px' }}>
                <CommitGraphSVG
                    commits={commitHistory.commits}
                    laneOf={graph.laneOf}
                    edges={graph.edges}
                    numLanes={graph.numLanes}
                />
                {commitHistory.commits.map((commit, idx) => (
                    <CommitRow
                        key={commit.hash + '-' + idx}
                        commit={commit}
                        graphWidth={graphWidth}
                        onClick={() => handleClick(commit)}
                        onContextMenu={(e) => handleContextMenu(e, commit)}
                    />
                ))}
            </div>
            {renderContextMenu()}
            {pendingConfirm && (
                <AlertDialog
                    open={true}
                    title={pendingConfirm.title}
                    description={pendingConfirm.message}
                    confirmLabel={pendingConfirm.confirmLabel}
                    variant={pendingConfirm.variant === 'primary' ? 'primary' : 'destructive'}
                    loading={confirmLoading}
                    error={confirmError}
                    onConfirm={async () => {
                        setConfirmError(''); setConfirmLoading(true)
                        try {
                            await pendingConfirm.onConfirm()
                            setPendingConfirm(null)
                        } catch (e) {
                            setConfirmError(e instanceof Error ? e.message : 'Operation failed')
                        } finally {
                            setConfirmLoading(false)
                        }
                    }}
                    onCancel={() => { setPendingConfirm(null); setConfirmError('') }}
                />
            )}
            {inputModal && <InputModal config={inputModal} onCancel={() => setInputModal(null)} />}
        </>
    )
}

function CommitRow({ commit, graphWidth, onClick, onContextMenu }: { commit: CommitInfo; graphWidth: number; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void }) {
    const [hover, setHover] = useState(false)
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
    const rowRef = useRef<HTMLDivElement>(null)

    const handleMouseEnter = () => {
        if (rowRef.current) {
            const rect = rowRef.current.getBoundingClientRect()
            setTooltipPos({ x: rect.left + 8, y: rect.bottom + 4 })
        }
        setHover(true)
    }

    return (
        <>
            <div
                ref={rowRef}
                className="flex items-center gap-1 text-[12px] rounded-md transition-colors duration-150 px-1 cursor-pointer hover:bg-[var(--bg-hover)] overflow-hidden"
                style={{ fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)', paddingLeft: graphWidth, height: ROW_H, lineHeight: `${ROW_H}px` }}
                onClick={onClick}
                onContextMenu={onContextMenu}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setHover(false)}
            >
                <span className="flex-shrink-0" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '11px', width: '7ch' }}>
                    {commit.hash.slice(0, 7)}
                </span>
                {commit.refs && <RefTags refs={commit.refs} />}
                <span className="truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>{commit.message}</span>
                <span className="flex-shrink-0 flex items-center gap-1.5" style={{ color: 'var(--text-dim)', fontSize: '11px', width: '22ch' }}>
                    <span className="truncate" style={{ minWidth: 0 }}>{commit.author}</span>
                    <span className="flex-shrink-0">{commit.date}</span>
                </span>
            </div>
            {hover && createPortal(
                <div
                    className="fixed"
                    style={{
                        left: tooltipPos.x,
                        top: tooltipPos.y,
                        zIndex: 1500,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 12px',
                        maxWidth: '480px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-sans)',
                        pointerEvents: 'none',
                    }}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{commit.hash.slice(0, 7)}</span>
                        {commit.refs && <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>{commit.refs}</span>}
                    </div>
                    <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5' }}>
                        {commit.message}
                    </div>
                    <div className="flex items-center gap-2 mt-1" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                        <span>{commit.author}</span>
                        <span>·</span>
                        <span>{commit.date}</span>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}

function RefTags({ refs }: { refs: string }) {
    const parts = refs.split(',').map((s) => s.trim()).filter(Boolean)
    return (
        <span className="flex items-center gap-1 flex-shrink-0">
            {parts.map((ref) => {
                let color = 'var(--text-dim)'
                let bg = 'var(--bg-sidebar)'
                if (ref.startsWith('tag:')) {
                    color = '#f0c040'
                    bg = 'rgba(240,192,64,0.1)'
                } else if (ref.startsWith('HEAD')) {
                    color = 'var(--accent)'
                    bg = 'rgba(100,150,255,0.1)'
                } else if (ref.startsWith('origin/')) {
                    color = 'var(--green)'
                    bg = 'rgba(80,200,120,0.1)'
                }
                return (
                    <span
                        key={ref}
                        style={{
                            color,
                            background: bg,
                            borderRadius: '3px',
                            padding: '0 4px',
                            fontSize: '10px',
                            lineHeight: '18px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {ref}
                    </span>
                )
            })}
        </span>
    )
}
export default ChangesList

function InputModal({ config, onCancel }: { config: { title: string; label: string; defaultValue: string; confirmLabel: string; onConfirm: (value: string) => Promise<void> }; onCancel: () => void }) {
    const [value, setValue] = useState(config.defaultValue)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [])

    const handleSubmit = async () => {
        if (!value.trim()) return
        setIsLoading(true)
        setError('')
        try {
            await config.onConfirm(value.trim())
        } catch (err: any) {
            setError(err?.message || 'Operation failed')
            setIsLoading(false)
        }
    }

    return (
        <Modal onClose={onCancel} loading={isLoading} width={400}>
            <ModalHeader>
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)] m-0">{config.title}</h2>
            </ModalHeader>
            <ModalBody>
                <label className="text-[12px] text-[var(--text-dim)] block mb-2">{config.label}</label>
                <input
                    ref={inputRef}
                    type="text"
                    className="w-full rounded-md text-[13px]"
                    style={{
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-sans)',
                        padding: '8px 10px',
                        outline: 'none',
                    }}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
                        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
                    }}
                    disabled={isLoading}
                />
                {error && <p className="text-[12px] text-[var(--red)] mt-3 mb-0">{error}</p>}
            </ModalBody>
            <ModalFooter>
                <Button variant="secondary" size="sm" onClick={onCancel} disabled={isLoading}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isLoading || !value.trim()}>
                    {isLoading ? `${config.confirmLabel}ing...` : config.confirmLabel}
                </Button>
            </ModalFooter>
        </Modal>
    )
}

const GRAPH_COLORS = [
    '#e06c75', '#61afef', '#98c379', '#e5c07b',
    '#c678dd', '#56b6c2', '#d19a66', '#be5046',
]
const LANE_W = 14
const ROW_H = 22

interface GraphEdge { fromRow: number; fromLane: number; toRow: number; toLane: number; color: number }

function computeGraph(commits: CommitInfo[]) {
    const hashToIndex = new Map<string, number>()
    commits.forEach((c, i) => hashToIndex.set(c.hash, i))

    // Also build a prefix map: first 7 chars of full parent hash → commit index
    const prefixToIndex = new Map<string, number>()
    commits.forEach((c, i) => {
        const parents = c.parents || []
        for (const p of parents) {
            if (!prefixToIndex.has(p.slice(0, 7))) {
                // Find which commit this prefix belongs to
                const matchIdx = commits.findIndex(cc => cc.hash === p.slice(0, 7) || p.startsWith(cc.hash) || cc.hash.startsWith(p.slice(0, 7)))
                if (matchIdx >= 0) prefixToIndex.set(p.slice(0, 7), matchIdx)
            }
        }
    })

    const resolveParent = (parentHash: string): number => {
        // Try exact match first (7-char hash)
        let idx = hashToIndex.get(parentHash.slice(0, 7))
        if (idx !== undefined) return idx
        // Try prefix match
        idx = prefixToIndex.get(parentHash.slice(0, 7))
        if (idx !== undefined) return idx
        // Brute force: find commit whose hash is a prefix of parentHash or vice versa
        for (let j = 0; j < commits.length; j++) {
            if (parentHash.startsWith(commits[j].hash) || commits[j].hash.startsWith(parentHash.slice(0, 7))) {
                return j
            }
        }
        return -1
    }

    const N = commits.length
    const laneOf: number[] = new Array(N).fill(-1)
    const laneTarget: number[] = []  // -1 = free, otherwise = target commit index
    let maxLane = 0

    for (let i = 0; i < N; i++) {
        const commit = commits[i]

        let myLane = laneTarget.indexOf(i)
        if (myLane === -1) {
            myLane = laneTarget.indexOf(-1)
            if (myLane === -1) {
                myLane = laneTarget.length
                laneTarget.push(-1)
            }
        }
        laneOf[i] = myLane
        if (myLane + 1 > maxLane) maxLane = myLane + 1

        for (let l = 0; l < laneTarget.length; l++) {
            if (laneTarget[l] === i) laneTarget[l] = -1
        }
        laneTarget[myLane] = -1

        const parents = commit.parents || []
        if (parents.length > 0) {
            const p0Idx = resolveParent(parents[0])
            if (p0Idx >= 0) laneTarget[myLane] = p0Idx
            for (let p = 1; p < parents.length; p++) {
                const pIdx = resolveParent(parents[p])
                if (pIdx < 0) continue
                let ml = -1
                for (let l = 0; l < laneTarget.length; l++) {
                    if (laneTarget[l] === -1) { ml = l; break }
                }
                if (ml === -1) {
                    ml = laneTarget.length
                    laneTarget.push(pIdx)
                    if (ml + 1 > maxLane) maxLane = ml + 1
                } else {
                    laneTarget[ml] = pIdx
                }
            }
        }
    }

    const edges: GraphEdge[] = []
    for (let i = 0; i < N; i++) {
        const parents = commits[i].parents || []
        for (let p = 0; p < parents.length; p++) {
            const pIdx = resolveParent(parents[p])
            if (pIdx < 0) continue
            edges.push({
                fromRow: i, fromLane: laneOf[i],
                toRow: pIdx, toLane: laneOf[pIdx],
                color: p === 0 ? laneOf[i] : laneOf[pIdx],
            })
        }
    }
    return { laneOf, edges, numLanes: maxLane }
}

function CommitGraphSVG({ commits, laneOf, edges, numLanes }: {
    commits: CommitInfo[]; laneOf: number[]; edges: GraphEdge[]; numLanes: number
}) {
    const w = Math.max(numLanes, 1) * LANE_W + 4
    const h = commits.length * ROW_H
    const laneX = (l: number) => l * LANE_W + LANE_W / 2 + 2
    const rowY = (r: number) => r * ROW_H + ROW_H / 2
    const d = ROW_H * 0.4

    return (
        <svg width={w} height={h} style={{ position: 'absolute', left: 8, top: 0, pointerEvents: 'none', zIndex: 0 }}>
            {edges.map((e, i) => {
                const x1 = laneX(e.fromLane), y1 = rowY(e.fromRow)
                const x2 = laneX(e.toLane), y2 = rowY(e.toRow)
                const color = GRAPH_COLORS[e.color % GRAPH_COLORS.length]
                let path: string
                if (x1 === x2) {
                    path = `M${x1},${y1} L${x1},${y2}`
                } else {
                    const ty = Math.min(y1 + ROW_H, (y1 + y2) / 2)
                    path = `M${x1},${y1} L${x1},${y1 + 2} C${x1},${y1 + d} ${x2},${ty - d} ${x2},${ty} L${x2},${y2}`
                }
                return <path key={i} d={path} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            })}
            {commits.map((c, i) => {
                const cx = laneX(laneOf[i]), cy = rowY(i)
                const color = GRAPH_COLORS[laneOf[i] % GRAPH_COLORS.length]
                if (c.refs?.includes('HEAD')) {
                    return <circle key={i} cx={cx} cy={cy} r={5} fill="none" stroke={color} strokeWidth={2} />
                }
                return <circle key={i} cx={cx} cy={cy} r={4} fill={color} />
            })}
        </svg>
    )
}