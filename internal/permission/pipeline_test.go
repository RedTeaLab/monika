package permission

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// mockConfirmUI is a test double for the ConfirmUI interface.
type mockConfirmUI struct {
	response PermissionResponse
	err      error
}

func (m *mockConfirmUI) RequestConfirm(ctx context.Context, ev PermissionRequiredEvent) (PermissionResponse, error) {
	return m.response, m.err
}

func TestPipeline_Auto_ReadOp_Bypass(t *testing.T) {
	tests := []struct {
		toolName string
		args     json.RawMessage
	}{
		{"file_read", json.RawMessage(`{"path": "/test/file"}`)},
		{"grep", json.RawMessage(`{"pattern": "foo"}`)},
		{"glob", json.RawMessage(`{"pattern": "*.go"}`)},
		{"file_list", json.RawMessage(`{"path": "/test"}`)},
	}

	for _, tt := range tests {
		t.Run(tt.toolName, func(t *testing.T) {
			rules := NewHardRuleEngine(nil, "/test/project")
			security := NewSecurityModel(nil, "")
			mock := &mockConfirmUI{
				response: PermissionResponse{Decision: "deny"},
			}

			p := NewPipeline(Auto, rules, security, mock)
			p.SetProject("/tmp", "/test/project")

			cctx := CheckContext{
				ToolName: tt.toolName,
				Args:     tt.args,
				SessionID: "sess_1",
			}

			got := p.Check(context.Background(), cctx)
			if got != Allow {
				t.Errorf("Check(%s) = %v, want %v (read ops should bypass in Auto)", tt.toolName, got, Allow)
			}
		})
	}
}

func TestPipeline_Auto_BuiltinBlacklist_Deny(t *testing.T) {
	rules := NewHardRuleEngine(nil, "/test/project")
	security := NewSecurityModel(nil, "")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Auto, rules, security, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "rm -rf /"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Deny {
		t.Errorf("Check(rm -rf) = %v, want %v (builtin blacklist must deny even in Auto)", got, Deny)
	}
}

func TestPipeline_Manual_BuiltinBlacklist_Deny(t *testing.T) {
	rules := NewHardRuleEngine(nil, "/test/project")
	security := NewSecurityModel(nil, "")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Manual, rules, security, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "rm -rf /"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Deny {
		t.Errorf("Check(rm -rf in Manual) = %v, want %v (builtin blacklist must deny in Manual too)", got, Deny)
	}
}

func TestPipeline_Auto_UserRule_Allow(t *testing.T) {
	userRules := []Rule{
		{Tool: "bash", Pattern: "npm test", Decision: "allow", Source: "user_always"},
	}
	rules := NewHardRuleEngine(userRules, "/test/project")
	security := NewSecurityModel(nil, "")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "deny"},
	}

	p := NewPipeline(Auto, rules, security, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "npm test"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check(npm test with allow rule) = %v, want %v", got, Allow)
	}
}

func TestPipeline_Auto_UserRule_Deny(t *testing.T) {
	userRules := []Rule{
		{Tool: "bash", Pattern: "npm test", Decision: "deny", Source: "user_always"},
	}
	rules := NewHardRuleEngine(userRules, "/test/project")
	security := NewSecurityModel(nil, "")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Auto, rules, security, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "npm test"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Deny {
		t.Errorf("Check(npm test with deny rule) = %v, want %v", got, Deny)
	}
}

func TestPipeline_Manual_ConfirmUI_Allow(t *testing.T) {
	rules := NewHardRuleEngine(nil, "/test/project")
	security := NewSecurityModel(nil, "")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Manual, rules, security, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "npm test"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check(Manual with allow confirm) = %v, want %v", got, Allow)
	}
}

func TestPipeline_Manual_ConfirmUI_Deny(t *testing.T) {
	rules := NewHardRuleEngine(nil, "/test/project")
	security := NewSecurityModel(nil, "")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "deny"},
	}

	p := NewPipeline(Manual, rules, security, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "rm -r node_modules"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Deny {
		t.Errorf("Check(Manual with deny confirm) = %v, want %v", got, Deny)
	}
}

func TestPipeline_Auto_NoMatch_GoesToConfirm(t *testing.T) {
	// No user rules, no security model — should fall through to confirm UI
	rules := NewHardRuleEngine(nil, "/test/project")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Auto, rules, nil, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "echo hello"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check(Auto no match) = %v, want %v (should go to confirm UI)", got, Allow)
	}
}

func TestPipeline_ReadOp_Manual_Confirm(t *testing.T) {
	// In manual mode, even read ops should go to confirm UI
	rules := NewHardRuleEngine(nil, "/test/project")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Manual, rules, nil, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "file_read",
		Args:      json.RawMessage(`{"path": "/test/file"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check(Manual file_read) = %v, want %v (read ops should confirm in Manual)", got, Allow)
	}
}

func TestPipeline_NoConfirmUI_Deny(t *testing.T) {
	rules := NewHardRuleEngine(nil, "/test/project")

	p := NewPipeline(Manual, rules, nil, nil)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "echo hello"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Deny {
		t.Errorf("Check(nil confirmUI) = %v, want %v", got, Deny)
	}
}

func TestPipeline_ConfirmUI_Error_Deny(t *testing.T) {
	rules := NewHardRuleEngine(nil, "/test/project")
	mock := &mockConfirmUI{
		err: fmt.Errorf("timeout"),
	}

	p := NewPipeline(Manual, rules, nil, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "echo hello"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Deny {
		t.Errorf("Check(confirm error) = %v, want %v", got, Deny)
	}
}

func TestPipeline_Auto_SecurityModel_Denied(t *testing.T) {
	// Security model checks write ops in degraded mode (returns "unsafe"),
	// then falls through to confirm UI. If confirm UI denies, result is Deny.
	rules := NewHardRuleEngine(nil, "/test/project")
	security := NewSecurityModel(nil, "") // degraded mode: returns "unsafe"
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "deny"},
	}

	p := NewPipeline(Auto, rules, security, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "echo hello"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Deny {
		t.Errorf("Check(Auto security degraded + confirm deny) = %v, want %v", got, Deny)
	}
}

func TestPipeline_Auto_SecurityModel_Nil_FallsToConfirm(t *testing.T) {
	// When security model is nil and write op has no matching user rules,
	// the pipeline falls through to requestConfirm.
	rules := NewHardRuleEngine(nil, "/test/project")
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Auto, rules, nil, mock)
	p.SetProject("/tmp", "/test/project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "echo hello"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check(Auto no security + confirm allow) = %v, want %v", got, Allow)
	}
}

func TestPipeline_AllowAlways_PersistsRule(t *testing.T) {
	savedRule := ""
	oldFunc := AddAlwaysAllowRule
	AddAlwaysAllowRule = func(projectDir, tool, pattern string) error {
		savedRule = fmt.Sprintf("%s:%s:%s", projectDir, tool, pattern)
		return nil
	}
	defer func() { AddAlwaysAllowRule = oldFunc }()

	rules := NewHardRuleEngine(nil, "/test/project")
	mock := &mockConfirmUI{
		response: PermissionResponse{
			Decision:    "allow_always",
			RulePattern: "npm test",
		},
	}

	p := NewPipeline(Auto, rules, nil, mock)
	p.SetProject("/home/user", "/home/user/projects/my-project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "npm test"}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check(allow_always) = %v, want %v", got, Allow)
	}
	if savedRule == "" {
		t.Error("allow_always should persist the rule via AddAlwaysAllowRule")
	}
}

func TestPipeline_AllowAlways_ExtractsBashCommand(t *testing.T) {
	savedRule := ""
	oldFunc := AddAlwaysAllowRule
	AddAlwaysAllowRule = func(projectDir, tool, pattern string) error {
		savedRule = fmt.Sprintf("%s:%s:%s", projectDir, tool, pattern)
		return nil
	}
	defer func() { AddAlwaysAllowRule = oldFunc }()

	rules := NewHardRuleEngine(nil, "/test/project")
	mock := &mockConfirmUI{
		response: PermissionResponse{
			Decision:    "allow_always",
			RulePattern: "", // empty -> should extract from bash args
		},
	}

	p := NewPipeline(Auto, rules, nil, mock)
	p.SetProject("/home/user", "/home/user/projects/my-project")

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "go test ./..."}`),
		SessionID: "sess_1",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check(allow_always extract) = %v, want %v", got, Allow)
	}
	if savedRule == "" {
		t.Error("allow_always should persist rule with extracted pattern when RulePattern is empty")
	} else if savedRule != "/home/user/projects/my-project:bash:go test ./..." {
		t.Errorf("savedRule = %q, want %q", savedRule, "/home/user/projects/my-project:bash:go test ./...")
	}
}

func TestPipeline_AuditLog_Written(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "pipeline-audit-*")
	if err != nil {
		t.Fatalf("MkdirTemp: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	projectDir := filepath.Join(tmpDir, "test-project")

	rules := NewHardRuleEngine(nil, projectDir)
	mock := &mockConfirmUI{
		response: PermissionResponse{Decision: "allow"},
	}

	p := NewPipeline(Auto, rules, nil, mock)
	p.SetProject(tmpDir, projectDir)

	cctx := CheckContext{
		ToolName:  "bash",
		Args:      json.RawMessage(`{"command": "go build"}`),
		SessionID: "sess_audit",
	}

	got := p.Check(context.Background(), cctx)
	if got != Allow {
		t.Errorf("Check = %v, want %v", got, Allow)
	}

	// Verify audit log was created and has content
	auditPath := filepath.Join(tmpDir, ".monika", "projects", "test-project", "audit.log")
	data, err := os.ReadFile(auditPath)
	if err != nil {
		t.Fatalf("ReadFile audit log: %v", err)
	}
	if len(data) == 0 {
		t.Error("audit log should not be empty")
	}

	// Verify it's valid JSON
	var entry AuditEntry
	if err := json.Unmarshal(data[:len(data)-1], &entry); err != nil { // -1 to strip newline
		t.Errorf("audit log entry is not valid JSON: %v", err)
	}
	if entry.Stage != "user_confirmation" {
		t.Errorf("audit stage = %q, want %q", entry.Stage, "user_confirmation")
	}
	if entry.Tool != "bash" {
		t.Errorf("audit tool = %q, want %q", entry.Tool, "bash")
	}
	if entry.Decision != string(Allow) {
		t.Errorf("audit decision = %q, want %q", entry.Decision, string(Allow))
	}
}

func TestPipeline_SetProject(t *testing.T) {
	p := NewPipeline(Auto, nil, nil, nil)
	p.SetProject("/home/user", "/home/user/projects/hello-world")

	if p.homeDir != "/home/user" {
		t.Errorf("homeDir = %q, want %q", p.homeDir, "/home/user")
	}
	if p.projectSlug != "hello-world" {
		t.Errorf("projectSlug = %q, want %q", p.projectSlug, "hello-world")
	}
	expectedAuditLog := filepath.Join("/home/user", ".monika", "projects", "hello-world", "audit.log")
	if p.auditLog != expectedAuditLog {
		t.Errorf("auditLog = %q, want %q", p.auditLog, expectedAuditLog)
	}
}

func TestPipeline_ExtractBashCommand(t *testing.T) {
	tests := []struct {
		name string
		args json.RawMessage
		want string
	}{
		{
			name: "simple command",
			args: json.RawMessage(`{"command": "ls -la"}`),
			want: "ls -la",
		},
		{
			name: "no command field",
			args: json.RawMessage(`{"path": "/tmp/file"}`),
			want: "",
		},
		{
			name: "invalid json",
			args: json.RawMessage(`not json`),
			want: "",
		},
		{
			name: "command with nested quotes",
			args: json.RawMessage(`{"command": "echo \"hello world\""}`),
			want: "echo \"hello world\"",
		},
	}

	p := NewPipeline(Auto, nil, nil, nil)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cctx := CheckContext{Args: tt.args, ToolName: "bash"}
			got := p.extractBashCommand(cctx)
			if got != tt.want {
				t.Errorf("extractBashCommand() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPipeline_Auto_ReadOpsAreComplete(t *testing.T) {
	// Verify all read ops defined in the pipeline match our expectations
	expectedReadOps := []string{"file_read", "grep", "glob", "file_list"}
	for _, op := range expectedReadOps {
		if !readOps[op] {
			t.Errorf("readOps missing %q", op)
		}
	}
}

func TestPipeline_Auto_WriteOpsAreComplete(t *testing.T) {
	// Verify all write ops defined in the pipeline match our expectations
	expectedWriteOps := []string{"bash", "file_write", "file_edit", "task_create", "task_update", "spawn_agent"}
	for _, op := range expectedWriteOps {
		if !writeOps[op] {
			t.Errorf("writeOps missing %q", op)
		}
	}
}
