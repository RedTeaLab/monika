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
)

type Event struct {
	Type    EventType
	Content string
	Tool    *ToolEvent
	Usage   UsageEvent
}

type ToolEvent struct {
	ID     string
	Name   string
	Input  string
	Output string
	Status string
}

type UsageEvent struct {
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
}
