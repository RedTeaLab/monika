package permission

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

var credentialPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(--password[= ])\S+`),
	regexp.MustCompile(`(--api-key[= ])\S+`),
	regexp.MustCompile(`([A-Z_]+SECRET[= ])\S+`),
	regexp.MustCompile(`([A-Z_]+TOKEN[= ])\S+`),
	regexp.MustCompile(`(Authorization:\s*Bearer\s+)\S+`),
	regexp.MustCompile(`(Bearer\s+)\S+`),
}

var injectionPatterns = []string{
	"[SYSTEM]", "<|im_start|>", "<|im_end|>",
	"### SYSTEM", "### USER INPUT",
}

type cacheEntry struct {
	result    string
	reason    string
	expiresAt time.Time
}

// SecurityModel wraps a lightweight LLM to classify tool calls as safe/unsafe.
type SecurityModel struct {
	provider interface{} // engine.ProviderEngine — use interface{} to avoid circular imports
	model    string
	cache    map[string]cacheEntry
	mu       sync.RWMutex
}

// NewSecurityModel creates a new SecurityModel. provider may be nil (degraded mode).
// provider should implement: Chat(ctx context.Context, messages []ChatMessage, model string) (string, error)
func NewSecurityModel(provider interface{}, model string) *SecurityModel {
	return &SecurityModel{
		provider: provider,
		model:    model,
		cache:    make(map[string]cacheEntry),
	}
}

// Check evaluates whether a tool call is safe. Returns "safe"/"unsafe" and a reason.
func (s *SecurityModel) Check(ctx context.Context, cctx CheckContext) (result, reason string) {
	sanitized := s.sanitize(cctx.Args)
	key := s.cacheKey(cctx.ToolName, sanitized)

	if hit, r := s.checkCache(key); hit {
		return r, "cached"
	}

	if s.provider == nil {
		return "unsafe", "no security model available"
	}

	if s.hasInjection(cctx.Args) {
		return "unsafe", "prompt injection detected"
	}

	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	prompt := s.buildPrompt(cctx.ToolName, string(sanitized))
	resp, err := s.callProvider(ctx, prompt)
	if err != nil {
		return "unsafe", fmt.Sprintf("model error: %v", err)
	}

	verdict, reason := s.parseResponse(resp)
	s.mu.Lock()
	s.cache[key] = cacheEntry{result: verdict, reason: reason, expiresAt: time.Now().Add(5 * time.Minute)}
	s.mu.Unlock()

	return verdict, reason
}

// callProvider sends a prompt to the security model and returns the response text.
func (s *SecurityModel) callProvider(ctx context.Context, userPrompt string) (string, error) {
	type chatter interface {
		Chat(ctx context.Context, messages interface{}, model string) (string, error)
	}
	if p, ok := s.provider.(chatter); ok {
		type chatMsg struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		messages := []chatMsg{{Role: "user", Content: userPrompt}}
		return p.Chat(ctx, messages, s.model)
	}
	return "", fmt.Errorf("provider does not support Chat interface")
}

func (s *SecurityModel) sanitize(args json.RawMessage) json.RawMessage {
	data := string(args)
	for _, re := range credentialPatterns {
		data = re.ReplaceAllString(data, "${1}***")
	}
	return json.RawMessage(data)
}

func (s *SecurityModel) hasInjection(args json.RawMessage) bool {
	data := strings.ToLower(string(args))
	for _, p := range injectionPatterns {
		if strings.Contains(data, strings.ToLower(p)) {
			return true
		}
	}
	return false
}

func (s *SecurityModel) cacheKey(tool string, args json.RawMessage) string {
	h := sha256.Sum256([]byte(tool + string(args)))
	return fmt.Sprintf("%x", h[:8])
}

func (s *SecurityModel) checkCache(key string) (bool, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if entry, ok := s.cache[key]; ok {
		if time.Now().Before(entry.expiresAt) {
			return true, entry.result
		}
	}
	return false, ""
}

func (s *SecurityModel) buildPrompt(tool, args string) string {
	return fmt.Sprintf(`You are a command safety classifier. Classify the following operation as safe or unsafe.

### USER INPUT ###
Tool: %s
Arguments: %s

### INSTRUCTIONS ###
Respond with ONLY a JSON object: {"decision": "safe" or "unsafe", "reason": "one short sentence"}
A command is unsafe if it: modifies system configuration, accesses external URLs, modifies permissions, removes files outside the project, or executes downloaded content.`, tool, args)
}

func (s *SecurityModel) parseResponse(resp string) (string, string) {
	var result struct {
		Decision string `json:"decision"`
		Reason   string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(resp), &result); err != nil {
		return "unsafe", "invalid response format"
	}
	decision := strings.ToLower(strings.TrimSpace(result.Decision))
	if decision != "safe" && decision != "unsafe" {
		return "unsafe", "unknown decision value"
	}
	return decision, result.Reason
}
