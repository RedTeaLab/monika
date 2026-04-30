import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';
import type { FileNode } from '../../../bindings/monika';

interface FileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: (path: string) => void;
}

export function FileDialog({ isOpen, onClose, onOpen }: FileDialogProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [selectedPath, setSelectedPath] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const projectPath = useStore.getState().projectPath;
    // Start at the current project's parent directory.
    const start = projectPath ? projectPath.replace(/[/\\][^/\\]+$/, '') : '';
    setCurrentPath(start || projectPath || '');
    setPathInput(start || projectPath || '');
    setSelectedPath('');
    setError(null);
  }, [isOpen]);

  // Load directory listing.
  useEffect(() => {
    if (!isOpen || !currentPath) return;
    setLoading(true);
    setError(null);
    import('../../../bindings/monika').then(({ App }) => {
      App.ListDirectory(currentPath)
        .then((noddos: FileNode[]) => {
          setEntries(noddos);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    });
  }, [isOpen, currentPath]);

  const navigateTo = (dirPath: string) => {
    setCurrentPath(dirPath);
    setPathInput(dirPath);
    setSelectedPath(dirPath);
  };

  const goUp = () => {
    const parent = currentPath.replace(/[/\\][^/\\]+$/, '');
    if (parent && parent !== currentPath) {
      navigateTo(parent);
    }
  };

  const handleOpenClick = () => {
    const target = selectedPath || currentPath;
    if (target) {
      onOpen(target);
      onClose();
    }
  };

  const handlePathInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      import('../../../bindings/monika').then(({ App }) => {
        App.ListDirectory(pathInput)
          .then(() => navigateTo(pathInput))
          .catch(() => setError('Path not found'));
      });
    }
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  const dirs = entries.filter(e => e.is_dir);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 2000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        width: 480,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}>
          Open Project
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={handlePathInputKeyDown}
            placeholder="Filter or type path..."
            style={{
              width: '100%',
              background: 'var(--glass-medium)',
              border: '1px solid var(--border)',
              borderRadius: 2,
              padding: '6px 8px',
              fontSize: 12,
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ height: 240, overflowY: 'auto', padding: '4px 0' }}>
          {loading && [1, 2, 3, 4].map(i => (
            <div key={i} style={{ padding: '5px 14px' }}>
              <div style={{ height: 10, background: 'var(--glass-medium)', borderRadius: 2, marginBottom: 4 }} />
            </div>
          ))}

          {error && (
            <div style={{ padding: '12px 14px', color: 'var(--red)', fontSize: 12 }}>{error}</div>
          )}

          {!loading && !error && (
            <>
              <div
                onClick={goUp}
                style={{
                  padding: '5px 14px',
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <span>📁</span> ..
              </div>

              {dirs.map(d => (
                <div
                  key={d.path}
                  onClick={() => setSelectedPath(d.path)}
                  onDoubleClick={() => navigateTo(d.path)}
                  style={{
                    padding: '5px 14px',
                    fontSize: 12,
                    color: d.path === selectedPath ? 'var(--text-primary)' : 'var(--text-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: d.path === selectedPath ? 'var(--glass-active)' : 'transparent',
                  }}
                >
                  <span>📁</span> {d.name}
                </div>
              ))}

              {dirs.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-dim)' }}>
                  No subdirectories
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 16px',
              fontSize: 11,
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleOpenClick}
            disabled={!selectedPath && !currentPath}
            style={{
              padding: '4px 16px',
              fontSize: 11,
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            Open
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
