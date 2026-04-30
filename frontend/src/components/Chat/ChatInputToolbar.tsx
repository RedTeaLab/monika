import { useStore } from '../../store'

function ChatInputToolbar() {
  const availableModels = useStore((s) => s.availableModels)
  const selectedModel = useStore((s) => s.selectedModel)

  if (availableModels.length === 0) {
    return (
      <div
        className="flex items-center px-[10px] py-[6px]"
        style={{ background: 'transparent' }}
      >
        <select
          disabled
          className="text-[12px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-dim)]"
        >
          <option>No models</option>
        </select>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-[10px] py-[6px]"
      style={{ background: 'transparent' }}
    >
      <select
        value={selectedModel}
        onChange={(e) => useStore.setState({ selectedModel: e.target.value })}
        className="text-[12px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer outline-none"
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
