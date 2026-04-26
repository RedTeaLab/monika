package session

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"monika/pkg/engine"
)

type Session struct {
	ID         string               `json:"id"`
	Title      string               `json:"title"`
	ProjectDir string               `json:"project_dir"`
	Messages   []engine.ChatMessage `json:"messages"`
	Model      string               `json:"model"`
	Provider   string               `json:"provider"`
	CreatedAt  time.Time            `json:"created_at"`
	UpdatedAt  time.Time            `json:"updated_at"`
}

type SessionMeta struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
}

func projectSlug(projectDir string) string {
	s := strings.ToLower(projectDir)
	s = strings.ReplaceAll(s, `\`, "-")
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, ":", "")
	s = strings.Trim(s, "-")
	return s
}

func Dir(home, projectDir string) string {
	return filepath.Join(home, ".monika", "projects", projectSlug(projectDir), "sessions")
}

func sessionPath(home, projectDir, id string) string {
	return filepath.Join(Dir(home, projectDir), id+".json")
}

func FilePath(home, projectDir, id string) string {
	return sessionPath(home, projectDir, id)
}

func generateID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d-%d", time.Now().UnixNano(), os.Getpid())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func New(projectDir, model, provider string) *Session {
	now := time.Now()
	return &Session{
		ID:         generateID(),
		ProjectDir: projectDir,
		Model:      model,
		Provider:   provider,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

func Load(path string) (*Session, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (s *Session) Save(home string) error {
	s.UpdatedAt = time.Now()
	p := sessionPath(home, s.ProjectDir, s.ID)
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

func (s *Session) SetTitle() {
	for _, m := range s.Messages {
		if m.Role == "user" && m.Content != "" {
			s.Title = m.Content
			if len(s.Title) > 40 {
				s.Title = s.Title[:40]
			}
			return
		}
	}
}

func List(home, projectDir string) ([]SessionMeta, error) {
	d := Dir(home, projectDir)
	entries, err := os.ReadDir(d)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var metas []SessionMeta
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		s, err := Load(filepath.Join(d, e.Name()))
		if err != nil {
			continue
		}
		metas = append(metas, SessionMeta{
			ID:        s.ID,
			Title:     s.Title,
			UpdatedAt: s.UpdatedAt,
		})
	}
	return metas, nil
}

func Latest(home, projectDir string) (*Session, error) {
	metas, err := List(home, projectDir)
	if err != nil {
		return nil, err
	}
	if len(metas) == 0 {
		return nil, nil
	}
	latest := metas[0]
	for _, m := range metas[1:] {
		if m.UpdatedAt.After(latest.UpdatedAt) {
			latest = m
		}
	}
	return Load(sessionPath(home, projectDir, latest.ID))
}
