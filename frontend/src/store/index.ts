import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { App, StreamEvent } from '../../bindings/monika'
import type { RecentProject, BranchInfo } from '../../bindings/monika'

export type LayoutMode = 'chat' | 'split' | 'files'

interface ToolCall {
  name: string
  input: string
  output?: string
  status: 'running' | 'done' | 'error'
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  thinking?: string
  tools?: ToolCall[]
  model?: string
  duration?: number
  startedAt?: number
}

interface SessionTabInfo {
  id: string
  title: string
}

interface FileTabInfo {
  path: string
  content: string
  isDirty: boolean
}

interface AppState {
  messages: Message[]
  generatingSessionId: string
  tokenCount: number
  projectPath: string
  branch: string
  activeSessionId: string
  consoleLines: string[]
  layoutMode: LayoutMode
  splitRatio: number
  activeFilePath: string
  fileTreeVersion: number
  sessionListVersion: number

  openSessions: SessionTabInfo[]
  sessionMessages: Record<string, Message[]>
  openFiles: FileTabInfo[]
  recentProjects: RecentProject[]
  allBranches: BranchInfo[]

  addMessage: (msg: Message) => void
  appendToSession: (sessionId: string, msgs: Message[]) => void
  updateLastAssistant: (content: string) => void
  updateLastAssistantThinking: (content: string) => void
  addToolStart: (tool: ToolCall) => void
  updateToolDone: (name: string, output: string, status: 'done' | 'error') => void
  updateToolInput: (name: string, input: string) => void
  updateSessionMessage: (id: string, delta: string) => void
  updateSessionThinking: (id: string, delta: string) => void
  addSessionToolStart: (id: string, tool: ToolCall) => void
  addSessionError: (id: string, content: string) => void
  updateSessionToolDone: (id: string, name: string, output: string, status: 'done' | 'error') => void
  updateSessionToolInput: (id: string, name: string, input: string) => void
  setGeneratingSessionId: (sessionId: string) => void
  setLastAssistantMeta: (sessionId: string, meta: { model?: string; duration?: number }) => void
  addTokens: (tokens: number) => void
  clearMessages: () => void
  setMessages: (msgs: Message[]) => void
  setProjectPath: (path: string) => void
  setBranch: (branch: string) => void
  setActiveSessionId: (id: string) => void
  addConsoleLine: (line: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  setSplitRatio: (ratio: number) => void
  bumpFileTreeVersion: () => void
  bumpSessionListVersion: () => void
  updateSessionTitle: (id: string, title: string) => void

  openSessionTab: (id: string, title: string) => Promise<void>
  closeSessionTab: (id: string) => void
  switchSessionTab: (id: string) => void

  openFileTab: (path: string, content: string) => void
  closeFileTab: (path: string) => void
  switchFileTab: (path: string) => void
  setFileDirty: (path: string, dirty: boolean) => void
  updateFileContent: (path: string, content: string) => void

  loadRecentProjects: () => Promise<void>
  loadBranches: () => Promise<void>
  resetProjectState: () => void
}

export const useStore = create<AppState>((set, get) => ({
  messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika. Type /help for commands.' }],
  generatingSessionId: '',
  tokenCount: 0,
  projectPath: '',
  branch: '',
  activeSessionId: '',
  consoleLines: ['$ ready'],
  layoutMode: 'split',
  splitRatio: 0.5,
  activeFilePath: '',
  fileTreeVersion: 0,
  sessionListVersion: 0,

  openSessions: [],
  sessionMessages: {},
  openFiles: [],
  recentProjects: [],
  allBranches: [],

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToSession: (sessionId, msgs) => set((s) => {
    const sessionMsgs = [...(s.sessionMessages[sessionId] || []), ...msgs]
    const activeMsgs = s.activeSessionId === sessionId
      ? [...s.messages, ...msgs]
      : s.messages
    return {
      messages: activeMsgs,
      sessionMessages: { ...s.sessionMessages, [sessionId]: sessionMsgs },
    }
  }),

  updateLastAssistant: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content: msgs[i].content + content }
          break
        }
      }
      return { messages: msgs }
    }),

  updateLastAssistantThinking: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], thinking: (msgs[i].thinking || '') + content }
          break
        }
      }
      return { messages: msgs }
    }),

  addToolStart: (tool) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], tools: [...(msgs[i].tools || []), tool] }
          break
        }
      }
      return { messages: msgs }
    }),

  updateToolDone: (name, output, status) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) =>
              t.name === name && t.status === 'running' ? { ...t, output, status } : t
            ),
          }
          break
        }
      }
      return { messages: msgs }
    }),

  updateToolInput: (name, input) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) =>
              t.name === name && !t.input ? { ...t, input } : t
            ),
          }
          break
        }
      }
      return { messages: msgs }
    }),

  updateSessionMessage: (id, delta) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content: msgs[i].content + delta }
          found = true
          break
        }
      }
      if (!found) {
        msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: delta })
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: msgs } }
    })
  },

  updateSessionThinking: (id, delta) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], thinking: (msgs[i].thinking || '') + delta }
          found = true
          break
        }
      }
      if (!found) {
        msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', thinking: delta })
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: msgs } }
    })
  },

  addSessionToolStart: (id, tool) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], tools: [...(msgs[i].tools || []), tool] }
          found = true
          break
        }
      }
      if (!found) {
        msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', tools: [tool] })
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: msgs } }
    })
  },

  updateSessionToolDone: (id, name, output, status) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) =>
              t.name === name && t.status === 'running' ? { ...t, output, status } : t
            ),
          }
          found = true
          break
        }
      }
      if (!found) {
        msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', tools: [{ name, input: '', output, status }] })
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: msgs } }
    })
  },

  updateSessionToolInput: (id, name, input) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) =>
              t.name === name && !t.input ? { ...t, input } : t
            ),
          }
          break
        }
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: msgs } }
    })
  },

  addSessionError: (id, content) => {
    set((s) => ({
      sessionMessages: { ...s.sessionMessages, [id]: [...(s.sessionMessages[id] || []), { id: crypto.randomUUID(), role: 'error' as const, content }] },
    }))
  },

  setGeneratingSessionId: (sessionId) => set({ generatingSessionId: sessionId }),
  setLastAssistantMeta: (sessionId, meta) => {
    set((s) => {
      const sessionMsgs = [...(s.sessionMessages[sessionId] || [])]
      for (let i = sessionMsgs.length - 1; i >= 0; i--) {
        if (sessionMsgs[i].role === 'assistant') {
          sessionMsgs[i] = { ...sessionMsgs[i], ...meta }
          break
        }
      }
      const updates: Partial<AppState> = { sessionMessages: { ...s.sessionMessages, [sessionId]: sessionMsgs } }
      if (sessionId === s.activeSessionId) {
        const msgs = [...s.messages]
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], ...meta }
            break
          }
        }
        updates.messages = msgs
      }
      return updates
    })
  },
  addTokens: (t) => set((s) => ({ tokenCount: s.tokenCount + t })),
  bumpFileTreeVersion: () => set((s) => ({ fileTreeVersion: s.fileTreeVersion + 1 })),
  bumpSessionListVersion: () => set((s) => ({ sessionListVersion: s.sessionListVersion + 1 })),
  updateSessionTitle: (id, title) =>
    set((s) => ({
      openSessions: s.openSessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess
      ),
    })),
  clearMessages: () => set({ messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika.' }] }),
  setMessages: (msgs) => set({ messages: msgs }),
  setProjectPath: (path) => set({ projectPath: path }),
  setBranch: (branch) => set({ branch }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  addConsoleLine: (line) => set((s) => ({ consoleLines: [...s.consoleLines, line] })),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),

  openSessionTab: async (id, title) => {
    const state = useStore.getState()
    const existing = state.openSessions.find((s) => s.id === id)
    if (existing) {
      state.switchSessionTab(id)
      return
    }
    if (state.openSessions.length >= 8) {
      state.addMessage({ id: crypto.randomUUID(), role: 'error', content: 'Too many sessions open. Close one first.' })
      return
    }
    set((s) => ({
      openSessions: [...s.openSessions, { id, title }],
      sessionMessages: {
        ...s.sessionMessages,
        ...(s.activeSessionId ? { [s.activeSessionId]: s.messages } : {}),
        [id]: s.sessionMessages[id] || [],
      },
      activeSessionId: id,
      messages: [],
    }))
    try {
      const project = useStore.getState().projectPath
      const session = await App.LoadSession(project, id)
      const msgs = session.messages
        ? loadSessionMessages(session.messages as unknown as Parameters<typeof loadSessionMessages>[0], session.model)
        : []
      set((s) => {
        const streamMsgs = s.sessionMessages[id] || []
        const merged = msgs.length > 0
          ? [...msgs, ...streamMsgs.filter((sm) => !msgs.some((lm) => lm.id === sm.id))]
          : streamMsgs
        if (s.activeSessionId !== id) {
          return { sessionMessages: { ...s.sessionMessages, [id]: merged } }
        }
        return {
          sessionMessages: { ...s.sessionMessages, [id]: merged },
          messages: merged,
        }
      })
    } catch {
      set((s) => {
        if (s.activeSessionId !== id) {
          return { sessionMessages: { ...s.sessionMessages, [id]: [] } }
        }
        return {
          sessionMessages: { ...s.sessionMessages, [id]: [] },
          messages: [{ id: crypto.randomUUID(), role: 'error' as const, content: 'Failed to load session messages.' }],
        }
      })
    }
  },

  closeSessionTab: (id) => {
    set((s) => {
      const idx = s.openSessions.findIndex((t) => t.id === id)
      if (idx === -1) return {}
      const next = [...s.openSessions]
      next.splice(idx, 1)
      const msgCache = { ...s.sessionMessages, [s.activeSessionId]: s.messages }
      delete msgCache[id]

      let newActive = s.activeSessionId
      if (id === s.activeSessionId) {
        if (idx < next.length) newActive = next[idx].id
        else if (next.length > 0) newActive = next[next.length - 1].id
        else newActive = ''
      }

      const newMessages: Message[] = newActive ? (msgCache[newActive] || []) : [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika.' }]

      return {
        openSessions: next,
        sessionMessages: msgCache,
        activeSessionId: newActive,
        messages: newMessages,
        generatingSessionId: s.generatingSessionId === id ? '' : s.generatingSessionId,
      }
    })
  },

  switchSessionTab: (id) => {
    set((s) => {
      if (id === s.activeSessionId) return {}
      if (!s.openSessions.some((t) => t.id === id)) return {}
      const currentCache = { ...s.sessionMessages }
      if (s.activeSessionId) {
        const bgUpdated = s.sessionMessages[s.activeSessionId]
        currentCache[s.activeSessionId] = bgUpdated || s.messages
      }
      const restored = currentCache[id] || []
      return {
        activeSessionId: id,
        sessionMessages: currentCache,
        messages: restored,
      }
    })
  },

  openFileTab: (path, content) => {
    const state = useStore.getState()
    const existing = state.openFiles.find((f) => f.path === path)
    if (existing) {
      state.switchFileTab(path)
      return
    }
    set((s) => ({
      openFiles: [...s.openFiles, { path, content, isDirty: false }],
      activeFilePath: path,
    }))
  },

  closeFileTab: (path) => {
    set((s) => {
      const idx = s.openFiles.findIndex((f) => f.path === path)
      if (idx === -1) return {}

      const next = [...s.openFiles]
      next.splice(idx, 1)

      let newActive = s.activeFilePath
      if (path === s.activeFilePath) {
        if (idx < next.length) newActive = next[idx].path
        else if (next.length > 0) newActive = next[next.length - 1].path
        else newActive = ''
      }

      return { openFiles: next, activeFilePath: newActive }
    })
  },

  switchFileTab: (path) => {
    set((s) => {
      if (path === s.activeFilePath) return {}
      if (!s.openFiles.some((f) => f.path === path)) return {}
      return { activeFilePath: path }
    })
  },

  setFileDirty: (path, dirty) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) => f.path === path ? { ...f, isDirty: dirty } : f),
    }))
  },

  updateFileContent: (path, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) => f.path === path ? { ...f, content } : f),
    }))
  },

  loadRecentProjects: async () => {
    const projects = await App.GetRecentProjects();
    set({ recentProjects: projects });
  },

  loadBranches: async () => {
    const { projectPath } = get();
    if (!projectPath) return;
    try {
      const branches = await App.ListBranches(projectPath);
      set({ allBranches: branches });
    } catch (e) {
      set({ allBranches: [] });
      throw e;
    }
  },

  resetProjectState: () => {
    set({
      messages: [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika. Type /help for commands.' }],
      generatingSessionId: '',
      tokenCount: 0,
      activeSessionId: '',
      activeFilePath: '',
      consoleLines: ['$ ready'],
      openSessions: [],
      sessionMessages: {},
      openFiles: [],
      allBranches: [],
      recentProjects: [],
      fileTreeVersion: 0,
      sessionListVersion: 0,
    });
  },

}))

export function loadSessionMessages(raw: { role: string; content: string; reasoning_content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string; name?: string }[], model?: string): Message[] {
  const result: Message[] = []
  let i = 0
  while (i < raw.length) {
    const m = raw[i]
    if (m.role === 'user') {
      result.push({ id: crypto.randomUUID(), role: 'user', content: m.content || '' })
      i++
    } else if (m.role === 'assistant') {
      const tools: ToolCall[] = []
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let output = ''
          let status: 'done' | 'error' = 'done'
          let j = i + 1
          while (j < raw.length) {
            const tm = raw[j]
            if (tm.role === 'tool' && tm.tool_call_id === tc.id) {
              output = tm.content || ''
              break
            }
            j++
          }
          tools.push({ name: tc.function.name, input: tc.function.arguments, output, status })
        }
      }
      result.push({
        id: crypto.randomUUID(), role: 'assistant',
        content: m.content || '',
        thinking: m.reasoning_content || undefined,
        tools: tools.length > 0 ? tools : undefined,
        model,
      })
      i++
    } else if (m.role === 'tool') {
      i++
    } else if (m.role === 'system') {
      result.push({ id: crypto.randomUUID(), role: 'system', content: m.content || '' })
      i++
    } else {
      i++
    }
  }
  return result
}

export function setupWailsEvents() {
  console.log('[monika] setupWailsEvents: subscribing to stream')
  Events.On('stream', (ev) => {
    const store = useStore.getState()
    const data = ev.data as StreamEvent
    const sid = data.session_id

    // Shadow path: 无 session_id 或 session 已关闭
    if (!sid || !store.sessionMessages[sid]) {
      console.warn('[monika] stream event dropped: no session_id or session closed', data.type)
      return
    }

    switch (data.type) {
      case 'text_delta':
        store.updateSessionMessage(sid, data.content || '')
        if (sid === store.activeSessionId) {
          store.updateLastAssistant(data.content || '')
        }
        if (data.model) {
          store.setLastAssistantMeta(sid, { model: data.model })
        }
        break

      case 'thinking':
        store.updateSessionThinking(sid, data.content || '')
        if (sid === store.activeSessionId) {
          store.updateLastAssistantThinking(data.content || '')
        }
        if (data.model) {
          store.setLastAssistantMeta(sid, { model: data.model })
        }
        break

      case 'tool_start':
        if (data.tool) {
          store.addSessionToolStart(sid, { name: data.tool.name, input: data.tool.input || '', status: 'running' })
          store.addConsoleLine(`$ ${data.tool.name} ${data.tool.input || ''}`)
          if (sid === store.activeSessionId) {
            store.addToolStart({ name: data.tool.name, input: data.tool.input || '', status: 'running' })
          }
        }
        break

      case 'tool_output':
        if (data.tool) {
          store.addConsoleLine(data.tool.output || '')
          store.updateSessionToolDone(sid, data.tool.name, data.tool.output || '', data.tool.status === 'error' ? 'error' : 'done')
          if (data.tool.input) {
            store.updateSessionToolInput(sid, data.tool.name, data.tool.input)
          }
          if (sid === store.activeSessionId) {
            store.updateToolDone(data.tool.name, data.tool.output || '', data.tool.status === 'error' ? 'error' : 'done')
            if (data.tool.input) {
              store.updateToolInput(data.tool.name, data.tool.input)
            }
          }
        }
        break

      case 'tool_done':
        if (data.tool) {
          const status = (data.tool.status === 'done' || data.tool.status === 'error') ? data.tool.status : 'done'
          store.addConsoleLine(`[${status}] ${data.tool.name}`)
          if (data.tool.input) {
            store.updateSessionToolInput(sid, data.tool.name, data.tool.input)
            if (sid === store.activeSessionId) {
              store.updateToolInput(data.tool.name, data.tool.input)
            }
          }
        }
        break

      case 'usage':
        if (data.usage) {
          store.addTokens(data.usage.total_tokens || 0)
        }
        break

      case 'error':
        store.addConsoleLine(`[error] ${data.content || 'Unknown error'}`)
        store.addSessionError(sid, data.content || 'Unknown error')
        if (sid === store.activeSessionId) {
          store.addMessage({ id: crypto.randomUUID(), role: 'error', content: data.content || 'Unknown error' })
        }
        if (sid === store.generatingSessionId) {
          store.setGeneratingSessionId('')
        }
        break

      case 'file_changed':
        if (data.file_change) {
          store.addConsoleLine(`[file] ${data.file_change.path} ${data.file_change.status}`)
        }
        store.bumpFileTreeVersion()
        break

      case 'done': {
        if (sid === store.generatingSessionId) {
          store.setGeneratingSessionId('')
        }
        const sessionMsgs = store.sessionMessages[sid] || []
        for (let i = sessionMsgs.length - 1; i >= 0; i--) {
          if (sessionMsgs[i].role === 'assistant' && sessionMsgs[i].startedAt) {
            store.setLastAssistantMeta(sid, { duration: Math.round((Date.now() - sessionMsgs[i].startedAt!) / 100) / 10 })
            break
          }
        }
        store.bumpFileTreeVersion()
        store.bumpSessionListVersion()
        break
      }

      case 'session_updated':
        if (data.content) {
          store.updateSessionTitle(sid, data.content)
        }
        store.bumpSessionListVersion()
        break

      case 'turn_start': {
        const newMsg = { id: crypto.randomUUID(), role: 'assistant' as const, content: '', startedAt: Date.now(), model: data.model || undefined }
        store.appendToSession(sid, [newMsg])
        break
      }
    }
  })
}

export async function initProject() {
  console.log('[monika] initProject called')
  try {
    const info = await App.GetCurrentProject()
    console.log('[monika] GetCurrentProject result:', JSON.stringify(info))
    if (info) {
      useStore.getState().setProjectPath(info.path)
      useStore.getState().setBranch(info.branch)
      console.log('[monika] projectPath set to:', info.path, 'branch:', info.branch)
    } else {
      console.log('[monika] GetCurrentProject returned null/undefined')
    }
  } catch (err) {
    console.error('[monika] initProject failed:', err)
  }
}
