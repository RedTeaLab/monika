package permission

import (
	"encoding/json"
	"testing"
)

func TestDecisionConstants(t *testing.T) {
	tests := []struct {
		name     string
		decision Decision
		want     string
	}{
		{"Allow", Allow, "allow"},
		{"Deny", Deny, "deny"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(tt.decision); got != tt.want {
				t.Errorf("Decision = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestModeConstants(t *testing.T) {
	tests := []struct {
		name string
		mode Mode
		want string
	}{
		{"Auto", Auto, "auto"},
		{"Manual", Manual, "manual"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(tt.mode); got != tt.want {
				t.Errorf("Mode = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPermissionRequiredEventRoundTrip(t *testing.T) {
	event := PermissionRequiredEvent{
		Type:      "permission_required",
		SessionID: "sess_abc123",
		Tool:      "bash",
		Args:      `ls -la`,
		Reason:    "Tool requires user approval",
		Mode:      "manual",
		RequestID: "req_456",
	}

	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("Marshal PermissionRequiredEvent: %v", err)
	}

	var decoded PermissionRequiredEvent
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal PermissionRequiredEvent: %v", err)
	}

	if decoded != event {
		t.Errorf("Round-trip mismatch:\ngot  %+v\nwant %+v", decoded, event)
	}
}

func TestPermissionResponseRoundTrip(t *testing.T) {
	response := PermissionResponse{
		RequestID:   "req_456",
		Decision:    "allow_always",
		RulePattern: "bash *",
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Marshal PermissionResponse: %v", err)
	}

	var decoded PermissionResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal PermissionResponse: %v", err)
	}

	if decoded != response {
		t.Errorf("Round-trip mismatch:\ngot  %+v\nwant %+v", decoded, response)
	}
}

func TestRuleRoundTrip(t *testing.T) {
	rule := Rule{
		Tool:      "bash",
		Pattern:   "ls *",
		Decision:  "allow",
		Source:    "user_manual",
		CreatedAt: "2025-01-01T00:00:00Z",
	}

	data, err := json.Marshal(rule)
	if err != nil {
		t.Fatalf("Marshal Rule: %v", err)
	}

	var decoded Rule
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal Rule: %v", err)
	}

	if decoded != rule {
		t.Errorf("Round-trip mismatch:\ngot  %+v\nwant %+v", decoded, rule)
	}
}

func TestRuleRoundTripOmitCreatedAt(t *testing.T) {
	rule := Rule{
		Tool:     "read",
		Pattern:  "*",
		Decision: "deny",
		Source:   "builtin",
	}

	data, err := json.Marshal(rule)
	if err != nil {
		t.Fatalf("Marshal Rule (omit CreatedAt): %v", err)
	}

	var decoded Rule
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal Rule (omit CreatedAt): %v", err)
	}

	if decoded != rule {
		t.Errorf("Round-trip mismatch:\ngot  %+v\nwant %+v", decoded, rule)
	}
}

func TestAuditEntryRoundTrip(t *testing.T) {
	entry := AuditEntry{
		Stage:        "hard_rule",
		Tool:         "bash",
		Mode:         "auto",
		Decision:     "allow",
		RuleMatched:  "bash ls *",
		ModelVerdict: "",
		UserResponse: "",
		Timestamp:    "2025-01-01T00:00:00Z",
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("Marshal AuditEntry: %v", err)
	}

	var decoded AuditEntry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal AuditEntry: %v", err)
	}

	if decoded != entry {
		t.Errorf("Round-trip mismatch:\ngot  %+v\nwant %+v", decoded, entry)
	}
}

func TestAuditEntryRoundTripOmitEmpty(t *testing.T) {
	entry := AuditEntry{
		Stage:     "model",
		Tool:      "read",
		Mode:      "auto",
		Decision:  "deny",
		Timestamp: "2025-06-01T12:00:00Z",
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("Marshal AuditEntry (omitempty): %v", err)
	}

	var decoded AuditEntry
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Unmarshal AuditEntry (omitempty): %v", err)
	}

	if decoded != entry {
		t.Errorf("Round-trip mismatch:\ngot  %+v\nwant %+v", decoded, entry)
	}
}
