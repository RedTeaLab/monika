package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"monika/internal/permission"
	"monika/internal/tool"
	"monika/pkg/engine"
	"monika/pkg/tokenizer"
)

// CompactionPrompt is the system prompt used by the compaction agent.
const CompactionPrompt = `You are a conversation summarizer. Summarize the conversation below.
Focus on information that is essential for continuing the work without
losing context. Output a structured summary in this format:

## Goal
What the user is trying to accomplish.

## Key Decisions
Design choices, architectural decisions, agreed approaches.

## Discoveries
Important findings, bugs identified, constraints discovered.

## Current State
What has been done so far. Files created/modified, tests passing/failing.

## Next Steps
What remains to be done. Explicit TODOs mentioned by user.

## Summary Quality Gate
- Must preserve all stated user goals and agreed decisions
- Must preserve all discovered bugs and constraints`

// Model context window limits (in tokens). These are conservative defaults
// used for client-side estimation; the API response usage is authoritative.
var modelContextLimits = map[string]int64{
	"gpt-4o":            128000,
	"gpt-4o-mini":       128000,
	"gpt-4":             8192,
	"gpt-4-turbo":       128000,
	"gpt-3.5-turbo":     16385,
	"deepseek-chat":     131072,
	"deepseek-reasoner": 131072,
	"claude-3-opus":     200000,
	"claude-3.5-sonnet": 200000,
	"claude-3.7-sonnet": 200000,
}

var modelOutputLimits = map[string]int64{
	"gpt-4o":            16384,
	"gpt-4o-mini":       16384,
	"gpt-4-turbo":       4096,
	"gpt-4":             4096,
	"gpt-3.5-turbo":     4096,
	"deepseek-chat":     32768,
	"deepseek-reasoner": 32768,
	"claude-3-opus":     4096,
	"claude-3.5-sonnet": 8192,
	"claude-3.7-sonnet": 8192,
}

func outputLimit(model string) int64 {
	if limit, ok := modelOutputLimits[model]; ok {
		return limit
	}
	return 32768
}

func (a *AgentLoop) contextLimit() int64 {
	if a.modelContextLimit > 0 {
		return a.modelContextLimit
	}
	if limit, ok := modelContextLimits[a.model]; ok {
		return limit
	}
	return 128000
}

type Conversation struct {
	ID              string
	Messages        []engine.ChatMessage
	TokenCount      int64
	TokenMax        int64
	CompactionCount int
	CompactionFrom  int // index in Messages where effective context starts for LLM
}

const compactionBuffer = 20_000

func IsChildSession(sessionID string) bool {
	return strings.HasPrefix(sessionID, "call_") || strings.HasPrefix(sessionID, "sub_") || strings.HasPrefix(sessionID, "compact_")
}

func isChildSession(sessionID string) bool { return IsChildSession(sessionID) }

func (a *AgentLoop) isOverflow(conv *Conversation) bool {
	limit := a.contextLimit()
	outputMax := outputLimit(a.model)
	usable := limit - outputMax - compactionBuffer
	if usable <= 0 {
		usable = limit / 2
	}
	estimated := a.EstimateContextTokens(conv)
	conv.TokenCount = estimated
	conv.TokenMax = limit
	return estimated > usable
}

func (a *AgentLoop) buildCompactionPrompt(conv *Conversation) []engine.ChatMessage {
	prompt := `You are a conversation summarizer. Summarize the conversation below.
Focus on information that is essential for continuing the work without
losing context. Output a structured summary in this format:

## Goal
What the user is trying to accomplish.

## Key Decisions
Design choices, architectural decisions, agreed approaches.

## Discoveries
Important findings, bugs identified, constraints discovered.

## Current State
What has been done so far. Files created/modified, tests passing/failing.

## Next Steps
What remains to be done. Explicit TODOs mentioned by user.

## Summary Quality Gate
- Must preserve all stated user goals
- Must preserve all agreed design decisions
- Must preserve all discovered bugs and constraints
- If these cannot fit, prioritize goals > decisions > discoveries`

	dump := buildCompactionPromptFromConv(conv)

	return []engine.ChatMessage{
		{Role: "user", Content: prompt},
		{Role: "user", Content: "Here is the conversation to summarize:\n\n" + dump},
	}
}

func (a *AgentLoop) rewriteMessages(conv *Conversation, summary string) {
	limit := a.contextLimit()
	preserveBudget := int64(float64(limit) * 0.25)

	// Only scan effective messages (from CompactionFrom) to find keepFrom
	start := conv.CompactionFrom
	var keepFrom int
	var runningTokens int64
	for i := len(conv.Messages) - 1; i >= start; i-- {
		m := conv.Messages[i]
		runningTokens += int64(tokenizer.Count(m.Role))
		runningTokens += int64(tokenizer.Count(m.Content))
		runningTokens += int64(tokenizer.Count(m.ReasoningContent))
		runningTokens += 4
		if runningTokens > preserveBudget && i < len(conv.Messages)-1 {
			keepFrom = i + 1
			for keepFrom < len(conv.Messages) && conv.Messages[keepFrom].Role != "user" {
				keepFrom++
			}
			if keepFrom >= len(conv.Messages) {
				keepFrom = len(conv.Messages) - 1
			}
			break
		}
	}

	lastUserIdx := -1
	for i := len(conv.Messages) - 1; i >= start; i-- {
		if conv.Messages[i].Role == "user" {
			lastUserIdx = i
			break
		}
	}
	if lastUserIdx >= 0 && keepFrom > lastUserIdx {
		keepFrom = lastUserIdx
	}
	if keepFrom < start {
		keepFrom = start
	}
	// If keepFrom == start, all messages fit within preserveBudget — force a split
	// so the summary actually replaces some messages. Keep at most the last 2 user turns.
	if keepFrom == start && len(conv.Messages) > start {
		userCount := 0
		keepFrom = len(conv.Messages)
		for i := len(conv.Messages) - 1; i >= start; i-- {
			if conv.Messages[i].Role == "user" {
				userCount++
				if userCount >= 2 {
					keepFrom = i
					break
				}
			}
		}
		if keepFrom <= start {
			keepFrom = start + 1
			if keepFrom >= len(conv.Messages) {
				keepFrom = len(conv.Messages) - 1
			}
		}
	}

	summaryMsg := engine.ChatMessage{
		Role:    "assistant",
		Name:    "compaction_summary",
		Content: summary,
	}

	preserved := make([]engine.ChatMessage, len(conv.Messages)-keepFrom)
	copy(preserved, conv.Messages[keepFrom:])

	newMessages := make([]engine.ChatMessage, 0, keepFrom+1+len(preserved))
	newMessages = append(newMessages, conv.Messages[:keepFrom]...)
	newMessages = append(newMessages, summaryMsg)
	newMessages = append(newMessages, preserved...)

	conv.Messages = newMessages
	conv.CompactionFrom = keepFrom // effective context starts at the new summary
	conv.CompactionCount++
	conv.TokenCount = a.EstimateContextTokens(conv)
}

func (a *AgentLoop) runCompaction(ctx context.Context, conv *Conversation, ch chan<- Event) error {
	beforeTokens := conv.TokenCount

	prompt := a.buildCompactionPrompt(conv)
	req := engine.ChatRequest{
		Provider: a.providerID,
		Model:    a.model,
		Messages: prompt,
	}

	events, err := a.provider.StreamChat(ctx, req)
	if err != nil {
		return fmt.Errorf("compaction stream chat: %w", err)
	}

	var summary strings.Builder
	for ev := range events {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		switch ev.Kind {
		case engine.EventContentDelta:
			summary.WriteString(ev.Text)
		case engine.EventError:
			return fmt.Errorf("compaction provider error: %s", ev.Error.Message)
		}
	}

	result := summary.String()
	if result == "" {
		return fmt.Errorf("compaction returned empty summary")
	}

	a.rewriteMessages(conv, result)

	ch <- Event{
		Type: EventCompaction,
		Compaction: &CompactionEvent{
			Summary:       result,
			BeforeTokens:  beforeTokens,
			AfterTokens:   conv.TokenCount,
			CompactionNum: conv.CompactionCount,
		},
	}

	return nil
}

// RunCompactionViaDispatch runs compaction through the generic dispatch mechanism.
// Falls back to the old runCompaction if dispatchFn is not set.
func (a *AgentLoop) RunCompactionViaDispatch(ctx context.Context, conv *Conversation, ch chan<- Event) error {
	if a.dispatchFn == nil {
		return a.runCompaction(ctx, conv, ch)
	}

	beforeTokens := conv.TokenCount

	compactSID := fmt.Sprintf("call_compact_%s_%d", a.sessionID, conv.CompactionCount)
	if a.sessionID == "" {
		compactSID = fmt.Sprintf("call_compact_%s_%d", conv.ID, conv.CompactionCount)
	}
	toolInput := `{"description":"Compact context","prompt":"...","subagent_type":"compaction"}`

	ch <- Event{
		Type: EventToolStart,
		Tool: &ToolEvent{
			ID: compactSID, Name: "spawn_agent",
			Input: toolInput,
		},
	}

	task := SubTask{
		Type:      TaskCompaction,
		Agent:     "compaction",
		Prompt:    buildCompactionPromptFromConv(conv),
		Status:    "pending",
		SessionID: compactSID,
		ParentID:  a.sessionID,
	}

	childCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	resultCh := a.dispatchFn(childCtx, task)
	var summary strings.Builder
	compactionErr := ""
	for ev := range resultCh {
		ev.SessionID = compactSID
		ch <- ev
		if ev.Type == EventTextDelta {
			summary.WriteString(ev.Content)
		}
		if ev.Type == EventError {
			compactionErr = ev.Content
		}
	}

	if compactionErr != "" {
		a.RewriteMessagesTruncate(conv)
		ch <- Event{
			Type: EventCompaction,
			Compaction: &CompactionEvent{
				BeforeTokens:  beforeTokens,
				AfterTokens:   a.EstimateContextTokens(conv),
				CompactionNum: conv.CompactionCount,
				Summary:       "(truncated — compaction failed: " + compactionErr + ")",
			},
		}
		ch <- Event{
			Type: EventToolOutput,
			Tool: &ToolEvent{
				ID: compactSID, Name: "spawn_agent",
				Input: toolInput, Output: "compaction failed: " + compactionErr, Status: "error",
			},
		}
		return fmt.Errorf("compaction agent error: %s", compactionErr)
	}

	result := sanitizeCompactionOutput(summary.String())
	if result == "" {
		a.RewriteMessagesTruncate(conv)
		ch <- Event{
			Type: EventCompaction,
			Compaction: &CompactionEvent{
				BeforeTokens:  beforeTokens,
				AfterTokens:   a.EstimateContextTokens(conv),
				CompactionNum: conv.CompactionCount,
				Summary:       "(truncated — compaction returned empty summary)",
			},
		}
		ch <- Event{
			Type: EventToolOutput,
			Tool: &ToolEvent{
				ID: compactSID, Name: "spawn_agent",
				Input: toolInput, Output: "compaction returned empty summary", Status: "error",
			},
		}
		return fmt.Errorf("compaction returned empty summary")
	}

	a.rewriteMessages(conv, result)

	ch <- Event{
		Type: EventCompaction,
		Compaction: &CompactionEvent{
			Summary:       result,
			BeforeTokens:  beforeTokens,
			AfterTokens:   conv.TokenCount,
			CompactionNum: conv.CompactionCount,
		},
	}
	ch <- Event{
		Type: EventToolOutput,
		Tool: &ToolEvent{
			ID: compactSID, Name: "spawn_agent",
			Input: toolInput, Output: "compaction complete", Status: "done",
		},
	}

	return nil
}

func (a *AgentLoop) RewriteMessagesTruncate(conv *Conversation) {
	limit := a.contextLimit()
	budget := int64(float64(limit) * 0.25)
	start := conv.CompactionFrom
	var running int64
	keepFrom := len(conv.Messages) - 1
	for i := len(conv.Messages) - 1; i >= start; i-- {
		m := conv.Messages[i]
		running += int64(tokenizer.Count(m.Role) + tokenizer.Count(m.Content) + tokenizer.Count(m.ReasoningContent) + 4)
		if running > budget && i < len(conv.Messages)-1 {
			keepFrom = i + 1
			break
		}
	}
	for keepFrom < len(conv.Messages) && conv.Messages[keepFrom].Role != "user" {
		keepFrom++
	}
	if keepFrom >= len(conv.Messages) {
		keepFrom = len(conv.Messages) - 1
	}
	// Keep old messages; CompactionFrom marks where effective context begins
	conv.CompactionFrom = keepFrom
	conv.CompactionCount++
	conv.TokenCount = a.EstimateContextTokens(conv)
}

type LoopResult struct {
	Conversation *Conversation
	Content      string
	Usage        engine.Usage
}

type AgentLoop struct {
	agent    Agent
	provider engine.ProviderEngine
	tools    *tool.ToolRegistry
	// conv is the in-memory conversation for this loop's run.
	conv *Conversation
	// parent is nil for root loops; non-nil for child subtasks.
	parent *AgentLoop

	sessionID         string
	systemPrompt      string
	pipeline *permission.Pipeline
	projectDir        string
	model             string
	providerID        string
	modelContextLimit int64 // 0 = use hardcoded map + default
	dispatchFn        func(ctx context.Context, task SubTask) <-chan Event
	mcpTools          []engine.MCPTool
	mcpConns          map[string]engine.MCPServerConnection
	askUserFn         tool.AskUserFunc
}

// SetDispatchFn sets the child dispatch function for this loop.
// Used for compaction and other system-initiated subtasks.
func (a *AgentLoop) SetDispatchFn(fn func(ctx context.Context, task SubTask) <-chan Event) {
	a.dispatchFn = fn
}

type LoopOption func(*AgentLoop)

func WithSystemPrompt(prompt string) LoopOption {
	return func(a *AgentLoop) {
		a.systemPrompt = prompt
	}
}

func WithPermissionPipeline(p *permission.Pipeline) LoopOption {
	return func(a *AgentLoop) {
		a.pipeline = p
	}
}

func WithProjectDir(dir string) LoopOption {
	return func(a *AgentLoop) {
		a.projectDir = dir
	}
}

func WithModel(model string) LoopOption {
	return func(a *AgentLoop) {
		a.model = model
	}
}

// WithProvider sets the provider ID (e.g. "deepseek", "openai") to use.
func WithProvider(id string) LoopOption {
	return func(a *AgentLoop) {
		a.providerID = id
	}
}

// WithSessionID sets the session ID injected into tool context.
func WithSessionID(id string) LoopOption {
	return func(a *AgentLoop) { a.sessionID = id }
}

// WithModelContextLimit sets an explicit context window limit (in tokens) for the
// model used by this loop. When set (>0), it overrides the hardcoded lookup.
func WithModelContextLimit(limit int64) LoopOption {
	return func(a *AgentLoop) { a.modelContextLimit = limit }
}

func WithAgent(agent Agent) LoopOption {
	return func(a *AgentLoop) {
		a.agent = agent
		if agent.SystemPrompt != "" {
			a.systemPrompt = agent.SystemPrompt
		}
		if agent.Model != "" {
			a.model = agent.Model
		}
		if agent.Provider != "" {
			a.providerID = agent.Provider
		}
	}
}

func WithParent(parent *AgentLoop) LoopOption {
	return func(a *AgentLoop) { a.parent = parent }
}

func WithMCPTools(tools []engine.MCPTool) LoopOption {
	return func(a *AgentLoop) { a.mcpTools = tools }
}

func WithMCPConnections(conns map[string]engine.MCPServerConnection) LoopOption {
	return func(a *AgentLoop) { a.mcpConns = conns }
}

func WithAskUserFunc(fn tool.AskUserFunc) LoopOption {
	return func(a *AgentLoop) { a.askUserFn = fn }
}

func NewLoop(provider engine.ProviderEngine, tools *tool.ToolRegistry, opts ...LoopOption) *AgentLoop {
	a := &AgentLoop{
		provider: provider,
		tools:    tools,
	}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

func (a *AgentLoop) RunBlocking(ctx context.Context, conv *Conversation, userMessage string) (*LoopResult, error) {
	if conv == nil {
		conv = &Conversation{}
	}

	conv.Messages = append(conv.Messages, engine.ChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	tools := a.buildToolDefs()
	var totalUsage engine.Usage

	for turn := 0; ; turn++ {
		_ = turn // reserved for future logging
		messages := a.buildMessages(conv)

		req := engine.ChatRequest{
			Provider: a.providerID,
			Model:    a.model,
			Messages: messages,
			Tools:    tools,
		}

		events, err := a.provider.StreamChat(ctx, req)
		if err != nil {
			return nil, fmt.Errorf("stream chat: %w", err)
		}

		var collected []engine.ChatEvent
		for ev := range events {
			collected = append(collected, ev)
		}

		result := parseResult(collected)
		if result.Error != nil {
			return nil, result.Error
		}

		totalUsage.InputTokens += result.Usage.InputTokens
		totalUsage.OutputTokens += result.Usage.OutputTokens
		totalUsage.TotalTokens += result.Usage.TotalTokens
		totalUsage.ReasoningTokens += result.Usage.ReasoningTokens
		totalUsage.CacheReadTokens += result.Usage.CacheReadTokens
		totalUsage.CacheWriteTokens += result.Usage.CacheWriteTokens

		if len(result.ToolCalls) == 0 {
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
			})
			return &LoopResult{
				Conversation: conv,
				Content:      result.Content,
				Usage:        totalUsage,
			}, nil
		}

		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
		})

		for _, tc := range result.ToolCalls {
			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				// Try MCP tools
				found := false
				for _, conn := range a.mcpConns {
					tools, lerr := conn.ListTools(context.Background())
					if lerr != nil {
						continue
					}
					for _, mt := range tools {
						if mt.Name == tc.Function.Name {
							result, cerr := conn.CallTool(context.Background(), tc.Function.Name, json.RawMessage(tc.Function.Arguments))
							if cerr != nil {
								conv.Messages = append(conv.Messages, engine.ChatMessage{
									Role:       "tool",
									Content:    fmt.Sprintf("MCP tool %s error: %s", tc.Function.Name, cerr),
									ToolCallID: tc.ID,
									Name:       tc.Function.Name,
								})
							} else {
								content := string(result)
								conv.Messages = append(conv.Messages, engine.ChatMessage{
									Role:       "tool",
									Content:    content,
									ToolCallID: tc.ID,
									Name:       tc.Function.Name,
								})
							}
							found = true
							break
						}
					}
					if found {
						break
					}
				}
				if !found {
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role:       "tool",
						Content:    fmt.Sprintf("tool %s not found", tc.Function.Name),
						ToolCallID: tc.ID,
					})
				}
				continue
			}

			if a.pipeline != nil {
				pctx := permission.CheckContext{
					ToolName:   tc.Function.Name,
					Args:       json.RawMessage(tc.Function.Arguments),
					SessionID:  a.sessionID,
					ProjectDir: a.projectDir,
				}
				if a.pipeline.Check(ctx, pctx) == permission.Deny {
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role:       "tool",
						Content:    fmt.Sprintf("execution of %s was denied by user", tc.Function.Name),
						ToolCallID: tc.ID,
					})
					continue
				}
			}

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if a.sessionID != "" {
				toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
			}
			if a.model != "" {
				toolCtx = tool.WithModel(toolCtx, a.model)
			}
			if a.providerID != "" {
				toolCtx = tool.WithProvider(toolCtx, a.providerID)
			}
			if a.askUserFn != nil {
				toolCtx = tool.WithAskUserFunc(toolCtx, a.askUserFn)
			}
			execResult, err := t.Execute(toolCtx, json.RawMessage(tc.Function.Arguments))
			if err != nil {
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("error executing %s: %s", tc.Function.Name, err),
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
				})
				continue
			}

			content := execResult.Content
			if execResult.IsError {
				content = "error: " + content
			}

			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:       "tool",
				Content:    content,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}
	}
}

func (a *AgentLoop) Run(ctx context.Context, conv *Conversation, userMessage string) <-chan Event {
	ch := make(chan Event, 64)
	a.conv = conv
	go func() {
		defer close(ch)
		a.runStreaming(ctx, conv, userMessage, ch)
	}()
	return ch
}

func (a *AgentLoop) runStreaming(ctx context.Context, conv *Conversation, userMessage string, ch chan<- Event) {
	if conv == nil {
		conv = &Conversation{}
	}

	conv.Messages = append(conv.Messages, engine.ChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	tools := a.buildToolDefs()
	var totalUsage engine.Usage

	for turn := 0; ; turn++ {
		_ = turn // reserved for future logging
		select {
		case <-ctx.Done():
			ch <- Event{Type: EventError, Content: "cancelled"}
			return
		default:
		}

		messages := a.buildMessages(conv)

		if a.isOverflow(conv) {
			a.RunCompactionViaDispatch(ctx, conv, ch)
			messages = a.buildMessages(conv)
		}

		req := engine.ChatRequest{
			Provider: a.providerID,
			Model:    a.model,
			Messages: messages,
			Tools:    tools,
		}

		if turn == 0 {
			conv.TokenCount = a.EstimateContextTokens(conv)
			conv.TokenMax = a.contextLimit()
			ch <- Event{
				Type: EventUsage,
				Usage: UsageEvent{
					TotalTokens:   conv.TokenCount,
					ContextTokens: conv.TokenCount,
					MaxContext:    conv.TokenMax,
				},
			}
		}

		events, err := a.provider.StreamChat(ctx, req)
		if err != nil {
			ch <- Event{Type: EventError, Content: fmt.Sprintf("stream chat: %v", err)}
			return
		}

		var collected []engine.ChatEvent
		var textBuf strings.Builder
		var thinkingBuf strings.Builder
		flushTick := time.NewTicker(30 * time.Millisecond)
		defer flushTick.Stop()

		flushText := func() {
			if textBuf.Len() > 0 {
				ch <- Event{Type: EventTextDelta, Content: textBuf.String()}
				textBuf.Reset()
			}
		}
		flushThinking := func() {
			if thinkingBuf.Len() > 0 {
				ch <- Event{Type: EventThinking, Content: thinkingBuf.String()}
				thinkingBuf.Reset()
			}
		}
		flushAll := func() {
			flushThinking()
			flushText()
		}

		loop := true
		for loop {
			select {
			case <-flushTick.C:
				flushAll()
				continue
			case ev, ok := <-events:
				if !ok {
					loop = false
					break
				}
				collected = append(collected, ev)
				switch ev.Kind {
				case engine.EventContentDelta:
					if ev.ReasoningContent != "" {
						thinkingBuf.WriteString(ev.ReasoningContent)
					} else {
						textBuf.WriteString(ev.Text)
					}
					if utf8.RuneCountInString(textBuf.String()) >= 10 {
						flushText()
					}
					if utf8.RuneCountInString(thinkingBuf.String()) >= 10 {
						flushThinking()
					}
				case engine.EventToolCallStart:
						flushAll()
				case engine.EventToolCallEnd:
					flushAll()
					if ev.ToolCall != nil {
						ch <- Event{
							Type: EventToolDone,
							Tool: &ToolEvent{
								ID:    ev.ToolCall.ID,
								Name:  ev.ToolCall.Function.Name,
								Input: ev.ToolCall.Function.Arguments,
							},
						}
					}
				case engine.EventUsage:
					flushAll()
					totalUsage.InputTokens += ev.Usage.InputTokens
					totalUsage.OutputTokens += ev.Usage.OutputTokens
					totalUsage.TotalTokens += ev.Usage.TotalTokens
					totalUsage.ReasoningTokens += ev.Usage.ReasoningTokens
					totalUsage.CacheReadTokens += ev.Usage.CacheReadTokens
					totalUsage.CacheWriteTokens += ev.Usage.CacheWriteTokens
					ch <- Event{
						Type: EventUsage,
						Usage: UsageEvent{
							InputTokens:      totalUsage.InputTokens,
							OutputTokens:     totalUsage.OutputTokens,
							TotalTokens:      totalUsage.TotalTokens,
							ReasoningTokens:  totalUsage.ReasoningTokens,
							CacheReadTokens:  totalUsage.CacheReadTokens,
							CacheWriteTokens: totalUsage.CacheWriteTokens,
							ContextTokens:    totalUsage.ContextTokens(),
							MaxContext:       a.contextLimit(),
						},
					}
				case engine.EventError:
					flushAll()
					ch <- Event{Type: EventError, Content: ev.Error.Message}
				case engine.EventMessageEnd:
					flushAll()
				}
			}
		}
		flushAll()

		result := parseResult(collected)
		if result.Error != nil {
			return
		}

		if len(result.ToolCalls) == 0 {
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
			})
			ch <- Event{Type: EventDone}
			return
		}

		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
		})

		// Deduplicate tool calls within a turn: same name + same args
		// executes once and reuses the result for every duplicate ID.
		type dedupKey struct {
			name string
			args string
		}
		type cachedResult struct {
			output string
			status string
		}
		executed := make(map[dedupKey]cachedResult)

		for _, tc := range result.ToolCalls {
			select {
			case <-ctx.Done():
				return
			default:
			}

			dk := dedupKey{name: tc.Function.Name, args: tc.Function.Arguments}
			if cached, ok := executed[dk]; ok {
				ch <- Event{Type: EventToolOutput, Tool: &ToolEvent{
					ID: tc.ID, Name: tc.Function.Name,
					Input: tc.Function.Arguments, Output: cached.output, Status: cached.status,
				}}
				content := cached.output
				if cached.status == "error" {
					content = "error: " + content
				}
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role: "tool", Content: content,
					ToolCallID: tc.ID, Name: tc.Function.Name,
				})
				continue
			}

			ch <- Event{
				Type: EventToolStart,
				Tool: &ToolEvent{
					ID: tc.ID, Name: tc.Function.Name,
					Input: tc.Function.Arguments,
				},
			}

			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				// Try MCP tools
				found := false
				for _, conn := range a.mcpConns {
					tools, lerr := conn.ListTools(context.Background())
					if lerr != nil {
						continue
					}
					for _, mt := range tools {
						if mt.Name == tc.Function.Name {
							result, cerr := conn.CallTool(context.Background(), tc.Function.Name, json.RawMessage(tc.Function.Arguments))
							if cerr != nil {
								errMsg := fmt.Sprintf("MCP tool %s error: %s", tc.Function.Name, cerr)
								ch <- Event{
									Type: EventToolOutput,
									Tool: &ToolEvent{
										ID: tc.ID, Name: tc.Function.Name,
										Input: tc.Function.Arguments, Output: errMsg, Status: "error",
									},
								}
								executed[dk] = cachedResult{output: errMsg, status: "error"}
								conv.Messages = append(conv.Messages, engine.ChatMessage{
									Role: "tool", Content: errMsg,
									ToolCallID: tc.ID, Name: tc.Function.Name,
								})
							} else {
								content := string(result)
								ch <- Event{
									Type: EventToolOutput,
									Tool: &ToolEvent{
										ID: tc.ID, Name: tc.Function.Name,
										Input: tc.Function.Arguments, Output: content, Status: "done",
									},
								}
								executed[dk] = cachedResult{output: content, status: "done"}
								conv.Messages = append(conv.Messages, engine.ChatMessage{
									Role: "tool", Content: content,
									ToolCallID: tc.ID, Name: tc.Function.Name,
								})
							}
							found = true
							break
						}
					}
					if found {
						break
					}
				}
				if !found {
					errMsg := fmt.Sprintf("tool %s not found", tc.Function.Name)
					ch <- Event{
						Type: EventToolOutput,
						Tool: &ToolEvent{
							ID: tc.ID, Name: tc.Function.Name,
							Input: tc.Function.Arguments, Output: errMsg, Status: "error",
						},
					}
					executed[dk] = cachedResult{output: errMsg, status: "error"}
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role: "tool", Content: errMsg,
						ToolCallID: tc.ID,
					})
				}
				continue
			}

			if a.pipeline != nil {
				pctx := permission.CheckContext{
					ToolName:   tc.Function.Name,
					Args:       json.RawMessage(tc.Function.Arguments),
					SessionID:  a.sessionID,
					ProjectDir: a.projectDir,
				}
				if a.pipeline.Check(ctx, pctx) == permission.Deny {
					ch <- Event{
						Type: EventToolOutput,
						Tool: &ToolEvent{
							ID:     tc.ID,
							Name:   tc.Function.Name,
							Input:  tc.Function.Arguments,
							Output: "execution denied by user",
							Status: "denied",
						},
					}
					executed[dk] = cachedResult{output: "execution denied by user", status: "denied"}
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role:       "tool",
						Content:    fmt.Sprintf("execution of %s was denied by user", tc.Function.Name),
						ToolCallID: tc.ID,
					})
					continue
				}
			}

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if a.sessionID != "" {
				toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
			}
			toolCtx = tool.WithToolCallID(toolCtx, tc.ID)
			if a.model != "" {
				toolCtx = tool.WithModel(toolCtx, a.model)
			}
			if a.providerID != "" {
				toolCtx = tool.WithProvider(toolCtx, a.providerID)
			}
			if a.askUserFn != nil {
				toolCtx = tool.WithAskUserFunc(toolCtx, a.askUserFn)
			}
			// Check for streaming execution (e.g. SpawnAgent forwards child events)
			type streamingTool interface {
				ExecuteStreaming(ctx context.Context, args json.RawMessage) (<-chan Event, error)
			}
			if st, ok := t.(streamingTool); ok {
				eventCh, execErr := st.ExecuteStreaming(toolCtx, json.RawMessage(tc.Function.Arguments))
				if execErr != nil {
					ch <- Event{Type: EventToolOutput, Tool: &ToolEvent{
						ID: tc.ID, Name: tc.Function.Name,
						Input: tc.Function.Arguments, Output: execErr.Error(), Status: "error",
					}}
					executed[dk] = cachedResult{output: execErr.Error(), status: "error"}
					conv.Messages = append(conv.Messages, engine.ChatMessage{
						Role: "tool", Content: fmt.Sprintf("error: %s", execErr),
						ToolCallID: tc.ID, Name: tc.Function.Name,
					})
					continue
				}
				var streamOutput strings.Builder
				childSID := tc.ID // tool call ID = child session ID
				for ev := range eventCh {
					ev.SessionID = childSID // tag so frontend routes to child tab
					switch ev.Type {
					case EventToolStart:
						streamOutput.Reset()
						ch <- ev
					case EventTextDelta:
						ch <- ev
						streamOutput.WriteString(ev.Content)
					case EventThinking:
						ch <- ev
					case EventToolDone, EventToolOutput:
						ch <- ev
					case EventError:
						ch <- ev
					default:
						ch <- ev
					}
				}
				toolContent := streamOutput.String()
				if toolContent == "" {
					toolContent = "(subtask completed with no output)"
				}
				executed[dk] = cachedResult{output: toolContent, status: "done"}
				ch <- Event{Type: EventToolOutput, Tool: &ToolEvent{
					ID: tc.ID, Name: tc.Function.Name,
					Input: tc.Function.Arguments, Output: toolContent, Status: "done",
				}}
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role: "tool", Content: toolContent,
					ToolCallID: tc.ID, Name: tc.Function.Name,
				})
				continue
			}
			execResult, err := t.Execute(toolCtx, json.RawMessage(tc.Function.Arguments))
			if err != nil {
				ch <- Event{
					Type: EventToolOutput,
					Tool: &ToolEvent{
						ID:     tc.ID,
						Input:  tc.Function.Arguments,
						Output: err.Error(),
						Status: "error",
					},
				}
				executed[dk] = cachedResult{output: err.Error(), status: "error"}
				conv.Messages = append(conv.Messages, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("error executing %s: %s", tc.Function.Name, err),
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
				})
				continue
			}

			toolContent := execResult.Content
			if execResult.IsError {
				toolContent = "error: " + toolContent
			}
			status := "done"
			if execResult.IsError {
				status = "error"
				executed[dk] = cachedResult{output: execResult.Content, status: "error"}
			} else {
				executed[dk] = cachedResult{output: execResult.Content, status: "done"}
			}
			ch <- Event{
				Type: EventToolOutput,
				Tool: &ToolEvent{
					ID:     tc.ID,
					Name:   tc.Function.Name,
					Input:  tc.Function.Arguments,
					Output: execResult.Content,
					Status: status,
				},
			}

			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:       "tool",
				Content:    toolContent,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}

		ch <- Event{Type: EventTurnStart}
	}
}

// EstimateContextTokens runs a client-side tiktoken estimate over all messages
// that will be sent to the model. This is the pre-flight estimate used when the
// API doesn't return usage data, or for context overflow warnings.
func (a *AgentLoop) EstimateContextTokens(conv *Conversation) int64 {
	msgs := a.buildMessages(conv)
	tokenMsgs := make([]tokenizer.Message, len(msgs))
	for i, m := range msgs {
		tokenMsgs[i] = tokenizer.Message{
			Role:             m.Role,
			Content:          m.Content,
			ReasoningContent: m.ReasoningContent,
		}
	}
	return int64(tokenizer.CountMessages(tokenMsgs))
}

func (a *AgentLoop) buildMessages(conv *Conversation) []engine.ChatMessage {
	var messages []engine.ChatMessage

	if a.systemPrompt != "" {
		normalized := strings.ReplaceAll(a.projectDir, "\\", "/")
		prompt := strings.ReplaceAll(a.systemPrompt, "{{WorkingDirectory}}", normalized)
		messages = append(messages, engine.ChatMessage{
			Role:    "system",
			Content: prompt,
		})
	}

	msgs := conv.Messages
	if conv.CompactionFrom > 0 && conv.CompactionFrom < len(msgs) {
		msgs = msgs[conv.CompactionFrom:]
	}
	messages = append(messages, msgs...)
	return messages
}

func (a *AgentLoop) buildToolDefs() []engine.ToolDef {
	if a.agent.Name == "compaction" {
		return nil
	}
	tools := a.tools.List()
	n := len(tools) + len(a.mcpTools)
	defs := make([]engine.ToolDef, 0, n)
	isChild := isChildSession(a.sessionID)
	for _, t := range tools {
		if isChild && (t.Name() == "spawn_agent" || t.Name() == "ask_user") {
			continue
		}
		defs = append(defs, engine.ToolDef{
			Type: "function",
			Function: engine.ToolFunction{
				Name:        t.Name(),
				Description: t.Description(),
				Parameters:  t.Parameters(),
			},
		})
	}
	// Append MCP tools
	for _, mt := range a.mcpTools {
		var params map[string]any
		if len(mt.InputSchema) > 0 {
			json.Unmarshal(mt.InputSchema, &params)
		}
		defs = append(defs, engine.ToolDef{
			Type: "function",
			Function: engine.ToolFunction{
				Name:        mt.Name,
				Description: mt.Description,
				Parameters:  params,
			},
		})
	}
	return defs
}
