package api

import (
	"strings"
	"testing"

	"monika/pkg/engine"
)

func TestSessionManagerNewAndLoad(t *testing.T) {
	dir := t.TempDir()
	sm := NewSessionManager(dir)

	s, err := sm.New("gpt-4", "openai")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if s.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if s.Model != "gpt-4" {
		t.Errorf("expected gpt-4, got %s", s.Model)
	}
	if s.Provider != "openai" {
		t.Errorf("expected openai, got %s", s.Provider)
	}

	s.Messages = []engine.ChatMessage{
		{Role: "user", Content: "hello"},
	}
	s.ProjectDir = dir

	if err := sm.Save(s); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := sm.Load(s.ID)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.ID != s.ID {
		t.Errorf("ID mismatch: got %s, want %s", loaded.ID, s.ID)
	}
	if loaded.Model != "gpt-4" {
		t.Errorf("model mismatch: got %s, want gpt-4", loaded.Model)
	}
	if len(loaded.Messages) != 1 {
		t.Errorf("expected 1 message, got %d", len(loaded.Messages))
	}

	_, err = sm.Load("nonexistent")
	if err == nil {
		t.Fatal("expected error loading nonexistent session")
	}
}

func TestSessionManagerList(t *testing.T) {
	dir := t.TempDir()
	sm := NewSessionManager(dir)

	s1, _ := sm.New("gpt-4", "openai")
	s1.ProjectDir = dir
	s1.Title = "session one"
	sm.Save(s1)

	s2, _ := sm.New("claude-3", "anthropic")
	s2.ProjectDir = dir
	s2.Title = "session two"
	sm.Save(s2)

	list, err := sm.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(list))
	}
}

func TestSessionManagerDelete(t *testing.T) {
	dir := t.TempDir()
	sm := NewSessionManager(dir)

	s, _ := sm.New("gpt-4", "openai")
	s.ProjectDir = dir
	sm.Save(s)

	if err := sm.Delete(s.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err := sm.Load(s.ID)
	if err == nil {
		t.Fatal("expected error loading deleted session")
	}
}

func TestSessionManagerSetTitle(t *testing.T) {
	sm := NewSessionManager("/tmp")

	s := &Session{
		ID:    "test-id",
		Model: "gpt-4",
		Messages: []engine.ChatMessage{
			{Role: "system", Content: "You are helpful"},
			{Role: "assistant", Content: "How can I help?"},
			{Role: "user", Content: "This message is definitely longer than forty characters"},
		},
	}
	sm.SetTitle(s)
	if s.Title == "" {
		t.Fatal("expected non-empty title")
	}
	if len(s.Title) != 40 {
		t.Errorf("expected title truncated to 40 chars, got len %d: %q", len(s.Title), s.Title)
	}
	if !strings.HasPrefix("This message is definitely longer than forty characters", s.Title) {
		t.Errorf("title %q does not match start of first user message", s.Title)
	}

	s2 := &Session{
		Messages: []engine.ChatMessage{
			{Role: "system", Content: "system"},
			{Role: "user", Content: "short"},
		},
	}
	sm.SetTitle(s2)
	if s2.Title != "short" {
		t.Errorf("expected 'short', got %q", s2.Title)
	}

	s3 := &Session{
		Messages: []engine.ChatMessage{
			{Role: "system", Content: "system"},
			{Role: "assistant", Content: "reply"},
		},
	}
	sm.SetTitle(s3)
	if s3.Title != "" {
		t.Errorf("expected empty title when no user messages, got %q", s3.Title)
	}
}
