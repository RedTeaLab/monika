package openai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"monika/pkg/engine"
)

type chatRequest struct {
	Model    string               `json:"model"`
	Messages []engine.ChatMessage `json:"messages"`
	Stream   bool                 `json:"stream"`
	Tools    []engine.ToolDef     `json:"tools,omitempty"`
	StreamOptions *streamOptions  `json:"stream_options,omitempty"`
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

func StreamChat(ctx context.Context, baseURL, apiKey, model string, messages []engine.ChatMessage, tools []engine.ToolDef) (<-chan engine.ChatEvent, error) {
	body := chatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
		Tools:    tools,
		StreamOptions: &streamOptions{IncludeUsage: true},
	}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(respBody))
	}

	ch := make(chan engine.ChatEvent, 64)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		if err := parseSSEStream(ctx, resp.Body, ch); err != nil {
			select {
			case ch <- engine.ChatEvent{Kind: engine.EventError, Error: engine.ProviderError{Code: "stream_error", Message: err.Error()}}:
			default:
			}
		}
	}()
	return ch, nil
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
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)
	toolCallBuf := make(map[int]*engine.ToolCall)
	toolCallStarted := make(map[int]bool)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			if err := send(engine.ChatEvent{Kind: engine.EventMessageEnd, Text: "stop"}); err != nil {
				return err
			}
			break
		}

		var chunk chatChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
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

	return scanner.Err()
}
