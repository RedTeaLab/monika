package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"monika/internal/option"
	"monika/internal/tools"
	"os"

	opt "github.com/openai/openai-go/v3/option"

	"github.com/openai/openai-go/v3"
)

// MessageType represents different types of messages for TUI output
type MessageType int

const (
	UserMsg MessageType = iota
	ThinkingMsg
	ToolMsg
	AssistantMsg
)

type Agents interface {
	Invoke(message string)
	InvokeTUI(message string, outputFunc func(msgType MessageType, content, toolName string)) error
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

	messages := []openai.ChatCompletionMessageParamUnion{
		openai.SystemMessage(fmt.Sprintf("You are a coding agent at %s. Use bash to solve tasks. Act, don't explain.", currentDir)),
		openai.UserMessage(message),
	}

	fmt.Printf("User:\n %s\n", message)

	for {

		// Build request params
		requestParams := openai.ChatCompletionNewParams{
			Messages: messages,
			Model:    a.Config.Model,
			Tools:    a.Tools,
		}

		// Enable thinking mode for DeepSeek models if configured
		if a.Config.Thinking {
			requestParams.SetExtraFields(map[string]any{
				"thinking": map[string]any{
					"type": "enabled",
				},
			})
		}

		// Use non-streaming for simpler reasoning_content handling
		chatCompletion, err := client.Chat.Completions.New(a.Context, requestParams)

		if err != nil {
			panic(err)
		}

		if len(chatCompletion.Choices) == 0 {
			panic("no choices returned from the API")
		}

		choice := chatCompletion.Choices[0]

		// Extract reasoning_content from ExtraFields (DeepSeek-specific field)
		var reasoning string
		if field, exists := choice.Message.JSON.ExtraFields["reasoning_content"]; exists {
			// The field exists in ExtraFields
			rawRC := field.Raw()
			json.Unmarshal([]byte(rawRC), &reasoning)
		}

		// Display thinking content if available
		if a.Config.Thinking && reasoning != "" {
			fmt.Printf("Thinking:\n %s\n", reasoning)
		}

		// Check for tool calls
		if len(choice.Message.ToolCalls) > 0 {
			var toolResults []openai.ChatCompletionMessageParamUnion

			// Build assistant message with reasoning_content (required for DeepSeek continued thinking)
			// Use the message's ToParam() and add reasoning_content via ExtraFields
			assistantMsg := choice.Message.ToParam()

			// Add reasoning_content to ExtraFields
			if reasoning != "" {
				// We need to modify the message to include reasoning_content
				// Build a raw map and re-marshal
				rawAssistant := map[string]any{
					"role":              "assistant",
					"content":           choice.Message.Content,
					"reasoning_content": reasoning,
					"tool_calls":        []any{},
				}

				// Convert tool_calls
				for _, tc := range choice.Message.ToolCalls {
					tcData := map[string]any{
						"id":   tc.ID,
						"type": string(tc.Type),
						"function": map[string]any{
							"name":      tc.Function.Name,
							"arguments": tc.Function.Arguments,
						},
					}
					rawAssistant["tool_calls"] = append(rawAssistant["tool_calls"].([]any), tcData)
				}

				// Marshal and unmarshal to create proper message type
				assistantJSON, _ := json.Marshal(rawAssistant)
				assistantMsg = openai.ChatCompletionMessageParamUnion{}
				json.Unmarshal(assistantJSON, &assistantMsg)
			} else {
				// No reasoning, use ToParam() directly
				assistantMsg = choice.Message.ToParam()
			}

			messages = append(messages, assistantMsg)

			// Execute tools
			for _, toolCall := range choice.Message.ToolCalls {
				if toolCall.Type == "function" {
					executeFunc, ok := a.Excute[toolCall.Function.Name]
					if !ok {
						result := fmt.Sprintf("Error: No execute function found for tool '%s'", toolCall.Function.Name)
						toolResults = append(toolResults, openai.ToolMessage(result, toolCall.ID))
						continue
					}
					fmt.Printf("%s(%s)\n", toolCall.Function.Name, toolCall.Function.Arguments)
					result := executeFunc(toolCall.Function.Arguments)
					fmt.Printf("%s", result)
					toolResults = append(toolResults, openai.ToolMessage(result, toolCall.ID))
				}
			}

			messages = append(messages, toolResults...)
			continue
		}

		// Display assistant response
		fmt.Printf("Assistant:\n %s\n", choice.Message.Content)

		// Add assistant message to history (without reasoning_content)
		messages = append(messages, openai.AssistantMessage(choice.Message.Content))

		if choice.FinishReason == "stop" {
			break
		}
	}

}

// InvokeTUI runs the agent in TUI mode with streaming output
func (a *agent) InvokeTUI(message string, outputFunc func(msgType MessageType, content, toolName string)) error {
	// Add tools and their corresponding execute functions to the agent
	a.addTool()
	a.addExecute()

	// Create a new OpenAI client with the agent's configuration.
	client := a.client()

	// Get the current working directory to provide context to the agent.
	currentDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	messages := []openai.ChatCompletionMessageParamUnion{
		openai.SystemMessage(fmt.Sprintf("You are a coding agent at %s. Use bash to solve tasks. Act, don't explain.", currentDir)),
		openai.UserMessage(message),
	}

	for {
		// Build request params
		requestParams := openai.ChatCompletionNewParams{
			Messages: messages,
			Model:    a.Config.Model,
			Tools:    a.Tools,
		}

		// Enable thinking mode if configured
		if a.Config.Thinking {
			requestParams.SetExtraFields(map[string]any{
				"thinking": map[string]any{
					"type": "enabled",
				},
			})
		}

		// Use streaming for real-time output
		stream := client.Chat.Completions.NewStreaming(a.Context, requestParams)

		// Accumulator and streaming variables
		acc := openai.ChatCompletionAccumulator{}
		var reasoningContent, content string
		var streamedThinking bool  // Track if we've already streamed thinking content

		// Simple struct for tracking streaming tool calls
		type toolCall struct {
			ID        string
			Type      string
			Function  struct {
				Name      string
				Arguments string
			}
		}
		var currentToolCalls []toolCall

		for stream.Next() {
			chunk := stream.Current()
			acc.AddChunk(chunk)

			if len(chunk.Choices) > 0 {
				delta := chunk.Choices[0].Delta

				// Try to get reasoning_content from delta's ExtraFields
				if field, exists := delta.JSON.ExtraFields["reasoning_content"]; exists {
					rawRC := field.Raw()
					var rc string
					json.Unmarshal([]byte(rawRC), &rc)
					if rc != "" {
						reasoningContent += rc
						streamedThinking = true
						// Don't stream yet - accumulate and send at end
						// This prevents multiple fragmented thinking messages
						continue
					}
				}

				// Fallback: Try parsing the raw delta JSON
				rawDelta, _ := json.Marshal(delta)
				var deltaMap map[string]any
				json.Unmarshal(rawDelta, &deltaMap)

				if rc, ok := deltaMap["reasoning_content"].(string); ok {
					reasoningContent += rc
					streamedThinking = true
					// Don't stream yet - accumulate and send at end
				}

				// Also try to get it from ExtraFields if available
				if !streamedThinking {
					if field, exists := delta.JSON.ExtraFields["reasoning_content"]; exists {
						rawRC := field.Raw()
						var rc string
						json.Unmarshal([]byte(rawRC), &rc)
						if rc != "" {
							reasoningContent += rc
							streamedThinking = true
							if outputFunc != nil {
								outputFunc(ThinkingMsg, reasoningContent, "")
							}
						}
					}
				}

				// Capture regular content (only when reasoning_content is null)
				// In DeepSeek streaming, content comes AFTER all reasoning_content
				if delta.Content != "" {
					content += delta.Content
				}

				// Capture tool calls
				if len(delta.ToolCalls) > 0 {
					for _, tc := range delta.ToolCalls {
						// Ensure tool calls array is large enough
						for int(tc.Index) >= len(currentToolCalls) {
							currentToolCalls = append(currentToolCalls, toolCall{
								ID:   tc.ID,
								Type: string(tc.Type),
							})
						}
						if tc.Function.Name != "" {
							currentToolCalls[tc.Index].Function.Name = tc.Function.Name
						}
						if tc.Function.Arguments != "" {
							currentToolCalls[tc.Index].Function.Arguments += tc.Function.Arguments
						}
					}
				}
			}
		}

		if err := stream.Err(); err != nil {
			return fmt.Errorf("stream error: %w", err)
		}

		// Get the accumulated completion
		completion := acc.ChatCompletion

		if len(completion.Choices) == 0 {
			return fmt.Errorf("no choices returned from API")
		}

		choice := completion.Choices[0]

		// Extract reasoning_content from ExtraFields if not already captured
		if reasoningContent == "" {
			if field, exists := choice.Message.JSON.ExtraFields["reasoning_content"]; exists {
				rawRC := field.Raw()
				json.Unmarshal([]byte(rawRC), &reasoningContent)
			}
		}

		// Also try to get it directly from the message if reasoning_content is still empty
		if reasoningContent == "" {
			rawMsg, _ := json.Marshal(choice.Message)
			var msgMap map[string]any
			json.Unmarshal(rawMsg, &msgMap)
			if rc, ok := msgMap["reasoning_content"].(string); ok {
				reasoningContent = rc
			}
		}

		// Output thinking content after streaming completes
		// We accumulated it during streaming but didn't send it yet
		if reasoningContent != "" && outputFunc != nil {
			outputFunc(ThinkingMsg, reasoningContent, "")
		}

		// Handle tool calls
		if len(choice.Message.ToolCalls) > 0 || len(currentToolCalls) > 0 {
			// Convert both types to a common format for processing
			type commonToolCall struct {
				ID        string
				Type      string
				Name      string
				Arguments string
			}
			var toolCallsToProcess []commonToolCall

			// Process API tool calls
			for _, tc := range choice.Message.ToolCalls {
				toolCallsToProcess = append(toolCallsToProcess, commonToolCall{
					ID:        tc.ID,
					Type:      string(tc.Type),
					Name:      tc.Function.Name,
					Arguments: tc.Function.Arguments,
				})
			}

			// If no API tool calls but we have accumulated streaming tool calls, use those
			if len(toolCallsToProcess) == 0 && len(currentToolCalls) > 0 {
				for _, tc := range currentToolCalls {
					toolCallsToProcess = append(toolCallsToProcess, commonToolCall{
						ID:        tc.ID,
						Type:      tc.Type,
						Name:      tc.Function.Name,
						Arguments: tc.Function.Arguments,
					})
				}
			}

			var toolResults []openai.ChatCompletionMessageParamUnion

			// Build assistant message with reasoning_content
			rawAssistant := map[string]any{
				"role": "assistant",
			}
			if reasoningContent != "" {
				rawAssistant["reasoning_content"] = reasoningContent
			}
			if content != "" {
				rawAssistant["content"] = content
			}

			// Add tool_calls
			var toolCallsData []map[string]any
			for _, tc := range toolCallsToProcess {
				tcData := map[string]any{
					"id":   tc.ID,
					"type": tc.Type,
					"function": map[string]any{
						"name":      tc.Name,
						"arguments": tc.Arguments,
					},
				}
				toolCallsData = append(toolCallsData, tcData)
			}
			rawAssistant["tool_calls"] = toolCallsData

			// Marshal and unmarshal to create proper message type
			assistantJSON, _ := json.Marshal(rawAssistant)
			var assistantMsg openai.ChatCompletionMessageParamUnion
			json.Unmarshal(assistantJSON, &assistantMsg)

			messages = append(messages, assistantMsg)

			// Execute tools and stream results
			for _, toolCall := range toolCallsToProcess {
				if toolCall.Type == "function" {
					executeFunc, ok := a.Excute[toolCall.Name]
					if !ok {
						result := fmt.Sprintf("Error: No execute function found for tool '%s'", toolCall.Name)
						if outputFunc != nil {
							outputFunc(ToolMsg, result, "")
						}
						toolResults = append(toolResults, openai.ToolMessage(result, toolCall.ID))
						continue
					}

					// Output tool call with extracted command
					if outputFunc != nil {
						// Extract command from arguments for cleaner display
						displayArgs := toolCall.Arguments
						if toolCall.Name == "bash" {
							// Parse JSON arguments to extract "command" field
							var args struct {
								Command string `json:"command"`
							}
							if err := json.Unmarshal([]byte(toolCall.Arguments), &args); err == nil {
								displayArgs = args.Command
							}
						}
						outputFunc(ToolMsg, fmt.Sprintf("%s(%s)", toolCall.Name, displayArgs), "")
					}

					result := executeFunc(toolCall.Arguments)

					// Output tool result
					if outputFunc != nil {
						outputFunc(ToolMsg, result, toolCall.Name)
					}

					toolResults = append(toolResults, openai.ToolMessage(result, toolCall.ID))
				}
			}

			messages = append(messages, toolResults...)

			// Continue to next iteration for tool calls in progress
			if choice.FinishReason != "stop" {
				// Before continuing, send any accumulated content (assistant might have said something)
				if content != "" && outputFunc != nil {
					outputFunc(AssistantMsg, content, "")
					content = "" // Reset after sending
				}
				continue
			}
		}

		// Output assistant response
		if content != "" && outputFunc != nil {
			outputFunc(AssistantMsg, content, "")
		}

		// Add assistant message to history (without reasoning_content)
		messages = append(messages, openai.AssistantMessage(content))

		if choice.FinishReason == "stop" {
			break
		}
	}

	return nil
}
