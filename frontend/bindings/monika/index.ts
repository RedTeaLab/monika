import { Call } from "@wailsio/runtime";

// Types matching Go types (JSON camelCase is handled by Wails)
export interface ProjectInfo {
  path: string;
  name: string;
  branch: string;
  worktrees: { branch: string; path: string }[];
}

export interface SessionInfo {
  id: string;
  title: string;
  updated_at: string;
}

export interface Session {
  id: string;
  title: string;
  project_dir: string;
  messages: { role: string; content: string; tool_calls?: any[] }[];
  model: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface FileContent {
  path: string;
  content: string;
  exist: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  status?: string;
}

export interface FileChange {
  path: string;
  status: string;
}

export interface RecentProject {
  path: string;
  name: string;
  opened_at: number;
}

export interface BranchInfo {
  name: string;
  remote: string;
}

export interface DiffResult {
  file_path: string;
  old: string;
  new: string;
  lines: string[];
}

export interface StreamEvent {
  type: string;
  content?: string;
  session_id?: string;
  model?: string;
  tool?: { id: string; name: string; input: string; output: string; status: string };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    reasoning_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    context_tokens: number;
    max_context: number;
  };
  file_change?: { path: string; status: string };
}

export interface ModelInfo {
  ID: string;
  DisplayName: string;
}

// Wails bindings - use the service name based on what Wails generates
// For a struct in package api, Wails v3 uses the service name from registration
const serviceName = "monika/internal/api.App";

export const App = {
  ListProjects(): Promise<ProjectInfo[]> {
    return Call.ByName(`${serviceName}.ListProjects`);
  },
  GetCurrentProject(): Promise<ProjectInfo | null> {
    return Call.ByName(`${serviceName}.GetCurrentProject`);
  },
  GetModels(): Promise<ModelInfo[]> {
    return Call.ByName(`${serviceName}.GetModels`);
  },
  OpenProject(path: string): Promise<ProjectInfo> {
    return Call.ByName(`${serviceName}.OpenProject`, path);
  },
  ListSessions(projectPath: string): Promise<SessionInfo[]> {
    return Call.ByName(`${serviceName}.ListSessions`, projectPath);
  },
  NewSession(projectPath: string, model: string): Promise<SessionInfo> {
    return Call.ByName(`${serviceName}.NewSession`, projectPath, model);
  },
  DeleteSession(projectPath: string, sessionID: string): Promise<void> {
    return Call.ByName(`${serviceName}.DeleteSession`, projectPath, sessionID);
  },
  LoadSession(projectPath: string, sessionID: string): Promise<Session> {
    return Call.ByName(`${serviceName}.LoadSession`, projectPath, sessionID);
  },
  SendMessage(projectPath: string, sessionID: string, text: string, model: string): Promise<void> {
    return Call.ByName(`${serviceName}.SendMessage`, projectPath, sessionID, text, model);
  },
  QuitApp(): Promise<void> {
    return Call.ByName(`${serviceName}.QuitApp`);
  },
  CancelGeneration(sessionID: string): Promise<void> {
    return Call.ByName(`${serviceName}.CancelGeneration`, sessionID);
  },
  ReadFile(projectPath: string, filePath: string): Promise<FileContent> {
    return Call.ByName(`${serviceName}.ReadFile`, projectPath, filePath);
  },
  WriteFile(projectPath: string, filePath: string, content: string): Promise<void> {
    return Call.ByName(`${serviceName}.WriteFile`, projectPath, filePath, content);
  },
  ListFileTree(projectPath: string): Promise<FileNode[]> {
    return Call.ByName(`${serviceName}.ListFileTree`, projectPath);
  },
  ListFileChanges(projectPath: string): Promise<FileChange[]> {
    return Call.ByName(`${serviceName}.ListFileChanges`, projectPath);
  },
  GetFileDiff(projectPath: string, filePath: string): Promise<DiffResult> {
    return Call.ByName(`${serviceName}.GetFileDiff`, projectPath, filePath);
  },
  GetRecentProjects(): Promise<RecentProject[]> {
    return Call.ByName(`${serviceName}.GetRecentProjects`);
  },
  ListBranches(projectPath: string): Promise<BranchInfo[]> {
    return Call.ByName(`${serviceName}.ListBranches`, [projectPath]);
  },
  CreateBranch(projectPath: string, name: string, baseBranch: string): Promise<void> {
    return Call.ByName(`${serviceName}.CreateBranch`, [projectPath, name, baseBranch]);
  },
  SwitchBranch(projectPath: string, name: string): Promise<void> {
    return Call.ByName(`${serviceName}.SwitchBranch`, [projectPath, name]);
  },
  ListDirectory(parentPath: string): Promise<FileNode[]> {
    return Call.ByName(`${serviceName}.ListDirectory`, [parentPath]);
  },
};
