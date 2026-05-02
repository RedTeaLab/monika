package agent

// TaskItem is a lightweight task representation for frontend events.
// Mirrors the fields of tool.Task without importing the tool package.
type TaskItem struct {
	ID          string   `json:"id"`
	Subject     string   `json:"subject"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	BlockedBy   []string `json:"blockedBy,omitempty"`
}
