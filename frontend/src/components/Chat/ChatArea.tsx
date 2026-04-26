import { useState } from 'react'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  tools?: { name: string; input: string; output?: string; status: 'running' | 'done' | 'error' }[]
}

function ChatArea() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'system', content: 'Welcome to Monika. Type /help for commands.' },
  ])
  const [generating, setGenerating] = useState(false)

  const handleSend = (text: string) => {
    if (!text.trim()) return
    if (text.startsWith('/')) {
      if (text === '/help') setMessages(p => [...p, { id: crypto.randomUUID(), role: 'system', content: 'Commands: /help /clear /exit' }])
      if (text === '/clear') setMessages([{ id: crypto.randomUUID(), role: 'system', content: 'Welcome to Monika.' }])
      return
    }
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setGenerating(true)
    // TODO: wire to Wails bindings
    setTimeout(() => {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: 'This is a placeholder response.' }])
      setGenerating(false)
    }, 800)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.map((msg) => (<MessageBubble key={msg.id} message={msg} />))}
      </div>
      <ChatInput onSend={handleSend} disabled={generating} />
    </div>
  )
}

export default ChatArea
