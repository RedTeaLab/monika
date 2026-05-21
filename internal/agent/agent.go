package agent

import "monika/internal/config"

type Agent struct {
	Name         string            `json:"name"`
	Description  string            `json:"description,omitempty"`
	SystemPrompt string            `json:"systemPrompt,omitempty"`
	Model        string            `json:"model,omitempty"`   // "provider/model"，空则继承
	Provider     string            `json:"provider,omitempty"` // 保留兼容
	Temperature  *float64          `json:"temperature,omitempty"` // nil 用默认
	Hidden       bool              `json:"hidden,omitempty"`
	Disabled     bool              `json:"disabled,omitempty"` // 内置 agent 被 config 禁用
	Permission   map[string]string `json:"permission,omitempty"` // tool → allow/ask/deny
	IsCustom     bool              `json:"isCustom"`
	Source       string            `json:"source"` // "builtin" | "custom"
}

type AgentRegistry struct {
	agents map[string]Agent
}

func NewAgentRegistry(agents []Agent) *AgentRegistry {
	r := &AgentRegistry{agents: make(map[string]Agent)}
	for _, a := range agents {
		if a.Source == "" {
			a.Source = "builtin"
		}
		r.agents[a.Name] = a
	}
	return r
}

func (r *AgentRegistry) Get(name string) (Agent, bool) {
	a, ok := r.agents[name]
	return a, ok
}

func (r *AgentRegistry) List(includeHidden bool) []Agent {
	var out []Agent
	for _, a := range r.agents {
		if a.Disabled {
			continue
		}
		if !includeHidden && a.Hidden {
			continue
		}
		out = append(out, a)
	}
	return out
}

func (r *AgentRegistry) GetAll() []Agent {
	out := make([]Agent, 0, len(r.agents))
	for _, a := range r.agents {
		out = append(out, a)
	}
	return out
}

// MergeConfig loads agents from config entries. Config agents with the same
// name override built-in fields. Config agents with Disabled=true mark
// built-in agents as disabled. Config agents with new names are added as IsCustom=true.
func (r *AgentRegistry) MergeConfig(entries []config.AgentEntry) {
	for _, e := range entries {
		if existing, ok := r.agents[e.Name]; ok {
			if e.Disabled {
				existing.Disabled = true
				r.agents[e.Name] = existing
				continue
			}
			// merge config fields into existing
			if e.Description != "" {
				existing.Description = e.Description
			}
			if e.Model != "" {
				existing.Model = e.Model
			}
			if e.SystemPrompt != "" {
				existing.SystemPrompt = e.SystemPrompt
			}
			if e.Temperature != nil {
				existing.Temperature = e.Temperature
			}
			if e.Hidden {
				existing.Hidden = true
			}
			if e.Permission != nil {
				existing.Permission = e.Permission
			}
			r.agents[e.Name] = existing
		} else if !e.Disabled {
			r.agents[e.Name] = Agent{
				Name:         e.Name,
				Description:  e.Description,
				SystemPrompt: e.SystemPrompt,
				Model:        e.Model,
				Temperature:  e.Temperature,
				Hidden:       e.Hidden,
				Permission:   e.Permission,
				IsCustom:     true,
				Source:       "custom",
			}
		}
	}
}
