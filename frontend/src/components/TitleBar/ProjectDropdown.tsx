import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';

interface ProjectDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFileDialog: () => void;
  onSelectProject: (path: string) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export function ProjectDropdown({ isOpen, onClose, onOpenFileDialog, onSelectProject, triggerRef }: ProjectDropdownProps) {
  const recentProjects = useStore(s => s.recentProjects);
  const projectPath = useStore(s => s.projectPath);
  const loadRecentProjects = useStore(s => s.loadRecentProjects);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setFocusIndex(0);
    loadRecentProjects()
      .then(() => setLoading(false))
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [isOpen, loadRecentProjects]);

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

  // Close on Escape. Keyboard nav.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex(i => Math.min(i + 1, Math.max(recentProjects.length - 1, 0)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = recentProjects[focusIndex];
        if (target && target.path !== projectPath) {
          onSelectProject(target.path);
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, recentProjects, focusIndex, projectPath, onClose, onSelectProject]);

  if (!isOpen) return null;

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
        Recent Projects
      </div>

      {loading && [1, 2, 3].map(i => (
        <div key={i} style={{ padding: '6px 12px' }}>
          <div style={{ height: 12, width: '60%', background: 'var(--glass-medium)', borderRadius: 2, marginBottom: 4 }} />
          <div style={{ height: 8, width: '40%', background: 'var(--glass-light)', borderRadius: 2 }} />
        </div>
      ))}

      {error && (
        <div style={{ padding: '12px', color: 'var(--red)', fontSize: 12 }}>
          {error}
          <button
            onClick={() => loadRecentProjects()}
            style={{ marginLeft: 8, color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none', fontSize: 11 }}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && recentProjects.length === 0 && (
        <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: 12 }}>
          No recent projects
        </div>
      )}

      {!loading && !error && recentProjects.map((p, i) => (
        <div
          key={p.path}
          onClick={() => {
            if (p.path !== projectPath) {
              onSelectProject(p.path);
            }
            onClose();
          }}
          onMouseEnter={() => setFocusIndex(i)}
          style={{
            padding: '6px 12px',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            background: i === focusIndex ? 'var(--glass-hover)' : p.path === projectPath ? 'var(--glass-active)' : 'transparent',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{p.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{p.path}</div>
          </div>
          {p.path === projectPath && (
            <span style={{ fontSize: 10, color: 'var(--accent)' }}>active</span>
          )}
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <div
          onClick={() => { onClose(); onOpenFileDialog(); }}
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
          + Open New Project...
        </div>
      </div>
    </div>,
    document.body,
  );
}
