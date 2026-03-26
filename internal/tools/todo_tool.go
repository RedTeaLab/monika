package tools

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// TodoTool handles todo operations
type TodoTool struct{}

func (t *TodoTool) Name() string {
	return "todo"
}

func (t *TodoTool) Description() string {
	return "Manage todo items with status tracking. Allows adding, updating status, and listing todos. Only one item can be in_progress at a time."
}

func (t *TodoTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action": map[string]any{
				"type":        "string",
				"description": "The action to perform: 'add', 'update_status', 'list', 'delete'",
			},
			"task": map[string]any{
				"type":        "string",
				"description": "The task description (required for 'add' action)",
			},
			"id": map[string]any{
				"type":        "integer",
				"description": "The ID of the todo item (required for 'update_status' and 'delete' actions)",
			},
			"status": map[string]any{
				"type":        "string",
				"description": "The new status: 'pending', 'in_progress', 'completed' (required for 'update_status' action)",
			},
		},
		"required": []string{"action"},
	}
}

func (t *TodoTool) Execute(args ...string) string {
	if len(args) == 0 {
		return "Error: No arguments provided."
	}

	// Parse the JSON arguments
	var params struct {
		Action string `json:"action"`
		Task   string `json:"task"`
		ID     int    `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(args[0]), &params); err != nil {
		return fmt.Sprintf("Error: Invalid arguments format - %v", err)
	}

	if params.Action == "" {
		return "Error: No action provided."
	}

	tm := GetTodoManager()

	switch params.Action {
	case "add":
		if params.Task == "" {
			return "Error: 'task' is required for 'add' action."
		}
		item := tm.AddTodo(params.Task)
		return fmt.Sprintf("OK: Added todo item #%d: %s (status: %s)", item.ID, item.Task, FormatStatus(item.Status))

	case "update_status":
		if params.ID == 0 {
			return "Error: 'id' is required for 'update_status' action."
		}
		if params.Status == "" {
			return "Error: 'status' is required for 'update_status' action."
		}

		// Validate status
		status := TodoStatus(params.Status)
		if status != StatusPending && status != StatusInProgress && status != StatusCompleted {
			return fmt.Sprintf("Error: Invalid status '%s'. Must be 'pending', 'in_progress', or 'completed'.", params.Status)
		}

		if err := tm.UpdateStatus(params.ID, status); err != nil {
			return fmt.Sprintf("Error: %v", err)
		}

		// Get the updated item
		items := tm.GetItems()
		for _, item := range items {
			if item.ID == params.ID {
				return fmt.Sprintf("OK: Updated todo item #%d: %s (status: %s)", item.ID, item.Task, FormatStatus(item.Status))
			}
		}
		return fmt.Sprintf("OK: Updated todo item #%d status to %s", params.ID, FormatStatus(status))

	case "list":
		return t.formatTodoList()

	case "delete":
		if params.ID == 0 {
			return "Error: 'id' is required for 'delete' action."
		}

		// Get the item before deleting for the confirmation message
		items := tm.GetItems()
		var taskToDelete string
		for _, item := range items {
			if item.ID == params.ID {
				taskToDelete = item.Task
				break
			}
		}

		if err := tm.DeleteTodo(params.ID); err != nil {
			return fmt.Sprintf("Error: %v", err)
		}

		return fmt.Sprintf("OK: Deleted todo item #%d: %s", params.ID, taskToDelete)

	default:
		return fmt.Sprintf("Error: Unknown action '%s'. Valid actions are: 'add', 'update_status', 'list'", params.Action)
	}
}

func (t *TodoTool) formatTodoList() string {
	tm := GetTodoManager()
	items := tm.GetItems()

	if len(items) == 0 {
		return "No todo items found."
	}

	// Sort items: in_progress first, then pending, then completed
	sort.Slice(items, func(i, j int) bool {
		priority := map[TodoStatus]int{
			StatusInProgress: 0,
			StatusPending:    1,
			StatusCompleted:  2,
		}
		return priority[items[i].Status] < priority[items[j].Status]
	})

	var builder strings.Builder
	fmt.Fprintf(&builder, "Todo List (%d items)\n", len(items))

	// Add progress bar
	total := len(items)
	completed := 0
	inProgressCount := 0
	pendingCount := 0
	for _, item := range items {
		switch item.Status {
		case StatusCompleted:
			completed++
		case StatusInProgress:
			inProgressCount++
		case StatusPending:
			pendingCount++
		}
	}

	// Calculate progress percentage
	percentage := float64(completed) / float64(total) * 100

	// Build progress bar (width 40)
	barWidth := 40
	filled := int(float64(barWidth) * percentage / 100)
	progressBar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)

	fmt.Fprintf(&builder, "\nProgress: [%s] %.1f%% (%d/%d)\n", progressBar, percentage, completed, total)
	fmt.Fprintf(&builder, "Status:   %d completed, %d in progress, %d pending\n", completed, inProgressCount, pendingCount)
	builder.WriteString(strings.Repeat("-", 50) + "\n")

	// Group by status
	inProgress := tm.GetInProgressItem()
	pendingItems := tm.GetPendingItems()
	var completedItems []*TodoItem
	for _, item := range items {
		if item.Status == StatusCompleted {
			completedItems = append(completedItems, item)
		}
	}

	// Print in_progress item
	if inProgress != nil {
		fmt.Fprintf(&builder, "[IN PROGRESS] #%d: %s\n", inProgress.ID, inProgress.Task)
	}

	// Print pending items
	if len(pendingItems) > 0 {
		if inProgress != nil {
			builder.WriteString("\n")
		}
		for _, item := range pendingItems {
			fmt.Fprintf(&builder, "[PENDING]    #%d: %s\n", item.ID, item.Task)
		}
	}

	// Print completed items
	if len(completedItems) > 0 {
		if inProgress != nil || len(pendingItems) > 0 {
			builder.WriteString("\n")
		}
		for _, item := range completedItems {
			fmt.Fprintf(&builder, "[COMPLETED]  #%d: %s\n", item.ID, item.Task)
		}
	}

	uncompleted := tm.GetUncompletedCount()
	if uncompleted > 0 {
		fmt.Fprintf(&builder, "\n%d uncompleted item(s)", uncompleted)
	}

	return builder.String()
}
