package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"monika/internal/permission"
	"monika/internal/tool"
	"monika/pkg/engine"
	"monika/pkg/tokenizer"
)

var shellAnsiRE = regexp.MustCompile(`\x1b\][^\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b.`)

// CompactionPrompt is the system prompt used by the compaction agent.
const CompactionPrompt = `You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns are kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.

If the prompt includes a <previous-summary> block, treat it as the current anchored summary. Update it with the new history by preserving still-true details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context. Respond in the same language as the conversation.`

func (a *AgentLoop) modelLimit() (contextTokens, outputTokens int64) {
	if a.modelContextLimit > 0 {
		return a.modelContextLimit, a.modelOutputLimit
	}
	return 128000, 32768
}

func (a *AgentLoop) contextLimit() int64 {
	ctx, _ := a.modelLimit()
	return ctx
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

const DefaultMaxSteps = 200

func IsChildSession(sessionID string) bool {
	return strings.HasPrefix(sessionID, "call_") || strings.HasPrefix(sessionID, "sub_") || strings.HasPrefix(sessionID, "compact_")
}

func isChildSession(sessionID string) bool { return IsChildSession(sessionID) }

func (a *AgentLoop) isOverflow(conv *Conversation) bool {
	limit := a.contextLimit()
	outputMax := a.modelOutputLimit
	if outputMax <= 0 {
		outputMax = 32768
	}
	usable := limit - outputMax - compactionBuffer
	if usable <= 0 {
		usable = limit / 2
	}
	conv.TokenMax = limit
	return conv.TokenCount >= usable
}

const compactionSummaryTemplate = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Goal
- [single-sentence task summary]

## Constraints & Preferences
- [user constraints, preferences, specs, or "(none)"]

## Progress
### Done
- [completed work or "(none)"]

### In Progress
- [current work or "(none)"]

### Blocked
- [blockers or "(none)"]

## Key Decisions
- [decision and why, or "(none)"]

## Next Steps
- [ordered next actions or "(none)"]

## Critical Context
- [important technical facts, errors, open questions, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, commands, error strings, and identifiers when known.
- Do not mention the summary process or that context was compacted.
- If these cannot fit, prioritize Goal > Key Decisions > Critical Context > Progress > Next Steps.`

func (a *AgentLoop) buildCompactionPrompt(conv *Conversation) ([]engine.ChatMessage, error) {
	tailStart := compactionSplit(conv, a.contextLimit())
	headMsgs := buildCompactionMessages(conv, tailStart)

	if len(headMsgs) == 0 {
		return nil, fmt.Errorf("not enough conversation history to compact (head is empty)")
	}

	// Find any previous compaction summary in the head
	var previousSummary string
	start := conv.CompactionFrom
	for i := start; i < tailStart && i < len(conv.Messages); i++ {
		if conv.Messages[i].Name == "compaction_summary" {
			previousSummary = conv.Messages[i].Content
			break
		}
	}

	// Build the final user instruction based on whether we have a previous summary
	var instruction string
	if previousSummary != "" {
		instruction = "Update the anchored summary below using the conversation history above.\nPreserve still-true details, remove stale details, and merge in the new facts.\n<previous-summary>\n" + previousSummary + "\n</previous-summary>"
	} else {
		instruction = "Create a new anchored summary from the conversation history above."
	}

	// Messages: [head conversations...] + final user instruction with template
	msgs := make([]engine.ChatMessage, 0, len(headMsgs)+1)
	msgs = append(msgs, headMsgs...)
	msgs = append(msgs, engine.ChatMessage{
		Role:    "user",
		Content: instruction + "\n\n" + compactionSummaryTemplate,
	})

	return msgs, nil
}

func (a *AgentLoop) rewriteMessages(conv *Conversation, summary string) {
	tailStart := compactionSplit(conv, a.contextLimit())

	summaryMsg := engine.ChatMessage{
		Role:    "assistant",
		Name:    "compaction_summary",
		Content: summary,
	}

	// Insert summary at head/tail boundary so buildMessages can skip the old head
	// (everything before CompactionFrom) and only send summary + tail to the LLM.
	newMsgs := make([]engine.ChatMessage, 0, len(conv.Messages)+1)
	newMsgs = append(newMsgs, conv.Messages[:tailStart]...)
	newMsgs = append(newMsgs, summaryMsg)
	newMsgs = append(newMsgs, conv.Messages[tailStart:]...)

	conv.Messages = newMsgs
	conv.CompactionFrom = tailStart
	conv.CompactionCount++
	conv.TokenCount = a.EstimateContextTokens(conv)
}

func (a *AgentLoop) RunCompaction(ctx context.Context, conv *Conversation, ch chan<- Event) error {
	beforeTokens := conv.TokenCount

	fmt.Fprintf(os.Stderr, "[monika] compaction: running (tokens=%d, messages=%d, compactCount=%d)\n",
		beforeTokens, len(conv.Messages), conv.CompactionCount)

	prompt, err := a.buildCompactionPrompt(conv)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] compaction: buildCompactionPrompt failed: %v\n", err)
		return err
	}
	// Prepend the compaction system prompt for the direct (non-dispatch) path
	fullMessages := make([]engine.ChatMessage, 0, len(prompt)+1)
	fullMessages = append(fullMessages, engine.ChatMessage{
		Role:    "system",
		Content: CompactionPrompt,
	})
	fullMessages = append(fullMessages, prompt...)

	req := engine.ChatRequest{
		Provider: a.providerID,
		Model:    a.model,
		Messages: fullMessages,
	}

	events, err := a.provider.StreamChat(ctx, req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[monika] compaction: stream error: %v\n", err)
		return fmt.Errorf("compaction stream chat: %w", err)
	}

	var summary strings.Builder
	for ev := range events {
		switch ev.Kind {
		case engine.EventContentDelta:
			summary.WriteString(ev.Text)
		case engine.EventRetrying:
			// compaction doesn't need to forward retry events
		case engine.EventError:
		}
	}
	// Check if context was cancelled after the stream ended.
	if ctx.Err() != nil {
		return ctx.Err()
	}

	result := sanitizeCompactionOutput(summary.String())
	rawLen := summary.Len()
	if result == "" {
		fmt.Fprintf(os.Stderr, "[monika] compaction: empty summary (raw=%d chars)\n", rawLen)
		return fmt.Errorf("compaction returned empty summary")
	}

	a.rewriteMessages(conv, result)

	fmt.Fprintf(os.Stderr, "[monika] compaction: success (raw=%d chars, result=%d chars, afterTokens=%d)\n",
		rawLen, len(result), conv.TokenCount)

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
	projectRules      string // AGENTS.md rules, appended to systemPrompt at call time
	pipeline          *permission.Pipeline
	projectDir        string
	homeDir           string
	model             string
	modelContextLimit int64
	modelOutputLimit  int64
	providerID        string
	mcpRegistry       *engine.MCPRegistry
	askUserFn         tool.AskUserFunc
	taskStore         tool.TaskStore
	memSearchFn       func(query string) string // memory search callback (auto recall)
	memIndexFn        func() string             // memory index callback (dynamic index)
	memQueue          MemoryQueue               // memory update queue (p2-3)
	dbSchemaNote      string                    // one-shot DB availability hint
	maxSteps          int
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

func WithProjectRules(rules string) LoopOption {
	return func(a *AgentLoop) {
		a.projectRules = rules
	}
}

func WithProjectDir(dir string) LoopOption {
	return func(a *AgentLoop) {
		a.projectDir = dir
	}
}
func WithHomeDir(dir string) LoopOption {
	return func(a *AgentLoop) { a.homeDir = dir }
}

func WithModel(model string) LoopOption {
	return func(a *AgentLoop) {
		a.model = model
	}
}

// WithContextLimit sets the model's maximum context window (total tokens).
func WithContextLimit(n int64) LoopOption {
	return func(a *AgentLoop) {
		a.modelContextLimit = n
	}
}

// WithOutputLimit sets the model's maximum output tokens for overflow
// calculation.
func WithOutputLimit(n int64) LoopOption {
	return func(a *AgentLoop) {
		a.modelOutputLimit = n
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

func WithMCPRegistry(reg *engine.MCPRegistry) LoopOption {
	return func(a *AgentLoop) { a.mcpRegistry = reg }
}

func WithAskUserFunc(fn tool.AskUserFunc) LoopOption {
	return func(a *AgentLoop) { a.askUserFn = fn }
}

func WithTaskStore(ts tool.TaskStore) LoopOption {
	return func(a *AgentLoop) { a.taskStore = ts }
}

// WithMemSearchFn registers a memory search callback. The returned string is
// injected as a <recalled-memory> block at the start of each user message,
// giving the LLM automatic memory recall without requiring a tool call.
func WithMemSearchFn(fn func(query string) string) LoopOption {
	return func(a *AgentLoop) { a.memSearchFn = fn }
}

// WithMemIndexFn registers a memory index callback. The returned string is
// injected as a <memory-index> block at each user message, giving the LLM
// a fresh view of all saved memories so it can proactively read relevant ones.
func WithMemIndexFn(fn func() string) LoopOption {
	return func(a *AgentLoop) { a.memIndexFn = fn }
}

// WithMemQueue registers a MemoryQueue. Notes queued by memory tools (e.g.
// memory_write) are drained and injected as a <memory-update> block at the
// start of the next user message, so writes take effect immediately.
func WithMemQueue(q MemoryQueue) LoopOption {
	return func(a *AgentLoop) { a.memQueue = q }
}

// WithDBSchemaNote sets a one-shot database availability hint.
// Injected as <database-schema-available> at message entry, then cleared.
func WithDBSchemaNote(note string) LoopOption {
	return func(a *AgentLoop) { a.dbSchemaNote = note }
}

func WithMaxSteps(n int) LoopOption {
	return func(a *AgentLoop) { a.maxSteps = n }
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

// effectiveSystemPrompt returns the system prompt with project rules appended.
func (a *AgentLoop) effectiveSystemPrompt() string {
	if a.projectRules == "" {
		return a.systemPrompt
	}
	if a.systemPrompt == "" {
		return a.projectRules
	}
	return a.systemPrompt + "\n\n" + a.projectRules
}

// buildEntryPrefix assembles dynamic content prepended to a user message once,
// at the AgentLoop entry. Runs once per message (not per LLM turn).
// userMessage is used ONLY as the search query for memSearchFn; it is not
// echoed back into the returned prefix.
func (a *AgentLoop) buildEntryPrefix(userMessage string) string {
	var b strings.Builder

	// workspace env — current project directory, injected per message so it
	// stays in sync with project switches without re-baking the system prompt.
	if a.projectDir != "" {
		normalized := strings.ReplaceAll(a.projectDir, "\\", "/")
		b.WriteString("<env>\nWorking directory: " + normalized + "\n</env>\n\n")
	}

	// database-schema-available — one-shot hint when this project has databases.
	if a.dbSchemaNote != "" {
		b.WriteString("<database-schema-available>\n")
		b.WriteString(a.dbSchemaNote)
		b.WriteString("\n</database-schema-available>\n\n")
	}

	// recalled-memory (auto search) — enriched with current task subjects
	// for better recall. userMessage alone may be too terse to match stored
	// memories; appending in-progress task subjects provides extra signal.
	if a.memSearchFn != nil {
		searchQuery := userMessage
		if a.taskStore != nil && a.sessionID != "" {
			for _, t := range a.taskStore.List(a.sessionID) {
				if t.Status == "in_progress" {
					searchQuery += " " + t.Subject
				}
			}
		}
		if searchQuery != "" {
			if recalled := a.memSearchFn(searchQuery); recalled != "" {
				b.WriteString("<recalled-memory>\n")
				b.WriteString(recalled)
				b.WriteString("\n</recalled-memory>\n\n")
			}
		}
	}

	// memory-index — fresh overview of all saved memories, recomputed per
	// message so newly written memories appear immediately.
	if a.memIndexFn != nil {
		if index := a.memIndexFn(); index != "" {
			b.WriteString("<memory-index>\nSaved memories. Use memory_read(path) when one looks relevant.\n\n")
			b.WriteString(index)
			b.WriteString("\n</memory-index>\n\n")
		}
	}
	// memory-update — drain notes queued by memory tools since the last message.
	if a.memQueue != nil {
		if notes := a.memQueue.DrainPending(); len(notes) > 0 {
			b.WriteString("<memory-update>\n")
			for _, n := range notes {
				b.WriteString("- " + n + "\n")
			}
			b.WriteString("</memory-update>\n\n")
		}
	}

	// task-list (existing)
	if a.taskStore != nil && a.sessionID != "" {
		if tasks := a.taskStore.List(a.sessionID); len(tasks) > 0 {
			b.WriteString("<task-list>\n")
			b.WriteString("Existing tasks (use task_update to change status; do NOT recreate with task_create):\n")
			for _, t := range tasks {
				fmt.Fprintf(&b, "- [%s] %s: %s\n", t.Status, t.ID, t.Subject)
			}
			b.WriteString("</task-list>\n\n")
		}
	}
	return b.String()
}

func (a *AgentLoop) RunBlocking(ctx context.Context, conv *Conversation, userMessage string) (*LoopResult, error) {
	if conv == nil {
		conv = &Conversation{}
	}

	if userMessage != "" {
		userMessage = a.buildEntryPrefix(userMessage) + userMessage
	}

	conv.Messages = append(conv.Messages, engine.ChatMessage{
		Role:    "user",
		Content: userMessage,
	})

	tools := a.buildToolDefs()
	var totalUsage engine.Usage

	for turn := 0; ; turn++ {
		maxSteps := a.maxSteps
		if maxSteps <= 0 {
			maxSteps = DefaultMaxSteps
		}
		if turn >= maxSteps {
			maxStepsPrompt := a.buildMaxStepsPrompt(conv)
			req := engine.ChatRequest{
				Provider: a.providerID,
				Model:    a.model,
				Messages: maxStepsPrompt,
				Tools:    nil,
			}
			events, err := a.provider.StreamChat(ctx, req)
			if err != nil {
				return nil, fmt.Errorf("max steps reached, summary failed: %w", err)
			}
			var collected []engine.ChatEvent
			for ev := range events {
				collected = append(collected, ev)
			}
			result := parseResult(collected)
			return &LoopResult{
				Conversation: conv,
				Content:      result.Content,
				Usage:        totalUsage,
			}, nil
		}
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
			if result.Content == "" && len(result.ToolCalls) == 0 {
				return nil, result.Error
			}
		}

		totalUsage.InputTokens += result.Usage.InputTokens
		totalUsage.OutputTokens += result.Usage.OutputTokens
		totalUsage.TotalTokens += result.Usage.TotalTokens
		totalUsage.ReasoningTokens += result.Usage.ReasoningTokens
		totalUsage.CacheReadTokens += result.Usage.CacheReadTokens
		totalUsage.CacheWriteTokens += result.Usage.CacheWriteTokens

		if len(result.ToolCalls) == 0 {
			usage := result.Usage // copy per-turn usage
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
				TokenUsage:       &usage,
			})
			return &LoopResult{
				Conversation: conv,
				Content:      result.Content,
				Usage:        totalUsage,
			}, nil
		}

		usage := result.Usage // copy per-turn usage
		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
			TokenUsage:       &usage,
		})

		for _, tc := range result.ToolCalls {
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

			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				// Try MCP tools via O(1) resolve
				found := false
				if a.mcpRegistry != nil {
					serverID, origName, ok := a.mcpRegistry.Resolve(tc.Function.Name)
					if ok {
						conn, hasConn := a.mcpRegistry.GetConnection(serverID)
						if hasConn {
							result, cerr := conn.CallTool(ctx, origName, json.RawMessage(tc.Function.Arguments))
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
						}
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

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if (tc.Function.Name == "file_edit" || tc.Function.Name == "patch") && result.Content != "" {
				toolCtx = tool.WithMessageContent(toolCtx, result.Content)
			}
			if a.sessionID != "" {
				toolCtx = tool.WithSessionID(toolCtx, a.sessionID)
			}
			if a.model != "" {
				toolCtx = tool.WithModel(toolCtx, a.model)
			}
			if a.providerID != "" {
				toolCtx = tool.WithProvider(toolCtx, a.providerID)
			}
			if a.modelContextLimit > 0 {
				toolCtx = tool.WithContextLimit(toolCtx, a.modelContextLimit)
			}
			if a.modelOutputLimit > 0 {
				toolCtx = tool.WithOutputLimit(toolCtx, a.modelOutputLimit)
			}
			if a.askUserFn != nil {
				toolCtx = tool.WithAskUserFunc(toolCtx, a.askUserFn)
			}
			if a.memQueue != nil {
				toolCtx = WithMemoryQueueInContext(toolCtx, a.memQueue)
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
	ch := make(chan Event, 128)
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

	// Only append a new user message if the conversation doesn't already have
	// pre-seeded messages (compaction uses pre-built messages from SubTask.Messages).
	if userMessage != "" {
		userMessage = a.buildEntryPrefix(userMessage) + userMessage

		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:    "user",
			Content: userMessage,
		})
	}

	tools := a.buildToolDefs()

	for turn := 0; ; turn++ {
		maxSteps := a.maxSteps
		if maxSteps <= 0 {
			maxSteps = DefaultMaxSteps
		}
		if turn >= maxSteps {
			ch <- Event{Type: EventMaxSteps, Content: "Maximum steps reached"}
			maxStepsPrompt := a.buildMaxStepsPrompt(conv)
			req := engine.ChatRequest{
				Provider: a.providerID,
				Model:    a.model,
				Messages: maxStepsPrompt,
				Tools:    nil,
			}
			events, err := a.provider.StreamChat(ctx, req)
			if err != nil {
				ch <- Event{Type: EventTextDelta, Content: "Maximum steps reached. Unable to generate summary."}
				ch <- Event{Type: EventDone}
				return
			}
			for ev := range events {
				if ev.Kind == engine.EventContentDelta && ev.Text != "" {
					ch <- Event{Type: EventTextDelta, Content: ev.Text}
				}
			}
			ch <- Event{Type: EventDone}
			return
		}
		select {
		case <-ctx.Done():
			ch <- Event{Type: EventError, Content: "cancelled"}
			return
		default:
		}

		messages := a.buildMessages(conv)

		if a.isOverflow(conv) && a.agent.Name != "compaction" {
			fmt.Fprintf(os.Stderr, "[monika] compaction: overflow detected (tokens=%d, limit=%d, messages=%d)\n",
				conv.TokenCount, a.contextLimit(), len(conv.Messages))
			if err := a.RunCompaction(ctx, conv, ch); err != nil {
				fmt.Fprintf(os.Stderr, "[monika] compaction: failed, proceeding with full context: %v\n", err)
			}
			messages = a.buildMessages(conv)
		}

		req := engine.ChatRequest{
			Provider: a.providerID,
			Model:    a.model,
			Messages: messages,
			Tools:    tools,
		}

		// Per-turn usage tracks tokens for this single API call.
		perTurnUsage := engine.Usage{}

		events, err := a.provider.StreamChat(ctx, req)
		if err != nil {
			ch <- Event{Type: EventError, Content: fmt.Sprintf("stream chat: %v", err)}
			return
		}

		var collected []engine.ChatEvent
		var textBuf strings.Builder
		var thinkingBuf strings.Builder
		var thinkFilter thinkStreamFilter
		flushTick := time.NewTicker(50 * time.Millisecond)
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
			case <-ctx.Done():
				flushAll()
				ch <- Event{Type: EventError, Content: "cancelled"}
				return
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
						tText, tThink := thinkFilter.Write(ev.Text)
						if tText != "" {
							textBuf.WriteString(tText)
						}
						if tThink != "" {
							thinkingBuf.WriteString(tThink)
						}
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
					perTurnUsage.InputTokens += ev.Usage.InputTokens
					perTurnUsage.OutputTokens += ev.Usage.OutputTokens
					perTurnUsage.TotalTokens += ev.Usage.TotalTokens
					perTurnUsage.ReasoningTokens += ev.Usage.ReasoningTokens
					perTurnUsage.CacheReadTokens += ev.Usage.CacheReadTokens
					perTurnUsage.CacheWriteTokens += ev.Usage.CacheWriteTokens
					conv.TokenCount = perTurnUsage.TotalTokens
					conv.TokenMax = a.contextLimit()
					ch <- Event{
						Type: EventUsage,
						Usage: UsageEvent{
							InputTokens:      perTurnUsage.InputTokens,
							OutputTokens:     perTurnUsage.OutputTokens,
							TotalTokens:      perTurnUsage.TotalTokens,
							ReasoningTokens:  perTurnUsage.ReasoningTokens,
							CacheReadTokens:  perTurnUsage.CacheReadTokens,
							CacheWriteTokens: perTurnUsage.CacheWriteTokens,
							ContextTokens:    perTurnUsage.TotalTokens,
							MaxContext:       a.contextLimit(),
						},
					}
				case engine.EventError:
					flushAll()
					ch <- Event{Type: EventError, Content: ev.Error.Message}
				case engine.EventRetrying:
					ch <- Event{
						Type:         EventRetrying,
						RetryAttempt: ev.RetryAttempt,
						RetryMax:     ev.RetryMax,
						Content:      ev.RetryReason,
					}
					flushAll()
				}
			}
		}
		flushAll()

		// Flush any text still buffered inside the think tag filter.
		ftText, ftThink := thinkFilter.Flush()
		if ftText != "" {
			textBuf.WriteString(ftText)
		}
		if ftThink != "" {
			thinkingBuf.WriteString(ftThink)
		}
		flushAll()

		result := parseResult(collected)
		if result.Error != nil {
			if result.Content == "" && len(result.ToolCalls) == 0 {
				return
			}
		}
		if result.AbnormalEnd {
			errMsg := "响应流异常结束，内容可能不完整"
			if result.RawError != "" {
				errMsg += fmt.Sprintf("（提供商原始错误：%s）", result.RawError)
			}
			ch <- Event{Type: EventError, Content: errMsg}
		}

		if len(result.ToolCalls) == 0 {
			usage := perTurnUsage // copy
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:             "assistant",
				Content:          result.Content,
				ReasoningContent: result.ReasoningContent,
				TokenUsage:       &usage,
			})
			ch <- Event{Type: EventDone}
			return
		}

		usage := perTurnUsage // copy
		conv.Messages = append(conv.Messages, engine.ChatMessage{
			Role:             "assistant",
			ReasoningContent: result.ReasoningContent,
			ToolCalls:        result.ToolCalls,
			TokenUsage:       &usage,
		})

		// Deduplicate and execute tool calls in parallel.
		// Pre-checks (dedup, lookup, permission) run sequentially;
		// actual tool execution runs in goroutines so that long-running
		// tools like spawn_agent can run concurrently.
		// EventToolOutput is sent immediately when each tool finishes,
		// so the frontend sees per-tool completion in real-time.
		type dedupKey struct {
			name string
			args string
		}
		type cachedResult struct {
			output string
			status string
		}
		executed := make(map[dedupKey]cachedResult)

		sendToolOutput := func(tc engine.ToolCall, output, status string, diffLines []string, conflict bool, diskContent, aiContent string) {
			content := output
			if status == "error" {
				content = "error: " + content
			} else if status == "denied" {
				content = "execution denied by user"
			}
			ch <- Event{
				Type: EventToolOutput,
				Tool: &ToolEvent{
					ID:          tc.ID,
					Name:        tc.Function.Name,
					Input:       tc.Function.Arguments,
					Output:      content,
					Status:      status,
					DiffLines:   diffLines,
					Conflict:    conflict,
					DiskContent: diskContent,
					AiContent:   aiContent,
				},
			}
		}

		type toolResult struct {
			tc          engine.ToolCall
			output      string
			status      string
			diffLines   []string
			conflict    bool
			diskContent string
			aiContent   string
			preChecked  bool
		}
		results := make([]toolResult, len(result.ToolCalls))

		type pendingCall struct {
			tc        engine.ToolCall
			dk        dedupKey
			t         tool.Tool
			toolCtx   context.Context
			isMCP     bool
			mcpServer string
			mcpName   string
		}
		pending := make([]pendingCall, 0, len(result.ToolCalls))

		for i, tc := range result.ToolCalls {
			select {
			case <-ctx.Done():
				return
			default:
			}

			results[i].tc = tc
			dk := dedupKey{name: tc.Function.Name, args: tc.Function.Arguments}

			if cached, ok := executed[dk]; ok {
				results[i].output = cached.output
				results[i].status = cached.status
				results[i].preChecked = true
				sendToolOutput(tc, cached.output, cached.status, nil, false, "", "")
				continue
			}

			ch <- Event{
				Type: EventToolStart,
				Tool: &ToolEvent{
					ID: tc.ID, Name: tc.Function.Name,
					Input: tc.Function.Arguments,
				},
			}

			if a.pipeline != nil {
				pctx := permission.CheckContext{
					ToolName:   tc.Function.Name,
					Args:       json.RawMessage(tc.Function.Arguments),
					SessionID:  a.sessionID,
					ProjectDir: a.projectDir,
				}
				if a.pipeline.Check(ctx, pctx) == permission.Deny {
					results[i].output = "execution denied by user"
					results[i].status = "denied"
					results[i].preChecked = true
					executed[dk] = cachedResult{output: "execution denied by user", status: "denied"}
					sendToolOutput(tc, "execution denied by user", "denied", nil, false, "", "")
					continue
				}
			}

			t, ok := a.tools.Get(tc.Function.Name)
			if !ok {
				found := false
				if a.mcpRegistry != nil {
					serverID, origName, mcpOK := a.mcpRegistry.Resolve(tc.Function.Name)
					if mcpOK {
						_, hasConn := a.mcpRegistry.GetConnection(serverID)
						if hasConn {
							results[i].status = "done"
							pending = append(pending, pendingCall{
								tc: tc, dk: dk, isMCP: true,
								mcpServer: serverID, mcpName: origName,
							})
							found = true
						}
					}
				}
				if !found {
					results[i].output = fmt.Sprintf("tool %s not found", tc.Function.Name)
					results[i].status = "error"
					results[i].preChecked = true
					executed[dk] = cachedResult{output: results[i].output, status: "error"}
					sendToolOutput(tc, results[i].output, "error", nil, false, "", "")
				}
				continue
			}

			toolCtx := tool.WithProjectDir(ctx, a.projectDir)
			if (tc.Function.Name == "file_edit" || tc.Function.Name == "patch") && result.Content != "" {
				toolCtx = tool.WithMessageContent(toolCtx, result.Content)
			}
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
			if a.modelContextLimit > 0 {
				toolCtx = tool.WithContextLimit(toolCtx, a.modelContextLimit)
			}
			if a.modelOutputLimit > 0 {
				toolCtx = tool.WithOutputLimit(toolCtx, a.modelOutputLimit)
			}
			if a.askUserFn != nil {
				toolCtx = tool.WithAskUserFunc(toolCtx, a.askUserFn)
			}
			if a.memQueue != nil {
				toolCtx = WithMemoryQueueInContext(toolCtx, a.memQueue)
			}

			results[i].status = "done"
			pending = append(pending, pendingCall{tc: tc, dk: dk, t: t, toolCtx: toolCtx})
		}

		var wg sync.WaitGroup

		for pi := range pending {
			p := &pending[pi]
			var ri int
			for i := range results {
				if results[i].tc.ID == p.tc.ID {
					ri = i
					break
				}
			}

			wg.Add(1)
			go func(rIdx int, pc *pendingCall) {
				defer wg.Done()

				if pc.isMCP {
					conn, _ := a.mcpRegistry.GetConnection(pc.mcpServer)
					mcpResult, cerr := conn.CallTool(ctx, pc.mcpName, json.RawMessage(pc.tc.Function.Arguments))
					if cerr != nil {
						results[rIdx].output = fmt.Sprintf("MCP tool %s error: %s", pc.tc.Function.Name, cerr)
						results[rIdx].status = "error"
					} else {
						results[rIdx].output = string(mcpResult)
					}
					sendToolOutput(pc.tc, results[rIdx].output, results[rIdx].status, nil, false, "", "")
					return
				}

				type streamingTool interface {
					ExecuteStreaming(ctx context.Context, args json.RawMessage) (<-chan Event, error)
				}
				if st, ok := pc.t.(streamingTool); ok {
					eventCh, execErr := st.ExecuteStreaming(pc.toolCtx, json.RawMessage(pc.tc.Function.Arguments))
					if execErr != nil {
						results[rIdx].output = execErr.Error()
						results[rIdx].status = "error"
						sendToolOutput(pc.tc, execErr.Error(), "error", nil, false, "", "")
						return
					}
					var streamOutput strings.Builder
					childSID := pc.tc.ID
					streamStatus := "done"
					for ev := range eventCh {
						ev.SessionID = childSID
						switch ev.Type {
						case EventToolStart:
							streamOutput.Reset()
							select {
							case ch <- ev:
							case <-ctx.Done():
								return
							}
						case EventTextDelta:
							select {
							case ch <- ev:
							default:
							}
							streamOutput.WriteString(ev.Content)
						case EventToolProgress:
							// Progress is forwarded to the frontend so the
							// matching tool card can update its running
							// state live, but is intentionally NOT
							// accumulated into streamOutput: those
							// messages would otherwise land as raw text
							// in the chat stream AND pollute the
							// tool's JSON output.
							select {
							case ch <- ev:
							case <-ctx.Done():
								return
							}
						case EventThinking:
							select {
							case ch <- ev:
							case <-ctx.Done():
								return
							}
						case EventToolDone, EventToolOutput:
							select {
							case ch <- ev:
							case <-ctx.Done():
								return
							}
						case EventError:
							// Tool-internal errors must not propagate as
							// session-level errors — EventError is the
							// agent's signal that the whole session is
							// unrecoverable, but a streaming tool's
							// failure (e.g. spawn_agent subagent error,
							// video_understand ffprobe missing) should
							// only mark the tool itself as failed.
							// Remember the error and fall through to
							// apply status="error" on the final
							// tool_done event.
							streamStatus = "error"
							if streamOutput.Len() == 0 {
								streamOutput.WriteString("error: " + ev.Content)
							}
						default:
							select {
							case ch <- ev:
							case <-ctx.Done():
								return
							}
						}
					}
					toolContent := streamOutput.String()
					if toolContent == "" {
						toolContent = "(subtask completed with no output)"
					}
					results[rIdx].output = toolContent
					results[rIdx].status = streamStatus
					sendToolOutput(pc.tc, toolContent, streamStatus, nil, false, "", "")
					return
				}

				execResult, err := pc.t.Execute(pc.toolCtx, json.RawMessage(pc.tc.Function.Arguments))
				if err != nil {
					results[rIdx].output = err.Error()
					results[rIdx].status = "error"
					sendToolOutput(pc.tc, err.Error(), "error", nil, false, "", "")
					return
				}
				results[rIdx].output = execResult.Content
				if execResult.IsError {
					results[rIdx].status = "error"
					results[rIdx].output = "error: " + execResult.Content
				} else {
					results[rIdx].status = "done"
				}
				results[rIdx].diffLines = execResult.DiffLines
				results[rIdx].conflict = execResult.Conflict
				results[rIdx].diskContent = execResult.DiskContent
				results[rIdx].aiContent = execResult.AiContent
				// Surface token usage from tools that talk to an LLM on
				// their own (image/video_understand). Without this the
				// vision calls are invisible to budget tracking and
				// compaction decisions. The tool stores the wire-format
				// engine.Usage it received from the provider stream;
				// translate it into the agent.UsageEvent the wire
				// expects.
				if execResult.Usage != nil {
					if u, ok := execResult.Usage.(*engine.Usage); ok && u != nil {
						ch <- Event{Type: EventUsage, Usage: UsageEvent{
							InputTokens:      u.InputTokens,
							OutputTokens:     u.OutputTokens,
							TotalTokens:      u.TotalTokens,
							ReasoningTokens:  u.ReasoningTokens,
							CacheReadTokens:  u.CacheReadTokens,
							CacheWriteTokens: u.CacheWriteTokens,
						}}
					}
				}
				sendToolOutput(pc.tc, results[rIdx].output, results[rIdx].status,
					execResult.DiffLines, execResult.Conflict, execResult.DiskContent, execResult.AiContent)
			}(ri, p)
		}

		wg.Wait()

		// Append tool results to conversation in original tool call order
		for _, res := range results {
			tc := res.tc
			if !res.preChecked {
				dk := dedupKey{name: tc.Function.Name, args: tc.Function.Arguments}
				executed[dk] = cachedResult{output: res.output, status: res.status}
			}

			convContent := res.output
			if res.status == "error" {
				convContent = "error: " + convContent
			} else if res.status == "denied" {
				convContent = fmt.Sprintf("execution of %s was denied by user", tc.Function.Name)
			}
			conv.Messages = append(conv.Messages, engine.ChatMessage{
				Role:       "tool",
				Content:    convContent,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}

		ch <- Event{Type: EventTurnStart}
	}
}

// EstimateContextTokens runs a chars/4 estimate over all messages. This is only
// used for internal compaction calculations (tail selection / preserve budget).
// Overflow detection uses API-reported token counts.
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

	msgs := conv.Messages
	if conv.CompactionFrom > 0 && conv.CompactionFrom < len(msgs) {
		msgs = msgs[conv.CompactionFrom:]
	}

	// Extract compaction summary from messages and inject into system prompt.
	// The compaction_summary is stored as an assistant message for display but
	// must not be sent as assistant to the LLM (breaks system->user ordering).
	var summaryContent string
	var filteredMsgs []engine.ChatMessage
	for _, m := range msgs {
		if m.Name == "compaction_summary" && m.Role == "assistant" {
			summaryContent = m.Content
			continue
		}
		filteredMsgs = append(filteredMsgs, m)
	}

	// Convert shell messages to user role for LLM visibility.
	for i, m := range filteredMsgs {
		if m.Role == "shell" {
			filteredMsgs[i] = engine.ChatMessage{
				Role:    "user",
				Content: shellAnsiRE.ReplaceAllString(m.Content, ""),
			}
		}
	}

	if a.systemPrompt != "" || summaryContent != "" {
		var parts []string
		if sp := a.effectiveSystemPrompt(); sp != "" {
			parts = append(parts, sp)
		}
		if summaryContent != "" {
			parts = append(parts, "\n\n<context-summary>\n"+summaryContent+"\n</context-summary>")
		}

		messages = append(messages, engine.ChatMessage{

			Role:    "system",
			Content: strings.Join(parts, ""),
		})
	}

	messages = append(messages, filteredMsgs...)
	result := sanitizeMessageSequence(sanitizeToolCallPairs(messages))

	// Compaction can split within a turn, producing a tail with no user
	// message. Most providers require at least one user message, so inject a
	// synthetic one when the sanitized result only contains the system message.
	hasUser := false
	for _, m := range result {
		if m.Role == "user" {
			hasUser = true
			break
		}
	}
	if !hasUser {
		result = append(result, engine.ChatMessage{
			Role:    "user",
			Content: "Continue.",
		})
	}

	return result
}

func (a *AgentLoop) buildMaxStepsPrompt(conv *Conversation) []engine.ChatMessage {
	sysPrompt := a.effectiveSystemPrompt()

	maxStepsPrompt := `CRITICAL - MAXIMUM STEPS REACHED

The maximum number of steps allowed for this task has been reached. Tools are now disabled. You MUST respond with text only.

Your response must include:
- Statement that maximum steps have been reached
- Summary of what was accomplished so far
- List of any remaining tasks that were not completed
- Recommendations for what should be done next

Do NOT make any tool calls. Respond with text ONLY.`

	messages := []engine.ChatMessage{
		{Role: "system", Content: sysPrompt + "\n\n" + maxStepsPrompt},
	}

	var userMsgs []engine.ChatMessage
	for _, m := range conv.Messages {
		if m.Role == "user" {
			userMsgs = append(userMsgs, m)
		}
	}
	if len(userMsgs) > 0 {
		last := userMsgs[len(userMsgs)-1]
		messages = append(messages, engine.ChatMessage{
			Role:    "user",
			Content: last.Content,
		})
	}

	messages = append(messages, engine.ChatMessage{
		Role:    "user",
		Content: "Maximum steps reached. Please provide a summary of work done and remaining tasks.",
	})

	return messages
}

// sanitizeToolCallPairs ensures every assistant message with tool_calls
// is followed by tool response messages for each tool_call_id.
// If the session was interrupted during tool execution, synthetic error
// responses are appended for any missing tool_call_ids.
// sanitizeMessageSequence fixes invalid message sequences that can arise after
// compaction splits the conversation within a turn. Two issues are handled:
//
//  1. Leading non-user messages after system (e.g. system→tool or system→assistant)
//     are trimmed because the first non-system message must be "user".
//  2. Orphan tool messages whose tool_call_id has no matching assistant tool_calls
//     in the current context are removed.
func sanitizeMessageSequence(messages []engine.ChatMessage) []engine.ChatMessage {
	if len(messages) == 0 {
		return messages
	}

	// --- Step 1: trim leading non-user messages after system ---
	start := 0
	if messages[0].Role == "system" {
		start = 1
	}
	for start < len(messages) && messages[start].Role != "user" {
		start++
	}
	// Re-slice: keep system (if present) + from first user onward.
	if messages[0].Role == "system" {
		messages = append(messages[:1], messages[start:]...)
	} else {
		messages = messages[start:]
	}

	if len(messages) == 0 {
		return messages
	}

	// --- Step 2: remove orphan tool messages ---
	// Collect all tool_call_ids present in assistant messages.
	validToolIDs := make(map[string]bool)
	for _, m := range messages {
		if m.Role == "assistant" {
			for _, tc := range m.ToolCalls {
				validToolIDs[tc.ID] = true
			}
		}
	}

	var filtered []engine.ChatMessage
	for _, m := range messages {
		if m.Role == "tool" && !validToolIDs[m.ToolCallID] {
			continue // orphan tool message, skip
		}
		filtered = append(filtered, m)
	}

	return filtered
}

func sanitizeToolCallPairs(messages []engine.ChatMessage) []engine.ChatMessage {
	if len(messages) == 0 {
		return messages
	}

	var result []engine.ChatMessage
	for i := 0; i < len(messages); i++ {
		msg := messages[i]
		result = append(result, msg)

		if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
			// Collect tool_call_ids that need responses
			needResponses := make(map[string]string) // id -> tool name
			for _, tc := range msg.ToolCalls {
				needResponses[tc.ID] = tc.Function.Name
			}

			// Scan subsequent tool messages to find which IDs are already answered
			for j := i + 1; j < len(messages) && len(needResponses) > 0; j++ {
				if messages[j].Role != "tool" {
					break
				}
				delete(needResponses, messages[j].ToolCallID)
			}

			// Append synthetic error responses for any missing IDs
			for id, name := range needResponses {
				result = append(result, engine.ChatMessage{
					Role:       "tool",
					Content:    fmt.Sprintf("Tool execution was interrupted before %s could complete.", name),
					ToolCallID: id,
					Name:       name,
				})
			}
		}
	}
	return result
}

func (a *AgentLoop) buildToolDefs() []engine.ToolDef {
	if a.agent.Name == "compaction" {
		return nil
	}
	tools := a.tools.List()
	mcpLen := 0
	if a.mcpRegistry != nil {
		mcpLen = a.mcpRegistry.LenTools()
	}
	n := len(tools) + mcpLen
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
	if a.mcpRegistry != nil {
		for _, mt := range a.mcpRegistry.GetTools() {
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
	}
	return defs
}
