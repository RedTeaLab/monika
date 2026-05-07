package permission

import "encoding/json"

// Decision is the result of a permission check.
type Decision string

const (
	Allow Decision = "allow"
	Deny  Decision = "deny"
)

// Rule source constants.
const (
	SourceBuiltin = "builtin"
	SourceGlobal  = "global"
	SourceProject = "project"
)

// Mode is the session-level permission mode.
type Mode string

const (
	Auto   Mode = "auto"
	Manual Mode = "manual"
)

// Stage represents a single step in the permission pipeline.
type Stage interface {
	// Check returns nil if this stage does not intercept the call
	// (passes through to the next stage), or a Decision if it does.
	Check(ctx CheckContext) *Decision
}

// CheckContext carries all information a stage needs to make a decision.
type CheckContext struct {
	ToolName   string
	Args       json.RawMessage
	Mode       Mode
	SessionID  string
	ProjectDir string
}

// Rule is a single permission rule. Source indicates origin: builtin, global, or project.
type Rule struct {
	Tool      string `json:"tool"`
	Pattern   string `json:"pattern"`
	Decision  string `json:"decision"` // "allow" or "deny"
	Source    string `json:"source"`   // "builtin", "user_manual", "user_always"
	CreatedAt string `json:"createdAt,omitempty"`
}

// AuditEntry is a single audit log entry.
type AuditEntry struct {
	Stage        string `json:"stage"`
	Tool         string `json:"tool"`
	Mode         string `json:"mode"`
	Decision     string `json:"decision"`
	RuleMatched  string `json:"rule_matched,omitempty"`
	ModelVerdict string `json:"model_verdict,omitempty"`
	UserResponse string `json:"user_response,omitempty"`
	Timestamp    string `json:"timestamp"`
}

// PermissionRequiredEvent is sent from backend to frontend when Stage 3 is reached.
type PermissionRequiredEvent struct {
	Type      string `json:"type"` // "permission_required"
	SessionID string `json:"sessionId"`
	Tool      string `json:"tool"`
	Args      string `json:"args"`
	Reason    string `json:"reason"`
	Mode      string `json:"mode"` // "auto" or "manual"
	RequestID string `json:"requestId"` // unique ID for correlating response
}

// PermissionResponse is sent from frontend to backend.
type PermissionResponse struct {
	RequestID   string `json:"requestId"`
	Decision    string `json:"decision"` // "allow", "deny", "allow_always"
	RulePattern string `json:"rulePattern,omitempty"`
}
