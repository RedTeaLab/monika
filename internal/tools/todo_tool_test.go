package tools

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestTodoTool_ListAction(t *testing.T) {
	_ = setupTestTodoManager(t) // setup but not used as TodoTool uses singleton

	// Add some test todos using the tool
	tool := &TodoTool{}

	addArgs1, _ := json.Marshal(map[string]interface{}{
		"action": "add",
		"task":   "Task 1",
	})
	tool.Execute(string(addArgs1))

	addArgs2, _ := json.Marshal(map[string]interface{}{
		"action": "add",
		"task":   "Task 2",
	})
	result2 := tool.Execute(string(addArgs2))

	// Extract ID of second task
	var id2 int
	fmt.Sscanf(result2, "OK: Added todo item #%d:", &id2)

	// Update second task to in_progress
	updateArgs, _ := json.Marshal(map[string]interface{}{
		"action": "update_status",
		"id":     id2,
		"status": "in_progress",
	})
	tool.Execute(string(updateArgs))

	addArgs3, _ := json.Marshal(map[string]interface{}{
		"action": "add",
		"task":   "Task 3",
	})
	result3 := tool.Execute(string(addArgs3))

	// Extract ID of third task
	var id3 int
	fmt.Sscanf(result3, "OK: Added todo item #%d:", &id3)

	// Update third task to completed
	completeArgs, _ := json.Marshal(map[string]interface{}{
		"action": "update_status",
		"id":     id3,
		"status": "completed",
	})
	tool.Execute(string(completeArgs))

	// Test the list action
	listArgs, _ := json.Marshal(map[string]interface{}{
		"action": "list",
	})

	result := tool.Execute(string(listArgs))

	// Verify the result contains expected information
	if len(result) == 0 {
		t.Error("Expected non-empty result")
	}

	// Check for progress bar indicators (should contain █ or ░)
	if !contains(result, "Progress:") {
		t.Error("Expected progress information in result")
	}

	// Check for status summary
	if !contains(result, "completed") || !contains(result, "pending") {
		t.Error("Expected status summary in result")
	}

	t.Logf("Result:\n%s", result)
}

func TestTodoTool_AddAction(t *testing.T) {
	_ = setupTestTodoManager(t) // setup but not used as TodoTool uses singleton

	tool := &TodoTool{}
	args, _ := json.Marshal(map[string]interface{}{
		"action": "add",
		"task":   "Test task for AddAction",
	})

	result := tool.Execute(string(args))

	if !contains(result, "OK:") {
		t.Errorf("Expected success message, got: %s", result)
	}

	if !contains(result, "Test task for AddAction") {
		t.Errorf("Expected task name in result, got: %s", result)
	}
}

func TestTodoTool_UpdateStatusAction(t *testing.T) {
	_ = setupTestTodoManager(t) // setup but not used as TodoTool uses singleton

	// Add a todo using the tool
	tool := &TodoTool{}
	addArgs, _ := json.Marshal(map[string]interface{}{
		"action": "add",
		"task":   "Test task for update",
	})
	addResult := tool.Execute(string(addArgs))

	// Extract ID from result (format: "OK: Added todo item #X: task")
	var id int
	fmt.Sscanf(addResult, "OK: Added todo item #%d:", &id)

	if id == 0 {
		t.Fatalf("Failed to parse ID from result: %s", addResult)
	}

	args, _ := json.Marshal(map[string]interface{}{
		"action": "update_status",
		"id":     id,
		"status": "in_progress",
	})

	result := tool.Execute(string(args))

	if !contains(result, "OK:") {
		t.Errorf("Expected success message, got: %s", result)
	}

	if !contains(result, "in_progress") {
		t.Errorf("Expected status in result, got: %s", result)
	}
}

func TestTodoTool_DeleteAction(t *testing.T) {
	_ = setupTestTodoManager(t) // setup but not used as TodoTool uses singleton

	// Add a todo using the tool
	tool := &TodoTool{}
	addArgs, _ := json.Marshal(map[string]interface{}{
		"action": "add",
		"task":   "Test task to delete",
	})
	addResult := tool.Execute(string(addArgs))

	// Extract ID from result
	var id int
	fmt.Sscanf(addResult, "OK: Added todo item #%d:", &id)

	if id == 0 {
		t.Fatalf("Failed to parse ID from result: %s", addResult)
	}

	args, _ := json.Marshal(map[string]interface{}{
		"action": "delete",
		"id":     id,
	})

	result := tool.Execute(string(args))

	if !contains(result, "OK:") {
		t.Errorf("Expected success message, got: %s", result)
	}

	if !contains(result, "Deleted") {
		t.Errorf("Expected delete confirmation in result, got: %s", result)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && indexOf(s, substr) >= 0))
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
