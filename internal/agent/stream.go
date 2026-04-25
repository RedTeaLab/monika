package agent

import (
	"fmt"
	"strings"
)

type EventKind int

const (
	// UnknownEvent and any future event kinds are intentionally skipped for
	// forward compatibility.
	UnknownEvent EventKind = iota
	ContentDelta
	UsageEvent
	ErrorEvent
	MessageEnd
)

type ChatEvent struct {
	Kind          EventKind
	Text          string
	Usage         Usage
	ProviderError ProviderError
	FinishReason  string
}

type Usage struct {
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
}

type ProviderError struct {
	Code    string
	Message string
}

type AssistantMessage struct {
	Content      string
	Usage        Usage
	FinishReason string
}

// AggregateEvents collects streaming ChatEvent items into a single
// AssistantMessage.  Duplicate events (multiple usage, multiple finish) retain
// the last value.
func AggregateEvents(events []ChatEvent) (AssistantMessage, error) {
	var out AssistantMessage
	var content strings.Builder

	for _, event := range events {
		switch event.Kind {
		case ContentDelta:
			content.WriteString(event.Text)
		case UsageEvent:
			out.Usage = event.Usage
		case ErrorEvent:
			return AssistantMessage{}, fmt.Errorf("provider error (%s): %s", event.ProviderError.Code, event.ProviderError.Message)
		case MessageEnd:
			out.FinishReason = event.FinishReason
		}
	}

	out.Content = content.String()
	return out, nil
}
