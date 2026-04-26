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
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatChunk struct {
	ID      string `json:"id"`
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int64 `json:"prompt_tokens"`
		CompletionTokens int64 `json:"completion_tokens"`
		TotalTokens      int64 `json:"total_tokens"`
	} `json:"usage"`
}

func StreamChat(ctx context.Context, baseURL, apiKey, model string, messages []engine.ChatMessage) ([]engine.ChatEvent, error) {
	msgs := make([]chatMessage, len(messages))
	for i, m := range messages {
		msgs[i] = chatMessage{Role: m.Role, Content: m.Content}
	}

	body := chatRequest{
		Model:    model,
		Messages: msgs,
		Stream:   true,
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
			if choice.FinishReason != nil && *choice.FinishReason != "" {
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
