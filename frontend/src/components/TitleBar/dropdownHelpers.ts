import type { CSSProperties } from 'react';

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

export function getErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
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
