package api

import (
	"sync"
	"testing"
)

// TestTrayManager_NotificationStorage verifies that AddNotification,
// GetTrayNotifications, and ClearNotifications work correctly.
func TestTrayManager_NotificationStorage(t *testing.T) {
	tm := &TrayManager{
		notifications: nil,
		notifMu:       sync.Mutex{},
	}

	// Initially empty
	got := tm.GetTrayNotifications()
	if len(got) != 0 {
		t.Fatalf("expected 0 notifications, got %d", len(got))
	}

	// Add one
	tm.AddNotification("sess-1", "feat: login", "reply-complete", "回复完成")
	got = tm.GetTrayNotifications()
	if len(got) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(got))
	}
	if got[0].SessionID != "sess-1" {
		t.Fatalf("expected SessionID sess-1, got %s", got[0].SessionID)
	}
	if got[0].SessionTitle != "feat: login" {
		t.Fatalf("expected SessionTitle 'feat: login', got %s", got[0].SessionTitle)
	}
	if got[0].Type != "reply-complete" {
		t.Fatalf("expected Type reply-complete, got %s", got[0].Type)
	}
	if got[0].Message != "回复完成" {
		t.Fatalf("expected Message '回复完成', got %s", got[0].Message)
	}
	if got[0].ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if got[0].Timestamp == 0 {
		t.Fatal("expected non-zero Timestamp")
	}

	// Add second
	tm.AddNotification("sess-2", "feat: db", "permission-request", "请求: readFile")
	got = tm.GetTrayNotifications()
	if len(got) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(got))
	}
	if got[1].SessionID != "sess-2" {
		t.Fatalf("expected second SessionID sess-2, got %s", got[1].SessionID)
	}

	// Clear
	tm.ClearNotifications()
	got = tm.GetTrayNotifications()
	if len(got) != 0 {
		t.Fatalf("expected 0 after clear, got %d", len(got))
	}
}

// TestTrayManager_NotificationStorage_ConcurrentSafe verifies that
// notifications can be safely added and read concurrently.
func TestTrayManager_NotificationStorage_ConcurrentSafe(t *testing.T) {
	tm := &TrayManager{
		notifications: nil,
		notifMu:       sync.Mutex{},
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			tm.AddNotification(
				"sess-"+string(rune('0'+n)),
				"title-"+string(rune('0'+n)),
				"reply-complete",
				"msg",
			)
		}(i)
	}
	wg.Wait()

	got := tm.GetTrayNotifications()
	if len(got) != 10 {
		t.Fatalf("expected 10 notifications after concurrent adds, got %d", len(got))
	}
}

// TestTrayManager_GetTrayNotifications_IsCopy verifies that
// GetTrayNotifications returns a copy, not the internal slice.
func TestTrayManager_GetTrayNotifications_IsCopy(t *testing.T) {
	tm := &TrayManager{
		notifications: nil,
		notifMu:       sync.Mutex{},
	}

	tm.AddNotification("sess-1", "title", "reply-complete", "msg")
	got := tm.GetTrayNotifications()

	// Modify the returned slice
	got[0].SessionTitle = "hacked"

	// Original should be unchanged
	tm.notifMu.Lock()
	original := tm.notifications[0].SessionTitle
	tm.notifMu.Unlock()
	if original == "hacked" {
		t.Fatal("modifying returned slice should not affect internal storage")
	}
}

// TestTrayManager_RemoveNotification verifies single notification removal.
func TestTrayManager_RemoveNotification(t *testing.T) {
	tm := &TrayManager{
		notifications: nil,
		notifMu:       sync.Mutex{},
	}

	tm.AddNotification("sess-1", "title-a", "reply-complete", "msg a")
	tm.AddNotification("sess-2", "title-b", "permission-request", "msg b")
	tm.AddNotification("sess-3", "title-c", "reply-complete", "msg c")

	notifs := tm.GetTrayNotifications()
	tm.RemoveNotification(notifs[1].ID) // remove middle one

	got := tm.GetTrayNotifications()
	if len(got) != 2 {
		t.Fatalf("expected 2 after removing one, got %d", len(got))
	}
	if got[0].SessionTitle != "title-a" {
		t.Fatalf("expected first remaining to be title-a, got %s", got[0].SessionTitle)
	}
	if got[1].SessionTitle != "title-c" {
		t.Fatalf("expected second remaining to be title-c, got %s", got[1].SessionTitle)
	}
}
