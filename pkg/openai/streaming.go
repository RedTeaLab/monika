package openai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"monika/pkg/engine"
	"monika/pkg/proxy"
)

type chatRequest struct {
	Model          string               `json:"model"`
	Messages       []engine.ChatMessage `json:"messages"`
	Stream         bool                 `json:"stream"`
	Tools          []engine.ToolDef     `json:"tools,omitempty"`
	StreamOptions  *streamOptions       `json:"stream_options,omitempty"`
	ReasoningSplit *bool                `json:"reasoning_split,omitempty"`
}

type streamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

type chatChunk struct {
	ID      string `json:"id"`
	Choices []struct {
		Delta struct {
			Content          string          `json:"content"`
			ReasoningContent string          `json:"reasoning_content"`
			ToolCalls        []toolCallChunk `json:"tool_calls"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens           int64                   `json:"prompt_tokens"`
		CompletionTokens       int64                   `json:"completion_tokens"`
		TotalTokens            int64                   `json:"total_tokens"`
		CompletionTokenDetails *completionTokenDetails `json:"completion_tokens_details"`
		PromptTokenDetails     *promptTokenDetails     `json:"prompt_tokens_details"`
	} `json:"usage"`
}

type completionTokenDetails struct {
	ReasoningTokens int64 `json:"reasoning_tokens"`
}

type promptTokenDetails struct {
	CachedTokens int64 `json:"cached_tokens"`
}

type toolCallChunk struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// Per base-URL HTTP client cache. Each base URL gets its own Transport
// so that connection pools and TLS sessions are never shared across
// different providers — this prevents HTTP/2 connection coalescing from
// reusing a TLS connection that was established with a different host.
var clientCache sync.Map

func httpClientFor(baseURL string) *http.Client {
	if c, ok := clientCache.Load(baseURL); ok {
		return c.(*http.Client)
	}
	c := &http.Client{
		Transport: &http.Transport{
			MaxIdleConnsPerHost: 2,
			Proxy:               proxy.Func(),
		},
	}
	clientCache.Store(baseURL, c)
	return c
}

// retryableHTTPError checks if an HTTP request error might be transient.
func retryableHTTPError(err error) bool {
	if err == nil {
		return false
	}
	// Context cancellation/expiry — not retryable
	if err == context.Canceled || err == context.DeadlineExceeded {
		return false
	}
	// Network-level errors (timeout, connection refused, DNS, TLS handshake, etc.)
	// Go's http.Client returns url.Error wrapping *net.OpError or *http.httpError.
	for e := err; e != nil; e = errors.Unwrap(e) {
		if n, ok := e.(interface{ Timeout() bool }); ok {
			_ = n.Timeout() // just check that the interface is satisfied
			return true
		}
		// Check for temporary errors (connection refused, no route, etc.)
		if t, ok := e.(interface{ Temporary() bool }); ok && t.Temporary() {
			return true
		}
	}
	return false
}

func StreamChat(ctx context.Context, baseURL, apiKey, model string, messages []engine.ChatMessage, tools []engine.ToolDef) (<-chan engine.ChatEvent, error) {
	body := chatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
		Tools:    tools,
	}

	// stream_options is OpenAI-specific. Compatible providers (GLM, DeepSeek, etc.)
	// may not support it and some even buffer the response when it's present.
	if strings.Contains(baseURL, "api.openai.com") {
		body.StreamOptions = &streamOptions{IncludeUsage: true}
	}

	// MiniMax puts <think> tags inside content by default. reasoning_split=true
	// separates reasoning into reasoning_content, which we already parse.
	if strings.Contains(baseURL, "minimax") {
		t := true
		body.ReasoningSplit = &t
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	// First HTTP attempt is synchronous so that non-retryable errors
	// (auth failures, bad requests) are returned immediately.
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := httpClientFor(baseURL).Do(req)
	if err != nil {
		// Non-retryable error (e.g. DNS failure resolved to no route) — fail fast.
		if !retryableHTTPError(err) {
			return nil, err
		}
		// Retryable error — fall through to the goroutine-based retry loop.
	} else if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode < 500 {
			return nil, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(respBody))
		}
		// 5xx — retryable; fall through
	} else {
		// Fast path: first HTTP attempt succeeded. SSE parsing runs in a goroutine.
		ch := make(chan engine.ChatEvent, 128)
		go func() {
			defer close(ch)
			if err := parseSSEStreamInGoroutine(ctx, resp, ch); err != nil {
				if ctx.Err() != nil {
					return
				}
				sendError(ch, err)
			}
		}()
		return ch, nil
	}

	// Slow path: first attempt failed with a retryable error (timeout, 5xx).
	// Retry in a goroutine with exponential backoff. Send retry events to the
	// channel so the frontend can display retry progress.
	ch := make(chan engine.ChatEvent, 128)
	go func() {
		defer close(ch)

		const maxAttempts = 10
		sendRetryEvent := func(attempt int, reason string) {
			select {
			case ch <- engine.ChatEvent{
				Kind:         engine.EventRetrying,
				RetryAttempt: attempt,
				RetryMax:     maxAttempts,
				RetryReason:  reason,
			}:
			default:
			}
		}

		for attempt := 1; attempt <= maxAttempts; attempt++ {
			// Send retry event before backoff so the frontend shows status immediately.
			if attempt == 1 {
				sendRetryEvent(attempt, "连接超时，正在重试...")
			} else {
				sendRetryEvent(attempt, fmt.Sprintf("第 %d 次重试失败，继续重试...", attempt-1))
			}

			// Exponential backoff: 500ms, 1s, 2s, 4s, ... capped at 30s
			delay := time.Duration(500*(1<<(attempt-1))) * time.Millisecond
			if delay > 30*time.Second {
				delay = 30 * time.Second
			}
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return
			}

			req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewReader(bodyJSON))
			if err != nil {
				if attempt < maxAttempts {
					continue
				}
				sendError(ch, err)
				return
			}
			req.Header.Set("Content-Type", "application/json")
			if apiKey != "" {
				req.Header.Set("Authorization", "Bearer "+apiKey)
			}

			resp, err := httpClientFor(baseURL).Do(req)
			if err != nil {
				if retryableHTTPError(err) && attempt < maxAttempts {
					continue
				}
				sendError(ch, err)
				return
			}

			if resp.StatusCode != http.StatusOK {
				respBody, _ := io.ReadAll(resp.Body)
				resp.Body.Close()
				if resp.StatusCode >= 500 && attempt < maxAttempts {
					continue
				}
				sendError(ch, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(respBody)))
				return
			}

			if err := parseSSEStreamInGoroutine(ctx, resp, ch); err != nil {
				if ctx.Err() != nil {
					return
				}
				sendError(ch, err)
				return
			}
			return
		}

		sendError(ch, fmt.Errorf("stream request failed after %d attempts", maxAttempts))
	}()
	return ch, nil
}

// parseSSEStreamInGoroutine runs SSE parsing on a successful HTTP response
// inside a goroutine, handling body cleanup and context cancellation.
// Returns nil on success, or the parsing error. The caller is responsible
// for deciding whether the error is retryable.
func parseSSEStreamInGoroutine(ctx context.Context, resp *http.Response, ch chan<- engine.ChatEvent) error {
	defer resp.Body.Close()

	// Ensure resp.Body is closed when ctx is cancelled so that
	// scanner.Scan() in parseSSEStream unblocks immediately.
	bodyDone := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			resp.Body.Close()
		case <-bodyDone:
		}
	}()
	defer close(bodyDone)

	err := parseSSEStream(ctx, resp.Body, ch)
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return err
}

// sendError sends a provider error event to the channel, or drops it if the
// channel is full or closed.
func sendError(ch chan<- engine.ChatEvent, err error) {
	select {
	case ch <- engine.ChatEvent{Kind: engine.EventError, Error: engine.ProviderError{Code: "stream_error", Message: err.Error()}}:
	default:
	}
}

func parseSSEStream(ctx context.Context, r io.Reader, ch chan<- engine.ChatEvent) error {
	send := func(ev engine.ChatEvent) error {
		select {
		case ch <- ev:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	scanner := bufio.NewScanner(r)
	toolCallBuf := make(map[int]*engine.ToolCall)
	toolCallStarted := make(map[int]bool)
	receivedData := false
	cleanEnd := false
	// Collect raw error data from non-chat-chunk lines (e.g. GLM coding plan
	// sends {"error":{"code":"...","message":"..."}} after last content chunk)
	var rawError strings.Builder

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		receivedData = true
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			cleanEnd = true
			if err := send(engine.ChatEvent{Kind: engine.EventMessageEnd, Text: "stop"}); err != nil {
				return err
			}
			break
		}

		var chunk chatChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// Non-chat-chunk line: capture as potential error (e.g. GLM error JSON)
			if rawError.Len() == 0 {
				rawError.WriteString(data)
			}
			continue
		}

		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				if err := send(engine.ChatEvent{
					Kind: engine.EventContentDelta,
					Text: choice.Delta.Content,
				}); err != nil {
					return err
				}
			}

			if choice.Delta.ReasoningContent != "" {
				if err := send(engine.ChatEvent{
					Kind:             engine.EventContentDelta,
					ReasoningContent: choice.Delta.ReasoningContent,
				}); err != nil {
					return err
				}
			}

			for _, tc := range choice.Delta.ToolCalls {
				buf, exists := toolCallBuf[tc.Index]
				if !exists {
					buf = &engine.ToolCall{Type: "function"}
					toolCallBuf[tc.Index] = buf
				}

				if tc.ID != "" {
					buf.ID = tc.ID
				}
				if tc.Function.Name != "" {
					buf.Function.Name = tc.Function.Name
				}

				if tc.Function.Name != "" && !toolCallStarted[tc.Index] {
					toolCallStarted[tc.Index] = true
					if err := send(engine.ChatEvent{
						Kind: engine.EventToolCallStart,
						ToolCall: &engine.ToolCall{
							ID:   buf.ID,
							Type: "function",
							Function: engine.ToolCallFunc{
								Name: tc.Function.Name,
							},
						},
					}); err != nil {
						return err
					}
				}

				if tc.Function.Arguments != "" {
					buf.Function.Arguments += tc.Function.Arguments
					if err := send(engine.ChatEvent{
						Kind: engine.EventToolCallDelta,
						ToolCall: &engine.ToolCall{
							ID:   buf.ID,
							Type: "function",
							Function: engine.ToolCallFunc{
								Name:      buf.Function.Name,
								Arguments: tc.Function.Arguments,
							},
						},
					}); err != nil {
						return err
					}
				}
			}

			if choice.FinishReason != nil && *choice.FinishReason != "" {
				cleanEnd = true
				for _, buf := range toolCallBuf {
					if buf.Function.Name != "" {
						if err := send(engine.ChatEvent{
							Kind: engine.EventToolCallEnd,
							ToolCall: &engine.ToolCall{
								ID:   buf.ID,
								Type: "function",
								Function: engine.ToolCallFunc{
									Name:      buf.Function.Name,
									Arguments: buf.Function.Arguments,
								},
							},
						}); err != nil {
							return err
						}
					}
				}
				toolCallBuf = make(map[int]*engine.ToolCall)
				if err := send(engine.ChatEvent{
					Kind: engine.EventMessageEnd,
					Text: *choice.FinishReason,
				}); err != nil {
					return err
				}
			}
		}

		if chunk.Usage.TotalTokens > 0 {
			reasoning := int64(0)
			if chunk.Usage.CompletionTokenDetails != nil {
				reasoning = chunk.Usage.CompletionTokenDetails.ReasoningTokens
			}
			cached := int64(0)
			if chunk.Usage.PromptTokenDetails != nil {
				cached = chunk.Usage.PromptTokenDetails.CachedTokens
			}
			if err := send(engine.ChatEvent{
				Kind: engine.EventUsage,
				Usage: engine.Usage{
					InputTokens:      chunk.Usage.PromptTokens,
					OutputTokens:     chunk.Usage.CompletionTokens,
					TotalTokens:      chunk.Usage.TotalTokens,
					ReasoningTokens:  reasoning,
					CacheReadTokens:  cached,
					CacheWriteTokens: 0,
				},
			}); err != nil {
				return err
			}
		}
	}

	// Some providers (e.g., Zhipu coding plan) never send [DONE] or finish_reason.
	// They close the connection after the last content chunk, sometimes with a
	// sentinel error JSON like {"error":{"code":"1234",...}} that is NOT a real error.
	// If we received content data, treat the stream as successfully completed unless
	// there is a real non-EOF read error AND no sentinel pseudo-error was seen.
	if receivedData && !cleanEnd {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		hasSentinel := rawError.Len() > 0 && strings.Contains(rawError.String(), `"code":"1234"`)
		if scanner.Err() != nil && scanner.Err() != io.EOF && !hasSentinel {
			errMsg := "stream ended unexpectedly: connection closed without [DONE] or finish_reason"
			if rawError.Len() > 0 {
				errMsg = fmt.Sprintf("%s. Provider raw error: %s", errMsg, rawError.String())
			}
			return errors.New(errMsg)
		}

		for _, buf := range toolCallBuf {
			if buf.Function.Name != "" {
				if err := send(engine.ChatEvent{
					Kind: engine.EventToolCallEnd,
					ToolCall: &engine.ToolCall{
						ID:   buf.ID,
						Type: "function",
						Function: engine.ToolCallFunc{
							Name:      buf.Function.Name,
							Arguments: buf.Function.Arguments,
						},
					},
				}); err != nil {
					return err
				}
			}
		}
		if err := send(engine.ChatEvent{
			Kind: engine.EventMessageEnd,
			Text: "stop",
		}); err != nil {
			return err
		}
		return nil
	}

	return scanner.Err()
}
