
import { create } from 'zustand'
import { useNotificationStore, setMainWindowVisible } from './notificationStore'
import { Events, Call } from '@wailsio/runtime'
import { App, StreamEvent } from '../../bindings/monika'
import type { RecentProject, BranchInfo, ModelInfo, ProviderInfo, ChangeStat, SessionInfo, CommitInfo, CommitDetail } from '../../bindings/monika'
import type { DockviewApi } from 'dockview'
import { lspService, LspDiagnostic, LspSymbol } from '../lib/lspService'
import { stripTransientBlocks } from '../lib/stripTransientBlocks'

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

interface BgTaskInfo {
    id: string
    command: string
    work_dir: string
    pid: number
    status: 'running' | 'stopped' | 'exited'
    exit_code: number
    started_at: string
}

export interface AvailableProviderInfo {
    id: string
    display_name: string
    npm: string
    base_url: string
    env?: string[]
    models: AvailableModelInfo[]
}

export interface AvailableModelInfo {
    id: string
    name: string
    context_limit: number
    output_limit: number
}

export interface CopilotLoginInfo {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
}

export interface CopilotTokenResult {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    status: 'success' | 'pending' | 'error'
    error?: string
}

export interface ProxyConfig {
    enabled: boolean
    url: string
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

interface QueuedMessage {
    id: string
    text: string
    provider_id: string
    model: string
    status: string
    error?: string
    created_at: number
}

interface SessionTabInfo {
    id: string
    title: string
}

interface PreviewState {
    mode: 'file' | 'diff' | 'task' | 'commit' | 'media' | null
    filePath: string | null
    fileName: string | null
    fileContent: string | null
    diffLines: string[] | null
    conflictAiContent?: string | null
    conflictActive?: boolean
    commitDetail?: CommitDetail | null
    commitFiles?: ChangeStat[] | null
    commitHash?: string | null
    mediaMime?: string | null
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
    scope?: 'project' | 'global'
}

export interface LSPServerStatus {
    name: string
    command: string
    fileTypes: string[]
    running: boolean
}

export interface FormatterEntry {
    command: string
    args?: string[]
    ref?: string  // "lsp" shorthand
}

export type SettingsScope = 'global' | 'project'

export interface ProviderFull {
    id: string
    display_name: string
    name?: string
    base_url: string
    api_key: string
    wire_api: string
    models: { id: string; name: string; context_limit?: number; output_limit?: number; enabled?: boolean }[]
    refresh_token?: string
    token_expires_at?: number
}

interface AppState {
    messages: Message[]
    generatingSessionIds: string[]
    shellExecutingSessionIds: string[]
    sessionStatuses: Record<string, string>
    sessionErrors: Record<string, string>
    retryInfo: { attempt: number; max: number; message: string } | null
    sessionTokens: Record<string, { count: number; max: number }>
    tokenCount: number
    tokenMax: number
    projectPath: string
    branch: string
    activeSessionId: string
    sessionParents: Record<string, string>
    subagentStack: Record<string, string[]>
    preview: PreviewState
    dirtyFiles: Set<string>
    fileTreeActiveTab: 'files' | 'tasks' | 'debug'
    // Per-tool-call progress messages emitted by streaming tools via
    // EventToolProgress. Keyed by tool call id so MediaToolBlock can
    // read the latest line for a specific tool card.
    toolProgress: Record<string, string>

    fileTreeVersion: number
    sessionListVersion: number
    dockviewApi: DockviewApi | null

    openSessions: SessionTabInfo[]
    sessionMessages: Record<string, Message[]>
    displayCounts: Record<string, number>
    tasks: Record<string, TaskItem[]>
    todoCollapsed: Record<string, boolean>
    changeStats: { stats: ChangeStat[]; loading: boolean; error: string }
    commitHistory: { commits: CommitInfo[]; loading: boolean; error: string }
    feedback: { message: string; type: 'info' | 'error' | 'success' }
    recentProjects: RecentProject[]
    allBranches: BranchInfo[]
    availableProviders: ProviderInfo[]
    selectedProvider: string
    modelsByProvider: Record<string, ModelInfo[]>
    selectedModel: string
    favoriteModels: string[]
    sessionBindings: Record<string, { provider: string; model: string }>
    defaultProvider: string
    defaultModel: string
    pendingPermission: PermissionRequiredEvent | null
    pendingAskUser: AskUserEvent | null
    permissionMode: 'auto' | 'manual'
    inputModes: Record<string, 'normal' | 'shell'>
    permissionRules: { tool: string; pattern: string; decision: string; source: string; createdAt: string }[]
    agents: AgentInfo[]
    skills: SkillInfo[]
    skillPaths: string[]
    mcpServers: MCPServerInfo[]
    lspServers: LSPServerStatus[]
    lspReady: Record<string, boolean>
    lspDiagnostics: Record<string, LspDiagnostic[]>
    lspSymbols: Record<string, LspSymbol[]>
    previewNeedsRefresh: string | null
    providerDetails: ProviderFull[]
    availableProvidersCatalog: AvailableProviderInfo[]
    settingsOpen: boolean
    settingsScope: SettingsScope
    lspConfigServers: Record<string, { command: string; args: string[]; fileTypes: string[]; rootMarkers?: string[]; initOptions?: Record<string, any>; settings?: Record<string, any>; disabled?: boolean }>
    formatterConfig: Record<string, FormatterEntry>
    msgFilter: 'all' | 'chat' | 'user' | 'assistant'
    chatInputAppendPath: string | null
    selection: { mode: 'quote' | 'forward'; ids: string[] } | null

    // Worktree binding: sessionId → worktreePath
    sessionWorktrees: Record<string, string>
    bgTasks: BgTaskInfo[]
    selectedBgTaskId: string | null
    bgTaskLineCounts: Record<string, number>
    bgTaskLogCache: Record<string, { offset: number; lines: string[] }>
    bgTaskDisplayCount: Record<string, number>

    sessionQueues: Record<string, QueuedMessage[]>
    queuePaused: Record<string, boolean>

    addMessage: (msg: Message) => void
    setPermissionMode: (mode: 'auto' | 'manual') => void
    setInputMode: (sessionId: string, mode: 'normal' | 'shell') => void
    setMsgFilter: (filter: 'all' | 'chat' | 'user' | 'assistant') => void
    toggleSettings: () => void
    appendToSession: (sessionId: string, msgs: Message[]) => void
    addToolStart: (tool: ToolCall) => void
    updateToolDone: (toolId: string, output: string, status: 'done' | 'error') => void
    updateToolInput: (toolId: string, input: string) => void
    setToolProgress: (toolId: string, message: string) => void
    updateSessionMessage: (id: string, delta: string) => void
    updateSessionThinking: (id: string, delta: string) => void
    addSessionToolStart: (id: string, tool: ToolCall) => void
    addSessionError: (id: string, content: string) => void
    updateSessionToolDone: (id: string, toolId: string, output: string, status: 'done' | 'error') => void
    updateSessionToolInput: (id: string, toolId: string, input: string) => void
    addGeneratingSession: (sessionId: string) => void
    removeGeneratingSession: (sessionId: string) => void
    addShellExecutingSession: (sessionId: string) => void
    removeShellExecutingSession: (sessionId: string) => void
    setSessionStatus: (sessionId: string, status: string) => void
    setSessionError: (sessionId: string, error: string) => void
    setLastAssistantMeta: (sessionId: string, meta: { model?: string; duration?: number }) => void
    addTokens: (sid: string, tokens: number, max?: number) => void
    fillCompactionCard: (sid: string, card: { summary: string; beforeTokens: number; afterTokens: number; compactionNum: number }) => void
    clearMessages: () => void
    setMessages: (msgs: Message[]) => void
    setProjectPath: (path: string) => void
    setBranch: (branch: string) => void
    setActiveSessionId: (id: string) => void
    memoryStatus: string | null
    setMemoryStatus: (status: string | null) => void
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
    loadMoreMessages: (sessionId: string, count?: number) => void
    restoreSessionTabs: (tabs: { id: string; title: string }[]) => Promise<void>
    loadSessionList: () => Promise<void>

    setPreviewFile: (filePath: string, fileName: string, content: string) => void
    setPreviewDiff: (filePath: string, fileName: string, lines: string[]) => void
    setPreviewMedia: (filePath: string, fileName: string, mime: string) => void
    clearPreview: () => void
    markFileDirty: (path: string) => void
    markFileClean: (path: string) => void
    setPreview: (preview: Partial<PreviewState>) => void
    handleToolConflict: (toolEvent: { filePath: string; name: string; diffLines: string[]; diskContent: string; aiContent: string }) => void

    setRevealFilePath: (filePath: string | null) => void
    setFileTreeActiveTab: (tab: 'files' | 'tasks' | 'debug') => void
    revealFilePath: string | null

    loadRecentProjects: () => Promise<void>
    loadBranches: () => Promise<void>
    loadProviders: () => Promise<void>
    applySessionBinding: (id: string, provider?: string, model?: string) => void
    setActiveSessionModel: (providerId: string, modelId: string) => Promise<void>
    toggleFavoriteModel: (providerId: string, modelId: string) => void
    setDefaultModelGlobal: (providerId: string, modelId: string) => Promise<void>
    loadModelsForProvider: (providerId: string) => Promise<void>
    setChangeStats: (st: Partial<{ stats: ChangeStat[]; loading: boolean; error: string }>) => void
    loadCommitHistory: (path?: string) => void
    loadChangeStats: () => Promise<void>
    stageFiles: (paths: string[]) => Promise<void>
    unstageFiles: (paths: string[]) => Promise<void>
    commitChanges: (message: string, push: boolean) => Promise<void>
    gitFetch: (path: string) => Promise<void>
    gitPull: (path: string) => Promise<void>
    setPreviewCommit: (hash: string) => Promise<void>
    setCommitFileDiff: (filePath: string) => Promise<void>
    clearFeedback: () => void
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
    loadLSPStatus: () => Promise<void>
    openLspFile: (projectPath: string, filePath: string) => void
    closeLspFile: (projectPath: string, filePath: string) => void
    setLspDiagnostics: (filePath: string, diags: LspDiagnostic[]) => void
    setLspSymbols: (filePath: string, syms: LspSymbol[]) => void
    saveMCPServer: (srv: MCPServerInfo) => Promise<void>
    deleteMCPServer: (id: string, scope?: 'project' | 'global') => Promise<void>
    importMCPServers: (json: string) => Promise<string[]>
    testMCPServer: (id: string) => Promise<string[]>
    testMCPServerConfig: (config: { type: string; command: string; args: string[]; env: Record<string, string>; url: string; headers: Record<string, string> }) => Promise<string[]>
    reconnectMCPServer: (id: string) => Promise<string[]>
    loadProviderDetails: () => Promise<void>
    loadAvailableProviders: () => Promise<AvailableProviderInfo[]>
    saveProviderDetail: (cfg: ProviderFull) => Promise<void>
    loadProxyConfig: () => Promise<ProxyConfig>
    saveProxyConfig: (cfg: ProxyConfig) => Promise<void>
    startCopilotLogin: () => Promise<CopilotLoginInfo>
    pollCopilotLogin: (deviceCode: string) => Promise<CopilotTokenResult>
    deleteProviderDetail: (id: string) => Promise<void>
    resetProjectState: () => void
    setSettingsScope: (scope: SettingsScope) => void
    loadLSPConfig: (scope: SettingsScope) => Promise<void>
    saveLSPConfig: (scope: SettingsScope, servers: Record<string, any>) => Promise<void>
    loadFormatterConfig: (scope: SettingsScope) => Promise<void>
    saveFormatterConfig: (scope: SettingsScope, formatters: Record<string, FormatterEntry>) => Promise<void>
    appendPathToInput: (path: string) => void
    toggleMessageSelection: (id: string) => void
    enterMultiSelect: (mode: 'quote' | 'forward', initialId: string) => void
    clearSelection: () => void

    // Worktree binding actions
    setSessionWorktree: (sessionId: string, path: string) => void

    selectBgTask: (id: string | null) => void
    updateBgTask: (info: BgTaskInfo) => void
    updateBgTaskLineCount: (taskId: string, count: number) => void
    setBgTaskLogCache: (taskId: string, offset: number, lines: string[]) => void
    loadBgTaskLogs: (taskId: string, offset: number, limit: number) => Promise<void>
    loadMoreBgTaskLines: (taskId: string) => void
    stopBgTask: (taskId: string) => Promise<void>
    startBgTask: (command: string) => Promise<void>

    setQueue: (sessionId: string, items: QueuedMessage[]) => void
    updateQueueItem: (sessionId: string, itemId: string, changes: Partial<QueuedMessage>) => void
    removeQueueItem: (sessionId: string, itemId: string) => void
    reorderQueue: (sessionId: string, itemIds: string[]) => void
    toggleQueuePause: (sessionId: string, paused: boolean) => void
}

function loadFavoriteModels(): string[] {
    try {
        const raw = localStorage.getItem('monika:favorite_models')
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return [...new Set(parsed.filter((item: unknown): item is string => typeof item === 'string'))]
    } catch {
        return []
    }
}

const INITIAL_DISPLAY_COUNT = 15
const LOAD_MORE_COUNT = 20
const BG_LOG_INITIAL_DISPLAY = 50
const BG_LOG_LOAD_MORE = 50
const BG_LOG_FETCH_BATCH = 200

export const useStore = create<AppState>((set, get) => ({
    messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika. Type /help for commands.' }],
    generatingSessionIds: [],
    shellExecutingSessionIds: [],
    sessionStatuses: {},
    sessionErrors: {},
    retryInfo: null,
    sessionTokens: {},
    tokenCount: 0,
    tokenMax: 0,
    toolProgress: {},
    projectPath: '',
    branch: '',
    activeSessionId: '',
    memoryStatus: null,
    sessionParents: {},
    subagentStack: {},
    preview: { mode: null, filePath: null, fileName: null, fileContent: null, diffLines: null, conflictAiContent: null, conflictActive: false, commitDetail: null, commitFiles: null, commitHash: null },
    dirtyFiles: new Set<string>(),

    fileTreeActiveTab: 'files' as 'files' | 'tasks' | 'debug',

    revealFilePath: null,

    fileTreeVersion: 0,
    sessionListVersion: 0,
    dockviewApi: null as DockviewApi | null,

    openSessions: [],
    sessionMessages: {},
    displayCounts: {},
    tasks: {},
    todoCollapsed: {},
    changeStats: { stats: [], loading: false, error: '' },
    commitHistory: { commits: [], loading: false, error: '' },
    feedback: { message: '', type: 'info' },
    recentProjects: [],
    allBranches: [],
    availableProviders: [],
    selectedProvider: '',
    modelsByProvider: {},
    selectedModel: '',
    favoriteModels: loadFavoriteModels(),
    sessionBindings: {} as Record<string, { provider: string; model: string }>,
    defaultProvider: '',
    defaultModel: '',
    pendingPermission: null as PermissionRequiredEvent | null,
    pendingAskUser: null as AskUserEvent | null,
    permissionMode: 'auto',
    inputModes: {},
    permissionRules: [],
    agents: [],
    skills: [],
    skillPaths: [],
    mcpServers: [],
    lspServers: [] as LSPServerStatus[],
    lspReady: {},
    lspDiagnostics: {},
    lspSymbols: {},
    previewNeedsRefresh: null as string | null,
    providerDetails: [],
    availableProvidersCatalog: [] as AvailableProviderInfo[],
    settingsOpen: false,
    settingsScope: 'global' as SettingsScope,
    lspConfigServers: {} as Record<string, any>,
    formatterConfig: {} as Record<string, FormatterEntry>,
    msgFilter: 'all' as const,
    chatInputAppendPath: null as string | null,
    selection: null as { mode: 'quote' | 'forward'; ids: string[] } | null,

    sessionWorktrees: {} as Record<string, string>,

    bgTasks: [] as BgTaskInfo[],
    selectedBgTaskId: null as string | null,
    bgTaskLineCounts: {} as Record<string, number>,
    bgTaskLogCache: {} as Record<string, { offset: number; lines: string[] }>,
    bgTaskDisplayCount: {} as Record<string, number>,

    sessionQueues: {},
    queuePaused: {},

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
            for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === 'assistant' && msgs[i].tools) {
                    msgs[i] = {
                        ...msgs[i],
                        tools: msgs[i].tools!.map((t) =>
                            t.id === toolId && t.status === 'running' ? { ...t, output, status } : t
                        ),
                    }
                    break
                }
            }
            return { messages: msgs }
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

    setToolProgress: (toolId, message) =>
        set((s) => ({ toolProgress: { ...s.toolProgress, [toolId]: message } })),

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
    addShellExecutingSession: (sessionId) => set((s) => ({
        shellExecutingSessionIds: s.shellExecutingSessionIds.includes(sessionId)
            ? s.shellExecutingSessionIds
            : [...s.shellExecutingSessionIds, sessionId],
    })),
    removeShellExecutingSession: (sessionId) => set((s) => ({
        shellExecutingSessionIds: s.shellExecutingSessionIds.filter((id) => id !== sessionId),
    })),
    setSessionStatus: (sessionId, status) =>
        set((s) => ({ sessionStatuses: { ...s.sessionStatuses, [sessionId]: status } })),
    setSessionError: (sessionId, error) =>
        set((s) => ({ sessionErrors: { ...s.sessionErrors, [sessionId]: error } })),
    applySessionBinding: (id, provider, model) => {
        if (!provider || !model) return
        set((s) => {
            const bindings = { ...s.sessionBindings, [id]: { provider, model } }
            if (id !== s.activeSessionId) {
                return { sessionBindings: bindings }
            }
            const models = s.modelsByProvider[provider] || []
            const m = models.find((mm) => mm.ID === model) as (ModelInfo & { ContextLimit?: number }) | undefined
            const newMax = m?.ContextLimit ?? 0
            const current = s.sessionTokens[id]
            return {
                sessionBindings: bindings,
                selectedProvider: provider,
                selectedModel: model,
                ...(newMax > 0
                    ? {
                        tokenMax: newMax,
                        sessionTokens: { ...s.sessionTokens, [id]: { count: current?.count ?? 0, max: newMax } },
                    }
                    : {}),
            }
        })
    },
    setActiveSessionModel: async (providerId, modelId) => {
        const sid = get().activeSessionId
        if (!sid) return
        if (providerId !== get().selectedProvider) {
            await get().loadModelsForProvider(providerId)
        }
        get().applySessionBinding(sid, providerId, modelId)
        const project = get().projectPath
        if (project) {
            Call.ByName('monika/internal/api.App.SetSessionModel', project, sid, providerId, modelId).catch((e: unknown) => {
                console.error('[monika] SetSessionModel failed:', e)
            })
        }
    },

    toggleFavoriteModel: (providerId, modelId) => {
        const key = `${providerId}:${modelId}`.toLowerCase()
        set((s) => {
            const filtered = s.favoriteModels.filter((k) => k.toLowerCase() !== key)
            const existed = filtered.length < s.favoriteModels.length
            const next = existed ? filtered : [...filtered, key]
            const deduped = [...new Set(next)]
            try {
                localStorage.setItem('monika:favorite_models', JSON.stringify(deduped))
            } catch { /* ignore quota or disabled */ }
            return { favoriteModels: deduped }
        })
    },

    setDefaultModelGlobal: async (providerId, modelId) => {
        set({ defaultProvider: providerId, defaultModel: modelId })
        try {
            await Call.ByName('monika/internal/api.App.SetDefaultModel', providerId, modelId)
        } catch (e) {
            console.error('[monika] SetDefaultModel failed:', e)
        }
    },
    setPermissionMode: (mode) => {
        set({ permissionMode: mode })
        // Notify backend to update pipeline mode
        Call.ByName('monika/internal/api.App.SetPermissionMode', { mode }).catch(() => {
            // RPC may not be registered yet (happens during store init)
        })
    },
    setInputMode: (sessionId, mode) => set((s) => ({
        inputModes: { ...s.inputModes, [sessionId]: mode },
    })),
    toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
    setMsgFilter: (filter) => set({ msgFilter: filter }),
    appendPathToInput: (path) => set({ chatInputAppendPath: path }),

    toggleMessageSelection: (id) => set((s) => {
        if (!s.selection) return {}
        const ids = s.selection.ids.includes(id)
            ? s.selection.ids.filter(x => x !== id)
            : [...s.selection.ids, id]
        return { selection: { ...s.selection, ids } }
    }),

    enterMultiSelect: (mode, initialId) => set({
        selection: { mode, ids: [initialId] },
    }),

    clearSelection: () => set({
        selection: null,
    }),

    setSessionWorktree: (sessionId, path) =>
        set((state) => ({
            sessionWorktrees: { ...state.sessionWorktrees, [sessionId]: path },
        })),
    selectBgTask: (id) => set((state) => ({
        selectedBgTaskId: id,
        bgTaskDisplayCount: id ? { ...state.bgTaskDisplayCount, [id]: BG_LOG_INITIAL_DISPLAY } : state.bgTaskDisplayCount,
        preview: { mode: 'task', filePath: null, fileName: null, fileContent: null, diffLines: null, conflictAiContent: null, conflictActive: false, commitDetail: null, commitFiles: null, commitHash: null },
    })),
    updateBgTask: (info) => set((state) => {
        const idx = state.bgTasks.findIndex(t => t.id === info.id)
        if (idx >= 0) {
            const tasks = [...state.bgTasks]
            tasks[idx] = info
            return { bgTasks: tasks }
        }
        return { bgTasks: [...state.bgTasks, info] }
    }),
    updateBgTaskLineCount: (taskId, count) => set((state) => ({
        bgTaskLineCounts: { ...state.bgTaskLineCounts, [taskId]: count },
    })),

    setBgTaskLogCache: (taskId, offset, lines) => set((state) => ({
        bgTaskLogCache: { ...state.bgTaskLogCache, [taskId]: { offset, lines } },
    })),

    loadBgTaskLogs: async (taskId, offset, limit) => {
        try {
            const lines = await Call.ByName('monika/internal/api.App.BgTaskLogLines', taskId, offset, limit) as string[]
            const store = useStore.getState()
            const existing = store.bgTaskLogCache[taskId]
            let mergedLines: string[]
            let mergedOffset: number

            if (existing && offset < existing.offset) {
                mergedLines = [...lines, ...existing.lines]
                mergedOffset = offset
            } else {
                mergedLines = lines
                mergedOffset = offset
            }

            store.setBgTaskLogCache(taskId, mergedOffset, mergedLines)
        } catch (e) {
            console.error('[monika] failed to load bg task logs:', e)
        }
    },

    loadMoreBgTaskLines: (taskId) => {
        const store = useStore.getState()
        const current = store.bgTaskDisplayCount[taskId] || BG_LOG_INITIAL_DISPLAY
        const next = current + BG_LOG_LOAD_MORE
        const cache = store.bgTaskLogCache[taskId]

        if (cache && next > cache.lines.length) {
            const newOffset = cache.offset - BG_LOG_FETCH_BATCH
            const absOffset = Math.abs(newOffset)
            const totalKnown = store.bgTaskLineCounts[taskId] || 0
            if (absOffset < totalKnown) {
                store.loadBgTaskLogs(taskId, newOffset, BG_LOG_FETCH_BATCH)
            }
        }

        set((state) => ({
            bgTaskDisplayCount: { ...state.bgTaskDisplayCount, [taskId]: next },
        }))
    },
    stopBgTask: async (taskId: string) => {
        try {
            await Call.ByName('monika/internal/api.App.StopBgTask', taskId)
        } catch (e) {
            console.error('[monika] failed to stop bg task:', e)
        }
    },
    startBgTask: async (command: string) => {
        try {
            await Call.ByName('monika/internal/api.App.StartBgTask', command)
        } catch (e) {
            console.error('[monika] failed to start bg task:', e)
        }
    },

    setQueue: (sessionId, items) => set((state) => ({
        sessionQueues: { ...state.sessionQueues, [sessionId]: items },
    })),

    updateQueueItem: (sessionId, itemId, changes) => set((state) => {
        const queue = state.sessionQueues[sessionId] || []
        return {
            sessionQueues: {
                ...state.sessionQueues,
                [sessionId]: queue.map((item) =>
                    item.id === itemId ? { ...item, ...changes } : item
                ),
            },
        }
    }),

    removeQueueItem: (sessionId, itemId) => set((state) => {
        const queue = state.sessionQueues[sessionId] || []
        return {
            sessionQueues: {
                ...state.sessionQueues,
                [sessionId]: queue.filter((item) => item.id !== itemId),
            },
        }
    }),

    reorderQueue: (sessionId, itemIds) => set((state) => {
        const queue = state.sessionQueues[sessionId] || []
        const map = new Map(queue.map((item) => [item.id, item]))
        return {
            sessionQueues: {
                ...state.sessionQueues,
                [sessionId]: itemIds.map((id) => map.get(id)!).filter(Boolean),
            },
        }
    }),

    toggleQueuePause: (sessionId, paused) => set((state) => ({
        queuePaused: { ...state.queuePaused, [sessionId]: paused },
    })),


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
        }
    }),

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
    setActiveSessionId: (id) => {
        set({ activeSessionId: id })
        Call.ByName('monika/internal/api.App.ClearSessionDirty', {}).catch(() => { })
    },
    setDockviewApi: (api) => set({ dockviewApi: api }),
    setMemoryStatus: (status) => set({ memoryStatus: status }),

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
        set((s) => {
            const binding = s.sessionBindings[id]
            return {
                openSessions: [...s.openSessions, { id, title }],
                sessionMessages: {
                    ...s.sessionMessages,
                    ...(s.activeSessionId ? { [s.activeSessionId]: s.messages } : {}),
                    [id]: s.sessionMessages[id] || [],
                },
                displayCounts: { ...s.displayCounts, [id]: INITIAL_DISPLAY_COUNT },
                activeSessionId: id,
                selectedProvider: binding?.provider || s.selectedProvider,
                selectedModel: binding?.model || s.selectedModel,
                sessionParents: s.sessionParents,
                messages: [],
                tokenCount: s.sessionTokens[id]?.count ?? 0,
                tokenMax: s.sessionTokens[id]?.max ?? 0,
            }
        })
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
                        ...(session?.worktree_path ? { sessionWorktrees: { ...s.sessionWorktrees, [id]: session.worktree_path } } : {}),
                    }
                }
                return {
                    sessionMessages: { ...s.sessionMessages, [id]: merged },
                    messages: merged,
                    sessionTokens: { ...s.sessionTokens, [id]: tokData },
                    tokenCount: tokData.count,
                    tokenMax: tokData.max,
                    ...(session?.worktree_path ? { sessionWorktrees: { ...s.sessionWorktrees, [id]: session.worktree_path } } : {}),
                }
            })
            if (session?.provider && session?.model) {
                get().applySessionBinding(id, session.provider, session.model)
            }
            set((prev) => ({
                ...session?.queue
                    ? { sessionQueues: { ...prev.sessionQueues, [id]: session.queue } }
                    : {},
                queuePaused: { ...prev.queuePaused, [id]: session?.queue_paused || false },
            }))
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
            App.MarkSessionViewed(project, id).catch(() => { })
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

            const nextDisplayCounts = { ...s.displayCounts }
            delete nextDisplayCounts[id]

            const newMessages: Message[] = newActive ? (msgCache[newActive] || []) : [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika.' }]

            return {
                openSessions: next,
                sessionMessages: msgCache,
                activeSessionId: newActive,
                messages: newMessages,
                generatingSessionIds: s.generatingSessionIds.filter((sid) => sid !== id),
                sessionParents: newParents,
                displayCounts: nextDisplayCounts,
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
                currentCache[s.activeSessionId] = (bgUpdated && bgUpdated.length > 0) ? bgUpdated : s.messages
            }
            const restored = currentCache[id] || []
            const binding = s.sessionBindings[id]
            const restProvider = binding?.provider || s.defaultProvider
            const restModel = binding?.model || s.defaultModel
            const updates: Partial<AppState> = {
                activeSessionId: id,
                sessionMessages: currentCache,
                messages: restored,
                displayCounts: { ...s.displayCounts, [id]: INITIAL_DISPLAY_COUNT },
                tokenCount: s.sessionTokens[id]?.count ?? 0,
                tokenMax: s.sessionTokens[id]?.max ?? 0,
                sessionParents: s.sessionParents,
                selectedProvider: restProvider,
                selectedModel: restModel,
            }
            // Mark session as viewed when user switches to it
            const project = s.projectPath
            if (project) {
                App.MarkSessionViewed(project, id).catch(() => { })
            }
            return updates
        })
    },

    loadMoreMessages: (sessionId, count = LOAD_MORE_COUNT) => {
        set((s) => {
            const current = s.displayCounts[sessionId] || INITIAL_DISPLAY_COUNT
            const total = (s.sessionMessages[sessionId] || []).length
            const next = Math.min(current + count, total)
            return { displayCounts: { ...s.displayCounts, [sessionId]: next } }
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
                ...(session?.worktree_path ? { sessionWorktrees: { ...s.sessionWorktrees, [subagentId]: session.worktree_path } } : {}),
            }))
            if (session?.provider && session?.model) {
                get().applySessionBinding(subagentId, session.provider, session.model)
            }
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
                    ...(session?.worktree_path ? { sessionWorktrees: { ...s.sessionWorktrees, [tab.id]: session.worktree_path } } : {}),
                }))
                if (session?.provider && session?.model) {
                    get().applySessionBinding(tab.id, session.provider, session.model)
                }
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
            } catch { }
            const msgs = get().sessionMessages[activeId] || []
            const binding = get().sessionBindings[activeId]
            set({
                activeSessionId: activeId,
                messages: msgs,
                selectedProvider: binding?.provider || get().defaultProvider,
                selectedModel: binding?.model || get().defaultModel,
                tokenCount: get().sessionTokens[activeId]?.count ?? 0,
                tokenMax: get().sessionTokens[activeId]?.max ?? 0,
                displayCounts: { ...get().displayCounts, [activeId]: INITIAL_DISPLAY_COUNT },
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
                        ...(session?.worktree_path ? { sessionWorktrees: { ...prev.sessionWorktrees, [s.id]: session.worktree_path } } : {}),
                        ...(session?.queue ? { sessionQueues: { ...prev.sessionQueues, [s.id]: session.queue } } : {}),
                        queuePaused: { ...prev.queuePaused, [s.id]: session?.queue_paused || false },
                    }))
                    if (session?.provider && session?.model) {
                        get().applySessionBinding(s.id, session.provider, session.model)
                    }
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
                const binding = get().sessionBindings[mostRecent.id]
                set({
                    activeSessionId: mostRecent.id,
                    messages: msgs,
                    selectedProvider: binding?.provider || get().defaultProvider,
                    selectedModel: binding?.model || get().defaultModel,
                    tokenCount: get().sessionTokens[mostRecent.id]?.count ?? 0,
                    tokenMax: get().sessionTokens[mostRecent.id]?.max ?? 0,
                })
            }
        } catch { /* no sessions or network error */ }
    },

    setPreviewFile: (filePath, fileName, content) => {
        set({ preview: { mode: 'file', filePath, fileName, fileContent: content, diffLines: null, conflictAiContent: null, conflictActive: false }, selectedBgTaskId: null })
    },
    setPreviewMedia: (filePath, fileName, mime) => {
        set({ preview: { mode: 'media', filePath, fileName, fileContent: null, diffLines: null, conflictAiContent: null, conflictActive: false, mediaMime: mime }, selectedBgTaskId: null })
    },

    setPreviewDiff: (filePath, fileName, lines) => {
        set({ preview: { mode: 'diff', filePath, fileName, fileContent: null, diffLines: lines, conflictAiContent: null, conflictActive: false }, selectedBgTaskId: null })
    },

    clearPreview: () => {
        set({
            preview: {
                mode: null, filePath: null, fileName: null, fileContent: null,
                diffLines: null, conflictAiContent: null, conflictActive: false,
                commitDetail: null, commitFiles: null, commitHash: null,
            },
        })
    },

    setPreview: (preview) => set((s) => ({ preview: { ...s.preview, ...preview } })),

    markFileDirty: (path: string) => {
        set((s) => ({
            dirtyFiles: new Set([...s.dirtyFiles, path])
        }))
        Call.ByName('monika/internal/api.App.SetFileDirty', get().projectPath, path, true).catch(() => { })
    },

    markFileClean: (path: string) => {
        set((s) => {
            const next = new Set(s.dirtyFiles)
            next.delete(path)
            return { dirtyFiles: next }
        })
        Call.ByName('monika/internal/api.App.SetFileDirty', get().projectPath, path, false).catch(() => { })
    },

    handleToolConflict: (toolEvent) => {
        const name = toolEvent.filePath.split('/').pop() || toolEvent.filePath.split('\\').pop() || toolEvent.filePath
        set((s) => ({
            preview: {
                ...s.preview,
                mode: 'diff',
                filePath: toolEvent.filePath,
                fileName: name,
                diffLines: toolEvent.diffLines,
                fileContent: toolEvent.diskContent,
                conflictAiContent: toolEvent.aiContent,
                conflictActive: true,
            }
        }))
    },



    setRevealFilePath: (filePath: string | null) => {
        set({ revealFilePath: filePath })
    },
    setFileTreeActiveTab: (tab: 'files' | 'tasks' | 'debug') => {
        set({ fileTreeActiveTab: tab })
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
        const defaultProv = persistedProvider && providers.some((p) => p.id === persistedProvider)
            ? persistedProvider
            : (providers.length > 0 ? providers[0].id : '');
        const selectedProv = state.selectedProvider && providers.some((p) => p.id === state.selectedProvider)
            ? state.selectedProvider
            : defaultProv;
        set({
            availableProviders: providers,
            selectedProvider: selectedProv,
            defaultProvider: defaultProv,
            defaultModel: persistedModel || state.defaultModel,
            ...(state.selectedModel ? { selectedModel: state.selectedModel } : persistedModel ? { selectedModel: persistedModel } : {}),
        });
        if (providers.length > 0) {
            await get().loadModelsForProvider(selectedProv);
        }
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


    loadCommitHistory: async (path?: string) => {
        const gitPath = path || get().projectPath
        if (!gitPath) return
        set((s) => ({ commitHistory: { ...s.commitHistory, loading: true, error: '' } }))
        try {
            const result = await App.GitLog(gitPath)
            const commits = Array.isArray(result) ? result : []
            set({ commitHistory: { commits, loading: false, error: '' } })
        } catch {
            set((s) => ({ commitHistory: { commits: s.commitHistory.commits, loading: false, error: 'Failed to load history' } }))
        }
    },

    loadChangeStats: async () => {
        const { projectPath } = get()
        if (!projectPath) return
        set((s) => ({ changeStats: { ...s.changeStats, loading: true, error: '' } }))
        try {
            const stats = await App.ListChangeStats(projectPath)
            set({ changeStats: { stats: Array.isArray(stats) ? stats : [], loading: false, error: '' } })
        } catch {
            set((s) => ({ changeStats: { ...s.changeStats, loading: false, error: 'Failed to load changes' } }))
        }
    },

    stageFiles: async (paths) => {
        const { projectPath } = get()
        if (!projectPath) return
        try {
            await App.StageFiles(projectPath, paths)
            await get().loadChangeStats()
            set({ feedback: { message: `${paths.length} file(s) staged`, type: 'success' } })
        } catch (err: any) {
            set({ feedback: { message: err?.message || 'Failed to stage', type: 'error' } })
        }
    },

    unstageFiles: async (paths) => {
        const { projectPath } = get()
        if (!projectPath) return
        try {
            await App.UnstageFiles(projectPath, paths)
            await get().loadChangeStats()
            set({ feedback: { message: `${paths.length} file(s) unstaged`, type: 'success' } })
        } catch (err: any) {
            set({ feedback: { message: err?.message || 'Failed to unstage', type: 'error' } })
        }
    },

    commitChanges: async (message, push) => {
        const { projectPath } = get()
        if (!projectPath) return
        try {
            if (push) {
                await App.CommitAndPush(projectPath, message)
            } else {
                await App.Commit(projectPath, message)
            }
            await get().loadChangeStats()
            get().loadCommitHistory()
            set({ feedback: { message: push ? 'Committed & pushed' : 'Committed', type: 'success' } })
        } catch (err: any) {
            set({ feedback: { message: err?.message || 'Commit failed', type: 'error' } })
        }
    },

    gitFetch: async (path) => {
        try {
            await App.GitFetch(path)
            get().loadCommitHistory(path)
            set({ feedback: { message: 'Fetch OK', type: 'success' } })
        } catch (err: any) {
            set({ feedback: { message: err?.message || 'Fetch failed', type: 'error' } })
        }
    },

    gitPull: async (path) => {
        try {
            await App.GitPull(path)
            get().loadCommitHistory(path)
            set({ feedback: { message: 'Pull OK', type: 'success' } })
        } catch (err: any) {
            set({ feedback: { message: err?.message || 'Pull failed', type: 'error' } })
        }
    },

    setPreviewCommit: async (hash) => {
        const { projectPath } = get()
        if (!projectPath) return
        try {
            const detail = await App.GitShow(projectPath, hash)
            if (!detail) return
            set({
                preview: {
                    mode: 'commit',
                    filePath: null,
                    fileName: detail.message,
                    fileContent: null,
                    diffLines: null,
                    commitDetail: detail,
                    commitFiles: detail.files || [],
                    commitHash: hash,
                    conflictAiContent: null,
                    conflictActive: false,
                },
                selectedBgTaskId: null,
            })
        } catch {
            set({ feedback: { message: 'Failed to load commit details', type: 'error' } })
        }
    },

    setCommitFileDiff: async (filePath) => {
        const { projectPath, preview } = get()
        if (!projectPath || !preview.commitHash) return
        try {
            const result = await App.GetCommitFileDiff(projectPath, preview.commitHash, filePath)
            if (!result) return
            set({
                preview: {
                    ...preview,
                    filePath: filePath,
                    fileName: filePath.split('/').pop() || filePath,
                    diffLines: result.lines || [],
                },
            })
        } catch {
            set({ feedback: { message: 'Failed to load file diff', type: 'error' } })
        }
    },

    clearFeedback: () => set({ feedback: { message: '', type: 'info' } }),
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

    loadLSPStatus: async () => {
        try {
            const servers = await Call.ByName('monika/internal/api.App.GetLSPStatus')
            set({ lspServers: servers || [] })
        } catch { set({ lspServers: [] }) }
    },

    openLspFile: (projectPath: string, filePath: string) => {
        lspService.openFile(projectPath, filePath).catch(() => {
            set({ lspReady: { ...get().lspReady, [filePath]: false } })
        })
        set({ lspReady: { ...get().lspReady, [filePath]: true } })
    },

    closeLspFile: (projectPath: string, filePath: string) => {
        lspService.closeFile(projectPath, filePath).catch(() => { })
        set((state) => {
            const { [filePath]: _, ...rest } = state.lspReady
            return { lspReady: rest }
        })
    },

    setLspDiagnostics: (filePath: string, diags: LspDiagnostic[]) => {
        set({ lspDiagnostics: { ...get().lspDiagnostics, [filePath]: diags } })
    },

    setLspSymbols: (filePath: string, syms: LspSymbol[]) => {
        set({ lspSymbols: { ...get().lspSymbols, [filePath]: syms } })
    },

    saveMCPServer: async (srv) => {
        await Call.ByName('monika/internal/api.App.SaveMCPServer', srv)
        await get().loadMCPServers()
    },

    deleteMCPServer: async (id, scope) => {
        await Call.ByName('monika/internal/api.App.DeleteMCPServer', { id, scope: scope || 'project' })
        await get().loadMCPServers()
    },

    importMCPServers: async (json) => {
        let payload = json
        try {
            const parsed = JSON.parse(json)
            if (parsed && !parsed.scope) parsed.scope = 'project'
            payload = JSON.stringify(parsed)
        } catch { /* pass through raw json */ }
        const ids = await Call.ByName('monika/internal/api.App.ImportMCPServers', payload)
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
            const providers = await Call.ByName('monika/internal/api.App.GetProviders') as any[]
            set({
                providerDetails: providers || [],
            })
        } catch { set({ providerDetails: [] }) }
        // Refresh availableProviders and modelsByProvider so ModelPicker picks up changes
        await get().loadProviders()
    },

    loadAvailableProviders: async () => {
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
    startCopilotLogin: async () => {
        return await Call.ByName('monika/internal/api.App.StartCopilotLogin') as CopilotLoginInfo
    },
    loadProxyConfig: async () => {
        return await Call.ByName('monika/internal/api.App.GetProxyConfig') as ProxyConfig
    },
    saveProxyConfig: async (cfg: ProxyConfig) => {
        await Call.ByName('monika/internal/api.App.SaveProxyConfig', cfg)
    },
    pollCopilotLogin: async (deviceCode: string) => {
        return await Call.ByName('monika/internal/api.App.PollCopilotLogin', deviceCode) as CopilotTokenResult
    },

    deleteProviderDetail: async (id) => {
        await Call.ByName('monika/internal/api.App.DeleteProvider', { id })
        await get().loadProviderDetails()
    },

    setSettingsScope: (scope) => set({ settingsScope: scope }),

    loadLSPConfig: async (scope) => {
        try {
            const servers = await Call.ByName('monika/internal/api.App.GetLSPConfig', scope)
            set({ lspConfigServers: servers || {} })
        } catch { set({ lspConfigServers: {} }) }
    },

    saveLSPConfig: async (scope, servers) => {
        await Call.ByName('monika/internal/api.App.SaveLSPConfig', scope, servers)
        set({ lspConfigServers: servers })
    },

    loadFormatterConfig: async (scope) => {
        try {
            const formatters = await Call.ByName('monika/internal/api.App.GetFormatterConfig', scope)
            const normalized: Record<string, FormatterEntry> = {}
            for (const [lang, cfg] of Object.entries(formatters || {})) {
                if (typeof cfg === 'string') {
                    normalized[lang] = { command: '', ref: cfg }
                } else {
                    normalized[lang] = cfg as FormatterEntry
                }
            }
            set({ formatterConfig: normalized })
        } catch { set({ formatterConfig: {} }) }
    },

    saveFormatterConfig: async (scope, formatters) => {
        const payload: Record<string, any> = {}
        for (const [lang, cfg] of Object.entries(formatters)) {
            if (cfg.ref) {
                payload[lang] = cfg.ref
            } else {
                payload[lang] = cfg
            }
        }
        await Call.ByName('monika/internal/api.App.SaveFormatterConfig', scope, payload)
        set({ formatterConfig: formatters })
    },

    resetProjectState: () => {
        set({
            messages: [{ id: 'welcome', role: 'system' as const, content: 'Welcome to Monika. Type /help for commands.' }],
            generatingSessionIds: [],
            shellExecutingSessionIds: [],
            sessionStatuses: {},
            sessionErrors: {},
            retryInfo: null,
            sessionTokens: {},
            tokenCount: 0,
            tokenMax: 0,
            activeSessionId: '',
            sessionParents: {},
            subagentStack: {},
            preview: { mode: null, filePath: null, fileName: null, fileContent: null, diffLines: null, commitDetail: null, commitFiles: null, commitHash: null },


            openSessions: [],
            sessionMessages: {},
            displayCounts: {},
            tasks: {},
            changeStats: { stats: [], loading: false, error: '' },
            commitHistory: { commits: [], loading: false, error: '' },
            allBranches: [],
            recentProjects: [],
            availableProviders: [],
            selectedProvider: '',
            modelsByProvider: {},
            selectedModel: '',
            pendingPermission: null,
            pendingAskUser: null,
            permissionMode: 'auto',
            inputModes: {},
            permissionRules: [],
            agents: [],
            skills: [],
            skillPaths: [],
            mcpServers: [],
            lspServers: [],
            lspReady: {},
            lspDiagnostics: {},
            lspSymbols: {},
            previewNeedsRefresh: null,
            providerDetails: [],

            settingsOpen: false,
            settingsScope: 'global',
            lspConfigServers: {},
            formatterConfig: {},
            fileTreeVersion: 0,
            sessionListVersion: 0,
            selection: null,
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
            result.push({
                id: crypto.randomUUID(),
                role: 'user',
                content: stripTransientBlocks(m.content || ''),
                quotedMessages: (m as any).quoted_messages?.map((qm: any) => ({
                    id: qm.id || '',
                    role: qm.role || '',
                    content: qm.content || '',
                })) || undefined,
            })
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
                    quotedMessages: (m as any).quoted_messages?.map((qm: any) => ({
                        id: qm.id || '',
                        role: qm.role || '',
                        content: qm.content || '',
                    })) || undefined,
                })
                i++
            }
        } else if (m.role === 'tool') {
            i++
        } else if (m.role === 'system') {
            result.push({ id: crypto.randomUUID(), role: 'system', content: m.content || '' })
            i++
        } else if (m.role === 'shell') {
            result.push({ id: crypto.randomUUID(), role: 'shell', content: m.content || '' })
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
                if (useStore.getState().retryInfo) useStore.setState({ retryInfo: null })
                if (!textBatch[sid]) textBatch[sid] = { textParts: [], thinkingParts: [] }
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
                                    if (data.tool.conflict && data.tool.diskContent && data.tool.aiContent) {
                                        useStore.getState().handleToolConflict({
                                            filePath: parsed.filePath,
                                            name: data.tool.name,
                                            diffLines: data.tool.diffLines,
                                            diskContent: data.tool.diskContent,
                                            aiContent: data.tool.aiContent,
                                        })
                                    } else {
                                        useStore.getState().setPreviewDiff(parsed.filePath, name, data.tool.diffLines)
                                    }
                                }
                            } catch { }
                        }
                    }
                }
                // Clear any pending progress message for this tool.
                if (data.tool?.id) {
                    store.setToolProgress(data.tool.id, '')
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

            case 'tool_progress':
                // Streaming tools (e.g. video_understand) emit progress
                // messages with sid = tool call id. Stash them in the
                // toolProgress map so MediaToolBlock can render the
                // latest line under the running spinner. The matching
                // tool_output event below clears the entry when the
                // tool completes.
                if (sid) {
                    store.setToolProgress(sid, data.content || '')
                }
                break

            case 'usage':
                if (data.usage) {
                    store.addTokens(sid, data.usage.total_tokens || 0, data.usage.max_context)
                }
                break

            case 'retrying':
                if (data.retry_attempt !== undefined && data.retry_max !== undefined) {
                    useStore.setState({
                        retryInfo: {
                            attempt: data.retry_attempt,
                            max: data.retry_max,
                            message: data.content || `重试连接中 (${data.retry_attempt}/${data.retry_max})...`,
                        },
                    })
                }
                break

            case 'error':
                if (data.content === 'cancelled') {
                    store.removeGeneratingSession(sid)
                    store.setSessionStatus(sid, 'pending')
                    store.setSessionError(sid, '')
                    // Also clean up child/subagent sessions — their "cancelled"
                    // events are lost because the parent stopped forwarding.
                    const childIds = Object.entries(store.sessionParents)
                        .filter(([, pid]) => pid === sid)
                        .map(([cid]) => cid)
                    for (const cid of childIds) {
                        store.removeGeneratingSession(cid)
                        store.setSessionStatus(cid, 'pending')
                    }
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
                // If changed file matches current preview, flag it for refresh
                if (data.file_change && data.file_change.path) {
                    const curPreview = useStore.getState().preview
                    if (curPreview.mode === 'file' && curPreview.filePath === data.file_change.path) {
                        useStore.setState({ previewNeedsRefresh: data.file_change.path })
                    }
                }
                break

            case 'done': {
                if (useStore.getState().retryInfo) useStore.setState({ retryInfo: null })
                store.removeGeneratingSession(sid)
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
                // Trigger notification for AI reply completion (skip subagent sessions)
                if (!sid.startsWith('call_') && !sid.startsWith('sub_')) {
                    const openSessions = useStore.getState().openSessions
                    const sessionInfo = openSessions.find((s) => s.id === sid)
                    const sessionTitle = sessionInfo?.title || sid.slice(0, 8)
                    useNotificationStore.getState().push({
                        sessionId: sid,
                        sessionTitle,
                        type: 'reply-complete',
                        message: '回复完成',
                    })
                }
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
                } else {
                    store.setSessionTasks(sid, [])
                }
                break


            case 'shell_output': {
                const shellMsgs = store.sessionMessages[sid]
                if (shellMsgs && shellMsgs.length > 0) {
                    let found = false
                    for (let i = shellMsgs.length - 1; i >= 0; i--) {
                        if (shellMsgs[i].role === 'shell') {
                            const existing = shellMsgs[i].content
                            let newContent: string
                            if (existing.includes('\u200B\u200B')) {
                                newContent = existing.replace('\u200B\u200B', '') + (data.content || '')
                            } else {
                                newContent = existing + '\n' + (data.content || '')
                            }
                            shellMsgs[i] = { ...shellMsgs[i], content: newContent }
                            found = true
                            break
                        }
                    }
                    if (!found) {
                        shellMsgs.push({ id: crypto.randomUUID(), role: 'shell', content: data.content || '' })
                    }
                    useStore.setState({
                        sessionMessages: { ...store.sessionMessages, [sid]: [...shellMsgs] },
                        messages: store.activeSessionId === sid ? [...shellMsgs] : store.messages,
                    })
                }
                break
            }
            case 'shell_done': {
                try {
                    const done = JSON.parse(data.content || '{}')
                    const shellMsgs2 = store.sessionMessages[sid]
                    if (shellMsgs2 && shellMsgs2.length > 0) {
                        let found = false
                        for (let i = shellMsgs2.length - 1; i >= 0; i--) {
                            if (shellMsgs2[i].role === 'shell') {
                                let content = shellMsgs2[i].content
                                if (done.exitCode !== 0) {
                                    content += `\n\nShell exited with code ${done.exitCode}`
                                }
                                shellMsgs2[i] = { ...shellMsgs2[i], content }
                                found = true
                                break
                            }
                        }
                        if (!found) {
                            shellMsgs2.push({ id: crypto.randomUUID(), role: 'shell', content: `Shell exited with code ${done.exitCode ?? 0}` })
                        }
                        useStore.setState({
                            sessionMessages: { ...store.sessionMessages, [sid]: [...shellMsgs2] },
                            messages: store.activeSessionId === sid ? [...shellMsgs2] : store.messages,
                        })
                    }
                } catch { }
                store.removeShellExecutingSession(sid)
                break
            }
            case 'shell_error': {
                const shellMsgs3 = store.sessionMessages[sid]
                if (shellMsgs3 && shellMsgs3.length > 0) {
                    let found = false
                    for (let i = shellMsgs3.length - 1; i >= 0; i--) {
                        if (shellMsgs3[i].role === 'shell') {
                            let content = shellMsgs3[i].content
                            if (content.includes('\u200B\u200B')) {
                                content = content.replace('\u200B\u200B', '')
                            }
                            content += `\nError: ${data.content || 'Unknown error'}`
                            shellMsgs3[i] = { ...shellMsgs3[i], content }
                            found = true
                            break
                        }
                    }
                    if (!found) {
                        shellMsgs3.push({ id: crypto.randomUUID(), role: 'shell', content: `Error: ${data.content || 'Unknown error'}` })
                    }
                    useStore.setState({
                        sessionMessages: { ...store.sessionMessages, [sid]: [...shellMsgs3] },
                        messages: store.activeSessionId === sid ? [...shellMsgs3] : store.messages,
                    })
                }
                store.removeShellExecutingSession(sid)
                break
            }
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

            case 'queue_updated': {
                try {
                    const items = data.content ? JSON.parse(data.content) : []
                    store.setQueue(sid, items)
                } catch { }
                break
            }
            case 'queue_item_started': {
                try {
                    const item = data.content ? JSON.parse(data.content) : null
                    if (item) {
                        store.updateQueueItem(sid, item.id, { status: 'executing' })
                        const userMsg: Message = {
                            id: crypto.randomUUID(),
                            role: 'user',
                            content: stripTransientBlocks(item.text),
                        }
                        const assistantMsg: Message = {
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: '',
                            startedAt: Date.now(),
                        }
                        store.appendToSession(sid, [userMsg, assistantMsg])
                        store.addGeneratingSession(sid)
                    }
                } catch { }
                break
            }
            case 'queue_error': {
                try {
                    const info = data.content ? JSON.parse(data.content) : null
                    if (info) {
                        store.updateQueueItem(sid, info.item_id, {
                            status: 'error',
                            error: info.error,
                        })
                        store.toggleQueuePause(sid, true)
                    }
                } catch { }
                break
            }
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

        if (data.type === 'bg_task') {
            try {
                const ev = typeof data.content === 'string' ? JSON.parse(data.content) : data.content
                const store = useStore.getState()
                switch (ev.type) {
                    case 'started':
                        store.updateBgTask({
                            id: ev.task_id,
                            command: ev.command,
                            work_dir: ev.work_dir,
                            pid: ev.pid,
                            status: 'running',
                            exit_code: 0,
                            started_at: new Date().toISOString(),
                        })
                        break
                    case 'log_update':
                        store.updateBgTaskLineCount(ev.task_id, ev.line_count)
                        break
                    case 'stopped':
                    case 'exited': {
                        const task = store.bgTasks.find(t => t.id === ev.task_id)
                        if (task) {
                            store.updateBgTask({ ...task, status: ev.status, exit_code: ev.exit_code || 0 })
                        }
                        break
                    }
                }
            } catch { /* ignore parse errors */ }
            return
        }

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
            // Trigger notification for permission request (skip subagent sessions)
            if (!permPayload.sessionId.startsWith('call_') && !permPayload.sessionId.startsWith('sub_')) {
                const openSessions = useStore.getState().openSessions
                const sessionInfo = openSessions.find((s) => s.id === permPayload.sessionId)
                const sessionTitle = sessionInfo?.title || permPayload.sessionId.slice(0, 8)
                useNotificationStore.getState().push({
                    sessionId: permPayload.sessionId,
                    sessionTitle,
                    type: 'permission-request',
                    message: '需要确认',
                })
            }
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
    Events.On('commit-history-changed', (ev) => {
        useStore.getState().loadCommitHistory()
    })

    // Track main window visibility to skip Toast when hidden
    Events.On('common:WindowMaximise', () => setMainWindowVisible(true))
    Events.On('common:WindowShow', () => setMainWindowVisible(true))
    Events.On('common:WindowRestore', () => setMainWindowVisible(true))
    Events.On('common:WindowMinimise', () => setMainWindowVisible(false))
    Events.On('common:WindowHide', () => setMainWindowVisible(false))

    // Auto-clear notifications when user focuses the main window
    Events.On('common:WindowFocus', () => {
        console.log('[monika] common:WindowFocus fired, marking all read')
        useNotificationStore.getState().markAllRead()
    })

    // Navigate to session when tray notification is clicked
    Events.On('tray-activate-session', (ev: any) => {
        const { sessionId, sessionTitle } = ev.data || {}
        if (sessionId) {
            useStore.getState().openSessionTab(sessionId, sessionTitle || sessionId)
        }
    })

    Events.On('mcp-discovered', (ev: any) => {
        const data = ev.data
        if (data?.count > 0) {
            const names = (data.servers || []).map((s: any) => s.id).join(', ')
            useNotificationStore.getState().pushToast(
                `Discovered ${data.count} MCP server${data.count !== 1 ? 's' : ''}: ${names}`,
                'info'
            )
            useStore.getState().loadMCPServers()
        }
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
