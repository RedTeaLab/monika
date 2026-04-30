import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';

interface BranchDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onNewBranch: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export function BranchDropdown({ isOpen, onClose, onNewBranch, triggerRef }: BranchDropdownProps) {
  const allBranches = useStore(s => s.allBranches);
  const branch = useStore(s => s.branch);
  const projectPath = useStore(s => s.projectPath);
  const loadBranches = useStore(s => s.loadBranches);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    loadBranches()
      .then(() => setLoading(false))
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [isOpen, loadBranches]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, triggerRef]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleSwitch = async (branchName: string, remote: string) => {
    setError(null);
    const { App } = await import('../../../bindings/monika');
    try {
      const name = remote ? `${remote}/${branchName}` : branchName;
      await App.SwitchBranch(projectPath, name);

      // Refresh open file tabs.
      const { openFiles, updateFileContent, closeFileTab } = useStore.getState();
      for (const file of openFiles) {
        try {
          const content = await App.ReadFile(projectPath, file.path);
          if (content.exist) {
            updateFileContent(file.path, content.content);
          } else {
            closeFileTab(file.path);
          }
        } catch {
          closeFileTab(file.path);
        }
      }
      useStore.getState().setBranch(branchName);
      await loadBranches();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to switch branch');
    }
  };

  if (!isOpen) return null;

  const localBranches = allBranches.filter(b => !b.remote);
  const remoteBranches = allBranches.filter(b => b.remote);

  const triggerEl = triggerRef.current;
  const top = triggerEl ? triggerEl.getBoundingClientRect().bottom + 4 : 0;
  const left = triggerEl ? triggerEl.getBoundingClientRect().left : 0;

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top,
        left,
        minWidth: 260,
        maxHeight: 360,
        overflowY: 'auto',
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 1000,
      }}
    >
      <div style={{
        padding: '8px 12px',
        fontSize: 11,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
      }}>
        Local Branches
      </div>

      {loading && [1, 2, 3].map(i => (
        <div key={i} style={{ padding: '8px 12px' }}>
          <div style={{ height: 10, background: 'var(--glass-medium)', borderRadius: 2, marginBottom: 6 }} />
        </div>
      ))}

      {!loading && localBranches.map(b => (
        <div
          key={b.name}
          onClick={() => handleSwitch(b.name, '')}
          style={{
            padding: '5px 12px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            color: b.name === branch ? 'var(--text-primary)' : 'var(--text-dim)',
            fontSize: 12,
            background: b.name === branch ? 'var(--glass-active)' : 'transparent',
          }}
        >
          <span>{b.name}</span>
          {b.name === branch && <span style={{ color: 'var(--accent)', fontSize: 10 }}>✓</span>}
        </div>
      ))}

      {remoteBranches.length > 0 && (
        <div style={{
          padding: '8px 12px',
          fontSize: 11,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderBottom: '1px solid var(--border)',
          borderTop: '1px solid var(--border)',
        }}>
          Remote Branches
        </div>
      )}

      {!loading && remoteBranches.map(b => (
        <div
          key={`${b.remote}/${b.name}`}
          onClick={() => handleSwitch(b.name, b.remote)}
          style={{
            padding: '5px 12px',
            cursor: 'pointer',
            color: 'var(--text-dim)',
            fontSize: 12,
          }}
        >
          <span>{b.remote}/{b.name}</span>
        </div>
      ))}

      {error && (
        <div style={{ padding: '8px 12px', color: 'var(--red)', fontSize: 11, borderTop: '1px solid var(--border)' }}>
          {error}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', marginTop: error ? 0 : 4 }}>
        <div
          onClick={onNewBranch}
          style={{
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          + New Branch...
        </div>
      </div>
    </div>,
    document.body,
  );
}
