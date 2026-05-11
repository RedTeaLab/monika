package permission

import (
	"encoding/json"
	"strings"
)

// HardRuleEngine implements the hard rule stage of the permission pipeline.
// It checks both a built-in blacklist (for all modes) and user-defined rules.
type HardRuleEngine struct {
	rules      []Rule
	projectDir string
	blacklist  []Rule
}

// NewHardRuleEngine creates a new HardRuleEngine with the given user rules and project directory.
func NewHardRuleEngine(userRules []Rule, projectDir string) *HardRuleEngine {
	return &HardRuleEngine{
		rules:      userRules,
		projectDir: projectDir,
		blacklist: []Rule{
			{Tool: "bash", Pattern: "rm -rf", Decision: "deny", Source: SourceBuiltin},
			{Tool: "bash", Pattern: "curl ", Decision: "deny", Source: SourceBuiltin},
			{Tool: "bash", Pattern: "chmod 777", Decision: "deny", Source: SourceBuiltin},
			{Tool: "bash", Pattern: "wget ", Decision: "deny", Source: SourceBuiltin},
			{Tool: "bash", Pattern: "nc ", Decision: "deny", Source: SourceBuiltin},
		},
	}
}

// CheckBuiltinBlacklist checks only the built-in blacklist.
// Returns Deny on match, nil otherwise.
func (e *HardRuleEngine) CheckBuiltinBlacklist(ctx CheckContext) *Decision {
	for _, r := range e.blacklist {
		if e.matchRule(r, ctx) {
			d := Deny
			return &d
		}
	}
	return nil
}

// Check checks user-defined rules.
// Returns Allow/Ask/Deny on match, nil otherwise.
func (e *HardRuleEngine) Check(ctx CheckContext) *Decision {
	for _, r := range e.rules {
		if e.matchRule(r, ctx) {
			d := Decision(r.Decision)
			return &d
		}
	}
	return nil
}

// BuiltinRules returns a copy of the built-in blacklist rules.
func (e *HardRuleEngine) BuiltinRules() []Rule {
	result := make([]Rule, len(e.blacklist))
	copy(result, e.blacklist)
	return result
}

// matchRule checks if a rule matches the given context.
func (e *HardRuleEngine) matchRule(r Rule, ctx CheckContext) bool {
	if r.Tool != ctx.ToolName {
		return false
	}
	value := e.extractMatchValue(ctx)
	if value == "" {
		return false
	}
	pattern := strings.TrimSpace(r.Pattern)
	if strings.HasSuffix(pattern, "*") {
		prefix := strings.TrimSuffix(pattern, "*")
		return strings.HasPrefix(value, prefix)
	}
	return strings.HasPrefix(value, pattern)
}

// extractMatchValue extracts the relevant value from the context args for matching.
func (e *HardRuleEngine) extractMatchValue(ctx CheckContext) string {
	var args map[string]any
	if err := json.Unmarshal(ctx.Args, &args); err != nil {
		return ""
	}
	switch ctx.ToolName {
	case "bash":
		if cmd, ok := args["command"].(string); ok {
			return cmd
		}
	case "file_write", "file_edit":
		if path, ok := args["path"].(string); ok {
			return path
		}
	}
	return ""
}
