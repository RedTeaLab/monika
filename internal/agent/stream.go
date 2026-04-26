package agent

import (
	"fmt"
	"strings"

	"monika/pkg/engine"
)

type streamResult struct {
	Content          string
	ReasoningContent string
	ToolCalls        []engine.ToolCall
	Usage            engine.Usage
	Error            error
}

func parseResult(events []engine.ChatEvent) streamResult {
	var result streamResult
	var content strings.Builder
	var reasoning strings.Builder

	for _, ev := range events {
		switch ev.Kind {
		case engine.EventContentDelta:
			if ev.ReasoningContent != "" {
				reasoning.WriteString(ev.ReasoningContent)
			} else {
				content.WriteString(ev.Text)
			}
		case engine.EventToolCallEnd:
			if ev.ToolCall != nil {
				result.ToolCalls = append(result.ToolCalls, *ev.ToolCall)
			}
		case engine.EventUsage:
			result.Usage = ev.Usage
		case engine.EventError:
			result.Error = fmt.Errorf("provider error (%s): %s", ev.Error.Code, ev.Error.Message)
		}
	}

	result.Content = content.String()
	result.ReasoningContent = reasoning.String()
	return result
}
