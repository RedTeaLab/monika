import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';
import { useClickOutside } from '../../hooks/useClickOutside';
import { App } from '../../../bindings/monika';
import ConfirmModal from '../Chat/ConfirmModal';
import { dropdownContainerStyle, sectionHeaderStyle, getErrorMessage, parseUnmergedError, buildDirtyGuardMessage, resolveUnmergedWithAI } from './dropdownHelpers';

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
  const [dirtyConfirm, setDirtyConfirm] = useState<{ branchName: string; remote: string } | null>(null);
  const [unmergedFiles, setUnmergedFiles] = useState<string[] | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setDirtyConfirm(null);
      setUnmergedFiles(null);
      return;
    }
    setLoading(true);
    setError(null);
    loadBranches()
      .then(() => setLoading(false))
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [isOpen, loadBranches]);

  // Close on outside click.
  useClickOutside(dropdownRef, triggerRef, onClose, isOpen);

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

    // Guard: check for dirty files or active generation before switching.
    const { openFiles, generatingSessionIds } = useStore.getState();
    const dirtyCount = openFiles.filter(f => f.isDirty).length;
    if (dirtyCount > 0 || generatingSessionIds.length > 0) {
      setDirtyConfirm({ branchName, remote });
      return;
    }

    await doSwitch(branchName, remote);
  };

  const doSwitch = async (branchName: string, remote: string) => {
    setError(null);
    try {
      const name = remote ? `${remote}/${branchName}` : branchName;
      await App.SwitchBranch(projectPath, name);

      // Refresh open file tabs in parallel.
      const { openFiles, updateFileContent, closeFileTab } = useStore.getState();
      await Promise.all(openFiles.map(async (file) => {
        try {
          const content = await App.ReadFile(projectPath, file.path);
          if (content && content.exist) {
            updateFileContent(file.path, content.content);
          } else {
            closeFileTab(file.path);
          }
        } catch {
          closeFileTab(file.path);
        }
      }));
      useStore.getState().setBranch(branchName);
      await loadBranches();
      onClose();
    } catch (e: unknown) {
      const unmerged = parseUnmergedError(e);
      if (unmerged) {
        setUnmergedFiles(unmerged);
      } else {
        setError(getErrorMessage(e, 'Failed to switch branch'));
      }
    }
  };

  if (!isOpen) return null;

  const localBranches = allBranches.filter(b => !b.remote);
  const remoteBranches = allBranches.filter(b => b.remote);

  const triggerEl = triggerRef.current;
  const top = triggerEl ? triggerEl.getBoundingClientRect().bottom + 4 : 0;
  const left = triggerEl ? triggerEl.getBoundingClientRect().left : 0;

  const portal = createPortal(
    <div
      ref={dropdownRef}
      style={{ ...dropdownContainerStyle, top, left }}
    >
      <div style={sectionHeaderStyle}>Local Branches</div>

      {loading && [1, 2, 3].map(i => (
        <div key={i} style={{ padding: '8px 12px' }}>
          <div style={{ height: 10, background: 'var(--bg-card)', borderRadius: 2, marginBottom: 6 }} />
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
            background: b.name === branch ? 'var(--bg-active)' : 'transparent',
          }}
        >
          <span>{b.name}</span>
          {b.name === branch && <span style={{ color: 'var(--accent)', fontSize: 10 }}>✓</span>}
        </div>
      ))}

      {remoteBranches.length > 0 && (
        <div style={{ ...sectionHeaderStyle, borderTop: '1px solid var(--border)' }}>Remote Branches</div>
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

  const confirmMessage = dirtyConfirm
    ? buildDirtyGuardMessage(
        useStore.getState().openFiles.filter(f => f.isDirty).length,
        useStore.getState().generatingSessionIds.length > 0,
        'branches',
      )
    : '';

  return (
    <>
      {portal}
      {dirtyConfirm && (
        <ConfirmModal
          title="Switch Branch"
          message={confirmMessage}
          confirmLabel="Discard"
          onConfirm={async () => {
            const { branchName, remote } = dirtyConfirm;
            setDirtyConfirm(null);
            await doSwitch(branchName, remote);
          }}
          onCancel={() => setDirtyConfirm(null)}
        />
      )}
      {unmergedFiles && (
        <ConfirmModal
          title="Cannot Switch Branch"
          message={`Unresolved merge conflicts detected:\n\n${unmergedFiles.join('\n')}\n\nLet AI resolve them automatically?`}
          confirmLabel="Let AI Handle"
          variant="primary"
          onConfirm={async () => {
            const files = unmergedFiles;
            await resolveUnmergedWithAI(projectPath, files, useStore.getState());
            setUnmergedFiles(null);
            onClose();
          }}
          onCancel={() => setUnmergedFiles(null)}
        />
      )}
    </>
  );
}
