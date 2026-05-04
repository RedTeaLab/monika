import { useRef, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import SubagentFooter from './SubagentFooter'
import TodoPanel from '../TodoPanel/TodoPanel'

function ChatArea(props: IDockviewPanelProps) {
  const sessionId = (props.params as { sessionId?: string } | undefined)?.sessionId || props.api.id

  const generatingSessionId = useStore((s) => s.generatingSessionId)
  const compactingSessionId = useStore((s) => s.compactingSessionId)
  const selectedModel = useStore((s) => s.selectedModel)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const addMessage = useStore((s) => s.addMessage)
  const clearMessages = useStore((s) => s.clearMessages)
  const setMessages = useStore((s) => s.setMessages)
  const projectPath = useStore((s) => s.projectPath)
  const sessionParents = useStore((s) => s.sessionParents)
  const sessionMessages = useStore((s) => s.sessionMessages)
  const setGeneratingSessionId = useStore((s) => s.setGeneratingSessionId)

  const isChildSession = sessionParents[sessionId] !== undefined
  const messages = sessionMessages[sessionId] || []

  const todoCollapsed = useStore((s) => s.todoCollapsed)
  const setTodoCollapsed = useStore((s) => s.setTodoCollapsed)
  const isTodoCollapsed = todoCollapsed[sessionId] || false

  const handleStop = () => {
    if (generatingSessionId === sessionId) {
      App.CancelGeneration(sessionId)
    }
  }

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    if (text.startsWith('/')) {
      const cmd = text.slice(1)
      if (cmd === 'help')
        addMessage({ id: crypto.randomUUID(), role: 'system', content: 'Commands: /help /clear /exit' })
      if (cmd === 'clear') clearMessages()
      return
    }

    if (!projectPath || !sessionId) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No project or session selected.' })
      return
    }

    if (!selectedProvider || !selectedModel) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No provider or model selected. Please choose a model from the toolbar.' })
      return
    }

    // Auto-create session if using the default chat panel (no real session)
    let sid = sessionId
    if (sid === 'chat') {
      try {
        const info = await App.NewSession(projectPath, selectedProvider, selectedModel)
        if (!info) return
        sid = info.id
        const store = useStore.getState()
        // Register session in store
        useStore.setState((s) => ({
          openSessions: [{ id: sid, title: info.title || 'Untitled' }, ...s.openSessions],
          activeSessionId: sid,
          sessionMessages: { ...s.sessionMessages, [sid]: [] },
        }))
        // Create dockview panel and close default placeholder
        store.dockviewApi?.addPanel({
          id: sid,
          component: 'chat',
          tabComponent: 'chat-tab',
          title: info.title || 'Untitled',
          params: { sessionId: sid },
          position: { referenceGroup: 'chat-group' },
        })
        store.dockviewApi?.getPanel('chat')?.api.close()
      } catch {
        addMessage({ id: crypto.randomUUID(), role: 'error', content: 'Failed to create session.' })
        return
      }
    }

    if (generatingSessionId !== '') {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'Another session is generating. Please wait.' })
      return
    }

    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text }
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', startedAt: Date.now() }
    useStore.getState().appendToSession(sid, [userMsg, assistantMsg])
    setGeneratingSessionId(sid)

    try {
      await App.SendMessage(projectPath, sid, text, selectedProvider, selectedModel)
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      setGeneratingSessionId('')
      const currentMsgs = useStore.getState().sessionMessages[sid] || []
      setMessages(currentMsgs.filter(m => m.id !== assistantMsg.id))
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrollRef = useRef(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = performance.now()
    if (now - lastScrollRef.current < 50) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (nearBottom) {
      lastScrollRef.current = now
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const isGenerating = generatingSessionId !== '' && generatingSessionId === sessionId
  let generatingIdx = -1
  if (isGenerating) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        generatingIdx = i
        break
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-root)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[13px]">
            No messages yet. Start a conversation.
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isGenerating={idx === generatingIdx}
            />
          ))
        )}
      </div>
      <TodoPanel
        collapsed={isTodoCollapsed}
        onToggle={() => sessionId && setTodoCollapsed(sessionId, !isTodoCollapsed)}
      />
      {!isChildSession && (
        <ChatInput
          key={sessionId}
          onSend={handleSend}
          onStop={handleStop}
          disabled={generatingSessionId !== ''}
          compacting={compactingSessionId !== ''}
        />
      )}
      {isChildSession && (
        <SubagentFooter />
      )}
    </div>
  )
}

export default ChatArea
