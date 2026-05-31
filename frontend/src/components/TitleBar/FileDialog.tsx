import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';
import { App } from '../../../bindings/monika';
import type { FileNode } from '../../../bindings/monika';
import { IconFolder, IconFolderPlus, IconFolderUp, IconHardDrive } from '../Icons';

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
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const projectPath = useStore.getState().projectPath;
    const start = projectPath ? projectPath.replace(/[/\\][^/\\]+$/, '') : '';
    setCurrentPath(start || projectPath || '');
    setPathInput(start || projectPath || '');
    setSelectedPath('');
    setError(null);
    setNewFolderMode(false);
    setNewFolderName('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);

    if (!currentPath) {
      App.ListDrives()
        .then((drives: FileNode[]) => {
          setEntries(drives);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    } else {
      App.ListDirectory(currentPath)
        .then((nodes: FileNode[]) => {
          setEntries(nodes);
          setLoading(false);
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    }
  }, [isOpen, currentPath]);

  const navigateTo = (dirPath: string) => {
    setCurrentPath(dirPath);
    setPathInput(dirPath);
    setSelectedPath(dirPath);
  };

  const goUp = () => {
    if (/^[A-Za-z]:\\$/.test(currentPath) || /^[A-Za-z]:$/.test(currentPath)) {
      setCurrentPath('');
      setPathInput('');
      setSelectedPath('');
      return;
    }
    const parent = currentPath.replace(/[/\\][^/\\]+$/, '');
    if (parent && parent !== currentPath) {
      const normalized = /^[A-Za-z]:$/.test(parent) ? parent + '\\' : parent;
      navigateTo(normalized);
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
      App.ListDirectory(pathInput)
        .then(() => navigateTo(pathInput))
        .catch(() => setError('Path not found'));
    }
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    if (newFolderMode && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [newFolderMode]);

  const startNewFolder = () => {
    setNewFolderName('');
    setNewFolderMode(true);
    setError(null);
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const name = newFolderName.trim();
      if (!name) return;
      App.MakeDirectory(currentPath, name)
        .then(() => {
          setNewFolderMode(false);
          setNewFolderName('');
          // Refresh the directory listing
          return App.ListDirectory(currentPath);
        })
        .then((nodes: FileNode[]) => {
          setEntries(nodes);
        })
        .catch((e: Error) => {
          setError(e.message);
        });
    }
    if (e.key === 'Escape') {
      setNewFolderMode(false);
      setNewFolderName('');
    }
  };

  if (!isOpen) return null;

  const dirs = entries.filter(e => e.is_dir);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 480,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Open Project
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 22,
              height: 22,
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
              lineHeight: 1,
              color: 'var(--text-dim)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            ✕
          </button>
        </div>

        {/* Path input */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={handlePathInputKeyDown}
            placeholder="Type a path or filter..."
            className="flex-1 text-[13px] outline-none transition-colors"
            style={{
              padding: '6px 10px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          {currentPath && (
            <button
              onClick={startNewFolder}
              title="New folder"
              className="flex items-center justify-center transition-colors shrink-0"
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-dim)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)'; }}
            >
              <IconFolderPlus size={14} />
            </button>
          )}
        </div>

        {/* File list */}
        <div className="overflow-y-auto py-1" style={{ height: 240 }}>
          {loading && (
            <div className="px-4 py-2 space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  style={{
                    height: 10,
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-3" style={{ fontSize: 12, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {currentPath && (
                <div
                  onClick={goUp}
                  className="flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors"
                  style={{ fontSize: 13, color: 'var(--text-dim)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <IconFolderUp size={14} />
                  <span>..</span>
                </div>
              )}

              {newFolderMode && (
                <div className="flex items-center gap-2 px-4 py-1.5">
                  <IconFolder size={14} />
                  <input
                    ref={newFolderInputRef}
                    type="text"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={handleNewFolderKeyDown}
                    placeholder="Folder name"
                    className="flex-1 text-[13px] outline-none"
                    style={{
                      padding: '2px 6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--accent)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {dirs.map(d => {
                const isSelected = d.path === selectedPath;
                return (
                  <div
                    key={d.path}
                    onClick={() => setSelectedPath(d.path)}
                    onDoubleClick={() => navigateTo(d.path)}
                    className="flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors"
                    style={{
                      fontSize: 13,
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: isSelected ? 'var(--bg-active)' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {currentPath ? <IconFolder size={14} /> : <IconHardDrive size={14} />}
                    <span className="truncate">{d.name}</span>
                  </div>
                );
              })}

              {dirs.length === 0 && (
                <div className="px-4 py-3" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {currentPath ? 'No subdirectories' : 'No drives found'}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-2.5"
          style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)' }}
        >
          <button
            onClick={onClose}
            className="transition-colors"
            style={{
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleOpenClick}
            disabled={!selectedPath && !currentPath}
            className="transition-colors"
            style={{
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-muted)',
              color: 'var(--accent)',
              border: 'none',
              cursor: !selectedPath && !currentPath ? 'default' : 'pointer',
              opacity: !selectedPath && !currentPath ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (selectedPath || currentPath) {
                e.currentTarget.style.background = 'var(--accent)';
                e.currentTarget.style.color = '#fff';
              }
            }}
            onMouseLeave={e => {
              if (selectedPath || currentPath) {
                e.currentTarget.style.background = 'var(--accent-muted)';
                e.currentTarget.style.color = 'var(--accent)';
              }
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
