import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import { IconClose } from '../Icons'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

function ChatArea() {
  const messages = useStore((s) => s.messages)
  const generating = useStore((s) => s.generating)
  const setGenerating = useStore((s) => s.setGenerating)
  const addMessage = useStore((s) => s.addMessage)
  const clearMessages = useStore((s) => s.clearMessages)
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSessionId = useStore((s) => s.setActiveSessionId)

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    if (text.startsWith('/')) {
      const cmd = text.slice(1)
      if (cmd === 'help')
        addMessage({ id: crypto.randomUUID(), role: 'system', content: 'Commands: /help /clear /exit' })
      if (cmd === 'clear') clearMessages()
      return
    }

    if (!projectPath || !activeSessionId) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No project or session selected. Use /open to open a project.' })
      return
    }

    addMessage({ id: crypto.randomUUID(), role: 'user', content: text })
    addMessage({ id: crypto.randomUUID(), role: 'assistant', content: '' })
    setGenerating(true)

    try {
      await App.SendMessage(projectPath, activeSessionId, text)
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)]">
      <div
        className="flex items-center justify-between px-3 py-1 border-b border-[var(--border)] flex-shrink-0"
        style={{ background: 'var(--glass-strong)' }}
      >
        <span className="text-[12px] text-[var(--text-secondary)]">Chat</span>
        <button
          onClick={() => { setActiveSessionId(''); clearMessages() }}
          className="text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] w-6 h-6 flex items-center justify-center rounded transition-colors"
          aria-label="Close session"
        >
          <IconClose size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-[5px]">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[13px]">
            No messages yet. Start a conversation.
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>
      <ChatInput key={activeSessionId} onSend={handleSend} disabled={generating} />
    </div>
  )
}

export default ChatArea
