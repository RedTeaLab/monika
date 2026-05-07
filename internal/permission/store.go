package permission

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const rulesFile = "rules.json"

func LoadRules(homeDir, projectSlug string) ([]Rule, error) {
	path := filepath.Join(homeDir, ".monika", "projects", projectSlug, rulesFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var wrapper struct {
		ProjectSlug string `json:"projectSlug"`
		Rules       []Rule `json:"rules"`
	}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Rules, nil
}

func SaveRules(homeDir, projectSlug string, rules []Rule) error {
	dir := filepath.Join(homeDir, ".monika", "projects", projectSlug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(dir, rulesFile)
	wrapper := struct {
		ProjectSlug string `json:"projectSlug"`
		Rules       []Rule `json:"rules"`
	}{
		ProjectSlug: projectSlug,
		Rules:       rules,
	}
	data, err := json.MarshalIndent(wrapper, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func addAlwaysAllowRule(homeDir, projectSlug, tool, pattern string) error {
	rules, err := LoadRules(homeDir, projectSlug)
	if err != nil {
		return err
	}
	rules = append(rules, Rule{
		Tool:     tool,
		Pattern:  pattern,
		Decision: "allow",
		Source:   "user_always",
	})
	return SaveRules(homeDir, projectSlug, rules)
}

func init() {
	AddAlwaysAllowRule = addAlwaysAllowRule
}
