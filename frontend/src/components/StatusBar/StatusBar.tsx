import { useStore } from '../../store'

interface StatusBarProps {
  showConsole: boolean; showFileTree: boolean
  onToggleConsole: () => void; onToggleFileTree: () => void
}

function StatusBar({ showConsole, showFileTree, onToggleConsole, onToggleFileTree }: StatusBarProps) {
  const generating = useStore((s) => s.generating)
  const tokenCount = useStore((s) => s.tokenCount)

  return (
    <div className="flex items-center h-[22px] text-[12px] select-none border-t border-[var(--border)]">
      <div className="flex items-center h-full bg-[var(--bg-statusbar)] text-white gap-1" style={{ padding: '0 10px' }}>
        <span className={generating ? 'text-[var(--yellow)]' : 'text-[var(--green)]'}>●</span>
        <span>{generating ? 'generating...' : 'ready'}</span>
      </div>
      <div className="flex-1 bg-[var(--bg-statusbar)] h-full" />
      <div className="flex items-center h-full bg-[#68217a] text-white gap-2" style={{ padding: '0 10px' }}>
        <button onClick={onToggleConsole} className={`hover:text-white ${showConsole ? 'text-white' : 'opacity-50'}`}>console</button>
        <button onClick={onToggleFileTree} className={`hover:text-white ${showFileTree ? 'text-white' : 'opacity-50'}`}>files</button>
        <span className="opacity-70 pr-2">tok: {tokenCount}</span>
      </div>
    </div>
  )
}

export default StatusBar
