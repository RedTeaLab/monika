import { create } from 'zustand'
import { Events, Call } from '@wailsio/runtime'
import { App, StreamEvent } from '../../bindings/monika'
import type { RecentProject, BranchInfo, ModelInfo, ProviderInfo, ChangeStat } from '../../bindings/monika'
import type { DockviewApi } from 'dockview'

export interface PermissionRequiredEvent {
  type: string
  sessionId: string
  tool: string
  args: string
  reason: string
  mode: string
  requestId: string
}

export interface TaskItem {
  id: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  blockedBy?: string[]
}

export interface ConsoleEntry {
  type: 'system' | 'tool' | 'error' | 'file'
  text: string
  meta?: string
  output?: string
  status?: 'running' | 'done' | 'error'
}

interface ToolCall {
  id?: string
  name: string
  input: string
  output?: string
  status: 'running' | 'done' | 'error'
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'compaction' | 'subtask' | 'shell'
  content: string
  thinking?: string
  tools?: ToolCall[]
  model?: string
  subtaskAgent?: string
  duration?: number
  startedAt?: number
  compactionNum?: number
  beforeTokens?: number
  afterTokens?: number
}

interface SessionTabInfo {
  id: string
  title: string
}

interface FileTabInfo {
  path: string
  content: string
  isDirty: boolean
  mode: 'edit' | 'diff'
}

interface AppState {
  messages: Message[]
  generatingSessionIds: string[]
  sessionStatuses: Record<string, string>
  sessionErrors: Record<string, string>
  compactingSessionId: string
  sessionTokens: Record<string, { count: number; max: number }>
  tokenCount: number
  tokenMax: number
  projectPath: string
  branch: string
  activeSessionId: string
  sessionParents: Record<string, string>
  consoleEntries: ConsoleEntry[]
  consoleVisible: boolean
  activeFilePath: string
  fileTreeVersion: number
  sessionListVersion: number
  dockviewApi: DockviewApi | null

  openSessions: SessionTabInfo[]
  sessionMessages: Record<string, Message[]>
  tasks: Record<string, TaskItem[]>
  todoCollapsed: Record<string, boolean>
  openFiles: FileTabInfo[]
  changeStats: { stats: ChangeStat[]; loading: boolean; error: string }
  recentProjects: RecentProject[]
  allBranches: BranchInfo[]
  availableProviders: ProviderInfo[]
  selectedProvider: string
  modelsByProvider: Record<string, ModelInfo[]>
  selectedModel: string
  pendingPermission: PermissionRequiredEvent | null
  permissionMode: 'auto' | 'manual'
  permissionRules: { tool: string; pattern: string; decision: string; source: string; createdAt: string }[]
  settingsOpen: boolean

  addMessage: (msg: Message) => void
  setPermissionMode: (mode: 'auto' | 'manual') => void
  toggleSettings: () => void
  appendToSession: (sessionId: string, msgs: Message[]) => void
  addToolStart: (tool: ToolCall) => void
  updateToolDone: (name: string, output: string, status: 'done' | 'error') => void
  updateToolInput: (name: string, input: string) => void
  updateSessionMessage: (id: string, delta: string) => void
  updateSessionThinking: (id: string, delta: string) => void
  addSessionToolStart: (id: string, tool: ToolCall) => void
  addSessionError: (id: string, content: string) => void
  updateSessionToolDone: (id: string, name: string, output: string, status: 'done' | 'error') => void
  updateSessionToolInput: (id: string, name: string, input: string) => void
  addGeneratingSession: (sessionId: string) => void
  removeGeneratingSession: (sessionId: string) => void
  setSessionStatus: (sessionId: string, status: string) => void
  setSessionError: (sessionId: string, error: string) => void
  setSelectedModel: (model: string) => void
  setLastAssistantMeta: (sessionId: string, meta: { model?: string; duration?: number }) => void
  addTokens: (sid: string, tokens: number, max?: number) => void
  setCompacting: (sid: string, compacting: boolean) => void
  addCompactionMessage: (sid: string, data: { summary: string; beforeTokens: number; afterTokens: number; compactionNum: number }) => void
  clearMessages: () => void
  setMessages: (msgs: Message[]) => void
  setProjectPath: (path: string) => void
  setBranch: (branch: string) => void
  setActiveSessionId: (id: string) => void
  addConsoleEntry: (entry: ConsoleEntry) => void
  addToolEntry: (name: string, input: string) => void
  appendToolOutput: (text: string) => void
  finishToolEntry: (status: 'done' | 'error') => void
  toggleConsole: () => void
  setDockviewApi: (api: DockviewApi | null) => void
  bumpFileTreeVersion: () => void
  bumpSessionListVersion: () => void
  updateSessionTitle: (id: string, title: string) => void
  setSessionTasks: (sessionId: string, tasks: TaskItem[]) => void
  setTodoCollapsed: (sessionId: string, collapsed: boolean) => void

  openSessionTab: (id: string, title: string) => Promise<void>
  closeSessionTab: (id: string) => void
  switchSessionTab: (id: string) => void
  restoreSessionTabs: (tabs: { id: string; title: string }[]) => Promise<void>

  openFileTab: (path: string, content: string) => void
  closeFileTab: (path: string) => void
  switchFileTab: (path: string) => void
  setFileDirty: (path: string, dirty: boolean) => void
  setFileMode: (path: string, mode: 'edit' | 'diff') => void
  updateFileContent: (path: string, content: string) => void

  loadRecentProjects: () => Promise<void>
  loadBranches: () => Promise<void>
  loadProviders: () => Promise<void>
  setSelectedProvider: (providerId: string) => Promise<void>
  loadModelsForProvider: (providerId: string) => Promise<void>
  setChangeStats: (st: Partial<{ stats: ChangeStat[]; loading: boolean; error: string }>) => void
  respondPermission: (resp: { requestId: string; decision: string; rulePattern?: string }) => Promise<void>
  loadPermissionRules: () => Promise<void>
  addPermissionRule: (tool: string, pattern: string, decision: string, source: string) => Promise<void>
  deletePermissionRule: (tool: string, pattern: string, source: string) => Promise<void>
  resetProjectState: () => void
}

export const useStore = create<AppState>((set, get) => ({
  messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika. Type /help for commands.' }],
  generatingSessionIds: [],
  sessionStatuses: {},
  sessionErrors: {},
  compactingSessionId: '',
  sessionTokens: {},
  tokenCount: 0,
  tokenMax: 0,
  projectPath: '',
  branch: '',
  activeSessionId: '',
  sessionParents: {},
  consoleEntries: [{ type: 'system', text: 'ready' }],
  consoleVisible: true,
  activeFilePath: '',
  fileTreeVersion: 0,
  sessionListVersion: 0,
  dockviewApi: null as DockviewApi | null,

  openSessions: [],
  sessionMessages: {},
  tasks: {},
  todoCollapsed: {},
  openFiles: [],
  changeStats: { stats: [], loading: false, error: '' },
  recentProjects: [],
  allBranches: [],
  availableProviders: [],
  selectedProvider: '',
  modelsByProvider: {},
  selectedModel: '',
  pendingPermission: null as PermissionRequiredEvent | null,
  permissionMode: 'auto',
  permissionRules: [],
  settingsOpen: false,

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
      const sessionMsgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = sessionMsgs.length - 1; i >= 0; i--) {
        if (sessionMsgs[i].role === 'assistant') {
          sessionMsgs[i] = { ...sessionMsgs[i], content: sessionMsgs[i].content + delta }
          found = true
          break
        }
      }
      if (!found) {
        sessionMsgs.push({ id: crypto.randomUUID(), role: 'assistant', content: delta })
      }
      const updates: Partial<AppState> = {
        sessionMessages: { ...s.sessionMessages, [id]: sessionMsgs },
      }
      if (id === s.activeSessionId) {
        const activeMsgs = [...s.messages]
        let activeFound = false
        for (let i = activeMsgs.length - 1; i >= 0; i--) {
          if (activeMsgs[i].role === 'assistant') {
            activeMsgs[i] = { ...activeMsgs[i], content: activeMsgs[i].content + delta }
            activeFound = true
            break
          }
        }
        if (!activeFound) {
          activeMsgs.push({ id: crypto.randomUUID(), role: 'assistant', content: delta })
        }
        updates.messages = activeMsgs
      }
      return updates
    })
  },

  updateSessionThinking: (id, delta) => {
    set((s) => {
      const sessionMsgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = sessionMsgs.length - 1; i >= 0; i--) {
        if (sessionMsgs[i].role === 'assistant') {
          sessionMsgs[i] = { ...sessionMsgs[i], thinking: (sessionMsgs[i].thinking || '') + delta }
          found = true
          break
        }
      }
      if (!found) {
        sessionMsgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', thinking: delta })
      }
      const updates: Partial<AppState> = {
        sessionMessages: { ...s.sessionMessages, [id]: sessionMsgs },
      }
      if (id === s.activeSessionId) {
        const activeMsgs = [...s.messages]
        let activeFound = false
        for (let i = activeMsgs.length - 1; i >= 0; i--) {
          if (activeMsgs[i].role === 'assistant') {
            activeMsgs[i] = { ...activeMsgs[i], thinking: (activeMsgs[i].thinking || '') + delta }
            activeFound = true
            break
          }
        }
        if (!activeFound) {
          activeMsgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', thinking: delta })
        }
        updates.messages = activeMsgs
      }
      return updates
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

  addGeneratingSession: (sessionId) => set((s) => ({
    generatingSessionIds: s.generatingSessionIds.includes(sessionId)
      ? s.generatingSessionIds
      : [...s.generatingSessionIds, sessionId],
  })),
  removeGeneratingSession: (sessionId) => set((s) => ({
    generatingSessionIds: s.generatingSessionIds.filter((id) => id !== sessionId),
  })),
  setSessionStatus: (sessionId, status) =>
    set((s) => ({ sessionStatuses: { ...s.sessionStatuses, [sessionId]: status } })),
  setSessionError: (sessionId, error) =>
    set((s) => ({ sessionErrors: { ...s.sessionErrors, [sessionId]: error } })),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setPermissionMode: (mode) => {
    set({ permissionMode: mode })
    // Notify backend to update pipeline mode
    Call.ByName('monika/internal/api.App.SetPermissionMode', { mode }).catch(() => {
      // RPC may not be registered yet (happens during store init)
    })
  },
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
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
  addTokens: (sid, t, max) => set((s) => ({
    tokenCount: s.activeSessionId === sid ? t : s.tokenCount,
    tokenMax: s.activeSessionId === sid ? Math.max(s.tokenMax, max ?? 0) : s.tokenMax,
    sessionTokens: {
      ...s.sessionTokens,
      [sid]: { count: t, max: Math.max(s.sessionTokens[sid]?.max ?? 0, max ?? 0) },
    },
  })),

  setCompacting: (sid, compacting) => set((s) => ({
    compactingSessionId: compacting ? sid : (s.compactingSessionId === sid ? '' : s.compactingSessionId),
  })),

  addCompactionMessage: (sid, data) => {
    const msg: Message = {
      id: crypto.randomUUID(),
      role: 'compaction',
      content: data.summary,
      compactionNum: data.compactionNum,
      beforeTokens: data.beforeTokens,
      afterTokens: data.afterTokens,
    }
    set((s) => ({
      sessionMessages: {
        ...s.sessionMessages,
        [sid]: [...(s.sessionMessages[sid] || []), msg],
      },
      messages: s.activeSessionId === sid ? [...s.messages, msg] : s.messages,
    }))
  },

  bumpFileTreeVersion: () => set((s) => ({ fileTreeVersion: s.fileTreeVersion + 1 })),
  bumpSessionListVersion: () => set((s) => ({ sessionListVersion: s.sessionListVersion + 1 })),
  updateSessionTitle: (id, title) => {
    set((s) => ({
      openSessions: s.openSessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess
      ),
    }))
    get().dockviewApi?.getPanel(id)?.api.setTitle(title)
  },
  setSessionTasks: (sessionId, tasks) => {
    set((s) => ({ tasks: { ...s.tasks, [sessionId]: tasks } }))
  },
  setTodoCollapsed: (sessionId, collapsed) =>
    set((s) => ({ todoCollapsed: { ...s.todoCollapsed, [sessionId]: collapsed } })),
  clearMessages: () => set({ messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika.' }] }),
  setMessages: (msgs) => set({ messages: msgs }),
  setProjectPath: (path) => {
    console.log('[monika] store.setProjectPath:', path);
    set({ projectPath: path });
  },
  setBranch: (branch) => {
    console.log('[monika] store.setBranch:', branch);
    set({ branch });
  },
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  addConsoleEntry: (entry) => set((s) => ({ consoleEntries: [...s.consoleEntries, entry] })),
  addToolEntry: (name, input) =>
    set((s) => ({
      consoleEntries: [...s.consoleEntries, { type: 'tool', text: name, meta: input || '', output: '', status: 'running' }],
    })),
  appendToolOutput: (text) =>
    set((s) => {
      const entries = [...s.consoleEntries]
      const last = entries[entries.length - 1]
      if (last && last.type === 'tool') {
        const sep = last.output ? '\n' : ''
        entries[entries.length - 1] = { ...last, output: (last.output || '') + sep + text }
      }
      return { consoleEntries: entries }
    }),
  finishToolEntry: (status) =>
    set((s) => {
      const entries = [...s.consoleEntries]
      const last = entries[entries.length - 1]
      if (last && last.type === 'tool' && last.status === 'running') {
        entries[entries.length - 1] = { ...last, status }
      }
      return { consoleEntries: entries }
    }),
  toggleConsole: () => {
    const { dockviewApi, consoleVisible } = get()
    if (!dockviewApi) return
    if (consoleVisible) {
      dockviewApi.getPanel('console')?.api.close()
      set({ consoleVisible: false })
    } else {
      dockviewApi.addPanel({
        id: 'console',
        component: 'console',
        tabComponent: 'default-tab',
        title: 'CONSOLE',
        position: { direction: 'below' },
        initialHeight: 120,
      })
      set({ consoleVisible: true })
    }
  },
  setDockviewApi: (api) => set({ dockviewApi: api }),

  openSessionTab: async (id, title) => {
    const state = useStore.getState()
    // If this looks like a subagent session, record the current session as parent
    if ((id.startsWith('sub_') || id.startsWith('call_')) && state.activeSessionId) {
      set({ sessionParents: { ...state.sessionParents, [id]: state.activeSessionId } })
    }
    const existing = state.openSessions.find((s) => s.id === id)
    if (existing) {
      state.switchSessionTab(id)
      // If panel was removed (e.g. user closed it), re-create it.
      // switchSessionTab already activates the panel if it exists.
      const dockApi = useStore.getState().dockviewApi
      if (dockApi && !dockApi.getPanel(id)) {
        dockApi.addPanel({
          id,
          component: 'chat',
          tabComponent: 'chat-tab',
          title: existing.title,
          params: { sessionId: id },
          position: { referenceGroup: 'chat-group' },
        })
      }
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
      sessionParents: s.sessionParents,
      messages: [],
      tokenCount: s.sessionTokens[id]?.count ?? 0,
      tokenMax: s.sessionTokens[id]?.max ?? 0,
    }))
    // Create dockview panel for the new session
    const dockApi = useStore.getState().dockviewApi
    if (dockApi && !dockApi.getPanel(id)) {
      dockApi.addPanel({
        id,
        component: 'chat',
        tabComponent: 'chat-tab',
        title,
        params: { sessionId: id },
        position: { referenceGroup: 'chat-group' },
      })
    }
    try {
      const project = useStore.getState().projectPath
      const session = await App.LoadSession(project, id)
      const msgs = session?.messages
        ? loadSessionMessages(session.messages as unknown as Parameters<typeof loadSessionMessages>[0], session.model)
        : []
      set((s) => {
        const streamMsgs = s.sessionMessages[id] || []
        let merged = msgs.length > 0
          ? [...msgs, ...streamMsgs.filter((sm) => !msgs.some((lm) => lm.id === sm.id))]
          : streamMsgs
        // For child sessions: transform first user message to subtask role
        if ((id.startsWith('sub_') || id.startsWith('call_')) && merged.length > 0 && merged[0].role === 'user') {
          const agentName = title?.split(' · ')[0] || ''
          merged = merged.map((m, i) =>
            i === 0 ? { ...m, role: 'subtask' as const, subtaskAgent: agentName } : m
          )
        }
        const tokData = {
          count: (session as any)?.token_count ?? s.sessionTokens[id]?.count ?? 0,
          max: (session as any)?.token_max ?? s.sessionTokens[id]?.max ?? 0,
        }
        if (s.activeSessionId !== id) {
          return {
            sessionMessages: { ...s.sessionMessages, [id]: merged },
            sessionTokens: { ...s.sessionTokens, [id]: tokData },
          }
        }
        return {
          sessionMessages: { ...s.sessionMessages, [id]: merged },
          messages: merged,
          sessionTokens: { ...s.sessionTokens, [id]: tokData },
          tokenCount: tokData.count,
          tokenMax: tokData.max,
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

  closeSessionTab: async (id) => {
    // Cancel backend generation if the closed tab was generating
    if (get().generatingSessionIds.includes(id)) {
      try { await App.CancelGeneration(id) } catch { /* best-effort */ }
    }
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

      const newParents = { ...s.sessionParents }
      delete newParents[id]

      const newMessages: Message[] = newActive ? (msgCache[newActive] || []) : [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika.' }]

      return {
        openSessions: next,
        sessionMessages: msgCache,
        activeSessionId: newActive,
        messages: newMessages,
        generatingSessionIds: s.generatingSessionIds.filter((sid) => sid !== id),
        sessionParents: newParents,
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
      const updates = {
        activeSessionId: id,
        sessionMessages: currentCache,
        messages: restored,
        tokenCount: s.sessionTokens[id]?.count ?? 0,
        tokenMax: s.sessionTokens[id]?.max ?? 0,
        sessionParents: s.sessionParents,
      }
      // Activate corresponding dockview panel
      s.dockviewApi?.getPanel(id)?.api.setActive()
      return updates
    })
  },

  restoreSessionTabs: async (tabs: { id: string; title: string }[]) => {
    const project = get().projectPath
    if (!project || tabs.length === 0) return
    for (const tab of tabs) {
      if (get().openSessions.some((s) => s.id === tab.id)) continue
      set((s) => ({
        openSessions: [...s.openSessions, tab],
      }))
      try {
        const session = await App.LoadSession(project, tab.id)
        const msgs = session?.messages
          ? loadSessionMessages(session.messages as unknown as Parameters<typeof loadSessionMessages>[0], session.model)
          : []
        set((s) => ({
          sessionMessages: { ...s.sessionMessages, [tab.id]: msgs },
          sessionTokens: {
            ...s.sessionTokens,
            [tab.id]: {
              count: (session as any)?.token_count ?? 0,
              max: (session as any)?.token_max ?? 0,
            },
          },
          // Repair title from backend (fixes garbled titles from old byte-based truncation)
          openSessions: s.openSessions.map((sess) =>
            sess.id === tab.id && session?.title ? { ...sess, title: session.title } : sess
          ),
        }))
      } catch {
        set((s) => ({
          sessionMessages: { ...s.sessionMessages, [tab.id]: [] },
        }))
      }
    }
    if (!get().activeSessionId && tabs.length > 0) {
      const activeId = tabs[0].id
      const msgs = get().sessionMessages[activeId] || []
      set({
        activeSessionId: activeId,
        messages: msgs,
        tokenCount: get().sessionTokens[activeId]?.count ?? 0,
        tokenMax: get().sessionTokens[activeId]?.max ?? 0,
      })
    }
  },

  openFileTab: (path, content) => {
    const state = useStore.getState()
    const existing = state.openFiles.find((f) => f.path === path)
    if (existing) {
      state.switchFileTab(path)
      return
    }
    set((s) => ({
      openFiles: [...s.openFiles, { path, content, isDirty: false, mode: 'edit' }],
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

  setFileMode: (path, mode) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) => f.path === path ? { ...f, mode } : f),
    }))
  },

  updateFileContent: (path, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) => f.path === path ? { ...f, content } : f),
    }))
  },

  loadRecentProjects: async () => {
    console.log('[monika] loadRecentProjects called');
    const projects = await App.GetRecentProjects();
    console.log('[monika] loadRecentProjects got', projects.length, 'projects:', projects.map(p => p.path));
    set({ recentProjects: projects });
  },

  loadBranches: async () => {
    const { projectPath } = get();
    console.log('[monika] loadBranches called, projectPath:', projectPath);
    if (!projectPath) return;
    try {
      const branches = await App.ListBranches(projectPath);
      console.log('[monika] loadBranches got', branches.length, 'branches');
      set({ allBranches: branches });
    } catch (e) {
      console.error('[monika] loadBranches failed:', e);
      set({ allBranches: [] });
      throw e;
    }
  },

  loadProviders: async () => {
    let providers: ProviderInfo[] = [];
    try {
      providers = await App.GetProviders();
    } catch {
      // Keep providers empty on failure — dropdown will show "No providers"
    }
    const state = get();
    const valid = state.selectedProvider && providers.some((p) => p.id === state.selectedProvider);
    set({
      availableProviders: providers,
      selectedProvider: valid ? state.selectedProvider : (providers.length > 0 ? providers[0].id : ''),
    });
    if (providers.length > 0) {
      await get().loadModelsForProvider(valid ? state.selectedProvider! : providers[0].id);
    }
  },

  setSelectedProvider: async (providerId: string) => {
    set({ selectedProvider: providerId });
    await get().loadModelsForProvider(providerId);
  },

  loadModelsForProvider: async (providerId: string) => {
    let models: ModelInfo[] = [];
    try {
      models = await App.GetModels(providerId);
    } catch {
      // Keep models empty on failure
    }
    const state = get();
    const valid = state.selectedModel && models.some((m) => m.ID === state.selectedModel);
    set({
      modelsByProvider: { ...state.modelsByProvider, [providerId]: models },
      selectedModel: valid ? state.selectedModel : (models.length > 0 ? models[0].ID : ''),
    });
  },

  setChangeStats: (st) => set((s) => ({ changeStats: { ...s.changeStats, ...st } })),

  respondPermission: async (resp) => {
    await Call.ByName('monika/internal/api.App.RespondPermission', resp)
    set({ pendingPermission: null })
  },

  loadPermissionRules: async () => {
    const { projectPath } = get()
    if (!projectPath) return
    try {
      const rules = await Call.ByName('monika/internal/api.App.ListPermissionRules', { projectPath })
      set({ permissionRules: rules || [] })
    } catch {
      set({ permissionRules: [] })
    }
  },

  addPermissionRule: async (tool, pattern, decision, source) => {
    await Call.ByName('monika/internal/api.App.AddPermissionRule', { tool, pattern, decision, source })
    const { projectPath } = get()
    if (!projectPath) return
    try {
      const rules = await Call.ByName('monika/internal/api.App.ListPermissionRules', { projectPath })
      set({ permissionRules: rules || [] })
    } catch {
      set({ permissionRules: [] })
    }
  },

  deletePermissionRule: async (tool, pattern, source) => {
    await Call.ByName('monika/internal/api.App.DeletePermissionRule', { tool, pattern, source })
    const { projectPath } = get()
    if (!projectPath) return
    try {
      const rules = await Call.ByName('monika/internal/api.App.ListPermissionRules', { projectPath })
      set({ permissionRules: rules || [] })
    } catch {
      set({ permissionRules: [] })
    }
  },

  resetProjectState: () => {
    console.log('[monika] resetProjectState called');
    set({
      messages: [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika. Type /help for commands.' }],
      generatingSessionIds: [],
      sessionStatuses: {},
      sessionErrors: {},
      compactingSessionId: '',
      sessionTokens: {},
      tokenCount: 0,
      tokenMax: 0,
      activeSessionId: '',
      sessionParents: {},
      activeFilePath: '',
      consoleEntries: [{ type: 'system', text: 'ready' }],
      consoleVisible: true,
      openSessions: [],
      sessionMessages: {},
      tasks: {},
      openFiles: [],
      changeStats: { stats: [], loading: false, error: '' },
      allBranches: [],
      recentProjects: [],
      availableProviders: [],
      selectedProvider: '',
      modelsByProvider: {},
      selectedModel: '',
      pendingPermission: null,
      permissionMode: 'auto',
      permissionRules: [],

      settingsOpen: false,
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
      if (m.name === 'compaction_summary') {
        result.push({
          id: crypto.randomUUID(),
          role: 'compaction',
          content: m.content || '',
        })
        i++
      } else {
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
      }
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
    let store = useStore.getState()
    const data = ev.data as StreamEvent
    const sid = data.session_id

    // Auto-create entry for child session so streaming events are buffered
    if (sid && (sid.startsWith('call_') || sid.startsWith('sub_')) && !store.sessionMessages[sid]) {
      useStore.setState({ sessionMessages: { ...store.sessionMessages, [sid]: [] } })
      store = useStore.getState()
    }

    // Handle permission_required events — they carry a session_id but may
    // arrive before the session tab is opened in the frontend.
    const permPayload = (data as any).permission as PermissionRequiredEvent | undefined
    if (data.type === 'permission_required' && permPayload) {
      useStore.setState({ pendingPermission: permPayload })
      return
    }

    // Drop events with no session_id or session that was explicitly closed
    if (!sid || !store.sessionMessages[sid]) {
      console.warn('[monika] stream event dropped: no session_id or session closed', data.type)
      return
    }

    switch (data.type) {
      case 'text_delta':
        store.updateSessionMessage(sid, data.content || '')
        if (data.model) {
          store.setLastAssistantMeta(sid, { model: data.model })
        }
        break

      case 'thinking':
        store.updateSessionThinking(sid, data.content || '')
        if (data.model) {
          store.setLastAssistantMeta(sid, { model: data.model })
        }
        break

      case 'tool_start':
        if (data.tool) {
          store.addSessionToolStart(sid, { id: data.tool.id, name: data.tool.name, input: data.tool.input || '', status: 'running' })
          store.addToolEntry(data.tool.name, data.tool.input || '')
          if (sid === store.activeSessionId) {
            store.addToolStart({ id: data.tool.id, name: data.tool.name, input: data.tool.input || '', status: 'running' })
          }
        }
        break

      case 'tool_output':
        if (data.tool) {
          store.appendToolOutput(data.tool.output || '')
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
          store.finishToolEntry(status)
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
          store.addTokens(sid, data.usage.context_tokens || data.usage.total_tokens || 0, data.usage.max_context)
        }
        break

      case 'error':
        if (data.content === 'cancelled') {
          store.removeGeneratingSession(sid)
          store.setSessionStatus(sid, 'idle')
          store.setSessionError(sid, '')
          store.bumpSessionListVersion()
          break
        }
        store.addConsoleEntry({ type: 'error', text: data.content || 'Unknown error' })
        store.addSessionError(sid, data.content || 'Unknown error')
        if (sid === store.activeSessionId) {
          store.addMessage({ id: crypto.randomUUID(), role: 'error', content: data.content || 'Unknown error' })
        }
        store.removeGeneratingSession(sid)
        store.setSessionStatus(sid, 'failure')
        store.setSessionError(sid, data.content || 'Unknown error')
        store.bumpSessionListVersion()
        break

      case 'file_changed':
        if (data.file_change) {
          store.addConsoleEntry({ type: 'file', text: data.file_change.path, meta: data.file_change.status })
        }
        store.bumpFileTreeVersion()
        break

      case 'done': {
        store.removeGeneratingSession(sid)
        const sessionMsgs = store.sessionMessages[sid] || []
        for (let i = sessionMsgs.length - 1; i >= 0; i--) {
          if (sessionMsgs[i].role === 'assistant' && sessionMsgs[i].startedAt) {
            store.setLastAssistantMeta(sid, { duration: Math.round((Date.now() - sessionMsgs[i].startedAt!) / 100) / 10 })
            break
          }
        }
        store.setSessionStatus(sid, 'success')
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
        store.setSessionStatus(sid, 'generating')
        store.addGeneratingSession(sid)
        store.bumpSessionListVersion()
        break
      }

      case 'task_updated':
        if (data.tasks) {
          store.setSessionTasks(sid, data.tasks as TaskItem[])
        }
        break

      case 'compacting':
        store.setCompacting(sid, true)
        store.removeGeneratingSession(sid)
        break

      case 'compaction':
        store.setCompacting(sid, false)
        if (data.compaction) {
          store.addCompactionMessage(sid, {
            summary: data.compaction.summary || '',
            beforeTokens: data.compaction.before_tokens || 0,
            afterTokens: data.compaction.after_tokens || 0,
            compactionNum: data.compaction.compaction_num || 1,
          })
        }
        break
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
      useStore.getState().loadProviders()
      console.log('[monika] projectPath set to:', info.path, 'branch:', info.branch)
    } else {
      console.log('[monika] GetCurrentProject returned null/undefined')
    }
  } catch (err) {
    console.error('[monika] initProject failed:', err)
  }
}
