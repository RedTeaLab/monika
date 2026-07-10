package api

import (
	"monika/internal/agent"
	"monika/internal/permission"
	"monika/internal/tool"
)

type StreamEvent struct {
	Type         string                              `json:"type"`
	Content      string                              `json:"content,omitempty"`
	SessionID    string                              `json:"session_id,omitempty"`
	Model        string                              `json:"model,omitempty"`
	Seq          int64                               `json:"seq,omitempty"`
	Tool         *agent.ToolEvent                    `json:"tool,omitempty"`
	AgentUsage   *agent.UsageEvent                   `json:"usage,omitempty"`
	FileChange   *FileChangeEvent                    `json:"file_change,omitempty"`
	Compaction   *agent.CompactionEvent              `json:"compaction,omitempty"`
	Tasks        []agent.TaskItem                    `json:"tasks,omitempty"`
	Permission   *permission.PermissionRequiredEvent `json:"permission,omitempty"`
	AskUser      *AskUserEvent                       `json:"ask_user,omitempty"`
	RetryAttempt int                                 `json:"retry_attempt,omitempty"`
	RetryMax     int                                 `json:"retry_max,omitempty"`
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
	Path           string         `json:"path"`
	Name           string         `json:"name"`
	Branch         string         `json:"branch"`
	Worktrees      []WorktreeInfo `json:"worktrees"`
	LastCommitHash string         `json:"last_commit_hash"`
}

type WorktreeInfo struct {
	Branch        string       `json:"branch"`
	Path          string       `json:"path"`
	BoundSessions []SessionRef `json:"bound_sessions,omitempty"`
}

// SessionRef is a lightweight reference to a session for display purposes.
type SessionRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type WorktreeVerifyResult struct {
	Deleted bool   `json:"deleted"`
	Path    string `json:"path"`
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
	ID             string `json:"id"`
	Title          string `json:"title"`
	Status         string `json:"status"`
	Pinned         bool   `json:"pinned"`
	UpdatedAt      string `json:"updated_at"`
	TokenCount     int64  `json:"token_count,omitempty"`
	TokenMax       int64  `json:"token_max,omitempty"`
	WorktreePath   string `json:"worktree_path,omitempty"`
	WorktreeBranch string `json:"worktree_branch,omitempty"`
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

type CommitDetail struct {
	Hash    string       `json:"hash"`
	Author  string       `json:"author"`
	Date    string       `json:"date"`
	Message string       `json:"message"`
	Files   []ChangeStat `json:"files"`
}

type ChangeStat struct {
	Path    string `json:"path"`
	Added   int    `json:"added"`
	Deleted int    `json:"deleted"`
	Status  string `json:"status"`
	Staged  bool   `json:"staged"`
}

type CommitInfo struct {
	Hash    string   `json:"hash"`
	Author  string   `json:"author"`
	Date    string   `json:"date"`
	Message string   `json:"message"`
	Refs    string   `json:"refs"`
	Parents []string `json:"parents"`
}

// ProviderInfo identifies a configured provider for the frontend selector.
type ProviderInfo struct {
	ID             string           `json:"id"`
	DisplayName    string           `json:"display_name"`
	BaseURL        string           `json:"base_url"`
	APIKey         string           `json:"api_key"`
	WireAPI        string           `json:"wire_api,omitempty"`
	Models         []ModelEntryJSON `json:"models"`
	TokenExpiresAt int64            `json:"token_expires_at,omitempty"`
}

type ModelEntryJSON struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	ContextLimit    int64    `json:"context_limit,omitempty"`
	OutputLimit     int64    `json:"output_limit,omitempty"`
	Enabled         bool     `json:"enabled"`
	SupportedInputs []string `json:"supported_inputs,omitempty"`
}

// AvailableProviderInfo represents a provider available from models.dev for users to add.
type AvailableProviderInfo struct {
	ID          string               `json:"id"`
	DisplayName string               `json:"display_name"`
	Npm         string               `json:"npm"`
	BaseURL     string               `json:"base_url"`
	Env         []string             `json:"env,omitempty"`
	Models      []AvailableModelInfo `json:"models"`
}

// AvailableModelInfo represents a model from models.dev.
type AvailableModelInfo struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	ContextLimit    int64    `json:"context_limit"`
	OutputLimit     int64    `json:"output_limit"`
	SupportedInputs []string `json:"supported_inputs,omitempty"`
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

// LSP API types -- flattened for Wails IPC, no raw LSP URIs

// LspLocation represents a file position (line/col are 0-based).
type LspLocation struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Col  int    `json:"col"`
}

// LspHoverResult contains the hover info text (markdown).
type LspHoverResult struct {
	Contents string `json:"contents"`
}

// LspCompletionItem is a single completion suggestion.
type LspCompletionItem struct {
	Label         string `json:"label"`
	Kind          int    `json:"kind,omitempty"`
	Detail        string `json:"detail,omitempty"`
	Documentation string `json:"documentation,omitempty"`
	InsertText    string `json:"insertText,omitempty"`
}

// LspCompletionResult is the list of completion items.
type LspCompletionResult struct {
	IsIncomplete bool                `json:"isIncomplete"`
	Items        []LspCompletionItem `json:"items"`
}

// LspSymbol is a document symbol with a tree of children.

// LspSymbol is a document symbol with a tree of children.
type LspSymbol struct {
	Name      string      `json:"name"`
	Kind      int         `json:"kind"`
	Path      string      `json:"path"`
	StartLine int         `json:"startLine"`
	StartCol  int         `json:"startCol"`
	EndLine   int         `json:"endLine"`
	EndCol    int         `json:"endCol"`
	Children  []LspSymbol `json:"children,omitempty"`
}

// LspDiagnostic is a diagnostic with severity/range/message.
type LspDiagnostic struct {
	StartLine int    `json:"startLine"`
	StartCol  int    `json:"startCol"`
	EndLine   int    `json:"endLine"`
	EndCol    int    `json:"endCol"`
	Severity  int    `json:"severity"`
	Message   string `json:"message"`
	Source    string `json:"source"`
	Code      string `json:"code,omitempty"`
}

// LspTextEdit represents a single text edit.
type LspTextEdit struct {
	StartLine int    `json:"startLine"`
	StartCol  int    `json:"startCol"`
	EndLine   int    `json:"endLine"`
	EndCol    int    `json:"endCol"`
	NewText   string `json:"newText"`
}

// LspFileEdit is a set of edits for one file.
type LspFileEdit struct {
	Path  string        `json:"path"`
	Edits []LspTextEdit `json:"edits"`
}

// LspWorkspaceEdit is a collection of file edits.
type LspWorkspaceEdit struct {
	Changes []LspFileEdit `json:"changes"`
}

// LspCodeAction represents a code action with optional workspace edit.
type LspCodeAction struct {
	Title string            `json:"title"`
	Kind  string            `json:"kind"`
	Edit  *LspWorkspaceEdit `json:"edit,omitempty"`
}

// QueuedMessage represents a chat message waiting in a session's queue.
type QueuedMessage struct {
	ID         string `json:"id"`
	Text       string `json:"text"`
	ProviderID string `json:"provider_id"`
	Model      string `json:"model"`
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
	CreatedAt  int64  `json:"created_at"`
}

// MediaThumbnail is one sampled frame in the response from
// App.GetMediaThumbnails. The URL is a data:image/jpeg;base64,... payload
// ready to drop into an <img src>.
type MediaThumbnail struct {
	T   float64 `json:"t"`
	URL string  `json:"url"`
}

// CopilotLoginInfo is returned by StartCopilotLogin.
type CopilotLoginInfo struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// CopilotTokenResult is returned by PollCopilotLogin.
type CopilotTokenResult struct {
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
	Status       string `json:"status"`
	Error        string `json:"error,omitempty"`
}
