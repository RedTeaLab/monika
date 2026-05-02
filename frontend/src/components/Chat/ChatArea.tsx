import { useRef, useEffect, useMemo } from 'react'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import TabBar from '../TabBar/TabBar'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import SubagentFooter from './SubagentFooter'
import TodoPanel from '../TodoPanel/TodoPanel'

function ChatArea() {
  const messages = useStore((s) => s.messages)
  const generatingSessionId = useStore((s) => s.generatingSessionId)
  const compactingSessionId = useStore((s) => s.compactingSessionId)
  const selectedModel = useStore((s) => s.selectedModel)
  const addMessage = useStore((s) => s.addMessage)
  const appendToSession = useStore((s) => s.appendToSession)
  const clearMessages = useStore((s) => s.clearMessages)
  const setMessages = useStore((s) => s.setMessages)
  const projectPath = useStore((s) => s.projectPath)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionParents = useStore((s) => s.sessionParents)
  const openSessions = useStore((s) => s.openSessions)
  const closeSessionTab = useStore((s) => s.closeSessionTab)
  const switchSessionTab = useStore((s) => s.switchSessionTab)
  const setGeneratingSessionId = useStore((s) => s.setGeneratingSessionId)

  const sessionTabs = useMemo(() => openSessions.map((s) => ({
    key: s.id,
    label: s.title || 'Untitled',
    status: (generatingSessionId === s.id ? 'generating' as const : 'idle' as const),
  })), [openSessions, generatingSessionId])

  const handleStop = () => {
    if (generatingSessionId !== '') {
      App.CancelGeneration(generatingSessionId)
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

    if (!projectPath || !activeSessionId) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No project or session selected.' })
      return
    }

    if (generatingSessionId !== '') {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'Another session is generating. Please wait.' })
      return
    }

    if (!selectedModel) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No model selected. Please choose a model from the toolbar.' })
      return
    }

    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text }
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', startedAt: Date.now() }
    appendToSession(activeSessionId, [userMsg, assistantMsg])
    setGeneratingSessionId(activeSessionId)

    try {
      await App.SendMessage(projectPath, activeSessionId, text, selectedModel)
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      setGeneratingSessionId('')
      // Remove the orphaned assistant placeholder on send failure
      const currentMsgs = useStore.getState().messages
      setMessages(currentMsgs.filter(m => m.id !== assistantMsg.id))
    }
  }

  const hasActiveSession = activeSessionId !== ''
  const isChildSession = sessionParents[activeSessionId] !== undefined
  const todoCollapsed = useStore((s) => s.todoCollapsed)
  const setTodoCollapsed = useStore((s) => s.setTodoCollapsed)
  const isTodoCollapsed = activeSessionId ? (todoCollapsed[activeSessionId] || false) : false

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrollRef = useRef(0)
  const prevSessionRef = useRef(activeSessionId)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Force scroll to bottom on session switch
    if (prevSessionRef.current !== activeSessionId) {
      prevSessionRef.current = activeSessionId
      el.scrollTop = el.scrollHeight
      return
    }
    const now = performance.now()
    if (now - lastScrollRef.current < 50) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (nearBottom) {
      lastScrollRef.current = now
      el.scrollTop = el.scrollHeight
    }
  }, [messages, activeSessionId])

  // Last assistant message index in the active display — so we can flag it as generating
  const isGenerating = generatingSessionId !== '' && generatingSessionId === activeSessionId
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
      <TabBar
        tabs={sessionTabs}
        activeKey={activeSessionId}
        onSelect={(key) => switchSessionTab(key)}
        onClose={(key) => closeSessionTab(key)}
        emptyLabel="Chat"
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {!hasActiveSession ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[13px]">
            Start a session to chat
          </div>
        ) : messages.length === 0 ? (
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
        onToggle={() => activeSessionId && setTodoCollapsed(activeSessionId, !isTodoCollapsed)}
      />
      {hasActiveSession && !isChildSession && (
        <ChatInput
          key={activeSessionId}
          onSend={handleSend}
          onStop={handleStop}
          disabled={generatingSessionId !== ''}
          compacting={compactingSessionId !== ''}
        />
      )}
      {hasActiveSession && isChildSession && (
        <SubagentFooter />
      )}
    </div>
  )
}

export default ChatArea
