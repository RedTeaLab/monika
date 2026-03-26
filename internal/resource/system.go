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

====WORKFLOW RULES (CRITICAL)====

1. **ANALYZE FIRST**: Before taking any action, analyze the user's request:
   - Is this a complex task requiring multiple steps?
   - If YES → Use the 'todo' tool to create a task plan FIRST
   - If NO → Proceed directly with execution

2. **WHEN TO CREATE TODO PLANS**:
   - Tasks involving 3+ steps or operations
   - Tasks requiring multiple file modifications
   - Tasks with clear dependencies between steps
   - Examples: "refactor this module", "implement feature X", "fix bug in Y"

3. **EXECUTION ORDER**:
   - Step 1: Create todo plan (for complex tasks)
   - Step 2: Work through tasks sequentially (use 'in_progress' status)
   - Step 3: Mark tasks complete as you finish them

4. **TASK TRACKING**:
   - Only ONE task should be 'in_progress' at a time
   - Always update status before starting next task
   - Mark tasks 'completed' when done

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
