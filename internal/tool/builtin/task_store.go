package builtin

import (
	"fmt"
	"strings"
	"sync"

	"monika/internal/tool"
)

type taskStore struct {
	mu       sync.RWMutex
	tasks    map[string][]tool.Task
	onChange func(sessionID string, tasks []tool.Task)
}

func NewTaskStore(onChange func(sessionID string, tasks []tool.Task)) tool.TaskStore {
	return &taskStore{
		tasks:    make(map[string][]tool.Task),
		onChange: onChange,
	}
}

// SetTaskStoreCallback updates the onChange callback for an already-created store.
// Used in main.go to wire events after App creation.
func SetTaskStoreCallback(ts tool.TaskStore, cb func(sessionID string, tasks []tool.Task)) {
	if ts2, ok := ts.(*taskStore); ok {
		ts2.onChange = cb
	}
}

var validStatuses = map[string]bool{
	"pending":     true,
	"in_progress": true,
	"completed":   true,
	"cancelled":   true,
}

const maxTasks = 20

func (ts *taskStore) Replace(sessionID string, tasks []tool.Task) error {
	if len(tasks) > maxTasks {
		return fmt.Errorf("validation: too many tasks (%d), max %d", len(tasks), maxTasks)
	}
	for i, t := range tasks {
		if strings.TrimSpace(t.ID) == "" {
			return fmt.Errorf("validation: task %d: id must not be empty", i)
		}
		if strings.TrimSpace(t.Subject) == "" {
			return fmt.Errorf("validation: task %d (%q): subject must not be empty", i, t.ID)
		}
		if !validStatuses[t.Status] {
			return fmt.Errorf("validation: task %d (%q): invalid status %q, must be one of pending/in_progress/completed/cancelled", i, t.ID, t.Status)
		}
	}
	ids := make(map[string]bool, len(tasks))
	for _, t := range tasks {
		if ids[t.ID] {
			return fmt.Errorf("validation: duplicate task id %q", t.ID)
		}
		ids[t.ID] = true
	}
	for i, t := range tasks {
		for _, dep := range t.BlockedBy {
			if dep == t.ID {
				return fmt.Errorf("validation: task %d (%q): blockedBy cannot reference itself", i, t.ID)
			}
			if !ids[dep] {
				return fmt.Errorf("validation: task %d (%q): blockedBy %q does not reference any task in the list", i, t.ID, dep)
			}
		}
	}

	// Merge with existing tasks: preserve completed/cancelled status for idempotency.
	// When task_create is called again, tasks that were already completed or cancelled
	// should not have their status overwritten back to pending.
	existing := ts.tasks[sessionID]
	if len(existing) > 0 {
		statusMap := make(map[string]string, len(existing))
		for _, t := range existing {
			if t.Status == "completed" || t.Status == "cancelled" {
				statusMap[t.ID] = t.Status
			}
		}
		for i := range tasks {
			if preserved, ok := statusMap[tasks[i].ID]; ok {
				tasks[i].Status = preserved
			}
		}
	}

	ts.mu.Lock()
	ts.tasks[sessionID] = tasks
	ts.mu.Unlock()

	if ts.onChange != nil {
		ts.onChange(sessionID, tasks)
	}
	return nil
}

func (ts *taskStore) Update(sessionID, taskID string, fields tool.TaskUpdateFields) error {
	ts.mu.Lock()

	list, ok := ts.tasks[sessionID]
	if !ok || len(list) == 0 {
		ts.mu.Unlock()
		return fmt.Errorf("no tasks for session %s", sessionID)
	}

	idx := -1
	for i, t := range list {
		if t.ID == taskID {
			idx = i
			break
		}
	}
	if idx < 0 {
		ts.mu.Unlock()
		validIDs := make([]string, len(list))
		for i, t := range list {
			validIDs[i] = t.ID
		}
		return fmt.Errorf("task not found: %s. valid ids: [%s]", taskID, strings.Join(validIDs, ", "))
	}

	t := &list[idx]
	if fields.Status != nil {
		if !validStatuses[*fields.Status] {
			ts.mu.Unlock()
			return fmt.Errorf("validation: invalid status %q, must be one of pending/in_progress/completed/cancelled", *fields.Status)
		}
		t.Status = *fields.Status
	}
	if fields.Subject != nil {
		t.Subject = *fields.Subject
	}
	if fields.Description != nil {
		t.Description = *fields.Description
	}
	if len(fields.AddBlockedBy) > 0 {
		t.BlockedBy = append(t.BlockedBy, fields.AddBlockedBy...)
	}

	listCopy := make([]tool.Task, len(list))
	for i := range list {
		listCopy[i] = list[i]
		if list[i].BlockedBy != nil {
			listCopy[i].BlockedBy = make([]string, len(list[i].BlockedBy))
			copy(listCopy[i].BlockedBy, list[i].BlockedBy)
		}
	}
	ts.mu.Unlock()

	if ts.onChange != nil {
		ts.onChange(sessionID, listCopy)
	}
	return nil
}

func (ts *taskStore) List(sessionID string) []tool.Task {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	list := ts.tasks[sessionID]
	if len(list) == 0 {
		return nil
	}
	out := make([]tool.Task, len(list))
	for i := range list {
		out[i] = list[i]
		if list[i].BlockedBy != nil {
			out[i].BlockedBy = make([]string, len(list[i].BlockedBy))
			copy(out[i].BlockedBy, list[i].BlockedBy)
		}
	}
	return out
}

// Snapshot returns all session->tasks for persistence.
func (ts *taskStore) Snapshot() map[string][]tool.Task {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	out := make(map[string][]tool.Task, len(ts.tasks))
	for sid, list := range ts.tasks {
		copied := make([]tool.Task, len(list))
		for i := range list {
			copied[i] = list[i]
			if list[i].BlockedBy != nil {
				copied[i].BlockedBy = make([]string, len(list[i].BlockedBy))
				copy(copied[i].BlockedBy, list[i].BlockedBy)
			}
		}
		out[sid] = copied
	}
	return out
}

// GetTaskStore returns the store itself, keyed by sessionID internally.
func (ts *taskStore) GetTaskStore(sessionID string) tool.TaskStore {
	_ = sessionID
	return ts
}

// Restore loads persisted tasks into the store.
func (ts *taskStore) Restore(sessionID string, tasks []tool.Task) {
	ts.mu.Lock()
	ts.tasks[sessionID] = tasks
	ts.mu.Unlock()
}
