package agent

type Agent struct {
	Name         string
	Description  string
	SystemPrompt string
	Model        string // "" = inherit from parent
	Provider     string // "" = inherit from parent
	Hidden       bool
}

type AgentRegistry struct {
	agents map[string]Agent
}

func NewAgentRegistry(agents []Agent) *AgentRegistry {
	r := &AgentRegistry{agents: make(map[string]Agent)}
	for _, a := range agents {
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
		if !includeHidden && a.Hidden {
			continue
		}
		out = append(out, a)
	}
	return out
}
