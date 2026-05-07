package permission

import (
	"errors"
	"os"
	"path/filepath"

	"monika/internal/config"

	"gopkg.in/yaml.v3"
)

// LoadRules loads permission rules from config.yaml (global + project).
// Global rules are tagged "global", project rules are tagged "project".
func LoadRules(homeDir, projectDir string) ([]Rule, error) {
	globalCfg, err := config.Load(config.Options{HomeDir: homeDir})
	if err != nil {
		return nil, err
	}

	var rules []Rule
	for _, r := range globalCfg.Tools.Rules {
		rules = append(rules, Rule{
			Tool:     r.Tool,
			Pattern:  r.Pattern,
			Decision: r.Decision,
			Source:   SourceGlobal,
		})
	}

	if projectDir != "" {
		fullCfg, err := config.Load(config.Options{HomeDir: homeDir, ProjectDir: projectDir})
		if err != nil {
			return nil, err
		}
		nGlobal := len(globalCfg.Tools.Rules)
		for i := nGlobal; i < len(fullCfg.Tools.Rules); i++ {
			r := fullCfg.Tools.Rules[i]
			rules = append(rules, Rule{
				Tool:     r.Tool,
				Pattern:  r.Pattern,
				Decision: r.Decision,
				Source:   SourceProject,
			})
		}
	}

	return rules, nil
}

// AddRule adds a new permission rule to the appropriate config.yaml based on source.
func AddRule(homeDir, projectDir, tool, pattern, decision, source string) error {
	var cfgPath string
	if source == SourceGlobal {
		cfgPath = filepath.Join(homeDir, ".monika", "config.yaml")
	} else {
		cfgPath = filepath.Join(projectDir, ".monika", "config.yaml")
	}

	var cfg config.Config
	data, err := os.ReadFile(cfgPath)
	if err == nil {
		if err := yaml.Unmarshal(data, &cfg); err != nil {
			return err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	cfg.Tools.Rules = append(cfg.Tools.Rules, config.RuleConfig{
		Tool:     tool,
		Pattern:  pattern,
		Decision: decision,
	})

	data, err = yaml.Marshal(&cfg)
	if err != nil {
		return err
	}

	dir := filepath.Dir(cfgPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(cfgPath, data, 0o644)
}

// addAlwaysAllowRule appends a new allow rule to the project config.yaml.
func addAlwaysAllowRule(projectDir, tool, pattern string) error {
	return AddRule("", projectDir, tool, pattern, "allow", SourceProject)
}

// DeleteRule removes a rule from the appropriate config.yaml based on source.
// "global" rules are removed from ~/.monika/config.yaml.
// "project" rules are removed from <projectDir>/.monika/config.yaml.
func DeleteRule(homeDir, projectDir, tool, pattern, source string) error {
	var cfgPath string
	if source == SourceGlobal {
		cfgPath = filepath.Join(homeDir, ".monika", "config.yaml")
	} else {
		cfgPath = filepath.Join(projectDir, ".monika", "config.yaml")
	}

	var cfg config.Config
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return err
	}

	filtered := make([]config.RuleConfig, 0, len(cfg.Tools.Rules))
	for _, r := range cfg.Tools.Rules {
		if r.Tool == tool && r.Pattern == pattern {
			continue
		}
		filtered = append(filtered, r)
	}
	cfg.Tools.Rules = filtered

	data, err = yaml.Marshal(&cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(cfgPath, data, 0o644)
}

func init() {
	AddAlwaysAllowRule = addAlwaysAllowRule
}
