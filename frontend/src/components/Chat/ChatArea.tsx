import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

function ChatArea() {
  const messages = useStore((s) => s.messages)
  const generating = useStore((s) => s.generating)
  const setGenerating = useStore((s) => s.setGenerating)
  const addMessage = useStore((s) => s.addMessage)
  const clearMessages = useStore((s) => s.clearMessages)

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    if (text.startsWith('/')) {
      const cmd = text.slice(1)
      if (cmd === 'help')
        addMessage({ id: crypto.randomUUID(), role: 'system', content: 'Commands: /help /clear /exit' })
      if (cmd === 'clear') clearMessages()
      return
    }

    addMessage({ id: crypto.randomUUID(), role: 'user', content: text })
    addMessage({ id: crypto.randomUUID(), role: 'assistant', content: '' })
    setGenerating(true)

    try {
      await App.SendMessage('', '', text)
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
      <ChatInput onSend={handleSend} disabled={generating} />
    </div>
  )
}

export default ChatArea
