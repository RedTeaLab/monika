package permission

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ConfirmUI abstracts the frontend confirmation interface.
type ConfirmUI interface {
	RequestConfirm(ctx context.Context, ev PermissionRequiredEvent) (PermissionResponse, error)
}

// AddAlwaysAllowRule persists a new allow_always rule to rules.json.
// Set by store.go via init. Nil means persistence is not available.
var AddAlwaysAllowRule func(homeDir, projectSlug, tool, pattern string) error

var readOps = map[string]bool{
	"file_read": true,
	"grep":      true,
	"glob":      true,
	"file_list": true,
}

var writeOps = map[string]bool{
	"bash":        true,
	"file_write":  true,
	"file_edit":   true,
	"task_create": true,
	"task_update": true,
	"spawn_agent": true,
}

// Pipeline ties together HardRuleEngine, SecurityModel, and ConfirmUI
// into a single permission check orchestrator.
type Pipeline struct {
	mode        Mode
	rules       *HardRuleEngine
	security    *SecurityModel
	confirmUI   ConfirmUI
	auditLog    string
	homeDir     string
	projectSlug string
}

// NewPipeline creates a new Pipeline.
func NewPipeline(mode Mode, rules *HardRuleEngine, security *SecurityModel, confirmUI ConfirmUI) *Pipeline {
	return &Pipeline{
		mode:      mode,
		rules:     rules,
		security:  security,
		confirmUI: confirmUI,
	}
}

// SetProject configures project-specific paths for audit logging and rule persistence.
func (p *Pipeline) SetProject(homeDir, projectDir string) {
	p.homeDir = homeDir
	p.projectSlug = filepath.Base(projectDir)
	p.auditLog = filepath.Join(homeDir, ".monika", "projects", p.projectSlug, "audit.log")
}

// Check runs the full permission pipeline and returns a Decision.
func (p *Pipeline) Check(ctx context.Context, cctx CheckContext) Decision {
	// Read ops bypass permission checks entirely in Auto mode
	if p.mode == Auto && readOps[cctx.ToolName] {
		p.logAudit(cctx, Allow, "read_op_bypass", "", "")
		return Allow
	}

	// Stage 0: Built-in blacklist pre-filter (all modes)
	if p.rules != nil {
		if d := p.rules.CheckBuiltinBlacklist(cctx); d != nil {
			p.logAudit(cctx, *d, "builtin_blacklist", "", "")
			return *d
		}
	}

	if p.mode == Auto {
		return p.checkAuto(ctx, cctx)
	}
	return p.checkManual(ctx, cctx)
}

func (p *Pipeline) checkAuto(ctx context.Context, cctx CheckContext) Decision {
	// Stage 1: User rules
	if p.rules != nil {
		if d := p.rules.Check(cctx); d != nil {
			p.logAudit(cctx, *d, "hard_rule", "", "")
			return *d
		}
	}

	// Stage 2: Security model (write ops only)
	if p.security != nil && writeOps[cctx.ToolName] {
		verdict, reason := p.security.Check(ctx, cctx)
		if verdict == "safe" {
			p.logAudit(cctx, Allow, "security_model", reason, "")
			return Allow
		}
		return p.requestConfirm(ctx, cctx, reason)
	}

	// No security model: go to confirmation
	return p.requestConfirm(ctx, cctx, "security model unavailable")
}

func (p *Pipeline) checkManual(ctx context.Context, cctx CheckContext) Decision {
	return p.requestConfirm(ctx, cctx, "")
}

func (p *Pipeline) requestConfirm(ctx context.Context, cctx CheckContext, reason string) Decision {
	if p.confirmUI == nil {
		p.logAudit(cctx, Deny, "no_confirm_ui", reason, "")
		return Deny
	}

	ev := PermissionRequiredEvent{
		Type:      "permission_required",
		SessionID: cctx.SessionID,
		Tool:      cctx.ToolName,
		Args:      string(cctx.Args),
		Reason:    reason,
		Mode:      string(p.mode),
		RequestID: fmt.Sprintf("perm-%d", time.Now().UnixNano()),
	}

	resp, err := p.confirmUI.RequestConfirm(ctx, ev)
	if err != nil {
		p.logAudit(cctx, Deny, "confirm_error", reason, err.Error())
		return Deny
	}

	decision := Allow
	if resp.Decision == "deny" {
		decision = Deny
	}

	userResp := resp.Decision
	if resp.Decision == "allow_always" {
		pattern := resp.RulePattern
		if pattern == "" && cctx.ToolName == "bash" {
			pattern = p.extractBashCommand(cctx)
		}
		if pattern != "" && p.homeDir != "" && p.projectSlug != "" && AddAlwaysAllowRule != nil {
			_ = AddAlwaysAllowRule(p.homeDir, p.projectSlug, cctx.ToolName, pattern)
		}
		userResp = "allow_always"
	}

	p.logAudit(cctx, decision, "user_confirmation", reason, userResp)
	return decision
}

// extractBashCommand extracts the command string from bash tool args.
func (p *Pipeline) extractBashCommand(cctx CheckContext) string {
	var args map[string]any
	if err := json.Unmarshal(cctx.Args, &args); err != nil {
		return ""
	}
	if cmd, ok := args["command"].(string); ok {
		return cmd
	}
	return ""
}

func (p *Pipeline) logAudit(cctx CheckContext, decision Decision, stage, modelVerdict, userResponse string) {
	if p.auditLog == "" {
		return
	}
	entry := AuditEntry{
		Stage:        stage,
		Tool:         cctx.ToolName,
		Mode:         string(p.mode),
		Decision:     string(decision),
		ModelVerdict: modelVerdict,
		UserResponse: userResponse,
		Timestamp:    time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.Marshal(entry)
	os.MkdirAll(filepath.Dir(p.auditLog), 0o755)
	f, err := os.OpenFile(p.auditLog, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	f.Write(append(data, '\n'))
}
