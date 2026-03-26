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

	opt "github.com/openai/openai-go/v3/option"

	"github.com/openai/openai-go/v3"
)

type Agents interface {
	Invoke(message string)
}

type agent struct {
	Config  *option.Config
	Context context.Context
	Tools   []openai.ChatCompletionToolUnionParam
	Excute  map[string]func(args ...string) string
}

// NewAgent creates a new agent by loading config from INI file and environment variables.
func NewAgent() Agents {
	cfg := option.Load()

	return &agent{
		Config:  cfg,
		Context: context.Background(),
		Tools:   []openai.ChatCompletionToolUnionParam{},
		Excute:  make(map[string]func(args ...string) string),
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

	// Build system prompt with dynamic tools list
	systemPrompt := resource.GetSystemPrompt(resource.SystemContext{
		WorkingDir: currentDir,
		Os:         runtime.GOOS,
	})

	messages := []openai.ChatCompletionMessageParamUnion{
		openai.SystemMessage(systemPrompt),
		openai.UserMessage(message),
	}

	fmt.Printf("\033[34mUser:\033[0m\n %s\n", message)

	for {

		// Build request params
		requestParams := openai.ChatCompletionNewParams{
			Messages: messages,
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
			messages = append(messages, openai.AssistantMessage(assistant))
			break
		}

		messages = append(messages, completion.Choices[0].Message.ToParam())

		for _, toolCall := range toolCalls {
			if toolCall.Type == "function" {
				executeFunc, ok := a.Excute[toolCall.Function.Name]
				if !ok {
					panic(fmt.Sprintf("no execute function found for tool: %s", toolCall.Function.Name))
				}
				fmt.Printf("\033[32m%s(%s)\033[0m\n", toolCall.Function.Name, toolCall.Function.Arguments)
				result := executeFunc(toolCall.Function.Arguments)
				fmt.Printf("%s\n", result)
				messages = append(messages, openai.ToolMessage(result, toolCall.ID))
			}
		}

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
