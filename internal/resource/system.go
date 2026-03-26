package resource

import (
	"fmt"
	"monika/internal/tools"
	"strings"
	"text/template"
)

type SystemContext struct {
	WorkingDir string
	Os         string
}

func GetSystemPrompt(ctx SystemContext) string {
	// Build tools list dynamically
	var toolsList strings.Builder
	for _, tool := range tools.TOOLS {
		fmt.Fprintf(&toolsList, "- %s: %s\n", tool.Name(), tool.Description())
	}

	tmpl := template.Must(template.New("system").Parse(`
You are a coding agent to solve coding tasks.

Action, No explanation, Just do it.

====BASE INFORMATION====

- working directory: {{.WorkingDir}}
- current os: {{.Os}}

====TOOLS====

You can use this tools:
{{.ToolsList}}
`))

	var result strings.Builder
	data := struct {
		WorkingDir string
		Os         string
		ToolsList  string
	}{
		WorkingDir: ctx.WorkingDir,
		Os:         ctx.Os,
		ToolsList:  toolsList.String(),
	}

	tmpl.Execute(&result, data)
	return result.String()
}
