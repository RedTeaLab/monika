import { useStore } from '../../store'

function ChatInputToolbar() {
  const availableModels = useStore((s) => s.availableModels)
  const selectedModel = useStore((s) => s.selectedModel)
  const setSelectedModel = useStore((s) => s.setSelectedModel)

  if (availableModels.length === 0) {
    return (
      <div
        className="flex items-center px-[14px] py-[2px]"
        style={{ background: 'transparent' }}
      >
        <select
        disabled
        className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)] outline-none focus:outline-none appearance-none"
        style={{ backgroundImage: 'none' }}
      >
        <option>No models</option>
      </select>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-[14px] py-[2px]"
      style={{ background: 'transparent' }}
    >
      <select
        value={selectedModel || availableModels[0]?.ID || ''}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer outline-none focus:outline-none appearance-none"
        style={{ backgroundImage: 'none' }}
      >
        {availableModels.map((m) => (
          <option key={m.ID} value={m.ID}>
            {m.DisplayName}
          </option>
        ))}
      </select>
    </div>
  )
}

export default ChatInputToolbar
