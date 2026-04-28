import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import TabBar from '../TabBar/TabBar'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

function ChatArea() {
  const messages = useStore((s) => s.messages)
  const generatingSessionId = useStore((s) => s.generatingSessionId)
  const addMessage = useStore((s) => s.addMessage)
  const clearMessages = useStore((s) => s.clearMessages)
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const openSessions = useStore((s) => s.openSessions)
  const closeSessionTab = useStore((s) => s.closeSessionTab)
  const switchSessionTab = useStore((s) => s.switchSessionTab)
  const setGeneratingSessionId = useStore((s) => s.setGeneratingSessionId)

  const sessionTabs = openSessions.map((s) => ({
    key: s.id,
    label: s.title || 'Untitled',
    status: (generatingSessionId === s.id ? 'generating' as const : 'idle' as const),
  }))

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
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No project or session selected.' })
      return
    }

    if (generatingSessionId !== '') {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'Another session is generating. Please wait.' })
      return
    }

    addMessage({ id: crypto.randomUUID(), role: 'user', content: text })
    addMessage({ id: crypto.randomUUID(), role: 'assistant', content: '' })
    setGeneratingSessionId(activeSessionId)

    try {
      await App.SendMessage(projectPath, activeSessionId, text)
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      setGeneratingSessionId('')
    }
  }

  const hasActiveSession = activeSessionId !== ''

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)]">
      <TabBar
        tabs={sessionTabs}
        activeKey={activeSessionId}
        onSelect={(key) => switchSessionTab(key)}
        onClose={(key) => closeSessionTab(key)}
        emptyLabel="Chat"
      />
      <div className="flex-1 overflow-y-auto p-[5px]">
        {!hasActiveSession ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[13px]">
            Start a session to chat.
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[13px]">
            No messages yet. Start a conversation.
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>
      {hasActiveSession && (
        <ChatInput
          key={activeSessionId}
          onSend={handleSend}
          disabled={generatingSessionId !== ''}
        />
      )}
    </div>
  )
}

export default ChatArea
