package builtin

import (
	"context"
	"encoding/json"
	"fmt"

	"monika/internal/tool"
)

type askUserTool struct{}

func NewAskUser() tool.Tool {
	return &askUserTool{}
}

func (a *askUserTool) Name() string { return "ask_user" }

func (a *askUserTool) Description() string {
	return "Ask the user a question and wait for their response. Use this when you need clarification, a decision, or information that cannot be inferred from the codebase. Do not use for simple confirmations — proceed with the most reasonable option instead. Use the options field to provide predefined choices when appropriate."
}

func (a *askUserTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"question": map[string]any{
				"type":        "string",
				"description": "The question to ask the user. Be specific and concise.",
			},
			"title": map[string]any{
				"type":        "string",
				"description": "Optional title for the question dialog. Defaults to 'Question'.",
			},
			"options": map[string]any{
				"type":        "array",
				"items":       map[string]any{"type": "string"},
				"description": "Optional list of predefined options the user can select from. When provided, the user can click an option instead of typing. Useful for multiple-choice questions.",
			},
		},
		"required": []string{"question"},
	}
}

func (a *askUserTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	fn := tool.AskUserFuncFromContext(ctx)
	if fn == nil {
		return tool.ExecutionResult{
			Content: "ask_user is not available in this context",
			IsError: true,
		}, nil
	}

	var params struct {
		Question string   `json:"question"`
		Title    string   `json:"title"`
		Options  []string `json:"options"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	if params.Question == "" {
		return tool.ExecutionResult{Content: "question is required", IsError: true}, nil
	}

	answer, err := fn(ctx, tool.AskUserArgs{
		Question: params.Question,
		Title:    params.Title,
		Options:  params.Options,
	})
	if err != nil {
		return tool.ExecutionResult{
			Content: fmt.Sprintf("failed to get user response: %s", err),
			IsError: true,
		}, nil
	}

	return tool.ExecutionResult{Content: answer, IsError: false}, nil
}
