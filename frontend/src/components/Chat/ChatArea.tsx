import { useRef, useEffect } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import ConfirmBar from './ConfirmBar'
import AskUserBar from './AskUserBar'
import SubagentFooter from './SubagentFooter'
import TodoPanel from '../TodoPanel/TodoPanel'

const EMPTY_ARR: any[] = []

function ChatArea(props: IDockviewPanelProps) {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionId = activeSessionId || 'chat'

  const generatingSessionIds = useStore((s) => s.generatingSessionIds)
  const selectedModel = useStore((s) => s.selectedModel)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const projectPath = useStore((s) => s.projectPath)
  const sessionParents = useStore((s) => s.sessionParents)
  const sessionMessages = useStore((s) => s.sessionMessages)
  const subagentStack = useStore((s) => s.subagentStack)
  const popSubagentOverlay = useStore((s) => s.popSubagentOverlay)
  const pendingPermission = useStore((s) => s.pendingPermission)
  const pendingAskUser = useStore((s) => s.pendingAskUser)

  const overlayStack = subagentStack[sessionId] || []
  const overlaySessionId = overlayStack.length > 0 ? overlayStack[overlayStack.length - 1] : null

  const parentMessages = sessionMessages[sessionId] || EMPTY_ARR
  const overlayMessages = overlaySessionId ? (sessionMessages[overlaySessionId] || EMPTY_ARR) : EMPTY_ARR

  const isDefaultChat = sessionId === 'chat'
  const isChildSession = sessionParents[sessionId] !== undefined
  const isOverlay = overlaySessionId !== null

  const todoCollapsed = useStore((s) => s.todoCollapsed)
  const setTodoCollapsed = useStore((s) => s.setTodoCollapsed)
  const isTodoCollapsed = todoCollapsed[sessionId] || false

  const handleStop = () => {
    const targetId = overlaySessionId || sessionId
    if (generatingSessionIds.includes(targetId)) {
      App.CancelGeneration(targetId)
      // Safety net: if backend doesn't emit cancelled event within 3s,
      // force-remove from generating state to prevent UI getting stuck.
      const sid = targetId
      setTimeout(() => {
        const store = useStore.getState()
        if (store.generatingSessionIds.includes(sid)) {
          store.removeGeneratingSession(sid)
          store.setSessionStatus(sid, 'pending')
        }
      }, 3000)
    }
  }

  const handleRunShell = async (command: string) => {
    if (!projectPath || !sessionId) return

    const store = useStore.getState()
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: `$ ${command}` }
    store.appendToSession(sessionId, [userMsg])

    try {
      const output = await App.RunShellCommand(projectPath, command)
      const shellMsg = { id: crypto.randomUUID(), role: 'shell' as const, content: `$ ${command}\n${output}` }
      store.appendToSession(sessionId, [shellMsg])
    } catch (err) {
      const errorMsg = { id: crypto.randomUUID(), role: 'shell' as const, content: `$ ${command}\nError: ${String(err)}` }
      store.appendToSession(sessionId, [errorMsg])
    }
  }

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    if (!projectPath || !sessionId) return

    if (!selectedProvider || !selectedModel) {
      useStore.getState().addMessage({ id: crypto.randomUUID(), role: 'error', content: 'No provider or model selected. Please choose a model from the toolbar.' })
      return
    }

    if (generatingSessionIds.includes(sessionId)) {
      useStore.getState().addMessage({ id: crypto.randomUUID(), role: 'error', content: 'This session is already generating.' })
      return
    }

    const store = useStore.getState()
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text }
    const assistantMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', startedAt: Date.now() }
    store.appendToSession(sessionId, [userMsg, assistantMsg])
    store.addGeneratingSession(sessionId)

    try {
      await App.SendMessage(projectPath, sessionId, text, selectedProvider, selectedModel)
    } catch (err) {
      useStore.getState().addMessage({ id: crypto.randomUUID(), role: 'error', content: String(err) })
      store.removeGeneratingSession(sessionId)
      const currentMsgs = useStore.getState().sessionMessages[sessionId] || []
      useStore.getState().setMessages(currentMsgs.filter(m => m.id !== assistantMsg.id))
    }
  }

  const messages = isOverlay ? overlayMessages : parentMessages
  const effectiveSessionId = isOverlay ? overlaySessionId! : sessionId
  const isGenerating = generatingSessionIds.includes(effectiveSessionId)
  let generatingIdx = -1
  if (isGenerating) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        generatingIdx = i
        break
      }
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  // Detect user scrolling up via wheel (only fires on real input, not programmatic scrollTop)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stickToBottomRef.current = false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'Home') {
        stickToBottomRef.current = false
      }
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // Force scroll to bottom on mount and when switching back to this tab
  useEffect(() => {
    const scrollToBottom = () => {
      const el = scrollRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      stickToBottomRef.current = true
    }
    requestAnimationFrame(scrollToBottom)
    const disp = props.api.onDidActiveChange((active) => {
      if (active) requestAnimationFrame(scrollToBottom)
    })
    return () => disp.dispose()
  }, [])

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottomRef.current) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, isGenerating])

  // Re-enable auto-scroll when user scrolls back to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      if (stickToBottomRef.current) return
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (nearBottom) stickToBottomRef.current = true
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Reset on new generation
  useEffect(() => {
    stickToBottomRef.current = true
  }, [isGenerating])

  // Reset scroll when overlay changes
  useEffect(() => {
    if (isOverlay) {
      stickToBottomRef.current = true
    }
  }, [isOverlay])

  return (
    <div className="flex flex-col h-full bg-[var(--bg-root)]">
      {isOverlay && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 text-[11px] border-b border-[var(--border)] shrink-0"
          style={{ background: 'var(--bg-sidebar)' }}
        >
          <button
            onClick={() => popSubagentOverlay(sessionId)}
            className="text-[11px] px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] cursor-pointer font-medium"
          >
            ← Back
          </button>
          <span className="text-[var(--text-dim)] truncate">
            Viewing subagent
            {overlayStack.length > 1 && (
              <span className="ml-1">({overlayStack.length} layers deep)</span>
            )}
          </span>
          {isGenerating && (
            <button
              onClick={handleStop}
              className="ml-auto text-[11px] px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              Stop
            </button>
          )}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[13px]">
            {isOverlay ? 'Loading subagent...' : 'No messages yet. Start a conversation.'}
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
      {!isOverlay && (
        <>
          <TodoPanel
            sessionId={sessionId}
            collapsed={isTodoCollapsed}
            onToggle={() => sessionId && setTodoCollapsed(sessionId, !isTodoCollapsed)}
          />
          {!isDefaultChat && (pendingAskUser && pendingAskUser.sessionId === sessionId ? (
            <AskUserBar sessionId={sessionId} />
          ) : pendingPermission && pendingPermission.sessionId === sessionId ? (
            <ConfirmBar sessionId={sessionId} />
          ) : !isChildSession ? (
            <ChatInput
              key={sessionId}
              onSend={handleSend}
              onStop={handleStop}
              onRunShell={handleRunShell}
              disabled={generatingSessionIds.includes(sessionId)}
            />
          ) : (
            <SubagentFooter />
          ))}
        </>
      )}
    </div>
  )
}

export default ChatArea
