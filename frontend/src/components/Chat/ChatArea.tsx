import { useRef, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import ConfirmBar from './ConfirmBar'
import SubagentFooter from './SubagentFooter'
import TodoPanel from '../TodoPanel/TodoPanel'

function ChatArea(props: IDockviewPanelProps) {
  const sessionId = (props.params as { sessionId?: string } | undefined)?.sessionId || props.api.id

  const generatingSessionId = useStore((s) => s.generatingSessionId)
  const compactingSessionId = useStore((s) => s.compactingSessionId)
  const selectedModel = useStore((s) => s.selectedModel)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const projectPath = useStore((s) => s.projectPath)
  const sessionParents = useStore((s) => s.sessionParents)
  const sessionMessages = useStore((s) => s.sessionMessages)
  const pendingPermission = useStore((s) => s.pendingPermission)

  const messages = sessionMessages[sessionId] || []

  const todoCollapsed = useStore((s) => s.todoCollapsed)
  const setTodoCollapsed = useStore((s) => s.setTodoCollapsed)
  const isTodoCollapsed = todoCollapsed[sessionId] || false

  const isDefaultChat = sessionId === 'chat'
  const isChildSession = sessionParents[sessionId] !== undefined

  const handleStop = () => {
    if (generatingSessionId === sessionId) {
      App.CancelGeneration(sessionId)
    }
  }

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    if (!projectPath || !sessionId) return

    if (!selectedProvider || !selectedModel) {
      useStore.getState().addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No provider or model selected. Please choose a model from the toolbar.' })
      return
    }

    if (generatingSessionId !== '') {
      useStore.getState().addMessage({ id: crypto.randomUUID(), role: 'error', content: 'Another session is generating. Please wait.' })
      return
    }

    const store = useStore.getState()
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text }
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', startedAt: Date.now() }
    store.appendToSession(sessionId, [userMsg, assistantMsg])
    store.setGeneratingSessionId(sessionId)

    try {
      await App.SendMessage(projectPath, sessionId, text, selectedProvider, selectedModel)
    } catch (err) {
      useStore.getState().addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      store.setGeneratingSessionId('')
      const currentMsgs = useStore.getState().sessionMessages[sessionId] || []
      useStore.getState().setMessages(currentMsgs.filter(m => m.id !== assistantMsg.id))
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
        sessionId={sessionId}
        collapsed={isTodoCollapsed}
        onToggle={() => sessionId && setTodoCollapsed(sessionId, !isTodoCollapsed)}
      />
      {!isDefaultChat && (pendingPermission && pendingPermission.sessionId === sessionId ? (
        <ConfirmBar sessionId={sessionId} />
      ) : !isChildSession ? (
        <ChatInput
          key={sessionId}
          onSend={handleSend}
          onStop={handleStop}
          disabled={generatingSessionId !== ''}
          compacting={compactingSessionId !== ''}
        />
      ) : (
        <SubagentFooter />
      ))}
    </div>
  )
}

export default ChatArea