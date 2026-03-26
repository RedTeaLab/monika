package tools

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// TodoStatus represents the status of a todo item
type TodoStatus string

const (
	StatusPending    TodoStatus = "pending"
	StatusInProgress TodoStatus = "in_progress"
	StatusCompleted  TodoStatus = "completed"
)

// TodoItem represents a single todo item
type TodoItem struct {
	ID     int         `json:"id"`
	Task   string      `json:"task"`
	Status TodoStatus  `json:"status"`
	mu     sync.RWMutex `json:"-"`
}

// TodoManager manages todo items with state constraints
type TodoManager struct {
	items    []*TodoItem
	nextID   int
	filePath string
	mu       sync.RWMutex
}

var instance *TodoManager
var once sync.Once

// GetTodoManager returns the singleton instance of TodoManager
func GetTodoManager() *TodoManager {
	once.Do(func() {
		homeDir, _ := os.UserHomeDir()
		monikaDir := filepath.Join(homeDir, ".monika")
		instance = &TodoManager{
			items:    []*TodoItem{},
			nextID:   1,
			filePath: filepath.Join(monikaDir, "todos.json"),
		}
		// Ensure directory exists
		os.MkdirAll(monikaDir, 0755)
		// Load existing todos if file exists
		instance.loadFromFile()
	})
	return instance
}

// loadFromFile loads todos from the JSON file
func (tm *TodoManager) loadFromFile() {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	data, err := os.ReadFile(tm.filePath)
	if err != nil {
		return // File doesn't exist yet, that's fine
	}

	var items []*TodoItem
	if err := json.Unmarshal(data, &items); err == nil {
		tm.items = items
		// Find the next ID
		for _, item := range items {
			if item.ID >= tm.nextID {
				tm.nextID = item.ID + 1
			}
		}
	}
}

// saveToFile saves todos to the JSON file
func (tm *TodoManager) saveToFile() {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	data, err := json.MarshalIndent(tm.items, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(tm.filePath, data, 0644)
}

// AddTodo adds a new todo item with pending status
func (tm *TodoManager) AddTodo(task string) *TodoItem {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	item := &TodoItem{
		ID:     tm.nextID,
		Task:   task,
		Status: StatusPending,
	}
	tm.nextID++
	tm.items = append(tm.items, item)
	tm.saveToFile()
	return item
}

// UpdateStatus updates the status of a todo item by ID
// Ensures only one item can be in_progress at a time
func (tm *TodoManager) UpdateStatus(id int, status TodoStatus) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// Find the item
	var targetItem *TodoItem
	var targetIndex int = -1
	for i, item := range tm.items {
		if item.ID == id {
			targetItem = item
			targetIndex = i
			break
		}
	}

	if targetItem == nil {
		return fmt.Errorf("todo item with ID %d not found", id)
	}

	// If setting to in_progress, ensure no other item is in_progress
	if status == StatusInProgress {
		for i, item := range tm.items {
			if i != targetIndex && item.Status == StatusInProgress {
				// Change the currently in_progress item to pending
				item.Status = StatusPending
			}
		}
	}

	targetItem.Status = status
	tm.saveToFile()
	return nil
}

// GetItems returns all todo items
func (tm *TodoManager) GetItems() []*TodoItem {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	// Return a copy to prevent external modification
	result := make([]*TodoItem, len(tm.items))
	copy(result, tm.items)
	return result
}

// GetInProgressItem returns the item currently in_progress, if any
func (tm *TodoManager) GetInProgressItem() *TodoItem {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	for _, item := range tm.items {
		if item.Status == StatusInProgress {
			return item
		}
	}
	return nil
}

// HasPendingItems returns true if there are pending items
func (tm *TodoManager) HasPendingItems() bool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	for _, item := range tm.items {
		if item.Status == StatusPending {
			return true
		}
	}
	return false
}

// GetPendingItems returns all pending items
func (tm *TodoManager) GetPendingItems() []*TodoItem {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	var result []*TodoItem
	for _, item := range tm.items {
		if item.Status == StatusPending {
			result = append(result, item)
		}
	}
	return result
}

// GetUncompletedCount returns the count of uncompleted items (pending + in_progress)
func (tm *TodoManager) GetUncompletedCount() int {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	count := 0
	for _, item := range tm.items {
		if item.Status != StatusCompleted {
			count++
		}
	}
	return count
}

// DeleteTodo deletes a todo item by ID
func (tm *TodoManager) DeleteTodo(id int) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	// Find the item index
	index := -1
	for i, item := range tm.items {
		if item.ID == id {
			index = i
			break
		}
	}

	if index == -1 {
		return fmt.Errorf("todo item with ID %d not found", id)
	}

	// Remove the item from the slice
	tm.items = append(tm.items[:index], tm.items[index+1:]...)
	tm.saveToFile()
	return nil
}

// FormatStatus formats the status for display
func FormatStatus(status TodoStatus) string {
	switch status {
	case StatusPending:
		return "pending"
	case StatusInProgress:
		return "in_progress"
	case StatusCompleted:
		return "completed"
	default:
		return string(status)
	}
}
