package tools

import (
	"path/filepath"
	"sync"
	"testing"
)

func setupTestTodoManager(t *testing.T) *TodoManager {
	// Create a temporary directory for testing
	tmpDir := t.TempDir()

	tm := &TodoManager{
		items:    []*TodoItem{},
		nextID:   1,
		filePath: filepath.Join(tmpDir, "todos.json"),
		mu:       sync.RWMutex{},
	}
	return tm
}

func TestTodoManager_AddTodo(t *testing.T) {
	tm := setupTestTodoManager(t)

	// Test adding a single todo
	item := tm.AddTodo("Test task 1")
	if item == nil {
		t.Fatal("Expected non-nil item")
	}
	if item.ID != 1 {
		t.Errorf("Expected ID 1, got %d", item.ID)
	}
	if item.Task != "Test task 1" {
		t.Errorf("Expected task 'Test task 1', got '%s'", item.Task)
	}
	if item.Status != StatusPending {
		t.Errorf("Expected status %s, got %s", StatusPending, item.Status)
	}

	// Test adding another todo
	item2 := tm.AddTodo("Test task 2")
	if item2.ID != 2 {
		t.Errorf("Expected ID 2, got %d", item2.ID)
	}
}

func TestTodoManager_UpdateStatus(t *testing.T) {
	tm := setupTestTodoManager(t)

	// Add some todos
	item1 := tm.AddTodo("Task 1")
	item2 := tm.AddTodo("Task 2")
	_ = tm.AddTodo("Task 3")

	// Test setting first item to in_progress
	err := tm.UpdateStatus(item1.ID, StatusInProgress)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// Check that item1 is in_progress
	items := tm.GetItems()
	if items[0].Status != StatusInProgress {
		t.Errorf("Expected item 1 to be in_progress, got %s", items[0].Status)
	}

	// Test setting second item to in_progress - should move first back to pending
	err = tm.UpdateStatus(item2.ID, StatusInProgress)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	items = tm.GetItems()
	inProgressCount := 0
	for _, item := range items {
		if item.Status == StatusInProgress {
			inProgressCount++
		}
	}
	if inProgressCount != 1 {
		t.Errorf("Expected exactly 1 item in progress, got %d", inProgressCount)
	}

	// Test completing an item
	err = tm.UpdateStatus(item1.ID, StatusCompleted)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	items = tm.GetItems()
	completedCount := 0
	for _, item := range items {
		if item.Status == StatusCompleted {
			completedCount++
		}
	}
	if completedCount != 1 {
		t.Errorf("Expected exactly 1 completed item, got %d", completedCount)
	}
}

func TestTodoManager_UpdateStatus_NonExistentID(t *testing.T) {
	tm := setupTestTodoManager(t)

	err := tm.UpdateStatus(999, StatusInProgress)
	if err == nil {
		t.Error("Expected error for non-existent ID")
	}
}

func TestTodoManager_GetInProgressItem(t *testing.T) {
	tm := setupTestTodoManager(t)

	// Initially no item in progress
	if tm.GetInProgressItem() != nil {
		t.Error("Expected no item in progress")
	}

	// Add item and set to in_progress
	item := tm.AddTodo("Test task")
	tm.UpdateStatus(item.ID, StatusInProgress)

	inProgress := tm.GetInProgressItem()
	if inProgress == nil {
		t.Fatal("Expected an item in progress")
	}
	if inProgress.ID != item.ID {
		t.Errorf("Expected item ID %d, got %d", item.ID, inProgress.ID)
	}
}

func TestTodoManager_HasPendingItems(t *testing.T) {
	tm := setupTestTodoManager(t)

	if tm.HasPendingItems() {
		t.Error("Expected no pending items initially")
	}

	tm.AddTodo("Task 1")
	if !tm.HasPendingItems() {
		t.Error("Expected pending items after adding")
	}

	items := tm.GetItems()
	tm.UpdateStatus(items[0].ID, StatusCompleted)
	if tm.HasPendingItems() {
		t.Error("Expected no pending items after completing all")
	}
}

func TestTodoManager_GetUncompletedCount(t *testing.T) {
	tm := setupTestTodoManager(t)

	if tm.GetUncompletedCount() != 0 {
		t.Errorf("Expected 0 uncompleted, got %d", tm.GetUncompletedCount())
	}

	tm.AddTodo("Task 1")
	tm.AddTodo("Task 2")
	tm.AddTodo("Task 3")

	if tm.GetUncompletedCount() != 3 {
		t.Errorf("Expected 3 uncompleted, got %d", tm.GetUncompletedCount())
	}

	items := tm.GetItems()
	tm.UpdateStatus(items[0].ID, StatusInProgress)

	if tm.GetUncompletedCount() != 3 {
		t.Errorf("Expected 3 uncompleted, got %d", tm.GetUncompletedCount())
	}

	tm.UpdateStatus(items[1].ID, StatusCompleted)

	if tm.GetUncompletedCount() != 2 {
		t.Errorf("Expected 2 uncompleted, got %d", tm.GetUncompletedCount())
	}
}

func TestTodoManager_GetPendingItems(t *testing.T) {
	tm := setupTestTodoManager(t)

	tm.AddTodo("Task 1")
	tm.AddTodo("Task 2")
	tm.AddTodo("Task 3")

	items := tm.GetItems()
	tm.UpdateStatus(items[0].ID, StatusInProgress)
	tm.UpdateStatus(items[1].ID, StatusCompleted)

	pending := tm.GetPendingItems()
	if len(pending) != 1 {
		t.Errorf("Expected 1 pending item, got %d", len(pending))
	}
	if pending[0].ID != items[2].ID {
		t.Errorf("Expected item ID %d, got %d", items[2].ID, pending[0].ID)
	}
}
