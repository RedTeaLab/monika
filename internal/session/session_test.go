package session

import (
	"path/filepath"
	"testing"

	"monika/pkg/engine"
)

func TestProjectSlug(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{`D:\git\monika`, "d-git-monika"},
		{"/home/user/projects/myapp", "home-user-projects-myapp"},
		{"/tmp", "tmp"},
	}
	for _, tt := range tests {
		got := projectSlug(tt.path)
		if got != tt.want {
			t.Errorf("projectSlug(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestDirPath(t *testing.T) {
	got := Dir("/home/user", `D:\git\monika`)
	want := filepath.FromSlash("/home/user/.monika/projects/d-git-monika/sessions")
	if got != want {
		t.Errorf("Dir() = %q, want %q", got, want)
	}
}

func TestNewAndSave(t *testing.T) {
	tmp := t.TempDir()
	s := New("/tmp/project", "gpt-4o", "openai")
	if s.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if err := s.Save(tmp); err != nil {
		t.Fatal(err)
	}
	p := sessionPath(tmp, "/tmp/project", s.ID)
	got, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != s.ID {
		t.Errorf("Load ID = %q, want %q", got.ID, s.ID)
	}
	if got.Model != "gpt-4o" {
		t.Errorf("Load Model = %q, want %q", got.Model, "gpt-4o")
	}
}

func TestListEmpty(t *testing.T) {
	tmp := t.TempDir()
	metas, err := List(tmp, "/no/project")
	if err != nil {
		t.Fatal(err)
	}
	if len(metas) != 0 {
		t.Fatalf("expected empty list, got %d", len(metas))
	}
}

func TestLatest(t *testing.T) {
	tmp := t.TempDir()
	s1 := New("/tmp/project", "gpt-4o", "openai")
	s1.Save(tmp)
	s2 := New("/tmp/project", "deepseek-chat", "deepseek")
	s2.Save(tmp)
	got, err := Latest(tmp, "/tmp/project")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != s2.ID {
		t.Errorf("Latest ID = %q, want %q", got.ID, s2.ID)
	}
}

func TestLatestEmpty(t *testing.T) {
	tmp := t.TempDir()
	got, err := Latest(tmp, "/no/project")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("expected nil, got %+v", got)
	}
}

func TestTitleFromFirstMessage(t *testing.T) {
	s := New("/tmp/project", "gpt-4o", "openai")
	s.Messages = []engine.ChatMessage{{Role: "user", Content: "This is a very long first message that should be truncated to forty characters for the title"}}
	s.SetTitle()
	if len(s.Title) > 40 {
		t.Errorf("Title too long: %q (%d chars)", s.Title, len(s.Title))
	}
}
