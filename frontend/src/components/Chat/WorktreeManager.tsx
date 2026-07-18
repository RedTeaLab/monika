import { useState, useEffect, useMemo } from 'react'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'
import { Button, Input } from '../ui'

interface WorktreeInfo {
    branch: string
    path: string
    bound_sessions?: { id: string; title: string }[]
}

interface WorktreeManagerProps {
    sessionId: string
    onClose: () => void
}

function cleanError(e: unknown, fallback: string): string {
    const raw = (e as any)?.message || String(e)
    if (!raw) return fallback
    try {
        const parsed = JSON.parse(raw)
        const msg = parsed?.message || parsed?.error || parsed?.msg
        if (typeof msg === 'string') return simplify(msg, fallback)
    } catch { }
    return simplify(raw, fallback)
}

function simplify(raw: string, fallback: string): string {
    let msg = raw
    msg = msg.replace(/^git worktree \w+ failed:\s*/i, '')
    msg = msg.replace(/^fatal:\s*/i, '')
    msg = msg.replace(/^error:\s*/i, '')
    const lines = msg.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return fallback
    msg = lines[0]
    msg = msg.replace(/exit status \d+/g, '').trim()
    return msg || fallback
}

export default function WorktreeManager({ sessionId, onClose }: WorktreeManagerProps) {
    const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [selectedBranch, setSelectedBranch] = useState('')
    const [branchFilter, setBranchFilter] = useState('')
    const [error, setError] = useState('')
    const allBranches = useStore((s) => s.allBranches)
    const loadBranches = useStore((s) => s.loadBranches)
    const setSessionWorktree = useStore((s) => s.setSessionWorktree)
    const currentWorktreePath = useStore((s) => s.sessionWorktrees[sessionId])

    const worktreeBranches = useMemo(() => new Set(worktrees.map(wt => wt.branch)), [worktrees])

    const availableBranches = useMemo(() => {
        const locals = allBranches.filter(b => !b.remote)
        const seen = new Set<string>()
        const unique: typeof locals = []
        for (const b of locals) {
            if (!seen.has(b.name)) {
                seen.add(b.name)
                unique.push(b)
            }
        }
        return unique
    }, [allBranches])

    const filteredBranches = useMemo(() => {
        if (!branchFilter.trim()) return availableBranches
        const q = branchFilter.trim().toLowerCase()
        return availableBranches.filter(b => b.name.toLowerCase().includes(q))
    }, [availableBranches, branchFilter])

    const loadWorktrees = async () => {
        try {
            const list = await App.ListWorktrees() as WorktreeInfo[]
            setWorktrees(list || [])
        } catch {
            setWorktrees([])
        }
    }

    useEffect(() => { loadWorktrees() }, [])
    useEffect(() => {
        if (creating) loadBranches().catch(() => { })
    }, [creating])

    const handleAttach = async () => {
        if (!selectedPath) return
        setError('')
        try {
            await App.AttachWorktree(sessionId, selectedPath)
            setSessionWorktree(sessionId, selectedPath)
            loadWorktrees()
        } catch (e: any) {
            setError(cleanError(e, 'Failed to attach worktree'))
        }
    }

    const handleDetach = async () => {
        setError('')
        try {
            await App.DetachWorktree(sessionId)
            setSessionWorktree(sessionId, '')
            loadWorktrees()
        } catch (e: any) {
            setError(cleanError(e, 'Failed to detach worktree'))
        }
    }

    const handleDelete = async () => {
        if (!selectedPath) return
        const wt = worktrees.find(w => w.path === selectedPath)
        const boundOthers = (wt?.bound_sessions || []).filter(s => s.id !== sessionId)
        if (boundOthers.length > 0) {
            const names = boundOthers.map(s => s.title || s.id.slice(0, 8)).join(', ')
            if (!confirm(`This worktree is bound to ${names}. Delete anyway?`)) return
        }
        setError('')
        try {
            await App.DeleteWorktree(selectedPath)
            if (selectedPath === currentWorktreePath) {
                setSessionWorktree(sessionId, '')
            }
            loadWorktrees()
            setSelectedPath(null)
        } catch (e: any) {
            setError(cleanError(e, 'Failed to delete worktree'))
        }
    }

    const handleCreate = async () => {
        if (!selectedBranch) return
        setError('')
        try {
            const path = await App.CreateWorktree(sessionId, selectedBranch) as string
            setSessionWorktree(sessionId, path)
            setCreating(false)
            setSelectedBranch('')
            setBranchFilter('')
            loadWorktrees()
        } catch (e: any) {
            setError(cleanError(e, 'Failed to create worktree'))
        }
    }

    return (
        <Modal onClose={onClose} width={600}>
            <ModalHeader>
                <span className="text-[13px] font-medium">Worktrees</span>
            </ModalHeader>

            <ModalBody>
                {error && (
                    <div className="mb-3 text-[12px]" style={{ color: 'var(--red)' }}>
                        {error}
                    </div>
                )}

                {worktrees.length === 0 && !creating && (
                    <div className="text-[12px] py-8 text-center" style={{ color: 'var(--text-dim)' }}>
                        No worktrees. Create one to work on a different branch.
                    </div>
                )}

                {worktrees.map((wt, idx) => {
                    const isBound = wt.bound_sessions?.some(s => s.id === sessionId)
                    const isMain = idx === 0
                    const folderName = wt.path.split(/[/\\]/).pop() || wt.path
                    return (
                        <div
                            key={wt.path}
                            className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-[12px] transition-colors ${selectedPath === wt.path ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}`}
                            onClick={() => setSelectedPath(wt.path)}
                            title={wt.path}
                        >
                            <span className="font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>{wt.branch || '(detached)'}</span>
                            <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded" style={{ background: isMain ? 'var(--accent-muted)' : 'transparent', color: isMain ? 'var(--accent)' : 'var(--text-dim)' }}>
                                {isMain ? 'main' : folderName}
                            </span>
                            <span className="flex-1" />
                            <span className="text-[11px] shrink-0">
                                {isBound ? (
                                    <span style={{ color: 'var(--accent)' }}>This session</span>
                                ) : (
                                    <span style={{ color: 'var(--text-dim)' }}>Unbound</span>
                                )}
                            </span>
                        </div>
                    )
                })}

                {creating && (
                    <div className="mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--inner-highlight)] overflow-hidden">
                        <div className="px-3 pt-2.5 pb-2">
                            <Input
                                value={branchFilter}
                                onChange={(e) => { setBranchFilter(e.target.value); setSelectedBranch('') }}
                                autoFocus
                                placeholder="Search branches…"
                            />
                        </div>
                        <div className="max-h-[160px] overflow-y-auto border-t border-[var(--border-subtle)]">
                            {filteredBranches.length === 0 && (
                                <div className="px-3 py-3 text-center text-[11px] text-[var(--text-dim)]">
                                    No branches found
                                </div>
                            )}
                            {filteredBranches.map((b) => {
                                const alreadyUsed = worktreeBranches.has(b.name)
                                return (
                                    <div
                                        key={b.name}
                                        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[12px] transition-colors ${selectedBranch === b.name ? 'bg-[var(--surface-hover)]' : 'hover:bg-[var(--surface-hover)]'} ${alreadyUsed ? 'opacity-50' : ''}`}
                                        onClick={() => { if (!alreadyUsed) setSelectedBranch(b.name) }}
                                    >
                                        <span className="font-mono text-[var(--text-secondary)]">{b.name}</span>
                                        {alreadyUsed && (
                                            <span className="text-[10px] ml-auto text-[var(--text-dim)]">already a worktree</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border-subtle)]">
                            <Button variant="primary" size="sm" onClick={handleCreate} disabled={!selectedBranch}>Create</Button>
                            <Button variant="secondary" size="sm" onClick={() => { setCreating(false); setSelectedBranch(''); setBranchFilter('') }}>Cancel</Button>
                        </div>
                    </div>
                )}
            </ModalBody>

            <ModalFooter>
                <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>+ New</Button>
                <Button
                    variant={selectedPath && selectedPath !== currentWorktreePath ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={handleAttach}
                    disabled={!selectedPath || selectedPath === currentWorktreePath}
                >Attach</Button>
                <Button
                    variant={selectedPath ? 'destructive' : 'secondary'}
                    size="sm"
                    onClick={handleDelete}
                    disabled={!selectedPath}
                >Delete</Button>
                <div className="flex-1" />
                {currentWorktreePath && (
                    <Button variant="secondary" size="sm" onClick={handleDetach}>Detach</Button>
                )}
            </ModalFooter>
        </Modal>
    )
}
