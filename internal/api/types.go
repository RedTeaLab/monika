package api

import "monika/internal/agent"

type StreamEvent struct {
	Type       string            `json:"type"`
	Content    string            `json:"content,omitempty"`
	SessionID  string            `json:"session_id,omitempty"`
	Model      string            `json:"model,omitempty"`
	Tool       *agent.ToolEvent  `json:"tool,omitempty"`
	AgentUsage *agent.UsageEvent `json:"usage,omitempty"`
	FileChange *FileChangeEvent  `json:"file_change,omitempty"`
}

type FileChangeEvent struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

type ProjectInfo struct {
	Path      string         `json:"path"`
	Name      string         `json:"name"`
	Branch    string         `json:"branch"`
	Worktrees []WorktreeInfo `json:"worktrees"`
}

type WorktreeInfo struct {
	Branch string `json:"branch"`
	Path   string `json:"path"`
}

// RecentProject represents a recently opened project.
type RecentProject struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt int64  `json:"opened_at"`
}

// BranchInfo represents a git branch (local or remote).
type BranchInfo struct {
	Name   string `json:"name"`
	Remote string `json:"remote"` // empty = local branch
}

type SessionInfo struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	UpdatedAt string `json:"updated_at"`
}

type FileContent struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Exist   bool   `json:"exist"`
}

type FileChange struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

type DiffResult struct {
	FilePath string   `json:"file_path"`
	Old      string   `json:"old"`
	New      string   `json:"new"`
	Lines    []string `json:"lines"`
}
