import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { App } from '../../../bindings/monika';
import type { BranchInfo } from '../../../bindings/monika';
import { Combobox, type ComboboxOption, AlertDialog } from '../ui';
import {
  getErrorMessage,
  parseUnmergedError,
  buildDirtyGuardMessage,
  resolveUnmergedWithAI,
} from './dropdownHelpers';

interface BranchDropdownProps {
  /** Whether the control is disabled (e.g. not a git repo, or during a switch). */
  disabled?: boolean;
  /** Optional className forwarded to the Combobox trigger. */
  className?: string;
}

/**
 * Stable value encoding for a branch option. Local branches use their bare
 * name; remote branches use `remote/name`. This round-trips through the
 * Combobox value and is split back into name + remote on selection.
 */
function branchValue(b: BranchInfo): string {
  return b.remote ? `${b.remote}/${b.name}` : b.name;
}

/**
 * Self-contained branch picker backed by `allBranches`.
 *
 * Renders a single searchable Combobox (own trigger + panel, open state,
 * search, and keyboard nav handled by the shared primitive). Local and remote
 * branches are flattened into one list — remotes are tagged via the option
 * `description` field so the flat searchable list stays scannable.
 *
 * Business logic preserved verbatim from the legacy inline dropdown:
 *  - active-generation dirty guard (AlertDialog before switching)
 *  - unmerged-conflict detection with an AI-resolve fallback
 * No custom dropdown markup remains.
 */
export function BranchDropdown({ disabled, className }: BranchDropdownProps) {
  const allBranches = useStore(s => s.allBranches);
  const branch = useStore(s => s.branch);
  const projectPath = useStore(s => s.projectPath);
  const loadBranches = useStore(s => s.loadBranches);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirtyConfirm, setDirtyConfirm] = useState<{ branchName: string; remote: string } | null>(null);
  const [unmergedFiles, setUnmergedFiles] = useState<string[] | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // Keep the branch list fresh on mount. Combobox owns its own open state, so
  // there is no `isOpen` gate; we hydrate up-front rather than lazily.
  // Load branches whenever the project path becomes available. 
  // (on mount projectPath may not be set yet, so we wait for it.)
  useEffect(() => {
    if (!projectPath) return
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadBranches()
      .then(() => { if (!cancelled) setLoading(false); })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [loadBranches, projectPath]);

  const options: ComboboxOption[] = useMemo(() => allBranches.map(b => ({
    value: branchValue(b),
    label: b.remote ? `${b.remote}/${b.name}` : b.name,
    description: b.remote ? 'remote' : undefined,
  })), [allBranches]);

  const currentValue = useMemo(() => {
    const match = allBranches.find(b => b.name === branch && !b.remote);
    return match ? branchValue(match) : branch;
  }, [allBranches, branch]);

  const handleSwitch = async (branchName: string, remote: string) => {
    setError(null);

    // Guard: check for active generation before switching.
    const { generatingSessionIds } = useStore.getState();
    if (generatingSessionIds.length > 0) {
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

      useStore.getState().setBranch(branchName);
      await loadBranches();
    } catch (e: unknown) {
      const unmerged = parseUnmergedError(e);
      if (unmerged) {
        setUnmergedFiles(unmerged);
      } else {
        setError(getErrorMessage(e, 'Failed to switch branch'));
      }
    }
  };

  const handleChange = (value: string) => {
    // Split the encoded value back into name + remote.
    const match = allBranches.find(b => branchValue(b) === value);
    if (!match) return;
    handleSwitch(match.name, match.remote);
  };

  const confirmMessage = dirtyConfirm
    ? buildDirtyGuardMessage(
        0,
        useStore.getState().generatingSessionIds.length > 0,
        'branches',
      )
    : '';

  return (
    <>
      <Combobox
        aria-label="Switch branch"
        value={currentValue}
        options={options}
        onChange={handleChange}
        loading={loading}
        disabled={disabled}
        placeholder={branch || 'branch'}
        searchPlaceholder="Search branches…"
        emptyMessage={error ?? 'No branches'}
        className={className}
      />
      <AlertDialog
        open={!!dirtyConfirm}
        title="Switch Branch"
        description={confirmMessage}
        confirmLabel="Discard"
        variant="destructive"
        loading={confirmLoading}
        error={confirmError}
        onConfirm={async () => {
          setConfirmError(''); setConfirmLoading(true);
          try {
            const { branchName, remote } = dirtyConfirm!;
            setDirtyConfirm(null);
            await doSwitch(branchName, remote);
          } catch (e) {
            setConfirmError(e instanceof Error ? e.message : 'Operation failed');
          } finally {
            setConfirmLoading(false);
          }
        }}
        onCancel={() => { setDirtyConfirm(null); setConfirmError('') }}
      />
      <AlertDialog
        open={!!unmergedFiles}
        title="Cannot Switch Branch"
        description={unmergedFiles ? `Unresolved merge conflicts detected:\n\n${unmergedFiles.join('\n')}\n\nLet AI resolve them automatically?` : ''}
        confirmLabel="Let AI Handle"
        variant="primary"
        loading={confirmLoading}
        error={confirmError}
        onConfirm={async () => {
          setConfirmError(''); setConfirmLoading(true);
          try {
            const files = unmergedFiles!;
            await resolveUnmergedWithAI(projectPath, files, useStore.getState());
            setUnmergedFiles(null);
          } catch (e) {
            setConfirmError(e instanceof Error ? e.message : 'Operation failed');
          } finally {
            setConfirmLoading(false);
          }
        }}
        onCancel={() => { setUnmergedFiles(null); setConfirmError('') }}
      />
    </>
  );
}
