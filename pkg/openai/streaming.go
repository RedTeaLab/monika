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
		PromptTokens     int64 `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
		TotalTokens      int64 `json:"total_tokens"`
	} `json:"usage"`
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

func StreamChat(ctx context.Context, baseURL, apiKey, model string, messages []engine.ChatMessage, tools []engine.ToolDef) ([]engine.ChatEvent, error) {
	body := chatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
		Tools:    tools,
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
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(respBody))
	}

	return parseSSEStream(resp.Body)
}

func parseSSEStream(r io.Reader) ([]engine.ChatEvent, error) {
	var events []engine.ChatEvent
	scanner := bufio.NewScanner(r)
	toolCallBuf := make(map[int]*engine.ToolCall)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			events = append(events, engine.ChatEvent{Kind: engine.EventMessageEnd, Text: "stop"})
			break
		}

		var chunk chatChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				events = append(events, engine.ChatEvent{
					Kind: engine.EventContentDelta,
					Text: choice.Delta.Content,
				})
			}

			if choice.Delta.ReasoningContent != "" {
				events = append(events, engine.ChatEvent{
					Kind:             engine.EventContentDelta,
					ReasoningContent: choice.Delta.ReasoningContent,
				})
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

				if tc.Function.Name != "" && buf.Function.Name == tc.Function.Name {
					events = append(events, engine.ChatEvent{
						Kind: engine.EventToolCallStart,
						ToolCall: &engine.ToolCall{
							ID:   buf.ID,
							Type: "function",
							Function: engine.ToolCallFunc{
								Name: tc.Function.Name,
							},
						},
					})
				}

				if tc.Function.Arguments != "" {
					buf.Function.Arguments += tc.Function.Arguments
					events = append(events, engine.ChatEvent{
						Kind: engine.EventToolCallDelta,
						ToolCall: &engine.ToolCall{
							ID:   buf.ID,
							Type: "function",
							Function: engine.ToolCallFunc{
								Name:      buf.Function.Name,
								Arguments: tc.Function.Arguments,
							},
						},
					})
				}
			}

			if choice.FinishReason != nil && *choice.FinishReason != "" {
				for _, buf := range toolCallBuf {
					if buf.Function.Name != "" {
						events = append(events, engine.ChatEvent{
							Kind: engine.EventToolCallEnd,
							ToolCall: &engine.ToolCall{
								ID:   buf.ID,
								Type: "function",
								Function: engine.ToolCallFunc{
									Name:      buf.Function.Name,
									Arguments: buf.Function.Arguments,
								},
							},
						})
					}
				}
				events = append(events, engine.ChatEvent{
					Kind: engine.EventMessageEnd,
					Text: *choice.FinishReason,
				})
			}
		}

		if chunk.Usage.TotalTokens > 0 {
			events = append(events, engine.ChatEvent{
				Kind: engine.EventUsage,
				Usage: engine.Usage{
					InputTokens:  chunk.Usage.PromptTokens,
					OutputTokens: chunk.Usage.CompletionTokens,
					TotalTokens:  chunk.Usage.TotalTokens,
				},
			})
		}
	}

	return events, scanner.Err()
}
