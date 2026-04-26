import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { StreamEvent } from '../../bindings/monika'

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
  tools?: ToolCall[]
}

interface AppState {
  messages: Message[]
  generating: boolean
  tokenCount: number
  projectPath: string
  activeSessionId: string

  addMessage: (msg: Message) => void
  updateLastAssistant: (content: string) => void
  addToolStart: (tool: ToolCall) => void
  updateToolDone: (name: string, output: string, status: 'done' | 'error') => void
  setGenerating: (v: boolean) => void
  addTokens: (tokens: number) => void
  clearMessages: () => void
  setProjectPath: (path: string) => void
  setActiveSessionId: (id: string) => void
}

export const useStore = create<AppState>((set) => ({
  messages: [{ id: 'welcome', role: 'system', content: 'Welcome to Monika. Type /help for commands.' }],
  generating: false,
  tokenCount: 0,
  projectPath: '',
  activeSessionId: '',

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
  setProjectPath: (path) => set({ projectPath: path }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}))

export function setupWailsEvents() {
  Events.On('stream', (ev) => {
    const store = useStore.getState()
    const data = ev.data as StreamEvent
    switch (data.type) {
      case 'text_delta':
        store.updateLastAssistant(data.content || '')
        break
      case 'thinking':
        break
      case 'tool_start':
        if (data.tool) {
          store.addToolStart({ name: data.tool.name, input: data.tool.input || '', status: 'running' })
        }
        break
      case 'tool_done':
        if (data.tool) {
          store.updateToolDone(data.tool.name, data.tool.output || '', data.tool.status === 'done' ? 'done' : 'error')
        }
        break
      case 'usage':
        if (data.usage) {
          store.addTokens(data.usage.total_tokens || 0)
        }
        break
      case 'error':
        store.addMessage({ id: crypto.randomUUID(), role: 'error', content: data.content || 'Unknown error' })
        store.setGenerating(false)
        break
      case 'done':
        store.setGenerating(false)
        break
    }
  })
}
