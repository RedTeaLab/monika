import { useStore } from '../../store'

interface StatusBarProps {
  showConsole: boolean; showFileTree: boolean
  onToggleConsole: () => void; onToggleFileTree: () => void
}

function StatusBar({ showConsole, showFileTree, onToggleConsole, onToggleFileTree }: StatusBarProps) {
  const generating = useStore((s) => s.generating)
  const tokenCount = useStore((s) => s.tokenCount)

  return (
    <div className="flex items-center h-6 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border)] text-[10px] px-2">
      <span className={generating ? 'text-[var(--color-accent-yellow)]' : 'text-[var(--color-accent-green)]'}>●</span>
      <span className="ml-1 text-[var(--color-text-dim)]">{generating ? 'generating...' : 'ready'}</span>
      <span className="mx-2 text-[var(--color-border)]">│</span>
      <button onClick={onToggleConsole} className={`px-1 hover:text-white ${showConsole ? 'text-[var(--color-text-dim)]' : 'opacity-50'}`}>console</button>
      <button onClick={onToggleFileTree} className={`px-1 hover:text-white ${showFileTree ? 'text-[var(--color-text-dim)]' : 'opacity-50'}`}>files</button>
      <div className="flex-1" />
      <span className="text-[var(--color-text-dim)]">tok: {tokenCount}</span>
    </div>
  )
}

export default StatusBar
