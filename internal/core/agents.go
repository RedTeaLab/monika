package core

import (
	"context"
	"encoding/json"
	"fmt"
	"monika/internal/option"
	"monika/internal/resource"
	"monika/internal/tools"
	"os"
	"runtime"
	"strings"

	opt "github.com/openai/openai-go/v3/option"

	"github.com/openai/openai-go/v3"
)

type Agents interface {
	Invoke(message string)
}

type agent struct {
	Config       *option.Config
	Context      context.Context
	Tools        []openai.ChatCompletionToolUnionParam
	Excute       map[string]func(args ...string) string
	RoundCounter int            // Counts LLM response cycles (User->LLM->Tools->Results)
	LastTodoCall int            // The round number when todo was last called (-1 = never)
	Messages     []openai.ChatCompletionMessageParamUnion
}

// NewAgent creates a new agent by loading config from INI file and environment variables.
func NewAgent() Agents {
	cfg := option.Load()

	return &agent{
		Config:       cfg,
		Context:      context.Background(),
		Tools:        []openai.ChatCompletionToolUnionParam{},
		Excute:       make(map[string]func(args ...string) string),
		RoundCounter: 0,
		LastTodoCall: -1,
		Messages:     []openai.ChatCompletionMessageParamUnion{},
	}
}

func (a *agent) client() openai.Client {
	return openai.NewClient(
		opt.WithBaseURL(a.Config.BaseUrl),
		opt.WithAPIKey(a.Config.ApiKey),
	)
}

func (a *agent) addTool() {
	for _, tool := range tools.TOOLS {
		a.Tools = append(a.Tools, openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
			Name:        tool.Name(),
			Description: openai.String(tool.Description()),
			Parameters:  tool.Parameters(),
		}))
	}
}

func (a *agent) addExecute() {
	for _, tool := range tools.TOOLS {
		a.Excute[tool.Name()] = tool.Execute
	}
}

// showTaskProgress displays a compact task progress bar at the bottom
func (a *agent) showTaskProgress() {
	tm := tools.GetTodoManager()
	items := tm.GetItems()

	if len(items) == 0 {
		return
	}

	// Count by status
	var completed, inProgress, pending int
	for _, item := range items {
		switch item.Status {
		case tools.StatusCompleted:
			completed++
		case tools.StatusInProgress:
			inProgress++
		case tools.StatusPending:
			pending++
		}
	}

	total := len(items)

	// Calculate progress percentage
	percentage := float64(completed) / float64(total) * 100

	// Build progress bar (width 30)
	barWidth := 30
	filled := int(float64(barWidth) * percentage / 100)
	progressBar := strings.Repeat("=", filled) + strings.Repeat(" ", barWidth-filled)

	// Display progress bar
	fmt.Printf("\n\033[36m[PROGRESS] [%s] %.0f%% (%d/%d done)\033[0m\n",
		progressBar, percentage, completed, total)

	// Show current task info
	if inProgress > 0 {
		currentItem := tm.GetInProgressItem()
		fmt.Printf("\033[33m[> NOW] %s\033[0m\n", currentItem.Task)
	}
	if pending > 0 {
		fmt.Printf("\033[90m[TODO] %d pending\033[0m\n", pending)
	}

	fmt.Println() // Empty line for separation
}

// shouldInjectNagReminder checks if we need to inject a reminder about todos
// A "round" = one LLM response cycle (User -> LLM -> Tools -> Results)
// Remind after 3 rounds without touching the todo tool
func (a *agent) shouldInjectNagReminder() bool {
	tm := tools.GetTodoManager()

	// Only remind if there are uncompleted items
	if tm.GetUncompletedCount() == 0 {
		return false
	}

	// Check if it's been more than 3 rounds since last todo call
	// RoundCounter increments once per LLM response cycle
	roundsSinceLastTodo := a.RoundCounter - a.LastTodoCall
	if a.LastTodoCall == -1 {
		roundsSinceLastTodo = a.RoundCounter
	}

	return roundsSinceLastTodo >= 3
}

// getNagReminder generates a reminder message
func (a *agent) getNagReminder() string {
	tm := tools.GetTodoManager()
	uncompleted := tm.GetUncompletedCount()
	pending := tm.GetPendingItems()
	inProgress := tm.GetInProgressItem()

	var reminder strings.Builder
	reminder.WriteString("[Reminder] You have pending todo items!\n")

	if inProgress != nil {
		fmt.Fprintf(&reminder, "In Progress: %s\n", inProgress.Task)
	}

	if len(pending) > 0 {
		fmt.Fprintf(&reminder, "Pending: %d item(s)\n", len(pending))
	}

	fmt.Fprintf(&reminder, "\nUse the 'todo' tool to manage your tasks. You have %d uncompleted item(s).", uncompleted)

	return reminder.String()
}

func (a *agent) Invoke(message string) {

	// Add tools and their corresponding execute functions to the agent
	a.addTool()
	a.addExecute()

	// Create a new OpenAI client with the agent's configuration.
	client := a.client()

	// Get the current working directory to provide context to the agent.
	currentDir, err := os.Getwd()
	if err != nil {
		panic(err)
	}

	// Initialize system prompt on first call
	if len(a.Messages) == 0 {
		// Build system prompt with dynamic tools list
		systemPrompt := resource.GetSystemPrompt(resource.SystemContext{
			WorkingDir: currentDir,
			Os:         runtime.GOOS,
		})
		a.Messages = append(a.Messages, openai.SystemMessage(systemPrompt))
	}

	// Append the new user message
	a.Messages = append(a.Messages, openai.UserMessage(message))

	fmt.Printf("\033[34mUser:\033[0m\n %s\n", message)

	// Show task progress after user input
	a.showTaskProgress()

	// Check if we need to inject a nag reminder before starting
	if a.shouldInjectNagReminder() {
		reminder := a.getNagReminder()
		fmt.Printf("\033[35m%s\033[0m\n", reminder)
		a.Messages = append(a.Messages, openai.SystemMessage(reminder))
	}

	for {

		// Build request params
		requestParams := openai.ChatCompletionNewParams{
			Messages: a.Messages,
			Model:    a.Config.Model,
			Tools:    a.Tools,
		}

		// Use non-streaming for simpler reasoning_content handling
		completion, err := client.Chat.Completions.New(a.Context, requestParams)
		if err != nil {
			panic(err)
		}

		toolCalls := completion.Choices[0].Message.ToolCalls
		assistant := completion.Choices[0].Message.Content
		rawJson := completion.Choices[0].Message.RawJSON()

		// Extract reasoning_content from raw JSON for debugging
		reasoningContent := extractReasoningContent(rawJson)

		if reasoningContent != "" {
			fmt.Printf("\033[33mThinking:\033[0m\n %s\n", reasoningContent)
		}

		if len(toolCalls) == 0 {
			// No tools called, just display the assistant's response
			fmt.Printf("Assistant:\n %s\n", assistant)
			a.Messages = append(a.Messages, openai.AssistantMessage(assistant))
			break
		}

		a.Messages = append(a.Messages, completion.Choices[0].Message.ToParam())

		// Track if todo tool was called
		todoCalled := false

		for _, toolCall := range toolCalls {
			if toolCall.Type == "function" {
				executeFunc, ok := a.Excute[toolCall.Function.Name]
				if !ok {
					panic(fmt.Sprintf("no execute function found for tool: %s", toolCall.Function.Name))
				}

				// Show tool call
				fmt.Printf("\033[32m%s(%s)\033[0m\n", toolCall.Function.Name, toolCall.Function.Arguments)

				// Show running indicator for commands that might take time
				if toolCall.Function.Name == "bash" {
					fmt.Printf("\033[90mRunning...\033[0m")
				}

				result := executeFunc(toolCall.Function.Arguments)

				// Clear the running indicator if it was shown
				if toolCall.Function.Name == "bash" {
					fmt.Printf("\r\033[K") // Clear line
				}

				fmt.Printf("%s\n", result)
				a.Messages = append(a.Messages, openai.ToolMessage(result, toolCall.ID))

				// Track if todo tool was called
				if toolCall.Function.Name == "todo" {
					todoCalled = true
				}
			}
		}

		// Update round counter and last todo call
		a.RoundCounter++
		if todoCalled {
			a.LastTodoCall = a.RoundCounter
		}

		// Show task progress after tools execution
		a.showTaskProgress()

	}

}

type ReasoningContent struct {
	ReasoningContent string `json:"reasoning_content"`
}

func extractReasoningContent(rawJSON string) string {
	var content map[string]any
	err := json.Unmarshal([]byte(rawJSON), &content)
	if err != nil {
		fmt.Printf("Error parsing JSON: %v\n", err)
		return ""
	}

	if reasoning, ok := content["reasoning_content"].(string); ok {
		return reasoning
	}

	return ""
}
