import { useState } from 'react';
import { useStore } from '../../store';
import { App } from '../../../bindings/monika';
import ConfirmModal from '../Chat/ConfirmModal';
import { getErrorMessage, parseUnmergedError, sectionHeaderStyle, resolveUnmergedWithAI } from './dropdownHelpers';

interface CreateBranchPanelProps {
  onCancel: () => void;
  onCreated: () => void;
}

export function CreateBranchPanel({ onCancel, onCreated }: CreateBranchPanelProps) {
  const allBranches = useStore(s => s.allBranches);
  const branch = useStore(s => s.branch);
  const projectPath = useStore(s => s.projectPath);
  const loadBranches = useStore(s => s.loadBranches);
  const [name, setName] = useState('');
  const [baseBranch, setBaseBranch] = useState(branch);
  const [error, setError] = useState<string | null>(null);
  const [unmergedFiles, setUnmergedFiles] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await App.CreateBranch(projectPath, name.trim(), baseBranch);
      useStore.getState().setBranch(name.trim());
      await loadBranches();
      onCreated();
    } catch (e: unknown) {
      const unmerged = parseUnmergedError(e);
      if (unmerged) {
        setUnmergedFiles(unmerged);
      } else {
        setError(getErrorMessage(e, 'Failed to create branch'));
      }
    }
    setCreating(false);
  };

  return (
    <>
      <div style={{ padding: 12 }}>
        <div style={{ ...sectionHeaderStyle, marginBottom: 8, borderBottom: 'none' }}>
          Create New Branch
        </div>

        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Branch name"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onCancel(); }}
          style={{
            width: '100%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--text-primary)',
            marginBottom: 8,
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />

        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>From branch</div>
        <select
          value={baseBranch}
          onChange={e => setBaseBranch(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 2,
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--text-primary)',
            marginBottom: 10,
            outline: 'none',
          }}
        >
          {allBranches.map(b => (
            <option key={b.remote ? `${b.remote}/${b.name}` : b.name} value={b.remote ? `${b.remote}/${b.name}` : b.name}>
              {b.remote ? `${b.remote}/${b.name}` : b.name}{b.name === branch && !b.remote ? ' (current)' : ''}
            </option>
          ))}
        </select>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={creating}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            style={{
              padding: '4px 16px',
              fontSize: 11,
              background: name.trim() && !creating ? 'var(--accent)' : 'var(--bg-card)',
              color: name.trim() && !creating ? 'white' : 'var(--text-dim)',
              border: 'none',
              borderRadius: 2,
              cursor: name.trim() && !creating ? 'pointer' : 'default',
            }}
          >
            {creating ? 'Creating...' : 'Create & Switch'}
          </button>
        </div>
      </div>
      {unmergedFiles && (
        <ConfirmModal
          title="Cannot Create Branch"
          message={`Unresolved merge conflicts detected:\n\n${unmergedFiles.join('\n')}\n\nLet AI resolve them automatically?`}
          confirmLabel="Let AI Handle"
          variant="primary"
          onConfirm={async () => {
            const files = unmergedFiles;
            await resolveUnmergedWithAI(projectPath, files, useStore.getState());
            setUnmergedFiles(null);
            onCancel();
          }}
          onCancel={() => setUnmergedFiles(null)}
        />
      )}
    </>
  );
}
