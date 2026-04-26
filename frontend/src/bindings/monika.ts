import { Call } from '@wailsio/runtime'

export interface WorktreeInfo {
  branch: string
  path: string
}

export interface ProjectInfo {
  path: string
  name: string
  branch: string
  worktrees: WorktreeInfo[]
}

export interface SessionInfo {
  id: string
  title: string
  updated_at: string
}

export interface ToolEvent {
  id: string
  name: string
  input: string
  output: string
  status: string
}

export interface UsageEvent {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export interface FileChangeEvent {
  path: string
  status: string
}

export interface StreamEvent {
  type: string
  content?: string
  session_id?: string
  tool?: ToolEvent
  usage?: UsageEvent
  file_change?: FileChangeEvent
}

export interface FileContent {
  path: string
  content: string
  exist: boolean
}

export interface FileNode {
  name: string
  path: string
  is_dir: boolean
  children?: FileNode[]
  status?: string
}

export interface FileChange {
  path: string
  status: string
}

export interface DiffResult {
  file_path: string
  old: string
  new: string
  lines: string[]
}

export interface ChatMessage {
  role: string
  content: string
}

export interface Session {
  id: string
  title: string
  project_dir: string
  messages: ChatMessage[]
  model: string
  provider: string
  created_at: string
  updated_at: string
}

const svc = 'monika.App'

export const App = {
  ListProjects(): Promise<ProjectInfo[]> {
    return Call.ByName(svc + '.ListProjects') as Promise<ProjectInfo[]>
  },
  OpenProject(path: string): Promise<ProjectInfo> {
    return Call.ByName(svc + '.OpenProject', path) as Promise<ProjectInfo>
  },
  ListSessions(projectPath: string): Promise<SessionInfo[]> {
    return Call.ByName(svc + '.ListSessions', projectPath) as Promise<SessionInfo[]>
  },
  NewSession(projectPath: string): Promise<SessionInfo> {
    return Call.ByName(svc + '.NewSession', projectPath) as Promise<SessionInfo>
  },
  DeleteSession(projectPath: string, sessionID: string): Promise<void> {
    return Call.ByName(svc + '.DeleteSession', projectPath, sessionID) as Promise<void>
  },
  LoadSession(projectPath: string, sessionID: string): Promise<Session> {
    return Call.ByName(svc + '.LoadSession', projectPath, sessionID) as Promise<Session>
  },
  SendMessage(projectPath: string, sessionID: string, text: string): Promise<void> {
    return Call.ByName(svc + '.SendMessage', projectPath, sessionID, text) as Promise<void>
  },
  CancelGeneration(sessionID: string): Promise<void> {
    return Call.ByName(svc + '.CancelGeneration', sessionID) as Promise<void>
  },
  ReadFile(projectPath: string, filePath: string): Promise<FileContent> {
    return Call.ByName(svc + '.ReadFile', projectPath, filePath) as Promise<FileContent>
  },
  WriteFile(projectPath: string, filePath: string, content: string): Promise<void> {
    return Call.ByName(svc + '.WriteFile', projectPath, filePath, content) as Promise<void>
  },
  ListFileTree(projectPath: string): Promise<FileNode[]> {
    return Call.ByName(svc + '.ListFileTree', projectPath) as Promise<FileNode[]>
  },
  ListFileChanges(projectPath: string): Promise<FileChange[]> {
    return Call.ByName(svc + '.ListFileChanges', projectPath) as Promise<FileChange[]>
  },
  GetFileDiff(projectPath: string, filePath: string): Promise<DiffResult> {
    return Call.ByName(svc + '.GetFileDiff', projectPath, filePath) as Promise<DiffResult>
  },
}
