package openai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"monika/pkg/engine"
)

// ParseSSEStream parses an SSE stream into ChatEvents.
func ParseSSEStream(ctx context.Context, r io.Reader, ch chan<- engine.ChatEvent) error {
	return parseSSEStream(ctx, r, ch)
}

// ParseSSEStreamInGoroutine wraps ParseSSEStream with body cleanup and context cancellation.
func ParseSSEStreamInGoroutine(ctx context.Context, resp *http.Response, ch chan<- engine.ChatEvent) error {
	return parseSSEStreamInGoroutine(ctx, resp, ch)
}

// SendError sends a provider error event, non-blocking.
func SendError(ch chan<- engine.ChatEvent, err error) {
	sendError(ch, err)
}

// HTTPClientFor returns a cached HTTP client for the given base URL.
func HTTPClientFor(baseURL string) *http.Client {
	return httpClientFor(baseURL)
}

// RetryableHTTPError checks if an HTTP error is transient.
func RetryableHTTPError(err error) bool {
	return retryableHTTPError(err)
}

// ChatRequest is the request body for a chat completion.
type ChatRequest = chatRequest

// StreamOptions is the stream_options field.
type StreamOptions = streamOptions

// BuildChatRequest builds the JSON body for a streaming chat completion request.
func BuildChatRequest(model string, messages []engine.ChatMessage, tools []engine.ToolDef, includeStreamOptions bool) ([]byte, error) {
	body := chatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
		Tools:    tools,
	}
	if includeStreamOptions {
		body.StreamOptions = &streamOptions{IncludeUsage: true}
	}
	return json.Marshal(body)
}
