function FileEditor({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  return (
    <div className="border-t border-[var(--color-border)] h-48 flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 bg-[var(--color-bg-tertiary)]">
        <span className="text-xs truncate">{filePath}</span>
        <button onClick={onClose} className="text-xs hover:text-white">×</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-xs text-[var(--color-text-dim)]">
        <pre>Select a file to view its content</pre>
      </div>
    </div>
  )
}

export default FileEditor
