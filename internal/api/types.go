package api

import (
	"monika/internal/agent"
	"monika/internal/permission"
	"monika/internal/tool"
)

type StreamEvent struct {
	Type       string                              `json:"type"`
	Content    string                              `json:"content,omitempty"`
	SessionID  string                              `json:"session_id,omitempty"`
	Model      string                              `json:"model,omitempty"`
	Seq        int64                               `json:"seq,omitempty"`
	Tool       *agent.ToolEvent                    `json:"tool,omitempty"`
	AgentUsage *agent.UsageEvent                   `json:"usage,omitempty"`
	FileChange *FileChangeEvent                    `json:"file_change,omitempty"`
	Compaction *agent.CompactionEvent              `json:"compaction,omitempty"`
	Tasks      []agent.TaskItem                    `json:"tasks,omitempty"`
	Permission *permission.PermissionRequiredEvent `json:"permission,omitempty"`
	AskUser    *AskUserEvent                       `json:"ask_user,omitempty"`
}

type AskUserEvent struct {
	RequestID string   `json:"requestId"`
	SessionID string   `json:"sessionId"`
	Question  string   `json:"question"`
	Title     string   `json:"title,omitempty"`
	Options   []string `json:"options,omitempty"`
}

type AskUserResponse struct {
	RequestID string `json:"requestId"`
	Answer    string `json:"answer"`
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
	ID         string `json:"id"`
	Title      string `json:"title"`
	Status     string `json:"status"`
	Pinned     bool   `json:"pinned"`
	UpdatedAt  string `json:"updated_at"`
	TokenCount int64  `json:"token_count,omitempty"`
	TokenMax   int64  `json:"token_max,omitempty"`
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

type ChangeStat struct {
	Path    string `json:"path"`
	Added   int    `json:"added"`
	Deleted int    `json:"deleted"`
}

// ProviderInfo identifies a configured provider for the frontend selector.
type ProviderInfo struct {
	ID          string           `json:"id"`
	DisplayName string           `json:"display_name"`
	BaseURL     string           `json:"base_url"`
	APIKey      string           `json:"api_key"`
	WireAPI     string           `json:"wire_api,omitempty"`
	Models      []ModelEntryJSON `json:"models"`
}

type ModelEntryJSON struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ContextLimit int64  `json:"context_limit,omitempty"`
	OutputLimit  int64  `json:"output_limit,omitempty"`
	Enabled      bool   `json:"enabled"`
}

// TaskStoreAccessor provides access to per-session task storage.
type TaskStoreAccessor interface {
	Snapshot() map[string][]tool.Task
	Restore(sessionID string, tasks []tool.Task)
	GetTaskStore(sessionID string) tool.TaskStore
}

// SkillContentResult is the API response for GetSkillContent.
type SkillContentResult struct {
	Content string   `json:"content"`
	Files   []string `json:"files"`
}
