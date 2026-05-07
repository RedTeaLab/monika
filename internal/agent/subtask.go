package agent

type TaskType string

const (
	TaskSubtask    TaskType = "subtask"
	TaskCompaction TaskType = "compaction"
)

type DispatchMode string

const (
	DispatchBlocking   DispatchMode = "blocking"
	DispatchFireForget DispatchMode = "fire_forget"
	DispatchStreaming  DispatchMode = "streaming"
)

type SubTask struct {
	ID          string       `json:"id"`
	Type        TaskType     `json:"type"`
	Agent       string       `json:"agent"`
	Description string       `json:"description"`
	Prompt      string       `json:"prompt"`
	Model       string       `json:"model,omitempty"`
	Provider    string       `json:"provider,omitempty"`
	ProjectDir  string       `json:"project_dir,omitempty"`
	SessionID   string       `json:"session_id"`
	ParentID    string       `json:"parent_id,omitempty"`
	Status      string       `json:"status"`
	Result      string       `json:"result,omitempty"`
}
