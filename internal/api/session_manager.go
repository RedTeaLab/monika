package api

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
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

type SessionManager struct {
	mu          sync.Mutex
	home        string
	projectDir  string
	sessionsDir string
}

func projectSlug(projectDir string) string {
	s := strings.ToLower(projectDir)
	s = strings.ReplaceAll(s, `\`, "-")
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, ":", "")
	s = strings.Trim(s, "-")
	return s
}

func NewSessionManager(home, projectDir string) *SessionManager {
	sessionsDir := filepath.Join(home, ".monika", "projects", projectSlug(projectDir), "sessions")
	return &SessionManager{
		home:        home,
		projectDir:  projectDir,
		sessionsDir: sessionsDir,
	}
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

func (sm *SessionManager) New(model, provider string) (*Session, error) {
	now := time.Now()
	return &Session{
		ID:         generateID(),
		ProjectDir: sm.projectDir,
		Model:      model,
		Provider:   provider,
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

func (sm *SessionManager) Load(id string) (*Session, error) {
	p := filepath.Join(sm.sessionsDir, id+".json")
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func (sm *SessionManager) Save(s *Session) error {
	s.UpdatedAt = time.Now()
	p := filepath.Join(sm.sessionsDir, s.ID+".json")
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

func (sm *SessionManager) Delete(id string) error {
	p := filepath.Join(sm.sessionsDir, id+".json")
	return os.Remove(p)
}

func (sm *SessionManager) List() ([]SessionInfo, error) {
	entries, err := os.ReadDir(sm.sessionsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var infos []SessionInfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		s, err := sm.Load(strings.TrimSuffix(e.Name(), ".json"))
		if err != nil {
			continue
		}
		infos = append(infos, SessionInfo{
			ID:        s.ID,
			Title:     s.Title,
			UpdatedAt: s.UpdatedAt.Format(time.RFC3339),
		})
	}
	return infos, nil
}

func (sm *SessionManager) SetTitle(s *Session) {
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

func (sm *SessionManager) Lock() {
	sm.mu.Lock()
}

func (sm *SessionManager) Unlock() {
	sm.mu.Unlock()
}
