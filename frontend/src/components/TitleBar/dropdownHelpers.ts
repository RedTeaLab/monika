import type { CSSProperties } from 'react';
import { App } from '../../../bindings/monika';

type StoreForAI = {
  activeSessionId: string;
  selectedModel: string;
  openSessionTab: (id: string, title: string) => Promise<void>;
  addMessage: (msg: { id: string; role: 'user' | 'assistant' | 'system' | 'error'; content: string }) => void;
  setGeneratingSessionId: (id: string) => void;
};

export async function resolveUnmergedWithAI(
  projectPath: string,
  files: string[],
  store: StoreForAI,
): Promise<void> {
  let sid = store.activeSessionId;
  if (!sid) {
    const info = await App.NewSession(projectPath);
    sid = info.id;
    await store.openSessionTab(info.id, info.title || 'Untitled');
  }

  const fileList = files.map(f => `- ${f}`).join('\n');
  const prompt = [
    `You need to resolve merge conflicts on the current branch. The following files have unresolved conflicts:\n${fileList}\n`,
    'Follow these steps:',
    '1. Run `git diff <file>` on each file to inspect the conflict markers',
    '2. Determine the correct resolution for each conflict based on the code context',
    '3. Edit each file to remove the conflict markers (<<<<<<<, =======, >>>>>>>) and keep the correct version',
    '4. Run `git add <file>` on each resolved file to mark it as resolved',
    '5. Verify with `git diff --name-only --diff-filter=U` that no unmerged files remain',
  ].join('\n');

  store.addMessage({ id: crypto.randomUUID(), role: 'user', content: prompt });
  store.addMessage({ id: crypto.randomUUID(), role: 'assistant', content: '' });
  store.setGeneratingSessionId(sid);

  try {
    await App.SendMessage(projectPath, sid, prompt, store.selectedModel);
  } catch (err) {
    store.addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) });
    store.setGeneratingSessionId('');
    throw err;
  }
}

export const dropdownContainerStyle = {
  position: 'fixed' as const,
  minWidth: 260,
  maxHeight: 360,
  overflowY: 'auto' as const,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(12px)',
  zIndex: 1000,
};

export const sectionHeaderStyle: CSSProperties = {
  padding: '8px 12px',
  fontSize: 11,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border)',
};

export function parseUnmergedError(e: unknown): string[] | null {
  let msg = e instanceof Error ? e.message : '';
  // Wails wraps Go errors as JSON: {"message":"...","cause":{},"kind":"RuntimeError"}
  try {
    const parsed = JSON.parse(msg);
    if (parsed.message && typeof parsed.message === 'string') {
      msg = parsed.message;
    }
  } catch {
    // Not JSON, use raw message.
  }
  if (msg.startsWith('UNMERGED_FILES:')) {
    return msg.slice('UNMERGED_FILES:'.length).split(',').filter(Boolean);
  }
  return null;
}

export function getErrorMessage(e: unknown, fallback: string): string {
  let msg = e instanceof Error ? e.message : fallback;
  // Wails wraps Go errors as JSON: {"message":"...","cause":{},"kind":"RuntimeError"}
  try {
    const parsed = JSON.parse(msg);
    if (parsed.message && typeof parsed.message === 'string') {
      msg = parsed.message;
    }
  } catch {
    // Not JSON, use as-is.
  }
  // Strip internal error prefixes so the user sees a clean message.
  if (msg.startsWith('UNMERGED_FILES:')) {
    return 'Unmerged files detected. Please resolve conflicts first.';
  }
  return msg;
}

export function buildDirtyGuardMessage(dirtyCount: number, isGenerating: boolean, entity: string): string {
  if (dirtyCount > 0 && isGenerating) {
    return `You have ${dirtyCount} unsaved files and a session is generating. Switching ${entity} will discard changes and interrupt generation.`;
  }
  if (dirtyCount > 0) {
    return `You have ${dirtyCount} unsaved files. Switching ${entity} will lose unsaved changes.`;
  }
  return `A session is generating a response. Switching ${entity} will interrupt it.`;
}
