
import { create } from 'zustand'
import { Events, Call } from '@wailsio/runtime'
import { App, StreamEvent } from '../../bindings/monika'
import type { RecentProject, BranchInfo, ModelInfo, ProviderInfo, ChangeStat, SessionInfo } from '../../bindings/monika'
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

export interface AskUserEvent {
  requestId: string
  sessionId: string
  question: string
  title?: string
  options?: string[]
}

export interface TaskItem {
  id: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  blockedBy?: string[]
}

export interface AvailableProviderInfo {
  id: string
  display_name: string
  npm: string
  base_url: string
  models: AvailableModelInfo[]
}

export interface AvailableModelInfo {
  id: string
  name: string
  context_limit: number
  output_limit: number
}

interface ToolCall {
  id?: string
  name: string
  input: string
  output?: string
  status: 'running' | 'done' | 'error'
}

export interface QuotedMessage {
  id: string
  role: string
  content: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error' | 'compaction' | 'subtask' | 'shell'
  content: string
  thinking?: string
  tools?: ToolCall[]
  quotedMessages?: QuotedMessage[]
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

interface PreviewState {
  mode: 'file' | 'diff' | null
  filePath: string | null
  fileName: string | null
  fileContent: string | null
  diffLines: string[] | null
}

export interface AgentInfo {
  name: string
  description: string
  systemPrompt: string
  model: string
  provider: string
  temperature?: number
  hidden: boolean
  disabled: boolean
  isCustom: boolean
  source: 'builtin' | 'custom'
  permission: Record<string, string>
}

export interface SkillInfo {
  name: string
  description: string
  path: string
  source: string
  enabled?: boolean
}

export interface MCPServerInfo {
  id: string
  type: string
  command: string
  args: string[]
  env: Record<string, string>
  url: string
  headers: Record<string, string>
  status: 'connected' | 'disconnected'
}

export interface ProviderFull {
  id: string
  display_name: string
  name?: string
  base_url: string
  api_key: string
  wire_api: string
  models: { id: string; name: string; context_limit?: number; output_limit?: number; enabled?: boolean }[]
}

interface AppState {
  messages: Message[]
  generatingSessionIds: string[]
  sessionStatuses: Record<string, string>
  sessionErrors: Record<string, string>
  sessionTokens: Record<string, { count: number; max: number }>
  tokenCount: number
  tokenMax: number
  projectPath: string
  branch: string
  activeSessionId: string
  sessionParents: Record<string, string>
  subagentStack: Record<string, string[]>
  preview: PreviewState
  lastEditedFile: string | null
  lastEditedOldContent: string | null
  lastEditVersion: number
  fileTreeVersion: number
  sessionListVersion: number
  dockviewApi: DockviewApi | null

  openSessions: SessionTabInfo[]
  sessionMessages: Record<string, Message[]>
  tasks: Record<string, TaskItem[]>
  todoCollapsed: Record<string, boolean>
  changeStats: { stats: ChangeStat[]; loading: boolean; error: string }
  recentProjects: RecentProject[]
  allBranches: BranchInfo[]
  availableProviders: ProviderInfo[]
  selectedProvider: string
  modelsByProvider: Record<string, ModelInfo[]>
  selectedModel: string
  pendingPermission: PermissionRequiredEvent | null
  pendingAskUser: AskUserEvent | null
  permissionMode: 'auto' | 'manual'
  permissionRules: { tool: string; pattern: string; decision: string; source: string; createdAt: string }[]
  agents: AgentInfo[]
  skills: SkillInfo[]
  skillPaths: string[]
  mcpServers: MCPServerInfo[]
  providerDetails: ProviderFull[]
  availableProvidersCatalog: AvailableProviderInfo[]
  settingsOpen: boolean
  msgFilter: 'all' | 'chat' | 'user' | 'assistant'
  chatInputAppendPath: string | null
  selectedMessageIds: string[]
  multiSelectMode: 'quote' | 'forward' | null

  addMessage: (msg: Message) => void
  setPermissionMode: (mode: 'auto' | 'manual') => void
  setMsgFilter: (filter: 'all' | 'chat' | 'user' | 'assistant') => void
  toggleSettings: () => void
  appendToSession: (sessionId: string, msgs: Message[]) => void
  addToolStart: (tool: ToolCall) => void
  updateToolDone: (toolId: string, output: string, status: 'done' | 'error') => void
  updateToolInput: (toolId: string, input: string) => void
  updateSessionMessage: (id: string, delta: string) => void
  updateSessionThinking: (id: string, delta: string) => void
  addSessionToolStart: (id: string, tool: ToolCall) => void
  addSessionError: (id: string, content: string) => void
  updateSessionToolDone: (id: string, toolId: string, output: string, status: 'done' | 'error') => void
  updateSessionToolInput: (id: string, toolId: string, input: string) => void
  addGeneratingSession: (sessionId: string) => void
  removeGeneratingSession: (sessionId: string) => void
  setSessionStatus: (sessionId: string, status: string) => void
  setSessionError: (sessionId: string, error: string) => void
  setSelectedModel: (model: string) => void
  setLastAssistantMeta: (sessionId: string, meta: { model?: string; duration?: number }) => void
  addTokens: (sid: string, tokens: number, max?: number) => void
  fillCompactionCard: (sid: string, card: { summary: string; beforeTokens: number; afterTokens: number; compactionNum: number }) => void
  clearMessages: () => void
  setMessages: (msgs: Message[]) => void
  setProjectPath: (path: string) => void
  setBranch: (branch: string) => void
  setActiveSessionId: (id: string) => void
  setDockviewApi: (api: DockviewApi | null) => void
  bumpFileTreeVersion: () => void
  bumpSessionListVersion: () => void
  updateSessionTitle: (id: string, title: string) => void
  renameSession: (id: string, title: string) => Promise<void>
  setSessionTasks: (sessionId: string, tasks: TaskItem[]) => void
  setTodoCollapsed: (sessionId: string, collapsed: boolean) => void
  pushSubagentOverlay: (parentId: string, subagentId: string, title: string) => Promise<void>
  popSubagentOverlay: (parentId: string) => void

  openSessionTab: (id: string, title: string) => Promise<void>
  closeSessionTab: (id: string) => void
  switchSessionTab: (id: string) => void
  restoreSessionTabs: (tabs: { id: string; title: string }[]) => Promise<void>
  loadSessionList: () => Promise<void>

  setPreviewFile: (filePath: string, fileName: string, content: string) => void
  setPreviewDiff: (filePath: string, fileName: string, lines: string[]) => void
  clearPreview: () => void
  setLastEditedFile: (filePath: string | null) => void
  setRevealFilePath: (filePath: string | null) => void
  revealFilePath: string | null

  loadRecentProjects: () => Promise<void>
  loadBranches: () => Promise<void>
  loadProviders: () => Promise<void>
  setSelectedProvider: (providerId: string) => Promise<void>
  loadModelsForProvider: (providerId: string) => Promise<void>
  setChangeStats: (st: Partial<{ stats: ChangeStat[]; loading: boolean; error: string }>) => void
  respondPermission: (resp: { requestId: string; decision: string; rulePattern?: string }) => Promise<void>
  respondAskUser: (resp: { requestId: string; answer: string }) => Promise<void>
  loadPermissionRules: () => Promise<void>
  addPermissionRule: (tool: string, pattern: string, decision: string, source: string) => Promise<void>
  deletePermissionRule: (tool: string, pattern: string, source: string) => Promise<void>
  loadAgents: () => Promise<void>
  saveAgent: (agent: AgentInfo) => Promise<void>
  deleteAgent: (name: string) => Promise<void>
  loadSkills: () => Promise<void>
  addSkillPath: (path: string) => Promise<void>
  removeSkillPath: (path: string) => Promise<void>
  loadSkillContent: (name: string) => Promise<{ content: string; files: string[] }>
  installSkillFromURL: (url: string, scope: 'project' | 'global') => Promise<string[]>
  installSkillFromZip: (data: string, scope: 'project' | 'global') => Promise<string[]>
  uninstallSkill: (name: string) => Promise<void>
  openInFileManager: (path: string) => Promise<void>
  setSkillEnabled: (name: string) => Promise<void>
  loadMCPServers: () => Promise<void>
  saveMCPServer: (srv: MCPServerInfo) => Promise<void>
  deleteMCPServer: (id: string) => Promise<void>
  importMCPServers: (json: string) => Promise<string[]>
  testMCPServer: (id: string) => Promise<string[]>
  testMCPServerConfig: (config: { type: string; command: string; args: string[]; env: Record<string, string>; url: string; headers: Record<string, string> }) => Promise<string[]>
  reconnectMCPServer: (id: string) => Promise<string[]>
  loadProviderDetails: () => Promise<void>
  loadAvailableProviders: () => Promise<AvailableProviderInfo[]>
  saveProviderDetail: (cfg: ProviderFull) => Promise<void>
  deleteProviderDetail: (id: string) => Promise<void>
  resetProjectState: () => void
  appendPathToInput: (path: string) => void
  toggleMessageSelection: (id: string) => void
  enterMultiSelect: (mode: 'quote' | 'forward', initialId: string) => void
  clearSelection: () => void
}

export const useStore = create<AppState>((set, get) => ({
  messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika. Type /help for commands.' }],
  generatingSessionIds: [],
  sessionStatuses: {},
  sessionErrors: {},
  sessionTokens: {},
  tokenCount: 0,
  tokenMax: 0,
  projectPath: '',
  branch: '',
  activeSessionId: '',
  sessionParents: {},
  subagentStack: {},
  preview: { mode: null, filePath: null, fileName: null, fileContent: null, diffLines: null },
  lastEditedFile: null,
  lastEditedOldContent: null,
  revealFilePath: null,
  lastEditVersion: 0,
  fileTreeVersion: 0,
  sessionListVersion: 0,
  dockviewApi: null as DockviewApi | null,

  openSessions: [],
  sessionMessages: {},
  tasks: {},
  todoCollapsed: {},
  changeStats: { stats: [], loading: false, error: '' },
  recentProjects: [],
  allBranches: [],
  availableProviders: [],
  selectedProvider: '',
  modelsByProvider: {},
  selectedModel: '',
  pendingPermission: null as PermissionRequiredEvent | null,
  pendingAskUser: null as AskUserEvent | null,
  permissionMode: 'auto',
  permissionRules: [],
  agents: [],
  skills: [],
  skillPaths: [],
  mcpServers: [],
  providerDetails: [],
  availableProvidersCatalog: [] as AvailableProviderInfo[],
  settingsOpen: false,
  msgFilter: 'all' as const,
  chatInputAppendPath: null as string | null,
  selectedMessageIds: [] as string[],
  multiSelectMode: null as 'quote' | 'forward' | null,

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
      let found = false
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          if (tool.id && msgs[i].tools && msgs[i].tools!.some((t) => t.id === tool.id)) {
            return {}
          }
          msgs[i] = { ...msgs[i], tools: [...(msgs[i].tools || []), tool] }
          found = true
          break
        }
      }
      if (!found) {
        msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', tools: [tool] })
      }
      return { messages: msgs }
    }),

  updateToolDone: (toolId, output, status) =>
    set((s) => {
      const msgs = [...s.messages]
      let updatedFile: string | null = null
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) => {
              if (t.id === toolId && t.status === 'running') {
                if (status === 'done' && (t.name === 'file_edit' || t.name === 'file_write') && t.input) {
                  try {
                    const parsed = JSON.parse(t.input)
                    if (parsed.filePath) updatedFile = parsed.filePath
                  } catch {}
                }
                return { ...t, output, status }
              }
              return t
            }),
          }
          break
        }
      }
      const result: Partial<AppState> = { messages: msgs }
      if (updatedFile) {
        (result as any).lastEditedFile = updatedFile
        ;(result as any).lastEditVersion = s.lastEditVersion + 1
      }
      return result
    }),

  updateToolInput: (toolId, input) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) =>
              t.id === toolId && !t.input ? { ...t, input } : t
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
        if (sessionMsgs[i].role === 'assistant' && !(sessionMsgs[i].tools && sessionMsgs[i].tools!.length > 0)) {
          sessionMsgs[i] = { ...sessionMsgs[i], content: sessionMsgs[i].content + delta }
          found = true
          break
        }
      }
      if (!found) {
        sessionMsgs.push({ id: crypto.randomUUID(), role: 'assistant', content: delta })
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: sessionMsgs } }
    })
  },

  updateSessionThinking: (id, delta) => {
    set((s) => {
      const sessionMsgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = sessionMsgs.length - 1; i >= 0; i--) {
        if (sessionMsgs[i].role === 'assistant' && !(sessionMsgs[i].tools && sessionMsgs[i].tools!.length > 0)) {
          sessionMsgs[i] = { ...sessionMsgs[i], thinking: (sessionMsgs[i].thinking || '') + delta }
          found = true
          break
        }
      }
      if (!found) {
        sessionMsgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', thinking: delta })
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: sessionMsgs } }
    })
  },

  addSessionToolStart: (id, tool) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          if (tool.id && msgs[i].tools!.some((t) => t.id === tool.id)) {
            return {}
          }
          break
        }
      }
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

  updateSessionToolDone: (id, toolId, output, status) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      let found = false
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) =>
              t.id === toolId && t.status === 'running' ? { ...t, output, status } : t
            ),
          }
          found = true
          break
        }
      }
      if (!found) {
        msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: '', tools: [{ name: '', input: '', output, status }] })
      }
      return { sessionMessages: { ...s.sessionMessages, [id]: msgs } }
    })
  },

  updateSessionToolInput: (id, toolId, input) => {
    set((s) => {
      const msgs = [...(s.sessionMessages[id] || [])]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].tools) {
          msgs[i] = {
            ...msgs[i],
            tools: msgs[i].tools!.map((t) =>
              t.id === toolId && !t.input ? { ...t, input } : t
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
  setSelectedModel: (model) => {
    set((s) => {
      const models = s.modelsByProvider[s.selectedProvider] || []
      const m = models.find((m: any) => m.ID === model) as any
      const newMax = m?.ContextLimit ?? 0
      const sid = s.activeSessionId
      const current = s.sessionTokens[sid]
      return {
        selectedModel: model,
        ...(newMax > 0 && sid
          ? {
              tokenMax: newMax,
              sessionTokens: { ...s.sessionTokens, [sid]: { count: current?.count ?? 0, max: newMax } },
            }
          : {}),
      }
    })
  },
  setPermissionMode: (mode) => {
    set({ permissionMode: mode })
    // Notify backend to update pipeline mode
    Call.ByName('monika/internal/api.App.SetPermissionMode', { mode }).catch(() => {
      // RPC may not be registered yet (happens during store init)
    })
  },
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setMsgFilter: (filter) => set({ msgFilter: filter }),
  appendPathToInput: (path) => set({ chatInputAppendPath: path }),

  toggleMessageSelection: (id) => set((s) => {
    const ids = s.selectedMessageIds.includes(id)
      ? s.selectedMessageIds.filter(x => x !== id)
      : [...s.selectedMessageIds, id]
    return { selectedMessageIds: ids }
  }),

  enterMultiSelect: (mode, initialId) => set({
    multiSelectMode: mode,
    selectedMessageIds: [initialId],
  }),

  clearSelection: () => set({
    multiSelectMode: null,
    selectedMessageIds: [],
  }),

  setLastAssistantMeta: (sessionId, meta) => {
    set((s) => {
      const sessionMsgs = [...(s.sessionMessages[sessionId] || [])]
      for (let i = sessionMsgs.length - 1; i >= 0; i--) {
        if (sessionMsgs[i].role === 'assistant') {
          sessionMsgs[i] = { ...sessionMsgs[i], ...meta }
          break
        }
      }
      return { sessionMessages: { ...s.sessionMessages, [sessionId]: sessionMsgs } }
    })
  },
  addTokens: (sid, t, max) => set((s) => {
    const prev = s.sessionTokens[sid]
    const effectiveMax = max ?? prev?.max ?? s.tokenMax
    return {
    tokenCount: s.activeSessionId === sid ? t : s.tokenCount,
    tokenMax: s.activeSessionId === sid ? effectiveMax : s.tokenMax,
    sessionTokens: {
      ...s.sessionTokens,
      [sid]: { count: t, max: effectiveMax },
    },
  }}),

  fillCompactionCard: (sid, card) => set((s) => {
    const msgs = s.sessionMessages[sid]
    if (!msgs) return {}
    const updated = [...msgs]
    for (let i = updated.length - 1; i >= 0; i--) {
      if (updated[i].role === 'compaction' && !updated[i].content) {
        updated[i] = { ...updated[i], content: card.summary, compactionNum: card.compactionNum, beforeTokens: card.beforeTokens, afterTokens: card.afterTokens }
        break
      }
    }
    return {
      sessionMessages: { ...s.sessionMessages, [sid]: updated },
      messages: s.activeSessionId === sid ? updated : s.messages,
    }
  }),

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
  renameSession: async (id, title) => {
    const state = useStore.getState()
    const projectPath = state.projectPath
    if (!projectPath || !title.trim()) return
    await App.RenameSession(projectPath, id, title.trim())
    useStore.getState().updateSessionTitle(id, title.trim())
    useStore.getState().bumpSessionListVersion()
  },
  setSessionTasks: (sessionId, tasks) => {
    set((s) => ({ tasks: { ...s.tasks, [sessionId]: tasks } }))
  },
  setTodoCollapsed: (sessionId, collapsed) =>
    set((s) => ({ todoCollapsed: { ...s.todoCollapsed, [sessionId]: collapsed } })),
  clearMessages: () => set({ messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika.' }] }),
  setMessages: (msgs) => set({ messages: msgs }),
  setProjectPath: (path) => {
    set({ projectPath: path });
  },
  setBranch: (branch) => {
    set({ branch });
  },
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setDockviewApi: (api) => set({ dockviewApi: api }),

  openSessionTab: async (id, title) => {
    const state = useStore.getState()
    if ((id.startsWith('sub_') || id.startsWith('call_')) && state.activeSessionId) {
      set({ sessionParents: { ...state.sessionParents, [id]: state.activeSessionId } })
    }
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
      sessionParents: s.sessionParents,
      messages: [],
      tokenCount: s.sessionTokens[id]?.count ?? 0,
      tokenMax: s.sessionTokens[id]?.max ?? 0,
    }))
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
        // For compaction child sessions: drop the first message (conversation dump sent as input)
        if (id.startsWith('call_compact_') && merged.length > 0 && merged[0].role === 'user') {
          merged = merged.slice(1)
        }
        // For other child sessions: transform first user message to subtask role
        if (id.startsWith('sub_') && merged.length > 0 && merged[0].role === 'user') {
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
    // Mark session as viewed when opened
    const project = useStore.getState().projectPath
    if (project) {
      App.MarkSessionViewed(project, id).catch(() => {})
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
      // Mark session as viewed when user switches to it
      const project = s.projectPath
      if (project) {
        App.MarkSessionViewed(project, id).catch(() => {})
      }
      return updates
    })
  },


  pushSubagentOverlay: async (parentId, subagentId, title) => {
    const state = useStore.getState()
    const project = state.projectPath

    // Push overlay synchronously so it appears immediately
    set((s) => ({
      sessionParents: { ...s.sessionParents, [subagentId]: parentId },
      subagentStack: { ...s.subagentStack, [parentId]: [...(s.subagentStack[parentId] || []), subagentId] },
    }))

    // If messages already loaded from streaming, skip backend reload
    const existing = useStore.getState().sessionMessages[subagentId]
    if (existing && existing.length > 0) return

    try {
      const session = await App.LoadSession(project, subagentId)
      let msgs = session?.messages
        ? loadSessionMessages(session.messages as unknown as Parameters<typeof loadSessionMessages>[0], session.model)
        : []

      // For compaction child sessions: drop the first message (conversation dump sent as input)
      if (subagentId.startsWith("call_compact_") && msgs.length > 0 && msgs[0].role === "user") {
        msgs = msgs.slice(1)
      }
      // For other child sessions: transform first user message to subtask role
      if (subagentId.startsWith("sub_") && msgs.length > 0 && msgs[0].role === "user") {
        const agentName = title?.split(" · ")[0] || ""
        msgs = msgs.map((m, i) =>
          i === 0 ? { ...m, role: "subtask" as const, subtaskAgent: agentName } : m
        )
      }

      const tokData = {
        count: (session as any)?.token_count ?? 0,
        max: (session as any)?.token_max ?? 0,
      }

      set((s) => ({
        sessionMessages: { ...s.sessionMessages, [subagentId]: msgs },
        sessionTokens: { ...s.sessionTokens, [subagentId]: tokData },
      }))
    } catch {
      set((s) => ({
        sessionMessages: { ...s.sessionMessages, [subagentId]: [{ id: crypto.randomUUID(), role: "error" as const, content: "Failed to load subagent session." }] },
      }))
    }
  },
  popSubagentOverlay: (parentId) => {
    set((s) => {
      const stack = [...(s.subagentStack[parentId] || [])]
      stack.pop()
      return { subagentStack: { ...s.subagentStack, [parentId]: stack } }
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
      // Pick the most recently updated session
      let activeId = tabs[0].id
      try {
        const sessions = await App.ListSessions(project)
        const tabIds = new Set(tabs.map((t) => t.id))
        const recent = sessions
          .filter((s: SessionInfo) => tabIds.has(s.id))
          .sort((a: SessionInfo, b: SessionInfo) => b.updated_at.localeCompare(a.updated_at))
        if (recent.length > 0) activeId = recent[0].id
      } catch {}
      const msgs = get().sessionMessages[activeId] || []
      set({
        activeSessionId: activeId,
        messages: msgs,
        tokenCount: get().sessionTokens[activeId]?.count ?? 0,
        tokenMax: get().sessionTokens[activeId]?.max ?? 0,
      })
    }
  },

  loadSessionList: async () => {
    const project = get().projectPath
    if (!project) return
    try {
      const sessions = await App.ListSessions(project)
      if (!sessions || sessions.length === 0) return
      sessions.sort((a: SessionInfo, b: SessionInfo) => b.updated_at.localeCompare(a.updated_at))

      // Load messages for each session concurrently
      const toLoad = sessions.filter(s => !get().openSessions.some(o => o.id === s.id))
      await Promise.allSettled(toLoad.map(async (s) => {
        set((prev) => ({
          openSessions: [...prev.openSessions, { id: s.id, title: s.title }],
        }))
        try {
          const session = await App.LoadSession(project, s.id)
          const msgs = session?.messages
            ? loadSessionMessages(session.messages as unknown as Parameters<typeof loadSessionMessages>[0], session.model)
            : []
          set((prev) => ({
            sessionMessages: { ...prev.sessionMessages, [s.id]: msgs },
            sessionTokens: {
              ...prev.sessionTokens,
              [s.id]: { count: s.token_count ?? 0, max: s.token_max ?? 0 },
            },
            openSessions: prev.openSessions.map((sess) =>
              sess.id === s.id && session?.title ? { ...sess, title: session.title } : sess
            ),
          }))
        } catch {
          set((prev) => ({
            sessionMessages: { ...prev.sessionMessages, [s.id]: [] },
          }))
        }
      }))

      // Activate the most recent
      if (!get().activeSessionId) {
        const mostRecent = sessions[0]
        const msgs = get().sessionMessages[mostRecent.id] || []
        set({
          activeSessionId: mostRecent.id,
          messages: msgs,
          tokenCount: get().sessionTokens[mostRecent.id]?.count ?? 0,
          tokenMax: get().sessionTokens[mostRecent.id]?.max ?? 0,
        })
      }
    } catch { /* no sessions or network error */ }
  },

  setPreviewFile: (filePath, fileName, content) => {
    set({ preview: { mode: 'file', filePath, fileName, fileContent: content, diffLines: null } })
  },

  setPreviewDiff: (filePath, fileName, lines) => {
    set({ preview: { mode: 'diff', filePath, fileName, fileContent: null, diffLines: lines } })
  },

  clearPreview: () => {
    set({ preview: { mode: null, filePath: null, fileName: null, fileContent: null, diffLines: null } })
  },

  setLastEditedFile: (filePath) => {
    set({ lastEditedFile: filePath })
  },

  setRevealFilePath: (filePath: string | null) => {
    set({ revealFilePath: filePath })
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
      console.error('[monika] loadBranches failed:', e);
      set({ allBranches: [] });
      throw e;
    }
  },

  loadProviders: async () => {
    let providers: ProviderInfo[] = [];
    let defaults: { provider?: string; model?: string } | null = null;
    try {
      [providers, defaults] = await Promise.all([
        App.GetProviders(),
        Call.ByName('monika/internal/api.App.GetDefaultModel'),
      ]);
    } catch {
      // Keep providers empty on failure — don't overwrite existing availableProviders
      return
    }
    const state = get();
    const persistedProvider = defaults?.provider || '';
    const persistedModel = defaults?.model || '';
    const validProvider = persistedProvider && providers.some((p) => p.id === persistedProvider)
      ? persistedProvider
      : state.selectedProvider && providers.some((p) => p.id === state.selectedProvider)
        ? state.selectedProvider
        : (providers.length > 0 ? providers[0].id : '');
    set({
      availableProviders: providers,
      selectedProvider: validProvider,
      ...(persistedModel ? { selectedModel: persistedModel } : {}),
    });
    if (providers.length > 0) {
      await get().loadModelsForProvider(validProvider);
    }
  },

  setSelectedProvider: async (providerId: string) => {
    set({ selectedProvider: providerId });
    await get().loadModelsForProvider(providerId);
  },

  loadModelsForProvider: async (providerId: string) => {
    // Prefer providerDetails (has full config), fall back to availableProviders.
    const state = get()
    const pd = state.providerDetails.find((p) => p.id === providerId)
    const ap = state.availableProviders.find((p) => p.id === providerId)
    const rawModels = pd?.models || ap?.models
    const configModels = (rawModels || []).map((m: any) => ({
      ID: m.id || m.ID || '',
      DisplayName: m.name || m.DisplayName || m.display_name || '',
      ContextLimit: m.context_limit ?? m.ContextLimit ?? 0,
      OutputLimit: m.output_limit ?? m.OutputLimit ?? 0,
      Enabled: m.enabled ?? m.Enabled ?? false,
    }))
    const update: Partial<AppState> = {
      modelsByProvider: { ...state.modelsByProvider, [providerId]: configModels as any },
    }
    if (providerId === state.selectedProvider) {
      const valid = state.selectedModel && configModels.some((m: any) => m.ID === state.selectedModel)
      update.selectedModel = valid ? state.selectedModel : (configModels.length > 0 ? configModels[0].ID : '')
    }
    set(update)
  },

  setChangeStats: (st) => set((s) => ({ changeStats: { ...s.changeStats, ...st } })),

  respondPermission: async (resp) => {
    await Call.ByName('monika/internal/api.App.RespondPermission', resp)
    set({ pendingPermission: null })
  },

  respondAskUser: async (resp) => {
    set({ pendingAskUser: null })
    await Call.ByName('monika/internal/api.App.RespondAskUser', resp)
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

  loadAgents: async () => {
    try {
      const agents = await Call.ByName('monika/internal/api.App.ListAgents')
      set({ agents: agents || [] })
    } catch { set({ agents: [] }) }
  },

  saveAgent: async (agent) => {
    await Call.ByName('monika/internal/api.App.SaveAgent', agent)
    await get().loadAgents()
  },

  deleteAgent: async (name) => {
    await Call.ByName('monika/internal/api.App.DeleteAgent', { name })
    await get().loadAgents()
  },

  loadSkills: async () => {
    try {
      const skills = await Call.ByName('monika/internal/api.App.ListSkills')
      set({ skills: skills || [] })
    } catch { set({ skills: [] }) }
  },

  addSkillPath: async (path) => {
    await Call.ByName('monika/internal/api.App.AddSkillPath', { path })
    await get().loadSkills()
  },

  removeSkillPath: async (path) => {
    await Call.ByName('monika/internal/api.App.RemoveSkillPath', { path })
    await get().loadSkills()
  },

  loadSkillContent: async (name: string) => {
    return await Call.ByName('monika/internal/api.App.GetSkillContent', { name })
  },

  installSkillFromURL: async (url: string, scope: 'project' | 'global') => {
    const names = await Call.ByName('monika/internal/api.App.InstallSkillFromURL', { url, scope })
    await get().loadSkills()
    return names || []
  },

  installSkillFromZip: async (data: string, scope: 'project' | 'global') => {
    const names = await Call.ByName('monika/internal/api.App.InstallSkillFromZip', { data, scope })
    await get().loadSkills()
    return names || []
  },

  uninstallSkill: async (name: string) => {
    await Call.ByName('monika/internal/api.App.UninstallSkill', { name })
    await get().loadSkills()
  },

  openInFileManager: async (path: string) => {
    await Call.ByName('monika/internal/api.App.OpenInFileManager', { path })
  },

  setSkillEnabled: async (name: string) => {
    await Call.ByName('monika/internal/api.App.ToggleSkillEnabled', { name })
    await get().loadSkills()
  },

  loadMCPServers: async () => {
    try {
      const servers = await Call.ByName('monika/internal/api.App.ListMCPServers')
      set({ mcpServers: servers || [] })
    } catch { set({ mcpServers: [] }) }
  },

  saveMCPServer: async (srv) => {
    await Call.ByName('monika/internal/api.App.SaveMCPServer', srv)
    await get().loadMCPServers()
  },

  deleteMCPServer: async (id) => {
    await Call.ByName('monika/internal/api.App.DeleteMCPServer', { id })
    await get().loadMCPServers()
  },

  importMCPServers: async (json) => {
    const ids = await Call.ByName('monika/internal/api.App.ImportMCPServers', json)
    await get().loadMCPServers()
    return ids || []
  },

  testMCPServer: async (id) => {
    const tools = await Call.ByName('monika/internal/api.App.TestMCPServer', { id })
    await get().loadMCPServers()
    return tools || []
  },

  testMCPServerConfig: async (config) => {
    const tools = await Call.ByName('monika/internal/api.App.TestMCPServerConfig', config)
    return tools || []
  },

  reconnectMCPServer: async (id) => {
    const tools = await Call.ByName('monika/internal/api.App.ReconnectMCPServer', { id })
    await get().loadMCPServers()
    return tools || []
  },

  loadProviderDetails: async () => {
    try {
      const [providers, defaults] = await Promise.all([
        Call.ByName('monika/internal/api.App.GetProviders'),
        Call.ByName('monika/internal/api.App.GetDefaultModel'),
      ])
      set({
        providerDetails: providers || [],
        ...(defaults ? { selectedProvider: defaults.provider || '', selectedModel: defaults.model || '' } : {}),
      })
    } catch { set({ providerDetails: [] }) }
    // Refresh availableProviders and modelsByProvider so ModelPicker picks up changes
    await get().loadProviders()
  },

  loadAvailableProviders: async () => {
    // Return cached data if already loaded
    if (get().availableProvidersCatalog.length > 0) {
      return get().availableProvidersCatalog
    }
    try {
      const providers = await Call.ByName('monika/internal/api.App.GetAvailableProviders') as AvailableProviderInfo[]
      set({ availableProvidersCatalog: providers || [] })
      return providers || []
    } catch {
      set({ availableProvidersCatalog: [] })
      return []
    }
  },

  saveProviderDetail: async (cfg) => {
    await Call.ByName('monika/internal/api.App.SaveProvider', cfg)
    await get().loadProviderDetails()
  },

  deleteProviderDetail: async (id) => {
    await Call.ByName('monika/internal/api.App.DeleteProvider', { id })
    await get().loadProviderDetails()
  },

  resetProjectState: () => {
    set({
      messages: [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika. Type /help for commands.' }],
      generatingSessionIds: [],
      sessionStatuses: {},
      sessionErrors: {},
      sessionTokens: {},
      tokenCount: 0,
      tokenMax: 0,
      activeSessionId: '',
      sessionParents: {},
      subagentStack: {},
      preview: { mode: null, filePath: null, fileName: null, fileContent: null, diffLines: null },
      lastEditedFile: null,
      lastEditedOldContent: null,
      lastEditVersion: 0,
      openSessions: [],
      sessionMessages: {},
      tasks: {},
      changeStats: { stats: [], loading: false, error: '' },
      allBranches: [],
      recentProjects: [],
      availableProviders: [],
      selectedProvider: '',
      modelsByProvider: {},
      selectedModel: '',
      pendingPermission: null,
      pendingAskUser: null,
      permissionMode: 'auto',
      permissionRules: [],
      agents: [],
      skills: [],
      skillPaths: [],
      mcpServers: [],
      providerDetails: [],

      settingsOpen: false,
      fileTreeVersion: 0,
      sessionListVersion: 0,
      selectedMessageIds: [],
      multiSelectMode: null,
    });
  },

}))

export function syncActiveMessages(sid: string) {
  const s = useStore.getState()
  if (sid === s.activeSessionId) {
    useStore.setState({ messages: [...(s.sessionMessages[sid] || [])] })
  }
}

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
            tools.push({ id: tc.id, name: tc.function.name, input: tc.function.arguments, output, status })
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

  // Batch text_delta and thinking events per session to reduce re-renders.
  // Use arrays to avoid repeated string concatenation; join on flush.
  const textBatch: Record<string, { textParts: string[]; thinkingParts: string[]; model?: string }> = {}
  let rafScheduled = false

  // Sequenced event queue: Wails EventProcessor.Emit dispatches via go func(),
  // so high-frequency events may arrive out of order. We buffer by seq and
  // process in order to prevent text interleaving.
  let nextSeq = 1
  const pendingEvents: (StreamEvent & { seq?: number })[] = []
  let drainScheduled = false
  let stalledSince = 0

  function drainPendingEvents() {
    drainScheduled = false
    if (pendingEvents.length === 0) return
    pendingEvents.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    while (pendingEvents.length > 0) {
      const front = pendingEvents[0]
      const seq = front.seq ?? 0
      if (seq === 0 || seq === nextSeq) {
        pendingEvents.shift()
        nextSeq = seq > 0 ? seq + 1 : nextSeq
        stalledSince = 0
        processEvent(front)
      } else if (seq < nextSeq) {
        pendingEvents.shift()
      } else {
        if (!stalledSince) stalledSince = Date.now()
        if (Date.now() - stalledSince > 2000) {
          console.warn('[monika] seq stall: skipping from', nextSeq, 'to', seq)
          nextSeq = seq
          stalledSince = 0
          continue
        }
        break
      }
    }
    if (pendingEvents.length > 500) {
      console.warn('[monika] event queue overflow, dropping', pendingEvents.length - 200, 'stale events')
      const kept = pendingEvents.slice(-200)
      pendingEvents.length = 0
      pendingEvents.push(...kept)
      stalledSince = 0
    }
    if (pendingEvents.length > 0 && !drainScheduled) {
      drainScheduled = true
      setTimeout(drainPendingEvents, 0)
    }
  }

  function processEvent(data: StreamEvent & { seq?: number }) {
    const sid = data.session_id!
    const store = useStore.getState()

    switch (data.type) {
      case 'text_delta':
        if (!textBatch[sid]) textBatch[sid] = { textParts: [], thinkingParts: [] }
        textBatch[sid].textParts.push(data.content || '')
        if (data.model) textBatch[sid].model = data.model
        if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(flushTextBatch) }
        break

      case 'thinking':
        if (!textBatch[sid]) textBatch[sid] = { textParts: [], thinkingParts: [] }
        textBatch[sid].thinkingParts.push(data.content || '')
        if (data.model) textBatch[sid].model = data.model
        if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(flushTextBatch) }
        break

      case 'tool_start':
        if (textBatch[sid]?.textParts?.length || textBatch[sid]?.thinkingParts?.length) flushTextBatch()
        if (data.tool) {
          store.addSessionToolStart(sid, { id: data.tool.id, name: data.tool.name, input: data.tool.input || '', status: 'running' })
          if (sid === store.activeSessionId || (!store.activeSessionId && sid === 'chat')) {
            store.addToolStart({ id: data.tool.id, name: data.tool.name, input: data.tool.input || '', status: 'running' })
            if ((data.tool.name === 'file_edit' || data.tool.name === 'file_write') && data.tool.input) {
              try {
                const parsed = JSON.parse(data.tool.input)
                if (parsed.filePath && store.projectPath) {
                  App.ReadFile(store.projectPath, parsed.filePath).then((fc) => {
                    if (fc && fc.content !== undefined) {
                      useStore.setState({ lastEditedOldContent: fc.content })
                    }
                  }).catch(() => {})
                }
              } catch {}
            }
          }
        }
        break

      case 'tool_output':
        if (textBatch[sid]?.textParts?.length || textBatch[sid]?.thinkingParts?.length) flushTextBatch()
        if (data.tool) {
          store.updateSessionToolDone(sid, data.tool.id, data.tool.output || '', data.tool.status === 'error' ? 'error' : 'done')
          if (data.tool.input) {
            store.updateSessionToolInput(sid, data.tool.id, data.tool.input)
          }
          if (sid === store.activeSessionId || (!store.activeSessionId && sid === 'chat')) {
            store.updateToolDone(data.tool.id, data.tool.output || '', data.tool.status === 'error' ? 'error' : 'done')
            if (data.tool.input) {
              store.updateToolInput(data.tool.id, data.tool.input)
            }
            // Use backend-computed diff if available
            if (data.tool.diffLines && data.tool.diffLines.length > 0 && data.tool.input) {
              try {
                const parsed = JSON.parse(data.tool.input)
                if (parsed.filePath) {
                  const name = parsed.filePath.split('/').pop() || parsed.filePath.split('\\').pop() || parsed.filePath
                  useStore.getState().setPreviewDiff(parsed.filePath, name, data.tool.diffLines)
                }
              } catch {}
            }
          }
        }
        break

      case 'tool_done':
        if (textBatch[sid]?.textParts?.length || textBatch[sid]?.thinkingParts?.length) flushTextBatch()
        if (data.tool) {
          store.addSessionToolStart(sid, { id: data.tool.id, name: data.tool.name, input: data.tool.input || '', status: 'running' })
          if (sid === store.activeSessionId || (!store.activeSessionId && sid === 'chat')) {
            store.addToolStart({ id: data.tool.id, name: data.tool.name, input: data.tool.input || '', status: 'running' })
          }
          // Refresh file tree and changes when a file-modifying tool finishes
          if (data.tool.name === 'file_write' || data.tool.name === 'file_edit' || data.tool.name === 'bash') {
            store.bumpFileTreeVersion()
          }
        }
        break

      case 'usage':
        if (data.usage) {
          store.addTokens(sid, data.usage.total_tokens || 0, data.usage.max_context)
        }
        break

      case 'error':
        if (data.content === 'cancelled') {
          store.removeGeneratingSession(sid)
          store.setSessionStatus(sid, 'pending')
          store.setSessionError(sid, '')
          store.bumpSessionListVersion()
          break
        }
        store.addSessionError(sid, data.content || 'Unknown error')
        if (sid === store.activeSessionId) {
          store.addMessage({ id: crypto.randomUUID(), role: 'error', content: data.content || 'Unknown error' })
        }
        store.removeGeneratingSession(sid)
        store.setSessionStatus(sid, 'pending')
        store.setSessionError(sid, data.content || 'Unknown error')
        store.bumpSessionListVersion()
        syncActiveMessages(sid)
        break

      case 'file_changed':
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
        const latestMsgs = useStore.getState().sessionMessages[sid] || []
        for (let i = latestMsgs.length - 1; i >= 0; i--) {
          if (latestMsgs[i].role === 'compaction' && !latestMsgs[i].content) {
            useStore.getState().fillCompactionCard(sid, { summary: 'Compaction completed', beforeTokens: 0, afterTokens: 0, compactionNum: 0 })
            break
          }
        }
        store.setSessionStatus(sid, 'pending')
        store.bumpFileTreeVersion()
        store.bumpSessionListVersion()
        syncActiveMessages(sid)
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

      case 'compaction':
        if (data.compaction) {
          const c = data.compaction
          if (c.after_tokens) {
            store.addTokens(sid, c.after_tokens, undefined)
          }
          // Auto-compaction: no empty card was pre-created (unlike manual /compact).
          // Create one now so fillCompactionCard can find and fill it.
          {
            const msgs = store.sessionMessages[sid] || []
            const hasPendingCard = msgs.some((m: any) => m.role === 'compaction' && !m.content)
            if (!hasPendingCard) {
              store.appendToSession(sid, [{ id: crypto.randomUUID(), role: 'compaction', content: '' }])
            }
          }
          store.fillCompactionCard(sid, {
            summary: c.summary || '',
            beforeTokens: c.before_tokens,
            afterTokens: c.after_tokens,
            compactionNum: c.compaction_num,
          })
        }
        break
    }
  }

  function flushTextBatch() {
    rafScheduled = false
    const store = useStore.getState()
    for (const [sid, batch] of Object.entries(textBatch)) {
      if (batch.textParts.length) store.updateSessionMessage(sid, batch.textParts.join(''))
      if (batch.thinkingParts.length) store.updateSessionThinking(sid, batch.thinkingParts.join(''))
      if (batch.model) store.setLastAssistantMeta(sid, { model: batch.model })
    }
    for (const k of Object.keys(textBatch)) delete textBatch[k]
  }

  Events.On('stream', (ev) => {
    let store = useStore.getState()
    const data = ev.data as StreamEvent & { seq?: number }
    const sid = data.session_id

    // Auto-create entry for child session so streaming events are buffered
    if (sid && (sid.startsWith('call_') || sid.startsWith('sub_') || data.type === 'compaction') && !store.sessionMessages[sid]) {
      useStore.setState({ sessionMessages: { ...store.sessionMessages, [sid]: [] } })
      store = useStore.getState()
    }

    // Handle permission_required events — they carry a session_id but may
    // arrive before the session tab is opened in the frontend.
    const permPayload = (data as any).permission as PermissionRequiredEvent | undefined
    if (data.type === 'permission_required' && permPayload) {
      useStore.setState({ pendingPermission: permPayload })
      if (data.seq && data.seq >= nextSeq) nextSeq = data.seq + 1
      return
    }

    const askPayload = (data as any).ask_user as AskUserEvent | undefined
    if (data.type === 'ask_user' && askPayload) {
      useStore.setState({ pendingAskUser: askPayload })
      // Advance past this seq so subsequent events aren't blocked
      if (data.seq && data.seq >= nextSeq) nextSeq = data.seq + 1
      return
    }

    // Drop events with no session_id or session that was explicitly closed
    // Skip past their seq so the sequencer doesn't jam on the gap.
    if (!sid || !store.sessionMessages[sid]) {
      console.warn('[monika] stream event dropped:', data.type, 'sid=', sid, 'known=', Object.keys(store.sessionMessages))
      if (data.seq && data.seq >= nextSeq) nextSeq = data.seq + 1
      return
    }

    // Route through sequenced queue to prevent out-of-order rendering
    if (data.seq && data.seq > 0) {
      pendingEvents.push(data)
      if (pendingEvents.length === 1) {
        drainPendingEvents()
      } else if (!drainScheduled) {
        drainScheduled = true
        setTimeout(drainPendingEvents, 0)
      }
    } else {
      processEvent(data)
    }
  })

  Events.On('branch-changed', (ev) => {
    useStore.getState().setBranch(ev.data as string)
  })
}

export async function initProject() {
  try {
    const info = await App.GetCurrentProject()
    if (info) {
      useStore.getState().setProjectPath(info.path)
      useStore.getState().setBranch(info.branch)
      useStore.getState().loadProviders()
    }
  } catch (err) {
    console.error('[monika] initProject failed:', err)
  }
}
