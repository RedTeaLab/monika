package api

import (
	"os"
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

// TestBrightenPNG verifies brightenPNG produces valid output from
// the actual winres/icon.png file.
func TestBrightenPNG(t *testing.T) {
	data, err := os.ReadFile("../../winres/icon.png")
	if err != nil {
		t.Skip("winres/icon.png not found, skipping:", err)
	}

	result := brightenPNG(data, 1.2)

	if len(result) == 0 {
		t.Fatal("brightenPNG returned empty result")
	}

	// Should be different from the input
	if len(result) == len(data) {
		same := true
		for i := range data {
			if result[i] != data[i] {
				same = false
				break
			}
		}
		if same {
			t.Fatal("brightenPNG returned identical data (factor 1.2 should change brightness)")
		}
	}
}

// TestBrightenPNGFallback verifies that brightenPNG gracefully handles
// invalid input by returning a copy of the original bytes.
func TestBrightenPNGFallback(t *testing.T) {
	invalidData := []byte{0, 1, 2, 3, 4, 5} // Not a valid image
	result := brightenPNG(invalidData, 1.2)

	if len(result) != len(invalidData) {
		t.Fatalf("expected fallback to same length, got %d != %d", len(result), len(invalidData))
	}
	for i := range invalidData {
		if result[i] != invalidData[i] {
			t.Fatalf("fallback data differs at index %d", i)
		}
	}
}

// TestClamp verifies the clamp function.
func TestClamp(t *testing.T) {
	tests := []struct {
		input float64
		want  uint8
	}{
		{0, 0},
		{100, 100},
		{255, 255},
		{256, 255},
		{300, 255},
		{-1, 0},
	}
	for _, tt := range tests {
		got := clamp(tt.input)
		if got != tt.want {
			t.Errorf("clamp(%f) = %d, want %d", tt.input, got, tt.want)
		}
	}
}
