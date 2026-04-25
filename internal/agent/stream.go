package agent

import (
	"fmt"
	"strings"
)

// EventKind classifies a streaming event from a provider.
type EventKind int

const (
	// UnknownEvent and any future event kinds are intentionally skipped for
	// forward compatibility.
	UnknownEvent EventKind = iota

	// ContentDelta is a chunk of streaming assistant content.
	ContentDelta

	// UsageEvent carries token usage information.
	UsageEvent

	// ErrorEvent signals a provider-side error.
	ErrorEvent

	// MessageEnd signals the end of a streaming response.
	MessageEnd
)

// ChatEvent is a single streaming event emitted by a provider.
type ChatEvent struct {
	Kind          EventKind     // Type of event.
	Text          string        // Content delta text, set for ContentDelta events.
	Usage         Usage         // Token usage, set for UsageEvent events.
	ProviderError ProviderError // Error details, set for ErrorEvent events.
	FinishReason  string        // Why the stream ended, set for MessageEnd events.
}

// Usage holds token usage statistics for a request.
type Usage struct {
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
}

// ProviderError describes an error returned by a provider.
type ProviderError struct {
	Code    string // Machine-readable error code (e.g. "rate_limit").
	Message string // Human-readable error description.
}

// AssistantMessage is the aggregated result of a streaming response.
type AssistantMessage struct {
	Content      string // Full concatenated assistant response text.
	Usage        Usage  // Token usage from the last UsageEvent.
	FinishReason string // Finish reason from the last MessageEnd.
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
