package builtin

import (
	"strings"
	"testing"

	"monika/internal/tool"
)

func TestTaskStoreReplace(t *testing.T) {
	ts := NewTaskStore(nil)

	tasks := []tool.Task{
		{ID: "1", Subject: "First task", Status: "pending"},
		{ID: "2", Subject: "Second task", Status: "in_progress"},
		{ID: "3", Subject: "Third task", Status: "completed"},
	}
	if err := ts.Replace("s1", tasks); err != nil {
		t.Fatal(err)
	}

	list := ts.List("s1")
	if len(list) != 3 {
		t.Fatalf("expected 3 tasks, got %d", len(list))
	}
	if list[0].Subject != "First task" {
		t.Fatalf("unexpected subject: %q", list[0].Subject)
	}
}

func TestTaskStoreReplaceIdempotentPreservesCompleted(t *testing.T) {
	ts := NewTaskStore(nil)

	// Create initial tasks
	tasks := []tool.Task{
		{ID: "1", Subject: "First task", Status: "completed"},
		{ID: "2", Subject: "Second task", Status: "pending"},
		{ID: "3", Subject: "Third task", Status: "cancelled"},
	}
	if err := ts.Replace("s1", tasks); err != nil {
		t.Fatal(err)
	}

	// Replace with new list — completed/cancelled should be preserved
	newTasks := []tool.Task{
		{ID: "1", Subject: "First task", Status: "pending"},
		{ID: "2", Subject: "Second task", Status: "pending"},
		{ID: "3", Subject: "Third task", Status: "pending"},
		{ID: "4", Subject: "Fourth task", Status: "pending"},
	}
	if err := ts.Replace("s1", newTasks); err != nil {
		t.Fatal(err)
	}

	list := ts.List("s1")
	if len(list) != 4 {
		t.Fatalf("expected 4 tasks, got %d", len(list))
	}

	// Task 1 was completed, should stay completed
	if list[0].Status != "completed" {
		t.Fatalf("task 1: expected completed, got %s", list[0].Status)
	}
	// Task 2 was pending, should update to pending (from new list)
	if list[1].Status != "pending" {
		t.Fatalf("task 2: expected pending, got %s", list[1].Status)
	}
	// Task 3 was cancelled, should stay cancelled
	if list[2].Status != "cancelled" {
		t.Fatalf("task 3: expected cancelled, got %s", list[2].Status)
	}
	// Task 4 is new, should be pending
	if list[3].Status != "pending" {
		t.Fatalf("task 4: expected pending, got %s", list[3].Status)
	}
}

func TestTaskStoreReplaceInProgressNotPreserved(t *testing.T) {
	// Only completed and cancelled are preserved; in_progress should NOT be
	ts := NewTaskStore(nil)

	tasks := []tool.Task{
		{ID: "1", Subject: "Task", Status: "in_progress"},
	}
	if err := ts.Replace("s1", tasks); err != nil {
		t.Fatal(err)
	}

	newTasks := []tool.Task{
		{ID: "1", Subject: "Task", Status: "pending"},
	}
	if err := ts.Replace("s1", newTasks); err != nil {
		t.Fatal(err)
	}

	list := ts.List("s1")
	if list[0].Status != "pending" {
		t.Fatalf("in_progress should not be preserved, got %s", list[0].Status)
	}
}

func TestTaskStoreReplaceValidation(t *testing.T) {
	ts := NewTaskStore(nil)

	tests := []struct {
		name  string
		tasks []tool.Task
		errOK func(error) bool
	}{
		{
			name:  "empty id",
			tasks: []tool.Task{{ID: "", Subject: "x", Status: "pending"}},
			errOK: func(e error) bool { return e != nil && strings.Contains(e.Error(), "id must not be empty") },
		},
		{
			name:  "empty subject",
			tasks: []tool.Task{{ID: "1", Subject: "", Status: "pending"}},
			errOK: func(e error) bool { return e != nil && strings.Contains(e.Error(), "subject must not be empty") },
		},
		{
			name:  "invalid status",
			tasks: []tool.Task{{ID: "1", Subject: "x", Status: "unknown"}},
			errOK: func(e error) bool { return e != nil && strings.Contains(e.Error(), "invalid status") },
		},
		{
			name:  "duplicate ids",
			tasks: []tool.Task{{ID: "1", Subject: "a", Status: "pending"}, {ID: "1", Subject: "b", Status: "pending"}},
			errOK: func(e error) bool { return e != nil && strings.Contains(e.Error(), "duplicate task id") },
		},
		{
			name:  "self-reference blockedBy",
			tasks: []tool.Task{{ID: "1", Subject: "x", Status: "pending", BlockedBy: []string{"1"}}},
			errOK: func(e error) bool { return e != nil && strings.Contains(e.Error(), "cannot reference itself") },
		},
		{
			name:  "bad blockedBy reference",
			tasks: []tool.Task{{ID: "1", Subject: "x", Status: "pending", BlockedBy: []string{"nonexistent"}}},
			errOK: func(e error) bool { return e != nil && strings.Contains(e.Error(), "does not reference any task") },
		},
		{
			name: "too many tasks",
			tasks: func() []tool.Task {
				out := make([]tool.Task, 21)
				for i := range out {
					out[i] = tool.Task{ID: string(rune('a' + i%26)) + string(rune('a'+i/26)), Subject: "x", Status: "pending"}
				}
				return out
			}(),
			errOK: func(e error) bool { return e != nil && strings.Contains(e.Error(), "too many tasks") },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ts.Replace("s", tt.tasks)
			if !tt.errOK(err) {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				} else {
					t.Fatal("expected error, got nil")
				}
			}
		})
	}
}

func TestTaskStoreUpdate(t *testing.T) {
	ts := NewTaskStore(nil)

	tasks := []tool.Task{
		{ID: "1", Subject: "First", Status: "pending"},
		{ID: "2", Subject: "Second", Status: "pending"},
	}
	if err := ts.Replace("s1", tasks); err != nil {
		t.Fatal(err)
	}

	completed := "completed"
	if err := ts.Update("s1", "1", tool.TaskUpdateFields{Status: &completed}); err != nil {
		t.Fatal(err)
	}

	list := ts.List("s1")
	if list[0].Status != "completed" {
		t.Fatalf("expected completed, got %s", list[0].Status)
	}
	if list[1].Status != "pending" {
		t.Fatalf("expected pending, got %s", list[1].Status)
	}
}

func TestTaskStoreUpdateMissingSession(t *testing.T) {
	ts := NewTaskStore(nil)

	completed := "completed"
	err := ts.Update("nonexistent", "1", tool.TaskUpdateFields{Status: &completed})
	if err == nil || !strings.Contains(err.Error(), "no tasks for session") {
		t.Fatalf("expected 'no tasks for session' error, got %v", err)
	}
}

func TestTaskStoreUpdateMissingTask(t *testing.T) {
	ts := NewTaskStore(nil)

	tasks := []tool.Task{
		{ID: "1", Subject: "Only task", Status: "pending"},
	}
	if err := ts.Replace("s1", tasks); err != nil {
		t.Fatal(err)
	}

	completed := "completed"
	err := ts.Update("s1", "nonexistent", tool.TaskUpdateFields{Status: &completed})
	if err == nil || !strings.Contains(err.Error(), "task not found") {
		t.Fatalf("expected 'task not found' error, got %v", err)
	}
}

func TestTaskStoreListEmpty(t *testing.T) {
	ts := NewTaskStore(nil)

	list := ts.List("nonexistent")
	if list != nil {
		t.Fatalf("expected nil for nonexistent session, got %v", list)
	}
}

func TestTaskStoreSnapshotRestore(t *testing.T) {
	ts := NewTaskStore(nil)
	store := ts.(*taskStore)

	tasks := []tool.Task{
		{ID: "1", Subject: "Task 1", Status: "completed", BlockedBy: []string{"2"}},
		{ID: "2", Subject: "Task 2", Status: "in_progress"},
	}
	if err := ts.Replace("s1", tasks); err != nil {
		t.Fatal(err)
	}

	snap := store.Snapshot()
	if len(snap) != 1 {
		t.Fatalf("expected 1 session in snapshot, got %d", len(snap))
	}
	if len(snap["s1"]) != 2 {
		t.Fatalf("expected 2 tasks in snapshot, got %d", len(snap["s1"]))
	}

	// Mutate original via Replace — snapshot should be independent
	newTasks := []tool.Task{
		{ID: "1", Subject: "Task 1", Status: "pending"},
	}
	if err := ts.Replace("s1", newTasks); err != nil {
		t.Fatal(err)
	}
	if len(snap["s1"]) != 2 {
		t.Fatal("snapshot was mutated by Replace")
	}

	// Restore from snapshot
	store.Restore("s2", snap["s1"])
	list := ts.List("s2")
	if len(list) != 2 {
		t.Fatalf("expected 2 restored tasks, got %d", len(list))
	}
	if list[0].BlockedBy[0] != "2" {
		t.Fatalf("expected blockedBy preserved, got %v", list[0].BlockedBy)
	}
}

func TestTaskStoreUpdateFiresOnChange(t *testing.T) {
	var firedSession string
	var firedTasks []tool.Task
	ts := NewTaskStore(func(sid string, tasks []tool.Task) {
		firedSession = sid
		firedTasks = tasks
	})

	tasks := []tool.Task{
		{ID: "1", Subject: "Task", Status: "pending"},
	}
	if err := ts.Replace("s1", tasks); err != nil {
		t.Fatal(err)
	}

	if firedSession != "s1" {
		t.Fatalf("onChange not fired for Replace, session=%q", firedSession)
	}
	if len(firedTasks) != 1 {
		t.Fatalf("onChange tasks wrong length: %d", len(firedTasks))
	}

	// Reset and test Update
	firedSession = ""
	completed := "completed"
	if err := ts.Update("s1", "1", tool.TaskUpdateFields{Status: &completed}); err != nil {
		t.Fatal(err)
	}
	if firedSession != "s1" {
		t.Fatalf("onChange not fired for Update, session=%q", firedSession)
	}
	if firedTasks[0].Status != "completed" {
		t.Fatalf("onChange tasks wrong status: %s", firedTasks[0].Status)
	}
}
