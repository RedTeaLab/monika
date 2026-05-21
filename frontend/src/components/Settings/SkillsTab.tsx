import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'

export default function SkillsTab() {
  const skills = useStore((s) => s.skills)
  const skillPaths = useStore((s) => s.skillPaths)
  const loadSkills = useStore((s) => s.loadSkills)
  const addSkillPath = useStore((s) => s.addSkillPath)
  const removeSkillPath = useStore((s) => s.removeSkillPath)

  const [showAddModal, setShowAddModal] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadSkills() }, [loadSkills])

  const handleAdd = useCallback(async () => {
    const trimmed = newPath.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      await addSkillPath(trimmed)
      setNewPath('')
      setShowAddModal(false)
    } catch { /* error handled by store */ }
    finally { setLoading(false) }
  }, [newPath, addSkillPath])

  const handleRemove = useCallback(async (path: string) => {
    await removeSkillPath(path)
  }, [removeSkillPath])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) { setShowAddModal(false); setNewPath('') }
  }, [loading])

  const isEmpty = skills.length === 0 && skillPaths.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold m-0 mb-1">Skills</h3>
          <p className="text-[11px] text-[var(--text-dim)] m-0">Manage skill search paths and discovered skills</p>
        </div>
      </div>

      {skillPaths.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {skillPaths.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)]">
              <span className="text-[var(--text-dim)] font-mono text-[10px]">{p}</span>
              <button onClick={() => handleRemove(p)} className="text-[var(--text-dim)] hover:text-red-400 cursor-pointer bg-transparent border-none p-0 leading-none text-[13px]" title="Remove path">✕</button>
            </span>
          ))}
        </div>
      )}

      <div className="mb-4">
        <button
          className="px-3 py-1.5 text-[11px] font-medium rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
          onClick={() => setShowAddModal(true)}
        >
          + Add Path
        </button>
      </div>

      {skills.length > 0 ? (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Description</th>
              <th className="py-2 pr-4 font-medium">Path</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s, i) => (
              <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                <td className="py-2 pr-4 text-[var(--text-primary)]">{s.name}</td>
                <td className="py-2 pr-4 text-[var(--text-dim)]">{s.description}</td>
                <td className="py-2 pr-4 text-[var(--text-dim)] font-mono text-[11px]">{s.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col items-center justify-center h-32 text-[var(--text-dim)]">
          <span className="text-[13px]">{isEmpty ? 'No skills discovered. Add a skill path to get started.' : 'No skills discovered. Add a skill path to get started.'}</span>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={loading ? undefined : () => { setShowAddModal(false); setNewPath('') }}>
          <div role="dialog" aria-modal className="bg-[var(--bg-elevated)] rounded-[var(--radius-lg)] w-[420px] p-5" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
            <h4 className="text-[14px] font-semibold m-0 mb-4">Add Skill Path</h4>
            <label className="block text-[10px] font-medium text-[var(--text-dim)] mb-1">Directory Path</label>
            <input className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] mb-4"
              placeholder="/path/to/skills" value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={handleKeyDown} autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowAddModal(false); setNewPath('') }} disabled={loading}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] px-3 py-1.5 text-[13px] rounded-[2px] transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleAdd} disabled={loading || !newPath.trim()}
                className="bg-[var(--accent)] text-white px-3 py-1.5 text-[13px] rounded-[2px] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Adding...' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
