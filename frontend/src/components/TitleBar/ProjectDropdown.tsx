import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Combobox, type ComboboxOption } from '../ui';
import { getErrorMessage } from './dropdownHelpers';

interface ProjectDropdownProps {
  /** Called with the chosen project path when the user picks one. */
  onSelectProject: (path: string) => void;
  /** Whether the control is disabled (e.g. during an active switch). */
  disabled?: boolean;
  /** Optional className forwarded to the Combobox trigger. */
  className?: string;
}

/**
 * Self-contained project picker backed by `recentProjects`.
 *
 * Renders a single searchable Combobox (own trigger + panel, open state,
 * search, and keyboard nav handled by the shared primitive). Emits the chosen
 * path via `onSelectProject`. No custom dropdown markup remains.
 */
export function ProjectDropdown({ onSelectProject, disabled, className }: ProjectDropdownProps) {
  const recentProjects = useStore(s => s.recentProjects);
  const projectPath = useStore(s => s.projectPath);
  const loadRecentProjects = useStore(s => s.loadRecentProjects);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the recent list fresh on mount. Combobox owns its own open state, so
  // there is no `isOpen` gate; we hydrate up-front rather than lazily.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRecentProjects()
      .then(() => { if (!cancelled) setLoading(false); })
      .catch((e: Error) => {
        if (!cancelled) { setError(getErrorMessage(e, 'Failed to load projects')); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [loadRecentProjects]);

  const options: ComboboxOption[] = recentProjects.map(p => ({
    value: p.path,
    label: p.name,
    description: p.path,
  }));

  const handleChange = (path: string) => {
    if (path !== projectPath) onSelectProject(path);
  };

  return (
    <Combobox
      aria-label="Recent projects"
      value={projectPath}
      options={options}
      onChange={handleChange}
      loading={loading}
      disabled={disabled}
      placeholder={projectPath ? (recentProjects.find(p => p.path === projectPath)?.name ?? 'project') : 'project'}
      searchPlaceholder="Search projects…"
      emptyMessage={error ?? 'No recent projects'}
      className={className}
    />
  );
}
