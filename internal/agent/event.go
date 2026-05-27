package agent

type EventType int

const (
	EventTextDelta EventType = iota
	EventThinking
	EventToolStart
	EventToolOutput
	EventToolDone
	EventUsage
	EventError
	EventDone
	EventSessionUpdated
	EventTurnStart
	EventCompaction
)

type Event struct {
	Type       EventType
	Content    string
	SessionID  string // non-empty = event belongs to a specific session (e.g. child agent)
	Tool       *ToolEvent
	Usage      UsageEvent
	Compaction *CompactionEvent
}

type ToolEvent struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Input     string   `json:"input"`
	Output    string   `json:"output"`
	Status    string   `json:"status"`
	DiffLines []string `json:"diffLines,omitempty"`
}

type UsageEvent struct {
	InputTokens      int64 `json:"input_tokens"`
	OutputTokens     int64 `json:"output_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
	ReasoningTokens  int64 `json:"reasoning_tokens"`
	CacheReadTokens  int64 `json:"cache_read_tokens"`
	CacheWriteTokens int64 `json:"cache_write_tokens"`
	ContextTokens    int64 `json:"context_tokens"`
	MaxContext       int64 `json:"max_context"`
}

type CompactionEvent struct {
	Summary       string `json:"summary"`
	BeforeTokens  int64  `json:"before_tokens"`
	AfterTokens   int64  `json:"after_tokens"`
	CompactionNum int    `json:"compaction_num"`
}
