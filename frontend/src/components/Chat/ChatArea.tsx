import { useRef, useEffect, useMemo, useState } from 'react'
import { IDockviewPanelProps } from 'dockview'
import { App } from '../../../bindings/monika'
import { useStore } from '../../store'
import { formatTokens } from '../../lib/format'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import ConfirmBar from './ConfirmBar'
import AskUserBar from './AskUserBar'
import SubagentFooter from './SubagentFooter'
import TodoPanel from '../TodoPanel/TodoPanel'
import MessageFilter from './MessageFilter'
import QuotePreview from './QuotePreview'
import SessionPicker from './SessionPicker'
import MultiSelectBar from './MultiSelectBar'

const EMPTY_ARR: any[] = []
const EMPTY_STR_ARR: string[] = []

function truncateContent(content: string, maxLen: number): string {
  return content.length > maxLen ? content.slice(0, maxLen) + '...' : content
}

function ChatArea(props: IDockviewPanelProps) {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessionId = activeSessionId || 'chat'

  const generatingSessionIds = useStore((s) => s.generatingSessionIds)
  const selectedModel = useStore((s) => s.selectedModel)
  const selectedProvider = useStore((s) => s.selectedProvider)
  const projectPath = useStore((s) => s.projectPath)
  const isChildSession = useStore((s) => s.sessionParents[sessionId] !== undefined)
  const popSubagentOverlay = useStore((s) => s.popSubagentOverlay)
  const pendingPermission = useStore((s) => s.pendingPermission)
  const pendingAskUser = useStore((s) => s.pendingAskUser)

  // Focused selectors — only subscribe to current session's data
  const parentMessages = useStore((s) => s.sessionMessages[sessionId] || EMPTY_ARR)
  const overlayStack = useStore((s) => s.subagentStack[sessionId] || EMPTY_STR_ARR)
  const overlaySessionId = overlayStack.length > 0 ? overlayStack[overlayStack.length - 1] : null
  // Subscribe to overlay session's messages for streaming updates
  const overlayMessages = useStore(
    (s) => overlaySessionId ? (s.sessionMessages[overlaySessionId] || EMPTY_ARR) : EMPTY_ARR
  )

  const isDefaultChat = sessionId === 'chat'
  const isOverlay = overlaySessionId !== null

  const msgFilter = useStore((s) => s.msgFilter)
  const selection = useStore((s) => s.selection)
  const toggleMessageSelection = useStore((s) => s.toggleMessageSelection)
  const enterMultiSelect = useStore((s) => s.enterMultiSelect)
  const clearSelection = useStore((s) => s.clearSelection)
  const openSessionTab = useStore((s) => s.openSessionTab)

  const rawMessages = isOverlay ? overlayMessages : parentMessages
  const messages = useMemo(() => {
    if (msgFilter === 'all') return rawMessages
    if (msgFilter === 'chat') return rawMessages.filter((m: any) =>
      m.role === 'user' || m.role === 'assistant'
    )
    if (msgFilter === 'user') return rawMessages.filter((m: any) => m.role === 'user')
    if (msgFilter === 'assistant') return rawMessages.filter((m: any) => m.role === 'assistant')
    return rawMessages
  }, [rawMessages, msgFilter])
  const hideExtras = msgFilter === 'chat' || msgFilter === 'assistant'

  const sessionTokens = useStore((s) => s.sessionTokens)
  const overlayTokens = overlaySessionId ? sessionTokens[overlaySessionId] : null

  const isTodoCollapsed = useStore((s) => s.todoCollapsed[sessionId] || false)
  const setTodoCollapsed = useStore((s) => s.setTodoCollapsed)
  const isOverlayTodoCollapsed = useStore((s) => overlaySessionId ? (s.todoCollapsed[overlaySessionId] || false) : false)
  const setOverlayTodoCollapsed = useStore((s) => s.setTodoCollapsed)

  const openSessions = useStore((s) => s.openSessions)
  const setMsgFilter = useStore((s) => s.setMsgFilter)
  const renameSession = useStore((s) => s.renameSession)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editTabTitle, setEditTabTitle] = useState('')
  const [quotePreviewMessages, setQuotePreviewMessages] = useState<{ id: string; role: string; content: string }[]>([])
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [forwardedQuotes, setForwardedQuotes] = useState<Record<string, { id: string; role: string; content: string }[]>>({})
  const forwardedQuotesRef = useRef(forwardedQuotes)
  forwardedQuotesRef.current = forwardedQuotes

  const handleTabStartEdit = (tab: typeof openSessions[0], e: React.MouseEvent) => {
    e.stopPropagation()
    if (generatingSessionIds.includes(tab.id)) return
    setEditingTabId(tab.id)
    setEditTabTitle(tab.title || '')
  }

  const handleTabFinishEdit = async () => {
    if (editingTabId && editTabTitle.trim()) {
      try {
        await renameSession(editingTabId, editTabTitle.trim())
      } catch { /* ignore */ }
    }
    setEditingTabId(null)
    setEditTabTitle('')
  }

  const handleTabEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTabFinishEdit()
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
      setEditTabTitle('')
    }
  }

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
    store.setMsgFilter('all')
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

  const effectiveSessionId = isOverlay ? overlaySessionId! : sessionId
  const isGenerating = generatingSessionIds.includes(effectiveSessionId)

  let generatingIdx = -1
  if (isGenerating) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' || (messages[i].role === 'compaction' && !messages[i].content)) {
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

  useEffect(() => {
    clearSelection()
    setSessionPickerOpen(false)
  }, [sessionId])

  useEffect(() => {
    if (!selection) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection()
        setQuotePreviewMessages([])
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selection])

  useEffect(() => {
    if (forwardedQuotesRef.current[sessionId]) {
      setQuotePreviewMessages(forwardedQuotesRef.current[sessionId])
      setForwardedQuotes((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
    }
  }, [sessionId])

  const handleQuote = (id: string) => {
    enterMultiSelect('quote', id)
  }

  const handleForward = (id: string) => {
    enterMultiSelect('forward', id)
  }

  const buildQuotedMessages = (): { id: string; role: string; content: string }[] => {
    const msgs = isOverlay ? overlayMessages : messages
    const ids = selection?.ids || []
    return ids
      .map((id) => msgs.find((m: any) => m.id === id))
      .filter(Boolean)
      .map((m: any) => ({ id: m.id, role: m.role, content: truncateContent(m.content || m.thinking || '', 500) }))
  }

  const handleConfirmQuote = () => {
    const quoted = buildQuotedMessages()
    setQuotePreviewMessages(quoted)
    clearSelection()
  }

  const pendingForwardRef = useRef<{ id: string; role: string; content: string }[] | null>(null)

  const handleConfirmForward = () => {
    const quoted = buildQuotedMessages()
    pendingForwardRef.current = quoted
    clearSelection()
    setSessionPickerOpen(true)
  }

  const handleSessionPick = (targetSessionId: string, sessions: { id: string; title: string }[]) => {
    const quoted = pendingForwardRef.current
    pendingForwardRef.current = null
    if (quoted) {
      setForwardedQuotes((prev) => ({ ...prev, [targetSessionId]: quoted }))
    }
    setSessionPickerOpen(false)
    const target = sessions.find((s) => s.id === targetSessionId)
    openSessionTab(targetSessionId, target?.title || 'Untitled')
  }

  const handleRemoveQuoteMessage = (id: string) => {
    setQuotePreviewMessages((prev) => prev.filter((m) => m.id !== id))
  }

  const handleClearQuote = () => {
    setQuotePreviewMessages([])
  }

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
          {overlayTokens && (
            <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
              {formatTokens(overlayTokens.count)}
              {overlayTokens.max > 0 ? ` / ${formatTokens(overlayTokens.max)}` : ''}
            </span>
          )}

        </div>
      )}
      {!isOverlay && (
        <div
          className="flex items-center gap-1 px-2 border-b border-[var(--border)] shrink-0"
          style={{ background: 'var(--bg-sidebar)', height: '30px' }}
        >
          <div className="flex items-center gap-0.5 min-w-0 flex-1">
            {(() => {
              const currentTab = openSessions.find((t) => t.id === sessionId)
              if (!currentTab) return null
              const isEditing = editingTabId === currentTab.id
              return isEditing ? (
                <input
                  value={editTabTitle}
                  onChange={(e) => setEditTabTitle(e.target.value)}
                  onBlur={handleTabFinishEdit}
                  onKeyDown={handleTabEditKeyDown}
                  autoFocus
                      className="min-w-[80px] bg-transparent border-b border-[var(--border)] text-[11px] px-1 py-0 outline-none"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
                      maxLength={40}
                />
              ) : (
                <span
                  className="text-[11px] px-2 py-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"
                  style={{
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onDoubleClick={(e) => handleTabStartEdit(currentTab, e)}
                >
                  {currentTab.title || 'Untitled'}
                </span>
              )
            })()}
          </div>
          <MessageFilter value={msgFilter} onChange={setMsgFilter} disabled={isGenerating} />
        </div>
      )}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto py-4 pr-4 ${selection ? 'pl-10' : 'pl-4'}`}>
        {rawMessages.length > 0 && msgFilter !== 'all' && (
          <div className="mb-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>
            {messages.length} / {rawMessages.length} messages
          </div>
        )}
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
              hideExtras={hideExtras}
              onQuote={msg.content && (msg.role === 'user' || msg.role === 'assistant') ? handleQuote : undefined}
              onForward={msg.content && (msg.role === 'user' || msg.role === 'assistant') ? handleForward : undefined}
              multiSelectMode={selection?.mode ?? null}
              isSelected={selection?.ids?.includes(msg.id) ?? false}
              onToggleSelect={toggleMessageSelection}
            />
          ))
        )}
      </div>
      {isOverlay ? (
        <TodoPanel
          sessionId={overlaySessionId!}
          collapsed={isOverlayTodoCollapsed}
          onToggle={() => overlaySessionId && setOverlayTodoCollapsed(overlaySessionId, !isOverlayTodoCollapsed)}
        />
      ) : (
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
            <>
              {quotePreviewMessages.length > 0 && (
                <QuotePreview
                  messages={quotePreviewMessages}
                  onRemove={handleRemoveQuoteMessage}
                  onClear={handleClearQuote}
                />
              )}
              {selection ? (
                <MultiSelectBar
                  count={selection.ids.length}
                  mode={selection.mode}
                  onConfirm={selection.mode === 'quote' ? handleConfirmQuote : handleConfirmForward}
                  onCancel={() => { clearSelection(); setQuotePreviewMessages([]) }}
                />
              ) : (
                <ChatInput
                  key={sessionId}
                  onSend={handleSend}
                  onStop={handleStop}
                  onRunShell={handleRunShell}
                  disabled={generatingSessionIds.includes(sessionId)}
                  quotedMessages={quotePreviewMessages.length > 0 ? quotePreviewMessages : undefined}
                  onQuotesConsumed={() => setQuotePreviewMessages([])}
                />
              )}
            </>
          ) : (
            <SubagentFooter />
          ))}
          <SessionPicker
            open={sessionPickerOpen}
            onSelect={handleSessionPick}
            onCancel={() => { clearSelection(); setQuotePreviewMessages([]); setSessionPickerOpen(false) }}
            excludeSessionId={sessionId}
          />
        </>
      )}
    </div>
  )
}

export default ChatArea
