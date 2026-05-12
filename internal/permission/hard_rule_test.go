package permission

import (
	"encoding/json"
	"testing"
)

func denyPtr() *Decision {
	d := Deny
	return &d
}

func allowPtr() *Decision {
	d := Allow
	return &d
}

func TestUserRulesPrefixMatch(t *testing.T) {
	tests := []struct {
		name     string
		rules    []Rule
		ctx      CheckContext
		expected *Decision
	}{
		{
			name: "npm test prefix matches npm test --coverage",
			rules: []Rule{
				{Tool: "bash", Pattern: "npm test", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "bash",
				Args:     json.RawMessage(`{"command": "npm test -- --coverage"}`),
			},
			expected: allowPtr(),
		},
		{
			name: "npm prefix matches npm install",
			rules: []Rule{
				{Tool: "bash", Pattern: "npm", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "bash",
				Args:     json.RawMessage(`{"command": "npm install"}`),
			},
			expected: allowPtr(),
		},
	}

	engine := NewHardRuleEngine(nil, "/test/project")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine.rules = tt.rules
			got := engine.Check(tt.ctx)
			if got == nil {
				t.Fatal("Check returned nil, want Decision")
			}
			if *got != *tt.expected {
				t.Errorf("Check = %v, want %v", *got, *tt.expected)
			}
		})
	}
}

func TestUserRulesWildcardMatch(t *testing.T) {
	tests := []struct {
		name     string
		rules    []Rule
		ctx      CheckContext
		expected *Decision
	}{
		{
			name: "git * matches git status",
			rules: []Rule{
				{Tool: "bash", Pattern: "git *", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "bash",
				Args:     json.RawMessage(`{"command": "git status"}`),
			},
			expected: allowPtr(),
		},
		{
			name: "git * matches git commit -m foo",
			rules: []Rule{
				{Tool: "bash", Pattern: "git *", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "bash",
				Args:     json.RawMessage(`{"command": "git commit -m foo"}`),
			},
			expected: allowPtr(),
		},
	}

	engine := NewHardRuleEngine(nil, "/test/project")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine.rules = tt.rules
			got := engine.Check(tt.ctx)
			if got == nil {
				t.Fatal("Check returned nil, want Decision")
			}
			if *got != *tt.expected {
				t.Errorf("Check = %v, want %v", *got, *tt.expected)
			}
		})
	}
}

func TestUserRulesNoMatch(t *testing.T) {
	tests := []struct {
		name  string
		rules []Rule
		ctx   CheckContext
	}{
		{
			name: "npm test rule does not match npm run",
			rules: []Rule{
				{Tool: "bash", Pattern: "npm test", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "bash",
				Args:     json.RawMessage(`{"command": "npm run"}`),
			},
		},
		{
			name: "bash rule does not match non-bash command",
			rules: []Rule{
				{Tool: "bash", Pattern: "ls", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "read",
				Args:     json.RawMessage(`{"path": "/test/file"}`),
			},
		},
	}

	engine := NewHardRuleEngine(nil, "/test/project")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine.rules = tt.rules
			got := engine.Check(tt.ctx)
			if got != nil {
				t.Errorf("Check = %v, want nil", *got)
			}
		})
	}
}

func TestUserRulesPriority(t *testing.T) {
	tests := []struct {
		name     string
		rules    []Rule
		ctx      CheckContext
		expected *Decision
	}{
		{
			name: "deny before allow - first matching rule wins",
			rules: []Rule{
				{Tool: "bash", Pattern: "npm *", Decision: "deny", Source: "user"},
				{Tool: "bash", Pattern: "npm test", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "bash",
				Args:     json.RawMessage(`{"command": "npm test"}`),
			},
			expected: denyPtr(),
		},
		{
			name: "allow before deny - first matching rule wins",
			rules: []Rule{
				{Tool: "bash", Pattern: "npm test", Decision: "allow", Source: "user"},
				{Tool: "bash", Pattern: "npm *", Decision: "deny", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "bash",
				Args:     json.RawMessage(`{"command": "npm test"}`),
			},
			expected: allowPtr(),
		},
	}

	engine := NewHardRuleEngine(nil, "/test/project")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine.rules = tt.rules
			got := engine.Check(tt.ctx)
			if got == nil {
				t.Fatal("Check returned nil, want Decision")
			}
			if *got != *tt.expected {
				t.Errorf("Check = %v, want %v", *got, *tt.expected)
			}
		})
	}
}

func TestFileWriteRule(t *testing.T) {
	tests := []struct {
		name     string
		rules    []Rule
		ctx      CheckContext
		expected *Decision
	}{
		{
			name: "file_write path prefix match",
			rules: []Rule{
				{Tool: "file_write", Pattern: "src/", Decision: "deny", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "file_write",
				Args:     json.RawMessage(`{"path": "src/main.go"}`),
			},
			expected: denyPtr(),
		},
		{
			name: "file_write wildcard match",
			rules: []Rule{
				{Tool: "file_write", Pattern: "src/*", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "file_write",
				Args:     json.RawMessage(`{"path": "src/main.go"}`),
			},
			expected: allowPtr(),
		},
		{
			name: "file_write no match for different path",
			rules: []Rule{
				{Tool: "file_write", Pattern: "src/", Decision: "deny", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "file_write",
				Args:     json.RawMessage(`{"path": "dist/output.js"}`),
			},
			expected: nil,
		},
	}

	engine := NewHardRuleEngine(nil, "/test/project")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine.rules = tt.rules
			got := engine.Check(tt.ctx)
			if tt.expected == nil {
				if got != nil {
					t.Errorf("Check = %v, want nil", *got)
				}
				return
			}
			if got == nil {
				t.Fatal("Check returned nil, want Decision")
			}
			if *got != *tt.expected {
				t.Errorf("Check = %v, want %v", *got, *tt.expected)
			}
		})
	}
}

func TestFileEditRule(t *testing.T) {
	tests := []struct {
		name     string
		rules    []Rule
		ctx      CheckContext
		expected *Decision
	}{
		{
			name: "file_edit path prefix match",
			rules: []Rule{
				{Tool: "file_edit", Pattern: "src/", Decision: "deny", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "file_edit",
				Args:     json.RawMessage(`{"path": "src/main.go"}`),
			},
			expected: denyPtr(),
		},
		{
			name: "file_edit wildcard match",
			rules: []Rule{
				{Tool: "file_edit", Pattern: "src/*", Decision: "allow", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "file_edit",
				Args:     json.RawMessage(`{"path": "src/main.go"}`),
			},
			expected: allowPtr(),
		},
		{
			name: "file_edit no match for different path",
			rules: []Rule{
				{Tool: "file_edit", Pattern: "src/", Decision: "deny", Source: "user"},
			},
			ctx: CheckContext{
				ToolName: "file_edit",
				Args:     json.RawMessage(`{"path": "dist/output.js"}`),
			},
			expected: nil,
		},
	}

	engine := NewHardRuleEngine(nil, "/test/project")
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine.rules = tt.rules
			got := engine.Check(tt.ctx)
			if tt.expected == nil {
				if got != nil {
					t.Errorf("Check = %v, want nil", *got)
				}
				return
			}
			if got == nil {
				t.Fatal("Check returned nil, want Decision")
			}
			if *got != *tt.expected {
				t.Errorf("Check = %v, want %v", *got, *tt.expected)
			}
		})
	}
}
