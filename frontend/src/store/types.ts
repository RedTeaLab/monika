// ── Store type definitions ──
// Extracted from store/index.ts for maintainability.
// All types consumed by store slices and components.

import type { CommitDetail, ChangeStat } from '../../bindings/monika'

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

export interface BgTaskInfo {
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

export interface ToolCall {
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

export interface Message {
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

export interface QueuedMessage {
    id: string
    text: string
    provider_id: string
    model: string
    status: string
    error?: string
    created_at: number
}

export interface SessionTabInfo {
    id: string
    title: string
}

export interface PreviewState {
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
