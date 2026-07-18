import { useState } from 'react';
import { useStore } from '../../store';
import { App } from '../../../bindings/monika';
import { getErrorMessage, parseUnmergedError, resolveUnmergedWithAI } from './dropdownHelpers';
import { Button, Input, Select, AlertDialog } from '../ui';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';

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
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');

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
      <Modal onClose={onCancel} width={360}>
        <ModalHeader>
          <h2 className="text-[14px] font-semibold m-0">Create New Branch</h2>
        </ModalHeader>
        <ModalBody>
          <Input
            inputSize="sm"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Branch name"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onCancel(); }}
          />
          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5 mt-3">
            From branch
          </label>
          <Select
            value={baseBranch}
            onChange={e => setBaseBranch(e.target.value)}
          >
            {allBranches.map(b => (
              <option key={b.remote ? `${b.remote}/${b.name}` : b.name} value={b.remote ? `${b.remote}/${b.name}` : b.name}>
                {b.remote ? `${b.remote}/${b.name}` : b.name}{b.name === branch && !b.remote ? ' (current)' : ''}
              </option>
            ))}
          </Select>
          {error && (
            <p className="text-[11px] text-[var(--color-error)] mt-3 mb-0">{error}</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating ? 'Creating...' : 'Create & Switch'}
          </Button>
        </ModalFooter>
      </Modal>
      <AlertDialog
        open={!!unmergedFiles}
        title="Cannot Create Branch"
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
            onCancel();
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
