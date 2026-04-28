import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { App, StreamEvent } from '../../bindings/monika'

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
}

interface AppState {
  messages: Message[]
  generating: boolean
  tokenCount: number
  projectPath: string
  branch: string
  activeSessionId: string
  activeSessionTitle: string
  consoleLines: string[]
  layoutMode: LayoutMode
  splitRatio: number
  selectedFilePath: string
  selectedFileContent: string

  addMessage: (msg: Message) => void
  updateLastAssistant: (content: string) => void
  updateLastAssistantThinking: (content: string) => void
  addToolStart: (tool: ToolCall) => void
  updateToolDone: (name: string, output: string, status: 'done' | 'error') => void
  setGenerating: (v: boolean) => void
  addTokens: (tokens: number) => void
  clearMessages: () => void
  setMessages: (msgs: Message[]) => void
  setProjectPath: (path: string) => void
  setBranch: (branch: string) => void
  setActiveSessionId: (id: string) => void
  setActiveSessionTitle: (title: string) => void
  addConsoleLine: (line: string) => void
  setLayoutMode: (mode: LayoutMode) => void
  setSplitRatio: (ratio: number) => void
  setSelectedFile: (path: string, content: string) => void
  clearSelectedFile: () => void
}

export const useStore = create<AppState>((set) => ({
  messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika. Type /help for commands.' }],
  generating: false,
  tokenCount: 0,
  projectPath: '',
  branch: '',
  activeSessionId: '',
  activeSessionTitle: '',
  consoleLines: ['$ ready'],
  layoutMode: 'split',
  splitRatio: 0.5,
  selectedFilePath: '',
  selectedFileContent: '',

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

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

  setGenerating: (v) => set({ generating: v }),
  addTokens: (t) => set((s) => ({ tokenCount: s.tokenCount + t })),
  clearMessages: () => set({ messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika.' }] }),
  setMessages: (msgs) => set({ messages: msgs }),
  setProjectPath: (path) => set({ projectPath: path }),
  setBranch: (branch) => set({ branch }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setActiveSessionTitle: (title) => set({ activeSessionTitle: title }),
  addConsoleLine: (line) => set((s) => ({ consoleLines: [...s.consoleLines, line] })),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),
  setSelectedFile: (path, content) => set({ selectedFilePath: path, selectedFileContent: content }),
  clearSelectedFile: () => set({ selectedFilePath: '', selectedFileContent: '' }),
}))

export function loadSessionMessages(raw: { role: string; content: string; reasoning_content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string; name?: string }[]): Message[] {
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
    console.log('[monika] stream event received:', ev)
    const store = useStore.getState()
    const data = ev.data as StreamEvent
    console.log('[monika] stream event type:', data.type)
    switch (data.type) {
      case 'text_delta':
        store.updateLastAssistant(data.content || '')
        break
      case 'thinking':
        store.updateLastAssistantThinking(data.content || '')
        break
      case 'tool_start':
        if (data.tool) {
          store.addToolStart({ name: data.tool.name, input: data.tool.input || '', status: 'running' })
          store.addConsoleLine(`$ ${data.tool.name} ${data.tool.input || ''}`)
        }
        break
      case 'tool_output':
        if (data.tool) {
          store.addConsoleLine(data.tool.output || '')
        }
        break
      case 'tool_done':
        if (data.tool) {
          const status = data.tool.status || 'done'
          store.updateToolDone(data.tool.name, data.tool.output || '', status as 'done' | 'error')
          store.addConsoleLine(`[${status}] ${data.tool.name}`)
        }
        break
      case 'usage':
        if (data.usage) {
          store.addTokens(data.usage.total_tokens || 0)
        }
        break
      case 'error':
        store.addMessage({ id: crypto.randomUUID(), role: 'error', content: data.content || 'Unknown error' })
        store.addConsoleLine(`[error] ${data.content || 'Unknown error'}`)
        store.setGenerating(false)
        break
      case 'file_changed':
        if (data.file_change) {
          store.addConsoleLine(`[file] ${data.file_change.path} ${data.file_change.status}`)
        }
        break
      case 'done':
        store.setGenerating(false)
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
      console.log('[monika] projectPath set to:', info.path, 'branch:', info.branch)
    } else {
      console.log('[monika] GetCurrentProject returned null/undefined')
    }
  } catch (err) {
    console.error('[monika] initProject failed:', err)
  }
}
